require("dotenv").config();
const mongoose = require("mongoose");
const Account = require("./models/Account");
const Application = require("./models/Application");
const CompanyInfo = require("./models/CompanyInfo");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

async function audit() {
  console.log("Connecting to MongoDB:", MONGO_URI.replace(/\/\/.*@/, "//<redacted>@"));
  await mongoose.connect(MONGO_URI);
  console.log("Connected.\n");

  // 1. Duplicate Account.email
  console.log("=== 1. Duplicate Account.email ===");
  const dupEmails = await Account.aggregate([
    { $group: { _id: "$email", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  if (dupEmails.length === 0) {
    console.log("PASS: No duplicate Account.email values found.");
  } else {
    console.log(`FAIL: ${dupEmails.length} duplicate email group(s) found:`);
    dupEmails.forEach(d => console.log(`  email="${d._id}" count=${d.count} ids=${d.ids}`));
  }

  // 2. Duplicate CompanyInfo.name
  console.log("\n=== 2. Duplicate CompanyInfo.name ===");
  const dupNames = await CompanyInfo.aggregate([
    { $group: { _id: "$name", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  if (dupNames.length === 0) {
    console.log("PASS: No duplicate CompanyInfo.name values found.");
  } else {
    console.log(`FAIL: ${dupNames.length} duplicate name group(s) found:`);
    dupNames.forEach(d => console.log(`  name="${d._id}" count=${d.count} ids=${d.ids}`));
  }

  // 3. Duplicate Application.messageId
  console.log("\n=== 3. Duplicate Application.messageId ===");
  const dupMsgIds = await Application.aggregate([
    { $match: { messageId: { $ne: null } } },
    { $group: { _id: "$messageId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  if (dupMsgIds.length === 0) {
    console.log("PASS: No duplicate Application.messageId values found.");
  } else {
    console.log(`FAIL: ${dupMsgIds.length} duplicate messageId group(s) found:`);
    dupMsgIds.forEach(d => console.log(`  messageId="${d._id}" count=${d.count}`));
  }

  // 4. Duplicate Application { company, role }
  console.log("\n=== 4. Duplicate Application { company, role } ===");
  const dupCompRole = await Application.aggregate([
    { $group: { _id: { company: "$company", role: "$role" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]);
  if (dupCompRole.length === 0) {
    console.log("PASS: No duplicate { company, role } pairs found.");
  } else {
    console.log(`WARNING: ${dupCompRole.length} duplicate { company, role } group(s) found:`);
    dupCompRole.forEach(d => console.log(`  company="${d._id.company}" role="${d._id.role}" count=${d.count}`));
  }

  // Summary stats
  console.log("\n=== Collection Counts ===");
  console.log(`Accounts: ${await Account.countDocuments()}`);
  console.log(`Applications: ${await Application.countDocuments()}`);
  console.log(`CompanyInfos: ${await CompanyInfo.countDocuments()}`);

  // Existing indexes
  console.log("\n=== Existing Indexes ===");
  const accIdx = await Account.collection.indexes();
  console.log("Account indexes:", JSON.stringify(accIdx, null, 2));
  const appIdx = await Application.collection.indexes();
  console.log("Application indexes:", JSON.stringify(appIdx, null, 2));
  const ciIdx = await CompanyInfo.collection.indexes();
  console.log("CompanyInfo indexes:", JSON.stringify(ciIdx, null, 2));

  await mongoose.disconnect();
  console.log("\nAudit complete.");
}

audit().catch(err => {
  console.error("Audit failed:", err);
  process.exit(1);
});
