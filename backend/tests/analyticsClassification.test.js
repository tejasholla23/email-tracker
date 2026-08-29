const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { deriveStageFromEmail } = require("../utils/parseEmailWithLLM");
const { enrichApplicationRecord } = require("../utils/enrichmentService");

describe("Analytics & Recruitment Classification Unit Tests", () => {
  describe("1. deriveStageFromEmail parser tests", () => {
    test("Hiring opportunity without explicit cues maps to stage: none", () => {
      const stage = deriveStageFromEmail({
        classification: "New Hiring Opportunity",
        subject: "Campus Recruitment 2026 - Acme Technologies",
        body: "Acme Technologies is visiting our campus for Software Engineer role.",
        opportunityType: "JOB_APPLICATION",
      });
      assert.equal(stage, "none");
    });

    test("Assessment Announcement maps to stage: oa_scheduled", () => {
      const stage = deriveStageFromEmail({
        classification: "Assessment Announcement",
        subject: "Online Assessment Schedule - Acme",
        body: "Your OA is scheduled on August 30th on HackerEarth.",
        opportunityType: "JOB_APPLICATION",
      });
      assert.equal(stage, "oa_scheduled");
    });

    test("Interview Schedule maps to stage: interview_scheduled", () => {
      const stage = deriveStageFromEmail({
        classification: "Interview Schedule",
        subject: "Technical Interview Schedule - Acme",
        body: "You have been shortlisted for technical round 1 on Google Meet.",
        opportunityType: "JOB_APPLICATION",
      });
      assert.equal(stage, "interview_scheduled");
    });

    test("Interview Reminder maps to stage: interview_scheduled", () => {
      const stage = deriveStageFromEmail({
        classification: "Interview Reminder",
        subject: "Reminder: Interview Today",
        body: "This is a reminder for your interview at 2:00 PM.",
        opportunityType: "JOB_APPLICATION",
      });
      assert.equal(stage, "interview_scheduled");
    });

    test("Ambiguous Interview Result does NOT map to offered", () => {
      const stage = deriveStageFromEmail({
        classification: "Interview Result",
        subject: "Interview Results - Acme Drive",
        body: "Please find the interview results attached in the PDF.",
        opportunityType: "JOB_APPLICATION",
      });
      assert.equal(stage, "none");
    });

    test("Explicit selection in Interview Result maps to offered", () => {
      const stage = deriveStageFromEmail({
        classification: "Interview Result",
        subject: "Selection Announcement - Acme",
        body: "Congratulations on your selection! Pleased to offer you the role of Software Engineer.",
        opportunityType: "JOB_APPLICATION",
      });
      assert.equal(stage, "offered");
    });

    test("Explicit rejection from any email maps to rejected", () => {
      const stage = deriveStageFromEmail({
        classification: "Generic Placement Notice",
        subject: "Application Update - Acme",
        body: "We regret to inform you that you are not shortlisted for the next round.",
        opportunityType: "JOB_APPLICATION",
      });
      assert.equal(stage, "rejected");
    });

    test("Non-placement events (Hackathon/Webinar) map to stage: none", () => {
      const stage = deriveStageFromEmail({
        classification: "Hackathon / Event Invitation",
        subject: "National Hackathon 2026",
        body: "Register for the hackathon by Friday.",
        opportunityType: "HACKATHON",
      });
      assert.equal(stage, "none");
    });
  });

  describe("2. enrichmentService progressive stage advancement & manual override tests", () => {
    test("none -> oa_scheduled stage advancement", () => {
      const existingApp = {
        company: "Acme",
        stage: "none",
        opportunityType: "JOB_APPLICATION",
        manualOverrides: [],
      };
      const parsed = {
        stage: "oa_scheduled",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.stage, "oa_scheduled");
    });

    test("oa_scheduled -> interview_scheduled stage advancement", () => {
      const existingApp = {
        company: "Acme",
        stage: "oa_scheduled",
        opportunityType: "JOB_APPLICATION",
        manualOverrides: [],
      };
      const parsed = {
        stage: "interview_scheduled",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.stage, "interview_scheduled");
    });

    test("interview_scheduled -> offered stage advancement", () => {
      const existingApp = {
        company: "Acme",
        stage: "interview_scheduled",
        opportunityType: "JOB_APPLICATION",
        manualOverrides: [],
      };
      const parsed = {
        stage: "offered",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.stage, "offered");
    });

    test("Rejection can occur from earlier stages (e.g. OA -> rejected)", () => {
      const existingApp = {
        company: "Acme",
        stage: "oa_scheduled",
        opportunityType: "JOB_APPLICATION",
        manualOverrides: [],
      };
      const parsed = {
        stage: "rejected",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.stage, "rejected");
    });

    test("No automatic stage regression: interview_scheduled does not regress to oa_scheduled", () => {
      const existingApp = {
        company: "Acme",
        stage: "interview_scheduled",
        opportunityType: "JOB_APPLICATION",
        manualOverrides: [],
      };
      const parsed = {
        stage: "oa_scheduled",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.stage, undefined);
    });

    test("Manual override protection: user-edited stage is never overwritten by sync", () => {
      const existingApp = {
        company: "Acme",
        stage: "interview_scheduled",
        opportunityType: "JOB_APPLICATION",
        manualOverrides: ["stage"],
      };
      const parsed = {
        stage: "rejected",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.stage, undefined);
    });

    test("Manual override protection: user-edited opportunityType is preserved", () => {
      const existingApp = {
        company: "Acme",
        stage: "none",
        opportunityType: "HACKATHON",
        manualOverrides: ["opportunityType"],
      };
      const parsed = {
        stage: "none",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.opportunityType, undefined);
    });

    test("Automatic enrichment does not add to manualOverrides", () => {
      const existingApp = {
        company: "Acme",
        stage: "none",
        opportunityType: "JOB_APPLICATION",
        manualOverrides: [],
      };
      const parsed = {
        stage: "oa_scheduled",
        opportunityType: "JOB_APPLICATION",
      };
      const update = enrichApplicationRecord(existingApp, parsed, new Date(), { isNewerEmail: true });
      assert.equal(update.manualOverrides, undefined);
      assert.equal(update.$addToSet, undefined);
    });

    test("Application schema allows rejected_after_oa and rejected_after_interview", () => {
      const Application = require("../models/Application");
      const app1 = new Application({ stage: "rejected_after_oa" });
      const err1 = app1.validateSync(["stage"]);
      assert.equal(err1, undefined);

      const app2 = new Application({ stage: "rejected_after_interview" });
      const err2 = app2.validateSync(["stage"]);
      assert.equal(err2, undefined);
    });
  });
});
