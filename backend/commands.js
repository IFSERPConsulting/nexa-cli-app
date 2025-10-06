const { pool } = require('./users');

function normalizeStats(row = {}) {
  return {
    total_commands: Number(row.total_commands) || 0,
    avg_command_length: Number(row.avg_command_length) || 0,
    active_duration_seconds: Number(row.active_duration_seconds) || 0,
  };
}

async function refreshCommandStats(userId) {
  const query = `
    WITH agg AS (
      SELECT
        COUNT(*)::int AS total_commands,
        COALESCE(AVG(LENGTH(command)), 0)::float AS avg_command_length,
        COALESCE(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))), 0)::float AS active_duration_seconds
      FROM commands
      WHERE user_id = $1
    )
    INSERT INTO command_stats (user_id, total_commands, avg_command_length, active_duration_seconds, updated_at)
    SELECT $1, agg.total_commands, agg.avg_command_length, agg.active_duration_seconds, NOW()
    FROM agg
    ON CONFLICT (user_id) DO UPDATE
      SET total_commands = EXCLUDED.total_commands,
          avg_command_length = EXCLUDED.avg_command_length,
          active_duration_seconds = EXCLUDED.active_duration_seconds,
          updated_at = NOW()
    RETURNING total_commands, avg_command_length, active_duration_seconds;
  `;
  const { rows } = await pool.query(query, [userId]);
  if (rows && rows.length) {
    return normalizeStats(rows[0]);
  }
  return normalizeStats();
}

async function saveCommand(userId, command, output) {
  const metadata = { commandLength: command.length, outputLength: output ? output.length : 0 };
  const query = `
    INSERT INTO commands(user_id, command, output, metadata)
    VALUES($1, $2, $3, $4)
    RETURNING *`;
  const { rows } = await pool.query(query, [userId, command, output || '', metadata]);
  await refreshCommandStats(userId);
  return rows[0];
}

async function getCommands(userId) {
  const query = 'SELECT * FROM commands WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10';
  const { rows } = await pool.query(query, [userId]);
  return rows;
}

async function getCommandStats(userId, { refresh = true } = {}) {
  if (!refresh) {
    const { rows } = await pool.query(
      'SELECT total_commands, avg_command_length, active_duration_seconds FROM command_stats WHERE user_id = $1',
      [userId]
    );
    if (rows && rows.length) {
      return normalizeStats(rows[0]);
    }
  }
  return refreshCommandStats(userId);
}

module.exports = { saveCommand, getCommands, getCommandStats };

