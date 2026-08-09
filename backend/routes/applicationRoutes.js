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
      needsCalendarSync: true
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
    const { status, note, manualEdits } = req.body;
    const update = { needsCalendarSync: true };
    if (status !== undefined) update.status = status;
    if (note  !== undefined) update.note   = note;
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
      { $set: { isDeleted: true, needsCalendarSync: true } }
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
      { isDeleted: true, needsCalendarSync: true },
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

    // 1. Find Application record strictly owned by authenticated user
    const app = await Application.findOne({ _id: req.params.id, userId: req.userId });
    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (!app.messageId) {
      return res.status(400).json({ message: "No email message associated with this application" });
    }

    // 2. Resolve receiving inbox source email and OAuth tokens
    const receivingEmail = (app.accountEmail || req.userEmail || "").toLowerCase().trim();
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
        id: app.messageId,
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
    } catch (gErr) {
      console.warn(`[REPARSE_GMAIL_WARN] Could not fetch raw email from Gmail for ${app.messageId}:`, gErr.message);
      if (!rawText) {
        return res.status(422).json({ message: "Raw email content unavailable for reparsing" });
      }
    }

    // 4. Send email content to LLM parser
    const parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, internalDate);
    if (!parsed || !parsed.isRelevant) {
      return res.status(422).json({ message: "Reparsing failed or email did not contain structured placement data" });
    }

    // 5. Preserve manual overrides while updating non-overridden fields
    const overrides = app.manualOverrides || [];

    if (!overrides.includes("company") && parsed.company) {
      const { normalizeCompany } = require("../utils/normalizeCompany");
      app.company = parsed.company;
      app.companyKey = normalizeCompany(parsed.company);
    }
    if (!overrides.includes("role") && parsed.role) app.role = parsed.role;
    if (!overrides.includes("type") && parsed.type) app.type = parsed.type;
    if (!overrides.includes("deadline") && parsed.deadline) {
      app.deadline = parsed.deadline;
      app.deadlineISO = parsed.deadlineISO || "";
      app.deadlineText = parsed.deadlineText || parsed.deadline;
    }
    if (!overrides.includes("subtitle") && parsed.subtitle) app.subtitle = parsed.subtitle;
    if (!overrides.includes("displayFields") && parsed.displayFields?.length) app.displayFields = parsed.displayFields;
    if (!overrides.includes("skills") && parsed.skills?.length) app.skills = parsed.skills;
    if (!overrides.includes("link") && parsed.link) app.link = parsed.link;
    if (!overrides.includes("classification") && parsed.classification) app.classification = parsed.classification;

    app.confidenceScore = parsed.confidenceScore || app.confidenceScore || 0;
    app.parserVersion = "v4";

    // Update timeline event in events matching messageId
    if (app.events && app.events.length > 0) {
      const evIndex = app.events.findIndex(e => e.messageId === app.messageId);
      if (evIndex > -1) {
        app.events[evIndex].classification = parsed.classification || app.events[evIndex].classification || "";
        app.events[evIndex].title = parsed.timelineTitle || parsed.title || app.events[evIndex].title || "";
        app.events[evIndex].summary = parsed.timelineSummary || parsed.summary || app.events[evIndex].summary || "";
        if (parsed.link) app.events[evIndex].link = parsed.link;
      }
    }

    await app.save();
    console.log(`[REPARSE_SUCCESS] Reparsed application ${app._id} for company: ${app.company}`);

    // Return updated application with aggregated companyInfo
    const CompanyInfo = require("../models/CompanyInfo");
    const companyInfoData = await CompanyInfo.findOne({ name: app.company });
    const resultObj = app.toObject();
    resultObj.companyInfo = companyInfoData || null;

    res.json(resultObj);
  } catch (error) {
    console.error("[REPARSE_ERROR]", error.message);
    res.status(500).json({ message: "Failed to reparse email: " + error.message });
  }
});

module.exports = router;

