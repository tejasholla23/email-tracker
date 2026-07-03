"use strict";

const rateLimit = require("express-rate-limit");

// ─────────────────────────────────────────────────────────────────
// Shared error formatter — returns consistent JSON error responses
// ─────────────────────────────────────────────────────────────────
function rateLimitHandler(req, res, next, options) {
  res.status(options.statusCode).json({
    success: false,
    message: options.message,
    retryAfter: Math.ceil(options.windowMs / 1000 / 60) + " minutes"
  });
}

// ─────────────────────────────────────────────────────────────────
// GROUP 1: Auth endpoints (unauthenticated, IP-based)
//   Covers: /auth/google, /auth/google/calendar,
//           /auth/google/callback, /auth/token, /auth/refresh
//
//   10 requests per 15 minutes per IP.
//   A full login involves 3 sequential requests, so 10/15min
//   allows ~3 complete logins with room for retries.
// ─────────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,       // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: "Too many authentication attempts. Please try again in 15 minutes.",
  handler: rateLimitHandler
});

// ─────────────────────────────────────────────────────────────────
// GROUP 2: Manual Gmail sync (GET /sync)
//   Very expensive: Gmail API + LLM parsing + DB writes.
//   3 requests per 5 minutes per IP.
//   Complements the per-user cooldown in server.js.
// ─────────────────────────────────────────────────────────────────
const syncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many sync requests. Please wait a few minutes before syncing again.",
  handler: rateLimitHandler
});

// ─────────────────────────────────────────────────────────────────
// GROUP 3: Calendar re-sync trigger (POST /auth/calendar/sync)
//   Expensive: flags all DB records + triggers Google Calendar API sweep.
//   3 requests per 10 minutes per IP.
// ─────────────────────────────────────────────────────────────────
const calendarSyncLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many calendar sync requests. Please wait before triggering another re-sync.",
  handler: rateLimitHandler
});

// ─────────────────────────────────────────────────────────────────
// GROUP 4: Authenticated write endpoints (CRUD + destructive ops)
//   Covers: POST/PATCH/DELETE on /applications,
//           POST /auth/calendar/toggle, DELETE /auth/account,
//           DELETE /clear-all-applications
//
//   Tightened to 60/15min (not 200) because every write silently
//   triggers processCalendarSyncQueue() in the background.
// ─────────────────────────────────────────────────────────────────
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests. Please slow down and try again in a few minutes.",
  handler: rateLimitHandler
});

// ─────────────────────────────────────────────────────────────────
// GROUP 5: Read-only authenticated endpoints
//   Covers: GET /applications, GET /applications/sync-status,
//           GET /auth/me, GET /auth/calendar/status, GET /logout
//
//   200 requests per 15 minutes per IP — generous for polling
//   and normal dashboard usage.
// ─────────────────────────────────────────────────────────────────
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests. Please slow down.",
  handler: rateLimitHandler
});

module.exports = {
  authLimiter,
  syncLimiter,
  calendarSyncLimiter,
  writeLimiter,
  readLimiter
};
