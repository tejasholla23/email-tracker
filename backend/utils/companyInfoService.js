const { GoogleGenerativeAI } = require("@google/generative-ai");
const CompanyInfo = require("../models/CompanyInfo");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    // 1. Check Cache (Dedicated CompanyInfo collection)
    const cachedInfo = await CompanyInfo.findOne({ name: normalizedName });

    if (cachedInfo) {
      console.log(`[COMPANY_INFO_CACHE_HIT] ${normalizedName}`);
      return cachedInfo;
    }

    // 2. Generate with LLM
    console.log(`[COMPANY_INFO_FETCHED] ${normalizedName}`);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
        "headquarters": "City, Country"
      }
      
      Rule: Return ONLY the JSON. No markdown fences.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Clean JSON if it contains markdown fences
    if (text.startsWith("```json")) {
      text = text.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (text.startsWith("```")) {
      text = text.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const info = JSON.parse(text);

    // Save to CompanyInfo collection for future use
    const newCompanyInfo = await CompanyInfo.create({
      name: normalizedName,
      shortDescription: info.shortDescription || "Unknown",
      fullDescription: info.fullDescription || "Unknown",
      industry: info.industry || "Unknown",
      companyType: info.companyType || "Unknown",
      headquarters: info.headquarters || "Unknown",
    });

    return newCompanyInfo;
  } catch (error) {
    console.error(`[COMPANY_INFO_ERROR] ${normalizedName}:`, error.message);
    return null; // Fallback gracefully
  }
}

module.exports = { getCompanyInfo };
