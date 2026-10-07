// My Personal UX for Amazon: toolbar popup.
// The popup and the page panel use the same settings in storage.sync.
// Thus, a change here shows at once on all open Amazon tabs.
'use strict';

const byId = id => document.getElementById(id);

let settings = AZ.readSettings();
let ui = null;

function persist() {
    ext.storage.sync.set({ settings: { ...settings } }).catch(err => console.warn('[My Personal UX] save failed:', err));
}

function change(key, value) {
    settings[key] = value;
    persist();
}

// The popup has no Amazon page. The content script saves the last Amazon host it saw.
function regionOf(host) {
    if (!host) return null;
    return /amazon\.in$/i.test(host) ? 'in' : 'com';
}

// storage.session clears when the browser closes. See browserRunId() in main.js.
async function readRunId() {
    try {
        const read = ext.storage.session.get({ azRunId: null }).then(data => data.azRunId || null);
        return await Promise.race([read, new Promise(resolve => setTimeout(() => resolve(null), 1000))]);
    } catch {
        return null;
    }
}

async function renderAffiliate() {
    const local = await ext.storage.local.get({ affTag: null, affAt: 0, affRun: null, lastHost: null });
    const runId = await readRunId();
    AZ.renderAffiliate(byId('affiliate'), { ...AZ.affiliateState(local, runId), region: regionOf(local.lastHost) ?? 'in' });
}

async function init() {
    const [sync, local] = await Promise.all([
        ext.storage.sync.get({ settings: {} }),
        ext.storage.local.get({ lastHost: null, uiCollapsed: [] }),
    ]);
    settings = AZ.readSettings(sync.settings);

    ui = {
        modes: AZ.buildModes(byId('modes'), { mode: settings.mode, onChange: mode => change('mode', mode) }),
        settings: AZ.buildSettings(byId('settings'), {
            values: settings,
            region: regionOf(local.lastHost),
            collapsed: local.uiCollapsed,
            onToggle: change,
            onCards: value => change('myCards', value),
            onCollapse: ids => ext.storage.local.set({ uiCollapsed: ids }),
        }),
    };
    AZ.wireTabs([[byId('tab-modes'), byId('view-modes')], [byId('tab-settings'), byId('view-settings')]]);
    byId('footer').replaceWith(AZ.footer(ext.runtime.getManifest().version));
    await renderAffiliate();
}

// The page panel can change settings while the popup is open. Show those changes here.
ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings?.newValue && ui) {
        settings = AZ.readSettings(changes.settings.newValue);
        ui.modes.update(settings.mode);
        ui.settings.update(settings);
    }
    if (area === 'local' && (changes.affTag || changes.affAt || changes.affRun)) renderAffiliate();
});

init().catch(err => console.error('[My Personal UX] popup failed to start:', err));
