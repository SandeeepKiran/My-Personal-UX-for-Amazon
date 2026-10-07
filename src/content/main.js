// My Personal UX for Amazon: start and run the content scripts.
// This file loads last. It reads the settings, runs all features from FEATURES,
// and runs them again when Amazon changes the page or when a setting changes.
'use strict';

// ---------- Run ----------

function runAll() {
    if (isOff()) return;
    for (const feature of FEATURES) safely(feature.name, feature.run);
}

// Amazon changes the page many times while it loads. Run at most one time in 200 ms.
var pendingRun = null;

function scheduleRun() {
    if (pendingRun) return;
    pendingRun = setTimeout(() => { pendingRun = null; runAll(); }, 200);
}

function isOwnNode(node) {
    return node.nodeType === Node.ELEMENT_NODE && (node.id.startsWith('az-') || node.hasAttribute('data-az-feature') || node.classList.contains('az-chip'));
}

// True when all changes are in the extension's own elements. Those changes must not
// start a new run. If they do, the extension runs again and again for no reason.
function onlyOwnChanges(records) {
    return records.every(record => {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        if (target && target.closest('[id^="az-"], [data-az-feature]')) return true;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        return nodes.length > 0 && nodes.every(isOwnNode);
    });
}

// ---------- Settings changes ----------

function applySettingChange(key) {
    for (const feature of FEATURES) {
        if (feature.keys.includes(key)) safely(`reset ${feature.name}`, feature.reset);
    }
    scheduleRun();
}

// "Disabled" mode must change nothing. Remove all added elements, classes and flags.
function cleanupAll() {
    for (const feature of FEATURES) safely(`reset ${feature.name}`, feature.reset);
    for (const node of $$('.az-chip, [data-az-feature]')) node.remove();
    releaseAllClaims();
    for (const flag of ['data-az-ewc', 'data-az-nav', 'data-az-price', 'data-az-ads']) setRootFlag(flag, null);
}

function applyMode() {
    document.documentElement.setAttribute('data-az', settings.mode);
    if (isOff()) cleanupAll();
}

// Changes from the popup, from the page panel in another tab, or from another device.
ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings?.newValue) {
        const next = AZ.readSettings(changes.settings.newValue);
        const changedKeys = Object.keys(AZ.DEFAULTS).filter(key => settings[key] !== next[key]);
        Object.assign(settings, next);
        for (const key of changedKeys) {
            if (key === 'mode') { applyMode(); scheduleRun(); } else applySettingChange(key);
        }
        if (changedKeys.length) refreshPanelInputs();
    }
    if (area === 'local') {
        for (const [key, change] of Object.entries(changes)) {
            if (key in SESSION_DEFAULTS) session[key] = change.newValue ?? SESSION_DEFAULTS[key];
        }
        // Another tab can start a cashback session or add an item. Show it here too.
        if (changes.affTag || changes.affAt || changes.affRun || changes.trackedAsins) {
            safely('affiliate box', renderAffiliateBox);
            scheduleRun();
        }
    }
});

// ---------- Start ----------

// storage.session stays while the browser is open and clears when it closes.
// Thus, the first Amazon page after a restart makes a new id.
// Content scripts can read storage.session only after background.js opens it to them.
// If the browser does not allow this, the id is null and restart detection is off.
async function browserRunId() {
    let store = null;
    try { store = ext.storage.session || null; } catch { store = null; }
    if (!store) return null;

    const read = (async () => {
        const first = await store.get({ azRunId: null });
        if (first.azRunId) return first.azRunId;
        // After a session restore, many tabs make an id at the same time.
        // Read again after the write, so all tabs use the id that the store kept.
        const id = crypto.randomUUID();
        await store.set({ azRunId: id });
        const again = await store.get({ azRunId: null });
        return again.azRunId || id;
    })().catch(() => null);

    // All features wait for this id. If the browser does not answer, continue without it.
    return Promise.race([read, new Promise(resolve => setTimeout(() => resolve(null), 1500))]);
}

function start() {
    buildPanel();
    document.addEventListener('click', trackAddToCart, true);
    runAll();
    new MutationObserver(records => { if (!onlyOwnChanges(records)) scheduleRun(); })
        .observe(document.body, { childList: true, subtree: true });
    // Amazon sometimes loads the wishlists late. Try again when the pointer comes to the top bar.
    $('#navbar-main')?.addEventListener('mouseenter', () => safely('wishlists', syncDynamicWishlists), { passive: true });
}

Promise.all([
    ext.storage.sync.get({ settings: {} }).catch(() => ({ settings: {} })),
    ext.storage.local.get({ ...SESSION_DEFAULTS }).catch(() => ({ ...SESSION_DEFAULTS })),
    browserRunId(),
]).then(([sync, local, runId]) => {
    RUN_ID = runId;
    Object.assign(settings, AZ.readSettings(sync.settings));
    Object.assign(session, local);

    // Write back an old "power" mode as "simple". Then the popup and the badge agree.
    if (sync.settings && sync.settings.mode !== undefined && sync.settings.mode !== settings.mode) save('mode', settings.mode);

    applyMode();
    // The popup has no page. It uses lastHost to know the Amazon region.
    if (session.lastHost !== location.hostname) saveSession('lastHost', location.hostname);
    recordAffiliateTag();

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
});
