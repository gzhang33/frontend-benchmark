function loadApiConfig() {
    var el = document.getElementById('provider-presets');
    el.textContent = '';
    PROVIDER_PRESETS.forEach(function(p) {
        var b = document.createElement('button');
        b.className = 'provider-preset';
        b.textContent = p.name;
        b.onclick = function() {
            if (p.baseUrl) document.getElementById('custom-base-url').value = p.baseUrl;
            document.getElementById('custom-model-id').focus();
        };
        el.appendChild(b);
    });
    renderCustomModelList();
    renderClaudeSpawnToggles();
    renderOpenCodeSpawnToggles();
}

function renderCustomModelList() {
    var el = document.getElementById('custom-model-list');
    el.textContent = '';
    getCustomModels().forEach(function(m) {
        var item = document.createElement('div');
        item.className = 'cm-item';
        var info = document.createElement('div');
        info.className = 'info';
        var nm = document.createElement('div');
        nm.className = 'name';
        nm.textContent = m.display_name || m.id;
        var mt = document.createElement('div');
        mt.className = 'meta';
        try { mt.textContent = m.id + ' @ ' + new URL(m.base_url).hostname; } catch (e) { mt.textContent = m.id; }
        info.appendChild(nm);
        info.appendChild(mt);
        var del = document.createElement('button');
        del.className = 'cm-del';
        del.textContent = '删除';
        del.onclick = function() { removeCustomModel(m.id); };
        item.appendChild(info);
        item.appendChild(del);
        el.appendChild(item);
    });
}

async function addCustomModel() {
    if (activeSession) { alert('会话期间无法添加'); return; }
    var baseUrl = document.getElementById('custom-base-url').value.trim();
    var apiKey = document.getElementById('custom-api-key').value.trim();
    var modelId = document.getElementById('custom-model-id').value.trim();
    var displayName = document.getElementById('custom-model-name').value.trim() || modelId;
    if (!baseUrl || !apiKey || !modelId) { alert('请填写完整'); return; }
    try {
        var h = new URL(baseUrl).hostname;
        await fetch('/v1/hosts/allow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostname: h })
        });
    } catch (e) {}
    var models = getCustomModels();
    var idx = models.findIndex(function(m) { return m.id === modelId; });
    var entry = { id: modelId, display_name: displayName, base_url: baseUrl, api_key: apiKey, provider: 'custom' };
    if (idx >= 0) models[idx] = entry; else models.push(entry);
    saveCustomModels(models);
    ['custom-base-url', 'custom-api-key', 'custom-model-id', 'custom-model-name'].forEach(function(id) {
        document.getElementById(id).value = '';
    });
    renderCustomModelList();
    rebuildPanes();
    setStatus('已添加: ' + displayName);
}

function removeCustomModel(id) {
    if (activeSession) { alert('会话期间无法删除'); return; }
    saveCustomModels(getCustomModels().filter(function(m) { return m.id !== id; }));
    renderCustomModelList();
    rebuildPanes();
}

function toggleApiConfig() {
    document.getElementById('api-dropdown').classList.toggle('show');
}

function renderOpenCodeSpawnToggles() {
    var el = document.getElementById('opencode-spawn-toggles');
    if (!el) return;
    el.textContent = '';
    var state = getOpenCodeSpawnState();
    var models = [
        { id: 'minimax-m2.5-free', name: 'MiniMax M2.5 Free' },
        { id: 'hy3-preview-free', name: 'Hy3 Preview Free' },
        { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super Free' }
    ];
    models.forEach(function(m) {
        var row = document.createElement('div');
        row.className = 'cm-item';
        row.style.cursor = 'default';
        var info = document.createElement('div');
        info.className = 'info';
        var nm = document.createElement('div');
        nm.className = 'name';
        nm.textContent = m.name;
        var mt = document.createElement('div');
        mt.className = 'meta';
        mt.textContent = 'OpenCode Zen · 免费';
        info.appendChild(nm);
        info.appendChild(mt);
        var toggle = document.createElement('label');
        toggle.className = 'toggle-switch';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state[m.id] !== false;
        cb.addEventListener('change', function() {
            var s = getOpenCodeSpawnState();
            s[m.id] = cb.checked;
            saveOpenCodeSpawnState(s);
            rebuildPanes();
        });
        var slider = document.createElement('span');
        slider.className = 'toggle-slider';
        toggle.appendChild(cb);
        toggle.appendChild(slider);
        row.appendChild(info);
        row.appendChild(toggle);
        el.appendChild(row);
    });
}

function renderClaudeSpawnToggles() {
    var el = document.getElementById('claude-spawn-toggles');
    if (!el) return;
    el.textContent = '';
    var state = getClaudeSpawnState();
    var models = [
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
        { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' }
    ];
    models.forEach(function(m) {
        var row = document.createElement('div');
        row.className = 'cm-item';
        row.style.cursor = 'default';
        var info = document.createElement('div');
        info.className = 'info';
        var nm = document.createElement('div');
        nm.className = 'name';
        nm.textContent = m.name;
        var mt = document.createElement('div');
        mt.className = 'meta';
        mt.textContent = '本地 CLI · 无需 API Key';
        info.appendChild(nm);
        info.appendChild(mt);
        var toggle = document.createElement('label');
        toggle.className = 'toggle-switch';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state[m.id] !== false;
        cb.addEventListener('change', function() {
            var s = getClaudeSpawnState();
            s[m.id] = cb.checked;
            saveClaudeSpawnState(s);
            rebuildPanes();
        });
        var slider = document.createElement('span');
        slider.className = 'toggle-slider';
        toggle.appendChild(cb);
        toggle.appendChild(slider);
        row.appendChild(info);
        row.appendChild(toggle);
        el.appendChild(row);
    });
}
