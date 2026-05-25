import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: DATABASE_URL must be set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function listAdminUsers() {
  try {
    // Get all admin users
    const result = await pool.query(
      `SELECT id, email, full_name as name, role, is_active, created_at 
       FROM users 
       WHERE role = 'admin'`
    );

    if (result.rows.length === 0) {
      console.log('No admin users found in the database.');
      console.log('\nLet me check all users...\n');
      
      // Get all users
      const allResult = await pool.query(
        `SELECT id, email, full_name as name, role, is_active, created_at 
         FROM users 
         LIMIT 10`
      );

      console.log('First 10 users in database:');
      console.table(allResult.rows);
      await pool.end();
      return;
    }

    console.log('Admin users found:');
    console.table(result.rows);
    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

listAdminUsers();
