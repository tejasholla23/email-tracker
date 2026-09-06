const jwt = require("jsonwebtoken");
const crypto = require("crypto");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

function generateAccessToken(account) {
  return jwt.sign(
    {
      sub: account._id.toString(),
      email: account.email,
    },
    getJwtSecret(),
    { expiresIn: "1h" }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
};
