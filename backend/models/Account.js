const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  tokens: {
    type: Object,
    required: true,
  },
});

module.exports = mongoose.model("Account", accountSchema);