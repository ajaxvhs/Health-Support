self.addEventListener("push", (event) => {
  // No ticket text or personal information is exposed on the lock screen.
  event.waitUntil(
    self.registration.showNotification("Suporte Saúde", {
      body: "Há uma nova atualização nos seus chamados. Abra o portal para consultar.",
      icon: "/pwa-192.svg",
      badge: "/pwa-192.svg",
      tag: "support-updates",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL("/chamados", self.location.origin).href));
});
