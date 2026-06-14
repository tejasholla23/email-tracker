const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { getCompanyInfo } = require('../utils/companyInfoService');
const CompanyInfo = require('../models/CompanyInfo');

test('getCompanyInfo caches and does not overwrite existing logos', async () => {
  // Connect to a test DB if not already connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://localhost:27017/email-tracker-test');
  }
  
  await CompanyInfo.deleteMany({});
  
  // Create a manual override
  await CompanyInfo.create({
    name: 'PreExisting Company',
    domain: 'preexisting.com',
    logo: 'https://custom-logo.com/logo.png'
  });
  
  // Fetch the company
  const info = await getCompanyInfo('PreExisting Company');
  
  // It should return the exact cached version
  assert.strictEqual(info.logo, 'https://custom-logo.com/logo.png');
  assert.strictEqual(info.domain, 'preexisting.com');
  
  // Clean up
  await CompanyInfo.deleteMany({});
});

test('getCompanyInfo falls back to Google Favicons or ui-avatars for unknown domains', async () => {
  // The backend function should resolve some URL even for a fake company
  const fakeCompany = 'FakeCompanyxyz999';
  const info = await getCompanyInfo(fakeCompany);
  
  // It should be successfully generated and saved
  assert.ok(info.logo);
  assert.strictEqual(info.name, fakeCompany);
  assert.strictEqual(info.domain, 'fakecompanyxyz999.com');
  
  // Should be persisted in DB
  const inDb = await CompanyInfo.findOne({ name: fakeCompany });
  assert.strictEqual(inDb.logo, info.logo);
  
  // Second call should return the exact same persisted URL
  const info2 = await getCompanyInfo(fakeCompany);
  assert.strictEqual(info2.logo, info.logo);
  
  await CompanyInfo.deleteMany({});
  // Close connection
  await mongoose.disconnect();
});
