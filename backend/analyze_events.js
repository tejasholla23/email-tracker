require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const apps = await Application.find({ isDeleted: false });
  
  let appsWithEvents = 0;
  let totalEvents = 0;
  
  const companyEvents = {};

  apps.forEach(app => {
    if (app.events && app.events.length > 0) {
      appsWithEvents++;
      totalEvents += app.events.length;
      
      if (!companyEvents[app.company]) {
         companyEvents[app.company] = 0;
      }
      companyEvents[app.company] += app.events.length;
    }
  });

  console.log(`\n--- Event History Analysis ---`);
  console.log(`Applications with events: ${appsWithEvents} / ${apps.length}`);
  console.log(`Total historical events collected: ${totalEvents}`);
  
  const avg = Object.keys(companyEvents).length > 0 ? (totalEvents / Object.keys(companyEvents).length).toFixed(2) : 0;
  console.log(`Average events per company: ${avg}`);

  console.log(`\n--- Applications with Most Events ---`);
  const sortedApps = apps.sort((a, b) => (b.events?.length || 0) - (a.events?.length || 0)).slice(0, 5);
  sortedApps.forEach(app => {
     console.log(`- ${app.company} | ${app.role} (${app.events?.length || 0} events)`);
  });

  console.log(`\n--- Event Classification Timelines & Potential Transitions ---`);
  const timelineApps = sortedApps.filter(a => a.events && a.events.length > 1).slice(0, 3);
  timelineApps.forEach(app => {
    console.log(`Company: ${app.company} | Role: ${app.role}`);
    let prevClass = null;
    app.events.forEach(e => {
       const d = new Date(e.date).toISOString().split('T')[0];
       let trans = "";
       if (prevClass) trans = ` [Transition: ${prevClass} -> ${e.classification}]`;
       console.log(`  -> ${d} | ${e.classification} (Status: ${e.status})${trans}`);
       prevClass = e.classification;
    });
    console.log("");
  });

  await mongoose.disconnect();
}
run();
