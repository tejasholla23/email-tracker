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

function cleanProgramValue(raw = "") {
  let value = raw.trim();
  // Remove leading/trailing asterisks, bullets, dashes, and spaces
  value = value.replace(/^[\*\u2022\-\s]+/, "").trim();
  value = value.replace(/[\*\u2022\-\s]+$/, "").trim();
  // Collapse multiple spaces
  value = value.replace(/\s{2,}/g, " ");
  // Remove standalone "Details*" or "Details"
  value = value.replace(/^\s*Details\*?\s*$/i, "").trim();
  // Remove year-only values
  if (/^\d{4}$/.test(value)) {
    return "";
  }
  return value;
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

/**
 * Extract deadline from text using regex patterns.
 * Returns { deadline: string, iso: string }
 */
function extractDeadline(text = "") {
  if (!text) return { deadline: "", iso: "" };

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const currentYear = now.getFullYear();

  // Normalize spaces
  const cleanText = text.replace(/\s+/g, " ");
  
  // Split into chunks by punctuation or newlines
  const segments = cleanText.split(/[.!?]|\r?\n/);
  const deadlineKeywords = /deadline|apply|register|before|last date|by|on or before/i;

  for (const segment of segments) {
    if (deadlineKeywords.test(segment)) {

      // 1. Today/Tomorrow + Time
      const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(pm|am)/i;
      const todayMatch = segment.match(new RegExp(`today(?:\\s+at|\\s+before|\\s+by)?\\s+${timeRegex.source}`, "i")) || 
                         segment.match(new RegExp(`${timeRegex.source}\\s+today`, "i"));
      
      if (todayMatch) {
        const hour = parseInt(todayMatch[1]);
        const min = todayMatch[2] || "00";
        const ampm = todayMatch[3].toUpperCase();
        
        const day = now.getDate();
        const monthStr = months[now.getMonth()];
        const readable = `${day} ${monthStr}, ${hour}${min !== "00" ? ":" + min : ""} ${ampm}`;
        
        const isoDate = new Date(now);
        let h = hour;
        if (ampm === "PM" && h < 12) h += 12;
        if (ampm === "AM" && h === 12) h = 0;
        isoDate.setHours(h, parseInt(min), 0, 0);
        
        return { deadline: readable, iso: isoDate.toISOString() };
      }

      // 2. Date Alpha
      const dateAlphaMatch = segment.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i);
      if (dateAlphaMatch) {
        const day = dateAlphaMatch[1];
        const monthStr = dateAlphaMatch[2].charAt(0).toUpperCase() + dateAlphaMatch[2].slice(1, 3).toLowerCase();
        
        const yearMatch = segment.match(/\b(202[4-9]|2030)\b/);
        const year = yearMatch ? yearMatch[1] : currentYear;
        
        const readable = `${day} ${monthStr}${year != currentYear ? " " + year : ""}`;
        const monthIdx = months.indexOf(monthStr);
        if (monthIdx !== -1) {
          const isoDate = new Date(year, monthIdx, parseInt(day));
          return { deadline: readable, iso: isoDate.toISOString() };
        }
      }

      // 3. Date Numeric
      const dateNumericMatch = segment.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
      if (dateNumericMatch) {
        const day = parseInt(dateNumericMatch[1]);
        const month = parseInt(dateNumericMatch[2]);
        let year = dateNumericMatch[3] ? parseInt(dateNumericMatch[3]) : currentYear;
        if (year < 100) year += 2000;

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const monthStr = months[month - 1];
          const readable = `${day} ${monthStr}${year != currentYear ? " " + year : ""}`;
          const isoDate = new Date(year, month - 1, day);
          return { deadline: readable, iso: isoDate.toISOString() };
        }
      }
    }
  }

  return { deadline: "", iso: "" };
}

function extractProgramRoles(text = "") {
  const patterns = [
    /(?:Roles|Positions|Openings)\s*[:\-]\s*([^\r\n]+?)(?:\s+(?:Branches|Department|Branches|CGPA|CTC|Package))/i,
    /(?:Roles|Positions|Openings)\s*[:\-]\s*([^\r\n.!]+)/i,
    /(?:Role|Position|Opening)\s*-\s*([^\r\n.!]+)/i,
    /Job\s+Designation\s*[:\-]\s*([^\r\n.!]+)/i,
    /(?:hiring|internship|apprentice)\s+(?:role|program|opening)s?\s*[:\-]\s*([^\r\n.!]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extracted = cleanProgramValue(match[1]);
      if (extracted && extracted.length < 150 && extracted.toLowerCase() !== "details") {
        return extracted;
      }
    }
  }

  if (/\bapprentice\b/i.test(text)) {
    return "Apprentice";
  }

  if (/\binternship\b/i.test(text) || /\bintern\b/i.test(text)) {
    return "Internship";
  }

  return "";
}

function extractProgramDuration(text = "") {
  const patterns = [
    /Duration\s*[:\-]\s*([^\r\n.!,]+?)(?:\s+(?:Student|Student Benefits|Interns|Intern|Benefits|days|day))/i,
    /Duration\s*[:\-]\s*([^\r\n.!,]+)/i,
    /for\s+([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))(?:\s|$)/i,
    /([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))\s*(?:long|duration|period)(?:\s|$)/i,
    /(?:internship|apprentice|training)\s+program[^\r\n]*duration\s*[:\-]?\s*([^\r\n.!,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extracted = cleanProgramValue(match[1]);
      if (extracted && /\d+/.test(extracted)) {
        return extracted;
      }
    }
  }

  const minDurationMatch = text.match(/minimum of\s*([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))/i);
  if (minDurationMatch && minDurationMatch[1]) {
    return cleanProgramValue(minDurationMatch[1]);
  }

  return "";
}

function extractProgramStipend(text = "") {
  const patterns = [
    /Stipend\s*[:\-]?\s*([^\r\n]+)/i,
    /(?:CTC|Package)\s*[:\-]?\s*([^\r\n]+)/i,
    /(?:₹|Rs\.?|INR)\s*[0-9,]+(?:\s*(?:LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
    /[0-9]+(?:,\d{3})?(?:\.[0-9]+)?\s*(?:LPA|lakhs|K|k)(?:\s*(?:per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1] ? match[1].trim() : match[0].trim();
      const cleaned = cleanProgramValue(value);
      const numericOnly = /^[0-9]+(?:\.[0-9]+)?$/;
      const hasCurrencyOrUnit = /\b(?:₹|Rs\.?|INR|LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr)\b/i.test(match[0]);
      if (numericOnly.test(cleaned) && !hasCurrencyOrUnit) {
        continue;
      }
      return cleaned;
    }
  }

  return "";
}

function extractDeadlineText(text = "") {
  const patterns = [
    /(?:register|apply|submit|last date|deadline).*?\b(?:on or before|before|by|is)\b\s*([^\r\n.]+)/i,
    /(?:last date|deadline|register|apply)\s*[:\-]\s*([^\r\n.]+)/i,
    /\b(?:apply|submit)\s*(?:by|before)\s*([^\r\n.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let deadline = match[1].trim();
      if (!/^before|^by|^deadline/i.test(deadline)) {
        deadline = `Before ${deadline}`;
      }
      return deadline;
    }
  }

  return "";
}

function enrichProgramDetails(text = "") {
  return {
    programRoles: extractProgramRoles(text),
    programDuration: extractProgramDuration(text),
    programStipend: extractProgramStipend(text),
    deadlineText: extractDeadlineText(text),
  };
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────

/**
 * Parse a raw email text (subject + snippet) via Gemini LLM.
 *
 * @param {string} emailText      - Combined subject + body snippet (for LLM)
 * @param {string} [sender]       - Raw "From" header value
 * @param {string} [fullBodyText] - Full email body (for link extraction)
 * @returns {object}              - Parsed application data
 */
async function parseEmailWithLLM(emailText, sender = "", fullBodyText = "") {
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
    const linkTextSource = fullBodyText || emailText;
    const linkResult = extractFormLink(linkTextSource);
    parsed.link  = linkResult.primary || (parsed.link || "").trim();
    parsed.links = linkResult.all;
    parsed.isFormLink = linkResult.isForm;

    if (parsed.link) {
      console.log(`[LINK_SOURCE] ${fullBodyText ? "fullBody" : "snippet"}`);
    }

    // Extact deadline using regex
    const deadlineResult = extractDeadline(fullBodyText || emailText);
    parsed.deadline = deadlineResult.deadline;
    parsed.deadlineISO = deadlineResult.iso;

    const programDetails = enrichProgramDetails(fullBodyText || emailText);
    parsed.programRoles = programDetails.programRoles;
    parsed.programDuration = programDetails.programDuration;
    parsed.programStipend = programDetails.programStipend;
    parsed.deadlineText = programDetails.deadlineText;

    if (parsed.deadline) {
      console.log(`[DEADLINE_EXTRACTED] "${parsed.deadline}"`);
      console.log(`[DEADLINE_SOURCE] regex`);
    }
    if (parsed.deadlineText) {
      console.log(`[DEADLINE_TEXT_EXTRACTED] "${parsed.deadlineText}"`);
    }

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
    "deadline", "last date", "before", "by"
  ];
  const looksRelevant = jobKeywords.some((kw) => lowerText.includes(kw));

  if (looksRelevant) {
    const fallbackCompany = companyFromSender(sender) || "";
    const fallbackStatus  = inferStatusFromText(emailText);
    const linkTextSource = fullBodyText || emailText;
    const { primary, all, isForm } = extractFormLink(linkTextSource);

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

    const deadlineResult = extractDeadline(fullBodyText || emailText);
    fallbackResult.deadline = deadlineResult.deadline;
    fallbackResult.deadlineISO = deadlineResult.iso;

    const programDetails = enrichProgramDetails(fullBodyText || emailText);
    fallbackResult.programRoles = programDetails.programRoles;
    fallbackResult.programDuration = programDetails.programDuration;
    fallbackResult.programStipend = programDetails.programStipend;
    fallbackResult.deadlineText = programDetails.deadlineText;

    if (primary) {
      console.log(`[LINK_SOURCE] ${fullBodyText ? "fullBody" : "snippet"} (fallback)`);
    }

    if (fallbackResult.deadline) {
      console.log(`[DEADLINE_EXTRACTED] "${fallbackResult.deadline}" (fallback)`);
      console.log(`[DEADLINE_SOURCE] regex`);
    }

    // console.log("[FALLBACK RESULT]:", JSON.stringify(fallbackResult));
    return fallbackResult;
  }

  // console.log("[RESULT]: Not relevant");
  return { isRelevant: false };
}

module.exports = { parseEmailWithLLM };