const { OpenAI } = require("openai");
const CompanyInfo = require("../models/CompanyInfo");

const nvidiaClient = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || "dummy_key",
  baseURL: "https://integrate.api.nvidia.com/v1",
});

const MODEL_NAME = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct";

/**
 * Enrich company profile using NVIDIA LLM.
 * Caches profile in MongoDB CompanyInfo model.
 * 
 * @param {string} companyName - Name of company to enrich
 * @returns {Promise<object|null>} Enriched CompanyInfo document or null
 */
async function enrichCompanyProfile(companyName) {
  if (!companyName || typeof companyName !== "string") return null;

  const normalizedName = companyName.trim();
  if (!normalizedName) return null;

  try {
    const existing = await CompanyInfo.findOne({ name: normalizedName });

    if (existing && existing.isEnriched) {
      return existing;
    }

    if (existing && existing.isEnriching) {
      console.log(`[COMPANY_ENRICH_IN_FLIGHT] ${normalizedName} is already enriching...`);
      return existing;
    }

    // Set lock
    await CompanyInfo.updateOne(
      { name: normalizedName },
      { $set: { isEnriching: true } },
      { upsert: false }
    );

    console.log(`[COMPANY_ENRICH_START] Enriching ${normalizedName}...`);

    const prompt = `You are a career and placement assistant for college students.
Given the company name "${normalizedName}", generate a concise summary profile.

Output MUST be a valid JSON object with the following fields:
- "description": A 2-3 sentence overview of what the company does, its core products/services, and what type of company it is (e.g. product-based tech giant, IT service provider, cybersecurity, fintech, etc.).
- "industry": Main industry category (e.g. "Technology", "Financial Services", "Cybersecurity", "E-commerce", "Consulting").
- "companyType": Primary business model (e.g. "Product", "Service", "Product + Service", "Consulting", "Fintech", "Cybersecurity").
- "headquarters": Main headquarters location if known (e.g. "Armonk, NY, USA" or "Mumbai, India").
- "website": Official domain (e.g. "ibm.com" or "zycus.com").
- "knownFor": An array of 3-4 short, clear bullet strings of key things students should know about this company (e.g. ["Enterprise software & cloud", "Regular campus hiring", "Strong R&D focus"]).

Return ONLY valid raw JSON. No markdown code blocks, no preamble, no extra text.`;

    const response = await nvidiaClient.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 400,
    });

    const content = response.choices?.[0]?.message?.content || "";
    let cleanJsonStr = content.trim();
    if (cleanJsonStr.startsWith("```")) {
      cleanJsonStr = cleanJsonStr.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    }

    let parsed = {};
    try {
      parsed = JSON.parse(cleanJsonStr);
    } catch (parseErr) {
      console.error(`[COMPANY_ENRICH_JSON_PARSE_ERROR] ${normalizedName}:`, parseErr.message, "Raw content:", content);
    }

    const updated = await CompanyInfo.findOneAndUpdate(
      { name: normalizedName },
      {
        $set: {
          description: parsed.description || `${normalizedName} is a prominent organization.`,
          industry: parsed.industry || "Technology",
          companyType: parsed.companyType || "Enterprise",
          headquarters: parsed.headquarters || "",
          website: parsed.website || "",
          knownFor: Array.isArray(parsed.knownFor) ? parsed.knownFor : [],
          isEnriched: true,
          isEnriching: false,
          lastEnriched: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    console.log(`[COMPANY_ENRICH_SUCCESS] ${normalizedName} profile saved.`);
    return updated;
  } catch (error) {
    console.error(`[COMPANY_ENRICH_FAILED] ${companyName}:`, error.message);
    await CompanyInfo.updateOne(
      { name: companyName.trim() },
      { $set: { isEnriching: false } }
    ).catch(() => {});
    return null;
  }
}

module.exports = { enrichCompanyProfile };
