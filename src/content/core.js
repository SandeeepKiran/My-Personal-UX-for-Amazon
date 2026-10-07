// My Personal UX for Amazon: state and helpers for the content scripts.
// Load order (see manifest.json): settings.js, core.js, feature files, panel.js, main.js.
// Values that other files use are "var" or function declarations. See settings.js.
'use strict';

var IS_IN = location.hostname.endsWith('amazon.in');
var REGION = IS_IN ? 'in' : 'com';
var PAGE_LOAD_AT = Date.now();

// Data in storage.local. It stays on this device and does not sync.
var SESSION_DEFAULTS = Object.freeze({
    affTag: null, affAt: 0, affRun: null,
    trackedAsins: {}, cashbackHidden: false,
    ewcOpen: false, wishlists: null, wishlistsAt: 0,
    lastHost: null, uiCollapsed: [],
});

var settings = { ...AZ.DEFAULTS };
var session = { ...SESSION_DEFAULTS };

// The id of this browser run. main.js sets it at start. See browserRunId().
// Null means that the browser cannot tell. Then restart detection is off.
var RUN_ID = null;

var el = AZ.el;

function $(selector, root = document) { return root.querySelector(selector); }
function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

// Amazon changes its pages often. One failed feature must not stop the others.
function safely(name, fn) {
    try { fn(); } catch (err) { console.warn(`[My Personal UX] ${name} failed:`, err); }
}

// India-only features stay off on amazon.com, also if the setting is on.
function enabled(key) { return Boolean(settings[key]) && (IS_IN || !AZ.IN_ONLY.has(key)); }
function isOff() { return settings.mode === 'off'; }

function save(key, value) {
    settings[key] = value;
    ext.storage.sync.set({ settings: { ...settings } }).catch(err => console.warn('[My Personal UX] save failed:', err));
}

function saveSession(key, value) {
    session[key] = value;
    ext.storage.local.set({ [key]: value }).catch(() => { /* The next save tries again. */ });
}

// Sets or removes a flag attribute on <html>. content.css reads these flags.
function setRootFlag(name, value) {
    if (value) document.documentElement.setAttribute(name, value);
    else document.documentElement.removeAttribute(name);
}

// A claim marks an Amazon element as done, so the next run does not do it again.
// Example: claim(node, 'azCard') sets data-az-card="1".
var claimTags = new Set();

function claim(node, tag) {
    if (node.dataset[tag]) return false;
    node.dataset[tag] = '1';
    claimTags.add(tag);
    return true;
}

function releaseClaims(...tags) {
    for (const tag of tags) {
        const attr = 'data-' + tag.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
        for (const node of $$(`[${attr}]`)) node.removeAttribute(attr);
    }
}

function releaseAllClaims() { releaseClaims(...claimTags); }

// All elements that the extension adds have data-az-feature. Then cleanup can find them.
function removeFeatureNodes(feature) {
    for (const node of $$(`[data-az-feature="${feature}"]`)) node.remove();
}

function removeClass(className) {
    for (const node of $$(`.${className}`)) node.classList.remove(className);
}

function makeChip(text, kind, note, feature) {
    const chip = el('span', { class: `az-chip az-chip-${kind}`, 'data-az-feature': feature, text });
    if (note) chip.append(el('span', { class: 'az-note', text: ` ${note}` }));
    return chip;
}

// ---------- Money ----------

var CURRENCY = IS_IN ? { symbol: '₹', locale: 'en-IN' } : { symbol: '$', locale: 'en-US' };

function parseMoney(text) {
    if (!text) return null;
    const match = text.replace(/[,₹$]/g, '').match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

// Unit prices: whole numbers from 100 up, two decimals below 100.
function formatMoney(value) {
    return CURRENCY.symbol + (value >= 100 ? Math.round(value).toLocaleString(CURRENCY.locale) : value.toFixed(2));
}

// Fees: "+₹40", not "+₹40.00".
function formatFee(value) {
    return CURRENCY.symbol + (Number.isInteger(value) ? value.toLocaleString(CURRENCY.locale) : value.toFixed(2));
}

// ---------- Icons ----------

// Static SVG that the developer wrote. Never put page text in this markup.
function svgFrom(markup) {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
}

var ICON_PATHS = {
    lock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    unlock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.6-1.6"/>',
    heart: '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
    star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
};

function icon(name, { cls = '', filled = false, size = 14, strokeWidth = 2 } = {}) {
    const fill = filled ? 'currentColor' : 'none';
    const stroke = filled ? 'none' : 'currentColor';
    return svgFrom(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${cls}">${ICON_PATHS[name]}</svg>`);
}

// ---------- Feature registry ----------

// Each feature file registers its features here. main.js runs them in this order.
// keys: the settings that control the feature.
// run(): applies the feature. It must be safe to call many times.
// reset(): removes the feature from the page. main.js calls it when a key changes.
var FEATURES = [];

function defineFeature({ name, keys = [], run, reset = () => {} }) {
    FEATURES.push({ name, keys, run, reset });
}
