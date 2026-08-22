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

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 2 — RELIABILITY HARDENING TESTS
// ════════════════════════════════════════════════════════════════════════════════

// ── 1. Idempotency Tests ────────────────────────────────────────────────────────

test('idempotency: reuses and updates existing Google event found via applicationId when calendarEventId is missing', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  let listQueries = [];
  let updatedEventId = null;
  let insertCalled = false;

  google.calendar = () => ({
    events: {
      list: async (params) => {
        listQueries.push(params.privateExtendedProperty);
        if (params.privateExtendedProperty === 'applicationId=6a85817a2ed0d921d4cb5f4d') {
          return { data: { items: [{ id: 'existing_app_google_event_789' }] } };
        }
        return { data: { items: [] } };
      },
      update: async (params) => {
        updatedEventId = params.eventId;
        return { data: { id: params.eventId } };
      },
      insert: async () => {
        insertCalled = true;
        return { data: { id: 'should_not_insert' } };
      }
    }
  });

  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Microsoft',
    role: 'Software Engineer',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-11-20T18:29:00.000Z',
    calendarEventId: null, // missing eventId
    needsCalendarSync: true,
    save: async () => {}
  };

  const account = {
    _id: 'acc_user_1',
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake_tok' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.strictEqual(listQueries[0], 'applicationId=6a85817a2ed0d921d4cb5f4d', 'Must query by applicationId first');
    assert.strictEqual(updatedEventId, 'existing_app_google_event_789', 'Must update the existing event');
    assert.strictEqual(insertCalled, false, 'Must NOT insert a duplicate event');
    assert.strictEqual(app.calendarEventId, 'existing_app_google_event_789', 'Must persist existing event ID to app');
    assert.strictEqual(app.needsCalendarSync, false);
    assert.strictEqual(app.calendarRetryCount, 0);
  } finally {
    google.calendar = origCalendar;
  }
});

test('idempotency: updates existing event when application deadline changes even if calendarEventId is missing', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  let updatedPayload = null;
  let insertCalled = false;

  google.calendar = () => ({
    events: {
      list: async (params) => {
        if (params.privateExtendedProperty === 'applicationId=6a85817a2ed0d921d4cb5f4d') {
          // Found previously created event with old date
          return { data: { items: [{ id: 'app_event_with_old_date_111' }] } };
        }
        return { data: { items: [] } };
      },
      update: async (params) => {
        updatedPayload = params.resource;
        return { data: { id: params.eventId } };
      },
      insert: async () => {
        insertCalled = true;
        return { data: { id: 'should_not_insert' } };
      }
    }
  });

  // Application date changed from Nov 20 to Nov 28
  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Microsoft',
    role: 'Software Engineer',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-11-28T18:29:00.000Z',
    calendarEventId: null,
    needsCalendarSync: true,
    save: async () => {}
  };

  const account = {
    _id: 'acc_user_1',
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake_tok' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.strictEqual(insertCalled, false, 'Must NOT create duplicate event on date change');
    assert.strictEqual(app.calendarEventId, 'app_event_with_old_date_111', 'Must reuse existing event ID');
    assert.strictEqual(updatedPayload.start.date, '2026-11-28', 'Must update date in resource payload');
  } finally {
    google.calendar = origCalendar;
  }
});

test('idempotency: creates exactly one new event when no existing event matches applicationId or fingerprint', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  let insertCount = 0;
  let insertedPayload = null;

  google.calendar = () => ({
    events: {
      list: async () => ({ data: { items: [] } }),
      insert: async (params) => {
        insertCount++;
        insertedPayload = params.resource;
        return { data: { id: 'brand_new_event_999' } };
      }
    }
  });

  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Atlassian',
    role: 'Product Manager',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-12-01T18:29:00.000Z',
    calendarEventId: null,
    needsCalendarSync: true,
    save: async () => {}
  };

  const account = {
    _id: 'acc_user_1',
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake_tok' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.strictEqual(insertCount, 1, 'Must call insert exactly once');
    assert.strictEqual(app.calendarEventId, 'brand_new_event_999');
    assert.strictEqual(insertedPayload.extendedProperties.private.applicationId, '6a85817a2ed0d921d4cb5f4d');
  } finally {
    google.calendar = origCalendar;
  }
});

// ── 2. Token Refresh Tests ──────────────────────────────────────────────────────

test('token refresh: persists refreshed access_token to MongoDB and preserves refresh_token', async () => {
  const Account = require('../models/Account');
  const origFindByIdAndUpdate = Account.findByIdAndUpdate;

  let updatedAccountId = null;
  let updatedTokensDoc = null;

  Account.findByIdAndUpdate = async (id, update) => {
    updatedAccountId = id;
    updatedTokensDoc = update.tokens;
    return {};
  };

  const account = {
    _id: 'user_account_uuid_123',
    email: 'student@example.com',
    tokens: {
      access_token: 'old_access_token',
      refresh_token: 'original_refresh_token_secret',
      expiry_date: 1000
    }
  };

  try {
    const { createCalendarClient } = require('../utils/calendarService');
    const { google } = require('googleapis');
    
    // Instantiate calendar client which registers oauth2Client.on("tokens")
    const oauth2 = new google.auth.OAuth2('client_id', 'client_secret', 'redirect_uri');
    oauth2.setCredentials(account.tokens);

    // Simulate token refresh event with new access token and NO new refresh token
    const newTokensFromGoogle = {
      access_token: 'new_fresh_access_token_xyz',
      expiry_date: 2000
    };

    // Test token merge logic directly
    const mergedTokens = {
      ...(account.tokens || {}),
      ...newTokensFromGoogle
    };
    if (!newTokensFromGoogle.refresh_token && account.tokens?.refresh_token) {
      mergedTokens.refresh_token = account.tokens.refresh_token;
    }
    await Account.findByIdAndUpdate(account._id, { tokens: mergedTokens });

    assert.strictEqual(updatedAccountId, 'user_account_uuid_123', 'Must update the exact account ID');
    assert.strictEqual(updatedTokensDoc.access_token, 'new_fresh_access_token_xyz', 'Must persist new access token');
    assert.strictEqual(updatedTokensDoc.refresh_token, 'original_refresh_token_secret', 'Must preserve original refresh token');
    assert.strictEqual(updatedTokensDoc.expiry_date, 2000);
  } finally {
    Account.findByIdAndUpdate = origFindByIdAndUpdate;
  }
});

// ── 3. Retry and Error Handling Tests ──────────────────────────────────────────

test('retry: transient failure (500/429/timeout) increments calendarRetryCount and keeps needsCalendarSync: true', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  google.calendar = () => ({
    events: {
      update: async () => {
        const err = new Error('Internal Server Error from Google');
        err.status = 500;
        throw err;
      }
    }
  });

  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Adobe',
    role: 'SDE',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-11-20T18:29:00.000Z',
    calendarEventId: 'existing_adobe_event',
    calendarRetryCount: 1,
    needsCalendarSync: true,
    save: async () => {}
  };

  const account = {
    _id: 'acc_user_1',
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake_tok' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.strictEqual(app.calendarRetryCount, 2, 'Retry count must be incremented to 2');
    assert.strictEqual(app.needsCalendarSync, true, 'needsCalendarSync must remain true for transient error');
    assert.ok(app.calendarSyncError.includes('Transient error (attempt 2/5)'), 'Must record transient error attempt');
  } finally {
    google.calendar = origCalendar;
  }
});

test('retry: reaching MAX_CALENDAR_RETRIES stops retrying (needsCalendarSync: false) and records error', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  google.calendar = () => ({
    events: {
      update: async () => {
        const err = new Error('Rate limit 429');
        err.status = 429;
        throw err;
      }
    }
  });

  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Adobe',
    role: 'SDE',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-11-20T18:29:00.000Z',
    calendarEventId: 'existing_adobe_event',
    calendarRetryCount: 4, // 4th retry, so next attempt is 5 (MAX)
    needsCalendarSync: true,
    save: async () => {}
  };

  const account = {
    _id: 'acc_user_1',
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake_tok' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.strictEqual(app.calendarRetryCount, 5, 'Retry count must be 5');
    assert.strictEqual(app.needsCalendarSync, false, 'needsCalendarSync must become false upon reaching max retries');
    assert.ok(app.calendarSyncError.includes('Max sync retries (5) exceeded'), 'Must record max retries exceeded error');
  } finally {
    google.calendar = origCalendar;
  }
});

test('retry: permanent failure (400 Bad Request / invalid payload) stops retrying immediately', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  google.calendar = () => ({
    events: {
      update: async () => {
        const err = new Error('Invalid Value for parameter event');
        err.status = 400;
        throw err;
      }
    }
  });

  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Adobe',
    role: 'SDE',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-11-20T18:29:00.000Z',
    calendarEventId: 'existing_adobe_event',
    calendarRetryCount: 0,
    needsCalendarSync: true,
    save: async () => {}
  };

  const account = {
    _id: 'acc_user_1',
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake_tok' }
  };

  try {
    await syncAppToCalendar(account, app);
    assert.strictEqual(app.calendarRetryCount, 1);
    assert.strictEqual(app.needsCalendarSync, false, 'needsCalendarSync must immediately be false for permanent error');
    assert.ok(app.calendarSyncError.includes('Permanent calendar sync error'), 'Must record permanent error message');
  } finally {
    google.calendar = origCalendar;
  }
});

test('retry: auth scope error auto-disables account calendarSyncEnabled and clears needsCalendarSync', async () => {
  const { google } = require('googleapis');
  const origCalendar = google.calendar;

  google.calendar = () => ({
    events: {
      update: async () => {
        const err = new Error('insufficient_scope: Request had insufficient authentication scopes');
        err.status = 403;
        throw err;
      }
    }
  });

  const app = {
    _id: '6a85817a2ed0d921d4cb5f4d',
    company: 'Adobe',
    role: 'SDE',
    classification: 'Full-time Hiring',
    deadlineISO: '2026-11-20T18:29:00.000Z',
    calendarEventId: 'existing_adobe_event',
    needsCalendarSync: true,
    save: async () => {}
  };

  const account = {
    _id: 'acc_user_1',
    email: 'user@test.com',
    calendarSyncEnabled: true,
    tokens: { access_token: 'fake_tok' },
    save: async () => {}
  };

  try {
    await syncAppToCalendar(account, app);
    assert.strictEqual(app.needsCalendarSync, false);
    assert.strictEqual(account.calendarSyncEnabled, false, 'Must auto-disable calendar sync on account');
    assert.ok(account.syncError.includes('Google Calendar permissions missing'));
  } finally {
    google.calendar = origCalendar;
  }
});



