const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const { writeLimiter, readLimiter } = require("../middleware/rateLimiters");

const Account = require("../models/Account");
const AutofillProfile = require("../models/AutofillProfile");
const AutofillTask = require("../models/AutofillTask");
const autofillService = require("../utils/autofillService");

// Protect all routes
router.use(authenticate);

// ==========================
// 🧑‍💼 PROFILE ENDPOINTS
// ==========================

// GET /autofill/profile
router.get("/profile", readLimiter, async (req, res) => {
  try {
    let profile = await AutofillProfile.findOne({ userId: req.userId });
    if (!profile) {
      // Return default empty structure to make frontend consumption easier
      profile = {
        personal: { fullName: "", usn: "", gender: "", mobileNumber: "" },
        education: { program: "", branch: "", tenthPercentage: "", twelfthPercentage: "", currentCGPA: "" },
        contact: { personalEmail: "", collegeEmail: "", defaultEmailPreference: "personal" },
        professional: { linkedinUrl: "", githubUrl: "" },
      };
    }
    res.json(profile);
  } catch (error) {
    console.error("GET /autofill/profile error:", error.message);
    res.status(500).json({ message: "Failed to fetch autofill profile" });
  }
});

// PUT /autofill/profile
router.put("/profile", writeLimiter, async (req, res) => {
  try {
    const { personal, education, contact, professional } = req.body;

    const updatedProfile = await AutofillProfile.findOneAndUpdate(
      { userId: req.userId },
      {
        $set: {
          personal: personal || {},
          education: education || {},
          contact: contact || {},
          professional: professional || {},
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Update Account model state
    await Account.findByIdAndUpdate(req.userId, {
      $set: { autofillSetupComplete: true },
    });

    res.json(updatedProfile);
  } catch (error) {
    console.error("PUT /autofill/profile error:", error.message);
    res.status(400).json({ message: "Failed to update autofill profile" });
  }
});

// ==========================
// 📋 TASK QUEUE ENDPOINTS
// ==========================

// GET /autofill/tasks
router.get("/tasks", readLimiter, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { userId: req.userId };
    if (status) {
      filter.status = status;
    } else {
      // Exclude soft-deleted tasks by default
      filter.status = { $ne: "deleted" };
    }

    const tasks = await AutofillTask.find(filter).sort({ dateReceived: -1 });
    res.json(tasks);
  } catch (error) {
    console.error("GET /autofill/tasks error:", error.message);
    res.status(500).json({ message: "Failed to fetch autofill tasks" });
  }
});

// GET /autofill/tasks/:id
router.get("/tasks/:id", readLimiter, async (req, res) => {
  try {
    const task = await AutofillTask.findOne({ _id: req.params.id, userId: req.userId });
    if (!task) {
      return res.status(404).json({ message: "Autofill task not found" });
    }
    res.json(task);
  } catch (error) {
    console.error("GET /autofill/tasks/:id error:", error.message);
    res.status(500).json({ message: "Failed to fetch task details" });
  }
});

// POST /autofill/tasks/:id/refresh
router.post("/tasks/:id/refresh", writeLimiter, async (req, res) => {
  try {
    const refreshedTask = await autofillService.refreshTask(req.params.id);
    if (!refreshedTask) {
      return res.status(404).json({ message: "Autofill task not found" });
    }
    res.json(refreshedTask);
  } catch (error) {
    console.error("POST /autofill/tasks/:id/refresh error:", error.message);
    res.status(500).json({ message: "Failed to refresh autofill task" });
  }
});

// PATCH /autofill/tasks/:id/status
router.patch("/tasks/:id/status", writeLimiter, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["waiting", "needs_attention", "opened", "submitted", "deleted"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const update = { status };
    if (status === "submitted") {
      update.submittedAt = new Date();
    }

    const task = await AutofillTask.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: update },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ message: "Autofill task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("PATCH /autofill/tasks/:id/status error:", error.message);
    res.status(500).json({ message: "Failed to update task status" });
  }
});

// PATCH /autofill/tasks/:id/edits
router.patch("/tasks/:id/edits", writeLimiter, async (req, res) => {
  try {
    const { edits } = req.body;
    if (!edits || typeof edits !== "object") {
      return res.status(400).json({ message: "Invalid edits object structure" });
    }

    const updatedTask = await autofillService.applyTemporaryEdits(req.params.id, edits);
    if (!updatedTask) {
      return res.status(404).json({ message: "Autofill task not found" });
    }

    res.json(updatedTask);
  } catch (error) {
    console.error("PATCH /autofill/tasks/:id/edits error:", error.message);
    res.status(500).json({ message: "Failed to apply temporary edits" });
  }
});

// ==========================
// ⚙️ TOGGLE SETTINGS ENDPOINTS
// ==========================

// POST /autofill/enable
router.post("/enable", writeLimiter, async (req, res) => {
  try {
    const account = await Account.findByIdAndUpdate(
      req.userId,
      { $set: { autofillEnabled: true } },
      { new: true }
    );
    res.json({ enabled: account.autofillEnabled, setupComplete: account.autofillSetupComplete });
  } catch (error) {
    console.error("POST /autofill/enable error:", error.message);
    res.status(500).json({ message: "Failed to enable autofill" });
  }
});

// POST /autofill/pause
router.post("/pause", writeLimiter, async (req, res) => {
  try {
    const account = await Account.findByIdAndUpdate(
      req.userId,
      { $set: { autofillEnabled: false } },
      { new: true }
    );
    res.json({ enabled: account.autofillEnabled, setupComplete: account.autofillSetupComplete });
  } catch (error) {
    console.error("POST /autofill/pause error:", error.message);
    res.status(500).json({ message: "Failed to pause autofill" });
  }
});

// POST /autofill/disable
router.post("/disable", writeLimiter, async (req, res) => {
  try {
    // 1. Permanently remove profile
    await AutofillProfile.findOneAndDelete({ userId: req.userId });

    // 2. Permanently remove tasks
    await AutofillTask.deleteMany({ userId: req.userId });

    // 3. Reset toggle fields on Account
    const account = await Account.findByIdAndUpdate(
      req.userId,
      { $set: { autofillEnabled: false, autofillSetupComplete: false } },
      { new: true }
    );

    res.json({
      enabled: account.autofillEnabled,
      setupComplete: account.autofillSetupComplete,
      message: "Permanently deleted all autofill profile and task data",
    });
  } catch (error) {
    console.error("POST /autofill/disable error:", error.message);
    res.status(500).json({ message: "Failed to disable autofill and purge data" });
  }
});

module.exports = router;
