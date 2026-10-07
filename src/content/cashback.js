// My Personal UX for Amazon: cashback watch (amazon.in).
// An affiliate link (CashKaro, a YouTube link, a blog) adds "?tag=" to the Amazon URL.
// The extension records the tag, marks items that you add while the tag is live,
// and tells you on the cart page which items will earn cashback.
'use strict';

function currentAffiliate() { return AZ.affiliateState(session, RUN_ID); }

// Tells if this page came from a click on a link outside Amazon.
// A reload or a restored tab also has "?tag=" in the URL. If the code counts those,
// an old session gets a new 24-hour window. That defeats the restart check.
function isFreshClickThrough() {
    let navType = '';
    try { navType = performance.getEntriesByType('navigation')[0]?.type || ''; } catch { /* No Navigation Timing API. */ }
    // "reload" includes session restore. "back_forward" is history.
    if (navType && navType !== 'navigate') return false;

    const ref = document.referrer;
    if (ref) {
        try { return !/(^|\.)amazon\./i.test(new URL(ref).hostname); } catch { return false; }
    }
    // Affiliate redirect pages often remove the referrer. Thus, an empty referrer
    // counts as a click-through, but only if the navigation type is "navigate".
    return navType === 'navigate';
}

// Amazon affiliate tags are short, for example "mousy-21". Ignore values that are not tags.
var AFFILIATE_TAG_RE = /^[\w.-]{1,64}$/;

function recordAffiliateTag() {
    const tag = new URLSearchParams(location.search).get('tag');
    if (!tag || !AFFILIATE_TAG_RE.test(tag)) return;
    if (session.affTag === tag && !isFreshClickThrough()) return;
    saveSession('affTag', tag);
    saveSession('affAt', Date.now());
    saveSession('affRun', RUN_ID);
    // A new session is important. Show the banner again.
    saveSession('cashbackHidden', false);
    bannerDismissed = false;
}

// ---------- Tracked cart items ----------

// Amazon does not tell when an item went into the cart. Thus, the extension records it:
// an Add to Cart click during a live session marks that ASIN as tracked.
var ADD_TO_CART_SELECTOR = '#add-to-cart-button, input[name="submit.add-to-cart"], #buy-now-button, #add-to-cart-button-ubb';

// main.js adds this listener one time, on the document. One listener catches all
// Add to Cart buttons, also buttons that Amazon adds later.
function trackAddToCart(event) {
    if (isOff() || !enabled('cashkaroWatch')) return;
    if (!(event.target instanceof Element) || !event.target.closest(ADD_TO_CART_SELECTOR)) return;
    if (!currentAffiliate().live) return;
    const asin = currentAsin();
    if (!asin) return;
    saveSession('trackedAsins', { ...(session.trackedAsins || {}), [asin]: { at: Date.now(), run: RUN_ID } });
}

// Before version 3.7.0, a mark was a number (the time). Now it is { at, run }.
function readMark(value) {
    if (typeof value === 'number') return { at: value, run: null };
    if (value && typeof value === 'object') return { at: value.at || 0, run: value.run || null };
    return null;
}

// Marks older than 24 hours are not valid. Ignore them.
function freshTracked() {
    const out = {};
    for (const [asin, raw] of Object.entries(session.trackedAsins || {})) {
        const mark = readMark(raw);
        if (mark && Date.now() - mark.at < AZ.AFFILIATE_WINDOW_MS) out[asin] = mark;
    }
    return out;
}

// A mark from an earlier browser run is possibly not valid. Show it as "unverified".
function markStale(mark) { return Boolean(RUN_ID) && Boolean(mark.run) && mark.run !== RUN_ID; }

// ---------- Banner ----------

// The close button hides the banner for this page view only.
// Off the cart page, the hidden state stays until a new session starts (session.cashbackHidden).
var bannerDismissed = false;
// True after a click on the pill. Then the banner shows also when it has nothing new to say.
var bannerForced = false;

function bannerHeadline({ onCart, items, hit, unsure, miss, live, stale, tag, hoursLeft }) {
    const restarted = 'the browser closed after that, so tracking can be gone';
    if (onCart && items.length) {
        if (!miss.length && !unsure.length) return `All ${items.length} cart item${items.length === 1 ? '' : 's'} tracked for cashback.`;
        if (!hit.length && !unsure.length) return `None of your ${items.length} cart items are tracked for cashback.`;
        const parts = [];
        if (hit.length) parts.push(`${hit.length} tracked`);
        if (unsure.length) parts.push(`${unsure.length} unverified`);
        if (miss.length) parts.push(`${miss.length} not tracked`);
        return `Cart: ${parts.join(' · ')} (of ${items.length}).${stale ? ` Note: ${restarted}.` : ''}`;
    }
    if (live) return `Cashback session live (${tag}). About ${hoursLeft} h left. Only items that you add from now on are tracked.`;
    if (stale) return `A cashback session started earlier (${tag}), but ${restarted}. To be sure, open Amazon from CashKaro again.`;
    return tag ? 'No live cashback session. The session expired.' : 'No cashback session.';
}

function bannerItemList(groups) {
    const counts = groups.filter(group => group.items.length).map(group => `${group.items.length} ${group.short}`);
    const list = el('div', { class: 'az-cb-list' });
    for (const group of groups) {
        if (!group.items.length) continue;
        list.append(el('div', { class: 'az-cb-group', text: `${group.label} (${group.items.length})` }));
        // Item titles come from the page. They go in as text only.
        for (const item of group.items) list.append(el('div', { class: `az-cb-item ${group.cls}`, text: item.title }));
    }
    return el('details', { class: 'az-cb-details' },
        el('summary', { text: counts.length ? `Show ${counts.join(' · ')}` : 'Show items' }),
        list);
}

function cashbackBanner() {
    const onCart = onCartPage();
    if (!enabled('cashkaroWatch') || bannerDismissed || (!onCart && session.cashbackHidden)) {
        $('#az-cashback')?.remove();
        return;
    }

    const { tag, live, stale, hoursLeft } = currentAffiliate();
    if (!onCart && !live && !stale && !bannerForced) { $('#az-cashback')?.remove(); return; }

    const items = onCart ? cartItems() : [];
    const tracked = freshTracked();
    const hit = [], unsure = [], miss = [];
    for (const item of items) {
        const mark = tracked[item.asin];
        if (!mark) miss.push(item);
        else if (markStale(mark)) unsure.push(item);
        else hit.push(item);
    }

    // Green: all items tracked. Yellow: some. Red: none.
    let tone = live ? 'az-live' : (stale ? 'az-unsure' : 'az-stale');
    if (onCart && items.length) {
        if (!miss.length && !unsure.length) tone = 'az-all';
        else if (hit.length || unsure.length) tone = 'az-some';
        else tone = 'az-none';
    }
    const headline = bannerHeadline({ onCart, items, hit, unsure, miss, live, stale, tag, hoursLeft });

    // The counts alone are not sufficient. Two different untracked items give the same
    // counts, but a different list. Thus, the state includes the ASINs.
    const state = [tone, headline, live, stale, ...[miss, unsure, hit].map(group => group.map(item => item.asin).join(','))].join('|');
    const existing = $('#az-cashback');
    if (existing && existing.dataset.state === state) return;
    existing?.remove();

    const actions = el('span', { class: 'az-cb-actions' });
    if (onCart && items.length) {
        actions.append(bannerItemList([
            { items: miss, short: 'untracked', label: 'Not tracked', cls: 'az-cb-miss' },
            { items: unsure, short: 'unverified', label: 'Unverified: added before the browser closed', cls: 'az-cb-unsure' },
            { items: hit, short: 'tracked', label: 'Tracked', cls: 'az-cb-hit' },
        ]));
    }
    if (!live) {
        actions.append(el('button', {
            type: 'button', class: 'az-cb-go', text: 'Copy URL & Open CashKaro',
            onclick: async () => {
                try { await navigator.clipboard.writeText(location.href); } catch { /* The browser blocked the clipboard. */ }
                window.open('https://cashkaro.com/stores/amazon', '_blank', 'noopener');
            },
        }));
    }
    actions.append(el('button', {
        type: 'button', class: 'az-cb-close', text: '✕',
        'aria-label': 'Hide the cashback banner',
        title: 'Hide. To show it again, click the cashback pill (bottom right).',
        onclick: () => {
            bannerDismissed = true;
            bannerForced = false;
            if (!onCart) saveSession('cashbackHidden', true);
            $('#az-cashback')?.remove();
            affiliateStatusPill();
        },
    }));

    document.body.prepend(el('div', { id: 'az-cashback', class: tone, 'data-state': state, 'data-az-feature': 'cashback' },
        el('span', { class: 'az-cb-msg', text: headline }),
        actions));
}

// ---------- Pill ----------

// A small pill next to the settings button. It shows the cashback state, and a click
// on it shows the banner again.
function affiliateStatusPill() {
    if (!$('#az-fab')) return;
    if (!enabled('cashkaroWatch')) { $('#az-aff-pill')?.remove(); return; }

    const { live, stale, hoursLeft } = currentAffiliate();
    const text = live ? `Cashback on · ${hoursLeft}h` : (stale ? 'Cashback unverified' : 'No cashback');
    let pill = $('#az-aff-pill');
    if (!pill) {
        pill = el('button', {
            type: 'button', id: 'az-aff-pill', 'data-az-feature': 'affpill',
            onclick: () => {
                bannerDismissed = false;
                bannerForced = true;
                saveSession('cashbackHidden', false);
                cashbackBanner();
            },
        });
        document.body.append(pill);
    }
    const hidden = bannerDismissed || (!onCartPage() && session.cashbackHidden);
    pill.title = hidden ? 'Show the cashback banner' : 'Cashback session state';
    if (pill.dataset.text !== text) { pill.textContent = text; pill.dataset.text = text; }
    pill.className = live ? 'az-pill-on' : (stale ? 'az-pill-unsure' : 'az-pill-off');
}

defineFeature({
    name: 'cashback banner',
    keys: ['cashkaroWatch'],
    run() { cashbackBanner(); affiliateStatusPill(); },
    reset() { $('#az-cashback')?.remove(); $('#az-aff-pill')?.remove(); },
});

// The Cashback link box on the Modes tab of the page panel.
function renderAffiliateBox() {
    const box = $('#az-aff-box');
    if (!box) return;
    const affiliate = currentAffiliate();
    const state = `${affiliate.live}|${affiliate.stale}|${affiliate.tag}|${affiliate.live ? affiliate.hoursLeft : ''}`;
    if (box.dataset.state === state) return;
    box.dataset.state = state;
    AZ.renderAffiliate(box, { ...affiliate, region: REGION });
}
