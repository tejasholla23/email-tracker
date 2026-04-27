const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function parseEmailWithLLM(emailText) {
  try {
    const prompt = `
You are an intelligent system that analyzes emails.

Determine whether the email is related to:
- job applications
- internships
- interviews
- online assessments
- hackathons
- hiring opportunities

If YES, return JSON:
{
  "isRelevant": true,
  "company": "...",
  "role": "...",
  "type": "internship | full-time | test | hackathon | unknown",
  "link": "...",
  "date": "...",
  "status": "applied | interview | rejected | unknown"
}

If NOT relevant, return:
{ "isRelevant": false }

Return ONLY JSON.

Email:
${emailText}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    const text = response.text.trim();

    const jsonText = text
      .replace(/^```json\s*/i, "")
      .replace(/```$/, "")
      .trim();

    return JSON.parse(jsonText);

  } catch (error) {
    console.error("Gemini Parse Error:", error.message);
    return { isRelevant: false };
  }
}

module.exports = { parseEmailWithLLM };