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
const LinkedGmailAccount = require("./models/LinkedGmailAccount");
const applicationRoutes = require("./routes/applicationRoutes");
const { parseEmailWithLLM, mergeAlternativeTexts } = require("./utils/parseEmailWithLLM");
const { enrichApplicationRecord } = require("./utils/enrichmentService");
const { getCompanyInfo } = require("./utils/companyInfoService");
const { enrichCompanyProfile } = require("./utils/enrichCompanyProfile");
const { normalizeCompany, isValidCompany } = require("./utils/normalizeCompany");
const { advanceStatus, classificationToStatus } = require("./utils/statusMachine");
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require("./utils/jwt");
const { extractAttachmentMetadata, mergeAttachments } = require("./utils/attachmentUtils");
const {
  deriveUsnFromEmail,
  buildStudentIdentity,
  inspectAndMatchWorkbook,
  recomputeApplicationShortlistState,
} = require("./utils/shortlistMatcher");
const authenticate = require("./middleware/authenticate");
const { generateAuthCode, consumeAuthCode } = require("./utils/authCodeStore");
const { createLinkState, consumeLinkState } = require("./utils/linkStateStore");
const { processCalendarSyncQueue, migrateAccountCalendar, getCalendarListForAccount } = require("./utils/calendarService");
const {
  authLimiter,
  syncLimiter,
  calendarSyncLimiter,
  writeLimiter,
  readLimiter
} = require("./middleware/rateLimiters");

const ALLOWED_SENDERS = config.ALLOWED_SENDERS;
const CURRENT_PARSER_VERSION = "v4";
const MAX_LINKED_ACCOUNTS = 3;

function getLinkRedirectUri() {
  if (process.env.GOOGLE_LINK_REDIRECT_URI) {
    return process.env.GOOGLE_LINK_REDIRECT_URI;
  }
  return process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback";
}

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

    // 3b. Preserve hyperlinks: convert <a href="URL">Anchor Text</a> to Anchor Text (URL)
    html = html.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (match, href, text) => {
      const cleanText = text.replace(/<[^>]*>/g, "").trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
        return cleanText;
      }
      if (cleanText && cleanText.toLowerCase() !== href.toLowerCase()) {
        return `${cleanText} (${href})`;
      }
      return href;
    });
    
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
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly"
    ],
    include_granted_scopes: true,
    prompt: "consent",
  });

  res.redirect(url);
});

app.get("/auth/google/callback", authLimiter, async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  // Check if state belongs to an account linking flow
  const linkStateData = consumeLinkState(state);
  if (linkStateData) {
    const { parentAccountId } = linkStateData;

    try {
      const parentAccount = await Account.findById(parentAccountId);
      if (!parentAccount) {
        console.warn(`[LINK_CALLBACK_DENIED] Parent account ${parentAccountId} not found.`);
        return res.redirect(`${frontendUrl}?linked=error&reason=account_not_found`);
      }

      const redirectUri = getLinkRedirectUri();
      const localCallbackClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      const { tokens } = await localCallbackClient.getToken(code);
      localCallbackClient.setCredentials(tokens);

      const oauth2 = google.oauth2({ auth: localCallbackClient, version: "v2" });
      const userInfo = await oauth2.userinfo.get();
      const linkedEmail = (userInfo?.data?.email || "").toLowerCase().trim();

      if (!linkedEmail) {
        return res.redirect(`${frontendUrl}?linked=error&reason=missing_email`);
      }

      if (linkedEmail === parentAccount.email.toLowerCase().trim()) {
        return res.redirect(`${frontendUrl}?linked=error&reason=same_as_primary`);
      }

      // Validate required gmail.readonly scope is granted
      if (!tokens.scope || !tokens.scope.includes("https://www.googleapis.com/auth/gmail.readonly")) {
        console.warn(`[LINKED_CALLBACK_DENIED] ${linkedEmail} missing gmail.readonly scope. Scopes returned: ${tokens.scope}`);
        return res.redirect(`${frontendUrl}?linked=error&reason=insufficient_scopes`);
      }

      // Check count limit
      const existingCount = await LinkedGmailAccount.countDocuments({
        parentAccountId,
        email: { $ne: linkedEmail }
      });

      if (existingCount >= MAX_LINKED_ACCOUNTS) {
        return res.redirect(`${frontendUrl}?linked=error&reason=max_limit`);
      }

      // Preserve existing refresh token if re-authorizing
      const existingLinked = await LinkedGmailAccount.findOne({ parentAccountId, email: linkedEmail });
      let mergedTokens = { ...tokens };
      if (existingLinked && existingLinked.tokens && !mergedTokens.refresh_token) {
        mergedTokens.refresh_token = existingLinked.tokens.refresh_token;
      }

      await LinkedGmailAccount.findOneAndUpdate(
        { parentAccountId, email: linkedEmail },
        {
          $set: {
            parentAccountId,
            email: linkedEmail,
            tokens: mergedTokens,
            syncStatus: "idle",
            syncError: null,
            displayName: userInfo?.data?.name || "",
          }
        },
        { upsert: true, returnDocument: 'after' }
      );

      console.log(`[LINKED_ACCOUNT_SUCCESS] ${linkedEmail} linked to user ${parentAccount.email}`);

      fetchAndProcessEmails(parentAccountId).catch(err => {
        console.error(`[LINKED_INITIAL_SYNC_ERR] ${linkedEmail}:`, err.message);
      });

      return res.redirect(`${frontendUrl}?linked=success&email=${encodeURIComponent(linkedEmail)}`);
    } catch (err) {
      console.error("[LINKED_CALLBACK_ERR]", err.message);
      return res.redirect(`${frontendUrl}?linked=error&reason=${encodeURIComponent(err.message)}`);
    }
  }

  try {
    // Standard Login Callback Flow
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
      const hadCalendarScope = existingAccount.tokens.scope && (
        existingAccount.tokens.scope.includes("auth/calendar.events") ||
        existingAccount.tokens.scope.includes("auth/calendar.readonly")
      );
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

// ==========================================
// 🔗 LINK ADDITIONAL GMAIL ACCOUNT ROUTES
// ==========================================

// GET /auth/google/link - Initiate account linking flow (Authenticated)
app.get("/auth/google/link", authLimiter, authenticate, (req, res) => {
  try {
    const stateToken = createLinkState(req.userId, req.userEmail);
    const redirectUri = getLinkRedirectUri();

    const localLinkClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const url = localLinkClient.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      include_granted_scopes: true,
      prompt: "select_account consent",
      state: stateToken,
    });

    res.json({ url });
  } catch (err) {
    console.error("[LINK_INIT_ERR]", err.message);
    res.status(500).json({ message: "Failed to generate account link URL" });
  }
});

// POST /auth/linked-accounts/:id/sync - Manually trigger sync for a specific linked account
app.post("/auth/linked-accounts/:id/sync", writeLimiter, authenticate, async (req, res) => {
  try {
    const linkedDoc = await LinkedGmailAccount.findOne({
      _id: req.params.id,
      parentAccountId: req.userId
    });

    if (!linkedDoc) {
      return res.status(404).json({ message: "Linked account not found" });
    }

    fetchAndProcessEmails(req.userId).catch(err => {
      console.error(`[LINKED_MANUAL_SYNC_ERR] ${linkedDoc.email}:`, err.message);
    });

    res.json({ success: true, message: `Sync initiated for ${linkedDoc.email}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /auth/linked-accounts - List linked Gmail accounts for current user
app.get("/auth/linked-accounts", readLimiter, authenticate, async (req, res) => {
  try {
    const linkedAccounts = await LinkedGmailAccount.find({ parentAccountId: req.userId })
      .select("-tokens")
      .sort({ connectedAt: -1 });

    res.json({ linkedAccounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /auth/linked-accounts/:id - Disconnect linked Gmail account
app.delete("/auth/linked-accounts/:id", writeLimiter, authenticate, async (req, res) => {
  try {
    const linkedDoc = await LinkedGmailAccount.findOne({
      _id: req.params.id,
      parentAccountId: req.userId
    });

    if (!linkedDoc) {
      return res.status(404).json({ message: "Linked account not found" });
    }

    // Revoke OAuth access token with Google if available
    try {
      const tokenToRevoke = linkedDoc.tokens?.access_token || linkedDoc.tokens?.refresh_token;
      if (tokenToRevoke) {
        const redirectUri = getLinkRedirectUri();
        const localClient = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          redirectUri
        );
        await localClient.revokeToken(tokenToRevoke);
        console.log(`[LINKED_ACCOUNT_REVOKED] Revoked Google OAuth token for ${linkedDoc.email}`);
      }
    } catch (revokeErr) {
      console.warn(`[LINKED_ACCOUNT_REVOKE_WARN] Token revocation warning for ${linkedDoc.email}:`, revokeErr.message);
    }

    // Remove document (does NOT touch existing applications per requirement 5)
    await LinkedGmailAccount.findByIdAndDelete(req.params.id);
    console.log(`[LINKED_ACCOUNT_DELETED] Removed linked account ${linkedDoc.email}`);

    res.json({ success: true, message: "Account disconnected successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
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

// GET /auth/student-profile - get student profile and dynamically derived USN
app.get("/auth/student-profile", readLimiter, authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    const linkedAccs = await LinkedGmailAccount.find({ parentAccountId: req.userId }, { email: 1 });
    const linkedEmails = linkedAccs.map((l) => l.email);

    const derivedUsn = deriveUsnFromEmail([account.email, ...linkedEmails]);

    res.json({
      derivedUsn,
      email: account.email,
      studentProfile: {
        fullName: account.studentProfile?.fullName || "",
        personalEmail: account.studentProfile?.personalEmail || "",
        mobileNumber: account.studentProfile?.mobileNumber || "",
        lastUpdated: account.studentProfile?.lastUpdated || null,
      },
    });
  } catch (err) {
    console.error("[GET_STUDENT_PROFILE_ERR]", err.message);
    res.status(500).json({ message: err.message });
  }
});

// PUT /auth/student-profile - update student profile and re-evaluate past shortlist spreadsheets
app.put("/auth/student-profile", writeLimiter, authenticate, async (req, res) => {
  try {
    const { fullName, personalEmail, mobileNumber } = req.body || {};

    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    account.studentProfile = {
      fullName: (fullName || "").trim(),
      personalEmail: (personalEmail || "").toLowerCase().trim(),
      mobileNumber: (mobileNumber || "").trim(),
      lastUpdated: new Date(),
    };

    await account.save();

    // Dynamically derive USN and build updated identity vector
    const linkedAccs = await LinkedGmailAccount.find({ parentAccountId: req.userId });
    const linkedEmails = linkedAccs.map((l) => l.email);
    const derivedUsn = deriveUsnFromEmail([account.email, ...linkedEmails]);
    const studentIdentity = buildStudentIdentity(account, linkedEmails);

    // Re-evaluate past spreadsheets that previously had no match or were unprocessed
    let reEvaluatedCount = 0;
    let newMatchesCount = 0;

    try {
      const candidateApps = await Application.find({
        userId: req.userId,
        isDeleted: false,
        "attachments.filename": { $regex: /\.xlsx$/i },
      });

      for (const app of candidateApps) {
        let appModified = false;

        for (const att of app.attachments) {
          if (
            !att.isInline &&
            (att.filename || "").toLowerCase().endsWith(".xlsx") &&
            (att.shortlistStatus === "no_match" || att.shortlistStatus === "unprocessed")
          ) {
            // Resolve OAuth tokens for message
            const targetMessageId = att.messageId;
            const eventForMessage = (app.events || []).find((e) => e.messageId === targetMessageId);
            const receivingEmail = (
              eventForMessage?.accountEmail || app.accountEmail || account.email || ""
            ).toLowerCase().trim();

            let oauthTokens = account.tokens;
            if (receivingEmail !== (account.email || "").toLowerCase().trim()) {
              const linked = linkedAccs.find((l) => l.email.toLowerCase().trim() === receivingEmail);
              if (linked?.tokens) oauthTokens = linked.tokens;
            }

            if (oauthTokens) {
              const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
              );
              oauth2Client.setCredentials(oauthTokens);
              const gmail = google.gmail({ version: "v1", auth: oauth2Client });

              try {
                const attRes = await gmail.users.messages.attachments.get({
                  userId: "me",
                  messageId: targetMessageId,
                  id: att.attachmentId,
                });

                if (attRes.data && attRes.data.data) {
                  const fileBuffer = Buffer.from(attRes.data.data, "base64url");
                  const matchResult = inspectAndMatchWorkbook(fileBuffer, studentIdentity, att.filename);

                  att.shortlistStatus = matchResult.status;
                  att.shortlistDetails = {
                    matchedIdentifierType: matchResult.matchDetails?.matchedIdentifierType || null,
                    sheetName: matchResult.matchDetails?.sheetName || null,
                    processedAt: matchResult.matchDetails?.processedAt || new Date(),
                  };
                  appModified = true;
                  reEvaluatedCount++;

                  if (matchResult.status === "matched") {
                    newMatchesCount++;
                  }
                }
              } catch (fetchErr) {
                console.error(`[PROFILE_RECHECK_ERR] ${att.filename}:`, fetchErr.message);
              }
            }
          }
        }

        if (appModified) {
          recomputeApplicationShortlistState(app);
          await app.save();
        }
      }
    } catch (recheckErr) {
      console.error("[PROFILE_RECHECK_GLOBAL_ERR]", recheckErr.message);
    }

    res.json({
      message: "Student profile updated successfully",
      derivedUsn,
      studentProfile: account.studentProfile,
      reEvaluatedCount,
      newMatchesCount,
    });
  } catch (err) {
    console.error("[PUT_STUDENT_PROFILE_ERR]", err.message);
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
      calendarTargetId: account.calendarTargetId || "",
      hasCalendarScope: !!hasCalendarScope
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /auth/calendar/list - get list of user's Google Calendars
app.get("/auth/calendar/list", readLimiter, authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.userId);
    const calendars = await getCalendarListForAccount(account);
    res.json({ calendars });
  } catch (err) {
    console.error("[CALENDAR_LIST] Error fetching calendar list:", err.message);
    res.json({
      calendars: [{ id: "primary", summary: "Primary Calendar (Default)", primary: true }]
    });
  }
});

// POST /auth/calendar/target - set target calendar ID and trigger migration
app.post("/auth/calendar/target", writeLimiter, authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.userId);
    if (!account) return res.status(404).json({ message: "Account not found" });

    const newTargetId = (req.body.calendarTargetId || "").trim();
    const oldTargetId = account.calendarTargetId || "primary";

    account.calendarTargetId = newTargetId || null;
    await account.save();

    res.json({ 
      success: true, 
      calendarTargetId: account.calendarTargetId,
      message: "Target calendar updated successfully." 
    });

    // Trigger migration asynchronously if calendar sync is enabled and target changed
    if (account.calendarSyncEnabled && (newTargetId || "primary") !== oldTargetId) {
      console.log(`[CALENDAR_MIGRATE] Triggering async migration for ${account.email} from ${oldTargetId} to ${newTargetId || "primary"}`);
      migrateAccountCalendar(account, oldTargetId).catch(err => 
        console.error("[CALENDAR_MIGRATE] Async target migration error:", err.message)
      );
    }
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
        { $set: { needsCalendarSync: true, calendarRetryCount: 0, calendarSyncError: null } }
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

    // Flag all active applications for sync and reset retry counts
    await Application.updateMany(
      { userId: req.userId, isDeleted: { $ne: true } },
      { $set: { needsCalendarSync: true, calendarRetryCount: 0, calendarSyncError: null } }
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
  const { messageId, date, subject, accountEmail } = emailMetadata;
  if (!application.events) application.events = [];
  
  const eventExists = application.events.some(e => e.messageId === messageId);
  if (eventExists) {
    console.log(`[EVENT_SKIPPED_DUPLICATE] ${messageId}`);
    return false;
  }
  
  application.events.push({
    messageId,
    accountEmail: accountEmail || application.accountEmail || "",
    date,
    classification: parsed.classification || "",
    title: parsed.timelineTitle || parsed.title || "",
    subject: subject || "",
    status: parsed.status || "new",
    link: parsed.link || "",
    summary: parsed.timelineSummary || parsed.summary || ""
  });
  
  application.events.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`[EVENT_ADDED] ${messageId}`);
  return true;
}

// ==========================
// 📥 FETCH + SAVE EMAILS
// ==========================

/**
 * Evaluates any unprocessed .xlsx attachments in an application record for shortlist matches.
 * Uses the deterministic shortlistMatcher engine.
 */
async function evaluateAppXLSXShortlists(app, acc, defaultGmailClient) {
  if (!app || !Array.isArray(app.attachments) || app.attachments.length === 0) return false;

  const xlsxAttachments = app.attachments.filter(
    (a) =>
      !a.isInline &&
      (a.filename || "").toLowerCase().endsWith(".xlsx") &&
      (!a.shortlistStatus || a.shortlistStatus === "unprocessed")
  );

  if (xlsxAttachments.length === 0) return false;

  const linkedAccs = await LinkedGmailAccount.find({ parentAccountId: acc._id });
  const linkedEmails = linkedAccs.map((l) => l.email);
  const studentIdentity = buildStudentIdentity(acc, linkedEmails);

  let modified = false;

  for (const att of xlsxAttachments) {
    try {
      let targetGmail = defaultGmailClient;
      const targetMessageId = att.messageId;
      const eventForMessage = (app.events || []).find((e) => e.messageId === targetMessageId);
      const receivingEmail = (
        eventForMessage?.accountEmail || app.accountEmail || acc.email || ""
      ).toLowerCase().trim();

      if (receivingEmail && receivingEmail !== (acc.email || "").toLowerCase().trim()) {
        const linked = linkedAccs.find((l) => l.email.toLowerCase().trim() === receivingEmail);
        if (linked?.tokens) {
          const linkedOauth2 = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          );
          linkedOauth2.setCredentials(linked.tokens);
          targetGmail = google.gmail({ version: "v1", auth: linkedOauth2 });
        }
      }

      const attRes = await targetGmail.users.messages.attachments.get({
        userId: "me",
        messageId: att.messageId,
        id: att.attachmentId,
      });

      if (attRes.data && attRes.data.data) {
        const fileBuffer = Buffer.from(attRes.data.data, "base64url");
        const matchResult = inspectAndMatchWorkbook(fileBuffer, studentIdentity, att.filename);

        att.shortlistStatus = matchResult.status;
        att.shortlistDetails = {
          matchedIdentifierType: matchResult.matchDetails?.matchedIdentifierType || null,
          sheetName: matchResult.matchDetails?.sheetName || null,
          processedAt: matchResult.matchDetails?.processedAt || new Date(),
        };
        modified = true;
        console.log(
          `[SHORTLIST_EVAL] Message: ${att.messageId} | File: ${att.filename} | Status: ${matchResult.status} | Type: ${matchResult.matchDetails?.matchedIdentifierType || "none"}`
        );
      }
    } catch (err) {
      console.error(`[SHORTLIST_EVAL_ERR] Message ${att.messageId} | File ${att.filename}:`, err.message);
      att.shortlistStatus = "error";
      att.shortlistDetails = {
        matchedIdentifierType: null,
        sheetName: null,
        processedAt: new Date(),
      };
      modified = true;
    }
  }

  if (modified) {
    recomputeApplicationShortlistState(app);
  }

  return modified;
}

// --- Extracted per-message processing logic ---
// Returns: { action: 'inserted' | 'skipped' | 'error', usedLLM: boolean }
async function processMessage(gmail, acc, messageId, subject_unused, existingFast, llmParsedCount, receivingEmailOverride) {
  const id = messageId;
  const receivingEmail = (receivingEmailOverride || acc.email || "").toLowerCase().trim();
  let usedLLM = false;

  try {
    // ── FAST PATH: already fully parsed ──
    if (existingFast) {
      if (existingFast.parserVersion === CURRENT_PARSER_VERSION) {
        if (existingFast.isDeleted) {
          console.log(`[SKIP_FAST] ${id} | Reason: Message already deleted by user`);
        } else {
          console.log(`[SKIP_FAST] ${id} | Reason: Already exists and fully parsed (${CURRENT_PARSER_VERSION})`);
        }
        return { action: 'skipped', usedLLM: false };
      } else {
        // Check if backoff retry window has elapsed
        const nextRetry = existingFast.parseMeta?.nextRetryAt ? new Date(existingFast.parseMeta.nextRetryAt) : null;
        if (nextRetry && new Date() < nextRetry) {
          console.log(`[SKIP_FAST] ${id} | Reason: Backoff active (retry deferred until ${nextRetry.toISOString()})`);
          return { action: 'skipped', usedLLM: false };
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
      return { action: 'skipped', usedLLM: false };
    }

    const snippet = email.data.snippet || "";
    const rawText = `${subject} ${snippet}`.trim();
    
    const fullBodyText = getFullBodyText(email.data.payload);
    console.log(`[BODY_FETCHED] ${id} length: ${fullBodyText.length}`);

    // ── EXTRACT ATTACHMENT METADATA ──
    const emailAttachments = extractAttachmentMetadata(email.data.payload, id);
    if (emailAttachments.length > 0) {
      const realCount = emailAttachments.filter(a => !a.isInline).length;
      console.log(`[ATTACHMENTS] ${id} | Total: ${emailAttachments.length} | Real: ${realCount} | Inline: ${emailAttachments.length - realCount}`);
    }

    console.log(`[FETCH] ${id} | Subject: ${subject} | From: ${fromHeader}`);

    // ── EXISTING RECORD: enrich or skip ──
    const exists = existingFast ? await Application.findOne({ userId: acc._id, messageId: id }) : null;
    if (exists) {
      // Skip if this messageId was already marked as deleted (and is a normal application)
      if (exists.isDeleted) {
        console.log(`[SKIP] ${id} | Reason: Message already deleted by user`);
        return { action: 'skipped' };
      }
      
      const emailDate = email.data?.internalDate ? new Date(parseInt(email.data.internalDate)) : (exists.date || new Date());
      let eventAdded = false;
      if (!exists.events || !exists.events.some(e => e.messageId === id)) {
        if (!exists.events) exists.events = [];
        exists.events.push({
          messageId: id,
          accountEmail: receivingEmail,
          date: emailDate,
          classification: exists.classification,
          title: exists.title,
          subject: subject,
          status: exists.status,
          link: exists.link
        });
        if (!exists.accountEmail) exists.accountEmail = receivingEmail;
        exists.events.sort((a, b) => new Date(a.date) - new Date(b.date));
        if (!exists.date || emailDate > new Date(exists.date)) {
          exists.date = emailDate;
        }
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
              timelineSummary: cachedApp.parseMeta?.trace?.llm?.timelineSummary || "",
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
              eventDate: cachedApp.eventDate,
              eventTime: cachedApp.eventTime,
              reportingTime: cachedApp.reportingTime,
              jobRole: cachedApp.jobRole,
              testDate: cachedApp.testDate,
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
          // Sleep to safely respect LLM RPM limits
          await new Promise(r => setTimeout(r, config.LLM_DELAY_MS));
          usedLLM = true;
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
              const retryDate = email.data?.internalDate ? new Date(parseInt(email.data.internalDate)) : exists.date;
              exists.events.push({
                messageId: id,
                date: retryDate,
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

              const retryDate = email.data?.internalDate ? new Date(parseInt(email.data.internalDate)) : exists.date;
              const enrichmentPayload = enrichApplicationRecord(exists, parsed, retryDate, {
                subject,
                rawBody: fullBodyText || rawText || ""
              });
              Object.assign(updatePayload, enrichmentPayload);
            }

            if (eventAdded) updatePayload.events = exists.events;

            // Merge attachment metadata (deduplicate by messageId+attachmentId)
            if (emailAttachments.length > 0) {
              const existingAttachments = exists.attachments || [];
              const existingKeys = new Set(existingAttachments.map(a => `${a.messageId}:${a.attachmentId}`));
              const newAttachments = emailAttachments.filter(a => !existingKeys.has(`${a.messageId}:${a.attachmentId}`));
              if (newAttachments.length > 0) {
                updatePayload.attachments = [...existingAttachments, ...newAttachments];
              }
            }

            await Application.findByIdAndUpdate(exists._id, updatePayload, { returnDocument: 'after' });
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
            // Still persist attachment metadata even on deferred reparse
            if (emailAttachments.length > 0) {
              const existingAttachments = exists.attachments || [];
              const existingKeys = new Set(existingAttachments.map(a => `${a.messageId}:${a.attachmentId}`));
              const newAttachments = emailAttachments.filter(a => !existingKeys.has(`${a.messageId}:${a.attachmentId}`));
              if (newAttachments.length > 0) {
                updateObj.attachments = [...existingAttachments, ...newAttachments];
              }
            }
            await Application.findByIdAndUpdate(exists._id, updateObj, { returnDocument: 'after' });
            console.log(`[REPARSE_DEFERRED] ${id} | Transient parser error (attempt ${currentAttempts}). Deferred until ${nextRetry.toISOString()}`)
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
          
          await Application.findByIdAndUpdate(exists._id, updatePayload, { returnDocument: 'after' });
          console.log(`[REPARSE_FAILED] ${id} | Fatal parsing error, locked to ${CURRENT_PARSER_VERSION}`);
        }
      } else if (eventAdded || emailAttachments.length > 0) {
        const patchPayload = {};
        if (eventAdded) patchPayload.events = exists.events;
        // Merge attachment metadata even when only events changed
        if (emailAttachments.length > 0) {
          const existingAttachments = exists.attachments || [];
          const existingKeys = new Set(existingAttachments.map(a => `${a.messageId}:${a.attachmentId}`));
          const newAttachments = emailAttachments.filter(a => !existingKeys.has(`${a.messageId}:${a.attachmentId}`));
          if (newAttachments.length > 0) {
            exists.attachments = [...existingAttachments, ...newAttachments];
            // Evaluate shortlist on newly merged attachments if any are XLSX
            try {
              await evaluateAppXLSXShortlists(exists, acc, gmail);
            } catch (xlsxErr) {
              console.error(`[SHORTLIST_MERGE_ERR] ${id}:`, xlsxErr.message);
            }
            recomputeApplicationShortlistState(exists);
            patchPayload.attachments = exists.attachments;
            patchPayload.isShortlisted = exists.isShortlisted;
            patchPayload.shortlistSummary = exists.shortlistSummary;
          }
        }
        if (Object.keys(patchPayload).length > 0) {
          await Application.findByIdAndUpdate(exists._id, patchPayload, { returnDocument: 'after' });
        }
      }

      console.log(`[SKIP] ${id} | Reason: Already exists in DB`);
      return { action: 'skipped' };
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
          timelineSummary: cachedApp.parseMeta?.trace?.llm?.timelineSummary || "",
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
          eventDate: cachedApp.eventDate,
          eventTime: cachedApp.eventTime,
          reportingTime: cachedApp.reportingTime,
          jobRole: cachedApp.jobRole,
          testDate: cachedApp.testDate,
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
      // Sleep to safely respect LLM RPM limits
      await new Promise(r => setTimeout(r, config.LLM_DELAY_MS));
      usedLLM = true;
      if (parsed && parsed.parseMeta) {
        parsed.parseMeta.internetMessageId = internetMessageId;
      }
      console.log(`[PARSE_RESULT] ${id}`, parsed);
    }

    // Safety check for events/webinars/talks: fallback company if missing
    if (parsed && parsed.isRelevant && !parsed.company && (parsed.emailType === "event" || parsed.opportunityType !== "JOB_APPLICATION")) {
      parsed.company = parsed.domain ? (parsed.domain.charAt(0).toUpperCase() + parsed.domain.slice(1)) : "Campus Event";
      console.log(`[COMPANY_EVENT_FALLBACK] Assigned fallback company "${parsed.company}" for event email ${id}`);
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
            accountEmail: receivingEmail,
            date: new Date(parseInt(email.data.internalDate)),
            parserVersion: "v1",
            status: "pending",
            isDeleted: false,
            parseMeta: {
              shouldRetry: true,
              retryCount: 1,
              lastRetryAt: new Date(),
              nextRetryAt: nextRetry,
              llmProvider: parsed?.parseMeta?.llmProvider || "meta/llama-3.1-70b-instruct",
              llmStatus: parsed?.parseMeta?.llmStatus || "transport_error"
            }
          });
          await pendingApp.save();
        } catch (e) {
          if (e.code !== 11000) {
            console.error(`[PENDING_SAVE_ERROR] ${id}`, e.message);
          }
        }
        return { action: 'skipped', usedLLM };
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
          accountEmail: receivingEmail,
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

      return { action: 'skipped' };
    }

    const finalRole = parsed.role || "Unknown Role";
    const companyKey = normalizeCompany(parsed.company);
    const isValid = isValidCompany(parsed.company);
    
    // Fetch Company Info (with caching inside)
    console.log(`[COMPANY_INFO_CALL] ${parsed.company}`);
    const companyInfo = await getCompanyInfo(parsed.company, parsed.domain);
    if (!companyInfo) {
      console.log(`[COMPANY_INFO_MISSING] ${parsed.company}`);
    } else if (!companyInfo.isEnriched) {
      // Background non-blocking enrichment
      enrichCompanyProfile(parsed.company).catch(err => {
        console.warn(`[COMPANY_ENRICH_BG_WARN] ${parsed.company}:`, err.message);
      });
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
      const emailDate = new Date(parseInt(email.data.internalDate) || Date.now());
      const eventAdded = appendApplicationEvent(contentExists, parsed, {
        messageId: id,
        accountEmail: receivingEmail,
        date: emailDate,
        subject: subject
      });
      if (!contentExists.accountEmail) contentExists.accountEmail = receivingEmail;

      const enrichmentPayload = enrichApplicationRecord(contentExists, parsed, emailDate, {
        subject,
        rawBody: fullBodyText || rawText || ""
      });

      const updatePayload = {
        ...enrichmentPayload
      };

      if (eventAdded) {
        updatePayload.events = contentExists.events;
      }

      // Merge attachment metadata into existing company-match application
      if (emailAttachments.length > 0) {
        const existingAttachments = contentExists.attachments || [];
        const existingKeys = new Set(existingAttachments.map(a => `${a.messageId}:${a.attachmentId}`));
        const newAttachments = emailAttachments.filter(a => !existingKeys.has(`${a.messageId}:${a.attachmentId}`));
        if (newAttachments.length > 0) {
          contentExists.attachments = [...existingAttachments, ...newAttachments];
          try {
            await evaluateAppXLSXShortlists(contentExists, acc, gmail);
          } catch (xlsxErr) {
            console.error(`[SHORTLIST_COMPANY_MATCH_ERR] ${id}:`, xlsxErr.message);
          }
          recomputeApplicationShortlistState(contentExists);
          updatePayload.attachments = contentExists.attachments;
          updatePayload.isShortlisted = contentExists.isShortlisted;
          updatePayload.shortlistSummary = contentExists.shortlistSummary;
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        await Application.findByIdAndUpdate(contentExists._id, updatePayload, { returnDocument: 'after' });
        console.log(`[UPDATED] ${id} | Duplicate company match enriched (${contentExists.company})`);
      }

      console.log(`[SKIP] ${id} | Reason: Duplicate content (company match)`);
      return { action: 'skipped', usedLLM };
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
        accountEmail: receivingEmail,
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
      accountEmail: receivingEmail,
      date: new Date(parseInt(email.data.internalDate)),
      attachments: emailAttachments,
      parserVersion: parserVer,
    });

    // Evaluate XLSX attachments for shortlist matches (Phase 2)
    try {
      await evaluateAppXLSXShortlists(newApp, acc, gmail);
    } catch (shortlistErr) {
      console.error(`[SHORTLIST_INIT_ERR] ${id}:`, shortlistErr.message);
    }

    await newApp.save();
    console.log(`[INSERTED] ${id} | ${parsed.company} | ${finalRole}${newApp.isShortlisted ? " | [SHORTLISTED 🟢]" : ""}`);

    // Send push notification for new email (fire-and-forget)
    try {
      const { sendNewEmailNotification } = require("./utils/pushService");
      await sendNewEmailNotification(acc, newApp);
    } catch (pushErr) {
      console.error(`[PUSH_ERROR] ${id}:`, pushErr.message);
    }

    return { action: 'inserted', usedLLM };
  } catch (error) {
    if (error.code === 11000) {
      console.log(`[SKIP] ${id} | Reason: Duplicate key error (E11000)`);
    } else {
      console.log(`[ERROR] ${id}`, error.message);
    }
    return { action: 'error', usedLLM: false };
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

/**
 * Synchronizes all linked Gmail accounts associated with a parent user Account.
 * Always executed for every parent account, regardless of whether the parent
 * account had 0 or >0 new messages in its primary inbox.
 *
 * @param {Object} acc - The parent Account document
 * @param {Object} context - Shared execution context (llmParsedCount, callbacks)
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
async function syncLinkedAccountsForUser(acc, context = {}) {
  const linkedAccounts = await LinkedGmailAccount.find({ parentAccountId: acc._id });
  if (!linkedAccounts || linkedAccounts.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  console.log(`[LINKED_SYNC_START] Found ${linkedAccounts.length} linked account(s) for user ${acc.email}`);
  let totalLinkedInserted = 0;
  let totalLinkedSkipped = 0;

  for (const linked of linkedAccounts) {
    if (!linked.tokens) {
      console.log(`[LINKED_SYNC] Skipping linked account ${linked.email} — no tokens available`);
      continue;
    }

    const linkedStartTime = Date.now();
    console.log(`[LINKED_SYNC] Checking linked account: ${linked.email} (Parent: ${acc.email})`);

    try {
      await LinkedGmailAccount.findByIdAndUpdate(linked._id, { syncStatus: "pending" });

      const linkedOauth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getLinkRedirectUri()
      );
      linkedOauth.setCredentials(linked.tokens);

      linkedOauth.on("tokens", async (newTokens) => {
        try {
          const updatedTokens = { ...linked.tokens, ...newTokens };
          await LinkedGmailAccount.findByIdAndUpdate(linked._id, { tokens: updatedTokens });
          linked.tokens = updatedTokens;
        } catch (e) {
          console.error(`[LINKED_TOKEN_SAVE_ERR] ${linked.email}:`, e.message);
        }
      });

      const linkedGmail = google.gmail({ version: "v1", auth: linkedOauth });

      let linkedMsgIds = [];
      let linkedNewHistoryId = null;
      let linkedSyncPath = "full";

      if (linked.lastHistoryId) {
        try {
          let pageToken = null;
          let allIds = [];
          let latestHId = null;
          do {
            const hParams = {
              userId: "me",
              startHistoryId: linked.lastHistoryId,
              historyTypes: ["messageAdded"]
            };
            if (pageToken) hParams.pageToken = pageToken;
            const hRes = await linkedGmail.users.history.list(hParams);
            latestHId = hRes.data.historyId;
            if (hRes.data.history) {
              for (const rec of hRes.data.history) {
                if (rec.messagesAdded) {
                  for (const added of rec.messagesAdded) {
                    allIds.push(added.message.id);
                  }
                }
              }
            }
            pageToken = hRes.data.nextPageToken || null;
          } while (pageToken);

          linkedNewHistoryId = latestHId;
          if (allIds.length === 0) {
            await LinkedGmailAccount.findByIdAndUpdate(linked._id, {
              lastHistoryId: linkedNewHistoryId,
              syncMode: "incremental",
              syncStatus: "success",
              syncError: null,
              lastSyncTime: new Date()
            });
            console.log(`[LINKED_SYNC] No new messages for ${linked.email}`);
            console.log(`[LINKED_SYNC_COMPLETE] Completed linked account: ${linked.email} | Duration: ${((Date.now() - linkedStartTime)/1000).toFixed(1)}s | Fetched: 0 | Inserted: 0 | Skipped: 0`);
            continue;
          }

          // Filter by ALLOWED_SENDERS at the Gmail query level (avoids fetching non-placement messages)
          const uniqueNewIds = [...new Set(allIds)];
          const queryStr = `(${ALLOWED_SENDERS.map(s => `from:${s}`).join(" OR ")}) newer_than:30d`;
          const senderFilterRes = await linkedGmail.users.messages.list({
            userId: "me",
            maxResults: 250,
            q: queryStr
          });
          const allowedIdSet = new Set((senderFilterRes.data.messages || []).map(m => m.id));
          linkedMsgIds = uniqueNewIds.filter(id => allowedIdSet.has(id));

          if (linkedMsgIds.length === 0) {
            await LinkedGmailAccount.findByIdAndUpdate(linked._id, {
              lastHistoryId: linkedNewHistoryId,
              syncMode: "incremental",
              syncStatus: "success",
              syncError: null,
              lastSyncTime: new Date()
            });
            console.log(`[LINKED_SYNC] ${uniqueNewIds.length} new message(s) on ${linked.email} (0 matching placement senders)`);
            console.log(`[LINKED_SYNC_COMPLETE] Completed linked account: ${linked.email} | Duration: ${((Date.now() - linkedStartTime)/1000).toFixed(1)}s | Fetched: 0 | Inserted: 0 | Skipped: 0`);
            continue;
          }

          linkedSyncPath = "incremental";
          console.log(`[LINKED_SYNC] Found ${linkedMsgIds.length} placement message(s) to process for ${linked.email} (filtered from ${uniqueNewIds.length} inbox messages)`);
        } catch (hErr) {
          if (hErr.code === 404 || hErr.response?.status === 404) {
            console.log(`[LINKED_SYNC_EXPIRED] historyId expired for ${linked.email}. Full sync fallback.`);
            linked.lastHistoryId = null; // Clear stale historyId so fallback uses first-time sync limits
            linkedSyncPath = "full";
          } else {
            throw hErr;
          }
        }
      }

      if (linkedSyncPath === "full") {
        // Linked accounts: limit first-time full sync to recent emails only
        const linkedMaxResults = linked.lastHistoryId ? 250 : 20;
        const linkedRecency = linked.lastHistoryId ? "90d" : "30d";
        const queryStr = `(${ALLOWED_SENDERS.map(s => `from:${s}`).join(" OR ")}) newer_than:${linkedRecency}`;
        console.log(`[LINKED_FULL_SYNC] ${linked.email} | maxResults: ${linkedMaxResults} | recency: ${linkedRecency}`);
        const listRes = await linkedGmail.users.messages.list({
          userId: "me",
          maxResults: linkedMaxResults,
          q: queryStr
        });
        linkedMsgIds = (listRes.data.messages || []).map(m => m.id);
        if (linkedMsgIds.length === 0) {
          console.log(`[LINKED_SYNC] No messages found for ${linked.email}`);
        } else {
          console.log(`[LINKED_SYNC] Found ${linkedMsgIds.length} message(s) to process for ${linked.email}`);
        }
        try {
          const profRes = await linkedGmail.users.getProfile({ userId: "me" });
          linkedNewHistoryId = profRes.data.historyId;
        } catch (pErr) {}
      }

      const knownDocsLinked = await batchLookupMessageIds(linkedMsgIds, acc._id);
      let lInserted = 0;
      let lSkipped = 0;

      for (const mId of linkedMsgIds) {
        if (activeClearRequests.has(acc._id.toString())) break;
        if (context.llmParsedCount >= config.MAX_EMAILS_PER_SYNC) {
          console.log(`[LINKED_SYNC_PROGRESSIVE] Reached global limit of ${config.MAX_EMAILS_PER_SYNC} LLM parses. Stopping linked sync for ${linked.email}.`);
          break;
        }

        const existingFast = knownDocsLinked.get(mId) || null;
        const res = await processMessage(linkedGmail, acc, mId, null, existingFast, context.llmParsedCount, linked.email);
        if (res.action === "inserted") {
          lInserted++;
          totalLinkedInserted++;
          if (context.onInserted) context.onInserted();
        } else {
          lSkipped++;
          totalLinkedSkipped++;
          if (context.onSkipped) context.onSkipped();
        }
        if (res.usedLLM) {
          context.llmParsedCount = (context.llmParsedCount || 0) + 1;
        }
      }

      const linkedUpdate = {
        syncStatus: "success",
        syncError: null,
        lastSyncTime: new Date()
      };
      if (linkedNewHistoryId) {
        linkedUpdate.lastHistoryId = linkedNewHistoryId;
        linkedUpdate.syncMode = "incremental";
      }
      await LinkedGmailAccount.findByIdAndUpdate(linked._id, linkedUpdate);
      console.log(`[LINKED_SYNC_COMPLETE] Completed linked account: ${linked.email} | Duration: ${((Date.now() - linkedStartTime)/1000).toFixed(1)}s | Fetched: ${linkedMsgIds.length} | Inserted: ${lInserted} | Skipped: ${lSkipped}`);
    } catch (linkedErr) {
      console.error(`[LINKED_SYNC_ERR] ${linked.email}:`, linkedErr.message);
      let errText = linkedErr.message || "Sync failed";
      if (linkedErr.code === 400 || linkedErr.code === 401) {
        errText = "Authentication expired. Please reconnect this account.";
      }
      await LinkedGmailAccount.findByIdAndUpdate(linked._id, {
        syncStatus: "failed",
        syncError: errText
      });
    }
  }

  return { inserted: totalLinkedInserted, skipped: totalLinkedSkipped };
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
          console.log(`[SYNC] Skipping ${acc.email} in cron — manual sync already in progress for this user`);
          accountsSkipped++;
          continue;
        }
        activeSyncs.add(accIdStr);
      }

      const accountStartTime = Date.now();
      let llmParsedCount = 0;

      try {
        console.log(`Processing account: ${acc.email}`);
        console.log(`[SYNC_TOKENS] ${acc.email} | scope: ${acc.tokens?.scope || 'none'} | has_refresh: ${!!acc.tokens?.refresh_token}`);

        if (!acc.tokens) {
          console.log(`Account ${acc.email} has no OAuth tokens — skipping`);
          accountsSkipped++;
          continue;
        }

        await Account.findOneAndUpdate({ email: acc.email }, { syncStatus: "pending" });

        const localOauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        localOauth2Client.setCredentials(acc.tokens);

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
        let isZeroIncremental = false;

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
              isZeroIncremental = true;
              syncPath = "incremental";
              messageIdsToProcess = [];
              console.log(`[ACCOUNT START]\nEmail: ${acc.email}\nMode: Incremental\nHistoryId: ${acc.lastHistoryId}`);
              console.log(`[INCREMENTAL] No new messages for primary account since last sync.`);
              console.log(`[INCREMENTAL_SUMMARY] History events: 0 | New messages: 0 | historyId: ${acc.lastHistoryId} → ${newHistoryId}`);
              
              // Update historyId for primary account
              const syncedAccount = await Account.findOneAndUpdate(
                { email: acc.email },
                { lastHistoryId: newHistoryId, syncMode: "incremental", syncStatus: "success", syncError: null, lastSyncTime: new Date() },
                { returnDocument: 'after' }
              );
              if (syncedAccount) {
                await processCalendarSyncQueue(syncedAccount);
              }

              const accDuration = ((Date.now() - accountStartTime) / 1000).toFixed(1);
              console.log(`[ACCOUNT COMPLETE]\nEmail: ${acc.email}\nDuration: ${accDuration}s\nFetched: 0\nInserted: 0\nSkipped: 0\nMode: Incremental`);
              accountsProcessed++;
            } else {
              // Deduplicate (History API can return the same message in multiple history records)
              messageIdsToProcess = [...new Set(allAddedMessageIds)];
              syncPath = "incremental";
              console.log(`[INCREMENTAL] Found ${messageIdsToProcess.length} new message(s) to process (${allAddedMessageIds.length} history events, ${messageIdsToProcess.length} unique).`);
            }

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
            const queryStr = `(${config.ALLOWED_SENDERS.map(s => `from:${s}`).join(" OR ")}) newer_than:90d`;
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
          try {
            const profileResponse = await gmail.users.getProfile({ userId: "me" });
            newHistoryId = profileResponse.data.historyId;
            console.log(`[FULL_SYNC] Captured historyId from profile: ${newHistoryId}`);
          } catch (profileErr) {
            console.error(`[FULL_SYNC] Failed to get profile historyId: ${profileErr.message}`);
          }

          console.log(`[FULL_SYNC] Messages listed: ${messageIdsToProcess.length} | historyId: ${newHistoryId || 'unavailable'}`);
        }

        let accInserted = 0;
        let accSkipped = 0;

        if (!isZeroIncremental) {
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

          for (const msgId of messageIdsToProcess) {
            // Abort the loop immediately if a Clear All was requested for this account while sync was running
            if (activeClearRequests.has(acc._id.toString())) {
              console.log(`[SYNC_ABORTED] Clear All requested for user ${acc.email} — aborting sync loop`);
              break;
            }

            const existingFast = knownDocs.get(msgId) || null;
            const result = await processMessage(gmail, acc, msgId, null, existingFast, llmParsedCount);

            if (result.action === 'inserted') {
              accInserted++;
              insertedCount++;
            } else {
              accSkipped++;
              skippedCount++;
            }

            if (result.usedLLM) llmParsedCount++;

            if (llmParsedCount >= config.MAX_EMAILS_PER_SYNC) {
              console.log(`[SYNC_PROGRESSIVE] Reached limit of ${config.MAX_EMAILS_PER_SYNC} LLM parses. Stopping sync to preserve quota.`);
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
        }

        // ══════════════════════════════════════════════
        // ALWAYS SYNC LINKED GMAIL ACCOUNTS FOR THIS USER
        // ══════════════════════════════════════════════
        await syncLinkedAccountsForUser(acc, {
          llmParsedCount,
          onInserted: () => { insertedCount++; },
          onSkipped: () => { skippedCount++; }
        });

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
  fetchAndProcessEmails,
  syncLinkedAccountsForUser
};