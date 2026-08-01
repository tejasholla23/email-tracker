require("dotenv").config();
const mongoose = require("mongoose");
const Account = require("./models/Account");
const { migrateAccountCalendar } = require("./utils/calendarService");

async function runMigration() {
  console.log("[MIGRATION] Starting Calendar Migration...");
  
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/email-tracker");
    console.log("[MIGRATION] Connected to Database.");
  } catch (err) {
    console.error("[MIGRATION] Database connection failed:", err.message);
    process.exit(1);
  }

  try {
    const accounts = await Account.find({ calendarSyncEnabled: true });
    console.log(`[MIGRATION] Found ${accounts.length} eligible account(s) for calendar migration.`);

    let successCount = 0;
    let failCount = 0;

    for (const account of accounts) {
      console.log(`\n[MIGRATION] Processing account: ${account.email} (${account._id})`);
      try {
        await migrateAccountCalendar(account);
        console.log(`[MIGRATION] Finished processing ${account.email}`);
        successCount++;
      } catch (err) {
        console.error(`[MIGRATION] Error migrating account ${account.email}:`, err.message);
        failCount++;
      }
    }

    console.log("\n[MIGRATION] Migration Complete!");
    console.log(`[MIGRATION] Summary: ${successCount} processed, ${failCount} failed.`);

  } catch (err) {
    console.error("[MIGRATION] Fatal error during migration process:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("[MIGRATION] Disconnected from Database.");
    process.exit(0);
  }
}

if (require.main === module) {
  runMigration();
}
