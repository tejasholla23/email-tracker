require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');
const CompanyInfo = require('./models/CompanyInfo');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const appCount = await Application.countDocuments();
    const compCount = await CompanyInfo.countDocuments();
    console.log('Application count:', appCount);
    console.log('CompanyInfo count:', compCount);

    const apps = await Application.find({}).limit(5).lean();
    console.log('Sample Applications:');
    apps.forEach((app) => {
      console.log(JSON.stringify({ _id: app._id, company: app.company, role: app.role, messageId: app.messageId, date: app.date, companyInfoAttached: app.companyInfo ? true : false }, null, 2));
    });

    const comps = await CompanyInfo.find({}).limit(5).lean();
    console.log('Sample CompanyInfos:');
    comps.forEach((c) => {
      console.log(JSON.stringify(c, null, 2));
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
})();
