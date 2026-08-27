import dotenv from 'dotenv';
dotenv.config();

import { generateContent } from '../src/services/ai-client.js';

async function run() {
  const res = await generateContent('Reply with ONLY JSON: {"test": true}');
  console.log('generateContent result type:', typeof res);
  console.log('generateContent result:', res);
}

run();
