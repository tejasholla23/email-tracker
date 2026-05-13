const { google } = require("googleapis");
const he = require("he");
const Application = require("../models/Application");
const Account = require("../models/Account");
const { parseEmailWithLLM } = require("./parseEmailWithLLM");
const { getCompanyInfo } = require("./companyInfoService");

let isProcessing = false;

// Helper to extract full body text from Gmail payload
function extractText(payload) {
  if (payload.mimeType === "text/plain" && payload.body.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractText(part);
      if (text) return text;
    }
  }
  return null;
}

function extractHtml(payload) {
  if (payload.mimeType === "text/html" && payload.body.data) {
    return Buffer.from(payload.body.data, "base64")
      .toString("utf-8")
      .replace(/<[^>]*>?/gm, " ");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const html = extractHtml(part);
      if (html) return html;
    }
  }
  return null;
}

function getFullBodyText(payload) {
  let text = extractText(payload) || extractHtml(payload) || "";
  text = he.decode(text);
  if (text.length > 20000) {
    text = text.slice(-20000);
  }
  return text;
}

async function fetchAndProcessEmails(oauth2Client) {
  if (isProcessing) {
    console.log("Cron already running, skipping...");
    return;
  }

  isProcessing = true;
  let insertedCount = 0;
  let skippedCount = 0;
  let fetchedCount = 0;

  try {
    const accounts = await Account.find();
    if (!accounts.length) {
      console.log("No accounts connected");
      return;
    }

    for (let acc of accounts) {
      if (acc.email !== "1ms23ci126@msrit.edu") continue;

      console.log(`Processing account: ${acc.email}`);
      oauth2Client.setCredentials(acc.tokens);

      const gmail = google.gmail({
        version: "v1",
        auth: oauth2Client,
      });

      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 50,
        q: "(from:placement@msrit.edu OR from:dean.tap@msrit.edu) newer_than:30d",
      });

      const messages = response.data.messages || [];
      fetchedCount += messages.length;
      console.log(`\n--- STARTING SYNC FOR ${acc.email} ---`);

      for (let msg of messages) {
        const id = msg.id;
        try {
          const email = await gmail.users.messages.get({
            userId: "me",
            id: id,
            format: "full",
          });

          const headers = email.data.payload.headers;
          const fromHeader = headers.find((h) => h.name === "From")?.value || "";
          const subject = headers.find((h) => h.name === "Subject")?.value || "";
          const snippet = email.data.snippet || "";
          const rawText = `${subject} ${snippet}`.trim();
          const fullBodyText = getFullBodyText(email.data.payload);

          const exists = await Application.findOne({ messageId: id });
          if (exists) {
            const missingDetails = !exists.programRoles || !exists.programDuration || !exists.programStipend || !exists.deadlineText || !exists.link;
            if (missingDetails) {
              const parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText);
              if (parsed && parsed.isRelevant) {
                const updatePayload = {};
                const fields = ['programRoles', 'programDuration', 'programStipend', 'deadlineText', 'link', 'links', 'isFormLink', 'deadline', 'deadlineISO'];
                fields.forEach(f => {
                  if (!exists[f] && parsed[f]) updatePayload[f] = parsed[f];
                });

                if (Object.keys(updatePayload).length > 0) {
                  await Application.findByIdAndUpdate(exists._id, updatePayload, { new: true });
                  console.log(`[UPDATED] ${id} | Existing application enriched`);
                }
              }
            }
            skippedCount++;
            continue;
          }

          const parsed = await parseEmailWithLLM(rawText, fromHeader, fullBodyText);
          if (!parsed || !parsed.isRelevant || !parsed.company) {
            skippedCount++;
            continue;
          }

          const finalRole = parsed.role || "Unknown Role";
          await getCompanyInfo(parsed.company); // Prefetch/Cache

          const contentExists = await Application.findOne({
            company: parsed.company,
            role: finalRole
          });

          if (contentExists) {
            const updatePayload = {};
            const fields = ['programRoles', 'programDuration', 'programStipend', 'deadlineText', 'link', 'links', 'isFormLink', 'deadline', 'deadlineISO'];
            fields.forEach(f => {
              if (!contentExists[f] && parsed[f]) updatePayload[f] = parsed[f];
            });

            if (Object.keys(updatePayload).length > 0) {
              await Application.findByIdAndUpdate(contentExists._id, updatePayload, { new: true });
            }
            skippedCount++;
            continue;
          }

          const newApp = new Application({
            company: parsed.company,
            role: finalRole,
            type: parsed.type || "",
            status: parsed.status || "pending",
            link: parsed.link || "",
            links: parsed.links || [],
            isFormLink: parsed.isFormLink || false,
            deadline: parsed.deadline || "",
            deadlineISO: parsed.deadlineISO || "",
            deadlineText: parsed.deadlineText || "",
            programRoles: parsed.programRoles || "",
            programDuration: parsed.programDuration || "",
            programStipend: parsed.programStipend || "",
            rawText,
            messageId: id,
            source: "Gmail",
            email: acc.email,
            date: new Date(parseInt(email.data.internalDate)),
          });

          await newApp.save();
          insertedCount++;
        } catch (error) {
          skippedCount++;
        }
      }
    }
    console.log(`\nSUMMARY: Fetched ${fetchedCount} | Inserted ${insertedCount} | Skipped ${skippedCount}`);
  } catch (err) {
    console.error("Fetch error:", err.message);
  } finally {
    isProcessing = false;
  }
}

module.exports = {
  fetchAndProcessEmails,
  getIsProcessing: () => isProcessing
};
