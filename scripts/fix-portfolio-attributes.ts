import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Query, ID } from 'node-appwrite';

const ENDPOINT = process.env['APPWRITE_ENDPOINT']!;
const PROJECT_ID = process.env['APPWRITE_PROJECT_ID']!;
const API_KEY = process.env['APPWRITE_API_KEY']!;
const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function run() {
  console.log('Inspecting portfolio_items collection attributes...');
  const attrs = await db.listAttributes(DATABASE_ID, 'portfolio_items');
  const attrKeys = new Set(attrs.attributes.map((a: any) => a.key));
  console.log('Existing attributes on portfolio_items:', Array.from(attrKeys));

  if (!attrKeys.has('skills')) {
    console.log('Adding "skills" attribute to portfolio_items collection...');
    try {
      await db.createStringAttribute(DATABASE_ID, 'portfolio_items', 'skills', 2000, false, '[]');
      console.log('✓ Created "skills" attribute on portfolio_items.');
      // Wait 3 seconds for attribute to become available
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      console.log('Note on creating skills attribute:', e);
    }
  }

  // Update existing portfolio items for Jericko Garcia
  const email = 'jerickogarcia0@gmail.com';
  const userRes = await db.listDocuments(DATABASE_ID, 'users', [
    Query.equal('email', email),
    Query.limit(1),
  ]);

  if (userRes.documents.length === 0) return;
  const userId = userRes.documents[0]!.$id;

  const portfolioList = await db.listDocuments(DATABASE_ID, 'portfolio_items', [
    Query.equal('freelancer_id', userId),
  ]);

  console.log(`Found ${portfolioList.documents.length} portfolio items for ${email}. Updating images & skills...`);

  const portfolioData = [
    {
      title: 'Decentralized Freelance & Milestone Escrow Protocol',
      images: JSON.stringify([{ url: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&auto=format&fit=crop&q=60', filename: 'escrow.png' }]),
      skills: JSON.stringify(['Solidity', 'Smart Contracts', 'Polygon', 'React', 'Next.js']),
    },
    {
      title: 'DeFi Automated Liquidity & Staking Platform',
      images: JSON.stringify([{ url: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=800&auto=format&fit=crop&q=60', filename: 'defi.png' }]),
      skills: JSON.stringify(['EVM', 'TypeScript', 'Ethers.js', 'TailwindCSS', 'Node.js']),
    },
    {
      title: 'Web3 Multi-Chain NFT Marketplace & Minter',
      images: JSON.stringify([{ url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=60', filename: 'nft.png' }]),
      skills: JSON.stringify(['Solidity', 'IPFS', 'Next.js', 'Wagmi', 'TailwindCSS']),
    },
  ];

  for (let i = 0; i < portfolioList.documents.length; i++) {
    const doc = portfolioList.documents[i]!;
    const data = portfolioData[i] || portfolioData[0]!;
    try {
      await db.updateDocument(DATABASE_ID, 'portfolio_items', doc.$id, {
        images: data.images,
        skills: data.skills,
      });
      console.log(`✓ Updated portfolio item ${doc.$id} with images and skills.`);
    } catch (err) {
      console.error(`Error updating item ${doc.$id}:`, err);
    }
  }

  console.log('Portfolio update complete.');
}

run().catch(console.error);
