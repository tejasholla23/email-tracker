/**
 * backfill_links.js
 * One-time script: populate link / links[] / isFormLink on existing records.
 * Run with: node backfill_links.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Application = require("./models/Application");

// ── Inline the same extraction logic as parseEmailWithLLM.js ──────────────
function cleanUrl(raw = "") {
  const url = raw.replace(/[)>.,;\"']+$/g, "").trim();
  if (!url.startsWith("http")) return null;
  return url;
}

function extractFormLink(text = "") {
  if (!text) return { primary: "", all: [], isForm: false };

  const rawAll = text.match(/https?:\/\/[^\s"'<>)]+/gi) || [];
  const all = rawAll.map(cleanUrl).filter(Boolean);

  const formsGle  = all.find((u) => /forms\.gle\//i.test(u));
  const docsForms = all.find((u) => /docs\.google\.com\/forms\//i.test(u));
  const primary   = formsGle || docsForms || all[0] || "";
  const isForm    = !!(formsGle || docsForms);

  return { primary, all, isForm };
}
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected\n");

  // Target: records where link is absent/empty OR links array is absent/empty
  const records = await Application.find({
    $or: [
      { link: { $in: [null, ""] } },
      { links: { $exists: false } },
      { links: { $size: 0 } },
    ],
  });

  console.log(`Found ${records.length} record(s) to backfill.\n`);

  let updated = 0;
  let skipped = 0;

  for (const app of records) {
    const text = app.rawText || "";
    const { primary, all, isForm } = extractFormLink(text);

    if (!primary && all.length === 0) {
      console.log(`[BACKFILL] Skipped ${app._id} | No links in rawText`);
      skipped++;
      continue;
    }

    // Only update if the current link field is empty (never overwrite good data)
    const updateFields = {
      links: all,
      isFormLink: isForm,
    };
    if (!app.link) {
      updateFields.link = primary;
    }

    await Application.findByIdAndUpdate(app._id, updateFields);
    console.log(
      `[BACKFILL] Updated ${app._id} | company=${app.company} | ` +
      `primary=${primary || "(none)"} | total links=${all.length} | isForm=${isForm}`
    );
    updated++;
  }

  console.log(`\n── BACKFILL COMPLETE ──`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Total   : ${records.length}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Backfill failed:", err.message);
  process.exit(1);
});
