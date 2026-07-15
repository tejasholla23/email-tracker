const mongoose = require("mongoose");

const autofillTaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    formUrl: { type: String, required: true },
    formId: { type: String, required: true },
    company: { type: String, required: true },
    role: { type: String, default: "Unknown Role" },
    dateReceived: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["waiting", "needs_attention", "opened", "submitted", "deleted"],
      default: "waiting",
    },
    formFields: [
      {
        fieldId: { type: String, required: true },
        label: { type: String, required: true },
        type: { type: String, default: "text" },
        options: { type: [String], default: [] },
        mappedProfileKey: { type: String, default: null },
        mappedValue: { type: String, default: null },
        isMissing: { type: Boolean, default: false },
      },
    ],
    missingFields: { type: [String], default: [] },
    prefillUrl: { type: String, default: "" },
    temporaryEdits: {
      type: Map,
      of: new mongoose.Schema({
        value: { type: String, default: "" },
        edited: { type: Boolean, default: true },
      }, { _id: false }),
      default: {},
    },
    parsedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Unique formId per user
autofillTaskSchema.index({ userId: 1, formId: 1 }, { unique: true });
autofillTaskSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("AutofillTask", autofillTaskSchema);
