require('dotenv').config();
const mongoose = require('mongoose');
const CompanyInfo = require('./models/CompanyInfo');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    // Insert WorkIndia CompanyInfo
    const existing = await CompanyInfo.findOne({ name: "WorkIndia" });
    if (existing) {
      console.log("WorkIndia CompanyInfo already exists:", existing);
    } else {
      const info = await CompanyInfo.create({
        name: "WorkIndia",
        shortDescription: "WorkIndia is a Bengaluru-based product company focused on blue-collar and grey-collar job recruitment.",
        fullDescription: "WorkIndia is an Indian job search platform that connects blue-collar and grey-collar workers with employers. The platform uses AI-based matching to simplify hiring for roles in delivery, sales, customer support, and other entry-level positions.",
        industry: "HR Tech / Recruitment",
        companyType: "Product-based",
        headquarters: "Bengaluru, India",
        domain: "workindia.in",
        logo: "https://logo.clearbit.com/workindia.in"
      });
      console.log("WorkIndia CompanyInfo created:", info);
    }

    process.exit();
  })
  .catch(e => { console.error(e); process.exit(1); });
