const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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
  // Compound TLD pattern: e.g. .co.in, .com.au → company is 3rd label from end
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
  // e.g. "some-generic-domain" → "Some Generic Domain"
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
  // ── Established aliases ──────────────────────────────────────────────────
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
  // ── Additional placement-email companies ─────────────────────────────────
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
  for (const alias of Object.keys(KNOWN_COMPANY_ALIASES)) {
    if (normalized.includes(alias)) {
      return KNOWN_COMPANY_ALIASES[alias];
    }
  }
  return "";
}

function extractCompanyFromText(text = "") {
  const cleanedText = cleanMarkdown(normalizeText(text));
  const aliasMatch = matchKnownCompany(cleanedText);
  if (aliasMatch) return aliasMatch;

  const patterns = [
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
 * right after a sign-off word ("Regards, Seeking…" → reject "Seeking").
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
 * Without stripping, extractVenue latches onto "Placement Department" →
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

// ---------------------------------------------------------------------------
// Email classification (deterministic pre-filter)
// Order matters: higher-priority rules first.
// ---------------------------------------------------------------------------

function classifyEmail({ subject = "", body = "", forwarded = {}, hasLink = false }) {
  const text = `${subject} ${body}`.toLowerCase();
  const rules = [
    // ── HACKATHON / EVENT ─────────────────────────────────────────────────
    // Checked FIRST so event-invitation keywords never fall through to
    // registrationLink / deadlineReminder and produce garbage field values.
    {
      category: "hackathonEvent",
      classification: "Hackathon / Event Invitation",
      status: "applied",
      type: "event",
      regex: /\b(hackathon|innovent|innovation\s+challenge|ideathon|datathon|bootcamp|competition|coding\s+contest|tech\s+fest|techfest|code\s*fest|codathon|makeathon|designathon|project\s+submission|submission\s+window|team\s+size|hackathon\s+themes|event\s+invitation|workshop\s+invitation|webinar\s+invitation|scholarship\s+program|open\s+for\s+registration)\b/i,
      confidence: 0.92,
    },

    // ── JOB / RECRUITMENT ─────────────────────────────────────────────────
    {
      category: "interviewResult",
      classification: "Interview Result",
      status: "offer",
      type: "unknown",
      regex: /\b(offer\s+letter|congratulations|selected|shortlisted|happy to inform|pleased to inform)\b/i,
      confidence: 0.95,
    },
    {
      category: "interviewSchedule",
      classification: "Interview Schedule",
      status: "interview",
      type: "interview",
      regex: /\b(interview.*schedule|scheduled for|interview date|slot|panel interview|telephonic interview|interview schedule)\b/i,
      confidence: 0.92,
    },
    {
      category: "assessmentAnnouncement",
      classification: "Assessment Announcement",
      status: "interview",
      type: "test",
      regex: /\b(aptitude test|assessment|online test|exam|fcat|coding test|technical test)\b/i,
      confidence: 0.9,
    },
    {
      category: "registrationLink",
      classification: "Registration Link",
      status: "applied",
      type: "application",
      regex: /\b(register|registration|complete your profile|profile completion|forms\.gle|docs\.google\.com\/forms)\b/i,
      confidence: 0.9,
    },
    {
      category: "applicationReminder",
      classification: "Application Reminder",
      status: "applied",
      type: "application",
      regex: /\b(reminder|remind|register.*by|submit.*by|last date|deadline)\b/i,
      confidence: 0.9,
    },
    {
      category: "pptAnnouncement",
      classification: "PPT Announcement",
      status: "applied",
      type: "unknown",
      regex: /\b(pre[-\s]*placement talk|ppt|seminar|placement talk|info session|guest lecture)\b/i,
      confidence: 0.88,
    },
    {
      category: "venueUpdate",
      classification: "Venue Update",
      status: "applied",
      type: "unknown",
      regex: /\b(venue|hall|room|auditorium|seminar hall|location|place)\b/i,
      confidence: 0.88,
    },
    {
      category: "deadlineReminder",
      classification: "Deadline Reminder",
      status: "applied",
      type: "unknown",
      regex: /\b(deadline|last date|apply by|register by|submission deadline|before .* today|before .* tomorrow)\b/i,
      confidence: 0.9,
    },
    {
      category: "genericPlacementNotice",
      classification: "Generic Placement Notice",
      status: "applied",
      type: "unknown",
      regex: /\b(campus recruitment|placement notice|hiring process|recruitment drive|opportunity|drive)\b/i,
      confidence: 0.75,
    },
  ];

  for (const rule of rules) {
    if (rule.regex.test(text)) {
      return {
        category: rule.category,
        classification: rule.classification,
        type: rule.type,
        status: rule.status,
        confidence: rule.confidence,
      };
    }
  }

  if (hasLink) {
    return {
      category: "registrationLink",
      classification: "Registration Link",
      type: "application",
      status: "applied",
      confidence: 0.7,
    };
  }

  if (/\b(interview|assessment|aptitude|exam|shortlist|hiring|recruitment|application|job|internship|offer|deadline)\b/i.test(text)) {
    return {
      category: "newOpportunity",
      classification: "New Hiring Opportunity",
      type: "unknown",
      status: "applied",
      confidence: 0.55,
    };
  }

  return {
    category: "nonRecruitment",
    classification: "Non-Recruitment Email",
    type: "unknown",
    status: "applied",
    confidence: 0.25,
  };
}

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

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
    /(?:CTC|Package|Stipend)\s*[:\-]?\s*([₹$€]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /(?:₹|Rs\.?|INR)\s*[0-9,]+(?:\.\d+)?(?:\s*(?:LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
    /[0-9]+(?:,[0-9]{3})*(?:\.\d+)?\s*(?:LPA|lakhs|K|k)(?:\s*(?:per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const value = match[1] ? match[1].trim() : match[0].trim();
      const cleanedValue = cleanProgramValue(value);
      const numericOnly = /^[0-9]+(?:\.[0-9]+)?$/;
      const hasCurrencyOrUnit = /\b(?:₹|Rs\.?|INR|LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr)\b/i.test(cleanedValue);

      if (numericOnly.test(cleanedValue) && !hasCurrencyOrUnit) continue;
      if (/^(?:rs\.?|inr|₹|usd)\s*$/i.test(cleanedValue)) continue;

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
    /Stipend\s*[:\-]?\s*([₹$€]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /Internship\s+stipend\s*[:\-]?\s*([₹$€]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /(?:CTC|Package)\s*[:\-]?\s*([₹$€]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|k|pa|per\s+year|p\.m)?)/i,
    /[-•]\s*(?:B\.Tech|B\.E|M\.Tech|M\.E|MCA|B\.Tech\/MCA)\s*[:\-]?\s*([₹]?\s*[0-9,]+(?:\.\d+)?\s*(?:per\s+month|pm|LPA|lakhs|K|pa)?)/i,
    /(?:₹|Rs\.?|INR)\s*[0-9,]+(?:\.\d+)?(?:\s*(?:LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
    /[0-9]+(?:,[0-9]{3})*(?:\.\d+)?\s*(?:LPA|lakhs|K|k)(?:\s*(?:per\s*month|pm|\/month|p\.m\.|pa|\/yr))?/i,
  ];
  for (const pattern of patterns) {
    const match = cleanedText.match(pattern);
    if (match) {
      const value = match[1] ? match[1].trim() : match[0].trim();
      const cleaned = cleanProgramValue(value);
      const numericOnly = /^[0-9]+(?:\.[0-9]+)?$/;
      const hasCurrencyOrUnit = /\b(?:₹|Rs\.?|INR|LPA|lakhs|K|k|per\s*month|pm|\/month|p\.m\.|pa|\/yr)\b/i.test(cleaned);

      if (numericOnly.test(cleaned) && !hasCurrencyOrUnit) continue;
      if (/^(?:rs\.?|inr|₹|usd)\s*$/i.test(cleaned)) continue;

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
    || cleanSubject.match(/\b([A-Z][A-Za-z0-9\-\.]{2,}(?:\s+[A-Z0-9][A-Za-z0-9\-\.]*){0,3})\b(?=\s*(?:\||\-|–))/i)
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

// ---------------------------------------------------------------------------
// Gemini structured call — primary LLM integration
// ---------------------------------------------------------------------------

/**
 * Valid email types returned by Gemini.
 */
const VALID_EMAIL_TYPES = ["job", "event", "nonRecruitment"];

/**
 * Fields that may appear in fieldsToDisplay, keyed by emailType.
 */
const ALLOWED_FIELDS_BY_TYPE = {
  job: ["role", "stipend", "deadline", "duration", "venue"],
  event: ["eventName", "deadline", "venue"],
  nonRecruitment: [],
};

/**
 * Strict allowlist of classification strings the model may return.
 */
const VALID_CLASSIFICATIONS = [
  "New Hiring Opportunity",
  "Internship Opportunity",
  "Registration Link",
  "Application Reminder",
  "PPT Announcement",
  "Assessment Announcement",
  "Interview Schedule",
  "Interview Result",
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

  // emailType — must be one of the allowed values
  const emailType = VALID_EMAIL_TYPES.includes(raw.emailType) ? raw.emailType : null;
  if (!emailType) return null; // Cannot proceed without a valid emailType

  // classification — must be from the allowlist
  const classification = VALID_CLASSIFICATIONS.includes(raw.classification)
    ? raw.classification
    : null;

  // Helper: sanitize a short text field — strip to plain string, max 200 chars
  const sanitizeTextField = (v, maxLen = 200) => {
    if (!v || typeof v !== "string") return "";
    const cleaned = cleanProgramValue(v.substring(0, maxLen));
    // Reject suspiciously long or multi-sentence values that are likely hallucinations
    if (cleaned.split(/[.!?]/).filter(Boolean).length > 2) return "";
    return cleaned;
  };

  const subtitle    = sanitizeTextField(raw.subtitle, 120);
  const role        = sanitizeTextField(raw.role, 120);
  const stipend     = sanitizeTextField(raw.stipend, 80);
  const deadline    = sanitizeTextField(raw.deadline, 80);
  const venue       = sanitizeTextField(raw.venue, 120);
  const duration    = sanitizeTextField(raw.duration, 80);
  const eventName   = sanitizeTextField(raw.eventName, 120);
  const company     = sanitizeTextField(raw.company, 100);

  // fieldsToDisplay — array of strings from the allowed set for this emailType
  const allowedFields = ALLOWED_FIELDS_BY_TYPE[emailType] || [];
  let fieldsToDisplay = [];
  if (Array.isArray(raw.fieldsToDisplay)) {
    fieldsToDisplay = raw.fieldsToDisplay.filter(
      (f) => typeof f === "string" && allowedFields.includes(f)
    );
  }

  // status — must be from the valid set
  const validStatuses = ["applied", "interview", "offer", "rejected", "new"];
  const status = validStatuses.includes(raw.status) ? raw.status : null;

  // type — must be from the valid set
  const validTypes = ["internship", "full-time", "event", "test", "unknown"];
  const type = validTypes.includes(raw.type) ? raw.type : null;

  return {
    emailType,
    classification,
    subtitle,
    role,
    stipend,
    deadline,
    venue,
    duration,
    eventName,
    company,
    fieldsToDisplay,
    status,
    type,
    link: typeof raw.link === "string" && raw.link.startsWith("http") ? raw.link : "",
  };
}

/**
 * Call Gemini with a structured prompt that returns enough information for
 * the frontend to render cards correctly — including emailType, subtitle,
 * and an explicit fieldsToDisplay list. Falls back to {} on any error.
 */
async function callGeminiStructured({ subject = "", sender = "", body = "" }) {
  const truncatedBody = body.length > 3000 ? body.substring(0, 3000) + "..." : body;

  const prompt = `You are a precise email classifier for a college placement tracking system. Analyze the email below and return ONLY a valid JSON object — no markdown, no explanation.

CONTEXT: These emails are typically forwarded from a campus placement department to students. The ACTUAL company is the ORIGINAL SENDER of the forwarded message, NOT the forwarding institution (e.g., MSRIT, RIT, Ramaiah Institute, Placement Department, Dean).

TASK: Determine the email type and extract only information explicitly stated in the email. Do NOT infer, guess, or hallucinate values. If a field is not clearly stated, return an empty string "".

Return this exact JSON schema:
{
  "emailType": "<job | event | nonRecruitment>",
  "classification": "<one of: New Hiring Opportunity | Internship Opportunity | Registration Link | Application Reminder | PPT Announcement | Assessment Announcement | Interview Schedule | Interview Result | Venue Update | Deadline Reminder | Generic Placement Notice | Hackathon / Event Invitation | Workshop / Webinar | Expert Talk Series | Scholarship | Non-Recruitment Email>",
  "company": "<actual organizing company/entity — see COMPANY RULES below>",
  "subtitle": "<see SUBTITLE RULES below>",
  "role": "<specific job/internship role title only if explicitly stated, else empty string>",
  "eventName": "<full event or series name if this is a hackathon/webinar/talk email, else empty string>",
  "stipend": "<stipend or CTC only if explicitly stated as compensation for work/internship. Prize money for competitions is NOT a stipend>",
  "deadline": "<registration/application deadline text if explicitly stated, else empty string>",
  "venue": "<physical location only — city name, building, or campus. Do NOT include online platform URLs (Teams, Zoom, Google Meet). Empty if no physical venue stated>",
  "duration": "<internship or program duration if explicitly stated, else empty string>",
  "status": "<applied | interview | offer | rejected>",
  "type": "<internship | full-time | event | test | unknown>",
  "link": "<primary registration/application URL if present, else empty string>",
  "fieldsToDisplay": ["<include ONLY field names where the value is non-empty AND genuinely applicable: role, stipend, deadline, duration, venue, eventName>"]
}

CLASSIFICATION GUIDE:
- "Internship Opportunity"  — paid or unpaid internship opening (e.g. ABB IS Team Internship, summer internship)
- "New Hiring Opportunity"  — full-time job or campus recruitment drive
- "Workshop / Webinar"      — single online session, webinar, online meeting (e.g. Ericsson Edge Academy)
- "Expert Talk Series"      — multi-session webinar or expert talk series (e.g. POD Expert Talk Series)
- "Hackathon / Event Invitation" — hackathon, coding contest, ideathon, innovation challenge
- "Registration Link"       — email primarily asking students to register or fill a form
- "Non-Recruitment Email"   — newsletters, announcements unrelated to placement

SUBTITLE RULES:
- "Internship Opportunity"  → program/team name (e.g. "IS Team Internship", "Data Science Internship")
- "New Hiring Opportunity"  → role or program name
- "Workshop / Webinar"      → webinar/program name (e.g. "Ericsson Edge Academy")
- "Expert Talk Series"      → full series name (e.g. "POD Expert Talk Series on Databases & Data Management")
- "Hackathon / Event Invitation" → hackathon/event name (e.g. "InnoVent-27", "HackVega 2.0")
- "Registration Link" / "Application Reminder" → concise description of what to register for
- "Non-Recruitment Email"   → empty string ""

COMPANY RULES:
1. The company is the ACTUAL ORGANIZING ENTITY sending the original opportunity email.
2. For forwarded emails, use the original sender company (from "Forwarded message From:" or the signature of the original author).
3. NEVER use: MSRIT, RIT, Ramaiah Institute, Placement Department, Dean, or any college/university.
4. NEVER use generic sentence starters as company names: "Here", "Here is", "Seeking", "Potential opportunities", "Greetings".
5. Ignore platform names (Microsoft Teams, Google Forms, Zoom, Unstop, Brazen) when identifying company.
6. If the email is from ABB, Ericsson, Pod.ai, HirePro, etc. — use their proper brand name.

RULES:
1. emailType "job" — for hiring, internship, placement, or recruitment emails.
2. emailType "event" — for hackathons, webinars, workshops, expert talks, scholarships, or event invitations.
3. emailType "nonRecruitment" — for newsletters or emails unrelated to jobs/events.
4. "fieldsToDisplay" must only include fields where the value is non-empty AND relevant to the email type.
5. "venue" is a physical location (city, building). Online meeting links are NOT venues.
6. "role" is only for job/internship emails with an explicitly stated role title.
7. Do NOT infer job roles from soft phrases like "potential internship opportunities".
8. If ambiguous, return empty string over a guess.

Subject: ${subject}
Sender: ${sender}
Body: ${truncatedBody}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { abortSignal: controller.signal }
    });
    clearTimeout(timeoutId);

    let jsonText = (response.text || "").trim();
    // Strip markdown code fences if present
    jsonText = jsonText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const rawParsed = JSON.parse(jsonText);
    console.log("[GEMINI_RAW_RESPONSE]", JSON.stringify(rawParsed, null, 2));
    const validated = validateGeminiResponse(rawParsed);

    if (!validated) {
      console.warn("[GEMINI_STRUCTURED] Response failed schema validation, discarding.");
      return null;
    }

    console.log(`[GEMINI_STRUCTURED] emailType=${validated.emailType}, classification=${validated.classification}, subtitle="${validated.subtitle}", fieldsToDisplay=${JSON.stringify(validated.fieldsToDisplay)}`);
    return validated;

  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[GEMINI_STRUCTURED] Request timed out.");
    } else {
      console.error("[GEMINI_STRUCTURED] Failed:", err?.message || err);
    }
    return null; // Signal caller to use deterministic fallback
  }
}

// ---------------------------------------------------------------------------
// Legacy fallback (kept for backwards-compat; used only when Gemini is down)
// ---------------------------------------------------------------------------
async function callGeminiFallback({ subject = "", sender = "", body = "" }) {
  const prompt = `You are a structured parser.\nReturn only JSON.\n{\n  "company": "<company name or empty>",\n  "role": "<role or event title or empty>",\n  "classification": "<New Hiring Opportunity|Registration Link|Application Reminder|PPT Announcement|Assessment Announcement|Interview Schedule|Interview Result|Venue Update|Deadline Reminder|Generic Placement Notice|Non-Recruitment Email>",\n  "type": "<internship|full-time|test|unknown>",\n  "status": "<applied|interview|offer|rejected>",\n  "link": "<URL or empty>",\n  "eventDate": "<YYYY-MM-DD or empty>",\n  "deadlineISO": "<YYYY-MM-DDTHH:MM:SS.sssZ or empty>",\n  "venue": "<venue or empty>",\n  "durationText": "<duration or empty>",\n  "salaryText": "<salary or empty>"\n}\nIMPORTANT: Ignore webinar and form platforms (e.g., Microsoft Teams, Google Forms, Zoom, Unstop, Brazen) when determining the company name. The company is the actual employer/recruiter.\nSubject: ${subject}\nSender: ${sender}\nBody: ${body}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { abortSignal: controller.signal }
    });
    clearTimeout(timeoutId);
    let jsonText = (response.text || "").trim();
    jsonText = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(jsonText);
  } catch (err) {
    console.error("[LLM FALLBACK FAILED]", err?.message || err);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function parseEmailWithLLM(subject, sender = "", fullBodyText = "", referenceDate = new Date(), rawText = "") {
  const body = normalizeText(fullBodyText || rawText || "");
  const forwarded = parseForwardedEmail(body);
  const sourceBody   = forwarded.body || body;
  const sourceSubject = forwarded.subject || subject || "";
  // Footer-stripped body is used for deterministic field extraction only —
  // prevents the placement-department footer from polluting venue/body regex.
  const footerStrippedBody = stripForwardingFooter(sourceBody);
  const linkInfo = extractFormLink(sourceBody);

  // ── Step 1: Gemini structured call (PRIMARY reasoning engine) ───────────
  // Gemini is always called first.  It is the primary source for company,
  // classification, subtitle, role, and event name.
  const gemini = await callGeminiStructured({ subject: sourceSubject, sender, body: sourceBody });

  // ── Step 2: Deterministic classification (FALLBACK) ─────────────────────
  // Used only when Gemini fails or returns an invalid classification.
  const detClassification = classifyEmail({
    subject: sourceSubject,
    body: sourceBody,
    forwarded,
    hasLink: !!linkInfo.primary,
  });

  // ── Step 3: Company resolution — new three-tier precedence ──────────────
  //
  //   Tier 1 (confidence 1.0)  — Known alias resolved from the sender domain.
  //                               e.g. @in.abb.com → "Abb" → alias → "ABB"
  //   Tier 2 (confidence 0.85) — Gemini structured output.
  //   Tier 3 (fallback)        — Deterministic heuristics (used ONLY when
  //                               tiers 1 and 2 both return empty).
  //
  // Critically: deterministic results can NO LONGER block Gemini.

  // Tier 1: check both the outer sender and the forwarded original sender.
  const candidateSenders = [forwarded.from, sender].filter(Boolean);
  let senderAliasCompany = "";
  for (const snd of candidateSenders) {
    const domainPart = companyFromSender(snd);
    if (domainPart) {
      const alias = matchKnownCompany(domainPart);
      if (alias) { senderAliasCompany = alias; break; }
    }
    // Also try matching the full sender string itself (e.g. "ERICSSON" in display name)
    const directAlias = matchKnownCompany(snd);
    if (directAlias) { senderAliasCompany = directAlias; break; }
  }
  // If no sender alias yet, check the forwarded From: + subject for known aliases
  // (e.g., "ERICSSON India Private Limited" in the forwarded body header)
  if (!senderAliasCompany) {
    const aliasHint = `${forwarded.from || ""} ${sourceSubject}`;
    const subjectAlias = matchKnownCompany(aliasHint);
    if (subjectAlias) senderAliasCompany = subjectAlias;
  }

  // Always compute deterministic result for tracing / Tier-3 fallback.
  const detCompanyObj = resolveCompany({ subject: sourceSubject, body: sourceBody, sender, forwarded });

  let company, companySource, companyConfidence;

  if (senderAliasCompany) {
    // Tier 1 — known alias (most reliable, unambiguous)
    company           = senderAliasCompany;
    companySource     = "sender_alias";
    companyConfidence = 1.0;
  } else if (gemini?.company && sanitizeCompany(gemini.company)) {
    // Tier 2 — Gemini (primary reasoning; never blocked by deterministic confidence)
    company           = sanitizeCompany(gemini.company);
    companySource     = "gemini";
    companyConfidence = 0.85;
  } else {
    // Tier 3 — deterministic fallback (only reached when Gemini returned empty)
    company           = detCompanyObj.company;
    companySource     = detCompanyObj.source;
    companyConfidence = detCompanyObj.confidence;
  }

  const resolvedCompany = company ? (sanitizeCompany(company) || "") : "";
  if (!resolvedCompany) {
    companySource     = "none";
    companyConfidence = 0;
  }

  // ── Step 4: Email type and classification ────────────────────────────────
  const emailType = gemini?.emailType ?? (
    detClassification.category === "hackathonEvent" ? "event" :
    detClassification.category === "nonRecruitment" ? "nonRecruitment" : "job"
  );

  const finalClassification = gemini?.classification ?? detClassification.classification;
  const finalStatus = gemini?.status
    ? normalizeStatus(gemini.status)
    : normalizeStatus(detClassification.status);
  const finalType = gemini?.type ?? detClassification.type;

  // ── Step 5: Field extraction gated by emailType ──────────────────────────
  // Use the footer-stripped body for deterministic extractors to prevent the
  // placement-department footer ("Placement Department\nRIT") from injecting
  // false venue/body values.
  const isJobEmail = emailType === "job";
  const extractionBody = footerStrippedBody || sourceBody;

  const eventDate       = extractEventDate(sourceBody, referenceDate);
  const deadlineInfo    = isJobEmail ? extractDeadlineDetails(extractionBody, referenceDate) : { deadline: "", iso: "", raw: "" };
  const reportingTime   = isJobEmail ? extractReportingTime(extractionBody) : "";
  const detVenue        = isJobEmail ? extractVenue(extractionBody) : "";
  const durationText    = isJobEmail ? extractDuration(extractionBody) : "";
  const salaryText      = isJobEmail ? extractSalary(extractionBody) : "";
  const programRoles    = isJobEmail ? extractProgramRoles(extractionBody) : "";
  const programStipend  = isJobEmail ? extractProgramStipend(extractionBody) : "";
  const programDuration = isJobEmail ? extractProgramDuration(extractionBody) : "";
  const deadlineText    = isJobEmail ? extractDeadlineText(extractionBody) : "";

  // Venue: deterministic result (regex) wins for job emails; Gemini fills the gap.
  const venue = detVenue || gemini?.venue || "";

  // ── Step 6: Subtitle — what shows under the company name on the card ─────
  // Gemini is the primary source.  Deterministic title is only a fallback for
  // job emails when Gemini returns an empty subtitle.
  const jobRole = programRoles || gemini?.role || (isJobEmail ? keywordRoleFallback(extractionBody) : "");
  const detTitle = generateTitle(resolvedCompany, detClassification.category, sourceSubject, isJobEmail ? jobRole : "", sourceBody);

  let subtitle;
  if (gemini?.subtitle) {
    subtitle = gemini.subtitle;
  } else if (emailType === "event") {
    subtitle = gemini?.eventName || extractEventName(sourceSubject, sourceBody) || "Event";
  } else if (isJobEmail) {
    subtitle = detTitle;
  } else {
    subtitle = "";
  }

  // ── Step 7: role field — stores the actual job role, NOT the subtitle ────
  //
  // Previously this field received the subtitle string (e.g. "In Registration")
  // which was then rendered in the subtitle position on cards.  That was wrong.
  //
  // The `role` field in the DB is `required: true`.  For job emails it holds
  // the actual role (e.g. "Internship", "Software Engineer").  For event emails
  // it holds "Event" as a neutral placeholder.
  const roleField = isJobEmail
    ? (programRoles || gemini?.role || keywordRoleFallback(extractionBody) || "Unknown Role")
    : (emailType === "event" ? "Event" : "Unknown Role");

  // ── Step 8: fieldsToDisplay ──────────────────────────────────────────────
  let fieldsToDisplay = gemini?.fieldsToDisplay ?? null;
  if (!fieldsToDisplay) {
    // Deterministic fallback: only include fields that are actually non-empty
    fieldsToDisplay = [];
    if (isJobEmail) {
      if (programRoles)    fieldsToDisplay.push("role");
      if (programStipend)  fieldsToDisplay.push("stipend");
      if (deadlineText)    fieldsToDisplay.push("deadline");
      if (programDuration) fieldsToDisplay.push("duration");
      if (venue)           fieldsToDisplay.push("venue");
    }
  }

  // ── Step 9: Dev-mode parser trace ────────────────────────────────────────
  // Enabled only when NODE_ENV !== "production".  Logs a structured object
  // explaining every company-resolution decision for easy debugging.
  const isDev = process.env.NODE_ENV !== "production";
  const parseTrace = isDev ? {
    gemini: {
      company:        gemini?.company        ?? null,
      classification: gemini?.classification ?? null,
      emailType:      gemini?.emailType      ?? null,
      subtitle:       gemini?.subtitle       ?? null,
      role:           gemini?.role           ?? null,
      eventName:      gemini?.eventName      ?? null,
      venue:          gemini?.venue          ?? null,
    },
    deterministic: {
      company:        detCompanyObj.company  || null,
      source:         detCompanyObj.source,
      confidence:     detCompanyObj.confidence,
      classification: detClassification.classification,
      senderAlias:    senderAliasCompany     || null,
    },
    chosen: {
      company:          resolvedCompany       || null,
      companySource,
      companyConfidence,
      subtitle,
      roleField,
      classification:   finalClassification,
      reason:
        companySource === "sender_alias"
          ? `Known alias from sender domain (confidence 1.0): "${senderAliasCompany}"`
          : companySource === "gemini"
          ? "Gemini primary source — no alias match found in sender domain"
          : `Deterministic fallback (source: ${companySource}, confidence: ${companyConfidence})`,
    },
  } : undefined;

  // ── Step 10: Build final parsed output ───────────────────────────────────
  const processId = buildProcessId(resolvedCompany);

  const parsed = {
    // Core classification
    emailType,
    isRelevant: emailType !== "nonRecruitment",
    classification: finalClassification,
    type: finalType,
    status: finalStatus,
    confidenceScore: Math.min(1, detClassification.confidence + (resolvedCompany ? 0.05 : 0)),

    // Identity
    company:     resolvedCompany,
    subtitle,
    jobRole:     isJobEmail ? jobRole : "",
    title:       subtitle || detTitle || (resolvedCompany ? `${resolvedCompany} Opportunity` : "Unknown Opportunity"),

    // role field: actual job role — NEVER the subtitle string
    role: roleField,

    processId:   processId || buildProcessId(resolvedCompany),
    processName: `${resolvedCompany || "Unknown Company"} hiring process`,

    // Display control — frontend uses this to decide which sections to render
    fieldsToDisplay,

    // Date / time
    eventDate:     eventDate || null,
    eventTime:     sourceBody.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)?.[0]?.toUpperCase() || "",
    reportingTime: reportingTime || "",

    // Location
    venue: venue || "",

    // Duration
    durationText: durationText || gemini?.duration || "",

    // Compensation — only for job emails
    salaryText:    isJobEmail ? (salaryText    || "")                    : "",
    programStipend: isJobEmail ? (programStipend || gemini?.stipend || "") : "",

    // Deadlines — only for job emails
    deadline:     deadlineInfo.deadline || "",
    deadlineISO:  deadlineInfo.iso      || "",
    deadlineText: isJobEmail ? (deadlineText || gemini?.deadline || "")  : "",

    // Links
    link:       linkInfo.primary || gemini?.link || "",
    links:      linkInfo.all.length ? linkInfo.all : gemini?.link ? [gemini.link] : [],
    isFormLink: linkInfo.isForm || /docs\.google\.com\/forms|forms\.gle/.test(linkInfo.primary || gemini?.link || ""),

    // Program details — only for job emails
    programRoles:    isJobEmail ? (programRoles    || gemini?.role     || "") : "",
    programDuration: isJobEmail ? (programDuration || gemini?.duration || "") : "",

    // Parse metadata (for debugging)
    parseMeta: {
      sourceSubject,
      forwarded:            forwarded.isForwarded,
      sender,
      classificationSource: detClassification.classification,
      companySource,
      companyConfidence,
      hasLink:              !!linkInfo.primary,
      detTitle,
      geminiUsed:           !!gemini,
      geminiEmailType:      gemini?.emailType      ?? null,
      geminiClassification: gemini?.classification ?? null,
      ...(parseTrace ? { trace: parseTrace } : {}),
    },
  };

  console.log(
    `[PARSER_SUMMARY] Company: ${parsed.company || "None"} (via ${companySource}) | emailType: ${emailType} | Classification: ${parsed.classification} | subtitle: "${parsed.subtitle}" | role: "${parsed.role}" | fieldsToDisplay: ${JSON.stringify(parsed.fieldsToDisplay)}`
  );

  if (isDev && parseTrace) {
    console.log("[PARSER_TRACE]", JSON.stringify(parseTrace, null, 2));
  }

  return parsed;
}

module.exports = { parseEmailWithLLM, extractFormLink, resolveCompany };
