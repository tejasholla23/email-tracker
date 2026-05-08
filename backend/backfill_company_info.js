require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');
const CompanyInfo = require('./models/CompanyInfo');
const { getCompanyInfo } = require('./utils/companyInfoService');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const companies = await Application.distinct('company', { company: { $exists: true, $ne: '' } });
  const missingCompanies = [];

  for (const name of companies) {
    const existing = await CompanyInfo.findOne({ name });
    if (!existing) {
      missingCompanies.push(name);
    }
  }

  console.log('Total distinct application companies:', companies.length);
  console.log('Companies missing CompanyInfo:', missingCompanies.length);
  if (missingCompanies.length === 0) {
    console.log('Nothing to backfill. All companies already have CompanyInfo documents.');
    await mongoose.disconnect();
    return;
  }

  for (const company of missingCompanies) {
    console.log(`[BACKFILL] Generating company info for: ${company}`);
    const info = await getCompanyInfo(company);
    if (!info) {
      console.log(`[BACKFILL_FAILED] ${company}`);
    } else {
      console.log(`[BACKFILL_DONE] ${company}`);
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
