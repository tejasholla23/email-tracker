const mongoose = require("mongoose");

const companyInfoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // Normalized company name
    shortDescription: { type: String },
    fullDescription: { type: String },
    industry: { type: String },
    companyType: { type: String },
    headquarters: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompanyInfo", companyInfoSchema);
