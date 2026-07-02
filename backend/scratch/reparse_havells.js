"use strict";
require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const { google } = require("googleapis");
const Application = require("../models/Application");
const Account = require("../models/Account");
const { parseEmailWithLLM } = require("../utils/parseEmailWithLLM");

// Helper to extract full body text from Gmail payload
function getFullBodyText(payload) {
  let body = "";
  if (payload.body && payload.body.data) {
    body += Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      body += getFullBodyText(part);
    }
  }
  return body;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  // Find Havells application first
  const app = await Application.findOne({ company: "Havells" });
  if (!app) {
    console.error("Havells application not found.");
    process.exit(1);
  }

  // Get the matching account that owns it
  const account = await Account.findById(app.userId);
  if (!account) {
    console.error("Owner account for Havells application not found.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(account.tokens);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  console.log(`Found Havells application with ID: ${app._id}. Events count: ${app.events.length}`);

  for (let i = 0; i < app.events.length; i++) {
    const event = app.events[i];
    console.log(`\nProcessing event ${i + 1}/${app.events.length} (ID: ${event.messageId})...`);

    try {
      const email = await gmail.users.messages.get({
        userId: "me",
        id: event.messageId,
        format: "full"
      });

      const headers = email.data.payload.headers;
      const fromHeader = headers.find(h => h.name === "From")?.value || "";
      const subject = headers.find(h => h.name === "Subject")?.value || "";
      const snippet = email.data.snippet || "";
      const rawText = `${subject} ${snippet}`.trim();
      const fullBodyText = getFullBodyText(email.data.payload);

      console.log(`Fetched email from Gmail. Subject: "${subject}". Parsing with Gemini...`);

      const parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, new Date(parseInt(email.data.internalDate)));
      
      if (parsed) {
        console.log("Gemini parsed results:");
        console.log(`  classification: ${parsed.classification}`);
        console.log(`  timelineTitle: ${parsed.timelineTitle}`);
        console.log(`  timelineSummary: ${parsed.timelineSummary}`);

        // Update the event fields in the application
        app.events[i].classification = parsed.classification || "";
        app.events[i].title = parsed.timelineTitle || parsed.title || app.events[i].title || "";
        app.events[i].summary = parsed.timelineSummary || parsed.summary || "";
        app.events[i].link = parsed.link || app.events[i].link || "";
      } else {
        console.warn("Failed to parse email with Gemini.");
      }

      // Respect API rate limits
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Error processing message ${event.messageId}:`, err.message);
    }
  }

  // Mark events array as modified and save
  app.markModified("events");
  app.parserVersion = "v3";
  await app.save();
  console.log("\nHavells application updated successfully in database!");

  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
