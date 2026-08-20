"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");

const {
  deriveUsnFromEmail,
  normalizeName,
  buildStudentIdentity,
  classifyHeaderColumn,
  inspectAndMatchWorkbook,
  recomputeApplicationShortlistState,
} = require("../utils/shortlistMatcher");

// Helper to create an in-memory XLSX Buffer from an array of rows
function createXLSXBuffer(sheetData, sheetName = "Sheet1") {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

// Helper to create a multi-sheet XLSX Buffer
function createMultiSheetBuffer(sheetsMap) {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheetsMap)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

test("deriveUsnFromEmail: extracts and uppercases valid MSRIT USN", () => {
  assert.equal(deriveUsnFromEmail("1ms23ci126@msrit.edu"), "1MS23CI126");
  assert.equal(deriveUsnFromEmail("1MS23CS001@msrit.edu"), "1MS23CS001");
  assert.equal(deriveUsnFromEmail("1ms21is045@msrit.edu"), "1MS21IS045");
  assert.equal(deriveUsnFromEmail("1ms23aiml001@msrit.edu"), "1MS23AIML001");
});

test("deriveUsnFromEmail: handles linked email arrays", () => {
  const emails = ["personal@gmail.com", "1ms23ci126@msrit.edu"];
  assert.equal(deriveUsnFromEmail(emails), "1MS23CI126");
});

test("deriveUsnFromEmail: returns empty string for non-USN emails", () => {
  assert.equal(deriveUsnFromEmail("john.doe@gmail.com"), "");
  assert.equal(deriveUsnFromEmail("placement@msrit.edu"), "");
  assert.equal(deriveUsnFromEmail(""), "");
  assert.equal(deriveUsnFromEmail(null), "");
});

test("normalizeName: cleans punctuation, accents, and extra whitespace", () => {
  assert.equal(normalizeName("Tejas  Holla"), "tejas holla");
  assert.equal(normalizeName("TEJAS HOLLA (Aadhar)"), "tejas holla aadhar");
  assert.equal(normalizeName("Téjas, Holla."), "tejas holla");
});

test("buildStudentIdentity: constructs vector from account and profile", () => {
  const account = {
    email: "1ms23ci126@msrit.edu",
    studentProfile: {
      fullName: "Tejas Holla",
      personalEmail: "tejasholla23@gmail.com",
      mobileNumber: "+91 98765-43210",
    },
  };
  const identity = buildStudentIdentity(account);

  assert.equal(identity.usn, "1MS23CI126");
  assert.equal(identity.collegeEmail, "1ms23ci126@msrit.edu");
  assert.equal(identity.personalEmail, "tejasholla23@gmail.com");
  assert.equal(identity.mobileNumber, "9876543210");
  assert.equal(identity.fullName, "tejas holla");
});

test("classifyHeaderColumn: recognizes real-world column variations", () => {
  assert.equal(classifyHeaderColumn("USN"), "usn");
  assert.equal(classifyHeaderColumn("University Seat Number"), "usn");
  assert.equal(classifyHeaderColumn("Roll No"), "usn");
  assert.equal(classifyHeaderColumn("University Roll No"), "usn");
  assert.equal(classifyHeaderColumn("Reg No"), "usn");

  assert.equal(classifyHeaderColumn("Email"), "email");
  assert.equal(classifyHeaderColumn("Email ID"), "email");
  assert.equal(classifyHeaderColumn("E-mail"), "email");
  assert.equal(classifyHeaderColumn("Candidate Email"), "email");

  assert.equal(classifyHeaderColumn("Name"), "name");
  assert.equal(classifyHeaderColumn("Full Name"), "name");
  assert.equal(classifyHeaderColumn("Candidate Name"), "name");
  assert.equal(classifyHeaderColumn("Candidate Full Name (As per Aadhar card)"), "name");

  assert.equal(classifyHeaderColumn("Contact Number"), "mobile");
  assert.equal(classifyHeaderColumn("Mobile Number"), "mobile");
  assert.equal(classifyHeaderColumn("Phone"), "mobile");

  assert.equal(classifyHeaderColumn("CGPA"), null);
  assert.equal(classifyHeaderColumn("Branch"), null);
});

test("inspectAndMatchWorkbook: matches student by USN in standard shortlist table", () => {
  const data = [
    ["Sl No", "USN", "Name", "Branch", "Email ID"],
    [1, "1MS23CS001", "Alice Smith", "CSE", "alice@msrit.edu"],
    [2, "1MS23CI126", "Tejas Holla", "ISE", "1ms23ci126@msrit.edu"],
    [3, "1MS23EC050", "Bob Jones", "ECE", "bob@msrit.edu"],
  ];
  const buffer = createXLSXBuffer(data);
  const identity = { usn: "1MS23CI126", collegeEmail: "1ms23ci126@msrit.edu" };

  const result = inspectAndMatchWorkbook(buffer, identity, "Shortlist_Round1.xlsx");
  assert.equal(result.isShortlist, true);
  assert.equal(result.status, "matched");
  assert.equal(result.matchDetails.matchedIdentifierType, "usn");
});

test("inspectAndMatchWorkbook: matches student by personal email when USN column missing", () => {
  const data = [
    ["Candidate Name", "Email ID", "Contact Number"],
    ["Alice Smith", "alice@gmail.com", "9111111111"],
    ["Tejas Holla", "tejasholla23@gmail.com", "9876543210"],
  ];
  const buffer = createXLSXBuffer(data);
  const identity = { personalEmail: "tejasholla23@gmail.com" };

  const result = inspectAndMatchWorkbook(buffer, identity, "Selected_Candidates.xlsx");
  assert.equal(result.isShortlist, true);
  assert.equal(result.status, "matched");
  assert.equal(result.matchDetails.matchedIdentifierType, "personal_email");
});

test("inspectAndMatchWorkbook: matches student by mobile number", () => {
  const data = [
    ["Student Name", "Mobile Number", "Status"],
    ["Alice Smith", "9111111111", "Cleared"],
    ["Tejas H", "+91 98765 43210", "Cleared"],
  ];
  const buffer = createXLSXBuffer(data);
  const identity = { mobileNumber: "9876543210" };

  const result = inspectAndMatchWorkbook(buffer, identity, "OA_Shortlist.xlsx");
  assert.equal(result.isShortlist, true);
  assert.equal(result.status, "matched");
  assert.equal(result.matchDetails.matchedIdentifierType, "mobile");
});

test("inspectAndMatchWorkbook: matches student by full name with title row on Row 1", () => {
  const data = [
    ["Company Placement Drive 2026 - Shortlisted Students"], // Row 0 banner
    [], // Row 1 blank
    ["Sl.No", "Candidate Full Name (As per Aadhar card)", "Degree", "Gender"], // Row 2 header
    [1, "Alice Smith", "B.Tech", "Female"],
    [2, "Tejas Holla", "B.Tech", "Male"],
  ];
  const buffer = createXLSXBuffer(data);
  const identity = { fullName: "tejas holla" };

  const result = inspectAndMatchWorkbook(buffer, identity, "Shortlist.xlsx");
  assert.equal(result.isShortlist, true);
  assert.equal(result.status, "matched");
  assert.equal(result.matchDetails.matchedIdentifierType, "name");
});

test("inspectAndMatchWorkbook: matches via fallback cell scanning with irregular headers", () => {
  const data = [
    ["ColA", "ColB", "ColC"],
    ["1", "Random Info", "1MS23CI126"],
  ];
  const buffer = createXLSXBuffer(data);
  const identity = { usn: "1MS23CI126" };

  const result = inspectAndMatchWorkbook(buffer, identity, "Candidates.xlsx");
  assert.equal(result.isShortlist, true);
  assert.equal(result.status, "matched");
  assert.equal(result.matchDetails.matchedIdentifierType, "usn");
});

test("inspectAndMatchWorkbook: matches student on second sheet of multi-sheet workbook", () => {
  const sheets = {
    "Round 1": [
      ["USN", "Name"],
      ["1MS23CS001", "Alice Smith"],
    ],
    "Round 2": [
      ["USN", "Name"],
      ["1MS23CI126", "Tejas Holla"],
    ],
  };
  const buffer = createMultiSheetBuffer(sheets);
  const identity = { usn: "1MS23CI126" };

  const result = inspectAndMatchWorkbook(buffer, identity, "Interview_Rounds.xlsx");
  assert.equal(result.isShortlist, true);
  assert.equal(result.status, "matched");
  assert.equal(result.matchDetails.sheetName, "Round 2");
});

test("inspectAndMatchWorkbook: returns no_match when user not in candidate list", () => {
  const data = [
    ["USN", "Name", "Email"],
    ["1MS23CS001", "Alice Smith", "alice@msrit.edu"],
    ["1MS23EC050", "Bob Jones", "bob@msrit.edu"],
  ];
  const buffer = createXLSXBuffer(data);
  const identity = { usn: "1MS23CI126", collegeEmail: "1ms23ci126@msrit.edu" };

  const result = inspectAndMatchWorkbook(buffer, identity, "Final_Shortlist.xlsx");
  assert.equal(result.isShortlist, true);
  assert.equal(result.status, "no_match");
});

test("inspectAndMatchWorkbook: returns skipped for non-recruitment financial/budget spreadsheet", () => {
  const data = [
    ["Department", "Budget Allocation", "Q1 Expense", "Q2 Expense"],
    ["IT Infra", 500000, 120000, 150000],
    ["HR Operations", 300000, 80000, 90000],
  ];
  const buffer = createXLSXBuffer(data);
  const identity = { usn: "1MS23CI126" };

  const result = inspectAndMatchWorkbook(buffer, identity, "Salary_Breakup.xlsx");
  assert.equal(result.isShortlist, false);
  assert.equal(result.status, "skipped");
});

test("inspectAndMatchWorkbook: handles empty or non-spreadsheet buffer gracefully", () => {
  const nullResult = inspectAndMatchWorkbook(null, { usn: "1MS23CI126" });
  assert.equal(nullResult.status, "error");

  const emptyResult = inspectAndMatchWorkbook(Buffer.alloc(0), { usn: "1MS23CI126" });
  assert.equal(emptyResult.status, "error");

  const nonSpreadsheetResult = inspectAndMatchWorkbook(Buffer.from("plain text string"), { usn: "1MS23CI126" });
  assert.equal(nonSpreadsheetResult.status, "skipped");
});

test("recomputeApplicationShortlistState: correctly derives application-level state", () => {
  const app = {
    attachments: [
      { attachmentId: "att_1", filename: "Brochure.pdf", shortlistStatus: "unprocessed" },
      {
        attachmentId: "att_2",
        filename: "Shortlist.xlsx",
        messageId: "msg_123",
        shortlistStatus: "matched",
        shortlistDetails: { matchedIdentifierType: "usn", processedAt: new Date() },
      },
    ],
  };

  recomputeApplicationShortlistState(app);
  assert.equal(app.isShortlisted, true);
  assert.equal(app.shortlistSummary.matchedAttachmentId, "att_2");
  assert.equal(app.shortlistSummary.matchedFilename, "Shortlist.xlsx");
  assert.equal(app.shortlistSummary.matchedIdentifierType, "usn");

  // When no attachment is matched
  app.attachments[1].shortlistStatus = "no_match";
  recomputeApplicationShortlistState(app);
  assert.equal(app.isShortlisted, false);
  assert.equal(app.shortlistSummary, null);
});
