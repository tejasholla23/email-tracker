const test = require('node:test');
const assert = require('node:assert');
const { advanceStatus, classificationToStatus } = require('../utils/statusMachine');

test('classificationToStatus maps accurately to hierarchy', () => {
  assert.strictEqual(classificationToStatus('Registration Link'), 'new');
  assert.strictEqual(classificationToStatus('Application Reminder'), 'new');
  assert.strictEqual(classificationToStatus('Deadline Reminder'), 'new');
  assert.strictEqual(classificationToStatus('Application Submitted'), 'applied');
  assert.strictEqual(classificationToStatus('Registration Confirmation'), 'applied');
  assert.strictEqual(classificationToStatus('Venue Update'), 'interview');
  assert.strictEqual(classificationToStatus('Interview Result'), 'offer');
});

test('advanceStatus enforces forward-only hierarchy', () => {
  // Should advance forward
  assert.strictEqual(advanceStatus('new', 'applied'), 'applied');
  assert.strictEqual(advanceStatus('applied', 'interview'), 'interview');
  
  // Should NOT regress backward
  assert.strictEqual(advanceStatus('applied', 'new'), 'applied');
  assert.strictEqual(advanceStatus('interview', 'applied'), 'interview');
  assert.strictEqual(advanceStatus('offer', 'new'), 'offer');
  
  // Terminal states cannot be overwritten by email syncs
  assert.strictEqual(advanceStatus('done', 'offer'), 'done');
  assert.strictEqual(advanceStatus('rejected', 'offer'), 'rejected');
  
  // Same state remains same
  assert.strictEqual(advanceStatus('applied', 'applied'), 'applied');
});
