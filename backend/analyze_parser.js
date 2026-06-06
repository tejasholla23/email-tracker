require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const apps = await Application.find().sort({ date: -1 });

  const total = apps.length;
  console.log(`\nTotal Records: ${total}`);

  // 1. Parser Quality Audit
  let validCompany = 0;
  let validJobRole = 0;
  let unknownRole = 0;
  let missingClassification = 0;
  let missingProcessId = 0;
  let missingTitle = 0;
  
  const enrichedApps = [];

  for (const app of apps) {
    // Re-parse to simulate the new fields if they aren't stored, just to be safe, 
    // or use them if they are stored. 
    // The prompt says "The system is now storing...", but just in case:
    let data = app;
    if (!app.classification && app.rawText) {
       const parsed = await parseEmailWithLLM(app.rawText, app.source, app.rawText, app.date);
       data = { ...app.toObject(), ...parsed };
    }
    enrichedApps.push(data);

    if (data.company) validCompany++;
    if (data.jobRole && data.jobRole.toLowerCase() !== "unknown role" && data.jobRole !== "") validJobRole++;
    if (data.role === "Unknown Role" || !data.role) unknownRole++;
    if (!data.classification) missingClassification++;
    if (!data.processId) missingProcessId++;
    if (!data.title) missingTitle++;
  }

  console.log(`\n--- 1. Parser Quality Metrics ---`);
  console.log(`Valid Company: ${validCompany} (${Math.round(validCompany/total*100)}%)`);
  console.log(`Valid JobRole: ${validJobRole} (${Math.round(validJobRole/total*100)}%)`);
  console.log(`Unknown Role: ${unknownRole} (${Math.round(unknownRole/total*100)}%)`);
  console.log(`Missing Classification: ${missingClassification} (${Math.round(missingClassification/total*100)}%)`);
  console.log(`Missing ProcessId: ${missingProcessId} (${Math.round(missingProcessId/total*100)}%)`);
  console.log(`Missing Title: ${missingTitle} (${Math.round(missingTitle/total*100)}%)`);

  // 2. Classification Audit
  const classCounts = {};
  enrichedApps.forEach(a => {
    const c = a.classification || "Missing";
    if (!classCounts[c]) classCounts[c] = { count: 0, examples: [] };
    classCounts[c].count++;
    if (classCounts[c].examples.length < 2) {
      classCounts[c].examples.push(`${a.company} | ${a.title}`);
    }
  });
  console.log(`\n--- 2. Classification Audit ---`);
  for (const [c, info] of Object.entries(classCounts)) {
    console.log(`${c}: ${info.count} records`);
    info.examples.forEach(ex => console.log(`  Example: ${ex}`));
  }

  // 4. Deduplication Simulation
  const optA = new Set();
  const optB = new Set();
  const optC = new Set();
  const optD = new Set();

  enrichedApps.forEach(a => {
    optA.add(`${a.company}::${a.role}`);
    optB.add(`${a.company}::${a.jobRole || "None"}`);
    optC.add(`${a.company}::${a.processId || "None"}`);
    optD.add(`${a.company}`);
  });

  console.log(`\n--- 4. Deduplication Simulation ---`);
  console.log(`Total Records: ${total}`);
  console.log(`Option A (company+role) Unique: ${optA.size} (Merged: ${total - optA.size})`);
  console.log(`Option B (company+jobRole) Unique: ${optB.size} (Merged: ${total - optB.size})`);
  console.log(`Option C (company+processId) Unique: ${optC.size} (Merged: ${total - optC.size})`);
  console.log(`Option D (company only) Unique: ${optD.size} (Merged: ${total - optD.size})`);

  console.log("\n--- 5. Company examples for process identity ---");
  const tcsApps = enrichedApps.filter(a => a.company === "TCS").map(a => ({ role: a.role, class: a.classification, jobRole: a.jobRole }));
  console.log("TCS Apps:", tcsApps);

  await mongoose.disconnect();
}
run();
