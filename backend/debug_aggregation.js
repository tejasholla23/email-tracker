require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const apps = await Application.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $sort: { date: -1 } },
      { $lookup: { from: 'companyinfos', localField: 'company', foreignField: 'name', as: 'companyInfoData' } },
      { $addFields: { companyInfo: { $arrayElemAt: ['$companyInfoData', 0] } } },
      { $project: { companyInfoData: 0 } }
    ]).limit(5);
    console.log(JSON.stringify(apps, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
})();
