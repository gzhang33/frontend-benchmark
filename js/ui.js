var MODELS = [], promptsData = [], currentPrompt = null;
var batchGeneratedIds = [];
var scoredPromptIds = new Set();
var promptCache = {};

function switchTab(id) {
    document.querySelectorAll('.header-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === id);
    });
    document.querySelectorAll('.tab-view').forEach(function(v) {
        v.classList.toggle('active', v.id === 'tab-' + id);
    });
    if (id === 'stats') loadStats();
    if (id === 'history') loadHistory();
}

function toggleSidebar() {
    document.getElementById('tc-sidebar').classList.toggle('collapsed');
}

var scoreDrawerOpen = false;
function toggleScoreDrawer() {
    scoreDrawerOpen = !scoreDrawerOpen;
    document.getElementById('score-drawer').classList.toggle('closed', !scoreDrawerOpen);
    document.getElementById('drawer-toggle').classList.toggle('open', scoreDrawerOpen);
}

async function loadData() {
    try {
        var r = await fetch('./prompts.json');
        var d = await r.json();
        MODELS = d.models || [];
        promptsData = d.prompts || [];
    } catch (e) { console.error(e); promptsData = []; }
    var customPrompts = getCustomPrompts();
    customPrompts.forEach(function(cp) {
        if (!promptsData.find(function(p) { return p.id === cp.id; })) promptsData.push(cp);
    });
    document.querySelector('.tc-count').textContent = promptsData.length;
}

function renderList() {
    var el = document.getElementById('tc-list');
    while (el.firstChild) el.removeChild(el.firstChild);
    var customIds = getCustomPrompts().map(function(p) { return p.id; });
    promptsData.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'tc-item';
        row.dataset.promptId = item.id;
        if (customIds.indexOf(item.id) >= 0) row.classList.add('custom');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'tc-check';
        cb.dataset.promptId = item.id;
        cb.onclick = function(e) { e.stopPropagation(); };
        row.appendChild(cb);
        row.setAttribute('data-prompt-id', item.id);
        var info = document.createElement('div');
        info.className = 'tc-info';
        info.onclick = function() { selectPrompt(item, row); };
        var nm = document.createElement('div');
        nm.className = 'tc-name';
        nm.textContent = item.name;
        var dm = document.createElement('div');
        dm.className = 'tc-dim';
        dm.textContent = item.dimension;
        info.appendChild(nm);
        info.appendChild(dm);
        row.appendChild(info);
        var idEl = document.createElement('span');
        idEl.className = 'tc-id';
        idEl.textContent = item.id;
        if (customIds.indexOf(item.id) >= 0) {
            var del = document.createElement('button');
            del.className = 'tc-del';
            del.textContent = '×';
            del.title = '删除';
            del.onclick = (function(pid, rowEl) {
                return function(e) { e.stopPropagation(); removeCustomPrompt(pid, rowEl); };
            })(item.id, row);
            row.appendChild(del);
        }
        row.appendChild(idEl);
        el.appendChild(row);
    });
    document.querySelector('.tc-count').textContent = promptsData.length;
}

function openPromptModal() {
    document.getElementById('custom-prompt-name').value = '';
    document.getElementById('custom-prompt-dimension').value = '';
    document.getElementById('custom-prompt-type').value = 'html';
    document.getElementById('custom-prompt-checks').value = '';
    document.getElementById('custom-prompt-text').value = '';
    document.getElementById('prompt-modal-error').style.display = 'none';
    document.getElementById('prompt-modal').classList.add('show');
}
function closePromptModal() {
    document.getElementById('prompt-modal').classList.remove('show');
}

function addCustomPrompt() {
    var name = document.getElementById('custom-prompt-name').value.trim();
    var dimension = document.getElementById('custom-prompt-dimension').value.trim() || '自定义';
    var outputType = document.getElementById('custom-prompt-type').value;
    var checksText = document.getElementById('custom-prompt-checks').value.trim();
    var prompt = document.getElementById('custom-prompt-text').value.trim();
    var errEl = document.getElementById('prompt-modal-error');
    if (!name || !prompt) { errEl.textContent = '名称和提示词不能为空'; errEl.style.display = 'block'; return; }
    var checks = checksText ? checksText.split('\n').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    var id = 'custom-' + Date.now();
    var entry = { id: id, name: name, dimension: dimension, output_type: outputType, prompt: prompt, checks: checks };
    var customs = getCustomPrompts();
    customs.push(entry);
    saveCustomPrompts(customs);
    if (!promptsData.find(function(p) { return p.id === id; })) promptsData.push(entry);
    renderList();
    closePromptModal();
    setStatus('已添加用例: ' + name);
}

function removeCustomPrompt(pid, rowEl) {
    var customs = getCustomPrompts().filter(function(p) { return p.id !== pid; });
    saveCustomPrompts(customs);
    promptsData = promptsData.filter(function(p) { return p.id !== pid; });
    if (currentPrompt && currentPrompt.id === pid) {
        currentPrompt = promptsData.length ? promptsData[0] : null;
    }
    renderList();
    setStatus('已删除用例');
}

function selectPrompt(item, el) {
    currentPrompt = item;
    blindVoteDone = false;
    selectedBlindVote = null;
    document.querySelectorAll('.tc-item').forEach(function(e) { e.classList.remove('active'); });
    if (el) el.classList.add('active');
    restorePromptPreview(item);
    buildScoreDrawer();
    if (!scoreDrawerOpen && batchGeneratedIds.length) toggleScoreDrawer();
}
