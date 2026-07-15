const mongoose = require("mongoose");

const autofillProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
    },
    personal: {
      fullName: { type: String, default: "" },
      usn: { type: String, default: "" },
      gender: { type: String, default: "" },
      mobileNumber: { type: String, default: "" },
    },
    education: {
      program: { type: String, default: "" },
      branch: { type: String, default: "" },
      tenthPercentage: { type: String, default: "" },
      twelfthPercentage: { type: String, default: "" },
      currentCGPA: { type: String, default: "" },
    },
    contact: {
      personalEmail: { type: String, default: "" },
      collegeEmail: { type: String, default: "" },
      defaultEmailPreference: {
        type: String,
        enum: ["personal", "college"],
        default: "personal",
      },
    },
    professional: {
      linkedinUrl: { type: String, default: "" },
      githubUrl: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AutofillProfile", autofillProfileSchema);
