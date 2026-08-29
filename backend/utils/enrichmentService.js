"use strict";

const { deriveFromDisplayFields, resolveDeadlineISO, resolveEventDateISO } = require("./parseEmailWithLLM");

/**
 * Conceptual Equivalence Patterns for displayField label normalization.
 * Groups diverse placement email phrasing into canonical recruitment concepts.
 */
const CONCEPT_PATTERNS = {
  DEADLINE: /\b(deadline|last\s*date|due\s*date|closing\s*date|apply\s*by|register\s*before|registration\s*closes|submission\s*window|registration\s*deadline)\b/i,
  CTC: /\b(ctc|salary|compensation|package|fixed\s*ctc|pay)\b/i,
  STIPEND: /\b(stipend|monthly\s*stipend|internship\s*stipend)\b/i,
  DURATION: /\b(duration|period|internship\s*duration|program\s*duration)\b/i,
  LOCATION: /\b(location|job\s*location|work\s*location|venue|joining\s*location)\b/i,
  ELIGIBILITY: /\b(eligibility|criteria|eligible\s*branches|cutoff|cgpa|qualification)\b/i,
  ROLE: /\b(role|roles|position|job\s*role|designation|profile|program\s*roles)\b/i,
  ASSESSMENT: /\b(assessment|online\s*assessment|mettl|hackerrank|test\s*date|oa\s*date|test\s*schedule|test\s*time)\b/i,
  INTERVIEW: /\b(interview|interview\s*schedule|interview\s*date|gd\s*\/\s*pi|technical\s*interview|interview\s*time)\b/i,
  EVENT_DATE: /\b(event\s*date|presentation\s*date|ppt\s*date|talk\s*date|session\s*date)\b/i,
  TIME: /\b(time|event\s*time|reporting\s*time|schedule\s*time|ppt\s*time)\b/i,
  LINK: /\b(registration\s*link|apply\s*link|form\s*link|meeting\s*link|teams\s*link|registration\s*form)\b/i,
  JOINING: /\b(joining|joining\s*date|tentative\s*joining|start\s*date)\b/i,
  MODE: /\b(mode|event\s*mode|work\s*mode|format)\b/i,
};

/**
 * Priority order for rendering display fields on cards.
 */
const CONCEPT_PRIORITY_ORDER = [
  "ROLE",
  "DEADLINE",
  "ASSESSMENT",
  "INTERVIEW",
  "CTC",
  "STIPEND",
  "ELIGIBILITY",
  "DURATION",
  "LOCATION",
  "JOINING",
  "EVENT_DATE",
  "TIME",
  "MODE",
  "LINK",
];

/**
 * Identify canonical concept key from a displayField label.
 *
 * @param {string} label
 * @returns {string} canonical concept key
 */
function getCanonicalConcept(label = "") {
  if (!label || typeof label !== "string") return "UNKNOWN";
  const l = label.trim().toLowerCase();
  for (const [concept, pattern] of Object.entries(CONCEPT_PATTERNS)) {
    if (pattern.test(l)) return concept;
  }
  return `CUSTOM_${l.replace(/[^a-z0-9]/g, "_")}`;
}

/**
 * Check whether an incoming deadline should update an existing deadline without regression.
 *
 * @param {string} existingValue
 * @param {string} incomingValue
 * @param {string} emailSubject
 * @param {string} emailBody
 * @returns {boolean}
 */
function shouldUpdateDeadline(existingValue, incomingValue, emailSubject = "", emailBody = "") {
  if (!incomingValue || typeof incomingValue !== "string" || !incomingValue.trim()) return false;
  if (!existingValue || typeof existingValue !== "string" || !existingValue.trim()) return true;

  const combinedText = `${emailSubject} ${emailBody}`.toLowerCase();
  const hasExtensionKeyword = /\b(extended|extension|postponed|revised|rescheduled|new\s*deadline|last\s*date\s*extended)\b/i.test(combinedText);

  if (hasExtensionKeyword) {
    return true;
  }

  const existingISO = resolveDeadlineISO(existingValue);
  const incomingISO = resolveDeadlineISO(incomingValue);

  if (existingISO && incomingISO) {
    const exTime = new Date(existingISO).getTime();
    const inTime = new Date(incomingISO).getTime();
    if (!isNaN(exTime) && !isNaN(inTime)) {
      // Allow update if incoming deadline is later or equal, but prevent regression to earlier date without extension keyword
      return inTime >= exTime;
    }
  }

  // Fallback if dates cannot be parsed into ISO: accept incoming if non-empty
  return true;
}

/**
 * Merges two displayFields arrays at the individual field level using canonical label normalization.
 * Preserves non-overlapping fields while updating equivalent conceptual fields when authoritative.
 *
 * @param {Array<{label: string, value: string}>} existingFields
 * @param {Array<{label: string, value: string}>} incomingFields
 * @param {boolean} isNewerEmail
 * @param {string} emailSubject
 * @param {string} emailBody
 * @returns {Array<{label: string, value: string}>}
 */
function mergeDisplayFields(existingFields = [], incomingFields = [], isNewerEmail = true, emailSubject = "", emailBody = "") {
  const safeExisting = Array.isArray(existingFields) ? existingFields.filter(f => f && f.label && f.value) : [];
  const safeIncoming = Array.isArray(incomingFields) ? incomingFields.filter(f => f && f.label && f.value) : [];

  if (safeIncoming.length === 0) return safeExisting;
  if (safeExisting.length === 0) return safeIncoming;

  const mergedMap = new Map();

  // 1. Seed with existing fields
  for (const field of safeExisting) {
    const concept = getCanonicalConcept(field.label);
    mergedMap.set(concept, { label: field.label, value: field.value });
  }

  // 2. Merge incoming fields
  for (const incoming of safeIncoming) {
    const concept = getCanonicalConcept(incoming.label);

    if (!mergedMap.has(concept)) {
      // Genuinely new field -> ADD
      mergedMap.set(concept, { label: incoming.label, value: incoming.value });
    } else {
      const existing = mergedMap.get(concept);

      if (isNewerEmail) {
        if (concept === "DEADLINE") {
          if (shouldUpdateDeadline(existing.value, incoming.value, emailSubject, emailBody)) {
            mergedMap.set(concept, { label: incoming.label, value: incoming.value });
          }
        } else {
          // Newer email updates the value
          mergedMap.set(concept, { label: incoming.label, value: incoming.value });
        }
      } else {
        // Incoming email is older (e.g. historical backfill): only fill if existing was empty/placeholder
        if (!existing.value || /^(?:n\/a|tbd|tba|none|nil)$/i.test(existing.value.trim())) {
          mergedMap.set(concept, { label: incoming.label, value: incoming.value });
        }
      }
    }
  }

  // 3. Sort by canonical priority for clean UI rendering
  const result = Array.from(mergedMap.entries()).map(([concept, field]) => ({
    concept,
    label: field.label,
    value: field.value,
  }));

  result.sort((a, b) => {
    const aIdx = CONCEPT_PRIORITY_ORDER.indexOf(a.concept);
    const bIdx = CONCEPT_PRIORITY_ORDER.indexOf(b.concept);
    const aPri = aIdx >= 0 ? aIdx : 999;
    const bPri = bIdx >= 0 ? bIdx : 999;
    return aPri - bPri;
  });

  return result.map(({ label, value }) => ({ label, value }));
}

/**
 * Reconciles deadlines between existing application and incoming parsed email,
 * preventing regressions to earlier dates unless explicit extension keywords are detected.
 *
 * @param {Object} existing
 * @param {Object} parsed
 * @param {boolean} isNewerEmail
 * @param {string} emailSubject
 * @param {string} emailBody
 * @returns {{ deadline: string, deadlineISO: string, deadlineText: string, changed: boolean }}
 */
function reconcileDeadlines(existing, parsed, isNewerEmail = true, emailSubject = "", emailBody = "") {
  const incomingDeadlineText = parsed?.deadlineText || parsed?.deadline || "";
  const incomingDeadlineISO = parsed?.deadlineISO || "";
  const existingDeadlineText = existing?.deadlineText || existing?.deadline || "";
  const existingDeadlineISO = existing?.deadlineISO || "";

  if (!incomingDeadlineText && !incomingDeadlineISO) {
    return {
      deadline: existingDeadlineText,
      deadlineISO: existingDeadlineISO,
      deadlineText: existingDeadlineText,
      changed: false,
    };
  }

  if (!existingDeadlineText && !existingDeadlineISO) {
    return {
      deadline: incomingDeadlineText,
      deadlineISO: incomingDeadlineISO,
      deadlineText: incomingDeadlineText,
      changed: true,
    };
  }

  const combinedText = `${emailSubject} ${emailBody}`.toLowerCase();
  const hasExtensionKeyword = /\b(extended|extension|postponed|revised|rescheduled|new\s*deadline|last\s*date\s*extended)\b/i.test(combinedText);

  if (hasExtensionKeyword) {
    return {
      deadline: incomingDeadlineText,
      deadlineISO: incomingDeadlineISO,
      deadlineText: incomingDeadlineText,
      changed: incomingDeadlineText !== existingDeadlineText || incomingDeadlineISO !== existingDeadlineISO,
    };
  }

  if (incomingDeadlineISO && existingDeadlineISO) {
    const inTime = new Date(incomingDeadlineISO).getTime();
    const exTime = new Date(existingDeadlineISO).getTime();

    if (!isNaN(inTime) && !isNaN(exTime)) {
      if (inTime >= exTime) {
        return {
          deadline: incomingDeadlineText,
          deadlineISO: incomingDeadlineISO,
          deadlineText: incomingDeadlineText,
          changed: incomingDeadlineText !== existingDeadlineText || incomingDeadlineISO !== existingDeadlineISO,
        };
      } else {
        // Earlier deadline with no extension keywords -> preserve existing later deadline
        return {
          deadline: existingDeadlineText,
          deadlineISO: existingDeadlineISO,
          deadlineText: existingDeadlineText,
          changed: false,
        };
      }
    }
  }

  if (isNewerEmail && incomingDeadlineText) {
    return {
      deadline: incomingDeadlineText,
      deadlineISO: incomingDeadlineISO,
      deadlineText: incomingDeadlineText,
      changed: incomingDeadlineText !== existingDeadlineText,
    };
  }

  return {
    deadline: existingDeadlineText,
    deadlineISO: existingDeadlineISO,
    deadlineText: existingDeadlineText,
    changed: false,
  };
}

/**
 * Computes progressive field-level enrichment for an existing Application record
 * from a newly parsed email or reparsed event.
 *
 * @param {Object} existingApp - The existing Application document (or plain object)
 * @param {Object} parsed - Parsed data from parseEmailWithLLM
 * @param {Date|string|number} emailDate - The timestamp of the email being processed
 * @param {Object} options - { isNewerEmail: boolean, subject: string, rawBody: string }
 * @returns {Object} updatePayload with fields to update via findByIdAndUpdate
 */
function enrichApplicationRecord(existingApp, parsed, emailDate, options = {}) {
  if (!existingApp || !parsed) return {};

  const ov = Array.isArray(existingApp.manualOverrides) ? existingApp.manualOverrides : [];
  const updatePayload = {};

  const incomingDateObj = emailDate ? new Date(emailDate) : new Date();
  const existingDateObj = existingApp.date ? new Date(existingApp.date) : new Date(0);

  const isNewerEmail = options.isNewerEmail !== undefined
    ? options.isNewerEmail
    : (!isNaN(incomingDateObj.getTime()) && incomingDateObj.getTime() >= existingDateObj.getTime());

  const subject = options.subject || parsed.parseMeta?.sourceSubject || "";
  const rawBody = options.rawBody || "";

  // ── 1. CUMULATIVE MERGE: displayFields ──
  if (!ov.includes("displayFields")) {
    const mergedFields = mergeDisplayFields(
      existingApp.displayFields,
      parsed.displayFields,
      isNewerEmail,
      subject,
      rawBody
    );
    if (mergedFields.length > 0) {
      updatePayload.displayFields = mergedFields;
    }
  }

  // ── 2. CUMULATIVE MERGE: skills ──
  if (!ov.includes("skills")) {
    const existingSkills = Array.isArray(existingApp.skills) ? existingApp.skills : [];
    const incomingSkills = Array.isArray(parsed.skills) ? parsed.skills : [];
    if (incomingSkills.length > 0) {
      const mergedSkills = [...new Set([...existingSkills, ...incomingSkills])];
      updatePayload.skills = mergedSkills;
    }
  }

  // ── 3. CUMULATIVE MERGE: links & primary link ──
  if (!ov.includes("links")) {
    const existingLinks = Array.isArray(existingApp.links) ? existingApp.links : [];
    const incomingLinks = Array.isArray(parsed.links) ? parsed.links : (parsed.link ? [parsed.link] : []);
    if (incomingLinks.length > 0) {
      updatePayload.links = [...new Set([...existingLinks, ...incomingLinks])];
    }
  }

  if (!ov.includes("link")) {
    if (parsed.isFormLink) {
      updatePayload.link = parsed.link;
    } else if (isNewerEmail && parsed.link) {
      updatePayload.link = parsed.link;
    } else if (!existingApp.link && parsed.link) {
      updatePayload.link = parsed.link;
    }
  }

  if (!ov.includes("isFormLink") && parsed.isFormLink && !existingApp.isFormLink) {
    updatePayload.isFormLink = true;
  }

  // ── 4. NON-REGRESSIVE DEADLINE RECONCILIATION ──
  if (!ov.includes("deadline")) {
    const dlResult = reconcileDeadlines(existingApp, parsed, isNewerEmail, subject, rawBody);
    if (dlResult.changed || (!existingApp.deadline && dlResult.deadline)) {
      updatePayload.deadline = dlResult.deadline;
      updatePayload.deadlineISO = dlResult.deadlineISO;
      updatePayload.deadlineText = dlResult.deadlineText;
    }
  }

  // ── 5. LOCKSTEP SYNCHRONIZATION FROM MERGED displayFields ──
  const effectiveDisplayFields = updatePayload.displayFields || existingApp.displayFields || [];
  if (effectiveDisplayFields.length > 0) {
    const derived = deriveFromDisplayFields(effectiveDisplayFields);

    if (!ov.includes("role") && derived.role && derived.role !== "Unknown Role") {
      if (isNewerEmail || !existingApp.role || existingApp.role === "Unknown Role" || existingApp.role === "Event") {
        updatePayload.role = derived.role;
      }
    }
    if (!ov.includes("salaryText") && derived.salaryText && !existingApp.salaryText) {
      updatePayload.salaryText = derived.salaryText;
    }
    if (!ov.includes("programStipend") && derived.programStipend && !existingApp.programStipend) {
      updatePayload.programStipend = derived.programStipend;
    }
    if (!ov.includes("programDuration") && derived.programDuration && !existingApp.programDuration) {
      updatePayload.programDuration = derived.programDuration;
    }
    if (!ov.includes("venue") && derived.venue && !existingApp.venue) {
      updatePayload.venue = derived.venue;
    }
  }

  // ── 6. DISTINCT MILESTONE SEMANTICS ──
  // testDate / Assessment milestone
  if (!ov.includes("testDate") && parsed.testDate) {
    if (isNewerEmail || !existingApp.testDate) {
      updatePayload.testDate = parsed.testDate;
    }
  }

  // eventDate / Talk / Presentation milestone
  if (!ov.includes("eventDate") && parsed.eventDate) {
    if (isNewerEmail || !existingApp.eventDate) {
      updatePayload.eventDate = parsed.eventDate;
    }
  }

  // eventTime / Reporting time
  if (!ov.includes("eventTime") && parsed.eventTime && (isNewerEmail || !existingApp.eventTime)) {
    updatePayload.eventTime = parsed.eventTime;
  }
  if (!ov.includes("reportingTime") && parsed.reportingTime && (isNewerEmail || !existingApp.reportingTime)) {
    updatePayload.reportingTime = parsed.reportingTime;
  }

  // ── 7. CHRONOLOGY-AWARE RECRUITMENT STATE & DISPLAY ──
  if (isNewerEmail) {
    // Subtitle update (e.g. Fresher Hiring supersedes Pre-Placement Talk)
    if (!ov.includes("subtitle") && parsed.subtitle) {
      updatePayload.subtitle = parsed.subtitle;
    }

    // Classification update
    if (!ov.includes("classification") && parsed.classification) {
      updatePayload.classification = parsed.classification;
    }

    // Title update
    if (!ov.includes("title") && parsed.title) {
      updatePayload.title = parsed.title;
    }

    // Opportunity emailType: 'job' > 'event' > 'nonRecruitment'
    if (!ov.includes("emailType") && parsed.emailType) {
      const EMAIL_RANK = { nonRecruitment: 0, event: 1, job: 2 };
      const currentRank = EMAIL_RANK[existingApp.emailType] ?? 0;
      const incomingRank = EMAIL_RANK[parsed.emailType] ?? 0;
      if (incomingRank >= currentRank) {
        updatePayload.emailType = parsed.emailType;
      }
    }

    // Opportunity type: 'full-time' / 'internship' > 'event' / 'unknown'
    if (!ov.includes("type") && parsed.type && parsed.type !== "unknown") {
      updatePayload.type = parsed.type;
    }

    // Opportunity Category (opportunityType)
    if (!ov.includes("opportunityType") && parsed.opportunityType) {
      updatePayload.opportunityType = parsed.opportunityType;
    }

    // Recruitment Stage progression
    if (!ov.includes("stage") && parsed.stage && parsed.stage !== "none") {
      const currentStage = existingApp.stage || "none";
      const STAGE_ORDER = { none: 0, oa_scheduled: 1, interview_scheduled: 2, offered: 3 };

      if (parsed.stage === "rejected") {
        // Rejection is a terminal outcome that can occur from any previous stage
        updatePayload.stage = "rejected";
      } else if (currentStage !== "rejected" && STAGE_ORDER[parsed.stage] !== undefined) {
        const currentRank = STAGE_ORDER[currentStage] ?? 0;
        const incomingRank = STAGE_ORDER[parsed.stage] ?? 0;
        if (incomingRank > currentRank) {
          updatePayload.stage = parsed.stage;
          if (["oa_scheduled", "interview_scheduled", "offered"].includes(parsed.stage)) {
            updatePayload.hasApplied = true;
            if (!existingApp.appliedAt) updatePayload.appliedAt = incomingDateObj;
          }
        }
      }
    }

    // Date advancement to the newest email
    if (!ov.includes("date") && !isNaN(incomingDateObj.getTime())) {
      updatePayload.date = incomingDateObj;
    }
  } else {
    // Historical email filling empty fields
    if (!ov.includes("subtitle") && !existingApp.subtitle && parsed.subtitle) {
      updatePayload.subtitle = parsed.subtitle;
    }
    if (!ov.includes("classification") && !existingApp.classification && parsed.classification) {
      updatePayload.classification = parsed.classification;
    }
    if (!ov.includes("type") && (!existingApp.type || existingApp.type === "unknown") && parsed.type && parsed.type !== "unknown") {
      updatePayload.type = parsed.type;
    }
    if (!ov.includes("opportunityType") && !existingApp.opportunityType && parsed.opportunityType) {
      updatePayload.opportunityType = parsed.opportunityType;
    }
    if (!ov.includes("stage") && (!existingApp.stage || existingApp.stage === "none") && parsed.stage && parsed.stage !== "none") {
      updatePayload.stage = parsed.stage;
    }
  }

  // ── 8. FILL-IF-EMPTY FOR REMAINING SECONDARY METADATA ──
  if (!ov.includes("programRoles") && !existingApp.programRoles && parsed.programRoles) {
    updatePayload.programRoles = parsed.programRoles;
  }
  if (!ov.includes("durationText") && !existingApp.durationText && parsed.durationText) {
    updatePayload.durationText = parsed.durationText;
  }
  if (!ov.includes("jobRole") && !existingApp.jobRole && parsed.jobRole) {
    updatePayload.jobRole = parsed.jobRole;
  }
  if (!ov.includes("processId") && !existingApp.processId && parsed.processId) {
    updatePayload.processId = parsed.processId;
  }
  if (!ov.includes("processName") && !existingApp.processName && parsed.processName) {
    updatePayload.processName = parsed.processName;
  }

  // ── 9. CALENDAR SYNC TRIGGER ──
  // Only queue calendar sync if milestone dates or times actually changed
  const dateChanged = (
    (updatePayload.deadlineISO && updatePayload.deadlineISO !== existingApp.deadlineISO) ||
    (updatePayload.eventDate && updatePayload.eventDate !== existingApp.eventDate) ||
    (updatePayload.testDate && updatePayload.testDate !== existingApp.testDate) ||
    (updatePayload.eventTime && updatePayload.eventTime !== existingApp.eventTime)
  );
  if (dateChanged) {
    updatePayload.needsCalendarSync = true;
    updatePayload.calendarRetryCount = 0;
    updatePayload.calendarSyncError = null;
  }

  return updatePayload;
}

module.exports = {
  CONCEPT_PATTERNS,
  getCanonicalConcept,
  shouldUpdateDeadline,
  mergeDisplayFields,
  reconcileDeadlines,
  enrichApplicationRecord,
};
