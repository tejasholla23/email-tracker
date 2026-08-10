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

// Setup Mock for openai
let mockResponseText = "";
let mockShouldThrow = null;

const mockChatCompletionsCreate = async ({ model, messages }) => {
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

// Re-require parseEmailWithLLM to use our mocked GoogleGenAI
const { parseEmailWithLLM } = require('../utils/parseEmailWithLLM');

test('parseEmailWithLLM sets shouldRetry: false on success', async () => {
  mockShouldThrow = null;
  mockResponseText = JSON.stringify({
    emailType: "job",
    opportunityType: "JOB_APPLICATION",
    classification: "New Hiring Opportunity",
    company: "TestCorp",
    subtitle: "Software Engineer Intern",
    type: "internship",
    link: "https://example.com/apply",
    displayFields: [
      { label: "Stipend", value: "INR 25,000" }
    ]
  });

  const parsed = await parseEmailWithLLM(
    "Job opportunity at TestCorp",
    "recruitment@testcorp.com",
    "We are hiring software engineers."
  );

  assert.strictEqual(parsed.parseMeta.shouldRetry, false);
  assert.strictEqual(parsed.parseMeta.llmStatus, "success");
  assert.strictEqual(parsed.parseMeta.geminiUsed, true);
  assert.strictEqual(parsed.company, "TestCorp");
});

test('parseEmailWithLLM sets shouldRetry: false on malformed JSON content error', async () => {
  mockShouldThrow = null;
  mockResponseText = "{ invalid json here... }";

  const parsed = await parseEmailWithLLM(
    "Job opportunity at TestCorp",
    "recruitment@testcorp.com",
    "We are hiring software engineers."
  );

  assert.strictEqual(parsed.parseMeta.shouldRetry, false);
  assert.strictEqual(parsed.parseMeta.llmStatus, "content_error");
  assert.strictEqual(parsed.parseMeta.geminiUsed, false);
  assert.strictEqual(parsed.company, "Testcorp");
});

test('parseEmailWithLLM sets shouldRetry: false on schema validation failure content error', async () => {
  mockShouldThrow = null;
  mockResponseText = JSON.stringify({
    emailType: "invalidType",
    classification: "Invalid Classification"
  });

  const parsed = await parseEmailWithLLM(
    "Job opportunity at TestCorp",
    "recruitment@testcorp.com",
    "We are hiring software engineers."
  );

  assert.strictEqual(parsed.parseMeta.shouldRetry, false);
  assert.strictEqual(parsed.parseMeta.llmStatus, "content_error");
  assert.strictEqual(parsed.parseMeta.geminiUsed, false);
});

test('parseEmailWithLLM sets shouldRetry: true on rate limit 429 transport error', async () => {
  mockShouldThrow = new Error("Resource has been exhausted (e.g. 429 Rate Limit)");
  
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, delay) => {
    return originalSetTimeout(fn, 0);
  };

  try {
    const parsed = await parseEmailWithLLM(
      "Job opportunity at TestCorp",
      "recruitment@testcorp.com",
      "We are hiring software engineers."
    );

    assert.strictEqual(parsed.parseMeta.shouldRetry, true);
    assert.strictEqual(parsed.parseMeta.llmStatus, "transport_error");
    assert.strictEqual(parsed.parseMeta.geminiUsed, false);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

