// My Personal UX for Amazon: the settings panel on the page.
// A round button at the bottom right (or Alt+A) opens it. It shows the same
// settings as the toolbar popup. settings.js builds both screens.
'use strict';

// The two parts of the panel that change: { modes, settings }. Null until buildPanel() runs.
var panelUi = null;

function buildPanel() {
    if ($('#az-fab')) return;

    const fab = el('button', {
        id: 'az-fab', type: 'button', 'aria-controls': 'az-panel', 'aria-expanded': 'false',
        'aria-label': 'My Personal UX settings (Alt+A)', title: 'My Personal UX settings (Alt+A)',
    }, icon('sliders', { size: 24 }));

    const tabModes = el('button', { id: 'az-tab-main', class: 'az-tab', type: 'button', role: 'tab', text: 'Modes' });
    const tabSettings = el('button', { id: 'az-tab-settings', class: 'az-tab', type: 'button', role: 'tab', text: 'Settings' });
    const modesBox = el('div', { id: 'az-modes' });
    const settingsBox = el('div', { id: 'az-settings' });
    const viewModes = el('div', { id: 'az-view-main', role: 'tabpanel' },
        modesBox,
        el('h3', { class: 'az-aff-title', text: 'Cashback link' }),
        el('div', { id: 'az-aff-box' }));
    const viewSettings = el('div', { id: 'az-view-settings', role: 'tabpanel' }, settingsBox);

    const panel = el('div', { id: 'az-panel', role: 'dialog', 'aria-label': 'My Personal UX settings' },
        el('h2', { text: 'Amazon — My Personal UX' }),
        el('div', { class: 'az-tabs', role: 'tablist' }, tabModes, tabSettings),
        viewModes,
        viewSettings,
        AZ.footer(ext.runtime.getManifest().version));
    panel.hidden = true;

    panelUi = {
        modes: AZ.buildModes(modesBox, {
            mode: settings.mode,
            onChange: mode => { save('mode', mode); applyMode(); scheduleRun(); },
        }),
        settings: AZ.buildSettings(settingsBox, {
            values: settings,
            region: REGION,
            collapsed: session.uiCollapsed,
            onToggle: (key, value) => { save(key, value); applySettingChange(key); },
            onCards: value => { save('myCards', value); applySettingChange('myCards'); },
            onCollapse: ids => saveSession('uiCollapsed', ids),
        }),
    };
    const selectTab = AZ.wireTabs([[tabModes, viewModes], [tabSettings, viewSettings]]);

    const toggle = () => {
        panel.hidden = !panel.hidden;
        fab.setAttribute('aria-expanded', String(!panel.hidden));
        if (panel.hidden) return;
        selectTab(0);
        safely('affiliate box', renderAffiliateBox);
        panel.querySelector('input')?.focus();
    };
    fab.addEventListener('click', toggle);

    document.addEventListener('keydown', event => {
        if (event.isComposing) return;
        // Use event.code, so the shortcut works on all keyboard layouts.
        // Ctrl stays free: on some layouts, AltGr (Ctrl+Alt) types letters.
        if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyA') {
            event.preventDefault();
            toggle();
        } else if (event.key === 'Escape' && !panel.hidden) {
            toggle();
            fab.focus();
        }
    });

    document.addEventListener('click', event => {
        if (!panel.hidden && !panel.contains(event.target) && !fab.contains(event.target)) toggle();
    });

    document.body.append(fab, panel);
}

// Shows changes from the popup or from another synced device in the open panel.
function refreshPanelInputs() {
    if (!panelUi) return;
    panelUi.modes.update(settings.mode);
    panelUi.settings.update(settings);
    safely('affiliate box', renderAffiliateBox);
}
