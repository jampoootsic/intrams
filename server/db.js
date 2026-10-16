import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'intramsgrado_db',
  waitForConnections: true,
  connectionLimit: 20,
  namedPlaceholders: true,
};

const pool = mysql.createPool(config);

export default pool;