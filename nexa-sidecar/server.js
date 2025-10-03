const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const port = Number(process.env.PORT || 18181);

function send(res, status, body, headers={}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  const baseHeaders = typeof body === 'string' ? { 'Content-Type': 'text/plain' } : { 'Content-Type': 'application/json' };
  res.writeHead(status, { 'Cache-Control': 'no-store', ...baseHeaders, ...headers });
  res.end(data);
}

function parseJson(req, limitBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(text || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function runCmd(cmd, args, opts={}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('close', code => resolve({ code, out, err }));
  });
}

async function checkLicense() {
  try {
    const { code, out } = await runCmd('nexa', ['config', 'list']);
    if (code === 0 && /license:\s*key\//i.test(out)) {
      console.log('[LICENSE] existing license detected');
      return true;
    }
  } catch (_) {}
  console.warn('[LICENSE] no existing license configured');
  return false;
}

function extractLicenseValue(text) {
  if (!text) return '';
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // exact line match
    const m1 = trimmed.match(/^(key\/\S+)$/);
    if (m1) return m1[1];
    // find first token containing key/
    const m2 = trimmed.match(/(key\/[^\s]+)/);
    if (m2) return m2[1];
  }
  return '';
}

async function applyLicense() {
  const key = process.env.NEXA_LICENSE;
  const file = process.env.NEXA_LICENSE_FILE;
  let value = key;
  if (!value && file) {
    try {
      const raw = require('fs').readFileSync(file, 'utf8');
      value = extractLicenseValue(raw);
    } catch (e) {
      console.warn('[LICENSE] failed to read license file', file, e.message || e);
    }
  }
  if (!value) {
    console.log('[LICENSE] no license provided via env or file; checking current configuration');
    await checkLicense();
    return;
  }
  await new Promise((resolve) => {
    console.log('[LICENSE] applying Nexa license from', key ? 'env' : 'file');
    const p = spawn('nexa', ['config', 'set', 'license', value], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => process.stdout.write(`[LICENSE] ${d}`));
    p.stderr.on('data', d => process.stderr.write(`[LICENSE ERR] ${d}`));
    p.on('close', (code) => {
      if (code !== 0) {
        console.warn('[LICENSE] setting license returned non-zero exit code:', code);
      }
      resolve();
    });
  });
  await checkLicense();
}

async function prePull() {
  const cfg = process.env.PREPULL_MODELS;
  if (!cfg) return;
  const list = cfg.split(',').map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return;
  console.log(`[PREPULL] Starting pre-pull for ${list.length} model(s):`, list.join(', '));
  for (const model of list) {
    await new Promise((resolve) => {
      const p = spawn('nexa', ['pull', model], { stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.on('data', d => process.stdout.write(`[PREPULL:${model}] ${d}`));
      p.stderr.on('data', d => process.stderr.write(`[PREPULL:${model} ERR] ${d}`));
      p.on('close', code => {
        if (code === 0) {
          console.log(`[PREPULL] Completed ${model}`);
        } else {
          console.warn(`[PREPULL] Failed for ${model} with code ${code}`);
        }
        resolve();
      });
    });
  }
  console.log('[PREPULL] Finished');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/') {
    return send(res, 200, 'Nexa sidecar HTTP gateway running');
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok', time: new Date().toISOString() });
  }
  if (req.method === 'GET' && url.pathname === '/license') {
    try {
      const { code, out } = await runCmd('nexa', ['config', 'list']);
      // strip ANSI escape sequences
      const clean = out.replace(/\u001b\[[0-9;]*m/g, '');
      const m = clean.match(/license:\s*([^\s]+)/i);
      const value = m ? m[1] : '';
      const present = !!value && /key\//i.test(value);
      return send(res, 200, { present, value: present ? value : '' , raw: clean, exitCode: code });
    } catch (e) {
      return send(res, 500, { present: false, error: e.message || String(e) });
    }
  }
  if (req.method === 'GET' && url.pathname === '/diag') {
    const report = { time: new Date().toISOString() };
    try { const v = await runCmd('nexa', ['version']); report.version = (v.out || v.err || '').trim(); } catch (e) { report.version = String(e.message||e); }
    try { const c = await runCmd('nexa', ['config', 'list']); report.config = c.out; } catch (e) { report.config = String(e.message||e); }
    try { const l = await runCmd('nexa', ['list']); report.models = l.out; } catch (e) { report.models = String(e.message||e); }
    return send(res, 200, report);
  }
  if (req.method === 'POST' && url.pathname === '/infer') {
    try {
      const body = await parseJson(req);
      const model = body?.model;
      const prompt = body?.prompt;
      if (!model || typeof model !== 'string' || !prompt || typeof prompt !== 'string') {
        return send(res, 400, { error: 'Invalid payload: require string model and prompt' });
      }
      const tmp = path.join(os.tmpdir(), `nexa-input-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFile(tmp, prompt, 'utf8', (werr) => {
    if (werr) return send(res, 500, { error: 'Failed to prepare prompt file' });
    const extra = (process.env.NEXA_INFER_EXTRA || '').trim();
    const extraArgs = extra ? extra.split(/\s+/).filter(Boolean) : [];
        const args = ['infer', model, '-i', tmp, '--enable-json', ...extraArgs];
        const proc = spawn('nexa', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        proc.stdout.on('data', d => { out += d.toString(); });
        proc.stderr.on('data', d => { err += d.toString(); });
        proc.on('close', code => {
          fs.unlink(tmp, () => {});
          const outLower = (out || '').toLowerCase();
          const errLower = (err || '').toLowerCase();
          // Try to parse JSON output when enabled
          let parsed = null;
          try {
            const firstBrace = out.indexOf('{');
            const lastBrace = out.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              parsed = JSON.parse(out.slice(firstBrace, lastBrace + 1));
            }
          } catch (_) {}

          const failedMarker = outLower.includes('oops') || outLower.includes('failed to load') || errLower.includes('failed to initialize') || errLower.includes('error');
          const successByJson = parsed && (parsed.output || parsed.result || parsed.text);

          if (code === 0 && (successByJson || (!failedMarker && out.trim().length > 0))) {
            const outputText = successByJson ? (parsed.output || parsed.result || parsed.text) : out;
            send(res, 200, { model, output: outputText });
          } else {
            const friendly = failedMarker ? 'Model failed to load' : `nexa exited with code ${code}`;
            // include stdout preview to make the root cause visible to callers
            send(res, 500, { error: friendly, stderr: err, output: out });
          }
        });
      });
    } catch (e) {
      return send(res, 400, { error: e.message || String(e) });
    }
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Nexa sidecar listening on ${port}`);
  // fire-and-forget: apply license then pre-pull
  (async () => {
    try { await applyLicense(); } catch (e) { console.error('[LICENSE] error', e); }
    try { await prePull(); } catch (e) { console.error('[PREPULL] error', e); }
  })();
});
