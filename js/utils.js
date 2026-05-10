function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function setStatus(msg) {
    document.getElementById('status-text').textContent = msg;
    document.getElementById('status-dot').classList.toggle('active', msg !== '就绪');
}

function createEmptyState(text) {
    var d = document.createElement('div');
    d.className = 'empty-state';
    d.style.padding = '30px 10px';
    var p = document.createElement('p');
    p.textContent = text;
    d.appendChild(p);
    return d;
}

function shuffleArray(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
}

function extractHtml(text) {
    var m = text.match(/```html\s*\n([\s\S]*?)```/i);
    if (m) return m[1].trim();
    m = text.match(/```\s*\n([\s\S]*?)```/);
    if (m) {
        var c = m[1].trim();
        if (c.toLowerCase().indexOf('<!doctype') !== -1 || c.toLowerCase().indexOf('<html') !== -1) return c;
    }
    var t = text.trim();
    if (t.toLowerCase().indexOf('<!doctype') === 0 || t.toLowerCase().indexOf('<html') === 0) return t;
    m = text.match(/(<html[\s\S]*<\/html>)/i);
    if (m) return m[1].trim();
    return null;
}
