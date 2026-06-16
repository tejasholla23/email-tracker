require("dotenv").config();
const cron = require("node-cron");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const he = require("he");
const { google } = require("googleapis");

const Application = require("./models/Application");
const Account = require("./models/Account");
const applicationRoutes = require("./routes/applicationRoutes");
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");
const { getCompanyInfo } = require("./utils/companyInfoService");
const { normalizeCompany, isValidCompany } = require("./utils/normalizeCompany");
const { advanceStatus, classificationToStatus } = require("./utils/statusMachine");

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
    return Buffer.from(payload.body.data, "base64")
      .toString("utf-8")
      .replace(/<[^>]*>?/gm, " ");
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
  let text = extractText(payload) || extractHtml(payload) || "";
  
  // Decode HTML entities (e.g., &nbsp; -> " ")
  text = he.decode(text);
  
  // Safety: Truncate extremely long bodies (keep newest content at the end)
  if (text.length > 20000) {
    text = text.slice(-20000);
  }
  
  return text;
}

const app = express();
const PORT = process.env.PORT || 5000;

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

// OAuth Validation
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
  console.error("CRITICAL: Google OAuth environment variables are missing!");
  console.log("Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI");
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.use(cors());
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
app.get("/clear-applications", async (req, res) => {
  try {
    await Application.deleteMany({});
    res.send("All applications deleted");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// DELETE /clear-all-applications — used by the frontend "Clear All" button.
// Sets a flag that aborts any in-progress sync, waits briefly, then wipes the DB.
app.delete("/clear-all-applications", async (req, res) => {
  const email = req.headers["x-user-email"];
  if (email !== "1ms23ci126@msrit.edu") {
    return res.status(401).json({ message: "Unauthorized" });
  }

  console.log("[CLEAR_ALL] Requested — setting clearRequested flag");
  clearRequested = true;

  // Give the sync loop up to 3 s to notice the flag and break out of the current email
  if (isProcessing) {
    console.log("[CLEAR_ALL] Sync in progress — waiting up to 3 s for it to abort...");
    await new Promise((resolve) => {
      const deadline = Date.now() + 3000;
      const poll = setInterval(() => {
        if (!isProcessing || Date.now() >= deadline) {
          clearInterval(poll);
          resolve();
        }
      }, 200);
    });
  }

  try {
    const result = await Application.deleteMany({});
    console.log(`[CLEAR_ALL] Deleted ${result.deletedCount} application(s)`);
    clearRequested = false;
    isProcessing = false; // Reset in case sync was stuck
    res.json({ message: "All applications permanently cleared", deletedCount: result.deletedCount });
  } catch (err) {
    clearRequested = false;
    res.status(500).json({ message: "Failed to clear applications: " + err.message });
  }
});

// ==========================
// 🔐 GOOGLE AUTH
// ==========================
app.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent",
  });

  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    await Account.findOneAndUpdate(
      { email },
      { 
        tokens,
        syncStatus: "idle",
        syncError: ""
      },
      { upsert: true }
    );

    const allowedEmail = "1ms23ci126@msrit.edu";
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (email !== allowedEmail) {
      console.warn(`[AUTH] Denied login attempt from: ${email}`);
      return res.redirect(`${frontendUrl}?error=unauthorized`);
    }

    res.redirect(`${frontendUrl}?auth_success=true&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error("Google Auth Callback Error:", err.message);
    res.status(500).send(`Auth failed: ${err.message}`);
  }
});

// ==========================
// 🚪 LOGOUT
// ==========================
app.get("/logout", async (req, res) => {
  try {
    await Account.deleteMany({});
    res.send("Logged out successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Logout failed");
  }
});

let isProcessing = false;
let clearRequested = false; // Set to true to abort an in-progress sync during Clear All

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
    link: parsed.link || ""
  });
  
  application.events.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`[EVENT_ADDED] ${messageId}`);
  return true;
}

// ==========================
// 📥 FETCH + SAVE EMAILS
// ==========================
async function fetchAndProcessEmails() {
  if (isProcessing) {
    console.log("Cron already running, skipping...");
    return;
  }

  isProcessing = true;
  let insertedCount = 0;
  let skippedCount = 0;
  let fetchedCount = 0;

  try {
    const accounts = await Account.find();

    if (!accounts.length) {
      console.log("No accounts connected");
      return;
    }

    for (let acc of accounts) {
      if (acc.email !== "1ms23ci126@msrit.edu") continue;

      console.log(`Processing account: ${acc.email}`);
      try {
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
        const listController = new AbortController();
        const listTimeoutId = setTimeout(() => listController.abort(), 15000);
        let response;
        try {
          response = await gmail.users.messages.list({
            userId: "me",
            maxResults: 250,
            q: "(from:placement@msrit.edu OR from:dean.tap@msrit.edu) newer_than:90d",
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
        fetchedCount += messages.length;
        console.log(`\n--- STARTING SYNC FOR ${acc.email} ---`);

        for (let msg of messages) {
          // Abort the loop immediately if a Clear All was requested while sync was running
          if (clearRequested) {
            console.log("[SYNC_ABORTED] Clear All requested — aborting sync loop");
            break;
          }
          const id = msg.id;
          try {
            // FAST PATH: Skip fetching the heavy email body from Google if it's already processed in the DB
            const existingFast = await Application.findOne({ 
              $or: [{ messageId: id }, { "events.messageId": id }] 
            }, { parserVersion: 1, isDeleted: 1 });
            
            if (existingFast && existingFast.parserVersion === "v2") {
              if (existingFast.isDeleted) {
                console.log(`[SKIP_FAST] ${id} | Reason: Message already deleted by user`);
              } else {
                console.log(`[SKIP_FAST] ${id} | Reason: Already exists and fully parsed (v2)`);
              }
              skippedCount++;
              continue;
            }

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
            const snippet = email.data.snippet || "";
            const rawText = `${subject} ${snippet}`.trim();
            
            const fullBodyText = getFullBodyText(email.data.payload);
            console.log(`[BODY_FETCHED] ${id} length: ${fullBodyText.length}`);
            
            console.log(`[FETCH] ${id} | Subject: ${subject} | From: ${fromHeader}`);

            const exists = await Application.findOne({ messageId: id });
            if (exists) {
              // Skip if this messageId was already marked as deleted
              if (exists.isDeleted) {
                console.log(`[SKIP] ${id} | Reason: Message already deleted by user`);
                skippedCount++;
                continue;
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

              const missingDetails = exists.parserVersion !== "v2";
              if (missingDetails) {
                console.log(`[REPARSE] ${id} | Existing message needs enrichment`);
                const parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, new Date(parseInt(email.data.internalDate)));
                // NEW: Sleep for 6.5s to safely respect Gemini 15 RPM free tier limit
                await new Promise(r => setTimeout(r, 6500));
                if (parsed && parsed.isRelevant) {
                  const updatePayload = {};
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

                  updatePayload.parserVersion = "v2";

                  if (eventAdded) updatePayload.events = exists.events;

                  if (Object.keys(updatePayload).length > 0) {
                    await Application.findByIdAndUpdate(exists._id, updatePayload, { new: true });
                    console.log(`[UPDATED] ${id} | Existing application enriched with program data`);
                  }
                }
              } else if (eventAdded) {
                await Application.findByIdAndUpdate(exists._id, { events: exists.events }, { new: true });
              }

              console.log(`[SKIP] ${id} | Reason: Already exists in DB`);
              skippedCount++;
              continue;
            }

            console.log(`[PARSE_START] ${id}`);
            const parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, new Date(parseInt(email.data.internalDate)));
            // NEW: Sleep for 6.5s to safely respect Gemini 15 RPM free tier limit
            await new Promise(r => setTimeout(r, 6500));
            console.log(`[PARSE_RESULT] ${id}`, parsed);
            
            if (!parsed || !parsed.isRelevant || !parsed.company) {
              const reason = !parsed ? "Parsing failed" : (!parsed.isRelevant ? "Marked not relevant" : "Missing company");
              console.log(`[SKIP] ${id} | Reason: ${reason}. Saving as ignored to prevent re-parsing.`);
              
              try {
                const ignoredApp = new Application({
                  company: "IGNORED",
                  role: "IGNORED",
                  messageId: id,
                  source: "Gmail",
                  email: acc.email,
                  date: new Date(parseInt(email.data.internalDate)),
                  parserVersion: "v2",
                  isDeleted: true
                });
                await ignoredApp.save();
              } catch (e) {
                if (e.code !== 11000) {
                  console.error(`[IGNORE_SAVE_ERROR] ${id}`, e.message);
                }
              }

              skippedCount++;
              continue;
            }

            const finalRole = parsed.role || "Unknown Role";
            const companyKey = normalizeCompany(parsed.company);
            const isValid = isValidCompany(parsed.company);
            
            // Fetch Company Info (with caching inside)
            console.log(`[COMPANY_INFO_CALL] ${parsed.company}`);
            const companyInfo = await getCompanyInfo(parsed.company);
            if (!companyInfo) {
              console.log(`[COMPANY_INFO_MISSING] ${parsed.company}`);
            }

            let contentExists = null;
            if (isValid) {
              contentExists = await Application.findOne({
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

              if (!ov.includes("status")) {
                const incStatus = classificationToStatus(parsed.classification);
                const advancedStatus = advanceStatus(contentExists.status, incStatus);
                if (advancedStatus !== contentExists.status) {
                  updatePayload.status = advancedStatus;
                }
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
              skippedCount++;
              continue;
            }

            const incStatus = classificationToStatus(parsed.classification);
            const normalizedStatus = advanceStatus("new", incStatus);

            const newApp = new Application({
              company: parsed.company,
              companyKey,
              emailType: parsed.emailType || "job",
              subtitle: parsed.subtitle || "",
              displayFields: parsed.displayFields || [],
              fieldsToDisplay: parsed.fieldsToDisplay || [],
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
                title: parsed.title || "",
                subject: subject || "",
                status: normalizedStatus,
                link: parsed.link || ""
              }],
              rawText,
              messageId: id,
              source: "Gmail",
              email: acc.email,
              date: new Date(parseInt(email.data.internalDate)),
              parserVersion: "v2",
            });

            await newApp.save();
            insertedCount++;
            console.log(`[INSERTED] ${id} | ${parsed.company} | ${finalRole}`);
          } catch (error) {
            if (error.code === 11000) {
              console.log(`[SKIP] ${id} | Reason: Duplicate key error (E11000)`);
            } else {
              console.log(`[ERROR] ${id}`, error.message);
            }
            skippedCount++;
          }
        }

        // Successfully updated this account
        await Account.findOneAndUpdate(
          { email: acc.email },
          { syncStatus: "success", syncError: null, lastSyncTime: new Date() }
        );
      } catch (err) {
        console.error(`Fetch error for account ${acc.email}:`, err.message);
        let errorMsg = err.message || "Unknown sync error";
        if (
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
      }
    }
    console.log(`\nSUMMARY: Fetched ${fetchedCount} | Inserted ${insertedCount} | Skipped ${skippedCount}`);
  } catch (err) {
    console.error("Fetch error:", err.message);
    // Removed 'throw err' to prevent unhandled rejections in background execution
  } finally {
    isProcessing = false;
  }
}

// ==========================
// 🔘 MANUAL TRIGGER (SYNC BUTTON)
// ==========================
app.get("/sync", (req, res) => {
  if (isProcessing) {
    return res.status(200).send("Sync already in progress");
  }

  fetchAndProcessEmails()
    .then(() => console.log("Manual sync completed"))
    .catch((err) => console.error("Manual sync failed:", err.message));

  res.send("Sync triggered in background");
});

// ==========================
// 🧪 MANUAL CRON TRIGGER
// ==========================
app.get("/run-cron", (req, res) => {
  if (isProcessing) {
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});