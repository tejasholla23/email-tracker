function sanitizeCompany(raw = "") {
  const trimmed = (raw || "").trim();
  const lower = trimmed.toLowerCase();
  
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 5) return null;

  const invalid = ["", "unknown", "n/a", "na", "none", "company", "team", "the company", "our company", "hiring team"];
  const rejectIfContains = [
    "your institution", "your college", "your university", "your institute",
    "register", "registration", "apply by", "application", "last date",
    "subject", "dear sir", "dear madam", "please find", "please register",
    "inbox", "forwarded message", "authorised signatory",
    "dear students", "kindly", "venue", "today", "tomorrow", "assessment",
    "online test", "placement", "recruitment", "opportunity", "hiring"
  ];
  if (invalid.includes(lower)) return null;
  if (rejectIfContains.some((term) => lower.includes(term))) return null;
  if (/\b(your|our|this|the)\s+(institution|college|university|institute)\b/.test(lower)) return null;
  
  if (/[.!?][\sA-Za-z]/.test(trimmed)) return null;

  return trimmed;
}

const tests = [
  "KhelBook at 3PM today. Venue",
  "Graphene 2027 Dear Students Kindly go through the details",
  "Assessment Online Test",
  "Amazon",
  "TCS",
  "Google",
  "Dentsu",
  "StoneX 2027 Dear Students Kindly go through the details"
];

for (const t of tests) {
  console.log(`"${t}" =>`, sanitizeCompany(t));
}
