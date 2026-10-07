// My Personal UX for Amazon: shared settings and settings screens.
// The popup and the content scripts load this file first.
// This file is the only list of settings. Thus, the popup and the page panel always agree.
'use strict';

// Firefox and Chrome 148+ have "browser". Older Chrome and Edge have only "chrome".
// Both return a promise when you do not give a callback. Thus, all code uses promises.
// Do not give callbacks: Firefox "browser" APIs refuse them.
// Values that other files use are "var". A "var" is a property of the global object,
// so all content scripts can read it in all browsers.
var ext = globalThis.browser ?? globalThis.chrome;

var AZ = (() => {
    // Each group is one area of Amazon. The order here is the order on the screen.
    // Toggle format: [storage key, label, hint, India only].
    const GROUPS = [
        {
            id: 'search', icon: '🔍', title: 'Search results',
            toggles: [
                ['hideSponsored', 'Hide sponsored results', 'Removes paid results and ad strips from search.'],
                ['showUnitPrice', 'Show price per unit', 'Shows the price for each 100 g, 100 ml or piece.'],
                ['flagFewReviews', 'Flag few ratings', 'Warns when a product has fewer than 50 ratings.'],
            ],
        },
        {
            id: 'price', icon: '🏷️', title: 'Product page: price and offers',
            cards: true,
            toggles: [
                ['biggerPrice', 'Bigger price', 'Makes the main price in the buy box larger.'],
                ['showHiddenFees', 'Warn about extra fees', 'Shows delivery, handling and other charges next to the price and in the cart.'],
                ['highlightCoupon', 'Highlight coupons', 'Puts a green box around coupons, because they are easy to miss.'],
                ['autoApplyCoupon', 'Apply coupons automatically', 'Applies the coupon when the page opens. If you remove a coupon, it stays removed.'],
                ['showBankOffers', 'Show bank offers', 'Shows bank offers below the price.', true],
                ['hideEmi', 'Hide EMI options', 'Hides the EMI and "No Cost EMI" rows.', true],
            ],
        },
        {
            id: 'tools', icon: '🧰', title: 'Product page: helpers',
            toggles: [
                ['showSellerBadge', 'Show the seller', 'Tells you if Amazon or a third-party seller sells the product.'],
                ['priceHistoryButton', 'Price history buttons', 'Adds a Keepa button. On amazon.in, also adds a PriceHistory button.'],
                ['reviewsButton', 'Reviews button', 'Shows the rating and goes to the customer reviews.'],
            ],
        },
        {
            id: 'declutter', icon: '🧹', title: 'Product page: clutter',
            toggles: [
                ['stripUrgency', 'Remove urgency text', 'Hides "Only 3 left", "Order soon" and countdown timers.'],
                ['hideCarousels', 'Hide recommendation rails', 'Hides "Customers also bought" and "Inspired by your browsing".'],
                ['hideProductVideos', 'Hide the video rail', 'Hides the "Videos for this product" rail.'],
                ['hideBrandCarousel', 'Hide the brand rail', 'Hides the "Brands in this category on Amazon" rail.'],
                ['hideFeedbackBlock', 'Hide the Feedback block', 'Hides the feedback form in Product information.'],
                ['reorderDetails', 'Specs before recommendations', 'Moves the box contents, product details and brand card above the related products.'],
            ],
        },
        {
            id: 'cart', icon: '🛒', title: 'Add to cart and cart',
            toggles: [
                ['fixSubscribeSave', 'Choose one-time purchase', 'Changes a preselected Subscribe & Save to a one-time purchase.'],
                ['dismissWarranty', 'Decline protection plans', 'Closes the protection plan pop-up after Add to Cart.'],
                ['ewcCollapse', 'Fold the cart side panel', 'Puts the cart panel on the right behind a 🛒 tab.'],
                ['cashkaroWatch', 'Cashback watch', 'Tells you if a cashback link tracks your visit and your cart items.', true],
            ],
        },
        {
            id: 'nav', icon: '🧭', title: 'Top bar',
            toggles: [
                ['customAccountMenu', 'Clean Account menu', 'Replaces the Account menu with your lists, orders and support links.'],
                ['hideNavExtras', 'Explore menu', 'Replaces the row of links below the search bar with one Explore menu.'],
            ],
        },
    ].map(group => ({
        ...group,
        toggles: group.toggles.map(([key, label, hint, inOnly = false]) => ({ key, label, hint, inOnly })),
    }));

    const TOGGLES = GROUPS.flatMap(group => group.toggles);

    const DEFAULTS = { mode: 'simple', myCards: '' };
    for (const toggle of TOGGLES) DEFAULTS[toggle.key] = true;

    // These features use amazon.in pages only. On amazon.com, they stay off.
    const IN_ONLY = new Set(TOGGLES.filter(toggle => toggle.inOnly).map(toggle => toggle.key));

    const MODES = [
        { value: 'simple', label: 'Simple', hint: 'Removes clutter. Uses the options on the Settings tab.' },
        { value: 'off', label: 'Disabled', hint: 'Shows normal Amazon. The extension changes nothing.' },
    ];

    const CARDS_HINT = 'Type your bank names. Put a comma between names. Example: HDFC, Amazon Pay ICICI. Leave empty to see all offers.';

    // An affiliate click-through stays valid for 24 hours.
    const AFFILIATE_WINDOW_MS = 24 * 60 * 60 * 1000;

    // Cashback sites for each Amazon region. The extension has no link to these sites.
    const AGGREGATORS = {
        in: [['CashKaro', 'https://cashkaro.com/stores/amazon'], ['EarnKaro', 'https://earnkaro.com/amazon-offers']],
        com: [['Rakuten', 'https://www.rakuten.com/amazon.com'], ['TopCashback', 'https://www.topcashback.com/amazon/']],
    };

    // Version 3.2.0 removed "power" mode. All values other than "off" mean "simple".
    const normalizeMode = mode => (mode === 'off' ? 'off' : 'simple');

    // Synced data can come from an old version or another device.
    // Keep a stored value only if its type agrees with the default.
    function readSettings(stored = {}) {
        const out = { ...DEFAULTS };
        for (const key of Object.keys(DEFAULTS)) {
            if (stored && typeof stored[key] === typeof DEFAULTS[key]) out[key] = stored[key];
        }
        out.mode = normalizeMode(out.mode);
        return out;
    }

    function affiliateState({ affTag, affAt, affRun }, runId, now = Date.now()) {
        const age = now - (affAt || 0);
        const within = Boolean(affTag) && age < AFFILIATE_WINDOW_MS;
        // A different run id means that the browser closed after the click-through.
        // The affiliate cookie can be gone or not. Thus, the state is "unverified".
        const stale = within && Boolean(runId) && Boolean(affRun) && affRun !== runId;
        return {
            tag: affTag,
            live: within && !stale,
            stale,
            hoursLeft: Math.max(0, Math.floor((AFFILIATE_WINDOW_MS - age) / 3600000)),
        };
    }

    // Makes an element. Text goes in as textContent only, never as HTML.
    // Props: "class", "text", "on<event>" listeners, other keys become attributes.
    function el(tag, props = {}, ...children) {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(props)) {
            if (value === null || value === undefined || value === false) continue;
            if (name === 'class') node.className = value;
            else if (name === 'text') node.textContent = value;
            else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
            else node.setAttribute(name, value === true ? '' : String(value));
        }
        node.append(...children.filter(child => child !== null && child !== undefined && child !== false));
        return node;
    }

    function textBlock(label, hint) {
        return el('span', { class: 'az-toggle-text' },
            el('span', { class: 'az-label-text', text: label }),
            el('span', { class: 'az-hint', text: hint }));
    }

    function buildModes(root, { mode, onChange }) {
        root.textContent = '';
        const inputs = MODES.map(option => {
            const input = el('input', { type: 'radio', name: 'az-mode', value: option.value, class: 'az-radio' });
            input.checked = option.value === mode;
            input.addEventListener('change', () => { if (input.checked) onChange(option.value); });
            root.append(el('label', { class: 'az-mode' }, input, textBlock(option.label, option.hint)));
            return input;
        });
        return {
            update(next) { for (const input of inputs) input.checked = input.value === next; },
        };
    }

    // Region: "in", "com", or null if unknown. On "com", India-only switches are disabled.
    function buildSettings(root, { values, region, collapsed = [], onToggle, onCards, onCollapse }) {
        root.textContent = '';
        const closed = new Set(collapsed);
        const switches = new Map();
        const counters = [];
        let cardsInput = null;

        for (const group of GROUPS) {
            const count = el('span', { class: 'az-group-count' });
            const body = el('div', { class: 'az-group-body' });
            const details = el('details', { class: 'az-group', 'data-group': group.id },
                el('summary', { class: 'az-group-head' },
                    el('span', { class: 'az-group-icon', 'aria-hidden': 'true', text: group.icon }),
                    el('span', { class: 'az-group-title', text: group.title }),
                    count),
                body);
            details.open = !closed.has(group.id);
            // The browser also sends "toggle" when the code sets "open".
            // Save only when the state really changes.
            details.addEventListener('toggle', () => {
                const nowClosed = !details.open;
                if (nowClosed === closed.has(group.id)) return;
                if (nowClosed) closed.add(group.id); else closed.delete(group.id);
                if (onCollapse) onCollapse([...closed]);
            });

            for (const toggle of group.toggles) {
                const blocked = region === 'com' && toggle.inOnly;
                const input = el('input', { type: 'checkbox', role: 'switch', class: 'az-switch', 'data-az-key': toggle.key });
                input.disabled = blocked;
                input.addEventListener('change', () => { onToggle(toggle.key, input.checked); paintCounts(); });
                switches.set(toggle.key, input);

                const text = textBlock(toggle.label, toggle.hint);
                if (toggle.inOnly) text.firstChild.append(el('span', { class: 'az-tag', text: 'India only' }));
                body.append(el('label', { class: blocked ? 'az-toggle az-blocked' : 'az-toggle' }, text, input));
            }

            if (group.cards) {
                cardsInput = el('input', { type: 'text', class: 'az-input', maxlength: 200, placeholder: 'Example: HDFC, SBI', 'aria-label': 'My cards' });
                cardsInput.addEventListener('change', () => onCards(cardsInput.value.trim()));
                body.append(el('div', { class: 'az-cards' }, textBlock('My cards', CARDS_HINT), cardsInput));
            }

            counters.push({ group, count });
            root.append(details);
        }

        function paintCounts() {
            for (const { group, count } of counters) {
                const on = group.toggles.filter(toggle => switches.get(toggle.key).checked).length;
                count.textContent = `${on}/${group.toggles.length}`;
                count.classList.toggle('az-none-on', on === 0);
            }
        }

        function update(next) {
            for (const [key, input] of switches) input.checked = Boolean(next[key]);
            if (cardsInput && document.activeElement !== cardsInput) cardsInput.value = next.myCards || '';
            paintCounts();
        }

        update(values);
        return { update };
    }

    // Shows which affiliate tag gets credit for this visit.
    // A tag from a YouTube or blog link shows here the same as a CashKaro tag.
    function renderAffiliate(box, { tag, live, stale, hoursLeft, region }) {
        box.textContent = '';
        const tone = live ? 'az-aff-on' : stale ? 'az-aff-unsure' : 'az-aff-off';
        const title = live ? `Active: ${tag}` : stale ? `Unverified: ${tag}` : 'No affiliate link active';
        const hint = live
            ? `About ${hoursLeft} h left. The owner of this tag gets credit for items that you add from now on.`
            : stale
                ? 'The browser closed after you got this tag. The tag can be gone. Open Amazon from the cashback site again to be sure.'
                : 'Nothing tracks this visit. To earn cashback, open Amazon from a cashback site.';
        box.append(el('div', { class: `az-aff-state ${tone}`, text: title }), el('span', { class: 'az-hint', text: hint }));
        if (live) return;
        box.append(el('div', { class: 'az-aff-links' },
            ...AGGREGATORS[region === 'com' ? 'com' : 'in'].map(([name, url]) =>
                el('a', { class: 'az-aff-link', href: url, target: '_blank', rel: 'noopener noreferrer', text: name }))));
    }

    // Pairs: [[tab button, view], ...]. Returns a function that selects a tab by index.
    function wireTabs(pairs) {
        const select = index => pairs.forEach(([tab, view], i) => {
            const on = i === index;
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-selected', String(on));
            view.hidden = !on;
        });
        pairs.forEach(([tab], i) => tab.addEventListener('click', () => select(i)));
        select(0);
        return select;
    }

    // The footer shows on the popup and on the page panel.
    function footer(version) {
        return el('div', { class: 'az-foot' },
            el('span', { class: 'az-version', text: `v${version}` }),
            el('span', { class: 'az-made', text: 'Made with ❤️ by Mousy!' }));
    }

    return Object.freeze({
        GROUPS, TOGGLES, DEFAULTS, IN_ONLY, MODES, AFFILIATE_WINDOW_MS, AGGREGATORS,
        normalizeMode, readSettings, affiliateState, el, buildModes, buildSettings, renderAffiliate, wireTabs, footer,
    });
})();
