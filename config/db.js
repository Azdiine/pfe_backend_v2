const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL error:', err.message);
});

const testConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('🕐 DB Time:', res.rows[0].now);
  } catch (err) {
    console.error('❌ DB Connection failed:', err.message);
  }
};

module.exports = { pool, testConnection };
