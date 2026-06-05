require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");
const Account = require("./models/Account");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

async function run() {
  try {
    console.log("Connecting to MongoDB:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("Connected successfully.");

    const accounts = await Account.find();
    console.log("Connected Accounts:");
    console.log(JSON.stringify(accounts, null, 2));

    const totalApps = await Application.countDocuments();
    console.log("Total Applications:", totalApps);

    const recentApps = await Application.find().sort({ date: -1 }).limit(15);
    console.log("Recent Applications:");
    recentApps.forEach(app => {
      console.log(`- ${app.company} | ${app.role} | Status: ${app.status} | Date: ${app.date} | MsgID: ${app.messageId}`);
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
