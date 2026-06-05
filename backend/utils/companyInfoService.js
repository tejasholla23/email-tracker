const { GoogleGenAI } = require("@google/genai");
const CompanyInfo = require("../models/CompanyInfo");

// Initialize Gemini
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Get company information. 
 * Checks CompanyInfo collection for cached info first. 
 * If not found, generates using Gemini AI and saves it.
 * 
 * @param {string} companyName - Name of the company to look up
 * @returns {Promise<object|null>} - Company info object or null
 */
async function getCompanyInfo(companyName) {
  if (!companyName) return null;

  // Normalize company name for consistent caching
  const normalizedName = companyName.trim();

  try {
    console.log(`[COMPANY_INFO_FETCH_START] ${normalizedName}`);
    // 1. Check Cache (Dedicated CompanyInfo collection)
    const cachedInfo = await CompanyInfo.findOne({ name: normalizedName });

    if (cachedInfo) {
      console.log(`[COMPANY_INFO_CACHE_HIT] ${normalizedName}`);
      return cachedInfo;
    }

    // 2. Generate with LLM
    console.log(`[COMPANY_INFO_FETCHED] ${normalizedName}`);
    
    const prompt = `
      You are a precise business research assistant. Generate concise, factual information about the following company.
      
      Company: ${normalizedName}
      
      === CRITICAL SAFETY RULES ===
      1. If you are uncertain about any detail (HQ, industry, type), return "Unknown" for that field.
      2. DO NOT invent or hallucinate information.
      3. Avoid marketing fluff; keep it factual and neutral.
      4. If the company is obscure or you have no data, return "Unknown" for all fields.
      
      === RETURN FORMAT ===
      Return ONLY a JSON object with this structure:
      {
        "shortDescription": "One-sentence summary. Format: '[Company] is a [Location]-based [Type] company focused on [Industry].'",
        "fullDescription": "Concise paragraph (2-3 sentences) explaining core business and impact.",
        "industry": "Primary industry (e.g., E-commerce, Fintech)",
        "companyType": "e.g., Product-based | Service-based | Startup",
        "headquarters": "City, Country",
        "domain": "official website domain (e.g. google.com)"
      }
      
      Rule: Return ONLY the JSON. No markdown fences.
    `;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await genAI.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt,
        config: {
          abortSignal: controller.signal
        }
      });
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError" || controller.signal.aborted) {
        const timeoutError = new Error("Gemini company lookup request timed out");
        timeoutError.code = "ETIMEOUT";
        throw timeoutError;
      }
      throw err;
    }

    let text = (response.text || "").trim();

    // Clean JSON if it contains markdown fences
    if (text.startsWith("```json")) {
      text = text.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (text.startsWith("```")) {
      text = text.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const info = JSON.parse(text);

    // Calculate logo URL if domain is present
    let domain = (info.domain || "").trim().toLowerCase().replace(/^["']|["']$/g, "");
    
    // Strict domain validation
    const isInvalid = domain.includes(" ") || 
                      domain === "unknown" || 
                      domain === "undefined" || 
                      domain === "null" ||
                      !domain.includes(".");
                      
    if (isInvalid) domain = "";
    
    let logo = "";
    if (domain) {
      logo = `https://logo.clearbit.com/${domain}`;
    }

    // Save to CompanyInfo collection for future use
    const newCompanyInfo = await CompanyInfo.create({
      name: normalizedName,
      shortDescription: info.shortDescription || "Unknown",
      fullDescription: info.fullDescription || "Unknown",
      industry: info.industry || "Unknown",
      companyType: info.companyType || "Unknown",
      headquarters: info.headquarters || "Unknown",
      domain: domain,
      logo: logo
    });

    return newCompanyInfo;
  } catch (error) {
    console.error(`[COMPANY_INFO_FAILED] ${normalizedName}:`, error.message);
    return null; // Fallback gracefully
  }
}

module.exports = { getCompanyInfo };
