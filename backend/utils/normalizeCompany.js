"use strict";

/**
 * normalizeCompany.js
 *
 * Provides a stable, canonical key for company identity comparison.
 * Used exclusively as the deduplication key — never stored as the display name.
 *
 * Rule: one Application per normalized company key = one hiring process.
 */

/**
 * Produce a normalized key from a company name.
 * Lowercases, strips non-alphanumeric characters, collapses whitespace.
 *
 * Examples:
 *   "TCS"                    → "tcs"
 *   "Tata Consultancy Svcs"  → "tata consultancy svcs"
 *   "Nokia"                  → "nokia"
 *   "  HCL Technologies  "   → "hcl technologies"
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeCompany(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalized keys that represent unresolved or invalid companies.
 * Records with these keys must NOT be merged — they remain standalone.
 */
const INVALID_COMPANY_KEYS = new Set([
  "",
  "unknown",
  "unknown company",
  "unknowncompany",
  "n a",
  "na",
  "none",
  "null",
  "undefined",
  "company",
  "the company",
  "our company",
  "hiring team",
  "unknown role",
]);

/**
 * Returns true if the company name is valid and should participate in
 * company-level identity merging.
 *
 * If false, the record is standalone and must never be merged with others.
 *
 * @param {string} name
 * @returns {boolean}
 */
function isValidCompany(name) {
  if (!name || typeof name !== "string") return false;
  const key = normalizeCompany(name);
  if (key.length < 2) return false;
  return !INVALID_COMPANY_KEYS.has(key);
}

module.exports = { normalizeCompany, isValidCompany };
