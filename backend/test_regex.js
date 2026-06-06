const patterns = [
  /(?:Company|Organization|Employer|Recruiter)\s*[:\-]\s*([A-Z][A-Za-z0-9&.\s]{1,80}?)(?:\s*(?:\.|,|;|$))/i,
  /(?:from|by|at)\s+([A-Z][A-Za-z0-9&.\s]{1,60}?)(?=\s+(?:for|about|regarding|hiring|is|offers?|invites?|interview|role|drive|program|placement|campus|job|internship))/i,
  /\b([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})\b(?=\s+(?:is|has|offers|invites|announces|conducts|hiring|drives|for|regarding|registered))/,
  /\b(amazon|google|microsoft|tcs|deloitte|accenture|cognizant|infosys|wipro|blackrock|ibm|flipkart|uber|intel|capgemini|hcl|bosch|dell|nokia|haber|altair)\b/i,
];

const subjects = [
  "Mandatory Aptitude Test",
  "Invitation Interview Result",
  "Eligibility Criteria Interview Result",
  "Design Deadline Reminder",
  "SEP Roadshow Registration Reminder"
];

subjects.forEach(subject => {
  console.log(`\n--- Subject: ${subject} ---`);
  patterns.forEach((p, i) => {
    const match = subject.match(p);
    if (match) console.log(`Pattern ${i} matched: ${match[1]}`);
  });
});
