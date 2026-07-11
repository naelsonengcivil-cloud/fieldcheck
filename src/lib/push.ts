import { Capacitor } from "@capacitor/core";
import { ehNativo } from "./plataforma";
import { supabase } from "./supabase";

// ============================================================
// Push nativo (FCM via Capacitor) + web push (Firebase Messaging) — RF12.
// O token do dispositivo é salvo via RPC registrar_push_token. O opt-out
// por usuário é aplicado no SERVIDOR (Edge Function enviar-push filtra por
// usuarios.notif_push), então o cliente sempre registra o token quando há
// permissão. Imports dinâmicos: o SDK do Firebase não entra no bundle nativo.
// ============================================================

export type PlataformaPush = "android" | "ios" | "web";
export type ResultadoPush =
  | { ok: true; plataforma: PlataformaPush }
  | { ok: false; motivo: "permissao" | "sem_suporte" | "sem_config" | "erro" };

type AoAbrirNc = (eventoId: string) => void;
let handlerAbrir: AoAbrirNc | null = null;
let tokenAtual: string | null = null;
let iniciadoNativo = false;

/** Define quem trata o toque numa notificação de NC (navegação no app). */
export function aoAbrirNc(cb: AoAbrirNc): void {
  handlerAbrir = cb;
}

/** Config web do Firebase (pública) via env. null se incompleta. */
function configWeb(): { cfg: Record<string, string>; vapidKey: string } | null {
  const e = import.meta.env as Record<string, string | undefined>;
  const cfg = {
    apiKey: e.VITE_FIREBASE_API_KEY ?? "",
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: e.VITE_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: e.VITE_FIREBASE_APP_ID ?? "",
  };
  const vapidKey = e.VITE_FIREBASE_VAPID_KEY ?? "";
  const completo = Object.values(cfg).every(Boolean) && !!vapidKey;
  return completo ? { cfg, vapidKey } : null;
}

async function salvarToken(token: string, plataforma: PlataformaPush): Promise<void> {
  tokenAtual = token;
  await supabase.rpc("registrar_push_token", { p_token: token, p_plataforma: plataforma });
}

/**
 * Ativa o push na plataforma atual. Idempotente.
 * @param interativo true quando disparado por um gesto do usuário (botão) —
 *   só então pedimos permissão no WEB (browsers bloqueiam prompt sem gesto).
 *   No login (interativo=false) apenas renovamos o token se já houver permissão.
 */
export async function ativarPush(interativo = false): Promise<ResultadoPush> {
  try {
    return ehNativo() ? await ativarNativo() : await ativarWeb(interativo);
  } catch {
    return { ok: false, motivo: "erro" };
  }
}

async function ativarNativo(): Promise<ResultadoPush> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const plataforma: PlataformaPush = Capacitor.getPlatform() === "ios" ? "ios" : "android";
  if (!iniciadoNativo) {
    iniciadoNativo = true;
    await PushNotifications.addListener("registration", (t) => {
      void salvarToken(t.value, plataforma);
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
      const ev = a.notification.data?.evento_id as string | undefined;
      if (ev && handlerAbrir) handlerAbrir(ev);
    });
  }
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, motivo: "permissao" };
  await PushNotifications.register();
  return { ok: true, plataforma };
}

async function ativarWeb(interativo: boolean): Promise<ResultadoPush> {
  const conf = configWeb();
  if (!conf) return { ok: false, motivo: "sem_config" };
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, motivo: "sem_suporte" };
  }
  // Sem gesto do usuário só prossegue se a permissão já foi concedida antes
  // (renovação silenciosa do token no login). Caso contrário, aguarda o botão.
  if (!interativo && Notification.permission !== "granted") {
    return { ok: false, motivo: "permissao" };
  }

  const [{ initializeApp, getApps }, messagingMod] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  const { getMessaging, getToken, onMessage, isSupported } = messagingMod;
  if (!(await isSupported())) return { ok: false, motivo: "sem_suporte" };

  const perm =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, motivo: "permissao" };

  const app = getApps()[0] ?? initializeApp(conf.cfg);
  const messaging = getMessaging(app);

  // SW dedicado, escopo próprio para não colidir com o SW do PWA (workbox em '/').
  // A config (pública) segue na query string para manter o arquivo genérico.
  const swUrl = `/firebase-messaging-sw.js?cfg=${encodeURIComponent(JSON.stringify(conf.cfg))}`;
  const reg = await navigator.serviceWorker.register(swUrl, {
    scope: "/firebase-cloud-messaging-push-scope",
  });
  const token = await getToken(messaging, {
    vapidKey: conf.vapidKey,
    serviceWorkerRegistration: reg,
  });
  if (!token) return { ok: false, motivo: "erro" };
  await salvarToken(token, "web");

  // Em primeiro plano o SO não exibe banner; o toque numa NC vem pelo SW
  // (notificationclick → /?nc=). Aqui só mantemos a conexão viva.
  onMessage(messaging, () => {});
  return { ok: true, plataforma: "web" };
}

/** Remove o token deste dispositivo (logout). Best-effort. */
export async function desativarPush(): Promise<void> {
  try {
    if (!tokenAtual) return;
    await supabase.rpc("remover_push_token", { p_token: tokenAtual });
    tokenAtual = null;
  } catch {
    /* offline/erro: o token será podado no servidor quando ficar inválido */
  }
}
