"use strict";

const crypto = require("crypto");

const COOKIE_NAME = "oauth_state_session";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory single-use store for replay protection: stateNonce -> { action, createdAt }
const stateNonceStore = new Map();

function getSecret() {
  return process.env.JWT_SECRET || "default_dev_oauth_state_secret_change_in_production";
}

/**
 * Extract a cookie value from req.cookies (cookie-parser) or fallback to raw req.headers.cookie.
 */
function getCookie(req, name) {
  if (!req) return null;
  if (req.cookies && req.cookies[name]) {
    return req.cookies[name];
  }
  if (req.headers && req.headers.cookie) {
    const rawCookies = req.headers.cookie.split(";");
    for (const c of rawCookies) {
      const [k, ...v] = c.trim().split("=");
      if (k === name) {
        return decodeURIComponent(v.join("="));
      }
    }
  }
  return null;
}

/**
 * Generate a session-bound OAuth state token and attach the session cookie to the response.
 * 
 * Session binding architecture:
 * 1. sessionSecret is stored in an HttpOnly, SameSite=Lax cookie on the user's browser.
 * 2. stateNonce is a single-use random value stored in-memory with a 10-minute TTL.
 * 3. HMAC(sessionSecret + stateNonce + action) binds the state parameter directly to that browser session.
 * 
 * @param {import("express").Response} res 
 * @param {string} action - e.g. "login" | "calendar"
 * @returns {string} The compound state token to pass to Google OAuth: "action:stateNonce:hmac"
 */
function createSessionBoundAuthState(res, action = "login") {
  const sessionSecret = crypto.randomBytes(32).toString("hex");
  const stateNonce = crypto.randomBytes(32).toString("hex");

  // Compute HMAC binding the session secret, nonce, and action
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(`${sessionSecret}:${stateNonce}:${action}`)
    .digest("hex");

  // Schedule cleanup after TTL with unref so it doesn't hold open the event loop
  const timer = setTimeout(() => {
    stateNonceStore.delete(stateNonce);
  }, STATE_TTL_MS);
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  // Record nonce in memory for replay protection
  stateNonceStore.set(stateNonce, {
    action,
    createdAt: Date.now(),
    timer,
  });

  // Set HttpOnly, SameSite=Lax cookie on the client browser
  if (res && typeof res.cookie === "function") {
    res.cookie(COOKIE_NAME, sessionSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: STATE_TTL_MS,
      path: "/auth",
    });
  }

  // Compound state parameter passed to OAuth provider
  return `${action}:${stateNonce}:${hmac}`;
}

/**
 * Validate and consume a session-bound OAuth state token.
 * 
 * Enforces:
 * 1. State parameter existence and correct format
 * 2. Presence of the session cookie from the initiating browser
 * 3. Cryptographic HMAC verification binding the cookie to the state parameter
 * 4. Single-use replay protection (deletes nonce on first check)
 * 5. TTL expiration check (< 10 minutes)
 * 
 * @param {import("express").Request} req 
 * @param {import("express").Response} res 
 * @param {string} [stateParam] - Optional state param (defaults to req.query.state)
 * @returns {{ valid: boolean, action?: string, reason?: string }}
 */
function validateAndConsumeAuthState(req, res, stateParam) {
  const rawState = stateParam || req?.query?.state;
  if (!rawState || typeof rawState !== "string") {
    return { valid: false, reason: "missing_state" };
  }

  const parts = rawState.split(":");
  if (parts.length !== 3) {
    return { valid: false, reason: "malformed_state" };
  }

  const [action, stateNonce, receivedHmac] = parts;
  const sessionSecret = getCookie(req, COOKIE_NAME);

  // Always clear the session cookie once consumed or rejected
  if (res && typeof res.clearCookie === "function") {
    res.clearCookie(COOKIE_NAME, { path: "/auth" });
  }

  // 1. Session Binding Check: Browser must present the cookie set during initiation
  if (!sessionSecret) {
    return { valid: false, reason: "missing_session_cookie" };
  }

  // 2. Cryptographic Session Verification: Recompute HMAC with the browser's cookie
  const expectedHmac = crypto
    .createHmac("sha256", getSecret())
    .update(`${sessionSecret}:${stateNonce}:${action}`)
    .digest("hex");

  const receivedBuf = Buffer.from(receivedHmac, "hex");
  const expectedBuf = Buffer.from(expectedHmac, "hex");

  if (receivedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
    return { valid: false, reason: "session_mismatch" };
  }

  // 3. Replay Protection & TTL Check: Check if the state nonce exists in memory
  const storedNonce = stateNonceStore.get(stateNonce);
  if (!storedNonce) {
    return { valid: false, reason: "state_expired_or_replayed" };
  }

  // Delete immediately to guarantee single-use and cancel timer
  if (storedNonce.timer) {
    clearTimeout(storedNonce.timer);
  }
  stateNonceStore.delete(stateNonce);

  if (Date.now() - storedNonce.createdAt > STATE_TTL_MS) {
    return { valid: false, reason: "state_expired" };
  }

  return { valid: true, action: storedNonce.action };
}

/**
 * Testing helper: reset in-memory state store.
 */
function _resetStoreForTesting() {
  for (const entry of stateNonceStore.values()) {
    if (entry && entry.timer) {
      clearTimeout(entry.timer);
    }
  }
  stateNonceStore.clear();
}

module.exports = {
  COOKIE_NAME,
  STATE_TTL_MS,
  createSessionBoundAuthState,
  validateAndConsumeAuthState,
  _resetStoreForTesting,
};
