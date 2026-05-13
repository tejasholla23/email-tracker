const mongoose = require('mongoose');
const Application = require('./models/Application');
const CompanyInfo = require('./models/CompanyInfo');
const dotenv = require('dotenv');
dotenv.config();

async function debug() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  const apps = await Application.find({ isDeleted: { $ne: true } }).limit(10);
  for (const a of apps) {
    const info = await CompanyInfo.findOne({ name: a.company });
    console.log(`Company: "${a.company}" | Info Found: ${!!info} | Logo: ${info?.logo || "NONE"}`);
  }
  process.exit(0);
}

debug();
