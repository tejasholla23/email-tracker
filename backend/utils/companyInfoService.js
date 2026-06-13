const CompanyInfo = require("../models/CompanyInfo");

/**
 * Get company information (domain and logo only).
 * Checks CompanyInfo collection for cached info first.
 * If not found, generates a domain/logo deterministically and saves it.
 * 
 * @param {string} companyName - Name of the company to look up
 * @returns {Promise<object|null>} - Company info object or null
 */
async function getCompanyInfo(companyName) {
  if (!companyName) return null;

  const normalizedName = companyName.trim();

  try {
    const cachedInfo = await CompanyInfo.findOne({ name: normalizedName });

    if (cachedInfo) {
      return cachedInfo;
    }

    // Generate domain/logo deterministically
    const domain = `${normalizedName.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    const logo = `https://logo.clearbit.com/${domain}`;

    const newCompanyInfo = await CompanyInfo.create({
      name: normalizedName,
      domain: domain,
      logo: logo
    });

    return newCompanyInfo;
  } catch (error) {
    console.error(`[COMPANY_INFO_FAILED] ${normalizedName}:`, error.message);
    return null;
  }
}

module.exports = { getCompanyInfo };
