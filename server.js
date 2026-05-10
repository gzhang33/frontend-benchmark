const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROXY_PORT = 3456;
const STATIC_DIR = __dirname;
const MAX_BODY_SIZE = 10 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60000;
const CLAUDE_TIMEOUT_MS = 300000;
const ALLOWED_HOSTS = ['opencode.ai'];

// Extra hosts approved at runtime via custom model configs
const dynamicAllowedHosts = new Set();

const CLAUDE_MODELS = new Set([
  'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  const raw = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  raw.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !line.startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return env;
}

function buildModelMap(env) {
  const map = {};

  const ocBase = (env.OPENCODE_BASE_URL || '').replace(/\/+$/, '');
  const ocKey = env.OPENCODE_API_KEY || '';
  if (ocBase && ocKey) {
    ['minimax-m2.5-free', 'hy3-preview-free', 'nemotron-3-super-free'].forEach(function(m) {
      map[m] = { targetUrl: ocBase + '/chat/completions', apiKey: ocKey };
    });
  }

  return map;
}

let modelMap;
try {
  modelMap = buildModelMap(loadEnv());
  console.log('Loaded models:', Object.keys(modelMap).join(', '));
} catch (e) {
  console.error('Failed to load .env:', e.message);
  modelMap = {};
}

function serveStatic(urlPath, res) {
  let filePath;
  if (urlPath === '/' || urlPath === '/index.html') {
    filePath = path.join(STATIC_DIR, 'index.html');
  } else {
    filePath = path.resolve(STATIC_DIR, '.' + urlPath);
  }

  if (!filePath.startsWith(STATIC_DIR + path.sep) && filePath !== STATIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';
  const isBinary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2'].includes(ext);

  fs.readFile(filePath, isBinary ? undefined : 'utf-8', (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType, ...CORS_HEADERS });
    res.end(data);
  });
}

function handleClaudeCodeRequest(parsed, res) {
  const messages = parsed.messages || [];
  const userMsg = messages.find(m => m.role === 'user');
  const systemMsg = messages.find(m => m.role === 'system');
  if (!userMsg) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'missing user message' }));
    return;
  }

  const fullPrompt = systemMsg
    ? systemMsg.content + '\n\n' + userMsg.content
    : userMsg.content;

  const modelValue = parsed.model || 'claude-sonnet-4-6';

  const args = [
    '-p', fullPrompt,
    '--model', modelValue,
    '--output-format', 'stream-json',
    '--bare',
    '--verbose',
    '--dangerously-skip-permissions',
    '--no-session-persistence',
    '--disallowedTools', 'Bash', 'Edit', 'Write', 'Read', 'PowerShell',
    'Glob', 'Grep', 'WebFetch', 'WebSearch', 'NotebookEdit',
  ];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...CORS_HEADERS,
  });

  const child = spawn('claude', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let killed = false;

  const timer = setTimeout(() => {
    killed = true;
    child.kill('SIGKILL');
    if (!res.writableEnded) {
      res.write('data: ' + JSON.stringify({ error: 'claude timeout' }) + '\n\n');
      res.end();
    }
  }, CLAUDE_TIMEOUT_MS);

  let outputBuffer = '';

  child.stdout.on('data', (chunk) => {
    if (killed || res.writableEnded) return;
    const text = chunk.toString('utf-8');
    outputBuffer += text;

    // Extract content from stream-json format
    // Claude Code --output-format stream-json emits lines like:
    // {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]},"session_id":"..."}
    const lines = outputBuffer.split('\n');
    outputBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === 'assistant' && msg.message && msg.message.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              const sseData = JSON.stringify({
                choices: [{ delta: { content: block.text } }],
              });
              res.write('data: ' + sseData + '\n\n');
            }
          }
        }
        // Send usage info when available
        if (msg.type === 'result' && msg.usage) {
          const usageData = JSON.stringify({
            choices: [{ delta: {} }],
            usage: {
              prompt_tokens: msg.usage.input_tokens || 0,
              completion_tokens: msg.usage.output_tokens || 0,
            },
          });
          res.write('data: ' + usageData + '\n\n');
        }
      } catch (e) {
        // Not JSON, skip silently (e.g. system init lines from stream-json)
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf-8');
  console.log('[claude stderr]', text);
    // Claude CLI writes API errors to stderr, forward to client
    if (killed || res.writableEnded) return;
    const sseData = JSON.stringify({
      choices: [{ delta: { content: '' } }],
      error: text.substring(0, 500),
    });
    res.write('data: ' + sseData + '\n\n');
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    console.log('[claude close] model:', modelValue, 'exit code:', code);
    if (code !== 0 && !killed && !res.writableEnded) {
      const errSse = JSON.stringify({
        choices: [{ delta: {} }],
        error: 'claude exited with code ' + code,
      });
      res.write('data: ' + errSse + '\n\n');
    }
    // Flush remaining buffer
    if (outputBuffer.trim()) {
      const trimmed = outputBuffer.trim();
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === 'assistant' && msg.message && msg.message.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              const sseData = JSON.stringify({
                choices: [{ delta: { content: block.text } }],
              });
              res.write('data: ' + sseData + '\n\n');
            }
          }
        }
      } catch (e) {
        // Skip non-JSON lines in flush buffer
      }
    }
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  child.on('error', (err) => {
    clearTimeout(timer);
    if (!res.writableEnded) {
      const errData = JSON.stringify({ error: 'claude process error: ' + err.message });
      res.write('data: ' + errData + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  res.on('close', () => {
    clearTimeout(timer);
    if (!killed) {
      killed = true;
      child.kill('SIGKILL');
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  // Claude Code endpoint
  if (req.method === 'POST' && req.url === '/v1/claude-code') {
    let body = '';
    let bodySize = 0;
    let exceeded = false;

    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        if (exceeded) return;
        exceeded = true;
        res.writeHead(413, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: 'request body too large' }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const modelId = parsed.model;
        if (!modelId || !CLAUDE_MODELS.has(modelId)) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ error: 'unsupported claude model: ' + (modelId || 'none') }));
          return;
        }
        handleClaudeCodeRequest(parsed, res);
        console.log('[/v1/claude-code] spawn for model:', modelId);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // Allow frontend to register custom API hosts
  if (req.method === 'POST' && req.url === '/v1/hosts/allow') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const hostname = parsed.hostname;
        if (hostname) {
          dynamicAllowedHosts.add(hostname);
          res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ ok: true, allowed: [...dynamicAllowedHosts] }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ error: 'missing hostname' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // API proxy for external models
  if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
    let body = '';
    let bodySize = 0;
    let exceeded = false;

    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        if (exceeded) return;
        exceeded = true;
        res.writeHead(413, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: 'request body too large' }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const modelId = parsed.model;

        if (!modelId) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ error: 'missing model field' }));
          return;
        }

        // Reject claude models on external proxy endpoint
        if (CLAUDE_MODELS.has(modelId)) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ error: 'claude models must use /v1/claude-code endpoint' }));
          return;
        }

        // Inline credentials take priority over .env modelMap
        let targetUrl, apiKey;
        if (parsed.base_url && parsed.api_key) {
          const base = parsed.base_url.replace(/\/+$/, '');
          targetUrl = base + '/chat/completions';
          apiKey = parsed.api_key;
          // Strip credentials from forwarded body
          delete parsed.base_url;
          delete parsed.api_key;
        } else {
          const modelConf = modelMap[modelId];
          if (!modelConf) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
            res.end(JSON.stringify({ error: 'unknown model: ' + modelId + '. Available: ' + Object.keys(modelMap).join(', ') }));
            return;
          }
          targetUrl = modelConf.targetUrl;
          apiKey = modelConf.apiKey;
        }

        console.log('[/v1/chat/completions] proxy START model:', modelId, 'at:', new Date().toISOString());
        const url = new URL(targetUrl);
        if (!ALLOWED_HOSTS.includes(url.hostname) && !dynamicAllowedHosts.has(url.hostname)) {
          res.writeHead(403, { 'Content-Type': 'application/json', ...CORS_HEADERS });
          res.end(JSON.stringify({ error: 'host not allowed: ' + url.hostname }));
          return;
        }

        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        };

        const proxyReq = https.request(options, (proxyRes) => {
          console.log('[/v1/chat/completions] proxy RESPONSE model:', modelId, 'status:', proxyRes.statusCode, 'at:', new Date().toISOString());
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': proxyRes.headers['content-type'] || 'application/json',
            ...CORS_HEADERS,
          });
          proxyRes.pipe(res);
          proxyRes.on('error', () => { res.destroy(); });
        });

        proxyReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
          proxyReq.destroy(new Error('upstream timeout'));
        });

        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
            res.end(JSON.stringify({ error: err.message }));
          } else {
            res.destroy();
          }
        });

        proxyReq.write(JSON.stringify(parsed));
        proxyReq.end();
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // Static files
  if (req.method === 'GET') {
    const pathname = req.url.split('?')[0];
    serveStatic(pathname, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(JSON.stringify({ error: 'not found' }));
});

module.exports = { loadEnv, buildModelMap, CLAUDE_MODELS };

if (require.main === module) {
  server.listen(PROXY_PORT, () => {
    console.log(`Benchmark server running at http://localhost:${PROXY_PORT}`);
  });
}
