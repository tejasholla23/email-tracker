const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseEventTime, buildEventPayload, getCalendarListForAccount, syncAppToCalendar } = require('../utils/calendarService');

test('parseEventTime: returns clean all-day date format for deadlines in IST', () => {
  const dateInfo = parseEventTime('2026-08-25T18:29:00.000Z', null, 'deadline');
  assert.ok(dateInfo, 'Must return valid dateInfo');
  assert.strictEqual(dateInfo.allDay, true);
  assert.strictEqual(dateInfo.start.date, '2026-08-25');
  assert.strictEqual(dateInfo.start.dateTime, undefined, 'start must NOT have dateTime');
  assert.strictEqual(dateInfo.end.date, '2026-08-26');
  assert.strictEqual(dateInfo.end.dateTime, undefined, 'end must NOT have dateTime');
});

test('parseEventTime: early morning IST date (02:00 IST) correctly maps to the IST calendar date, not previous UTC day', () => {
  // 2026-08-24 20:30:00 UTC == 2026-08-25 02:00:00 IST
  const earlyMorningIso = '2026-08-24T20:30:00.000Z';
  const dateInfo = parseEventTime(earlyMorningIso, null, 'deadline');
  assert.ok(dateInfo, 'Must return valid dateInfo');
  assert.strictEqual(dateInfo.start.date, '2026-08-25', 'Must be August 25 in IST, not August 24');
  assert.strictEqual(dateInfo.end.date, '2026-08-26');
});

test('parseEventTime: returns clean timed format for talks, interviews, and OAs in IST', () => {
  const dateInfo = parseEventTime('2026-08-20T08:00:00.000Z', '1:30 PM', 'talk');
  assert.ok(dateInfo, 'Must return valid dateInfo');
  assert.strictEqual(dateInfo.allDay, false);
  assert.strictEqual(dateInfo.start.dateTime, '2026-08-20T13:30:00+05:30');
  assert.strictEqual(dateInfo.start.date, undefined, 'start must NOT have date');
  assert.strictEqual(dateInfo.end.dateTime, '2026-08-20T14:30:00+05:30');
  assert.strictEqual(dateInfo.end.date, undefined, 'end must NOT have date');
  assert.strictEqual(dateInfo.start.timeZone, 'Asia/Kolkata');
  assert.strictEqual(dateInfo.end.timeZone, 'Asia/Kolkata');
});

test('parseEventTime: timed OA duration is 120 minutes with proper IST rollover', () => {
  const dateInfo = parseEventTime('2026-08-20T00:00:00.000Z', '10:00 AM', 'oa');
  assert.ok(dateInfo, 'Must return valid dateInfo');
  assert.strictEqual(dateInfo.start.dateTime, '2026-08-20T10:00:00+05:30');
  assert.strictEqual(dateInfo.end.dateTime, '2026-08-20T12:00:00+05:30');
});

test('parseEventTime: midnight rollover for late-night timed events in IST', () => {
  const dateInfo = parseEventTime('2026-08-20T00:00:00.000Z', '11:30 PM', 'oa');
  assert.ok(dateInfo, 'Must return valid dateInfo');
  assert.strictEqual(dateInfo.start.dateTime, '2026-08-20T23:30:00+05:30');
  assert.strictEqual(dateInfo.end.dateTime, '2026-08-21T01:30:00+05:30', 'Must rollover to next day in IST');
});

test('parseEventTime: timezone invariance across simulated process.env.TZ', () => {
  const sampleInputs = [
    { date: '2026-08-25T18:29:00.000Z', time: null, type: 'deadline' },
    { date: '2026-08-24T20:30:00.000Z', time: null, type: 'deadline' },
    { date: '2026-08-20T08:00:00.000Z', time: '2:30 PM', type: 'interview' },
    { date: '2026-08-20T00:00:00.000Z', time: '10:00 AM', type: 'oa' },
  ];

  const origTz = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const resultsUtc = sampleInputs.map(s => parseEventTime(s.date, s.time, s.type));

    process.env.TZ = 'Asia/Kolkata';
    const resultsIst = sampleInputs.map(s => parseEventTime(s.date, s.time, s.type));

    process.env.TZ = 'America/New_York';
    const resultsNy = sampleInputs.map(s => parseEventTime(s.date, s.time, s.type));

    assert.deepStrictEqual(resultsUtc, resultsIst, 'UTC and IST runs must produce identical results');
    assert.deepStrictEqual(resultsUtc, resultsNy, 'UTC and NY runs must produce identical results');
  } finally {
    process.env.TZ = origTz;
  }
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

test('code verification: calendarService.js must NOT hard-delete applications on soft-delete', () => {
  const serviceCode = fs.readFileSync(path.join(__dirname, '../utils/calendarService.js'), 'utf-8');
  assert.ok(!serviceCode.includes('Application.deleteOne'), 'Application.deleteOne must NOT be present in calendarService.js');
});

test('getCalendarListForAccount: returns primary fallback for users with only calendar.events scope without calling API', async () => {
  let listApiCalled = false;
  const mockClient = {
    calendarList: {
      list: async () => {
        listApiCalled = true;
        return { data: { items: [] } };
      }
    }
  };

  const account = {
    tokens: {
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events openid'
    }
  };

  const calendars = await getCalendarListForAccount(account, mockClient);
  assert.strictEqual(listApiCalled, false, 'calendarList.list must NOT be called for calendar.events-only users');
  assert.strictEqual(calendars.length, 1);
  assert.strictEqual(calendars[0].id, 'primary');
  assert.strictEqual(calendars[0].primary, true);
});

test('getCalendarListForAccount: calls calendarList.list when calendar.readonly scope is present', async () => {
  let listApiCalled = false;
  const mockClient = {
    calendarList: {
      list: async () => {
        listApiCalled = true;
        return {
          data: {
            items: [
              { id: 'primary', summary: 'My Primary', primary: true },
              { id: 'custom_cal_123', summary: 'Placements Calendar', primary: false }
            ]
          }
        };
      }
    }
  };

  const account = {
    tokens: {
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly'
    }
  };

  const calendars = await getCalendarListForAccount(account, mockClient);
  assert.strictEqual(listApiCalled, true, 'calendarList.list must be called when calendar.readonly is present');
  assert.strictEqual(calendars.length, 2);
  assert.strictEqual(calendars[1].id, 'custom_cal_123');
  assert.strictEqual(calendars[1].summary, 'Placements Calendar');
});

test('getCalendarListForAccount: calls calendarList.list when full calendar scope is present', async () => {
  let listApiCalled = false;
  const mockClient = {
    calendarList: {
      list: async () => {
        listApiCalled = true;
        return {
          data: {
            items: [
              { id: 'primary', summary: 'Primary Calendar', primary: true }
            ]
          }
        };
      }
    }
  };

  const account = {
    tokens: {
      scope: 'https://www.googleapis.com/auth/calendar'
    }
  };

  const calendars = await getCalendarListForAccount(account, mockClient);
  assert.strictEqual(listApiCalled, true, 'calendarList.list must be called when calendar scope is present');
  assert.strictEqual(calendars.length, 1);
});

test('syncAppToCalendar: soft-deleted application deletes Google Calendar event and preserves DB record', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  let deleteCalledWith = null;
  google.calendar = () => ({
    events: {
      delete: async (params) => {
        deleteCalledWith = params;
        return {};
      }
    }
  });

  let saved = false;
  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Google',
    isDeleted: true,
    calendarEventId: 'event_to_delete_123',
    needsCalendarSync: true,
    save: async () => { saved = true; }
  };

  const account = {
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.ok(deleteCalledWith, 'calendar.events.delete must be called');
    assert.strictEqual(deleteCalledWith.eventId, 'event_to_delete_123');
    assert.strictEqual(app.calendarEventId, null, 'calendarEventId must be cleared');
    assert.strictEqual(app.needsCalendarSync, false, 'needsCalendarSync must be false');
    assert.strictEqual(app.isDeleted, true, 'isDeleted must remain true');
    assert.strictEqual(saved, true, 'Application must be saved in MongoDB, not deleted');
  } finally {
    google.calendar = origCalendar;
  }
});

test('syncAppToCalendar: recovers when Google Calendar event is deleted externally (404/410)', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  let updateAttempted = false;
  let insertAttempted = false;
  let listAttempted = false;

  google.calendar = () => ({
    events: {
      update: async () => {
        updateAttempted = true;
        const err = new Error('Resource has been deleted');
        err.status = 410;
        throw err;
      },
      list: async () => {
        listAttempted = true;
        return { data: { items: [] } };
      },
      insert: async (params) => {
        insertAttempted = true;
        return { data: { id: 'recreated_event_id_456' } };
      }
    }
  });

  let saved = false;
  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Amazon',
    role: 'SDE-1',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-10-15T18:29:00.000Z',
    calendarEventId: 'stale_event_id_123',
    calendarPayloadHash: 'old_hash',
    needsCalendarSync: true,
    save: async () => { saved = true; }
  };

  const account = {
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.ok(updateAttempted, 'Update must be attempted first');
    assert.ok(listAttempted, 'List fallback must be queried when stale ID is cleared');
    assert.ok(insertAttempted, 'Insert must be called to recreate the event');
    assert.strictEqual(app.calendarEventId, 'recreated_event_id_456', 'New event ID must be persisted');
    assert.strictEqual(app.needsCalendarSync, false, 'needsCalendarSync must be false');
    assert.strictEqual(app.calendarSyncError, null, 'Error must be cleared on successful recovery');
    assert.strictEqual(saved, true, 'Updated app state must be saved to DB');
  } finally {
    google.calendar = origCalendar;
  }
});


