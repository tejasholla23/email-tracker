require("dotenv").config();
const config = require("./config/appConfig");
const cron = require("node-cron");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const he = require("he");
const { google } = require("googleapis");

const Application = require("./models/Application");
const Account = require("./models/Account");
const applicationRoutes = require("./routes/applicationRoutes");
const { parseEmailWithLLM, mergeAlternativeTexts } = require("./utils/parseEmailWithLLM");
const { getCompanyInfo } = require("./utils/companyInfoService");
const { normalizeCompany, isValidCompany } = require("./utils/normalizeCompany");
const { advanceStatus, classificationToStatus } = require("./utils/statusMachine");
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require("./utils/jwt");
const authenticate = require("./middleware/authenticate");
const { generateAuthCode, consumeAuthCode } = require("./utils/authCodeStore");
const { processCalendarSyncQueue } = require("./utils/calendarService");
const {
  authLimiter,
  syncLimiter,
  calendarSyncLimiter,
  writeLimiter,
  readLimiter
} = require("./middleware/rateLimiters");

const ALLOWED_SENDERS = config.ALLOWED_SENDERS;
const CURRENT_PARSER_VERSION = "v4";

function getNextRetryDate(retryCount) {
  const now = new Date();
  let delayMs = 0;
  if (retryCount === 1) delayMs = 15 * 60 * 1000; // 15 mins
  else if (retryCount === 2) delayMs = 60 * 60 * 1000; // 1 hour
  else if (retryCount === 3) delayMs = 4 * 60 * 60 * 1000; // 4 hours
  else if (retryCount === 4) delayMs = 12 * 60 * 60 * 1000; // 12 hours
  else delayMs = 24 * 60 * 60 * 1000; // 24 hours (once per day forever)
  
  return new Date(now.getTime() + delayMs);
}

// Helper to extract full body text from Gmail payload
function extractText(payload) {
  if (payload.mimeType === "text/plain" && payload.body.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractText(part);
      if (text) return text;
    }
  }
  return null;
}

function extractHtml(payload) {
  if (payload.mimeType === "text/html" && payload.body.data) {
    let html = Buffer.from(payload.body.data, "base64").toString("utf-8");
    
    // 1. Remove style and script tags and their contents
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    
    // 2. Remove HTML comments
    html = html.replace(/<!--[\s\S]*?-->/g, "");
    
    // 3. Map block-level tags to newlines
    html = html.replace(/<br\s*\/?>/gi, "\n");
    html = html.replace(/<\/(p|div|tr|li|h[1-6]|thead|tbody|tfoot)>/gi, "\n");
    html = html.replace(/<(p|div|tr|li|h[1-6]|thead|tbody|tfoot)[^>]*>/gi, "\n");
    
    // 4. Strip remaining HTML tags
    html = html.replace(/<[^>]*>/g, " ");
    
    return html;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const html = extractHtml(part);
      if (html) return html;
    }
  }
  return null;
}



function getFullBodyText(payload) {
  const htmlRaw = extractHtml(payload);
  const textRaw = extractText(payload);
  
  let text = "";
  if (htmlRaw && textRaw) {
    text = mergeAlternativeTexts(htmlRaw, textRaw);
  } else {
    text = htmlRaw || textRaw || "";
  }
  
  // Decode HTML entities (e.g., &nbsp; -> " ")
  text = he.decode(text);
  
  // Safety: Truncate extremely long bodies (keep newest content at the end)
  if (text.length > 20000) {
    text = text.slice(-20000);
  }
  
  return text;
}

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

// OAuth Validation
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
  console.error("CRITICAL ERROR: Google OAuth environment variables are missing!");
  console.error("Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI");
  process.exit(1);
}

// JWT and Cron Key Validation
if (!process.env.JWT_SECRET) {
  console.error("CRITICAL ERROR: JWT_SECRET environment variable is missing!");
  console.error("The application cannot start without a valid JWT_SECRET.");
  process.exit(1);
}

if (!process.env.CRON_API_KEY) {
  console.warn("WARNING: CRON_API_KEY environment variable is missing!");
  console.warn("Requests to /run-cron will be rejected.");
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:3001",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin) and known origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' not allowed`));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use("/applications", applicationRoutes);

// ==========================
// 🟢 DB CONNECT
// ==========================
mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");
    try {
      const result = await Account.updateMany(
        { syncStatus: "pending" },
        { 
          syncStatus: "failed", 
          syncError: "Previous sync was interrupted due to server restart or unexpected shutdown." 
        }
      );
      if (result.modifiedCount > 0) {
        console.log(`[STARTUP_RECOVERY] Restored ${result.modifiedCount} stale pending sync account(s) to failed state.`);
      }
    } catch (err) {
      console.error("[STARTUP_RECOVERY_FAILED] Failed to clean up stale sync states:", err.message);
    }
  })
  .catch((err) => console.error("Mongo error:", err.message));

// ==========================
// 🟢 HEALTH
// ==========================
app.get("/", (req, res) => {
  res.send("API running");
});

// ==========================
// 🧹 CLEAR DATABASE
// ==========================

// GET /clear-applications — legacy convenience endpoint (browser-accessible)
app.get("/clear-applications", writeLimiter, authenticate, async (req, res) => {
  try {
    await Application.deleteMany({ userId: req.userId });
    res.send("All applications deleted");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// DELETE /clear-all-applications — used by the frontend "Clear All" button.
// Sets a flag that aborts any in-progress sync, waits briefly, then wipes the DB.
app.delete("/clear-all-applications", writeLimiter, authenticate, async (req, res) => {
  if (!config.isAllowedEmail(req.userEmail)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userIdStr = req.userId.toString();
  console.log(`[CLEAR_ALL] Requested for user ${userIdStr} — setting activeClearRequests`);
  activeClearRequests.add(userIdStr);

  // Give the sync loop up to 3 s to notice the flag and break out of the current email
  if (activeSyncs.has(userIdStr)) {
    console.log("[CLEAR_ALL] Sync in progress for this user — waiting up to 3 s for it to abort...");
    await new Promise((resolve) => {
      const deadline = Date.now() + 3000;
      const poll = setInterval(() => {
        if (!activeSyncs.has(userIdStr) || Date.now() >= deadline) {
          clearInterval(poll);
          resolve();
        }
      }, 200);
    });
  }

  try {
    const result = await Application.deleteMany({ userId: req.userId });
    console.log(`[CLEAR_ALL] Deleted ${result.deletedCount} application(s)`);
    activeClearRequests.delete(userIdStr);
    activeSyncs.delete(userIdStr); // Reset lock in case sync was stuck
    res.json({ message: "All applications permanently cleared", deletedCount: result.deletedCount });
  } catch (err) {
    activeClearRequests.delete(userIdStr);
    res.status(500).json({ message: "Failed to clear applications: " + err.message });
  }
});

// ==========================
// 🔐 GOOGLE AUTH
// ==========================
app.get("/auth/google", authLimiter, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    include_granted_scopes: true,
    prompt: "consent",
  });

  res.redirect(url);
});

// Incremental OAuth flow for calendar scopes specifically
app.get("/auth/google/calendar", authLimiter, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events"
    ],
    include_granted_scopes: true,
    prompt: "consent",
  });

  res.redirect(url);
});

app.get("/auth/google/callback", authLimiter, async (req, res) => {
  const { code } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  try {
    // Fix 6: Use per-request OAuth client to prevent race conditions on shared global instance
    const localCallbackClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await localCallbackClient.getToken(code);
    localCallbackClient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: localCallbackClient,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();
    const email = userInfo?.data?.email;

    // Fix 2: Log the user scopes returned from Google
    console.log(`[AUTH_CALLBACK] User ${email || "unknown"} completed OAuth. Scopes granted: ${tokens.scope || "NONE"}`);

    // Fix 4: Check allowlist BEFORE upserting the account in MongoDB
    if (!email || !config.isAllowedEmail(email)) {
      console.warn(`[AUTH] Denied login attempt from unauthorized email: ${email}`);
      return res.redirect(`${frontendUrl}?error=unauthorized`);
    }

    // Fix 1: Validate required scopes are granted (specifically gmail.readonly)
    if (!tokens.scope || !tokens.scope.includes("https://www.googleapis.com/auth/gmail.readonly")) {
      console.warn(`[AUTH] Denied login for ${email} due to missing gmail.readonly scope. Scopes returned: ${tokens.scope}`);
      return res.redirect(`${frontendUrl}?error=insufficient_scopes`);
    }

    // Find existing account first to preserve long-lived credentials/scopes
    const existingAccount = await Account.findOne({ email });
    let mergedTokens = { ...tokens };
    let wasCalendarEnabled = false;

    if (existingAccount && existingAccount.tokens) {
      // 1. Preserve the refresh_token if the new callback didn't return one
      if (!mergedTokens.refresh_token && existingAccount.tokens.refresh_token) {
        mergedTokens.refresh_token = existingAccount.tokens.refresh_token;
      }

      // 2. Preserve calendar scope if the user previously had it authorized
      const hadCalendarScope = existingAccount.tokens.scope && existingAccount.tokens.scope.includes("auth/calendar.events");
      const hasCalendarScopeNow = mergedTokens.scope && mergedTokens.scope.includes("auth/calendar.events");

      if (hadCalendarScope && !hasCalendarScopeNow) {
        const oldScopes = existingAccount.tokens.scope.split(" ");
        const newScopes = (mergedTokens.scope || "").split(" ");
        const mergedScopes = Array.from(new Set([...oldScopes, ...newScopes])).join(" ");
        mergedTokens.scope = mergedScopes;
        console.log(`[AUTH_CALLBACK] Merged existing calendar scope for ${email}. Combined scope: ${mergedTokens.scope}`);
      }

      if (existingAccount.calendarSyncEnabled) {
        wasCalendarEnabled = true;
      }
    }

    const updatePayload = {
      tokens: mergedTokens,
      syncStatus: "idle",
      syncError: ""
    };

    // Auto-detect calendar permission consent in scope string
    if (mergedTokens.scope && mergedTokens.scope.includes("auth/calendar.events")) {
      updatePayload.calendarSyncEnabled = existingAccount ? wasCalendarEnabled : true;
    }

    await Account.findOneAndUpdate(
      { email },
      { $set: updatePayload },
      { upsert: true }
    );

    // Generate short-lived auth code and redirect frontend
    const authCode = generateAuthCode(email);
    res.redirect(`${frontendUrl}?auth_code=${authCode}`);
  } catch (err) {
    console.error("Google Auth Callback Error:", err.message);
    res.status(500).send(`Auth failed: ${err.message}`);
  }
});

// POST /auth/token - exchange temporary auth code for access and refresh tokens
app.post("/auth/token", authLimiter, async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: "Authorization code is required" });
  }

  const email = consumeAuthCode(code);
  if (!email) {
    return res.status(400).json({ message: "Invalid or expired authorization code" });
  }

  try {
    const account = await Account.findOne({ email });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const accessToken = generateAccessToken(account);
    const rawRefreshToken = generateRefreshToken();
    const hashedToken = hashRefreshToken(rawRefreshToken);

    // Save hashed refresh token and expiry (90 days)
    account.refreshTokenHash = hashedToken;
    account.refreshTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await account.save();

    res.json({
      accessToken,
      refreshToken: rawRefreshToken,
      email: account.email
    });
  } catch (error) {
    console.error("Token Exchange Error:", error.message);
    res.status(500).json({ message: "Failed to exchange authorization code" });
  }
});

// POST /auth/refresh - rotate refresh token and issue new access token
app.post("/auth/refresh", authLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token is required" });
  }

  const hashedToken = hashRefreshToken(refreshToken);

  try {
    const account = await Account.findOne({
      refreshTokenHash: hashedToken,
      refreshTokenExpiresAt: { $gt: new Date() }
    });

    if (!account) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const newAccessToken = generateAccessToken(account);
    const newRawRefreshToken = generateRefreshToken();
    const newHashedToken = hashRefreshToken(newRawRefreshToken);

    // Rotate refresh token
    account.refreshTokenHash = newHashedToken;
    account.refreshTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await account.save();

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken
    });
  } catch (error) {
    console.error("Token Refresh Error:", error.message);
    res.status(500).json({ message: "Failed to refresh token" });
  }
});

// GET /auth/me - get current user context from JWT
app.get("/auth/me", readLimiter, authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.userId);
    res.json({
      _id: req.userId,
      email: req.userEmail,
      pushSubscriptionsCount: account ? (account.pushSubscriptions?.length || 0) : 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /auth/calendar/status - check calendar integration status
app.get("/auth/calendar/status", readLimiter, authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    // Check if the OAuth token has the required calendar scope
    const hasCalendarScope = account.tokens && account.tokens.scope && account.tokens.scope.includes("auth/calendar.events");

    res.json({
      calendarSyncEnabled: account.calendarSyncEnabled || false,
      hasCalendarScope: !!hasCalendarScope
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /auth/calendar/toggle - toggle calendar integration enabled state
app.post("/auth/calendar/toggle", writeLimiter, authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    const hasCalendarScope = account.tokens && account.tokens.scope && account.tokens.scope.includes("auth/calendar.events");
    if (!account.calendarSyncEnabled && !hasCalendarScope) {
      return res.status(400).json({ message: "Insufficient permissions. Please connect Google Calendar first to grant access." });
    }

    account.calendarSyncEnabled = !account.calendarSyncEnabled;
    
    // If enabling, queue all existing non-deleted applications for sync sweep
    if (account.calendarSyncEnabled) {
      await Application.updateMany(
        { userId: req.userId, isDeleted: { $ne: true } },
        { $set: { needsCalendarSync: true } }
      );
    }

    await account.save();
    res.json({ calendarSyncEnabled: account.calendarSyncEnabled });

    // Trigger sync in background
    if (account.calendarSyncEnabled) {
      processCalendarSyncQueue(account).catch(err => console.error("Async calendar sync error:", err.message));
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /auth/calendar/sync - manually trigger calendar re-sync
app.post("/auth/calendar/sync", calendarSyncLimiter, authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    if (!account.calendarSyncEnabled) {
      return res.status(400).json({ message: "Calendar integration is disabled" });
    }

    // Flag all active applications for sync
    await Application.updateMany(
      { userId: req.userId, isDeleted: { $ne: true } },
      { $set: { needsCalendarSync: true } }
    );

    res.json({ success: true, message: "Sync queued in background" });

    processCalendarSyncQueue(account).catch(err => console.error("Async calendar sync error:", err.message));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ==========================
// 🔔 PUSH NOTIFICATIONS
// ==========================

// GET /push/vapid-key - Get the VAPID public key
app.get("/push/vapid-key", readLimiter, (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /push/subscribe - Subscribe a device to push notifications
app.post("/push/subscribe", writeLimiter, authenticate, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ message: "Invalid subscription format." });
    }

    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found." });

    if (!account.pushSubscriptions) {
      account.pushSubscriptions = [];
    }

    // Check if subscription endpoint is already registered
    const existingIndex = account.pushSubscriptions.findIndex(
      (sub) => sub.endpoint === subscription.endpoint
    );

    const userAgent = req.headers["user-agent"] || "";

    if (existingIndex !== -1) {
      // Update existing subscription metadata
      account.pushSubscriptions[existingIndex].createdAt = new Date();
      account.pushSubscriptions[existingIndex].userAgent = userAgent;
    } else {
      // Add new device subscription
      account.pushSubscriptions.push({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        userAgent,
        createdAt: new Date(),
      });
    }

    // Enforce cap of 10 subscriptions per account (remove oldest)
    if (account.pushSubscriptions.length > 10) {
      account.pushSubscriptions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      account.pushSubscriptions.shift();
    }

    await account.save();
    res.json({ success: true, message: "Subscribed successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /push/unsubscribe - Unsubscribe a device from push notifications
app.post("/push/unsubscribe", writeLimiter, authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ message: "Endpoint is required." });
    }

    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found." });

    if (account.pushSubscriptions && account.pushSubscriptions.length > 0) {
      account.pushSubscriptions = account.pushSubscriptions.filter(
        (sub) => sub.endpoint !== endpoint
      );
      await account.save();
    }

    res.json({ success: true, message: "Unsubscribed successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ==========================
// 🚪 LOGOUT
// ==========================
app.post("/logout", writeLimiter, authenticate, async (req, res) => {
  try {
    const { pushEndpoint } = req.body || {};
    const account = await Account.findById(req.userId);
    
    if (account) {
      // Remove only this device's push subscription from the DB
      if (pushEndpoint && account.pushSubscriptions?.length > 0) {
        account.pushSubscriptions = account.pushSubscriptions.filter(
          (sub) => sub.endpoint !== pushEndpoint
        );
      }
      
      account.refreshTokenHash = null;
      account.refreshTokenExpiresAt = null;
      await account.save();
    }

    res.send("Logged out successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Logout failed");
  }
});

// ==========================
// ❌ DELETE ACCOUNT
// ==========================
app.delete("/auth/account", writeLimiter, authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`[ACCOUNT_DELETION] Initiating deletion for userId: ${userId}`);

    // 1. Delete all applications belonging to this user
    const appsDeleteResult = await Application.deleteMany({ userId });
    console.log(`[ACCOUNT_DELETION] Deleted ${appsDeleteResult.deletedCount} applications for userId: ${userId}`);

    // 2. Delete the account document
    const accountDeleteResult = await Account.findByIdAndDelete(userId);
    if (!accountDeleteResult) {
      console.warn(`[ACCOUNT_DELETION] Account not found for userId: ${userId}`);
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    console.log(`[ACCOUNT_DELETION] Successfully deleted account for userId: ${userId}`);

    res.json({
      success: true,
      message: "Account deleted successfully."
    });
  } catch (error) {
    console.error(`[ACCOUNT_DELETION] Failed to delete account for userId: ${req.userId}:`, error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete account. Please try again."
    });
  }
});

const activeSyncs = new Set();
const activeClearRequests = new Set();
let isCronProcessing = false;

// Per-user manual sync cooldown (45 seconds).
// Complements the activeSyncs concurrency guard as a second layer.
const manualSyncCooldowns = new Map();
const MANUAL_SYNC_COOLDOWN_MS = 45 * 1000;
let isMigrationV4Processing = false;

function appendApplicationEvent(application, parsed, emailMetadata) {
  const { messageId, date, subject } = emailMetadata;
  if (!application.events) application.events = [];
  
  const eventExists = application.events.some(e => e.messageId === messageId);
  if (eventExists) {
    console.log(`[EVENT_SKIPPED_DUPLICATE] ${messageId}`);
    return false;
  }
  
  application.events.push({
    messageId,
    date,
    classification: parsed.classification || "",
    title: parsed.title || "",
    subject: subject || "",
    status: parsed.status || "new",
    link: parsed.link || "",
    summary: parsed.summary || ""
  });
  
  application.events.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`[EVENT_ADDED] ${messageId}`);
  return true;
}

// ==========================
// 📥 FETCH + SAVE EMAILS
// ==========================

// --- Extracted per-message processing logic ---
// Returns: { action: 'inserted' | 'skipped' | 'error', usedGemini: boolean }
async function processMessage(gmail, acc, messageId, subject_unused, existingFast, geminiParsedCount) {
  const id = messageId;
  let usedGemini = false;

  try {
    // ── FAST PATH: already fully parsed ──
    if (existingFast) {
      if (existingFast.parserVersion === CURRENT_PARSER_VERSION) {
        if (existingFast.isDeleted) {
          console.log(`[SKIP_FAST] ${id} | Reason: Message already deleted by user`);
        } else {
          console.log(`[SKIP_FAST] ${id} | Reason: Already exists and fully parsed (${CURRENT_PARSER_VERSION})`);
        }
        return { action: 'skipped', usedGemini: false };
      } else {
        // Check if backoff retry window has elapsed
        const nextRetry = existingFast.parseMeta?.nextRetryAt ? new Date(existingFast.parseMeta.nextRetryAt) : null;
        if (nextRetry && new Date() < nextRetry) {
          console.log(`[SKIP_FAST] ${id} | Reason: Backoff active (retry deferred until ${nextRetry.toISOString()})`);
          return { action: 'skipped', usedGemini: false };
        }
      }
    }

    // ── FETCH FULL EMAIL BODY FROM GMAIL ──
    const getController = new AbortController();
    const getTimeoutId = setTimeout(() => getController.abort(), 15000);
    let email;
    try {
      email = await gmail.users.messages.get({
        userId: "me",
        id: id,
        format: "full",
      }, {
        signal: getController.signal
      });
      clearTimeout(getTimeoutId);
    } catch (error) {
      clearTimeout(getTimeoutId);
      if (error.name === "AbortError" || getController.signal.aborted) {
        const timeoutError = new Error(`Gmail get message ${id} request timed out`);
        timeoutError.code = "ETIMEOUT";
        throw timeoutError;
      }
      throw error;
    }

    const headers = email.data.payload.headers;
    const fromHeader = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const internetMessageId = headers.find((h) => h.name.toLowerCase() === "message-id")?.value || "";

    const isAllowedSender = ALLOWED_SENDERS.some(sender => 
      fromHeader.toLowerCase().includes(sender.toLowerCase())
    );
    if (!isAllowedSender) {
      console.log(`[SKIP] ${id} | Reason: Sender not in allowed list (${fromHeader})`);
      return { action: 'skipped', usedGemini: false };
    }

    const snippet = email.data.snippet || "";
    const rawText = `${subject} ${snippet}`.trim();
    
    const fullBodyText = getFullBodyText(email.data.payload);
    console.log(`[BODY_FETCHED] ${id} length: ${fullBodyText.length}`);
    
    console.log(`[FETCH] ${id} | Subject: ${subject} | From: ${fromHeader}`);

    // ── EXISTING RECORD: enrich or skip ──
    const exists = existingFast ? await Application.findOne({ userId: acc._id, messageId: id }) : null;
    if (exists) {
      // Skip if this messageId was already marked as deleted (and is a normal application)
      if (exists.isDeleted) {
        console.log(`[SKIP] ${id} | Reason: Message already deleted by user`);
        return { action: 'skipped', usedGemini: false };
      }
      
      let eventAdded = false;
      if (!exists.events || !exists.events.some(e => e.messageId === id)) {
        if (!exists.events) exists.events = [];
        exists.events.push({
          messageId: id,
          date: exists.date,
          classification: exists.classification,
          title: exists.title,
          subject: subject,
          status: exists.status,
          link: exists.link
        });
        exists.events.sort((a, b) => new Date(a.date) - new Date(b.date));
        console.log(`[EVENT_ADDED] ${id}`);
        eventAdded = true;
      }

      const missingDetails = exists.parserVersion !== CURRENT_PARSER_VERSION;
      if (missingDetails) {
        console.log(`[REPARSE] ${id} | Existing message needs enrichment to ${CURRENT_PARSER_VERSION}`);
        let parsed = null;
        if (internetMessageId) {
          const cachedApp = await Application.findOne({
            "parseMeta.internetMessageId": internetMessageId,
            company: { $nin: ["PENDING_PARSE", "IGNORED"] },
            parserVersion: CURRENT_PARSER_VERSION
          });
          if (cachedApp) {
            console.log(`[REPARSE_CACHE_HIT] Reusing parsed data from existing application for Message-ID: ${internetMessageId}`);
            parsed = {
              emailType: cachedApp.emailType,
              opportunityType: cachedApp.opportunityType,
              isRelevant: cachedApp.emailType !== "nonRecruitment",
              classification: cachedApp.classification,
              type: cachedApp.type,
              status: cachedApp.status,
              confidenceScore: cachedApp.confidenceScore,
              timelineTitle: cachedApp.title,
              timelineSummary: cachedApp.parseMeta?.trace?.gemini?.timelineSummary || "",
              company: cachedApp.company,
              domain: cachedApp.domain,
              subtitle: cachedApp.subtitle,
              role: cachedApp.role,
              title: cachedApp.title,
              processId: cachedApp.processId,
              processName: cachedApp.processName,
              displayFields: cachedApp.displayFields,
              skills: cachedApp.skills,
              fieldsToDisplay: cachedApp.fieldsToDisplay,
              programRoles: cachedApp.programRoles,
              programStipend: cachedApp.programStipend,
              programDuration: cachedApp.programDuration,
              deadlineText: cachedApp.deadlineText,
              deadline: cachedApp.deadline,
              deadlineISO: cachedApp.deadlineISO,
              venue: cachedApp.venue,
              durationText: cachedApp.durationText,
              salaryText: cachedApp.salaryText,
              link: cachedApp.link,
              links: cachedApp.links,
              isFormLink: cachedApp.isFormLink,
              parseMeta: {
                ...cachedApp.parseMeta,
                cacheHit: true,
                originalUserId: cachedApp.userId
              }
            };
          }
        }

        if (!parsed) {
          parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, new Date(parseInt(email.data.internalDate)));
          // Sleep to safely respect Gemini RPM free tier limit
          await new Promise(r => setTimeout(r, config.GEMINI_DELAY_MS));
          usedGemini = true;
          if (parsed && parsed.parseMeta) {
            parsed.parseMeta.internetMessageId = internetMessageId;
          }
        }
        
        if (parsed) {
          const shouldRetry = parsed.parseMeta?.shouldRetry ?? false;
          if (!shouldRetry) {
            const updatePayload = {};
            updatePayload.parserVersion = CURRENT_PARSER_VERSION; // Safely lock version now

            // Update matching event in exists.events with the new LLM parsed data
            const evIndex = exists.events.findIndex(e => e.messageId === id);
            if (evIndex > -1) {
              exists.events[evIndex].classification = parsed.classification || "";
              exists.events[evIndex].title = parsed.timelineTitle || parsed.title || exists.events[evIndex].title || "";
              exists.events[evIndex].summary = parsed.timelineSummary || parsed.summary || "";
              exists.events[evIndex].link = parsed.link || exists.events[evIndex].link || "";
            } else {
              exists.events.push({
                messageId: id,
                date: exists.date,
                classification: parsed.classification || "",
                title: parsed.timelineTitle || parsed.title || "",
                subject: subject || "",
                status: exists.status || "new",
                link: parsed.link || "",
                summary: parsed.timelineSummary || parsed.summary || ""
              });
              exists.events.sort((a, b) => new Date(a.date) - new Date(b.date));
            }
            exists.markModified('events');
            eventAdded = true; // Force eventAdded so updatePayload.events is saved!

            if (!parsed.isRelevant || !parsed.company) {
              if (exists.company === "PENDING_PARSE") {
                updatePayload.company = "IGNORED";
                updatePayload.role = "IGNORED";
                updatePayload.isDeleted = true;
              }
            } else {
              if (exists.company === "PENDING_PARSE") {
                updatePayload.company = parsed.company;
                updatePayload.companyKey = normalizeCompany(parsed.company);
                updatePayload.role = parsed.role || "Unknown Role";
                updatePayload.status = "new";
                updatePayload.isDeleted = false;
              }

              const ov = exists.manualOverrides || [];
              if (!ov.includes("programRoles") && !exists.programRoles && parsed.programRoles) updatePayload.programRoles = parsed.programRoles;
              if (!ov.includes("programDuration") && !exists.programDuration && parsed.programDuration) updatePayload.programDuration = parsed.programDuration;
              if (!ov.includes("programStipend") && !exists.programStipend && parsed.programStipend) updatePayload.programStipend = parsed.programStipend;
              if (!ov.includes("deadlineText") && !exists.deadlineText && parsed.deadlineText) updatePayload.deadlineText = parsed.deadlineText;
              if (!ov.includes("link") && !exists.link && parsed.link) updatePayload.link = parsed.link;
              if (!ov.includes("links") && (!exists.links || exists.links.length === 0) && parsed.links?.length) updatePayload.links = parsed.links;
              if (!ov.includes("isFormLink") && !exists.isFormLink && parsed.isFormLink) updatePayload.isFormLink = parsed.isFormLink;
              if (!ov.includes("deadline") && !exists.deadline && parsed.deadline) updatePayload.deadline = parsed.deadline;
              if (!ov.includes("deadlineISO") && !exists.deadlineISO && parsed.deadlineISO) updatePayload.deadlineISO = parsed.deadlineISO;
              if (!ov.includes("classification") && !exists.classification && parsed.classification) updatePayload.classification = parsed.classification;
              if (!ov.includes("confidenceScore") && !exists.confidenceScore && parsed.confidenceScore) updatePayload.confidenceScore = parsed.confidenceScore;
              if (!ov.includes("jobRole") && !exists.jobRole && parsed.jobRole) updatePayload.jobRole = parsed.jobRole;
              if (!ov.includes("title") && !exists.title && parsed.title) updatePayload.title = parsed.title;
              if (!ov.includes("processId") && !exists.processId && parsed.processId) updatePayload.processId = parsed.processId;
              if (!ov.includes("processName") && !exists.processName && parsed.processName) updatePayload.processName = parsed.processName;
              if (!ov.includes("eventDate") && !exists.eventDate && parsed.eventDate) updatePayload.eventDate = parsed.eventDate;
              if (!ov.includes("eventTime") && !exists.eventTime && parsed.eventTime) updatePayload.eventTime = parsed.eventTime;
              if (!ov.includes("reportingTime") && !exists.reportingTime && parsed.reportingTime) updatePayload.reportingTime = parsed.reportingTime;
              if (!ov.includes("venue") && !exists.venue && parsed.venue) updatePayload.venue = parsed.venue;
              if (!ov.includes("durationText") && !exists.durationText && parsed.durationText) updatePayload.durationText = parsed.durationText;
              if (!ov.includes("salaryText") && !exists.salaryText && parsed.salaryText) updatePayload.salaryText = parsed.salaryText;
              if (!ov.includes("parseMeta") && !exists.parseMeta && parsed.parseMeta) updatePayload.parseMeta = parsed.parseMeta;
              if (!ov.includes("emailType") && parsed.emailType && exists.emailType !== parsed.emailType) updatePayload.emailType = parsed.emailType;
              if (!ov.includes("subtitle") && !exists.subtitle && parsed.subtitle) updatePayload.subtitle = parsed.subtitle;
              if (!ov.includes("displayFields") && (!exists.displayFields || exists.displayFields.length === 0) && parsed.displayFields?.length) updatePayload.displayFields = parsed.displayFields;
              if (!ov.includes("fieldsToDisplay") && (!exists.fieldsToDisplay || exists.fieldsToDisplay.length === 0) && parsed.fieldsToDisplay?.length) updatePayload.fieldsToDisplay = parsed.fieldsToDisplay;
            }

            if (eventAdded) updatePayload.events = exists.events;

            await Application.findByIdAndUpdate(exists._id, updatePayload, { new: true });
            console.log(`[UPDATED] ${id} | Existing application enriched & locked (${CURRENT_PARSER_VERSION})`);
          } else {
            const currentAttempts = (exists.parseMeta?.retryCount || 0) + 1;
            const nextRetry = getNextRetryDate(currentAttempts);
            
            const updateObj = {
              "parseMeta.retryCount": currentAttempts,
              "parseMeta.lastRetryAt": new Date(),
              "parseMeta.nextRetryAt": nextRetry,
              "parseMeta.shouldRetry": true
            };
            if (exists.company === "PENDING_PARSE") {
              updateObj.status = currentAttempts >= 5 ? "failed_retryable" : "pending";
            }
            if (eventAdded) {
              updateObj.events = exists.events;
            }
            await Application.findByIdAndUpdate(exists._id, updateObj, { new: true });
            console.log(`[REPARSE_DEFERRED] ${id} | Transient parser error (attempt ${currentAttempts}). Deferred until ${nextRetry.toISOString()}`);
          }
        } else {
          // Fatal parsing error (parseEmailWithLLM returned null)
          const updatePayload = { parserVersion: CURRENT_PARSER_VERSION };
          if (eventAdded) updatePayload.events = exists.events;
          
          if (exists.company === "PENDING_PARSE") {
            updatePayload.company = "IGNORED";
            updatePayload.role = "IGNORED";
            updatePayload.isDeleted = true;
          }
          
          await Application.findByIdAndUpdate(exists._id, updatePayload, { new: true });
          console.log(`[REPARSE_FAILED] ${id} | Fatal parsing error, locked to ${CURRENT_PARSER_VERSION}`);
        }
      } else if (eventAdded) {
        await Application.findByIdAndUpdate(exists._id, { events: exists.events }, { new: true });
      }

      console.log(`[SKIP] ${id} | Reason: Already exists in DB`);
      return { action: 'skipped', usedGemini };
    }

    // ── NEW EMAIL: parse and save ──
    let parsed = null;
    if (internetMessageId) {
      const cachedApp = await Application.findOne({
        "parseMeta.internetMessageId": internetMessageId,
        company: { $nin: ["PENDING_PARSE", "IGNORED"] },
        parserVersion: CURRENT_PARSER_VERSION
      });
      if (cachedApp) {
        console.log(`[PARSE_CACHE_HIT] Reusing parsed data from existing application for Message-ID: ${internetMessageId}`);
        parsed = {
          emailType: cachedApp.emailType,
          opportunityType: cachedApp.opportunityType,
          isRelevant: cachedApp.emailType !== "nonRecruitment",
          classification: cachedApp.classification,
          type: cachedApp.type,
          status: cachedApp.status,
          confidenceScore: cachedApp.confidenceScore,
          timelineTitle: cachedApp.title,
          timelineSummary: cachedApp.parseMeta?.trace?.gemini?.timelineSummary || "",
          company: cachedApp.company,
          domain: cachedApp.domain,
          subtitle: cachedApp.subtitle,
          role: cachedApp.role,
          title: cachedApp.title,
          processId: cachedApp.processId,
          processName: cachedApp.processName,
          displayFields: cachedApp.displayFields,
          skills: cachedApp.skills,
          fieldsToDisplay: cachedApp.fieldsToDisplay,
          programRoles: cachedApp.programRoles,
          programStipend: cachedApp.programStipend,
          programDuration: cachedApp.programDuration,
          deadlineText: cachedApp.deadlineText,
          deadline: cachedApp.deadline,
          deadlineISO: cachedApp.deadlineISO,
          venue: cachedApp.venue,
          durationText: cachedApp.durationText,
          salaryText: cachedApp.salaryText,
          link: cachedApp.link,
          links: cachedApp.links,
          isFormLink: cachedApp.isFormLink,
          parseMeta: {
            ...cachedApp.parseMeta,
            cacheHit: true,
            originalUserId: cachedApp.userId
          }
        };
      }
    }

    if (!parsed) {
      console.log(`[PARSE_START] ${id}`);
      parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, new Date(parseInt(email.data.internalDate)));
      // Sleep to safely respect Gemini RPM free tier limit
      await new Promise(r => setTimeout(r, config.GEMINI_DELAY_MS));
      usedGemini = true;
      if (parsed && parsed.parseMeta) {
        parsed.parseMeta.internetMessageId = internetMessageId;
      }
      console.log(`[PARSE_RESULT] ${id}`, parsed);
    }
    
    if (!parsed || !parsed.isRelevant || !parsed.company) {
      const reason = !parsed ? "Parsing failed" : (!parsed.isRelevant ? "Marked not relevant" : "Missing company");
      const shouldRetry = parsed?.parseMeta?.shouldRetry ?? false;
      
      if (shouldRetry) {
        const nextRetry = getNextRetryDate(1);
        console.log(`[PARSE_DEFERRED] ${id} | Reason: ${reason} (Transient error). Saving as pending (deferred until ${nextRetry.toISOString()}).`);
        try {
          const pendingApp = new Application({
            userId: acc._id,
            company: "PENDING_PARSE",
            role: "PENDING_PARSE",
            messageId: id,
            source: "Gmail",
            email: acc.email,
            date: new Date(parseInt(email.data.internalDate)),
            parserVersion: "v1",
            status: "pending",
            isDeleted: false,
            parseMeta: {
              shouldRetry: true,
              retryCount: 1,
              lastRetryAt: new Date(),
              nextRetryAt: nextRetry,
              llmProvider: parsed?.parseMeta?.llmProvider || "gemini-3.5-flash",
              llmStatus: parsed?.parseMeta?.llmStatus || "transport_error"
            }
          });
          await pendingApp.save();
        } catch (e) {
          if (e.code !== 11000) {
            console.error(`[PENDING_SAVE_ERROR] ${id}`, e.message);
          }
        }
        return { action: 'skipped', usedGemini };
      }
      
      const parserVer = CURRENT_PARSER_VERSION;
      console.log(`[SKIP] ${id} | Reason: ${reason}. Saving as ignored (parserVersion=${parserVer}) to prevent re-parsing.`);
      
      try {
        const ignoredApp = new Application({
          userId: acc._id,
          company: "IGNORED",
          role: "IGNORED",
          messageId: id,
          source: "Gmail",
          email: acc.email,
          date: new Date(parseInt(email.data.internalDate)),
          parserVersion: parserVer,
          isDeleted: true
        });
        await ignoredApp.save();
      } catch (e) {
        if (e.code !== 11000) {
          console.error(`[IGNORE_SAVE_ERROR] ${id}`, e.message);
        }
      }

      return { action: 'skipped', usedGemini };
    }

    const finalRole = parsed.role || "Unknown Role";
    const companyKey = normalizeCompany(parsed.company);
    const isValid = isValidCompany(parsed.company);
    
    // Fetch Company Info (with caching inside)
    console.log(`[COMPANY_INFO_CALL] ${parsed.company}`);
    const companyInfo = await getCompanyInfo(parsed.company, parsed.domain);
    if (!companyInfo) {
      console.log(`[COMPANY_INFO_MISSING] ${parsed.company}`);
    }

    let contentExists = null;
    if (isValid) {
      contentExists = await Application.findOne({
        userId: acc._id,
        companyKey,
        isDeleted: { $ne: true }
      });
    }

    if (contentExists) {
      const updatePayload = {};
      const ov = contentExists.manualOverrides || [];
      if (!ov.includes("programRoles") && !contentExists.programRoles && parsed.programRoles) updatePayload.programRoles = parsed.programRoles;
      if (!ov.includes("programDuration") && !contentExists.programDuration && parsed.programDuration) updatePayload.programDuration = parsed.programDuration;
      if (!ov.includes("programStipend") && !contentExists.programStipend && parsed.programStipend) updatePayload.programStipend = parsed.programStipend;
      if (!ov.includes("deadlineText") && !contentExists.deadlineText && parsed.deadlineText) updatePayload.deadlineText = parsed.deadlineText;
      if (!ov.includes("link") && !contentExists.link && parsed.link) updatePayload.link = parsed.link;
      if (!ov.includes("links") && (!contentExists.links || contentExists.links.length === 0) && parsed.links?.length) updatePayload.links = parsed.links;
      if (!ov.includes("isFormLink") && !contentExists.isFormLink && parsed.isFormLink) updatePayload.isFormLink = parsed.isFormLink;
      if (!ov.includes("deadline") && !contentExists.deadline && parsed.deadline) updatePayload.deadline = parsed.deadline;
      if (!ov.includes("deadlineISO") && !contentExists.deadlineISO && parsed.deadlineISO) updatePayload.deadlineISO = parsed.deadlineISO;
      if (!ov.includes("classification") && !contentExists.classification && parsed.classification) updatePayload.classification = parsed.classification;
      if (!ov.includes("confidenceScore") && !contentExists.confidenceScore && parsed.confidenceScore) updatePayload.confidenceScore = parsed.confidenceScore;
      if (!ov.includes("jobRole") && !contentExists.jobRole && parsed.jobRole) updatePayload.jobRole = parsed.jobRole;
      if (!ov.includes("title") && !contentExists.title && parsed.title) updatePayload.title = parsed.title;
      if (!ov.includes("processId") && !contentExists.processId && parsed.processId) updatePayload.processId = parsed.processId;
      if (!ov.includes("processName") && !contentExists.processName && parsed.processName) updatePayload.processName = parsed.processName;
      
      if (!ov.includes("eventDate") && parsed.eventDate) {
        if (!contentExists.eventDate || new Date(parsed.eventDate) > new Date(contentExists.eventDate)) {
          updatePayload.eventDate = parsed.eventDate;
        }
      }
      if (!ov.includes("type") && parsed.type && parsed.type !== "unknown") {
        if (!contentExists.type || contentExists.type === "unknown") {
          updatePayload.type = parsed.type;
        }
      }
      
      if (!ov.includes("eventTime") && !contentExists.eventTime && parsed.eventTime) updatePayload.eventTime = parsed.eventTime;
      if (!ov.includes("reportingTime") && !contentExists.reportingTime && parsed.reportingTime) updatePayload.reportingTime = parsed.reportingTime;
      if (!ov.includes("venue") && !contentExists.venue && parsed.venue) updatePayload.venue = parsed.venue;
      if (!ov.includes("durationText") && !contentExists.durationText && parsed.durationText) updatePayload.durationText = parsed.durationText;
      if (!ov.includes("salaryText") && !contentExists.salaryText && parsed.salaryText) updatePayload.salaryText = parsed.salaryText;
      if (!ov.includes("parseMeta") && !contentExists.parseMeta && parsed.parseMeta) updatePayload.parseMeta = parsed.parseMeta;
      if (!ov.includes("emailType") && parsed.emailType && contentExists.emailType !== parsed.emailType) updatePayload.emailType = parsed.emailType;
      if (!ov.includes("subtitle") && !contentExists.subtitle && parsed.subtitle) updatePayload.subtitle = parsed.subtitle;
      if (!ov.includes("displayFields") && (!contentExists.displayFields || contentExists.displayFields.length === 0) && parsed.displayFields?.length) updatePayload.displayFields = parsed.displayFields;
      if (!ov.includes("fieldsToDisplay") && (!contentExists.fieldsToDisplay || contentExists.fieldsToDisplay.length === 0) && parsed.fieldsToDisplay?.length) updatePayload.fieldsToDisplay = parsed.fieldsToDisplay;
      if (!ov.includes("skills") && (!contentExists.skills || contentExists.skills.length === 0) && parsed.skills?.length) updatePayload.skills = parsed.skills;

      if (!ov.includes("status")) {
        // Status is now strictly time/action-based. We do not advance status based on classification anymore.
      }

      const eventAdded = appendApplicationEvent(contentExists, parsed, {
        messageId: id,
        date: new Date(parseInt(email.data.internalDate)),
        subject: subject
      });
      
      if (eventAdded) {
        updatePayload.events = contentExists.events;
      }

      if (Object.keys(updatePayload).length > 0) {
        await Application.findByIdAndUpdate(contentExists._id, updatePayload, { new: true });
        console.log(`[UPDATED] ${id} | Duplicate company+role enriched with program data and/or event history`);
      }

      console.log(`[SKIP] ${id} | Reason: Duplicate content (company match)`);
      return { action: 'skipped', usedGemini };
    }

    // Enforce all new emails to start strictly as "new"
    const normalizedStatus = "new";
    const shouldRetry = parsed.parseMeta?.shouldRetry ?? false;
    const parserVer = shouldRetry ? "v1" : CURRENT_PARSER_VERSION;

    const newApp = new Application({
      userId: acc._id,
      company: parsed.company,
      companyKey,
      emailType: parsed.emailType || "job",
      subtitle: parsed.subtitle || "",
      displayFields: parsed.displayFields || [],
      fieldsToDisplay: parsed.fieldsToDisplay || [],
      skills: parsed.skills || [],
      role: finalRole,
      type: parsed.type || "",
      status: normalizedStatus,
      link: parsed.link || "",
      links: parsed.links || [],
      isFormLink: parsed.isFormLink || false,
      deadline: parsed.deadline || "",
      deadlineISO: parsed.deadlineISO || "",
      deadlineText: parsed.deadlineText || "",
      programRoles: parsed.programRoles || "",
      programDuration: parsed.programDuration || "",
      programStipend: parsed.programStipend || "",
      classification: parsed.classification || "",
      confidenceScore: parsed.confidenceScore || 0,
      jobRole: parsed.jobRole || "",
      title: parsed.title || "",
      processId: parsed.processId || "",
      processName: parsed.processName || "",
      eventDate: parsed.eventDate || null,
      eventTime: parsed.eventTime || "",
      reportingTime: parsed.reportingTime || "",
      venue: parsed.venue || "",
      durationText: parsed.durationText || "",
      salaryText: parsed.salaryText || "",
      parseMeta: parsed.parseMeta || {},
      events: [{
        messageId: id,
        date: new Date(parseInt(email.data.internalDate)),
        classification: parsed.classification || "",
        title: parsed.timelineTitle || parsed.title || "",
        subject: subject || "",
        status: normalizedStatus,
        link: parsed.link || "",
        summary: parsed.timelineSummary || parsed.summary || ""
      }],
      rawText,
      messageId: id,
      source: "Gmail",
      email: acc.email,
      date: new Date(parseInt(email.data.internalDate)),
      parserVersion: parserVer,
    });

    await newApp.save();
    console.log(`[INSERTED] ${id} | ${parsed.company} | ${finalRole}`);

    // Send push notification for new email (fire-and-forget)
    try {
      const { sendNewEmailNotification } = require("./utils/pushService");
      await sendNewEmailNotification(acc, newApp);
    } catch (pushErr) {
      console.error(`[PUSH_ERROR] ${id}:`, pushErr.message);
    }

    return { action: 'inserted', usedGemini };
  } catch (error) {
    if (error.code === 11000) {
      console.log(`[SKIP] ${id} | Reason: Duplicate key error (E11000)`);
    } else {
      console.log(`[ERROR] ${id}`, error.message);
    }
    return { action: 'error', usedGemini: false };
  }
}

// --- Batch DB lookup helper ---
// Returns a Map of messageId -> { parserVersion, isDeleted, parseMeta } for all known IDs
async function batchLookupMessageIds(messageIds, userId) {
  const results = await Application.find(
    {
      userId,
      $or: [
        { messageId: { $in: messageIds } },
        { "events.messageId": { $in: messageIds } }
      ]
    },
    { messageId: 1, parserVersion: 1, isDeleted: 1, "parseMeta.nextRetryAt": 1, "events.messageId": 1 }
  );
  
  const lookup = new Map();
  for (const doc of results) {
    // Map the primary messageId
    if (doc.messageId) {
      lookup.set(doc.messageId, doc);
    }
    // Also map any event messageIds that match
    if (doc.events) {
      for (const ev of doc.events) {
        if (messageIds.includes(ev.messageId) && !lookup.has(ev.messageId)) {
          lookup.set(ev.messageId, doc);
        }
      }
    }
  }
  return lookup;
}

// --- Main sync orchestrator ---
async function fetchAndProcessEmails(targetUserId = null) {
  if (targetUserId) {
    const userIdStr = targetUserId.toString();
    if (activeSyncs.has(userIdStr)) {
      console.log(`[SYNC] Blocked - sync already in progress for user: ${userIdStr}`);
      return;
    }
    activeSyncs.add(userIdStr);
  } else {
    if (isCronProcessing) {
      console.log("Cron already running, skipping...");
      return;
    }
    isCronProcessing = true;
  }

  const formatDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const cronStartTime = Date.now();
  let accountsProcessed = 0;
  let accountsSkipped = 0;
  let accountsFailed = 0;

  let insertedCount = 0;
  let skippedCount = 0;
  let fetchedCount = 0;

  try {
    const query = targetUserId ? { _id: targetUserId } : {};
    const accounts = await Account.find(query);

    if (!targetUserId) {
      console.log("==================================================");
      console.log("[CRON START]");
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`Accounts Found: ${accounts.length}`);
      console.log("==================================================");
    }

    if (!accounts.length) {
      console.log("No accounts connected");
      return;
    }

    for (let acc of accounts) {
      if (!acc.email || !config.isAllowedEmail(acc.email)) {
        console.log(`[SYNC] Skipping unauthorized or invalid email: ${acc.email || "Unknown"}`);
        accountsSkipped++;
        continue;
      }

      if (config.ALLOWED_SENDERS.includes(acc.email.toLowerCase())) {
        console.log(`[SYNC] Skipping institutional sender account: ${acc.email}`);
        accountsSkipped++;
        continue;
      }

      const accIdStr = acc._id.toString();
      if (!targetUserId) {
        if (activeSyncs.has(accIdStr)) {
          console.log(`[CRON] Skipping account ${acc.email} - sync already in progress`);
          accountsSkipped++;
          continue;
        }
        activeSyncs.add(accIdStr);
      }

      const accountStartTime = Date.now();
      console.log(`Processing account: ${acc.email}`);
      try {
        await Account.findOneAndUpdate({ email: acc.email }, { syncStatus: "pending" });

        const localOauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        localOauth2Client.setCredentials(acc.tokens);
        console.log(`[SYNC_TOKENS] ${acc.email} | scope: ${acc.tokens?.scope || 'NONE'} | has_refresh: ${!!acc.tokens?.refresh_token}`);

        localOauth2Client.on("tokens", async (newTokens) => {
          console.log(`[TOKEN_REFRESH] Received refreshed Google tokens for: ${acc.email}`);
          try {
            const updatedTokens = {
              ...acc.tokens,
              ...newTokens,
            };
            await Account.findOneAndUpdate(
              { email: acc.email },
              { tokens: updatedTokens }
            );
            console.log(`[TOKEN_REFRESH_PERSISTED] Refreshed tokens persisted to MongoDB for: ${acc.email}`);
            acc.tokens = updatedTokens;
          } catch (dbErr) {
            console.error(`[TOKEN_REFRESH_PERSIST_FAILED] Failed to persist refreshed tokens for ${acc.email}:`, dbErr.message);
          }
        });

        const gmail = google.gmail({
          version: "v1",
          auth: localOauth2Client,
        });

        // ══════════════════════════════════════════════
        // DECIDE: Incremental sync or Full sync?
        // ══════════════════════════════════════════════
        let messageIdsToProcess = [];
        let newHistoryId = null;
        let syncPath = "full"; // default

        if (acc.lastHistoryId) {
          // ── PATH 1: INCREMENTAL SYNC via History API ──
          try {
            console.log(`[INCREMENTAL] Starting incremental sync from historyId: ${acc.lastHistoryId}`);
            
            let allAddedMessageIds = [];
            let pageToken = null;
            let latestHistoryId = null;

            do {
              const historyParams = {
                userId: "me",
                startHistoryId: acc.lastHistoryId,
                historyTypes: ["messageAdded"],
              };
              if (pageToken) historyParams.pageToken = pageToken;

              const historyResponse = await gmail.users.history.list(historyParams);
              
              latestHistoryId = historyResponse.data.historyId;

              if (historyResponse.data.history) {
                for (const record of historyResponse.data.history) {
                  if (record.messagesAdded) {
                    for (const added of record.messagesAdded) {
                      allAddedMessageIds.push(added.message.id);
                    }
                  }
                }
              }

              pageToken = historyResponse.data.nextPageToken || null;
            } while (pageToken);

            newHistoryId = latestHistoryId;

            if (allAddedMessageIds.length === 0) {
              console.log(`[ACCOUNT START]\nEmail: ${acc.email}\nMode: Incremental\nHistoryId: ${acc.lastHistoryId}`);
              const accDuration = ((Date.now() - accountStartTime) / 1000).toFixed(1);
              console.log(`[ACCOUNT COMPLETE]\nEmail: ${acc.email}\nDuration: ${accDuration}s\nFetched: 0\nInserted: 0\nSkipped: 0\nMode: Incremental`);
              accountsProcessed++;

              console.log(`[INCREMENTAL] No new messages since last sync.`);
              console.log(`[INCREMENTAL_SUMMARY] History events: 0 | New messages: 0 | historyId: ${acc.lastHistoryId} → ${newHistoryId}`);
              // Update historyId even when nothing changed
              await Account.findOneAndUpdate(
                { email: acc.email },
                { lastHistoryId: newHistoryId, syncMode: "incremental", syncStatus: "success", syncError: null, lastSyncTime: new Date() }
              );
              continue; // Skip to next account
            }

            // Deduplicate (History API can return the same message in multiple history records)
            messageIdsToProcess = [...new Set(allAddedMessageIds)];
            syncPath = "incremental";
            console.log(`[INCREMENTAL] Found ${messageIdsToProcess.length} new message(s) to process (${allAddedMessageIds.length} history events, ${messageIdsToProcess.length} unique).`);

          } catch (historyError) {
            // 404 means historyId has expired — fall back to full sync
            if (historyError.code === 404 || historyError.response?.status === 404) {
              console.log(`[INCREMENTAL_EXPIRED] historyId ${acc.lastHistoryId} has expired. Falling back to full sync.`);
              syncPath = "full";
            } else {
              throw historyError; // Re-throw unexpected errors
            }
          }
        }

        if (syncPath === "full") {
          // ── PATH 2: FULL SYNC (bootstrap or recovery) ──
          console.log(`[FULL_SYNC] Starting full sync for ${acc.email}`);

          const listController = new AbortController();
          const listTimeoutId = setTimeout(() => listController.abort(), 15000);
          let response;
          try {
            const queryStr = `(${ALLOWED_SENDERS.map(s => `from:${s}`).join(" OR ")}) newer_than:90d`;
            response = await gmail.users.messages.list({
              userId: "me",
              maxResults: 250,
              q: queryStr,
            }, {
              signal: listController.signal
            });
            clearTimeout(listTimeoutId);
          } catch (error) {
            clearTimeout(listTimeoutId);
            if (error.name === "AbortError" || listController.signal.aborted) {
              const timeoutError = new Error("Gmail list messages request timed out");
              timeoutError.code = "ETIMEOUT";
              throw timeoutError;
            }
            throw error;
          }

          const messages = response.data.messages || [];
          messageIdsToProcess = messages.map(m => m.id);

          // Capture historyId from the profile for bootstrapping
          // messages.list doesn't return historyId directly, so we get it from the user's profile
          try {
            const profileResponse = await gmail.users.getProfile({ userId: "me" });
            newHistoryId = profileResponse.data.historyId;
            console.log(`[FULL_SYNC] Captured historyId from profile: ${newHistoryId}`);
          } catch (profileErr) {
            console.error(`[FULL_SYNC] Failed to get profile historyId: ${profileErr.message}`);
            // Non-fatal: we proceed without historyId and will do a full sync again next time
          }

          console.log(`[FULL_SYNC] Messages listed: ${messageIdsToProcess.length} | historyId: ${newHistoryId || 'unavailable'}`);
        }

        console.log(`[ACCOUNT START]\nEmail: ${acc.email}\nMode: ${syncPath === "incremental" ? "Incremental" : "Full"}${syncPath === "incremental" ? `\nHistoryId: ${acc.lastHistoryId}` : ""}`);

        // ══════════════════════════════════════════════
        // COMMON: Process the collected message IDs
        // ══════════════════════════════════════════════
        fetchedCount += messageIdsToProcess.length;
        console.log(`\n--- STARTING SYNC FOR ${acc.email} (${syncPath}) ---`);

        // BATCH DB LOOKUP: Replace N individual findOne() calls with one $in query
        const knownDocs = await batchLookupMessageIds(messageIdsToProcess, acc._id);
        const newCount = messageIdsToProcess.length - knownDocs.size;
        console.log(`[BATCH_LOOKUP] Already known: ${knownDocs.size} | New: ${newCount} | Total: ${messageIdsToProcess.length}`);

        let accInserted = 0;
        let accSkipped = 0;
        let geminiParsedCount = 0;

        for (const msgId of messageIdsToProcess) {
          // Abort the loop immediately if a Clear All was requested for this account while sync was running
          if (activeClearRequests.has(acc._id.toString())) {
            console.log(`[SYNC_ABORTED] Clear All requested for user ${acc.email} — aborting sync loop`);
            break;
          }

          const existingFast = knownDocs.get(msgId) || null;
          const result = await processMessage(gmail, acc, msgId, null, existingFast, geminiParsedCount);

          if (result.action === 'inserted') {
            accInserted++;
            insertedCount++;
          } else {
            accSkipped++;
            skippedCount++;
          }

          if (result.usedGemini) geminiParsedCount++;

          if (geminiParsedCount >= config.MAX_EMAILS_PER_SYNC) {
            console.log(`[SYNC_PROGRESSIVE] Reached limit of ${config.MAX_EMAILS_PER_SYNC} Gemini parses. Stopping sync to preserve quota.`);
            break;
          }
        }

        // ══════════════════════════════════════════════
        // PERSIST: Update account state after sync
        // ══════════════════════════════════════════════
        const accountUpdate = {
          syncStatus: "success",
          syncError: null,
          lastSyncTime: new Date(),
        };
        if (newHistoryId) {
          accountUpdate.lastHistoryId = newHistoryId;
          accountUpdate.syncMode = "incremental";
          console.log(`[SYNC_CHECKPOINT] historyId saved: ${newHistoryId}`);
        }
        const syncedAccount = await Account.findOneAndUpdate({ email: acc.email }, accountUpdate, { returnDocument: 'after' });
        if (syncedAccount) {
          await processCalendarSyncQueue(syncedAccount);
        }

        const accDuration = ((Date.now() - accountStartTime) / 1000).toFixed(1);
        console.log(`[ACCOUNT COMPLETE]\nEmail: ${acc.email}\nDuration: ${accDuration}s\nFetched: ${messageIdsToProcess.length}\nInserted: ${accInserted}\nSkipped: ${accSkipped}\nMode: ${syncPath === "incremental" ? "Incremental" : "Full"}`);
        accountsProcessed++;

      } catch (err) {
        const accDuration = ((Date.now() - accountStartTime) / 1000).toFixed(1);
        console.log(`[ACCOUNT FAILURE]\nEmail: ${acc.email}\nDuration: ${accDuration}s\nError: ${err.message}`);
        accountsFailed++;

        console.error(`Fetch error for account ${acc.email}:`, err.message);
        let errorMsg = err.message || "Unknown sync error";
        if (err.message?.includes("insufficient authentication scopes")) {
          errorMsg = "Gmail permissions were not fully granted. Please log out and sign in again, ensuring all permissions are accepted on the Google consent screen.";
        } else if (
          err.message?.includes("invalid_grant") ||
          err.message?.includes("token") ||
          err.message?.includes("auth") ||
          err.code === 400 ||
          err.code === 401
        ) {
          errorMsg = "Gmail authentication expired or revoked. Please log out and sign in again.";
        }
        await Account.findOneAndUpdate(
          { email: acc.email },
          { syncStatus: "failed", syncError: errorMsg }
        );
      } finally {
        if (!targetUserId) {
          activeSyncs.delete(accIdStr);
        }
      }
    }
    console.log(`\n[SYNC_COMPLETE] Fetched: ${fetchedCount} | Inserted: ${insertedCount} | Skipped: ${skippedCount}`);
  } catch (err) {
    console.error("Fetch error:", err.message);
    // Removed 'throw err' to prevent unhandled rejections in background execution
  } finally {
    if (targetUserId) {
      activeSyncs.delete(targetUserId.toString());
    } else {
      isCronProcessing = false;
      const totalDuration = Date.now() - cronStartTime;
      console.log("==================================================");
      console.log("[CRON COMPLETE]");
      console.log(`Duration: ${formatDuration(totalDuration)}`);
      console.log(`Accounts Succeeded: ${accountsProcessed}`);
      console.log(`Accounts Skipped: ${accountsSkipped}`);
      console.log(`Accounts Failed: ${accountsFailed}`);
      console.log(`Emails Fetched: ${fetchedCount}`);
      console.log(`Inserted: ${insertedCount}`);
      console.log(`Skipped: ${skippedCount}`);
      console.log("==================================================");
    }
  }
}

// ==========================
// 🔘 MANUAL TRIGGER (SYNC BUTTON)
// ==========================
// Middleware to validate static CRON_API_KEY
const requireCronKey = (req, res, next) => {
  const cronKey = req.headers["x-cron-key"] || req.query.cron_key;
  if (!cronKey || cronKey !== process.env.CRON_API_KEY) {
    return res.status(401).json({ message: "Unauthorized. Invalid cron key." });
  }
  next();
};

// ==========================
// 🔘 MANUAL TRIGGER (SYNC BUTTON)
// ==========================
app.get("/sync", syncLimiter, authenticate, (req, res) => {
  const userIdStr = req.userId.toString();

  // Layer 1 — concurrency guard (existing, unchanged)
  if (activeSyncs.has(userIdStr)) {
    console.log(`[MANUAL_SYNC] Blocked for user ${userIdStr} — sync already in progress`);
    return res.status(200).json({ success: true, message: "Sync already in progress. Please wait for it to finish." });
  }

  // Layer 2 — per-user cooldown (45-second window)
  const lastSync = manualSyncCooldowns.get(userIdStr);
  if (lastSync) {
    const elapsed = Date.now() - lastSync;
    if (elapsed < MANUAL_SYNC_COOLDOWN_MS) {
      const remaining = Math.ceil((MANUAL_SYNC_COOLDOWN_MS - elapsed) / 1000);
      console.log(`[MANUAL_SYNC] Cooldown active for user ${userIdStr} — ${remaining}s remaining`);
      return res.status(429).json({
        success: false,
        message: `Please wait ${remaining} second${remaining !== 1 ? "s" : ""} before syncing again.`,
        retryAfterSeconds: remaining
      });
    }
  }

  // Record the timestamp of this sync attempt
  manualSyncCooldowns.set(userIdStr, Date.now());

  fetchAndProcessEmails(req.userId)
    .then(() => console.log("Manual sync completed"))
    .catch((err) => console.error("Manual sync failed:", err.message));

  res.send("Sync triggered in background");
});



// ==========================
// 🧪 MANUAL CRON TRIGGER
// ==========================
app.get("/run-cron", requireCronKey, (req, res) => {
  if (isCronProcessing) {
    return res.status(200).json({ success: true, message: "Sync already in progress" });
  }

  // Trigger sync in background to avoid HTTP timeout (502)
  fetchAndProcessEmails()
    .then(() => console.log("Background sync completed"))
    .catch((err) => console.error("Background sync failed:", err.message));

  res.status(200).json({ success: true, message: "Sync triggered" });
});

// ==========================
// ⏱ CRON (AUTO SYNC)
// ==========================
// Internal cron disabled — using external cron-job.org for scheduling via /run-cron
// cron.schedule("0 */2 * * *", async () => {
//   console.log("Auto syncing emails...");
//   await fetchAndProcessEmails();
// });

// ==========================
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.message);
  res.status(500).json({ success: false, error: "Internal Server Error" });
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = {
  app,
  mergeAlternativeTexts,
  fetchAndProcessEmails
};