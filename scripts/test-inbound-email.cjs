#!/usr/bin/env node

/**
 * Test Script: Cloudflare Inbound Email Verification
 * 
 * This script sends a test email from Google SMTP to a Cloudflare email address
 * to verify that inbound email routing is working correctly.
 * 
 * Prerequisites:
 * 1. Install nodemailer: npm install nodemailer
 * 2. Ensure Google account has App Password configured (not regular password)
 *    - Go to Google Account > Security > 2-Step Verification > App passwords
 *    - Generate an app password for "Mail"
 * 
 * Usage:
 *   node scripts/test-inbound-email.cjs
 * 
 * To check if the email was received via webhook:
 * 1. Monitor your Cloudflare Worker logs (via Wrangler or Cloudflare Dashboard)
 * 2. Check if the webhook endpoint received the email
 * 3. Look for POST requests to your email webhook endpoint
 * 
 * Cloudflare Email Routing Webhook URL:
 *   https://your-worker.your-account.workers.dev/email
 */

const nodemailer = require('nodemailer');

// Google SMTP Configuration
const SMTP_CONFIG = {
  host: 'smtp.gmail.com',
  port: 465,        // SSL port
  secure: true,     // true for port 465 (SSL), false for 587 (STARTTLS)
  auth: {
    user: 'jerickogarcia0@gmail.com',
    pass: 'dqhmfeokihzpvdle',  // App Password (without spaces)
  },
  tls: {
    rejectUnauthorized: true,
  },
};

// Email Configuration
const EMAIL_CONFIG = {
  from: 'jerickogarcia0@gmail.com',
  to: 'support@freelancexchain.works',  // Target Cloudflare email address
  // Alternative: admin@freelancexchain.works
  subject: 'Test: Cloudflare Inbound Email Verification',
  text: 'This is a test email sent from Google SMTP to verify Cloudflare can receive emails.\n\nSent at: ' + new Date().toISOString(),
  html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Cloudflare Inbound Email Test</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f6821f; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .timestamp { color: #666; font-size: 0.9em; margin-top: 20px; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.85em; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>Cloudflare Inbound Email Test</h2>
      </div>
      <div class="content">
        <p>This is a test email sent from Google SMTP to verify Cloudflare can receive emails.</p>
        <p>If you received this email via webhook, the inbound email routing is working correctly!</p>
        <div class="timestamp">
          <strong>Sent at:</strong> ${new Date().toISOString()}
        </div>
        <div class="footer">
          <p><strong>Sender:</strong> jerickogarcia0@gmail.com (Google SMTP)</p>
          <p><strong>Recipient:</strong> support@freelancexchain.works (Cloudflare Email Routing)</p>
        </div>
      </div>
    </body>
    </html>
  `,
};

/**
 * Verify SMTP connection
 */
async function verifyConnection(transporter) {
  console.log('Verifying SMTP connection...');
  console.log(`  Host: ${SMTP_CONFIG.host}`);
  console.log(`  Port: ${SMTP_CONFIG.port}`);
  console.log(`  Secure: ${SMTP_CONFIG.secure}`);
  console.log(`  User: ${SMTP_CONFIG.auth.user}`);
  console.log('');

  try {
    const verification = await transporter.verify();
    console.log(' SMTP Connection Verified Successfully!');
    console.log(`  Server ready: ${verification}`);
    console.log('');
    return true;
  } catch (error) {
    console.error(' SMTP Connection Failed!');
    console.error(`  Error: ${error.message}`);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Ensure the password is an App Password, not your regular Google password');
    console.error('  2. Check if 2-Factor Authentication is enabled on the Google account');
    console.error('  3. Verify the App Password was generated at https://myaccount.google.com/apppasswords');
    console.error('  4. Less Secure Apps access is deprecated; App Passwords are required');
    return false;
  }
}

/**
 * Send test email
 */
async function sendEmail(transporter) {
  console.log('Preparing to send email...');
  console.log(`  From: ${EMAIL_CONFIG.from}`);
  console.log(`  To: ${EMAIL_CONFIG.to}`);
  console.log(`  Subject: ${EMAIL_CONFIG.subject}`);
  console.log('');

  try {
    const info = await transporter.sendMail(EMAIL_CONFIG);
    console.log(' Email Sent Successfully!');
    console.log(`  Message ID: ${info.messageId}`);
    console.log(`  Accepted recipients: ${info.accepted.join(', ') || 'none'}`);
    if (info.rejected.length > 0) {
      console.log(`  Rejected recipients: ${info.rejected.join(', ')}`);
    }
    console.log('');
    return info;
  } catch (error) {
    console.error(' Email Send Failed!');
    console.error(`  Error: ${error.message}`);
    if (error.code) {
      console.error(`  Error Code: ${error.code}`);
    }
    if (error.response) {
      console.error(`  Server Response: ${error.response}`);
    }
    throw error;
  }
}

/**
 * Print instructions for verifying webhook receipt
 */
function printWebhookInstructions() {
  console.log('');
  console.log('='.repeat(60));
  console.log('HOW TO VERIFY WEBHOOK RECEIPT');
  console.log('='.repeat(60));
  console.log('');
  console.log('1. Check Cloudflare Worker Logs:');
  console.log('   wrangler tail');
  console.log('   # or view logs in Cloudflare Dashboard');
  console.log('');
  console.log('2. Monitor your webhook endpoint for POST requests:');
  console.log('   Look for requests to: /email or your configured webhook path');
  console.log('');
  console.log('3. Check your application logs where the webhook posts data:');
  console.log('   - Database entries');
  console.log('   - File storage');
  console.log('   - Notification system');
  console.log('');
  console.log('4. Expected webhook payload structure:');
  console.log(`   {
     "from": "jerickogarcia0@gmail.com",
     "to": "support@freelancexchain.works",
     "subject": "Test: Cloudflare Inbound Email Verification",
     "text": "...",
     "html": "...",
     "headers": { ... }
   }`);
  console.log('');
  console.log('5. Check Email Routing in Cloudflare Dashboard:');
  console.log('   - Go to your domain > Email > Email Routing');
  console.log('   - Verify the email address has routing rules configured');
  console.log('   - Check the Activity Log for recent emails');
  console.log('');
  console.log('='.repeat(60));
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Cloudflare Inbound Email Verification Test');
  console.log('='.repeat(60));
  console.log('');

  // Create transporter
  const transporter = nodemailer.createTransport(SMTP_CONFIG);

  // Verify connection
  const isConnected = await verifyConnection(transporter);
  if (!isConnected) {
    process.exit(1);
  }

  // Send email
  await sendEmail(transporter);

  // Print webhook verification instructions
  printWebhookInstructions();

  console.log('');
  console.log('Test completed successfully!');
  console.log(`Timestamp: ${new Date().toISOString()}`);
}

// Run the script
main().catch((error) => {
  console.error('');
  console.error('Script failed with error:', error.message);
  process.exit(1);
});
