const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  tokens: Object,
  syncStatus: {
    type: String,
    enum: ["success", "failed", "pending", "idle"],
    default: "success",
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
  refreshTokenHash: {
    type: String,
    default: null,
  },
  refreshTokenExpiresAt: {
    type: Date,
    default: null,
  },
  calendarSyncEnabled: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("Account", accountSchema);