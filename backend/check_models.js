require("dotenv").config({ path: "./.env" });
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.list();
    // In @google/genai, ai.models.list() might return an array or async iterable
    // Let's try to convert it to an array or just iterate
    let models = [];
    if (response[Symbol.asyncIterator]) {
      for await (const model of response) {
        models.push(model);
      }
    } else {
      models = response; // maybe it's just an array
    }

    const modelNames = models.map(m => m.name);
    console.log("AVAILABLE MODELS:");
    console.log(modelNames.join('\n'));

    const is31FlashLite = modelNames.some(m => m.includes("3.1") || m.includes("flash-lite") || m.includes("3-1"));
    console.log("Has 3.1 or flash-lite?:", is31FlashLite);

  } catch (err) {
    console.error("Failed to list models:", err);
  }
}

run();
