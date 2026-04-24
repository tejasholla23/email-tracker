function extractCompany(text) {
  const patterns = [
    /Campus recruitment by ([A-Za-z0-9&.\s]+)/i,
    /at ([A-Za-z0-9&.\s]+)/i,
    /^([A-Za-z0-9&.\s]+)\s*\|/,
    /@([a-zA-Z0-9-]+)\.com/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return cleanCompany(match[1]);
    }
  }

  return null;
}

function cleanValue(value) {
  return value.trim().replace(/[.,;:!?]+$/, "");
}

function cleanCompany(name) {
  const cleaned = name
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\b(by|for)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function cleanRole(role) {
  return cleanValue(role)
    .replace(/\b(Program|opportunity)\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRole(text) {
  const rolesLineMatch = text.match(/Roles?:\s*([^\n]+)/i);
  if (rolesLineMatch && rolesLineMatch[1]) {
    const normalizedRoles = rolesLineMatch[1].replace(/\sand\s/gi, ", ");
    return cleanRole(normalizedRoles);
  }

  const keywordMatches = text.match(
    /((Software Engineer|SDE|Developer|Intern|Data Scientist|Full Stack)[^\n,]*)/gi
  );
  if (keywordMatches && keywordMatches.length > 0) {
    return cleanRole(keywordMatches[0]);
  }

  return null;
}

function extractType(text) {
  const lowerText = text.toLowerCase();
  const hasInternship = lowerText.includes("intern") || lowerText.includes("internship");
  const hasFullTime = lowerText.includes("full time") || lowerText.includes("full-time");

  if (hasInternship && hasFullTime) {
    const role = extractRole(text);
    if (role && role.toLowerCase().includes("intern")) {
      return "Internship";
    }
    return "Full-time";
  }

  if (hasInternship) {
    return "Internship";
  }

  if (hasFullTime) {
    return "Full-time";
  }

  return null;
}

function extractDate(text) {
  const patterns = [
    /\d{1,2}(st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i,
    /\d{1,2}(st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[0]) {
      return match[0].trim();
    }
  }

  return null;
}

function extractLink(text) {
  const links = text.match(/https?:\/\/[^\s]+/g);
  if (!links || links.length === 0) {
    return null;
  }

  if (links.length === 1) {
    return links[0].trim().replace(/[).,;:!?]+$/, "");
  }

  const preferredKeywords = ["form", "apply", "register"];
  const preferredLink = links.find((link) =>
    preferredKeywords.some((keyword) => link.toLowerCase().includes(keyword))
  );

  return (preferredLink || links[0]).trim().replace(/[).,;:!?]+$/, "");
}

function extractStatus(text) {
  const lowerText = text.toLowerCase();

  if (lowerText.includes("shortlisted")) {
    return "Shortlisted";
  }

  if (lowerText.includes("rejected")) {
    return "Rejected";
  }

  if (lowerText.includes("selected")) {
    return "Selected";
  }

  if (
    lowerText.includes("apply") ||
    lowerText.includes("registration") ||
    lowerText.includes("register")
  ) {
    return "Open";
  }

  return "Open";
}

function parseEmail(text) {
  return {
    company: extractCompany(text),
    role: extractRole(text),
    type: extractType(text),
    testDate: extractDate(text),
    link: extractLink(text),
    status: extractStatus(text),
    source: "Gmail",
    rawText: text,
  };
}

module.exports = {
  parseEmail,
  extractCompany,
  extractRole,
  extractType,
  extractDate,
  extractLink,
  extractStatus,
};
