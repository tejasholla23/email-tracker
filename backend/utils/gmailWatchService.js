"use strict";

const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");
const config = require("../config/appConfig");
const Account = require("../models/Account");
const LinkedGmailAccount = require("../models/LinkedGmailAccount");

// Cached OAuth2 client instance for OIDC token verification
let oidcVerifierClient = null;

function getOidcVerifierClient() {
  if (!oidcVerifierClient) {
    oidcVerifierClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return oidcVerifierClient;
}

/**
 * Returns the fully qualified Google Cloud Pub/Sub topic name for Gmail Watch.
 * e.g., "projects/my-gcp-project/topics/gmail-push-notifications"
 */
function getFullTopicName() {
  if (!config.GCP_PROJECT_ID) return null;
  const topic = config.GMAIL_PUBSUB_TOPIC || "gmail-push-notifications";
  return `projects/${config.GCP_PROJECT_ID}/topics/${topic}`;
}

/**
 * Resolves an email address received in a Pub/Sub notification to a parent user ID.
 * Checks primary Accounts first, then LinkedGmailAccounts.
 *
 * @param {string} emailAddress
 * @returns {Promise<{ userId: Object, email: string, accountType: 'primary'|'linked', accountDoc: Object } | null>}
 */
async function resolveEmailToAccount(emailAddress) {
  if (!emailAddress || typeof emailAddress !== "string") return null;
  const cleanEmail = emailAddress.trim().toLowerCase();

  // 1. Check Primary Accounts
  const primaryAccount = await Account.findOne({ email: cleanEmail });
  if (primaryAccount) {
    return {
      userId: primaryAccount._id,
      email: primaryAccount.email,
      accountType: "primary",
      accountDoc: primaryAccount,
    };
  }

  // 2. Check Linked Accounts
  const linkedAccount = await LinkedGmailAccount.findOne({ email: cleanEmail });
  if (linkedAccount) {
    return {
      userId: linkedAccount.parentAccountId,
      email: linkedAccount.email,
      accountType: "linked",
      accountDoc: linkedAccount,
    };
  }

  return null;
}

/**
 * Sets up or refreshes a Gmail push notification watch for an account.
 *
 * @param {Object|OAuth2Client} tokensOrClient - OAuth2 tokens or an OAuth2Client instance
 * @param {string} email - Mailbox email address
 * @param {'primary'|'linked'} [accountType='primary']
 * @param {string|Object} [accountId=null]
 * @returns {Promise<{ success: boolean, expiration?: Date, historyId?: string, error?: string, reason?: string }>}
 */
async function setupGmailWatch(tokensOrClient, email, accountType = "primary", accountId = null) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const topicName = getFullTopicName();

  if (!topicName) {
    console.log(`[GMAIL_WATCH_SKIP] GCP_PROJECT_ID not configured. Skipping watch setup for ${cleanEmail}.`);
    return { success: false, reason: "PUBSUB_DISABLED" };
  }

  try {
    let authClient = tokensOrClient;
    if (!authClient || typeof authClient.getAccessToken !== "function") {
      // Create local OAuth2 client from tokens
      authClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      authClient.setCredentials(tokensOrClient);
    }

    const gmail = google.gmail({ version: "v1", auth: authClient });

    console.log(`[GMAIL_WATCH_INIT] Registering watch for ${cleanEmail} on topic ${topicName}...`);
    const watchRes = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: topicName,
        labelIds: ["INBOX"],
      },
    });

    const { expiration, historyId } = watchRes.data || {};
    const expirationDate = expiration ? new Date(parseInt(expiration)) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Persist watch expiration to DB
    if (accountType === "linked") {
      const query = accountId ? { _id: accountId } : { email: cleanEmail };
      await LinkedGmailAccount.findOneAndUpdate(query, { gmailWatchExpiration: expirationDate });
    } else {
      const query = accountId ? { _id: accountId } : { email: cleanEmail };
      await Account.findOneAndUpdate(query, { gmailWatchExpiration: expirationDate });
    }

    console.log(`[GMAIL_WATCH_SUCCESS] Watch active for ${cleanEmail}. Expires: ${expirationDate.toISOString()} | historyId: ${historyId || "N/A"}`);
    return { success: true, expiration: expirationDate, historyId };
  } catch (err) {
    console.error(`[GMAIL_WATCH_ERROR] Failed to set up watch for ${cleanEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Stops an active Gmail push notification watch for a mailbox.
 * Uses userId: "me" without needing resourceId.
 *
 * @param {Object|OAuth2Client} tokensOrClient
 * @param {string} [email="unknown"]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function stopGmailWatch(tokensOrClient, email = "unknown") {
  try {
    let authClient = tokensOrClient;
    if (!authClient || typeof authClient.getAccessToken !== "function") {
      authClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      authClient.setCredentials(tokensOrClient);
    }

    const gmail = google.gmail({ version: "v1", auth: authClient });
    await gmail.users.stop({ userId: "me" });
    console.log(`[GMAIL_WATCH_STOPPED] Stopped Gmail watch for ${email}`);
    return { success: true };
  } catch (err) {
    console.warn(`[GMAIL_WATCH_STOP_WARN] Failed to stop watch for ${email}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Verifies an incoming Pub/Sub push webhook request.
 * Checks OIDC JWT Bearer token (Primary) + Optional query-string secret (Defense-in-depth).
 *
 * @param {Object} req - Express Request object
 * @returns {Promise<{ valid: boolean, reason?: string, payload?: Object }>}
 */
async function verifyPubSubRequest(req) {
  // Layer 1: Query-string secret check (Defense-in-depth, if configured)
  if (config.GMAIL_WEBHOOK_SECRET) {
    const providedSecret = req.query?.token || req.headers["x-webhook-secret"];
    if (!providedSecret || providedSecret !== config.GMAIL_WEBHOOK_SECRET) {
      console.warn("[GMAIL_WEBHOOK_DENIED] Missing or invalid webhook secret token");
      return { valid: false, reason: "INVALID_SECRET" };
    }
  }

  // Layer 2: OIDC JWT verification (Primary gate)
  // If audience is configured, OIDC verification is strictly required
  if (config.GMAIL_WEBHOOK_AUDIENCE) {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      console.warn("[GMAIL_WEBHOOK_DENIED] Missing Authorization header for OIDC verification");
      return { valid: false, reason: "MISSING_AUTH_HEADER" };
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      console.warn("[GMAIL_WEBHOOK_DENIED] Malformed Authorization header. Expected Bearer <JWT>");
      return { valid: false, reason: "MALFORMED_AUTH_HEADER" };
    }

    const idToken = parts[1];
    try {
      const verifier = getOidcVerifierClient();
      const ticket = await verifier.verifyIdToken({
        idToken: idToken,
        audience: config.GMAIL_WEBHOOK_AUDIENCE,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return { valid: false, reason: "EMPTY_JWT_PAYLOAD" };
      }

      // Verify Google issuer
      const validIssuers = ["https://accounts.google.com", "accounts.google.com"];
      if (!validIssuers.includes(payload.iss)) {
        console.warn(`[GMAIL_WEBHOOK_DENIED] Invalid JWT issuer: ${payload.iss}`);
        return { valid: false, reason: "INVALID_ISSUER" };
      }

      // Optional: Verify expected GCP service account email
      if (config.GMAIL_PUBSUB_SERVICE_ACCOUNT) {
        if (payload.email !== config.GMAIL_PUBSUB_SERVICE_ACCOUNT) {
          console.warn(`[GMAIL_WEBHOOK_DENIED] Unexpected service account email: ${payload.email}`);
          return { valid: false, reason: "UNEXPECTED_SERVICE_ACCOUNT" };
        }
      }

      return { valid: true, payload };
    } catch (oidcErr) {
      console.warn(`[GMAIL_WEBHOOK_DENIED] OIDC verification failed: ${oidcErr.message}`);
      return { valid: false, reason: `OIDC_VERIFICATION_FAILED: ${oidcErr.message}` };
    }
  }

  // If neither OIDC audience nor secret is configured (e.g. testing with Pub/Sub disabled)
  // we require at least GMAIL_PUBSUB_ENABLED to be true or a secret
  if (!config.GMAIL_PUBSUB_ENABLED && !config.GMAIL_WEBHOOK_SECRET) {
    return { valid: false, reason: "PUBSUB_NOT_CONFIGURED" };
  }

  return { valid: true };
}

/**
 * Scans all primary and linked accounts and renews watches expiring within 24 hours.
 * Called on schedule via cron (every 6 hours) and during startup.
 *
 * @returns {Promise<{ renewed: number, skipped: number, failed: number }>}
 */
async function renewExpiringWatches() {
  if (!config.GCP_PROJECT_ID) {
    return { renewed: 0, skipped: 0, failed: 0 };
  }

  console.log("[WATCH_RENEWAL_START] Checking for expiring Gmail watches...");
  const renewThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
  let renewed = 0;
  let skipped = 0;
  let failed = 0;

  // 1. Scan Primary Accounts
  try {
    const primaryAccounts = await Account.find({ "tokens.refresh_token": { $exists: true } });
    for (const acc of primaryAccounts) {
      if (!acc.email || !config.isAllowedEmail(acc.email)) continue;
      if (config.ALLOWED_SENDERS.includes(acc.email.toLowerCase())) continue;

      const needsRenewal = !acc.gmailWatchExpiration || acc.gmailWatchExpiration < renewThreshold;
      if (needsRenewal) {
        console.log(`[WATCH_RENEWAL] Renewing primary account watch for ${acc.email}...`);
        const result = await setupGmailWatch(acc.tokens, acc.email, "primary", acc._id);
        if (result.success) {
          renewed++;
        } else {
          failed++;
          if (result.error?.includes("invalid_grant") || result.error?.includes("401") || result.error?.includes("403")) {
            await Account.findByIdAndUpdate(acc._id, { gmailWatchExpiration: null });
          }
        }
      } else {
        skipped++;
      }
    }
  } catch (err) {
    console.error("[WATCH_RENEWAL_ERR] Error scanning primary accounts:", err.message);
  }

  // 2. Scan Linked Accounts
  try {
    const linkedAccounts = await LinkedGmailAccount.find({ "tokens.refresh_token": { $exists: true } });
    for (const linked of linkedAccounts) {
      if (!linked.email) continue;

      const needsRenewal = !linked.gmailWatchExpiration || linked.gmailWatchExpiration < renewThreshold;
      if (needsRenewal) {
        console.log(`[WATCH_RENEWAL] Renewing linked account watch for ${linked.email}...`);
        const result = await setupGmailWatch(linked.tokens, linked.email, "linked", linked._id);
        if (result.success) {
          renewed++;
        } else {
          failed++;
          if (result.error?.includes("invalid_grant") || result.error?.includes("401") || result.error?.includes("403")) {
            await LinkedGmailAccount.findByIdAndUpdate(linked._id, { gmailWatchExpiration: null });
          }
        }
      } else {
        skipped++;
      }
    }
  } catch (err) {
    console.error("[WATCH_RENEWAL_ERR] Error scanning linked accounts:", err.message);
  }

  console.log(`[WATCH_RENEWAL_COMPLETE] Renewed: ${renewed} | Skipped: ${skipped} | Failed: ${failed}`);
  return { renewed, skipped, failed };
}

module.exports = {
  getFullTopicName,
  resolveEmailToAccount,
  setupGmailWatch,
  stopGmailWatch,
  verifyPubSubRequest,
  renewExpiringWatches,
  getOidcVerifierClient,
};
