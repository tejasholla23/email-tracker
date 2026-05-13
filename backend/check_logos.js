const mongoose = require('mongoose');
const CompanyInfo = require('./models/CompanyInfo');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const count = await CompanyInfo.countDocuments({ logo: { $ne: null, $ne: "" } });
  console.log('Companies with logos:', count);
  const samples = await CompanyInfo.find({ logo: { $ne: null, $ne: "" } }).limit(5);
  samples.forEach(s => {
    console.log(`- ${s.name}: domain="${s.domain}", logo="${s.logo}"`);
  });
  process.exit(0);
});
