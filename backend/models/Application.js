const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    role: { type: String, required: true },
    type: {
      type: String,
      enum: ["internship", "fulltime", "test"],
      required: true,
    },
    deadline: { type: Date },
    testDate: { type: Date },
    link: { type: String },
    source: { type: String },
    status: {
      type: String,
      enum: ["pending", "applied", "done"],
      default: "pending",
    },
    rawText: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", applicationSchema);
