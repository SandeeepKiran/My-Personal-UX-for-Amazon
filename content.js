// Amazon — My Personal UX v3.7.0 — content script
// Ported from the TamperMonkey userscript (v2.2.0) by Sandeep Kiran (Mousy).
// Settings live in chrome.storage.sync (synced across devices, shared with the popup).
// Session data (affiliate tag, cart-rail state) lives in chrome.storage.local.
// A per-browser-run id lives in chrome.storage.session, which the browser clears
// on shutdown — that is how we tell a still-live CashKaro click-through from one
// that merely started under 24 hours ago.

(function () {
    'use strict';

    const api = typeof browser !== 'undefined' ? browser : chrome;

    const IS_IN = location.hostname.endsWith('amazon.in');

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

    // "Power" mode was folded into "Simple" in v3.2.0. Anyone still holding the
    // old value in synced storage lands on Simple instead of an unknown mode.
    const normalizeMode = m => (m === 'power' || !m ? 'simple' : m);

    // India-only features (auto-disabled on amazon.com).
    const IN_ONLY = new Set(['cashkaroWatch', 'showBankOffers', 'hideEmi']);

    // Keepa is the only tracker with a deterministic ASIN deep link that covers
    // amazon.in as well as .com (domain 10 = .in, 1 = .com). pricehistoryapp's
    // /search?q= route is a 404 and its product slugs cannot be derived from an
    // ASIN, so it gets the copy-and-open button instead.
    const KEEPA_DOMAIN = IS_IN ? 10 : 1;
    const PRICE_HISTORY_URL = asin => `https://keepa.com/#!product/${KEEPA_DOMAIN}-${asin}`;
    const AFFILIATE_WINDOW_MS = 24 * 60 * 60 * 1000;
    const PAGE_LOAD_AT = Date.now();

    const settings = { ...DEFAULTS };
    const session = { affTag: null, affAt: 0, affRun: null, ewcOpen: false, wishlists: null, trackedAsins: {}, cashbackHidden: false, lastHost: null };

    // Identifies this run of the browser. Lives in chrome.storage.session, which
    // is wiped when the browser fully closes, so a value that no longer matches
    // means every tab was shut and the CashKaro click-through can no longer be
    // assumed to be in force. Null = we could not tell (see browserRunId), in
    // which case we fall back to the old time-only behaviour.
    let RUN_ID = null;

    // Dismissing the banner is a per-page-view action. Persisting it meant a
    // single ✕ silenced the cart warning forever; now the ✕ only lasts until you
    // navigate, and off-cart informational banners keep the old sticky dismissal.
    let bannerDismissed = false;
    let bannerForced = false;

    const enabled = key => settings[key] && (IS_IN || !IN_ONLY.has(key));

    function save(key, value) {
        settings[key] = value;
        api.storage.sync.set({ settings: { ...settings } });
    }
    function saveSession(key, value) {
        session[key] = value;
        api.storage.local.set({ [key]: value });
    }

    const isOff = () => settings.mode === 'off';

    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function safely(name, fn) {
        try { fn(); } catch (err) { console.warn(`[Amazon My UX] ${name} failed:`, err); }
    }

    function claim(el, tag) {
        if (el.dataset[tag]) return false;
        el.dataset[tag] = '1';
        return true;
    }

    function releaseClaims(tag) {
        // dataset key 'azCard' -> attribute 'data-az-card'
        const attr = 'data-' + tag.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        for (const el of $$(`[${attr}]`)) el.removeAttribute(attr);
    }

    function makeChip(text, kind, note, feature) {
        const span = document.createElement('span');
        span.className = `az-chip az-chip-${kind}`;
        span.textContent = text;
        if (feature) span.dataset.azFeature = feature;
        if (note) {
            const small = document.createElement('span');
            small.className = 'az-note';
            small.textContent = ` ${note}`;
            span.appendChild(small);
        }
        return span;
    }

    // ---------- Money & quantity parsing ----------

    function parseMoney(text) {
        if (!text) return null;
        const m = text.replace(/[,₹$]/g, '').match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : null;
    }

    const UNIT_GROUPS = [
        { label: '100 g',  per: 100, units: { mg: 0.001, g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, kgs: 1000, kilogram: 1000, kilograms: 1000 } },
        { label: '100 ml', per: 100, units: { ml: 1, millilitre: 1, milliliter: 1, l: 1000, ltr: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000 } },
        { label: 'piece',  per: 1, units: { pc: 1, pcs: 1, piece: 1, pieces: 1, count: 1, tablet: 1, tablets: 1, capsule: 1, capsules: 1, sheet: 1, sheets: 1, roll: 1, rolls: 1, wipe: 1, wipes: 1, sachet: 1, sachets: 1 } },
    ];

    const ALL_UNITS = UNIT_GROUPS.flatMap(g => Object.keys(g.units)).sort((a, b) => b.length - a.length).join('|');

    function findGroup(unit) {
        return UNIT_GROUPS.find(g => Object.prototype.hasOwnProperty.call(g.units, unit));
    }

    function parseQuantity(title) {
        const text = title.toLowerCase();
        const multi = text.match(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*(${ALL_UNITS})\\b`));
        if (multi) {
            const group = findGroup(multi[3]);
            if (group) return { amount: parseInt(multi[1], 10) * parseFloat(multi[2]) * group.units[multi[3]], group, approx: false };
        }
        const single = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${ALL_UNITS})\\b`));
        if (!single) return null;
        const group = findGroup(single[2]);
        if (!group) return null;
        let amount = parseFloat(single[1]) * group.units[single[2]];
        let approx = false;
        const pack = text.match(/pack of\s*(\d+)/);
        if (pack) { amount *= parseInt(pack[1], 10); approx = true; }
        return { amount, group, approx };
    }

    function formatMoney(value) {
        if (IS_IN) return '₹' + (value >= 100 ? Math.round(value).toLocaleString('en-IN') : value.toFixed(2));
        return '$' + (value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(2));
    }

    const NATIVE_UNIT_RE = /\(\s*[₹$]\s*[\d,]+(?:\.\d+)?\s*\/\s*[^)]+\)/;

    function unitPriceChipFor(card) {
        const titleEl = card.querySelector('h2 span, [data-cy="title-recipe"] span, h2 a span');
        const priceEl = card.querySelector('.a-price .a-offscreen, .a-price');
        if (!titleEl || !priceEl) return null;
        const native = $$('span', card).map(s => s.textContent).find(t => t && t.length < 40 && NATIVE_UNIT_RE.test(t));
        if (native) return makeChip(native.replace(/[()]/g, '').trim(), 'unit', '', 'cards');
        const price = parseMoney(priceEl.textContent);
        const qty = parseQuantity(titleEl.textContent || '');
        if (!price || !qty || qty.amount <= 0) return null;
        const perUnit = (price / qty.amount) * qty.group.per;
        if (!isFinite(perUnit) || perUnit <= 0 || perUnit > price * 10) return null;
        return makeChip(`${formatMoney(perUnit)} / ${qty.group.label}`, 'unit', qty.approx ? '(approx — "pack of")' : '', 'cards');
    }

    // ---------- Features ----------

    function annotateSearchResults() {
        const cards = $$('div[data-component-type="s-search-result"]');
        for (const card of cards) {
            if (!claim(card, 'azCard')) continue;
            if (settings.hideSponsored) {
                const label = card.querySelector('.puis-sponsored-label-text, .s-sponsored-label-text, [data-component-type="sp-sponsored-result"]');
                const looksSponsored = label || $$('span.a-color-secondary', card).some(s => /^sponsored$/i.test(s.textContent.trim()));
                if (looksSponsored) { card.classList.add('az-sponsored'); continue; }
            }
            const anchor = card.querySelector('.a-price')?.closest('.a-row, .a-section') || card.querySelector('[data-cy="price-recipe"]') || card.querySelector('h2');
            if (!anchor) continue;
            const chips = document.createElement('div');
            chips.dataset.azFeature = 'cards';
            if (settings.showUnitPrice) {
                const chip = unitPriceChipFor(card);
                if (chip) chips.appendChild(chip);
            }
            if (settings.flagFewReviews) {
                const countEl = card.querySelector('a[href*="#customerReviews"] span.s-underline-text, span[aria-label*="ratings"]');
                const raw = countEl ? countEl.textContent.trim() : '';
                const count = /^[\d,]+$/.test(raw) ? parseInt(raw.replace(/,/g, ''), 10) : null;
                if (count !== null && count > 0 && count < 50) chips.appendChild(makeChip(`Only ${count} rating${count === 1 ? '' : 's'}`, 'warn', '', 'cards'));
            }
            if (chips.childElementCount) anchor.insertAdjacentElement('afterend', chips);
        }
    }

    function annotateSeller() {
        if (!settings.showSellerBadge) return;
        const buyBox = $('#desktop_buybox, #buybox, #rightCol');
        if (!buyBox || !claim(buyBox, 'azSeller')) return;
        const sellerEl = $('#sellerProfileTriggerId') || $('#merchant-info a') || $('#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"] span');
        const name = sellerEl ? sellerEl.textContent.trim() : null;
        if (!name) return;
        const isAmazon = /amazon|cloudtail|appario/i.test(name);
        const chip = makeChip(
            isAmazon ? `Sold by ${name}` : `Third-party seller: ${name}`,
            isAmazon ? 'good' : 'warn',
            isAmazon ? '' : '— returns handled by the seller',
            'seller'
        );
        const target = $('#apex_desktop') || $('#corePrice_feature_div') || buyBox.firstElementChild;
        target?.insertAdjacentElement('beforebegin', chip);
    }

    const URGENCY_RE = /only\s+\d+\s+left|order\s+soon|ends?\s+in\s+\d|hurry|limited\s+time\s+deal/i;
    function stripUrgency() {
        if (!settings.stripUrgency) return;
        const candidates = $$('.a-color-price, .a-color-success, #availability span, .s-color-price, [id*="deal"] .a-color-price');
        for (const el of candidates) {
            if (!claim(el, 'azUrgency')) continue;
            const text = (el.textContent || '').trim();
            if (text.length < 80 && URGENCY_RE.test(text)) el.classList.add('az-urgency');
        }
    }

    // Only auto-switch away from a preselected Subscribe & Save within the first
    // few seconds of page load. After that, a checked subscription radio is the
    // user's own choice and must be respected.
    const SNS_GRACE_MS = 4000;
    function fixSubscribeSave() {
        if (!settings.fixSubscribeSave) return;
        if (Date.now() - PAGE_LOAD_AT > SNS_GRACE_MS) return;
        const subscription = $('#snsAccordionRowMiddle input[type=radio], input[name="subscriptionOption"]');
        if (!subscription || !subscription.checked) return;
        const oneTime = $('#buyNew_accordionRow input[type=radio], #newAccordionRow_0 input[type=radio], #oneTimeBuyBox input[type=radio]');
        if (!oneTime || oneTime.checked) return;
        if (!claim(oneTime, 'azSns')) return;
        oneTime.click();
    }

    const WARRANTY_DECLINE = ['#attachSiNoCoverage input', '#attachSiNoCoverage-announce', '#attach-close_sideSheet-link', '#siNoCoverage-announce', '#attach-warranty-popover .a-popover-footer .a-button-input'];
    function dismissWarranty() {
        if (!settings.dismissWarranty) return;
        for (const sel of WARRANTY_DECLINE) {
            const btn = $(sel);
            if (btn && claim(btn, 'azWarranty')) { btn.click(); return; }
        }
    }

    const CAROUSEL_HEADINGS = /inspired by your browsing|related to items you|customers who bought|customers also|you might also like|based on your recent|recommended based on|explore more|top picks for you/i;
    function hideCarousels() {
        if (!settings.hideCarousels) return;
        for (const h of $$('h2, h3')) {
            if (!claim(h, 'azCarousel')) continue;
            if (!CAROUSEL_HEADINGS.test(h.textContent || '')) continue;
            const block = h.closest('[data-cel-widget], .a-carousel-container, .a-section');
            if (!block || block === document.body) continue;
            if (block.querySelector('#keepaContainer, [id^="keepa"], [class*="keepa"]')) continue;
            block.classList.add('az-declutter');
        }
    }

    const EMI_SELECTORS = ['#inemi_feature_div', '#emiSignalWithOfferMessaging_feature_div', '#creditCardSignalWithOfferMessaging_feature_div', '#exportsEMIMessage_feature_div', '#emiPlansDetails', '#emiOptionsSection', '#installmentCalculator_feature_div'];
    function hideEmi() {
        if (!enabled('hideEmi')) return;
        for (const sel of EMI_SELECTORS) {
            const el = $(sel);
            if (el && claim(el, 'azEmi')) el.classList.add('az-emi');
        }
        for (const el of $$('#promotions_feature_div .a-list-item, #apex_desktop .a-row, .offers-items li')) {
            if (!claim(el, 'azEmi')) continue;
            const text = (el.textContent || '').trim();
            if (text.length < 200 && /\bemi\b/i.test(text)) el.classList.add('az-emi');
        }
    }

    function showBankOffers() {
        if (!enabled('showBankOffers')) return;
        const host = $('#promotions_feature_div, #applicable_promotion_list_sec, #itembox-InstantBankDiscount');
        if (!host || !claim(host, 'azBank')) return;
        const offers = $$('.offers-items-content, .a-list-item, .a-truncate-full, .a-section', host)
            .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(t => t.length > 20 && t.length < 300 && /bank offer|cashback|instant discount|% off on/i.test(t));
        const unique = [...new Set(offers)];
        if (!unique.length) return;
        const cards = settings.myCards.split(',').map(c => c.trim()).filter(Boolean);
        const mine = cards.length ? unique.filter(o => cards.some(c => o.toLowerCase().includes(c.toLowerCase()))) : [];
        const box = document.createElement('div');
        box.dataset.azFeature = 'bank';
        if (cards.length && mine.length) {
            for (const offer of mine) box.appendChild(makeChip(`Your card: ${offer}`, 'good', '', 'bank'));
        } else if (cards.length) {
            box.appendChild(makeChip(`No bank offer for your cards`, 'warn', `(${unique.length} offer${unique.length === 1 ? '' : 's'} for other cards)`, 'bank'));
        } else {
            for (const offer of unique.slice(0, 3)) box.appendChild(makeChip(offer, 'good', '', 'bank'));
        }
        const target = $('#corePrice_feature_div') || $('#apex_desktop') || host;
        target.insertAdjacentElement('afterend', box);
    }

    function currentAsin() {
        const fromUrl = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        if (fromUrl) return fromUrl[1].toUpperCase();
        const el = $('#ASIN, input[name="ASIN"]');
        return el ? el.value : null;
    }

    // Both of our buy-box buttons live in one flex row so they sit side by side.
    function actionsRow() {
        const existing = $('#az-actions');
        if (existing && existing.isConnected) return existing;
        const target = $('#corePrice_feature_div') || $('#apex_desktop');
        if (!target) return null;
        const row = document.createElement('div');
        row.id = 'az-actions';
        row.dataset.azFeature = 'actions';
        target.insertAdjacentElement('afterend', row);
        return row;
    }

    function addPriceHistoryButton() {
        if (!settings.priceHistoryButton) return;
        if ($('#az-pricehistory')) return;
        const asin = currentAsin();
        if (!asin) return;
        const row = actionsRow();
        if (!row) return;

        // Both trackers sit side by side in their own sub-row, each in its own
        // brand colour so they read as two destinations, not one stacked pair.
        const pair = document.createElement('div');
        pair.id = 'az-history-row';
        pair.dataset.azFeature = 'actions';

        const btn = document.createElement('button');
        btn.id = 'az-pricehistory';
        btn.type = 'button';
        btn.textContent = 'Keepa';
        btn.title = 'Open this product on Keepa';
        btn.addEventListener('click', () => window.open(PRICE_HISTORY_URL(asin), '_blank', 'noopener'));
        pair.appendChild(btn);

        // PriceHistory (.in) has no ASIN deep link — its slugs are title-derived
        // with a random suffix and its only resolver is a private API. So we
        // copy the clean product URL and open the site for a paste instead of
        // asking for host permissions we do not need.
        if (IS_IN) {
            const alt = document.createElement('button');
            alt.id = 'az-pricehistory-alt';
            alt.type = 'button';
            alt.title = 'Copies this product link, then opens PriceHistory — just paste in their search box';
            alt.textContent = 'Price History';
            alt.addEventListener('click', async () => {
                const clean = `${location.origin}/dp/${asin}`;
                try {
                    await navigator.clipboard.writeText(clean);
                    alt.textContent = 'Copied — paste it';
                    setTimeout(() => { alt.textContent = 'Price History'; }, 2500);
                } catch { /* clipboard blocked — the site still opens */ }
                window.open('https://pricehistoryapp.com/', '_blank', 'noopener');
            });
            pair.appendChild(alt);
        }

        row.appendChild(pair);
    }

    // Jumps to the reviews section by reusing Amazon's own review-count link,
    // so we inherit whatever anchor/lazy-load behaviour it has. Falls back to
    // scrolling the reviews container into view if that link is missing.
    const REVIEW_TARGETS = '#customerReviews, #reviewsMedley, #cm-cr-dp-review-list, #averageCustomerReviews_feature_div';

    // Both numbers are read live from Amazon's own markup every time — nothing
    // about the rating or the review count is ever hardcoded.
    function reviewStats() {
        const countRaw = $('#acrCustomerReviewText')?.textContent || '';
        const count = (countRaw.match(/[\d,]+/) || [''])[0];
        const ratingSrc = $('#acrPopover')?.getAttribute('title')
            || $('#acrPopover .a-icon-alt, #averageCustomerReviews .a-icon-alt, #averageCustomerReviews_feature_div .a-icon-alt')?.textContent
            || '';
        const m = ratingSrc.match(/([\d.]+)\s*out of\s*5/i);
        return { rating: m ? m[1] : '', count };
    }

    // Line 2 of the button: "4.1 ★★★★☆". Five glyphs, filled to the rounded
    // half-star, so the score is readable at a glance.
    function fillRatingRow(row, rating) {
        row.textContent = '';
        const value = document.createElement('span');
        value.className = 'az-rating-value';
        value.textContent = rating;
        row.appendChild(value);

        const stars = document.createElement('span');
        stars.className = 'az-rating-stars';
        const score = parseFloat(rating) || 0;
        for (let i = 1; i <= 5; i++) {
            const filled = score >= i - 0.5;
            const s = icon('star', filled ? 'az-star az-star-on' : 'az-star az-star-off', true);
            stars.appendChild(s);
        }
        row.appendChild(stars);
        row.dataset.text = rating;
    }

    function fillCountRow(row, count) {
        row.textContent = '';
        const n = document.createElement('span');
        n.className = 'az-count-value';
        n.textContent = count;
        row.append(n, document.createTextNode(' global reviews'));
        row.dataset.text = count;
    }

    function paintReviewStats(btn) {
        const { rating, count } = reviewStats();
        const ratingRow = btn.querySelector('.az-btn-rating');
        const countRow = btn.querySelector('.az-btn-count');
        if (ratingRow && rating && ratingRow.dataset.text !== rating) fillRatingRow(ratingRow, rating);
        if (countRow && count && countRow.dataset.text !== count) fillCountRow(countRow, count);
    }

    function addReviewsButton() {
        if (!settings.reviewsButton) return;

        // Ratings often stream in after first paint — keep the rows fresh.
        const existing = $('#az-reviews');
        if (existing) { paintReviewStats(existing); return; }

        const nativeLink = $('#acrCustomerReviewLink');
        if (!nativeLink && !$(REVIEW_TARGETS)) return;
        const row = actionsRow();
        if (!row) return;

        const btn = document.createElement('button');
        btn.id = 'az-reviews';
        btn.type = 'button';

        const main = document.createElement('span');
        main.className = 'az-btn-main';
        main.textContent = 'Check Review Section';

        const ratingRow = document.createElement('span');
        ratingRow.className = 'az-btn-rating';

        const countRow = document.createElement('span');
        countRow.className = 'az-btn-count';

        btn.append(main, ratingRow, countRow);
        paintReviewStats(btn);

        btn.addEventListener('click', () => {
            const link = $('#acrCustomerReviewLink');
            if (link) { link.click(); return; }
            $(REVIEW_TARGETS)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        row.appendChild(btn);
    }

    // ---------- Product-video & brand rails ----------

    // Amazon randomises the heading ids on these blocks, so match on the widget
    // container where there is a stable id and fall back to heading text.
    function hideByHeading(text, tag, cls) {
        for (const h of $$('h2, h3')) {
            if (!claim(h, tag)) continue;
            if (!text.test((h.textContent || '').trim())) continue;
            const block = h.closest('.a-cardui, [data-cel-widget], .a-carousel-container, .a-section');
            if (!block || block === document.body) continue;
            block.classList.add(cls);
        }
    }

    const VIDEO_HEADING = /^(videos? for this product|product videos?|videos)$/i;
    function hideProductVideos() {
        if (!settings.hideProductVideos) return;
        for (const el of $$('.VideosForThisProduct, .vse-vwdp-video-block-wrapper, #vse-related-videos-btf_feature_div, #va-related-videos-widget_feature_div')) {
            const block = el.closest('.a-cardui') || el;
            if (claim(block, 'azVideo')) block.classList.add('az-video');
        }
        hideByHeading(VIDEO_HEADING, 'azVideoHead', 'az-video');
    }

    const BRAND_HEADING = /brands? in this category/i;
    function hideBrandCarousel() {
        if (!settings.hideBrandCarousel) return;
        for (const el of $$('[id^="sims-discoveryAndInspiration_feature_div"], #brandsSpotlight_feature_div')) {
            if (claim(el, 'azBrands')) el.classList.add('az-brands');
        }
        hideByHeading(BRAND_HEADING, 'azBrandsHead', 'az-brands');
    }

    // The "Feedback" block Amazon tucks inside the product-information tables.
    // Scoped to those containers so we never hit a genuine Feedback heading
    // somewhere else on the page.
    const DETAIL_SCOPES = '#productDetails_expanderSectionTables, #prodDetails, #productDetails_feature_div';
    function hideFeedbackBlock() {
        if (!settings.hideFeedbackBlock) return;
        for (const scope of $$(DETAIL_SCOPES)) {
            for (const h of $$('h2, h3', scope)) {
                if (!claim(h, 'azFeedback')) continue;
                if (!/^feedback$/i.test((h.textContent || '').trim())) continue;
                const block = h.closest('.a-section');
                if (block && block !== scope && !block.contains(scope)) block.classList.add('az-feedback');
            }
        }
    }

    // ---------- Hidden / additional costs ----------

    // Only buy-box containers that actually state charges — deliberately narrow,
    // because a false "+fees" warning is worse than a missed one.
    // v3.5.0: Amazon suffixes these ids per slot (e.g.
    // mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE), so exact
    // id matches missed the delivery charge entirely. Prefix-match instead.
    const FEE_SCOPES = [
        '[id^="mir-layout-DELIVERY_BLOCK"]', '[id*="DELIVERY_MESSAGE"]',
        '#deliveryBlockMessage', '#deliveryPriceBadging_feature_div',
        '#priceblock_shippingmessage', '#price-shipping-message', '#shippingMessageInsideBuyBox_feature_div',
        '#exports_desktop_qualifiedBuybox_shippingFeeMessage', '#installActionBox', '#installation_feature_div',
        '#dynamicDeliveryMessage_feature_div', '#fulfillerInfoFeature_feature_div',
    ].join(', ');

    const FEE_WORD = '(delivery|shipping|handling|service|installation|assembly|convenience|packaging|import|customs)';
    const MONEY = '[₹$]\\s*([\\d,]+(?:\\.\\d{1,2})?)';

    // "FREE delivery ₹0" and friends must never be read as a charge.
    const NEGATED = /\b(free|no|zero)\s*$/i;
    function negated(text, index) {
        return NEGATED.test(text.slice(Math.max(0, index - 14), index));
    }

    function scanFees(text) {
        const hits = [];
        let m;
        // "Delivery charge ₹40", "Installation fee: ₹499"
        const labelFirst = new RegExp(`${FEE_WORD}\\s*(?:charges?|fees?|costs?)?\\s*(?:of|:|-|–)?\\s*${MONEY}`, 'gi');
        while ((m = labelFirst.exec(text))) {
            if (negated(text, m.index)) continue;
            hits.push({ label: m[1].toLowerCase(), amount: parseFloat(m[2].replace(/,/g, '')) });
        }
        // "₹40 delivery charge", "+ ₹99 shipping"
        const moneyFirst = new RegExp(`${MONEY}\\s*(?:extra\\s*)?(?:for\\s+)?${FEE_WORD}\\s*(?:charges?|fees?)?`, 'gi');
        while ((m = moneyFirst.exec(text))) {
            if (negated(text, m.index)) continue;
            hits.push({ label: m[2].toLowerCase(), amount: parseFloat(m[1].replace(/,/g, '')) });
        }
        return hits.filter(h => isFinite(h.amount) && h.amount > 0 && h.amount < 1000000);
    }

    // Fees read better as whole currency — "+₹40 delivery fee", not "+₹40.00".
    function formatFee(value) {
        const symbol = IS_IN ? '₹' : '$';
        const locale = IS_IN ? 'en-IN' : 'en-US';
        return symbol + (Number.isInteger(value)
            ? value.toLocaleString(locale)
            : value.toFixed(2));
    }

    function collectFees() {
        const byLabel = new Map();
        const record = (label, amount) => {
            if (!isFinite(amount) || amount <= 0) return;
            if (!byLabel.has(label) || byLabel.get(label) < amount) byLabel.set(label, amount);
        };

        // Most reliable source: Amazon states the delivery charge in an
        // attribute (data-csa-c-delivery-price="₹59") rather than only in prose.
        for (const el of $$('[data-csa-c-delivery-price]')) {
            const raw = el.getAttribute('data-csa-c-delivery-price') || '';
            if (/free/i.test(raw)) continue;
            const m = raw.match(/([\d,]+(?:\.\d{1,2})?)/);
            if (m) record('delivery', parseFloat(m[1].replace(/,/g, '')));
        }

        for (const el of $$(FEE_SCOPES)) {
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || text.length > 500) continue;
            for (const hit of scanFees(text)) record(hit.label, hit.amount);
        }
        return byLabel;
    }

    // The chip is shown twice: inline beside the price, and under the price
    // block — whichever of the two exists on a given layout.
    const FEE_ANCHORS = [
        { sel: '.apex-core-price-identifier', cls: 'az-fee-inline' },
        { sel: '#corePriceDisplay_desktop_feature_div', cls: 'az-fee-block' },
    ];

    function showHiddenFees() {
        if (!settings.showHiddenFees) return;

        const fees = collectFees();
        if (!fees.size) { for (const el of $$('.az-chip-fee')) el.remove(); return; }

        const total = [...fees.values()].reduce((a, b) => a + b, 0);
        const labels = [...fees.keys()];
        const text = labels.length === 1
            ? `+${formatFee(total)} ${labels[0]} fee`
            : `+${formatFee(total)} in fees (${labels.join(', ')})`;

        for (const { sel, cls } of FEE_ANCHORS) {
            const anchor = $(sel);
            if (!anchor) continue;
            let chip = anchor.querySelector(':scope > .az-chip-fee');
            if (chip) {
                if (chip.dataset.text !== text) { chip.textContent = text; chip.dataset.text = text; }
                continue;
            }
            chip = makeChip(text, 'fee', '', 'fees');
            chip.classList.add(cls);
            chip.dataset.text = text;
            chip.title = 'Charges Amazon adds on top of the listed price';
            anchor.appendChild(chip);
        }
    }

    // ---------- Cart: make the delivery / extra charges impossible to miss ----------

    // The cart states its charges in body text — "₹64.96 delivery Thu, 13 Aug" —
    // at the same size and weight as the delivery date beside it, which is how a
    // charge reads as a date. Amount-then-keyword, so "FREE delivery" never
    // matches and never gets flagged.
    // The amount must be non-zero: "₹0 delivery" is free delivery spelled oddly,
    // not a charge. \b in front of "rs" stops it matching inside another word.
    const CART_FEE_RE = /(?:₹|\brs\.?|\$)\s*(?!0(?:[.,]0+)?\s)[\d,]+(?:\.\d{1,2})?\s*(?:delivery|shipping|handling|packaging|packing|service|installation|fee|charge)/i;

    const FEE_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION']);

    function cartFeeScopes() {
        const named = ['#sc-active-cart', '#activeCartViewForm', '#sc-active-items']
            .map(sel => $(sel))
            .filter(Boolean);
        // Amazon renames these containers periodically; the item rows themselves
        // are a stabler last resort than giving up.
        return named.length ? named : $$(CART_ITEM_SELECTOR);
    }

    let cartFeesFlagged = false;

    function clearCartFees() {
        // Guarded because this runs on every throttled tick, including on every
        // page that is not the cart, and the query is document-wide.
        if (!cartFeesFlagged) return;
        for (const el of $$('.az-cart-fee')) el.classList.remove('az-cart-fee');
        cartFeesFlagged = false;
    }

    function highlightCartFees() {
        if (!settings.showHiddenFees || !onCartPage()) { clearCartFees(); return; }

        const scopes = cartFeeScopes();
        if (!scopes.length) { clearCartFees(); return; }

        // Drop the flag from anything that is no longer a charge — a quantity
        // change can turn a paid delivery into a free one.
        if (cartFeesFlagged) {
            for (const el of $$('.az-cart-fee')) {
                if (!CART_FEE_RE.test(el.textContent || '')) el.classList.remove('az-cart-fee');
            }
        }

        for (const scope of scopes) {
            const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.nodeValue;
                // Long strings mean we have walked into a paragraph rather than a
                // charge line; highlighting that would swallow half the row.
                if (!text || text.length > 120 || !CART_FEE_RE.test(text)) continue;

                const host = node.parentElement;
                if (!host || FEE_SKIP_TAGS.has(host.tagName)) continue;
                // A box inside a box: if an ancestor is already flagged, its
                // border and colours already cover this text.
                if (host.closest('.az-cart-fee')) continue;
                // The walker happily visits text Amazon has hidden — alternate
                // delivery options, state blobs. Styling those would reveal them.
                if (!host.getClientRects().length) continue;

                // Deliberately no data-az-feature here: this is Amazon's own
                // element, and the feature-node sweep deletes what it matches.
                host.classList.add('az-cart-fee');
                cartFeesFlagged = true;
            }
        }
    }

    // ---------- Coupons ----------

    // Amazon renders the coupon as a small, easily-missed checkbox. Outline it
    // in green, and optionally tick it — but only once per element and only in
    // the first few seconds, so a deliberate un-tick is never overridden.
    const COUPON_GRACE_MS = 12000;
    const COUPON_TEXT = /\bcoupons?\b|collect coupon|apply .*%|clip .*coupon/i;

    // v3.6.0: the old checkbox-only scan found nothing, because Amazon now
    // renders most coupons as a "Collect Coupon" link rather than a checkbox.
    // Both variants — and the cart version — carry the same marker attribute,
    // so key off that and treat the checkbox as just one possible control.
    const COUPON_ROOTS = [
        '[data-csa-c-owner="PromotionsDiscovery"]',
        '#promoPriceBlockMessage_feature_div', '#promoPriceBlockMessage',
        '#couponFeature_feature_div', '#applicablePromotionList_feature_div', '#vpcButton',
    ].join(', ');

    const COUPON_ACTION = /collect coupon|clip coupon|apply coupon|apply\s*[₹$]?[\d.,]+\s*(?:%|off)?\s*coupon/i;

    function couponBlocks() {
        const found = [];
        const seen = new Set();
        for (const root of $$(COUPON_ROOTS)) {
            const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || text.length > 300 || !COUPON_TEXT.test(text)) continue;
            // Prefer the tidy box Amazon already draws (cart), else the node itself.
            const box = root.closest('.a-box-inner') || root;
            if (seen.has(box)) continue;
            seen.add(box);
            found.push(box);
        }
        // The wrapper and the inner promotion span both match, which would draw
        // a green box inside a green box. Keep only the innermost of each nest.
        return found.filter(box => !found.some(other => other !== box && box.contains(other)));
    }

    function couponControl(box) {
        const checkbox = box.querySelector('input[type=checkbox]');
        if (checkbox && !checkbox.disabled) return checkbox;
        for (const el of $$('a, button, [role="button"], .a-button-input, .a-declarative', box)) {
            const label = (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            if (label.length < 60 && COUPON_ACTION.test(label)) return el;
        }
        return null;
    }

    function highlightCoupon() {
        if (!settings.highlightCoupon) return;
        for (const box of couponBlocks()) {
            if (claim(box, 'azCoupon')) box.classList.add('az-coupon');
            if (!settings.autoApplyCoupon) continue;
            if (Date.now() - PAGE_LOAD_AT > COUPON_GRACE_MS) continue;

            const control = couponControl(box);
            if (!control) continue;
            // A ticked checkbox (or an already-collected coupon) is left alone.
            if (control.type === 'checkbox' && control.checked) continue;
            if (/collected|applied/i.test(box.textContent || '')) continue;
            if (!claim(control, 'azCouponClick')) continue;
            control.click();
            box.classList.add('az-coupon-auto');
        }
    }

    // When the cart rail is hidden, Amazon's reserved gutter shows through as a
    // white strip beside the dark nav bar. Paint over just that strip so the top
    // bar reads as continuous instead of truncated.
    function navGutterPatch(show) {
        const patch = $('#az-nav-patch');
        const belt = $('#nav-belt');
        if (!show || !belt) { patch?.remove(); return; }

        let width = 0;
        for (const el of [$('#a-page'), document.body, belt]) {
            if (!el) continue;
            const pad = parseFloat(getComputedStyle(el).paddingRight) || 0;
            if (pad > width) width = pad;
        }
        if (!width) { patch?.remove(); return; }

        // The patch is absolutely positioned against the document, so it has to
        // track wherever the belt actually sits. The cashback banner is prepended
        // to <body> and pushes the belt down, so a hardcoded top: 0 drifts out of
        // alignment the moment the banner appears or is dismissed. v3.7.0: measure.
        const beltTop = belt.getBoundingClientRect().top + window.scrollY;

        const el = patch || document.createElement('div');
        if (!patch) {
            el.id = 'az-nav-patch';
            el.dataset.azFeature = 'ewc';
            document.body.appendChild(el);
        }
        el.style.setProperty('top', `${Math.max(0, Math.round(beltTop))}px`, 'important');
        el.style.setProperty('width', `${width}px`, 'important');
        el.style.setProperty('height', `${belt.offsetHeight}px`, 'important');
        el.style.setProperty('background', getComputedStyle(belt).backgroundColor || '#131921', 'important');
    }

    function biggerPrice() {
        const root = document.documentElement;
        if (settings.biggerPrice) root.setAttribute('data-az-price', 'big');
        else root.removeAttribute('data-az-price');
    }

    function hideSearchAds() {
        const root = document.documentElement;
        if (settings.hideSponsored) root.setAttribute('data-az-ads', 'hide');
        else root.removeAttribute('data-az-ads');
    }

    // ---------- Detail-page reordering ----------

    // Each entry is a list of candidate selectors; the first one present wins.
    // Order here is the required final top-to-bottom order.
    const REORDER_GROUPS = [
        ['#postPurchaseWhatsInTheBox_MP_feature_div', '#whatsInTheBoxDeck'],
        ['#prodDetails', '#productDetails_feature_div', '#detailBullets_feature_div'],
        ['#brandSnapshot_feature_div'],
    ];

    // First related-products rail in document order — the moved group goes
    // immediately above it.
    const SIMS_SELECTOR = '[id^="sims-simsContainer_feature_div"], [id^="DetailPage_sims-container"], #sims-consolidated-2_feature_div, #sims-consolidated-3_feature_div, #similarities_feature_div';

    // Remember where each node started so "Off" can put the page back exactly.
    const originalSpots = new Map();

    function firstInDocument(selector) {
        // querySelectorAll already returns document order; take the first that
        // is actually rendered.
        for (const el of $$(selector)) {
            if (el.offsetParent !== null || el.getClientRects().length) return el;
        }
        return $(selector);
    }

    function reorderDetails() {
        if (!settings.reorderDetails) return;
        const anchor = firstInDocument(SIMS_SELECTOR);
        if (!anchor || !anchor.parentElement) return;

        const nodes = [];
        for (const group of REORDER_GROUPS) {
            const el = group.map(sel => $(sel)).find(Boolean);
            if (el && !el.contains(anchor) && el !== anchor) nodes.push(el);
        }
        if (!nodes.length) return;

        // Bail out if they are already sitting directly above the anchor in the
        // right order — otherwise the MutationObserver would loop forever.
        let cursor = anchor;
        let inPlace = true;
        for (let i = nodes.length - 1; i >= 0; i--) {
            if (cursor.previousElementSibling !== nodes[i]) { inPlace = false; break; }
            cursor = nodes[i];
        }
        if (inPlace) return;

        // Snapshot every original position BEFORE moving anything — moving the
        // first node changes the siblings the later nodes would record, which
        // would make the "Off" restore put the page back in the wrong order.
        for (const el of nodes) {
            if (!originalSpots.has(el)) {
                originalSpots.set(el, {
                    parent: el.parentElement,
                    prev: el.previousElementSibling,
                    next: el.nextElementSibling,
                });
            }
        }
        for (const el of nodes) anchor.parentElement.insertBefore(el, anchor);
    }

    function restoreOrder() {
        for (const [el, spot] of originalSpots) {
            if (!spot.parent || !spot.parent.isConnected) continue;
            let before = null;
            if (spot.next && spot.next.parentElement === spot.parent) before = spot.next;
            else if (spot.prev && spot.prev.parentElement === spot.parent) before = spot.prev.nextSibling;
            try { spot.parent.insertBefore(el, before); } catch { /* ignore */ }
        }
        originalSpots.clear();
    }

    // Did we arrive here by actually clicking through from somewhere outside
    // Amazon? A restored tab or a reload still carries ?tag= in the URL, and
    // treating that as a fresh click-through would hand out a brand-new 24h
    // window for a session that never happened — defeating the restart check.
    function isFreshClickThrough() {
        let navType = '';
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            navType = (nav && nav.type) || '';
        } catch { /* no Navigation Timing */ }
        // 'reload' covers session restore; 'back_forward' covers history.
        if (navType && navType !== 'navigate') return false;

        const ref = document.referrer;
        if (ref) {
            try { return !/(^|\.)amazon\./i.test(new URL(ref).hostname); } catch { return false; }
        }
        // Affiliate redirectors routinely strip the referrer (Referrer-Policy:
        // no-referrer), so an empty one is not evidence against a click-through.
        // Only trust that when the navigation type positively said 'navigate' —
        // reloads and restored tabs are already excluded above. Calling a live
        // session unverified is a worse error than a bookmarked ?tag= URL
        // re-arming the window, but we still will not guess without the type.
        return navType === 'navigate';
    }

    function recordAffiliateTag() {
        const tag = new URLSearchParams(location.search).get('tag');
        if (!tag) return;
        if (session.affTag !== tag || isFreshClickThrough()) {
            saveSession('affTag', tag);
            saveSession('affAt', Date.now());
            saveSession('affRun', RUN_ID);
            // A fresh session is worth seeing, so un-dismiss the banner.
            saveSession('cashbackHidden', false);
            bannerDismissed = false;
        }
    }

    const affiliateAge = () => Date.now() - (session.affAt || 0);
    const withinWindow = () => Boolean(session.affTag) && affiliateAge() < AFFILIATE_WINDOW_MS;

    // The 24h clock is necessary but not sufficient: closing the browser ends the
    // run, and we can no longer vouch for the click-through. We do not claim it is
    // definitely dead either — affiliate cookies can outlive a restart — so this
    // is a third, honest state rather than a silent "still live".
    const affiliateStale = () => withinWindow() && Boolean(RUN_ID) && Boolean(session.affRun) && session.affRun !== RUN_ID;
    const affiliateLive = () => withinWindow() && !affiliateStale();

    // ---------- Which cart items are actually tracked ----------

    // Amazon never tells us when an item entered the cart, so we record it
    // ourselves: if you hit Add to Cart while an affiliate session is live, that
    // ASIN is marked as tracked. Anything in the cart without a mark predates
    // the session and will not earn cashback.
    function markAddToCart() {
        if (!enabled('cashkaroWatch')) return;
        const buttons = $$('#add-to-cart-button, input[name="submit.add-to-cart"], #buy-now-button, #add-to-cart-button-ubb');
        for (const btn of buttons) {
            if (!claim(btn, 'azAtc')) continue;
            btn.addEventListener('click', () => {
                if (!affiliateLive()) return;
                const asin = currentAsin();
                if (!asin) return;
                const tracked = { ...(session.trackedAsins || {}) };
                tracked[asin] = { at: Date.now(), run: RUN_ID };
                saveSession('trackedAsins', tracked);
            }, { passive: true });
        }
    }

    // Marks were plain timestamps before v3.7.0; normalise both shapes.
    function readMark(value) {
        if (typeof value === 'number') return { at: value, run: null };
        if (value && typeof value === 'object') return { at: value.at || 0, run: value.run || null };
        return null;
    }

    // Drop marks older than the affiliate window so stale ones never mislead.
    function freshTracked() {
        const tracked = session.trackedAsins || {};
        const out = {};
        for (const [asin, raw] of Object.entries(tracked)) {
            const mark = readMark(raw);
            if (mark && Date.now() - mark.at < AFFILIATE_WINDOW_MS) out[asin] = mark;
        }
        return out;
    }

    // A mark made in an earlier browser run is not a lie, but it is not a promise
    // either — surface it separately instead of counting it as tracked.
    const markStale = mark => Boolean(RUN_ID) && Boolean(mark.run) && mark.run !== RUN_ID;

    const CART_ITEM_SELECTOR = '[data-asin][data-itemtype], .sc-list-item[data-asin], div[data-asin].sc-list-item-content, [data-asin].a-row.sc-list-item';

    function cartItems() {
        const items = [];
        const seen = new Set();
        for (const el of $$(CART_ITEM_SELECTOR)) {
            const asin = el.getAttribute('data-asin');
            if (!asin || seen.has(asin)) continue;
            seen.add(asin);
            const titleEl = el.querySelector('.sc-product-title, .a-truncate-full, .sc-grid-item-product-title, h4, .a-list-item');
            const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) || asin;
            items.push({ asin, title });
        }
        return items;
    }

    const onCartPage = () => /\/(cart|gp\/cart)/.test(location.pathname);

    function cashbackBanner() {
        // bannerForced comes from the pill: an explicit click should always
        // produce a banner, even in the "nothing to report" state the passive
        // render skips — otherwise the pill looks broken when it says
        // "No cashback". It survives re-renders until the ✕ clears it.
        const force = bannerForced;
        const onCart = onCartPage();
        // Off-cart the dismissal sticks until a new session starts; on the cart it
        // only lasts for this page view, so re-opening the cart shows it again.
        if (!enabled('cashkaroWatch') || bannerDismissed || (!onCart && session.cashbackHidden)) {
            $('#az-cashback')?.remove();
            return;
        }

        const tag = session.affTag;
        const live = affiliateLive();
        const stale = affiliateStale();
        if (!onCart && !live && !stale && !force) { $('#az-cashback')?.remove(); return; }

        const items = onCart ? cartItems() : [];
        const tracked = freshTracked();
        const hit = [], unsure = [], miss = [];
        for (const item of items) {
            const mark = tracked[item.asin];
            if (!mark) miss.push(item);
            else if (markStale(mark)) unsure.push(item);
            else hit.push(item);
        }

        // green = every item tracked, yellow = some, red = none.
        let tone = live ? 'az-live' : (stale ? 'az-unsure' : 'az-stale');
        if (onCart && items.length) {
            if (!miss.length && !unsure.length) tone = 'az-all';
            else if (hit.length || unsure.length) tone = 'az-some';
            else tone = 'az-none';
        }

        const hoursLeft = Math.max(0, Math.floor((AFFILIATE_WINDOW_MS - affiliateAge()) / 3600000));
        const restarted = 'the browser was closed since, so tracking may have lapsed';
        let headline;
        if (onCart && items.length) {
            const parts = [];
            if (hit.length) parts.push(`${hit.length} tracked`);
            if (unsure.length) parts.push(`${unsure.length} unverified`);
            if (miss.length) parts.push(`${miss.length} not tracked`);
            headline = `Cart: ${parts.join(' · ')}`;
            if (!miss.length && !unsure.length) headline = `All ${items.length} cart item${items.length === 1 ? '' : 's'} tracked for cashback.`;
            else if (!hit.length && !unsure.length) headline = `None of your ${items.length} cart items are tracked for cashback.`;
            else headline += ` (of ${items.length}).`;
        } else if (live) {
            headline = `Cashback session live (${tag}) — about ${hoursLeft}h left. Only items added from now on will track.`;
        } else if (stale) {
            headline = `Cashback session started earlier today (${tag}), but ${restarted}. Re-open Amazon via CashKaro to be sure.`;
        } else {
            headline = tag ? 'No live cashback session (expired).' : 'No cashback session active.';
        }
        if (onCart && items.length && stale) headline += ` Note: ${restarted}.`;

        // Counts alone are not enough to dedup on: swapping one untracked item
        // for another leaves them identical while the dropdown contents change,
        // and `live` flips the CTA without touching the tone on a cart page.
        const state = [
            tone, headline, live, stale,
            miss.map(i => i.asin).join(','),
            unsure.map(i => i.asin).join(','),
            hit.map(i => i.asin).join(','),
        ].join('|');

        const existing = $('#az-cashback');
        if (existing && existing.dataset.state === state) return;
        existing?.remove();

        const bar = document.createElement('div');
        bar.id = 'az-cashback';
        bar.className = tone;
        bar.dataset.state = state;

        const msg = document.createElement('span');
        msg.className = 'az-cb-msg';
        msg.textContent = headline;
        bar.appendChild(msg);

        const actions = document.createElement('span');
        actions.className = 'az-cb-actions';

        // Item breakdown lives in a dropdown so the bar stays one line tall.
        if (onCart && items.length) {
            const details = document.createElement('details');
            details.className = 'az-cb-details';
            const summary = document.createElement('summary');
            // Both sides of the split are worth seeing, not just the failures.
            const counts = [];
            if (miss.length) counts.push(`${miss.length} untracked`);
            if (unsure.length) counts.push(`${unsure.length} unverified`);
            if (hit.length) counts.push(`${hit.length} tracked`);
            summary.textContent = counts.length ? `Show ${counts.join(' · ')}` : 'Show items';
            details.appendChild(summary);

            const list = document.createElement('div');
            list.className = 'az-cb-list';
            for (const [group, label, cls] of [
                [miss, 'Not tracked', 'az-cb-miss'],
                [unsure, 'Unverified — added before a browser restart', 'az-cb-unsure'],
                [hit, 'Tracked', 'az-cb-hit'],
            ]) {
                if (!group.length) continue;
                const head = document.createElement('div');
                head.className = 'az-cb-group';
                head.textContent = `${label} (${group.length})`;
                list.appendChild(head);
                for (const item of group) {
                    const row = document.createElement('div');
                    row.className = `az-cb-item ${cls}`;
                    row.textContent = item.title; // scraped — textContent only
                    list.appendChild(row);
                }
            }
            details.appendChild(list);
            actions.appendChild(details);
        }

        if (!live) {
            const go = document.createElement('button');
            go.type = 'button';
            go.className = 'az-cb-go';
            go.textContent = 'Copy URL & Open CashKaro';
            go.addEventListener('click', async () => {
                try { await navigator.clipboard.writeText(location.href); } catch { /* ignore */ }
                window.open('https://cashkaro.com/stores/amazon', '_blank', 'noopener');
            });
            actions.appendChild(go);
        }

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'az-cb-close';
        close.setAttribute('aria-label', 'Hide the cashback banner');
        close.title = 'Hide — click the cashback pill (bottom right) to bring it back';
        close.textContent = '✕';
        close.addEventListener('click', () => {
            bannerDismissed = true;
            bannerForced = false;
            // Only the off-cart informational banner stays dismissed across pages.
            if (!onCart) saveSession('cashbackHidden', true);
            bar.remove();
            affiliateStatusPill();
        });
        actions.appendChild(close);

        bar.appendChild(actions);
        document.body.prepend(bar);
    }

    // Small pill beside the settings button so the affiliate state is readable
    // at a glance without opening anything.
    function affiliateStatusPill() {
        const fab = $('#az-fab');
        if (!fab) return;
        if (!enabled('cashkaroWatch')) { $('#az-aff-pill')?.remove(); return; }

        const live = affiliateLive();
        const stale = affiliateStale();
        const hoursLeft = Math.max(0, Math.floor((AFFILIATE_WINDOW_MS - affiliateAge()) / 3600000));
        const text = live ? `Cashback on · ${hoursLeft}h` : (stale ? 'Cashback unverified' : 'No cashback');
        const cls = live ? 'az-pill-on' : (stale ? 'az-pill-unsure' : 'az-pill-off');

        let pill = $('#az-aff-pill');
        if (!pill) {
            // A button, not a div: it is the only way back once the banner is
            // dismissed, so it has to be clickable and reachable by keyboard.
            pill = document.createElement('button');
            pill.type = 'button';
            pill.id = 'az-aff-pill';
            pill.dataset.azFeature = 'affpill';
            pill.addEventListener('click', () => {
                bannerDismissed = false;
                bannerForced = true;
                saveSession('cashbackHidden', false);
                cashbackBanner();
            });
            document.body.appendChild(pill);
        }
        const hidden = bannerDismissed || (!onCartPage() && session.cashbackHidden);
        pill.title = hidden ? 'Show the cashback banner' : 'Cashback session status';
        if (pill.dataset.text !== text) { pill.textContent = text; pill.dataset.text = text; }
        pill.className = cls;
    }

    function ewcCollapse() {
        const root = document.documentElement;
        const ewc = $('#nav-flyout-ewc');
        if (!settings.ewcCollapse || !ewc) {
            root.removeAttribute('data-az-ewc');
            $('#az-ewc-toggle')?.remove();
            navGutterPatch(false);
            return;
        }
        if (!root.hasAttribute('data-az-ewc')) {
            root.setAttribute('data-az-ewc', session.ewcOpen ? 'open' : 'closed');
        }
        let btn = $('#az-ewc-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'az-ewc-toggle';
            btn.type = 'button';
            btn.addEventListener('click', () => {
                const open = root.getAttribute('data-az-ewc') !== 'open';
                root.setAttribute('data-az-ewc', open ? 'open' : 'closed');
                saveSession('ewcOpen', open);
                ewcCollapse();
            });
            document.body.appendChild(btn);
        }
        const open = root.getAttribute('data-az-ewc') === 'open';
        navGutterPatch(!open);
        const count = ($('#nav-cart-count')?.textContent || '').trim();
        btn.textContent = '';
        if (open) btn.append('✕ ');
        btn.append('🛒');
        if (count && count !== '0') {
            const c = document.createElement('span');
            c.textContent = count;
            btn.append(' ', c);
        }
        btn.setAttribute('aria-expanded', String(open));
        btn.style.setProperty('right', open ? `${ewc.offsetWidth}px` : '0px', 'important');
    }

    // Scrape the signed-in customer's first name from Amazon's own nav.
    function customerName() {
        const greeting = $('#nav-link-accountList-nav-line-1, #nav-link-accountList .nav-line-1');
        const text = (greeting?.textContent || '').trim();
        const m = text.match(/^hello,\s*(.+)$/i);
        if (m && !/sign in/i.test(m[1])) return m[1].trim();
        return null;
    }

    const WL_PALETTE = ['#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

    // Static, developer-authored SVG only — never interpolate scraped text here.
    const ICON_PATHS = {
        lock:   '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
        unlock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.6-1.6"/>',
        heart:  '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
        star:   '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    };

    function icon(name, cls, filled) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('fill', filled ? 'currentColor' : 'none');
        svg.setAttribute('stroke', filled ? 'none' : 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        if (cls) svg.setAttribute('class', cls);
        svg.innerHTML = ICON_PATHS[name] || '';
        return svg;
    }

    // Amazon spells the privacy and default-list state out in the link text
    // ("Arathi's Wishlist Default List Private"). Strip that wording and show
    // it as a lock / unlock / heart icon instead.
    const PRIVACY_RE = /\b(private|shared|public)\s*$/i;
    const DEFAULT_RE = /\bdefault\s+list\b/i;

    function parseListName(raw) {
        let name = (raw || '').replace(/\s+/g, ' ').trim();
        let privacy = '';
        const m = name.match(PRIVACY_RE);
        if (m) { privacy = m[1].toLowerCase(); name = name.slice(0, m.index).trim(); }
        const isDefault = DEFAULT_RE.test(name);
        if (isDefault) name = name.replace(DEFAULT_RE, ' ').replace(/\s+/g, ' ').trim();
        name = name.replace(/[-–—•|,:]+\s*$/, '').trim();
        return { name: name || 'Wish List', privacy, isDefault };
    }

    function renderWishlists(container, lists) {
        if (!lists || !lists.length) return;
        container.textContent = ''; // Clear the "Loading..." text
        const added = new Set();
        let colorIdx = 0;
        for (const l of lists.slice(0, 12)) {
            if (!l.name) continue;
            const parsed = parseListName(l.name);
            const dedupeKey = parsed.name.toLowerCase();
            if (added.has(dedupeKey)) continue;
            added.add(dedupeKey);

            const a = document.createElement('a');
            a.href = l.href;
            a.className = 'az-wl';

            const dot = document.createElement('span');
            dot.className = 'az-dot';
            dot.style.setProperty('background', WL_PALETTE[colorIdx % WL_PALETTE.length], 'important');

            const label = document.createElement('span');
            label.className = 'az-wl-name';
            label.textContent = parsed.name; // textContent — scraped names are untrusted

            a.append(dot, label);
            if (parsed.isDefault) {
                a.classList.add('az-wl-is-default');
                const h = icon('heart', 'az-wl-icon az-wl-default', true);
                h.setAttribute('aria-label', 'Default list');
                a.appendChild(h);
            }
            if (parsed.privacy) {
                const lockIcon = icon(parsed.privacy === 'private' ? 'lock' : 'unlock', 'az-wl-icon');
                lockIcon.setAttribute('aria-label', parsed.privacy);
                a.appendChild(lockIcon);
            }
            container.appendChild(a);
            colorIdx++;
        }
        container.dataset.synced = '1';
    }

    // The native account flyout is hidden in our modes, so Amazon never populates
    // its wishlist items. Fetch the wishlist page directly instead, and cache the
    // result so the menu is instant on every following page.
    let wlFetchStarted = false;
    async function fetchWishlists() {
        try {
            const res = await fetch('/hz/wishlist/ls', { credentials: 'same-origin' });
            if (!res.ok) return null;
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const seen = new Set();
            const lists = [];
            for (const a of doc.querySelectorAll('a[href*="/hz/wishlist/ls/"]')) {
                const m = (a.getAttribute('href') || '').match(/\/hz\/wishlist\/ls\/([A-Z0-9]+)/i);
                const name = (a.textContent || '').replace(/\s+/g, ' ').trim();
                if (!m || !name || name.length > 60 || seen.has(m[1])) continue;
                if (/create|explore|discover|idea list|your friends/i.test(name)) continue;
                if (/^your lists$/i.test(name)) continue; // "All Wish Lists" already covers this
                seen.add(m[1]);
                lists.push({ name, href: `/hz/wishlist/ls/${m[1]}` });
            }
            return lists.length ? lists : null;
        } catch { return null; }
    }

    function syncDynamicWishlists() {
        const container = $('#az-dynamic-wishlists');
        if (!container) return;

        // 1) Cached lists from a previous fetch → instant.
        if (container.dataset.synced !== '1' && Array.isArray(session.wishlists)) {
            renderWishlists(container, session.wishlists);
        }

        // 2) Native flyout items, if Amazon happened to populate them.
        if (container.dataset.synced !== '1') {
            const nativeItems = $$('#nav-flyout-wl-items .nav-link, #nav-al-wishlist a').filter(a => {
                const url = a.getAttribute('href') || '';
                const text = (a.textContent || '').trim().toLowerCase();
                return url.includes('wishlist/ls') && !text.includes('create') && !text.includes('explore') && !text.includes('discover');
            });
            renderWishlists(container, nativeItems.map(a => ({ name: a.textContent.trim(), href: a.href })));
        }

        // 3) Fetch fresh once per page — updates the menu and the cache.
        if (!wlFetchStarted) {
            wlFetchStarted = true;
            fetchWishlists().then(lists => {
                if (!lists) return;
                session.wishlists = lists;
                api.storage.local.set({ wishlists: lists });
                const c = $('#az-dynamic-wishlists');
                if (c) renderWishlists(c, lists);
            });
        }
    }

    // Amazon's nav greeting can populate after we build the menu, so keep the
    // button label and the "Account — <name>" heading in step with it.
    function refreshAccountName() {
        const name = customerName();
        if (!name) return;
        const btn = $('#az-account-greeting');
        const heading = $('#az-account-heading');
        if (btn && btn.textContent !== `Hello, ${name}`) btn.textContent = `Hello, ${name}`;
        if (heading && heading.textContent !== `Account — ${name}`) heading.textContent = `Account — ${name}`;
    }

    function buildCustomAccountMenu() {
        if (!settings.customAccountMenu) { $('#az-account-wrap')?.remove(); return; }
        const tools = $('#nav-tools');
        if (!tools) return;
        if ($('#az-account-wrap')) { refreshAccountName(); return; }

        const wrap = document.createElement('div');
        wrap.id = 'az-account-wrap';

        const name = customerName();
        const greeting = name ? `Hello, ${name}` : 'Account';

        // All support links are relative, so they resolve on .in and .com alike
        // and carry no account-specific or referral parameters.
        wrap.innerHTML = `
            <div id="az-account-btn" tabindex="0" aria-haspopup="true">
                <span id="az-account-greeting"></span>
                <svg class="az-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
            <div class="az-dropdown">
                <div class="az-dropdown-title">Wishlists</div>
                <div id="az-dynamic-wishlists">
                    <a href="/hz/wishlist/ls" class="az-note" style="padding: 10px 16px !important; display:block;">Loading lists... (Hover native menu if stuck)</a>
                </div>
                <a href="/hz/wishlist/ls" style="font-weight: 600 !important;">All Wish Lists</a>

                <div class="az-divider"></div>

                <div class="az-dropdown-title" id="az-account-heading">Account</div>
                <a href="/gp/css/homepage.html">Your Account</a>
                <a href="/gp/css/order-history">Your Orders</a>
                <a href="/gp/css/returns/homepage.html">Returns</a>
                <a href="/prime">Your Prime Membership</a>
                <a href="/hz/mycd/myx">Memberships &amp; Subscriptions</a>

                <div class="az-divider"></div>

                <div class="az-dropdown-title">Customer Support</div>
                <a href="/hz/contact-us/">Support &mdash; Center</a>
                <a href="/message-us">Support &mdash; Chat</a>
                <a href="/gp/message#!/inbox/bsm">Message Center &mdash; Seller</a>
            </div>
        `;
        // Scraped name is untrusted — always textContent, never innerHTML.
        wrap.querySelector('#az-account-greeting').textContent = greeting;
        wrap.querySelector('#az-account-heading').textContent = name ? `Account — ${name}` : 'Account';

        tools.insertBefore(wrap, $('#nav-orders') || $('#nav-cart'));
    }

    const EXPLORE_IN = `
        <div class="az-dropdown-title">Groceries &amp; Fast Delivery</div>
        <a href="/fresh" class="az-row az-row-fresh"><span class="az-dot az-dot-fresh"></span>Amazon Fresh</a>
        <a href="/tez/browse/home?qcbrand=qqfsWw9RkO&amp;ref=nav_cs_dsk_grfl_stfr_at" class="az-row az-row-now"><span class="az-dot az-dot-now"></span>Amazon Now</a>
        <a href="/alm/storefront?almBrandId=foq3ZnlEaO&amp;ref=nav_cs_dsk_grfl_stfr_fm" class="az-row az-row-meat"><span class="az-dot az-dot-meat"></span>Fresh Meat</a>

        <div class="az-divider"></div>

        <div class="az-dropdown-title">Shopping &amp; Deals</div>
        <a href="/deals"><span class="az-dot az-dot-deals"></span>Today's Deals</a>
        <a href="/gp/bestsellers"><span class="az-dot az-dot-bestsellers"></span>Best Sellers</a>
        <a href="/gp/new-releases"><span class="az-dot az-dot-new"></span>New Releases</a>
        <a href="/amazonpay/home" class="az-row az-row-pay"><span class="az-dot az-dot-pay"></span>Amazon Pay</a>

        <div class="az-divider"></div>

        <div class="az-dropdown-title">Entertainment</div>
        <a href="/primevideo"><span class="az-dot az-dot-video"></span>Prime Video</a>
        <a href="/minitv"><span class="az-dot az-dot-mini"></span>Amazon miniTV</a>
        <a href="/music"><span class="az-dot az-dot-music"></span>Amazon Music</a>

        <div class="az-divider"></div>
        <a href="/b/register"><span class="az-dot az-dot-sell"></span>Sell on Amazon</a>
    `;

    const EXPLORE_COM = `
        <div class="az-dropdown-title">Shopping &amp; Deals</div>
        <a href="/deals"><span class="az-dot az-dot-deals"></span>Today's Deals</a>
        <a href="/gp/bestsellers"><span class="az-dot az-dot-bestsellers"></span>Best Sellers</a>
        <a href="/gp/new-releases"><span class="az-dot az-dot-new"></span>New Releases</a>
        <a href="/alm/storefront?almBrandId=QW1hem9uIEZyZXNo" class="az-row az-row-fresh"><span class="az-dot az-dot-fresh"></span>Amazon Fresh</a>

        <div class="az-divider"></div>

        <div class="az-dropdown-title">Entertainment</div>
        <a href="https://www.amazon.com/gp/video/storefront"><span class="az-dot az-dot-video"></span>Prime Video</a>
        <a href="https://music.amazon.com"><span class="az-dot az-dot-music"></span>Amazon Music</a>

        <div class="az-divider"></div>
        <a href="https://sell.amazon.com"><span class="az-dot az-dot-sell"></span>Sell on Amazon</a>
    `;

    function buildCustomNavMenu() {
        if (!settings.hideNavExtras) { $('#az-nav-wrap')?.remove(); return; }
        const navLeft = $('#nav-belt .nav-left');
        if (!navLeft || $('#az-nav-wrap')) return;

        const wrap = document.createElement('div');
        wrap.id = 'az-nav-wrap';

        wrap.innerHTML = `
            <div id="az-nav-btn" tabindex="0" aria-haspopup="true">
                Explore
                <svg class="az-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
            <div class="az-dropdown">${IS_IN ? EXPLORE_IN : EXPLORE_COM}</div>
        `;

        navLeft.appendChild(wrap);
    }

    function navMinimal() {
        if (settings.hideNavExtras) document.documentElement.setAttribute('data-az-nav', 'min');
        else document.documentElement.removeAttribute('data-az-nav');
    }

    // ---------- Live cleanup when a setting is switched off ----------

    const RESETS = {
        hideSponsored: () => { for (const el of $$('.az-sponsored')) el.classList.remove('az-sponsored'); releaseClaims('azCard'); removeFeatureNodes('cards'); hideSearchAds(); },
        showUnitPrice: () => { releaseClaims('azCard'); removeFeatureNodes('cards'); },
        flagFewReviews: () => { releaseClaims('azCard'); removeFeatureNodes('cards'); },
        showSellerBadge: () => { releaseClaims('azSeller'); removeFeatureNodes('seller'); },
        stripUrgency: () => { for (const el of $$('.az-urgency')) el.classList.remove('az-urgency'); releaseClaims('azUrgency'); },
        hideCarousels: () => { for (const el of $$('.az-declutter')) el.classList.remove('az-declutter'); releaseClaims('azCarousel'); },
        hideEmi: () => { for (const el of $$('.az-emi')) el.classList.remove('az-emi'); releaseClaims('azEmi'); },
        showBankOffers: () => { releaseClaims('azBank'); removeFeatureNodes('bank'); },
        myCards: () => { releaseClaims('azBank'); removeFeatureNodes('bank'); },
        priceHistoryButton: () => { $('#az-pricehistory')?.remove(); $('#az-pricehistory-alt')?.remove(); releaseClaims('azHistory'); pruneActionsRow(); },
        reviewsButton: () => { $('#az-reviews')?.remove(); pruneActionsRow(); },
        hideProductVideos: () => { for (const el of $$('.az-video')) el.classList.remove('az-video'); releaseClaims('azVideo'); releaseClaims('azVideoHead'); },
        hideBrandCarousel: () => { for (const el of $$('.az-brands')) el.classList.remove('az-brands'); releaseClaims('azBrands'); releaseClaims('azBrandsHead'); },
        hideFeedbackBlock: () => { for (const el of $$('.az-feedback')) el.classList.remove('az-feedback'); releaseClaims('azFeedback'); },
        biggerPrice: () => { /* biggerPrice() self-cleans via the html attribute */ },
        // The cart highlight is a class on Amazon's own element, so it has to be
        // unset rather than removed — removeFeatureNodes would delete the row.
        showHiddenFees: () => {
            for (const el of $$('.az-chip-fee')) el.remove();
            for (const el of $$('.az-cart-fee')) el.classList.remove('az-cart-fee');
            cartFeesFlagged = false;
        },
        highlightCoupon: () => { for (const el of $$('.az-coupon')) el.classList.remove('az-coupon'); releaseClaims('azCoupon'); },
        autoApplyCoupon: () => { /* nothing to undo — we never untick a coupon */ },
        reorderDetails: () => { restoreOrder(); },
        cashkaroWatch: () => { $('#az-cashback')?.remove(); $('#az-aff-pill')?.remove(); releaseClaims('azAtc'); },
        ewcCollapse: () => { /* ewcCollapse() self-cleans */ },
        customAccountMenu: () => { /* builder self-cleans */ },
        hideNavExtras: () => { /* builder + navMinimal self-clean */ },
    };

    function removeFeatureNodes(feature) {
        for (const el of $$(`[data-az-feature="${feature}"]`)) el.remove();
    }

    function pruneActionsRow() {
        const row = $('#az-actions');
        if (row && !row.childElementCount) row.remove();
    }

    function applySettingChange(key) {
        RESETS[key]?.();
        scheduleRun();
    }

    // ---------- Mode ----------

    // Off must mean NO changes at all: strip every injected element and class.
    function cleanupAll() {
        for (const key of Object.keys(RESETS)) safely(`reset ${key}`, RESETS[key]);
        safely('restore order', restoreOrder);
        for (const el of $$('.az-chip, [data-az-feature]')) el.remove();
        $('#az-actions')?.remove();
        $('#az-history-row')?.remove();
        $('#az-pricehistory')?.remove();
        $('#az-pricehistory-alt')?.remove();
        $('#az-reviews')?.remove();
        for (const el of $$('.az-chip-fee')) el.remove();
        $('#az-nav-patch')?.remove();
        $('#az-cashback')?.remove();
        $('#az-aff-pill')?.remove();
        $('#az-ewc-toggle')?.remove();
        $('#az-account-wrap')?.remove();
        $('#az-nav-wrap')?.remove();
        for (const tag of ['azSns', 'azWarranty', 'azHistory', 'azSeller', 'azBank', 'azCard', 'azUrgency', 'azCarousel', 'azEmi', 'azVideo', 'azVideoHead', 'azBrands', 'azBrandsHead', 'azFeedback', 'azCoupon', 'azCouponClick', 'azAtc']) releaseClaims(tag);
        document.documentElement.removeAttribute('data-az-ewc');
        document.documentElement.removeAttribute('data-az-nav');
        document.documentElement.removeAttribute('data-az-price');
        document.documentElement.removeAttribute('data-az-ads');
    }

    function applyMode() {
        document.documentElement.setAttribute('data-az', settings.mode);
        if (settings.mode === 'off') cleanupAll();
    }

    // ---------- In-page settings panel ----------

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
        ['ewcCollapse',      'Collapsible cart side panel',   'Hides the right cart rail behind a 🛒 tab at the screen edge.'],
        ['customAccountMenu','Clean Account dropdown',        'Replaces Amazon\'s heavy dropdown with a custom menu.'],
        ['hideNavExtras',    'Hide the links row',            'Fresh, MiniTV, Sell… the row under the search bar.'],
    ];

    // Where to go to start a tracked session. Nothing here is affiliated with the
    // extension — they are just the sites that dominate each market.
    const AGGREGATORS = IS_IN
        ? [['CashKaro', 'https://cashkaro.com/stores/amazon'], ['EarnKaro', 'https://earnkaro.com/amazon-offers']]
        : [['Rakuten', 'https://www.rakuten.com/amazon.com'], ['TopCashback', 'https://www.topcashback.com/amazon/']];

    // The third block in the Modes view: what, if anything, is tracking this
    // visit. A tag set by a YouTube or blog link shows up here exactly the same
    // way a CashKaro one does — it is whoever gets credit for the purchase.
    function renderAffiliateBox() {
        const box = $('#az-aff-box');
        if (!box) return;

        const live = affiliateLive();
        const stale = affiliateStale();
        const tag = session.affTag;
        const hoursLeft = Math.max(0, Math.floor((AFFILIATE_WINDOW_MS - affiliateAge()) / 3600000));
        const state = `${live}|${stale}|${tag}|${live ? hoursLeft : ''}`;
        if (box.dataset.state === state) return;
        box.dataset.state = state;
        box.textContent = '';

        const row = document.createElement('div');
        row.className = 'az-aff-state ' + (live ? 'az-aff-on' : stale ? 'az-aff-unsure' : 'az-aff-off');
        row.textContent = live
            ? `Active — ${tag}`
            : stale ? `Unverified — ${tag}` : 'No affiliate link active';
        box.appendChild(row);

        const hint = document.createElement('span');
        hint.className = 'az-hint';
        hint.textContent = live
            ? `About ${hoursLeft}h left. Whoever owns this tag gets credit for anything you add from now on.`
            : stale
                ? 'This tag was picked up before the browser was last closed, so it may no longer be in force. Click through again to be sure.'
                : 'Nothing is tracking this visit. Start from a cashback site if you want the purchase to earn.';
        box.appendChild(hint);

        if (!live) {
            const links = document.createElement('div');
            links.className = 'az-aff-links';
            for (const [name, url] of AGGREGATORS) {
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.className = 'az-aff-link';
                a.textContent = name;
                links.appendChild(a);
            }
            box.appendChild(links);
        }
    }

    function buildPanel() {
        if ($('#az-fab')) return;

        const fab = document.createElement('button');
        fab.id = 'az-fab';
        fab.type = 'button';
        fab.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>`;
        fab.setAttribute('aria-label', 'Amazon — My Personal UX settings (Alt+A)');
        fab.setAttribute('aria-expanded', 'false');

        const panel = document.createElement('div');
        panel.id = 'az-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Amazon — My Personal UX settings');

        panel.innerHTML = `
            <h2>Amazon &mdash; My Personal UX</h2>

            <div class="az-tabs">
                <button id="az-tab-main" class="az-tab active" type="button">Modes</button>
                <button id="az-tab-settings" class="az-tab" type="button">Settings</button>
            </div>

            <div id="az-view-main">
                <div id="az-modes"></div>
                <h3 class="az-aff-title">Cashback link</h3>
                <div id="az-aff-box"></div>
            </div>

            <div id="az-view-settings" hidden>
                <div id="az-toggles"></div>

                <h3 style="margin-top: 20px;">My Cards</h3>
                <span class="az-hint" style="margin-bottom: 8px;">Comma-separated, e.g. <em>HDFC, Amazon Pay ICICI</em>. Blank for all.</span>
                <input id="az-cards" type="text" class="az-input" placeholder="e.g. HDFC, SBI">
            </div>

            <div class="az-foot">
                Made with <span style="color:#e25555; font-size: 15px;">♥</span> by Sandeep Kiran (Mousy)
                <br>v${api.runtime.getManifest().version}
            </div>
        `;

        const modes = [
            ['simple', 'Simple',   'Full decluttering.'],
            ['off',    'Disabled', 'Normal Amazon. Nothing is changed.'],
        ];

        const modeBox = panel.querySelector('#az-modes');
        for (const [value, label, hint] of modes) {
            const wrap = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'az-mode';
            input.value = value;
            input.checked = settings.mode === value;
            input.addEventListener('change', () => {
                save('mode', value);
                applyMode();
                scheduleRun();
            });
            const text = document.createElement('div');
            text.innerHTML = `<span class="az-label-text">${label}</span><span class="az-hint">${hint}</span>`;
            wrap.append(input, text);
            modeBox.appendChild(wrap);
        }

        const toggleBox = panel.querySelector('#az-toggles');
        for (const [key, label, hint] of TOGGLES) {
            const wrap = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.azKey = key;
            input.checked = settings[key];
            input.addEventListener('change', () => { save(key, input.checked); applySettingChange(key); });
            const text = document.createElement('div');
            text.innerHTML = `<span class="az-label-text">${label}</span><span class="az-hint">${hint}</span>`;
            wrap.append(input, text);
            toggleBox.appendChild(wrap);
        }

        const cardsInput = panel.querySelector('#az-cards');
        cardsInput.value = settings.myCards;
        cardsInput.addEventListener('change', () => { save('myCards', cardsInput.value); applySettingChange('myCards'); });

        const toggle = () => {
            panel.hidden = !panel.hidden;
            fab.setAttribute('aria-expanded', String(!panel.hidden));
            if (!panel.hidden) {
                panel.querySelector('#az-tab-main').click();
                safely('affiliate box', renderAffiliateBox);
                panel.querySelector('input')?.focus();
            }
        };

        fab.addEventListener('click', toggle);

        panel.querySelector('#az-tab-main').addEventListener('click', (e) => {
            e.target.classList.add('active');
            panel.querySelector('#az-tab-settings').classList.remove('active');
            panel.querySelector('#az-view-main').hidden = false;
            panel.querySelector('#az-view-settings').hidden = true;
        });

        panel.querySelector('#az-tab-settings').addEventListener('click', (e) => {
            e.target.classList.add('active');
            panel.querySelector('#az-tab-main').classList.remove('active');
            panel.querySelector('#az-view-main').hidden = true;
            panel.querySelector('#az-view-settings').hidden = false;
        });

        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); toggle(); }
            if (e.key === 'Escape' && !panel.hidden) { toggle(); fab.focus(); }
        });

        document.addEventListener('click', (e) => {
            if (!panel.hidden && !panel.contains(e.target) && !fab.contains(e.target)) {
                toggle();
            }
        });

        document.body.append(fab, panel);
    }

    // Reflect external changes (from the popup or another synced device) in the panel.
    function refreshPanelInputs() {
        const panel = $('#az-panel');
        if (!panel) return;
        for (const radio of $$('input[name="az-mode"]', panel)) radio.checked = radio.value === settings.mode;
        for (const box of $$('input[data-az-key]', panel)) box.checked = !!settings[box.dataset.azKey];
        const cardsInput = $('#az-cards', panel);
        if (cardsInput && document.activeElement !== cardsInput) cardsInput.value = settings.myCards;
        safely('affiliate box', renderAffiliateBox);
    }

    // ---------- Orchestration ----------

    function runAll() {
        if (isOff()) return;
        safely('search results', annotateSearchResults);
        safely('seller badge',   annotateSeller);
        safely('urgency',        stripUrgency);
        safely('carousels',      hideCarousels);
        safely('subscribe&save', fixSubscribeSave);
        safely('warranty modal', dismissWarranty);
        safely('emi',            hideEmi);
        safely('bank offers',    showBankOffers);
        safely('price history',  addPriceHistoryButton);
        safely('reviews button', addReviewsButton);
        safely('product videos', hideProductVideos);
        safely('brand rail',     hideBrandCarousel);
        safely('feedback block', hideFeedbackBlock);
        safely('bigger price',   biggerPrice);
        safely('hidden fees',    showHiddenFees);
        safely('cart fees',      highlightCartFees);
        safely('coupon',         highlightCoupon);
        safely('search ads',     hideSearchAds);
        safely('reorder detail', reorderDetails);
        safely('cart tracking',  markAddToCart);
        safely('cashback',       cashbackBanner);
        safely('affiliate pill', affiliateStatusPill);
        safely('cart rail',      ewcCollapse);
        safely('account menu',   buildCustomAccountMenu);
        safely('dynamic lists',  syncDynamicWishlists);
        safely('explore menu',   buildCustomNavMenu);
        safely('nav minimal',    navMinimal);
    }

    let pending = null;
    function scheduleRun() {
        if (pending) return;
        pending = setTimeout(() => { pending = null; runAll(); }, 200);
    }

    function start() {
        buildPanel();
        runAll();
        new MutationObserver(scheduleRun).observe(document.body, { childList: true, subtree: true });

        // Wishlists sometimes load very late — resync on nav hover.
        $('#navbar-main')?.addEventListener('mouseover', syncDynamicWishlists, { passive: true });
    }

    // React to changes made from the popup (or synced from another device).
    api.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.settings && changes.settings.newValue) {
            const next = { ...changes.settings.newValue, mode: normalizeMode(changes.settings.newValue.mode) };
            const changedKeys = Object.keys(DEFAULTS).filter(k => k in next && settings[k] !== next[k]);
            for (const key of Object.keys(DEFAULTS)) if (key in next) settings[key] = next[key];
            for (const key of changedKeys) {
                if (key === 'mode') { applyMode(); scheduleRun(); }
                else applySettingChange(key);
            }
            refreshPanelInputs();
        }
        if (area === 'local') {
            if (changes.affTag) session.affTag = changes.affTag.newValue;
            if (changes.affAt) session.affAt = changes.affAt.newValue;
            if (changes.affRun) session.affRun = changes.affRun.newValue;
            if (changes.ewcOpen) session.ewcOpen = changes.ewcOpen.newValue;
            if (changes.trackedAsins) session.trackedAsins = changes.trackedAsins.newValue || {};
            if (changes.cashbackHidden) session.cashbackHidden = changes.cashbackHidden.newValue;
            if (changes.affTag || changes.affAt || changes.affRun) safely('affiliate box', renderAffiliateBox);
        }
    });

    // ---------- Boot ----------

    // chrome.storage.session survives navigations but not a browser shutdown, so
    // the first Amazon page after a restart mints a new id. Content scripts can
    // only read it when background.js has widened the access level, and Firefox
    // may not expose it at all — a null id simply disables restart detection.
    function browserRunId() {
        let store;
        try { store = api.storage.session; } catch { store = null; }
        if (!store) return Promise.resolve(null);
        const read = new Promise(res => {
            try {
                store.get({ azRunId: null }, d => {
                    if (api.runtime.lastError) return res(null);
                    if (d && d.azRunId) return res(d.azRunId);
                    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
                    // Session restore opens several tabs at once and they all mint
                    // at the same moment. Re-read after writing so every tab ends
                    // up on whichever id actually won, instead of each keeping its
                    // own and accusing the others of being from an old run.
                    store.set({ azRunId: id }, () => {
                        if (api.runtime.lastError) return res(null);
                        store.get({ azRunId: null }, d2 => res((d2 && d2.azRunId) || id));
                    });
                });
            } catch { res(null); }
        });
        // Every feature waits on this promise, so it must never be the thing that
        // hangs. A browser that neither calls back nor throws just loses restart
        // detection rather than the whole extension.
        return Promise.race([read, new Promise(res => setTimeout(() => res(null), 1500))]);
    }

    Promise.all([
        new Promise(res => api.storage.sync.get({ settings: {} }, d => res(d.settings || {}))),
        new Promise(res => api.storage.local.get({ affTag: null, affAt: 0, affRun: null, ewcOpen: false, wishlists: null, trackedAsins: {}, cashbackHidden: false, lastHost: null }, d => res(d))),
        browserRunId(),
    ]).then(([stored, local, runId]) => {
        RUN_ID = runId;
        for (const key of Object.keys(DEFAULTS)) {
            if (key in stored) settings[key] = stored[key];
        }
        Object.assign(session, local);

        // Migrate the retired "power" mode, and write it back so the popup and
        // the badge agree with what the page is actually doing.
        const migrated = normalizeMode(settings.mode);
        if (migrated !== settings.mode) save('mode', migrated);

        applyMode();
        // The popup has no page to read, so it learns which Amazon you use — and
        // therefore which cashback sites to offer — from here.
        if (session.lastHost !== location.hostname) saveSession('lastHost', location.hostname);
        recordAffiliateTag();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    });
})();
