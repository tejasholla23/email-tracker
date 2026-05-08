const mongoose = require('mongoose');
const Application = require('./models/Application');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/email-tracker');
    const apps = await Application.find({}).limit(10).lean();
    console.log('TOTAL:', apps.length);
    apps.forEach((app, index) => {
      console.log('--- APP', index + 1, app.company, app.role);
      console.log('rawText:', app.rawText);
      console.log('programRoles:', app.programRoles);
      console.log('programDuration:', app.programDuration);
      console.log('programStipend:', app.programStipend);
      console.log('deadlineText:', app.deadlineText);
      console.log('deadline:', app.deadline);
      console.log('link:', app.link);
      console.log('isFormLink:', app.isFormLink);
      console.log('date:', app.date);
      console.log();
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
