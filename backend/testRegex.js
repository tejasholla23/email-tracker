const text = `Registration & Submission Window: 4th June 2026 – 5th July 2026
Cash prizes up to ₹ 4,50,000 (1st: ₹ 3,00,000 | 2nd: ₹ 1,00,000 | 3rd: ₹ 50,000).  
Eligibility Criteria for participation:
All engineering students of 3rd and 4th year.
Team size : minimum 1, maximum 5.`;

const extract = (regex) => {
  const match = text.match(regex);
  if (match) return match[1].trim();
  return null;
};

console.log("Prize:", extract(/(?:prize pool|cash prizes|total prize|win up to|rewards|prize)[ \t:]*([^\n\r]+)/i));
console.log("Team Size:", extract(/(?:team format|team size)[ \t:]*([^\n\r]+)/i));
console.log("Eligibility:", extract(/(?:who can participate|who can apply|eligibility(?: criteria(?: for participation)?)?)[ \t:]*[\n\r]*[ \t]*([^\n\r]+)/i));
console.log("Deadline:", extract(/(?:registration deadline|registration & submission window|registration closes|register by|last date|apply by|submission window)[ \t:]*([^\n\r]+)/i));
