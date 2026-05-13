const mongoose = require('mongoose');
const CompanyInfo = require('./models/CompanyInfo');
const dotenv = require('dotenv');
dotenv.config();

const manualLogos = {
  "Google": "google.com",
  "TCS": "tcs.com",
  "Tata Consultancy Services": "tcs.com",
  "Bosch": "bosch.com",
  "Dentsu": "dentsu.com",
  "Samsung": "samsung.com",
  "Nokia": "nokia.com",
  "Altair Engineering": "altair.com",
  "AlgoUniversity": "algouniversity.com",
  "Nagarro": "nagarro.com",
  "Dentsu": "dentsu.com",
  "Stash": "stash.com",
  "Flip": "flip.com",
  "MSrit": "msrit.edu"
};

async function updateManual() {
  await mongoose.connect(process.env.MONGO_URI);
  for (const [name, domain] of Object.entries(manualLogos)) {
    const logo = `https://logo.clearbit.com/${domain}`;
    await CompanyInfo.updateOne({ name: name }, { $set: { domain, logo } });
    console.log(`Updated ${name} -> ${domain}`);
  }
  process.exit(0);
}

updateManual();
