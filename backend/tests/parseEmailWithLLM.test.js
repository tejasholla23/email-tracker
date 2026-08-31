const test = require('node:test');
const assert = require('node:assert');
const { extractFormLink } = require('../utils/parseEmailWithLLM');

test('extractFormLink should extract Google Forms links', () => {
  const text = 'Please fill out the form: https://forms.gle/abc123XYZ before tomorrow.';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://forms.gle/abc123XYZ');
  assert.strictEqual(result.isForm, true);
});

test('extractFormLink should extract Unstop links', () => {
  const text = 'Apply here: https://unstop.com/o/KoXsOLD/?ref=amcJFfEZ *Last Date to Register:* Sunday';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://unstop.com/o/KoXsOLD/?ref=amcJFfEZ');
});

test('extractFormLink should extract Brazen links', () => {
  const text = 'Register at https://app.brazenconnect.com/a/asp-sdengineering/e/28N38 for the event.';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://app.brazenconnect.com/a/asp-sdengineering/e/28N38');
});

test('extractFormLink should extract URLs followed by signatures ("Regards")', () => {
  const text = 'Link: https://example.com/apply?id=123&token=abc. Regards, Placement Cell';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://example.com/apply?id=123&token=abc');
});

test('extractFormLink should extract URLs surrounded by angle brackets', () => {
  const text = 'Here is the link <https://app.brazenconnect.com/a/asp-sdengineering/e/28N38> to apply.';
  const result = extractFormLink(text);
  assert.strictEqual(result.primary, 'https://app.brazenconnect.com/a/asp-sdengineering/e/28N38');
});

test('extractFormLink should remove duplicates', () => {
  const text = 'Link: https://unstop.com/competition and again <https://unstop.com/competition>';
  const result = extractFormLink(text);
  assert.strictEqual(result.all.length, 1);
  assert.strictEqual(result.primary, 'https://unstop.com/competition');
});

// Delete existing parseEmailWithLLM from cache so we can reload it with mocked SDK
delete require.cache[require.resolve('../utils/parseEmailWithLLM')];

// Setup Mock for openai with multi-model call inspection
let mockModelBehavior = null; // function({ model, messages }) => { choices: ... } or throws
let mockShouldThrow = null;
let mockResponseText = "";
let calledModels = [];

const mockChatCompletionsCreate = async (params) => {
  calledModels.push(params.model);
  if (mockModelBehavior) {
    return mockModelBehavior(params);
  }
  if (mockShouldThrow) {
    throw mockShouldThrow;
  }
  return {
    choices: [
      {
        message: {
          content: mockResponseText
        }
      }
    ]
  };
};

require.cache[require.resolve('openai')] = {
  exports: {
    OpenAI: class {
      constructor() {
        this.chat = {
          completions: {
            create: mockChatCompletionsCreate
          }
        };
      }
    }
  }
};

// Re-require parseEmailWithLLM to use our mocked OpenAI
const { parseEmailWithLLM } = require('../utils/parseEmailWithLLM');

// ── Test 1: Primary success (NVIDIA: openai/gpt-oss-20b) → No fallback ──
test('1. Primary model (NVIDIA: openai/gpt-oss-20b) success: returns primary llmProvider without invoking fallback', async () => {
  mockShouldThrow = null;
  mockModelBehavior = null;
  calledModels = [];
  mockResponseText = JSON.stringify({
    emailType: "job",
    opportunityType: "JOB_APPLICATION",
    classification: "New Hiring Opportunity",
    company: "GemmaTech",
    subtitle: "Staff Engineer",
    type: "full-time",
    displayFields: [{ label: "Role", value: "Staff Engineer" }]
  });

  const parsed = await parseEmailWithLLM(
    "Hiring Staff Engineer at GemmaTech",
    "careers@gemmatech.com",
    "GemmaTech is hiring Staff Engineers."
  );

  assert.strictEqual(parsed.company, "GemmaTech");
  assert.strictEqual(parsed.parseMeta.llmProvider, "nvidia");
  assert.strictEqual(parsed.parseMeta.model, "openai/gpt-oss-20b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.strictEqual(calledModels.length, 1);
  assert.strictEqual(calledModels[0], "openai/gpt-oss-20b");
});

// ── Test 2: Primary rate limit (429) → Secondary model fallback (Groq: openai/gpt-oss-120b) ──
test('2. Primary rate limit 429: seamlessly falls back to Groq (openai/gpt-oss-120b)', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "openai/gpt-oss-20b") {
      const err = new Error("Rate limit exceeded (429)");
      err.status = 429;
      throw err;
    }
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            emailType: "job",
            opportunityType: "JOB_APPLICATION",
            classification: "New Hiring Opportunity",
            company: "GroqCorp",
            subtitle: "Backend Engineer",
            type: "full-time",
            displayFields: [{ label: "Role", value: "Backend Engineer" }]
          })
        }
      }]
    };
  };

  const parsed = await parseEmailWithLLM(
    "Job Opening at GroqCorp",
    "hr@groqcorp.com",
    "GroqCorp is hiring backend engineers."
  );

  assert.strictEqual(parsed.company, "GroqCorp");
  assert.strictEqual(parsed.parseMeta.llmProvider, "groq");
  assert.strictEqual(parsed.parseMeta.model, "openai/gpt-oss-120b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.deepStrictEqual(calledModels, ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
});

// ── Test 3: Primary 503/timeout → Secondary model fallback (Groq) ──
test('3. Primary 503 service unavailable: falls back to secondary model (Groq)', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "openai/gpt-oss-20b") {
      const err = new Error("Service Unavailable (503)");
      err.status = 503;
      throw err;
    }
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            emailType: "job",
            opportunityType: "JOB_APPLICATION",
            classification: "Internship Opportunity",
            company: "FallbackCorp",
            subtitle: "Summer Intern",
            type: "internship",
            displayFields: [{ label: "Role", value: "Summer Intern" }]
          })
        }
      }]
    };
  };

  const parsed = await parseEmailWithLLM(
    "Summer Internships at FallbackCorp",
    "jobs@fallbackcorp.com",
    "Apply for our summer internship program."
  );

  assert.strictEqual(parsed.company, "FallbackCorp");
  assert.strictEqual(parsed.parseMeta.llmProvider, "groq");
  assert.strictEqual(parsed.parseMeta.model, "openai/gpt-oss-120b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.deepStrictEqual(calledModels, ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
});

// ── Test 4: Primary malformed JSON → Secondary model fallback (Groq) ──
test('4. Primary malformed JSON: falls back to secondary model (Groq)', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "openai/gpt-oss-20b") {
      return { choices: [{ message: { content: "{ bad json: none" } }] };
    }
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            emailType: "job",
            opportunityType: "JOB_APPLICATION",
            classification: "New Hiring Opportunity",
            company: "ValidJsonCorp",
            subtitle: "Cloud Architect",
            type: "full-time",
            displayFields: [{ label: "Role", value: "Cloud Architect" }]
          })
        }
      }]
    };
  };

  const parsed = await parseEmailWithLLM(
    "Cloud Architect Role at ValidJsonCorp",
    "careers@validjsoncorp.com",
    "Hiring Cloud Architects."
  );

  assert.strictEqual(parsed.company, "ValidJsonCorp");
  assert.strictEqual(parsed.parseMeta.llmProvider, "groq");
  assert.strictEqual(parsed.parseMeta.model, "openai/gpt-oss-120b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
});

// ── Test 5: Primary schema validation failure → Secondary model fallback (Groq) ──
test('5. Primary schema validation failure: falls back to secondary model (Groq)', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "openai/gpt-oss-20b") {
      return {
        choices: [{
          message: {
            content: JSON.stringify({ emailType: "invalidType", classification: "Invalid" })
          }
        }]
      };
    }
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            emailType: "job",
            opportunityType: "JOB_APPLICATION",
            classification: "New Hiring Opportunity",
            company: "ValidSchemaCorp",
            subtitle: "Security Analyst",
            type: "full-time",
            displayFields: [{ label: "Role", value: "Security Analyst" }]
          })
        }
      }]
    };
  };

  const parsed = await parseEmailWithLLM(
    "Security Analyst at ValidSchemaCorp",
    "info@validschemacorp.com",
    "Hiring security analysts."
  );

  assert.strictEqual(parsed.company, "ValidSchemaCorp");
  assert.strictEqual(parsed.parseMeta.llmProvider, "groq");
  assert.strictEqual(parsed.parseMeta.model, "openai/gpt-oss-120b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
});

// ── Test 6: Primary & Secondary fail → Tertiary model (Mistral: mistral-small-latest) succeeds ──
test('6. Primary and Secondary fail: seamlessly falls back to Tertiary model (Mistral: mistral-small-latest)', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "openai/gpt-oss-20b") {
      const err = new Error("NVIDIA Gateway Timeout (504)");
      err.status = 504;
      throw err;
    }
    if (params.model === "openai/gpt-oss-120b") {
      const err = new Error("Groq Rate Limit (429)");
      err.status = 429;
      throw err;
    }
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            emailType: "job",
            opportunityType: "JOB_APPLICATION",
            classification: "New Hiring Opportunity",
            company: "MistralCorp",
            subtitle: "AI Engineer",
            type: "full-time",
            displayFields: [{ label: "Role", value: "AI Engineer" }]
          })
        }
      }]
    };
  };

  const parsed = await parseEmailWithLLM(
    "Job Opening at MistralCorp",
    "hr@mistralcorp.com",
    "MistralCorp is hiring AI engineers."
  );

  assert.strictEqual(parsed.company, "MistralCorp");
  assert.strictEqual(parsed.parseMeta.llmProvider, "mistral");
  assert.strictEqual(parsed.parseMeta.model, "mistral-small-latest");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.deepStrictEqual(calledModels, ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "mistral-small-latest"]);
});

// ── Test 7: All three providers fail → Drops to deterministic fallback & defers parse for retry ──
test('7. All three models fail: defers parse for retry without fragile guessing', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    const err = new Error("All endpoints overloaded (503)");
    err.status = 503;
    throw err;
  };

  const body = `
  Dear Students,
  Acme Technologies is visiting our campus for recruitment.
  Company Name: Acme Technologies
  Job Role: Software Development Engineer - Intern
  Stipend: INR 50,000 / Month
  CTC: 18 LPA
  Location: Bangalore
  `;

  const parsed = await parseEmailWithLLM(
    "Campus Recruitment 2026 | Acme Technologies",
    "placement@msrit.edu",
    body
  );

  assert.deepStrictEqual(calledModels, ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "mistral-small-latest"]);
  assert.strictEqual(parsed.parseMeta.llmStatus, "transport_error");
  assert.strictEqual(parsed.parseMeta.llmProvider, "none");
  assert.strictEqual(parsed.parseMeta.shouldRetry, true);
  assert.strictEqual(parsed.status, "pending");
  assert.strictEqual(parsed.company, null);
  assert.strictEqual(parsed.isRelevant, true);
});

// ── Test 8: Thinking tag sanitization ──
test('8. Thinking tag sanitization (<thought> / <think>) from reasoning models', async () => {
  calledModels = [];
  mockModelBehavior = null;
  mockResponseText = `
  <thought>
  Internal model reasoning:
  Analyzing placement email from ThinkCorp.
  Extracting role and stipend.
  </thought>
  \`\`\`json
  {
    "emailType": "job",
    "opportunityType": "JOB_APPLICATION",
    "classification": "Internship Opportunity",
    "company": "ThinkCorp",
    "subtitle": "ML Research Intern",
    "type": "internship",
    "displayFields": [
      { "label": "Role", "value": "ML Research Intern" },
      { "label": "Stipend", "value": "INR 60,000 / Month" }
    ]
  }
  \`\`\`
  `;

  const parsed = await parseEmailWithLLM(
    "Internship Opportunity at ThinkCorp",
    "careers@thinkcorp.com",
    "ThinkCorp is hiring ML interns."
  );

  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.strictEqual(parsed.company, "ThinkCorp");
  assert.strictEqual(parsed.role, "ML Research Intern");
  assert.strictEqual(parsed.displayFields.find(f => f.label === "Stipend")?.value, "INR 60,000 / Month");
});

// ── Test 9: Prime Numbers company retention (Google Form link doesn't overwrite with Google) ──
test('9. Prime Numbers email: company remains Prime Numbers even when Google Form is mentioned in placement email', async () => {
  calledModels = [];
  mockModelBehavior = null;
  mockResponseText = JSON.stringify({
    emailType: "job",
    opportunityType: "JOB_APPLICATION",
    classification: "Internship Opportunity",
    company: "Prime Numbers",
    domain: "primenumbers.io",
    subtitle: "Campus Drive - 2027 Batch",
    type: "internship",
    link: "https://forms.gle/HaSF5SzSaJSk8RB36",
    displayFields: [
      { label: "Stipend", value: "₹35k" },
      { label: "CTC", value: "₹15 LPA" },
      { label: "Location", value: "Bangalore" }
    ]
  });

  const body = `Dear Students,
Campus Drive for Prime Numbers – 2027 Batch
Students interested in the below opportunity are requested to fill out the Google by EOD.
Google Form:
https://forms.gle/HaSF5SzSaJSk8RB36
Eligibility: This opportunity is open only to CS allied branches.
Internship & Compensation
Stipend: ₹35k
Full-Time CTC: ₹15 LPA
Backlogs - Not allowed
CGPA - 7.5
Location: Bangalore
The internship has the potential to be converted into a full-time position based on performance.
Please find attached the JD.
Interested and eligible students are requested to fill out the Google Form without fail.
Thanks,
Placement Department`;

  const parsed = await parseEmailWithLLM(
    "Campus Drive for Primenumbers - 2027",
    "Placement Officer MSRIT <placement@msrit.edu>",
    body
  );

  assert.strictEqual(parsed.company, "Prime Numbers");
  assert.strictEqual(parsed.emailType, "job");
  assert.strictEqual(parsed.link, "https://forms.gle/HaSF5SzSaJSk8RB36");
  assert.strictEqual(parsed.parseMeta.llmProvider, "nvidia");
  assert.strictEqual(parsed.parseMeta.model, "openai/gpt-oss-20b");
});

// ── Test 10: Deterministic time extraction: CTC/compensation does not bleed into eventTime ──
test('10. CTC / compensation fields do not bleed into eventTime or reportingTime', () => {
  const { deriveFromDisplayFields, isValidTimeString } = require('../utils/parseEmailWithLLM');

  assert.strictEqual(isValidTimeString("₹ 15 LPA"), false);
  assert.strictEqual(isValidTimeString("₹35k"), false);
  assert.strictEqual(isValidTimeString("15 LPA"), false);
  assert.strictEqual(isValidTimeString("INR 50,000 / Month"), false);
  assert.strictEqual(isValidTimeString("10:00 AM"), true);
  assert.strictEqual(isValidTimeString("2:30 PM"), true);
  assert.strictEqual(isValidTimeString("14:30"), true);
  assert.strictEqual(isValidTimeString("10 AM - 1 PM"), true);

  const displayFields = [
    { label: "Full-Time CTC", value: "₹ 15 LPA" },
    { label: "Stipend", value: "₹35k" },
    { label: "Location", value: "Bangalore" }
  ];

  const derived = deriveFromDisplayFields(displayFields);
  assert.strictEqual(derived.salaryText, "₹ 15 LPA");
  assert.strictEqual(derived.eventTime, "");
});

// ── Test 11: In-flight Single-Flight Promise Coalescing ──
test('11. Single-Flight Coalescing: concurrent identical message parses trigger exactly 1 execution', async () => {
  const { parseEmailWithSingleFlight, inFlightParses } = require('../utils/parseEmailWithLLM');
  const cacheKey = "<msg-12345@msrit.edu>";

  let executionCount = 0;
  const mockSlowParse = async () => {
    executionCount++;
    await new Promise(r => setTimeout(r, 50));
    return {
      company: "Prime Numbers",
      classification: "Internship Opportunity",
      uniqueId: Math.random()
    };
  };

  // Launch 4 concurrent parse requests for the same message ID
  const promises = [
    parseEmailWithSingleFlight(cacheKey, mockSlowParse),
    parseEmailWithSingleFlight(cacheKey, mockSlowParse),
    parseEmailWithSingleFlight(cacheKey, mockSlowParse),
    parseEmailWithSingleFlight(cacheKey, mockSlowParse)
  ];

  const results = await Promise.all(promises);

  assert.strictEqual(executionCount, 1, "Exactly 1 parse execution should occur");
  assert.strictEqual(results.length, 4);
  assert.strictEqual(results[0].company, "Prime Numbers");
  assert.strictEqual(results[1].company, "Prime Numbers");
  assert.strictEqual(results[2].company, "Prime Numbers");
  assert.strictEqual(results[3].company, "Prime Numbers");
  assert.strictEqual(inFlightParses.has(cacheKey), false, "inFlightParses map should be cleared after execution");
});

// ── Test 12: In-flight Single-Flight Error Cleanup ──
test('12. Single-Flight Coalescing: errors clean up in-flight map and reject callers', async () => {
  const { parseEmailWithSingleFlight, inFlightParses } = require('../utils/parseEmailWithLLM');
  const cacheKey = "<error-msg@msrit.edu>";

  const failingParse = async () => {
    await new Promise(r => setTimeout(r, 20));
    throw new Error("Simulated LLM network error");
  };

  const p1 = parseEmailWithSingleFlight(cacheKey, failingParse);
  const p2 = parseEmailWithSingleFlight(cacheKey, failingParse);

  await assert.rejects(p1, /Simulated LLM network error/);
  await assert.rejects(p2, /Simulated LLM network error/);
  assert.strictEqual(inFlightParses.has(cacheKey), false, "inFlightParses map should be cleaned up on failure");
});
