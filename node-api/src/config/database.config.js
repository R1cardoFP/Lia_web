const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 10),
  dateStrings: true,
});

module.exports = pool;
