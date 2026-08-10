const mongoose = require("mongoose");

const companyInfoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // Normalized company name
    domain: { type: String },   // e.g., google.com
    logo: { type: String },     // e.g., https://logo.clearbit.com/google.com

    // Company profile — populated by enrichCompanyProfile.js
    industry: { type: String, default: "" },
    companyType: { type: String, default: "" },   // e.g. "Product", "Service", "Startup"
    headquarters: { type: String, default: "" },
    description: { type: String, default: "" },   // 2-3 sentence summary
    website: { type: String, default: "" },
    knownFor: [{ type: String }],                 // short bullet points
    isEnriched: { type: Boolean, default: false }, // true once LLM profile has been generated
    isEnriching: { type: Boolean, default: false }, // in-flight lock to prevent concurrent enrichment
    lastEnriched: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompanyInfo", companyInfoSchema);

