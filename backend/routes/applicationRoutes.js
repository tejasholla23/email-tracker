const express = require("express");
const mongoose = require("mongoose");
const Application = require("../models/Application");
const CompanyInfo = require("../models/CompanyInfo");
const Account = require("../models/Account");

const router = express.Router();

const config = require("../config/appConfig");

const authenticate = require("../middleware/authenticate");

// Protect all routes below
router.use(authenticate);

// GET /applications/sync-status - return Google sync status
router.get("/sync-status", async (req, res) => {
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
router.get("/", async (req, res) => {
  try {
    const applications = await Application.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(req.userId),
          isDeleted: { $ne: true }, 
          status: { $nin: ["pending", "failed_retryable"] } 
        } 
      },
      { $sort: { date: -1 } },
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
router.post("/", async (req, res) => {
  try {
    // Remove companyInfo and userId from body if passed manually (should be fetched/generated during sync)
    const { companyInfo, userId, ...appData } = req.body;
    const newApplication = await Application.create({
      ...appData,
      userId: req.userId
    });
    res.status(201).json(newApplication);
  } catch (error) {
    res.status(400).json({ message: "Failed to create application" });
  }
});

// PATCH /applications/:id - update application status and/or note
router.patch("/:id", async (req, res) => {
  try {
    const { status, note, manualEdits } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (note  !== undefined) update.note   = note;

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
      { new: true, runValidators: true }
    );

    if (!updatedApplication) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(updatedApplication);
  } catch (error) {
    res.status(400).json({ message: "Failed to update application" });
  }
});

// DELETE /applications/clear - delete all applications
router.delete("/clear", async (req, res) => {
  try {
    await Application.deleteMany({ userId: req.userId });
    res.json({ message: "All applications permanently cleared" });
  } catch (error) {
    res.status(500).json({ message: "Failed to clear applications" });
  }
});

// DELETE /applications/:id - soft-delete a single application
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Application.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isDeleted: true },
      { new: true }
    );
    if (!deleted) {
      return res.status(404).json({ message: "Application not found" });
    }
    res.json({ message: "Application removed from dashboard" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete application" });
  }
});

const { enrichCompanyProfile } = require("../utils/enrichCompanyProfile");

// GET /applications/:id/company-profile
// Returns enriched company profile immediately if available.
// If not yet enriched, kicks off fire-and-forget enrichment and returns { status: "processing" }.
// Frontend should poll every ~2s until isEnriched is true.
router.get("/:id/company-profile", async (req, res) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, userId: req.userId });
    if (!app || !app.company) {
      return res.status(404).json({ message: "Application or company not found" });
    }

    const companyInfo = await CompanyInfo.findOne({ name: app.company.trim() });
    if (!companyInfo) {
      return res.status(404).json({ message: "Company info not available" });
    }

    // Already enriched — return full profile immediately
    if (companyInfo.isEnriched) {
      return res.json({
        status: "ready",
        name: companyInfo.name,
        domain: companyInfo.domain,
        logo: companyInfo.logo,
        industry: companyInfo.industry || "",
        companyType: companyInfo.companyType || "",
        headquarters: companyInfo.headquarters || "",
        description: companyInfo.description || "",
        website: companyInfo.website || "",
        knownFor: companyInfo.knownFor || [],
        isEnriched: true,
      });
    }

    // Not yet enriched — trigger fire-and-forget enrichment (never await it here)
    if (!companyInfo.isEnriching) {
      enrichCompanyProfile(companyInfo).catch(err =>
        console.error(`[COMPANY_PROFILE_ROUTE_ENRICH] "${companyInfo.name}":`, err.message)
      );
    }

    // Return immediately — frontend will poll
    return res.json({ status: "processing", isEnriched: false });

  } catch (error) {
    console.error("[COMPANY_PROFILE_ROUTE]", error.message);
    res.status(500).json({ message: "Failed to fetch company profile" });
  }
});

module.exports = router;

