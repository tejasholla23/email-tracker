const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const Application = require("../models/Application");

async function runBackfill() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("No MONGODB_URI found in environment variables.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("Connected successfully.");

  const apps = await Application.find({ isDeleted: false });
  console.log(`Found ${apps.length} active application records.`);

  let updatedCount = 0;

  for (const app of apps) {
    let needsUpdate = false;
    const update = {};

    // 1. Backfill opportunityType if missing
    if (!app.opportunityType) {
      let inferredOppType = "JOB_APPLICATION";
      const cls = app.classification || "";
      if (cls === "Hackathon / Event Invitation") {
        inferredOppType = "HACKATHON";
      } else if (cls === "Workshop / Webinar" || cls === "Expert Talk Series") {
        inferredOppType = "WEBINAR";
      } else if (cls === "PPT Announcement" || cls === "Venue Update" || cls === "Non-Recruitment Email" || app.emailType === "event" || app.emailType === "nonRecruitment") {
        inferredOppType = "OTHER_PLACEMENT_EVENT";
      }
      update.opportunityType = inferredOppType;
      needsUpdate = true;
    }

    // 2. Backfill stage if missing
    if (!app.stage || app.stage === "none") {
      let inferredStage = "none";
      const cls = app.classification || "";
      const text = `${app.subtitle || ""} ${app.rawText || ""}`.toLowerCase();

      if (/\b(?:regret to inform|not shortlisted|unsuccessful in this drive|cannot move forward)\b/i.test(text)) {
        inferredStage = "rejected";
      } else if (cls === "Assessment Announcement") {
        inferredStage = "oa_scheduled";
      } else if (cls === "Interview Schedule" || cls === "Interview Reminder") {
        inferredStage = "interview_scheduled";
      } else if (cls === "Interview Result" && /\b(?:selected|offer letter|congratulations|pleased to offer)\b/i.test(text)) {
        inferredStage = "offered";
      }

      if (inferredStage !== "none") {
        update.stage = inferredStage;
        needsUpdate = true;
      } else if (!app.stage) {
        update.stage = "none";
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await Application.updateOne({ _id: app._id }, { $set: update });
      updatedCount++;
    }
  }

  console.log(`Backfill completed. Updated ${updatedCount} / ${apps.length} applications.`);
  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

if (require.main === module) {
  runBackfill().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
}

module.exports = { runBackfill };
