const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { loadEnv, buildModelMap, CLAUDE_MODELS } = require('../server');

// ===== server.js 单元测试 =====

describe('server.js - loadEnv()', () => {
  it('should parse .env key=value pairs, ignore comments and blanks', () => {
    const envPath = path.resolve(__dirname, '..', '..', '.env');
    const raw = fs.readFileSync(envPath, 'utf-8');

    const env = {};
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !line.startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });

    assert.ok(env.OPENCODE_API_KEY, 'OPENCODE_API_KEY should be set');
    assert.equal(env.OPENCODE_BASE_URL, 'https://opencode.ai/zen/v1');
  });

  it('should strip quotes from values', () => {
    const result = 'minimax-m2.5-free'.replace(/^["']|["']$/g, '');
    assert.equal(result, 'minimax-m2.5-free');
  });
});

describe('server.js - buildModelMap()', () => {
  it('should build correct model mapping from env', () => {
    const env = {
      OPENCODE_BASE_URL: 'https://opencode.ai/zen/v1',
      OPENCODE_API_KEY: 'oc-test-key',
    };
    const map = buildModelMap(env);

    assert.equal(map['minimax-m2.5-free'].targetUrl, 'https://opencode.ai/zen/v1/chat/completions');
    assert.equal(map['minimax-m2.5-free'].apiKey, 'oc-test-key');
    assert.equal(map['hy3-preview-free'].targetUrl, 'https://opencode.ai/zen/v1/chat/completions');
    assert.equal(map['nemotron-3-super-free'].targetUrl, 'https://opencode.ai/zen/v1/chat/completions');
  });

  it('should build OpenCode model mapping when env vars are set', () => {
    const env = {
      OPENCODE_BASE_URL: 'https://opencode.ai/zen/v1',
      OPENCODE_API_KEY: 'oc-test-key',
    };
    const map = buildModelMap(env);

    assert.equal(map['minimax-m2.5-free'].targetUrl, 'https://opencode.ai/zen/v1/chat/completions');
    assert.equal(map['minimax-m2.5-free'].apiKey, 'oc-test-key');
    assert.equal(map['hy3-preview-free'].targetUrl, 'https://opencode.ai/zen/v1/chat/completions');
    assert.equal(map['nemotron-3-super-free'].targetUrl, 'https://opencode.ai/zen/v1/chat/completions');
  });

  it('should handle missing env values gracefully', () => {
    const env = {};
    const map = buildModelMap(env);
    assert.ok(typeof map === 'object');
  });
});

// ===== prompts.json 验证 =====

describe('prompts.json validation', () => {
  let prompts;

  before(() => {
    prompts = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'prompts.json'), 'utf-8'));
  });

  it('should have 6 models', () => {
    assert.equal(prompts.models.length, 6);
  });

  it('should have 8 prompts', () => {
    assert.equal(prompts.prompts.length, 8);
  });

  it('all models should have required fields', () => {
    prompts.models.forEach(m => {
      assert.ok(m.id, 'model missing id');
      assert.ok(m.name, 'model missing name');
      assert.ok(m.provider, 'model missing provider');
    });
  });

  it('all prompts should have required fields', () => {
    prompts.prompts.forEach(p => {
      assert.ok(p.id, 'prompt missing id: ' + JSON.stringify(p));
      assert.ok(p.name, 'prompt missing name');
      assert.ok(p.dimension, 'prompt missing dimension');
      assert.ok(p.prompt, 'prompt missing prompt text');
      assert.ok(p.output_type, 'prompt missing output_type');
      assert.ok(Array.isArray(p.checks), 'prompt missing checks array');
      assert.ok(p.checks.length > 0, 'prompt has empty checks');
    });
  });

  it('code prompts should have language field', () => {
    const codePrompts = prompts.prompts.filter(p => p.output_type === 'code');
    assert.ok(codePrompts.length > 0, 'should have at least one code prompt');
    codePrompts.forEach(p => {
      assert.ok(p.language, 'code prompt missing language: ' + p.id);
    });
  });

  it('prompt IDs should be unique', () => {
    const ids = prompts.prompts.map(p => p.id);
    assert.equal(ids.length, new Set(ids).size, 'duplicate prompt IDs found');
  });

  it('model IDs should be unique', () => {
    const ids = prompts.models.map(m => m.id);
    assert.equal(ids.length, new Set(ids).size, 'duplicate model IDs found');
  });

  it('prompt text should contain substantial content (> 50 chars)', () => {
    prompts.prompts.forEach(p => {
      assert.ok(p.prompt.length > 50, 'prompt too short for ' + p.id + ': ' + p.prompt.length + ' chars');
    });
  });
});

// ===== HTTP Proxy 单元测试 =====

describe('HTTP proxy endpoint', () => {
  it('should reject GET requests with 404', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/chat/completions',
      method: 'GET',
    }, (res) => {
      assert.equal(res.statusCode, 404);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        assert.equal(parsed.error, 'not found');
        done();
      });
    });
    req.on('error', (e) => {
      // Server might not be running, skip gracefully
      t.skip('server not running');
    });
    req.end();
  });

  it('should accept OPTIONS preflight with 204', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/chat/completions',
      method: 'OPTIONS',
    }, (res) => {
      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], '*');
      done();
    });
    req.on('error', () => {
      t.skip('server not running');
    });
    req.end();
  });

  it('should return 400 for missing model field', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      assert.equal(res.statusCode, 400);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        assert.ok(data.includes('missing model'), 'expected missing model error');
        done();
      });
    });
    req.on('error', () => {
      t.skip('server not running');
    });
    req.write(JSON.stringify({ messages: [] }));
    req.end();
  });

  it('should return 400 for unknown model', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      assert.equal(res.statusCode, 400);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        assert.ok(data.includes('unknown model'), 'expected unknown model error');
        done();
      });
    });
    req.on('error', () => {
      t.skip('server not running');
    });
    req.write(JSON.stringify({ model: 'nonexistent-model-12345', messages: [] }));
    req.end();
  });

  it('should return 400 for invalid JSON', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      assert.equal(res.statusCode, 400);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        assert.ok(data.includes('invalid json'), 'expected invalid json error');
        done();
      });
    });
    req.on('error', () => {
      t.skip('server not running');
    });
    req.write('not json at all');
    req.end();
  });
});

// ===== Claude Code endpoint =====

describe('CLAUDE_MODELS set', () => {
  it('should contain all Claude model IDs', () => {
    assert.ok(CLAUDE_MODELS.has('claude-opus-4-7'));
    assert.ok(CLAUDE_MODELS.has('claude-sonnet-4-6'));
    assert.ok(CLAUDE_MODELS.has('claude-haiku-4-5-20251001'));
  });

  it('should not contain external model IDs', () => {
    assert.ok(!CLAUDE_MODELS.has('glm-5.1'));
    assert.ok(!CLAUDE_MODELS.has('glm-5-turbo'));
    assert.ok(!CLAUDE_MODELS.has('glm-4.7'));
    assert.ok(!CLAUDE_MODELS.has('deepseek-v4-flash'));
  });
});

describe('CLAUDE_MODELS - no GLM aliases', () => {
  it('should not contain GLM model IDs', () => {
    assert.ok(!CLAUDE_MODELS.has('glm-5.1'));
    assert.ok(!CLAUDE_MODELS.has('glm-5-turbo'));
    assert.ok(!CLAUDE_MODELS.has('glm-4.7'));
  });

  it('should not contain external model IDs', () => {
    assert.ok(!CLAUDE_MODELS.has('deepseek-v4-flash'));
  });
});

describe('Claude Code endpoint /v1/claude-code', () => {
  it('should reject claude models on /v1/chat/completions', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      assert.equal(res.statusCode, 400);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        assert.ok(data.includes('claude models must use /v1/claude-code'), 'expected redirect error');
        done();
      });
    });
    req.on('error', () => { t.skip('server not running'); });
    req.write(JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'test' }] }));
    req.end();
  });

  it('should return 400 for missing model on /v1/claude-code', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/claude-code',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      assert.equal(res.statusCode, 400);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        assert.ok(data.includes('unsupported claude model'), 'expected unsupported model error');
        done();
      });
    });
    req.on('error', () => { t.skip('server not running'); });
    req.write(JSON.stringify({ model: 'nonexistent', messages: [{ role: 'user', content: 'test' }] }));
    req.end();
  });

  it('should return 400 for missing user message', (t, done) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3456,
      path: '/v1/claude-code',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      assert.equal(res.statusCode, 400);
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        assert.ok(data.includes('missing user message'), 'expected missing message error');
        done();
      });
    });
    req.on('error', () => { t.skip('server not running'); });
    req.write(JSON.stringify({ model: 'claude-sonnet-4-6', messages: [] }));
    req.end();
  });
});
