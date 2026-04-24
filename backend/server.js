const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const Application = require("./models/Application");
const applicationRoutes = require("./routes/applicationRoutes");

dotenv.config();

const app = express();
const PORT = 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/email-tracker";

app.use(cors());
app.use(express.json());
app.use("/applications", applicationRoutes);

const seedApplicationsIfEmpty = async () => {
  const count = await Application.countDocuments();
  if (count > 0) {
    return;
  }

  const sampleApplications = [
    {
      company: "Google",
      role: "Software Engineering Intern",
      type: "internship",
      deadline: new Date("2026-06-15"),
      link: "https://careers.google.com",
      source: "LinkedIn",
      status: "pending",
      rawText: "Google SWE Internship application for Summer 2026.",
    },
    {
      company: "Capstone",
      role: "Backend Developer",
      type: "fulltime",
      deadline: new Date("2026-05-20"),
      link: "https://capstonecareers.example/jobs/backend-developer",
      source: "Company Website",
      status: "applied",
      rawText: "Capstone full-time backend role focusing on APIs.",
    },
    {
      company: "JPMorgan",
      role: "Online Assessment",
      type: "test",
      testDate: new Date("2026-05-02T10:00:00Z"),
      link: "https://careers.jpmorgan.com",
      source: "Referral",
      status: "pending",
      rawText: "JPMorgan coding assessment invitation.",
    },
  ];

  await Application.insertMany(sampleApplications);
  console.log("Inserted sample applications");
};

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");
    await seedApplicationsIfEmpty();
  })
  .catch((error) => console.error("MongoDB connection error:", error.message));

app.get("/", (req, res) => {
  res.send("API running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
