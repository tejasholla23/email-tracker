const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    role: { type: String, required: true },
    type: { type: String },
    deadline: { type: Date },
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

module.exports = mongoose.model("Application", applicationSchema);
