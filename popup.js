// Amazon — My Personal UX — popup. Reads/writes the same chrome.storage.sync settings
// the content script uses, so changes apply to open Amazon tabs instantly.

const api = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULTS = {
    mode: 'simple',
    hideSponsored: true,
    hideCarousels: true,
    stripUrgency: true,
    fixSubscribeSave: true,
    dismissWarranty: true,
    showUnitPrice: true,
    showSellerBadge: true,
    flagFewReviews: true,
    hideEmi: true,
    showBankOffers: true,
    myCards: '',
    cashkaroWatch: true,
    priceHistoryButton: true,
    reviewsButton: true,
    hideProductVideos: true,
    hideBrandCarousel: true,
    hideFeedbackBlock: true,
    biggerPrice: true,
    showHiddenFees: true,
    highlightCoupon: true,
    autoApplyCoupon: true,
    reorderDetails: true,
    ewcCollapse: true,
    customAccountMenu: true,
    hideNavExtras: true,
};

// "Power" was folded into "Simple" in v3.2.0 — see content.js.
const normalizeMode = m => (m === 'power' || !m ? 'simple' : m);

const MODES = [
    ['simple', 'Simple',   'Full decluttering.'],
    ['off',    'Disabled', 'Normal Amazon. Nothing is changed.'],
];

const TOGGLES = [
    ['hideSponsored',    'Hide sponsored results',        'Removes paid placements from search.'],
    ['hideCarousels',    'Hide recommendation carousels', '"Customers also bought", "Inspired by your browsing".'],
    ['stripUrgency',     'Remove urgency text',           '"Only 3 left", countdown timers.'],
    ['showUnitPrice',    'Show price per unit',           'Per 100 g / 100 ml / piece, so you can compare.'],
    ['showSellerBadge',  'Show who the seller is',        'Amazon vs a third-party seller.'],
    ['flagFewReviews',   'Flag products with few ratings','Warns under 50 ratings.'],
    ['fixSubscribeSave', 'Un-preselect Subscribe & Save', 'Switches back to one-time purchase.'],
    ['dismissWarranty',  'Auto-decline protection plans', 'Closes the pop-up after Add to Cart.'],
    ['hideEmi',          'Hide EMI options',              'Including "No Cost EMI". (India only)'],
    ['showBankOffers',   'Surface bank offers',           'Pulls them out of the popover. (India only)'],
    ['priceHistoryButton','Price history buttons',        'Keepa deep link, plus a copy-and-open PriceHistory button on .in.'],
    ['reviewsButton',    'Jump-to-reviews button',        'Scrolls straight to the customer reviews.'],
    ['hideProductVideos','Hide the product video rail',   '"Videos for this product" carousel.'],
    ['hideBrandCarousel','Hide the brand rail',           '"Brands in this category on Amazon".'],
    ['hideFeedbackBlock','Hide the Feedback block',       'The feedback form inside Product information.'],
    ['biggerPrice',      'Bigger price',                  'Enlarges the main price in the buy box.'],
    ['showHiddenFees',   'Warn about extra fees',         'Flags delivery, handling, service and installation charges next to the price, and highlights them in the cart.'],
    ['highlightCoupon',  'Highlight coupons',             'Outlines the easy-to-miss coupon checkbox in green.'],
    ['autoApplyCoupon',  'Tick coupons automatically',    'Applies the coupon on load. Never re-ticks one you switch off.'],
    ['reorderDetails',   'Specs before recommendations',  'Moves box contents, product info and the brand card above the related-product rails.'],
    ['cashkaroWatch',    'Cashback session watch',        'Warns when CashKaro tracking is not live. (India only)'],
    ['ewcCollapse',      'Collapsible cart side panel',   'Hides the right cart rail behind a 🛒 tab.'],
    ['customAccountMenu','Clean Account dropdown',        'Replaces Amazon\'s heavy dropdown with a custom menu.'],
    ['hideNavExtras',    'Hide the links row',            'Fresh, MiniTV, Sell… the row under the search bar.'],
];

const settings = { ...DEFAULTS };

// Badge fallback: on browsers where the background service worker doesn't run
// (e.g. Firefox), keep the toolbar badge current from the popup itself.
const BADGE = {
    simple: { text: 'ON',  color: '#0a7cff' },
    off:    { text: 'OFF', color: '#9ca3af' },
};

function updateBadge() {
    try {
        const cfg = BADGE[settings.mode] || BADGE.simple;
        api.action.setBadgeText({ text: cfg.text });
        api.action.setBadgeBackgroundColor({ color: cfg.color });
        if (api.action.setBadgeTextColor) api.action.setBadgeTextColor({ color: '#ffffff' });
    } catch (e) { /* ignore */ }
}

function persist() {
    api.storage.sync.set({ settings: { ...settings } });
    updateBadge();
}

function buildUI() {
    const modeBox = document.getElementById('modes');
    for (const [value, label, hint] of MODES) {
        const wrap = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'mode';
        input.value = value;
        input.checked = settings.mode === value;
        input.addEventListener('change', () => { settings.mode = value; persist(); });
        const text = document.createElement('div');
        const t = document.createElement('span'); t.className = 'label-text'; t.textContent = label;
        const h = document.createElement('span'); h.className = 'hint'; h.textContent = hint;
        text.append(t, h);
        wrap.append(input, text);
        modeBox.appendChild(wrap);
    }

    const toggleBox = document.getElementById('toggles');
    for (const [key, label, hint] of TOGGLES) {
        const wrap = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = settings[key];
        input.addEventListener('change', () => { settings[key] = input.checked; persist(); });
        const text = document.createElement('div');
        const t = document.createElement('span'); t.className = 'label-text'; t.textContent = label;
        const h = document.createElement('span'); h.className = 'hint'; h.textContent = hint;
        text.append(t, h);
        wrap.append(input, text);
        toggleBox.appendChild(wrap);
    }

    const cards = document.getElementById('cards');
    cards.value = settings.myCards;
    cards.addEventListener('change', () => { settings.myCards = cards.value; persist(); });

    const tabModes = document.getElementById('tab-modes');
    const tabSettings = document.getElementById('tab-settings');
    const viewModes = document.getElementById('view-modes');
    const viewSettings = document.getElementById('view-settings');

    tabModes.addEventListener('click', () => {
        tabModes.classList.add('active'); tabSettings.classList.remove('active');
        viewModes.hidden = false; viewSettings.hidden = true;
    });
    tabSettings.addEventListener('click', () => {
        tabSettings.classList.add('active'); tabModes.classList.remove('active');
        viewModes.hidden = true; viewSettings.hidden = false;
    });
}

// ---------- Cashback link block ----------

const AFFILIATE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Nothing here is affiliated with the extension — these are just the sites that
// dominate each market. Which set to show comes from the last Amazon domain the
// content script saw, since the popup has no page of its own to read.
const AGGREGATORS = {
    in: [['CashKaro', 'https://cashkaro.com/stores/amazon'], ['EarnKaro', 'https://earnkaro.com/amazon-offers']],
    com: [['Rakuten', 'https://www.rakuten.com/amazon.com'], ['TopCashback', 'https://www.topcashback.com/amazon/']],
};

function renderAffiliate({ affTag, affAt, affRun, lastHost }, runId) {
    const box = document.getElementById('affiliate');
    if (!box) return;

    const age = Date.now() - (affAt || 0);
    const within = Boolean(affTag) && age < AFFILIATE_WINDOW_MS;
    // A session stamped with a different browser run means everything was closed
    // since; affiliate cookies sometimes survive that and sometimes do not, so it
    // is reported as unverified rather than guessed either way.
    const stale = within && Boolean(runId) && Boolean(affRun) && affRun !== runId;
    const live = within && !stale;
    const hoursLeft = Math.max(0, Math.floor((AFFILIATE_WINDOW_MS - age) / 3600000));

    box.textContent = '';

    const state = document.createElement('div');
    state.className = 'aff-state ' + (live ? 'aff-on' : stale ? 'aff-unsure' : 'aff-off');
    state.textContent = live ? `Active — ${affTag}` : stale ? `Unverified — ${affTag}` : 'No affiliate link active';
    box.appendChild(state);

    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = live
        ? `About ${hoursLeft}h left. Whoever owns this tag gets credit for anything you add from now on.`
        : stale
            ? 'This tag was picked up before the browser was last closed, so it may no longer be in force. Click through again to be sure.'
            : 'Nothing is tracking your visit. Start from a cashback site if you want the purchase to earn.';
    box.appendChild(hint);

    if (live) return;

    const links = document.createElement('div');
    links.className = 'aff-links';
    for (const [name, url] of (/amazon\.in$/i.test(lastHost || 'www.amazon.in') ? AGGREGATORS.in : AGGREGATORS.com)) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'aff-link';
        a.textContent = name;
        links.appendChild(a);
    }
    box.appendChild(links);
}

function loadAffiliate() {
    api.storage.local.get({ affTag: null, affAt: 0, affRun: null, lastHost: null }, (local) => {
        // storage.session is wiped on browser shutdown — that is the whole point.
        let store = null;
        try { store = api.storage.session; } catch { store = null; }
        if (!store) return renderAffiliate(local, null);
        // Never let the run-id read be the reason the block renders nothing.
        let done = false;
        const paint = (runId) => { if (!done) { done = true; renderAffiliate(local, runId); } };
        setTimeout(() => paint(null), 1000);
        try {
            store.get({ azRunId: null }, (s) => paint((s && s.azRunId) || null));
        } catch { paint(null); }
    });
}

api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.affTag || changes.affAt || changes.affRun)) loadAffiliate();
});

api.storage.sync.get({ settings: {} }, (data) => {
    const stored = data.settings || {};
    for (const key of Object.keys(DEFAULTS)) {
        if (key in stored) settings[key] = stored[key];
    }
    settings.mode = normalizeMode(settings.mode);
    buildUI();
    updateBadge();
    loadAffiliate();
    document.getElementById('version').textContent = 'v' + api.runtime.getManifest().version;
});
