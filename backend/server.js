require("dotenv").config();
const cron = require("node-cron");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { google } = require("googleapis");

const Application = require("./models/Application");
const Account = require("./models/Account");
const applicationRoutes = require("./routes/applicationRoutes");
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");

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
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("Mongo error:", err.message));

// ==========================
// 🟢 HEALTH
// ==========================
app.get("/", (req, res) => {
  res.send("API running");
});

// ==========================
// 🧹 CLEAR DATABASE (IMPORTANT)
// ==========================
app.get("/clear-applications", async (req, res) => {
  try {
    await Application.deleteMany({});
    res.send("All applications deleted");
  } catch (err) {
    res.status(500).send(err.message);
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
      { tokens },
      { upsert: true }
    );

    res.send("Gmail connected successfully");
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
      oauth2Client.setCredentials(acc.tokens);

      const gmail = google.gmail({
        version: "v1",
        auth: oauth2Client,
      });

      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 50,
        q: "(from:placement@msrit.edu OR from:dean.tap@msrit.edu) newer_than:7d",
      });

      const messages = response.data.messages || [];
      fetchedCount += messages.length;
      console.log(`\n--- STARTING SYNC FOR ${acc.email} ---`);

      for (let msg of messages) {
        const id = msg.id;
        try {
          const email = await gmail.users.messages.get({
            userId: "me",
            id: id,
          });

          const headers = email.data.payload.headers;
          const fromHeader = headers.find((h) => h.name === "From")?.value || "";
          const subject = headers.find((h) => h.name === "Subject")?.value || "";
          const snippet = email.data.snippet || "";
          const rawText = `${subject} ${snippet}`.trim();
          
          console.log(`[FETCH] ${id} | Subject: ${subject} | From: ${fromHeader}`);

          const exists = await Application.findOne({ messageId: id });
          if (exists) {
            console.log(`[SKIP] ${id} | Reason: Already exists in DB`);
            skippedCount++;
            continue;
          }

          console.log(`[PARSE_START] ${id}`);
          const parsed = await parseEmailWithLLM(rawText, fromHeader);
          console.log(`[PARSE_RESULT] ${id}`, parsed);
          
          if (!parsed) {
            console.log(`[SKIP] ${id} | Reason: Parsing failed`);
            skippedCount++;
            continue;
          }
          if (!parsed.isRelevant) {
            console.log(`[SKIP] ${id} | Reason: Marked not relevant`);
            skippedCount++;
            continue;
          }
          if (!parsed.company) {
            console.log(`[SKIP] ${id} | Reason: Missing company`);
            skippedCount++;
            continue;
          }

          const finalRole = parsed.role || "Unknown Role";

          const contentExists = await Application.findOne({
            company: parsed.company,
            role: finalRole
          });

          if (contentExists) {
            console.log(`[SKIP] ${id} | Reason: Duplicate content (company + role match)`);
            skippedCount++;
            continue;
          }

          const newApp = new Application({
            company: parsed.company,
            role: finalRole,
            type: parsed.type || "",
            status: parsed.status || "pending",
            link: parsed.link || "",
            rawText,
            messageId: id,
            source: "Gmail",
            email: acc.email,
            date: new Date(parseInt(email.data.internalDate)),
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