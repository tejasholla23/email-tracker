require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Account = require("../models/Account");
const Application = require("../models/Application");

async function migrate() {
  let exitCode = 0;
  try {
    const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB successfully.");

    // 1. Find all accounts
    const accounts = await Account.find({});
    
    if (accounts.length === 0) {
      console.error("Error: No accounts found in the database. Cannot perform migration.");
      exitCode = 1;
      return;
    }
    
    if (accounts.length > 1) {
      console.error(`Error: Found ${accounts.length} accounts. Migration expects exactly ONE account. Cannot perform migration.`);
      exitCode = 1;
      return;
    }

    const targetAccount = accounts[0];
    const accountId = targetAccount._id;
    const accountEmail = targetAccount.email;

    console.log(`Found single account: ${accountEmail} (${accountId})`);

    // 2. Count documents before update
    const totalCount = await Application.countDocuments({});
    
    // Find documents missing userId. We target: { $or: [{ userId: { $exists: false } }, { userId: null }] }
    const queryMissing = {
      $or: [
        { userId: { $exists: false } },
        { userId: null }
      ]
    };
    
    const missingCount = await Application.countDocuments(queryMissing);
    
    console.log(`Total applications in database: ${totalCount}`);
    console.log(`Applications missing userId: ${missingCount}`);

    let updatedCount = 0;
    if (missingCount > 0) {
      console.log(`Updating ${missingCount} application documents with userId = ${accountId}...`);
      const updateResult = await Application.updateMany(
        queryMissing,
        { $set: { userId: accountId } }
      );
      updatedCount = updateResult.modifiedCount;
      console.log("Update completed.");
    } else {
      console.log("No applications are missing userId. Nothing to update.");
    }

    // 3. Re-check counts for reporting
    const finalMissingCount = await Application.countDocuments(queryMissing);
    
    console.log("\n--- Migration Summary ---");
    console.log(`Account Email:                     ${accountEmail}`);
    console.log(`Account ID:                        ${accountId}`);
    console.log(`Number of Applications updated:    ${updatedCount}`);
    console.log(`Total Application count:           ${totalCount}`);
    console.log(`Remaining documents without userId: ${finalMissingCount}`);
    console.log("-------------------------\n");

    exitCode = 0;
  } catch (error) {
    console.error("Migration encountered an error:", error);
    exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log("MongoDB connection closed.");
    }
    process.exit(exitCode);
  }
}

migrate();
