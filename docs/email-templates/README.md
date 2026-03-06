# FreelanceXchain Email Templates

Professional, branded email templates for Supabase authentication flows.

## 📧 Available Templates

1. **confirmation.html** - Email confirmation for new signups
2. **magic-link.html** - Passwordless authentication magic link
3. **recovery.html** - Password reset emails
4. **invite.html** - User invitation emails
5. **email-change.html** - Email address change confirmation
6. **reauthentication.html** - Reauthentication verification

## 🎨 Design Features

- **Modern gradient headers** with unique colors for each template type
- **Responsive design** that works on all devices
- **Clear call-to-action buttons** with hover effects
- **OTP code display** with monospace font for easy reading
- **Security notices** with appropriate warning styles
- **Consistent branding** with FreelanceXchain identity
- **Professional footer** with copyright information

## 🚀 How to Apply Templates

### Method 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/nfcfgxfpidfvcpkyjgih/auth/templates

2. For each template:
   - Click on the template name (e.g., "Confirm signup")
   - Copy the content from the corresponding HTML file
   - Paste it into the "Message Body (HTML)" field
   - Update the subject line if desired
   - Click "Save" to apply

### Template Mapping

| Dashboard Template | HTML File |
|-------------------|-----------|
| Confirm signup | confirmation.html |
| Magic Link | magic-link.html |
| Reset Password | recovery.html |
| Invite user | invite.html |
| Change email address | email-change.html |
| Reauthentication | reauthentication.html |

### Method 2: Via Management API

You can also update templates programmatically using the Supabase Management API. You'll need:
- Your Supabase access token from: https://supabase.com/dashboard/account/tokens
- Your project ref: `nfcfgxfpidfvcpkyjgih`

Example using curl:

```bash
export SUPABASE_ACCESS_TOKEN="your-access-token"
export PROJECT_REF="nfcfgxfpidfvcpkyjgih"

# Update confirmation email
curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mailer_subjects_confirmation": "Welcome to FreelanceXchain - Confirm Your Email",
    "mailer_templates_confirmation_content": "<paste HTML content here>"
  }'
```

## 📝 Template Variables

All templates support these Supabase variables:

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

1. Create a test user in your Supabase project
2. Trigger the authentication flow
3. Check the email in your inbox
4. Verify all links and codes work correctly
5. Test on multiple email clients (Gmail, Outlook, etc.)

## 🆘 Support

If you encounter issues:
- Check Supabase Auth logs in the dashboard
- Verify template variables are correctly formatted
- Ensure HTML is valid and properly escaped
- Test with different email providers

## 📄 License

These templates are part of the FreelanceXchain project.
