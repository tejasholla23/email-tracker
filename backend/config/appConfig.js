"use strict";

const config = Object.freeze({
  isAllowedEmail: (email) => {
    if (!email || typeof email !== "string") return false;
    const cleanEmail = email.trim().toLowerCase();
    
    // If ALLOWED_EMAILS is configured via environment variable, check that list first
    if (process.env.ALLOWED_EMAILS) {
      const allowed = process.env.ALLOWED_EMAILS.split(",").map(e => e.trim().toLowerCase());
      return allowed.includes(cleanEmail);
    }
    
    // Otherwise, allow any email ending with @msrit.edu
    return cleanEmail.endsWith("@msrit.edu");
  },
  ALLOWED_SENDERS: process.env.ALLOWED_SENDERS
    ? process.env.ALLOWED_SENDERS.split(",").map(s => s.trim().toLowerCase())
    : ["placement@msrit.edu", "dean.tap@msrit.edu"],
  GEMINI_DELAY_MS: Number(process.env.GEMINI_DELAY_MS ?? 6500),
  MAX_EMAILS_PER_SYNC: Number(process.env.MAX_EMAILS_PER_SYNC ?? 6),
});

module.exports = config;
