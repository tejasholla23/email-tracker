require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const apps = await Application.find({ company: { $in: ["Mandatory", "Invitation", "Eligibility Criteria", "Design", "SEP Roadshow"] } }).lean();
  for (const app of apps) {
    console.log(`\n======================================================`);
    console.log(`Company: ${app.company}`);
    console.log(`Subject: ${app.events[0]?.subject || 'N/A'}`);
    console.log(`Raw Text snippet: ${app.rawText?.substring(0, 500)}`);
  }
  
  await mongoose.disconnect();
}
run();
