require("dotenv").config();
const mongoose = require("mongoose");
const CompanyInfo = require("./models/CompanyInfo");
const { enrichCompanyProfile } = require("./utils/enrichCompanyProfile");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const havells = await CompanyInfo.findOne({ name: "Havells" });
  if (!havells) {
    console.log("Havells not found.");
    await mongoose.disconnect();
    return;
  }

  // Force reset status for testing
  havells.isEnriched = false;
  havells.isEnriching = false;
  await havells.save();

  console.log("Starting enrichment for Havells...");
  try {
    await enrichCompanyProfile(havells);
    const updated = await CompanyInfo.findOne({ name: "Havells" });
    console.log("Updated Havells Record:", JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error("Enrichment failed:", err.message);
  }

  await mongoose.disconnect();
}

run();
