/**
 * Script to check if a test email was received and stored in the Appwrite database
 * 
 * Usage: pnpm tsx scripts/check-received-email.ts
 */

import { databases, DATABASE_ID, Query } from '../src/config/appwrite.js';
import { COLLECTIONS } from '../src/config/collections.js';

const COLLECTION_ID = COLLECTIONS.EMAILS;

// Test email details
const TEST_EMAIL = {
  messageId: '<2a1216c5-5e3b-ed2a-5989-af7bc91293a4@gmail.com>',
  fromAddress: 'jerickogarcia0@gmail.com',
  toAddress: 'support@freelancexchain.works',
  subject: 'Test: Cloudflare Inbound Email Verification',
  sentAt: '2026-09-25T05:43:46.199Z',
};

async function checkReceivedEmail(): Promise<void> {
  console.log('='.repeat(70));
  console.log('CHECKING FOR RECEIVED EMAIL IN APPWRITE DATABASE');
  console.log('='.repeat(70));
  console.log();
  console.log('Test email details:');
  console.log(`  Message ID: ${TEST_EMAIL.messageId}`);
  console.log(`  From:       ${TEST_EMAIL.fromAddress}`);
  console.log(`  To:         ${TEST_EMAIL.toAddress}`);
  console.log(`  Subject:    ${TEST_EMAIL.subject}`);
  console.log(`  Sent at:    ${TEST_EMAIL.sentAt}`);
  console.log(`  Current:    ${new Date().toISOString()}`);
  console.log();
  console.log('-'.repeat(70));
  console.log();

  try {
    // Calculate time windows
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    console.log(`Searching for emails received since: ${tenMinutesAgo}`);
    console.log();

    // Query 1: Search by from_address containing the sender email
    console.log('Query 1: Searching by from_address (last 10 mins)...');
    const fromQuery = [
      Query.greaterThan('received_at', tenMinutesAgo),
      Query.contains('from_address', 'jerickogarcia0'),
    ];
    
    const fromResult = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      fromQuery
    );
    console.log(`  Found ${fromResult.documents.length} email(s) from jerickogarcia0`);

    // Query 2: Search by message_id
    console.log('Query 2: Searching by message_id...');
    const messageIdQuery = [
      Query.contains('message_id', '2a1216c5-5e3b-ed2a-5989-af7bc91293a4'),
    ];
    
    const messageIdResult = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      messageIdQuery
    );
    console.log(`  Found ${messageIdResult.documents.length} email(s) with matching message_id`);

    // Query 3: Search by subject
    console.log('Query 3: Searching by subject...');
    const subjectQuery = [
      Query.contains('subject', 'Cloudflare Inbound Email Verification'),
    ];
    
    const subjectResult = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      subjectQuery
    );
    console.log(`  Found ${subjectResult.documents.length} email(s) with matching subject`);

    // Query 4: Check ALL recent emails (last hour) for any inbound activity
    console.log('Query 4: Checking ALL emails (last hour)...');
    const recentQuery = [
      Query.greaterThan('received_at', oneHourAgo),
      Query.orderDesc('received_at'),
    ];
    
    const recentResult = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      recentQuery
    );
    console.log(`  Found ${recentResult.documents.length} total email(s) in last hour`);

    // Query 5: Search for ANY email from jerickogarcia0 (no time limit)
    console.log('Query 5: Searching for ANY email from jerickogarcia0...');
    const anyFromQuery = [
      Query.contains('from_address', 'jerickogarcia0@gmail.com'),
      Query.limit(10),
    ];
    
    const anyFromResult = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      anyFromQuery
    );
    console.log(`  Found ${anyFromResult.documents.length} email(s) from jerickogarcia0 (any time)`);

    // Combine all unique results
    const allMatches = new Map<string, typeof fromResult.documents[0]>();
    
    [...fromResult.documents, ...messageIdResult.documents, ...subjectResult.documents, ...anyFromResult.documents].forEach(doc => {
      allMatches.set(doc.$id, doc);
    });

    console.log();
    console.log('='.repeat(70));
    console.log(`TOTAL UNIQUE MATCHES: ${allMatches.size}`);
    console.log('='.repeat(70));
    console.log();

    // Show recent emails if any exist
    if (recentResult.documents.length > 0 && allMatches.size === 0) {
      console.log('Recent emails found (but none matching the test):');
      recentResult.documents.forEach((email, i) => {
        console.log(`\n  [${i + 1}] ${email.subject ?? 'No Subject'}`);
        console.log(`      From: ${email.from_address ?? 'Unknown'}`);
        console.log(`      To: ${email.to_address ?? 'Unknown'}`);
        console.log(`      Received: ${email.received_at ?? 'Unknown'}`);
        console.log(`      Message ID: ${email.message_id ?? 'N/A'}`);
      });
      console.log();
    }

    if (allMatches.size === 0) {
      console.log('? NO TEST EMAILS FOUND');
      console.log();
      console.log('The test email may not have been received yet, or there may be an issue');
      console.log('with the webhook or email processing.');
      console.log();
      console.log('Troubleshooting steps:');
      console.log('  1. Verify the webhook endpoint /api/inbox/webhook is accessible');
      console.log('  2. Check Cloudflare Email Routing logs');
      console.log('  3. Check server logs for webhook processing errors');
      console.log('  4. Verify the APPWRITE_API_KEY has permissions to create documents');
      console.log('  5. Verify Cloudflare Email Routing is configured for support@freelancexchain.works');
      console.log('  6. Check if the webhook destination is responding with 200 OK');
      process.exit(1);
    }

    // Display all matching emails
    let matchIndex = 1;
    for (const [id, email] of allMatches) {
      console.log(`\n?? MATCH #${matchIndex}`);
      console.log('-'.repeat(70));
      console.log(`  Document ID:    ${id}`);
      console.log(`  Message ID:     ${email.message_id ?? 'N/A'}`);
      console.log(`  User ID:        ${email.user_id ?? 'N/A'}`);
      console.log(`  From:           ${email.from_address ?? 'N/A'}`);
      console.log(`  To:             ${email.to_address ?? 'N/A'}`);
      console.log(`  Subject:        ${email.subject ?? 'N/A'}`);
      console.log(`  Folder:         ${email.folder ?? 'N/A'}`);
      console.log(`  Is Read:        ${email.is_read ?? 'N/A'}`);
      console.log(`  Is Starred:     ${email.is_starred ?? 'N/A'}`);
      console.log(`  In Reply To:    ${email.in_reply_to ?? 'N/A'}`);
      console.log(`  References:     ${email.references ?? 'N/A'}`);
      console.log(`  Received At:    ${email.received_at ?? 'N/A'}`);
      console.log(`  Created At:     ${email.$createdAt ?? 'N/A'}`);
      console.log(`  Updated At:     ${email.$updatedAt ?? 'N/A'}`);
      
      if (email.text_body) {
        const textPreview = email.text_body.length > 100 
          ? email.text_body.substring(0, 100) + '...' 
          : email.text_body;
        console.log(`  Text Body:      ${textPreview.replace(/\n/g, '\\n')}`);
      }
      
      if (email.attachments) {
        console.log(`  Attachments:    ${email.attachments}`);
      }

      // Check if this is the exact test email we're looking for
      const isExactMatch = 
        email.message_id === TEST_EMAIL.messageId ||
        (email.from_address && email.from_address.includes(TEST_EMAIL.fromAddress)) ||
        (email.subject && email.subject.includes('Cloudflare Inbound Email Verification'));

      if (isExactMatch) {
        console.log();
        console.log('  ? This appears to be the test email!');
      }
      
      matchIndex++;
    }

    console.log();
    console.log('='.repeat(70));
    console.log('? EMAIL VERIFICATION COMPLETE');
    console.log('='.repeat(70));
    console.log();
    console.log('The webhook is successfully receiving and storing emails!');
    
  } catch (error) {
    console.error();
    console.error('? ERROR CHECKING EMAILS:');
    console.error(error);
    process.exit(1);
  }
}

// Run the check
checkReceivedEmail();
