const FIELD_MAP = [
  {
    profileKey: "personal.fullName",
    patterns: [/\b(full\s*name|name|student\s*name|candidate\s*name|applicant\s*name)\b/i],
  },
  {
    profileKey: "personal.usn",
    patterns: [/\b(usn|university\s*seat\s*number|student\s*id|seat\s*number|roll\s*number|roll\s*no)\b/i],
  },
  {
    profileKey: "personal.gender",
    patterns: [/\b(gender|sex)\b/i],
  },
  {
    profileKey: "personal.mobileNumber",
    patterns: [/\b(mobile|phone|contact\s*number|mobile\s*number|phone\s*number|whatsapp\s*number|whatsapp\s*no|cell|cell\s*number)\b/i],
  },
  {
    profileKey: "education.program",
    patterns: [/\b(program|degree|course)\b/i],
  },
  {
    profileKey: "education.branch",
    patterns: [/\b(branch|department|specialization|stream)\b/i],
  },
  {
    profileKey: "education.tenthPercentage",
    patterns: [/\b(10th|sslc|class\s*10|10th\s*percentage|10th\s*marks)\b/i],
  },
  {
    profileKey: "education.twelfthPercentage",
    patterns: [/\b(12th|puc|class\s*12|12th\s*percentage|diploma|12th\s*marks|diploma\s*percentage)\b/i],
  },
  {
    profileKey: "education.currentCGPA",
    patterns: [/\b(cgpa|current\s*cgpa|aggregate\s*cgpa|cgpa\s*till|cumulative\s*gpa)\b/i],
  },
  {
    profileKey: "contact._defaultEmail",
    patterns: [/\b(email|email\s*id|e-?mail|mail\s*id|email\s*address)\b/i],
    excludePatterns: [/college|institute|official|uni|university/i],
  },
  {
    profileKey: "contact.collegeEmail",
    patterns: [/\b(college\s*email|institute\s*email|college\s*mail|official\s*email|institutional\s*email)\b/i],
  },
  {
    profileKey: "professional.linkedinUrl",
    patterns: [/\b(linkedin|linked\s*in|linkedin\s*profile|linkedin\s*url|linkedin\s*link)\b/i],
  },
  {
    profileKey: "professional.githubUrl",
    patterns: [/\b(github|git\s*hub|github\s*profile|github\s*profile\s*url|github\s*link|github\s*url)\b/i],
  },
];

function resolveProfileValue(profileKey, profile) {
  if (!profile) return null;

  if (profileKey === "contact._defaultEmail") {
    const pref = profile.contact?.defaultEmailPreference || "personal";
    return pref === "college"
      ? profile.contact?.collegeEmail || ""
      : profile.contact?.personalEmail || "";
  }

  const parts = profileKey.split(".");
  let current = profile;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return "";
    }
  }
  return typeof current === "string" ? current : "";
}

function mapFieldsToProfile(formFields, profile) {
  if (!Array.isArray(formFields)) return [];

  return formFields.map((field) => {
    let matchedRule = null;

    // Search rules
    for (const rule of FIELD_MAP) {
      let isMatch = false;

      // Check positive matches
      for (const pattern of rule.patterns) {
        if (pattern.test(field.label)) {
          isMatch = true;
          break;
        }
      }

      // Check exclusions if matched
      if (isMatch && rule.excludePatterns) {
        for (const excludePattern of rule.excludePatterns) {
          if (excludePattern.test(field.label)) {
            isMatch = false;
            break;
          }
        }
      }

      if (isMatch) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      const val = resolveProfileValue(matchedRule.profileKey, profile);
      return {
        fieldId: field.fieldId,
        label: field.label,
        type: field.type,
        options: field.options || [],
        mappedProfileKey: matchedRule.profileKey,
        mappedValue: val || "",
        isMissing: !val,
      };
    }

    // No mapping found
    return {
      fieldId: field.fieldId,
      label: field.label,
      type: field.type,
      options: field.options || [],
      mappedProfileKey: null,
      mappedValue: "",
      isMissing: true,
    };
  });
}

module.exports = {
  FIELD_MAP,
  resolveProfileValue,
  mapFieldsToProfile,
};
