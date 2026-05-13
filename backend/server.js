require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { google } = require("googleapis");

const applicationRoutes = require("./routes/applicationRoutes");
const authRoutes = require("./routes/authRoutes");
const { fetchAndProcessEmails, getIsProcessing } = require("./utils/gmailService");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

// OAuth Client Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/applications", applicationRoutes);
app.use("/auth", authRoutes(oauth2Client));

// Legacy redirect for /logout (some clients might still hit this)
app.get("/logout", (req, res) => res.redirect("/auth/logout"));

// Health Check
app.get("/", (req, res) => res.json({ status: "ok", message: "Email Tracker API Running" }));

// ==========================
// 📥 SYNC ENDPOINTS
// ==========================

// Manual Sync (Button)
app.get("/sync", (req, res) => {
  if (getIsProcessing()) {
    return res.status(200).send("Sync already in progress");
  }
  fetchAndProcessEmails(oauth2Client)
    .then(() => console.log("Manual sync completed"))
    .catch((err) => console.error("Manual sync failed:", err.message));

  res.send("Sync triggered in background");
});

// Automated Cron Trigger (cron-job.org)
app.get("/run-cron", (req, res) => {
  if (getIsProcessing()) {
    return res.status(200).json({ success: true, message: "Sync already in progress" });
  }
  fetchAndProcessEmails(oauth2Client)
    .then(() => console.log("Background sync completed"))
    .catch((err) => console.error("Background sync failed:", err.message));

  res.status(200).json({ success: true, message: "Sync triggered" });
});

// ==========================
// 🟢 INITIALIZATION
// ==========================
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Critical: MongoDB connection failed:", err.message);
    process.exit(1);
  });

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.message);
  res.status(500).json({ success: false, error: "Internal Server Error" });
});