const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const client = new Pool({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  port: 5432,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

module.exports = client;