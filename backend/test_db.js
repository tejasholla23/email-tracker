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
        domain: "workindia.in",
        logo: "https://logo.clearbit.com/workindia.in"
      });
      console.log("WorkIndia CompanyInfo created:", info);
    }

    process.exit();
  })
  .catch(e => { console.error(e); process.exit(1); });
