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

async function listAdminUsers() {
  try {
    // Get all admin users
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, is_active, created_at')
      .eq('role', 'admin');

    if (error) {
      console.error('Error fetching admin users:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('No admin users found in the database.');
      console.log('\nLet me check all users...\n');
      
      // Get all users
      const { data: allUsers, error: allError } = await supabase
        .from('users')
        .select('id, email, name, role, is_active, created_at')
        .limit(10);

      if (allError) {
        console.error('Error fetching users:', allError);
        return;
      }

      console.log('First 10 users in database:');
      console.table(allUsers);
      return;
    }

    console.log('Admin users found:');
    console.table(data);
  } catch (err) {
    console.error('Error:', err);
  }
}

listAdminUsers();
