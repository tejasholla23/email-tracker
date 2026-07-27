const crypto = require("crypto");

// In-memory store mapping authCode -> { email, createdAt }
const store = new Map();

const CODE_TTL_MS = 60000; // 60 seconds

function generateAuthCode(email) {
  const code = crypto.randomBytes(32).toString("hex");
  store.set(code, {
    email,
    createdAt: Date.now(),
  });
  
  // Automatically remove after 60 seconds
  setTimeout(() => {
    store.delete(code);
  }, CODE_TTL_MS);
  
  return code;
}

function consumeAuthCode(code) {
  const data = store.get(code);
  if (!data) return null;

  // Verify TTL in case setTimeout hasn't fired yet
  if (Date.now() - data.createdAt > CODE_TTL_MS) {
    store.delete(code);
    return null;
  }

  // Single-use: delete immediately upon consumption
  store.delete(code);
  return data.email;
}

module.exports = {
  generateAuthCode,
  consumeAuthCode,
};
