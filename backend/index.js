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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// User routes
app.post('/api/register', require('./validation').validateRegistration, async (req, res) => {
  try {
    const result = await require('./users').register(req.body.username, req.body.password);
    res.json(result);
  } catch (error) {
    console.error('Register failed:', error.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});
app.post('/api/login', async (req, res) => {
  try {
    const result = await require('./users').login(req.body.username, req.body.password);
    res.json(result);
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(401).json({ error: error.message });
  }
});

// Model routes
app.get('/api/models', (req, res) => {
  const availableModels = ['NexaAI/OmniNeural-4B', 'NexaAI/phi4-mini-npu-turbo'];
  res.json({ models: availableModels });
});

app.put('/api/user/default-model', authenticate, async (req, res) => {
  try {
    const { model } = req.body;
    const result = await require('./users').updateDefaultModel(req.user.userId, model);
    res.json({ defaultModel: result.default_model });
  } catch (error) {
    console.error('Update default model failed:', error.message);
    res.status(500).json({ error: 'Failed to update default model' });
  }
});

// Command routes
app.post('/api/run-nexa', authenticate, rateLimitMiddleware('run-nexa'), require('./validation').validateCommand, async (req, res) => {
  const { command, model } = req.body;
  let fullCommand = command;
  if (!command.startsWith('run ')) {
    fullCommand = `run ${model} ${command}`;
  }
  try {
    const result = await require('execa')('nexa', fullCommand.split(' '));
    await require('./commands').saveCommand(req.user.userId, fullCommand, result.stdout);
    res.json({ success: true, output: result.stdout });
  } catch (error) {
    const errorMessage = error.stderr || error.message || 'Unknown error';
    await require('./commands').saveCommand(req.user.userId, fullCommand, errorMessage);
    res.status(500).json({ success: false, error: errorMessage });
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
