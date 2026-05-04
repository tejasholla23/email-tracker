const mongoose = require("mongoose");
const { google } = require("googleapis");
require("dotenv").config({ path: "./.env" });
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

const AccountSchema = new mongoose.Schema({ email: String, tokens: Object }, { strict: false });
const Account = mongoose.models.Account || mongoose.model("Account", AccountSchema);

const AppSchema = new mongoose.Schema({}, { strict: false });
const Application = mongoose.models.Application || mongoose.model("Application", AppSchema);

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  // Check if StoneX exists in DB
  const apps = await Application.find();
  const stonexApp = apps.find(a => JSON.stringify(a).toLowerCase().includes("stonex"));
  console.log("StoneX in DB?:", stonexApp ? "Yes" : "No");

  const accounts = await Account.find();
  console.log(`Found ${accounts.length} accounts.`);
  
  if (!accounts.length) {
    console.log("No accounts found.");
    process.exit(0);
  }

  const acc = accounts.find(a => a.email === "1ms23ci126@msrit.edu");
  if (!acc) {
      console.log("Target account not found");
      process.exit(0);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(acc.tokens);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Let's run the exact query first
  const response1 = await gmail.users.messages.list({
    userId: "me",
    maxResults: 5,
    q: "(to:1ms23ci126@msrit.edu) AND (from:placement@msrit.edu OR from:dean.tap@msrit.edu) newer_than:7d",
  });
  
  console.log(`Original query returned ${response1.data.messages?.length || 0} messages.`);

  // Let's search broadly for StoneX
  const response2 = await gmail.users.messages.list({
    userId: "me",
    maxResults: 20,
    q: "StoneX",
  });

  const messages = response2.data.messages || [];
  console.log(`Broad 'StoneX' query returned ${messages.length} messages.`);

  for (let msg of messages) {
    const email = await gmail.users.messages.get({ userId: "me", id: msg.id });
    const headers = email.data.payload.headers;
    const fromHeader = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const snippet = email.data.snippet || "";
    const rawText = `${subject} ${snippet}`.trim();
    
    console.log(`\nEmail ID: ${msg.id}`);
    console.log(`From: ${fromHeader}`);
    console.log(`Subject: ${subject}`);
    
    // Check if it would pass the filter in server.js
    const toHeader = headers.find((h) => h.name === "To")?.value || "";
    const isTargetTo = toHeader.includes("1ms23ci126@msrit.edu");
    const isTargetFrom = fromHeader.includes("placement@msrit.edu") || fromHeader.includes("dean.tap@msrit.edu");
    console.log(`To Header: ${toHeader}`);
    console.log(`Passes server.js filter? To: ${!!isTargetTo}, From: ${isTargetFrom}`);

    // Parse it with LLM
    console.log("Parsing with LLM...");
    const parsed = await parseEmailWithLLM(rawText, fromHeader);
    console.log("LLM Output:", parsed);
    
    if (!parsed || !parsed.isRelevant || !parsed.company || !parsed.role) {
        console.log("=> WOULD BE FILTERED OUT AT PARSING STAGE");
    } else {
        console.log("=> WOULD BE INSERTED");
    }
  }

  process.exit(0);
}

run().catch(console.error);
