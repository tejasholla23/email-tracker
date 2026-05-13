const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { GoogleGenAI } = require("@google/genai");
const CompanyInfo = require('./models/CompanyInfo');

dotenv.config();

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function backfill() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const companies = await CompanyInfo.find({ $or: [{ domain: { $exists: false } }, { domain: "" }] });
    console.log(`Found ${companies.length} companies to update`);

    for (const company of companies) {
      console.log(`Updating ${company.name}...`);
      
      const prompt = `Find the official website domain for ${company.name}. Return ONLY the domain (e.g. google.com). If unknown, return "Unknown".`;
      
      const response = await genAI.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt,
      });

      let domain = (response.text || "").trim().toLowerCase();
      if (domain.includes(" ")) domain = "Unknown";
      
      let logo = "";
      if (domain !== "unknown") {
        logo = `https://logo.clearbit.com/${domain}`;
      }

      company.domain = domain === "unknown" ? "" : domain;
      company.logo = logo;
      await company.save();
      console.log(`Updated ${company.name} with domain: ${domain}`);

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log("Backfill complete");
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
}

backfill();
