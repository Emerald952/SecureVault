// server/db.js - Database connection setup
const { Pool } = require('pg');
require('dotenv').config();

// Pool manages a set of connections to PostgreSQL
// It automatically reuses connections, so your app stays fast
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Export pool.query so we can use it like: db.query('SELECT * FROM users')
module.exports = pool;
