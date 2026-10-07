// My Personal UX for Amazon: search results page.
// Features: hide sponsored results and ad strips, price per unit, few-ratings warning.
'use strict';

var UNIT_GROUPS = [
    { label: '100 g', per: 100, units: { mg: 0.001, g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, kgs: 1000, kilogram: 1000, kilograms: 1000 } },
    { label: '100 ml', per: 100, units: { ml: 1, millilitre: 1, milliliter: 1, l: 1000, ltr: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000 } },
    { label: 'piece', per: 1, units: { pc: 1, pcs: 1, piece: 1, pieces: 1, count: 1, tablet: 1, tablets: 1, capsule: 1, capsules: 1, sheet: 1, sheets: 1, roll: 1, rolls: 1, wipe: 1, wipes: 1, sachet: 1, sachets: 1 } },
];

// Longest unit first, so "kg" matches before "g".
var UNIT_ALTERNATION = UNIT_GROUPS.flatMap(group => Object.keys(group.units)).sort((a, b) => b.length - a.length).join('|');
var MULTI_QTY_RE = new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALTERNATION})\\b`);
var SINGLE_QTY_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALTERNATION})\\b`);
var PACK_OF_RE = /pack of\s*(\d+)/;

// Amazon sometimes shows its own unit price, for example "(₹12.50/100 g)".
var NATIVE_UNIT_RE = /\(\s*[₹$]\s*[\d,]+(?:\.\d+)?\s*\/\s*[^)]+\)/;

function unitGroupFor(unit) {
    return UNIT_GROUPS.find(group => Object.prototype.hasOwnProperty.call(group.units, unit));
}

// Reads the quantity from a product title. Example: "2 x 500 g" gives 1000 g.
function parseQuantity(title) {
    const text = title.toLowerCase();
    const multi = text.match(MULTI_QTY_RE);
    if (multi) {
        const group = unitGroupFor(multi[3]);
        if (group) return { amount: parseInt(multi[1], 10) * parseFloat(multi[2]) * group.units[multi[3]], group, approx: false };
    }
    const single = text.match(SINGLE_QTY_RE);
    if (!single) return null;
    const group = unitGroupFor(single[2]);
    if (!group) return null;
    let amount = parseFloat(single[1]) * group.units[single[2]];
    let approx = false;
    const pack = text.match(PACK_OF_RE);
    // "Pack of" titles do not always say if the size is for one item or for all items.
    if (pack) { amount *= parseInt(pack[1], 10); approx = true; }
    return { amount, group, approx };
}

function unitPriceChipFor(card) {
    const titleEl = card.querySelector('h2 span, [data-cy="title-recipe"] span, h2 a span');
    // Ask for .a-offscreen first, in a separate query. A selector list gives the first match in
    // page order: that is .a-price, and its text has the price two times ("₹899₹899").
    const priceEl = card.querySelector('.a-price .a-offscreen') || card.querySelector('.a-price');
    if (!titleEl || !priceEl) return null;

    const native = $$('span', card).map(span => span.textContent).find(text => text && text.length < 40 && NATIVE_UNIT_RE.test(text));
    if (native) return makeChip(native.replace(/[()]/g, '').trim(), 'unit', '', 'cards');

    const price = parseMoney(priceEl.textContent);
    const qty = parseQuantity(titleEl.textContent || '');
    if (!price || !qty || qty.amount <= 0) return null;
    const perUnit = (price / qty.amount) * qty.group.per;
    // A unit price above ten times the price means that the title parse is wrong.
    if (!isFinite(perUnit) || perUnit <= 0 || perUnit > price * 10) return null;
    return makeChip(`${formatMoney(perUnit)} / ${qty.group.label}`, 'unit', qty.approx ? '(approx, "pack of")' : '', 'cards');
}

function isSponsoredCard(card) {
    const label = card.querySelector('.puis-sponsored-label-text, .s-sponsored-label-text, [data-component-type="sp-sponsored-result"]');
    return Boolean(label) || $$('span.a-color-secondary', card).some(span => /^sponsored$/i.test(span.textContent.trim()));
}

function ratingCount(card) {
    const countEl = card.querySelector('a[href*="#customerReviews"] span.s-underline-text, span[aria-label*="ratings"]');
    const raw = countEl ? countEl.textContent.trim() : '';
    return /^[\d,]+$/.test(raw) ? parseInt(raw.replace(/,/g, ''), 10) : null;
}

function annotateSearchResults() {
    const hideAds = enabled('hideSponsored');
    const unitPrice = enabled('showUnitPrice');
    const fewReviews = enabled('flagFewReviews');
    if (!hideAds && !unitPrice && !fewReviews) return;

    for (const card of $$('div[data-component-type="s-search-result"]')) {
        if (!claim(card, 'azCard')) continue;
        if (hideAds && isSponsoredCard(card)) { card.classList.add('az-sponsored'); continue; }

        const anchor = card.querySelector('.a-price')?.closest('.a-row, .a-section') || card.querySelector('[data-cy="price-recipe"]') || card.querySelector('h2');
        if (!anchor) continue;
        const chips = el('div', { 'data-az-feature': 'cards' });
        if (unitPrice) {
            const chip = unitPriceChipFor(card);
            if (chip) chips.append(chip);
        }
        if (fewReviews) {
            const count = ratingCount(card);
            if (count !== null && count > 0 && count < 50) chips.append(makeChip(`Only ${count} rating${count === 1 ? '' : 's'}`, 'warn', '', 'cards'));
        }
        if (chips.childElementCount) anchor.insertAdjacentElement('afterend', chips);
    }
}

defineFeature({
    name: 'search results',
    keys: ['hideSponsored', 'showUnitPrice', 'flagFewReviews'],
    run: annotateSearchResults,
    reset() {
        removeClass('az-sponsored');
        releaseClaims('azCard');
        removeFeatureNodes('cards');
    },
});

// The ad strips and skyscraper ads are hidden by CSS. See data-az-ads in content.css.
defineFeature({
    name: 'search ads',
    keys: ['hideSponsored'],
    run: () => setRootFlag('data-az-ads', enabled('hideSponsored') && 'hide'),
    reset: () => setRootFlag('data-az-ads', null),
});
