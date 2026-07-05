require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI environment variable is missing.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  // Find all applications where displayFields is empty/missing
  const apps = await Application.find({
    $or: [
      { displayFields: { $exists: false } },
      { displayFields: { $size: 0 } }
    ]
  });

  console.log(`Found ${apps.length} applications with empty displayFields.`);

  let updatedCount = 0;

  for (const app of apps) {
    const displayFields = [];
    if (app.programRoles) displayFields.push({ label: "Role", value: app.programRoles });
    else if (app.role && app.role !== "Unknown Role" && app.role !== "Event") {
      displayFields.push({ label: "Role", value: app.role });
    }

    if (app.salaryText) displayFields.push({ label: "CTC", value: app.salaryText });
    if (app.programStipend) displayFields.push({ label: "Stipend", value: app.programStipend });
    if (app.programDuration) displayFields.push({ label: "Duration", value: app.programDuration });
    if (app.venue) displayFields.push({ label: "Location", value: app.venue });
    if (app.deadlineText) displayFields.push({ label: "Deadline", value: app.deadlineText });

    if (displayFields.length > 0) {
      await Application.updateOne(
        { _id: app._id },
        { $set: { displayFields } }
      );
      updatedCount++;
      console.log(`[BACKFILL] Migrated app ID: ${app._id} | Company: ${app.company} | Fields: ${displayFields.map(f => f.label).join(", ")}`);
    }
  }

  console.log(`[BACKFILL] Completed migration. Successfully backfilled displayFields for ${updatedCount} records.`);
  await mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
