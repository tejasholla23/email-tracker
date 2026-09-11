const mongoose = require("mongoose");

const issueReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Parsing / AI Extraction",
        "Missing Email / Application",
        "Google Calendar Sync",
        "UI / Visual Bug",
        "Feature Request",
        "Other",
      ],
      default: "Other",
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    metadata: {
      userAgent: { type: String, default: "" },
      screenResolution: { type: String, default: "" },
      appVersion: { type: String, default: "1.0.0" },
      theme: { type: String, default: "dark" },
    },
    status: {
      type: String,
      enum: ["open", "investigating", "resolved", "closed"],
      default: "open",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("IssueReport", issueReportSchema);
