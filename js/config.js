var PROXY_URL = '/v1/chat/completions';
var CLAUDE_URL = '/v1/claude-code';

var CLAUDE_MODELS = new Set([
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001'
]);


var PROVIDER_PRESETS = [
    { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
    { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
    { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
    { name: 'Together', baseUrl: 'https://api.together.xyz/v1' },
    { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
    { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1' },
    { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { name: '自定义', baseUrl: '' }
];

var CUSTOM_KEY = 'benchmark_custom_models';
var SESSION_KEY = 'benchmark_active_session_id';
var CUSTOM_PROMPTS_KEY = 'benchmark_custom_prompts';
var CLAUDE_SPAWN_KEY = 'benchmark_claude_spawn';
var OPENCODE_SPAWN_KEY = 'benchmark_opencode_spawn';

function isClaudeModel(id) { return CLAUDE_MODELS.has(id); }
function getModelDisplayName(id, fb) { return fb || id; }

function getClaudeSpawnState() {
    try {
        var saved = JSON.parse(localStorage.getItem(CLAUDE_SPAWN_KEY));
        if (saved && typeof saved === 'object') return saved;
    } catch (e) {}
    return { 'claude-opus-4-7': true, 'claude-sonnet-4-6': true, 'claude-haiku-4-5-20251001': true };
}
function saveClaudeSpawnState(state) { localStorage.setItem(CLAUDE_SPAWN_KEY, JSON.stringify(state)); }
function isClaudeSpawnEnabled(id) { return getClaudeSpawnState()[id] !== false; }

function getOpenCodeSpawnState() {
    try {
        var saved = JSON.parse(localStorage.getItem(OPENCODE_SPAWN_KEY));
        if (saved && typeof saved === 'object') return saved;
    } catch (e) {}
    return { 'minimax-m2.5-free': true, 'hy3-preview-free': true, 'nemotron-3-super-free': true };
}
function saveOpenCodeSpawnState(state) { localStorage.setItem(OPENCODE_SPAWN_KEY, JSON.stringify(state)); }
function isOpenCodeSpawnEnabled(id) { return getOpenCodeSpawnState()[id] !== false; }

function getCustomModels() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; }
    catch (e) { return []; }
}
function saveCustomModels(m) { localStorage.setItem(CUSTOM_KEY, JSON.stringify(m)); }
function getCustomPrompts() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_PROMPTS_KEY)) || []; }
    catch (e) { return []; }
}
function saveCustomPrompts(p) { localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(p)); }
function getAllModels() {
    var spawnState = getClaudeSpawnState();
    var ocState = getOpenCodeSpawnState();
    return MODELS.filter(function(m) {
        if (m.provider === 'claude') return spawnState[m.id] !== false;
        if (m.provider === 'opencode') return ocState[m.id] !== false;
        return true;
    }).concat(getCustomModels());
}
function getCustomModelConfig(id) {
    return getCustomModels().find(function(m) { return m.id === id; }) || null;
}
