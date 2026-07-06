const { google } = require("googleapis");
const crypto = require("crypto");
const Application = require("../models/Application");

const CALENDAR_SYNC_VERSION = 1;

/**
 * Normalizes input strings (case-insensitive, strips common suffixes, collapses spaces)
 * to build a deterministic event fingerprint.
 */
function normalizeString(str, type = "generic") {
  if (!str) return "";
  let clean = str.toLowerCase().trim();

  if (type === "company") {
    // Remove corporate designators
    clean = clean.replace(/\b(inc|ltd|corp|co|llc|gmbh|sa|pvt|private|limited|corporation)\b/g, "");
  } else if (type === "role") {
    // Remove common filler words
    clean = clean.replace(/\b(hiring|opportunity|role|position|job|test|assessment|interview|oa)\b/g, "");
  }

  // Remove all non-alphanumeric characters and collapse spaces
  return clean.replace(/[^a-z0-9]/g, "").replace(/\s+/g, "");
}

/**
 * Helper to get a field value from displayFields first, falling back to legacy flat fields.
 */
function getAppField(app, label, fallbackVal) {
  if (app && Array.isArray(app.displayFields) && app.displayFields.length > 0) {
    const f = app.displayFields.find(df => 
      new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i').test(df.label)
    );
    if (f?.value) return f.value;
  }
  return fallbackVal || "";
}

/**
 * Generates a SHA-256 fingerprint for the calendar event to prevent duplicates.
 */
function generateEventFingerprint(app, eventType, dateString) {
  const normCompany = normalizeString(app.company, "company");
  const normRole = normalizeString(getAppField(app, "Role", app.role) || app.subtitle, "role");
  const cleanDate = dateString ? dateString.substring(0, 10) : "no-date";

  const rawKey = `${normCompany}_${normRole}_${eventType}_${cleanDate}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Formats date and time components into proper Google Calendar API formats.
 */
function parseEventTime(dateInput, timeInput, eventType, roleName) {
  if (!dateInput) return null;
  const baseDate = new Date(dateInput);
  if (isNaN(baseDate.getTime())) return null;

  // Setup start time based on event type
  let startHour = 9;
  let startMinute = 0;

  if (timeInput) {
    const timeMatch = timeInput.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      let m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3];

      if (meridiem) {
        if (meridiem.toLowerCase() === "pm" && h !== 12) h += 12;
        if (meridiem.toLowerCase() === "am" && h === 12) h = 0;
      }
      startHour = h;
      startMinute = m;
    }
  }

  // Set start
  const start = new Date(baseDate);
  start.setHours(startHour, startMinute, 0, 0);

  // Set end (default 1 hour duration)
  const end = new Date(start);
  end.setHours(start.getHours() + 1);

  // Convert to Google RFC 3339 format (timezone offset is added)
  // Ensure we are outputting in local IST timezone format
  const pad = (num) => String(num).padStart(2, "0");
  const getOffsetString = (d) => {
    // Hardcoded to Asia/Kolkata (IST) +05:30 for server-independent stability
    return "+05:30";
  };

  const toRfc3339 = (d) => {
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${getOffsetString(d)}`;
  };

  return {
    start: { dateTime: toRfc3339(start), timeZone: "Asia/Kolkata" },
    end: { dateTime: toRfc3339(end), timeZone: "Asia/Kolkata" }
  };
}

/**
 * Builds Google Calendar resource payload object.
 */
function buildEventPayload(app, eventType, dateInfo, fingerprint) {
  const role = getAppField(app, "Role", app.role);
  const summary = `[${app.company}] ${app.subtitle || role || "Hiring Event"}`;
  
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const appDeepLink = `${frontendUrl}/?id=${app._id}`;

  let descriptionHtml = `<b>Company:</b> ${app.company}<br>`;
  if (role) descriptionHtml += `<b>Role:</b> ${role}<br>`;
  if (app.subtitle) descriptionHtml += `<b>Program Details:</b> ${app.subtitle}<br>`;
  
  const deadlineText = getAppField(app, "Deadline", app.deadlineText);
  if (deadlineText) descriptionHtml += `<b>Deadline:</b> ${deadlineText}<br>`;
  
  const venue = getAppField(app, "Location", getAppField(app, "Venue", app.venue));
  if (venue) descriptionHtml += `<b>Venue/Location:</b> ${venue}<br>`;
  
  if (app.skills && app.skills.length > 0) {
    descriptionHtml += `<b>Skills:</b> ${app.skills.join(", ")}<br>`;
  }
  
  descriptionHtml += `<br><a href="${appDeepLink}">View in Email Tracker Dashboard</a>`;
  if (app.link) {
    descriptionHtml += ` | <a href="${app.link}">Direct Registration/Application Link</a>`;
  }

  if (app.note) {
    descriptionHtml += `<br><br><b>Personal Notes:</b><br>${app.note.replace(/\n/g, "<br>")}`;
  }

  // Setup specific reminders based on type (Only for application deadlines)
  let reminderConfig = { useDefault: false, overrides: [] };
  if (eventType === "deadline") {
    reminderConfig.overrides = [
      { method: "popup", minutes: 1440 }, // 1 day before
      { method: "popup", minutes: 120 }   // 2 hours before
    ];
  }

  return {
    summary,
    description: descriptionHtml,
    start: dateInfo.start,
    end: dateInfo.end,
    reminders: reminderConfig,
    extendedProperties: {
      private: {
        applicationId: app._id.toString(),
        fingerprint: fingerprint,
        syncVersion: CALENDAR_SYNC_VERSION.toString(),
        eventType: eventType
      }
    }
  };
}

/**
 * Creates an MD5 hash of event payload properties to detect changes locally.
 */
function computePayloadHash(payload) {
  const stable = {
    summary: payload.summary,
    description: payload.description,
    start: payload.start,
    end: payload.end,
    reminders: payload.reminders
  };
  return crypto.createHash("md5").update(JSON.stringify(stable)).digest("hex");
}

/**
 * Synchronizes an Application event to the user's primary Google Calendar.
 */
async function syncAppToCalendar(account, app) {
  // Check if calendar sync is enabled
  if (!account.calendarSyncEnabled) {
    app.calendarSyncStatus = "disabled";
    app.needsCalendarSync = false;
    await app.save();
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(account.tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // 1. Resolve date and event type
  let dateInput = app.deadlineISO || app.testDate || app.eventDate || app.date;
  let timeInput = app.eventTime || app.reportingTime || null;
  let eventType = "deadline";

  const roleVal = getAppField(app, "Role", app.role);
  if (app.classification === "Interview Schedule") {
    eventType = "interview";
  } else if (app.classification === "Assessment Announcement" || (roleVal && roleVal.toLowerCase().includes("oa"))) {
    eventType = "oa";
  } else if (app.classification === "Workshop / Webinar" || app.classification === "Expert Talk Series") {
    eventType = "talk";
  }

  const dateInfo = parseEventTime(dateInput, timeInput, eventType, roleVal);
  if (!dateInfo) {
    // If no valid date matches, we cannot create a calendar event
    app.needsCalendarSync = false;
    app.calendarSyncError = "No valid date found for application";
    await app.save();
    return;
  }

  // 2. Generate fingerprint and payload
  const fingerprint = generateEventFingerprint(app, eventType, dateInput.toISOString ? dateInput.toISOString() : dateInput.toString());
  const payload = buildEventPayload(app, eventType, dateInfo, fingerprint);
  const payloadHash = computePayloadHash(payload);

  try {
    // Check if soft-deleted
    if (app.isDeleted) {
      if (app.calendarEventId) {
        console.log(`[CALENDAR_SYNC] Deleting event ${app.calendarEventId} for soft-deleted application ${app._id}`);
        await calendar.events.delete({
          calendarId: "primary",
          eventId: app.calendarEventId
        });
      }
      // Remove application permanently from DB after successful deletion from Google Calendar
      await Application.deleteOne({ _id: app._id });
      console.log(`[CALENDAR_SYNC] Successfully deleted application ${app._id} from DB`);
      return;
    }

    // Check if event already exists locally & has not changed
    if (app.calendarEventId && app.calendarPayloadHash === payloadHash && app.calendarSyncVersion === CALENDAR_SYNC_VERSION) {
      console.log(`[CALENDAR_SYNC] Skipping sync for application ${app._id} - payload hash unchanged`);
      app.needsCalendarSync = false;
      app.calendarSyncError = null;
      await app.save();
      return;
    }

    let eventId = app.calendarEventId;

    if (eventId) {
      // Patch existing event
      console.log(`[CALENDAR_SYNC] Patching event ${eventId} for application ${app._id}`);
      await calendar.events.patch({
        calendarId: "primary",
        eventId: eventId,
        resource: payload
      });
    } else {
      // Perform fingerprint lookup to prevent duplicate events on primary calendar
      console.log(`[CALENDAR_SYNC] Checking fingerprint ${fingerprint} for application ${app._id}`);
      const listResponse = await calendar.events.list({
        calendarId: "primary",
        privateExtendedProperty: `fingerprint=${fingerprint}`
      });

      const existingEvent = listResponse.data.items && listResponse.data.items[0];

      if (existingEvent) {
        eventId = existingEvent.id;
        console.log(`[CALENDAR_SYNC] Found existing calendar event ${eventId} via fingerprint lookup`);
        await calendar.events.patch({
          calendarId: "primary",
          eventId: eventId,
          resource: payload
        });
      } else {
        // Insert new event
        console.log(`[CALENDAR_SYNC] Creating new calendar event for application ${app._id}`);
        const insertRes = await calendar.events.insert({
          calendarId: "primary",
          resource: payload
        });
        eventId = insertRes.data.id;
      }
    }

    // 3. Update database sync status fields
    app.calendarEventId = eventId;
    app.calendarEventFingerprint = fingerprint;
    app.calendarPayloadHash = payloadHash;
    app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
    app.calendarLastSyncedAt = new Date();
    app.needsCalendarSync = false;
    app.calendarSyncError = null;
    await app.save();
    console.log(`[CALENDAR_SYNC] Sync success for application ${app._id}`);

  } catch (err) {
    console.error(`[CALENDAR_SYNC] Error syncing application ${app._id}:`, err.message);
    app.calendarSyncError = err.message;
    
    // Set to failed/disabled if user revoked permission or has insufficient scope
    const errLower = (err.message || "").toLowerCase();
    const isAuthError = err.status === 401 || 
                        err.status === 403 || 
                        errLower.includes("invalid_grant") || 
                        errLower.includes("insufficient") || 
                        errLower.includes("scope");
                        
    if (isAuthError) {
      app.needsCalendarSync = false;
      
      // Auto-disable calendar sync on account level due to missing/revoked scopes
      account.calendarSyncEnabled = false;
      account.syncError = `Google Calendar permissions missing: ${err.message}`;
      await account.save().catch(saveErr => console.error("[CALENDAR_SYNC] Failed to update account sync status:", saveErr.message));
      console.log(`[CALENDAR_SYNC] Auto-disabled calendar sync for account: ${account.email} due to auth scope error`);
    }
    await app.save();
  }
}

async function processCalendarSyncQueue(account) {
  if (!account.calendarSyncEnabled) {
    console.log(`[CALENDAR_QUEUE] Sync disabled for user ${account.email}`);
    return;
  }

  try {
    const apps = await Application.find({
      userId: account._id,
      $or: [
        { needsCalendarSync: true },
        { calendarSyncVersion: { $lt: CALENDAR_SYNC_VERSION } }
      ]
    });

    if (apps.length === 0) {
      console.log(`[CALENDAR_QUEUE] No pending calendar events to sync for ${account.email}`);
      return;
    }

    console.log(`[CALENDAR_QUEUE] Syncing ${apps.length} pending events for ${account.email}`);
    
    for (const app of apps) {
      await syncAppToCalendar(account, app);
    }
    console.log(`[CALENDAR_QUEUE] Completed sync sweep for ${account.email}`);
  } catch (err) {
    console.error(`[CALENDAR_QUEUE] Queue sync failed for ${account.email}:`, err.message);
  }
}

module.exports = {
  syncAppToCalendar,
  processCalendarSyncQueue,
  CALENDAR_SYNC_VERSION
};
