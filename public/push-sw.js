self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Suporte Saúde", {
      body: payload.body ?? "Há uma nova atualização nos seus chamados.",
      icon: "/pwa-192.svg",
      badge: "/pwa-192.svg",
      tag: payload.ticketId ? `support-ticket-${payload.ticketId}` : "support-updates",
      data: { url: payload.ticketId ? `/chamados/${payload.ticketId}` : "/chamados" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/chamados";
  event.waitUntil(self.clients.openWindow(new URL(target, self.location.origin).href));
});
