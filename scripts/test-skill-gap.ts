import dotenv from 'dotenv';
dotenv.config();

import { analyzeSkillGaps } from '../src/services/matching-service.js';

async function test() {
  console.log('Testing analyzeSkillGaps for Jericko Garcia with Gemini 3 Flash...');
  const userId = '6a8e7a6b4f2e626fb528';
  const result = await analyzeSkillGaps(userId);
  console.log('Result success:', result.success);
  if (result.success) {
    console.log('Current skills:', result.data.currentSkills);
    console.log('Recommended skills:', result.data.recommendedSkills);
    console.log('Market demand:', result.data.marketDemand);
    console.log('Reasoning:', result.data.reasoning);
  } else {
    console.error('Error:', result.error);
  }
}

test().catch(console.error);
