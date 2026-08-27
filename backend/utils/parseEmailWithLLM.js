const { OpenAI } = require("openai");
const he = require("he");
const config = require("../config/appConfig");

const nvidiaClient = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || "dummy_key",
  baseURL: "https://integrate.api.nvidia.com/v1",
  timeout: 25000, // 25s timeout for fast bounded failure
  maxRetries: 1,  // Prevent excessive retries
});

const PRIMARY_MODEL = config.NVIDIA_PRIMARY_MODEL || "google/gemma-4-31b-it";
const FALLBACK_MODEL = config.NVIDIA_FALLBACK_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";

// ---------------------------------------------------------------------------
// In-flight Single-Flight Promise Coalescing Map
// ---------------------------------------------------------------------------
const inFlightParses = new Map();

async function parseEmailWithSingleFlight(cacheKey, parseFn) {
  if (!cacheKey) {
    return await parseFn();
  }
  if (inFlightParses.has(cacheKey)) {
    console.log(`[PARSE_INFLIGHT_JOIN] Awaiting in-flight parse for Message-ID: ${cacheKey}`);
    const shared = await inFlightParses.get(cacheKey);
    return shared ? JSON.parse(JSON.stringify(shared)) : null;
  }

  console.log(`[PARSE_INFLIGHT_START] Started single-flight parse for Message-ID: ${cacheKey}`);
  const promise = (async () => {
    return await parseFn();
  })();

  inFlightParses.set(cacheKey, promise);
  try {
    const result = await promise;
    console.log(`[PARSE_INFLIGHT_COMPLETE] Completed single-flight parse for Message-ID: ${cacheKey}`);
    return result ? JSON.parse(JSON.stringify(result)) : null;
  } catch (err) {
    console.error(`[PARSE_INFLIGHT_ERROR] Single-flight parse failed for Message-ID: ${cacheKey}:`, err.message);
    throw err;
  } finally {
    inFlightParses.delete(cacheKey);
  }
}

// ---------------------------------------------------------------------------
// Time validation helper
// ---------------------------------------------------------------------------
function isValidTimeString(val) {
  if (!val || typeof val !== "string") return false;
  const str = val.trim();
  if (str.length < 2 || str.length > 50) return false;
  // Reject compensation, salary, currency, or non-time keywords
  if (/₹|\b(?:lpa|ctc|stipend|salary|package|per\s+(?:month|annum|year|hr|hour)|rupees|rs\.?|inr|bonus|shares|equity|k|per)\b/i.test(str)) {
    return false;
  }
  // Must match standard time expressions: 10:00 AM, 10 AM, 2 PM, 14:30, 2:30 PM - 4:00 PM, etc.
  return /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/i.test(str);
}

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

function normalizeText(raw = "") {
  return (raw || "")
    .toString()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Deadline resolution: human-readable deadline text → ISO 8601 string
// Handles relative ("today", "tomorrow") and absolute ("25th June, 2026") dates.
// ---------------------------------------------------------------------------

function resolveDeadlineISO(deadlineText, referenceDate = new Date()) {
  if (!deadlineText || typeof deadlineText !== "string") return "";

  const text = deadlineText.trim();
  if (!text) return "";

  const createDateInIST = (year, month, day, hours, minutes) => {
    const pad = (num) => String(num).padStart(2, '0');
    const isoString = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00+05:30`;
    return new Date(isoString);
  };

  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  let hours = 23, minutes = 59;
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3].toLowerCase();
    if (meridian === "pm" && hours !== 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
  }

  const lower = text.toLowerCase();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(referenceDate);
  const getPartVal = (type) => parseInt(parts.find(p => p.type === type).value, 10);

  const refYear = getPartVal("year");
  const refMonth = getPartVal("month");
  const refDay = getPartVal("day");

  if (/\b(?:today|tonight|eod|cob|end of (?:the )?day|end of today|close of (?:business|day))\b/i.test(lower)) {
    if (/\btomorrow\b/i.test(lower)) {
      const dRef = new Date(referenceDate);
      dRef.setDate(dRef.getDate() + 1);

      const partsTom = formatter.formatToParts(dRef);
      const getTomVal = (type) => parseInt(partsTom.find(p => p.type === type).value, 10);
      const tomYear = getTomVal("year");
      const tomMonth = getTomVal("month");
      const tomDay = getTomVal("day");

      const d = createDateInIST(tomYear, tomMonth, tomDay, hours, minutes);
      return d.toISOString();
    }
    const d = createDateInIST(refYear, refMonth, refDay, hours, minutes);
    return d.toISOString();
  }
  if (/\btomorrow\b/i.test(lower)) {
    const dRef = new Date(referenceDate);
    dRef.setDate(dRef.getDate() + 1);

    const partsTom = formatter.formatToParts(dRef);
    const getTomVal = (type) => parseInt(partsTom.find(p => p.type === type).value, 10);
    const tomYear = getTomVal("year");
    const tomMonth = getTomVal("month");
    const tomDay = getTomVal("day");

    const d = createDateInIST(tomYear, tomMonth, tomDay, hours, minutes);
    return d.toISOString();
  }

  const cleaned = text.replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");

  // ── DD-MM-YYYY / DD/MM/YYYY (Indian date format) ─────────────────────────
  // Must be checked BEFORE new Date() which assumes US MM-DD-YYYY for hyphenated dates.
  const ddmmyyyyMatch = cleaned.match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/);
  if (ddmmyyyyMatch) {
    const part1 = parseInt(ddmmyyyyMatch[1], 10);
    const part2 = parseInt(ddmmyyyyMatch[2], 10);
    const year  = parseInt(ddmmyyyyMatch[3], 10);
    let day, month;
    if (part1 > 12) {
      // Unambiguous: first part must be day (e.g. 25-07-2026)
      day = part1; month = part2;
    } else if (part2 > 12) {
      // Unambiguous: second part must be day (e.g. 07-25-2026)
      day = part2; month = part1;
    } else {
      // Ambiguous (e.g. 05-07-2026): default to DD-MM-YYYY (Indian convention)
      day = part1; month = part2;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const finalDate = createDateInIST(year, month, day, hours, minutes);
      return finalDate.toISOString();
    }
  }

  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    let y = parsed.getFullYear();
    let m = parsed.getMonth() + 1;
    let d = parsed.getDate();

    if (cleaned.includes("-")) {
      y = parsed.getUTCFullYear();
      m = parsed.getUTCMonth() + 1;
      d = parsed.getUTCDate();
    }
    const finalDate = createDateInIST(y, m, d, hours, minutes);
    return finalDate.toISOString();
  }

  const datePattern = /(?:(\d{1,2})\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)[,\s]+(\d{4})|(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})[,\s]+(\d{4}))/i;
  const dateMatch = cleaned.match(datePattern);
  if (dateMatch) {
    let dateStr;
    if (dateMatch[1]) {
      dateStr = `${dateMatch[2]} ${dateMatch[1]}, ${dateMatch[3]}`;
    } else {
      dateStr = `${dateMatch[4]} ${dateMatch[5]}, ${dateMatch[6]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const finalDate = createDateInIST(d.getFullYear(), d.getMonth() + 1, d.getDate(), hours, minutes);
      return finalDate.toISOString();
    }
  }

  return "";
}

function resolveEventDateISO(dateText, timeText, referenceDate = new Date()) {
  if (!dateText || typeof dateText !== "string") return null;

  let dateToParse = dateText.trim();
  if (/\s+(?:to|-|–|until)\s+/i.test(dateToParse)) {
    const parts = dateToParse.split(/\s+(?:to|-|–|until)\s+/i);
    if (parts[0]) dateToParse = parts[0].trim();
  }

  const parsedDate = parseDateString(dateToParse, referenceDate);
  if (!parsedDate) return null;

  let hours = 12, minutes = 0;
  if (timeText && typeof timeText === "string") {
    const timeMatch = timeText.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridian = timeMatch[3].toLowerCase();
      if (meridian === "pm" && hours !== 12) hours += 12;
      if (meridian === "am" && hours === 12) hours = 0;
    }
  }

  const pad = (num) => String(num).padStart(2, '0');
  const isoString = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}T${pad(hours)}:${pad(minutes)}:00+05:30`;
  const result = new Date(isoString);
  return isNaN(result.getTime()) ? null : result;
}

// ---------------------------------------------------------------------------
// Derive legacy flat fields from displayFields (single source of truth).
// This ensures role, salaryText, deadlineText, etc. always mirror displayFields.
// ---------------------------------------------------------------------------

function deriveFromDisplayFields(displayFields = []) {
  const get = (...labels) => {
    // 1. Try exact or optional plural match: e.g. "Event Date" or "Event Dates"
    for (const label of labels) {
      const fExact = displayFields.find(f =>
        f?.label && new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?$`, 'i').test(f.label)
      );
      if (fExact?.value) return fExact.value;
    }
    // 2. Fallback to whole-word boundary label match (excluding "full-time" / "part-time" for Time)
    for (const label of labels) {
      const isTimeQuery = /^time$/i.test(label);
      const fSub = displayFields.find(f => {
        if (!f?.label) return false;
        if (isTimeQuery && /\b(?:full-time|part-time|full\s+time|part\s+time|lifetime)\b/i.test(f.label)) {
          return false;
        }
        const labelRegex = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return labelRegex.test(f.label);
      });
      if (fSub?.value) return fSub.value;
    }
    return "";
  };

  const rawTime = get("Time", "Event Time", "Reporting Time", "Schedule Time", "PPT Time");
  const validTime = isValidTimeString(rawTime) ? rawTime : "";

  return {
    role:            get("Role", "Roles", "Position", "Designation") || "Unknown Role",
    salaryText:      get("CTC", "Salary", "Compensation", "Package"),
    programStipend:  get("Stipend"),
    programDuration: get("Duration"),
    venue:           get("Location", "Venue"),
    deadlineText:    get("Deadline", "Last Date", "Due Date", "Closing Date"),
    programRoles:    get("Role", "Roles"),
    eventDateText:   get("Event Date", "Event Dates", "Dates", "Date", "Interview Date", "Presentation Date", "PPT Date", "Talk Date"),
    eventTime:       validTime,
  };
}

/**
 * Priority ordering maps for display fields by opportunity type.
 * Used ONLY when more than 5 valid fields are returned (to select top 5).
 */
const FIELD_PRIORITY = {
  JOB_APPLICATION: ["role", "deadline", "last date", "due date", "closing date", "ctc", "stipend", "duration", "location", "joining", "registration link"],
  HACKATHON: ["registration deadline", "deadline", "last date", "due date", "closing date", "prize", "prize pool", "team size", "mode", "organizer", "timeline", "registration link"],
  WEBINAR: ["event title", "title", "speaker/company", "speaker", "organizer", "date", "event dates", "dates", "time", "topic", "session topics", "registration link", "certificate"],
  OTHER_PLACEMENT_EVENT: ["event title", "title", "date", "event dates", "dates", "time", "organizer", "mode", "registration link"],
};

/**
 * Patterns that indicate a field label boundary inside a value string.
 * Used to detect when Gemini has merged two fields together.
 */
const FIELD_LABEL_PATTERNS = /\b(?:Stipend|CTC|Duration|Location|Deadline|Role|Joining|Venue|Date|Time|Mode|Prize|Team Size|Speaker|Topic|Organizer|Registration Deadline|Type|Salary|Package|Compensation)\s*:/i;

/**
 * Descriptive parenthetical content that should be stripped from field values.
 * Only removes clearly noise-like descriptions, NOT value-carrying parens.
 */
const NOISE_PARENS = [
  /\s*\(subject to (?:taxes|tax|TDS)\)/gi,
  /\s*\(approx\.?\)/gi,
  /\s*\(negotiable\)/gi,
  /\s*\(per month\)/gi,
  /\s*\(currently preferring [^)]+\)/gi,
];

/**
 * Phrases that should never appear in a display field value.
 * When detected, we truncate the value at the start of the phrase.
 */
const VALUE_NOISE_PHRASES = [
  "this internship", "selected candidates", "students can", "students should",
  "click here", "view details", "register using", "register at",
  "please register", "kindly register", "please note", "kindly note",
  "for more details", "for further details", "for more information",
  "upon successful completion", "we primarily seek", "we are looking",
  "find out more", "learn more", "see attached", "refer to",
];

/**
 * Helper to clean a single display field value.
 * Returns the cleaned string.
 */
function cleanDisplayFieldValue(label, value) {
  let val = (value || "").trim();
  
  // 1. Merged field boundary detection: If another label starts inside the value, truncate before it
  const labelMatch = val.match(FIELD_LABEL_PATTERNS);
  if (labelMatch) {
    val = val.substring(0, labelMatch.index).trim();
  }

  // 2. Truncate at VALUE_NOISE_PHRASES
  for (const phrase of VALUE_NOISE_PHRASES) {
    const idx = val.toLowerCase().indexOf(phrase);
    if (idx >= 0) {
      val = val.substring(0, idx).trim();
    }
  }

  // 3. Remove NOISE_PARENS
  for (const pattern of NOISE_PARENS) {
    val = val.replace(pattern, "");
  }

  // Strip leading/trailing spaces and punctuation
  val = val.replace(/^[-:;.,*•\s]+|[-:;.,*•\s]+$/g, "").trim();

  return val;
}

/**
 * Helper to validate a display field.
 * Returns { valid: boolean, value: string }
 */
function validateDisplayField(label, value) {
  const val = cleanDisplayFieldValue(label, value);
  const valLower = val.toLowerCase();
  
  if (val.length < 3) return { valid: false }; // Too short
  if (/^(?:details|n\/a|none|nil|na|tbd|tba|null|undefined)$/i.test(valLower)) return { valid: false }; // Garbage
  if (valLower.includes("will be") || valLower.includes("is as follows")) return { valid: false }; // Partial run-on
  
  return { valid: true, value: val };
}

/**
 * Merge HTML and Plain Text bodies, preferring HTML, but preserving unique plain text info.
 */
function mergeAlternativeTexts(htmlText, plainText) {
  if (!htmlText) return plainText || "";
  if (!plainText) return htmlText || "";

  const plainLines = plainText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const htmlLower = htmlText.toLowerCase();
  const uniquePlainLines = [];

  for (const line of plainLines) {
    if (line.length < 5) continue; // Skip short boilerplate lines
    const lineLower = line.toLowerCase();
    
    // Check if this line is missing from the HTML version
    if (!htmlLower.includes(lineLower)) {
      uniquePlainLines.push(line);
    }
  }

  if (uniquePlainLines.length > 0) {
    return htmlText + "\n\n--- Unique Plain Text Content ---\n" + uniquePlainLines.join("\n");
  }

  return htmlText;
}

function preprocessBody(rawText = "") {
  let text = rawText || "";
  const decisions = [];
  const originalLength = text.length;

  // 1. Detect and clean HTML tags if any raw HTML somehow passed through
  const hasHtmlTags = /<[a-z/][^>]*>/i.test(text);
  if (hasHtmlTags) {
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<!--[\s\S]*?-->/g, "");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/(p|div|tr|li|h[1-6]|thead|tbody|tfoot)>/gi, "\n");
    text = text.replace(/<(p|div|tr|li|h[1-6]|thead|tbody|tfoot)[^>]*>/gi, "\n");
    text = text.replace(/<(?!.*?@)[^>]*>/g, " ");
    decisions.push("Stripped HTML style/script blocks and mapped block tags to newlines");
  }

  // 2. Decode MIME/quoted-printable remnants and zero-width spaces
  const beforeMime = text.length;
  text = text
    .replace(/=3D/g, "=")
    .replace(/=0D/g, "")
    .replace(/=0A/g, "")
    .replace(/&zwnj;/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (text.length !== beforeMime) {
    decisions.push("Cleaned MIME artifacts/quoted-printable/zero-width chars");
  }

  // 3. Normalize curly quotes, dashes, and newlines
  text = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // 4. Repeated separators normalization (e.g. --------- -> ---)
  const beforeSeparators = text.length;
  text = text.replace(/[-_*]{3,}/g, "---");
  if (text.length !== beforeSeparators) {
    decisions.push("Normalized repeated separators");
  }

  // 5. Remove confidentiality disclaimers (usually at bottom of emails)
  const disclaimerRegex = /\n\s*(?:Disclaimer|Confidentiality|This email and any attachments|This message is confidential|Note: This email and its attachments)[\s\S]*$/i;
  const beforeDisclaimer = text.length;
  text = text.replace(disclaimerRegex, "");
  if (text.length < beforeDisclaimer) {
    decisions.push("Removed confidentiality disclaimer");
  }

  // 6. Remove mobile email signatures / boilerplate
  const beforeSig = text.length;
  text = text.replace(/\n\s*Sent from my (iPhone|iPad|Android|Mail)[\s\S]*?$/i, "");
  text = text.replace(/\n\s*Get Outlook for (Android|iOS|Mobile)[\s\S]*?$/i, "");
  if (text.length < beforeSig) {
    decisions.push("Removed mobile email client boilerplate signature");
  }

  // 7. Clean duplicate placement office footers if any
  const beforeFooter = text.length;
  text = stripForwardingFooter(text);
  if (text.length < beforeFooter) {
    decisions.push("Removed placement office forwarding footer");
  }

  // 8. Line-by-line normalization (trim and collapse extra spaces)
  const lines = text.split("\n").map(line => {
    return line.replace(/[ \t]+/g, " ").trim();
  });

  // 9. Collapse consecutive blank lines (limit to max 1 empty line)
  const cleanLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "") {
      if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1] !== "") {
        cleanLines.push("");
      }
    } else {
      cleanLines.push(lines[i]);
    }
  }

  const cleanedText = cleanLines.join("\n").trim();

  return {
    text: cleanedText,
    decisions,
    originalLength,
    cleanedLength: cleanedText.length
  };
}


function normalizeKey(raw = "") {
  return (raw || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanMarkdown(text = "") {
  return (text || "")
    .replace(/\*\*([^\*]+)\*\*/g, "$1")
    .replace(/\*([^\*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

function cleanProgramValue(raw = "") {
  let value = (raw || "").toString().trim();
  value = cleanMarkdown(value);
  const symbolRegex = /^[\*\u2022\u2023\u25E6\u2043\u2219\-\.\s\:]+/;
  const trailingSymbolRegex = /[\*\u2022\u2023\u25E6\u2043\u2219\-\.\s\:]+$/;
  value = value.replace(symbolRegex, "").trim();
  value = value.replace(trailingSymbolRegex, "").trim();
  value = value.replace(/\s{2,}/g, " ");
  const lowerValue = value.toLowerCase();

  if (!value || lowerValue === "details" || lowerValue === "n/a" || lowerValue === "none" || /^[^a-zA-Z0-9]+$/.test(value)) {
    return "";
  }
  if (/^\d{4}$/.test(value)) {
    return "";
  }
  return value;
}

function cleanUrl(raw = "") {
  const url = (raw || "").toString().replace(/[)>.,;"']+$/g, "").trim();
  if (!url.startsWith("http")) return null;
  return url;
}

function keywordRoleFallback(text = "") {
  const lower = (text || "").toLowerCase();
  const match = lower.match(/\b(software engineer|data analyst|intern|developer|analyst|associate|consultant|manager|trainee|apprentice|engineer)\b/i);
  if (match) {
    return match[1].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return "";
}

function normalizeStatus(status = "") {
  const lower = (status || "").toLowerCase().trim();
  const validStatuses = ["new", "applied", "interview", "offer", "rejected", "done"];
  if (validStatuses.includes(lower)) return lower;
  if (lower === "selected" || lower === "shortlisted") return "offer";
  if (lower === "test" || lower === "assessment") return "interview";
  return "new";
}

function parseForwardedEmail(body = "") {
  const raw = body || "";
  const result = { isForwarded: false, subject: "", from: "", body: raw };
  const marker = raw.match(/(?:-{2,}|\*{2,})\s*(?:Forwarded message|Begin forwarded message|Original message)\s*(?:-{2,}|\*{2,})/i);
  if (!marker) return result;

  result.isForwarded = true;
  const index = raw.indexOf(marker[0]);
  const forwardedBody = raw.slice(index + marker[0].length).trim();
  result.body = forwardedBody;

  const subjectMatch = forwardedBody.match(/Subject\s*[:\-]\s*(.+)/i);
  if (subjectMatch) result.subject = subjectMatch[1].trim();
  const fromMatch = forwardedBody.match(/From\s*[:\-]\s*(.+)/i);
  if (fromMatch) result.from = fromMatch[1].trim();
  return result;
}

function extractFormLink(text = "") {
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const rawAll = (text || "").match(urlRegex) || [];
  const cleanedAll = rawAll.map(url => url.replace(/[.,;)]+$/, ""));
  const uniqueUrls = [...new Set(cleanedAll)];

  const formsGle = uniqueUrls.find((u) => /forms\.gle\//i.test(u));
  const docsForms = uniqueUrls.find((u) => /docs\.google\.com\/forms\//i.test(u));
  const unstop = uniqueUrls.find((u) => /unstop\.com\//i.test(u));
  const brazen = uniqueUrls.find((u) => /brazenconnect\.com\//i.test(u));

  const primary = formsGle || docsForms || unstop || brazen || uniqueUrls[0] || "";

  return { primary, all: uniqueUrls, isForm: !!(formsGle || docsForms) };
}

function companyFromSender(senderRaw = "") {
  const domainMatch = (senderRaw || "").match(/@([a-zA-Z0-9.-]+)/);
  if (!domainMatch) return null;

  const fullDomain = domainMatch[1].toLowerCase();
  const parts = fullDomain.split(".");
  if (parts.length < 2) return null;

  // Compound second-level domains like co.in, co.uk, com.au, ac.uk.
  // When these appear, the company name is the label BEFORE the compound SLD.
  const compoundSLDs = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);
  const genericTLDs  = new Set(["com", "net", "org", "edu", "gov", "io", "ai",
                                 "in", "uk", "us", "de", "fr", "jp", "au", "ca"]);

  const tld = parts[parts.length - 1]; // e.g. "com"
  const sld = parts[parts.length - 2]; // e.g. "abb", "pod", "co"

  let companyPart;
  // Compound TLD pattern: e.g. .co.in, .com.au â†’ company is 3rd label from end
  if (compoundSLDs.has(sld) && genericTLDs.has(tld) && parts.length >= 3) {
    companyPart = parts[parts.length - 3]; // e.g. "abb" from "in.abb.co.in"
  } else {
    // Simple TLD: e.g. "abb" from "in.abb.com", "pod" from "pod.ai"
    companyPart = sld;
  }

  const genericDomains = new Set([
    "gmail", "yahoo", "outlook", "hotmail", "noreply", "no-reply",
    "mail", "info", "notifications", "mailer", "msrit", "placement",
    "dean", "career", "careers", "support", "help", "admin", "hr",
    "contact", "sales", "hello", "team"
  ]);
  if (genericDomains.has(companyPart)) return null;

  // Capitalize each hyphen-separated segment for readability
  // e.g. "some-generic-domain" â†’ "Some Generic Domain"
  return companyPart
    .split("-")
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(" ");
}

function isGenericCompanyName(raw = "") {
  const trimmed = (raw || "").trim().toLowerCase();
  const invalidNames = [
    "msrit", "msrit placement cell", "msrit placements", "msrit career cell",
    "our college", "the college", "placement cell", "training and placement",
    "placement", "career cell"
  ];
  return invalidNames.includes(trimmed);
}

const KNOWN_COMPANY_ALIASES = {
  // ── Established aliases ────────────────────────────────────────────────
  havells: "Havells",
  "havells india": "Havells",
  tcs: "TCS",
  "tata consultancy services": "TCS",
  dentsu: "Dentsu",
  flipr: "Flipr",
  altair: "Altair Engineering",
  "altair engineering": "Altair Engineering",
  nokia: "Nokia",
  haber: "Haber",
  amazon: "Amazon",
  "amazon web services": "AWS",
  aws: "AWS",
  google: "Google",
  microsoft: "Microsoft",
  infosys: "Infosys",
  wipro: "Wipro",
  cognizant: "Cognizant",
  accenture: "Accenture",
  capgemini: "Capgemini",
  hcl: "HCL",
  "hcl technologies": "HCL",
  flipkart: "Flipkart",
  ibm: "IBM",
  workindia: "WorkIndia",
  "tata technologies": "Tata Technologies",
  // â”€â”€ Additional placement-email companies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  abb: "ABB",
  "abb india": "ABB",
  "abb business services": "ABB",
  ericsson: "Ericsson",
  "ericsson india": "Ericsson",
  pod: "Pod.ai",
  "pod.ai": "Pod.ai",
  hirepro: "HirePro",
  "hire pro": "HirePro",
  bosch: "Bosch",
  "robert bosch": "Bosch",
  siemens: "Siemens",
  dell: "Dell",
  intel: "Intel",
  qualcomm: "Qualcomm",
  oracle: "Oracle",
  samsung: "Samsung",
  cisco: "Cisco",
  deloitte: "Deloitte",
  blackrock: "BlackRock",
  uber: "Uber",
  sap: "SAP",
  thoughtworks: "Thoughtworks",
  freshworks: "Freshworks",
  razorpay: "Razorpay",
  zoho: "Zoho",
  mphasis: "Mphasis",
  mindtree: "Mindtree",
  lnt: "L&T",
  "larsen and toubro": "L&T",
  primenumbers: "Prime Numbers",
  "prime numbers": "Prime Numbers",
};

const INVALID_TITLE_FRAGMENTS = [
  "the", "this", "hall", "today", "various stages", "a campus recruitment",
  "forwarded message", "placement office", "from:", "subject:"
];

function matchKnownCompany(text = "") {
  if (!text) return "";
  const normalized = normalizeKey(text);
  for (const rawAlias of Object.keys(KNOWN_COMPANY_ALIASES)) {
    const alias = normalizeKey(rawAlias);
    if (!alias) continue;
    const safeAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${safeAlias}\\b`, 'i');
    if (regex.test(normalized)) {
      return KNOWN_COMPANY_ALIASES[rawAlias];
    }
  }
  return "";
}

const PLATFORM_TERMS = [
  "microsoft teams",
  "ms teams",
  "google forms",
  "google form",
  "google doc",
  "google docs",
  "google drive",
  "google sheet",
  "google sheets",
  "google meet",
  "zoom meeting",
  "zoom",
  "webex",
  "cisco webex",
  "brazen",
  "calendly",
  "unstop",
  "forms.gle",
  "docs.google.com",
  "drive.google.com"
];

function stripPlatformReferences(text = "") {
  let cleaned = text || "";
  cleaned = cleaned.replace(/https?:\/\/[^\s<>"']+/gi, "");
  for (const term of PLATFORM_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    cleaned = cleaned.replace(regex, " ");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function extractCompanyFromText(text = "") {
  // Try line-by-line first for explicit Company Name / Company: patterns
  const lines = (text || "").split(/[\r\n]+/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    const explicitMatch = trimmedLine.match(/^(?:Company(?:\s+Name)?|Organization|Employer|Recruiter)\s*[:\-]\s*([A-Z0-9][A-Za-z0-9&.\-\s]{1,60})/i);
    if (explicitMatch && explicitMatch[1]) {
      const candidate = sanitizeCompany(explicitMatch[1]);
      if (candidate && !isGenericCompanyName(candidate)) {
        const alias = matchKnownCompany(candidate);
        return alias || candidate;
      }
    }
  }

  const cleanedText = stripPlatformReferences(cleanMarkdown(normalizeText(text)));

  const patterns = [
    // 1. Explicit Company Name / Organization label across line
    /(?:Company(?:\s+Name)?|Organization|Employer|Recruiter)\s*[:\-]\s*([A-Z0-9][A-Za-z0-9&.\-\s]{1,50}?)(?=\s+(?:Job\s+Role|Role|Eligibility|Stipend|CTC|Location|Package|Duration|Salary|Selection|Process|Deadline|Registration|Branches|CGPA|Department)|[.,;]|$)/i,
    // 2. Legal entities (Pvt Ltd, Inc, Corp)
    /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\s+(?:Pvt\b\.?\s*Ltd\b\.?|Private\s+Limited|Ltd\b\.?|Limited|Inc\b\.?|Incorporated|Corp\b\.?|Corporation|LLC|India\b\s+(?:Pvt\b\.?\s*Ltd\b\.?|Ltd\b\.?|Limited))\b/,
    // 3. Subject / drive delimiters: e.g. "Campus Drive for Prime Numbers - 2027" or "Campus Recruitment 2026 | Acme Technologies - Online Assessment"
    /(?:\||\b(?:campus\s+drive\s+(?:for|by|at)|recruitment\s+drive\s+(?:for|by|at)|drive\s+(?:for|by|at)|hiring\s+(?:for|by|at)|for|at)\b)\s+([A-Z][A-Za-z0-9&.\s]{1,50}?)(?=\s*(?:-|–|—|\||Online Assessment|Registration|Recruitment|Drive|Interview|Hiring|Opportunity|Batch|test|\r|\n|$))/i,
    // 4. Action verbs: "... Acme Technologies is visiting / invites / conducts ..."
    /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\b(?=\s+(?:is\s+visiting|is\s+hiring|is\s+conducting|has\s+scheduled|offers|invites|announces|conducts))/i,
    // 5. Prepositions: from/by/at Company for/hiring
    /(?:from|by|at)\s+([A-Z][A-Za-z0-9&.\s]{1,60}?)(?=\s+(?:for|about|regarding|hiring|is|offers?|invites?|interview|role|drive|program|placement|campus|job|internship))/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      const candidate = sanitizeCompany(match[1]);
      if (candidate && !isGenericCompanyName(candidate)) {
        const lowerCand = candidate.toLowerCase();
        if (lowerCand !== "here" && lowerCand !== "there" && lowerCand !== "this" && !lowerCand.startsWith("potential")) {
          const alias = matchKnownCompany(candidate);
          return alias || candidate;
        }
      }
    }
  }
  return "";
}

function sanitizeCompany(raw = "") {
  const trimmed = (raw || "").trim();
  const lower = trimmed.toLowerCase();

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 5) return null;

  const invalid = [
    "", "unknown", "n/a", "na", "none", "company", "team", "the company", 
    "our company", "hiring team", "mandatory", "invitation", "eligibility criteria", 
    "design", "registration", "assessment", "interview", "reminder", "opportunity", 
    "deadline", "hiring process", "campus recruitment", "placement drive", 
    "aptitude test", "roadshow", "sep roadshow", "lpa registration", "guidelines", 
    "instructions", "hiring", "placement", "recruitment", "drive"
  ];
  const rejectIfContains = [
    "your institution", "your college", "your university", "your institute",
    "register", "registration", "apply by", "application", "last date",
    "subject", "dear sir", "dear madam", "please find", "please register",
    "inbox", "forwarded message", "authorised signatory",
    "dear students", "kindly", "venue", "today", "tomorrow", "placement drive",
    "campus recruitment", "placement department", "training and placement",
    "placement office", "department of training", "graduating batch",
    "google form", "google forms", "google doc", "google drive", "microsoft teams", "zoom"
  ];
  if (invalid.includes(lower)) return null;
  if (rejectIfContains.some((term) => lower.includes(term))) return null;
  if (/\b(your|our|this|the)\s+(institution|college|university|institute|batch)\b/.test(lower)) return null;
  if (/\b(placement|training)\s+(department|office|cell|division)\b/i.test(lower)) return null;

  // Reject sentence boundaries (exclamation/question mark or period followed by whitespace and a capital word)
  // Preserve domain names (POD.ai, unstop.com, etc.) and company abbreviations (Stellantis N.V.)
  if (/[!?]\s+[A-Z]/.test(trimmed)) return null;
  if (/\.\s+[A-Z][a-z]{3,}/.test(trimmed)) return null;

  return trimmed;
}

/**
 * Words that must never be treated as a company name even when they appear
 * right after a sign-off word ("Regards, Seekingâ€¦" â†’ reject "Seeking").
 */
const SIGNATURE_COMPANY_BLOCKLIST = new Set([
  "seeking", "greetings", "please", "kindly", "noted", "reminder",
  "regards", "sincerely", "best", "dear", "note", "invitation",
  "hi", "hello", "thanks", "thank", "hope", "trust", "warm",
  "enclosed", "attached", "forward", "forwarded", "partnership",
  "students", "all", "sir", "madam", "team", "from", "the",
  "department", "placement", "training", "office", "centre", "center",
  "division", "cell", "rit", "msrit", "ramaiah", "coordinator", "head", "dean",
  "university", "college", "institution", "faculty"
]);

function extractCompanyFromSignature(body = "") {
  const sigMatches = [
    /(?:regards|thanks|sincerely|best\s+regards|warm\s+regards|with\s+regards)\s*,?\s+(?:team\s+)?([A-Z][A-Za-z0-9&.\-\s]{2,40})/i,
    /\bteam\s+([A-Z][A-Za-z0-9&.\-\s]{2,40})/i
  ];
  const lastPart = (body || "").slice(-1000);
  for (const regex of sigMatches) {
    const match = lastPart.match(regex);
    if (match && match[1]) {
      const candidate = sanitizeCompany(match[1]);
      if (!candidate) continue;
      const lowerCand = candidate.toLowerCase();
      const firstWord = lowerCand.split(/\s+/)[0];
      // Reject if the first captured word is a known generic/sentence-starting word
      if (SIGNATURE_COMPANY_BLOCKLIST.has(firstWord)) continue;
      if (lowerCand === "here" || lowerCand === "there" || lowerCand === "this") continue;
      if (!lowerCand.startsWith("potential") && !isGenericCompanyName(candidate)) {
        return candidate;
      }
    }
  }
  return "";
}

function resolveCompany({ subject = "", body = "", sender = "", forwarded = {} }) {
  const cleanSubject = stripPlatformReferences(subject);
  const cleanBody = stripPlatformReferences(body);
  const cleanFwdSubject = stripPlatformReferences(forwarded.subject);
  const cleanFwdBody = stripPlatformReferences(forwarded.body);

  // 1. Explicit company information from sender/domain (including forwarded sender!)
  if (sender) {
    const senderCompany = companyFromSender(sender);
    if (senderCompany && !isGenericCompanyName(senderCompany)) {
      const alias = matchKnownCompany(senderCompany);
      return { company: alias || senderCompany, source: 'sender', confidence: 0.95 };
    }
  }
  if (forwarded.from) {
    const fwdSenderCompany = companyFromSender(forwarded.from);
    if (fwdSenderCompany && !isGenericCompanyName(fwdSenderCompany)) {
      const alias = matchKnownCompany(fwdSenderCompany);
      return { company: alias || fwdSenderCompany, source: 'sender', confidence: 0.95 };
    }
  }

  // 2. Subject extraction (e.g. "Campus Drive for Prime Numbers - 2027" or "Acme Technologies - Online Assessment")
  const subjectCompany = extractCompanyFromText(cleanSubject || cleanFwdSubject);
  if (subjectCompany) return { company: subjectCompany, source: 'subject', confidence: 0.85 };

  // 3. Body explicit company patterns (e.g. "Company Name: Prime Numbers" or "Acme Technologies is hiring")
  const bodyCompany = extractCompanyFromText(cleanBody || cleanFwdBody);
  if (bodyCompany) return { company: bodyCompany, source: 'body', confidence: 0.80 };

  // 4. Signature fallback
  const signatureCompany = extractCompanyFromSignature(cleanBody || cleanFwdBody);
  if (signatureCompany) {
    return { company: signatureCompany, source: 'signature', confidence: 0.65 };
  }

  return { company: "", source: 'none', confidence: 0.0 };
}

// ---------------------------------------------------------------------------
// Forwarding footer stripper
// ---------------------------------------------------------------------------

/**
 * Strip the forwarding footer appended by placement departments before
 * running deterministic field extractors.  Common footer pattern:
 *
 *   "--\nRegards,\nPlacement Department\nRIT"
 *
 * Without stripping, extractVenue latches onto "Placement Department" â†’
 * RIT and venue becomes "RIT" even when the real venue is "Bangalore".
 */
function stripForwardingFooter(body = "") {
  if (!body) return "";
  const footerPatterns = [
    // "-- \n Regards, \n Placement Department \n RIT"
    /[\r\n]+\s*[-_]{2,}\s*[\r\n]+\s*(?:regards|thanks|warm regards|best regards)[\s\S]{0,400}placement\s+department[\s\S]*/i,
    // "\n Regards, \n Placement Department \n ..."
    /[\r\n]+\s*regards,?\s*[\r\n]+\s*placement\s+department[\s\S]*/i,
    // Trailing "-- \n Regards" without explicit placement text
    /[\r\n]+\s*--\s*[\r\n]+\s*regards[\s\S]{0,300}$/i,
  ];
  let result = body;
  for (const pattern of footerPatterns) {
    const stripped = result.replace(pattern, "");
    if (stripped.length < result.length) {
      result = stripped;
      break; // only strip the first matched footer
    }
  }
  return result.trim();
}

/**
 * Intent tiers — determines which classification wins when multiple rules match.
 *   primary:   high-specificity signals that are rarely false positives
 *   standard:  medium-specificity signals for general job/event categories
 *   secondary: low-specificity signals that often co-occur with primary intents
 * When a primary and secondary match both exist, the primary always wins.
 */
const INTENT_TIER = {
  interviewResult:        "primary",
  interviewSchedule:      "primary",
  assessmentAnnouncement: "primary",
  hackathonEvent:         "primary",
  pptAnnouncement:        "standard",
  newOpportunity:         "standard",
  workshopWebinar:        "standard",
  internshipOpportunity:  "standard",
  jobOpportunity:         "standard",
  registrationLink:       "secondary",
  applicationReminder:    "secondary",
  venueUpdate:            "secondary",
  deadlineReminder:       "secondary",
  genericPlacementNotice: "secondary",
};

const TIER_RANK = { primary: 3, standard: 2, secondary: 1 };

/**
 * Strong hiring signals — when present, secondary classifications like
 * "Registration Link" or "Deadline Reminder" should not win over hiring.
 */
const HIRING_SIGNALS = /\b(CTC|stipend|salary|package|compensation|LPA|internship\\s+opportunity|hiring\\s+opportunity|job\\s+opening|new\\s+hiring|recruitment\\s+drive|campus\\s+recruitment|placement\\s+drive|offer\\s+letter)\\b/i;

function classifyEmail({ subject = "", body = "", forwarded = {}, hasLink = false }) {
  const text = `${subject} ${body}`.toLowerCase();

  const rules = [
    {
      category: "hackathonEvent",
      classification: "Hackathon / Event Invitation",
      status: "new",
      type: "event",
      opportunityType: "HACKATHON",
      // Removed "open for registration" — too broad
      regex: /\b(hack\w*|innovent|innovation\s+challenge|ideathon|datathon|bootcamp|competition|coding\s+contest|tech\s+fest|techfest|code\s*fest|codathon|makeathon|designathon|project\s+submission|submission\s+window|team\s+size|event\s+invitation|scholarship\s+program)\b/i,
      confidence: 0.92,
    },
    {
      category: "interviewResult",
      classification: "Interview Result",
      status: "offer",
      type: "unknown",
      opportunityType: "JOB_APPLICATION",
      regex: /\b(offer\s+letter|congratulations|shortlisted|happy to inform|pleased to inform)\b|\b(?:finally\s+)?selected\s+(?:students|candidates|list|rounds?)\b|\b(?:are|were|got|been)\s+selected\b/i,
      confidence: 0.95,
    },
    {
      category: "interviewSchedule",
      classification: "Interview Schedule",
      status: "interview",
      type: "interview",
      opportunityType: "JOB_APPLICATION",
      regex: /\b(interview.*schedule|scheduled for|interview date|slot|panel interview|telephonic interview|interview schedule)\b/i,
      confidence: 0.92,
    },
    {
      category: "assessmentAnnouncement",
      classification: "Assessment Announcement",
      status: "interview",
      type: "test",
      opportunityType: "JOB_APPLICATION",
      // Remove bare 'assessment' and 'exam'
      regex: /\b(aptitude test|online test|coding test|technical test|fcat|assessment\s+link|scheduled\s+assessment|assessment\s+date|exam\s+link|scheduled\s+exam|exam\s+date)\b/i,
      confidence: 0.9,
    },
    {
      category: "pptAnnouncement",
      classification: "PPT Announcement",
      status: "new",
      type: "unknown",
      opportunityType: "OTHER_PLACEMENT_EVENT",
      regex: /\b(pre[-\s]*placement talk|ppt|placement talk|info session)\b/i,
      confidence: 0.88,
    },
    {
      category: "workshopWebinar",
      classification: "Workshop / Webinar",
      status: "new",
      type: "unknown",
      opportunityType: "WEBINAR",
      regex: /\b(seminar|guest lecture|workshop\s+invitation|webinar\s+invitation|webinar|workshop|expert talk)\b/i,
      confidence: 0.88,
    },
    {
      category: "internshipOpportunity",
      classification: "Internship Opportunity",
      status: "new",
      type: "unknown",
      opportunityType: "JOB_APPLICATION",
      regex: /\b(internship\s+opportunity|internship\s+program|internship\s+drive|hiring\s+interns|intern\s+hiring|internship\s+role)\b/i,
      confidence: 0.85,
    },
    {
      category: "jobOpportunity",
      classification: "Job Opportunity",
      status: "new",
      type: "unknown",
      opportunityType: "JOB_APPLICATION",
      regex: /\b(job\s+opportunity|job\s+opening|hiring\s+opportunity|recruitment\s+drive|campus\s+recruitment|placement\s+drive|full\s+time\s+employment|fte\s+opportunity|fte\s+hiring)\b/i,
      confidence: 0.85,
    },
    {
      category: "registrationLink",
      classification: "Registration Link",
      status: "new",
      type: "application",
      opportunityType: "JOB_APPLICATION",
      // Removed bare 'register'/'registration'
      regex: /\b(complete your profile|profile completion|forms\.gle|docs\.google\.com\/forms|register\s+here|registration\s+link|registration\s+button)\b/i,
      confidence: 0.9,
    },
    {
      category: "applicationReminder",
      classification: "Application Reminder",
      status: "new",
      type: "application",
      opportunityType: "JOB_APPLICATION",
      // Removed bare 'reminder'
      regex: /\b(reminder\b.*?\b(register|apply|submit)|deadline\s+reminder|last\s+date\s+to|reminder\s+to\s+apply)\b/i,
      confidence: 0.9,
    },
    {
      category: "venueUpdate",
      classification: "Venue Update",
      status: "applied",
      type: "unknown",
      opportunityType: "OTHER_PLACEMENT_EVENT",
      // Removed bare 'venue'/'hall'/'room'/'location'
      regex: /\b(venue\s+update|changed\s+venue|allotted\s+hall|reporting\s+hall|seminar\s+hall\s+location)\b/i,
      confidence: 0.88,
    },
    {
      category: "deadlineReminder",
      classification: "Deadline Reminder",
      status: "new",
      type: "unknown",
      opportunityType: "JOB_APPLICATION",
      // Removed bare 'deadline'/'last date'
      regex: /\b(submission deadline|last date to apply|apply by|register by|before .* today|before .* tomorrow)\b/i,
      confidence: 0.9,
    },
    {
      category: "genericPlacementNotice",
      classification: "Generic Placement Notice",
      status: "applied",
      type: "unknown",
      opportunityType: "JOB_APPLICATION",
      // Removed bare 'opportunity'/'drive'
      regex: /\b(campus recruitment|placement notice|hiring process|recruitment drive)\b/i,
      confidence: 0.75,
    },
  ];

  const matchedRules = [];
  for (const rule of rules) {
    if (rule.regex.test(text)) {
      matchedRules.push(rule);
    }
  }

  // If we matched multiple rules, let's see if we should demote secondary ones if hiring signals exist
  const hasHiring = HIRING_SIGNALS.test(text);

  const processedRules = matchedRules.map(rule => {
    let conf = rule.confidence;
    const tier = INTENT_TIER[rule.category] || "secondary";
    if (tier === "secondary" && hasHiring) {
      conf = conf * 0.6; // Demote by 40%
      console.log(`[CLASSIFY_DEMOTED] "${rule.classification}" demoted (hiring signals present)`);
    }
    return { ...rule, confidence: conf, tier };
  });

  if (processedRules.length > 0) {
    // Sort by tier rank (descending), then by confidence (descending)
    processedRules.sort((a, b) => {
      const aRank = TIER_RANK[a.tier] || 1;
      const bRank = TIER_RANK[b.tier] || 1;
      if (bRank !== aRank) return bRank - aRank;
      return b.confidence - a.confidence;
    });

    const chosen = processedRules[0];
    console.log(`[CLASSIFY_DETERMINISTIC] matched=${matchedRules.map(r => r.category).join(',')} → chosen="${chosen.classification}" (tier=${chosen.tier}, conf=${chosen.confidence.toFixed(2)})`);
    return {
      category: chosen.category,
      classification: chosen.classification,
      type: chosen.type,
      status: chosen.status,
      opportunityType: chosen.opportunityType,
      confidence: chosen.confidence,
    };
  }

  if (hasLink) {
    return {
      category: "registrationLink",
      classification: "Registration Link",
      type: "application",
      status: "applied",
      opportunityType: "JOB_APPLICATION",
      confidence: 0.7,
    };
  }

  if (/\b(interview|assessment|aptitude|exam|shortlist|hiring|recruitment|application|job|internship|offer|deadline)\b/i.test(text)) {
    return {
      category: "newOpportunity",
      classification: "New Hiring Opportunity",
      type: "unknown",
      status: "applied",
      opportunityType: "JOB_APPLICATION",
      confidence: 0.55,
    };
  }

  return {
    category: "nonRecruitment",
    classification: "Non-Recruitment Email",
    type: "unknown",
    status: "applied",
    opportunityType: "OTHER_PLACEMENT_EVENT",
    confidence: 0.25,
  };
}


function parseDateString(input = "", referenceDate = new Date()) {
  const text = normalizeText(input);
  if (!text) return null;
  const lower = text.toLowerCase();

  if (/\b(?:today|tonight|eod|cob|end of (?:the )?day|end of today|close of (?:business|day))\b/i.test(lower)) {
    if (/\btomorrow\b/i.test(lower)) {
      const next = new Date(referenceDate);
      next.setDate(next.getDate() + 1);
      return next;
    }
    return new Date(referenceDate);
  }
  if (/\btomorrow\b/i.test(lower)) {
    const next = new Date(referenceDate);
    next.setDate(next.getDate() + 1);
    return next;
  }

  const monthNames = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const alphaMatch = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(20\d{2})?/i);
  if (alphaMatch) {
    const day = parseInt(alphaMatch[1], 10);
    const month = monthNames[alphaMatch[2].toLowerCase().slice(0, 3)];
    const year = alphaMatch[3] ? parseInt(alphaMatch[3], 10) : referenceDate.getFullYear();
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const altMatch = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\s*(20\d{2})?/i);
  if (altMatch) {
    const month = monthNames[altMatch[1].toLowerCase().slice(0, 3)];
    const day = parseInt(altMatch[2], 10);
    const year = altMatch[3] ? parseInt(altMatch[3], 10) : referenceDate.getFullYear();
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const numericMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (numericMatch) {
    const day = parseInt(numericMatch[1], 10);
    const month = parseInt(numericMatch[2], 10);
    let year = numericMatch[3] ? parseInt(numericMatch[3], 10) : referenceDate.getFullYear();
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  return null;
}

function extractEventDate(text = "", referenceDate = new Date()) {
  if (!text) return null;
  const segments = text.split(/[\r\n]+/);
  for (const segment of segments) {
    if (/\b(interview|scheduled|test|aptitude|assessment|drive|recruitment|ppt|seminar|hall|date)\b/i.test(segment)) {
      const candidate = parseDateString(segment, referenceDate);
      if (candidate) return candidate;
    }
  }
  return parseDateString(text, referenceDate);
}

function extractDeadlineDetails(text = "", referenceDate = new Date()) {
  const cleaned = normalizeText(text);
  const lines = cleaned.split(/[\r\n]+/);
  for (const line of lines) {
    if (/\b(deadline|last date|apply by|register by|submit by|submission deadline|before .* today|before .* tomorrow|eod|cob|end of day)\b/i.test(line)) {
      const date = parseDateString(line, referenceDate);
      if (date) {
        return {
          deadline: date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          iso: date.toISOString(),
          raw: line.trim(),
        };
      }
    }
  }
  return { deadline: "", iso: "", raw: "" };
}

function extractReportingTime(text = "") {
  const cleaned = normalizeText(text);
  const match = cleaned.match(/report(?:ing)? time\s*(?:is|at|:)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (match) return match[1].toUpperCase();
  const altMatch = cleaned.match(/at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:report|reporting)/i);
  if (altMatch) return altMatch[1].toUpperCase();
  return "";
}

function extractVenue(text = "") {
  const cleaned = normalizeText(text);
  const match = cleaned.match(/\b(?:venue|hall|room|auditorium|seminar hall|department|esb)\s*[:\-]?\s*([^\.\n]+)/i);
  if (match) return cleanProgramValue(match[1]);
  const hallMatch = cleaned.match(/\b(?:at|in)\s+([^\.\n]+(?:hall|room|auditorium|department|centre|center))/i);
  if (hallMatch) return cleanProgramValue(hallMatch[1]);
  return "";
}

function extractDuration(text = "") {
  const cleaned = normalizeText(text);
  const match = cleaned.match(/(?:duration|for)\s*[:\-]?\s*([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))/i);
  if (match) return cleanProgramValue(match[1]);
  const altMatch = cleaned.match(/([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))\s*(?:long|duration|period)/i);
  if (altMatch) return cleanProgramValue(altMatch[1]);
  return "";
}

function extractSalary(text = "") {
  const cleaned = normalizeText(text);
  const patterns = [
    /(?:CTC|Package|Stipend)\s*[:\-]?\s*([â‚¹$â‚¬]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /(?:â‚¹|Rs\.?|INR)\s*[0-9,]+(?:\.\d+)?(?:\s*(?:LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
    /[0-9]+(?:,[0-9]{3})*(?:\.\d+)?\s*(?:LPA|lakhs|K|k)(?:\s*(?:per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const value = match[1] ? match[1].trim() : match[0].trim();
      const cleanedValue = cleanProgramValue(value);
      const numericOnly = /^[0-9]+(?:\.[0-9]+)?$/;
      const hasCurrencyOrUnit = /\b(?:â‚¹|Rs\.?|INR|LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr)\b/i.test(cleanedValue);

      if (numericOnly.test(cleanedValue) && !hasCurrencyOrUnit) continue;
      if (/^(?:rs\.?|inr|â‚¹|usd)\s*$/i.test(cleanedValue)) continue;

      const numMatch = cleanedValue.match(/([0-9,]+(?:\.\d+)?)/);
      if (numMatch) {
        const numVal = parseFloat(numMatch[1].replace(/,/g, ""));
        if (numVal < 100 && !/\b(?:lpa|lakhs|k|thousands|crores)\b/i.test(cleanedValue)) {
          continue;
        }
      }

      if (cleanedValue && cleanedValue.length > 1) return cleanedValue;
    }
  }
  return "";
}

function extractFallbackRole(subject = "", body = "") {
  // 1. Check subject for patterns like "Hiring for [Role]" or "Opportunity for [Role]"
  const subjectPatterns = [
    /\b(?:job\s+role|job\s+title|role|profile|designation)\s*[:\-]\s*([A-Z0-9][a-zA-Z0-9&.\-\s]{2,60}?)(?:\s*(?:\.|,|;|$|\r|\n))/i,
    /(?:hiring|recruitment|opportunity for|opening for|requirement for)\s+([A-Z][a-zA-Z0-9&.\-\s]{2,50}?\s+Role)\b/i,
    /(?:hiring|recruitment|opportunity for|opening for|requirement for)\s+(?!drive\b|process\b|batch\b|candidates\b|students\b)([A-Z][a-zA-Z0-9&.\-\s]{2,50}?)(?=\s+(?:at|program|opportunity|hiring|drive|placement|campus|job|internship|with))/i,
  ];

  for (const pattern of subjectPatterns) {
    const match = subject.match(pattern);
    if (match && match[1]) {
      const cleaned = cleanProgramValue(match[1]);
      if (cleaned && cleaned.length > 2 && !/^(?:intern|internship|job|opportunity|drive|hiring|drive for|batch for)$/i.test(cleaned)) {
        return cleaned;
      }
    }
  }

  // 2. Fall back to extracting roles from body
  const bodyRole = extractProgramRoles(body);
  if (bodyRole && bodyRole !== "Internship" && bodyRole !== "Apprentice" && bodyRole.length > 3 && !/^(?:drive for|drive|hiring for|batch for)$/i.test(bodyRole)) {
    return bodyRole;
  }

  return "";
}

function extractProgramRoles(text = "") {
  const cleanedText = cleanMarkdown(text);
  const patterns = [
    /(?:Job\s+Role|Job\s+Designation|Job\s+Title|Roles|Positions|Openings|Role|Position|Designation|Opening)\s*[:\-]\s*([^\r\n.!]+)/i,
    /(?:hiring|internship|apprentice)\s+(?:role|program|opening)s?\s*[:\-]\s*([^\r\n.!]+)/i,
  ];
  const headerSkip = ["details", "benefits", "criteria", "eligibility", "requirements", "description", "overview"];
  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      let extracted = cleanProgramValue(match[1]);
      // If another label starts inside the value (e.g. Branches/CGPA), truncate before it
      const boundaryMatch = extracted.match(/\b(?:Branches|Department|CGPA|CTC|Package|Stipend|Location|Eligibility|Selection|Deadline)\s*[:\-]/i);
      if (boundaryMatch) {
        extracted = extracted.substring(0, boundaryMatch.index).trim();
      }
      const lowerExtracted = extracted.toLowerCase();
      if (extracted && extracted.length < 150 && !headerSkip.includes(lowerExtracted) && !/^(?:drive for|drive|hiring for|batch for)$/i.test(extracted)) {
        return extracted;
      }
    }
  }
  if (/\binternship\b/i.test(cleanedText) || /\bintern\b/i.test(cleanedText)) return "Internship";
  if (/\bapprentice\b/i.test(cleanedText)) return "Apprentice";
  return "";
}

function extractProgramDuration(text = "") {
  const cleanedText = cleanMarkdown(text);
  const patterns = [
    /Duration\s*[:\-]\s*(\d+\s*(?:months?|weeks?|days?|years?|hours?|mins?|minutes?))/i,
    /for\s+([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))(?:\s|$)/i,
    /([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))\s*(?:long|duration|period)(?:\s|$)/i,
    /(?:internship|apprentice|training)\s+program[^\r\n]*duration\s*[:\-]?\s*(\d+\s*(?:months?|weeks?|days?|years?|hours?|mins?|minutes?))/i,
  ];
  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      const extracted = cleanProgramValue(match[1]);
      if (extracted && /\d+/.test(extracted) && extracted.length < 30) return extracted;
    }
  }
  const minDurationMatch = cleanedText.match(/minimum of\s*([0-9]+\s*(?:months|month|weeks|week|days|day|years|year))/i);
  if (minDurationMatch && minDurationMatch[1]) {
    const extracted = cleanProgramValue(minDurationMatch[1]);
    if (extracted.length < 30) return extracted;
  }

  if (/\bdaylong\b/i.test(cleanedText)) return "Daylong";
  if (/\bfull day\b/i.test(cleanedText)) return "Full day";

  return "";
}

function extractProgramStipend(text = "") {
  const cleanedText = cleanMarkdown(text);
  const unpaidKeywords = /\b(?:free|unpaid|no\s+stipend|nil|none|n\/a|zero|without\s+stipend|no\s+remuneration)\b/i;
  if (unpaidKeywords.test(cleanedText)) return "";
  const patterns = [
    /Stipend\s*[:\-]?\s*([â‚¹$â‚¬]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /Internship\s+stipend\s*[:\-]?\s*([â‚¹$â‚¬]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /(?:CTC|Package)\s*[:\-]?\s*([â‚¹$â‚¬]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /[-â€¢]\s*(?:B\.Tech|B\.E|M\.Tech|M\.E|MCA|B\.Tech\/MCA)\s*[:\-]?\s*([â‚¹]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|pa)?)/i,
    /(?:â‚¹|Rs\.?|INR)\s*[0-9,]+(?:\.\d+)?(?:\s*(?:LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
    /[0-9]+(?:,[0-9]{3})*(?:\.\d+)?\s*(?:LPA|lakhs|K|k)(?:\s*(?:per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
  ];
  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match) {
      const value = match[1] ? match[1].trim() : match[0].trim();
      const cleaned = cleanProgramValue(value);
      const numericOnly = /^[0-9]+(?:\.[0-9]+)?$/;
      const hasCurrencyOrUnit = /\b(?:â‚¹|Rs\.?|INR|LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr)\b/i.test(cleaned);

      if (numericOnly.test(cleaned) && !hasCurrencyOrUnit) continue;
      if (/^(?:rs\.?|inr|â‚¹|usd)\s*$/i.test(cleaned)) continue;

      const numMatch = cleaned.match(/([0-9,]+(?:\.\d+)?)/);
      if (numMatch) {
        const numVal = parseFloat(numMatch[1].replace(/,/g, ""));
        if (numVal < 100 && !/\b(?:lpa|lakhs|k|thousands|crores)\b/i.test(cleaned)) {
          continue;
        }
      }

      if (cleaned && cleaned.length > 1) return cleaned;
    }
  }
  return "";
}

function extractDeadlineText(text = "") {
  const lines = (text || "").split(/[\r\n]+/);

  const patterns = [
    /(?:register|apply|submit|last date|deadline).*?\b(?:on or before|before|by|is)\b\s*([^\r\n]+)/i,
    /(?:last date|deadline|register|apply)\s*[:\-]\s*([^\r\n]+)/i,
    /\b(?:apply|submit)\s*(?:by|before)\s*([^\r\n]+)/i,
  ];

  for (const line of lines) {
    const cleanedLine = cleanMarkdown(line);
    for (const pattern of patterns) {
      const match = cleanedLine.match(pattern);
      if (match && match[1]) {
        let rawDeadline = match[1].trim();

        const boundaries = [". ", " - ", " | ", " Dear ", " Greetings ", " Please ", " Note: "];
        for (const boundary of boundaries) {
          const idx = rawDeadline.toLowerCase().indexOf(boundary.toLowerCase());
          if (idx !== -1) {
            rawDeadline = rawDeadline.substring(0, idx);
          }
        }

        rawDeadline = rawDeadline.trim();

        if (rawDeadline.length > 40) return "";
        if (/\b(dear|greetings|sincerely|thanks|regards|sir|madam)\b/i.test(rawDeadline)) return "";

        if (!/^(before|by|deadline)/i.test(rawDeadline)) rawDeadline = `Before ${rawDeadline}`;
        return rawDeadline;
      }
    }
  }
  return "";
}

function extractEventName(subject = "", body = "") {
  const cleanSubject = stripPlatformReferences(subject);
  const subjectMatch = cleanSubject.match(/(?:InnoVent[-\s]?\d{2,4}|[A-Z][A-Za-z0-9\-\.]{2,}\s+(?:Challenge|Contest|Fest|Ideathon|Datathon|Bootcamp|Hackathon)\b(?:\s+\d+\.\d+|\s+\d{4})?|\b[A-Za-z0-9]+Vega\s+\d+\.\d+)/i)
    || cleanSubject.match(/\b([A-Z][A-Za-z0-9\-\.]{2,}(?:\s+[A-Z0-9][A-Za-z0-9\-\.]*){0,3})\b(?=\s*(?:\||\-|â€“))/i)
    || cleanSubject.match(/(?:at|for|in)\s+([A-Z][A-Za-z0-9\-\.\s]{2,40})/i);
    
  if (subjectMatch) {
    const candidate = cleanProgramValue(subjectMatch[1] || subjectMatch[0]);
    if (candidate && candidate.toLowerCase() !== "students" && candidate.toLowerCase() !== "campus") {
      return candidate;
    }
  }

  const bodyPatterns = [
    /\b(InnoVent[-\s]?\d{2,4}|[A-Za-z0-9]+Vega\s+\d+\.\d+|[A-Z][A-Za-z0-9\-\.]{2,}\s+(?:Challenge|Contest|Fest|Ideathon|Datathon|Bootcamp|Hackathon)\b(?:\s+\d+\.\d+|\s+\d{4})?)/i,
    /(?:launch|presents?|announces?|introduces?|participate in|register for|welcome to)\s+([A-Z][A-Za-z0-9\s\-\.]{2,40})/i
  ];
  
  for (const pattern of bodyPatterns) {
    const match = body.match(pattern);
    if (match && (match[1] || match[0])) {
      const candidate = cleanProgramValue(match[1] || match[0]);
      if (candidate) return candidate;
    }
  }
  
  return "";
}

function isInvalidTitle(title = "") {
  const normalized = normalizeKey(title);
  if (!normalized || normalized.length < 3) return true;
  return INVALID_TITLE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function generateTitle(company = "", classification = "newOpportunity", subject = "", roleCandidate = "", body = "") {
  const base = company || "Opportunity";
  const text = `${subject} ${body}`.toLowerCase();
  if (classification === "interviewSchedule") return `${base} Interview Schedule`;
  if (classification === "assessmentAnnouncement") return /fcat/i.test(text) ? `${base} FCAT Profile Completion` : `${base} Aptitude Test`;
  if (classification === "registrationLink") return /profile/i.test(text) ? `${base} Profile Completion` : `${base} Registration`;
  if (classification === "applicationReminder") return `${base} Registration Reminder`;
  if (classification === "pptAnnouncement") return `${base} Pre-Placement Talk`;
  if (classification === "venueUpdate") return `${base} Venue Update`;
  if (classification === "deadlineReminder") return `${base} Deadline Reminder`;
  if (classification === "genericPlacementNotice") return `${base} Recruitment Drive`;
  if (classification === "interviewResult") return `${base} Interview Result`;
  if (classification === "hackathonEvent") return `${base} Event`;
  if (classification === "newOpportunity") return `${base} Opportunity`;
  if (roleCandidate && roleCandidate !== "Unknown Role") return `${base} ${roleCandidate}`;
  return `${base} Opportunity`;
}

function buildProcessId(company = "") {
  return normalizeKey(company) || "unknown-process";
}

/**
 * Dedicated subtitle fallback generator.
 * Unlike generateTitle(), this NEVER produces generic labels like "ABB Registration".
 * It chains through real extractors and returns "" if nothing meaningful is found.
 */
function generateSubtitleFallback(subject = "", body = "", category = "") {
  // 1. Role name (using extractProgramRoles)
  const role = extractProgramRoles(body);
  if (role && role !== "Internship" && role !== "Apprentice" && role.length > 3) {
    return role;
  }

  // 2. Event name (using extractEventName)
  const eventName = extractEventName(subject, body);
  if (eventName && eventName.length > 3) {
    return eventName;
  }

  // 3. Program name (from body patterns)
  const programMatch = body.match(/(?:program|programme|course|training)\s*[:\-]\s*([^\r\n.!]{3,60})/i);
  if (programMatch && programMatch[1]) {
    const candidate = cleanProgramValue(programMatch[1]);
    if (candidate && candidate.length > 3) return candidate;
  }

  // 4. Assessment name (from body patterns)
  if (category === "assessmentAnnouncement") {
    const assessMatch = body.match(/(?:aptitude test|online test|coding test|technical test|assessment)\s*(?:for|by|at|:)\s*([^\r\n.!]{3,60})/i);
    if (assessMatch && assessMatch[1]) {
      const candidate = cleanProgramValue(assessMatch[1]);
      if (candidate && candidate.length > 3) return candidate;
    }
  }

  // 5. Interview round name (from body patterns)
  if (category === "interviewSchedule" || category === "interviewResult") {
    const roundMatch = body.match(/\b(HR\s+round|technical\s+round|final\s+round|telephonic\s+round|panel\s+interview)\b/i);
    if (roundMatch && roundMatch[1]) {
      return roundMatch[1].trim();
    }
  }

  // 6. Registration target (from body patterns)
  const regMatch = body.match(/(?:register for|registration for)\s*([^\r\n.!]{3,60})/i);
  if (regMatch && regMatch[1]) {
    const candidate = cleanProgramValue(regMatch[1]);
    if (candidate && candidate.length > 3) return candidate;
  }

  return "";
}


// ---------------------------------------------------------------------------
// LLM structured call — primary LLM integration (NVIDIA / Google Gemma 4 31B)
// ---------------------------------------------------------------------------

/**
 * Valid email types returned by LLM.
 */
const VALID_EMAIL_TYPES = ["job", "event", "nonRecruitment"];

/**
 * Fields that may appear in fieldsToDisplay, keyed by emailType.


/**
 * Strict allowlist of classification strings the model may return.
 */
const VALID_CLASSIFICATIONS = [
  "New Hiring Opportunity",
  "Internship Opportunity",
  "Registration Link",
  "Application Reminder",
  "Application Submitted",
  "Registration Confirmation",
  "PPT Announcement",
  "Assessment Announcement",
  "Interview Schedule",
  "Interview Result",
  "Interview Reminder",
  "Venue Update",
  "Deadline Reminder",
  "Generic Placement Notice",
  "Hackathon / Event Invitation",
  "Workshop / Webinar",
  "Expert Talk Series",
  "Scholarship",
  "Non-Recruitment Email",
];

/**
 * Validate and sanitize the raw JSON object returned by LLM.
 * Returns a clean, schema-conformant object, or null if fatally invalid.
 */
function validateLLMResponse(raw) {
  if (!raw || typeof raw !== "object") return null;

  // emailType â€” must be one of the allowed values
  const emailType = VALID_EMAIL_TYPES.includes(raw.emailType) ? raw.emailType : null;
  if (!emailType) return null;

  // classification â€” must be from the allowlist
  const classification = VALID_CLASSIFICATIONS.includes(raw.classification)
    ? raw.classification
    : null;

  // company and subtitle â€” short sanitized strings
  const sanitizeTextField = (v, maxLen = 200) => {
    if (!v || typeof v !== "string") return "";
    return cleanProgramValue(v.substring(0, maxLen));
  };
  const company  = sanitizeTextField(raw.company,  100);
  const domain   = typeof raw.domain === "string" ? raw.domain.trim().toLowerCase() : "";
  const subtitle = sanitizeTextField(raw.subtitle, 160);
  const timelineTitle = sanitizeTextField(raw.timelineTitle, 100);
  const timelineSummary = sanitizeTextField(raw.timelineSummary, 300);

  // displayFields — flexible [{label, value}] array, max 8 items through (trimmed to 5 later)
  let displayFields = [];
  if (Array.isArray(raw.displayFields)) {
    displayFields = raw.displayFields
      .filter((f) => f && typeof f === "object"
                  && typeof f.label === "string" && f.label.trim()
                  && typeof f.value === "string" && f.value.trim())
      .map((f) => {
        const label = cleanProgramValue(f.label.substring(0, 60));
        // Apply field-specific cleanup BEFORE generic cleaning
        const fieldCleaned = cleanDisplayFieldValue(label, f.value.substring(0, 300));
        const value = cleanProgramValue(fieldCleaned);
        return { label, value };
      })
      .filter((f) => f.label && f.value)
      .map((f) => {
        // Validate each field — prefer trimming over rejecting
        const result = validateDisplayField(f.label, f.value);
        if (!result.valid) return null;
        return { label: f.label, value: result.value };
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  // status â€” strictly enforced as "new" regardless of Gemini output
  const status = "new";

  // type â€” must be from the valid set
  const validTypes = ["internship", "full-time", "event", "test", "unknown"];
  const type = validTypes.includes(raw.type) ? raw.type : null;

  return {
    emailType,
    opportunityType: raw.opportunityType || "JOB_APPLICATION",
    classification,
    company,
    domain,
    subtitle,
    displayFields,
    status,
    type,
    skills: Array.isArray(raw.skills)
      ? raw.skills.filter(s => typeof s === "string" && s.trim()).map(s => s.trim()).slice(0, 10)
      : [],
    link: typeof raw.link === "string" && raw.link.startsWith("http") ? raw.link : "",
    timelineTitle,
    timelineSummary,
  };
}


const validateGeminiResponse = validateLLMResponse;

/**
 * Attempt structured extraction with a single model.
 * Returns { success: true, data: validated } or { success: false, reason: string, errorType: "auth_error"|"transport_error"|"content_error" }
 */
async function executeSingleModelAttempt(modelName, prompt) {
  try {
    const response = await nvidiaClient.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    });

    let rawContent = response.choices?.[0]?.message?.content || "";
    // Strip thinking/reasoning tags if emitted in message.content
    rawContent = rawContent
      .replace(/<thought[\s\S]*?<\/thought>/gi, "")
      .replace(/<think[\s\S]*?<\/think>/gi, "")
      .trim();

    let jsonText = rawContent;
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else {
      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1).trim();
      }
    }

    let rawParsed;
    try {
      rawParsed = JSON.parse(jsonText);
    } catch (parseErr) {
      return {
        success: false,
        reason: `JSON parse failed: ${parseErr.message}`,
        errorType: "content_error",
      };
    }

    const validated = validateLLMResponse(rawParsed);
    if (!validated) {
      return {
        success: false,
        reason: "Schema validation failed (missing/invalid fields)",
        errorType: "content_error",
      };
    }

    return { success: true, data: validated };
  } catch (err) {
    const status = err?.status || err?.statusCode;
    const errorMsg = (err?.message || err).toString();

    // 401 / 403: Authentication / Permission failures
    if (status === 401 || status === 403 || errorMsg.includes("401") || errorMsg.includes("403") || /unauthorized|forbidden|invalid api key/i.test(errorMsg)) {
      return {
        success: false,
        reason: `Authentication/credential error (HTTP ${status || "401/403"})`,
        errorType: "auth_error",
      };
    }

    // 404 / 410: Model / endpoint unavailable or decommissioned
    if (status === 404 || status === 410 || errorMsg.includes("404") || errorMsg.includes("410") || /not found|gone|deprecated/i.test(errorMsg)) {
      return {
        success: false,
        reason: `Model/endpoint unavailable (HTTP ${status || "404/410"})`,
        errorType: "transport_error",
      };
    }

    // 429: Rate limit / quota
    if (status === 429 || errorMsg.includes("429") || /quota|rate limit|too many requests/i.test(errorMsg)) {
      return {
        success: false,
        reason: "Rate limit / quota exceeded (HTTP 429)",
        errorType: "transport_error",
      };
    }

    // 408 / 5xx / Network / Timeout
    return {
      success: false,
      reason: `API/Network error (${errorMsg})`,
      errorType: "transport_error",
    };
  }
}

/**
 * Call LLM with a two-tier hierarchy:
 * 1. Primary: Gemma 4 31B
 * 2. Secondary Fallback: Nemotron 3.5 Lightning 30B-A3B
 * Falls back to null/error status if both fail.
 */
async function callLLMStructured({ subject = "", sender = "", body = "", opportunityType = "JOB_APPLICATION" }) {
  const truncatedBody = body.length > 3000 ? body.substring(0, 3000) + "..." : body;

  const prompt = `You are a smart placement-email parser for a college student dashboard. Analyze the email and return ONLY valid JSON — no markdown, no explanation.

CONTEXT: Emails are forwarded from a campus placement department (MSRIT/RIT). The ACTUAL company is the ORIGINAL SENDER — NOT the forwarding institution. Ignore all forwarding footers ("Regards, Placement Department, RIT/MSRIT").

Return exactly this JSON schema:
{
  "emailType": "<job | event | nonRecruitment>",
  "opportunityType": "<JOB_APPLICATION | HACKATHON | WEBINAR | OTHER_PLACEMENT_EVENT>",
  "classification": "<one of: New Hiring Opportunity | Internship Opportunity | Registration Link | Application Reminder | PPT Announcement | Assessment Announcement | Interview Schedule | Interview Result | Venue Update | Deadline Reminder | Generic Placement Notice | Hackathon / Event Invitation | Workshop / Webinar | Expert Talk Series | Scholarship | Non-Recruitment Email>",
  "company": "<actual organizing company — see COMPANY RULES>",
  "domain": "<official website domain of the company (e.g., wipro.com, atos.net, eightfold.ai), or empty string if unknown. Prioritize IT/tech service companies when ambiguous>",
  "subtitle": "<program/event/role name shown below the company name on the card — see SUBTITLE RULES>",
  "type": "<internship | full-time | event | test | unknown>",
  "link": "<primary registration or application URL, or empty string>",
  "displayFields": [
    { "label": "<concise label>", "value": "<explicitly stated value>" }
  ],
  "skills": ["<skill 1>", "<skill 2>"],
  "timelineTitle": "<a concise 2-4 word description of what this specific email is for (e.g., 'Internship Invite', 'Interview Shortlist', 'Interview Reminder', 'Assessment Scheduled', 'Job Offer')>",
  "timelineSummary": "<a concise 1-sentence summary explaining the key details or action required in this specific email (e.g., 'Invited students to apply for an unpaid AI/IoT internship', 'Shortlisted 11 candidates and scheduled face-to-face interviews on July 1st', 'Sent a gentle reminder to confirm interview availability for today')>"
}

SKILLS RULES:
- Extract technical and soft skills explicitly required or mentioned in the email (e.g. "Python", "Machine Learning", "Node.js", "REST APIs").
- Return as a flat array of concise strings. Max 10. Return empty array [] if no skills are mentioned.
- Only extract skills explicitly stated in the email, not inferred from the role name.

DISPLAY FIELDS RULES:
- Extract all applicable fields (e.g. Role, CTC, Stipend, Deadline, Duration, Location, Joining) as displayFields. Do not limit the list size in your response; the system will prioritize and filter them. Only include fields with values EXPLICITLY stated in the email.
- NEVER extract or return "Eligibility". It is redundant as all recipients are eligible.
- Do NOT include empty, vague, or inferred values.
- Choose labels a student would want to see immediately on a card.
- Ignore forwarding footers entirely. NEVER use RIT, MSRIT, Placement Department, or Dean's name as a venue, location, or company.
- CRITICAL: Strongly prioritize fields based on the provided Opportunity Type (${opportunityType}):

  If JOB_APPLICATION: Extract Role, CTC, Stipend, Deadline, Duration, Location, Joining.
  If HACKATHON: Extract Event Name, Registration Deadline, Timeline, Prize Amount, Team Size, Mode, Organizer, Benefits.
  If WEBINAR: Extract Event Title, Date, Time, Speaker/Company.
  If OTHER_PLACEMENT_EVENT: Extract Event Title, Important Dates, Organizer, Mode.

SUBTITLE RULES (what shows as the tagline below the company name):
  Internship Opportunity    → program/team name (e.g. "IS Team Internship")
  New Hiring Opportunity    → role or position name
  Registration Link         → role or event name
  Assessment Announcement   → assessment type / platform (e.g. "Online Assessment on HackerEarth")
  Interview Schedule        → interview round (e.g. "Technical Interview Round 1")
  Interview Result          → shortlist/result milestone (e.g. "Final Selects")
  PPT Announcement          → presentation topic or "Pre-Placement Talk"
  Venue Update              → updated location/mode (e.g. "LHC Seminar Hall 1")
  Application Reminder      → role / opportunity name
  Deadline Reminder         → role / opportunity name
  Generic Placement Notice  → notice topic
  Hackathon / Event Invitation → event/competition name
  Workshop / Webinar        → workshop/webinar topic
  Expert Talk Series        → talk topic/theme
  Scholarship               → scholarship name
  Non-Recruitment Email     → main subject topic

COMPANY RULES:
- Return the actual hiring/organizing company name.
- NEVER return "Placement Department", "RIT", "MSRIT", "Ramaiah", "Training and Placement Cell", or any variation of the college placement department.
- If forwarded from an external HR/recruiter email (e.g. "...@wipro.com"), the company is "Wipro".
- If forwarded with a subject like "Campus Recruitment 2026 | Acme Technologies - ...", the company is "Acme Technologies".
- If no company is mentioned and it is an event, use the organizing body or domain.
- Clean up suffixes: return "Google" not "Google India Pvt Ltd", "Amazon" not "Amazon Development Centre India".

CLASSIFICATION GUIDE:
  emailType "job"   → hiring, internship, placement, recruitment, assessment, interview
  emailType "event" → hackathon, competition, webinar, workshop, expert talk, scholarship, event invitation
  emailType "nonRecruitment" → newsletter, announcement unrelated to placement

Subject: ${subject}
Sender: ${sender}
Body: ${truncatedBody}`;

  // ── Tier 1: Primary Model (Gemma 4 31B) ──────────────────────────────────
  console.log(`[NVIDIA_PRIMARY] Using ${PRIMARY_MODEL}`);
  const primaryResult = await executeSingleModelAttempt(PRIMARY_MODEL, prompt, 25000);

  if (primaryResult.success) {
    const validated = primaryResult.data;
    console.log(`[LLM_STRUCTURED] Primary model (${PRIMARY_MODEL}) succeeded: emailType=${validated.emailType}, classification=${validated.classification}, subtitle="${validated.subtitle}", displayFields=${JSON.stringify(validated.displayFields)}`);
    validated.parseMeta = {
      llmUsed: true,
      geminiUsed: true,
      model: PRIMARY_MODEL,
      llmProvider: PRIMARY_MODEL,
    };
    return { status: "success", data: validated, modelUsed: PRIMARY_MODEL };
  }

  console.warn(`[NVIDIA_PRIMARY_FAILED] Primary model (${PRIMARY_MODEL}) failed: ${primaryResult.reason}.`);

  // If the failure is a fatal authentication error (401/403), do NOT cycle credentials to secondary model
  if (primaryResult.errorType === "auth_error") {
    console.error(`[NVIDIA_AUTH_ERROR] Authentication/credential failure. Skipping secondary model fallback.`);
    return { status: "transport_error" };
  }

  // ── Tier 2: Secondary Fallback Model (Nemotron 3.5 Lightning) ─────────────
  console.log(`[NVIDIA_FALLBACK] Using ${FALLBACK_MODEL}`);
  const fallbackResult = await executeSingleModelAttempt(FALLBACK_MODEL, prompt, 20000);

  if (fallbackResult.success) {
    const validated = fallbackResult.data;
    console.log(`[NVIDIA_FALLBACK_SUCCESS] Secondary model (${FALLBACK_MODEL}) succeeded: emailType=${validated.emailType}, classification=${validated.classification}, subtitle="${validated.subtitle}", displayFields=${JSON.stringify(validated.displayFields)}`);
    validated.parseMeta = {
      llmUsed: true,
      geminiUsed: true,
      model: FALLBACK_MODEL,
      llmProvider: FALLBACK_MODEL,
    };
    return { status: "success", data: validated, modelUsed: FALLBACK_MODEL };
  }

  console.warn(`[NVIDIA_FALLBACK_FAILED] Secondary model (${FALLBACK_MODEL}) failed: ${fallbackResult.reason}. Dropping to deterministic fallback.`);
  return { status: fallbackResult.errorType || primaryResult.errorType || "transport_error" };
}

const callGeminiStructured = callLLMStructured;

/**
 * Deterministic fallback to extract displayFields when LLM fails (e.g. rate limits).
 * Uses lightweight regexes to pull out standard slots if present.
 */
function extractFallbackDisplayFields(body, opportunityType = "JOB_APPLICATION") {
  const fields = [];
  
  // Clean forwarded headers at the beginning of the text to prevent matching metadata like Subject
  let cleanBody = body || "";
  const lines = cleanBody.split(/\r?\n/);
  let headerIndex = 0;
  while (headerIndex < lines.length) {
    const line = lines[headerIndex].trim();
    if (line === "" || /^(?:from|subject|date|to|cc|bcc|sent)\s*:/i.test(line)) {
      headerIndex++;
    } else {
      break;
    }
  }
  if (headerIndex > 0) {
    cleanBody = lines.slice(headerIndex).join("\n");
  }
  
  const extract = (regex, label) => {
    const match = cleanBody.match(regex);
    if (match && match[1]) {
      // Clean and trim, taking at most 60 chars to avoid run-on sentences
      let val = match[1].trim();
      val = val.replace(/\s+/g, " ");
      if (val.length > 60) val = val.substring(0, 60).trim() + "...";
      if (label === "Time" && !isValidTimeString(val)) {
        return;
      }
      if (val) fields.push({ label, value: val });
    }
  };

  if (opportunityType === "HACKATHON") {
    extract(/\b(?:prize pool|cash prizes|total prize|win up to|rewards|prize)s?\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Prize");
    extract(/\b(?:team format|team size)\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Team Size");
    extract(/\b(?:registration deadline|registration & submission window|registration closes|register by|last date|apply by|submission window)s?\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Deadline");
    extract(/\b(?:eligibility|eligible batch|batch|eligible criteria)\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Eligibility");
  } else if (opportunityType === "WEBINAR" || opportunityType === "OTHER_PLACEMENT_EVENT") {
    extract(/\b(?:date|scheduled on)s?\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Date");
    extract(/\b(?:time)s?\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Time");
    extract(/\b(?:speaker|speaker profile|resource person)s?\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Speaker");
    extract(/\b(?:topic|agenda)s?\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Topic");
    extract(/\b(?:registration closes|registration deadline|last date|register by)s?\b[ \t]*[:\-][ \t]*([^•*\n\r]+)/i, "Deadline");
  } else {
    // Default JOB_APPLICATION
    extract(/\b(?:stipend|compensation)s?\b[ \t]*[:\-][ \t]*([^|•*\n\r]+)/i, "Stipend");
    extract(/\b(?:ctc|package|salary)s?\b[ \t]*[:\-][ \t]*([^|•*\n\r]+)/i, "CTC");
    extract(/\b(?:duration|period)s?\b[ \t]*[:\-][ \t]*([^|•*\n\r]+)/i, "Duration");
    extract(/\b(?:location|job location|venue)s?\b[ \t]*[:\-][ \t]*([^|•*\n\r]+)/i, "Location");
    extract(/\b(?:registration deadline|submission deadline|last date(?: to apply| for registration)?|register before|deadline)s?\b[ \t]*[:\-][ \t]*([^|•*\n\r]+)/i, "Deadline");
    extract(/\b(?:job\s+role|job\s+designation|job\s+title|role|designation|position)s?\b[ \t]*[:\-][ \t]*([^|•*\n\r]+)/i, "Role");
    extract(/\b(?:joining(?: date)?)\b[ \t]*[:\-][ \t]*([^|•*\n\r]+)/i, "Joining");
  }

  // Deduplicate by label (just in case) and return top 5
  const uniqueFields = [];
  const seenLabels = new Set();
  for (const f of fields) {
    if (!seenLabels.has(f.label)) {
      seenLabels.add(f.label);
      uniqueFields.push(f);
    }
  }
  return uniqueFields.slice(0, 5)
    .map(f => {
      let val = (f.value || "").trim().replace(/\s+/g, " ");
      val = val.replace(/^[-:;.,*•]+|[-:;.,*•]+$/g, "").trim();
      return { ...f, value: val };
    })
    .filter(f => {
      const valLower = f.value.toLowerCase();
      if (f.value.length < 3) return false;
      if (/^details?$/i.test(valLower)) return false;
      if (valLower.includes("will be") || valLower.includes("is as follows")) return false;
      return true;
    });
}

async function parseEmailWithLLM(subject, sender = "", fullBodyText = "", referenceDate = new Date(), rawText = "") {
  try {
    const preprocessed = preprocessBody(fullBodyText || rawText || "");
  const body = preprocessed.text;
  const forwarded = parseForwardedEmail(body);
  const sourceBody    = forwarded.body || body;
  const sourceSubject = (forwarded.subject || subject || "").trim();
  // Footer-stripped body passed to LLM — prevents placement-dept footers
  // from polluting LLM's understanding of location/company/fields.
  const footerStrippedBody = stripForwardingFooter(sourceBody);
  const linkInfo = extractFormLink(sourceBody);

  // ── Step 1: Deterministic classification (PRIMARY) ─────────────────────────
  const detClassification = classifyEmail({
    subject: sourceSubject,
    body: sourceBody,
    forwarded,
    hasLink: !!linkInfo.primary,
  });

  // ── Step 2: LLM Extraction (Google Gemma 4 31B) ─────────────────────────
  const llmResult = await callLLMStructured({
    subject: sourceSubject,
    sender,
    body: footerStrippedBody || sourceBody,
    opportunityType: detClassification.opportunityType || "JOB_APPLICATION",
  });

  const llmData = llmResult.status === "success" ? llmResult.data : null;
  const gemini = llmData; // alias for internal references
  const shouldRetry = llmResult.status === "transport_error";

  // ── Step 3: Three-tier company resolution ──────────────────────────────────
  //   Tier 1 (1.0)  — known alias from sender domain
  //   Tier 2 (0.85) — LLM company
  //   Tier 3 (var.) — deterministic fallback
  const candidateSenders = [forwarded.from, sender].filter(Boolean);
  let senderAliasCompany = "";
  for (const snd of candidateSenders) {
    const domainPart = companyFromSender(snd);
    if (domainPart) {
      const alias = matchKnownCompany(domainPart);
      if (alias) { senderAliasCompany = alias; break; }
    }
    const directAlias = matchKnownCompany(snd);
    if (directAlias) { senderAliasCompany = directAlias; break; }
  }

  const detCompanyObj = resolveCompany({ subject: sourceSubject, body: sourceBody, sender, forwarded });

  let company, companySource, companyConfidence;
  if (senderAliasCompany) {
    company = senderAliasCompany; companySource = "sender_alias"; companyConfidence = 1.0;
  } else if (llmData?.company && sanitizeCompany(llmData.company)) {
    company = sanitizeCompany(llmData.company); companySource = "llm"; companyConfidence = 0.85;
  } else {
    company = detCompanyObj.company; companySource = detCompanyObj.source; companyConfidence = detCompanyObj.confidence;
  }

  let resolvedCompany = company ? (sanitizeCompany(company) || "") : "";

  // Event & Non-job fallback for missing company:
  if (!resolvedCompany && (gemini?.emailType === "event" || detClassification.category === "workshopWebinar" || detClassification.category === "hackathonEvent")) {
    if (gemini?.domain && sanitizeCompany(gemini.domain)) {
      resolvedCompany = sanitizeCompany(gemini.domain);
      companySource = "domain_fallback";
      companyConfidence = 0.70;
    } else {
      // Check displayFields for organizer/speaker/host
      const hostField = (gemini?.displayFields || []).find(f =>
        /^(speaker\/company|organizer|host|speaker|company|presenter)$/i.test(f?.label)
      )?.value;
      if (hostField && sanitizeCompany(hostField)) {
        resolvedCompany = sanitizeCompany(hostField);
        companySource = "host_field";
        companyConfidence = 0.70;
      } else if (gemini?.subtitle && sanitizeCompany(gemini.subtitle)) {
        // Try extracting organizer from subtitle (e.g. "POD Expert Talk Series..." -> "POD")
        const firstWord = gemini.subtitle.split(/\s+/)[0];
        if (firstWord && sanitizeCompany(firstWord) && firstWord.length > 2) {
          resolvedCompany = sanitizeCompany(firstWord);
          companySource = "subtitle_prefix";
          companyConfidence = 0.60;
        }
      }
    }
  }

  if (!resolvedCompany) { companySource = "none"; companyConfidence = 0; }

  // ── Step 4: Classification arbitration (relative confidence) ──────────────
  const detConf = detClassification.confidence || 0;
  const effectiveLlmConf = gemini?.classification
    ? (gemini.classificationConfidence ? gemini.classificationConfidence / 100 : 0.85)
    : 0;

  let finalClassification, classificationReason;
  let emailType, finalType, finalConfidence;

  if (gemini?.classification && gemini?.emailType) {
    const detIsPrimary = INTENT_TIER[detClassification.category] === "primary";
    const detIsSecondaryOrGeneric = INTENT_TIER[detClassification.category] === "secondary" || detClassification.category === "genericNotice";

    if (detIsPrimary && detConf >= 0.90 && effectiveLlmConf < 0.80) {
      finalClassification = detClassification.classification;
      emailType = detClassification.category === "hackathonEvent" || detClassification.category === "workshopWebinar" ? "event" :
                  detClassification.category === "nonRecruitment" ? "nonRecruitment" : "job";
      finalType = detClassification.type;
      finalConfidence = detConf;
      classificationReason = `deterministic preserved: "${detClassification.classification}" (det=${detConf.toFixed(2)}) is high-confidence primary-tier`;
    } else if (detIsSecondaryOrGeneric && effectiveLlmConf >= 0.70) {
      finalClassification = gemini.classification;
      emailType = gemini.emailType;
      finalType = gemini.type ?? detClassification.type;
      finalConfidence = effectiveLlmConf;
      classificationReason = `llm preferred: "${gemini.classification}" (llm=${effectiveLlmConf.toFixed(2)}) supersedes secondary deterministic "${detClassification.classification}" (det=${detConf.toFixed(2)})`;
    } else if (effectiveLlmConf >= detConf) {
      finalClassification = gemini.classification;
      emailType = gemini.emailType;
      finalType = gemini.type ?? detClassification.type;
      finalConfidence = effectiveLlmConf;
      classificationReason = `llm preferred: "${gemini.classification}" (llm=${effectiveLlmConf.toFixed(2)}) >= det="${detClassification.classification}" (det=${detConf.toFixed(2)})`;
    } else {
      finalClassification = detClassification.classification;
      emailType = detClassification.category === "hackathonEvent" || detClassification.category === "workshopWebinar" ? "event" :
                  detClassification.category === "nonRecruitment" ? "nonRecruitment" : "job";
      finalType = detClassification.type;
      finalConfidence = detConf;
      classificationReason = `deterministic preferred: "${detClassification.classification}" (det=${detConf.toFixed(2)}) > llm="${gemini.classification}" (llm=${effectiveLlmConf.toFixed(2)})`;
    }
  } else if (gemini?.classification) {
    finalClassification = gemini.classification;
    emailType = gemini.emailType ?? (detClassification.category === "hackathonEvent" ? "event" : "job");
    finalType = gemini.type ?? detClassification.type;
    finalConfidence = effectiveLlmConf;
    classificationReason = `llm only: "${gemini.classification}" (llm=${effectiveLlmConf.toFixed(2)})`;
  } else {
    finalClassification = detClassification.classification;
    emailType = detClassification.category === "hackathonEvent" || detClassification.category === "workshopWebinar" ? "event" :
                detClassification.category === "nonRecruitment" ? "nonRecruitment" : "job";
    finalType = detClassification.type;
    finalConfidence = detConf;
    classificationReason = `deterministic fallback (llm unavailable): "${detClassification.classification}" (det=${detConf.toFixed(2)})`;
  }

  const CLASSIFICATION_TO_OPP_TYPE = {
    "Hackathon / Event Invitation": "HACKATHON",
    "Workshop / Webinar": "WEBINAR",
    "Expert Talk Series": "WEBINAR",
    "PPT Announcement": "OTHER_PLACEMENT_EVENT",
    "Venue Update": "OTHER_PLACEMENT_EVENT",
    "Non-Recruitment Email": "OTHER_PLACEMENT_EVENT",
  };
  const inferredOppType = CLASSIFICATION_TO_OPP_TYPE[finalClassification];
  const finalOppType = inferredOppType || gemini?.opportunityType || detClassification.opportunityType || "JOB_APPLICATION";

  const finalStatus = "new";

  console.log(`[CLASSIFICATION_DECISION] ${classificationReason}\nemailType="${emailType}" opportunityType="${finalOppType}" type="${finalType}"`);

  let displayFields = gemini?.displayFields || [];
  if (displayFields.length === 0) {
    displayFields = extractFallbackDisplayFields(sourceBody, detClassification.opportunityType);
  }

  displayFields = displayFields
    .map(f => {
      let val = (f.value || "").trim().replace(/\s+/g, " ");
      val = val.replace(/^[-:;.,*•]+|[-:;.,*•]+$/g, "").trim();
      val = cleanDisplayFieldValue(f.label, val);
      return { ...f, value: val };
    })
    .map(f => {
      const result = validateDisplayField(f.label, f.value);
      if (!result.valid) return null;
      return { label: f.label, value: result.value };
    })
    .filter(Boolean);

  if (displayFields.length > 5) {
    const oppType = detClassification.opportunityType || "JOB_APPLICATION";
    const priorities = FIELD_PRIORITY[oppType] || FIELD_PRIORITY.JOB_APPLICATION;
    displayFields.sort((a, b) => {
      const aIdx = priorities.findIndex(p => a.label.toLowerCase().includes(p));
      const bIdx = priorities.findIndex(p => b.label.toLowerCase().includes(p));
      const aPriority = aIdx >= 0 ? aIdx : priorities.length;
      const bPriority = bIdx >= 0 ? bIdx : priorities.length;
      return aPriority - bPriority;
    });
    displayFields = displayFields.slice(0, 5);
  }

  const isJobEmail = emailType === "job";
  const displayFieldsRole = (displayFields || []).find(f =>
    /^(role|roles|position|designation|job\s*role|job\s*title)$/i.test(f?.label)
  )?.value || "";
  const fallbackRole = displayFieldsRole || extractFallbackRole(sourceSubject, sourceBody);
  const roleField = isJobEmail ? (fallbackRole || "Unknown Role") : (emailType === "event" ? "Event" : "Unknown Role");

  let subtitle, subtitleSource;
  if (gemini?.subtitle) {
    subtitle = gemini.subtitle;
    subtitleSource = "llm";
  } else {
    const fallback = (roleField !== "Unknown Role" && isJobEmail ? roleField : "")
      || generateSubtitleFallback(sourceSubject, sourceBody, detClassification.category);
    if (fallback) {
      subtitle = fallback;
      subtitleSource = "fallback_extractor";
    } else {
      subtitle = "";
      subtitleSource = "none";
    }
  }
  console.log(`[SUBTITLE_DECISION] subtitle="${subtitle}" source="${subtitleSource}"`);

  const detTitle = generateTitle(resolvedCompany, detClassification.category, sourceSubject, roleField, sourceBody);

  const deadlineField = displayFields.find(f =>
    /deadline|due date|last date|closing date/i.test(f.label)
  );
  const resolvedDeadlineISO = deadlineField
    ? resolveDeadlineISO(deadlineField.value, referenceDate)
    : "";

  const isDev = process.env.NODE_ENV !== "production";
  const parseTrace = isDev ? {
    preprocessing: {
      originalLength: preprocessed.originalLength,
      cleanedLength: preprocessed.cleanedLength,
      decisions: preprocessed.decisions,
    },
    gemini: {
      company:        gemini?.company        ?? null,
      classification: gemini?.classification ?? null,
      classificationConfidence: gemini?.classificationConfidence ?? null,
      emailType:      gemini?.emailType      ?? null,
      subtitle:       gemini?.subtitle       ?? null,
      displayFields:  gemini?.displayFields  ?? [],
    },
    deterministic: {
      company:        detCompanyObj.company  || null,
      source:         detCompanyObj.source,
      confidence:     detCompanyObj.confidence,
      classification: detClassification.classification,
      classificationConfidence: detClassification.confidence,
      category:       detClassification.category,
      intentTier:     INTENT_TIER[detClassification.category] || "unknown",
      senderAlias:    senderAliasCompany     || null,
    },
    reasoning: {
      company: {
        winner: companySource,
        resolvedCompany,
        confidence: companyConfidence,
      },
      classification: {
        reason: classificationReason,
      },
      subtitle: {
        source: subtitleSource,
      },
      displayFields: {
        source: (gemini?.displayFields?.length > 0) ? "gemini" : "fallback_extractor",
        count: displayFields.length,
      },
    },
  } : undefined;

  const parsed = {
    emailType,
    opportunityType: finalOppType,
    isRelevant:     emailType !== "nonRecruitment",
    classification: finalClassification,
    type:           finalType,
    status:         finalStatus,
    confidenceScore: typeof finalConfidence === "number" ? finalConfidence : Math.min(1, detClassification.confidence + (resolvedCompany ? 0.05 : 0)),
    timelineTitle:   gemini?.timelineTitle   || "",
    timelineSummary: gemini?.timelineSummary || "",

    company:  resolvedCompany,
    domain:   gemini?.domain || "",
    subtitle,
    role:     roleField,
    title:    subtitle || detTitle || (resolvedCompany ? `${resolvedCompany} Opportunity` : "Unknown Opportunity"),
    processId:   buildProcessId(resolvedCompany),
    processName: `${resolvedCompany || "Unknown Company"} hiring process`,

    displayFields,
    skills: gemini?.skills || [],

    ...(() => {
      const derived = deriveFromDisplayFields(displayFields);
      const resolvedEventDate = resolveEventDateISO(derived.eventDateText, derived.eventTime, referenceDate);
      return {
        fieldsToDisplay: [],
        programRoles:    derived.programRoles,
        programStipend:  derived.programStipend,
        programDuration: derived.programDuration,
        salaryText:      derived.salaryText,
        venue:           derived.venue,
        deadlineText:    derived.deadlineText,
        deadlineISO:     resolvedDeadlineISO,
        eventDate:       resolvedEventDate,
        eventTime:       derived.eventTime,
        reportingTime:   derived.eventTime,
      };
    })(),

    // Links (still from deterministic link extractor)
    link:       linkInfo.primary || gemini?.link || "",
    links:      linkInfo.all.length ? linkInfo.all : gemini?.link ? [gemini.link] : [],
    isFormLink: linkInfo.isForm || /docs\.google\.com\/forms|forms\.gle/.test(linkInfo.primary || gemini?.link || ""),

    // Legacy slots kept for schema compatibility
    jobRole:       "",

    // Parse metadata
    parseMeta: {
      sourceSubject,
      forwarded:            forwarded.isForwarded,
      sender,
      classificationSource: detClassification.classification,
      companySource,
      companyConfidence,
      hasLink:              !!linkInfo.primary,
      shouldRetry,
      llmProvider:          llmResult.modelUsed || (llmResult.status === "success" ? PRIMARY_MODEL : "none"),
      model:                llmResult.modelUsed || "none",
      llmStatus:            llmResult.status,
      llmUsed:              llmResult.status === "success",
      geminiUsed:           llmResult.status === "success",
      llmEmailType:         llmData?.emailType      ?? null,
      llmClassification:    llmData?.classification ?? null,
      geminiEmailType:      llmData?.emailType      ?? null,
      geminiClassification: llmData?.classification ?? null,
      ...(parseTrace ? { trace: parseTrace } : {}),
    },
  };

  console.log(
    `[PARSER_SUMMARY] Company: ${parsed.company || "None"} (via ${companySource}) | emailType: ${emailType} | Classification: ${parsed.classification} | subtitle: "${parsed.subtitle}" | displayFields: ${parsed.displayFields.length} fields`
  );

  if (isDev && parseTrace) {
    console.log("[PARSER_TRACE]", JSON.stringify(parseTrace, null, 2));
  }

  return parsed;
  } catch (error) {
    console.error("[PARSE_FATAL_ERROR]", error);
    return {
      emailType: "job",
      opportunityType: "JOB_APPLICATION",
      isRelevant: false,
      classification: "Generic Placement Notice",
      type: "unknown",
      status: "new",
      confidenceScore: 0,
      company: "",
      subtitle: "",
      role: "Unknown Role",
      title: "Parsing Failed",
      displayFields: [],
      fieldsToDisplay: [],
      parseMeta: {
        shouldRetry: false,
        llmProvider: "unknown",
        llmStatus: "fatal_error",
        geminiUsed: false
      }
    };
  }
}

function extractText(payload) {
  if (!payload) return null;
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractText(part);
      if (text) return text;
    }
  }
  return null;
}

function extractHtml(payload) {
  if (!payload) return null;
  if (payload.mimeType === "text/html" && payload.body?.data) {
    let html = Buffer.from(payload.body.data, "base64").toString("utf-8");
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<!--[\s\S]*?-->/g, "");
    html = html.replace(/<br\s*\/?>/gi, "\n");
    html = html.replace(/<\/(p|div|tr|li|h[1-6]|thead|tbody|tfoot)>/gi, "\n");
    html = html.replace(/<(p|div|tr|li|h[1-6]|thead|tbody|tfoot)[^>]*>/gi, "\n");
    html = html.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (match, href, text) => {
      const cleanText = text.replace(/<[^>]*>/g, "").trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
        return cleanText;
      }
      return cleanText ? `${cleanText} (${href})` : href;
    });
    html = html.replace(/<[^>]*>/g, "");
    return html;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const html = extractHtml(part);
      if (html) return html;
    }
  }
  return null;
}

function getFullBodyText(payload) {
  if (!payload) return "";
  const htmlRaw = extractHtml(payload);
  const textRaw = extractText(payload);
  
  let text = "";
  if (htmlRaw && textRaw) {
    text = mergeAlternativeTexts(htmlRaw, textRaw);
  } else {
    text = htmlRaw || textRaw || "";
  }
  text = he.decode(text);
  if (text.length > 20000) {
    text = text.slice(-20000);
  }
  return text;
}

module.exports = {
  parseEmailWithLLM,
  parseEmailWithSingleFlight,
  inFlightParses,
  isValidTimeString,
  matchKnownCompany,
  classifyEmail,
  resolveCompany,
  extractFormLink,
  extractFallbackDisplayFields,
  preprocessBody,
  cleanDisplayFieldValue,
  validateDisplayField,
  resolveDeadlineISO,
  resolveEventDateISO,
  deriveFromDisplayFields,
  mergeAlternativeTexts,
  getFullBodyText,
  sanitizeCompany
};
