require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { execa } = require('execa');
const { pool } = require('./users');
const { authenticate } = require('./validation');
const { isAdmin } = require('./admin');
const { checkRateLimit, rateLimitMiddleware } = require('./rateLimiter');
const app = express();

// Check if 'nexa' binary is available on the host PATH at startup.
let nexaAvailable = true;
(async () => {
  try {
    // Try to get version which verifies executable exists and is runnable
    const { stdout } = await execa('C:\\Users\\dariu\\AppData\\Local\\Nexa CLI\\nexa.exe', ['version']);
    console.log(`nexa found: ${stdout}`);
    nexaAvailable = true;
  } catch (err) {
    console.error("nexa binary not found or not runnable on PATH. Please install Nexa and ensure it's in your PATH.", err.message || err);
    nexaAvailable = false;
  }
})();

app.use(cors());
app.use(express.json());

// Simple request logger for diagnostics
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Diagnostics endpoint: reports nexa availability and DB connectivity
app.get('/api/diagnostics', async (req, res) => {
  const diagnostics = { timestamp: new Date().toISOString() };

  // Re-check nexa availability quickly
  try {
    const { stdout } = await execa('C:\\Users\\dariu\\AppData\\Local\\Nexa CLI\\nexa.exe', ['version']);
    diagnostics.nexa = { available: true, version: stdout };
  } catch (err) {
    diagnostics.nexa = { available: false, error: String(err.message || err) };
  }

  // Check DB connectivity
  try {
    const { rows } = await pool.query('SELECT 1');
    diagnostics.database = { ok: true };
  } catch (err) {
    diagnostics.database = { ok: false, error: String(err.message || err) };
  }

  res.json(diagnostics);
});// User routes
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
  // Assume command is the prompt text
  let fullCommand = `run ${model} --prompt dummy`;
  let prompt = command;

  if (!nexaAvailable) {
    const msg = 'Nexa server not available on http://127.0.0.1:18181. Ensure Nexa server is running.';
    console.error(msg);
    return res.status(500).json({ success: false, error: msg });
  }

  try {
    let args = fullCommand.split(' ');
    // Replace 'run' with 'infer' for inference commands
    if (args[0] === 'run') {
      args[0] = 'infer';
    }
    // Extract prompt from --prompt flag and create a temporary file
    let prompt = '';
    let tempFilePath = '';
    let filteredArgs = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-i' || args[i] === '--prompt') {
        if (i + 1 < args.length) {
          prompt = args[i + 1];
          // Create a temporary file with the prompt
          const fs = require('fs');
          const os = require('os');
          const path = require('path');
          tempFilePath = path.join(os.tmpdir(), `nexa-prompt-${Date.now()}.txt`);
          fs.writeFileSync(tempFilePath, prompt);
          filteredArgs.push('-i', tempFilePath);
          i++; // skip the next arg as it's the prompt value
        }
      } else {
        filteredArgs.push(args[i]);
      }
    }
    const result = await execa('C:\\Users\\dariu\\AppData\\Local\\Nexa CLI\\nexa.exe', filteredArgs, { cwd: 'C:\\Users\\dariu\\AppData\\Local\\Nexa CLI' });
    // Clean up the temporary file
    if (tempFilePath) {
      try {
        require('fs').unlinkSync(tempFilePath);
      } catch (err) {
        console.error('Failed to clean up temp file:', err);
      }
    }
    await require('./commands').saveCommand(req.user.userId, fullCommand, result.stdout);
    res.json({ success: true, output: result.stdout });
  } catch (error) {
    console.error('Error executing nexa command:', error);
    // Handle missing binary specially in case execa throws ENOENT at runtime
    if (error && (error.code === 'ENOENT' || (error.stderr && error.stderr.includes('not found')))) {
      const msg = 'nexa binary not found when attempting to execute. Ensure Nexa is installed and in PATH.';
      console.error(msg, error.message || error);
      await require('./commands').saveCommand(req.user.userId, fullCommand, msg);
      return res.status(500).json({ success: false, error: msg });
    }

    const errorMessage = (error && (error.stderr || error.message)) || 'Unknown error';
    console.error('Nexa command failed with error:', errorMessage);
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

console.log('About to start server...');
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
  console.log('Server started successfully');
});
console.log('app.listen called');
