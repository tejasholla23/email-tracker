const { google } = require("googleapis");
const crypto = require("crypto");
const Application = require("../models/Application");
const Account = require("../models/Account");

const CALENDAR_SYNC_VERSION = 2;
const MAX_CALENDAR_RETRIES = 5;
const activeCalendarSyncs = new Set();

/**
 * Creates an authenticated Google Calendar client with automatic token persistence.
 */
function createCalendarClient(account) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(account.tokens);

  oauth2Client.on("tokens", async (newTokens) => {
    try {
      const updatedTokens = {
        ...(account.tokens || {}),
        ...newTokens,
      };
      // Preserve existing refresh_token if Google does not return a replacement
      if (!newTokens.refresh_token && account.tokens?.refresh_token) {
        updatedTokens.refresh_token = account.tokens.refresh_token;
      }
      await Account.findByIdAndUpdate(account._id, { tokens: updatedTokens });
      account.tokens = updatedTokens;
      console.log(`[CALENDAR_TOKEN_REFRESH_PERSISTED] Refreshed tokens persisted for ${account.email}`);
    } catch (tokenErr) {
      console.error(`[CALENDAR_TOKEN_REFRESH_FAILED] Failed to persist tokens for ${account.email}:`, tokenErr.message);
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Resolve which calendar ID to use for operations.
 * Priority: per-account setting (account.calendarTargetId) -> env var GOOGLE_CALENDAR_ID -> "primary"
 */
function resolveCalendarId(account) {
  return (account && account.calendarTargetId) || process.env.GOOGLE_CALENDAR_ID || "primary";
}

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
      new RegExp(`^${label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i').test(df.label)
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

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Formats date and time components into proper Google Calendar API formats.
 * Returns either an all-day event or a timed event depending on eventType.
 * All computations are timezone-independent and explicitly projected into Asia/Kolkata (IST).
 *
 * @param {string|Date} dateInput - The date to use for the event
 * @param {string|null} timeInput - Optional explicit time string (e.g. "2:30 PM")
 * @param {string} eventType - One of: "deadline", "interview", "oa", "talk"
 * @returns {object|null} Google Calendar start/end object, or null if invalid
 */
function parseEventTime(dateInput, timeInput, eventType) {
  if (!dateInput) return null;
  const baseDate = new Date(dateInput);
  if (isNaN(baseDate.getTime())) return null;

  const pad = (num) => String(num).padStart(2, "0");

  // Project baseDate into IST (Asia/Kolkata: UTC+05:30) using pure UTC arithmetic
  const istTimeMs = baseDate.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istTimeMs);

  const y = istDate.getUTCFullYear();
  const m = pad(istDate.getUTCMonth() + 1);
  const d = pad(istDate.getUTCDate());

  // ── ALL-DAY events for deadlines ──────────────────────────────────────────
  // Deadlines are "last date to apply" — they make most sense as all-day events
  // with reminders, not as 1-hour timed slots.
  if (eventType === "deadline") {
    const startDate = `${y}-${m}-${d}`;
    // All-day events use exclusive end date (next day in IST)
    const nextDayIst = new Date(istTimeMs + 24 * 60 * 60 * 1000);
    const ey = nextDayIst.getUTCFullYear();
    const em = pad(nextDayIst.getUTCMonth() + 1);
    const ed = pad(nextDayIst.getUTCDate());
    const endDate = `${ey}-${em}-${ed}`;

    return {
      allDay: true,
      start: { date: startDate },
      end: { date: endDate }
    };
  }

  // ── TIMED events for interviews, OAs, talks ───────────────────────────────
  let startHour = 9;
  let startMinute = 0;

  if (timeInput) {
    // Strip ordinal date numbers (e.g. 3rd, 1st, 22nd) and month names to prevent false positive hour matches
    const cleanedTimeInput = timeInput
      .replace(/\b\d{1,2}(st|nd|rd|th)\b/gi, "")
      .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, "");

    // Match patterns like "10:30 AM", "10:30", "10 AM", "10.30 AM"
    const timeMatch = cleanedTimeInput.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i) 
      || cleanedTimeInput.match(/(\d{1,2}):(\d{2})/);

    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      let min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3];
      if (meridiem) {
        if (meridiem.toLowerCase() === "pm" && h !== 12) h += 12;
        if (meridiem.toLowerCase() === "am" && h === 12) h = 0;
      }
      if (h >= 0 && h < 24 && min >= 0 && min < 60) {
        startHour = h;
        startMinute = min;
      }
    }
  }

  // Duration depends on event type
  let durationMinutes = 60; // default 1 hour
  if (eventType === "oa") durationMinutes = 120;       // OA: 2 hours
  if (eventType === "interview") durationMinutes = 45;  // Interview: 45 min

  const startIso = `${y}-${m}-${d}T${pad(startHour)}:${pad(startMinute)}:00+05:30`;

  // Compute end time using pure UTC millisecond arithmetic
  const startUtcMs = Date.UTC(y, parseInt(m, 10) - 1, parseInt(d, 10), startHour, startMinute, 0) - IST_OFFSET_MS;
  const endUtcMs = startUtcMs + durationMinutes * 60 * 1000;
  const endIstDate = new Date(endUtcMs + IST_OFFSET_MS);

  const ey = endIstDate.getUTCFullYear();
  const em = pad(endIstDate.getUTCMonth() + 1);
  const ed = pad(endIstDate.getUTCDate());
  const eh = pad(endIstDate.getUTCHours());
  const emin = pad(endIstDate.getUTCMinutes());
  const endIso = `${ey}-${em}-${ed}T${eh}:${emin}:00+05:30`;

  return {
    allDay: false,
    start: { dateTime: startIso, timeZone: "Asia/Kolkata" },
    end: { dateTime: endIso, timeZone: "Asia/Kolkata" }
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Formats a date (and optional time) into an absolute IST string.
 * All computations are timezone-independent and explicitly projected into Asia/Kolkata (IST).
 *
 * @param {string|Date} dateInput - Raw date string or Date object
 * @param {string|null} timeInput - Raw time string or text containing time
 * @param {boolean} isTimed - Whether event is timed (if true, defaults to 9:00 AM if no time parsed)
 * @returns {string} e.g. "August 22, 2026 · 12:30 PM IST" or "August 22, 2026"
 */
function formatAbsoluteDateIST(dateInput, timeInput = null, isTimed = false) {
  if (!dateInput) return "";
  const baseDate = new Date(dateInput);
  if (isNaN(baseDate.getTime())) return "";

  // Project into IST (UTC+05:30) via pure UTC arithmetic
  const istTimeMs = baseDate.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istTimeMs);

  const y = istDate.getUTCFullYear();
  const m = MONTH_NAMES[istDate.getUTCMonth()];
  const d = istDate.getUTCDate();

  let timeString = "";

  if (timeInput) {
    const cleanedTimeInput = String(timeInput)
      .replace(/\b\d{1,2}(st|nd|rd|th)\b/gi, "")
      .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, "");

    const timeMatch = cleanedTimeInput.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i) 
      || cleanedTimeInput.match(/(\d{1,2}):(\d{2})/);

    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      let min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3];
      if (meridiem) {
        if (meridiem.toLowerCase() === "pm" && h !== 12) h += 12;
        if (meridiem.toLowerCase() === "am" && h === 12) h = 0;
      }
      if (h >= 0 && h < 24 && min >= 0 && min < 60) {
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        const ampm = h >= 12 ? "PM" : "AM";
        const minPad = String(min).padStart(2, "0");
        timeString = ` · ${hour12}:${minPad} ${ampm} IST`;
      }
    }
  }

  if (isTimed && !timeString) {
    timeString = " · 9:00 AM IST";
  }

  return `${m} ${d}, ${y}${timeString}`;
}

/**
 * Builds Google Calendar resource payload object with structured presentation.
 */
function buildEventPayload(app, eventType, dateInfo, fingerprint, dateInput = null, timeInput = null) {
  const role = getAppField(app, "Role", app.role);
  const effectiveDateInput = dateInput || (eventType === "deadline" ? app.deadlineISO : (app.testDate || app.eventDate || app.deadlineISO));
  const effectiveTimeInput = timeInput || app.eventTime || app.reportingTime || app.deadlineText || null;

  // ── 1. Event-Type-Aware Titles ────────────────────────────────────────────
  const titlePrefixes = {
    deadline: "⏰ Deadline",
    oa: "🧪 Online Assessment",
    interview: "🎤 Interview",
    talk: "📢 PPT"
  };
  const prefix = titlePrefixes[eventType] || "📋 Hiring Event";
  const programOrRole = app.subtitle || role || "";

  let summary = "";
  if (programOrRole && programOrRole.toLowerCase().trim() !== (app.company || "").toLowerCase().trim()) {
    summary = `${prefix} · ${app.company} — ${programOrRole}`;
  } else {
    summary = `${prefix} · ${app.company}`;
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const appDeepLink = `${frontendUrl}/?id=${app._id}`;

  // ── 2. Event Description Hierarchy ────────────────────────────────────────
  const typeHeaders = {
    deadline: "APPLICATION DEADLINE",
    interview: "INTERVIEW",
    oa: "ONLINE ASSESSMENT",
    talk: "PRE-PLACEMENT TALK"
  };
  const headerTitle = typeHeaders[eventType] || "RECRUITMENT EVENT";

  let lines = [];
  lines.push(`<b>${headerTitle}</b><br>`);

  // Primary Information
  if (app.company) {
    lines.push(`<b>Company:</b> ${app.company}`);
  }
  if (role) {
    lines.push(`<b>Role:</b> ${role}`);
  }
  if (app.subtitle && app.subtitle !== role && app.subtitle !== app.company) {
    lines.push(`<b>Program:</b> ${app.subtitle}`);
  }

  // Primary Action / Date
  if (eventType === "deadline") {
    const formattedDeadline = formatAbsoluteDateIST(effectiveDateInput, effectiveTimeInput, false);
    if (formattedDeadline) {
      lines.push(`<b>Deadline:</b> ${formattedDeadline}`);
    }
  } else if (eventType === "interview") {
    const formattedInterview = formatAbsoluteDateIST(effectiveDateInput, effectiveTimeInput, true);
    if (formattedInterview) {
      lines.push(`<b>Interview:</b> ${formattedInterview}`);
    }
  } else if (eventType === "oa") {
    const formattedOa = formatAbsoluteDateIST(effectiveDateInput, effectiveTimeInput, true);
    if (formattedOa) {
      lines.push(`<b>Assessment:</b> ${formattedOa}`);
    }
  } else if (eventType === "talk") {
    const formattedTalk = formatAbsoluteDateIST(effectiveDateInput, effectiveTimeInput, true);
    if (formattedTalk) {
      lines.push(`<b>Event:</b> ${formattedTalk}`);
    }
  }

  // Primary Placement Details: CTC, Venue, Location
  let keyDetails = [];
  const ctc = getAppField(app, "CTC", app.salaryText);
  if (ctc) {
    keyDetails.push(`<b>CTC:</b> ${ctc}`);
  }
  const venue = getAppField(app, "Venue", app.venue);
  if (venue) {
    keyDetails.push(`<b>Venue:</b> ${venue}`);
  }
  const location = getAppField(app, "Location", "");
  if (location && location !== venue) {
    keyDetails.push(`<b>Location:</b> ${location}`);
  }

  if (keyDetails.length > 0) {
    lines.push(""); // blank line
    lines.push(...keyDetails);
  }

  // Additional Details Section
  let additionalDetails = [];

  // If this is a deadline event and there is an explicit recruitment event/test date
  if (eventType === "deadline" && (app.eventDate || app.testDate)) {
    const secondaryEventDate = app.eventDate || app.testDate;
    const formattedSecDate = formatAbsoluteDateIST(secondaryEventDate, app.eventTime || app.reportingTime, true);
    if (formattedSecDate && formattedSecDate !== formatAbsoluteDateIST(effectiveDateInput, effectiveTimeInput, false)) {
      additionalDetails.push(`• <b>Recruitment Event:</b> ${formattedSecDate}`);
    }
  }

  // If this is an interview/OA/talk event and there is a distinct application deadline
  if (eventType !== "deadline" && app.deadlineISO) {
    const formattedSecDeadline = formatAbsoluteDateIST(app.deadlineISO, app.deadlineText, false);
    if (formattedSecDeadline && formattedSecDeadline !== formatAbsoluteDateIST(effectiveDateInput, effectiveTimeInput, true)) {
      additionalDetails.push(`• <b>Application Deadline:</b> ${formattedSecDeadline}`);
    }
  }

  const stipend = getAppField(app, "Stipend", app.programStipend);
  if (stipend && stipend !== ctc) {
    additionalDetails.push(`• <b>Stipend:</b> ${stipend}`);
  }

  const branches = getAppField(app, "Eligible Branches", getAppField(app, "Branches", ""));
  if (branches) {
    additionalDetails.push(`• <b>Eligible Branches:</b> ${branches}`);
  }

  if (Array.isArray(app.skills) && app.skills.length > 0) {
    additionalDetails.push(`• <b>Skills:</b> ${app.skills.join(", ")}`);
  }

  // Remaining displayFields
  if (Array.isArray(app.displayFields) && app.displayFields.length > 0) {
    const skipLabels = new Set([
      "company", "role", "program", "program details", "deadline", "ctc", "salary", "stipend",
      "venue", "location", "date & time", "date", "time", "reporting time",
      "event date", "test date", "eligible branches", "branches", "skills"
    ]);

    for (const f of app.displayFields) {
      if (!f.label || !f.value) continue;
      const cleanLabel = f.label.trim().toLowerCase();
      if (skipLabels.has(cleanLabel)) continue;

      additionalDetails.push(`• <b>${f.label}:</b> ${f.value}`);
    }
  }

  if (additionalDetails.length > 0) {
    lines.push(""); // blank line
    lines.push("<b>Additional Details</b>");
    lines.push(...additionalDetails);
  }

  // Personal Notes
  if (app.note && app.note.trim()) {
    lines.push("");
    lines.push("<b>Personal Notes:</b>");
    lines.push(app.note.trim().replace(/\n/g, "<br>"));
  }

  // Action Links
  lines.push("");
  lines.push(`📊 <a href="${appDeepLink}">Open in Email Tracker</a>`);
  if (app.link && app.link.trim() && /^https?:\/\//i.test(app.link.trim())) {
    lines.push(`🔗 <a href="${app.link.trim()}">Apply / Register</a>`);
  }

  // Provenance Footer
  lines.push("");
  lines.push("---");
  lines.push("<i>Automatically created by Email Tracker</i>");

  const descriptionHtml = lines.join("<br>");

  // Reminders based on event type
  let reminderConfig = { useDefault: false, overrides: [] };
  if (eventType === "deadline") {
    reminderConfig.overrides = [
      { method: "popup", minutes: 1440 }, // 1 day before
      { method: "popup", minutes: 120 }   // 2 hours before
    ];
  } else if (eventType === "interview" || eventType === "oa") {
    reminderConfig.overrides = [
      { method: "popup", minutes: 60 },   // 1 hour before
      { method: "popup", minutes: 15 }    // 15 minutes before
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

  const calendar = createCalendarClient(account);

  // resolve calendar id to use for this account
  const calendarId = resolveCalendarId(account);

  // 1. Handle soft-deleted applications: remove Google Calendar event and keep DB record
  if (app.isDeleted) {
    if (app.calendarEventId) {
      console.log(`[CALENDAR_SYNC] Deleting event ${app.calendarEventId} for soft-deleted application ${app._id}`);
      try {
        await calendar.events.delete({
          calendarId: calendarId,
          eventId: app.calendarEventId
        });
      } catch (delErr) {
        const delStatus = delErr.status || delErr.code;
        if (delStatus !== 404 && delStatus !== 410) {
          console.warn(`[CALENDAR_SYNC] Warning deleting event ${app.calendarEventId} from Google Calendar:`, delErr.message);
        }
      }
    }
    // Preserve soft-deleted state in MongoDB so Gmail sync skips re-parsing
    app.calendarEventId = null;
    app.needsCalendarSync = false;
    app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
    app.calendarLastSyncedAt = new Date();
    app.calendarSyncError = null;
    app.calendarRetryCount = 0;
    await app.save();
    console.log(`[CALENDAR_SYNC] Soft-deleted application ${app._id} retained in DB (calendar event removed)`);
    return;
  }

  // 2. Resolve event type from classification
  const roleVal = getAppField(app, "Role", app.role);
  let eventType = "deadline";
  if (app.classification === "Interview Schedule") {
    eventType = "interview";
  } else if (app.classification === "Assessment Announcement" || (roleVal && roleVal.toLowerCase().includes("oa"))) {
    eventType = "oa";
  } else if (app.classification === "Workshop / Webinar" || app.classification === "Expert Talk Series" || app.classification === "PPT Announcement") {
    eventType = "talk";
  }

  // 3. Resolve date — only use meaningful dates, NOT the email-received date
  //    For deadlines: must have an explicit deadlineISO (parsed from Deadline displayField)
  //    For interviews/OAs/talks: can use testDate, eventDate, or deadlineISO
  //    NEVER fall back to app.date (email received date) — that creates misleading events
  let dateInput = null;
  let timeInput = app.eventTime || app.reportingTime || null;

  if (eventType === "interview" || eventType === "oa" || eventType === "talk") {
    dateInput = app.testDate || app.eventDate || app.deadlineISO || null;
  } else {
    // deadline / default — only use explicit deadline date
    dateInput = app.deadlineISO || null;
  }

  if (!dateInput) {
    // No meaningful date found — skip calendar sync entirely
    app.needsCalendarSync = false;
    app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
    app.calendarSyncError = "No explicit deadline or event date found — skipping calendar event";
    app.calendarRetryCount = 0;
    await app.save();
    console.log(`[CALENDAR_SYNC] Skipping ${app.company} (${app._id}): no meaningful date`);
    return;
  }

  // 4. Reject past dates
  const eventDate = new Date(dateInput);
  if (isNaN(eventDate.getTime())) {
    app.needsCalendarSync = false;
    app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
    app.calendarSyncError = `Invalid date value: ${dateInput}`;
    app.calendarRetryCount = 0;
    await app.save();
    return;
  }
  const now = new Date();
  // Allow events up to 1 day in the past (timezone buffer) but reject anything older
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (eventDate < oneDayAgo) {
    app.needsCalendarSync = false;
    app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
    app.calendarSyncError = `Deadline/event date is in the past (${eventDate.toISOString().substring(0, 10)})`;
    app.calendarRetryCount = 0;
    await app.save();
    console.log(`[CALENDAR_SYNC] Skipping ${app.company} (${app._id}): date in past (${eventDate.toISOString().substring(0, 10)})`);
    return;
  }

  const dateInfo = parseEventTime(dateInput, timeInput, eventType);
  if (!dateInfo) {
    app.needsCalendarSync = false;
    app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
    app.calendarSyncError = "Failed to parse event time from date input";
    app.calendarRetryCount = 0;
    await app.save();
    return;
  }

  // 5. Generate fingerprint and payload
  const fingerprint = generateEventFingerprint(app, eventType, eventDate.toISOString());
  const payload = buildEventPayload(app, eventType, dateInfo, fingerprint, dateInput, timeInput);
  const payloadHash = computePayloadHash(payload);

  try {
    // Check if event already exists locally & has not changed
    if (app.calendarEventId && app.calendarPayloadHash === payloadHash && app.calendarSyncVersion === CALENDAR_SYNC_VERSION) {
      console.log(`[CALENDAR_SYNC] Skipping sync for application ${app._id} - payload hash unchanged`);
      app.needsCalendarSync = false;
      app.calendarSyncError = null;
      app.calendarRetryCount = 0;
      await app.save();
      return;
    }

    let eventId = app.calendarEventId;

    if (eventId) {
      // Update existing event (complete replacement avoids schema conflicts between date and dateTime)
      try {
        console.log(`[CALENDAR_SYNC] Updating event ${eventId} for application ${app._id}`);
        await calendar.events.update({
          calendarId: calendarId,
          eventId: eventId,
          resource: payload
        });
      } catch (updateErr) {
        const status = updateErr.status || updateErr.code;
        const msg = (updateErr.message || "").toLowerCase();
        const isNotFound = status === 404 || status === 410 || msg.includes("not found") || msg.includes("deleted");
        if (isNotFound) {
          console.log(`[CALENDAR_SYNC] Event ${eventId} was deleted externally (status ${status}). Recreating event for application ${app._id}`);
          eventId = null;
          app.calendarEventId = null;
        } else {
          throw updateErr;
        }
      }
    }

    if (!eventId) {
      // 1. Primary Lookup: Search by Application ID in privateExtendedProperties
      console.log(`[CALENDAR_SYNC] Checking existing event by applicationId=${app._id} for application ${app._id}`);
      const appLookupRes = await calendar.events.list({
        calendarId: calendarId,
        privateExtendedProperty: `applicationId=${app._id.toString()}`
      });

      let existingEvent = appLookupRes.data.items && appLookupRes.data.items[0];

      // 2. Secondary Fallback Lookup: Search by fingerprint if not found by applicationId
      if (!existingEvent && fingerprint) {
        console.log(`[CALENDAR_SYNC] Checking fingerprint fallback ${fingerprint} for application ${app._id}`);
        const fpLookupRes = await calendar.events.list({
          calendarId: calendarId,
          privateExtendedProperty: `fingerprint=${fingerprint}`
        });
        existingEvent = fpLookupRes.data.items && fpLookupRes.data.items[0];
      }

      if (existingEvent) {
        eventId = existingEvent.id;
        console.log(`[CALENDAR_SYNC] Found existing calendar event ${eventId} via extended property lookup`);
        await calendar.events.update({
          calendarId: calendarId,
          eventId: eventId,
          resource: payload
        });
      } else {
        // Insert new event
        console.log(`[CALENDAR_SYNC] Creating new calendar event for application ${app._id}`);
        const insertRes = await calendar.events.insert({
          calendarId: calendarId,
          resource: payload
        });
        eventId = insertRes.data.id;
      }
    }

    // 6. Update database sync status fields on success
    app.calendarEventId = eventId;
    app.calendarEventFingerprint = fingerprint;
    app.calendarPayloadHash = payloadHash;
    app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
    app.calendarLastSyncedAt = new Date();
    app.needsCalendarSync = false;
    app.calendarSyncError = null;
    app.calendarRetryCount = 0;
    await app.save();
    console.log(`[CALENDAR_SYNC] Sync success for application ${app._id}`);

  } catch (err) {
    console.error(`[CALENDAR_SYNC] Error syncing application ${app._id}:`, err.message);
    const errLower = (err.message || "").toLowerCase();
    const status = err.status || err.code;
    
    // Set to failed/disabled if user revoked permission or has insufficient scope
    const isAuthError = status === 401 || 
                        status === 403 || 
                        errLower.includes("invalid_grant") || 
                        errLower.includes("insufficient") || 
                        errLower.includes("scope");
                        
    if (isAuthError) {
      app.needsCalendarSync = false;
      app.calendarSyncError = `Google Calendar auth error: ${err.message}`;
      
      // Auto-disable calendar sync on account level due to missing/revoked scopes
      account.calendarSyncEnabled = false;
      account.syncError = `Google Calendar permissions missing: ${err.message}`;
      await account.save().catch(saveErr => console.error("[CALENDAR_SYNC] Failed to update account sync status:", saveErr.message));
      console.log(`[CALENDAR_SYNC] Auto-disabled calendar sync for account: ${account.email} due to auth scope error`);
    } else {
      // Check if permanent client error (e.g. 400 Bad Request, invalid payload, malformed date)
      const isPermanentError = status === 400 || 
                               errLower.includes("invalid value") || 
                               errLower.includes("bad request") || 
                               errLower.includes("malformed");

      if (isPermanentError) {
        app.needsCalendarSync = false;
        app.calendarRetryCount = (app.calendarRetryCount || 0) + 1;
        app.calendarSyncError = `Permanent calendar sync error: ${err.message}`;
        console.warn(`[CALENDAR_SYNC] Application ${app._id} encountered permanent error: ${err.message}. Stopping retries.`);
      } else {
        // Transient error (rate limit 429, 5xx server error, network timeout, ETIMEDOUT, ECONNRESET)
        const currentRetries = (app.calendarRetryCount || 0) + 1;
        app.calendarRetryCount = currentRetries;

        if (currentRetries >= MAX_CALENDAR_RETRIES) {
          app.needsCalendarSync = false;
          app.calendarSyncError = `Max sync retries (${MAX_CALENDAR_RETRIES}) exceeded: ${err.message}`;
          console.warn(`[CALENDAR_SYNC] Application ${app._id} exceeded max retries (${MAX_CALENDAR_RETRIES}). Stopping automatic retries.`);
        } else {
          app.needsCalendarSync = true;
          app.calendarSyncError = `Transient error (attempt ${currentRetries}/${MAX_CALENDAR_RETRIES}): ${err.message}`;
        }
      }
    }
    await app.save();
  }
}

async function processCalendarSyncQueue(account) {
  if (!account.calendarSyncEnabled) {
    console.log(`[CALENDAR_QUEUE] Sync disabled for user ${account.email}`);
    return;
  }

  const userIdStr = account._id.toString();
  if (activeCalendarSyncs.has(userIdStr)) {
    console.log(`[CALENDAR_QUEUE] Calendar sync already in progress for ${account.email} — skipping parallel trigger`);
    return;
  }

  try {
    activeCalendarSyncs.add(userIdStr);

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
  } finally {
    activeCalendarSyncs.delete(userIdStr);
  }
}

/**
 * Migrate application events for an account from a source calendar (usually "primary")
 * to the account's target calendar (account.calendarTargetId or GOOGLE_CALENDAR_ID).
 *
 * Strategy:
 *  - For every Application for the user that has calendarEventId, try to fetch the event
 *    from the source calendar (sourceCalendarId, default "primary").
 *  - If event exists: insert a copy into destination calendar, update app.calendarEventId,
 *    delete the original from source calendar.
 *  - If event not found in source (maybe already moved), skip.
 *
 * Note: using insert+delete rather than events.move to avoid relying on the move method
 * availability and to preserve extended properties reliably.
 */
async function migrateAccountCalendar(account, sourceCalendarId = "primary") {
  if (!account.calendarSyncEnabled) {
    console.log(`[CALENDAR_MIGRATE] Calendar sync disabled for ${account.email} — skipping migration`);
    return;
  }

  const calendar = createCalendarClient(account);

  const destCalendarId = resolveCalendarId(account);
  if (destCalendarId === sourceCalendarId) {
    console.log(`[CALENDAR_MIGRATE] Source and destination are same (${sourceCalendarId}) — nothing to migrate`);
    return;
  }

  // Find all applications for this user that reference a calendarEventId in the DB
  const apps = await Application.find({
    userId: account._id,
    calendarEventId: { $exists: true, $ne: null }
  });

  console.log(`[CALENDAR_MIGRATE] Attempting migration of ${apps.length} events for ${account.email} from ${sourceCalendarId} -> ${destCalendarId}`);

  for (const app of apps) {
    try {
      const srcEventId = app.calendarEventId;
      if (!srcEventId) continue;

      // Try to get the event from source calendar
      let getRes;
      try {
        getRes = await calendar.events.get({
          calendarId: sourceCalendarId,
          eventId: srcEventId
        });
      } catch (err) {
        // If not found, skip; maybe event already moved or was deleted
        console.log(`[CALENDAR_MIGRATE] Source event ${srcEventId} not found in ${sourceCalendarId} for app ${app._id}: ${err.message}`);
        continue;
      }

      const eventResource = getRes.data;

      // Remove read-only fields that Google will reject on insert
      const fieldsToStrip = [
        'id', 'etag', 'htmlLink', 'created', 'updated',
        'iCalUID', 'sequence', 'status', 'organizer', 'creator', 'hangoutLink'
      ];
      for (const f of fieldsToStrip) delete eventResource[f];

      // Ensure extendedProperties remain intact (private)
      // Insert into destination calendar
      const insertRes = await calendar.events.insert({
        calendarId: destCalendarId,
        resource: eventResource
      });

      const newEventId = insertRes.data.id;

      // Delete original event from source calendar
      try {
        await calendar.events.delete({
          calendarId: sourceCalendarId,
          eventId: srcEventId
        });
      } catch (err) {
        // If deletion fails, log and continue — we still update DB to point to new event
        console.warn(`[CALENDAR_MIGRATE] Failed to delete source event ${srcEventId} from ${sourceCalendarId}: ${err.message}`);
      }

      // Update application record to point to new event ID, fingerprint remains same
      app.calendarEventId = newEventId;
      app.calendarLastSyncedAt = new Date();
      app.calendarSyncVersion = CALENDAR_SYNC_VERSION;
      app.needsCalendarSync = false;
      app.calendarSyncError = null;
      app.calendarRetryCount = 0;
      await app.save();
      console.log(`[CALENDAR_MIGRATE] Migrated app ${app._id} event ${srcEventId} -> ${newEventId}`);

    } catch (err) {
      console.error(`[CALENDAR_MIGRATE] Error migrating app ${app._id}:`, err.message);
      // don't throw; continue with other apps
    }
  }

  console.log(`[CALENDAR_MIGRATE] Migration sweep completed for ${account.email}`);
}

/**
 * Resolves the available Google Calendar list for an account based on granted OAuth scopes.
 * If user has calendar.readonly or calendar scope, queries Google Calendar API.
 * If user has calendar.events only, returns primary fallback without calling calendarList.list().
 * If user has no calendar scopes, returns empty array.
 */
async function getCalendarListForAccount(account, calendarClient = null) {
  const scopes = (account?.tokens?.scope || "").split(/\s+/);
  const hasEventsScope = scopes.some(s => s.includes("auth/calendar.events"));
  const hasListScope = scopes.some(s => s.endsWith("/calendar.readonly") || s.endsWith("/calendar"));

  // If user has not authorized any calendar scopes, return empty list
  if (!hasEventsScope && !hasListScope) {
    return [];
  }

  const primaryFallback = [{
    id: "primary",
    summary: "Primary Calendar (Default)",
    primary: true
  }];

  // If user has granted the scope to list secondary calendars, query Google Calendar API
  if (hasListScope) {
    const calendar = calendarClient || createCalendarClient(account);

    const calendarListRes = await calendar.calendarList.list();
    const calendars = (calendarListRes.data.items || []).map(c => ({
      id: c.id,
      summary: c.summary,
      primary: !!c.primary
    }));

    return calendars.length > 0 ? calendars : primaryFallback;
  }

  // For existing users with calendar.events only, gracefully return primary fallback without calling calendarList.list()
  return primaryFallback;
}

module.exports = {
  syncAppToCalendar,
  processCalendarSyncQueue,
  CALENDAR_SYNC_VERSION,
  MAX_CALENDAR_RETRIES,
  createCalendarClient,
  migrateAccountCalendar,
  resolveCalendarId,
  parseEventTime,
  formatAbsoluteDateIST,
  buildEventPayload,
  getCalendarListForAccount
};
