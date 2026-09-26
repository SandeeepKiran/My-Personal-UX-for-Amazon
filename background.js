// Amazon — My Personal UX — background worker.
// Keeps the toolbar badge in sync with the active mode (ON / OFF).
// "Power" mode was retired in v3.2.0 and now maps to "simple".

const api = typeof browser !== 'undefined' ? browser : chrome;

const BADGE = {
    simple: { text: 'ON',  color: '#0a7cff' },
    off:    { text: 'OFF', color: '#9ca3af' },
};

const normalizeMode = m => (m === 'power' || !m ? 'simple' : m);

// v3.7.0: the content script keeps a per-browser-run id in storage.session so it
// can tell a live CashKaro click-through from one that only looks live because
// under 24h has passed. Chrome hides storage.session from content scripts unless
// the access level is widened here; Firefox has no such API, so this is optional.
try {
    const p = api.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    if (p && typeof p.catch === 'function') p.catch(() => {});
} catch (e) { /* not supported — restart detection just stays off */ }

function updateBadge(mode) {
    const cfg = BADGE[normalizeMode(mode)] || BADGE.simple;
    api.action.setBadgeText({ text: cfg.text });
    api.action.setBadgeBackgroundColor({ color: cfg.color });
    if (api.action.setBadgeTextColor) {
        api.action.setBadgeTextColor({ color: '#ffffff' });
    }
}

function refresh() {
    api.storage.sync.get({ settings: { mode: 'simple' } }, (data) => {
        updateBadge((data.settings && data.settings.mode) || 'simple');
    });
}

api.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings && changes.settings.newValue) {
        updateBadge(changes.settings.newValue.mode);
    }
});

api.runtime.onInstalled.addListener(refresh);
api.runtime.onStartup.addListener(refresh);
refresh();
