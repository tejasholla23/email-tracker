require("dotenv").config();
const { resolveDeadlineISO } = require("../utils/parseEmailWithLLM");

function runTests() {
  console.log("Running Date Resolution Tests...");

  const testCases = [
    { input: "05-07-2026(5pm)", expectedMonth: 7, expectedDay: 5, expectedYear: 2026 },
    { input: "25-07-2026 (5pm)", expectedMonth: 7, expectedDay: 25, expectedYear: 2026 },
    { input: "07-25-2026 (5pm)", expectedMonth: 7, expectedDay: 25, expectedYear: 2026 },
    { input: "05/07/2026", expectedMonth: 7, expectedDay: 5, expectedYear: 2026 },
    { input: "2026-07-05", expectedMonth: 7, expectedDay: 5, expectedYear: 2026 }, // standard ISO format fallthrough
  ];

  for (const tc of testCases) {
    const isoString = resolveDeadlineISO(tc.input);
    if (!isoString) {
      console.error(`❌ Failed: input "${tc.input}" returned empty string`);
      continue;
    }
    const parsedDate = new Date(isoString);
    // Note: parsedDate represents the date. Since ISO format uses UTC internally (+00:00) but createDateInIST uses +05:30:
    // createDateInIST(2026, 7, 5, 17, 0) -> "2026-07-05T17:00:00+05:30"
    // Let's format it in Asia/Kolkata timezone to verify parts.
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric"
    });
    const parts = formatter.formatToParts(parsedDate);
    const getVal = (type) => parseInt(parts.find(p => p.type === type).value, 10);
    
    const year = getVal("year");
    const month = getVal("month");
    const day = getVal("day");

    if (year === tc.expectedYear && month === tc.expectedMonth && day === tc.expectedDay) {
      console.log(`✅ Success: "${tc.input}" -> ${isoString} (IST: ${month}/${day}/${year})`);
    } else {
      console.error(`❌ Failed: "${tc.input}" -> expected ${tc.expectedMonth}/${tc.expectedDay}/${tc.expectedYear}, got ${month}/${day}/${year} (ISO: ${isoString})`);
    }
  }
}

runTests();
