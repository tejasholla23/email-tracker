const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseEventTime, buildEventPayload } = require('../utils/calendarService');

test('parseEventTime: returns clean all-day date format for deadlines', () => {
  const dateInfo = parseEventTime('2026-08-25T18:29:00.000Z', null, 'deadline');
  assert.ok(dateInfo, 'Must return valid dateInfo');
  assert.strictEqual(dateInfo.allDay, true);
  assert.ok(dateInfo.start.date, 'start must have date');
  assert.strictEqual(dateInfo.start.dateTime, undefined, 'start must NOT have dateTime');
  assert.ok(dateInfo.end.date, 'end must have date');
  assert.strictEqual(dateInfo.end.dateTime, undefined, 'end must NOT have dateTime');
});

test('parseEventTime: returns clean timed format for talks, interviews, and OAs', () => {
  const dateInfo = parseEventTime('2026-08-20T08:00:00.000Z', '1:30 PM', 'talk');
  assert.ok(dateInfo, 'Must return valid dateInfo');
  assert.strictEqual(dateInfo.allDay, false);
  assert.ok(dateInfo.start.dateTime, 'start must have dateTime');
  assert.strictEqual(dateInfo.start.date, undefined, 'start must NOT have date');
  assert.ok(dateInfo.end.dateTime, 'end must have dateTime');
  assert.strictEqual(dateInfo.end.date, undefined, 'end must NOT have date');
  assert.strictEqual(dateInfo.start.timeZone, 'Asia/Kolkata');
  assert.strictEqual(dateInfo.end.timeZone, 'Asia/Kolkata');
});

test('buildEventPayload: provides full resource payload required by events.update', () => {
  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'CynLr',
    role: 'Software Engineer',
    subtitle: 'Pre-Placement Talk',
    displayFields: [{ label: 'Venue', value: 'ESB Seminar - 1' }]
  };
  const dateInfo = parseEventTime('2026-08-20T08:00:00.000Z', '1:30 PM', 'talk');
  const payload = buildEventPayload(app, 'talk', dateInfo, 'fingerprint-123');

  assert.ok(payload.summary.includes('CynLr'), 'Must include company');
  assert.ok(payload.description.includes('ESB Seminar - 1'), 'Must include details');
  assert.ok(payload.start, 'Must provide complete start object');
  assert.ok(payload.end, 'Must provide complete end object');
  assert.ok(payload.reminders, 'Must provide reminders');
  assert.ok(payload.extendedProperties.private.applicationId, 'Must provide private extended properties');
});

test('transitions: alternating between all-day and timed payloads produces mutually exclusive start/end fields', () => {
  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Beghou',
    role: 'Associate Consultant'
  };

  // 1. Initial All-Day Deadline Payload
  const deadlineDateInfo = parseEventTime('2026-08-25T18:29:00.000Z', null, 'deadline');
  const deadlinePayload = buildEventPayload(app, 'deadline', deadlineDateInfo, 'fp-1');
  assert.strictEqual(typeof deadlinePayload.start.date, 'string');
  assert.strictEqual(deadlinePayload.start.dateTime, undefined);

  // 2. Transition to Timed OA Payload
  const timedDateInfo = parseEventTime('2026-08-26T00:00:00.000Z', '10:00 AM', 'oa');
  const timedPayload = buildEventPayload(app, 'oa', timedDateInfo, 'fp-2');
  assert.strictEqual(typeof timedPayload.start.dateTime, 'string');
  assert.strictEqual(timedPayload.start.date, undefined);

  // 3. Transition back to All-Day Deadline
  const newDeadlineDateInfo = parseEventTime('2026-08-30T18:29:00.000Z', null, 'deadline');
  const newDeadlinePayload = buildEventPayload(app, 'deadline', newDeadlineDateInfo, 'fp-3');
  assert.strictEqual(typeof newDeadlinePayload.start.date, 'string');
  assert.strictEqual(newDeadlinePayload.start.dateTime, undefined);
});

test('code verification: calendarService.js must use calendar.events.update instead of patch', () => {
  const serviceCode = fs.readFileSync(path.join(__dirname, '../utils/calendarService.js'), 'utf-8');
  assert.ok(!serviceCode.includes('calendar.events.patch'), 'calendar.events.patch must not be called in calendarService.js');
  assert.ok(serviceCode.includes('calendar.events.update'), 'calendar.events.update must be present in calendarService.js');
});
