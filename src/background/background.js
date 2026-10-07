// My Personal UX for Amazon: background script.
// Chrome and Edge run this file as a service worker. Firefox runs it as an event page.
// It shows the mode on the toolbar badge: ON (Simple) or OFF (Disabled).
'use strict';

const ext = globalThis.browser ?? globalThis.chrome;

const BADGE = {
    simple: { text: 'ON', color: '#0a7cff' },
    off: { text: 'OFF', color: '#9ca3af' },
};

// The content scripts keep an id for each browser run in storage.session.
// Chrome hides storage.session from content scripts. This call lets them read it.
// If the browser does not have this call, restart detection stays off.
try {
    Promise.resolve(ext.storage.session?.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })).catch(() => {});
} catch { /* Not supported. */ }

async function updateBadge(mode) {
    // Version 3.2.0 removed "power" mode. All values other than "off" mean "simple".
    const badge = mode === 'off' ? BADGE.off : BADGE.simple;
    try {
        await ext.action.setBadgeText({ text: badge.text });
        await ext.action.setBadgeBackgroundColor({ color: badge.color });
        await ext.action.setBadgeTextColor?.({ color: '#ffffff' });
    } catch (err) {
        console.warn('[My Personal UX] badge update failed:', err);
    }
}

async function refresh() {
    const { settings } = await ext.storage.sync.get({ settings: {} }).catch(() => ({ settings: {} }));
    await updateBadge(settings?.mode);
}

ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings?.newValue) updateBadge(changes.settings.newValue.mode);
});

ext.runtime.onInstalled.addListener(refresh);
ext.runtime.onStartup.addListener(refresh);
refresh();
