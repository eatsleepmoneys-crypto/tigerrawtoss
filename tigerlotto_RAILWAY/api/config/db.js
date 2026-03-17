const mysql = require('mysql2/promise');

// Railway injects: MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE
const pool = mysql.createPool({
  host:               process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.MYSQLPORT    || process.env.DB_PORT     || 3306),
  user:               process.env.MYSQLUSER     || process.env.DB_USER,
  password:           process.env.MYSQLPASSWORD || process.env.DB_PASS,
  database:           process.env.MYSQLDATABASE || process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+07:00',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, queryOne, transaction };
