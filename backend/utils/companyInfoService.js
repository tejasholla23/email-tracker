const CompanyInfo = require("../models/CompanyInfo");

const KNOWN_COMPANY_DOMAINS = {
  "te connectivity": "te.com",
  "te": "te.com",
  "mindsprint": "mindsprint.ai",
  "eightfold": "eightfold.ai",
  "eightfold ai": "eightfold.ai",
  "atos": "atos.net",
  "atos ai": "atos.net",
  "atos syntel": "atos.net",
  "atos evidian": "atos.net",
  "prime numbers": "primenumbers.io",
  "cred": "cred.club",
  "cynlr": "cynlr.com",
  "lam research": "lamresearch.com",
  "wipro": "wipro.com",
  "infosys": "infosys.com",
  "tcs": "tcs.com",
  "tata consultancy services": "tcs.com",
  "accenture": "accenture.com",
  "amazon": "amazon.com",
  "google": "google.com",
  "microsoft": "microsoft.com",
  "adobe": "adobe.com",
  "cisco": "cisco.com",
  "oracle": "oracle.com",
  "salesforce": "salesforce.com",
  "intel": "intel.com",
  "qualcomm": "qualcomm.com",
  "nvidia": "nvidia.com",
  "ibm": "ibm.com",
  "dell": "dell.com",
  "hp": "hp.com",
  "sap": "sap.com",
  "capgemini": "capgemini.com",
  "cognizant": "cognizant.com",
};

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

    // Resolve domain: check known mapping first, then parsedDomain, then fallback
    const lowerName = normalizedName.toLowerCase();
    let domain = KNOWN_COMPANY_DOMAINS[lowerName] || "";

    if (!domain && parsedDomain) {
      domain = parsedDomain.replace(/[^a-z0-9.-]/gi, "").toLowerCase();
    }

    if (!domain) {
      domain = `${lowerName.replace(/[^a-z0-9]/g, "")}.com`;
    }

    let hash = 0;
    const str = normalizedName || "U";
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    const fallbackColor = "00000".substring(0, 6 - c.length) + c;
    const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(str)}&background=${fallbackColor}&color=fff&size=128&bold=true`;

    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=https://${domain}&sz=128`;

    const finalLogo = domain ? googleFaviconUrl : uiAvatarUrl;

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
