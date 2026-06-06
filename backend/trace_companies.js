require("dotenv").config();
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");
const Application = require("./models/Application");
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const apps = await Application.find({ company: { $in: ["Mandatory", "Invitation", "Eligibility Criteria", "Design", "SEP Roadshow"] } }).lean();
  
  for (const app of apps) {
    console.log(`\n======================================================`);
    console.log(`Testing: ${app.company}`);
    const res = await parseEmailWithLLM(app.events[0]?.subject || "", app.email, app.rawText || "", new Date());
    console.log(`Meta:`, res.parseMeta);
  }
  await mongoose.disconnect();
}
run();
