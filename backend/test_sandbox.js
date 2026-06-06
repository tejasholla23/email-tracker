const { parseEmailWithLLM } = require("./utils/parseEmailWithLLM");

async function run() {
  const cases = [
    { subject: "Mandatory Aptitude Test for Students", body: "" },
    { subject: "Invitation for Grand Finale", body: "" },
    { subject: "Eligibility Criteria for Software Engineer Program", body: "" },
    { subject: "Design for New Process", body: "" },
    { subject: "SEP Roadshow Registration for students", body: "" },
  ];

  for (let i = 0; i < cases.length; i++) {
    const res = await parseEmailWithLLM(cases[i].subject, "test@msrit.edu", cases[i].body, new Date());
    console.log(`\n--- Case ${i + 1} ---`);
    console.log(`Subject: ${cases[i].subject}`);
    console.log(`Company: ${res.company} (Meta: ${JSON.stringify(res.parseMeta)})`);
  }
}

run();
