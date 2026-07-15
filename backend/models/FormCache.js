const mongoose = require("mongoose");

const formCacheSchema = new mongoose.Schema(
  {
    formId: { type: String, required: true, unique: true },
    formUrl: { type: String, required: true },
    fields: [
      {
        fieldId: { type: String, required: true },
        label: { type: String, required: true },
        type: { type: String, required: true },
        options: { type: [String], default: [] },
      },
    ],
    fetchedAt: { type: Date, default: Date.now },
    lastVerifiedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FormCache", formCacheSchema);
