const fs = require('fs');
const os = require('os');
const path = require('path');

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const users = require('./users');
const { authenticate, validateRegistration, validateCommand } = require('./validation');
const { isAdmin } = require('./admin');
const { rateLimitMiddleware } = require('./rateLimiter');
const commands = require('./commands');

const app = express();
const { pool } = users;

const NEXA_ENABLED = process.env.NEXA_ENABLED !== 'false';
const NEXA_MODE = (process.env.NEXA_MODE || (process.env.NEXA_HTTP_URL ? 'http' : 'cli')).toLowerCase();
const NEXA_HTTP_URL = process.env.NEXA_HTTP_URL || 'http://nexa:18181';
const NEXA_HTTP_TIMEOUT_MS = parseInt(process.env.NEXA_HTTP_TIMEOUT_MS || '30000', 10);
const NEXA_HTTP_INFER_PATH = process.env.NEXA_HTTP_INFER_PATH || '/v1/chat/completions';
const NEXA_HTTP_MAX_TOKENS = parseInt(process.env.NEXA_HTTP_MAX_TOKENS || '0', 10);
const NEXA_HTTP_TEMPERATURE = process.env.NEXA_HTTP_TEMPERATURE ? parseFloat(process.env.NEXA_HTTP_TEMPERATURE) : null;
const NEXA_SYSTEM_PROMPT = process.env.NEXA_SYSTEM_PROMPT || '';
const NEXA_EXECUTABLE = process.env.NEXA_CLI_PATH || 'nexa';
const nexaExecOptions = (() => {
  const opts = {};
  if (process.env.NEXA_CLI_CWD) opts.cwd = process.env.NEXA_CLI_CWD;
  if (process.env.NEXA_TIMEOUT_MS) {
    const t = parseInt(process.env.NEXA_TIMEOUT_MS, 10);
    if (!Number.isNaN(t) && t > 0) opts.timeout = t;
  }
  return Object.keys(opts).length ? opts : null;
})();
const DEFAULT_MODELS = ['NexaAI/OmniNeural-4B', 'NexaAI/phi4-mini-npu-turbo'];
const ENV_ALLOWED_MODELS = (() => {
  const raw = process.env.NEXA_ALLOWED_MODELS;
  if (!raw || !raw.trim()) return [...DEFAULT_MODELS];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
})();
const MODEL_ID_REGEX = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g;
const MODEL_CACHE_MS = parseInt(process.env.NEXA_MODEL_CACHE_MS || '30000', 10);
let discoveredModelCache = null;
let discoveredModelCacheAt = 0;
let modelDiscoveryPromise = null;

// execa v8 is ESM-only; import it dynamically in CommonJS context
async function runNexa(args) {
  const { execa } = await import('execa');
  if (nexaExecOptions) {
    return execa(NEXA_EXECUTABLE, args, nexaExecOptions);
  }
  return execa(NEXA_EXECUTABLE, args);
}

function extractModelIdsFromText(text) {
  if (!text) return [];
  const str = String(text).replace(/\u001b\[[0-9;]*m/g, '');
  const ids = [];
  const seen = new Set();
  let match;
  while ((match = MODEL_ID_REGEX.exec(str)) !== null) {
    const id = match[1] || match[0];
    if (!seen.has(id) && id && !id.toLowerCase().startsWith('key/')) {
      seen.add(id);
      ids.push(id);
    }
  }
  MODEL_ID_REGEX.lastIndex = 0;
  return ids;
}

function collectModelsFromJson(data) {
  if (!data) return [];
  const collected = [];
  const pushValue = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      collected.push(value);
      return;
    }
    if (typeof value === 'object') {
      ['id', 'model', 'name', 'slug'].forEach((key) => {
        const v = value[key];
        if (typeof v === 'string') {
          collected.push(v);
        }
      });
    }
  };
  if (Array.isArray(data)) {
    data.forEach(pushValue);
  } else if (typeof data === 'object') {
    pushValue(data);
    ['models', 'available_models', 'data'].forEach((key) => {
      if (Array.isArray(data[key])) {
        data[key].forEach(pushValue);
      }
    });
  }
  return collected;
}

function mergeModelLists(primary, secondary) {
  const seen = new Set();
  const models = [];
  const add = (value) => {
    if (!value || typeof value !== 'string') return;
    const normalized = value.trim();
    if (!normalized || normalized.toLowerCase().startsWith('key/')) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    models.push(normalized);
  };
  primary.forEach(add);
  secondary.forEach(add);
  if (!models.length) {
    DEFAULT_MODELS.forEach(add);
  }
  return models;
}

async function discoverModelsViaHttp() {
  const endpoints = [
    `${NEXA_HTTP_URL}/v1/models`,
    `${NEXA_HTTP_URL}/models`,
    `${NEXA_HTTP_URL}/diag`,
  ];
  for (const url of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NEXA_HTTP_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) continue;
      const contentType = resp.headers.get('content-type') || '';
      let ids = [];
      if (contentType.includes('application/json')) {
        const payload = await resp.json();
        if (url.endsWith('/diag')) {
          if (payload && typeof payload === 'object' && payload.models) {
            if (Array.isArray(payload.models)) {
              ids = collectModelsFromJson(payload.models);
            } else {
              ids = extractModelIdsFromText(payload.models);
            }
          }
          if (!ids.length) {
            ids = collectModelsFromJson(payload);
          }
        } else {
          ids = collectModelsFromJson(payload);
        }
      } else {
        const textPayload = await resp.text();
        ids = extractModelIdsFromText(textPayload);
      }
      if (ids.length) {
        return ids;
      }
    } catch (err) {
      console.warn(`Failed to fetch models from ${url}:`, err.message || err);
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

async function discoverModelsViaCli() {
  try {
    const { stdout } = await runNexa(['list']);
    const ids = extractModelIdsFromText(stdout);
    if (ids.length) return ids;
  } catch (err) {
    console.warn('Failed to list Nexa models via CLI:', err.message || err);
  }
  return [];
}

async function refreshAvailableModels() {
  if (!NEXA_ENABLED) {
    return mergeModelLists(ENV_ALLOWED_MODELS, []);
  }
  let discovered = [];
  if (NEXA_MODE === 'http') {
    discovered = await discoverModelsViaHttp();
    if (!discovered.length) {
      const fallback = await discoverModelsViaCli();
      if (fallback.length) {
        discovered = fallback;
      }
    }
  } else {
    discovered = await discoverModelsViaCli();
  }
  const merged = mergeModelLists(ENV_ALLOWED_MODELS, discovered);
  return merged.length ? merged : [...DEFAULT_MODELS];
}

async function getAvailableModels(forceRefresh = false) {
  if (forceRefresh) {
    discoveredModelCache = null;
    discoveredModelCacheAt = 0;
  } else {
    const now = Date.now();
    if (discoveredModelCache && (now - discoveredModelCacheAt) < MODEL_CACHE_MS) {
      return discoveredModelCache;
    }
    if (modelDiscoveryPromise) {
      return modelDiscoveryPromise;
    }
  }

  const discoveryTask = (async () => {
    try {
      const models = await refreshAvailableModels();
      discoveredModelCache = models;
      discoveredModelCacheAt = Date.now();
      return models;
    } catch (err) {
      console.error('Failed to refresh Nexa model cache:', err.message || err);
      discoveredModelCache = [...DEFAULT_MODELS];
      discoveredModelCacheAt = Date.now();
      return discoveredModelCache;
    } finally {
      modelDiscoveryPromise = null;
    }
  })();

  modelDiscoveryPromise = discoveryTask;
  return discoveryTask;
}

async function verifyNexaHttp(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEXA_HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.trim();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// Check if the Nexa binary is available on the host PATH (or configured path) at startup.
let nexaAvailable = false;

const verifyNexaAvailability = async () => {
  if (!NEXA_ENABLED) {
    nexaAvailable = false;
    return 'disabled';
  }
  if (NEXA_MODE === 'http') {
    try {
      const msg = await verifyNexaHttp(NEXA_HTTP_URL);
      console.log(`nexa http reachable: ${NEXA_HTTP_URL} -> ${msg}`);
      nexaAvailable = true;
      return `service:${NEXA_HTTP_URL}`;
    } catch (err) {
      console.error('nexa http not reachable at', NEXA_HTTP_URL, err.message || err);
      nexaAvailable = false;
      throw err;
    }
  }
  try {
    const { stdout } = await runNexa(['version']);
    const version = stdout.trim();
    console.log(`nexa found: ${version}`);
    nexaAvailable = true;
    return version;
  } catch (err) {
    console.error('nexa binary not found or not runnable. Configure NEXA_CLI_PATH or ensure it is on PATH.', err.message || err);
    nexaAvailable = false;
    throw err;
  }
};

(async () => {
  try {
    await verifyNexaAvailability();
  } catch (err) {
    // Logged in verifyNexaAvailability - keep server running so diagnostics endpoint can report failure.
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

// Diagnostics endpoint: reports Nexa availability and DB connectivity
app.get('/api/diagnostics', async (req, res) => {
  const diagnostics = { timestamp: new Date().toISOString() };

  try {
    const version = await verifyNexaAvailability();
    diagnostics.nexa = { enabled: NEXA_ENABLED, mode: NEXA_MODE, httpUrl: NEXA_MODE==='http'?NEXA_HTTP_URL:undefined, available: NEXA_ENABLED ? true : false, version };
    // Add license status
    try {
      if (NEXA_MODE === 'http') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NEXA_HTTP_TIMEOUT_MS);
        const resp = await fetch(`${NEXA_HTTP_URL}/license`, { signal: controller.signal });
        clearTimeout(timer);
        if (resp.ok) {
          const j = await resp.json();
          diagnostics.nexa.license = { present: !!j.present };
        }
      } else {
        const { execa } = await import('execa');
        const { stdout } = await execa(NEXA_EXECUTABLE, ['config', 'list']);
        const clean = stdout.replace(/\u001b\[[0-9;]*m/g, '');
        const m = clean.match(/license:\s*([^\s]+)/i);
        diagnostics.nexa.license = { present: !!(m && /key\//i.test(m[1])) };
      }
    } catch (_) {
      diagnostics.nexa.license = { present: false };
    }
  } catch (err) {
    diagnostics.nexa = { enabled: NEXA_ENABLED, mode: NEXA_MODE, httpUrl: NEXA_MODE==='http'?NEXA_HTTP_URL:undefined, available: false, error: String(err.message || err) };
  }

  try {
    await pool.query('SELECT 1');
    diagnostics.database = { ok: true };
  } catch (err) {
    diagnostics.database = { ok: false, error: String(err.message || err) };
  }

  res.json(diagnostics);
});

// User routes
app.post('/api/register', validateRegistration, async (req, res) => {
  try {
    const result = await users.register(req.body.username, req.body.password);
    res.json(result);
  } catch (error) {
    console.error('Register failed:', error.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const result = await users.login(req.body.username, req.body.password);
    res.json(result);
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(401).json({ error: error.message });
  }
});

// Model routes
app.get('/api/models', async (req, res) => {
  try {
    const refreshParam = req.query ? String(req.query.refresh || '') : '';
    const forceRefresh = refreshParam === '1' || refreshParam.toLowerCase() === 'true';
    const models = await getAvailableModels(forceRefresh);
    res.json({ models });
  } catch (error) {
    console.error('Failed to fetch model list:', error.message || error);
    res.status(500).json({ error: 'Failed to determine available models.' });
  }
});

app.put('/api/user/default-model', authenticate, async (req, res) => {
  try {
    const { model } = req.body;
    const requested = typeof model === 'string' ? model.trim() : '';
    if (!requested) {
      return res.status(400).json({ error: 'Model is required.' });
    }
    let models = await getAvailableModels();
    if (!models.includes(requested)) {
      models = await getAvailableModels(true);
    }
    if (!models.includes(requested)) {
      return res.status(400).json({ error: 'Unsupported model requested.' });
    }
    const result = await users.updateDefaultModel(req.user.userId, requested);
    res.json({ defaultModel: result.default_model });
  } catch (error) {
    console.error('Update default model failed:', error.message);
    res.status(500).json({ error: 'Failed to update default model' });
  }
});

// Command routes
app.post(
  '/api/run-nexa',
  authenticate,
  rateLimitMiddleware('run-nexa'),
  validateCommand,
  async (req, res) => {
    if (!NEXA_ENABLED) {
      return res.status(503).json({ success: false, error: 'Nexa is disabled. Set NEXA_ENABLED=true to enable model inference.' });
    }
    const { command, model } = req.body;
    const promptText = typeof command === 'string' ? command : '';

    let availableModels = await getAvailableModels();
    if (!availableModels.length) {
      availableModels = await getAvailableModels(true);
    }
    if (!availableModels.length) {
      return res.status(503).json({ success: false, error: 'No Nexa models are available. Pull a model first.' });
    }

    const explicitModel = typeof model === 'string' ? model.trim() : '';
    let requestedModel = explicitModel || (typeof req.user?.defaultModel === 'string' ? req.user.defaultModel.trim() : '');

    if (explicitModel) {
      if (!availableModels.includes(explicitModel)) {
        availableModels = await getAvailableModels(true);
        if (!availableModels.includes(explicitModel)) {
          return res.status(400).json({ success: false, error: 'Unsupported model requested.' });
        }
      }
      requestedModel = explicitModel;
    } else if (requestedModel) {
      if (!availableModels.includes(requestedModel)) {
        availableModels = await getAvailableModels(true);
        if (!availableModels.includes(requestedModel)) {
          requestedModel = availableModels[0];
        }
      }
    } else {
      requestedModel = availableModels[0];
    }

    if (!requestedModel) {
      return res.status(503).json({ success: false, error: 'No Nexa models are available. Pull a model first.' });
    }

    if (!promptText.trim()) {
      return res.status(400).json({ success: false, error: 'Prompt text is required.' });
    }

    if (!nexaAvailable) {
      try {
        await verifyNexaAvailability();
      } catch (err) {
        const msg = 'Nexa service not available. Ensure Nexa sidecar/CLI is installed and reachable.';
        console.error(msg);
        await commands.saveCommand(req.user.userId, promptText, msg);
        return res.status(503).json({ success: false, error: msg });
      }
    }

    let tempFilePath = '';
    try {
      let outputText = '';
      if (NEXA_MODE === 'http') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NEXA_HTTP_TIMEOUT_MS);
        try {
          const payload = {
            model: requestedModel,
            messages: [],
          };

          if (NEXA_SYSTEM_PROMPT.trim()) {
            payload.messages.push({ role: 'system', content: NEXA_SYSTEM_PROMPT.trim() });
          }
          payload.messages.push({ role: 'user', content: promptText });

          if (NEXA_HTTP_MAX_TOKENS > 0) {
            payload.max_tokens = NEXA_HTTP_MAX_TOKENS;
          }
          if (typeof NEXA_HTTP_TEMPERATURE === 'number' && !Number.isNaN(NEXA_HTTP_TEMPERATURE)) {
            payload.temperature = NEXA_HTTP_TEMPERATURE;
          }

          const resp = await fetch(`${NEXA_HTTP_URL}${NEXA_HTTP_INFER_PATH}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${errText}`);
          }
          const ct = resp.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              const data = await resp.json();
              if (data && Array.isArray(data.choices) && data.choices.length) {
                const texts = data.choices
                  .map((choice) => choice?.message?.content || choice?.text || '')
                  .filter(Boolean);
                outputText = texts.length ? texts.join('\n') : JSON.stringify(data);
              } else if (data && (data.output || data.result)) {
                outputText = data.output || data.result;
              } else {
                outputText = JSON.stringify(data ?? {});
              }
            } else {
              outputText = await resp.text();
            }
        } catch (e) {
          clearTimeout(timer);
          throw e;
        }
      } else {
        tempFilePath = path.join(os.tmpdir(), `nexa-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
        fs.writeFileSync(tempFilePath, promptText, 'utf8');
        const args = ['infer', requestedModel, '-i', tempFilePath];
        const result = await runNexa(args);
        outputText = result.stdout;
      }

      await commands.saveCommand(req.user.userId, promptText, outputText);
      res.json({ success: true, output: outputText, model: requestedModel, mode: NEXA_MODE });
    } catch (error) {
      console.error('Error executing nexa command:', error);
      if (error && (error.code === 'ENOENT' || (error.stderr && error.stderr.includes('not found')))) {
        const msg = 'nexa binary not found when attempting to execute. Ensure Nexa is installed and in PATH or configured via NEXA_CLI_PATH.';
        console.error(msg, error.message || error);
        await commands.saveCommand(req.user.userId, promptText, msg);
        return res.status(500).json({ success: false, error: msg });
      }
      let errorMessage = (error && (error.stderr || error.message)) || 'Unknown error';
      if (/aborted/i.test(errorMessage)) {
        errorMessage = 'Nexa sidecar request timed out. Consider increasing NEXA_HTTP_TIMEOUT_MS or pre-pulling models in the sidecar.';
      }
      console.error('Nexa command failed with error:', errorMessage);
      await commands.saveCommand(req.user.userId, promptText, errorMessage);
      res.status(500).json({ success: false, error: errorMessage });
    } finally {
      if (tempFilePath) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (err) {
          console.error('Failed to clean up temp file:', err);
        }
      }
    }
  }
);

// Stats and commands
app.get('/api/stats', authenticate, async (req, res) => {
  try {
    const stats = await commands.getCommandStats(req.user.userId);
    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch command stats:', error.message || error);
    res.status(500).json({ error: 'Failed to fetch command stats.' });
  }
});

app.get('/api/commands', authenticate, async (req, res) => {
  const commandHistory = await commands.getCommands(req.user.userId);
  res.json(commandHistory);
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
