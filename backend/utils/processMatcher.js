/**
 * Process Disambiguation and Application Matching Engine
 * Decides whether an incoming placement email belongs to an existing Application card
 * (as a timeline event / milestone) or should create a brand new Application card.
 */

const {
  normalizeRole,
  areRolesCompatible,
  isGenesisClassification,
  isFollowupClassification
} = require("./roleMatcher");

/**
 * Finds the best matching existing Application record for an incoming email.
 *
 * @param {Object} params
 * @param {Array<Object>} params.candidates - Existing non-deleted Applications for this user & company
 * @param {Object} params.parsed - LLM/rule parsed email data
 * @param {Object} params.emailMetadata - { messageId, threadId, date, subject, accountEmail }
 * @returns {{ match: Object|null, reason: string }}
 */
function findMatchingApplication({ candidates = [], parsed = {}, emailMetadata = {} }) {
  if (!candidates || candidates.length === 0) {
    return { match: null, reason: "No existing applications for this company" };
  }

  const incomingDate = emailMetadata.date ? new Date(emailMetadata.date) : new Date();
  const incomingClassification = parsed.classification || "";
  const incomingOppType = parsed.opportunityType || (parsed.emailType === "event" ? "HACKATHON" : "JOB_APPLICATION");
  const incomingRole = parsed.role || parsed.jobRole || "";
  const incomingThreadId = emailMetadata.threadId || "";

  // ── RULE 1: Gmail Thread ID Exact Match (Highest Confidence) ────────────────
  if (incomingThreadId) {
    for (const app of candidates) {
      if (app.threadId === incomingThreadId) {
        return { match: app, reason: `Gmail threadId exact match (${incomingThreadId})` };
      }
      if (Array.isArray(app.events)) {
        const threadEvent = app.events.find(e => e.threadId === incomingThreadId);
        if (threadEvent) {
          return { match: app, reason: `Timeline event threadId match (${incomingThreadId})` };
        }
      }
    }
  }

  // ── RULE 2: Opportunity Type Filter ─────────────────────────────────────────
  // Keep Hackathons/Events separate from Full-Time/Internship Job Applications
  const typeCompatibleCandidates = candidates.filter(app => {
    const appOppType = app.opportunityType || (app.emailType === "event" ? "HACKATHON" : "JOB_APPLICATION");
    if (incomingOppType === "HACKATHON" || incomingOppType === "WEBINAR") {
      return appOppType === incomingOppType;
    }
    // If incoming is a job, only match job applications
    return appOppType === "JOB_APPLICATION" || app.emailType === "job";
  });

  if (typeCompatibleCandidates.length === 0) {
    return {
      match: null,
      reason: `No candidates match opportunityType "${incomingOppType}"`
    };
  }

  // ── RULE 3: Score and Disqualify Candidates ─────────────────────────────────
  const scoredCandidates = [];

  for (const app of typeCompatibleCandidates) {
    const appRole = app.role || app.jobRole || "";
    const roleComp = areRolesCompatible(appRole, incomingRole);

    // 1. Role Incompatibility Disqualification
    if (roleComp.isConflicting) {
      console.log(`[PROCESS_MATCHER] Disqualifying app ${app._id} ("${appRole}"): Conflicting role with incoming "${incomingRole}"`);
      continue;
    }

    const appLatestDate = app.date ? new Date(app.date) : new Date(0);
    const msDiff = incomingDate.getTime() - appLatestDate.getTime();
    const daysDiff = Math.max(0, msDiff / (1000 * 60 * 60 * 24));

    const isTerminalStage = ["rejected", "rejected_after_oa", "rejected_after_interview", "offered"].includes(app.stage);
    const isGenesis = isGenesisClassification(incomingClassification);
    const isFollowup = isFollowupClassification(incomingClassification);

    // 2. Genesis Email on Terminal Application -> Disqualify (New Drive)
    if (isGenesis && isTerminalStage) {
      console.log(`[PROCESS_MATCHER] Disqualifying app ${app._id}: Terminal stage "${app.stage}" cannot accept new registration`);
      continue;
    }

    // 3. Stale Drive Window -> Disqualify (New Recruitment Cycle)
    // If a new registration/opening arrives > 75 days after the previous drive started
    if (isGenesis && daysDiff > 75) {
      console.log(`[PROCESS_MATCHER] Disqualifying app ${app._id}: Drive is stale (${Math.round(daysDiff)} days old)`);
      continue;
    }

    // 4. Distinct Registration Links in Genesis Email
    // If both have explicit registration links that differ, and emails are spaced apart by > 14 days
    if (
      isGenesis &&
      app.link &&
      parsed.link &&
      app.link.trim() !== parsed.link.trim() &&
      daysDiff > 14
    ) {
      console.log(`[PROCESS_MATCHER] Disqualifying app ${app._id}: Different registration link detected for new drive`);
      continue;
    }

    // Candidate is eligible! Compute affinity score.
    let score = 100;

    // A. Role Affinity
    if (roleComp.reason.includes("Exact role match")) {
      score += 50;
    } else if (roleComp.reason.includes("Matching role family")) {
      score += 35;
    } else if (roleComp.reason.includes("Substring") || roleComp.reason.includes("similarity")) {
      score += 25;
    }

    // B. Follow-up Email affinity to active processes
    if (isFollowup) {
      score += 40;
      if (!isTerminalStage) {
        score += 30; // Strongly prefer ongoing active processes
      }
      // Follow-ups within 1 to 45 days after application are normal pipeline steps
      if (daysDiff <= 45) {
        score += 20;
      }
    }

    // C. Subject keyword match
    const normSubj = (emailMetadata.subject || "").toLowerCase();
    const normAppRole = (appRole || "").toLowerCase();
    if (normAppRole && normAppRole !== "unknown role" && normSubj.includes(normAppRole)) {
      score += 30;
    }

    // D. Recency recency boost (prefer more recent drive if ambiguity exists)
    score -= Math.min(daysDiff, 50);

    scoredCandidates.push({ app, score, reason: roleComp.reason });
  }

  if (scoredCandidates.length === 0) {
    return {
      match: null,
      reason: `All existing candidates were disqualified due to conflicting roles, terminal stages, or stale cycles`
    };
  }

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);
  const bestMatch = scoredCandidates[0];

  return {
    match: bestMatch.app,
    score: bestMatch.score,
    reason: `Matched candidate with score ${bestMatch.score} (${bestMatch.reason})`
  };
}

module.exports = {
  findMatchingApplication
};
