const mongoose = require('mongoose');
require('dotenv').config();

const Application = require('./models/Application');

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Query for Nokia to check populated fields
    const nokiaApp = await Application.findOne({ company: 'Nokia' });
    if (nokiaApp) {
      console.log('\n=== NOKIA APPLICATION ===');
      console.log('Company:', nokiaApp.company);
      console.log('Role:', nokiaApp.role);
      console.log('Program Roles:', nokiaApp.programRoles);
      console.log('Program Duration:', nokiaApp.programDuration);
      console.log('Program Stipend:', nokiaApp.programStipend);
      console.log('Deadline Text:', nokiaApp.deadlineText);
    }

    // Query for Haber
    const haberApp = await Application.findOne({ company: 'Haber' });
    if (haberApp) {
      console.log('\n=== HABER APPLICATION ===');
      console.log('Company:', haberApp.company);
      console.log('Role:', haberApp.role);
      console.log('Program Roles:', haberApp.programRoles);
      console.log('Program Duration:', haberApp.programDuration);
      console.log('Program Stipend:', haberApp.programStipend);
      console.log('Deadline Text:', haberApp.deadlineText);
    }

    // Query for Dentsu
    const dentsuApp = await Application.findOne({ company: 'Dentsu' });
    if (dentsuApp) {
      console.log('\n=== DENTSU APPLICATION ===');
      console.log('Company:', dentsuApp.company);
      console.log('Role:', dentsuApp.role);
      console.log('Program Roles:', dentsuApp.programRoles);
      console.log('Program Duration:', dentsuApp.programDuration);
      console.log('Program Stipend:', dentsuApp.programStipend);
      console.log('Deadline Text:', dentsuApp.deadlineText);
    }

    // Count records with populated internship fields
    const withRoles = await Application.countDocuments({ programRoles: { $exists: true, $ne: '' } });
    const withDuration = await Application.countDocuments({ programDuration: { $exists: true, $ne: '' } });
    const withStipend = await Application.countDocuments({ programStipend: { $exists: true, $ne: '' } });
    const withDeadline = await Application.countDocuments({ deadlineText: { $exists: true, $ne: '' } });

    console.log('\n=== STATS ===');
    console.log('Records with programRoles:', withRoles);
    console.log('Records with programDuration:', withDuration);
    console.log('Records with programStipend:', withStipend);
    console.log('Records with deadlineText:', withDeadline);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkData();
