"use strict";
const { GoogleGenAI } = require("@google/genai");
const CompanyInfo = require("../models/CompanyInfo");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * In-memory lock set: tracks company names currently being enriched.
 * Prevents concurrent Gemini calls for the same company during parallel syncs
 * (e.g. 10 users syncing simultaneously — only the first triggers enrichment,
 * the rest hit the DB cache once it's written).
 */
const enrichingLock = new Set();

/**
 * Calls Gemini with a tiny, isolated company-profile prompt.
 * Returns structured JSON or null on failure.
 */
async function callGeminiForCompanyProfile(companyName, domain) {
  const prompt = `You are a company research assistant. Return ONLY valid JSON — no markdown, no explanation.

Provide factual information about the company: "${companyName}"${domain ? ` (website: ${domain})` : ""}.

Return exactly this JSON:
{
  "industry": "<e.g. Information Technology, Electrical Equipment, FMCG>",
  "companyType": "<Product | Service | Product & Service | Startup | Research | Public Sector>",
  "headquarters": "<City, Country>",
  "description": "<2-3 sentences summarizing what the company does>",
  "website": "<official website URL, or empty string>",
  "knownFor": ["<short bullet 1>", "<short bullet 2>", "<short bullet 3>"]
}

Rules:
- If this is a well-known company, use factual information.
- If unsure, return your best estimate with available knowledge.
- "knownFor" must be 2-5 short phrases (max 6 words each).
- Always return valid JSON.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { abortSignal: controller.signal }
    });
    clearTimeout(timeoutId);

    let jsonText = (response.text || "").trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const raw = JSON.parse(jsonText);

    return {
      industry:    typeof raw.industry    === "string" ? raw.industry.trim()    : "",
      companyType: typeof raw.companyType === "string" ? raw.companyType.trim() : "",
      headquarters: typeof raw.headquarters === "string" ? raw.headquarters.trim() : "",
      description: typeof raw.description === "string" ? raw.description.trim() : "",
      website:     typeof raw.website     === "string" ? raw.website.trim()     : "",
      knownFor:    Array.isArray(raw.knownFor)
        ? raw.knownFor.filter(k => typeof k === "string" && k.trim()).map(k => k.trim()).slice(0, 5)
        : [],
    };
  } catch (err) {
    console.error(`[ENRICH_COMPANY_FAILED] Gemini call failed for "${companyName}":`, err.message);
    return null;
  }
}

/**
 * Enriches a CompanyInfo document with Gemini-generated profile data.
 * Safe to call concurrently — uses DB-level isEnriching flag + in-memory lock
 * to ensure Gemini is called AT MOST ONCE per company, even across 10 parallel syncs.
 *
 * @param {object} companyInfoDoc - Mongoose CompanyInfo document (must have _id and name)
 */
async function enrichCompanyProfile(companyInfoDoc) {
  if (!companyInfoDoc) return;
  const name = companyInfoDoc.name;

  // Skip if already enriched
  if (companyInfoDoc.isEnriched) return;

  // In-memory lock: prevent duplicate enrichment calls within the same server process
  if (enrichingLock.has(name)) {
    console.log(`[ENRICH_SKIP] "${name}" is already being enriched (in-memory lock).`);
    return;
  }

  // DB-level lock: mark as enriching to guard against separate server restarts / edge cases
  try {
    const claimed = await CompanyInfo.findOneAndUpdate(
      { _id: companyInfoDoc._id, isEnriching: false, isEnriched: false },
      { $set: { isEnriching: true } },
      { new: true }
    );
    if (!claimed) {
      // Another process already claimed it
      console.log(`[ENRICH_SKIP] "${name}" already claimed by another process (DB lock).`);
      return;
    }
  } catch (err) {
    console.error(`[ENRICH_LOCK_FAILED] "${name}":`, err.message);
    return;
  }

  enrichingLock.add(name);
  console.log(`[ENRICH_START] Generating company profile for "${name}"...`);

  try {
    const profile = await callGeminiForCompanyProfile(name, companyInfoDoc.domain);

    if (profile) {
      await CompanyInfo.findByIdAndUpdate(companyInfoDoc._id, {
        ...profile,
        isEnriched: true,
        isEnriching: false,
        lastEnriched: new Date(),
      });
      console.log(`[ENRICH_DONE] "${name}" — industry: ${profile.industry}, type: ${profile.companyType}`);
    } else {
      // Gemini failed — release the lock so it can be retried next time
      await CompanyInfo.findByIdAndUpdate(companyInfoDoc._id, {
        isEnriching: false,
      });
      console.log(`[ENRICH_FAILED] "${name}" — Gemini returned null, lock released.`);
    }
  } finally {
    enrichingLock.delete(name);
  }
}

module.exports = { enrichCompanyProfile };
