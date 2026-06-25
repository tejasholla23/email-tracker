"use strict";

const config = Object.freeze({
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS
    ? process.env.ALLOWED_EMAILS.split(",").map(e => e.trim().toLowerCase())
    : ["1ms23ci126@msrit.edu"],
  ALLOWED_SENDERS: process.env.ALLOWED_SENDERS
    ? process.env.ALLOWED_SENDERS.split(",").map(s => s.trim().toLowerCase())
    : ["placement@msrit.edu", "dean.tap@msrit.edu"],
  GEMINI_DELAY_MS: Number(process.env.GEMINI_DELAY_MS ?? 6500),
  MAX_EMAILS_PER_SYNC: Number(process.env.MAX_EMAILS_PER_SYNC ?? 6),
});

module.exports = config;
