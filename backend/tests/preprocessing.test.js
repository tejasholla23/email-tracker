const test = require('node:test');
const assert = require('node:assert');
const { preprocessBody, cleanDisplayFieldValue, validateDisplayField, mergeAlternativeTexts } = require('../utils/parseEmailWithLLM');

test('preprocessBody preserves structural newlines and collapses extra blank lines', () => {
  const input = "Line 1\n\n\nLine 2\n\nLine 3\n";
  const result = preprocessBody(input);
  assert.strictEqual(result.text, "Line 1\n\nLine 2\n\nLine 3");
});

test('preprocessBody cleans MIME/quoted-printable remnants and zero-width characters', () => {
  const input = "Subject=3DText&nbsp;with zero-width\u200Bchar";
  const result = preprocessBody(input);
  assert.strictEqual(result.text, "Subject=Text with zero-widthchar");
});

test('preprocessBody normalizes unicode quotes, dashes and separators', () => {
  const input = "“Hello” – ‘World’ — --------";
  const result = preprocessBody(input);
  assert.strictEqual(result.text, '"Hello" - \'World\' - ---');
});

test('preprocessBody removes confidentiality disclaimers', () => {
  const input = "Dear candidate,\nHere is the detail.\nDisclaimer: This email is confidential and intended solely for the addressee...";
  const result = preprocessBody(input);
  assert.strictEqual(result.text, "Dear candidate,\nHere is the detail.");
});

test('preprocessBody removes mobile signatures', () => {
  const input = "Interview scheduled at 4 PM.\nSent from my iPhone\nSome other tail";
  const result = preprocessBody(input);
  assert.strictEqual(result.text, "Interview scheduled at 4 PM.");
});

test('mergeAlternativeTexts prefers richer HTML but appends unique plain text lines', () => {
  const html = "<div>We have scheduled a meeting.</div><div>Date: Oct 10</div>";
  const plain = "We have scheduled a meeting.\nDate: Oct 10\nZoom link: https://zoom.us/j/123\nRegards,\nHR";
  
  const merged = mergeAlternativeTexts(html, plain);
  
  // The HTML contains meeting and Date.
  // The plain contains "Zoom link..." and "Regards" and "HR".
  // "Zoom link..." (length >= 5) is unique and should be appended.
  // "Regards" (length >= 5) is unique and should be appended.
  // "HR" is less than 5 characters, so it is skipped.
  assert.ok(merged.includes("Zoom link: https://zoom.us/j/123"));
  assert.ok(merged.includes("Regards"));
  assert.ok(!merged.includes("\nHR"));
});

test('Subject trimming keeps Fwd: and Re: prefixes', () => {
  const subject = "   Fwd: Re: Software Engineer Opportunity  ";
  const trimmed = subject.trim();
  assert.strictEqual(trimmed, "Fwd: Re: Software Engineer Opportunity");
});

test('cleanDisplayFieldValue handles merged field labels and noise phrases', () => {
  const clean1 = cleanDisplayFieldValue('Stipend', '₹30,000/month (subject to taxes) Duration: 12 months');
  assert.strictEqual(clean1, '₹30,000/month');
  
  const clean2 = cleanDisplayFieldValue('CTC', '₹5.4 LPA This internship will be post completion');
  assert.strictEqual(clean2, '₹5.4 LPA');
});

test('validateDisplayField rejects invalid and accepts valid values', () => {
  const v1 = validateDisplayField('Location', 'Details:');
  assert.strictEqual(v1.valid, false);
  
  const v2 = validateDisplayField('Stipend', 'will be decided later');
  assert.strictEqual(v2.valid, false);
  
  const v3 = validateDisplayField('CTC', '₹15 LPA Fixed + ₹3 LPA Variable');
  assert.strictEqual(v3.valid, true);
  assert.strictEqual(v3.value, '₹15 LPA Fixed + ₹3 LPA Variable');
});
