require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");

async function analyze() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const apps = await Application.find().sort({ date: -1 });
  
  console.log(`Total Applications: ${apps.length}`);
  
  const companyCounts = {};
  for (const app of apps) {
    if (!companyCounts[app.company]) {
      companyCounts[app.company] = [];
    }
    companyCounts[app.company].push(app);
  }
  
  console.log("\n--- Company Deduplication Analysis ---");
  for (const company of Object.keys(companyCounts)) {
    if (companyCounts[company].length > 1) {
      console.log(`\nCompany: "${company}" (${companyCounts[company].length} records)`);
      companyCounts[company].forEach(app => {
        console.log(`  - Role: "${app.role}" | Status: ${app.status} | Date: ${app.date.toISOString().split('T')[0]}`);
      });
    }
  }

  console.log("\n--- Examples of 'role' field values ---");
  apps.slice(0, 10).forEach(app => {
    console.log(`Company: ${app.company} | Role: ${app.role} | ProgramRoles: ${app.programRoles || 'N/A'}`);
  });

  await mongoose.disconnect();
}

analyze();
