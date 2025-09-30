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
  const query = 'INSERT INTO users(username, password_hash, default_model) VALUES($1, $2, $3) RETURNING *';
  const { rows } = await pool.query(query, [username, hashedPassword, 'NexaAI/OmniNeural-4B']);
  return rows[0];
}

async function login(username, password) {
  try {
    const query = 'SELECT * FROM users WHERE username = $1';
    const { rows } = await pool.query(query, [username]);
    if (rows.length === 0) throw new Error('User not found');
    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new Error('Invalid password');
    const token = jwt.sign({ userId: user.id, username: user.username, defaultModel: user.default_model }, JWT_SECRET, { expiresIn: '1h' });
    return { token, defaultModel: user.default_model };
  } catch (error) {
    console.error('Login error:', error.message);
    throw error;
  }
}

async function updateDefaultModel(userId, model) {
  const query = 'UPDATE users SET default_model = $1 WHERE id = $2 RETURNING *';
  const { rows } = await pool.query(query, [model, userId]);
  return rows[0];
}

module.exports = { register, login, updateDefaultModel, JWT_SECRET, pool };
