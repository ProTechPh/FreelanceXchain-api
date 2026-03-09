import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetAdminPassword(email, newPassword) {
  try {
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update the password in the database
    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('email', email)
      .select();

    if (error) {
      console.error('Error updating password:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.error('User not found with email:', email);
      return;
    }

    console.log('✅ Password reset successfully!');
    console.log('Email:', email);
    // Password and hash are sensitive - do not log them
  } catch (err) {
    console.error('Error:', err);
  }
}

// Get email and password from command line arguments
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log('Usage: node reset-admin-password.js <email> <new-password>');
  console.log('Example: node reset-admin-password.js admin@example.com newpassword123');
  process.exit(1);
}

resetAdminPassword(email, newPassword);
