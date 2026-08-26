const mongoose = require("mongoose");

const linkedGmailAccountSchema = new mongoose.Schema(
  {
    parentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    tokens: {
      type: Object,
      required: true,
    },
    syncStatus: {
      type: String,
      enum: ["success", "failed", "pending", "idle"],
      default: "idle",
    },
    syncError: {
      type: String,
      default: null,
    },
    lastSyncTime: {
      type: Date,
      default: null,
    },
    lastHistoryId: {
      type: String,
      default: null,
    },
    syncMode: {
      type: String,
      enum: ["full", "incremental"],
      default: "full",
    },
    gmailWatchExpiration: {
      type: Date,
      default: null,
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    displayName: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Compound unique index: one link per email per parent account
linkedGmailAccountSchema.index(
  { parentAccountId: 1, email: 1 },
  { unique: true }
);

linkedGmailAccountSchema.index({ parentAccountId: 1 });

module.exports = mongoose.model(
  "LinkedGmailAccount",
  linkedGmailAccountSchema
);
