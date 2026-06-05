require("dotenv").config();
const { google } = require("googleapis");
const mongoose = require("mongoose");
const Account = require("./models/Account");
const Application = require("./models/Application");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const accounts = await Account.find({ email: "1ms23ci126@msrit.edu" });
  if (!accounts.length) {
    console.log("No account found");
    return;
  }
  const acc = accounts[0];
  oauth2Client.setCredentials(acc.tokens);
  
  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const query = "(from:placement@msrit.edu OR from:dean.tap@msrit.edu) newer_than:30d";
  console.log("Querying Gmail with query:", query);
  
  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 100,
      q: query,
    });
    
    const messages = response.data.messages || [];
    console.log(`Found ${messages.length} messages in Gmail.`);
    
    for (let msg of messages) {
      const email = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = email.data.payload.headers;
      const fromHeader = headers.find(h => h.name === "From")?.value || "";
      const subject = headers.find(h => h.name === "Subject")?.value || "";
      const date = headers.find(h => h.name === "Date")?.value || "";
      console.log(`- ID: ${msg.id} | Date: ${date} | From: ${fromHeader} | Subject: ${subject}`);
    }
  } catch (error) {
    console.error("Error fetching messages:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
