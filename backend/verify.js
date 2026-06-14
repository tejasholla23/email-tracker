require('dotenv').config({ path: '../.env' });
const { parseEmailWithLLM } = require('./utils/parseEmailWithLLM');

const emails = [
  {
    name: "ABB",
    subject: "ABB Registration",
    body: "Role: Software Engineer\nStipend: INR 30K for Bachelor's students\nDuration: 3 Months\nLocation: Bangalore\nJoining: July onwards",
    sender: "recruitment@abb.com"
  },
  {
    name: "WorkIndia",
    subject: "WorkIndia Registration",
    body: "Stipend: 40k per month\nCTC: 16 LPA\nDeadline: 3 PM, today\nRole: Software Development Engineer",
    sender: "careers@workindia.in"
  },
  {
    name: "Amazon",
    subject: "Amazon Registration",
    body: "Duration: 4 weekends in July 2026\nDeadline: to Register",
    sender: "recruitment@amazon.com"
  },
  {
    name: "Graphene",
    subject: "Graphene Registration",
    body: "Stipend: 15K per month\nCTC: 8 LPA\nDeadline: 9 PM, today\nRole: Full Stack Development",
    sender: "hr@graphene.com"
  },
  {
    name: "HirePro",
    subject: "HirePro HackVega 2.0",
    body: "Event Name: HackVega 2.0\nOrganizer: HirePro\nRegistration Deadline: 15 June 2026\nPrize: ₹3.5 lakh\nEligibility: 2026–2029 engineering students\nMode: Online\nTimeline: Round 1: 20 June",
    sender: "events@hirepro.com"
  },
  {
    name: "Tata InnoVent",
    subject: "Tata Technologies InnoVent-27",
    body: "Event Name: Tata Technologies InnoVent-27\nOrganizer: Tata Technologies\nRegistration Window: 4 June – 5 July 2026\nPrize: ₹4.5 lakh\nEligibility: 3rd and 4th year engineering students\nTeam Size: 1–5",
    sender: "innovent@tatatechnologies.com"
  },
  {
    name: "Ericsson",
    subject: "Ericsson Edge Program Webinar",
    body: "Event Name: Ericsson Edge Program\nOrganizer: Ericsson\nDate: 11 June 2026\nTime: 11 AM – 12 PM\nEligibility: 2027 UG & PG students",
    sender: "webinars@ericsson.com"
  }
];

async function run() {
  for (const email of emails) {
    console.log(`\n=================== ${email.name} ===================`);
    const parsed = await parseEmailWithLLM(email.subject, email.sender, email.body);
    console.log(`Opportunity Type: ${parsed.opportunityType || parsed.emailType}`);
    console.log(`Company: ${parsed.company}`);
    console.log(`Display Fields:`);
    console.log(JSON.stringify(parsed.displayFields, null, 2));
  }
}

run().catch(console.error);
