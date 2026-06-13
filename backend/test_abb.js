require('dotenv').config();
const { parseEmailWithLLM } = require('./utils/parseEmailWithLLM');

async function test() {
  const subject = "ABB Registration";
  const sender = "placement@msrit.edu";
  const body = `Dear Students,

ABB IS Team Internship opportunity.

Stipend: INR 30K for Bachelor's students (BE/BTech)
Location: Bangalore
Duration: 3 Months
Joining: July onwards

Regards,
Placement Department`;

  const parsed = await parseEmailWithLLM(subject, sender, body);
  console.log(JSON.stringify(parsed, null, 2));
}

test();
