const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

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
    // Capitalize each word for neatness
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
  return "new"; // Safe fallback
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
  // Extract URLs starting with http or https, stopping at whitespace, quotes, or angle brackets
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const rawAll = (text || "").match(urlRegex) || [];
  
  // Clean trailing punctuation (e.g. commas, dots, closing parentheses) and remove duplicates
  const cleanedAll = rawAll.map(url => url.replace(/[.,;)]+$/, ""));
  const uniqueUrls = [...new Set(cleanedAll)];

  // Select the most relevant application URL
  const formsGle = uniqueUrls.find((u) => /forms\.gle\//i.test(u));
  const docsForms = uniqueUrls.find((u) => /docs\.google\.com\/forms\//i.test(u));
  const unstop = uniqueUrls.find((u) => /unstop\.com\//i.test(u));
  const brazen = uniqueUrls.find((u) => /brazenconnect\.com\//i.test(u));
  
  const primary = formsGle || docsForms || unstop || brazen || uniqueUrls[0] || "";
  
  return { primary, all: uniqueUrls, isForm: !!(formsGle || docsForms) };
}

function companyFromSender(senderRaw = "") {
  const domainMatch = (senderRaw || "").match(/@([a-zA-Z0-9-]+)\./);
  if (!domainMatch) return null;
  const domainName = domainMatch[1].toLowerCase();
  const genericDomains = [
    "gmail", "yahoo", "outlook", "hotmail", "noreply", "no-reply",
    "mail", "info", "notifications", "mailer", "msrit", "placement",
    "dean", "career", "careers"
  ];
  if (genericDomains.includes(domainName)) return null;
  return domainName
    .split(/[-\.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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
  tcs: "TCS",
  "tata consultancy services": "TCS",
  dentsu: "Dentsu",
  flipr: "Flipr",
  altair: "Altair Engineering",
  "altair engineering": "Altair Engineering",
  nokia: "Nokia",
  haber: "Haber",
  amazon: "Amazon",
  google: "Google",
  microsoft: "Microsoft",
  infosys: "Infosys",
  wipro: "Wipro",
  cognizant: "Cognizant",
  accenture: "Accenture",
  capgemini: "Capgemini",
  hcl: "HCL",
  flipkart: "Flipkart",
  ibm: "IBM",
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
      if (candidate && !isGenericCompanyName(candidate)) return candidate;
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
  // Remove all URLs so domains don't trigger alias matches
  cleaned = cleaned.replace(/https?:\/\/[^\s<>"']+/gi, "");
  
  // Remove generic platform names
  for (const term of PLATFORM_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    cleaned = cleaned.replace(regex, "");
  }
  return cleaned;
}

function resolveCompany({ subject = "", body = "", sender = "", forwarded = {} }) {
  const cleanSubject = stripPlatformReferences(subject);
  const cleanBody = stripPlatformReferences(body);
  const cleanFwdSubject = stripPlatformReferences(forwarded.subject);
  const cleanFwdBody = stripPlatformReferences(forwarded.body);

  const candidates = [cleanFwdSubject, forwarded.from, cleanSubject, cleanBody, sender].filter(Boolean);
  for (const candidate of candidates) {
    const known = matchKnownCompany(candidate);
    if (known) return { company: known, source: 'alias', confidence: 1.0 };
  }

  if (sender) {
    const senderCompany = companyFromSender(sender);
    if (senderCompany && !isGenericCompanyName(senderCompany)) {
      const alias = matchKnownCompany(senderCompany);
      return { company: alias || senderCompany, source: 'sender', confidence: 0.9 };
    }
  }

  const subjectCompany = extractCompanyFromText(cleanSubject || cleanFwdSubject);
  if (subjectCompany) return { company: subjectCompany, source: 'subject', confidence: 0.7 };

  const bodyCompany = extractCompanyFromText(cleanBody || cleanFwdBody);
  if (bodyCompany) return { company: bodyCompany, source: 'body', confidence: 0.6 };

  return { company: "", source: 'none', confidence: 0.0 };
}

function classifyEmail({ subject = "", body = "", forwarded = {}, hasLink = false }) {
  const text = `${subject} ${body}`.toLowerCase();
  const rules = [
    {
      category: "interviewResult",
      classification: "Interview Result",
      status: "offer",
      type: "unknown",
      regex: /\b(offer|congratulations|selected|shortlisted|happy to inform|pleased to inform)\b/i,
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

  const numericMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
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
      
      // Reject if it's just a number without context, or just "rs."
      if (numericOnly.test(cleanedValue) && !hasCurrencyOrUnit) continue;
      if (/^(?:rs\.?|inr|₹|usd)\s*$/i.test(cleanedValue)) continue;

      // Extract raw number value to ensure precision
      const numMatch = cleanedValue.match(/([0-9,]+(?:\.\d+)?)/);
      if (numMatch) {
        const numVal = parseFloat(numMatch[1].replace(/,/g, ""));
        // If number is very low (e.g. 1 or 2), it MUST have a modifier like Lakhs or LPA to be valid
        if (numVal < 100 && !/\b(?:lpa|lakhs|k|thousands|crores)\b/i.test(cleanedValue)) {
           continue; // Reject low precision trash
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
  // We only operate on the clean lines (not stripped of newlines yet, but trimmed)
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
        
        // Stop at sentence boundaries and common separators
        const boundaries = [". ", " - ", " | ", " Dear ", " Greetings ", " Please ", " Note: "];
        for (const boundary of boundaries) {
          const idx = rawDeadline.toLowerCase().indexOf(boundary.toLowerCase());
          if (idx !== -1) {
            rawDeadline = rawDeadline.substring(0, idx);
          }
        }
        
        rawDeadline = rawDeadline.trim();
        
        // Reject multi-line, obvious paragraphs, or highly suspicious long strings
        if (rawDeadline.length > 40) return "";
        if (/\b(dear|greetings|sincerely|thanks|regards|sir|madam)\b/i.test(rawDeadline)) return "";
        
        if (!/^(before|by|deadline)/i.test(rawDeadline)) rawDeadline = `Before ${rawDeadline}`;
        return rawDeadline;
      }
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
  if (classification === "newOpportunity") return `${base} Opportunity`;
  if (roleCandidate && roleCandidate !== "Unknown Role") return `${base} ${roleCandidate}`;
  return `${base} Opportunity`;
}

function buildProcessId(company = "") {
  return normalizeKey(company) || "unknown-process";
}

async function callGeminiFallback({ subject = "", sender = "", body = "" }) {
  const prompt = `You are a structured parser.\nReturn only JSON.\n{\n  "company": "<company name or empty>",\n  "role": "<role or event title or empty>",\n  "classification": "<New Hiring Opportunity|Registration Link|Application Reminder|PPT Announcement|Assessment Announcement|Interview Schedule|Interview Result|Venue Update|Deadline Reminder|Generic Placement Notice|Non-Recruitment Email>",\n  "type": "<internship|full-time|test|unknown>",\n  "status": "<applied|interview|offer|rejected>",\n  "link": "<URL or empty>",\n  "eventDate": "<YYYY-MM-DD or empty>",\n  "deadlineISO": "<YYYY-MM-DDTHH:MM:SS.sssZ or empty>",\n  "venue": "<venue or empty>",\n  "durationText": "<duration or empty>",\n  "salaryText": "<salary or empty>"\n}\nIMPORTANT: Ignore webinar and form platforms (e.g., Microsoft Teams, Google Forms, Zoom, Unstop, Brazen) when determining the company name. The company is the actual employer/recruiter.\nSubject: ${subject}\nSender: ${sender}\nBody: ${body}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
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

async function parseEmailWithLLM(subject, sender = "", fullBodyText = "", referenceDate = new Date(), rawText = "") {
  const body = normalizeText(fullBodyText || rawText || "");
  const forwarded = parseForwardedEmail(body);
  const sourceBody = forwarded.body || body;
  const sourceSubject = forwarded.subject || subject || "";
  const linkInfo = extractFormLink(sourceBody);
  const classification = classifyEmail({
    subject: sourceSubject,
    body: sourceBody,
    forwarded,
    hasLink: !!linkInfo.primary,
  });
  const companyObj = resolveCompany({ subject: sourceSubject, body: sourceBody, sender, forwarded });
  let company = companyObj.company;
  let companyConfidence = companyObj.confidence;
  let companySource = companyObj.source;
  const eventDate = extractEventDate(sourceBody, referenceDate);
  const deadlineInfo = extractDeadlineDetails(sourceBody, referenceDate);
  const reportingTime = extractReportingTime(sourceBody);
  const venue = extractVenue(sourceBody);
  const durationText = extractDuration(sourceBody);
  const salaryText = extractSalary(sourceBody);
  const programRoles = extractProgramRoles(sourceBody);
  const jobRole = programRoles || keywordRoleFallback(sourceBody);
  let title = generateTitle(company, classification.category, sourceSubject, jobRole, sourceBody);
  const processId = buildProcessId(company);

  let llmFallback = {};
  if ((!company || companyConfidence <= 0.6 || classification.confidence < 0.5) && /\b(apply|registration|interview|assessment|deadline|aptitude|profile|seminar|ppt|placement|recruitment)\b/i.test(`${sourceSubject} ${sourceBody}`)) {
    llmFallback = await callGeminiFallback({ subject: sourceSubject, sender, body: sourceBody });
    if (llmFallback.company && sanitizeCompany(llmFallback.company)) {
      if (!company || companyConfidence <= 0.6) {
        company = sanitizeCompany(llmFallback.company);
        companyConfidence = 0.8;
        companySource = "llm-fallback";
      }
    }
    if (llmFallback.role && !title) {
      title = llmFallback.role;
    }
  }

  const resolvedCompany = company ? (sanitizeCompany(company) || "") : "";
  if (!resolvedCompany) {
    companySource = "none";
    companyConfidence = 0;
  }
  const finalClassification = llmFallback.classification && llmFallback.classification !== "Non-Recruitment Email"
    ? llmFallback.classification
    : classification.classification;
  const finalCategory = llmFallback.classification && llmFallback.classification !== "Non-Recruitment Email"
    ? normalizeKey(llmFallback.classification).replace(/\s+/g, "")
    : classification.category;
  const finalStatus = llmFallback.status ? normalizeStatus(llmFallback.status) : normalizeStatus(classification.status);
  const finalType = llmFallback.type || classification.type;

  const parsed = {
    isRelevant: finalCategory !== "nonRecruitment",
    classification: finalClassification,
    type: finalType,
    status: finalStatus,
    confidenceScore: Math.min(1, classification.confidence + (resolvedCompany ? 0.05 : 0)),
    company: resolvedCompany,
    jobRole: jobRole || llmFallback.role || "Unknown Role",
    title: title || llmFallback.role || (resolvedCompany ? `${resolvedCompany} Opportunity` : "Unknown Opportunity"),
    role: title || llmFallback.role || (resolvedCompany ? `${resolvedCompany} Opportunity` : "Unknown Opportunity"),
    processId: processId || buildProcessId(resolvedCompany),
    processName: `${resolvedCompany || "Unknown Company"} hiring process`,
    eventDate: eventDate || null,
    eventTime: sourceBody.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)?.[0]?.toUpperCase() || "",
    reportingTime: reportingTime || "",
    venue: venue || llmFallback.venue || "",
    durationText: durationText || llmFallback.durationText || "",
    salaryText: salaryText || llmFallback.salaryText || "",
    deadline: deadlineInfo.deadline || "",
    deadlineISO: deadlineInfo.iso || llmFallback.deadlineISO || "",
    deadlineText: extractDeadlineText(sourceBody),
    link: linkInfo.primary || llmFallback.link || "",
    links: linkInfo.all.length ? linkInfo.all : llmFallback.link ? [llmFallback.link] : [],
    isFormLink: linkInfo.isForm || /docs\.google\.com\/forms|forms\.gle/.test(linkInfo.primary || llmFallback.link || ""),
    programRoles: programRoles || llmFallback.role || "",
    programDuration: extractProgramDuration(sourceBody) || llmFallback.durationText || "",
    programStipend: extractProgramStipend(sourceBody) || llmFallback.salaryText || "",
    parseMeta: {
      sourceSubject: sourceSubject,
      forwarded: forwarded.isForwarded,
      sender,
      classificationSource: classification.classification,
      companySource: companySource,
      companyConfidence: companyConfidence,
      hasLink: !!linkInfo.primary,
      rawTitle: title,
      fallback: llmFallback,
    },
  };

  console.log(`[PARSER_SUMMARY] Company: ${parsed.company || 'None'}, JobRole: ${parsed.jobRole || 'None'}, Classification: ${parsed.classification} (Confidence: ${parsed.confidenceScore})`);

  return parsed;
}

module.exports = { parseEmailWithLLM, extractFormLink, resolveCompany };
