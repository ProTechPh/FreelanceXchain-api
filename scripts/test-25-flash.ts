import dotenv from 'dotenv';
dotenv.config();

const apiKey = 'AQ.Ab8RN6IQiaImKbKvLB1-PoTlcjdgYssKyZuyjpahcz850WWmZQ';
const model = 'gemini-2.5-flash';

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply JSON {"ok": true}' }] }] })
  });
  console.log('Gemini 2.5 flash status:', res.status);
  const data = await res.json();
  console.log('Output:', JSON.stringify(data).slice(0, 150));
}

test();
