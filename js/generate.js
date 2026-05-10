var activeGenerations = 0;

async function generateAll() {
    if (!currentPrompt) { alert('请先选择一个测试用例'); return; }
    var n = parseInt(document.getElementById('pane-count').value);
    setStatus('正在并行生成 ' + n + ' 个模型...');
    var ps = [];
    for (var i = 0; i < n; i++) (function(idx) {
        ps.push(generate(String(idx)).catch(function(e) { console.error(e); }));
    })(i);
    return Promise.all(ps).then(function() { setStatus('全部生成完成'); });
}

async function generate(pid, promptOverride) {
    var prompt = promptOverride || currentPrompt;
    if (!prompt) { alert('请先选择测试用例'); return; }
    var sel = document.getElementById('select-' + pid);
    var modelId = sel ? sel.value : '';
    if (!modelId) { setStatus('请选择模型'); return; }
    var mo = MODELS.find(function(m) { return m.id === modelId; });
    var modelName = mo ? getModelDisplayName(mo.id, mo.name) : modelId;
    var le = document.getElementById('loading-' + pid), ph = document.getElementById('placeholder-' + pid);
    var iframe = document.getElementById('iframe-' + pid), se = document.getElementById('stats-' + pid);
    if (!le || !ph || !iframe || !se) return;
    if (le.classList.contains('show')) return;
    le.classList.add('show');
    ph.style.display = 'none';
    iframe.style.display = 'none';
    se.textContent = '';
    var paneBody = document.getElementById('pane-' + pid);
    if (paneBody) paneBody.classList.remove('has-content');
    document.getElementById('source-' + pid).classList.remove('show');
    if (!batchRunning) setStatus(modelName + ' 生成中...');
    var t0 = performance.now();
    activeGenerations++;
    try {
        var sys = prompt.output_type === 'html'
            ? '你是一个前端开发专家。请根据用户的描述，生成一个完整的、可直接运行的 HTML 文件（包含所有 CSS 和 JS）。直接输出完整的 HTML 代码，不要使用任何工具或文件操作，不要输出任何解释或说明文字。'
            : '你是一个编程专家。请根据用户的描述，生成完整的代码。直接输出代码，不要使用任何工具或文件操作，不要输出任何解释或说明文字。';
        var apiUrl = isClaudeModel(modelId) ? CLAUDE_URL : PROXY_URL;
        if (!isClaudeModel(modelId) && !getCustomModelConfig(modelId)) {
            if (!MODELS.find(function(m) { return m.id === modelId; }))
                throw new Error('未知模型: ' + modelId);
        }
        var req = {
            model: modelId,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: prompt.prompt }
            ],
            max_tokens: 16384,
            temperature: 0.7,
            stream: true
        };
        var cc = getCustomModelConfig(modelId);
        if (cc) { req.base_url = cc.base_url; req.api_key = cc.api_key; }
        var resp = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req)
        });
        if (!resp.ok) { var eb = await resp.text(); throw new Error('HTTP ' + resp.status + ': ' + eb.substring(0, 200)); }
        var reader = resp.body.getReader(), dec = new TextDecoder(), full = '', buf = '';
        var inTok = 0, outTok = 0, lt = document.getElementById('loading-text-' + pid), done = false;
        while (true) {
            var chunk = await reader.read(), lines = [];
            if (chunk.done) {
                if (buf.trim()) lines = buf.split('\n');
                buf = '';
                done = true;
            } else {
                buf += dec.decode(chunk.value, { stream: true });
                lines = buf.split('\n');
                buf = lines.pop();
            }
            for (var i = 0; i < lines.length; i++) {
                var ln = lines[i].trim();
                if (!ln || !ln.startsWith('data: ')) continue;
                var d = ln.slice(6);
                if (d === '[DONE]') { done = true; break; }
                try {
                    var p = JSON.parse(d);
                    var delta = p.choices && p.choices[0] && p.choices[0].delta;
                    if (delta && delta.content) {
                        full += delta.content;
                        lt.textContent = '生成中... ' + full.length + ' 字符';
                        var sc = document.getElementById('source-code-' + pid);
                        if (sc) sc.textContent = full;
                    }
                    if (p.usage) {
                        inTok = p.usage.prompt_tokens || 0;
                        outTok = p.usage.completion_tokens || 0;
                    }
                } catch (e) {}
            }
            if (done) break;
        }
        var elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        var total = inTok + outTok;
        var speed = elapsed > 0 ? (outTok / parseFloat(elapsed)).toFixed(1) : '0';
        se.textContent = elapsed + 's | ' + total + ' tok | ' + speed + ' tok/s';
        if (!batchRunning) setStatus(modelName + ' 完成 ' + elapsed + 's');
        BenchmarkStore.add('generations', {
            prompt_id: prompt.id, prompt_name: prompt.name,
            model_id: modelId, model_name: modelName,
            elapsed_seconds: parseFloat(elapsed),
            input_tokens: inTok, output_tokens: outTok, total_tokens: total,
            timestamp: new Date().toISOString()
        }).catch(function() {});
        if (!promptCache[prompt.id]) promptCache[prompt.id] = {};
        promptCache[prompt.id][pid] = {
            full: full, modelId: modelId, modelName: modelName,
            elapsed: elapsed, inTok: inTok, outTok: outTok, total: total
        };
        var sc = document.getElementById('source-code-' + pid);
        sc.textContent = full;
        sc.removeAttribute('data-highlighted');
        hljs.highlightElement(sc);
        if (prompt.output_type === 'html') {
            var html = extractHtml(full);
            if (html) {
                ph.style.display = 'none';
                iframe.style.display = 'block';
                iframe.srcdoc = html;
                switchView(pid, 'preview');
                if (paneBody) paneBody.classList.add('has-content');
            } else {
                ph.style.display = 'none';
                switchView(pid, 'source');
                if (paneBody) paneBody.classList.add('has-content');
            }
        } else {
            ph.style.display = 'none';
            switchView(pid, 'source');
            if (paneBody) paneBody.classList.add('has-content');
        }
        if (blindMode && activeGenerations <= 1) buildScoreDrawer();
    } catch (err) {
        console.error(err);
        if (!batchRunning) setStatus(modelName + ' 失败: ' + err.message);
        ph.style.display = 'flex';
        throw err;
    } finally {
        le.classList.remove('show');
        activeGenerations--;
        if (activeGenerations <= 0) activeGenerations = 0;
    }
}
