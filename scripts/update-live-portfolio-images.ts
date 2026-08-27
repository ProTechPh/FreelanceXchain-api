import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Query } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function run() {
  const userRes = await db.listDocuments(DATABASE_ID, 'users', [
    Query.equal('email', 'jerickogarcia0@gmail.com'),
    Query.limit(1),
  ]);

  if (userRes.documents.length === 0) return;
  const userId = userRes.documents[0]!.$id;

  const list = await db.listDocuments(DATABASE_ID, 'portfolio_items', [
    Query.equal('freelancer_id', userId),
  ]);

  console.log(`Updating ${list.documents.length} portfolio items for ${userId}...`);

  for (const doc of list.documents) {
    let url = doc.project_url || 'http://protechph.bond';
    if (url.includes('github.com/jerickogarcia/escrow')) {
      url = 'https://polygon.technology';
    } else if (url.includes('github.com/jerickogarcia/defi')) {
      url = 'https://ethereum.org';
    }

    const previewImg = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;

    await db.updateDocument(DATABASE_ID, 'portfolio_items', doc.$id, {
      project_url: url,
      images: JSON.stringify([{ url: previewImg, filename: 'preview.png' }]),
    });
    console.log(`✓ Updated "${doc.title}" with project_url: ${url}`);
  }

  console.log('Done!');
}

run().catch(console.error);
