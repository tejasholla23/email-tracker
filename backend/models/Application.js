const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    companyKey: { type: String, default: "" }, // normalized key for company-level dedup
    role: { type: String, required: true },
    type: { type: String },
    deadline: { type: String },
    deadlineISO: { type: String },
    deadlineText: { type: String },
    programRoles: { type: String },
    programDuration: { type: String },
    programStipend: { type: String },
    testDate: { type: Date },
    link: { type: String },
    links: { type: [String], default: [] },
    isFormLink: { type: Boolean, default: false },
    source: { type: String },
    email: { type: String },
    date: { type: Date },
    status: {
      type: String,
      default: "new",
    },
    isDeleted: { type: Boolean, default: false },
    rawText: { type: String },
    note: { type: String, default: "" },
    messageId: { type: String, unique: true, sparse: true },
    classification: { type: String },
    confidenceScore: { type: Number },
    jobRole: { type: String },
    title: { type: String },
    processId: { type: String },
    processName: { type: String },
    eventDate: { type: Date },
    eventTime: { type: String },
    reportingTime: { type: String },
    venue: { type: String },
    durationText: { type: String },
    salaryText: { type: String },
    parseMeta: { type: mongoose.Schema.Types.Mixed },
    events: {
      type: [
        {
          messageId: String,
          date: Date,
          classification: String,
          title: String,
          subject: String,
          status: String,
          link: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// Company-level identity index: one Application per normalized company (one hiring process)applicationSchema.index({ companyKey: 1, isDeleted: 1 });

// Compound index for primary dashboard query: Application.find({ isDeleted: false }).sort({ date: -1 })
applicationSchema.index({ isDeleted: 1, date: -1 });

module.exports = mongoose.model("Application", applicationSchema);
