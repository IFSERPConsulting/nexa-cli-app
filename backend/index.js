require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./users');
const { authenticate } = require('./validation');
const { isAdmin } = require('./admin');
const { checkRateLimit, rateLimitMiddleware } = require('./rateLimiter');
const app = express();

app.use(cors());
app.use(express.json());

// User routes
app.post('/api/register', require('./validation').validateRegistration, require('./users').register);
app.post('/api/login', require('./users').login);

// Command routes
app.post('/api/run-nexa', authenticate, rateLimitMiddleware('run-nexa'), require('./validation').validateCommand, async (req, res) => {
  const { command } = req.body;
  try {
    const result = await require('execa')('nexa', command.split(' '));
    await require('./commands').saveCommand(req.user.userId, command, result.stdout);
    res.json({ success: true, output: result.stdout });
  } catch (error) {
    await require('./commands').saveCommand(req.user.userId, command, error.stderr);
    res.status(500).json({ success: false, error: error.stderr });
  }
});

// Stats and commands
app.get('/api/stats', authenticate, async (req, res) => {
  const query = 'SELECT * FROM command_stats WHERE user_id = $1';
  const { rows } = await pool.query(query, [req.user.userId]);
  res.json(rows[0] || { total_commands: 0, avg_command_length: 0, active_duration_seconds: 0 });
});

app.get('/api/commands', authenticate, async (req, res) => {
  const commands = await require('./commands').getCommands(req.user.userId);
  res.json(commands);
});

// Admin routes
app.get('/api/admin/rate-limits', authenticate, isAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rate_limits');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rate limits.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
