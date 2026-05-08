// Test the extraction helpers directly

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

// Test cases
const nokiaText = "Campus recruitment by ​Nokia 2027 Dear Students Kindly go through the details about the Campus recruitment by Nokia Internship Program Details Duration: 11 months Student Benefits: Interns will gain hands-on experience with real-world";
const haberText = "Campus recruitment by Haber 2027 Dear Students, Kindly go through the details about the Campus recruitment by Haber Roles: Data Science Interns and Full Stack Engineering Interns Branches: BE-CSE,ISE,AI&DS,AIML,CSE(AIML) &";
const dentsuText = "Fwd: Dentsu - Internship Program 2027 From: @dentsu.com> Subject: Re: Dentsu - Internship Program 2027 Hello Sir, Greetings from Dentsu. It was a pleasure talking to you and we are very excited to visit the Campus in person/Virtual for";
const stoneXText = "Fwd: StoneX | 2027 Final Year Student Apprentice Program | MSRIT | Pre-Placement talk Dear All, Please find the email below regarding the pre-placement talk by StoneX, scheduled from 12th to 13th May between 4:00 PM and 5:00 PM. Kindly register on or before 6th May. Thanks, Placement";

console.log("\n=== NOKIA ===");
console.log("Roles:", extractProgramRoles(nokiaText));
console.log("Duration:", extractProgramDuration(nokiaText));

console.log("\n=== HABER ===");
console.log("Roles:", extractProgramRoles(haberText));
console.log("Duration:", extractProgramDuration(haberText));

console.log("\n=== DENTSU ===");
console.log("Roles:", extractProgramRoles(dentsuText));
console.log("Duration:", extractProgramDuration(dentsuText));

console.log("\n=== STONEX ===");
console.log("Roles:", extractProgramRoles(stoneXText));
console.log("Duration:", extractProgramDuration(stoneXText));
