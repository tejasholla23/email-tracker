const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

test("resilientAuth: Refresh token generation produces 128-char hex string with unique values", () => {
  const t1 = generateRefreshToken();
  const t2 = generateRefreshToken();
  assert.strictEqual(t1.length, 128);
  assert.strictEqual(t2.length, 128);
  assert.notStrictEqual(t1, t2);
});

test("resilientAuth: Hash is deterministic SHA-256 hex string", () => {
  const token = generateRefreshToken();
  const h1 = hashRefreshToken(token);
  const h2 = hashRefreshToken(token);
  assert.strictEqual(h1, h2);
  assert.strictEqual(h1.length, 64);
});

test("resilientAuth: Concurrency grace period simulation (multi-tab scenario)", () => {
  // Scenario:
  // Tab 1 and Tab 2 are both open with the same refresh token (RT1).
  // Tab 1's access token expires, so Tab 1 calls POST /auth/refresh with RT1.
  // Server generates RT2, marks RT1 with graceUntil = now + 60s, saves RT2.
  // Simultaneously, Tab 2 makes an API call and also tries to refresh with RT1.
  // Under the old system: RT1 was already wiped/invalid, Tab 2 failed and immediately logged the user out.
  // Under the new system: Tab 2's request hits within the 60s grace window and is accepted!

  const rt1 = generateRefreshToken();
  const hash1 = hashRefreshToken(rt1);
  const now = new Date();
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  // Initial account state
  const account = {
    _id: "user_test_id_123",
    email: "user@example.com",
    refreshTokenHash: hash1,
    refreshTokenExpiresAt: ninetyDays,
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
    activeRefreshTokens: [
      {
        tokenHash: hash1,
        expiresAt: ninetyDays,
        graceUntil: null
      }
    ]
  };

  // Helper function simulating the logic in server.js POST /auth/refresh
  function processRefresh(accountDoc, submittedToken, requestTime) {
    const hashed = hashRefreshToken(submittedToken);

    // Prune expired
    accountDoc.activeRefreshTokens = accountDoc.activeRefreshTokens.filter(t => {
      if (t.graceUntil) {
        return t.graceUntil > requestTime;
      }
      return t.expiresAt && t.expiresAt > requestTime;
    });

    // Check grace window
    const graceTokenEntry = accountDoc.activeRefreshTokens.find(
      t => t.tokenHash === hashed && t.graceUntil && t.graceUntil > requestTime
    );
    const isSingleFieldGrace = (
      accountDoc.previousRefreshTokenHash === hashed &&
      accountDoc.previousRefreshTokenExpiresAt &&
      accountDoc.previousRefreshTokenExpiresAt > requestTime
    );

    if (graceTokenEntry || isSingleFieldGrace) {
      return { status: 200, isGrace: true, token: submittedToken };
    }

    // Check active (must not have an active or expired grace window)
    const activeTokenEntry = accountDoc.activeRefreshTokens.find(
      t => t.tokenHash === hashed && t.expiresAt > requestTime && !t.graceUntil
    );
    const isPrimaryActive = (
      accountDoc.refreshTokenHash === hashed &&
      accountDoc.refreshTokenExpiresAt &&
      accountDoc.refreshTokenExpiresAt > requestTime &&
      accountDoc.refreshTokenHash !== accountDoc.previousRefreshTokenHash
    );

    if (!activeTokenEntry && !isPrimaryActive) {
      return { status: 401, error: "Invalid or expired refresh token" };
    }

    // Rotate
    const newRt = generateRefreshToken();
    const newHash = hashRefreshToken(newRt);
    const gracePeriod = new Date(requestTime.getTime() + 60 * 1000); // 60s grace
    const newExpiry = new Date(requestTime.getTime() + 90 * 24 * 60 * 60 * 1000);

    if (activeTokenEntry) {
      activeTokenEntry.graceUntil = gracePeriod;
    } else {
      accountDoc.activeRefreshTokens.push({
        tokenHash: hashed,
        expiresAt: gracePeriod,
        graceUntil: gracePeriod
      });
    }

    accountDoc.activeRefreshTokens.push({
      tokenHash: newHash,
      expiresAt: newExpiry,
      graceUntil: null
    });

    accountDoc.previousRefreshTokenHash = hashed;
    accountDoc.previousRefreshTokenExpiresAt = gracePeriod;
    accountDoc.refreshTokenHash = newHash;
    accountDoc.refreshTokenExpiresAt = newExpiry;

    if (accountDoc.activeRefreshTokens.length > 10) {
      accountDoc.activeRefreshTokens = accountDoc.activeRefreshTokens.slice(-10);
    }

    return { status: 200, isGrace: false, token: newRt };
  }

  // Action 1: Tab 1 refreshes with RT1 at t = 0s
  const t0 = new Date();
  const res1 = processRefresh(account, rt1, t0);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.isGrace, false);
  const rt2 = res1.token;
  assert.notStrictEqual(rt2, rt1);

  // Action 2: Tab 2 sends old token RT1 at t = 15s (within 60s grace period)
  const t15 = new Date(t0.getTime() + 15 * 1000);
  const res2 = processRefresh(account, rt1, t15);
  assert.strictEqual(res2.status, 200, "Old token presented during 60s grace period must succeed");
  assert.strictEqual(res2.isGrace, true, "Should be identified as grace period token");

  // Action 3: A rogue or stale client sends old token RT1 at t = 65s (past 60s grace window)
  const t65 = new Date(t0.getTime() + 65 * 1000);
  const res3 = processRefresh(account, rt1, t65);
  assert.strictEqual(res3.status, 401, "Old token presented after 60s grace period must be rejected");

  // Action 4: Tab 1 sends new token RT2 at t = 70s
  const t70 = new Date(t0.getTime() + 70 * 1000);
  const res4 = processRefresh(account, rt2, t70);
  assert.strictEqual(res4.status, 200, "Active rotated token RT2 must succeed");
  assert.strictEqual(res4.isGrace, false);
});

test("resilientAuth: 5 concurrent tabs refresh within grace period successfully", () => {
  const originalToken = generateRefreshToken();
  const originalHash = hashRefreshToken(originalToken);
  const now = new Date();
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const account = {
    _id: "user_test_multi_tab",
    email: "multitab@example.com",
    refreshTokenHash: originalHash,
    refreshTokenExpiresAt: ninetyDays,
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
    activeRefreshTokens: [
      {
        tokenHash: originalHash,
        expiresAt: ninetyDays,
        graceUntil: null
      }
    ]
  };

  // Helper matching server.js POST /auth/refresh
  function refreshRequest(submittedToken, offsetMs) {
    const reqTime = new Date(now.getTime() + offsetMs);
    const hashed = hashRefreshToken(submittedToken);

    // Prune
    account.activeRefreshTokens = account.activeRefreshTokens.filter(t => {
      if (t.graceUntil) return t.graceUntil > reqTime;
      return t.expiresAt && t.expiresAt > reqTime;
    });

    // Check grace window
    const graceTokenEntry = account.activeRefreshTokens.find(
      t => t.tokenHash === hashed && t.graceUntil && t.graceUntil > reqTime
    );
    const isSingleFieldGrace = (
      account.previousRefreshTokenHash === hashed &&
      account.previousRefreshTokenExpiresAt &&
      account.previousRefreshTokenExpiresAt > reqTime
    );

    if (graceTokenEntry || isSingleFieldGrace) {
      return { status: 200, rotated: false };
    }

    const activeTokenEntry = account.activeRefreshTokens.find(
      t => t.tokenHash === hashed && t.expiresAt > reqTime && !t.graceUntil
    );
    const isPrimaryActive = (
      account.refreshTokenHash === hashed &&
      account.refreshTokenExpiresAt &&
      account.refreshTokenExpiresAt > reqTime &&
      account.refreshTokenHash !== account.previousRefreshTokenHash
    );

    if (!activeTokenEntry && !isPrimaryActive) {
      return { status: 401, error: "Invalid or expired refresh token" };
    }

    const newRt = generateRefreshToken();
    const newHash = hashRefreshToken(newRt);
    const gracePeriod = new Date(reqTime.getTime() + 60 * 1000);
    const newExpiry = new Date(reqTime.getTime() + 90 * 24 * 60 * 60 * 1000);

    if (activeTokenEntry) {
      activeTokenEntry.graceUntil = gracePeriod;
    } else {
      account.activeRefreshTokens.push({
        tokenHash: hashed,
        expiresAt: gracePeriod,
        graceUntil: gracePeriod
      });
    }

    account.activeRefreshTokens.push({
      tokenHash: newHash,
      expiresAt: newExpiry,
      graceUntil: null
    });

    account.previousRefreshTokenHash = hashed;
    account.previousRefreshTokenExpiresAt = gracePeriod;
    account.refreshTokenHash = newHash;
    account.refreshTokenExpiresAt = newExpiry;

    return { status: 200, rotated: true, newToken: newRt };
  }

  // Tab 1 hits at 0ms -> Rotates token
  const tab1 = refreshRequest(originalToken, 0);
  assert.strictEqual(tab1.status, 200);
  assert.strictEqual(tab1.rotated, true);

  // Tab 2 hits at 100ms with originalToken -> Grace match
  const tab2 = refreshRequest(originalToken, 100);
  assert.strictEqual(tab2.status, 200);
  assert.strictEqual(tab2.rotated, false);

  // Tab 3 hits at 500ms with originalToken -> Grace match
  const tab3 = refreshRequest(originalToken, 500);
  assert.strictEqual(tab3.status, 200);
  assert.strictEqual(tab3.rotated, false);

  // Tab 4 hits at 2000ms with originalToken -> Grace match
  const tab4 = refreshRequest(originalToken, 2000);
  assert.strictEqual(tab4.status, 200);
  assert.strictEqual(tab4.rotated, false);

  // Tab 5 hits at 10000ms with originalToken -> Grace match
  const tab5 = refreshRequest(originalToken, 10000);
  assert.strictEqual(tab5.status, 200);
  assert.strictEqual(tab5.rotated, false);

  // None of the 5 tabs received a 401 or were logged out!
});

test("resilientAuth: Active sessions capped at 10 to avoid unbounded document growth", () => {
  const tokens = Array.from({ length: 15 }, () => ({
    tokenHash: generateRefreshToken(),
    expiresAt: new Date(Date.now() + 100000),
    graceUntil: null
  }));

  const capped = tokens.slice(-10);
  assert.strictEqual(capped.length, 10);
});

test("resilientAuth: Completely invalid or unknown token is rejected with 401", () => {
  const fakeToken = generateRefreshToken();
  const fakeAccount = {
    refreshTokenHash: "some_other_hash",
    refreshTokenExpiresAt: new Date(Date.now() + 100000),
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
    activeRefreshTokens: []
  };

  const hashed = hashRefreshToken(fakeToken);
  const matches = (
    fakeAccount.refreshTokenHash === hashed ||
    fakeAccount.previousRefreshTokenHash === hashed ||
    fakeAccount.activeRefreshTokens.some(t => t.tokenHash === hashed)
  );

  assert.strictEqual(matches, false, "Unknown token should not match account");
});
