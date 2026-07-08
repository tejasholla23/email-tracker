// frontend/app/utils/pushManager.js
// Utility functions to manage service worker registration and push subscriptions.

/**
 * Converts a Base64 VAPID public key string into a Uint8Array required by PushManager.subscribe.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks if the browser supports Service Workers and Push Manager.
 */
export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Returns the current notification permission state: "granted", "denied", or "default".
 */
export function getPushPermissionState() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

/**
 * Registers the Service Worker (/sw.js) and returns the registration object.
 */
export async function registerServiceWorker() {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser.");
  }
  
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/"
  });
  return registration;
}

/**
 * Checks for notification permission, registers SW, fetches VAPID key from backend,
 * creates/updates browser subscription, and posts it to the backend.
 * 
 * @param {function} apiFetch - The authenticated fetch helper from the frontend
 */
export async function registerAndSubscribe(apiFetch) {
  if (!isPushSupported()) return null;

  try {
    // 1. Ensure permission is granted
    if (Notification.permission !== "granted") {
      throw new Error("Notification permission not granted.");
    }

    // 2. Register Service Worker
    const registration = await registerServiceWorker();
    
    // Wait until Service Worker is active
    await navigator.serviceWorker.ready;

    // 3. Get existing subscription
    let subscription = await registration.pushManager.getSubscription();

    // 4. If no active subscription exists, fetch VAPID key and subscribe
    if (!subscription) {
      // Fetch public VAPID key from backend
      const vapidRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/push/vapid-key`);
      if (!vapidRes.ok) {
        throw new Error("Failed to fetch VAPID public key from backend.");
      }
      const { publicKey } = await vapidRes.json();
      
      // Subscribe browser
      const convertedKey = urlBase64ToUint8Array(publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
      console.log("[PushManager] Created new browser push subscription.");
    } else {
      console.log("[PushManager] Found existing active browser push subscription.");
    }

    // 5. Send subscription info to backend to register/re-associate it
    const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });

    if (!res.success && res.message) {
      console.error("[PushManager] Failed to save subscription to database:", res.message);
    } else {
      console.log("[PushManager] Successfully updated subscription on backend.");
    }

    return subscription;
  } catch (err) {
    console.error("[PushManager] Error during service worker registration / push subscription:", err.message);
    throw err;
  }
}

/**
 * Manually unsubscribes this browser/device from notifications.
 * Removes from browser's PushManager and deletes it on the backend database.
 */
export async function unsubscribePush(apiFetch) {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      
      // 1. Remove from database
      await apiFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint })
      });

      // 2. Unsubscribe browser
      await subscription.unsubscribe();
      console.log("[PushManager] Successfully unsubscribed from push notifications.");
    }
  } catch (err) {
    console.error("[PushManager] Error during push unsubscription:", err.message);
  }
}

/**
 * Helper to fetch the current active endpoint URL without unsubscribing.
 * Used to safely clear associations on user logout.
 */
export async function getCurrentPushEndpoint() {
  if (!isPushSupported()) return "";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.endpoint : "";
  } catch (err) {
    console.warn("[PushManager] Error getting active push endpoint:", err.message);
    return "";
  }
}
