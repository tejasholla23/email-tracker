const express = require("express");
const { google } = require("googleapis");
const Account = require("../models/Account");
const router = express.Router();

module.exports = (oauth2Client) => {
  // Login
  router.get("/google", (req, res) => {
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

  // Callback
  router.get("/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email;

      await Account.findOneAndUpdate({ email }, { tokens }, { upsert: true });

      const allowedEmail = "1ms23ci126@msrit.edu";
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

      if (email !== allowedEmail) {
        return res.redirect(`${frontendUrl}?error=unauthorized`);
      }

      res.redirect(`${frontendUrl}?auth_success=true&email=${encodeURIComponent(email)}`);
    } catch (err) {
      res.status(500).send(`Auth failed: ${err.message}`);
    }
  });

  // Logout
  router.get("/logout", async (req, res) => {
    try {
      await Account.deleteMany({});
      res.send("Logged out successfully");
    } catch (err) {
      res.status(500).send("Logout failed");
    }
  });

  return router;
};
