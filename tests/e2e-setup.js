/**
 * E2E test helper: serves static files and a mock LLM proxy on port 3457.
 *
 * The mock proxy returns canned SSE responses so no real API keys are needed.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3457;
const ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

const MOCK_SSE_RESPONSES = {
    'deepseek-v4-flash': 'Hello from DeepSeek-V4-Flash mock',
};

function serveStatic(res, filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (e) {
        res.writeHead(500);
        res.end('file read error');
    }
}

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
        } else {
            // Serve css/, js/, lib/, and root files
            filePath = path.join(ROOT, req.url.replace(/^\//, ''));
        }

        // Prevent directory traversal
        if (!filePath.startsWith(ROOT)) {
            res.writeHead(403);
            return res.end('forbidden');
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            return serveStatic(res, filePath);
        }

        res.writeHead(404);
        return res.end('not found');
    }

    // Mock LLM proxy endpoint
    if (req.method === 'POST' && (req.url === '/v1/chat/completions' || req.url === '/v1/claude-code')) {
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

server.listen(PORT, '127.0.0.1', () => {
    console.log('E2E test server running at http://127.0.0.1:' + PORT);
});
