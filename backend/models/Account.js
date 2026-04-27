const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  email: String,
  tokens: Object,
});

module.exports = mongoose.model("Account", accountSchema);