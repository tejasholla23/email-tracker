const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    company: { type: String, required: true },
    emailType: { type: String, enum: ["job", "event", "nonRecruitment"], default: "job" },
    subtitle: { type: String, default: "" },
    // Legacy: old string-array field display list. Kept for backward compat with pre-redesign records.
    fieldsToDisplay: { type: [String], default: [] },
    // New: flexible [{label, value}] display fields returned by LLM.
    // Frontend checks this first; falls back to fieldsToDisplay for legacy records.
    displayFields: {
      type: [{ label: { type: String }, value: { type: String } }],
      default: [],
    },
    // Skills extracted from email body by LLM (e.g. ["Python", "Machine Learning"])
    skills: { type: [String], default: [] },
    companyKey: { type: String, default: "" }, // normalized key for company-level dedup
    role: { type: String, default: "Unknown Role" }, // Derived from displayFields — kept for search indexing and backward compatibility
    type: { type: String },
    deadline: { type: String }, // Derived from displayFields
    deadlineISO: { type: String }, // Parsed deadline ISO
    deadlineText: { type: String }, // Derived from displayFields
    programRoles: { type: String },
    programDuration: { type: String },
    programStipend: { type: String },
    testDate: { type: Date },
    link: { type: String },
    links: { type: [String], default: [] },
    isFormLink: { type: Boolean, default: false },
    source: { type: String },
    email: { type: String },
    date: { type: Date },
    status: {
      type: String,
      default: "new",
    },
    isDeleted: { type: Boolean, default: false },
    rawText: { type: String },
    accountEmail: { type: String, default: "" }, // Receiving inbox email (primary or linked)
    note: { type: String, default: "" },
    messageId: { type: String, sparse: true },
    classification: { type: String },
    confidenceScore: { type: Number },
    parserVersion: { type: String, default: "v2" },
    jobRole: { type: String },
    title: { type: String },
    processId: { type: String },
    processName: { type: String },
    eventDate: { type: Date },
    eventTime: { type: String },
    reportingTime: { type: String },
    venue: { type: String },
    durationText: { type: String },
    salaryText: { type: String },
    parseMeta: { type: mongoose.Schema.Types.Mixed },
    manualOverrides: { type: [String], default: [] },
    
    // Calendar Integration Fields
    calendarEventId: { type: String, default: null },
    calendarEventFingerprint: { type: String, default: null },
    calendarPayloadHash: { type: String, default: null },
    calendarSyncVersion: { type: Number, default: 0 },
    needsCalendarSync: { type: Boolean, default: false },
    calendarLastSyncedAt: { type: Date, default: null },
    calendarSyncError: { type: String, default: null },
    calendarRetryCount: { type: Number, default: 0 },

    // Pinning
    isPinned: { type: Boolean, default: false },
    pinnedAt: { type: Date, default: null },

    // Gmail Attachment Metadata & Shortlist Status (Phase 1 & Phase 2)
    attachments: {
      type: [
        {
          messageId: { type: String, required: true },
          attachmentId: { type: String, required: true },
          filename: { type: String, default: "" },
          mimeType: { type: String, default: "" },
          size: { type: Number, default: 0 },
          isInline: { type: Boolean, default: false },
          // Phase 2: Shortlist Detection State
          shortlistStatus: {
            type: String,
            enum: ["unprocessed", "matched", "no_match", "skipped", "error"],
            default: "unprocessed",
          },
          shortlistDetails: {
            matchedIdentifierType: { type: String, default: null }, // 'usn' | 'college_email' | 'personal_email' | 'mobile' | 'name'
            sheetName: { type: String, default: null },
            processedAt: { type: Date, default: null },
          },
        },
      ],
      default: [],
    },

    // Phase 2: Application-level derived shortlist summary (for fast querying & UI badges)
    isShortlisted: { type: Boolean, default: false },
    shortlistSummary: {
      matchedAttachmentId: { type: String, default: null },
      matchedFilename: { type: String, default: null },
      matchedMessageId: { type: String, default: null },
      matchedIdentifierType: { type: String, default: null },
      detectedAt: { type: Date, default: null },
    },

    events: {
      type: [
        {
          messageId: String,
          accountEmail: String,
          date: Date,
          classification: String,
          title: String,
          subject: String,
          status: String,
          link: String,
          summary: String,
        },
      ],
      default: [],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account"
    },
  },
  { timestamps: true }
);

// Unique messageId per user index to prevent duplicate imports for the same user
applicationSchema.index({ userId: 1, messageId: 1 }, { unique: true, sparse: true });

// Company-level identity index: one Application per normalized company (one hiring process)
applicationSchema.index({ userId: 1, companyKey: 1, isDeleted: 1 });

// Compound index for primary dashboard query: Application.find({ isDeleted: false }).sort({ date: -1 })
applicationSchema.index({ userId: 1, isDeleted: 1, date: -1 });

module.exports = mongoose.model("Application", applicationSchema);
