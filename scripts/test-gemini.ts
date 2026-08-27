import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.LLM_API_KEY || 'AQ.Ab8RN6IQiaImKbKvLB1-PoTlcjdgYssKyZuyjpahcz850WWmZQ';
const model = process.env.LLM_MODEL || 'gemini-3-flash-preview';
const apiUrl = process.env.LLM_API_URL || 'https://generativelanguage.googleapis.com/v1beta';

async function testGenerate() {
  const url = `${apiUrl.replace(/\/+$/, '')}/models/${model}:generateContent?key=${apiKey}`;
  console.log('Target URL:', url.replace(apiKey, 'HIDDEN_KEY'));

  const prompt = 'Analyze current market demand for skills: ["React", "Solidity"]. Return ONLY valid JSON: {"status":"success","recommendedSkills":["TypeScript","Next.js"]}';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });

  console.log('Status:', res.status);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log('Gemini Generated Text:\n', text);
}

testGenerate().catch(console.error);
