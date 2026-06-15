require('dotenv').config({ path: '../.env' });
const { parseEmailWithLLM } = require('./utils/parseEmailWithLLM');

const email = {
  subject: "Fwd: Ericsson Edge Program",
  sender: "dean.tap@msrit.edu",
  body: `Dear Students,

Greetings!!

Ericsson Edge Program!! Request you to join the webinar to know more about the program and take it forward further.

The session on 11th June from 11 AM to 12 PM. 

Request both 2027 passing out all students of UG & PG of Technical Programs and Faculty Coordinators can join.

Thanks & Regards,
Ram

Sreenivasa Ramanujam K
Dean - Training & Placements,

On Tue, Jun 9, 2026, 4:53 AM, Amita Parihar <> wrote:
Hi Ram,

Thank you for the confirmation, PFB the webinar details.

We would appreciate it if you could share this information with your students and encourage them to participate in the session. Kindly ask them to register in advance using the provided link.

Event Details:
Date: 11th Jun 26
Time: 11 AM – 12 PM
Webinar link: https://events.teams.microsoft.com/event/a5c809f1-e098-46a4-b111-7ce936a0c0ca@92e84ceb-fbfd-47ab-be52-080c6b87953f

Regards,
Amita Parihar
Talent Advisor Partner || Campus Hiring
ERICSSON India Private Limited (EIL)`
};

async function run() {
  console.log(`\n=================== Ericsson Real ===================`);
  const parsed = await parseEmailWithLLM(email.subject, email.sender, email.body);
  console.log(`Opportunity Type: ${parsed.opportunityType}`);
  console.log(`Display Fields:`);
  console.log(JSON.stringify(parsed.displayFields, null, 2));
  console.log(`Link: ${parsed.link}`);
}

run().catch(console.error);
