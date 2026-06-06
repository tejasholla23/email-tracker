require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const apps = await Application.find().sort({ date: 1 });
  
  const enrichedApps = [];
  for (const app of apps) {
    if (app.rawText) {
      const parsed = await parseEmailWithLLM(app.rawText, app.source, app.rawText, app.date);
      enrichedApps.push({ ...app.toObject(), ...parsed });
    }
  }

  const companyMap = {};
  enrichedApps.forEach(a => {
    // skip empty companies since they are just noise for this analysis
    if (!a.company || a.company === "None") return;
    if (!companyMap[a.company]) companyMap[a.company] = [];
    companyMap[a.company].push(a);
  });

  console.log(`\n--- Company Identity Analysis ---`);
  
  const sortedCompanies = Object.entries(companyMap).sort((a, b) => b[1].length - a[1].length);
  
  for (const [company, records] of sortedCompanies) {
    const jobRoles = [...new Set(records.map(a => a.jobRole).filter(r => r && r !== "Unknown Role"))];
    const types = [...new Set(records.map(a => a.type).filter(t => t && t !== "unknown"))];
    
    console.log(`Company: ${company} | Count: ${records.length}`);
    console.log(`  Job Roles: ${jobRoles.length > 0 ? jobRoles.join(", ") : "None detected"}`);
    console.log(`  Types: ${types.length > 0 ? types.join(", ") : "None detected"}`);
    
    records.forEach(r => {
       console.log(`  - [${r.date.toISOString().split('T')[0]}] Class: ${r.classification} | JobRole: ${r.jobRole} | Type: ${r.type}`);
    });
    console.log("");
  }
  
  await mongoose.disconnect();
}
run();
