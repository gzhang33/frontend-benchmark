function getPaneModels() {
    var n = parseInt(document.getElementById('pane-count').value), models = [], labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i = 0; i < n; i++) {
        var se = document.getElementById('select-' + i);
        if (!se) continue;
        var mid = se.value;
        var mo = MODELS.find(function(m) { return m.id === mid; });
        var cu = getCustomModelConfig(mid);
        var nm = blindMode
            ? '模型 ' + labels[i]
            : mo ? getModelDisplayName(mo.id, mo.name) : cu ? (cu.display_name || cu.id) : mid;
        models.push({ paneIdx: i, modelId: mid, displayName: nm });
    }
    return models;
}

function buildScoreDrawer() {
    var body = document.getElementById('drawer-body'), footer = document.getElementById('drawer-footer');
    body.textContent = '';
    if (!currentPrompt) {
        body.appendChild(createEmptyState('选择测试用例后显示评分'));
        footer.style.display = 'none';
        return;
    }
    var isBatch = batchGeneratedIds.length > 0;
    var batchIdx = batchGeneratedIds.indexOf(currentPrompt.id);
    var scoredCount = scoredPromptIds.size;
    if (isBatch) {
        var nav = document.createElement('div');
        nav.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 10px;background:var(--bg-2);border-radius:8px;border:1px solid var(--border-1);';
        var prevBtn = document.createElement('button');
        prevBtn.className = 'icon-btn';
        prevBtn.disabled = batchIdx <= 0;
        prevBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>';
        prevBtn.onclick = function() {
            if (batchIdx > 0) {
                var prev = promptsData.find(function(p) { return p.id === batchGeneratedIds[batchIdx - 1]; });
                if (prev) selectPrompt(prev, document.querySelector('.tc-item[data-prompt-id="' + prev.id + '"]'));
            }
        };
        var info = document.createElement('span');
        info.style.cssText = 'flex:1;text-align:center;font-size:12px;font-family:"Geist Mono",monospace;color:var(--text-2);';
        info.textContent = (batchIdx + 1) + ' / ' + batchGeneratedIds.length;
        var nextBtn = document.createElement('button');
        nextBtn.className = 'icon-btn';
        nextBtn.disabled = batchIdx >= batchGeneratedIds.length - 1;
        nextBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';
        nextBtn.onclick = function() {
            if (batchIdx < batchGeneratedIds.length - 1) {
                var next = promptsData.find(function(p) { return p.id === batchGeneratedIds[batchIdx + 1]; });
                if (next) selectPrompt(next, document.querySelector('.tc-item[data-prompt-id="' + next.id + '"]'));
            }
        };
        nav.appendChild(prevBtn);
        nav.appendChild(info);
        nav.appendChild(nextBtn);
        body.appendChild(nav);
        var bar = document.createElement('div');
        bar.style.cssText = 'height:3px;border-radius:2px;background:var(--bg-4);margin-bottom:12px;overflow:hidden;';
        var fill = document.createElement('div');
        fill.style.cssText = 'height:100%;border-radius:2px;background:linear-gradient(90deg,var(--accent),var(--green));transition:width 0.3s ease;width:' + (batchGeneratedIds.length > 0 ? scoredCount / batchGeneratedIds.length * 100 : 0) + '%;';
        bar.appendChild(fill);
        body.appendChild(bar);
    }
    var card = document.createElement('div');
    card.className = 'prompt-card';
    var hdr = document.createElement('div');
    hdr.className = 'prompt-card-header';
    var dim = document.createElement('span');
    dim.className = 'dim-badge';
    dim.textContent = currentPrompt.dimension;
    var id = document.createElement('span');
    id.className = 'id-badge';
    id.textContent = currentPrompt.id;
    hdr.appendChild(dim);
    hdr.appendChild(id);
    card.appendChild(hdr);
    var nm = document.createElement('div');
    nm.className = 'prompt-card-name';
    nm.textContent = currentPrompt.name;
    card.appendChild(nm);
    var txt = document.createElement('div');
    txt.className = 'prompt-card-text';
    txt.textContent = currentPrompt.prompt;
    card.appendChild(txt);
    var cpBtn = document.createElement('button');
    cpBtn.className = 'copy-btn';
    var cpSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cpSvg.setAttribute('width', '12');
    cpSvg.setAttribute('height', '12');
    cpSvg.setAttribute('fill', 'none');
    cpSvg.setAttribute('stroke', 'currentColor');
    cpSvg.setAttribute('viewBox', '0 0 24 24');
    var cpPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cpPath.setAttribute('stroke-linecap', 'round');
    cpPath.setAttribute('stroke-linejoin', 'round');
    cpPath.setAttribute('stroke-width', '2');
    cpPath.setAttribute('d', 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z');
    cpSvg.appendChild(cpPath);
    cpBtn.appendChild(cpSvg);
    cpBtn.appendChild(document.createTextNode(' 复制'));
    cpBtn.onclick = function() {
        navigator.clipboard.writeText(currentPrompt.prompt).then(function() {
            cpBtn.textContent = '已复制';
            setTimeout(function() {
                cpBtn.textContent = '';
                cpBtn.appendChild(cpSvg);
                cpBtn.appendChild(document.createTextNode(' 复制'));
            }, 2000);
        });
    };
    card.appendChild(cpBtn);
    body.appendChild(card);
    var pms = getPaneModels(), checks = currentPrompt.checks;
    if (!checks || !checks.length) {
        var p = document.createElement('p');
        p.style.cssText = 'font-size:12px;color:var(--text-3);margin-top:12px;';
        p.textContent = '当前用例无检查点';
        body.appendChild(p);
        footer.style.display = 'none';
        return;
    }
    pms.forEach(function(pm, pi) {
        var div = document.createElement('div');
        div.className = 'score-model-divider';
        var sp = document.createElement('span');
        sp.textContent = pm.displayName;
        div.appendChild(sp);
        body.appendChild(div);
        checks.forEach(function(ch, ci) {
            var row = document.createElement('div');
            row.className = 'score-row';
            var lb = document.createElement('span');
            lb.className = 'score-label';
            lb.textContent = ch;
            var btns = document.createElement('div');
            btns.className = 'score-btns';
            ['pass', 'partial', 'fail'].forEach(function(v) {
                var b = document.createElement('button');
                b.className = 'sc-btn';
                b.textContent = v === 'pass' ? '通过' : v === 'partial' ? '部分' : '失败';
                b.onclick = function() {
                    btns.querySelectorAll('.sc-btn').forEach(function(x) { x.className = 'sc-btn'; });
                    b.classList.add(v);
                };
                btns.appendChild(b);
            });
            row.appendChild(lb);
            row.appendChild(btns);
            body.appendChild(row);
        });
        var cr = document.createElement('div');
        cr.style.marginTop = '8px';
        var cl = document.createElement('label');
        cl.style.cssText = 'font-size:11px;color:var(--text-3);display:block;margin-bottom:4px;';
        cl.textContent = '评语';
        var ca = document.createElement('textarea');
        ca.className = 'score-comment';
        ca.rows = 2;
        ca.placeholder = '可选';
        ca.id = 'model-comment-' + pm.paneIdx;
        cr.appendChild(cl);
        cr.appendChild(ca);
        body.appendChild(cr);
    });
    if (blindMode) {
        var vs = document.createElement('div');
        vs.className = 'vote-section';
        var vt = document.createElement('div');
        vt.className = 'vote-title';
        vt.textContent = '盲评投票';
        vs.appendChild(vt);
        if (blindVoteDone) {
            var vr = document.createElement('div');
            vr.className = 'vote-result done';
            vr.textContent = '已投票';
            vs.appendChild(vr);
        } else {
            var labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            var voDiv = document.createElement('div');
            voDiv.className = 'vote-options';
            for (var vi = 0; vi < blindAssignments.length; vi++) {
                (function(idx) {
                    var opt = document.createElement('div');
                    opt.className = 'vote-option' + (selectedBlindVote === idx ? ' selected' : '');
                    opt.dataset.index = idx;
                    var letter = document.createElement('span');
                    letter.className = 'vo-letter';
                    letter.textContent = labels[idx];
                    var label = document.createElement('div');
                    label.className = 'vo-label';
                    label.textContent = '模型 ' + labels[idx];
                    opt.appendChild(letter);
                    opt.appendChild(label);
                    opt.onclick = function() {
                        selectedBlindVote = idx;
                        submitBlindVote('confirm');
                    };
                    voDiv.appendChild(opt);
                })(vi);
            }
            vs.appendChild(voDiv);
            var tieBtn = document.createElement('button');
            tieBtn.className = 'vote-tie';
            tieBtn.textContent = '平局';
            tieBtn.onclick = function() { submitBlindVote('tie'); };
            vs.appendChild(tieBtn);
        }
        body.appendChild(vs);
    }
    footer.style.display = 'block';
    if (isBatch) {
        var saveBtn = footer.querySelector('.save-btn');
        if (saveBtn) {
            var left = batchGeneratedIds.length - scoredCount;
            saveBtn.textContent = scoredPromptIds.has(currentPrompt.id)
                ? '已评分 — 保存下一个'
                : '保存并下一个 (' + left + ' 剩余)';
        }
    }
}

function autoAdvanceBatch() {
    var idx = batchGeneratedIds.indexOf(currentPrompt.id);
    if (idx < 0 || idx >= batchGeneratedIds.length - 1) return;
    var nextId = batchGeneratedIds[idx + 1];
    var next = promptsData.find(function(p) { return p.id === nextId; });
    if (!next) return;
    selectPrompt(next, document.querySelector('.tc-item[data-prompt-id="' + next.id + '"]'));
}

function saveScores() {
    if (blindMode && !blindVoteDone) { alert('请先完成盲评投票'); return; }
    if (!currentPrompt) return;
    var pms = getPaneModels(), checks = currentPrompt.checks, ms = [];
    pms.forEach(function(pm) {
        var cr = [];
        var body = document.getElementById('drawer-body');
        var rows = body.querySelectorAll('.score-row');
        checks.forEach(function(ch, ci) {
            var gidx = pms.indexOf(pm) * checks.length + ci;
            if (rows[gidx]) {
                var ab = rows[gidx].querySelector('.sc-btn.pass,.sc-btn.partial,.sc-btn.fail');
                cr.push({
                    check: ch,
                    score: ab ? (ab.classList.contains('pass') ? 'pass' : ab.classList.contains('partial') ? 'partial' : 'fail') : 'fail'
                });
            }
        });
        var pc = cr.filter(function(c) { return c.score === 'pass'; }).length;
        var ptc = cr.filter(function(c) { return c.score === 'partial'; }).length;
        var ce = document.getElementById('model-comment-' + pm.paneIdx);
        ms.push({
            model_id: pm.modelId, model_name: pm.displayName,
            checks: cr,
            pass_rate: checks.length > 0 ? pc / checks.length : 0,
            pass_count: pc, partial_count: ptc,
            fail_count: checks.length - pc - ptc,
            comment: ce ? ce.value.trim() : ''
        });
    });
    BenchmarkStore.add('results', {
        prompt_id: currentPrompt.id, prompt_name: currentPrompt.name,
        dimension: currentPrompt.dimension, model_scores: ms,
        timestamp: new Date().toISOString()
    });
    setStatus('评分已保存 — ' + currentPrompt.name);
    var btn = document.querySelector('.save-btn');
    if (btn) {
        btn.classList.add('saved');
        btn.textContent = '已保存';
        setTimeout(function() { btn.classList.remove('saved'); btn.textContent = '保存评分'; }, 1800);
    }
    scoredPromptIds.add(currentPrompt.id);
    if (batchGeneratedIds.length > 0) {
        var item = document.querySelector('.tc-item[data-prompt-id="' + currentPrompt.id + '"]');
        if (item) item.classList.add('scored');
        setTimeout(function() { autoAdvanceBatch(); }, 600);
    }
}

async function exportResults() {
    var r = await BenchmarkStore.getAll('results'), v = await BenchmarkStore.getAll('votes');
    var d = { exported_at: new Date().toISOString(), results: r, votes: v };
    var b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    var u = URL.createObjectURL(b);
    var a = document.createElement('a');
    a.href = u;
    a.download = 'benchmark-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(u);
    setStatus('已导出 ' + r.length + ' 条评分 + ' + v.length + ' 条投票');
}
