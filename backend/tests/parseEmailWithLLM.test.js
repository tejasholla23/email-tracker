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

// ── Test 1: Primary success (Gemma 4) → No fallback ──
test('1. Primary model (google/gemma-4-31b-it) success: returns primary llmProvider without invoking fallback', async () => {
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
  assert.strictEqual(parsed.parseMeta.llmProvider, "google/gemma-4-31b-it");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.strictEqual(calledModels.length, 1);
  assert.strictEqual(calledModels[0], "google/gemma-4-31b-it");
});

// ── Test 2: Primary rate limit (429) → Secondary model fallback (Nemotron) ──
test('2. Primary rate limit 429: seamlessly falls back to nvidia/nemotron-3.5-lightning-30b-a3b', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "google/gemma-4-31b-it") {
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
            company: "NemotronCorp",
            subtitle: "Backend Engineer",
            type: "full-time",
            displayFields: [{ label: "Role", value: "Backend Engineer" }]
          })
        }
      }]
    };
  };

  const parsed = await parseEmailWithLLM(
    "Job Opening at NemotronCorp",
    "hr@nemotroncorp.com",
    "NemotronCorp is hiring backend engineers."
  );

  assert.strictEqual(parsed.company, "NemotronCorp");
  assert.strictEqual(parsed.parseMeta.llmProvider, "nvidia/nemotron-3.5-lightning-30b-a3b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.deepStrictEqual(calledModels, ["google/gemma-4-31b-it", "nvidia/nemotron-3.5-lightning-30b-a3b"]);
});

// ── Test 3: Primary 503/timeout → Secondary model fallback (Nemotron) ──
test('3. Primary 503 service unavailable: falls back to secondary model', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "google/gemma-4-31b-it") {
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
  assert.strictEqual(parsed.parseMeta.llmProvider, "nvidia/nemotron-3.5-lightning-30b-a3b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
});

// ── Test 4: Primary malformed JSON → Secondary model fallback ──
test('4. Primary malformed JSON: falls back to secondary model', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "google/gemma-4-31b-it") {
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
  assert.strictEqual(parsed.parseMeta.llmProvider, "nvidia/nemotron-3.5-lightning-30b-a3b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
});

// ── Test 5: Primary schema validation failure → Secondary model fallback ──
test('5. Primary schema validation failure: falls back to secondary model', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    if (params.model === "google/gemma-4-31b-it") {
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
  assert.strictEqual(parsed.parseMeta.llmProvider, "nvidia/nemotron-3.5-lightning-30b-a3b");
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
});

// ── Test 6: Primary 401/403 auth error → Fatal (No secondary retry loop) ──
test('6. Primary 401/403 auth error: does not retry secondary model with bad credentials', async () => {
  calledModels = [];
  mockModelBehavior = (params) => {
    const err = new Error("Unauthorized (401) Invalid API Key");
    err.status = 401;
    throw err;
  };

  const parsed = await parseEmailWithLLM(
    "Test Auth Failure Email",
    "jobs@authcorp.com",
    "Company Name: AuthCorp\nJob Role: Software Engineer"
  );

  // Should have attempted ONLY primary model, not secondary
  assert.strictEqual(calledModels.length, 1);
  assert.strictEqual(calledModels[0], "google/gemma-4-31b-it");
  assert.strictEqual(parsed.parseMeta.llmStatus, "transport_error");
  // Cleanly drops to deterministic fallback
  assert.strictEqual(parsed.company, "Authcorp");
});

// ── Test 7: Both models fail → Deterministic regex fallback ──
test('7. Both models fail: cleanly drops to deterministic fallback', async () => {
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

  assert.deepStrictEqual(calledModels, ["google/gemma-4-31b-it", "nvidia/nemotron-3.5-lightning-30b-a3b"]);
  assert.strictEqual(parsed.parseMeta.llmStatus, "transport_error");
  assert.strictEqual(parsed.parseMeta.llmProvider, "none");
  assert.strictEqual(parsed.company, "Acme Technologies");
  assert.strictEqual(parsed.role, "Software Development Engineer - Intern");
  assert.strictEqual(parsed.displayFields.find(f => f.label === "CTC")?.value, "18 LPA");
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



