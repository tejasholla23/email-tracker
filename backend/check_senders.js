require("dotenv").config();
const { google } = require("googleapis");
const mongoose = require("mongoose");
const Account = require("./models/Account");

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

  // Query general placement/career/job/internship emails in last 30 days
  const query = "newer_than:30d (placement OR msrit OR job OR internship OR career OR drive OR tcs OR dentsu OR amazon)";
  console.log("Querying Gmail with general query:", query);
  
  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 150,
      q: query,
    });
    
    const messages = response.data.messages || [];
    console.log(`Found ${messages.length} messages in Gmail matching the keyword search.`);
    
    const senders = new Set();
    const messageDetails = [];

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
      
      senders.add(fromHeader);
      messageDetails.push({ id: msg.id, date, from: fromHeader, subject });
    }

    console.log("\nUnique Senders found:");
    Array.from(senders).forEach(s => console.log(`- ${s}`));

    console.log("\nSample Messages:");
    messageDetails.slice(0, 30).forEach(m => {
      console.log(`- Date: ${m.date} | From: ${m.from} | Subject: ${m.subject}`);
    });

  } catch (error) {
    console.error("Error fetching messages:", error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
