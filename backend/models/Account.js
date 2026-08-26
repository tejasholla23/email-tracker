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
  calendarTargetId: {
    type: String,
    default: null,
  },
  gmailWatchExpiration: {
    type: Date,
    default: null,
  },
  pushSubscriptions: {
    type: [{
      endpoint: { type: String, required: true },
      keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
      },
      userAgent: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now },
    }],
    default: [],
  },
  pushEnabled: {
    type: Boolean,
    default: true,
  },
  // Phase 2: Student Profile for Shortlist Matching
  studentProfile: {
    fullName: { type: String, default: "", trim: true },
    personalEmail: { type: String, default: "", lowercase: true, trim: true },
    mobileNumber: { type: String, default: "", trim: true },
    lastUpdated: { type: Date, default: null },
  },
});

module.exports = mongoose.model("Account", accountSchema);