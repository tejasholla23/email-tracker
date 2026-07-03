require("dotenv").config();
const mongoose = require("mongoose");
const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");
const Application = require("./models/Application");
const Account = require("./models/Account");
const { google } = require("googleapis");

function getFullBodyText(payload) {
  const he = require("he");
  const { mergeAlternativeTexts } = require("./utils/parseEmailWithLLM");
  
  const extractText = (p) => {
    if (p.mimeType === "text/plain") return Buffer.from(p.body.data, "base64").toString("utf-8");
    if (p.parts) {
      for (const part of p.parts) {
        const text = extractText(part);
        if (text) return text;
      }
    }
    return "";
  };

  const extractHtml = (p) => {
    if (p.mimeType === "text/html") return Buffer.from(p.body.data, "base64").toString("utf-8");
    if (p.parts) {
      for (const part of p.parts) {
        const html = extractHtml(part);
        if (html) return html;
      }
    }
    return "";
  };

  const htmlRaw = extractHtml(payload);
  const textRaw = extractText(payload);
  
  let text = "";
  if (htmlRaw && textRaw) {
    text = mergeAlternativeTexts(htmlRaw, textRaw);
  } else {
    text = htmlRaw || textRaw || "";
  }
  
  text = he.decode(text);
  if (text.length > 20000) {
    text = text.slice(-20000);
  }
  return text;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const apps = await Application.find({ parserVersion: { $ne: "v4" } });
  console.log(`Found ${apps.length} applications needing migration to v4.`);

  for (const appDoc of apps) {
    console.log(`[MIGRATION] Migrating app: ${appDoc.company || "Unknown"} | ID: ${appDoc._id} | messageId: ${appDoc.messageId}`);
    
    if (!appDoc.messageId) {
      await Application.updateOne({ _id: appDoc._id }, { $set: { parserVersion: "v4" } });
      console.log(`[MIGRATION] Locked parser version to v4 for document with no messageId: ${appDoc._id}`);
      continue;
    }

    const acc = await Account.findOne({ _id: appDoc.userId });
    if (!acc || !acc.tokens) {
      console.warn(`[MIGRATION] No account/tokens found for user ID: ${appDoc.userId}`);
      continue;
    }

    const localOauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    localOauth2Client.setCredentials(acc.tokens);

    const gmail = google.gmail({
      version: "v1",
      auth: localOauth2Client,
    });

    let email;
    try {
      email = await gmail.users.messages.get({
        userId: "me",
        id: appDoc.messageId,
        format: "full"
      });
    } catch (gmailErr) {
      console.error(`[MIGRATION] Failed to fetch message ${appDoc.messageId} from Gmail:`, gmailErr.message);
      // Lock version to v4 to avoid infinite retries on deleted/invalid emails
      await Application.updateOne({ _id: appDoc._id }, { $set: { parserVersion: "v4" } });
      continue;
    }

    const headers = email.data.payload.headers;
    const fromHeader = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const snippet = email.data.snippet || "";
    const rawText = `${subject} ${snippet}`.trim();
    const fullBodyText = getFullBodyText(email.data.payload);

    let parsed = null;
    let retries = 3;
    while (retries > 0) {
      try {
        parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText, new Date(parseInt(email.data.internalDate)));
        break;
      } catch (err) {
        if (err.message && err.message.includes("429")) {
          console.warn(`[MIGRATION] Gemini 429 rate limit hit. Waiting 20 seconds before retry...`);
          await new Promise(r => setTimeout(r, 20000));
          retries--;
        } else {
          console.error(`[MIGRATION] Parser error:`, err.message);
          break;
        }
      }
    }

    // Sleep 5.5 seconds between records to stay safely below Gemini 15 RPM limit
    await new Promise(r => setTimeout(r, 5500));

    if (parsed) {
      const updatePayload = {
        company: parsed.company || appDoc.company,
        emailType: parsed.emailType || appDoc.emailType,
        subtitle: parsed.subtitle || "",
        displayFields: parsed.displayFields || [],
        fieldsToDisplay: parsed.fieldsToDisplay || [],
        skills: parsed.skills || [],
        link: parsed.link || appDoc.link,
        links: parsed.links || appDoc.links,
        isFormLink: parsed.isFormLink || appDoc.isFormLink,
        deadline: parsed.deadline || "",
        deadlineISO: parsed.deadlineISO || "",
        deadlineText: parsed.deadlineText || "",
        programRoles: parsed.programRoles || "",
        programDuration: parsed.programDuration || "",
        programStipend: parsed.programStipend || "",
        classification: parsed.classification || "",
        confidenceScore: parsed.confidenceScore || 0,
        jobRole: parsed.jobRole || "",
        title: parsed.title || "",
        processId: parsed.processId || "",
        processName: parsed.processName || "",
        eventDate: parsed.eventDate || null,
        eventTime: parsed.eventTime || "",
        reportingTime: parsed.reportingTime || "",
        venue: parsed.venue || "",
        durationText: parsed.durationText || "",
        salaryText: parsed.salaryText || "",
        parseMeta: parsed.parseMeta || {},
        parserVersion: "v4",
      };

      const newEvents = [...appDoc.events];
      const evIndex = newEvents.findIndex(e => e.messageId === appDoc.messageId);
      if (evIndex > -1) {
        newEvents[evIndex] = {
          ...newEvents[evIndex],
          classification: parsed.classification || "",
          title: parsed.timelineTitle || parsed.title || newEvents[evIndex].title || "",
          summary: parsed.timelineSummary || parsed.summary || "",
          link: parsed.link || newEvents[evIndex].link || "",
        };
        updatePayload.events = newEvents;
      }

      await Application.updateOne({ _id: appDoc._id }, { $set: updatePayload });
      console.log(`[MIGRATION] Successfully migrated app: ${appDoc.company} | New DeadlineISO: ${updatePayload.deadlineISO}`);
    } else {
      console.warn(`[MIGRATION] Skipping database update for app: ${appDoc.company} because parse returned null`);
    }
  }

  console.log("[MIGRATION] Completed migration of all database records to v4.");
  await mongoose.connection.close();
}

run().catch(console.error);
