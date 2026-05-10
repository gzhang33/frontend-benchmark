async function loadStats() {
    var ct = document.getElementById('stats-content'), st = document.getElementById('stats-sub');
    ct.textContent = '';
    ct.appendChild(createEmptyState('加载中...'));
    try {
        var gens = await BenchmarkStore.getAll('generations'), ress = await BenchmarkStore.getAll('results');
        if (!gens.length && !ress.length) {
            ct.textContent = '';
            ct.appendChild(createEmptyState('暂无数据'));
            st.textContent = '暂无数据';
            return;
        }
        st.textContent = gens.length + ' 次生成 · ' + ress.length + ' 条评分';
        var frag = document.createDocumentFragment();
        if (gens.length) {
            var stats = {};
            gens.forEach(function(g) {
                var mid = g.model_id || 'unknown';
                if (!stats[mid]) stats[mid] = { model_name: getModelDisplayName(mid, g.model_name || mid), count: 0, totalLatency: 0, totalIn: 0, totalOut: 0, total: 0 };
                stats[mid].count++;
                stats[mid].totalLatency += g.elapsed_seconds || 0;
                stats[mid].totalIn += g.input_tokens || 0;
                stats[mid].totalOut += g.output_tokens || 0;
                stats[mid].total += g.total_tokens || 0;
            });
            var h3 = document.createElement('h3');
            h3.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:12px;color:var(--text-2);';
            h3.textContent = '生成性能';
            frag.appendChild(h3);
            var table = buildStatsTable(stats);
            frag.appendChild(table);
        }
        if (ress.length) {
            var cs = {};
            ress.forEach(function(r) {
                (r.model_scores || []).forEach(function(ms) {
                    if (!cs[ms.model_id]) cs[ms.model_id] = { model_name: ms.model_name, p: 0, pt: 0, f: 0, tc: 0, c: 0 };
                    cs[ms.model_id].p += ms.pass_count || 0;
                    cs[ms.model_id].pt += ms.partial_count || 0;
                    cs[ms.model_id].f += ms.fail_count || 0;
                    cs[ms.model_id].tc += (ms.pass_count || 0) + (ms.partial_count || 0) + (ms.fail_count || 0);
                    cs[ms.model_id].c++;
                });
            });
            if (Object.keys(cs).length) {
                var h3b = document.createElement('h3');
                h3b.style.cssText = 'font-size:14px;font-weight:600;margin:24px 0 12px;color:var(--text-2);';
                h3b.textContent = '检查点通过率';
                frag.appendChild(h3b);
                var table2 = buildChecksTable(cs);
                frag.appendChild(table2);
            }
        }
        ct.textContent = '';
        ct.appendChild(frag);
    } catch (e) {
        ct.textContent = '';
        ct.appendChild(createEmptyState('加载失败'));
    }
}

function buildStatsTable(stats) {
    var table = document.createElement('table');
    table.className = 'data-table';
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    ['模型', '次数', '平均耗时', 'Input', 'Output', 'Total'].forEach(function(h, i) {
        var th = document.createElement('th');
        th.textContent = h;
        if (i > 0) th.className = 'n';
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    Object.keys(stats).sort().forEach(function(mid) {
        var s = stats[mid], avg = (s.totalLatency / s.count).toFixed(1);
        var row = document.createElement('tr');
        var td1 = document.createElement('td');
        td1.className = 'mn';
        td1.textContent = s.model_name;
        row.appendChild(td1);
        [[s.count, ''], [avg + 's', ''], [s.totalIn.toLocaleString(), ''], [s.totalOut.toLocaleString(), ''], [s.total.toLocaleString(), 'font-weight:600;']].forEach(function(pair) {
            var td = document.createElement('td');
            td.className = 'n';
            td.textContent = pair[0];
            if (pair[1]) td.style.cssText = pair[1];
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    return table;
}

function buildChecksTable(cs) {
    var table = document.createElement('table');
    table.className = 'data-table';
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    ['模型', '次数', '通过', '部分', '失败', '通过率'].forEach(function(h, i) {
        var th = document.createElement('th');
        th.textContent = h;
        if (i > 0) th.className = 'n';
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    Object.keys(cs).forEach(function(mid) {
        var s = cs[mid], rate = ((s.p + s.pt * 0.5) / s.tc * 100).toFixed(1);
        var rc = parseFloat(rate) >= 80 ? 'badge-g' : parseFloat(rate) >= 60 ? 'badge-a' : parseFloat(rate) >= 40 ? 'badge-w' : 'badge-r';
        var row = document.createElement('tr');
        var td1 = document.createElement('td');
        td1.className = 'mn';
        td1.textContent = s.model_name;
        row.appendChild(td1);
        var countTd = document.createElement('td');
        countTd.className = 'n';
        countTd.textContent = s.c;
        row.appendChild(countTd);
        var passTd = document.createElement('td');
        passTd.className = 'n';
        passTd.style.color = 'var(--green)';
        passTd.textContent = s.p;
        row.appendChild(passTd);
        var ptTd = document.createElement('td');
        ptTd.className = 'n';
        ptTd.style.color = 'var(--amber)';
        ptTd.textContent = s.pt;
        row.appendChild(ptTd);
        var fTd = document.createElement('td');
        fTd.className = 'n';
        fTd.style.color = 'var(--red)';
        fTd.textContent = s.f;
        row.appendChild(fTd);
        var rateTd = document.createElement('td');
        rateTd.className = 'n';
        var badge = document.createElement('span');
        badge.className = 'badge ' + rc;
        badge.textContent = rate + '%';
        rateTd.appendChild(badge);
        row.appendChild(rateTd);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    return table;
}

async function loadHistory() {
    var ct = document.getElementById('history-content'), st = document.getElementById('history-sub');
    ct.textContent = '';
    ct.appendChild(createEmptyState('加载中...'));
    try {
        var ress = await BenchmarkStore.getAll('results'), votes = await BenchmarkStore.getAll('votes');
        if (!ress.length && !votes.length) {
            ct.textContent = '';
            ct.appendChild(createEmptyState('暂无记录'));
            st.textContent = '暂无记录';
            return;
        }
        st.textContent = ress.length + ' 条评分 · ' + votes.length + ' 条投票';
        var frag = document.createDocumentFragment();
        if (ress.length) {
            ress.slice().reverse().forEach(function(r) {
                frag.appendChild(buildResultCard(r));
            });
        }
        if (votes.length) {
            var vh3 = document.createElement('h3');
            vh3.style.cssText = 'font-size:14px;font-weight:600;margin:20px 0 12px;color:var(--text-2);';
            vh3.textContent = '投票记录';
            frag.appendChild(vh3);
            votes.slice().reverse().forEach(function(v) {
                frag.appendChild(buildVoteCard(v));
            });
        }
        ct.textContent = '';
        ct.appendChild(frag);
    } catch (e) {
        ct.textContent = '';
        ct.appendChild(createEmptyState('加载失败'));
    }
}

function buildResultCard(r) {
    var hcard = document.createElement('div');
    hcard.className = 'hcard';
    var hhdr = document.createElement('div');
    hhdr.className = 'hcard-header';
    var hname = document.createElement('span');
    hname.className = 'hcard-name';
    hname.textContent = r.prompt_name || r.prompt_id;
    var htime = document.createElement('span');
    htime.className = 'hcard-time';
    htime.textContent = (r.timestamp || '').slice(0, 16).replace('T', ' ');
    hhdr.appendChild(hname);
    hhdr.appendChild(htime);
    hcard.appendChild(hhdr);
    var scores = r.model_scores || [];
    if (scores.length) {
        var scoreWrap = document.createElement('div');
        scoreWrap.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        scores.forEach(function(ms) {
            var rate = (ms.pass_rate * 100).toFixed(0);
            var rc = parseFloat(rate) >= 80 ? 'badge-g' : parseFloat(rate) >= 60 ? 'badge-a' : parseFloat(rate) >= 40 ? 'badge-w' : 'badge-r';
            var scoreItem = document.createElement('div');
            scoreItem.style.cssText = 'display:flex;align-items:center;gap:6px;';
            var sn = document.createElement('span');
            sn.style.cssText = 'font-size:12px;color:var(--text-2);';
            sn.textContent = ms.model_name;
            var sb = document.createElement('span');
            sb.className = 'badge ' + rc;
            sb.textContent = rate + '%';
            scoreItem.appendChild(sn);
            scoreItem.appendChild(sb);
            scoreWrap.appendChild(scoreItem);
        });
        hcard.appendChild(scoreWrap);
        if (scores[0].comment) {
            var cp = document.createElement('p');
            cp.style.cssText = 'font-size:11px;color:var(--text-3);margin-top:6px;';
            cp.textContent = scores[0].comment;
            hcard.appendChild(cp);
        }
    }
    return hcard;
}

function buildVoteCard(v) {
    var wl = '平局';
    if (v.winner && v.winner !== 'tie') {
        var wm = MODELS.find(function(m) { return m.id === v.winner; });
        wl = (wm ? getModelDisplayName(wm.id, wm.name) : v.winner) + ' 胜';
    }
    var ml = (v.models || []).map(function(mid) {
        var m = MODELS.find(function(m) { return m.id === mid; });
        return m ? getModelDisplayName(m.id, m.name) : mid;
    }).join(' vs ');
    var hcard = document.createElement('div');
    hcard.className = 'hcard';
    var hhdr = document.createElement('div');
    hhdr.className = 'hcard-header';
    var hname = document.createElement('span');
    hname.className = 'hcard-name';
    hname.textContent = v.prompt_name || v.prompt_id;
    var wbadge = document.createElement('span');
    wbadge.className = 'badge badge-g';
    wbadge.textContent = wl;
    hhdr.appendChild(hname);
    hhdr.appendChild(wbadge);
    hcard.appendChild(hhdr);
    var detail = document.createElement('div');
    detail.style.cssText = 'font-size:11px;color:var(--text-3);margin-top:4px;';
    detail.textContent = ml + ' · ' + ((v.timestamp || '').slice(0, 16).replace('T', ' '));
    hcard.appendChild(detail);
    return hcard;
}

async function clearHistory() {
    if (!confirm('确定清空所有历史记录?')) return;
    await BenchmarkStore.clear('results');
    await BenchmarkStore.clear('votes');
    await BenchmarkStore.clear('generations');
    loadHistory();
    setStatus('历史记录已清空');
}
