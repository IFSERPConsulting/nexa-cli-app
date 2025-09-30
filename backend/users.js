const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const JWT_SECRET = process.env.JWT_SECRET;

async function register(username, password) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const query = 'INSERT INTO users(username, password_hash) VALUES($1, $2) RETURNING *';
  const { rows } = await pool.query(query, [username, hashedPassword]);
  return rows[0];
}

async function login(username, password) {
  const query = 'SELECT * FROM users WHERE username = $1';
  const { rows } = await pool.query(query, [username]);
  if (rows.length === 0) throw new Error('User not found');
  const user = rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new Error('Invalid password');
  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
  return { token };
}

module.exports = { register, login, JWT_SECRET, pool };
