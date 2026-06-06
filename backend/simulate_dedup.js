require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const apps = await Application.find().sort({ date: 1 }); // Sort ascending by date for chronological timeline
  
  const enrichedApps = [];
  for (const app of apps) {
    if (app.rawText) {
      const parsed = await parseEmailWithLLM(app.rawText, app.source, app.rawText, app.date);
      enrichedApps.push({ ...app.toObject(), ...parsed });
    }
  }

  const total = enrichedApps.length;
  console.log(`\n--- Deduplication Strategies ---`);

  function simulate(keyFn, name) {
    const unique = new Set();
    const mergedCounts = {};
    const companiesAffected = new Set();
    
    enrichedApps.forEach(a => {
      const key = keyFn(a);
      if (unique.has(key)) {
        mergedCounts[key] = (mergedCounts[key] || 1) + 1;
        companiesAffected.add(a.company);
      } else {
        unique.add(key);
      }
    });
    
    const mergedTotal = Object.values(mergedCounts).reduce((a, b) => a + b, 0);
    
    console.log(`\nStrategy: ${name}`);
    console.log(`Total Applications: ${total}`);
    console.log(`Unique Cards: ${unique.size}`);
    console.log(`Duplicates Merged: ${mergedTotal}`);
    console.log(`Companies Affected: ${companiesAffected.size}`);
    console.log(`Examples Merged:`, Object.entries(mergedCounts).slice(0, 3).map(([k, v]) => `${k} (${v} merged)`));
  }

  simulate(a => `${a.company}::${a.role}`, "company + role");
  simulate(a => `${a.company}`, "company only");
  simulate(a => `${a.company}::${a.jobRole}`, "company + jobRole");
  simulate(a => `${a.processId}`, "processId");

  console.log(`\n--- Company Timelines (Top 10) ---`);
  
  const companyMap = {};
  enrichedApps.forEach(a => {
    if (!companyMap[a.company]) companyMap[a.company] = [];
    companyMap[a.company].push(a);
  });
  
  const sortedCompanies = Object.entries(companyMap).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  
  for (const [company, records] of sortedCompanies) {
    const currentCards = new Set(records.map(a => `${a.company}::${a.role}`)).size;
    const classifications = [...new Set(records.map(a => a.classification))];
    console.log(`Company: ${company} | Current Cards: ${currentCards} | Cards After Merge (company only): 1 | Classifications: ${classifications.join(", ")}`);
    
    console.log(`Timeline:`);
    records.forEach(r => {
      console.log(`  - ${r.classification} (${r.date.toISOString().split('T')[0]})`);
    });
    console.log("");
  }
  
  await mongoose.disconnect();
}
run();
