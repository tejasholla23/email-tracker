const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { getCompanyInfo } = require('../utils/companyInfoService');
const CompanyInfo = require('../models/CompanyInfo');

const inMemoryStore = new Map();

CompanyInfo.findOne = async (query) => {
  if (query.name) {
    return inMemoryStore.get(query.name) || null;
  }
  return null;
};

CompanyInfo.create = async (doc) => {
  inMemoryStore.set(doc.name, { ...doc });
  return inMemoryStore.get(doc.name);
};

test('getCompanyInfo caches and does not overwrite existing logos', async () => {
  inMemoryStore.clear();

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
});

test('getCompanyInfo falls back to Google Favicons or ui-avatars for unknown domains', async () => {
  inMemoryStore.clear();
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
});

test('getCompanyInfo correctly resolves TE Connectivity and Mindsprint domains', async () => {
  inMemoryStore.clear();
  const te = await getCompanyInfo('TE Connectivity');
  assert.strictEqual(te.domain, 'te.com');
  assert.strictEqual(te.logo, 'https://www.google.com/s2/favicons?domain=https://te.com&sz=128');

  const mindsprint = await getCompanyInfo('Mindsprint');
  assert.strictEqual(mindsprint.domain, 'mindsprint.ai');
  assert.strictEqual(mindsprint.logo, 'https://www.google.com/s2/favicons?domain=https://mindsprint.ai&sz=128');
});
