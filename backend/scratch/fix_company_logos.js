require("dotenv").config();
const mongoose = require("mongoose");
const CompanyInfo = require("../models/CompanyInfo");

async function fixLogos() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is not set");
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    // 1. Inspect existing company records
    const companies = await CompanyInfo.find({
      name: { $in: [/flipkart/i, /ujjivan/i] }
    });

    console.log("Found existing company records:");
    companies.forEach(c => {
      console.log(`- ID: ${c._id} | Name: "${c.name}" | Domain: "${c.domain}" | Logo: "${c.logo}"`);
    });

    // We want to force high-quality logos
    // Flipkart: https://logo.clearbit.com/flipkart.com or direct official PNG
    // Ujjivan Small Finance Bank: Google favicon or clearbit for ujjivansfb.in
    const flipkartLogo = "https://logo.clearbit.com/flipkart.com";
    const ujjivanLogo = "https://www.google.com/s2/favicons?domain=ujjivansfb.in&sz=128";

    // 2. Perform updates / upserts

    // Upsert Flipkart
    await CompanyInfo.findOneAndUpdate(
      { name: "Flipkart" },
      { name: "Flipkart", domain: "flipkart.com", logo: flipkartLogo },
      { upsert: true, new: true }
    );
    console.log("Upserted 'Flipkart' record.");

    // Upsert Flipkart GRiD 8.0
    await CompanyInfo.findOneAndUpdate(
      { name: "Flipkart GRiD 8.0" },
      { name: "Flipkart GRiD 8.0", domain: "flipkart.com", logo: flipkartLogo },
      { upsert: true, new: true }
    );
    console.log("Upserted 'Flipkart GRiD 8.0' record.");

    // Upsert Ujjivan Small Finance Bank
    await CompanyInfo.findOneAndUpdate(
      { name: "Ujjivan Small Finance Bank" },
      { name: "Ujjivan Small Finance Bank", domain: "ujjivansfb.in", logo: ujjivanLogo },
      { upsert: true, new: true }
    );
    console.log("Upserted 'Ujjivan Small Finance Bank' record.");

  } catch (err) {
    console.error("Error patching company logos:", err);
  } finally {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
}

fixLogos();
