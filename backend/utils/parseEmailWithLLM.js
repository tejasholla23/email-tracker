const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Derive a human-readable company name from an email sender string.
 * Examples:
 *   "no-reply@infosys.com"  → "Infosys"
 *   "careers@amazon.co.uk"  → "Amazon"
 */
function companyFromSender(senderRaw = "") {
  const domainMatch = senderRaw.match(/@([a-zA-Z0-9-]+)\./);
  if (!domainMatch) return null;

  const domainName = domainMatch[1].toLowerCase();

  // Skip generic mail-service domains that carry no company info
  const genericDomains = [
    "gmail", "yahoo", "outlook", "hotmail", "noreply",
    "no-reply", "mail", "info", "notifications", "mailer",
  ];
  if (genericDomains.includes(domainName)) return null;

  return domainName.charAt(0).toUpperCase() + domainName.slice(1);
}

/**
 * Lightweight keyword-based status classifier used as a fallback.
 */
function inferStatusFromText(text) {
  const t = text.toLowerCase();

  if (/\b(offer|congratulations|selected|pleased to inform|happy to inform|job offer)\b/.test(t)) {
    return "offer";
  }
  if (/\b(interview|schedule|slot|assessment|online test|next round|aptitude|shortlisted)\b/.test(t)) {
    return "interview";
  }
  if (/\b(regret|unfortunately|not selected|unsuccessful|cannot move forward|will not be proceeding)\b/.test(t)) {
    return "rejected";
  }

  return "applied";
}

/**
 * Normalize status to one of the four allowed values.
 */
function normalizeStatus(raw = "") {
  const s = raw.toLowerCase().trim();
  if (["offer", "accepted"].includes(s)) return "offer";
  if (["interview", "shortlisted", "test", "assessment"].includes(s)) return "interview";
  if (["rejected", "declined", "unsuccessful", "done"].includes(s)) return "rejected";
  return "applied";
}

/**
 * Sanitize a company string, rejecting generic placeholders.
 */
function sanitizeCompany(raw = "") {
  const trimmed = raw.trim();
  const invalid = [
    "", "unknown", "n/a", "na", "none", "company", "team",
    "the company", "our company", "hiring team",
  ];
  if (invalid.includes(trimmed.toLowerCase())) return null;
  return trimmed;
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────

/**
 * Parse a raw email text (subject + snippet) via Gemini LLM.
 *
 * @param {string} emailText  - Combined subject + body snippet
 * @param {string} [sender]   - Raw "From" header value (used for domain fallback)
 * @returns {object}          - Parsed application data or { isRelevant: false }
 */
async function parseEmailWithLLM(emailText, sender = "") {
  // console.log("--- parseEmailWithLLM ---");

  // ── 1. Build an improved, strict prompt ─────────────────────────────────
  const prompt = `
You are a precise data extraction system for a job application tracker.

Analyze the following email text and determine if it is related to:
- Job applications, internships, online assessments, interviews, offers, or rejections.

=== RULES ===
1. Return ONLY valid JSON. No explanations, no markdown, no extra text.
2. If the email IS relevant, return this exact structure:
{
  "isRelevant": true,
  "company": "<company name>",
  "role": "<job title / role>",
  "type": "internship | full-time | test | hackathon | unknown",
  "status": "applied | interview | offer | rejected",
  "date": "<YYYY-MM-DD or empty string>",
  "link": "<URL or empty string>"
}
3. If the email is NOT relevant, return:
{ "isRelevant": false }

=== COMPANY EXTRACTION RULES ===
- Prefer company names found in the email body or signature.
- Prefer the sender domain if the body is ambiguous (e.g. @google.com → "Google").
- NEVER return "unknown", "company", "team", or any generic placeholder.
- If truly unresolvable, return an empty string "".

=== STATUS CLASSIFICATION ===
- "offer"     → offer, congratulations, selected, pleased to inform, happy to inform
- "interview" → interview, schedule, shortlisted, assessment, test, next round, aptitude
- "rejected"  → regret, unfortunately, not selected, unsuccessful, cannot move forward
- "applied"   → default when none of the above match

=== DATE RULES ===
- Extract the most relevant date (test date, interview date, deadline).
- Format: YYYY-MM-DD. Return "" if no date found.

Email sender: ${sender}

Email content:
${emailText}
`;

  // ── 2. Call Gemini ───────────────────────────────────────────────────────
  let llmRaw = "";
  let parsed = null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
    });

    llmRaw = (response.text || "").trim();

    // Strip markdown code fences if present
    const jsonText = llmRaw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("[LLM ERROR] Gemini call or JSON parse failed:", err.message);
    // Fall through to keyword-based fallback below
  }

  // ── 3. Post-process LLM result ───────────────────────────────────────────
  if (parsed && parsed.isRelevant === true) {
    // Normalize status
    parsed.status = normalizeStatus(parsed.status || "");

    // Sanitize company — if bad, try domain fallback
    const cleanCompany = sanitizeCompany(parsed.company || "");
    if (!cleanCompany) {
      parsed.company = companyFromSender(sender) || "";
    } else {
      parsed.company = cleanCompany;
    }

    // Trim all string fields
    parsed.role = (parsed.role || "").trim();
    parsed.type = (parsed.type || "unknown").trim().toLowerCase();
    parsed.date = (parsed.date || "").trim();
    parsed.link = (parsed.link || "").trim();

    // console.log("[FINAL PARSED]:", JSON.stringify(parsed));
    return parsed;
  }

  // ── 4. Non-LLM keyword fallback (safety net) ────────────────────────────
  // If LLM returned isRelevant: false or failed entirely, run a quick
  // keyword check. If the email looks job-related, build a minimal result.
  const lowerText = emailText.toLowerCase();
  const jobKeywords = [
    "apply", "application", "intern", "internship", "job", "role",
    "position", "interview", "offer", "selected", "hiring", "recruitment",
    "assessment", "test", "rejected", "regret",
  ];
  const looksRelevant = jobKeywords.some((kw) => lowerText.includes(kw));

  if (looksRelevant) {
    const fallbackCompany = companyFromSender(sender) || "";
    const fallbackStatus  = inferStatusFromText(emailText);

    const fallbackResult = {
      isRelevant: true,
      company: fallbackCompany,
      role: "",
      type: "unknown",
      status: fallbackStatus,
      date: "",
      link: "",
      _source: "keyword-fallback",
    };

    // console.log("[FALLBACK RESULT]:", JSON.stringify(fallbackResult));
    return fallbackResult;
  }

  // console.log("[RESULT]: Not relevant");
  return { isRelevant: false };
}

module.exports = { parseEmailWithLLM };