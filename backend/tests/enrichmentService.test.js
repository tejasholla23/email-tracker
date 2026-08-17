const { describe, test } = require("node:test");
const assert = require("node:assert");

const {
  getCanonicalConcept,
  mergeDisplayFields,
  reconcileDeadlines,
  enrichApplicationRecord,
} = require("../utils/enrichmentService");

describe("enrichmentService - Canonical Concept Normalization", () => {
  test("correctly maps various deadline phrasing to DEADLINE", () => {
    assert.strictEqual(getCanonicalConcept("Application Deadline"), "DEADLINE");
    assert.strictEqual(getCanonicalConcept("Last Date to Apply"), "DEADLINE");
    assert.strictEqual(getCanonicalConcept("Registration Closes"), "DEADLINE");
    assert.strictEqual(getCanonicalConcept("Due Date"), "DEADLINE");
    assert.strictEqual(getCanonicalConcept("Deadline"), "DEADLINE");
  });

  test("correctly maps compensation labels to CTC or STIPEND", () => {
    assert.strictEqual(getCanonicalConcept("CTC"), "CTC");
    assert.strictEqual(getCanonicalConcept("Salary"), "CTC");
    assert.strictEqual(getCanonicalConcept("Compensation"), "CTC");
    assert.strictEqual(getCanonicalConcept("Monthly Stipend"), "STIPEND");
  });

  test("correctly maps assessment and interview milestones", () => {
    assert.strictEqual(getCanonicalConcept("Online Assessment"), "ASSESSMENT");
    assert.strictEqual(getCanonicalConcept("Mettl Assessment"), "ASSESSMENT");
    assert.strictEqual(getCanonicalConcept("Test Date"), "ASSESSMENT");
    assert.strictEqual(getCanonicalConcept("Technical Interview"), "INTERVIEW");
    assert.strictEqual(getCanonicalConcept("Interview Schedule"), "INTERVIEW");
  });
});

describe("enrichmentService - mergeDisplayFields", () => {
  test("merges non-overlapping fields from subsequent emails without data loss", () => {
    const existing = [
      { label: "CTC", value: "₹12 LPA" },
      { label: "Eligibility", value: "7 CGPA+" },
    ];

    const incoming = [
      { label: "Application Deadline", value: "Aug 17, 2026" },
      { label: "Assessment", value: "Aug 18, 6:00 PM – 9:00 PM" },
      { label: "Apply Link", value: "https://forms.gle/xyz" },
    ];

    const merged = mergeDisplayFields(existing, incoming, true);

    const labels = merged.map((f) => f.label);
    assert.ok(labels.includes("CTC"));
    assert.ok(labels.includes("Eligibility"));
    assert.ok(labels.includes("Application Deadline"));
    assert.ok(labels.includes("Assessment"));
    assert.ok(labels.includes("Apply Link"));
    assert.strictEqual(merged.length, 5);

    assert.strictEqual(merged.find((f) => f.label === "CTC").value, "₹12 LPA");
    assert.strictEqual(merged.find((f) => f.label === "Eligibility").value, "7 CGPA+");
  });

  test("updates equivalent concept field when incoming email is newer", () => {
    const existing = [
      { label: "Application Deadline", value: "Aug 15, 2026" },
      { label: "Role", value: "Member Technical Staff" },
    ];

    const incoming = [
      { label: "Last Date to Apply", value: "Aug 20, 2026" },
    ];

    const merged = mergeDisplayFields(existing, incoming, true);

    const deadlineFields = merged.filter((f) =>
      /deadline|last date/i.test(f.label)
    );
    assert.strictEqual(deadlineFields.length, 1);
    assert.strictEqual(deadlineFields[0].value, "Aug 20, 2026");
    assert.strictEqual(merged.find((f) => f.label === "Role").value, "Member Technical Staff");
  });
});

describe("enrichmentService - Non-Regressive Deadlines", () => {
  test("prevents regression when newer email references an earlier stale date", () => {
    const existing = {
      deadline: "Aug 25, 2026",
      deadlineISO: "2026-08-25T23:59:00.000Z",
      deadlineText: "Aug 25, 2026",
    };

    const incoming = {
      deadline: "Aug 20, 2026",
      deadlineISO: "2026-08-20T23:59:00.000Z",
      deadlineText: "Aug 20, 2026",
    };

    const result = reconcileDeadlines(existing, incoming, true, "Reminder email", "Please register");
    assert.strictEqual(result.deadlineISO, "2026-08-25T23:59:00.000Z");
    assert.strictEqual(result.deadline, "Aug 25, 2026");
    assert.strictEqual(result.changed, false);
  });

  test("allows deadline update when explicit extension keywords are present", () => {
    const existing = {
      deadline: "Aug 20, 2026",
      deadlineISO: "2026-08-20T23:59:00.000Z",
      deadlineText: "Aug 20, 2026",
    };

    const incoming = {
      deadline: "Aug 25, 2026",
      deadlineISO: "2026-08-25T23:59:00.000Z",
      deadlineText: "Aug 25, 2026",
    };

    const result = reconcileDeadlines(
      existing,
      incoming,
      true,
      "CynLr | Deadline Extended",
      "The deadline has been extended to Aug 25"
    );
    assert.strictEqual(result.deadlineISO, "2026-08-25T23:59:00.000Z");
    assert.strictEqual(result.deadline, "Aug 25, 2026");
    assert.strictEqual(result.changed, true);
  });
});

describe("enrichmentService - enrichApplicationRecord (CynLr End-to-End)", () => {
  test("progressively enriches CynLr Pre-Placement Talk with Hiring & Assessment details", () => {
    const existingApp = {
      company: "CynLr",
      companyKey: "cynlr",
      subtitle: "CYNLR Pre-Placement Talk",
      classification: "PPT Announcement",
      emailType: "event",
      type: "event",
      status: "new",
      date: new Date("2026-08-12T10:00:00.000Z"),
      eventDate: new Date("2026-08-12T17:00:00.000Z"),
      eventTime: "5:00 PM – 6:00 PM",
      link: "https://teams.microsoft.com/l/meetup-join/123",
      displayFields: [
        { label: "Event Date", value: "Aug 12, 2026" },
        { label: "Time", value: "5:00 PM – 6:00 PM" },
      ],
      manualOverrides: [],
    };

    const parsedHiringEmail = {
      company: "CynLr",
      subtitle: "Fresher Hiring 2026-27",
      classification: "New Hiring Opportunity",
      emailType: "job",
      type: "full-time",
      role: "Fresher Hiring 2026-27",
      deadline: "Aug 17, 2026",
      deadlineISO: "2026-08-17T23:59:00.000Z",
      deadlineText: "Aug 17, 2026",
      testDate: new Date("2026-08-18T18:00:00.000Z"),
      eventTime: "6:00 PM – 9:00 PM",
      link: "https://forms.gle/cynlr2026",
      isFormLink: true,
      displayFields: [
        { label: "Role", value: "Fresher Hiring 2026-27" },
        { label: "Deadline", value: "Aug 17, 2026" },
        { label: "Assessment", value: "Aug 18, 2026, 6:00 PM – 9:00 PM" },
        { label: "Registration Link", value: "https://forms.gle/cynlr2026" },
      ],
      skills: ["Robotics", "Computer Vision"],
    };

    const updatePayload = enrichApplicationRecord(
      existingApp,
      parsedHiringEmail,
      new Date("2026-08-15T12:00:00.000Z")
    );

    // 1. Subtitle & Classification upgraded to Hiring
    assert.strictEqual(updatePayload.subtitle, "Fresher Hiring 2026-27");
    assert.strictEqual(updatePayload.classification, "New Hiring Opportunity");
    assert.strictEqual(updatePayload.emailType, "job");
    assert.strictEqual(updatePayload.type, "full-time");

    // 2. Link upgraded to Registration Form
    assert.strictEqual(updatePayload.link, "https://forms.gle/cynlr2026");
    assert.strictEqual(updatePayload.isFormLink, true);

    // 3. Deadlines and distinct Assessment milestone set
    assert.strictEqual(updatePayload.deadlineISO, "2026-08-17T23:59:00.000Z");
    assert.strictEqual(updatePayload.testDate.toISOString(), new Date("2026-08-18T18:00:00.000Z").toISOString());

    // 4. Cumulative merged displayFields contains both hiring details and initial talk timing
    const displayLabels = updatePayload.displayFields.map((f) => f.label);
    assert.ok(displayLabels.includes("Role"));
    assert.ok(displayLabels.includes("Deadline"));
    assert.ok(displayLabels.includes("Assessment"));
    assert.ok(displayLabels.includes("Event Date"));

    // 5. Skills merged
    assert.deepStrictEqual(updatePayload.skills, ["Robotics", "Computer Vision"]);

    // 6. Calendar sync triggered due to new deadline and assessment dates
    assert.strictEqual(updatePayload.needsCalendarSync, true);
  });

  test("reparsing an older email does NOT revert newer application state", () => {
    const currentEnrichedApp = {
      company: "CynLr",
      companyKey: "cynlr",
      subtitle: "Fresher Hiring 2026-27",
      classification: "New Hiring Opportunity",
      date: new Date("2026-08-15T12:00:00.000Z"),
      link: "https://forms.gle/cynlr2026",
      displayFields: [
        { label: "Role", value: "Fresher Hiring 2026-27" },
        { label: "Deadline", value: "Aug 17, 2026" },
      ],
      manualOverrides: [],
    };

    const reparsedOldEmail = {
      company: "CynLr",
      subtitle: "CYNLR Pre-Placement Talk",
      classification: "PPT Announcement",
      link: "https://teams.microsoft.com/l/meetup-join/123",
      displayFields: [
        { label: "Event Date", value: "Aug 12, 2026" },
        { label: "Time", value: "5:00 PM – 6:00 PM" },
      ],
    };

    const updatePayload = enrichApplicationRecord(
      currentEnrichedApp,
      reparsedOldEmail,
      new Date("2026-08-12T10:00:00.000Z"),
      { isNewerEmail: false }
    );

    // Subtitle must NOT revert to PPT
    assert.strictEqual(updatePayload.subtitle, undefined);
    // Link must NOT revert to Teams
    assert.strictEqual(updatePayload.link, undefined);

    // But Event Date from PPT email is safely merged into displayFields
    const displayLabels = updatePayload.displayFields.map((f) => f.label);
    assert.ok(displayLabels.includes("Role"));
    assert.ok(displayLabels.includes("Deadline"));
    assert.ok(displayLabels.includes("Event Date"));
  });

  test("respects manual overrides strictly", () => {
    const existingWithOverride = {
      company: "CynLr",
      subtitle: "Custom User Title",
      role: "Lead Roboticist",
      manualOverrides: ["subtitle", "role"],
      date: new Date("2026-08-12T10:00:00.000Z"),
    };

    const parsedHiringEmail = {
      subtitle: "Fresher Hiring 2026-27",
      role: "Graduate Engineer Trainee",
      displayFields: [{ label: "Deadline", value: "Aug 20, 2026" }],
    };

    const updatePayload = enrichApplicationRecord(
      existingWithOverride,
      parsedHiringEmail,
      new Date("2026-08-15T12:00:00.000Z")
    );

    assert.strictEqual(updatePayload.subtitle, undefined);
    assert.strictEqual(updatePayload.role, undefined);
    assert.ok(updatePayload.displayFields !== undefined);
  });
});
