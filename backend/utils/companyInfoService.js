const CompanyInfo = require("../models/CompanyInfo");

/**
 * Get company information (domain and logo only).
 * Checks CompanyInfo collection for cached info first.
 * If not found, generates a domain/logo deterministically and saves it.
 * 
 * @param {string} companyName - Name of the company to look up
 * @param {string} parsedDomain - Domain hint from LLM parser
 * @returns {Promise<object|null>} - Company info object or null
 */
async function getCompanyInfo(companyName, parsedDomain = "") {
  if (!companyName) return null;

  const normalizedName = companyName.trim();

  try {
    const cachedInfo = await CompanyInfo.findOne({ name: normalizedName });

    if (cachedInfo) {
      return cachedInfo;
    }

    // Resolve domain: use parsedDomain from LLM if available, otherwise fall back to deterministic guess
    const lowerName = normalizedName.toLowerCase();
    let domain = parsedDomain ? parsedDomain.replace(/[^a-z0-9.-]/gi, "").toLowerCase() : "";

    if (!domain) {
      domain = `${lowerName.replace(/[^a-z0-9]/g, "")}.com`;
      
      if (lowerName === "eightfold" || lowerName === "eightfold ai") {
        domain = "eightfold.ai";
      } else if (lowerName === "atos" || lowerName === "atos ai" || lowerName === "atos syntel" || lowerName === "atos evidian") {
        domain = "atos.net";
      }
    }

    const clearbitUrl = `https://logo.clearbit.com/${domain}`;
    
    let hash = 0;
    const str = normalizedName || "U";
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    const fallbackColor = "00000".substring(0, 6 - c.length) + c;
    const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(str)}&background=${fallbackColor}&color=fff&size=128&bold=true`;

    let finalLogo = uiAvatarUrl;

    try {
      // 1. Attempt Clearbit
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const clearbitRes = await fetch(clearbitUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      
      if (clearbitRes.ok) {
        finalLogo = clearbitUrl;
      } else {
        throw new Error('Clearbit failed or 404');
      }
    } catch (clearbitErr) {
      // 2. Fall back to UI Avatars (initials on a colored background) to prevent duplicate generic globe icons
      finalLogo = uiAvatarUrl;
    }

    const newCompanyInfo = await CompanyInfo.create({
      name: normalizedName,
      domain: domain,
      logo: finalLogo
    });

    return newCompanyInfo;
  } catch (error) {
    console.error(`[COMPANY_INFO_FAILED] ${normalizedName}:`, error.message);
    return null;
  }
}

module.exports = { getCompanyInfo };
