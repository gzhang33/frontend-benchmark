var activeSession = null;

function openSessionModal() {
    if (activeSession) { alert('请先结束当前会话'); return; }
    var el = document.getElementById('session-model-list');
    el.textContent = '';
    getAllModels().forEach(function(m) {
        var item = document.createElement('div');
        item.className = 'session-item';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = m.id;
        cb.dataset.displayName = m.display_name || m.name || m.id;
        cb.dataset.provider = m.provider || 'custom';
        var t = document.createElement('span');
        t.textContent = m.display_name || m.name || m.id;
        item.appendChild(cb);
        item.appendChild(t);
        el.appendChild(item);
    });
    document.getElementById('session-error').style.display = 'none';
    document.getElementById('session-blind-mode').checked = false;
    document.getElementById('session-pane-count').value = '2';
    document.getElementById('session-modal').classList.add('show');
}

function closeSessionModal() {
    document.getElementById('session-modal').classList.remove('show');
}

function startSession() {
    var cbs = document.querySelectorAll('#session-model-list input[type="checkbox"]:checked');
    var sm = [];
    cbs.forEach(function(cb) {
        sm.push({ id: cb.value, display_name: cb.dataset.displayName, provider: cb.dataset.provider });
    });
    var err = document.getElementById('session-error');
    if (sm.length < 2) { err.textContent = '请至少选择 2 个模型'; err.style.display = 'block'; return; }
    var pc = parseInt(document.getElementById('session-pane-count').value);
    if (sm.length < pc) { err.textContent = '模型数(' + sm.length + ')少于分屏数(' + pc + ')'; err.style.display = 'block'; return; }
    var blind = document.getElementById('session-blind-mode').checked;
    var models = blind ? shuffleArray(sm) : sm.slice(0, pc);
    activeSession = {
        id: 'session-' + Date.now(),
        models: models.slice(0, pc),
        blindMode: blind,
        paneCount: pc,
        createdAt: new Date().toISOString(),
        status: 'active'
    };
    BenchmarkStore.put('sessions', activeSession).catch(function(e) { console.error(e); });
    localStorage.setItem(SESSION_KEY, activeSession.id);
    closeSessionModal();
    applySessionUI();
    setStatus('会话已开始 — ' + pc + ' 个模型已锁定');
}

function applySessionUI() {
    if (!activeSession) return;
    document.getElementById('pane-count').value = String(activeSession.paneCount);
    document.getElementById('pane-count').disabled = true;
    blindMode = activeSession.blindMode;
    blindAssignments = activeSession.models.map(function(m) { return m.id; });
    var btn = document.getElementById('blind-toggle');
    btn.disabled = true;
    btn.textContent = activeSession.blindMode ? '盲评: 开' : '盲评: 关';
    btn.classList.toggle('on', activeSession.blindMode);
    rebuildPanes();
    if (activeSession.blindMode) {
        var labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (var i = 0; i < activeSession.paneCount; i++) {
            var se = document.getElementById('select-' + i), ne = document.getElementById('model-name-' + i);
            if (se) se.style.display = 'none';
            if (ne) ne.textContent = '模型 ' + labels[i];
        }
    }
    document.getElementById('session-btn').style.display = 'none';
    document.getElementById('end-session-btn').style.display = '';
    document.getElementById('app-header').style.borderBottomColor = 'var(--accent)';
    buildScoreDrawer();
}

function endSession() {
    if (!activeSession) return;
    activeSession.status = 'completed';
    BenchmarkStore.put('sessions', activeSession).catch(function() {});
    activeSession = null;
    blindMode = false;
    blindAssignments = [];
    localStorage.removeItem(SESSION_KEY);
    restoreFreeUI();
    setStatus('会话已结束');
}

function restoreFreeUI() {
    document.getElementById('pane-count').disabled = false;
    var btn = document.getElementById('blind-toggle');
    btn.textContent = '盲评';
    btn.disabled = false;
    btn.classList.remove('on');
    document.getElementById('session-btn').style.display = '';
    document.getElementById('end-session-btn').style.display = 'none';
    document.getElementById('app-header').style.borderBottomColor = '';
    rebuildPanes();
}

async function restoreSession() {
    var sid = localStorage.getItem(SESSION_KEY);
    if (!sid) return;
    try {
        var s = await BenchmarkStore.get('sessions', sid);
        if (!s || s.status !== 'active') { localStorage.removeItem(SESSION_KEY); return; }
        activeSession = s;
        applySessionUI();
        setStatus('已恢复会话 — ' + s.paneCount + ' 个模型');
    } catch (e) {
        console.error(e);
        localStorage.removeItem(SESSION_KEY);
    }
}
