window.onload = async function() {
    await loadData();
    loadApiConfig();
    rebuildPanes();
    renderList();
    await restoreSession();
    if (!activeSession) {
        setStatus('就绪 | ' + MODELS.map(function(m) {
            return getModelDisplayName(m.id, m.name);
        }).join(', '));
    }
};
