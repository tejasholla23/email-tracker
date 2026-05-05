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

/**
 * Keyword fallback for missing or noisy roles
 */
function keywordRoleFallback(text = "") {
  const t = text.toLowerCase();
  if (t.includes("apprentice")) return "Apprentice";
  if (t.includes("intern")) return "Intern";
  if (t.includes("software engineer") || t.includes("sde") || t.includes("developer")) return "Software Engineer";
  if (t.includes("engineer")) return "Engineer";
  if (t.includes("analyst")) return "Analyst";
  return "Unknown Role";
}

/**
 * Clean and normalize extracted role
 */
function cleanRole(rawRole = "", emailText = "") {
  let role = rawRole.trim();
  if (!role || role.toLowerCase() === "unknown role" || role.toLowerCase() === "unknown" || role.toLowerCase() === "null") {
    return keywordRoleFallback(emailText);
  }
  
  // Remove noise words
  const noiseWords = /\b(program|drive|recruitment|campus|202\d|final year|student|opportunity|opening|role)\b/gi;
  role = role.replace(noiseWords, "").trim();
  role = role.replace(/\s+/g, " ");
  
  // Normalize variants
  const lowerRole = role.toLowerCase();
  if (lowerRole.includes("sde intern") || lowerRole.includes("software dev intern")) {
    role = "Software Engineer Intern";
  } else if (lowerRole.includes("apprentice")) {
    role = "Apprentice";
  }
  
  // Trim length
  const words = role.split(" ");
  if (words.length > 6) {
    role = words.slice(0, 6).join(" ");
  }
  
  // Title case
  role = role.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  
  if (!role) {
    return keywordRoleFallback(emailText);
  }
  
  return role;
}

/**
 * Clean a single URL: strip trailing punctuation, validate scheme.
 * Returns null if invalid.
 */
function cleanUrl(raw = "") {
  const url = raw.replace(/[)>.,;"']+$/g, "").trim();
  if (!url.startsWith("http")) return null;
  return url;
}

/**
 * Extract all links from email text.
 * Returns { primary, all, isForm }
 *   primary  → best link to show (forms.gle > docs.google.com/forms > first URL)
 *   all      → every clean URL found in the text
 *   isForm   → true when primary is a Google Form
 */
function extractFormLink(text = "") {
  // 1. Collect every raw URL
  const rawAll = text.match(/https?:\/\/[^\s"'<>)]+/gi) || [];
  const all = rawAll.map(cleanUrl).filter(Boolean);

  // 2. Prioritise by type
  const formsGle   = all.find(u => /forms\.gle\//i.test(u));
  const docsForms  = all.find(u => /docs\.google\.com\/forms\//i.test(u));
  const primary    = formsGle || docsForms || all[0] || "";
  const isForm     = !!(formsGle || docsForms);

  if (primary) {
    console.log(`[LINK_EXTRACTED] primary=${primary} isForm=${isForm} total=${all.length}`);
  } else {
    console.log("[LINK_EXTRACTED] No link found");
  }

  return { primary, all, isForm };
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

=== ROLE EXTRACTION RULES ===
- Extract ONLY the core job role or title (e.g., "Software Engineer Intern", "Apprentice", "Analyst").
- Keep it short and meaningful (2-5 words max). Do NOT include full program names.
- Examples: 
  "2027 Final Year Student Apprentice Program" → "Apprentice"
  "Campus Recruitment for SDE Intern Role" → "Software Engineer Intern"
- If no clear role is found, return "Unknown Role".

=== STATUS CLASSIFICATION ===
- "offer"     → offer, congratulations, selected, pleased to inform, happy to inform
- "interview" → interview, schedule, shortlisted, assessment, test, next round, aptitude
- "rejected"  → regret, unfortunately, not selected, unsuccessful, cannot move forward
- "applied"   → default when none of the above match

=== LINK EXTRACTION RULES ===
- Look for any registration / application URL in the email.
- STRONGLY prefer links matching: https://forms.gle/... or https://docs.google.com/forms/...
- If a Google Form link is present, it MUST be returned in the "link" field.
- If no relevant link exists, return an empty string "".

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
      model: "gemini-3.1-flash-lite-preview",
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

    // Clean role and log it
    const rawRole = parsed.role || "";
    parsed.role = cleanRole(rawRole, emailText);
    if (rawRole !== parsed.role) {
      console.log(`[ROLE_CLEANUP] Raw: "${rawRole}" → Clean: "${parsed.role}"`);
    }

    parsed.type = (parsed.type || "unknown").trim().toLowerCase();
    parsed.date = (parsed.date || "").trim();

    // Always run regex extraction — deterministic & beats the LLM for links
    const linkResult = extractFormLink(emailText);
    parsed.link  = linkResult.primary || (parsed.link || "").trim();
    parsed.links = linkResult.all;
    parsed.isFormLink = linkResult.isForm;

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
    "assessment", "test", "rejected", "regret", "register", "registration",
    "placement", "shortlist", "shortlisted", "congratulations", "apprentice",
  ];
  const looksRelevant = jobKeywords.some((kw) => lowerText.includes(kw));

  if (looksRelevant) {
    const fallbackCompany = companyFromSender(sender) || "";
    const fallbackStatus  = inferStatusFromText(emailText);
    const { primary, all, isForm } = extractFormLink(emailText);

    const fallbackResult = {
      isRelevant: true,
      company: fallbackCompany,
      role: keywordRoleFallback(emailText),
      type: "unknown",
      status: fallbackStatus,
      date: "",
      link: primary,
      links: all,
      isFormLink: isForm,
      _source: "keyword-fallback",
    };

    // console.log("[FALLBACK RESULT]:", JSON.stringify(fallbackResult));
    return fallbackResult;
  }

  // console.log("[RESULT]: Not relevant");
  return { isRelevant: false };
}

module.exports = { parseEmailWithLLM };