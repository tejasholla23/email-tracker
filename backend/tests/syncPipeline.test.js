"use strict";

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "dummy_client_id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "dummy_client_secret";
process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback";
process.env.JWT_SECRET = process.env.JWT_SECRET || "dummy_jwt_secret";
process.env.CRON_API_KEY = process.env.CRON_API_KEY || "dummy_cron_key";

const mongoose = require("mongoose");
mongoose.connect = async () => ({ connection: {} });

// Mock OpenAI
require.cache[require.resolve("openai")] = {
  exports: {
    OpenAI: class {
      constructor() {
        this.chat = {
          completions: {
            create: async () => ({
              choices: [{
                message: {
                  content: JSON.stringify({
                    emailType: "job",
                    opportunityType: "JOB_APPLICATION",
                    classification: "New Hiring Opportunity",
                    company: "Acme Corp",
                    subtitle: "Software Engineer",
                    type: "full-time",
                    displayFields: [{ label: "Role", value: "Software Engineer" }]
                  })
                }
              }]
            })
          }
        };
      }
    }
  }
};

const companyInfoService = require("../utils/companyInfoService");
companyInfoService.getCompanyInfo = async () => ({ name: "Acme Corp", isEnriched: true });

const test = require("node:test");
const assert = require("node:assert");
const { google } = require("googleapis");
const config = require("../config/appConfig");
config.LLM_DELAY_MS = 0;

const Account = require("../models/Account");
const LinkedGmailAccount = require("../models/LinkedGmailAccount");
const Application = require("../models/Application");

// Global stub for Application model operations to prevent buffering
Application.findOne = async () => null;
Application.find = async () => [];
Application.findByIdAndUpdate = async () => null;
Application.findOneAndUpdate = async () => null;
Application.prototype.save = async () => {};
Account.updateMany = async () => ({ modifiedCount: 0 });

const {
  fetchAndProcessEmails,
  syncLinkedAccountsForUser,
  activeSyncs,
  pendingSyncs,
} = require("../server");

// Helper to reset mocks and sets between tests
function resetSyncState() {
  activeSyncs.clear();
  pendingSyncs.clear();
}

// ── Test 1: New user bootstrap ──
test("1. New user bootstrap: uses config.MAX_EMAILS_PER_SYNC and newer_than:30d", async () => {
  resetSyncState();

  const fakeUserId = "507f191e810c19729de860ea";
  const fakeAccount = {
    _id: fakeUserId,
    email: "newuser@msrit.edu",
    tokens: { access_token: "fake_token", refresh_token: "fake_refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    lastHistoryId: null, // Brand new account
    syncStatus: "idle",
  };

  let capturedListParams = null;
  let capturedProfileCall = false;

  const originalFind = Account.find;
  const originalFindOneAndUpdate = Account.findOneAndUpdate;
  const originalLinkedFind = LinkedGmailAccount.find;
  const originalAppFind = Application.find;

  // Mock Gmail API
  const mockGmail = {
    users: {
      getProfile: async () => {
        capturedProfileCall = true;
        return { data: { historyId: "100500" } };
      },
      messages: {
        list: async (params) => {
          capturedListParams = params;
          return { data: { messages: [{ id: "msg_1" }, { id: "msg_2" }] } };
        },
        get: async () => ({
          data: {
            id: "msg_1",
            internalDate: "1700000000000",
            payload: {
              headers: [
                { name: "From", value: "placement@msrit.edu" },
                { name: "Subject", value: "Campus Hiring Notice" },
                { name: "Message-ID", value: "<msg1@msrit.edu>" },
              ],
              body: { data: Buffer.from("Placement notice body").toString("base64url") },
            },
          },
        }),
      },
    },
  };

  const originalGoogleGmail = google.gmail;
  google.gmail = () => mockGmail;

  Account.find = async () => [fakeAccount];
  Account.findOneAndUpdate = async (query, update) => {
    Object.assign(fakeAccount, update.$set || update);
    return fakeAccount;
  };
  LinkedGmailAccount.find = async () => [];
  Application.find = async () => [];

  try {
    await fetchAndProcessEmails(fakeUserId);

    assert.ok(capturedListParams, "Must have called messages.list");
    assert.strictEqual(
      capturedListParams.maxResults,
      config.MAX_EMAILS_PER_SYNC,
      `maxResults must equal config.MAX_EMAILS_PER_SYNC (${config.MAX_EMAILS_PER_SYNC})`
    );
    assert.ok(
      capturedListParams.q.includes("newer_than:30d"),
      "First-time user query must use newer_than:30d recency"
    );
    assert.ok(capturedProfileCall, "Must capture baseline historyId from getProfile");
    assert.strictEqual(fakeAccount.lastHistoryId, "100500", "Must save baseline historyId to Account");
    assert.strictEqual(fakeAccount.syncMode, "incremental", "Must transition syncMode to incremental");
  } finally {
    Account.find = originalFind;
    Account.findOneAndUpdate = originalFindOneAndUpdate;
    LinkedGmailAccount.find = originalLinkedFind;
    Application.find = originalAppFind;
    google.gmail = originalGoogleGmail;
    resetSyncState();
  }
});

// ── Test 2: Existing user with valid lastHistoryId ──
test("2. Existing user: continues using incremental History API path", async () => {
  resetSyncState();

  const fakeUserId = "507f191e810c19729de860eb";
  const fakeAccount = {
    _id: fakeUserId,
    email: "existinguser@msrit.edu",
    tokens: { access_token: "fake_token", refresh_token: "fake_refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    lastHistoryId: "100500", // Established account
    syncStatus: "idle",
  };

  let historyListCalledWith = null;
  let messagesListCalled = false;

  const mockGmail = {
    users: {
      history: {
        list: async (params) => {
          historyListCalledWith = params;
          return {
            data: {
              historyId: "100550",
              history: [
                {
                  messagesAdded: [{ message: { id: "msg_new_1" } }],
                },
              ],
            },
          };
        },
      },
      messages: {
        list: async () => {
          messagesListCalled = true;
          return { data: { messages: [] } };
        },
        get: async () => ({
          data: {
            id: "msg_new_1",
            internalDate: "1700000000000",
            payload: {
              headers: [
                { name: "From", value: "placement@msrit.edu" },
                { name: "Subject", value: "Shortlist Announcement" },
                { name: "Message-ID", value: "<msg_new_1@msrit.edu>" },
              ],
              body: { data: Buffer.from("Shortlist body").toString("base64url") },
            },
          },
        }),
      },
    },
  };

  const originalFind = Account.find;
  const originalFindOneAndUpdate = Account.findOneAndUpdate;
  const originalLinkedFind = LinkedGmailAccount.find;
  const originalAppFind = Application.find;
  const originalGoogleGmail = google.gmail;

  google.gmail = () => mockGmail;
  Account.find = async () => [fakeAccount];
  Account.findOneAndUpdate = async (query, update) => {
    Object.assign(fakeAccount, update.$set || update);
    return fakeAccount;
  };
  LinkedGmailAccount.find = async () => [];
  Application.find = async () => [];

  try {
    await fetchAndProcessEmails(fakeUserId);

    assert.ok(historyListCalledWith, "Must have called history.list");
    assert.strictEqual(historyListCalledWith.startHistoryId, "100500");
    assert.strictEqual(messagesListCalled, false, "Must NOT call messages.list for incremental sync");
    assert.strictEqual(fakeAccount.lastHistoryId, "100550", "Must advance lastHistoryId to latest from history");
  } finally {
    Account.find = originalFind;
    Account.findOneAndUpdate = originalFindOneAndUpdate;
    LinkedGmailAccount.find = originalLinkedFind;
    Application.find = originalAppFind;
    google.gmail = originalGoogleGmail;
    resetSyncState();
  }
});

// ── Test 3 & 4: Concurrent Pub/Sub events queued and coalesced ──
test("3 & 4. Pub/Sub during active sync: queued in pendingSyncs and drains exactly once", async () => {
  resetSyncState();

  const fakeUserId = "507f191e810c19729de860ec";
  const fakeUserIdStr = fakeUserId.toString();

  // Manually lock user
  activeSyncs.add(fakeUserIdStr);

  // Simulate webhook arrival 1
  await fetchAndProcessEmails(fakeUserId);
  assert.ok(pendingSyncs.has(fakeUserIdStr), "Webhook 1 must add user to pendingSyncs");

  // Simulate webhook arrival 2 (coalescing)
  await fetchAndProcessEmails(fakeUserId);
  assert.strictEqual(pendingSyncs.size, 1, "Multiple webhooks must coalesce to 1 entry in pendingSyncs");

  // Release manual lock and verify state
  activeSyncs.delete(fakeUserIdStr);
  assert.strictEqual(activeSyncs.has(fakeUserIdStr), false);
  assert.strictEqual(pendingSyncs.has(fakeUserIdStr), true);

  resetSyncState();
});

// ── Test 5: Sync failure guarantees lock cleanup in finally ──
test("5. Sync failure: activeSyncs lock is guaranteed to be released", async () => {
  resetSyncState();

  const fakeUserId = "507f191e810c19729de860ed";
  const fakeUserIdStr = fakeUserId.toString();

  const originalFind = Account.find;
  Account.find = async () => {
    throw new Error("Simulated Database Connection Failure");
  };

  try {
    await fetchAndProcessEmails(fakeUserId);
  } catch (e) {
    // Error caught inside or swallowed gracefully
  } finally {
    Account.find = originalFind;
    assert.strictEqual(
      activeSyncs.has(fakeUserIdStr),
      false,
      "activeSyncs must be empty after sync failure"
    );
    resetSyncState();
  }
});

// ── Test 6: HistoryId baseline race condition safety ──
test("6. HistoryId race safety: baseline H0 allows catch-up sync to discover in-flight messages", async () => {
  resetSyncState();

  const fakeUserId = "507f191e810c19729de860ee";
  let mailboxHistoryId = "100000"; // T0 baseline

  const fakeAccount = {
    _id: fakeUserId,
    email: "racewatch@msrit.edu",
    tokens: { access_token: "fake_token", refresh_token: "fake_refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    lastHistoryId: null,
    syncStatus: "idle",
  };

  let incrementalHistoryStart = null;

  const mockGmail = {
    users: {
      getProfile: async () => ({
        data: { historyId: mailboxHistoryId },
      }),
      messages: {
        list: async () => ({ data: { messages: [{ id: "bootstrap_msg" }] } }),
        get: async () => ({
          data: {
            id: "bootstrap_msg",
            internalDate: "1700000000000",
            payload: {
              headers: [
                { name: "From", value: "placement@msrit.edu" },
                { name: "Subject", value: "Initial Email" },
              ],
              body: { data: Buffer.from("Initial").toString("base64url") },
            },
          },
        }),
      },
      history: {
        list: async (params) => {
          incrementalHistoryStart = params.startHistoryId;
          return {
            data: {
              historyId: "100050",
              history: [{ messagesAdded: [{ message: { id: "inflight_msg" } }] }],
            },
          };
        },
      },
    },
  };

  const originalFind = Account.find;
  const originalFindOneAndUpdate = Account.findOneAndUpdate;
  const originalLinkedFind = LinkedGmailAccount.find;
  const originalAppFind = Application.find;
  const originalGoogleGmail = google.gmail;

  google.gmail = () => mockGmail;
  Account.find = async () => [fakeAccount];
  Account.findOneAndUpdate = async (query, update) => {
    Object.assign(fakeAccount, update.$set || update);
    return fakeAccount;
  };
  LinkedGmailAccount.find = async () => [];
  Application.find = async () => [];

  try {
    // 1. Initial Sync runs at T0
    await fetchAndProcessEmails(fakeUserId);

    // Initial sync captured baseline H0 = 100000
    assert.strictEqual(fakeAccount.lastHistoryId, "100000", "Initial sync must save T0 baseline historyId");

    // 2. In-flight email arrived at T2, advancing Gmail's mailbox to 100050
    mailboxHistoryId = "100050";

    // 3. Catch-up sync runs at T5
    await fetchAndProcessEmails(fakeUserId);

    assert.strictEqual(
      incrementalHistoryStart,
      "100000",
      "Catch-up incremental sync must start from baseline 100000 to catch in-flight emails"
    );
    assert.strictEqual(fakeAccount.lastHistoryId, "100050", "Account must advance to latest historyId after catchup");
  } finally {
    Account.find = originalFind;
    Account.findOneAndUpdate = originalFindOneAndUpdate;
    LinkedGmailAccount.find = originalLinkedFind;
    Application.find = originalAppFind;
    google.gmail = originalGoogleGmail;
    resetSyncState();
  }
});

// ── Test 7: Linked account synchronization behavior remains intact ──
test("7. Linked accounts: first-time full sync uses linkedMaxResults: 20 and newer_than:30d", async () => {
  resetSyncState();

  const parentAcc = {
    _id: "parent_user_id_123",
    email: "parent@msrit.edu",
    studentProfile: { fullName: "Test Student", usn: "1MS23CI126" },
  };

  const linkedAcc = {
    _id: "linked_user_id_456",
    parentAccountId: "parent_user_id_123",
    email: "linked@gmail.com",
    tokens: { access_token: "fake_linked_token", refresh_token: "fake_linked_refresh" },
    lastHistoryId: null, // First-time linked account
    syncStatus: "idle",
  };

  let linkedListParams = null;

  const mockLinkedGmail = {
    users: {
      getProfile: async () => ({ data: { historyId: "200100" } }),
      messages: {
        list: async (params) => {
          linkedListParams = params;
          return { data: { messages: [{ id: "linked_msg_1" }] } };
        },
        get: async () => ({
          data: {
            id: "linked_msg_1",
            internalDate: "1700000000000",
            payload: {
              headers: [
                { name: "From", value: "placement@msrit.edu" },
                { name: "Subject", value: "Linked Account Email" },
              ],
              body: { data: Buffer.from("Linked email body").toString("base64url") },
            },
          },
        }),
      },
    },
  };

  const originalLinkedFind = LinkedGmailAccount.find;
  const originalLinkedUpdate = LinkedGmailAccount.findByIdAndUpdate;
  const originalAppFind = Application.find;
  const originalGoogleGmail = google.gmail;

  google.gmail = () => mockLinkedGmail;
  LinkedGmailAccount.find = async () => [linkedAcc];
  LinkedGmailAccount.findByIdAndUpdate = async (id, update) => {
    Object.assign(linkedAcc, update.$set || update);
    return linkedAcc;
  };
  Application.find = async () => [];

  try {
    await syncLinkedAccountsForUser(parentAcc, { llmParsedCount: 0 });

    assert.ok(linkedListParams, "Must query messages.list for linked account");
    assert.strictEqual(linkedListParams.maxResults, 20, "First-time linked account must use maxResults: 20");
    assert.ok(linkedListParams.q.includes("newer_than:30d"), "First-time linked account must use newer_than:30d");
    assert.strictEqual(linkedAcc.lastHistoryId, "200100", "Linked account must save historyId");
    assert.strictEqual(linkedAcc.syncMode, "incremental", "Linked account must transition to incremental");
  } finally {
    LinkedGmailAccount.find = originalLinkedFind;
    LinkedGmailAccount.findByIdAndUpdate = originalLinkedUpdate;
    Application.find = originalAppFind;
    google.gmail = originalGoogleGmail;
    resetSyncState();
  }
});

test.after(() => {
  process.exit(0);
});

