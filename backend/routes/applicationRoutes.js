const express = require("express");
const mongoose = require("mongoose");
const Application = require("../models/Application");
const CompanyInfo = require("../models/CompanyInfo");
const Account = require("../models/Account");
const { processCalendarSyncQueue } = require("../utils/calendarService");

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

module.exports = router;

