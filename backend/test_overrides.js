require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");
const { normalizeCompany } = require("./utils/normalizeCompany");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const app = await Application.findOne({ company: "Bosch" });
  if (app) {
    console.log("Original:", app.company, app.programStipend, app.manualOverrides);
    
    // Simulate PATCH
    const manualEdits = { company: "Bosch Custom", programStipend: "100K LPA Custom" };
    const update = {};
    for (const [key, value] of Object.entries(manualEdits)) {
        update[key] = value;
        if (!update.$addToSet) update.$addToSet = {};
        if (!update.$addToSet.manualOverrides) update.$addToSet.manualOverrides = { $each: [] };
        update.$addToSet.manualOverrides.$each.push(key);
        
        if (key === "company") {
          update.companyKey = normalizeCompany(value);
        }
    }
    
    await Application.findByIdAndUpdate(app._id, update, { new: true });
    
    const updated = await Application.findById(app._id);
    console.log("Updated:", updated.company, updated.programStipend, updated.manualOverrides);
    
    // Revert
    await Application.findByIdAndUpdate(app._id, { 
      company: "Bosch", 
      companyKey: normalizeCompany("Bosch"), 
      programStipend: "", 
      manualOverrides: [] 
    });
  }
  
  await mongoose.disconnect();
}

run();
