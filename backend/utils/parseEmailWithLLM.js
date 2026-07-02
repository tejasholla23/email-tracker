const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.5-flash";

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

  // ── Extract time component (e.g. "10 PM", "5:30 AM") ──────────────────────
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  let hours = 0, minutes = 0;
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3].toLowerCase();
    if (meridian === "pm" && hours !== 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
  }

  const lower = text.toLowerCase();

  // ── Relative dates: "today", "tomorrow" ────────────────────────────────────
  if (/\btoday\b/i.test(lower)) {
    const d = new Date(referenceDate);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  }
  if (/\btomorrow\b/i.test(lower)) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + 1);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  }

  // ── Absolute dates ─────────────────────────────────────────────────────────
  // Strip ordinal suffixes (1st, 2nd, 3rd, 4th, etc.) for Date.parse
  const cleaned = text.replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");

  // Try parsing the cleaned text directly
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    if (timeMatch) {
      parsed.setHours(hours, minutes, 0, 0);
    }
    return parsed.toISOString();
  }

  // Try extracting just the date portion ("25 June 2026", "June 25, 2026", etc.)
  const datePattern = /(?:(\d{1,2})\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)[,\s]+(\d{4})|(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})[,\s]+(\d{4}))/i;
  const dateMatch = cleaned.match(datePattern);
  if (dateMatch) {
    let dateStr;
    if (dateMatch[1]) {
      // day month year
      dateStr = `${dateMatch[2]} ${dateMatch[1]}, ${dateMatch[3]}`;
    } else {
      // month day year
      dateStr = `${dateMatch[4]} ${dateMatch[5]}, ${dateMatch[6]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      if (timeMatch) {
        d.setHours(hours, minutes, 0, 0);
      }
      return d.toISOString();
    }
  }

  return "";
}

/**
 * Priority ordering maps for display fields by opportunity type.
 * Used ONLY when more than 5 valid fields are returned (to select top 5).
 */
const FIELD_PRIORITY = {
  JOB_APPLICATION: ["role", "deadline", "last date", "due date", "closing date", "ctc", "stipend", "duration", "location", "eligibility", "joining"],
  HACKATHON: ["registration deadline", "deadline", "last date", "due date", "closing date", "prize", "prize pool", "team size", "eligibility", "mode", "organizer", "timeline"],
  WEBINAR: ["date", "time", "speaker", "topic", "eligibility"],
  OTHER_PLACEMENT_EVENT: ["date", "time", "organizer", "mode", "eligibility"],
};

/**
 * Patterns that indicate a field label boundary inside a value string.
 * Used to detect when Gemini has merged two fields together.
 */
const FIELD_LABEL_PATTERNS = /\b(?:Stipend|CTC|Duration|Location|Deadline|Role|Eligibility|Joining|Venue|Date|Time|Mode|Prize|Team Size|Speaker|Topic|Organizer|Registration Deadline|Type|Salary|Package|Compensation)\s*:/i;

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
    text = text.replace(/<[^>]*>/g, " ");
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

function extractCompanyFromText(text = "") {
  const cleanedText = cleanMarkdown(normalizeText(text));
  const aliasMatch = matchKnownCompany(cleanedText);
  if (aliasMatch) return aliasMatch;

  const patterns = [
    /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\s+(?:Pvt\b\.?\s*Ltd\b\.?|Private\s+Limited|Ltd\b\.?|Limited|Inc\b\.?|Incorporated|Corp\b\.?|Corporation|LLC|India\b\s+(?:Pvt\b\.?\s*Ltd\b\.?|Ltd\b\.?|Limited))\b/,
    /(?:Company|Organization|Employer|Recruiter)\s*[:\-]\s*([A-Z][A-Za-z0-9&.\s]{1,80}?)(?:\s*(?:\.|,|;|$))/i,
    /(?:from|by|at)\s+([A-Z][A-Za-z0-9&.\s]{1,60}?)(?=\s+(?:for|about|regarding|hiring|is|offers?|invites?|interview|role|drive|program|placement|campus|job|internship))/i,
    /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\b(?=\s+(?:is|has|offers|invites|announces|conducts|hiring|drives|for|regarding|registered))/,
    /\b(amazon|google|microsoft|tcs|deloitte|accenture|cognizant|infosys|wipro|blackrock|ibm|flipkart|uber|intel|capgemini|hcl|bosch|dell|nokia|haber|altair)\b/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      const candidate = sanitizeCompany(match[1]);
      if (candidate && !isGenericCompanyName(candidate)) {
        const lowerCand = candidate.toLowerCase();
        if (lowerCand !== "here" && lowerCand !== "there" && lowerCand !== "this" && !lowerCand.startsWith("potential")) {
          return candidate;
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

  const invalid = ["", "unknown", "n/a", "na", "none", "company", "team", "the company", "our company", "hiring team", "mandatory", "invitation", "eligibility criteria", "design", "registration", "assessment", "interview", "reminder", "opportunity", "deadline", "hiring process", "campus recruitment", "placement drive", "aptitude test", "roadshow", "sep roadshow", "lpa registration", "guidelines", "instructions"];
  const rejectIfContains = [
    "your institution", "your college", "your university", "your institute",
    "register", "registration", "apply by", "application", "last date",
    "subject", "dear sir", "dear madam", "please find", "please register",
    "inbox", "forwarded message", "authorised signatory",
    "dear students", "kindly", "venue", "today", "tomorrow", "assessment",
    "online test", "placement", "recruitment", "opportunity", "hiring",
    "drive"
  ];
  if (invalid.includes(lower)) return null;
  if (rejectIfContains.some((term) => lower.includes(term))) return null;
  if (/\b(your|our|this|the)\s+(institution|college|university|institute)\b/.test(lower)) return null;

  if (/[.!?][\sA-Za-z]/.test(trimmed)) return null;

  return trimmed;
}

const PLATFORM_TERMS = [
  "microsoft teams",
  "google forms",
  "google meet",
  "zoom meeting",
  "webex",
  "brazen",
  "calendly",
  "unstop"
];

function stripPlatformReferences(text = "") {
  let cleaned = text;
  cleaned = cleaned.replace(/https?:\/\/[^\s<>"']+/gi, "");
  for (const term of PLATFORM_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    cleaned = cleaned.replace(regex, "");
  }
  return cleaned;
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
  "students", "all", "sir", "madam", "team",
]);

function extractCompanyFromSignature(body = "") {
  const sigMatches = [
    /(?:regards|thanks|sincerely|best|greetings)\s*,?\s+(?:team\s+)?([A-Z][A-Za-z0-9&.\-\s]{2,40})/i,
    /\bteam\s+([A-Z][A-Za-z0-9&.\-\s]{2,40})/i
  ];
  const lastPart = body.slice(-1000);
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

  // 2. Verified sender/signature information / aliases
  const candidates = [cleanFwdSubject, forwarded.from, cleanSubject, cleanBody, sender].filter(Boolean);
  for (const candidate of candidates) {
    const known = matchKnownCompany(candidate);
    if (known) return { company: known, source: 'alias', confidence: 1.0 };
  }

  const signatureCompany = extractCompanyFromSignature(cleanBody || cleanFwdBody);
  if (signatureCompany) {
    return { company: signatureCompany, source: 'signature', confidence: 0.9 };
  }

  // 3/4. Regex fallbacks
  const subjectCompany = extractCompanyFromText(cleanSubject || cleanFwdSubject);
  if (subjectCompany) return { company: subjectCompany, source: 'subject', confidence: 0.7 };

  const bodyCompany = extractCompanyFromText(cleanBody || cleanFwdBody);
  if (bodyCompany) return { company: bodyCompany, source: 'body', confidence: 0.6 };

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

  if (/\btoday\b/.test(lower)) {
    return new Date(referenceDate);
  }
  if (/\btomorrow\b/.test(lower)) {
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
    if (/\b(deadline|last date|apply by|register by|submit by|submission deadline|before .* today|before .* tomorrow)\b/i.test(line)) {
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
    /(?:hiring|recruitment|opportunity for|opening for|requirement for)\s+([A-Z][a-zA-Z0-9&.\-\s]{2,50}?\s+Role)\b/i,
    /(?:hiring|recruitment|opportunity for|opening for|requirement for)\s+([A-Z][a-zA-Z0-9&.\-\s]{2,50}?)(?=\s+(?:at|program|opportunity|hiring|drive|placement|campus|job|internship|with))/i,
    /\b(?:role|profile|designation|job\s+title)\s*[:\-]\s*([A-Z][a-zA-Z0-9&.\-\s]{2,50}?)(?:\s*(?:\.|,|;|$|\r|\n))/i
  ];

  for (const pattern of subjectPatterns) {
    const match = subject.match(pattern);
    if (match && match[1]) {
      const cleaned = cleanProgramValue(match[1]);
      if (cleaned && cleaned.length > 2 && !/^(?:intern|internship|job|opportunity|drive|hiring)$/i.test(cleaned)) {
        return cleaned;
      }
    }
  }

  // 2. Fall back to extracting roles from body
  const bodyRole = extractProgramRoles(body);
  if (bodyRole && bodyRole !== "Internship" && bodyRole !== "Apprentice" && bodyRole.length > 3) {
    return bodyRole;
  }

  return "";
}

function extractProgramRoles(text = "") {
  const cleanedText = cleanMarkdown(text);
  const patterns = [
    /(?:Roles|Positions|Openings)\s*[:\-]\s*([^\r\n]+?)(?:\s+(?:Branches|Department|CGPA|CTC|Package))/i,
    /(?:Roles|Positions|Openings)\s*[:\-]\s*([^\r\n.!]+)/i,
    /(?:Role|Position|Opening)\s*-\s*([^\r\n.!]+)/i,
    /Job\s+Designation\s*[:\-]\s*([^\r\n.!]+)/i,
    /(?:hiring|internship|apprentice)\s+(?:role|program|opening)s?\s*[:\-]\s*([^\r\n.!]+)/i,
  ];
  const headerSkip = ["details", "benefits", "criteria", "eligibility", "requirements", "description", "overview"];
  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match && match[1]) {
      const extracted = cleanProgramValue(match[1]);
      const lowerExtracted = extracted.toLowerCase();
      if (extracted && extracted.length < 150 && !headerSkip.includes(lowerExtracted)) return extracted;
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
// Gemini structured call â€” primary LLM integration
// ---------------------------------------------------------------------------

/**
 * Valid email types returned by Gemini.
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
 * Validate and sanitize the raw JSON object returned by Gemini.
 * Returns a clean, schema-conformant object, or null if fatally invalid.
 */
function validateGeminiResponse(raw) {
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


/**
 * Call Gemini with a structured prompt that returns company, classification,
 * subtitle, and a flexible displayFields array of {label, value} pairs.
 * Falls back to null on any error.
 */
async function callGeminiStructured({ subject = "", sender = "", body = "", opportunityType = "JOB_APPLICATION" }) {
  const truncatedBody = body.length > 3000 ? body.substring(0, 3000) + "..." : body;

  const prompt = `You are a smart placement-email parser for a college student dashboard. Analyze the email and return ONLY valid JSON â€” no markdown, no explanation.

CONTEXT: Emails are forwarded from a campus placement department (MSRIT/RIT). The ACTUAL company is the ORIGINAL SENDER â€” NOT the forwarding institution. Ignore all forwarding footers ("Regards, Placement Department, RIT/MSRIT").

Return exactly this JSON schema:
{
  "emailType": "<job | event | nonRecruitment>",
  "opportunityType": "<JOB_APPLICATION | HACKATHON | WEBINAR | OTHER_PLACEMENT_EVENT>",
  "classification": "<one of: New Hiring Opportunity | Internship Opportunity | Registration Link | Application Reminder | PPT Announcement | Assessment Announcement | Interview Schedule | Interview Result | Venue Update | Deadline Reminder | Generic Placement Notice | Hackathon / Event Invitation | Workshop / Webinar | Expert Talk Series | Scholarship | Non-Recruitment Email>",
  "company": "<actual organizing company â€” see COMPANY RULES>",
  "domain": "<official website domain of the company (e.g., wipro.com, atos.net, eightfold.ai), or empty string if unknown. Prioritize IT/tech service companies when ambiguous>",
  "subtitle": "<program/event/role name shown below the company name on the card â€” see SUBTITLE RULES>",
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
- Extract all applicable fields (e.g. Role, CTC, Stipend, Deadline, Duration, Location, Joining, Eligibility) as displayFields. Do not limit the list size in your response; the system will prioritize and filter them. Only include fields with values EXPLICITLY stated in the email.
- Do NOT include empty, vague, or inferred values.
- Choose labels a student would want to see immediately on a card.
- Ignore forwarding footers entirely. NEVER use RIT, MSRIT, Placement Department, or Dean's name as a venue, location, or company.
- CRITICAL: Strongly prioritize fields based on the provided Opportunity Type (${opportunityType}):

  If JOB_APPLICATION: Extract Role, CTC, Stipend, Deadline, Duration, Location, Joining, Eligibility.
  If HACKATHON: Extract Event Name, Registration Deadline, Timeline, Prize Amount, Eligibility, Team Size, Mode, Organizer, Benefits.
  If WEBINAR: Extract Event Title, Date, Time, Speaker/Company, Eligibility.
  If OTHER_PLACEMENT_EVENT: Extract Event Title, Important Dates, Organizer, Mode.

SUBTITLE RULES (what shows as the tagline below the company name):
  Internship Opportunity    â†’ program/team name (e.g. "IS Team Internship")
  New Hiring Opportunity    â†’ role or position name
  Hackathon / Event Invitation â†’ event name (e.g. "InnoVent-27", "HackVega 2.0")
  Workshop / Webinar        â†’ session/program name (e.g. "Ericsson Edge Academy")
  Expert Talk Series        â†’ full series name (e.g. "POD Expert Talk Series on Databases")
  Registration Link         â†’ concise description of what to register for
  Non-Recruitment Email     â†’ empty string""

COMPANY RULES:
1. Use the ACTUAL ORGANIZING ENTITY â€” not the forwarding institution.
2. For forwarded emails, use original sender company from the "Forwarded message From:" or signature.
3. NEVER use: MSRIT, RIT, Ramaiah Institute, Placement Department, Dean.
4. NEVER use generic phrases: "Here", "Seeking", "Potential opportunities", "Greetings".
5. Ignore platform names (Teams, Zoom, Google Forms, Unstop, Brazen) when identifying company.

CLASSIFICATION GUIDE:
  emailType "job"   â†’ hiring, internship, placement, recruitment, assessment, interview
  emailType "event" â†’ hackathon, competition, webinar, workshop, expert talk, scholarship, event invitation
  emailType "nonRecruitment" â†’ newsletter, announcement unrelated to placement

Subject: ${subject}
Sender: ${sender}
Body: ${truncatedBody}`;

  let retries = 3;
  let delayMs = 6000;

  while (retries > 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: { abortSignal: controller.signal }
      });
      clearTimeout(timeoutId);

      let jsonText = (response.text || "").trim();
      jsonText = jsonText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

      let rawParsed;
      try {
        rawParsed = JSON.parse(jsonText);
      } catch (parseErr) {
        console.error(`[GEMINI_STRUCTURED] JSON parse failed using ${MODEL_NAME}:`, parseErr.message);
        return { status: "content_error" };
      }

      console.log("[GEMINI_RAW_RESPONSE]", JSON.stringify(rawParsed, null, 2));
      console.log("RAW_DISPLAY_FIELDS", rawParsed.displayFields);
      
      const validated = validateGeminiResponse(rawParsed);

      if (!validated) {
        console.warn("[GEMINI_STRUCTURED] Response failed schema validation, discarding.");
        return { status: "content_error" };
      }

      console.log("VALIDATED_DISPLAY_FIELDS", validated.displayFields);
      console.log(`[GEMINI_STRUCTURED] emailType=${validated.emailType}, classification=${validated.classification}, subtitle="${validated.subtitle}", displayFields=${JSON.stringify(validated.displayFields)}`);
      return { status: "success", data: validated };

    } catch (err) {
      retries--;
      const errorMsg = err?.message || err;
      
      if (err.name === "AbortError") {
        console.warn(`[GEMINI_STRUCTURED] Request timed out. Retries left: ${retries}`);
      } else if (errorMsg.toString().includes("429") || errorMsg.toString().toLowerCase().includes("quota") || errorMsg.toString().toLowerCase().includes("rate")) {
        console.warn(`[GEMINI_STRUCTURED] Rate limit hit (429). Retries left: ${retries}. Waiting ${delayMs}ms...`);
      } else if (errorMsg.toString().includes("503") || errorMsg.toString().toLowerCase().includes("overloaded")) {
        console.warn(`[GEMINI_STRUCTURED] Service unavailable (503). Retries left: ${retries}. Waiting ${delayMs}ms...`);
      } else {
        console.error("[GEMINI_STRUCTURED] Failed with unrecoverable error:", errorMsg);
        return { status: "transport_error" };
      }

      if (retries > 0) {
        await new Promise(r => setTimeout(r, delayMs));
        delayMs += 4000; // Increase backoff penalty
      } else {
        console.error("[GEMINI_STRUCTURED] Final failure after all retries.");
        return { status: "transport_error" };
      }
    }
  }
  return { status: "transport_error" };
}

/**
 * Deterministic fallback to extract displayFields when Gemini fails (e.g. rate limits).
 * Uses lightweight regexes to pull out standard slots if present.
 */
function extractFallbackDisplayFields(body, opportunityType = "JOB_APPLICATION") {
  const fields = [];
  
  const extract = (regex, label) => {
    const match = body.match(regex);
    if (match && match[1]) {
      // Clean and trim, taking at most 60 chars to avoid run-on sentences
      let val = match[1].trim();
      val = val.replace(/\s+/g, " ");
      if (val.length > 60) val = val.substring(0, 60).trim() + "...";
      if (val) fields.push({ label, value: val });
    }
  };

  if (opportunityType === "HACKATHON") {
    extract(/(?:prize pool|cash prizes|total prize|win up to|rewards|prize)[ \t:]*([^•*\n\r]+)/i, "Prize");
    extract(/(?:team format|team size)[ \t:]*([^•*\n\r]+)/i, "Team Size");
    extract(/(?:who can participate|who can apply|eligibility(?: criteria(?: for participation)?)?)[ \t:]*[\n\r]*[ \t]*([^•*\n\r]+)/i, "Eligibility");
    extract(/(?:registration deadline|registration & submission window|registration closes|register by|last date|apply by|submission window)[ \t:]*([^•*\n\r]+)/i, "Deadline");
  } else if (opportunityType === "WEBINAR" || opportunityType === "OTHER_PLACEMENT_EVENT") {
    extract(/(?:date|scheduled on)[ \t:]*([^•*\n\r]+)/i, "Date");
    extract(/(?:time)[ \t:]*([^•*\n\r]+)/i, "Time");
    extract(/(?:speaker|speaker profile|resource person)[ \t:]*([^•*\n\r]+)/i, "Speaker");
    extract(/(?:eligibility|eligible|who can apply(?: criteria(?: for participation)?)?)[ \t:]*[\n\r]*[ \t]*([^•*\n\r]+)/i, "Eligibility");
    extract(/(?:topic|agenda)[ \t:]*([^•*\n\r]+)/i, "Topic");
    extract(/(?:registration closes|registration deadline|last date|register by)[ \t:]*([^•*\n\r]+)/i, "Deadline");
  } else {
    // Default JOB_APPLICATION
    extract(/(?:stipend|compensation)[ \t:]*([^-|•*\n\r]+)/i, "Stipend");
    extract(/(?:ctc|package|salary)[ \t:]*([^-|•*\n\r]+)/i, "CTC");
    extract(/(?:duration|period)[ \t:]*([^-|•*\n\r]+)/i, "Duration");
    extract(/(?:location|job location|venue)[ \t:]*([^-|•*\n\r]+)/i, "Location");
    extract(/(?:deadline|last date(?: to apply| for registration)?|register before)[ \t:]*([^-|•*\n\r]+)/i, "Deadline");
    extract(/(?:role|designation|position)[ \t:]*([^-|•*\n\r]+)/i, "Role");
    extract(/(?:joining(?: date)?)[ \t:]*([^-|•*\n\r]+)/i, "Joining");
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
  // Footer-stripped body passed to Gemini â€” prevents placement-dept footers
  // from polluting Gemini's understanding of location/company/fields.
  const footerStrippedBody = stripForwardingFooter(sourceBody);
  const linkInfo = extractFormLink(sourceBody);

  // â”€â”€ Step 1: Deterministic classification (PRIMARY) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const detClassification = classifyEmail({
    subject: sourceSubject,
    body: sourceBody,
    forwarded,
    hasLink: !!linkInfo.primary,
  });

  // â”€â”€ Step 2: Gemini LLM Extraction â”€â”€â”€â”€â”€â”€â”€â”€
  const geminiResult = await callGeminiStructured({
    subject: sourceSubject,
    sender,
    body: footerStrippedBody || sourceBody,
    opportunityType: detClassification.opportunityType || "JOB_APPLICATION",
  });

  const gemini = geminiResult.status === "success" ? geminiResult.data : null;
  const shouldRetry = geminiResult.status === "transport_error";

  // â”€â”€ Step 3: Three-tier company resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //   Tier 1 (1.0)  â€” known alias from sender domain
  //   Tier 2 (0.85) â€” Gemini company
  //   Tier 3 (var.) â€” deterministic fallback
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
  if (!senderAliasCompany) {
    const aliasHint = `${forwarded.from || ""} ${sourceSubject}`;
    const subjectAlias = matchKnownCompany(aliasHint);
    if (subjectAlias) senderAliasCompany = subjectAlias;
  }

  const detCompanyObj = resolveCompany({ subject: sourceSubject, body: sourceBody, sender, forwarded });

  let company, companySource, companyConfidence;
  if (senderAliasCompany) {
    company = senderAliasCompany; companySource = "sender_alias"; companyConfidence = 1.0;
  } else if (gemini?.company && sanitizeCompany(gemini.company)) {
    company = sanitizeCompany(gemini.company); companySource = "gemini"; companyConfidence = 0.85;
  } else {
    company = detCompanyObj.company; companySource = detCompanyObj.source; companyConfidence = detCompanyObj.confidence;
  }

  const resolvedCompany = company ? (sanitizeCompany(company) || "") : "";
  if (!resolvedCompany) { companySource = "none"; companyConfidence = 0; }

  // â”€â”€ // ── Step 4: Classification arbitration (relative confidence) ──────────────
  //   Normalize both confidences to the same 0-1 scale.
  //   Use relative comparison: one source must be proportionally stronger to win.
  //   When similar, prefer Gemini (richer semantic understanding).
  const detConf = detClassification.confidence || 0;
  const geminiClassConf = (gemini?.classificationConfidence || 0) / 100; // normalize 0-100 to 0-1

  let finalClassification, classificationReason;
  let emailType, finalType;

  if (gemini?.classification && gemini?.emailType) {
    // Both sources available — compare relative confidence
    const detIsPrimary = INTENT_TIER[detClassification.category] === "primary";
    const detProportionallyStronger = detConf > 0 && geminiClassConf > 0 && (detConf / geminiClassConf) > 1.5;
    const geminiProportionallyStronger = geminiClassConf > 0 && detConf > 0 && (geminiClassConf / detConf) > 1.3;

    if (detProportionallyStronger && detIsPrimary) {
      // Deterministic is proportionally stronger AND a high-specificity primary intent
      finalClassification = detClassification.classification;
      emailType = detClassification.category === "hackathonEvent" || detClassification.category === "workshopWebinar" ? "event" :
                  detClassification.category === "nonRecruitment" ? "nonRecruitment" : "job";
      finalType = detClassification.type;
      classificationReason = `deterministic preserved: "${detClassification.classification}" (det=${detConf.toFixed(2)}) is primary-tier and proportionally stronger than gemini="${gemini.classification}" (gem=${geminiClassConf.toFixed(2)})`;
    } else {
      // Gemini is stronger, similar, or deterministic is not primary — prefer Gemini semantics
      finalClassification = gemini.classification;
      emailType = gemini.emailType;
      finalType = gemini.type ?? detClassification.type;
      classificationReason = geminiProportionallyStronger
        ? `gemini override: "${gemini.classification}" (gem=${geminiClassConf.toFixed(2)}) proportionally stronger than det="${detClassification.classification}" (det=${detConf.toFixed(2)})`
        : `gemini preferred: "${gemini.classification}" (gem=${geminiClassConf.toFixed(2)}) vs det="${detClassification.classification}" (det=${detConf.toFixed(2)}) — similar confidence, preferring semantic richness`;
    }
  } else if (gemini?.classification) {
    // Gemini available but no confidence score — still prefer Gemini
    finalClassification = gemini.classification;
    emailType = gemini.emailType ?? (detClassification.category === "hackathonEvent" ? "event" : "job");
    finalType = gemini.type ?? detClassification.type;
    classificationReason = `gemini only (no confidence score): "${gemini.classification}"`;
  } else {
    // Gemini failed — use deterministic
    finalClassification = detClassification.classification;
    emailType = detClassification.category === "hackathonEvent" || detClassification.category === "workshopWebinar" ? "event" :
                detClassification.category === "nonRecruitment" ? "nonRecruitment" : "job";
    finalType = detClassification.type;
    classificationReason = `deterministic fallback (gemini unavailable): "${detClassification.classification}" (det=${detConf.toFixed(2)})`;
  }

  // opportunityType consistency: ensure it matches the chosen classification
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

  // ── Step 5: Subtitle ────────────────────────────────────────────────────────
  //   Gemini -> role extractor -> event name -> program/assessment/interview/
  //   registration target -> empty string.
  //   NEVER generates generic labels like "ABB Registration".
  let subtitle, subtitleSource;
  if (gemini?.subtitle) {
    subtitle = gemini.subtitle;
    subtitleSource = "gemini";
  } else {
    const fallback = generateSubtitleFallback(sourceSubject, sourceBody, detClassification.category);
    if (fallback) {
      subtitle = fallback;
      subtitleSource = "fallback_extractor";
    } else {
      subtitle = "";
      subtitleSource = "none";
    }
  }
  console.log(`[SUBTITLE_DECISION] subtitle="${subtitle}" source="${subtitleSource}"`);

  // Keep generateTitle for the title field only (not subtitle)
  const detTitle = generateTitle(resolvedCompany, detClassification.category, sourceSubject, "", sourceBody);

  // ── Step 6: role field (DB required: true) ──────────────────────────────────
  // For job emails: the classification or "Unknown Role" (never the subtitle).
  // For event emails: "Event" as a neutral placeholder.
  const isJobEmail = emailType === "job";
  const fallbackRole = extractFallbackRole(sourceSubject, sourceBody);
  const roleField = isJobEmail ? (fallbackRole || "Unknown Role") : (emailType === "event" ? "Event" : "Unknown Role");

  // ── Step 7: displayFields — flexible [{label,value}] from Gemini ─────────────
  let displayFields = gemini?.displayFields || [];
  if (displayFields.length === 0) {
    displayFields = extractFallbackDisplayFields(fullBodyText || rawText || "", detClassification.opportunityType);
  }

  // Sanitize and validate all display fields
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

  // Priority-based selection: ONLY when more than 5 valid fields exist.
  // When ≤5, preserve Gemini's original order.
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

  // ── Step 7b: Extract deadlineISO from displayFields ───────────────────────
  // Look for deadline-like fields and resolve to ISO date for filter/urgency support.
  const deadlineField = displayFields.find(f =>
    /deadline|due date|last date|closing date/i.test(f.label)
  );
  const resolvedDeadlineISO = deadlineField
    ? resolveDeadlineISO(deadlineField.value, referenceDate)
    : "";

  // ── Step 8: Dev-mode trace with structured reasoning ───────────────────────
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
      classification: {
        chosen: finalClassification,
        reason: classificationReason,
        detConf: detConf.toFixed(2),
        geminiConf: geminiClassConf.toFixed(2),
      },
      company: {
        chosen: resolvedCompany || null,
        source: companySource,
        confidence: companyConfidence,
        reason: companySource === "sender_alias"
          ? `Known alias (1.0): "${senderAliasCompany}"`
          : companySource === "gemini"
          ? "Gemini primary source"
          : `Deterministic fallback (source: ${companySource})`,
      },
      subtitle: {
        chosen: subtitle || null,
        source: subtitleSource,
      },
      displayFields: {
        source: (gemini?.displayFields?.length > 0) ? "gemini" : "fallback_extractor",
        count: displayFields.length,
      },
    },
  } : undefined;

  // // â”€â”€ Step 9: Build parsed output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const parsed = {
    // Core
    emailType,
    opportunityType: finalOppType,
    isRelevant:     emailType !== "nonRecruitment",
    classification: finalClassification,
    type:           finalType,
    status:         finalStatus,
    confidenceScore: Math.min(1, detClassification.confidence + (resolvedCompany ? 0.05 : 0)),
    timelineTitle:   gemini?.timelineTitle   || "",
    timelineSummary: gemini?.timelineSummary || "",

    // Identity
    company:  resolvedCompany,
    domain:   gemini?.domain || "",
    subtitle,
    role:     roleField,  // DB required field — actual role placeholder
    title:    subtitle || detTitle || (resolvedCompany ? `${resolvedCompany} Opportunity` : "Unknown Opportunity"),
    processId:   buildProcessId(resolvedCompany),
    processName: `${resolvedCompany || "Unknown Company"} hiring process`,

    // ── NEW: flexible display fields from Gemini ─────────────────────────
    // This is the primary source of card details for new records.
    displayFields,
    skills: gemini?.skills || [],

    // ————————————————— LEGACY: empty for new records — legacy records keep their own values
    // in MongoDB and the frontend falls back to them automatically.
    fieldsToDisplay: [],
    programRoles:    "",
    programStipend:  "",
    programDuration: "",
    deadlineText:    "",
    deadline:        deadlineField?.value || "",
    deadlineISO:     resolvedDeadlineISO,
    venue:           "",
    durationText:    "",
    salaryText:      "",

    // Links (still from deterministic link extractor)
    link:       linkInfo.primary || gemini?.link || "",
    links:      linkInfo.all.length ? linkInfo.all : gemini?.link ? [gemini.link] : [],
    isFormLink: linkInfo.isForm || /docs\.google\.com\/forms|forms\.gle/.test(linkInfo.primary || gemini?.link || ""),

    // Legacy slots kept for schema compatibility
    jobRole:       "",
    eventDate:     null,
    eventTime:     "",
    reportingTime: "",

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
      llmProvider:          MODEL_NAME,
      llmStatus:            geminiResult.status,
      geminiUsed:           geminiResult.status === "success",
      geminiEmailType:      gemini?.emailType      ?? null,
      geminiClassification: gemini?.classification ?? null,
      ...(parseTrace ? { trace: parseTrace } : {}),
    },
  };

  console.log(
    `[PARSER_SUMMARY] Company: ${parsed.company || "None"} (via ${companySource}) | emailType: ${emailType} | Classification: ${parsed.classification} | subtitle: "${parsed.subtitle}" | displayFields: ${parsed.displayFields.length} fields`
  );
  console.log("PARSED_DISPLAY_FIELDS", parsed.displayFields);

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

module.exports = {
  parseEmailWithLLM,
  extractFormLink,
  resolveCompany,
  extractFallbackDisplayFields,
  preprocessBody,
  cleanDisplayFieldValue,
  validateDisplayField,
  resolveDeadlineISO,
  mergeAlternativeTexts
};
