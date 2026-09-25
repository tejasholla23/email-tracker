/**
 * Role Normalization and Compatibility Engine
 * Disambiguates whether two job roles represent the same recruitment process or distinct roles.
 */

// Common role family taxonomies for campus placements
const ROLE_FAMILIES = {
  SOFTWARE_ENGINEERING: [
    "software engineer",
    "software developer",
    "sde",
    "sde 1",
    "sde i",
    "sde 2",
    "sde ii",
    "swe",
    "backend engineer",
    "backend developer",
    "frontend engineer",
    "frontend developer",
    "full stack engineer",
    "full stack developer",
    "fullstack developer",
    "web developer",
    "application developer",
    "app developer",
    "mobile developer",
    "android developer",
    "ios developer",
    "graduate engineer trainee",
    "get",
    "associate software engineer",
    "ase",
    "member technical staff",
    "mts",
    "programmer",
    "systems engineer"
  ],
  DATA_AND_AI: [
    "data analyst",
    "data analytics",
    "business analyst",
    "data scientist",
    "data science",
    "machine learning engineer",
    "ml engineer",
    "ai engineer",
    "artificial intelligence engineer",
    "bi analyst",
    "bi developer",
    "business intelligence",
    "data engineer",
    "big data engineer",
    "analytics consultant"
  ],
  PRODUCT_AND_MANAGEMENT: [
    "product manager",
    "associate product manager",
    "apm",
    "program manager",
    "project manager",
    "product analyst",
    "scrum master"
  ],
  QA_AND_TESTING: [
    "qa engineer",
    "quality assurance",
    "test engineer",
    "sdet",
    "software development engineer in test",
    "automation test engineer",
    "manual tester"
  ],
  CYBERSECURITY_AND_INFRA: [
    "cyber security",
    "cybersecurity",
    "security engineer",
    "information security",
    "infosec",
    "devops engineer",
    "devops",
    "sre",
    "site reliability engineer",
    "cloud engineer",
    "network engineer",
    "systems administrator"
  ],
  CORE_ENGINEERING: [
    "vlsi engineer",
    "embedded engineer",
    "hardware engineer",
    "firmware engineer",
    "pcb designer",
    "electrical engineer",
    "mechanical engineer",
    "civil engineer",
    "design engineer"
  ],
  CONSULTING_AND_OPERATIONS: [
    "consultant",
    "associate consultant",
    "management trainee",
    "operations associate",
    "business operations",
    "operations executive",
    "financial analyst",
    "sales engineer",
    "tech support",
    "customer support"
  ]
};

/**
 * Normalizes a raw role title string into a clean lowercase token sequence.
 */
function normalizeRole(role = "") {
  if (!role || typeof role !== "string") return "";
  let clean = role.toLowerCase().trim();

  // Strip prefixes & noise
  clean = clean.replace(/^(role|job role|position|designation|profile|job title)\s*[:\-]\s*/i, "");
  // Replace symbols with space
  clean = clean.replace(/[/\\_\-+,|&()]/g, " ");
  // Collapse whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

/**
 * Maps a normalized role to a high-level role family (or null if unclassified).
 */
function getRoleFamily(roleStr = "") {
  const norm = normalizeRole(roleStr);
  if (!norm || norm === "unknown role" || norm === "event" || norm === "pending analysis") {
    return null;
  }

  for (const [family, keywords] of Object.entries(ROLE_FAMILIES)) {
    for (const kw of keywords) {
      // Exact match or whole-word match
      const regex = new RegExp(`\\b${kw.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (regex.test(norm)) {
        return family;
      }
    }
  }

  return null;
}

/**
 * Computes Jaccard word-overlap token similarity between two strings.
 */
function tokenSimilarity(strA = "", strB = "") {
  const tokensA = new Set(strA.split(/\s+/).filter(w => w.length > 2));
  const tokensB = new Set(strB.split(/\s+/).filter(w => w.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

// Exact canonical synonym equivalence groups
const CANONICAL_SYNONYMS = [
  // SDE synonyms
  new Set(["software engineer", "software developer", "sde", "sde 1", "sde i", "swe", "software development engineer", "application developer"]),
  // Data Analyst synonyms
  new Set(["data analyst", "data analytics", "junior data analyst"]),
  // Data Science synonyms
  new Set(["data scientist", "data science"]),
  // Business Analyst synonyms
  new Set(["business analyst", "ba"]),
  // Product Manager synonyms
  new Set(["product manager", "pm", "associate product manager", "apm"]),
  // Quality Assurance
  new Set(["qa engineer", "quality assurance", "test engineer", "sdet"])
];

function areCanonicalSynonyms(normA, normB) {
  for (const group of CANONICAL_SYNONYMS) {
    if (group.has(normA) && group.has(normB)) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether two role titles are compatible (referring to the same position)
 * or conflicting (referring to distinctly different positions).
 *
 * @param {string} roleA - First role (e.g. from existing application)
 * @param {string} roleB - Second role (e.g. from incoming email)
 * @returns {{ compatible: boolean, isConflicting: boolean, isExactSynonym: boolean, reason: string }}
 */
function areRolesCompatible(roleA = "", roleB = "") {
  const normA = normalizeRole(roleA);
  const normB = normalizeRole(roleB);

  // If either role is unknown/empty, it cannot conflict (neutral)
  const isNeutralA = !normA || normA === "unknown role" || normA === "event" || normA === "pending analysis";
  const isNeutralB = !normB || normB === "unknown role" || normB === "event" || normB === "pending analysis";

  if (isNeutralA || isNeutralB) {
    return { compatible: true, isConflicting: false, isExactSynonym: false, reason: "One or both roles are unspecified/neutral" };
  }

  // Exact match
  if (normA === normB) {
    return { compatible: true, isConflicting: false, isExactSynonym: true, reason: "Exact role match" };
  }

  // Canonical synonyms (e.g. SDE === Software Engineer)
  if (areCanonicalSynonyms(normA, normB)) {
    return { compatible: true, isConflicting: false, isExactSynonym: true, reason: "Canonical role synonym match" };
  }

  // Check role family classification
  const familyA = getRoleFamily(normA);
  const familyB = getRoleFamily(normB);

  // If different families (e.g. SDE vs Data Analyst) -> 100% conflicting
  if (familyA && familyB && familyA !== familyB) {
    return { compatible: false, isConflicting: true, isExactSynonym: false, reason: `Conflicting role families: ${familyA} vs ${familyB}` };
  }

  // Distinct titles within the same family or across titles:
  // e.g. "Software Engineer" vs "Associate System Engineer" or "Frontend" vs "Backend"
  // If token similarity is below 0.65 and neither is a direct substring of the other
  const sim = tokenSimilarity(normA, normB);
  const isSubstring = (normA.length > 5 && normB.length > 5) && (normA.includes(normB) || normB.includes(normA));

  if (sim >= 0.65 || isSubstring) {
    return { compatible: true, isConflicting: false, isExactSynonym: false, reason: `High similarity (${sim.toFixed(2)}) or substring match` };
  }

  // Two specific, distinctly different roles (e.g. Software Engineer vs Associate System Engineer)
  return {
    compatible: false,
    isConflicting: true,
    isExactSynonym: false,
    reason: `Distinct role titles: "${roleA}" vs "${roleB}"`
  };
}

/**
 * Classification category checks
 */
function isGenesisClassification(classification = "") {
  return [
    "New Hiring Opportunity",
    "Registration Link",
    "Internship Opportunity"
  ].includes(classification);
}

function isFollowupClassification(classification = "") {
  return [
    "Assessment Announcement",
    "Interview Schedule",
    "Interview Result",
    "Venue Update",
    "Deadline Reminder",
    "Application Reminder",
    "PPT Announcement"
  ].includes(classification);
}

module.exports = {
  normalizeRole,
  getRoleFamily,
  tokenSimilarity,
  areRolesCompatible,
  isGenesisClassification,
  isFollowupClassification,
  ROLE_FAMILIES
};
