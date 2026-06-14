"use strict";

/**
 * statusMachine.js
 *
 * Forward-only Application status state machine.
 *
 * Status order (live sync):
 *   new(0) → applied(1) → interview(2) → offer(3)
 *
 * Terminal states (never overwritten by email processing):
 *   offer, rejected, done
 *
 * Classification → Status mapping:
 *   New Hiring Opportunity    → new
 *   Generic Placement Notice  → new
 *   PPT Announcement          → new
 *   Registration Link         → applied
 *   Application Reminder      → applied
 *   Deadline Reminder         → applied
 *   Venue Update              → applied
 *   Assessment Announcement   → interview
 *   Interview Schedule        → interview
 *   Interview Result          → offer
 */

/** Status rank for forward-only advancement (live sync). */
const STATUS_RANK = {
  new:       0,
  applied:   1,
  interview: 2,
  offer:     3,
  // Terminal: no rank — handled explicitly in advanceStatus
  rejected:  null,
  done:      null,
};

/** Maps email classification strings to their implied application status. */
const CLASSIFICATION_STATUS_MAP = {
  "New Hiring Opportunity":   "new",
  "Generic Placement Notice": "new",
  "PPT Announcement":         "new",
  "Registration Link":        "new",
  "Application Reminder":     "new",
  "Deadline Reminder":        "new",
  "Application Submitted":    "applied",
  "Registration Confirmation":"applied",
  "Venue Update":             "interview",
  "Assessment Announcement":  "interview",
  "Interview Schedule":       "interview",
  "Interview Result":         "offer",
};

/**
 * Given a classification string, return the implied status.
 * Falls back to "new" for unknown or empty classifications.
 *
 * @param {string} classification
 * @returns {string}
 */
function classificationToStatus(classification) {
  return CLASSIFICATION_STATUS_MAP[classification] || "new";
}

/**
 * Advance application status forward only.
 *
 * Rules:
 *   - "offer", "rejected", "done" are terminal: always returns current.
 *   - Otherwise, returns whichever of current or incoming is ranked higher.
 *   - Never downgrades.
 *
 * @param {string} current - Existing status on the Application document.
 * @param {string} incoming - Status implied by the new email's classification.
 * @returns {string}
 */
function advanceStatus(current, incoming) {
  const cur = (current || "new").toLowerCase();
  const inc = (incoming || "new").toLowerCase();

  // Terminal states are preserved unconditionally
  if (cur === "offer" || cur === "rejected" || cur === "done") {
    return cur;
  }

  const curRank = STATUS_RANK[cur] ?? 0;
  const incRank = STATUS_RANK[inc] ?? 0;

  return incRank > curRank ? inc : cur;
}

module.exports = { classificationToStatus, advanceStatus, CLASSIFICATION_STATUS_MAP };
