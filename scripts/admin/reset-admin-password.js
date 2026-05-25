import bcrypt from 'bcrypt';
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

async function resetAdminPassword(email, newPassword) {
  try {
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update the password in the database
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email',
      [passwordHash, email]
    );

    if (result.rows.length === 0) {
      console.error('User not found with email:', email);
      await pool.end();
      return;
    }

    console.log('✅ Password reset successfully!');
    console.log('Email:', email);
    // Password and hash are sensitive - do not log them
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
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
