// ============================================================
// FieldCheck · Edge Function `enviar-push` (RF12, M3)
// Envia notificações push via FCM HTTP v1 (Android/iOS/Web) para os
// dispositivos dos destinatários, respeitando o opt-out (usuarios.notif_push).
// Tokens inválidos (UNREGISTERED / não encontrados) são podados da tabela.
//
// Deploy:  supabase functions deploy enviar-push --no-verify-jwt
// Secrets: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (do service
//          account JSON do Firebase), CRON_SECRET (header x-cron-secret).
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injetados no runtime.
//
// Chamada (trigger 0027 ou manual):
//   POST  header x-cron-secret: <CRON_SECRET>
//   body  { "mensagens": [{ usuario_id, titulo, corpo, evento_id?, tipo? }] }
//   ou    { "usuario_ids": [...], "titulo": "...", "corpo": "...", "evento_id"? }
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@^2";

interface Mensagem {
  usuario_id: string;
  titulo: string;
  corpo: string;
  evento_id?: string | null;
  tipo?: string | null;
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const OAUTH_URL = "https://oauth2.googleapis.com/token";

// Cache do access token entre chamadas enquanto a função está "quente".
let tokenCache: { valor: string; expira: number } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const segredo = Deno.env.get("CRON_SECRET");
  if (segredo && req.headers.get("x-cron-secret") !== segredo) {
    return json({ error: "Não autorizado." }, 401);
  }

  try {
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
  const privateKey = Deno.env.get("FCM_PRIVATE_KEY");
  if (!projectId || !clientEmail || !privateKey) {
    return json({ error: "Credenciais FCM ausentes." }, 500);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Normaliza a entrada nos dois formatos aceitos.
  const body = await req.json().catch(() => ({}));
  const mensagens: Mensagem[] = Array.isArray(body?.mensagens)
    ? body.mensagens
    : Array.isArray(body?.usuario_ids)
      ? body.usuario_ids.map((uid: string) => ({
          usuario_id: uid,
          titulo: body.titulo,
          corpo: body.corpo,
          evento_id: body.evento_id ?? null,
          tipo: body.tipo ?? null,
        }))
      : [];
  if (mensagens.length === 0) return json({ ok: true, enviados: 0, podados: 0 });

  // Só destinatários que não desativaram push (M6).
  const idsUnicos = [...new Set(mensagens.map((m) => m.usuario_id))];
  const { data: optIn } = await admin
    .from("usuarios")
    .select("id")
    .in("id", idsUnicos)
    .eq("notif_push", true);
  const permitidos = new Set((optIn ?? []).map((u: { id: string }) => u.id));

  // Tokens dos destinatários permitidos.
  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token, plataforma, usuario_id")
    .in("usuario_id", [...permitidos]);
  const porUsuario = new Map<string, { token: string; plataforma: string }[]>();
  for (const t of tokens ?? []) {
    const arr = porUsuario.get(t.usuario_id) ?? [];
    arr.push({ token: t.token, plataforma: t.plataforma });
    porUsuario.set(t.usuario_id, arr);
  }

  const accessToken = await obterAccessToken(clientEmail, privateKey);
  const invalidos: string[] = [];
  const diag: string[] = []; // motivos de falha do FCM (diagnóstico do teste)
  let enviados = 0;

  for (const m of mensagens) {
    if (!permitidos.has(m.usuario_id)) continue;
    for (const { token, plataforma } of porUsuario.get(m.usuario_id) ?? []) {
      const ok = await enviarFcm(projectId, accessToken, token, plataforma, m, invalidos, diag);
      if (ok) enviados++;
    }
  }

  // Poda tokens mortos (UNREGISTERED / inválidos) — servidor é a verdade.
  if (invalidos.length) {
    await admin.from("push_tokens").delete().in("token", invalidos);
  }

  return json({ ok: true, enviados, podados: invalidos.length, diag });
  } catch (e) {
    // 500 opaco vira erro legível (pg_net ignora a resposta, mas ajuda no teste).
    return json({ error: "Falha no envio: " + String((e as Error)?.message ?? e) }, 500);
  }
});

/** Envia uma mensagem a um token. Retorna true se aceito; coleta inválidos. */
async function enviarFcm(
  projectId: string,
  accessToken: string,
  token: string,
  plataforma: string,
  m: Mensagem,
  invalidos: string[],
  diag: string[],
): Promise<boolean> {
  const dados: Record<string, string> = {
    titulo: m.titulo ?? "",
    corpo: m.corpo ?? "",
  };
  if (m.evento_id) dados.evento_id = m.evento_id;
  if (m.tipo) dados.tipo = m.tipo;

  // Web: data-only (o SW exibe a notificação). Nativo: notification + data.
  const message: Record<string, unknown> =
    plataforma === "web"
      ? { token, data: dados, webpush: { headers: { Urgency: "high" } } }
      : { token, notification: { title: m.titulo, body: m.corpo }, data: dados };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );
  if (res.ok) return true;

  const erro = await res.json().catch(() => ({}));
  const status = erro?.error?.details?.[0]?.errorCode ?? erro?.error?.status;
  diag.push(
    `${plataforma} http=${res.status} status=${status ?? "?"} msg=${String(erro?.error?.message ?? "").slice(0, 120)}`,
  );
  if (res.status === 404 || status === "UNREGISTERED" || status === "INVALID_ARGUMENT") {
    invalidos.push(token);
  }
  return false;
}

/** Obtém (e cacheia) um access token OAuth2 do service account (JWT RS256). */
async function obterAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expira - 60 > agora) return tokenCache.valor;

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: OAUTH_URL,
    iat: agora,
    exp: agora + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const chave = await importarChave(privateKeyPem);
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chave,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64urlBytes(new Uint8Array(assinatura))}`;

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("Falha ao obter access token FCM.");
  tokenCache = { valor: j.access_token, expira: agora + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** Importa a chave privada PEM (PKCS#8) do service account para assinar. */
async function importarChave(pem: string): Promise<CryptoKey> {
  const corpo = pem
    .replace(/\\+n/g, "\n") // \n ou \\n (escapado no secret) → quebra real
    .replace(/-{2,}[^-]*-{2,}/g, "") // remove marcadores PEM (BEGIN/END, dashes variáveis)
    .replace(/[^A-Za-z0-9+/=]/g, ""); // mantém só o alfabeto base64 (tira dashes/espaços residuais)
  let der: Uint8Array;
  try {
    der = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0));
  } catch {
    // Diagnóstico NÃO-sensível: tamanho, se veio o cabeçalho PEM e quais chars
    // fora do alfabeto base64 sobraram (o "lixo", nunca o conteúdo da chave).
    const lixo = [...new Set(corpo.replace(/[A-Za-z0-9+/=]/g, "").split(""))];
    throw new Error(
      `chave base64 inválida — len=${corpo.length} temBEGIN=${pem.includes("BEGIN PRIVATE KEY")} ` +
        `pemLen=${pem.length} lixo=${JSON.stringify(lixo).slice(0, 80)}`,
    );
  }
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function b64url(s: string): string {
  return b64urlBytes(new TextEncoder().encode(s));
}
function b64urlBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
