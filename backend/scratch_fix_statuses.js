const mongoose = require('mongoose');
require('dotenv').config();
const Application = require('./models/Application');

async function fixStatuses() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const res = await Application.updateMany(
      { status: { $in: ["interview", "offer", "rejected", "applied"] } },
      { $set: { status: "new" } }
    );
    console.log("Fixed statuses:", res);
  } catch (e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
  }
}
fixStatuses();
