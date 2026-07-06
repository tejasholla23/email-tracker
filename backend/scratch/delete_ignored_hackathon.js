require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("../models/Application");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected successfully to MongoDB.");

  // Delete the IGNORED document for 19f369579e555a2a
  const result = await Application.deleteOne({
    messageId: "19f369579e555a2a",
    company: "IGNORED"
  });

  if (result.deletedCount > 0) {
    console.log("Successfully deleted the IGNORED document for message ID 19f369579e555a2a so it can be re-synced.");
  } else {
    console.log("No matching IGNORED document found to delete (it might have already been cleaned up or not created).");
  }

  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
