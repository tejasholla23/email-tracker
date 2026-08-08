const crypto = require("crypto");

// In-memory single-use state store for account linking: state -> { parentAccountId, parentEmail, createdAt }
const linkStateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a single-use secure OAuth state for account linking.
 * 
 * @param {string} parentAccountId 
 * @param {string} parentEmail 
 * @returns {string} Single-use state token
 */
function createLinkState(parentAccountId, parentEmail) {
  const stateToken = crypto.randomBytes(32).toString("hex");
  linkStateStore.set(stateToken, {
    parentAccountId: parentAccountId.toString(),
    parentEmail,
    createdAt: Date.now(),
  });

  // Auto cleanup after 10 minutes
  setTimeout(() => {
    linkStateStore.delete(stateToken);
  }, STATE_TTL_MS);

  return stateToken;
}

/**
 * Consume and validate a single-use state token.
 * 
 * @param {string} stateToken 
 * @returns {object|null} { parentAccountId, parentEmail } or null if invalid/expired/replayed
 */
function consumeLinkState(stateToken) {
  if (!stateToken || typeof stateToken !== "string") return null;

  const data = linkStateStore.get(stateToken);
  if (!data) return null;

  if (Date.now() - data.createdAt > STATE_TTL_MS) {
    linkStateStore.delete(stateToken);
    return null;
  }

  // Single-use: delete immediately to prevent replay attacks
  linkStateStore.delete(stateToken);
  return data;
}

module.exports = {
  createLinkState,
  consumeLinkState,
};
