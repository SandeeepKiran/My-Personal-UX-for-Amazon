// My Personal UX for Amazon: top bar.
// Features: the clean Account menu (with wishlists) and the Explore menu.
'use strict';

// Menu data format: sections of { title, links: [[label, href, dot color, tinted row]] }.
// All Amazon links are relative. Thus, they work on amazon.in and amazon.com,
// and they have no account or referral parameters.
var ACCOUNT_SECTIONS = [
    {
        id: 'az-account-heading', title: 'Account',
        links: [
            ['Your Account', '/gp/css/homepage.html'],
            ['Your Orders', '/gp/css/order-history'],
            ['Returns', '/gp/css/returns/homepage.html'],
            ['Your Prime Membership', '/prime'],
            ['Memberships & Subscriptions', '/hz/mycd/myx'],
        ],
    },
    {
        title: 'Customer Support',
        links: [
            ['Support — Center', '/hz/contact-us/'],
            ['Support — Chat', '/message-us'],
            ['Message Center — Seller', '/gp/message#!/inbox/bsm'],
        ],
    },
];

var EXPLORE_SECTIONS = {
    in: [
        {
            title: 'Groceries & Fast Delivery',
            links: [
                ['Amazon Now', '/tez/browse/home?qcbrand=qqfsWw9RkO&ref=nav_cs_dsk_grfl_stfr_at', 'now', true],
                ['Fresh Meat', '/alm/storefront?almBrandId=foq3ZnlEaO&ref=nav_cs_dsk_grfl_stfr_fm', 'meat', true],
            ],
        },
        {
            title: 'Shopping & Deals',
            links: [
                ["Today's Deals", '/deals', 'deals'],
                ['Best Sellers', '/gp/bestsellers', 'bestsellers'],
                ['New Releases', '/gp/new-releases', 'new'],
                ['Amazon Pay', '/amazonpay/home', 'pay', true],
            ],
        },
        {
            title: 'Entertainment',
            links: [
                ['Prime Video', '/primevideo', 'video'],
                ['Amazon miniTV', '/minitv', 'mini'],
                ['Amazon Music', '/music', 'music'],
            ],
        },
        { links: [['Sell on Amazon', '/b/register', 'sell']] },
    ],
    com: [
        {
            title: 'Shopping & Deals',
            links: [
                ["Today's Deals", '/deals', 'deals'],
                ['Best Sellers', '/gp/bestsellers', 'bestsellers'],
                ['New Releases', '/gp/new-releases', 'new'],
            ],
        },
        {
            title: 'Entertainment',
            links: [
                ['Prime Video', '/gp/video/storefront', 'video'],
                ['Amazon Music', 'https://music.amazon.com', 'music'],
            ],
        },
        { links: [['Sell on Amazon', 'https://sell.amazon.com', 'sell']] },
    ],
};

function menuSections(sections) {
    const nodes = [];
    sections.forEach((section, index) => {
        if (index > 0) nodes.push(el('div', { class: 'az-divider' }));
        if (section.title) nodes.push(el('div', { class: 'az-dropdown-title', id: section.id, text: section.title }));
        for (const [label, href, dot, tinted] of section.links) {
            nodes.push(el('a', { href, class: tinted ? `az-row az-row-${dot}` : null },
                dot ? el('span', { class: `az-dot az-dot-${dot}` }) : null,
                label));
        }
    });
    return nodes;
}

function menuButton(id, label) {
    return el('div', { id, tabindex: 0, 'aria-haspopup': 'true' },
        label,
        icon('chevron', { cls: 'az-arrow', size: 12, strokeWidth: 3 }));
}

// ---------- Account name ----------

// Reads the first name of the signed-in user from Amazon's own top bar. Example: "Hello, Mousy".
function customerName() {
    const greeting = $('#nav-link-accountList-nav-line-1, #nav-link-accountList .nav-line-1');
    const match = (greeting?.textContent || '').trim().match(/^hello,\s*(.+)$/i);
    return match && !/sign in/i.test(match[1]) ? match[1].trim() : null;
}

// Amazon can fill in the name after the menu exists. Keep the menu labels up to date.
function refreshAccountName() {
    const name = customerName();
    if (!name) return;
    const greeting = $('#az-account-greeting');
    const heading = $('#az-account-heading');
    if (greeting && greeting.textContent !== `Hello, ${name}`) greeting.textContent = `Hello, ${name}`;
    if (heading && heading.textContent !== `Account — ${name}`) heading.textContent = `Account — ${name}`;
}

// ---------- Wishlists ----------

var WL_PALETTE = ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];
// Amazon writes the list state in the link text, for example "Mousy's List Default List Private".
var PRIVACY_RE = /\b(private|shared|public)\s*$/i;
var DEFAULT_LIST_RE = /\bdefault\s+list\b/i;
// A list link must point to a wishlist page on this site. Other links are refused.
var WISHLIST_ID_RE = /\/hz\/wishlist\/ls\/([A-Z0-9]+)/i;
// Get a new copy of the lists from Amazon at most one time in 15 minutes.
var WISHLIST_MAX_AGE_MS = 15 * 60 * 1000;

function wishlistHref(raw) {
    try {
        const url = new URL(raw, location.origin);
        if (url.origin !== location.origin) return null;
        const match = url.pathname.match(WISHLIST_ID_RE);
        return match ? `/hz/wishlist/ls/${match[1]}` : null;
    } catch { return null; }
}

function parseListName(raw) {
    let name = (raw || '').replace(/\s+/g, ' ').trim();
    let privacy = '';
    const match = name.match(PRIVACY_RE);
    if (match) { privacy = match[1].toLowerCase(); name = name.slice(0, match.index).trim(); }
    const isDefault = DEFAULT_LIST_RE.test(name);
    if (isDefault) name = name.replace(DEFAULT_LIST_RE, ' ').replace(/\s+/g, ' ').trim();
    name = name.replace(/[-–—•|,:]+\s*$/, '').trim();
    return { name: name || 'Wish List', privacy, isDefault };
}

function renderWishlists(container, lists) {
    if (!lists || !lists.length) return;
    const rows = [];
    const added = new Set();
    for (const list of lists.slice(0, 12)) {
        const href = wishlistHref(list.href);
        if (!href || !list.name) continue;
        const parsed = parseListName(list.name);
        const key = parsed.name.toLowerCase();
        if (added.has(key)) continue;
        added.add(key);

        const dot = el('span', { class: 'az-dot' });
        dot.style.setProperty('background', WL_PALETTE[rows.length % WL_PALETTE.length], 'important');
        // List names come from the page. They go in as text only.
        const row = el('a', { href, class: parsed.isDefault ? 'az-wl az-wl-is-default' : 'az-wl' },
            dot, el('span', { class: 'az-wl-name', text: parsed.name }));
        if (parsed.isDefault) {
            const heart = icon('heart', { cls: 'az-wl-icon az-wl-default', filled: true });
            heart.setAttribute('aria-label', 'Default list');
            row.append(heart);
        }
        if (parsed.privacy) {
            const lock = icon(parsed.privacy === 'private' ? 'lock' : 'unlock', { cls: 'az-wl-icon' });
            lock.setAttribute('aria-label', parsed.privacy);
            row.append(lock);
        }
        rows.push(row);
    }
    if (!rows.length) return;
    container.replaceChildren(...rows);
    container.dataset.synced = '1';
}

// In Firefox, the normal fetch() of a content script does not run as the page.
// content.fetch() does, so Amazon gets the user's cookies. Chrome has no "content".
function pageFetch(url, options) {
    if (typeof content === 'object' && content && typeof content.fetch === 'function') return content.fetch(url, options);
    return fetch(url, options);
}

// The extension hides Amazon's own account flyout. Thus, Amazon does not fill in its
// wishlist items. Get the wishlist page from Amazon directly instead.
async function fetchWishlists() {
    try {
        const response = await pageFetch(new URL('/hz/wishlist/ls', location.origin).href, { credentials: 'include' });
        if (!response.ok) return null;
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const seen = new Set();
        const lists = [];
        for (const link of doc.querySelectorAll('a[href*="/hz/wishlist/ls/"]')) {
            const match = (link.getAttribute('href') || '').match(WISHLIST_ID_RE);
            const name = (link.textContent || '').replace(/\s+/g, ' ').trim();
            if (!match || !name || name.length > 60 || seen.has(match[1])) continue;
            if (/create|explore|discover|idea list|your friends/i.test(name)) continue;
            // "All Wish Lists" already goes to this page.
            if (/^your lists$/i.test(name)) continue;
            seen.add(match[1]);
            lists.push({ name, href: `/hz/wishlist/ls/${match[1]}` });
        }
        return lists.length ? lists : null;
    } catch { return null; }
}

var wishlistFetchStarted = false;

function syncDynamicWishlists() {
    const container = $('#az-dynamic-wishlists');
    if (!container) return;

    // 1. Show the saved lists from an earlier fetch at once.
    if (container.dataset.synced !== '1' && Array.isArray(session.wishlists)) renderWishlists(container, session.wishlists);

    // 2. If Amazon filled in its own flyout, use those items.
    if (container.dataset.synced !== '1') {
        const native = $$('#nav-flyout-wl-items .nav-link, #nav-al-wishlist a')
            .filter(link => !/create|explore|discover/i.test(link.textContent || ''))
            .map(link => ({ name: (link.textContent || '').trim(), href: link.getAttribute('href') || '' }));
        renderWishlists(container, native);
    }

    // 3. Get a new copy from Amazon, if the saved copy is old. One fetch for each page at most.
    if (wishlistFetchStarted || Date.now() - (session.wishlistsAt || 0) < WISHLIST_MAX_AGE_MS) return;
    wishlistFetchStarted = true;
    fetchWishlists().then(lists => {
        if (!lists) return;
        saveSession('wishlists', lists);
        saveSession('wishlistsAt', Date.now());
        const target = $('#az-dynamic-wishlists');
        if (target) { delete target.dataset.synced; renderWishlists(target, lists); }
    });
}

// ---------- Account menu ----------

function buildAccountMenu() {
    if (!enabled('customAccountMenu')) { $('#az-account-wrap')?.remove(); return; }
    const tools = $('#nav-tools');
    if (!tools) return;
    if ($('#az-account-wrap')) { refreshAccountName(); syncDynamicWishlists(); return; }

    const name = customerName();
    const button = menuButton('az-account-btn', el('span', { id: 'az-account-greeting', text: name ? `Hello, ${name}` : 'Account' }));
    const dropdown = el('div', { class: 'az-dropdown' },
        el('div', { class: 'az-dropdown-title', text: 'Wishlists' }),
        el('div', { id: 'az-dynamic-wishlists' },
            el('a', { href: '/hz/wishlist/ls', class: 'az-note az-wl-loading', text: 'Loading lists… (If this stays, open the lists page.)' })),
        el('a', { href: '/hz/wishlist/ls', class: 'az-strong', text: 'All Wish Lists' }),
        el('div', { class: 'az-divider' }),
        ...menuSections(ACCOUNT_SECTIONS));

    tools.insertBefore(el('div', { id: 'az-account-wrap', 'data-az-feature': 'account' }, button, dropdown), $('#nav-orders') || $('#nav-cart'));
    refreshAccountName();
    syncDynamicWishlists();
}

defineFeature({
    name: 'account menu',
    keys: ['customAccountMenu'],
    run: buildAccountMenu,
    reset() { $('#az-account-wrap')?.remove(); },
});

// ---------- Explore menu ----------

defineFeature({
    name: 'explore menu',
    keys: ['hideNavExtras'],
    run() {
        // CSS hides the links row. See data-az-nav in content.css.
        setRootFlag('data-az-nav', enabled('hideNavExtras') && 'min');
        if (!enabled('hideNavExtras')) { $('#az-nav-wrap')?.remove(); return; }
        const navLeft = $('#nav-belt .nav-left');
        if (!navLeft || $('#az-nav-wrap')) return;
        navLeft.append(el('div', { id: 'az-nav-wrap', 'data-az-feature': 'explore' },
            menuButton('az-nav-btn', 'Explore'),
            el('div', { class: 'az-dropdown' }, ...menuSections(EXPLORE_SECTIONS[REGION]))));
    },
    reset() { $('#az-nav-wrap')?.remove(); setRootFlag('data-az-nav', null); },
});
