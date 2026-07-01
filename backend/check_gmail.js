require("dotenv").config();
const mongoose = require("mongoose");
const { google } = require("googleapis");

const AccountSchema = new mongoose.Schema({}, { strict: false });
const Account = mongoose.model("Account", AccountSchema, "accounts");

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const acc = await Account.findOne({ email: '1ms23ci126@msrit.edu' });
  if (!acc) {
    console.error("Account not found.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(acc.tokens);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // List messages from dean.tap@msrit.edu
  console.log("Querying Gmail API for messages from dean.tap@msrit.edu...");
  try {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "from:dean.tap@msrit.edu",
    });

    const messages = listRes.data.messages || [];
    console.log(`Found ${messages.length} messages in Gmail.`);

    for (const msg of messages) {
      const email = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = email.data.payload.headers;
      const fromHeader = headers.find((h) => h.name === "From")?.value || "";
      const toHeader = headers.find((h) => h.name === "To")?.value || "";
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const date = headers.find((h) => h.name === "Date")?.value || "";

      console.log(`\n- Message ID: ${msg.id}`);
      console.log(`  From: ${fromHeader}`);
      console.log(`  To: ${toHeader}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Date: ${date}`);
      console.log(`  Snippet: ${email.data.snippet}`);
    }
  } catch (err) {
    console.error("Gmail query failed:", err.message);
  }

  await mongoose.connection.close();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
