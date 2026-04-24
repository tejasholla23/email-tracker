const express = require("express");
const Application = require("../models/Application");

const router = express.Router();

// GET /applications - return all applications
router.get("/", async (req, res) => {
  try {
    const applications = await Application.find().sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch applications" });
  }
});

// POST /applications - add a new application
router.post("/", async (req, res) => {
  try {
    const newApplication = await Application.create(req.body);
    res.status(201).json(newApplication);
  } catch (error) {
    res.status(400).json({ message: "Failed to create application" });
  }
});

// PATCH /applications/:id - update application status
router.patch("/:id", async (req, res) => {
  try {
    const { status } = req.body;

    const updatedApplication = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedApplication) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(updatedApplication);
  } catch (error) {
    res.status(400).json({ message: "Failed to update application status" });
  }
});

module.exports = router;
