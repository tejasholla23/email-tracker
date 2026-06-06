"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const Application = require("./models/Application");
const { normalizeCompany, isValidCompany } = require("./utils/normalizeCompany");
const { advanceStatus } = require("./utils/statusMachine");

// Supported modes
const MODE = process.argv[2] || "dry-run";

const BACKUP_DIR = path.join(__dirname, "backups");

async function createBackup(data, namePrefix) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${namePrefix}_${timestamp}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`[BACKUP] Created backup file: ${filepath}`);
  return filepath;
}

function mergeArrays(arr1, arr2) {
  const merged = [...(arr1 || []), ...(arr2 || [])];
  return [...new Set(merged)];
}

function mergeEvents(events1, events2) {
  const allEvents = [...(events1 || []), ...(events2 || [])];
  // Deduplicate by messageId
  const uniqueMap = new Map();
  for (const e of allEvents) {
    if (!e.messageId) continue;
    // Keep the one with the most data if there's a collision (unlikely)
    if (!uniqueMap.has(e.messageId)) {
      uniqueMap.set(e.messageId, e);
    } else {
      const existing = uniqueMap.get(e.messageId);
      if (!existing.link && e.link) existing.link = e.link;
    }
  }
  const uniqueEvents = Array.from(uniqueMap.values());
  // Sort chronologically
  uniqueEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
  return uniqueEvents;
}

async function run() {
  console.log(`\n--- STARTING CONSOLIDATION MIGRATION: ${MODE.toUpperCase()} MODE ---\n`);

  if (!["dry-run", "execute", "rollback"].includes(MODE)) {
    console.error("Invalid mode. Use 'dry-run', 'execute', or 'rollback'.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB.");

    if (MODE === "rollback") {
      const backupFile = process.argv[3];
      if (!backupFile) {
         console.error("Provide a backup file path to rollback: node migrate_consolidate.js rollback backups/...");
         process.exit(1);
      }
      console.log(`Rolling back using file: ${backupFile}`);
      const rawData = fs.readFileSync(backupFile, "utf-8");
      const { deleted, updated } = JSON.parse(rawData);
      
      // Restore deleted documents
      if (deleted && deleted.length > 0) {
         await Application.insertMany(deleted);
         console.log(`[ROLLBACK] Restored ${deleted.length} deleted documents.`);
      }
      
      // Revert updated documents to original state
      if (updated && updated.length > 0) {
         for (const orig of updated) {
            await Application.findOneAndReplace({ _id: orig._id }, orig);
         }
         console.log(`[ROLLBACK] Reverted ${updated.length} updated documents.`);
      }
      console.log("\nRollback complete.");
      return;
    }

    // 1. Fetch all applications
    const apps = await Application.find({ isDeleted: false }).lean();
    console.log(`Total active applications found: ${apps.length}`);

    // Pre-migration backup
    if (MODE === "execute") {
      await createBackup(apps, "pre_migration_full");
    }

    // 2. Group by companyKey
    const groups = new Map();
    const standalone = [];

    for (const app of apps) {
      // Ensure companyKey is set correctly
      const key = normalizeCompany(app.company);
      app.companyKey = key; // dynamic patch for analysis

      if (!isValidCompany(app.company)) {
        standalone.push(app);
        continue;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(app);
    }

    console.log(`Grouped into ${groups.size} distinct valid companies.`);
    console.log(`Identified ${standalone.length} standalone/invalid companies (will not be merged).`);

    // 3. Merge groups
    let mergedGroupCount = 0;
    let documentsToRemove = [];
    let documentsToUpdate = []; // Maps target _id -> { $set: ... } payload
    let originalDocsToUpdate = []; // Original versions for rollback

    for (const [key, group] of groups.entries()) {
      if (group.length === 1) {
         // Single document, just update companyKey
         const doc = group[0];
         if (doc.companyKey !== key) {
           originalDocsToUpdate.push(doc);
           documentsToUpdate.push({ filter: { _id: doc._id }, update: { $set: { companyKey: key } } });
         }
         continue;
      }

      mergedGroupCount++;

      // Sort group chronologically so earliest is our "base" document
      group.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      const target = group[0];
      const others = group.slice(1);
      
      originalDocsToUpdate.push(target);
      documentsToRemove.push(...others);

      // We will mutate a copy of target to figure out the final $set
      const merged = { ...target };
      merged.companyKey = key;

      for (const other of others) {
        // Merge metadata (keep existing if truthy, else take other's)
        if (!merged.venue && other.venue) merged.venue = other.venue;
        if (!merged.deadline && other.deadline) merged.deadline = other.deadline;
        if (!merged.deadlineISO && other.deadlineISO) merged.deadlineISO = other.deadlineISO;
        if (!merged.deadlineText && other.deadlineText) merged.deadlineText = other.deadlineText;
        if ((!merged.jobRole || merged.jobRole === "Unknown Role") && other.jobRole && other.jobRole !== "Unknown Role") {
           merged.jobRole = other.jobRole;
        }
        if (!merged.programStipend && other.programStipend) merged.programStipend = other.programStipend;
        if (!merged.programRoles && other.programRoles) merged.programRoles = other.programRoles;
        if (!merged.programDuration && other.programDuration) merged.programDuration = other.programDuration;
        if (!merged.durationText && other.durationText) merged.durationText = other.durationText;
        if (!merged.salaryText && other.salaryText) merged.salaryText = other.salaryText;
        if (!merged.isFormLink && other.isFormLink) merged.isFormLink = other.isFormLink;
        if (!merged.link && other.link) merged.link = other.link;
        if (!merged.eventTime && other.eventTime) merged.eventTime = other.eventTime;
        if (!merged.reportingTime && other.reportingTime) merged.reportingTime = other.reportingTime;
        
        // Arrays
        merged.links = mergeArrays(merged.links, other.links);
        
        // Advanced rules
        if (other.eventDate) {
           if (!merged.eventDate || new Date(other.eventDate) > new Date(merged.eventDate)) {
             merged.eventDate = other.eventDate;
           }
        }
        if (other.type && other.type !== "unknown") {
           if (!merged.type || merged.type === "unknown") {
             merged.type = other.type;
           }
        }
        
        // Status State Machine Progression
        merged.status = advanceStatus(merged.status, other.status);

        // Append events
        merged.events = mergeEvents(merged.events, other.events);
      }

      // Generate the $set update payload
      const updatePayload = { $set: {} };
      for (const field of Object.keys(merged)) {
         if (field === '_id' || field === '__v') continue;
         // In a deep comparison we'd be more careful, but over-writing with the exact merged state is fine.
         updatePayload.$set[field] = merged[field];
      }
      
      documentsToUpdate.push({ filter: { _id: target._id }, update: updatePayload });
    }

    // For standalone items, just ensure companyKey is set
    for (const doc of standalone) {
       const key = normalizeCompany(doc.company);
       if (doc.companyKey !== key) {
         originalDocsToUpdate.push(doc);
         documentsToUpdate.push({ filter: { _id: doc._id }, update: { $set: { companyKey: key } } });
       }
    }

    console.log(`\n--- MIGRATION PLAN ---`);
    console.log(`Groups to merge: ${mergedGroupCount}`);
    console.log(`Documents to UPDATE: ${documentsToUpdate.length}`);
    console.log(`Documents to DELETE: ${documentsToRemove.length} (duplicates merged into targets)`);

    if (MODE === "dry-run") {
      console.log("\n[DRY RUN] No changes made to the database.");
      console.log("Run with 'execute' to apply changes.");
      
      // Print an example
      if (documentsToUpdate.length > 0 && mergedGroupCount > 0) {
        // Find an update that is a merge (has deleted docs)
        const sampleId = documentsToRemove[0]?.company; // Not perfect mapping, but just to show something
        console.log("\nSample execution plan ready. Use execute mode to run.");
      }
    } else if (MODE === "execute") {
      // 1. Create rollback file
      const rollbackData = {
        deleted: documentsToRemove,
        updated: originalDocsToUpdate
      };
      await createBackup(rollbackData, "rollback_state");

      // 2. Perform deletes
      const deleteIds = documentsToRemove.map(d => d._id);
      if (deleteIds.length > 0) {
         const delRes = await Application.deleteMany({ _id: { $in: deleteIds } });
         console.log(`Deleted ${delRes.deletedCount} merged documents.`);
      }

      // 3. Perform updates
      let updatedCount = 0;
      for (const op of documentsToUpdate) {
         await Application.updateOne(op.filter, op.update);
         updatedCount++;
      }
      console.log(`Updated ${updatedCount} target documents with merged data and companyKeys.`);
      console.log("\n[SUCCESS] Migration completed.");
    }

  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("DB disconnected.");
  }
}

run();
