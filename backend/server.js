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
const PORT = 5000;

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

// OAuth
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
    console.error(err);
    res.status(500).send("Auth failed");
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

// ==========================
// 📥 FETCH + SAVE EMAILS
// ==========================
async function fetchAndProcessEmails() {
  try {
    const accounts = await Account.find();

    if (!accounts.length) {
      console.log("No accounts connected");
      return;
    }

    for (let acc of accounts) {
      console.log("Processing account:", acc.email);
      oauth2Client.setCredentials(acc.tokens);

      const gmail = google.gmail({
        version: "v1",
        auth: oauth2Client,
      });

      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5,
        q: "from:placement@msrit.edu OR from:dean.tap@msrit.edu newer_than:7d",
      });

      const messages = response.data.messages || [];

      for (let msg of messages) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
        });

        const emailDate = new Date(parseInt(email.data.internalDate));

        const headers = email.data.payload.headers;

        const fromHeader = headers.find((h) => h.name === "From")?.value || "";
        if (
          !fromHeader.includes("placement@msrit.edu") &&
          !fromHeader.includes("dean.tap@msrit.edu")
        ) {
          continue; // skip irrelevant sender
        }

        const subject =
          headers.find((h) => h.name === "Subject")?.value || "";

        const snippet = email.data.snippet || "";
        const rawText = `${subject} ${snippet}`.trim();

        // ❌ skip duplicates
        const exists = await Application.findOne({ rawText });
        if (exists) continue;

        const parsed = await parseEmailWithLLM(rawText, fromHeader);

        // ✅ ONLY save real relevant emails
        if (!parsed || parsed.isRelevant !== true) continue;

        // ❌ DO NOT allow empty/fake data
        if (!parsed.company || !parsed.role) continue;

        const newApp = new Application({
          company: parsed.company,
          role: parsed.role,
          type: parsed.type || "",
          status: parsed.status || "pending",
          link: parsed.link || "",
          rawText,
          source: "Gmail",
          email: acc.email,
          date: emailDate,
        });

        await newApp.save();
        console.log("Saved:", parsed.company);
      }
    }
  } catch (err) {
    console.error("Fetch error:", err.message);
    throw err;
  }
}

// ==========================
// 🔘 MANUAL TRIGGER (SYNC BUTTON)
// ==========================
app.get("/sync", async (req, res) => {
  await fetchAndProcessEmails();
  res.send("Emails synced");
});

// ==========================
// 🧪 MANUAL CRON TRIGGER
// ==========================
app.get("/run-cron", async (req, res) => {
  try {
    await fetchAndProcessEmails();

    res.status(200).json({
      success: true,
      message: "Cron executed successfully"
    });
  } catch (err) {
    console.error("Cron failed:", err);

    res.status(500).json({
      success: false,
      message: "Cron failed",
      error: err.message
    });
  }
});

// ==========================
// ⏱ CRON (AUTO SYNC)
// ==========================
cron.schedule("0 */2 * * *", async () => {
  console.log("Auto syncing emails...");
  await fetchAndProcessEmails();
});

// ==========================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});