require('dotenv').config({ path: '../.env' });
const { parseEmailWithLLM } = require('./utils/parseEmailWithLLM');

const emails = [
  {
    name: "HirePro Real Email",
    subject: "Help your students shine bright at HackVega 2.0 | Potential internship opportunities",
    body: `Dear TPO,

After a successful first edition that saw 32,000+ registrations from across the country, with winners recognized at Momentum’25, we are excited to invite your institution to participate in HackVega 2.0. 

This nationwide hackathon is designed to find the brightest star of tech brilliance. It brings together engineering students graduating in 2026, 2027, 2028, or 2029 for a multi-round challenge built around real-world industry expectations.

Here is what participants stand to gain:

Up to ₹3.5 lakh in total cash prizes

Felicitation at Momentum’26 in Bangalore in front of 500+ leaders from industry and academia

Potential internship opportunities through MyCareernet

Visibility among top featured employers

Note: Request you to please Share This Registration Link with all eligible candidates.

https://a.hirepro.in/1fDR7Zqpt

Competition timeline:

Registration closes: 15 June 2026

Round 1: Aptitude and logical assessment | 20 June 2026

Round 2: Technical coding | 21 June 2026

Round 3: Advanced live coding | 27 June 2026

Mode: Online, pan India

HackVega 2.0 is also an opportunity for the three top-performing colleges to be recognized at Momentum’26 for participation, consistency, and performance throughout the competition.

Please share this with eligible students and encourage them to take part in an opportunity that puts both student talent and your institution in the spotlight.

Warm Regards,
Team HirePro`,
    sender: "placement@msrit.edu"
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
