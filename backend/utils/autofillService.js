const AutofillProfile = require("../models/AutofillProfile");
const AutofillTask = require("../models/AutofillTask");
const FormCache = require("../models/FormCache");
const Application = require("../models/Application");
const googleFormsParser = require("./googleFormsParser");
const fieldMappingEngine = require("./fieldMappingEngine");

// Helper to determine status based on missing fields
function determineStatus(missingFields) {
  return missingFields.length > 0 ? "needs_attention" : "waiting";
}

async function createAutofillTask(userId, applicationId, formUrl) {
  try {
    // 1. Resolve forms.gle to get full Google Forms URL if needed
    const resolvedRes = await googleFormsParser.resolveUrl(formUrl);
    const realFormUrl = resolvedRes.success ? resolvedRes.data : formUrl;

    const idRes = googleFormsParser.extractFormId(realFormUrl);
    if (!idRes.success) {
      console.error(`[AUTOFILL_SERVICE] Invalid URL parsed: ${formUrl}. Error:`, idRes.error);
      return null;
    }
    const formId = idRes.data;

    // 2. Fetch Application for details
    const app = await Application.findById(applicationId);
    if (!app) {
      console.error(`[AUTOFILL_SERVICE] Application not found: ${applicationId}`);
      return null;
    }

    // 3. Duplicate Task Check
    const existingTask = await AutofillTask.findOne({ userId, formId });
    if (existingTask) {
      existingTask.lastSeenAt = new Date();
      await existingTask.save();
      console.log(`[AUTOFILL_SERVICE] Duplicate task detected for ${formId}. Updated lastSeenAt.`);
      return existingTask;
    }

    // 4. Resolve Fields via Cache / Fetch
    let fields = [];
    const cacheEntry = await FormCache.findOne({ formId });
    const now = new Date();

    if (cacheEntry) {
      if (cacheEntry.expiresAt > now) {
        fields = cacheEntry.fields;
        console.log(`[AUTOFILL_SERVICE] Cache HIT for ${formId}`);
      } else {
        console.log(`[AUTOFILL_SERVICE] Cache EXPIRED for ${formId}. Refreshing...`);
        const parseRes = await googleFormsParser.fetchAndParseForm(realFormUrl);
        if (parseRes.success) {
          cacheEntry.fields = parseRes.data;
          cacheEntry.lastVerifiedAt = now;
          cacheEntry.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
          await cacheEntry.save();
          fields = parseRes.data;
        } else {
          console.warn(`[AUTOFILL_SERVICE] Form parse refresh failed for ${formId}. Falling back to stale cache:`, parseRes.error);
          fields = cacheEntry.fields; // fallback
        }
      }
    } else {
      console.log(`[AUTOFILL_SERVICE] Cache MISS for ${formId}. Fetching form layout...`);
      const parseRes = await googleFormsParser.fetchAndParseForm(realFormUrl);
      if (parseRes.success) {
        fields = parseRes.data;
        const newCache = new FormCache({
          formId,
          formUrl: realFormUrl,
          fields,
          fetchedAt: now,
          lastVerifiedAt: now,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
        await newCache.save();
      } else {
        console.error(`[AUTOFILL_SERVICE] Failed to parse Google Form for ${formId}:`, parseRes.error);
        // Create task with empty fields to avoid crashing email pipeline
        fields = [];
      }
    }

    // 5. Load profile
    const profile = await AutofillProfile.findOne({ userId });

    // 6. Map fields to profile
    const mappedFields = fieldMappingEngine.mapFieldsToProfile(fields, profile);

    // 7. Calculate missing fields list (ignoring file uploads)
    const missingFields = mappedFields
      .filter((f) => f.isMissing && f.type !== "file")
      .map((f) => f.label);

    const initialStatus = determineStatus(missingFields);
    const prefillUrl = googleFormsParser.buildPrefillUrl(realFormUrl, mappedFields, {});

    // 8. Create task
    const task = new AutofillTask({
      userId,
      applicationId,
      formUrl: realFormUrl,
      formId,
      company: app.company,
      role: app.role || "Unknown Role",
      dateReceived: app.date || now,
      lastSeenAt: now,
      status: initialStatus,
      formFields: mappedFields,
      missingFields,
      prefillUrl,
      temporaryEdits: {},
      parsedAt: now,
    });

    await task.save();
    console.log(`[AUTOFILL_SERVICE] Created new task for ${app.company} | ${app.role}`);
    return task;
  } catch (error) {
    console.error("[AUTOFILL_SERVICE] Unhandled error during task creation:", error);
    return null;
  }
}

async function refreshTask(taskId) {
  const task = await AutofillTask.findById(taskId);
  if (!task) return null;

  const now = new Date();

  // Full-workflow cache/refresh
  let fields = [];
  const cacheEntry = await FormCache.findOne({ formId: task.formId });
  if (cacheEntry) {
    if (cacheEntry.expiresAt > now) {
      fields = cacheEntry.fields;
    } else {
      const parseRes = await googleFormsParser.fetchAndParseForm(task.formUrl);
      if (parseRes.success) {
        cacheEntry.fields = parseRes.data;
        cacheEntry.lastVerifiedAt = now;
        cacheEntry.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        await cacheEntry.save();
        fields = parseRes.data;
      } else {
        console.warn(`[AUTOFILL_SERVICE] Task refresh fallback to stale cache for ${task.formId}:`, parseRes.error);
        fields = cacheEntry.fields;
      }
    }
  } else {
    const parseRes = await googleFormsParser.fetchAndParseForm(task.formUrl);
    if (parseRes.success) {
      fields = parseRes.data;
      const newCache = new FormCache({
        formId: task.formId,
        formUrl: task.formUrl,
        fields,
        fetchedAt: now,
        lastVerifiedAt: now,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      });
      await newCache.save();
    } else {
      // Use existing fields if parser fails
      fields = task.formFields.map((f) => ({
        fieldId: f.fieldId,
        label: f.label,
        type: f.type,
        options: f.options,
      }));
    }
  }

  // Load updated profile
  const profile = await AutofillProfile.findOne({ userId: task.userId });

  // Map to profile
  const freshMappedFields = fieldMappingEngine.mapFieldsToProfile(fields, profile);

  // Apply Mapped values and preserve temporary edits
  const finalFields = freshMappedFields.map((field) => {
    const tempEdit = task.temporaryEdits.get(field.fieldId);
    if (tempEdit) {
      return {
        ...field,
        mappedValue: tempEdit.value,
        isMissing: false,
      };
    }
    return field;
  });

  // Calculate missing fields list (ignoring file uploads)
  const missingFields = finalFields
    .filter((f) => f.isMissing && f.type !== "file")
    .map((f) => f.label);

  task.formFields = finalFields;
  task.missingFields = missingFields;
  
  // Rebuild prefillUrl
  task.prefillUrl = googleFormsParser.buildPrefillUrl(task.formUrl, finalFields, task.temporaryEdits);
  
  // Only auto-update status if it was waiting or needs_attention (don't revert submitted/opened status)
  if (["waiting", "needs_attention"].includes(task.status)) {
    task.status = determineStatus(missingFields);
  }

  task.parsedAt = now;
  await task.save();
  return task;
}

async function applyTemporaryEdits(taskId, edits) {
  const task = await AutofillTask.findById(taskId);
  if (!task) return null;

  // Merge edits into temporaryEdits map
  // Expected edits format: { [fieldId]: { value, edited: true } }
  for (const [fieldId, editObj] of Object.entries(edits)) {
    if (editObj && editObj.value !== undefined) {
      task.temporaryEdits.set(fieldId, {
        value: editObj.value,
        edited: true,
      });
    }
  }

  // Update task's field list matching edits
  task.formFields = task.formFields.map((field) => {
    const tempEdit = task.temporaryEdits.get(field.fieldId);
    if (tempEdit) {
      return {
        ...field,
        mappedValue: tempEdit.value,
        isMissing: false,
      };
    }
    return field;
  });

  // Recalculate missing fields list
  const missingFields = task.formFields
    .filter((f) => f.isMissing && f.type !== "file")
    .map((f) => f.label);

  task.missingFields = missingFields;
  
  // Rebuild prefillUrl
  task.prefillUrl = googleFormsParser.buildPrefillUrl(task.formUrl, task.formFields, task.temporaryEdits);

  // If status is needs_attention but now we have all overrides, set status to waiting
  if (task.status === "needs_attention" && missingFields.length === 0) {
    task.status = "waiting";
  }

  await task.save();
  return task;
}

module.exports = {
  createAutofillTask,
  refreshTask,
  applyTemporaryEdits,
};
