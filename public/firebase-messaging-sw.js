/* FieldCheck — Service Worker do Firebase Cloud Messaging (web push · RF12).
 * Genérico e commitável: a config do projeto (pública, não é segredo) chega
 * pela query string do register() em src/lib/push.ts. Roda em escopo próprio
 * (/firebase-cloud-messaging-push-scope) para não colidir com o SW do PWA.
 * As mensagens web são enviadas como DATA-only (titulo/corpo/evento_id em
 * data) — este SW é quem exibe a notificação. */
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

const cfg = JSON.parse(new URL(self.location).searchParams.get("cfg") || "{}");
if (cfg && cfg.apiKey) {
  firebase.initializeApp(cfg);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const d = (payload && payload.data) || {};
    self.registration.showNotification(d.titulo || "FieldCheck", {
      body: d.corpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: d.evento_id || undefined, // colapsa repetidas da mesma NC
      data: d,
    });
  });
}

// Toque na notificação: foca uma janela existente (navegando p/ a NC) ou abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const evento = event.notification.data && event.notification.data.evento_id;
  const url = evento ? `/?nc=${evento}` : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
