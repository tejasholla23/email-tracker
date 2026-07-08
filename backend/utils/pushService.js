const webpush = require("web-push");
const Account = require("../models/Account");

// Initialize VAPID details
if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log("[PUSH_SERVICE] VAPID details set successfully.");
} else {
  console.warn("[PUSH_SERVICE] Warning: VAPID keys are missing from environment variables.");
}

// Map of classifications to Web Push urgency values (high, normal, low, very-low)
const URGENCY_MAP = {
  "New Hiring Opportunity": "high",
  "Internship Opportunity": "high",
  "Assessment Announcement": "high",
  "Interview Schedule": "high",
  "Interview Result": "high",
  "Registration Link": "high",
  "Deadline Reminder": "high",
  "Hackathon / Event Invitation": "normal",
  "PPT Announcement": "normal",
  "Application Reminder": "normal",
  "Venue Update": "normal",
  "Workshop / Webinar": "low",
  "Expert Talk Series": "low",
  "Scholarship": "normal",
  "Generic Placement Notice": "low",
};

/**
 * Sends a push notification to all subscribed devices of the given user account.
 * Handles stale/expired subscriptions by removing them.
 * 
 * @param {object} account - The Account document
 * @param {object} app - The newly saved Application document
 */
async function sendNewEmailNotification(account, app) {
  if (!account.pushEnabled) {
    console.log(`[PUSH_SERVICE] Notifications disabled for account ${account.email}`);
    return;
  }

  const subscriptions = account.pushSubscriptions || [];
  if (subscriptions.length === 0) {
    console.log(`[PUSH_SERVICE] No registered subscriptions for account ${account.email}`);
    return;
  }

  // 1. Determine priority/urgency based on classification
  const urgency = URGENCY_MAP[app.classification] || "normal";

  // 2. Build the notification payload
  const role = app.role && app.role !== "Unknown Role" ? app.role : "";
  const subtitlePart = app.subtitle || role || "New Placement Update";
  const deadlineText = app.deadlineText || app.deadline;
  
  const body = deadlineText 
    ? `${app.company}\n\n${subtitlePart}\n\nDeadline: ${deadlineText}`
    : `${app.company}\n\n${subtitlePart}`;

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const deepLink = `${frontendUrl}/?id=${app._id}`;

  const payload = JSON.stringify({
    title: "Email Tracker",
    body: body,
    tag: `email-tracker-${app._id}`,
    url: deepLink,
    appId: app._id.toString()
  });

  const pushOptions = {
    TTL: 86400, // 24 hours
    urgency: urgency
  };

  console.log(`[PUSH_SERVICE] Sending notification for ${app.company} (urgency: ${urgency}) to ${subscriptions.length} devices...`);

  const expiredEndpoints = [];

  const promises = subscriptions.map(async (sub) => {
    try {
      const subscriptionObj = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth
        }
      };
      await webpush.sendNotification(subscriptionObj, payload, pushOptions);
    } catch (err) {
      console.error(`[PUSH_SERVICE] Failed to send to endpoint ${sub.endpoint.substring(0, 40)}...`, err.message);
      // Clean up subscription if expired/gone (410) or not found (404)
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredEndpoints.push(sub.endpoint);
      }
    }
  });

  // Wait for all push sends to complete
  await Promise.all(promises);

  // Clean up any stale subscriptions
  if (expiredEndpoints.length > 0) {
    console.log(`[PUSH_SERVICE] Cleaning up ${expiredEndpoints.length} expired subscriptions for ${account.email}`);
    account.pushSubscriptions = account.pushSubscriptions.filter(
      (sub) => !expiredEndpoints.includes(sub.endpoint)
    );
    await account.save().catch(saveErr => 
      console.error("[PUSH_SERVICE] Error saving account subscription cleanup:", saveErr.message)
    );
  }
}

module.exports = {
  sendNewEmailNotification,
  URGENCY_MAP
};
