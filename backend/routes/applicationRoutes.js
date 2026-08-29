const express = require("express");
const mongoose = require("mongoose");
const Application = require("../models/Application");
const CompanyInfo = require("../models/CompanyInfo");
const Account = require("../models/Account");
const { processCalendarSyncQueue } = require("../utils/calendarService");
const { enrichCompanyProfile } = require("../utils/enrichCompanyProfile");

const router = express.Router();

const config = require("../config/appConfig");

const authenticate = require("../middleware/authenticate");
const { writeLimiter, readLimiter } = require("../middleware/rateLimiters");

// Protect all routes below
router.use(authenticate);

// GET /applications/sync-status - return Google sync status
router.get("/sync-status", readLimiter, async (req, res) => {
  try {
    const email = req.userEmail;
    const account = await Account.findOne({ email });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    res.json({
      syncStatus: account.syncStatus || "success",
      syncError: account.syncError || null,
      lastSyncTime: account.lastSyncTime || null,
    });
  } catch (error) {
    console.error("Fetch sync status error:", error.message);
    res.status(500).json({ message: "Failed to fetch sync status" });
  }
});

// GET /applications/company-info/:companyName - fetch cached or fallback enriched company profile
router.get("/company-info/:companyName", readLimiter, async (req, res) => {
  try {
    const companyName = decodeURIComponent(req.params.companyName || "").trim();
    if (!companyName) {
      return res.status(400).json({ message: "Company name required" });
    }

    const cached = await CompanyInfo.findOne({ name: companyName });
    if (cached && cached.isEnriched) {
      return res.json(cached);
    }

    const enriched = await enrichCompanyProfile(companyName);
    if (enriched) {
      return res.json(enriched);
    }

    if (cached) {
      return res.json(cached);
    }

    return res.status(444).json({ message: "Company info not found" });
  } catch (error) {
    console.error("Fetch company info error:", error.message);
    res.status(500).json({ message: "Failed to fetch company info" });
  }
});

// GET /applications - return all applications with company info
router.get("/", readLimiter, async (req, res) => {
  try {
    const applications = await Application.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(req.userId),
          isDeleted: { $ne: true }, 
          status: { $nin: ["pending", "failed_retryable"] } 
        } 
      },
      {
        $addFields: {
          latestEmailDate: {
            $max: [
              { $ifNull: ["$date", new Date(0)] },
              { $ifNull: [{ $max: "$events.date" }, new Date(0)] }
            ]
          }
        }
      },
      { $sort: { latestEmailDate: -1, date: -1, _id: -1 } },
      {
        $lookup: {
          from: "companyinfos", // MongoDB collection name for CompanyInfo model
          localField: "company",
          foreignField: "name",
          as: "companyInfoData"
        }
      },
      {
        $addFields: {
          companyInfo: { $arrayElemAt: ["$companyInfoData", 0] }
        }
      },
      {
        $project: {
          companyInfoData: 0
        }
      }
    ]);
    res.json(applications);
  } catch (error) {
    console.error("Fetch applications error:", error.message);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

// POST /applications - add a new application
router.post("/", writeLimiter, async (req, res) => {
  try {
    const { companyInfo, userId, ...appData } = req.body;
    const newApplication = await Application.create({
      ...appData,
      userId: req.userId,
      needsCalendarSync: true,
      calendarRetryCount: 0,
      calendarSyncError: null
    });

    res.status(201).json(newApplication);

    // Sync in background
    Account.findById(req.userId).then(account => {
      if (account) processCalendarSyncQueue(account);
    }).catch(err => console.error("Async calendar sync error:", err.message));

  } catch (error) {
    res.status(400).json({ message: "Failed to create application" });
  }
});

// PATCH /applications/:id - update application status and/or note
router.patch("/:id", writeLimiter, async (req, res) => {
  try {
    const { status, stage, opportunityType, note, manualEdits } = req.body;
    const update = { needsCalendarSync: true, calendarRetryCount: 0, calendarSyncError: null };
    
    if (status !== undefined) {
      update.status = status;
      if (!update.$addToSet) update.$addToSet = {};
      if (!update.$addToSet.manualOverrides) update.$addToSet.manualOverrides = { $each: [] };
      update.$addToSet.manualOverrides.$each.push("status");
    }

    if (stage !== undefined) {
      update.stage = stage;
      if (!update.$addToSet) update.$addToSet = {};
      if (!update.$addToSet.manualOverrides) update.$addToSet.manualOverrides = { $each: [] };
      update.$addToSet.manualOverrides.$each.push("stage");
    }

    if (opportunityType !== undefined) {
      update.opportunityType = opportunityType;
      if (!update.$addToSet) update.$addToSet = {};
      if (!update.$addToSet.manualOverrides) update.$addToSet.manualOverrides = { $each: [] };
      update.$addToSet.manualOverrides.$each.push("opportunityType");
    }

    if (note !== undefined) update.note = note;

    // Auto-unpin when marking as done
    if (status === "done") {
      update.isPinned = false;
      update.pinnedAt = null;
    }

    if (manualEdits && typeof manualEdits === 'object') {
      for (const [key, value] of Object.entries(manualEdits)) {
        update[key] = value;
        if (!update.$addToSet) update.$addToSet = {};
        if (!update.$addToSet.manualOverrides) update.$addToSet.manualOverrides = { $each: [] };
        update.$addToSet.manualOverrides.$each.push(key);
        
        if (key === "company") {
          const { normalizeCompany } = require("../utils/normalizeCompany");
          update.companyKey = normalizeCompany(value);
        }
      }
    }

    // Historical applied persistence: once applied, always count as applied in analytics
    const isAppliedUpdate = update.status === "applied" ||
      ["oa_scheduled", "interview_scheduled", "offered", "rejected_after_oa", "rejected_after_interview"].includes(update.stage);
    if (isAppliedUpdate) {
      update.hasApplied = true;
      if (!update.appliedAt) update.appliedAt = new Date();
    }

    const updatedApplication = await Application.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      update,
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedApplication) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(updatedApplication);

    // Sync in background
    Account.findById(req.userId).then(account => {
      if (account) processCalendarSyncQueue(account);
    }).catch(err => console.error("Async calendar sync error:", err.message));

  } catch (error) {
    res.status(400).json({ message: "Failed to update application" });
  }
});

// DELETE /applications/clear - delete all applications
router.delete("/clear", writeLimiter, async (req, res) => {
  try {
    // Soft-delete and queue all for sync so Google Calendar is cleaned up
    await Application.updateMany(
      { userId: req.userId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, needsCalendarSync: true, calendarRetryCount: 0, calendarSyncError: null } }
    );

    res.json({ message: "All applications marked for sync and clearance" });

    // Sync in background
    Account.findById(req.userId).then(account => {
      if (account) processCalendarSyncQueue(account);
    }).catch(err => console.error("Async calendar sync error:", err.message));

  } catch (error) {
    res.status(500).json({ message: "Failed to clear applications" });
  }
});

// DELETE /applications/:id - soft-delete a single application
router.delete("/:id", writeLimiter, async (req, res) => {
  try {
    const deleted = await Application.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isDeleted: true, needsCalendarSync: true, calendarRetryCount: 0, calendarSyncError: null },
      { returnDocument: 'after' }
    );
    if (!deleted) {
      return res.status(404).json({ message: "Application not found" });
    }
    res.json({ message: "Application removed from dashboard" });

    // Sync in background
    Account.findById(req.userId).then(account => {
      if (account) processCalendarSyncQueue(account);
    }).catch(err => console.error("Async calendar sync error:", err.message));

  } catch (error) {
    res.status(500).json({ message: "Failed to delete application" });
  }
});

// PATCH /applications/:id/pin - toggle pin
router.patch("/:id/pin", writeLimiter, async (req, res) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, userId: req.userId });
    if (!app) return res.status(404).json({ message: "Application not found" });
    if (app.status === "done") return res.status(400).json({ message: "Cannot pin done applications" });

    const newPinned = !app.isPinned;
    app.isPinned = newPinned;
    app.pinnedAt = newPinned ? new Date() : null;
    await app.save();
    res.json({ isPinned: app.isPinned, pinnedAt: app.pinnedAt });
  } catch (error) {
    res.status(400).json({ message: "Failed to toggle pin" });
  }
});

// POST /applications/:id/reparse - Manually reparse an email with LLM (Scoped strictly to req.userId)
router.post("/:id/reparse", writeLimiter, async (req, res) => {
  try {
    const { google } = require("googleapis");
    const LinkedGmailAccount = require("../models/LinkedGmailAccount");
    const { parseEmailWithLLM, getFullBodyText } = require("../utils/parseEmailWithLLM");
    const { enrichApplicationRecord } = require("../utils/enrichmentService");

    // 1. Find Application record strictly owned by authenticated user
    const app = await Application.findOne({ _id: req.params.id, userId: req.userId });
    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }

    const targetMessageId = req.body?.messageId || app.messageId;
    if (!targetMessageId) {
      return res.status(400).json({ message: "No email message associated with this application" });
    }

    // 2. Resolve receiving inbox source email and OAuth tokens
    const eventMatchingTarget = (app.events || []).find(e => e.messageId === targetMessageId);
    const receivingEmail = (eventMatchingTarget?.accountEmail || app.accountEmail || req.userEmail || "").toLowerCase().trim();
    let oauthTokens = null;

    if (receivingEmail === (req.userEmail || "").toLowerCase().trim()) {
      const primaryAcc = await Account.findById(req.userId);
      oauthTokens = primaryAcc?.tokens;
    } else {
      const linkedAcc = await LinkedGmailAccount.findOne({
        parentAccountId: req.userId,
        email: receivingEmail
      });
      oauthTokens = linkedAcc?.tokens;
    }

    // Fallback if tokens weren't found by explicit email
    if (!oauthTokens) {
      const primaryAcc = await Account.findById(req.userId);
      oauthTokens = primaryAcc?.tokens;
    }

    if (!oauthTokens) {
      return res.status(401).json({ message: "Gmail authorization missing. Please reconnect your account." });
    }

    // 3. Fetch raw message from Gmail API using resolved OAuth credentials
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(oauthTokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    let rawText = app.rawText || "";
    let fullBodyText = "";
    let fromHeader = "";
    let subject = app.company || "";
    let internalDate = app.date || new Date();

    try {
      const emailRes = await gmail.users.messages.get({
        userId: "me",
        id: targetMessageId,
        format: "full"
      });

      const headers = emailRes.data.payload?.headers || [];
      fromHeader = headers.find(h => h.name === "From")?.value || "";
      subject = headers.find(h => h.name === "Subject")?.value || subject;
      const snippet = emailRes.data.snippet || "";
      rawText = `${subject} ${snippet}`.trim();
      fullBodyText = getFullBodyText(emailRes.data.payload);
      if (emailRes.data.internalDate) {
        internalDate = new Date(parseInt(emailRes.data.internalDate));
      }

      // Extract and merge attachment metadata
      const { extractAttachmentMetadata, mergeAttachments } = require("../utils/attachmentUtils");
      const extractedAttachments = extractAttachmentMetadata(emailRes.data.payload, targetMessageId);
      if (extractedAttachments.length > 0) {
        app.attachments = mergeAttachments(app.attachments, extractedAttachments);
      }

      // Re-evaluate shortlist matching for any XLSX attachments (Phase 2)
      try {
        const {
          buildStudentIdentity,
          inspectAndMatchWorkbook,
          recomputeApplicationShortlistState,
        } = require("../utils/shortlistMatcher");
        const LinkedGmailAccount = require("../models/LinkedGmailAccount");
        const Account = require("../models/Account");
        const userAccount = await Account.findById(req.userId);
        const linkedAccs = await LinkedGmailAccount.find({ parentAccountId: req.userId });
        const studentIdentity = buildStudentIdentity(userAccount, linkedAccs.map((l) => l.email));

        for (const att of (app.attachments || [])) {
          if (!att.isInline && (att.filename || "").toLowerCase().endsWith(".xlsx")) {
            try {
              let targetGmail = gmail;
              const eventForAtt = (app.events || []).find((e) => e.messageId === att.messageId);
              const attReceivingEmail = (
                eventForAtt?.accountEmail || app.accountEmail || userAccount?.email || ""
              ).toLowerCase().trim();

              if (attReceivingEmail && attReceivingEmail !== (userAccount?.email || "").toLowerCase().trim()) {
                const linked = linkedAccs.find((l) => l.email.toLowerCase().trim() === attReceivingEmail);
                if (linked?.tokens) {
                  const linkedOauth2 = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET
                  );
                  linkedOauth2.setCredentials(linked.tokens);
                  targetGmail = google.gmail({ version: "v1", auth: linkedOauth2 });
                }
              }

              const attRes = await targetGmail.users.messages.attachments.get({
                userId: "me",
                messageId: att.messageId,
                id: att.attachmentId,
              });
              if (attRes.data && attRes.data.data) {
                const fileBuffer = Buffer.from(attRes.data.data, "base64url");
                const matchResult = inspectAndMatchWorkbook(fileBuffer, studentIdentity, att.filename);
                att.shortlistStatus = matchResult.status;
                att.shortlistDetails = {
                  matchedIdentifierType: matchResult.matchDetails?.matchedIdentifierType || null,
                  sheetName: matchResult.matchDetails?.sheetName || null,
                  processedAt: matchResult.matchDetails?.processedAt || new Date(),
                };
              }
            } catch (attErr) {
              console.error("[REPARSE_SHORTLIST_ERR]", attErr.message);
            }
          }
        }

        recomputeApplicationShortlistState(app);
      } catch (shortlistErr) {
        console.error("[REPARSE_SHORTLIST_GLOBAL_ERR]", shortlistErr.message);
      }

      app.markModified("attachments");
    } catch (gErr) {
      console.warn(`[REPARSE_GMAIL_WARN] Could not fetch raw email from Gmail for ${targetMessageId}:`, gErr.message);
      if (!rawText) {
        return res.status(422).json({ message: "Raw email content unavailable for reparsing" });
      }
    }

    // 4. Send email content to LLM parser
    const parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, internalDate);
    if (!parsed || !parsed.isRelevant) {
      return res.status(422).json({ message: "Reparsing failed or email did not contain structured placement data" });
    }

    // 5. Update timeline event in events matching targetMessageId
    if (!app.events) app.events = [];
    const evIndex = app.events.findIndex(e => e.messageId === targetMessageId);
    if (evIndex > -1) {
      app.events[evIndex].classification = parsed.classification || app.events[evIndex].classification || "";
      app.events[evIndex].title = parsed.timelineTitle || parsed.title || app.events[evIndex].title || "";
      app.events[evIndex].summary = parsed.timelineSummary || parsed.summary || app.events[evIndex].summary || "";
      if (parsed.link) app.events[evIndex].link = parsed.link;
    } else {
      app.events.push({
        messageId: targetMessageId,
        accountEmail: receivingEmail,
        date: internalDate,
        classification: parsed.classification || "",
        title: parsed.timelineTitle || parsed.title || "",
        subject: subject || "",
        status: app.status || "new",
        link: parsed.link || "",
        summary: parsed.timelineSummary || parsed.summary || ""
      });
    }
    app.events.sort((a, b) => new Date(a.date) - new Date(b.date));
    app.markModified("events");

    // 6. Chronology-aware safe reconciliation
    const latestEvent = app.events.reduce((latest, ev) => 
      (!latest || new Date(ev.date) > new Date(latest.date)) ? ev : latest, null
    );
    const isLatestEmail = !latestEvent || latestEvent.messageId === targetMessageId;

    const enrichmentPayload = enrichApplicationRecord(app, parsed, internalDate, {
      isNewerEmail: isLatestEmail,
      subject,
      rawBody: fullBodyText || rawText || ""
    });

    Object.assign(app, enrichmentPayload);
    app.confidenceScore = parsed.confidenceScore || app.confidenceScore || 0;
    app.parserVersion = "v4";

    await app.save();
    console.log(`[REPARSE_SUCCESS] Reparsed application ${app._id} for company: ${app.company}`);

    // Return updated application with aggregated companyInfo
    const CompanyInfo = require("../models/CompanyInfo");
    const companyInfoData = await CompanyInfo.findOne({ name: app.company });
    const resultObj = app.toObject();
    resultObj.companyInfo = companyInfoData || null;

    res.json(resultObj);

    // Sync in background (non-blocking)
    Account.findById(req.userId).then(account => {
      if (account) processCalendarSyncQueue(account);
    }).catch(err => console.error("Async calendar sync error on reparse:", err.message));
  } catch (error) {
    console.error("[REPARSE_ERROR]", error.message);
    res.status(500).json({ message: "Failed to reparse email: " + error.message });
  }
});

// GET /applications/:id/attachments/:attachmentId - Download/view an attachment
// Security: JWT auth + Application ownership + attachment existence check
router.get("/:id/attachments/:attachmentId", readLimiter, async (req, res) => {
  try {
    const { google } = require("googleapis");
    const LinkedGmailAccount = require("../models/LinkedGmailAccount");

    // Layer 2: Application ownership check (Layer 1 is authenticate middleware)
    const app = await Application.findOne({ _id: req.params.id, userId: req.userId });
    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Layer 3: Attachment existence check within this application
    const attachmentMeta = (app.attachments || []).find(
      (a) => a.attachmentId === req.params.attachmentId
    );
    if (!attachmentMeta) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    // Resolve the correct OAuth tokens for the Gmail account that received this email
    const targetMessageId = attachmentMeta.messageId;
    const eventForMessage = (app.events || []).find((e) => e.messageId === targetMessageId);
    const receivingEmail = (
      eventForMessage?.accountEmail || app.accountEmail || req.userEmail || ""
    ).toLowerCase().trim();

    let oauthTokens = null;

    if (receivingEmail === (req.userEmail || "").toLowerCase().trim()) {
      // Primary account
      const primaryAcc = await Account.findById(req.userId);
      oauthTokens = primaryAcc?.tokens;
    } else {
      // Linked account
      const linkedAcc = await LinkedGmailAccount.findOne({
        parentAccountId: req.userId,
        email: receivingEmail,
      });
      oauthTokens = linkedAcc?.tokens;
    }

    // Fallback: try primary account tokens if above didn't match
    if (!oauthTokens) {
      const primaryAcc = await Account.findById(req.userId);
      oauthTokens = primaryAcc?.tokens;
    }

    if (!oauthTokens) {
      return res.status(401).json({
        message: "Gmail authorization missing. Please reconnect your account.",
      });
    }

    // Fetch attachment data from Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials(oauthTokens);

    // Persist refreshed tokens back to DB if Google issues new ones
    oauth2Client.on("tokens", async (newTokens) => {
      try {
        if (receivingEmail === (req.userEmail || "").toLowerCase().trim()) {
          const updatedTokens = { ...oauthTokens, ...newTokens };
          await Account.findByIdAndUpdate(req.userId, { tokens: updatedTokens });
        } else {
          const updatedTokens = { ...oauthTokens, ...newTokens };
          await LinkedGmailAccount.findOneAndUpdate(
            { parentAccountId: req.userId, email: receivingEmail },
            { tokens: updatedTokens }
          );
        }
      } catch (tokenErr) {
        console.error("[ATTACHMENT_TOKEN_REFRESH_ERR]", tokenErr.message);
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    let attachmentResponse;
    try {
      attachmentResponse = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: targetMessageId,
        id: req.params.attachmentId,
      });
    } catch (gmailErr) {
      const statusCode = gmailErr.code || gmailErr.response?.status || 500;
      if (statusCode === 404) {
        return res.status(404).json({
          message: "Attachment no longer available in Gmail. The email may have been deleted.",
        });
      }
      console.error("[ATTACHMENT_GMAIL_ERR]", gmailErr.message);
      return res.status(502).json({
        message: "Failed to retrieve attachment from Gmail.",
      });
    }

    // Decode the base64url-encoded attachment data into a binary Buffer
    const base64Data = attachmentResponse.data.data;
    if (!base64Data) {
      return res.status(404).json({ message: "Attachment data is empty." });
    }
    const fileBuffer = Buffer.from(base64Data, "base64url");

    // Determine Content-Disposition based on query parameter or MIME type fallback
    const filename = attachmentMeta.filename || "attachment";
    const mimeType = attachmentMeta.mimeType || "application/octet-stream";
    const requestedDisposition = (req.query.disposition || "").toLowerCase().trim();

    let disposition = "attachment";
    if (requestedDisposition === "inline" || requestedDisposition === "attachment") {
      disposition = requestedDisposition;
    } else {
      const viewableInline =
        mimeType === "application/pdf" ||
        mimeType.startsWith("image/") ||
        mimeType.startsWith("text/");
      disposition = viewableInline ? "inline" : "attachment";
    }

    // Sanitize filename for Content-Disposition header (RFC 5987)
    const safeFilename = filename.replace(/[^\x20-\x7E]/g, "_");
    const encodedFilename = encodeURIComponent(filename);

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader("Content-Length", fileBuffer.length);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(fileBuffer);

    console.log(
      `[ATTACHMENT_SERVED] App: ${app._id} | File: ${filename} | Size: ${fileBuffer.length} | User: ${req.userId}`
    );
  } catch (error) {
    console.error("[ATTACHMENT_DOWNLOAD_ERROR]", error.message);
    res.status(500).json({ message: "Failed to download attachment." });
  }
});

module.exports = router;
