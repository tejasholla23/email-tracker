"use strict";

const XLSX = require("xlsx");

/**
 * Standard Karnataka / VTU / MSRIT USN regex pattern.
 * Examples: 1ms23ci126, 1MS23CS001, 1ms21is045, 1ms23aiml001
 */
const USN_REGEX = /^[0-9][a-zA-Z]{2}[0-9]{2}[a-zA-Z]{2,4}[0-9]{3}$/;

/**
 * Derives a normalized uppercase USN from an email string or list of emails.
 *
 * @param {string|Array<string>} emails - Email address or list of addresses (e.g. primary + linked)
 * @returns {string} Normalized uppercase USN or empty string
 */
function deriveUsnFromEmail(emails) {
  const emailList = Array.isArray(emails) ? emails : [emails];

  for (const rawEmail of emailList) {
    if (!rawEmail || typeof rawEmail !== "string") continue;
    const email = rawEmail.trim().toLowerCase();
    const localPart = email.split("@")[0] || "";

    if (USN_REGEX.test(localPart)) {
      return localPart.toUpperCase();
    }

    // Check if domain is msrit.edu
    if (email.endsWith("@msrit.edu") && localPart) {
      // Clean possible sub-identifiers or separators
      const cleanLocal = localPart.replace(/[^a-zA-Z0-9]/g, "");
      if (USN_REGEX.test(cleanLocal)) {
        return cleanLocal.toUpperCase();
      }
    }
  }

  return "";
}

/**
 * Normalizes a full name for comparison:
 * Lowercases, strips punctuation, normalizes whitespace.
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^\w\s]/gi, " ")       // replace punctuation with space
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim();
}

/**
 * Builds the student identity vector in-memory.
 *
 * @param {Object} account - Mongoose Account document or user object
 * @param {Array<string>} linkedEmails - Optional array of linked Gmail account emails
 * @returns {Object} Student identity vector
 */
function buildStudentIdentity(account = {}, linkedEmails = []) {
  const primaryEmail = (account.email || "").toLowerCase().trim();
  const allEmails = [primaryEmail, ...linkedEmails.map((e) => (e || "").toLowerCase().trim())].filter(Boolean);

  const derivedUsn = deriveUsnFromEmail(allEmails);
  const profile = account.studentProfile || {};

  const collegeEmail = primaryEmail.endsWith("@msrit.edu")
    ? primaryEmail
    : allEmails.find((e) => e.endsWith("@msrit.edu")) || primaryEmail;

  const rawPhone = (profile.mobileNumber || "").replace(/\D/g, "");
  const normalizedPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : "";

  return {
    usn: derivedUsn,
    collegeEmail: collegeEmail,
    personalEmail: (profile.personalEmail || "").toLowerCase().trim(),
    mobileNumber: normalizedPhone,
    fullName: normalizeName(profile.fullName || ""),
  };
}

/**
 * Checks whether a header string matches known column aliases for student identity fields.
 */
function classifyHeaderColumn(headerStr) {
  if (!headerStr || typeof headerStr !== "string") return null;
  const h = headerStr.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

  // USN / Roll No
  if (
    /\b(usn|university seat number|roll no|roll number|roll num|rollno|university roll no|reg no|registration no|urn|seat no)\b/.test(
      h
    )
  ) {
    return "usn";
  }

  // Email
  if (/\b(email|email id|email address|e mail|e mail id|student email|candidate email)\b/.test(h)) {
    return "email";
  }

  // Mobile / Phone
  if (/\b(mobile|mobile number|contact number|phone|phone number|phone no|contact no|cell|whatsapp)\b/.test(h)) {
    return "mobile";
  }

  // Name
  if (
    /\b(name|candidate name|full name|student name|candidate full name|name of candidate|applicant name)\b/.test(h)
  ) {
    return "name";
  }

  return null;
}

/**
 * Checks if cell string matches an identity value according to priority hierarchy.
 */
function matchCellAgainstIdentity(cellValue, identity) {
  if (cellValue === null || cellValue === undefined) return null;
  const rawStr = String(cellValue).trim();
  if (!rawStr) return null;

  const strLower = rawStr.toLowerCase();
  const strUpper = rawStr.toUpperCase().replace(/\s+/g, "");

  // 1. USN exact match (Priority 1)
  if (identity.usn && identity.usn.length >= 7) {
    if (strUpper === identity.usn || new RegExp(`\\b${identity.usn}\\b`, "i").test(rawStr)) {
      return { type: "usn" };
    }
  }

  // 2. College email exact match (Priority 2)
  if (identity.collegeEmail && identity.collegeEmail.includes("@")) {
    if (strLower === identity.collegeEmail || strLower.includes(identity.collegeEmail)) {
      return { type: "college_email" };
    }
  }

  // 3. Personal email exact match (Priority 3)
  if (identity.personalEmail && identity.personalEmail.includes("@")) {
    if (strLower === identity.personalEmail || strLower.includes(identity.personalEmail)) {
      return { type: "personal_email" };
    }
  }

  // 4. Mobile number match (Priority 4)
  if (identity.mobileNumber && identity.mobileNumber.length === 10) {
    const digits = rawStr.replace(/\D/g, "");
    if (digits.endsWith(identity.mobileNumber)) {
      return { type: "mobile" };
    }
  }

  // 5. Normalized full name match (Priority 5)
  if (identity.fullName && identity.fullName.length >= 4) {
    const normCell = normalizeName(rawStr);
    if (normCell === identity.fullName || (normCell.length >= 5 && normCell.includes(identity.fullName))) {
      return { type: "name" };
    }
  }

  return null;
}

// Resource limits for spreadsheet processing to prevent zip bombs/DoS (SEC-05)
const MAX_XLSX_SIZE = 10 * 1024 * 1024; // 10MB limit
const MAX_SHEETS_TO_SCAN = 10;
const MAX_ROWS_PER_SHEET = 5000;

/**
 * Inspect an XLSX fileBuffer and determine:
 * 1. Is this a student shortlist / assessment list?
 * 2. Does this student appear in it?
 * 
 * @param {Buffer} fileBuffer - Binary XLSX buffer from Gmail API
 * @param {Object} identity - Student identity vector from buildStudentIdentity
 * @param {string} filename - Attachment filename for context
 * @returns {Object} { isShortlist: boolean, status: 'matched'|'no_match'|'skipped'|'error', matchDetails: Object }
 */
function inspectAndMatchWorkbook(fileBuffer, identity = {}, filename = "") {
  try {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      return {
        isShortlist: false,
        status: "error",
        matchDetails: { error: "Empty or invalid buffer", processedAt: new Date() },
      };
    }

    // Guard against zip bombs / oversized spreadsheet buffers (SEC-05)
    if (fileBuffer.length > MAX_XLSX_SIZE) {
      console.warn(`[SHORTLIST_MATCHER] File "${filename}" exceeds 10MB limit (${fileBuffer.length} bytes > ${MAX_XLSX_SIZE} bytes)`);
      return {
        isShortlist: false,
        status: "skipped",
        matchDetails: {
          error: `File size exceeds 10MB limit (${Math.round(fileBuffer.length / (1024 * 1024))}MB)`,
          processedAt: new Date(),
        },
      };
    }

    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true, dense: true });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        isShortlist: false,
        status: "error",
        matchDetails: { error: "Workbook contains no valid sheets", processedAt: new Date() },
      };
    }

    let hasAnyStudentTable = false;
    let firstSheetName = workbook.SheetNames[0] || "Sheet1";

    const sheetNamesToScan = workbook.SheetNames.slice(0, MAX_SHEETS_TO_SCAN);
    for (const sheetName of sheetNamesToScan) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert sheet to 2D array of values, bounded to MAX_ROWS_PER_SHEET to prevent memory exhaustion
      const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!allRows || allRows.length < 2) continue; // Needs at least a header and 1 row
      const rows = allRows.slice(0, MAX_ROWS_PER_SHEET);

      // ── Find Header Row (scan first 5 rows) ──
      let headerRowIndex = -1;
      let colMap = {};

      for (let r = 0; r < Math.min(rows.length, 6); r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;

        let detectedCols = {};
        let keywordHits = 0;

        for (let c = 0; c < row.length; c++) {
          const colType = classifyHeaderColumn(String(row[c] || ""));
          if (colType) {
            detectedCols[colType] = c;
            keywordHits++;
          }
        }

        if (keywordHits >= 1) {
          headerRowIndex = r;
          colMap = detectedCols;
          break;
        }
      }

      // If we found recognizable student column headers or row looks like student table
      if (headerRowIndex !== -1 && Object.keys(colMap).length > 0) {
        hasAnyStudentTable = true;
      }

      // ── Scan Rows ──
      const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

      for (let r = startRow; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        // Skip completely empty rows
        const hasContent = row.some((val) => val !== "" && val !== null && val !== undefined);
        if (!hasContent) continue;

        // Pass A: Check header-mapped columns first
        if (colMap.usn !== undefined) {
          const match = matchCellAgainstIdentity(row[colMap.usn], { usn: identity.usn });
          if (match) {
            return {
              isShortlist: true,
              status: "matched",
              matchDetails: {
                matchedIdentifierType: "usn",
                sheetName,
                processedAt: new Date(),
              },
            };
          }
        }

        if (colMap.email !== undefined) {
          const match = matchCellAgainstIdentity(row[colMap.email], {
            collegeEmail: identity.collegeEmail,
            personalEmail: identity.personalEmail,
          });
          if (match) {
            return {
              isShortlist: true,
              status: "matched",
              matchDetails: {
                matchedIdentifierType: match.type,
                sheetName,
                processedAt: new Date(),
              },
            };
          }
        }

        if (colMap.mobile !== undefined) {
          const match = matchCellAgainstIdentity(row[colMap.mobile], {
            mobileNumber: identity.mobileNumber,
          });
          if (match) {
            return {
              isShortlist: true,
              status: "matched",
              matchDetails: {
                matchedIdentifierType: "mobile",
                sheetName,
                processedAt: new Date(),
              },
            };
          }
        }

        if (colMap.name !== undefined) {
          const match = matchCellAgainstIdentity(row[colMap.name], {
            fullName: identity.fullName,
          });
          if (match) {
            return {
              isShortlist: true,
              status: "matched",
              matchDetails: {
                matchedIdentifierType: "name",
                sheetName,
                processedAt: new Date(),
              },
            };
          }
        }

        // Pass B: Fallback cell scanning across all columns in this row
        for (let c = 0; c < row.length; c++) {
          const match = matchCellAgainstIdentity(row[c], identity);
          if (match) {
            return {
              isShortlist: true,
              status: "matched",
              matchDetails: {
                matchedIdentifierType: match.type,
                sheetName,
                processedAt: new Date(),
              },
            };
          }
        }
      }
    }

    // If filename or contents indicated a candidate table but no match found
    const fnLower = (filename || "").toLowerCase();
    const isLikelyShortlistFilename =
      /shortlist|selected|cleared|assessment|interview|round|eligible|hiring|candidates|results|test|oa/i.test(
        fnLower
      );

    if (hasAnyStudentTable || isLikelyShortlistFilename) {
      return {
        isShortlist: true,
        status: "no_match",
        matchDetails: {
          sheetName: firstSheetName,
          processedAt: new Date(),
        },
      };
    }

    // If not a candidate/student table, mark as skipped
    return {
      isShortlist: false,
      status: "skipped",
      matchDetails: {
        sheetName: firstSheetName,
        processedAt: new Date(),
      },
    };
  } catch (err) {
    console.error("[SHORTLIST_MATCHER_ERR]", err.message);
    return {
      isShortlist: false,
      status: "error",
      matchDetails: {
        error: err.message,
        processedAt: new Date(),
      },
    };
  }
}

/**
 * Recomputes the application-level shortlist summary state from its attachments.
 * Attachment results are the single source of truth.
 *
 * @param {Object} app - Mongoose Application document or object
 */
function recomputeApplicationShortlistState(app) {
  if (!app) return;

  const matchedAtt = (app.attachments || []).find((a) => a.shortlistStatus === "matched");

  if (matchedAtt) {
    app.isShortlisted = true;
    app.shortlistSummary = {
      matchedAttachmentId: matchedAtt.attachmentId,
      matchedFilename: matchedAtt.filename || "Shortlist.xlsx",
      matchedMessageId: matchedAtt.messageId,
      matchedIdentifierType: matchedAtt.shortlistDetails?.matchedIdentifierType || "usn",
      detectedAt: matchedAtt.shortlistDetails?.processedAt || new Date(),
    };
  } else {
    app.isShortlisted = false;
    app.shortlistSummary = null;
  }
}

module.exports = {
  deriveUsnFromEmail,
  normalizeName,
  buildStudentIdentity,
  classifyHeaderColumn,
  matchCellAgainstIdentity,
  inspectAndMatchWorkbook,
  recomputeApplicationShortlistState,
};
