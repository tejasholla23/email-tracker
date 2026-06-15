require('dotenv').config({ path: '../.env' });
const { parseEmailWithLLM } = require('./utils/parseEmailWithLLM');

const email = {
  subject: "Cisco - Inviting Application for Code with Cisco",
  sender: "placement@msrit.edu",
  body: `From: @cisco.com>

Subject: Cisco - Inviting Application for Code with Cisco

Interested & eligible students register in the below link before 3PM, today

https://forms.gle/C3ZbMdTJQKeprGKo8`
};

async function run() {
  const parsed = await parseEmailWithLLM(email.subject, email.sender, email.body);
  console.log("Classification:", parsed.classification);
  console.log("Status:", parsed.status);
  console.log("Display Fields:", parsed.displayFields);
  console.log("Link:", parsed.link);
  console.log("Is Form Link:", parsed.isFormLink);
}

run().catch(console.error);
