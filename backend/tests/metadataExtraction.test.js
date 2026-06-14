const test = require('node:test');
const assert = require('node:assert');
const { extractFallbackDisplayFields } = require('../utils/parseEmailWithLLM');

test('extractFallbackDisplayFields extracts basic fields', () => {
  const body = `
  Dear student,
  Role: Software Engineer
  Stipend: INR 30K for Bachelor's students
  Duration: 3 Months
  Location: Bangalore
  `;
  const fields = extractFallbackDisplayFields(body);
  
  assert.strictEqual(fields.find(f => f.label === 'Role').value, 'Software Engineer');
  assert.strictEqual(fields.find(f => f.label === 'Stipend').value, "INR 30K for Bachelor's students");
  assert.strictEqual(fields.find(f => f.label === 'Duration').value, '3 Months');
  assert.strictEqual(fields.find(f => f.label === 'Location').value, 'Bangalore');
});

test('extractFallbackDisplayFields rejects garbage values', () => {
  const body = `
  Location: Details:
  Stipend: will be decided later
  CTC: TBD
  `;
  const fields = extractFallbackDisplayFields(body);
  
  // "Details:" should be rejected because of /^details?$/i
  assert.strictEqual(fields.find(f => f.label === 'Location'), undefined);
  
  // "will be decided later" should be rejected
  assert.strictEqual(fields.find(f => f.label === 'Stipend'), undefined);
});

test('extractFallbackDisplayFields strips trailing punctuation', () => {
  const body = `
  Role: Intern -
  Location: Remote.
  `;
  const fields = extractFallbackDisplayFields(body);
  
  assert.strictEqual(fields.find(f => f.label === 'Role').value, 'Intern');
  assert.strictEqual(fields.find(f => f.label === 'Location').value, 'Remote');
});
