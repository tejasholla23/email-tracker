const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  tokens: Object,
  syncStatus: {
    type: String,
    enum: ["success", "failed", "pending"],
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
});

module.exports = mongoose.model("Account", accountSchema);