const test = require('node:test');
const assert = require('node:assert');
const { extractFormLink } = require('../utils/parseEmailWithLLM');

test('extractFormLink should extract Google Forms links', () => {
  const text = 'Please fill out the form: https://forms.gle/abc123XYZ before tomorrow.';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://forms.gle/abc123XYZ');
  assert.strictEqual(result.isForm, true);
});

test('extractFormLink should extract Unstop links', () => {
  const text = 'Apply here: https://unstop.com/o/KoXsOLD/?ref=amcJFfEZ *Last Date to Register:* Sunday';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://unstop.com/o/KoXsOLD/?ref=amcJFfEZ');
});

test('extractFormLink should extract Brazen links', () => {
  const text = 'Register at https://app.brazenconnect.com/a/asp-sdengineering/e/28N38 for the event.';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://app.brazenconnect.com/a/asp-sdengineering/e/28N38');
});

test('extractFormLink should extract URLs followed by signatures ("Regards")', () => {
  const text = 'Link: https://example.com/apply?id=123&token=abc. Regards, Placement Cell';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://example.com/apply?id=123&token=abc');
});

test('extractFormLink should extract URLs surrounded by angle brackets', () => {
  const text = 'Here is the link <https://app.brazenconnect.com/a/asp-sdengineering/e/28N38> to apply.';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://app.brazenconnect.com/a/asp-sdengineering/e/28N38');
});

test('extractFormLink should remove duplicates', () => {
  const text = 'Link: https://unstop.com/competition and again <https://unstop.com/competition>';
  const result = extractFormLink(text);
  assert.strictEqual(result.all.length, 1);
  assert.strictEqual(result.primary, 'https://unstop.com/competition');
});
