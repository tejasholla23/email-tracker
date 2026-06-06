require("dotenv").config();
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");
const Application = require("./models/Application");
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const testCompanies = [
    "Amazon", "TCS", "JPMorgan Chase", "Khelbook", 
    "Mandatory", "Invitation", "Eligibility Criteria", "Design", "SEP Roadshow"
  ];
  
  // Note: we'll match by regex to catch "JPMorgan Chase" and "JPMorganChase", "Khelbook", etc.
  const apps = await Application.find({ 
    $or: [
      { companyKey: { $in: ["amazon", "tcs", "jpmorganchase", "khelbook"] } },
      { company: { $in: ["Mandatory", "Invitation", "Eligibility Criteria", "Design", "SEP Roadshow"] } }
    ]
  }).lean();
  
  console.log(`\n=== AFTER PARSER MODIFICATIONS ===\n`);
  
  for (const app of apps) {
    console.log(`\n--- Testing Original Record: ${app.company} ---`);
    // Pass the rawText or body. The parser takes (subject, sender, fullBodyText, date, rawText)
    const subject = app.events[0]?.subject || "";
    const rawText = app.rawText || "";
    
    const parsed = await parseEmailWithLLM(subject, app.email, rawText, new Date());
    
    console.log(`Company: ${parsed.company || "(Empty)"}`);
    console.log(`Stipend: ${parsed.programStipend || "(Empty)"}`);
    console.log(`Duration: ${parsed.programDuration || "(Empty)"}`);
    console.log(`Deadline: ${parsed.deadlineText || "(Empty)"}`);
  }
  
  await mongoose.disconnect();
}

run();
