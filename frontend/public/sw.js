// frontend/public/sw.js
// Service worker for handling push notifications and deep linking clicks

self.addEventListener("push", (event) => {
  if (!event.data) {
    console.log("[SW] Push event received with no data payload.");
    return;
  }

  try {
    const data = event.data.json();
    console.log("[SW] Push event received data:", data);

    const title = data.title || "Email Tracker";
    const options = {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/apple-icon.png", // smaller overlay badge
      tag: data.tag || "email-tracker-notification",
      renotify: true,
      vibrate: [100, 50, 100],
      data: {
        url: data.url || "/"
      },
      actions: [
        { action: "open", title: "View" },
        { action: "dismiss", title: "Dismiss" }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error("[SW] Error parsing push event data:", err.message);
  }
});

self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked. Action:", event.action);
  event.notification.close();

  if (event.action === "dismiss") {
    return;
  }

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Look for an existing open window/tab from our app origin and focus it
      const targetOrigin = new URL(targetUrl, self.location.origin).origin;
      
      for (const client of windowClients) {
        const clientUrl = new URL(client.url, self.location.origin);
        if (clientUrl.origin === targetOrigin && "focus" in client) {
          // If we found a matching tab, navigate it to the deep-link URL and focus it
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      // If no open tab was found, open a brand new tab/window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Handles subscription expirations automatically and communicates with backend to swap them
self.addEventListener("pushsubscriptionchange", (event) => {
  console.log("[SW] Push subscription expired/changed. Re-subscribing...");
  
  const applicationServerKey = event.oldSubscription ? event.oldSubscription.options.applicationServerKey : null;
  if (!applicationServerKey) {
    console.error("[SW] Cannot re-subscribe: missing old application server key.");
    return;
  }

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    }).then((newSubscription) => {
      // Send the refreshed subscription details to the backend.
      // Note: Because we cannot guarantee valid local credentials in SW context without Cookies/localStorage,
      // the endpoint /push/subscribe should accept valid requests, or the page will naturally refresh
      // subscription metadata on next manual dashboard load.
      return fetch("/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: newSubscription.toJSON() })
      });
    }).catch(err => {
      console.error("[SW] Failed to auto-renew push subscription:", err.message);
    })
  );
});
