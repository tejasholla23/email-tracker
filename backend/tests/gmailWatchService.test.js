"use strict";

const test = require("node:test");
const assert = require("node:assert");
const config = require("../config/appConfig");
const Account = require("../models/Account");
const LinkedGmailAccount = require("../models/LinkedGmailAccount");
const {
  getFullTopicName,
  resolveEmailToAccount,
  setupGmailWatch,
  stopGmailWatch,
  verifyPubSubRequest,
  renewExpiringWatches,
} = require("../utils/gmailWatchService");

test("getFullTopicName: formats correct GCP Pub/Sub topic string", () => {
  const originalProject = config.GCP_PROJECT_ID;
  const originalTopic = config.GMAIL_PUBSUB_TOPIC;

  try {
    // 1. With configured project
    config.GCP_PROJECT_ID = "test-gcp-project-123";
    config.GMAIL_PUBSUB_TOPIC = "gmail-push-notifications";
    assert.strictEqual(
      getFullTopicName(),
      "projects/test-gcp-project-123/topics/gmail-push-notifications"
    );

    // 2. With null project
    config.GCP_PROJECT_ID = null;
    assert.strictEqual(getFullTopicName(), null);
  } finally {
    config.GCP_PROJECT_ID = originalProject;
    config.GMAIL_PUBSUB_TOPIC = originalTopic;
  }
});

test("resolveEmailToAccount: finds primary account", async () => {
  const originalFindOneAccount = Account.findOne;
  const originalFindOneLinked = LinkedGmailAccount.findOne;

  try {
    Account.findOne = async (query) => {
      if (query.email === "primary@msrit.edu") {
        return {
          _id: "user_id_primary_123",
          email: "primary@msrit.edu",
        };
      }
      return null;
    };
    LinkedGmailAccount.findOne = async () => null;

    const result = await resolveEmailToAccount("primary@msrit.edu");
    assert.ok(result, "Must resolve primary account");
    assert.strictEqual(result.userId, "user_id_primary_123");
    assert.strictEqual(result.accountType, "primary");
    assert.strictEqual(result.email, "primary@msrit.edu");
  } finally {
    Account.findOne = originalFindOneAccount;
    LinkedGmailAccount.findOne = originalFindOneLinked;
  }
});

test("resolveEmailToAccount: finds linked account and resolves to parentAccountId", async () => {
  const originalFindOneAccount = Account.findOne;
  const originalFindOneLinked = LinkedGmailAccount.findOne;

  try {
    Account.findOne = async () => null;
    LinkedGmailAccount.findOne = async (query) => {
      if (query.email === "linked@gmail.com") {
        return {
          _id: "linked_doc_id_456",
          parentAccountId: "parent_user_id_789",
          email: "linked@gmail.com",
        };
      }
      return null;
    };

    const result = await resolveEmailToAccount("linked@gmail.com");
    assert.ok(result, "Must resolve linked account");
    assert.strictEqual(result.userId, "parent_user_id_789");
    assert.strictEqual(result.accountType, "linked");
    assert.strictEqual(result.email, "linked@gmail.com");
  } finally {
    Account.findOne = originalFindOneAccount;
    LinkedGmailAccount.findOne = originalFindOneLinked;
  }
});

test("resolveEmailToAccount: returns null for unknown email", async () => {
  const originalFindOneAccount = Account.findOne;
  const originalFindOneLinked = LinkedGmailAccount.findOne;

  try {
    Account.findOne = async () => null;
    LinkedGmailAccount.findOne = async () => null;

    const result = await resolveEmailToAccount("unknown@example.com");
    assert.strictEqual(result, null);

    const emptyResult = await resolveEmailToAccount("");
    assert.strictEqual(emptyResult, null);
  } finally {
    Account.findOne = originalFindOneAccount;
    LinkedGmailAccount.findOne = originalFindOneLinked;
  }
});

test("setupGmailWatch: skips gracefully when GCP_PROJECT_ID is not configured", async () => {
  const originalProject = config.GCP_PROJECT_ID;
  try {
    config.GCP_PROJECT_ID = null;
    const result = await setupGmailWatch({}, "test@msrit.edu");
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, "PUBSUB_DISABLED");
  } finally {
    config.GCP_PROJECT_ID = originalProject;
  }
});

test("verifyPubSubRequest: rejects invalid query-string secret if configured", async () => {
  const originalSecret = config.GMAIL_WEBHOOK_SECRET;
  try {
    config.GMAIL_WEBHOOK_SECRET = "super_secret_token_123";

    // 1. Missing secret
    const req1 = { query: {}, headers: {} };
    const res1 = await verifyPubSubRequest(req1);
    assert.strictEqual(res1.valid, false);
    assert.strictEqual(res1.reason, "INVALID_SECRET");

    // 2. Wrong secret
    const req2 = { query: { token: "wrong_token" }, headers: {} };
    const res2 = await verifyPubSubRequest(req2);
    assert.strictEqual(res2.valid, false);
    assert.strictEqual(res2.reason, "INVALID_SECRET");
  } finally {
    config.GMAIL_WEBHOOK_SECRET = originalSecret;
  }
});

test("verifyPubSubRequest: rejects missing or malformed Authorization header when audience is configured", async () => {
  const originalAudience = config.GMAIL_WEBHOOK_AUDIENCE;
  const originalSecret = config.GMAIL_WEBHOOK_SECRET;
  try {
    config.GMAIL_WEBHOOK_SECRET = null;
    config.GMAIL_WEBHOOK_AUDIENCE = "https://backend.example.com/webhooks/gmail";

    // 1. Missing header
    const req1 = { query: {}, headers: {} };
    const res1 = await verifyPubSubRequest(req1);
    assert.strictEqual(res1.valid, false);
    assert.strictEqual(res1.reason, "MISSING_AUTH_HEADER");

    // 2. Malformed header (not Bearer)
    const req2 = { query: {}, headers: { authorization: "Basic 12345" } };
    const res2 = await verifyPubSubRequest(req2);
    assert.strictEqual(res2.valid, false);
    assert.strictEqual(res2.reason, "MALFORMED_AUTH_HEADER");
  } finally {
    config.GMAIL_WEBHOOK_AUDIENCE = originalAudience;
    config.GMAIL_WEBHOOK_SECRET = originalSecret;
  }
});

test("verifyPubSubRequest: rejects when Pub/Sub is completely unconfigured", async () => {
  const originalProject = config.GCP_PROJECT_ID;
  const originalAudience = config.GMAIL_WEBHOOK_AUDIENCE;
  const originalSecret = config.GMAIL_WEBHOOK_SECRET;
  try {
    config.GCP_PROJECT_ID = null;
    config.GMAIL_WEBHOOK_AUDIENCE = null;
    config.GMAIL_WEBHOOK_SECRET = null;
    config.GMAIL_PUBSUB_ENABLED = false;

    const req = { query: {}, headers: {} };
    const res = await verifyPubSubRequest(req);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.reason, "PUBSUB_NOT_CONFIGURED");
  } finally {
    config.GCP_PROJECT_ID = originalProject;
    config.GMAIL_WEBHOOK_AUDIENCE = originalAudience;
    config.GMAIL_WEBHOOK_SECRET = originalSecret;
    config.GMAIL_PUBSUB_ENABLED = !!(config.GCP_PROJECT_ID && config.GMAIL_WEBHOOK_AUDIENCE && process.env.GOOGLE_CLIENT_ID);
  }
});

test("renewExpiringWatches: skips if GCP_PROJECT_ID is null", async () => {
  const originalProject = config.GCP_PROJECT_ID;
  try {
    config.GCP_PROJECT_ID = null;
    const result = await renewExpiringWatches();
    assert.strictEqual(result.renewed, 0);
    assert.strictEqual(result.skipped, 0);
    assert.strictEqual(result.failed, 0);
  } finally {
    config.GCP_PROJECT_ID = originalProject;
  }
});

test("setupGmailWatch: registers watch and persists expiration to primary Account", async () => {
  const originalProject = config.GCP_PROJECT_ID;
  const originalTopic = config.GMAIL_PUBSUB_TOPIC;
  const originalUpdate = Account.findOneAndUpdate;

  try {
    config.GCP_PROJECT_ID = "test-project";
    config.GMAIL_PUBSUB_TOPIC = "test-topic";

    let persistedUpdate = null;
    Account.findOneAndUpdate = async (query, update) => {
      persistedUpdate = { query, update };
      return { _id: "acc_123", ...update };
    };

    // Mock client with getAccessToken method
    const mockWatchTime = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const mockAuthClient = {
      getAccessToken: async () => ({ token: "mock_token" }),
    };

    // Replace google.gmail temporarily
    const { google } = require("googleapis");
    const originalGmail = google.gmail;
    let watchCalledWith = null;

    google.gmail = () => ({
      users: {
        watch: async (params) => {
          watchCalledWith = params;
          return {
            data: {
              expiration: String(mockWatchTime),
              historyId: "987654321",
            },
          };
        },
      },
    });

    try {
      const res = await setupGmailWatch(mockAuthClient, "student@msrit.edu", "primary", "acc_123");
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.historyId, "987654321");
      assert.ok(res.expiration instanceof Date);
      assert.strictEqual(res.expiration.getTime(), mockWatchTime);

      // Verify watch request body
      assert.strictEqual(watchCalledWith.userId, "me");
      assert.strictEqual(watchCalledWith.requestBody.topicName, "projects/test-project/topics/test-topic");
      assert.deepStrictEqual(watchCalledWith.requestBody.labelIds, ["INBOX"]);

      // Verify DB persistence
      assert.ok(persistedUpdate);
      assert.strictEqual(persistedUpdate.query._id, "acc_123");
      assert.strictEqual(persistedUpdate.update.gmailWatchExpiration.getTime(), mockWatchTime);
    } finally {
      google.gmail = originalGmail;
    }
  } finally {
    config.GCP_PROJECT_ID = originalProject;
    config.GMAIL_PUBSUB_TOPIC = originalTopic;
    Account.findOneAndUpdate = originalUpdate;
  }
});

test("setupGmailWatch: registers watch and persists expiration to LinkedGmailAccount", async () => {
  const originalProject = config.GCP_PROJECT_ID;
  const originalTopic = config.GMAIL_PUBSUB_TOPIC;
  const originalUpdate = LinkedGmailAccount.findOneAndUpdate;

  try {
    config.GCP_PROJECT_ID = "test-project";
    config.GMAIL_PUBSUB_TOPIC = "test-topic";

    let persistedUpdate = null;
    LinkedGmailAccount.findOneAndUpdate = async (query, update) => {
      persistedUpdate = { query, update };
      return { _id: "linked_456", ...update };
    };

    const mockWatchTime = Date.now() + 6 * 24 * 60 * 60 * 1000;
    const mockAuthClient = {
      getAccessToken: async () => ({ token: "mock_token" }),
    };

    const { google } = require("googleapis");
    const originalGmail = google.gmail;

    google.gmail = () => ({
      users: {
        watch: async () => ({
          data: {
            expiration: String(mockWatchTime),
            historyId: "11223344",
          },
        }),
      },
    });

    try {
      const res = await setupGmailWatch(mockAuthClient, "linked@gmail.com", "linked", "linked_456");
      assert.strictEqual(res.success, true);
      assert.ok(persistedUpdate);
      assert.strictEqual(persistedUpdate.query._id, "linked_456");
      assert.strictEqual(persistedUpdate.update.gmailWatchExpiration.getTime(), mockWatchTime);
    } finally {
      google.gmail = originalGmail;
    }
  } finally {
    config.GCP_PROJECT_ID = originalProject;
    config.GMAIL_PUBSUB_TOPIC = originalTopic;
    LinkedGmailAccount.findOneAndUpdate = originalUpdate;
  }
});

test("stopGmailWatch: calls users.stop with userId 'me'", async () => {
  const { google } = require("googleapis");
  const originalGmail = google.gmail;
  let stopCalledWith = null;

  google.gmail = () => ({
    users: {
      stop: async (params) => {
        stopCalledWith = params;
        return {};
      },
    },
  });

  try {
    const mockClient = { getAccessToken: async () => ({}) };
    const res = await stopGmailWatch(mockClient, "user@msrit.edu");
    assert.strictEqual(res.success, true);
    assert.strictEqual(stopCalledWith.userId, "me");
  } finally {
    google.gmail = originalGmail;
  }
});

test("verifyPubSubRequest: validates valid OIDC token", async () => {
  const originalAudience = config.GMAIL_WEBHOOK_AUDIENCE;
  const originalSecret = config.GMAIL_WEBHOOK_SECRET;
  const { getOidcVerifierClient } = require("../utils/gmailWatchService");
  const verifier = getOidcVerifierClient();
  const originalVerify = verifier.verifyIdToken;

  try {
    config.GMAIL_WEBHOOK_SECRET = "test_secret";
    config.GMAIL_WEBHOOK_AUDIENCE = "https://backend.example.com/webhooks/gmail";

    verifier.verifyIdToken = async ({ idToken, audience }) => {
      assert.strictEqual(idToken, "valid_mock_jwt_token");
      assert.strictEqual(audience, "https://backend.example.com/webhooks/gmail");
      return {
        getPayload: () => ({
          iss: "https://accounts.google.com",
          email: "pubsub-sa@gcp-project.iam.gserviceaccount.com",
          aud: "https://backend.example.com/webhooks/gmail",
        }),
      };
    };

    const req = {
      query: { token: "test_secret" },
      headers: {
        authorization: "Bearer valid_mock_jwt_token",
      },
    };

    const res = await verifyPubSubRequest(req);
    assert.strictEqual(res.valid, true);
    assert.ok(res.payload);
    assert.strictEqual(res.payload.email, "pubsub-sa@gcp-project.iam.gserviceaccount.com");
  } finally {
    verifier.verifyIdToken = originalVerify;
    config.GMAIL_WEBHOOK_AUDIENCE = originalAudience;
    config.GMAIL_WEBHOOK_SECRET = originalSecret;
  }
});

test("renewExpiringWatches: renews expiring watches and skips fresh ones", async () => {
  const originalProject = config.GCP_PROJECT_ID;
  const originalFindAccount = Account.find;
  const originalFindLinked = LinkedGmailAccount.find;
  const originalUpdateAccount = Account.findOneAndUpdate;
  const originalUpdateLinked = LinkedGmailAccount.findOneAndUpdate;

  try {
    config.GCP_PROJECT_ID = "test-project";
    config.GMAIL_PUBSUB_TOPIC = "test-topic";

    const freshExpiration = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days left (healthy)
    const expiringExpiration = new Date(Date.now() + 10 * 60 * 60 * 1000); // 10 hours left (needs renewal)

    Account.find = async () => [
      {
        _id: "acc_fresh",
        email: "fresh@msrit.edu",
        tokens: { refresh_token: "ref_1" },
        gmailWatchExpiration: freshExpiration,
      },
      {
        _id: "acc_expiring",
        email: "expiring@msrit.edu",
        tokens: { refresh_token: "ref_2" },
        gmailWatchExpiration: expiringExpiration,
      },
    ];

    LinkedGmailAccount.find = async () => [
      {
        _id: "linked_no_watch",
        email: "unwatched@gmail.com",
        tokens: { refresh_token: "ref_3" },
        gmailWatchExpiration: null,
      },
    ];

    Account.findOneAndUpdate = async () => ({});
    LinkedGmailAccount.findOneAndUpdate = async () => ({});

    const { google } = require("googleapis");
    const originalGmail = google.gmail;
    let watchedEmails = [];

    google.gmail = () => ({
      users: {
        watch: async () => {
          return {
            data: {
              expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
              historyId: "999",
            },
          };
        },
      },
    });

    try {
      const res = await renewExpiringWatches();
      assert.strictEqual(res.renewed, 2, "Must renew 1 expiring primary + 1 unwatched linked account");
      assert.strictEqual(res.skipped, 1, "Must skip 1 fresh primary account");
      assert.strictEqual(res.failed, 0);
    } finally {
      google.gmail = originalGmail;
    }
  } finally {
    config.GCP_PROJECT_ID = originalProject;
    Account.find = originalFindAccount;
    LinkedGmailAccount.find = originalFindLinked;
    Account.findOneAndUpdate = originalUpdateAccount;
    LinkedGmailAccount.findOneAndUpdate = originalUpdateLinked;
  }
});

