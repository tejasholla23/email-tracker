require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const apps = await Application.find({ isDeleted: false });

  let updated = 0;
  for (const app of apps) {
    if (!app.events || app.events.length === 0) {
      if (app.messageId) {
        app.events = [{
          messageId: app.messageId,
          date: app.date,
          classification: app.classification,
          title: app.title,
          subject: app.parseMeta?.sourceSubject || "",
          status: app.status,
          link: app.link
        }];
        await app.save();
        updated++;
      }
    }
  }

  console.log(`Backfilled events for ${updated} applications.`);
  await mongoose.disconnect();
}
run();
