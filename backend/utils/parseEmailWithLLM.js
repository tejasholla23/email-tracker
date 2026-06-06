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
    "msrit", "placement", "dean", "career", "careers"
  ];
  if (genericDomains.includes(domainName)) return null;

  return domainName.charAt(0).toUpperCase() + domainName.slice(1);
}

function isGenericCompanyName(raw = "") {
  const trimmed = raw.trim().toLowerCase();
  const invalidNames = [
    "msrit", "msrit placement cell", "msrit placements", "msrit career cell",
    "our college", "the college", "placement cell", "training and placement" , "placement" , "career cell"
  ];
  return invalidNames.includes(trimmed);
}

function extractCompanyFromText(text = "") {
  if (!text) return "";
  const cleanedText = cleanMarkdown(text).replace(/\r?\n/g, " ");

  const patterns = [
    /(?:Company|Organization|Organisation|Employer|Hiring Company|Recruiter)\s*[:\-]\s*([A-Z][A-Za-z0-9&.\s]{1,80}?)(?:\s*(?:\.|,|;|$))/i,
    /(?:from|by|at)\s+([A-Z][A-Za-z0-9&.\s]{1,60}?)(?=\s+(?:for|about|regarding|hiring|is|offers?|invites?|interview|role|drive|program|placement|campus|job|internship))/i,
    /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\b(?=\s+(?:is|has|offers|invites|announces|conducts|hiring|drives|for|regarding|registered))/,
    /\b(amazon|google|microsoft|tcs|deloitte|accenture|cognizant|infosys|wipro|blackrock|ibm|flipkart|uber|intel|capgemini|hcl|l&t|bosch|dell)\b/i
  ];

  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      const candidate = sanitizeCompany(match[1]);
      if (candidate && !isGenericCompanyName(candidate)) {
        return candidate;
      }
    }
  }

  return "";
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
 * Remove markdown formatting (bold, italics, etc.) from text.
 * Converts **text** → text, *text* → text, etc.
 */
function cleanMarkdown(text = "") {
  return text
    .replace(/\*\*([^\*]+)\*\*/g, "$1") // **text** → text
    .replace(/\*([^\*]+)\*/g, "$1")     // *text* → text
    .replace(/__([^_]+)__/g, "$1")        // __text__ → text
    .replace(/_([^_]+)_/g, "$1");         // _text_ → text
}

function cleanProgramValue(raw = "") {
  let value = raw.trim();
  // Remove markdown formatting first
  value = cleanMarkdown(value);
  // Remove leading/trailing symbols: asterisks, bullets, dashes, dots, and spaces
  // Includes various unicode bullets and asterisks
  const symbolRegex = /^[\*\u2022\u2023\u25E6\u2043\u2219\-\.\s\:]+/;
  const trailingSymbolRegex = /[\*\u2022\u2023\u25E6\u2043\u2219\-\.\s\:]+$/;
  
  value = value.replace(symbolRegex, "").trim();
  value = value.replace(trailingSymbolRegex, "").trim();
  
  // Collapse multiple spaces
  value = value.replace(/\s{2,}/g, " ");
  
  // Check if the value is just "Details" or noise
  const lowerValue = value.toLowerCase();
  if (!value || lowerValue === "details" || lowerValue === "n/a" || lowerValue === "none" || /^[^a-zA-Z0-9]+$/.test(value)) {
    return "";
  }
  
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

function isGoogleFormLink(text = "") {
  return /(?:https?:\/\/)?(?:docs\.google\.com\/forms\/|forms\.gle\/)/i.test(text);
}

function isInterviewEmail(text = "") {
  const t = text.toLowerCase();
  return /\b(interview|shortlisted|shortlist|schedule|slot|assessment|online test|next round|aptitude|technical round|hr round|panel interview|coding test|telephonic interview)\b/.test(t);
}

function looksLikeSeminarOrTraining(text = "") {
  const t = text.toLowerCase();
  return /\b(seminar|webinar|training|workshop|pre-placement talk|preplacement talk|info session|information session|orientation|meetup|guest lecture|career talk|placement talk|training program|faculty development program)\b/.test(t);
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
  // Clean markdown first
  const cleanedText = cleanMarkdown(text);
  
  const patterns = [
    /(?:Roles|Positions|Openings)\s*[:\-]\s*([^\r\n]+?)(?:\s+(?:Branches|Department|CGPA|CTC|Package))/i,
    /(?:Roles|Positions|Openings)\s*[:\-]\s*([^\r\n.!]+)/i,
    /(?:Role|Position|Opening)\s*-\s*([^\r\n.!]+)/i,
    /Job\s+Designation\s*[:\-]\s*([^\r\n.!]+)/i,
    /(?:hiring|internship|apprentice)\s+(?:role|program|opening)s?\s*[:\-]\s*([^\r\n.!]+)/i,
  ];

  // Headers/noise to skip
  const headerSkip = ["details", "benefits", "criteria", "eligibility", "requirements", "description", "overview"];

  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      const extracted = cleanProgramValue(match[1]);
      const lowerExtracted = extracted.toLowerCase();
      if (extracted && extracted.length < 150 && !headerSkip.includes(lowerExtracted)) {
        return extracted;
      }
    }
  }

  // Fallback: if email mentions internship but no role found, return "Internship"
  if (/\binternship\b/i.test(cleanedText) || /\bintern\b/i.test(cleanedText)) {
    return "Internship";
  }

  if (/\bapprentice\b/i.test(cleanedText)) {
    return "Apprentice";
  }

  return "";
}

function extractProgramDuration(text = "") {
  // Clean markdown first
  const cleanedText = cleanMarkdown(text);
  
  const patterns = [
    /Duration\s*[:\-]\s*([^\r\n.!,]+?)(?:\s+(?:Student|Student Benefits|Interns|Intern|Benefits|days|day))/i,
    /Duration\s*[:\-]\s*([^\r\n.!,]+)/i,
    /for\s+([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))(?:\s|$)/i,
    /([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))\s*(?:long|duration|period)(?:\s|$)/i,
    /(?:internship|apprentice|training)\s+program[^\r\n]*duration\s*[:\-]?\s*([^\r\n.!,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      const extracted = cleanProgramValue(match[1]);
      if (extracted && /\d+/.test(extracted)) {
        return extracted;
      }
    }
  }

  const minDurationMatch = cleanedText.match(/minimum of\s*([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))/i);
  if (minDurationMatch && minDurationMatch[1]) {
    return cleanProgramValue(minDurationMatch[1]);
  }

  return "";
}

function extractProgramStipend(text = "") {
  // Clean markdown first
  const cleanedText = cleanMarkdown(text);
  
  // Keywords indicating free/unpaid internship
  const unpaidKeywords = /\b(?:free|unpaid|no\s+stipend|nil|none|n\/a|zero|without\s+stipend|no\s+remuneration)\b/i;
  if (unpaidKeywords.test(cleanedText)) {
    return "";
  }

  const patterns = [
    // Explicit stipend label with value on same line
    /Stipend\s*[:\-]?\s*([₹₹$€]?\s*[0-9,]+[0-9]\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /Internship\s+stipend\s*[:\-]?\s*([₹₹$€]?\s*[0-9,]+[0-9]\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    // CTC or Package
    /(?:CTC|Package)\s*[:\-]?\s*([^\r\n]+)/i,
    // Bullet-formatted stipends for different levels (B.Tech, M.Tech, etc)
    /[-•]\s*(?:B\.Tech|B\.E|M\.Tech|M\.E|MCA|B\.Tech\/MCA)\s*[:\-]?\s*(₹?\s*[0-9,]+\s*(?:per\s+month|pm|LPA|lakhs|K|pa)?)/i,
    // Standalone currency + amount pattern
    /(?:₹|Rs\.?|INR)\s*[0-9,]+(?:\s*(?:LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
    /[0-9]+(?:,\d{3})?(?:\.\d+)?\s*(?:LPA|lakhs|K|k)(?:\s*(?:per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match) {
      const value = match[1] ? match[1].trim() : match[0].trim();
      const cleaned = cleanProgramValue(value);
      // Skip if just a bare number without currency/unit
      const numericOnly = /^[0-9]+(?:\.[0-9]+)?$/;
      const hasCurrencyOrUnit = /\b(?:₹|Rs\.?|INR|LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr)\b/i.test(cleaned);
      if (numericOnly.test(cleaned) && !hasCurrencyOrUnit) {
        continue;
      }
      if (cleaned && cleaned.length > 1) {
        return cleaned;
      }
    }
  }

  return "";
}

function extractDeadlineText(text = "") {
  // Clean markdown first
  const cleanedText = cleanMarkdown(text);
  
  const patterns = [
    /(?:register|apply|submit|last date|deadline).*?\b(?:on or before|before|by|is)\b\s*([^\r\n.]+)/i,
    /(?:last date|deadline|register|apply)\s*[:\-]\s*([^\r\n.]+)/i,
    /\b(?:apply|submit)\s*(?:by|before)\s*([^\r\n.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
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
  // Clean markdown formatting once at the start
  const cleanedText = cleanMarkdown(text);
  return {
    programRoles: extractProgramRoles(cleanedText),
    programDuration: extractProgramDuration(cleanedText),
    programStipend: extractProgramStipend(cleanedText),
    deadlineText: extractDeadlineText(cleanedText),
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
- If the sender is @msrit.edu or another placement/college email, DO NOT return MSRIT or the college as the employer.
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        abortSignal: controller.signal
      }
    });

    clearTimeout(timeoutId);
    llmRaw = (response.text || "").trim();

    // Strip markdown code fences if present
    const jsonText = llmRaw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    parsed = JSON.parse(jsonText);
  } catch (err) {
    clearTimeout(timeoutId);
    let errorToLog = err;
    if (err.name === "AbortError" || controller.signal.aborted) {
      errorToLog = new Error("Gemini email parse request timed out");
      errorToLog.code = "ETIMEOUT";
    }
    console.error("[LLM ERROR] Gemini call or JSON parse failed:", errorToLog.message);
    // Fall through to keyword-based fallback below
  }

  // ── 3. Post-process LLM result ───────────────────────────────────────────
  if (parsed && parsed.isRelevant === true) {
    // Normalize status
    parsed.status = normalizeStatus(parsed.status || "");

    const sourceText = fullBodyText || emailText;
    const linkResult = extractFormLink(sourceText);
    const hasGoogleForm = isGoogleFormLink(sourceText) || linkResult.isForm;
    const parsedInterview = parsed.status === "interview" || isInterviewEmail(sourceText);
    const isSeminar = looksLikeSeminarOrTraining(sourceText);

    // Reject non-actionable emails unless they include a Google Form or are interview-related.
    if ((!hasGoogleForm && !parsedInterview) || (isSeminar && !hasGoogleForm && !parsedInterview)) {
      return { isRelevant: false };
    }

    // Sanitize company — if bad, try domain fallback
    const cleanCompany = sanitizeCompany(parsed.company || "");
    if (!cleanCompany || isGenericCompanyName(cleanCompany)) {
      parsed.company = extractCompanyFromText(sourceText) || companyFromSender(sender) || "";
    } else {
      parsed.company = cleanCompany;
    }

    if (isGenericCompanyName(parsed.company)) {
      parsed.company = extractCompanyFromText(sourceText) || "";
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
    let fallbackCompany = companyFromSender(sender) || "";
    if (!fallbackCompany || isGenericCompanyName(fallbackCompany)) {
      fallbackCompany = extractCompanyFromText(fullBodyText || emailText) || "";
    }
    const fallbackStatus  = inferStatusFromText(emailText);
    const linkTextSource = fullBodyText || emailText;
    const { primary, all, isForm } = extractFormLink(linkTextSource);
    const hasGoogleForm = isGoogleFormLink(linkTextSource) || isForm;
    const isInterview = fallbackStatus === "interview" || isInterviewEmail(linkTextSource);

    if (!hasGoogleForm && !isInterview) {
      return { isRelevant: false };
    }

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