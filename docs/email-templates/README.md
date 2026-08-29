# FreelanceXchain Branded Email Templates

Official email templates matching the **FreelanceXchain Landing Page Dark & Emerald Theme**.

## 📧 Available Templates

### 🔐 Appwrite Authentication & Security Flows
1. **confirmation.html** - Signup verification email with OTP & confirmation link
2. **magic-link.html** - Passwordless instant login link
3. **recovery.html** - Password reset email with recovery code
4. **reauthentication.html** - Time-sensitive MFA / sensitive action code
5. **email-change.html** - Email address update confirmation
6. **invite.html** - Platform invitation link & token

### 📬 Platform Event & Notification Flows (`email-delivery-service`)
7. **proposal_accepted.html** - Freelancer proposal accepted & escrow notice
8. **milestone_approved.html** - Deliverable approved & payment unlocked
9. **payment_released.html** - On-chain escrow payout notice with Tx hash
10. **contract_created.html** - New smart contract agreement ready to sign
11. **dispute_created.html** - Dispute room alert for arbitration
12. **kyc_approved.html** - Identity verification approved badge
13. **kyc_rejected.html** - Identity verification resubmission notice
14. **message_received.html** - Direct message notification & preview
15. **review_received.html** - Star rating & on-chain review feedback
16. **weekly_digest.html** - Weekly platform opportunities & activity digest

## 🎨 Landing Page Design System Integration

- **Cyber Dark Background**: `#0b0f19` deep space tone matching the landing page.
- **Card Enclosures**: `#111827` (slate-900) card with `#1a2234` inner panels and subtle `rgba(255, 255, 255, 0.08)` borders.
- **Hero Radial Glow**: `radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.22) 0%, rgba(17, 24, 39, 0) 70%), #0f172a`.
- **Emerald Accent**: `#10b981` / `#34d399` matching FreelanceXchain Web3 brand identity.
- **Typography & Wordmark**: `FreelanceXchain` with colored pivot `X`.
- **Trust Badges**: Escrow protection, verification notices, and 2026 decentralized protocol copyright.

## 🚀 How to Apply Templates to Appwrite

### Appwrite Dashboard Mapping

1. Go to your Appwrite Dashboard: `Auth` -> `Templates`
2. Copy and paste the HTML content from the corresponding template file:

| Dashboard Template | HTML File |
| ------------------- | ----------- |
| Confirm signup | confirmation.html |
| Magic Link | magic-link.html |
| Reset Password | recovery.html |
| Invite user | invite.html |
| Change email address | email-change.html |
| Reauthentication | reauthentication.html |

### Method 2: Via Management API

You can also update templates programmatically using the Appwrite Management API. You'll need:

- Your Appwrite access token from: <https://appwrite.com/dashboard/account/tokens>
- Your project ref: `nfcfgxfpidfvcpkyjgih`

Example using curl:

```bash
export APPWRITE_ACCESS_TOKEN="your-access-token"
export PROJECT_REF="nfcfgxfpidfvcpkyjgih"

# Update confirmation email
curl -X PATCH "https://api.appwrite.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $APPWRITE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mailer_subjects_confirmation": "Welcome to FreelanceXchain - Confirm Your Email",
    "mailer_templates_confirmation_content": "<paste HTML content here>"
  }'
```

## 📝 Template Variables

All templates support these Appwrite variables:

- `{{ .ConfirmationURL }}` - Full confirmation link
- `{{ .Token }}` - 6-digit OTP code
- `{{ .TokenHash }}` - Hashed token for custom links
- `{{ .SiteURL }}` - Your application URL
- `{{ .Email }}` - User's email address
- `{{ .RedirectTo }}` - Redirect URL after confirmation

## 🎯 Customization Tips

### Change Brand Colors

Each template uses gradient colors. To customize:

1. Find the gradient in the header section:

   ```html
   background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
   ```

2. Replace with your brand colors:

   ```html
   background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
   ```

### Update Logo/Icon

Replace the emoji in the header with your logo:

```html
<!-- Current -->
<div style="font-size: 48px; margin-bottom: 10px;">✨</div>

<!-- With image -->
<img src="https://your-domain.com/logo.png" alt="Logo" style="width: 60px; height: 60px; margin-bottom: 10px;">
```

### Modify Button Text

Change the CTA button text:

```html
<a href="{{ .ConfirmationURL }}" style="...">
    Your Custom Button Text
</a>
```

## 🔒 Security Best Practices

1. **Always use HTTPS** for confirmation URLs
2. **Set appropriate expiration times** for tokens
3. **Include security warnings** in sensitive emails
4. **Never include passwords** in email templates
5. **Test templates** before deploying to production

## 📱 Testing Templates

1. Create a test user in your Appwrite project
2. Trigger the authentication flow
3. Check the email in your inbox
4. Verify all links and codes work correctly
5. Test on multiple email clients (Gmail, Outlook, etc.)

## 🆘 Support

If you encounter issues:

- Check Appwrite Auth logs in the dashboard
- Verify template variables are correctly formatted
- Ensure HTML is valid and properly escaped
- Test with different email providers

## 📄 License

These templates are part of the FreelanceXchain project.
