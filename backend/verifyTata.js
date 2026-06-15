require('dotenv').config({ path: '../.env' });
const { parseEmailWithLLM } = require('./utils/parseEmailWithLLM');

const email = {
  subject: "Tata Technologies InnoVent-27 | Registrations Now Open – Submit Projects Now",
  sender: "placement@msrit.edu",
  body: `Dear Faculty Members, 

Greetings from Tata Technologies! 

Following the successful launch of Tata Technologies InnoVent-27, we are pleased to inform you that the registration and project submission window is now officially open.

We invite your institution to actively encourage participation from your 3rd and 4th year engineering students in this prestigious, innovation-driven national hackathon.

Registration & Project Submission:
Students can register and submit their project ideas through the official platform: Tata Technologies InnoVent-27
The portal provides complete information, including:
Hackathon themes and sub-categories
Submission guidelines
Rules & regulations
Evaluation process
 
Important Timeline:
Registration & Submission Window: 4th June 2026 – 5th July 2026
 
Benefits for Students and Institution: 
Cash prizes up to ₹ 4,50,000 (1st: ₹ 3,00,000 | 2nd: ₹ 1,00,000 | 3rd: ₹ 50,000).  
Job opportunities at Tata Technologies for top-performing participants. 
One-year full access to the iGET IT – Tata Technologies learning platform, including over 1,000+ courses.
CLAD  (Certified LabVIEW Associate Developer) certification opportunity.
AWS platform access with latest features to develop POC (Proof of Concept). 
Training & guidance on Tata Technologies Innovation Framework, Edge AI.
Personal Mentorship by industry experts for developing your projects.
Opportunity to present your solution/POC at a national-level hackathon in front of industry leaders.
Branding through Tata Technologies social media handles.
Strengthening placement collaboration and corporate relations. 
Institutional visibility for winning teams on Tata Technologies social media / print media.
 
Eligibility Criteria for participation:
All engineering students of 3rd and 4th year.
Team size : minimum 1, maximum 5.
Multiple entries allowed.
No participation charges.
We request your support in circulating this information among eligible students and motivating them to participate actively to maximize engagement from your institution.

We look forward to enthusiastic participation from your institution.

Best Regards, 
Tata Technologies,`
};

async function run() {
  console.log(`\n=================== Tata InnoVent Real ===================`);
  const parsed = await parseEmailWithLLM(email.subject, email.sender, email.body);
  console.log(`Display Fields:`);
  console.log(JSON.stringify(parsed.displayFields, null, 2));
}

run().catch(console.error);
