const express = require("express");
const Application = require("../models/Application");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Apply auth middleware to all routes in this router
router.use(auth);

// GET /applications - return only user's applications
router.get("/", async (req, res) => {
  try {
    const applications = await Application.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

// POST /applications - add a new application for the logged-in user
router.post("/", async (req, res) => {
  try {
    const newApplication = await Application.create({
      ...req.body,
      userId: req.user.id
    });
    res.status(201).json(newApplication);
  } catch (error) {
    res.status(400).json({ message: "Failed to create application" });
  }
});

// PATCH /applications/:id - update user's application status and/or note
router.patch("/:id", async (req, res) => {
  try {
    const { status, note } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (note !== undefined) update.note = note;

    const updatedApplication = await Application.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      update,
      { new: true, runValidators: true }
    );

    if (!updatedApplication) {
      return res.status(404).json({ message: "Application not found or unauthorized" });
    }

    res.json(updatedApplication);
  } catch (error) {
    res.status(400).json({ message: "Failed to update application" });
  }
});

// DELETE /applications/clear - delete all applications for the logged-in user
router.delete("/clear", async (req, res) => {
  try {
    await Application.deleteMany({ userId: req.user.id });
    res.json({ message: "All your applications cleared" });
  } catch (error) {
    res.status(500).json({ message: "Failed to clear applications" });
  }
});

// DELETE /applications/:id - delete a single application for the logged-in user
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Application.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    if (!deleted) {
      return res.status(404).json({ message: "Application not found or unauthorized" });
    }
    res.json({ message: "Application deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete application" });
  }
});

module.exports = router;
