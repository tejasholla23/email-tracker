const test = require('node:test');
const assert = require('node:assert');
const { extractFallbackDisplayFields } = require('../utils/parseEmailWithLLM');

test('extractFallbackDisplayFields extracts HACKATHON fields', () => {
  const body = `
    Welcome to HackVega 2.0!
    Prize pool: 3.5 Lakh
    Team Size: 1-5 members
    Registration deadline: 15 June 2026
    Eligibility: 2026-2029 batch
  `;

  const fields = extractFallbackDisplayFields(body, "HACKATHON");

  const prize = fields.find(f => f.label === "Prize");
  assert.ok(prize, "Should extract Prize");
  assert.strictEqual(prize.value, "3.5 Lakh");

  const teamSize = fields.find(f => f.label === "Team Size");
  assert.ok(teamSize, "Should extract Team Size");
  assert.strictEqual(teamSize.value, "1-5 members");

  const deadline = fields.find(f => f.label === "Deadline");
  assert.ok(deadline, "Should extract Deadline");
  assert.strictEqual(deadline.value, "15 June 2026");

  const eligibility = fields.find(f => f.label === "Eligibility");
  assert.ok(eligibility, "Should extract Eligibility");
  assert.strictEqual(eligibility.value, "2026-2029 batch");
});

test('extractFallbackDisplayFields extracts WEBINAR fields', () => {
  const body = `
    Ericsson Edge Program Webinar
    Date: 11 June 2026
    Time: 11:00 AM
    Speaker: John Doe
    Topic: Edge Computing
  `;

  const fields = extractFallbackDisplayFields(body, "WEBINAR");

  const date = fields.find(f => f.label === "Date");
  assert.ok(date, "Should extract Date");
  assert.strictEqual(date.value, "11 June 2026");

  const time = fields.find(f => f.label === "Time");
  assert.ok(time, "Should extract Time");
  assert.strictEqual(time.value, "11:00 AM");

  const speaker = fields.find(f => f.label === "Speaker");
  assert.ok(speaker, "Should extract Speaker");
  assert.strictEqual(speaker.value, "John Doe");

  const topic = fields.find(f => f.label === "Topic");
  assert.ok(topic, "Should extract Topic");
  assert.strictEqual(topic.value, "Edge Computing");
});

test('extractFallbackDisplayFields extracts JOB_APPLICATION fields', () => {
  const body = `
    Role: Software Engineer
    CTC: 16 LPA
    Stipend: 40k per month
    Location: Bangalore
  `;

  const fields = extractFallbackDisplayFields(body, "JOB_APPLICATION");

  const role = fields.find(f => f.label === "Role");
  assert.ok(role, "Should extract Role");
  assert.strictEqual(role.value, "Software Engineer");

  const ctc = fields.find(f => f.label === "CTC");
  assert.ok(ctc, "Should extract CTC");
  assert.strictEqual(ctc.value, "16 LPA");

  const stipend = fields.find(f => f.label === "Stipend");
  assert.ok(stipend, "Should extract Stipend");
  assert.strictEqual(stipend.value, "40k per month");

  const location = fields.find(f => f.label === "Location");
  assert.ok(location, "Should extract Location");
  assert.strictEqual(location.value, "Bangalore");
});
