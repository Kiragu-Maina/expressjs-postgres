import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: Number(process.env.PGPORT) || 5432, // PostgreSQL default port
  max: 10, // Connection pool size
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000 // Timeout if connection takes too long
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

export default pool;
