require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('./models/Application');

async function migrateLinks(execute = false) {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB. Running in ${execute ? 'EXECUTE' : 'DRY-RUN'} mode...\n`);

    const apps = await Application.find({ link: { $exists: true, $ne: "" } });
    
    let toUpdate = 0;
    const examples = [];

    // URL Extraction Regex (same as the one recently added to parseEmailWithLLM.js)
    const urlRegex = /https?:\/\/[^\s<>"']+/i;

    for (const app of apps) {
      if (!app.link) continue;

      const rawLink = app.link.toString();
      const match = rawLink.match(urlRegex);

      if (match) {
        let cleanedLink = match[0].replace(/[.,;)]+$/, "");
        
        if (cleanedLink !== rawLink) {
          toUpdate++;
          if (examples.length < 5) {
            examples.push({
              id: app._id,
              company: app.company,
              before: rawLink,
              after: cleanedLink
            });
          }

          if (execute) {
            app.link = cleanedLink;
            await app.save();
          }
        }
      }
    }

    console.log(`Found ${apps.length} total applications with a link.`);
    console.log(`Found ${toUpdate} applications that require link cleaning.\n`);

    if (examples.length > 0) {
      console.log('--- Before/After Examples ---');
      examples.forEach((ex, i) => {
        console.log(`\nExample ${i + 1} (${ex.company}):`);
        console.log(`  BEFORE: ${ex.before.substring(0, 150)}${ex.before.length > 150 ? '...' : ''}`);
        console.log(`  AFTER : ${ex.after}`);
      });
      console.log('-----------------------------\n');
    }

    if (!execute) {
      console.log('This was a DRY-RUN. No changes were made to the database.');
      console.log('Run the script with the --execute flag to apply these changes (e.g. node migrate_links.js --execute).');
    } else {
      console.log('EXECUTION COMPLETE. Database updated successfully.');
    }

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

const executeMode = process.argv.includes('--execute');
migrateLinks(executeMode);
