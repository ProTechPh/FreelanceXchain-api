# Quick Setup Guide - Email Templates

## ⚡ 5-Minute Setup

Follow these steps to apply your new email templates to Supabase:

### Step 1: Access Supabase Dashboard

Open this link in your browser:
```
https://supabase.com/dashboard/project/nfcfgxfpidfvcpkyjgih/auth/templates
```

### Step 2: Apply Each Template

#### 1. Confirm Signup Template

1. Click on **"Confirm signup"** in the dashboard
2. Open `confirmation.html` in this folder
3. Copy ALL the HTML content
4. Paste into the **"Message Body (HTML)"** field
5. Update subject to: `Welcome to FreelanceXchain - Confirm Your Email`
6. Click **Save**

#### 2. Magic Link Template

1. Click on **"Magic link"** in the dashboard
2. Open `magic-link.html` in this folder
3. Copy ALL the HTML content
4. Paste into the **"Message Body (HTML)"** field
5. Update subject to: `Your FreelanceXchain Magic Link`
6. Click **Save**

#### 3. Reset Password Template

1. Click on **"Reset password"** in the dashboard
2. Open `recovery.html` in this folder
3. Copy ALL the HTML content
4. Paste into the **"Message Body (HTML)"** field
5. Update subject to: `Reset Your FreelanceXchain Password`
6. Click **Save**

#### 4. Invite User Template

1. Click on **"Invite user"** in the dashboard
2. Open `invite.html` in this folder
3. Copy ALL the HTML content
4. Paste into the **"Message Body (HTML)"** field
5. Update subject to: `You're Invited to FreelanceXchain!`
6. Click **Save**

#### 5. Change Email Address Template

1. Click on **"Change email address"** in the dashboard
2. Open `email-change.html` in this folder
3. Copy ALL the HTML content
4. Paste into the **"Message Body (HTML)"** field
5. Update subject to: `Confirm Your Email Change - FreelanceXchain`
6. Click **Save**

#### 6. Reauthentication Template

1. Click on **"Reauthentication"** in the dashboard
2. Open `reauthentication.html` in this folder
3. Copy ALL the HTML content
4. Paste into the **"Message Body (HTML)"** field
5. Update subject to: `Verify Your Identity - FreelanceXchain`
6. Click **Save**

### Step 3: Test Your Templates

1. Go to your FreelanceXchain app
2. Try signing up with a new email
3. Check your inbox for the confirmation email
4. Verify the design looks good
5. Test the confirmation link/code

## ✅ Checklist

- [ ] Confirmation email template applied
- [ ] Magic link template applied
- [ ] Password reset template applied
- [ ] Invite user template applied
- [ ] Email change template applied
- [ ] Reauthentication template applied
- [ ] All templates tested
- [ ] Email design looks good on mobile
- [ ] All links work correctly

## 🎨 Template Preview

Each template features:
- ✨ Beautiful gradient headers
- 📱 Mobile-responsive design
- 🔘 Clear call-to-action buttons
- 🔢 Easy-to-read OTP codes
- 🔒 Security notices
- 🎯 FreelanceXchain branding

## 🚨 Important Notes

1. **Backup Current Templates**: Before applying, you might want to save your current templates
2. **Test First**: Test with a personal email before going live
3. **Mobile Check**: View emails on mobile devices to ensure responsiveness
4. **Link Verification**: Always test that confirmation links work

## 💡 Pro Tips

- Use the OTP code option for users with email prefetching issues
- Customize colors to match your exact brand guidelines
- Add your logo URL to replace the emoji icons
- Monitor email delivery rates in Supabase dashboard

## 🆘 Troubleshooting

**Email not received?**
- Check spam folder
- Verify email provider settings in Supabase
- Check Supabase Auth logs

**Template not saving?**
- Ensure HTML is valid
- Check for special characters that need escaping
- Try saving in smaller chunks

**Links not working?**
- Verify Site URL in Supabase Auth settings
- Check redirect URLs are whitelisted
- Ensure token hasn't expired

## 📞 Need Help?

Check the main README.md file for detailed documentation and customization options.
