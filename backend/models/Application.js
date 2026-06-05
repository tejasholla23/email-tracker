const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
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
      default: "pending",
    },
    isDeleted: { type: Boolean, default: false },
    rawText: { type: String },
    note: { type: String, default: "" },
    messageId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Compound index for duplicate-check during sync: Application.findOne({ company, role })
applicationSchema.index({ company: 1, role: 1 });

// Compound index for primary dashboard query: Application.find({ isDeleted: false }).sort({ date: -1 })
applicationSchema.index({ isDeleted: 1, date: -1 });

module.exports = mongoose.model("Application", applicationSchema);
