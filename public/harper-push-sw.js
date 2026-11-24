// Harper Web Push service worker.
// Payload: { title: string, options?: NotificationOptions }.
// options.data.url opens on click; options.data.actionUrls[action] opens on an action button.

const notifyClients = async (message) => {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ source: "harper-push", ...message });
};

const openUrl = async (url) => {
  const target = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((client) => client.url === target);
  if (existing) return existing.focus();
  return self.clients.openWindow(target);
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Harper", options: { body: event.data ? event.data.text() : "" } };
  }
  const title = payload.title || "Harper";
  const options = payload.options || {};
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => notifyClients({ type: "shown", title, tag: options.tag || null }))
      .catch((error) => notifyClients({ type: "error", title, error: String(error) }))
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action || "";
  notification.close();
  const url = (action && data.actionUrls && data.actionUrls[action]) || (!action && data.url) || null;
  event.waitUntil(
    Promise.all([
      notifyClients({ type: "click", title: notification.title, action, reply: event.reply ?? null, url }),
      url ? openUrl(url) : Promise.resolve(),
    ])
  );
});

self.addEventListener("notificationclose", (event) => {
  event.waitUntil(notifyClients({ type: "close", title: event.notification.title }));
});
