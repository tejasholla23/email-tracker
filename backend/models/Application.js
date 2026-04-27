const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    role: { type: String, required: true },
    type: { type: String },
    deadline: { type: Date },
    testDate: { type: Date },
    link: { type: String },
    source: { type: String },
    email: { type: String },
    date: { type: Date },
    status: {
      type: String,
      default: "pending",
    },
    rawText: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", applicationSchema);
