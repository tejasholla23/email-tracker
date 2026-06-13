const mongoose = require("mongoose");

const companyInfoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // Normalized company name
    domain: { type: String }, // e.g., google.com
    logo: { type: String },   // e.g., https://logo.clearbit.com/google.com
  },
  { timestamps: true }
);

module.exports = mongoose.model("CompanyInfo", companyInfoSchema);
