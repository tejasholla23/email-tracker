const mongoose = require('mongoose');
const Application = require('./models/Application');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/email-tracker');
    const apps = await Application.find({ company: { $in: ['Altair Engineering', 'Nokia'] } }).lean();
    for (const app of apps) {
      console.log('---', app.company, app.role, app._id);
      console.log('rawText:', app.rawText);
      console.log('programRoles:', app.programRoles);
      console.log('programDuration:', app.programDuration);
      console.log('programStipend:', app.programStipend);
      console.log('deadlineText:', app.deadlineText);
      console.log('link:', app.link);
      console.log();
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
