function createPane(index) {
    var pane = document.createElement('div');
    pane.className = 'pane';
    pane.id = 'pane-' + index;
    var head = document.createElement('div');
    head.className = 'pane-head';
    var left = document.createElement('div');
    left.className = 'pane-left';
    var sessionModels = activeSession ? activeSession.models : null;
    var sel = document.createElement('select');
    sel.id = 'select-' + index;
    sel.className = 'toolbar-select';
    sel.style.cssText = 'font-size:11px;padding:3px 6px;';
    if (sessionModels) {
        sessionModels.forEach(function(m, i) {
            var o = document.createElement('option');
            o.value = m.id;
            o.textContent = m.display_name || m.id;
            if (i === index) o.selected = true;
            sel.appendChild(o);
        });
        sel.disabled = true;
    } else {
        var spawnState = getClaudeSpawnState();
        var ocState = getOpenCodeSpawnState();
        MODELS.forEach(function(m, i) {
            if (m.provider === 'claude' && spawnState[m.id] === false) return;
            if (m.provider === 'opencode' && ocState[m.id] === false) return;
            var o = document.createElement('option');
            o.value = m.id;
            o.textContent = getModelDisplayName(m.id, m.name);
            if (i === index) o.selected = true;
            sel.appendChild(o);
        });
        getCustomModels().forEach(function(m) {
            var o = document.createElement('option');
            o.value = m.id;
            o.textContent = m.display_name || m.id;
            sel.appendChild(o);
        });
    }
    sel.addEventListener('change', function() {
        var v = sel.value;
        var mo = MODELS.find(function(m) { return m.id === v; });
        var cu = getCustomModelConfig(v);
        var ne = document.getElementById('model-name-' + index);
        if (ne) ne.textContent = mo ? getModelDisplayName(mo.id, mo.name) : cu ? (cu.display_name || cu.id) : '-';
    });
    var nameEl = document.createElement('span');
    nameEl.className = 'pane-model-name';
    nameEl.id = 'model-name-' + index;
    nameEl.textContent = sessionModels
        ? (sessionModels[index] ? (sessionModels[index].display_name || sessionModels[index].id) : '-')
        : (MODELS[index] ? getModelDisplayName(MODELS[index].id, MODELS[index].name) : '-');
    left.appendChild(nameEl);
    left.appendChild(sel);
    var right = document.createElement('div');
    right.className = 'pane-actions';
    var pt = document.createElement('button');
    pt.className = 'pane-tab active';
    pt.dataset.pane = index;
    pt.dataset.view = 'preview';
    pt.textContent = '预览';
    pt.onclick = function() { switchView(String(index), 'preview'); };
    var st = document.createElement('button');
    st.className = 'pane-tab';
    st.dataset.pane = index;
    st.dataset.view = 'source';
    st.textContent = '源码';
    st.onclick = function() { switchView(String(index), 'source'); };
    var codeBtn = document.createElement('button');
    codeBtn.className = 'pane-action';
    codeBtn.textContent = '输入代码';
    codeBtn.onclick = function() { toggleCodeInput(String(index)); };
    var clrBtn = document.createElement('button');
    clrBtn.className = 'pane-action';
    clrBtn.textContent = '清空';
    clrBtn.onclick = function() { clearPreview(String(index)); };
    var stats = document.createElement('span');
    stats.className = 'pane-stats';
    stats.id = 'stats-' + index;
    right.appendChild(pt);
    right.appendChild(st);
    right.appendChild(codeBtn);
    right.appendChild(clrBtn);
    right.appendChild(stats);
    head.appendChild(left);
    head.appendChild(right);
    var body = document.createElement('div');
    body.className = 'pane-body';
    var ph = document.createElement('div');
    ph.className = 'pane-placeholder';
    ph.id = 'placeholder-' + index;
    var phWrap = document.createElement('div');
    phWrap.className = 'ph-icon-wrap';
    var phIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    phIcon.setAttribute('width', '24');
    phIcon.setAttribute('height', '24');
    phIcon.setAttribute('fill', 'none');
    phIcon.setAttribute('stroke', 'currentColor');
    phIcon.setAttribute('viewBox', '0 0 24 24');
    var phPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    phPath.setAttribute('stroke-linecap', 'round');
    phPath.setAttribute('stroke-linejoin', 'round');
    phPath.setAttribute('stroke-width', '1.5');
    phPath.setAttribute('d', 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4');
    phIcon.appendChild(phPath);
    phWrap.appendChild(phIcon);
    ph.appendChild(phWrap);
    var phP = document.createElement('p');
    phP.textContent = '暂无生成内容';
    ph.appendChild(phP);
    var phH = document.createElement('span');
    phH.className = 'hint';
    phH.textContent = '选择测试用例后点击「全部生成」';
    ph.appendChild(phH);
    var iframe = document.createElement('iframe');
    iframe.className = 'pane-iframe';
    iframe.id = 'iframe-' + index;
    iframe.sandbox = 'allow-scripts';
    var loading = document.createElement('div');
    loading.className = 'pane-loading';
    loading.id = 'loading-' + index;
    var spinnerWrap = document.createElement('div');
    spinnerWrap.className = 'spinner-wrap';
    var spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinnerWrap.appendChild(spinner);
    loading.appendChild(spinnerWrap);
    var loadingBar = document.createElement('div');
    loadingBar.className = 'loading-bar';
    var loadingBarFill = document.createElement('div');
    loadingBarFill.className = 'loading-bar-fill';
    loadingBar.appendChild(loadingBarFill);
    loading.appendChild(loadingBar);
    var ltext = document.createElement('div');
    ltext.className = 'loading-text';
    ltext.id = 'loading-text-' + index;
    ltext.textContent = '生成中...';
    loading.appendChild(ltext);
    var source = document.createElement('div');
    source.className = 'pane-source';
    source.id = 'source-' + index;
    var pre = document.createElement('pre');
    var code = document.createElement('code');
    code.className = 'hljs';
    code.id = 'source-code-' + index;
    pre.appendChild(code);
    source.appendChild(pre);
    var codeInput = document.createElement('div');
    codeInput.className = 'pane-code-input';
    codeInput.id = 'code-input-' + index;
    var ciTitle = document.createElement('div');
    ciTitle.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-2);';
    ciTitle.textContent = '粘贴生成的代码';
    var ciTa = document.createElement('textarea');
    ciTa.className = 'code-textarea';
    ciTa.id = 'textarea-' + index;
    ciTa.placeholder = '粘贴代码...';
    var ciActions = document.createElement('div');
    ciActions.className = 'code-actions';
    var ciCancel = document.createElement('button');
    ciCancel.className = 'hbtn';
    ciCancel.textContent = '取消';
    ciCancel.onclick = (function(idx) { return function() { toggleCodeInput(idx); }; })(index);
    var ciRender = document.createElement('button');
    ciRender.className = 'hbtn primary';
    ciRender.textContent = '渲染预览';
    ciRender.onclick = (function(idx) { return function() { renderCode(idx); }; })(index);
    ciActions.appendChild(ciCancel);
    ciActions.appendChild(ciRender);
    codeInput.appendChild(ciTitle);
    codeInput.appendChild(ciTa);
    codeInput.appendChild(ciActions);
    body.appendChild(ph);
    body.appendChild(iframe);
    body.appendChild(loading);
    body.appendChild(source);
    body.appendChild(codeInput);
    pane.appendChild(head);
    pane.appendChild(body);
    return pane;
}

function rebuildPanes() {
    if (activeSession) document.getElementById('pane-count').value = String(activeSession.paneCount);
    var n = parseInt(document.getElementById('pane-count').value);
    var c = document.getElementById('split-view');
    while (c.firstChild) c.removeChild(c.firstChild);
    for (var i = 0; i < n; i++) c.appendChild(createPane(i));
}

function switchView(pid, view) {
    var iframe = document.getElementById('iframe-' + pid);
    var sv = document.getElementById('source-' + pid);
    document.querySelectorAll('[data-pane="' + pid + '"].pane-tab').forEach(function(b) {
        b.classList.toggle('active', b.dataset.view === view);
    });
    if (view === 'preview') {
        if (iframe.srcdoc) iframe.style.display = 'block';
        sv.classList.remove('show');
    } else {
        iframe.style.display = 'none';
        sv.classList.add('show');
    }
}

function toggleCodeInput(pid) {
    document.getElementById('code-input-' + pid).classList.toggle('show');
}

function renderCode(pid) {
    var code = document.getElementById('textarea-' + pid).value;
    var iframe = document.getElementById('iframe-' + pid);
    var ph = document.getElementById('placeholder-' + pid);
    if (code.trim()) {
        ph.style.display = 'none';
        iframe.style.display = 'block';
        document.getElementById('code-input-' + pid).classList.remove('show');
        iframe.srcdoc = code;
        var paneBody = document.getElementById('pane-' + pid);
        if (paneBody) paneBody.classList.add('has-content');
    } else {
        alert('请先输入代码');
    }
}

function clearPreview(pid) {
    var paneBody = document.getElementById('pane-' + pid);
    var iframe = document.getElementById('iframe-' + pid);
    var ph = document.getElementById('placeholder-' + pid);
    document.getElementById('textarea-' + pid).value = '';
    iframe.style.display = 'none';
    iframe.srcdoc = '';
    ph.style.display = 'flex';
    if (paneBody) paneBody.classList.remove('has-content');
    document.getElementById('stats-' + pid).textContent = '';
    var sc = document.getElementById('source-code-' + pid);
    if (sc) sc.textContent = '';
    document.getElementById('source-' + pid).classList.remove('show');
    switchView(pid, 'preview');
}

function restorePromptPreview(prompt) {
    var cached = promptCache[prompt.id];
    if (!cached) return;
    var n = parseInt(document.getElementById('pane-count').value);
    for (var i = 0; i < n; i++) {
        var data = cached[String(i)];
        if (!data) continue;
        var le = document.getElementById('loading-' + i), ph = document.getElementById('placeholder-' + i);
        var iframe = document.getElementById('iframe-' + i), se = document.getElementById('stats-' + i);
        var paneBody = document.getElementById('pane-' + i), sv = document.getElementById('source-' + i);
        var sc = document.getElementById('source-code-' + i);
        if (!ph || !iframe || !se) continue;
        if (le) le.classList.remove('show');
        ph.style.display = 'none';
        se.textContent = data.elapsed + 's | ' + data.total + ' tok';
        if (sc) {
            sc.textContent = data.full;
            sc.removeAttribute('data-highlighted');
            hljs.highlightElement(sc);
        }
        if (prompt.output_type === 'html') {
            var html = extractHtml(data.full);
            if (html) {
                iframe.style.display = 'block';
                iframe.srcdoc = html;
                switchView(String(i), 'preview');
                if (paneBody) paneBody.classList.add('has-content');
            } else {
                switchView(String(i), 'source');
                if (paneBody) paneBody.classList.add('has-content');
            }
        } else {
            switchView(String(i), 'source');
            if (paneBody) paneBody.classList.add('has-content');
        }
    }
}
