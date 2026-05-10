var batchRunning = false;
var batchQueue = [], batchDone = 0, batchErrors = 0;

function toggleSelectAll(c) {
    document.querySelectorAll('.tc-check').forEach(function(cb) { cb.checked = c; });
}

function getSelectedIds() {
    var ids = [];
    document.querySelectorAll('.tc-check:checked').forEach(function(cb) { ids.push(cb.dataset.promptId); });
    return ids;
}

function updateBatchUI(total) {
    var pt = document.getElementById('batch-progress-text');
    var pb = document.getElementById('batch-progress-bar');
    var finished = batchDone + batchErrors;
    if (pt) pt.textContent = finished + '/' + total + (batchErrors ? ' (' + batchErrors + ' 错误)' : '');
    if (pb) pb.style.width = (total > 0 ? finished / total * 100 : 0) + '%';
}

async function startBatchRun() {
    if (batchRunning) return;
    var ids = getSelectedIds();
    if (!ids.length) { alert('请先勾选测试用例'); return; }
    batchRunning = true;
    batchQueue = ids.slice();
    batchDone = 0;
    batchErrors = 0;
    batchGeneratedIds = [];
    scoredPromptIds = new Set();
    promptCache = {};
    var btn = document.getElementById('batch-run-btn');
    btn.disabled = true;
    btn.textContent = '运行中...';
    var pe = document.getElementById('batch-progress'), detail = document.getElementById('batch-detail');
    pe.style.display = 'block';
    if (detail) detail.textContent = '';
    var first = promptsData.find(function(p) { return p.id === ids[0]; });
    if (first) selectPrompt(first, null);
    updateBatchUI(ids.length);
    setStatus('批量运行中... 0/' + ids.length);
    var paneCount = parseInt(document.getElementById('pane-count').value);
    var concurrency = Math.min(paneCount, ids.length);
    var queue = [];
    ids.forEach(function(id) {
        var pr = promptsData.find(function(p) { return p.id === id; });
        if (pr) queue.push(pr);
    });
    async function runNext() {
        while (true) {
            var pr = queue.shift();
            if (!pr) break;
            var detailEl = document.getElementById('batch-detail');
            if (detailEl) {
                var di = document.createElement('div');
                di.className = 'batch-detail-item active';
                di.id = 'bd-' + pr.id;
                di.textContent = pr.name + ' ...';
                detailEl.appendChild(di);
            }
            try {
                for (var p = 0; p < paneCount; p++) await generate(String(p), pr);
                batchDone++;
                batchGeneratedIds.push(pr.id);
                if (detailEl) {
                    var di2 = document.getElementById('bd-' + pr.id);
                    if (di2) { di2.className = 'batch-detail-item done'; di2.textContent = pr.name + ' ✓'; }
                }
            } catch (e) {
                batchErrors++;
                console.error('Batch error for ' + pr.name, e);
                if (detailEl) {
                    var di3 = document.getElementById('bd-' + pr.id);
                    if (di3) { di3.className = 'batch-detail-item fail'; di3.textContent = pr.name + ' ✗'; }
                }
            }
            updateBatchUI(ids.length);
            setStatus('批量运行中... ' + (batchDone + batchErrors) + '/' + ids.length);
        }
    }
    var workers = [];
    for (var w = 0; w < concurrency; w++) workers.push(runNext());
    await Promise.all(workers);
    setStatus('批量完成: ' + batchDone + '/' + ids.length + ' 成功' + (batchErrors ? ' — ' + batchErrors + ' 错误' : '') + ' — 请逐个评分');
    if (batchGeneratedIds.length && !scoreDrawerOpen) toggleScoreDrawer();
    batchRunning = false;
    btn.disabled = false;
    btn.textContent = '批量运行';
    if (batchGeneratedIds.length) {
        var lp = promptsData.find(function(p) { return p.id === batchGeneratedIds[batchGeneratedIds.length - 1]; });
        if (lp) selectPrompt(lp, document.querySelector('.tc-item[data-prompt-id="' + lp.id + '"]'));
    }
}
