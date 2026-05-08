require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const apps = await Application.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $lookup: { from: 'companyinfos', localField: 'company', foreignField: 'name', as: 'companyInfoData' } },
      { $addFields: { companyInfo: { $arrayElemAt: ['$companyInfoData', 0] } } },
      { $project: { companyInfoData: 0 } }
    ]);
    const missing = apps.filter((a) => !a.companyInfo || !a.companyInfo.shortDescription);
    console.log('total apps', apps.length, 'missing companyInfo', missing.length);
    if (missing.length > 0) {
      console.log(JSON.stringify(missing.map((a) => ({ company: a.company, _id: a._id, link: a.link })), null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
})();
