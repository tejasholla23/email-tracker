const test = require("node:test");
const assert = require("node:assert");

const {
  normalizeRole,
  getRoleFamily,
  areRolesCompatible,
  isGenesisClassification,
  isFollowupClassification
} = require("../utils/roleMatcher");

const {
  findMatchingApplication
} = require("../utils/processMatcher");

test("roleMatcher: normalizes role titles cleanly", () => {
  assert.strictEqual(normalizeRole("Role: Software Development Engineer"), "software development engineer");
  assert.strictEqual(normalizeRole("Job Title: SDE-1 / Backend"), "sde 1 backend");
  assert.strictEqual(normalizeRole("Position - Data Analyst"), "data analyst");
});

test("roleMatcher: correctly identifies role families", () => {
  assert.strictEqual(getRoleFamily("SDE"), "SOFTWARE_ENGINEERING");
  assert.strictEqual(getRoleFamily("Software Engineer"), "SOFTWARE_ENGINEERING");
  assert.strictEqual(getRoleFamily("Data Analyst"), "DATA_AND_AI");
  assert.strictEqual(getRoleFamily("Business Analyst"), "DATA_AND_AI");
  assert.strictEqual(getRoleFamily("Product Manager"), "PRODUCT_AND_MANAGEMENT");
  assert.strictEqual(getRoleFamily("Cybersecurity Analyst"), "CYBERSECURITY_AND_INFRA");
  assert.strictEqual(getRoleFamily("Unknown Role"), null);
});

test("roleMatcher: compatibility rules", () => {
  // SDE synonyms are compatible
  const r1 = areRolesCompatible("Software Engineer", "SDE");
  assert.strictEqual(r1.compatible, true);
  assert.strictEqual(r1.isConflicting, false);

  // SDE vs Data Analyst are conflicting
  const r2 = areRolesCompatible("Software Engineer", "Data Analyst");
  assert.strictEqual(r2.compatible, false);
  assert.strictEqual(r2.isConflicting, true);

  // Unknown role is neutral (compatible)
  const r3 = areRolesCompatible("Software Engineer", "Unknown Role");
  assert.strictEqual(r3.compatible, true);
  assert.strictEqual(r3.isConflicting, false);
});

test("processMatcher: Scenario 1 - Registration -> 4 weeks later OA attaches to existing card", () => {
  const t0 = new Date("2026-08-01T10:00:00Z");
  const t28 = new Date("2026-08-29T10:00:00Z"); // 4 weeks later

  const existingApp = {
    _id: "app_abc_sde",
    company: "ABC Corp",
    companyKey: "abc corp",
    role: "Software Engineer",
    stage: "none",
    opportunityType: "JOB_APPLICATION",
    date: t0,
    threadId: "thread_123",
    events: [
      {
        messageId: "msg_reg",
        threadId: "thread_123",
        date: t0,
        classification: "New Hiring Opportunity",
        title: "Registration Link"
      }
    ]
  };

  // Follow-up email 4 weeks later
  const incomingParsed = {
    company: "ABC Corp",
    role: "Unknown Role", // follow-ups often don't restate role
    classification: "Assessment Announcement",
    opportunityType: "JOB_APPLICATION",
    subtitle: "Online Assessment on HackerEarth",
    timelineTitle: "Assessment Scheduled"
  };

  const decision = findMatchingApplication({
    candidates: [existingApp],
    parsed: incomingParsed,
    emailMetadata: {
      messageId: "msg_oa",
      threadId: "thread_456", // could even be a new thread from placement cell
      date: t28,
      subject: "ABC Corp: Assessment Scheduled for Saturday"
    }
  });

  assert.ok(decision.match, "Must find matching application");
  assert.strictEqual(decision.match._id, existingApp._id);
  assert.ok(decision.reason.includes("Matched candidate"));
});

test("processMatcher: Scenario 2 - Different role creates a NEW Application card", () => {
  const t0 = new Date("2026-08-01T10:00:00Z");
  const t35 = new Date("2026-09-05T10:00:00Z"); // 5 weeks later

  const existingApp = {
    _id: "app_abc_sde",
    company: "ABC Corp",
    companyKey: "abc corp",
    role: "Software Engineer",
    stage: "none",
    opportunityType: "JOB_APPLICATION",
    date: t0,
    threadId: "thread_123",
    events: [{ messageId: "msg_reg", threadId: "thread_123", date: t0 }]
  };

  // ABC now comes for Data Analyst
  const incomingParsed = {
    company: "ABC Corp",
    role: "Data Analyst",
    classification: "New Hiring Opportunity",
    opportunityType: "JOB_APPLICATION",
    subtitle: "Data Analyst Opening"
  };

  const decision = findMatchingApplication({
    candidates: [existingApp],
    parsed: incomingParsed,
    emailMetadata: {
      messageId: "msg_data_analyst",
      threadId: "thread_data_789",
      date: t35,
      subject: "ABC Corp Campus Recruitment - Data Analyst Profile"
    }
  });

  assert.strictEqual(decision.match, null, "Must NOT match Software Engineer card for Data Analyst role");
  assert.ok(decision.reason.includes("disqualified due to conflicting roles"));
});

test("processMatcher: Scenario 3 - New recruitment cycle after terminal stage creates NEW card", () => {
  const t0 = new Date("2026-08-01T10:00:00Z");
  const t90 = new Date("2026-11-01T10:00:00Z"); // 3 months later

  const existingApp = {
    _id: "app_abc_old",
    company: "ABC Corp",
    companyKey: "abc corp",
    role: "Software Engineer",
    stage: "rejected_after_interview", // already concluded
    opportunityType: "JOB_APPLICATION",
    date: t0,
    threadId: "thread_old",
    events: [{ messageId: "msg_old", date: t0 }]
  };

  // ABC starts a brand new drive
  const incomingParsed = {
    company: "ABC Corp",
    role: "Software Engineer",
    classification: "New Hiring Opportunity",
    opportunityType: "JOB_APPLICATION",
    subtitle: "New Drive 2027"
  };

  const decision = findMatchingApplication({
    candidates: [existingApp],
    parsed: incomingParsed,
    emailMetadata: {
      messageId: "msg_new_drive",
      threadId: "thread_new_drive",
      date: t90,
      subject: "ABC Corp Campus Hiring Drive"
    }
  });

  assert.strictEqual(decision.match, null, "Must NOT merge new drive into a rejected process from months ago");
});

test("processMatcher: Scenario 4 - Gmail Thread ID direct match", () => {
  const existingApp = {
    _id: "app_exact_thread",
    company: "ABC Corp",
    companyKey: "abc corp",
    role: "Software Engineer",
    threadId: "exact_thread_xyz",
    events: [{ messageId: "msg_1", threadId: "exact_thread_xyz" }]
  };

  const incomingParsed = {
    company: "ABC Corp",
    role: "Unknown Role",
    classification: "Interview Schedule"
  };

  const decision = findMatchingApplication({
    candidates: [existingApp],
    parsed: incomingParsed,
    emailMetadata: {
      messageId: "msg_2",
      threadId: "exact_thread_xyz",
      subject: "Re: Interview schedule"
    }
  });

  assert.ok(decision.match);
  assert.strictEqual(decision.match._id, existingApp._id);
  assert.ok(decision.reason.includes("threadId"));
});

test("processMatcher: Scenario 5 - Hackathon vs Job Application separated", () => {
  const existingHackathon = {
    _id: "app_hackathon",
    company: "ABC Corp",
    companyKey: "abc corp",
    opportunityType: "HACKATHON",
    emailType: "event",
    role: "Event",
    events: []
  };

  const incomingJob = {
    company: "ABC Corp",
    opportunityType: "JOB_APPLICATION",
    emailType: "job",
    role: "Software Engineer",
    classification: "New Hiring Opportunity"
  };

  const decision = findMatchingApplication({
    candidates: [existingHackathon],
    parsed: incomingJob,
    emailMetadata: {
      messageId: "msg_job",
      subject: "ABC Corp Hiring"
    }
  });

  assert.strictEqual(decision.match, null, "Must not merge Job Application into Hackathon");
});

test("processMatcher: Real-world IBM Case - Software Engineer (17 LPA) vs Associate System Engineer (4.5 LPA)", () => {
  // Email 1 on August 4
  const augDate = new Date("2026-08-04T14:25:00Z");
  const existingIbmApp = {
    _id: "ibm_infrastructure_sde",
    company: "IBM",
    companyKey: "ibm",
    role: "Software Engineer",
    stage: "none",
    opportunityType: "JOB_APPLICATION",
    date: augDate,
    threadId: "thread_ibm_infra",
    events: [{
      messageId: "msg_ibm_infra",
      threadId: "thread_ibm_infra",
      date: augDate,
      classification: "New Hiring Opportunity",
      title: "IBM India Campus Event"
    }]
  };

  // Email 2 on September 25 (52 days later)
  const sepDate = new Date("2026-09-25T19:07:00Z");
  const incomingIbmFnc = {
    company: "IBM",
    role: "Associate System Engineer",
    classification: "New Hiring Opportunity",
    opportunityType: "JOB_APPLICATION",
    subtitle: "Associate System Engineer with IBM Future Now Centre"
  };

  const decision = findMatchingApplication({
    candidates: [existingIbmApp],
    parsed: incomingIbmFnc,
    emailMetadata: {
      messageId: "msg_ibm_fnc",
      threadId: "thread_ibm_fnc",
      date: sepDate,
      subject: "IBM FNC Campus Hiring Batch 2027 - Associate System Engineer - M. S. Ramaiah Institute of Technology"
    }
  });

  assert.strictEqual(decision.match, null, "Must NOT merge Associate System Engineer into Software Engineer");
  assert.ok(decision.reason.includes("disqualified due to conflicting roles"));
});
