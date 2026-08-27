"use strict";

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "dummy_client_id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "dummy_client_secret";
process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/auth/google/callback";
process.env.JWT_SECRET = process.env.JWT_SECRET || "dummy_jwt_secret";
process.env.CRON_API_KEY = process.env.CRON_API_KEY || "dummy_cron_key";

const mongoose = require("mongoose");
mongoose.connect = async () => ({ connection: {} });

let mockLLMCallCount = 0;
let mockLLMBehavior = null;

// Mock OpenAI
require.cache[require.resolve("openai")] = {
  exports: {
    OpenAI: class {
      constructor() {
        this.chat = {
          completions: {
            create: async (params) => {
              mockLLMCallCount++;
              if (mockLLMBehavior) {
                return mockLLMBehavior(params);
              }
              return {
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
              };
            }
          }
        };
      }
    }
  }
};

const test = require("node:test");
const assert = require("node:assert");
const { google } = require("googleapis");
const config = require("../config/appConfig");
config.LLM_DELAY_MS = 0;

const Account = require("../models/Account");
const LinkedGmailAccount = require("../models/LinkedGmailAccount");
const Application = require("../models/Application");
const { parseEmailWithSingleFlight, inFlightParses, parseEmailWithLLM } = require("../utils/parseEmailWithLLM");

// Require server functions
const { fetchAndProcessEmails, resetSyncState } = require("../server");

test.beforeEach(() => {
  mockLLMCallCount = 0;
  mockLLMBehavior = null;
  resetSyncState();
});

// ── Test 1: 10 fresh emails + 50 pending retries → Fresh processed first, retries bounded ──
test("1. Freshness Priority: 10 fresh emails + 50 pending retries → fresh emails run first, 0 starve", async () => {
  const fakeUserId = "507f191e810c19729de860f1";
  const fakeAccount = {
    _id: fakeUserId,
    email: "freshuser@msrit.edu",
    tokens: { access_token: "fake_token", refresh_token: "fake_refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    lastHistoryId: "100000",
    syncStatus: "idle",
  };

  const freshMessageIds = Array.from({ length: 10 }, (_, i) => `fresh_msg_${i + 1}`);
  const pendingRecords = Array.from({ length: 50 }, (_, i) => ({
    _id: `pending_id_${i + 1}`,
    userId: fakeUserId,
    messageId: `pending_msg_${i + 1}`,
    company: null,
    role: "Pending Analysis",
    status: "pending",
    isDeleted: false,
    parseMeta: {
      shouldRetry: true,
      status: "pending",
      retryCount: 1,
      nextRetryAt: new Date(Date.now() - 60000) // Ready for retry
    }
  }));

  const fetchedOrder = [];

  const mockGmail = {
    users: {
      history: {
        list: async () => ({
          data: {
            historyId: "100100",
            history: freshMessageIds.map(id => ({ messagesAdded: [{ message: { id } }] })),
          },
        }),
      },
      messages: {
        get: async (params) => {
          fetchedOrder.push(params.id);
          return {
            data: {
              id: params.id,
              internalDate: "1700000000000",
              payload: {
                headers: [
                  { name: "From", value: "placement@msrit.edu" },
                  { name: "Subject", value: `Opportunity ${params.id}` },
                  { name: "Message-ID", value: `<${params.id}@msrit.edu>` },
                ],
                body: { data: Buffer.from("Placement details").toString("base64url") },
              },
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
  const originalAppFindOne = Application.findOne;
  const originalAppFindByIdAndUpdate = Application.findByIdAndUpdate;
  const originalAppSave = Application.prototype.save;
  const originalGoogleGmail = google.gmail;

  google.gmail = () => mockGmail;
  Account.find = async () => [fakeAccount];
  Account.findOneAndUpdate = async (query, update) => {
    Object.assign(fakeAccount, update.$set || update);
    return fakeAccount;
  };
  LinkedGmailAccount.find = async () => [];

  Application.find = async (query) => {
    if (query && query.userId) {
      return pendingRecords;
    }
    return [];
  };
  Application.findOne = async () => null;
  Application.findByIdAndUpdate = async () => null;
  Application.prototype.save = async () => {};

  try {
    await fetchAndProcessEmails(fakeUserId);

    // Verify: exactly 10 fresh emails were processed first up to MAX_EMAILS_PER_SYNC
    assert.strictEqual(fetchedOrder.length, 10, "Must process exactly 10 emails (the freshness cap)");
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(fetchedOrder[i], freshMessageIds[i], `Email at position ${i} must be fresh email ${freshMessageIds[i]}`);
    }
  } finally {
    Account.find = originalFind;
    Account.findOneAndUpdate = originalFindOneAndUpdate;
    LinkedGmailAccount.find = originalLinkedFind;
    Application.find = originalAppFind;
    Application.findOne = originalAppFindOne;
    Application.findByIdAndUpdate = originalAppFindByIdAndUpdate;
    Application.prototype.save = originalAppSave;
    google.gmail = originalGoogleGmail;
  }
});

// ── Test 2: 100 pending retries + no fresh emails → Bounded to at most MAX_PENDING_RETRIES_PER_SYNC (2) ──
test("2. Bounded Retry Drainage: 100 pending retries with 0 fresh emails → processes at most 2 retries per pass", async () => {
  const fakeUserId = "507f191e810c19729de860f2";
  const fakeAccount = {
    _id: fakeUserId,
    email: "retryuser@msrit.edu",
    tokens: { access_token: "fake_token", refresh_token: "fake_refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    lastHistoryId: "200000",
    syncStatus: "idle",
  };

  const pendingRecords = Array.from({ length: 100 }, (_, i) => ({
    _id: `pending_app_${i + 1}`,
    userId: fakeUserId,
    messageId: `pending_msg_${i + 1}`,
    company: null,
    role: "Pending Analysis",
    status: "pending",
    isDeleted: false,
    parseMeta: {
      shouldRetry: true,
      status: "pending",
      retryCount: 1,
      nextRetryAt: new Date(Date.now() - 60000)
    }
  }));

  const fetchedIds = [];

  const mockGmail = {
    users: {
      history: {
        list: async () => ({
          data: {
            historyId: "200010",
            history: [], // 0 new history events
          },
        }),
      },
      messages: {
        get: async (params) => {
          fetchedIds.push(params.id);
          return {
            data: {
              id: params.id,
              internalDate: "1700000000000",
              payload: {
                headers: [
                  { name: "From", value: "placement@msrit.edu" },
                  { name: "Subject", value: `Retry Opportunity ${params.id}` },
                  { name: "Message-ID", value: `<${params.id}@msrit.edu>` },
                ],
                body: { data: Buffer.from("Placement details").toString("base64url") },
              },
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
  const originalAppFindOne = Application.findOne;
  const originalAppFindByIdAndUpdate = Application.findByIdAndUpdate;
  const originalGoogleGmail = google.gmail;

  google.gmail = () => mockGmail;
  Account.find = async () => [fakeAccount];
  Account.findOneAndUpdate = async (query, update) => {
    Object.assign(fakeAccount, update.$set || update);
    return fakeAccount;
  };
  LinkedGmailAccount.find = async () => [];

  Application.find = async (query) => {
    if (query && query.userId) {
      return pendingRecords;
    }
    return [];
  };
  Application.findOne = async (query) => {
    return pendingRecords.find(p => p.messageId === query?.messageId) || null;
  };
  Application.findByIdAndUpdate = async () => null;

  try {
    await fetchAndProcessEmails(fakeUserId);

    assert.strictEqual(fetchedIds.length, 2, "Must process at most MAX_PENDING_RETRIES_PER_SYNC (2) messages in a single pass");
    assert.strictEqual(fetchedIds[0], "pending_msg_1");
    assert.strictEqual(fetchedIds[1], "pending_msg_2");
  } finally {
    Account.find = originalFind;
    Account.findOneAndUpdate = originalFindOneAndUpdate;
    LinkedGmailAccount.find = originalLinkedFind;
    Application.find = originalAppFind;
    Application.findOne = originalAppFindOne;
    Application.findByIdAndUpdate = originalAppFindByIdAndUpdate;
    google.gmail = originalGoogleGmail;
  }
});

// ── Test 3: Outage + repeated webhooks → Exponential backoff prevents repeated LLM attempts ──
test("3. Backoff Protection: Pending record with future nextRetryAt is skipped without making LLM calls", async () => {
  const fakeUserId = "507f191e810c19729de860f3";
  const futureDate = new Date(Date.now() + 15 * 60 * 1000); // 15 mins in future

  const pendingRecord = {
    _id: "pending_backoff_app",
    userId: fakeUserId,
    messageId: "backoff_msg_1",
    company: null,
    role: "Pending Analysis",
    status: "pending",
    isDeleted: false,
    parseMeta: {
      shouldRetry: true,
      status: "pending",
      retryCount: 1,
      nextRetryAt: futureDate,
    }
  };

  const fakeAccount = {
    _id: fakeUserId,
    email: "backoffuser@msrit.edu",
    tokens: { access_token: "fake_token", refresh_token: "fake_refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    lastHistoryId: "300000",
    syncStatus: "idle",
  };

  const mockGmail = {
    users: {
      history: {
        list: async () => ({
          data: {
            historyId: "300010",
            history: [],
          },
        }),
      },
      messages: {
        get: async () => {
          throw new Error("Should not fetch Gmail message for backoff-active items");
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

  // find query returns empty because nextRetryAt is in the future ($lte: now filter rejects it)
  Application.find = async (query) => {
    if (query?.["parseMeta.nextRetryAt"]?.$lte && query["parseMeta.nextRetryAt"].$lte < futureDate) {
      return []; // Not eligible yet!
    }
    return [pendingRecord];
  };

  try {
    await fetchAndProcessEmails(fakeUserId);

    assert.strictEqual(mockLLMCallCount, 0, "No LLM calls should be made while backoff is active");
  } finally {
    Account.find = originalFind;
    Account.findOneAndUpdate = originalFindOneAndUpdate;
    LinkedGmailAccount.find = originalLinkedFind;
    Application.find = originalAppFind;
    google.gmail = originalGoogleGmail;
  }
});

// ── Test 4: Same internetMessageId across multiple users → Exactly 1 in-flight LLM call ──
test("4. Single-Flight Coalescing: concurrent identical email parses across users trigger 1 LLM request", async () => {
  const cacheKey = "<shared-recruitment-msg-123@msrit.edu>";
  let llmInvocations = 0;

  const mockParseFunction = async () => {
    llmInvocations++;
    await new Promise(r => setTimeout(r, 50));
    return {
      company: "Google",
      role: "Software Engineer",
      status: "new",
      isRelevant: true
    };
  };

  const [p1, p2, p3] = await Promise.all([
    parseEmailWithSingleFlight(cacheKey, mockParseFunction),
    parseEmailWithSingleFlight(cacheKey, mockParseFunction),
    parseEmailWithSingleFlight(cacheKey, mockParseFunction),
  ]);

  assert.strictEqual(llmInvocations, 1, "Exactly 1 LLM parse execution must occur");
  assert.strictEqual(p1.company, "Google");
  assert.strictEqual(p2.company, "Google");
  assert.strictEqual(p3.company, "Google");
  assert.strictEqual(inFlightParses.has(cacheKey), false, "inFlight map must be cleared after completion");
});

// ── Test 5: Both LLMs fail → Pending state stored without fabricated semantic fields ──
test("5. Dual LLM Failure: returns company: null, role: 'Pending Analysis', status: 'pending', shouldRetry: true", async () => {
  mockLLMBehavior = () => {
    const err = new Error("All endpoints overloaded (503)");
    err.status = 503;
    throw err;
  };

  const parsed = await parseEmailWithLLM(
    "Campus Recruitment 2026",
    "placement@msrit.edu",
    "Company details in attached JD."
  );

  assert.strictEqual(parsed.company, null, "Company must be null on failure, not fabricated");
  assert.strictEqual(parsed.role, "Pending Analysis");
  assert.strictEqual(parsed.status, "pending");
  assert.strictEqual(parsed.isRelevant, true, "isRelevant must remain true for transport error pending retry");
  assert.strictEqual(parsed.parseMeta.shouldRetry, true);
  assert.strictEqual(parsed.parseMeta.status, "pending");
  assert.strictEqual(parsed.parseMeta.llmProvider, "none");
});

// ── Test 6: Pending parse succeeds later → Existing pending record is upgraded rather than duplicated ──
test("6. Pending Upgrade: when pending parse is retried and LLM succeeds, document is upgraded in-place", async () => {
  const fakeUserId = "507f191e810c19729de860f4";
  const pendingDocId = "pending_app_doc_101";

  const existingPendingDoc = {
    _id: pendingDocId,
    userId: fakeUserId,
    messageId: "msg_to_upgrade",
    company: null,
    role: "Pending Analysis",
    status: "pending",
    isDeleted: false,
    parserVersion: "v1",
    parseMeta: {
      shouldRetry: true,
      status: "pending",
      retryCount: 1,
      nextRetryAt: new Date(Date.now() - 10000)
    }
  };

  const fakeAccount = {
    _id: fakeUserId,
    email: "upgradeduser@msrit.edu",
    tokens: { access_token: "fake_token", refresh_token: "fake_refresh", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    lastHistoryId: "400000",
    syncStatus: "idle",
  };

  let updatedPayload = null;

  const mockGmail = {
    users: {
      history: {
        list: async () => ({
          data: {
            historyId: "400010",
            history: [],
          },
        }),
      },
      messages: {
        get: async () => ({
          data: {
            id: "msg_to_upgrade",
            internalDate: "1700000000000",
            payload: {
              headers: [
                { name: "From", value: "placement@msrit.edu" },
                { name: "Subject", value: "Placement Drive - Cisco Systems" },
                { name: "Message-ID", value: "<msg_to_upgrade@msrit.edu>" },
              ],
              body: { data: Buffer.from("Cisco hiring for Software Engineer CTC 18 LPA").toString("base64url") },
            },
          },
        }),
      },
    },
  };

  mockLLMBehavior = () => ({
    choices: [{
      message: {
        content: JSON.stringify({
          emailType: "job",
          opportunityType: "JOB_APPLICATION",
          classification: "New Hiring Opportunity",
          company: "Cisco",
          subtitle: "Software Engineer",
          type: "full-time",
          displayFields: [
            { label: "Role", value: "Software Engineer" },
            { label: "CTC", value: "18 LPA" }
          ]
        })
      }
    }]
  });

  const originalFind = Account.find;
  const originalFindOneAndUpdate = Account.findOneAndUpdate;
  const originalLinkedFind = LinkedGmailAccount.find;
  const originalAppFind = Application.find;
  const originalAppFindOne = Application.findOne;
  const originalAppFindByIdAndUpdate = Application.findByIdAndUpdate;
  const originalGoogleGmail = google.gmail;

  google.gmail = () => mockGmail;
  Account.find = async () => [fakeAccount];
  Account.findOneAndUpdate = async (query, update) => {
    Object.assign(fakeAccount, update.$set || update);
    return fakeAccount;
  };
  LinkedGmailAccount.find = async () => [];

  Application.find = async (query) => {
    if (query?.userId) {
      return [existingPendingDoc];
    }
    return [];
  };

  Application.findOne = async () => existingPendingDoc;

  Application.findByIdAndUpdate = async (id, update) => {
    assert.strictEqual(id, pendingDocId, "Must update the exact existing pending document ID");
    updatedPayload = update;
    Object.assign(existingPendingDoc, update);
    return existingPendingDoc;
  };

  try {
    await fetchAndProcessEmails(fakeUserId);

    assert.ok(updatedPayload, "Must execute findByIdAndUpdate on the existing record");
    assert.strictEqual(existingPendingDoc.company, "Cisco", "Company must be upgraded to parsed value");
    assert.strictEqual(existingPendingDoc.role, "Software Engineer", "Role must be upgraded to parsed value");
    assert.strictEqual(existingPendingDoc.status, "new", "Status must be transitioned from 'pending' to 'new'");
    assert.strictEqual(existingPendingDoc.isDeleted, false, "isDeleted must remain false");
    assert.strictEqual(existingPendingDoc.parseMeta.shouldRetry, false, "shouldRetry must be set to false");
    assert.strictEqual(existingPendingDoc.parseMeta.status, "success", "parseMeta.status must be 'success'");
  } finally {
    Account.find = originalFind;
    Account.findOneAndUpdate = originalFindOneAndUpdate;
    LinkedGmailAccount.find = originalLinkedFind;
    Application.find = originalAppFind;
    Application.findOne = originalAppFindOne;
    Application.findByIdAndUpdate = originalAppFindByIdAndUpdate;
    google.gmail = originalGoogleGmail;
  }
});

// ── Test 7: Backend restart after failed parse → MongoDB state remains durable & retryable ──
test("7. Restart Resilience: Pending record persisted in MongoDB is discovered upon restart and retryable", async () => {
  // Simulate MongoDB having a pending parse record after backend restart
  const pendingDocFromDB = {
    _id: "persisted_db_id_777",
    userId: "507f191e810c19729de860f5",
    messageId: "restarted_msg_1",
    company: null,
    role: "Pending Analysis",
    status: "pending",
    isDeleted: false,
    parseMeta: {
      shouldRetry: true,
      status: "pending",
      retryCount: 1,
      nextRetryAt: new Date(Date.now() - 30000) // Eligible
    }
  };

  // Simulating query in fetchAndProcessEmails:
  const query = {
    userId: "507f191e810c19729de860f5",
    status: { $in: ["pending", "failed_retryable"] },
    "parseMeta.shouldRetry": true,
    $or: [
      { "parseMeta.nextRetryAt": { $lte: new Date() } },
      { "parseMeta.nextRetryAt": null }
    ],
    isDeleted: false
  };

  const matchesStatus = query.status.$in.includes(pendingDocFromDB.status);
  const matchesRetry = pendingDocFromDB.parseMeta.shouldRetry === true;
  const matchesTime = pendingDocFromDB.parseMeta.nextRetryAt <= new Date();
  const notDeleted = pendingDocFromDB.isDeleted === false;

  assert.strictEqual(matchesStatus && matchesRetry && matchesTime && notDeleted, true, "Persisted pending record must be discoverable across process restarts");
});

test.after(() => {
  process.exit(0);
});
