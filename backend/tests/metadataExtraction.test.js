const test = require('node:test');
const assert = require('node:assert');
const { extractFallbackDisplayFields, resolveDeadlineISO } = require('../utils/parseEmailWithLLM');

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

test('resolveDeadlineISO resolves EOD and End of Day to end of email date (23:59 IST)', () => {
  // Reference date: 19th August 2026 11:00 UTC (16:30 IST)
  const refDate = new Date("2026-08-19T11:00:00.000Z");
  
  const isoEOD = resolveDeadlineISO("EOD", refDate);
  assert.ok(isoEOD.length > 0);
  assert.strictEqual(isoEOD, "2026-08-19T18:29:00.000Z"); // 23:59 IST is 18:29 UTC
  
  const isoEndOfDay = resolveDeadlineISO("End of Day", refDate);
  assert.strictEqual(isoEndOfDay, "2026-08-19T18:29:00.000Z");

  const isoToday = resolveDeadlineISO("Today by 5:00 PM", refDate);
  assert.strictEqual(isoToday, "2026-08-19T11:30:00.000Z"); // 17:00 IST is 11:30 UTC
});

