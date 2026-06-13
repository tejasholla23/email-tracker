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
  // â”€â”€ Established aliases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// ---------------------------------------------------------------------------
// Email classification (deterministic pre-filter)
// Order matters: higher-priority rules first.
// ---------------------------------------------------------------------------

function classifyEmail({ subject = "", body = "", forwarded = {}, hasLink = false }) {
  const text = `${subject} ${body}`.toLowerCase();
  const rules = [
    // â”€â”€ HACKATHON / EVENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ JOB / RECRUITMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const subtitle = sanitizeTextField(raw.subtitle, 160);

  // displayFields â€” flexible [{label, value}] array, max 5 items
  let displayFields = [];
  if (Array.isArray(raw.displayFields)) {
    displayFields = raw.displayFields
      .filter((f) => f && typeof f === "object"
                  && typeof f.label === "string" && f.label.trim()
                  && typeof f.value === "string" && f.value.trim())
      .map((f) => ({
        label: cleanProgramValue(f.label.substring(0, 60)),
        value: cleanProgramValue(f.value.substring(0, 200)),
      }))
      .filter((f) => f.label && f.value)  // re-filter after cleaning
      .slice(0, 5);                        // cap at 5
  }

  // status â€” must be from the valid set
  const validStatuses = ["applied", "interview", "offer", "rejected", "new"];
  const status = validStatuses.includes(raw.status) ? raw.status : null;

  // type â€” must be from the valid set
  const validTypes = ["internship", "full-time", "event", "test", "unknown"];
  const type = validTypes.includes(raw.type) ? raw.type : null;

  return {
    emailType,
    classification,
    company,
    subtitle,
    displayFields,
    status,
    type,
    link: typeof raw.link === "string" && raw.link.startsWith("http") ? raw.link : "",
  };
}


/**
 * Call Gemini with a structured prompt that returns company, classification,
 * subtitle, and a flexible displayFields array of {label, value} pairs.
 * Falls back to null on any error.
 */
async function callGeminiStructured({ subject = "", sender = "", body = "" }) {
  const truncatedBody = body.length > 3000 ? body.substring(0, 3000) + "..." : body;

  const prompt = `You are a smart placement-email parser for a college student dashboard. Analyze the email and return ONLY valid JSON â€” no markdown, no explanation.

CONTEXT: Emails are forwarded from a campus placement department (MSRIT/RIT). The ACTUAL company is the ORIGINAL SENDER â€” NOT the forwarding institution. Ignore all forwarding footers ("Regards, Placement Department, RIT/MSRIT").

Return exactly this JSON schema:
{
  "emailType": "<job | event | nonRecruitment>",
  "classification": "<one of: New Hiring Opportunity | Internship Opportunity | Registration Link | Application Reminder | PPT Announcement | Assessment Announcement | Interview Schedule | Interview Result | Venue Update | Deadline Reminder | Generic Placement Notice | Hackathon / Event Invitation | Workshop / Webinar | Expert Talk Series | Scholarship | Non-Recruitment Email>",
  "company": "<actual organizing company â€” see COMPANY RULES>",
  "subtitle": "<program/event/role name shown below the company name on the card â€” see SUBTITLE RULES>",
  "status": "<applied | interview | offer | rejected>",
  "type": "<internship | full-time | event | test | unknown>",
  "link": "<primary registration or application URL, or empty string>",
  "displayFields": [
    { "label": "<concise label>", "value": "<explicitly stated value>" }
  ]
}

DISPLAY FIELDS RULES:
- Maximum 5 fields. Only include fields with values EXPLICITLY stated in the email.
- Do NOT include empty, vague, or inferred values.
- Choose labels a student would want to see immediately on a card.
- Ignore forwarding footers entirely. NEVER use RIT, MSRIT, Placement Department, or Dean's name as a venue, location, or company.
- Use labels and context appropriate to the email type:

  Internship:  Role/Designation, Stipend, Location, Duration, Joining
  Full-time:   Designation, CTC, Location, Branches, Deadline
  Hackathon:   Prize Pool, Registration Deadline, Team Size, Mode
  Webinar:     Date, Time, Mode (Online/Offline), Speaker, Topic
  Assessment:  Date, Time, Platform, Duration
  Workshop:    Date, Venue, Registration Deadline

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

    console.log(`[GEMINI_STRUCTURED] emailType=${validated.emailType}, classification=${validated.classification}, subtitle="${validated.subtitle}", displayFields=${JSON.stringify(validated.displayFields)}`);
    return validated;

  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[GEMINI_STRUCTURED] Request timed out.");
    } else {
      console.error("[GEMINI_STRUCTURED] Failed:", err?.message || err);
    }
    return null;
  }
}

async function parseEmailWithLLM(subject, sender = "", fullBodyText = "", referenceDate = new Date(), rawText = "") {
  const body = normalizeText(fullBodyText || rawText || "");
  const forwarded = parseForwardedEmail(body);
  const sourceBody    = forwarded.body || body;
  const sourceSubject = forwarded.subject || subject || "";
  // Footer-stripped body passed to Gemini â€” prevents placement-dept footers
  // from polluting Gemini's understanding of location/company/fields.
  const footerStrippedBody = stripForwardingFooter(sourceBody);
  const linkInfo = extractFormLink(sourceBody);

  // â”€â”€ Step 1: Gemini (PRIMARY â€” single source of all display fields) â”€â”€â”€â”€â”€â”€â”€â”€
  const gemini = await callGeminiStructured({
    subject: sourceSubject,
    sender,
    body: footerStrippedBody || sourceBody,
  });

  // â”€â”€ Step 2: Deterministic classification fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const detClassification = classifyEmail({
    subject: sourceSubject,
    body: sourceBody,
    forwarded,
    hasLink: !!linkInfo.primary,
  });

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

  // â”€â”€ Step 4: Classification, status, type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const emailType = gemini?.emailType ?? (
    detClassification.category === "hackathonEvent" ? "event" :
    detClassification.category === "nonRecruitment" ? "nonRecruitment" : "job"
  );
  const finalClassification = gemini?.classification ?? detClassification.classification;
  const finalStatus = gemini?.status
    ? normalizeStatus(gemini.status)
    : normalizeStatus(detClassification.status);
  const finalType = gemini?.type ?? detClassification.type;

  // â”€â”€ Step 5: Subtitle (shown below company name on card) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const detTitle = generateTitle(resolvedCompany, detClassification.category, sourceSubject, "", sourceBody);
  let subtitle;
  if (gemini?.subtitle) {
    subtitle = gemini.subtitle;
  } else if (emailType === "event") {
    subtitle = extractEventName(sourceSubject, sourceBody) || "Event";
  } else {
    subtitle = detTitle;
  }

  // â”€â”€ Step 6: role field (DB required: true) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // For job emails: the classification or "Unknown Role" (never the subtitle).
  // For event emails: "Event" as a neutral placeholder.
  const isJobEmail = emailType === "job";
  const roleField = isJobEmail ? "Unknown Role" : (emailType === "event" ? "Event" : "Unknown Role");

  // â”€â”€ Step 7: displayFields â€” flexible [{label,value}] from Gemini â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // This is the ONLY source of display fields. No deterministic merging.
  const displayFields = gemini?.displayFields || [];

  // â”€â”€ Step 8: Dev-mode trace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isDev = process.env.NODE_ENV !== "production";
  const parseTrace = isDev ? {
    gemini: {
      company:        gemini?.company        ?? null,
      classification: gemini?.classification ?? null,
      emailType:      gemini?.emailType      ?? null,
      subtitle:       gemini?.subtitle       ?? null,
      displayFields:  gemini?.displayFields  ?? [],
    },
    deterministic: {
      company:        detCompanyObj.company  || null,
      source:         detCompanyObj.source,
      confidence:     detCompanyObj.confidence,
      classification: detClassification.classification,
      senderAlias:    senderAliasCompany     || null,
    },
    chosen: {
      company:        resolvedCompany        || null,
      companySource,
      companyConfidence,
      subtitle,
      classification: finalClassification,
      reason:
        companySource === "sender_alias"
          ? `Known alias (1.0): "${senderAliasCompany}"`
          : companySource === "gemini"
          ? "Gemini primary source"
          : `Deterministic fallback (source: ${companySource})`,
    },
  } : undefined;

  // â”€â”€ Step 9: Build parsed output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const parsed = {
    // Core
    emailType,
    isRelevant:     emailType !== "nonRecruitment",
    classification: finalClassification,
    type:           finalType,
    status:         finalStatus,
    confidenceScore: Math.min(1, detClassification.confidence + (resolvedCompany ? 0.05 : 0)),

    // Identity
    company:  resolvedCompany,
    subtitle,
    role:     roleField,  // DB required field â€” actual role placeholder
    title:    subtitle || detTitle || (resolvedCompany ? `${resolvedCompany} Opportunity` : "Unknown Opportunity"),
    processId:   buildProcessId(resolvedCompany),
    processName: `${resolvedCompany || "Unknown Company"} hiring process`,

    // â”€â”€ NEW: flexible display fields from Gemini â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // This is the primary source of card details for new records.
    displayFields,

    // â”€â”€ LEGACY: empty for new records â€” legacy records keep their own values
    // in MongoDB and the frontend falls back to them automatically.
    fieldsToDisplay: [],
    programRoles:    "",
    programStipend:  "",
    programDuration: "",
    deadlineText:    "",
    deadline:        "",
    deadlineISO:     "",
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
      geminiUsed:           !!gemini,
      geminiEmailType:      gemini?.emailType      ?? null,
      geminiClassification: gemini?.classification ?? null,
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
}

module.exports = { parseEmailWithLLM, extractFormLink, resolveCompany };
