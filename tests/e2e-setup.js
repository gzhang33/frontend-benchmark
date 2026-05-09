/**
 * E2E test helper: serves index.html + lib/store.js + a mock prompts.json
 * and a mock LLM proxy on port 3457.
 *
 * The mock proxy returns canned SSE responses so no real API keys are needed.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3457;
const ROOT = path.resolve(__dirname, '..');

const MOCK_SSE_RESPONSES = {
  'deepseek-v4-flash': 'Hello from DeepSeek-V4-Flash mock',
};

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Static files
  if (req.method === 'GET') {
    let filePath;
    if (req.url === '/' || req.url === '/index.html') {
      filePath = path.join(ROOT, 'index.html');
    } else if (req.url === '/lib/store.js') {
      filePath = path.join(ROOT, 'lib', 'store.js');
    } else if (req.url === '/prompts.json') {
      filePath = path.join(ROOT, 'prompts.json');
    } else {
      res.writeHead(404);
      return res.end('not found');
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    } catch (e) {
      res.writeHead(500);
      res.end('file read error');
      return;
    }
  }

  // Mock LLM proxy endpoint
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let modelId = 'unknown';
      try { modelId = JSON.parse(body).model; } catch (e) {}

      const mockText = MOCK_SSE_RESPONSES[modelId] || 'Mock response';
      const chunks = mockText.split(' ');

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });

      let sent = 0;
      const interval = setInterval(() => {
        if (sent >= chunks.length) {
          res.write('data: [DONE]\n\n');
          res.end();
          clearInterval(interval);
          return;
        }
        const payload = JSON.stringify({
          choices: [{ delta: { content: chunks[sent] + ' ' }, index: 0 }],
          model: modelId,
        });
        res.write('data: ' + payload + '\n\n');
        sent++;
      }, 20);
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log('E2E test server running at http://localhost:' + PORT);
});
