const { parseEmailWithLLM } = require('./utils/parseEmailWithLLM');

// The validation logic from parseEmailWithLLM.js
function validateGeminiResponse(raw) {
  const VALID_EMAIL_TYPES = ["job", "event", "nonRecruitment"];
  const VALID_CLASSIFICATIONS = [
    "New Hiring Opportunity",
    "Internship Opportunity",
    "Registration Link",
    "Application Reminder",
    "PPT Announcement",
    "Assessment Announcement",
    "Interview Schedule",
    "Interview Result",
    "Venue Update",
    "Deadline Reminder",
    "Generic Placement Notice",
    "Hackathon / Event Invitation",
    "Workshop / Webinar",
    "Expert Talk Series",
    "Scholarship",
    "Non-Recruitment Email",
  ];

  function cleanProgramValue(raw = "") {
    if (typeof raw !== "string") return "";
    return raw.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  if (!raw || typeof raw !== "object") return null;

  const emailType = VALID_EMAIL_TYPES.includes(raw.emailType) ? raw.emailType : null;
  if (!emailType) return null;

  const classification = VALID_CLASSIFICATIONS.includes(raw.classification) ? raw.classification : null;

  const sanitizeTextField = (v, maxLen = 200) => {
    if (!v || typeof v !== "string") return "";
    return cleanProgramValue(v.substring(0, maxLen));
  };
  const company  = sanitizeTextField(raw.company,  100);
  const subtitle = sanitizeTextField(raw.subtitle, 160);

  let displayFields = [];
  if (Array.isArray(raw.displayFields)) {
    displayFields = raw.displayFields
      .filter((f) => f && typeof f === "object"
                  && typeof f.label === "string" && f.label.trim()
                  && typeof f.value === "string" && f.value.trim())
      .map((f) => ({
        label: cleanProgramValue(f.label.substring(0, 60)),
        value: cleanProgramValue(f.value.substring(0, 200)),
      }))
      .filter((f) => f.label && f.value)  // re-filter after cleaning
      .slice(0, 5);                        // cap at 5
  }

  const validStatuses = ["applied", "interview", "offer", "rejected", "new"];
  const status = validStatuses.includes(raw.status) ? raw.status : null;

  const validTypes = ["internship", "full-time", "event", "test", "unknown"];
  const type = validTypes.includes(raw.type) ? raw.type : null;

  return {
    emailType,
    classification,
    company,
    subtitle,
    displayFields,
    status,
    type,
    link: typeof raw.link === "string" && raw.link.startsWith("http") ? raw.link : "",
  };
}

const mockResponse = {
  emailType: "job",
  classification: "Internship Opportunity",
  company: "ABB",
  subtitle: "IS Team Internship",
  type: "internship",
  status: "new",
  link: "",
  displayFields: [
    { label: "Stipend", value: "INR 30K for Bachelor's students (BE/BTech)" },
    { label: "Location", value: "Bangalore" },
    { label: "Duration", value: "3 Months" },
    { label: "Joining", value: "July onwards" }
  ]
};

console.log("RAW_DISPLAY_FIELDS:", mockResponse.displayFields);
const validated = validateGeminiResponse(mockResponse);
console.log("VALIDATED_DISPLAY_FIELDS:", validated.displayFields);
