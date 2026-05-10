var blindMode = false, blindAssignments = [], selectedBlindVote = null, blindVoteDone = false;

function toggleBlindMode() {
    if (activeSession) return;
    blindMode = !blindMode;
    var btn = document.getElementById('blind-toggle');
    btn.classList.toggle('on', blindMode);
    var n = parseInt(document.getElementById('pane-count').value);
    if (blindMode) {
        var all = getAllModels();
        if (!all.length) {
            alert('请先加载模型');
            blindMode = false;
            btn.classList.remove('on');
            return;
        }
        var sh = shuffleArray(all);
        blindAssignments = [];
        var labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (var i = 0; i < n; i++) {
            var ne = document.getElementById('model-name-' + i), se = document.getElementById('select-' + i);
            if (!ne || !se) continue;
            se.value = sh[i % sh.length].id;
            se.style.display = 'none';
            ne.textContent = '模型 ' + labels[i];
            blindAssignments.push(sh[i % sh.length].id);
        }
        blindVoteDone = false;
        selectedBlindVote = null;
        buildScoreDrawer();
        setStatus('盲评模式 — 模型已随机分配');
    } else {
        blindAssignments = [];
        blindVoteDone = false;
        selectedBlindVote = null;
        for (var i = 0; i < n; i++) {
            var ne = document.getElementById('model-name-' + i), se = document.getElementById('select-' + i);
            if (!ne || !se) continue;
            se.style.display = '';
            var m = MODELS.find(function(m) { return m.id === se.value; });
            var c = getCustomModelConfig(se.value);
            ne.textContent = m ? getModelDisplayName(m.id, m.name) : c ? (c.display_name || c.id) : '-';
        }
        buildScoreDrawer();
        setStatus('盲评模式已关闭');
    }
}

function submitBlindVote(type) {
    if (!currentPrompt) return;
    if (type === 'tie') {
        BenchmarkStore.add('votes', {
            prompt_id: currentPrompt.id, prompt_name: currentPrompt.name,
            models: blindAssignments.slice(),
            model_names: blindAssignments.map(function(mid) {
                var m = MODELS.find(function(m) { return m.id === mid; });
                return m ? getModelDisplayName(m.id, m.name) : mid;
            }),
            vote: 'tie', winner: 'tie', timestamp: new Date().toISOString()
        });
        blindVoteDone = true;
        buildScoreDrawer();
        setStatus('投票: 平局');
        if (activeSession) setTimeout(revealBlind, 600);
        else setTimeout(function() { toggleBlindMode(); }, 600);
        return;
    }
    if (selectedBlindVote === null) return;
    var labels = blindAssignments.map(function(mid) {
        var m = MODELS.find(function(m) { return m.id === mid; });
        return m ? getModelDisplayName(m.id, m.name) : mid;
    });
    BenchmarkStore.add('votes', {
        prompt_id: currentPrompt.id, prompt_name: currentPrompt.name,
        models: blindAssignments.slice(), model_names: labels.slice(),
        vote: String(selectedBlindVote), winner: blindAssignments[selectedBlindVote] || '',
        timestamp: new Date().toISOString()
    });
    blindVoteDone = true;
    buildScoreDrawer();
    setStatus('投票: ' + labels[selectedBlindVote] + ' 胜');
    if (activeSession) setTimeout(revealBlind, 600);
    else setTimeout(function() { toggleBlindMode(); }, 600);
}

function revealBlind() {
    for (var i = 0; i < blindAssignments.length; i++) {
        var ne = document.getElementById('model-name-' + i);
        var mid = blindAssignments[i];
        var m = MODELS.find(function(m) { return m.id === mid; });
        var c = !m ? getCustomModelConfig(mid) : null;
        var lb = m ? getModelDisplayName(m.id, m.name) : (c ? (c.display_name || c.id) : mid);
        if (ne) { ne.textContent = lb; ne.classList.add('blind-reveal'); }
    }
    var btn = document.getElementById('blind-toggle');
    if (btn) { btn.textContent = '已揭晓'; btn.classList.add('on'); }
}
