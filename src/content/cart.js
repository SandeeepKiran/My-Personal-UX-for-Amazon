// My Personal UX for Amazon: add to cart and the cart.
// Features: one-time purchase, decline protection plans, cart fee highlight,
// and the foldable cart side panel.
'use strict';

function onCartPage() { return /\/(cart|gp\/cart)/.test(location.pathname); }

var CART_ITEM_SELECTOR = '[data-asin][data-itemtype], .sc-list-item[data-asin], div[data-asin].sc-list-item-content, [data-asin].a-row.sc-list-item';

function cartItems() {
    const items = [];
    const seen = new Set();
    for (const node of $$(CART_ITEM_SELECTOR)) {
        const asin = node.getAttribute('data-asin');
        if (!asin || seen.has(asin)) continue;
        seen.add(asin);
        const titleEl = node.querySelector('.sc-product-title, .a-truncate-full, .sc-grid-item-product-title, h4, .a-list-item');
        const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) || asin;
        items.push({ asin, title });
    }
    return items;
}

// ---------- Subscribe & Save ----------

// Change the choice only in the first 4 seconds after the page opens.
// After that, a selected subscription is the user's choice.
var SNS_GRACE_MS = 4000;

defineFeature({
    name: 'subscribe and save',
    keys: ['fixSubscribeSave'],
    run() {
        if (!enabled('fixSubscribeSave') || Date.now() - PAGE_LOAD_AT > SNS_GRACE_MS) return;
        const subscription = $('#snsAccordionRowMiddle input[type=radio], input[name="subscriptionOption"]');
        if (!subscription || !subscription.checked) return;
        const oneTime = $('#buyNew_accordionRow input[type=radio], #newAccordionRow_0 input[type=radio], #oneTimeBuyBox input[type=radio]');
        if (!oneTime || oneTime.checked || !claim(oneTime, 'azSns')) return;
        oneTime.click();
    },
});

// ---------- Protection plans ----------

var WARRANTY_DECLINE = ['#attachSiNoCoverage input', '#attachSiNoCoverage-announce', '#attach-close_sideSheet-link', '#siNoCoverage-announce', '#attach-warranty-popover .a-popover-footer .a-button-input'];

defineFeature({
    name: 'protection plans',
    keys: ['dismissWarranty'],
    run() {
        if (!enabled('dismissWarranty')) return;
        for (const selector of WARRANTY_DECLINE) {
            const button = $(selector);
            if (button && claim(button, 'azWarranty')) { button.click(); return; }
        }
    },
    reset() { releaseClaims('azWarranty'); },
});

// ---------- Cart fees ----------

// The cart shows charges as body text, for example "₹64.96 delivery Thu, 13 Aug".
// The text has the same size as the date, so the charge looks like part of the date.
// The pattern is amount, then keyword. Thus, "FREE delivery" never matches.
// The amount must not be zero. The \b before "rs" stops a match inside a word.
var CART_FEE_RE = /(?:₹|\brs\.?|\$)\s*(?!0(?:[.,]0+)?\s)[\d,]+(?:\.\d{1,2})?\s*(?:delivery|shipping|handling|packaging|packing|service|installation|fee|charge)/i;
var FEE_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION']);

// True when at least one Amazon element has the az-cart-fee class.
// It prevents a document-wide query on each run on pages that are not the cart.
var cartFeesFlagged = false;

function clearCartFees() {
    if (!cartFeesFlagged) return;
    removeClass('az-cart-fee');
    cartFeesFlagged = false;
}

function cartFeeScopes() {
    const named = ['#sc-active-cart', '#activeCartViewForm', '#sc-active-items'].map(selector => $(selector)).filter(Boolean);
    // Amazon changes these container names. The item rows are the last fallback.
    return named.length ? named : $$(CART_ITEM_SELECTOR);
}

function highlightCartFees() {
    if (!enabled('showHiddenFees') || !onCartPage()) { clearCartFees(); return; }
    const scopes = cartFeeScopes();
    if (!scopes.length) { clearCartFees(); return; }

    // A quantity change can make a paid delivery free. Remove the old marks first.
    if (cartFeesFlagged) {
        for (const node of $$('.az-cart-fee')) {
            if (!CART_FEE_RE.test(node.textContent || '')) node.classList.remove('az-cart-fee');
        }
    }

    for (const scope of scopes) {
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.nodeValue;
            // Long text is a paragraph, not a charge line.
            if (!text || text.length > 120 || !CART_FEE_RE.test(text)) continue;
            const host = node.parentElement;
            if (!host || FEE_SKIP_TAGS.has(host.tagName)) continue;
            if (host.closest('.az-cart-fee')) continue;
            // Amazon keeps some hidden text, for example other delivery options. Do not show it.
            if (!host.getClientRects().length) continue;
            // This is Amazon's element. Do not add data-az-feature: cleanup removes those nodes.
            host.classList.add('az-cart-fee');
            cartFeesFlagged = true;
        }
    }
}

defineFeature({
    name: 'cart fees',
    keys: ['showHiddenFees'],
    run: highlightCartFees,
    reset() { removeClass('az-cart-fee'); cartFeesFlagged = false; },
});

// ---------- Cart side panel ----------

// When the side panel is hidden, Amazon keeps its space on the right. Next to the dark
// top bar, that space shows as a light strip. This patch paints over the strip.
function navGutterPatch(show) {
    const patch = $('#az-nav-patch');
    const belt = $('#nav-belt');
    if (!show || !belt) { patch?.remove(); return; }

    let width = 0;
    for (const node of [$('#a-page'), document.body, belt]) {
        if (node) width = Math.max(width, parseFloat(getComputedStyle(node).paddingRight) || 0);
    }
    if (!width) { patch?.remove(); return; }

    // The cashback banner pushes the top bar down. Thus, measure the bar position each time.
    const top = Math.max(0, Math.round(belt.getBoundingClientRect().top + window.scrollY));
    const node = patch || document.body.appendChild(el('div', { id: 'az-nav-patch', 'data-az-feature': 'ewc' }));
    node.style.setProperty('top', `${top}px`, 'important');
    node.style.setProperty('width', `${width}px`, 'important');
    node.style.setProperty('height', `${belt.offsetHeight}px`, 'important');
    node.style.setProperty('background', getComputedStyle(belt).backgroundColor || '#131921', 'important');
}

function cartRailToggle() {
    const root = document.documentElement;
    const rail = $('#nav-flyout-ewc');
    if (!enabled('ewcCollapse') || !rail) {
        root.removeAttribute('data-az-ewc');
        $('#az-ewc-toggle')?.remove();
        navGutterPatch(false);
        return;
    }
    if (!root.hasAttribute('data-az-ewc')) root.setAttribute('data-az-ewc', session.ewcOpen ? 'open' : 'closed');

    let button = $('#az-ewc-toggle');
    if (!button) {
        button = el('button', {
            id: 'az-ewc-toggle', type: 'button', 'data-az-feature': 'ewc',
            onclick: () => {
                const open = root.getAttribute('data-az-ewc') !== 'open';
                root.setAttribute('data-az-ewc', open ? 'open' : 'closed');
                saveSession('ewcOpen', open);
                cartRailToggle();
            },
        });
        document.body.append(button);
    }

    const open = root.getAttribute('data-az-ewc') === 'open';
    navGutterPatch(!open);

    // Change the button content only when the state changes. Each change is a DOM
    // mutation, and a mutation starts a new run.
    const count = ($('#nav-cart-count')?.textContent || '').trim();
    const state = `${open}|${count}`;
    if (button.dataset.state !== state) {
        button.dataset.state = state;
        button.replaceChildren(open ? '✕ 🛒' : '🛒', ...(count && count !== '0' ? [' ', el('span', { text: count })] : []));
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', open ? 'Hide the cart panel' : 'Show the cart panel');
    }
    button.style.setProperty('right', open ? `${rail.offsetWidth}px` : '0px', 'important');
}

defineFeature({
    name: 'cart side panel',
    keys: ['ewcCollapse'],
    run: cartRailToggle,
    reset() {
        document.documentElement.removeAttribute('data-az-ewc');
        $('#az-ewc-toggle')?.remove();
        navGutterPatch(false);
    },
});
