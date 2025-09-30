const { pool } = require('./users');

async function saveCommand(userId, command, output) {
  const metadata = { commandLength: command.length, outputLength: output ? output.length : 0 };
  const query = `
    INSERT INTO commands(user_id, command, output, metadata)
    VALUES($1, $2, $3, $4)
    RETURNING *`;
  const { rows } = await pool.query(query, [userId, command, output || '', metadata]);
  return rows[0];
}

async function getCommands(userId) {
  const query = 'SELECT * FROM commands WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10';
  const { rows } = await pool.query(query, [userId]);
  return rows;
}

module.exports = { saveCommand, getCommands };
