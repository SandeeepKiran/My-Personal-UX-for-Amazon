// My Personal UX for Amazon: product page.
// Features: seller badge, clutter removal, EMI and bank offers, price history and
// reviews buttons, bigger price, extra-fee warning, coupons, and section order.
'use strict';

// ---------- Seller ----------

// The 2026 layout puts the name in #merchant-trust-info-card. On that layout,
// #sellerProfileTriggerId is a hidden "Learn more about the seller" link. Thus, it comes last.
var SELLER_NAME_SELECTORS = [
    '#merchant-trust-info-card',
    '[offer-display-feature-name="desktop-merchant-info"] .offer-display-feature-text-message',
    '#sellerProfileTriggerId',
    '#merchant-info a',
    '#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"] span',
];

function sellerName() {
    for (const selector of SELLER_NAME_SELECTORS) {
        const text = ($(selector)?.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && text.length < 80 && !/learn more|see more|details/i.test(text)) return text;
    }
    return '';
}

// The byline is "Brand: MousyLatest" or "Visit the Mousy Store".
function brandName() {
    const text = ($('#bylineInfo')?.textContent || '').replace(/\s+/g, ' ').trim();
    const match = text.match(/^brand:\s*(.+)$/i) || text.match(/^visit the\s+(.+?)\s+store$/i);
    return match ? match[1] : '';
}

// "Mousy Latest" and "MousyLatest" are the same name. Thus, compare letters and digits only.
function sameName(a, b) {
    const clean = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const x = clean(a);
    const y = clean(b);
    // A close name is not enough. A wrong "brand" chip is worse than a third-party chip.
    return Boolean(x) && x === y;
}

function annotateSeller() {
    if (!enabled('showSellerBadge')) return;
    const buyBox = $('#desktop_buybox, #buybox, #rightCol');
    if (!buyBox || buyBox.dataset.azSeller) return;
    const name = sellerName();
    // Amazon can load the seller after the first run. Claim the buy box only when the name is there.
    if (!name || !claim(buyBox, 'azSeller')) return;
    // Cloudtail and Appario are Amazon's own seller companies in India.
    const isAmazon = /amazon|cloudtail|appario/i.test(name);
    const chip = isAmazon
        ? makeChip(`Sold by ${name}`, 'good', '', 'seller')
        : sameName(name, brandName())
            ? makeChip(`Sold by the brand: ${name}`, 'brand', '(the brand handles returns)', 'seller')
            : makeChip(`Third-party seller: ${name}`, 'warn', '(the seller handles returns)', 'seller');
    const target = $('#apex_desktop') || $('#corePrice_feature_div') || buyBox.firstElementChild;
    target?.insertAdjacentElement('beforebegin', chip);
}

defineFeature({
    name: 'seller badge',
    keys: ['showSellerBadge'],
    run: annotateSeller,
    reset() { releaseClaims('azSeller'); removeFeatureNodes('seller'); },
});

// ---------- Urgency text ----------

var URGENCY_RE = /only\s+\d+\s+left|order\s+soon|ends?\s+in\s+\d|hurry|limited\s+time\s+deal/i;

function stripUrgency() {
    if (!enabled('stripUrgency')) return;
    for (const node of $$('.a-color-price, .a-color-success, #availability span, .s-color-price, [id*="deal"] .a-color-price')) {
        if (!claim(node, 'azUrgency')) continue;
        const text = (node.textContent || '').trim();
        if (text.length < 80 && URGENCY_RE.test(text)) node.classList.add('az-urgency');
    }
}

defineFeature({
    name: 'urgency',
    keys: ['stripUrgency'],
    run: stripUrgency,
    reset() { removeClass('az-urgency'); releaseClaims('azUrgency'); },
});

// ---------- Rails found by their heading ----------

// Amazon changes the ids of these blocks. Thus, find the heading text, then hide the block around it.
function hideByHeading(pattern, tag, className, container) {
    for (const heading of $$('h2, h3')) {
        if (!claim(heading, tag)) continue;
        if (!pattern.test((heading.textContent || '').trim())) continue;
        const block = heading.closest(container);
        if (!block || block === document.body) continue;
        // Do not hide the Keepa extension box, if the user has it.
        if (block.querySelector('#keepaContainer, [id^="keepa"], [class*="keepa"]')) continue;
        block.classList.add(className);
    }
}

var CAROUSEL_HEADINGS = /inspired by your browsing|related to items you|customers who bought|customers also|you might also like|based on your recent|recommended based on|explore more|top picks for you/i;

defineFeature({
    name: 'carousels',
    keys: ['hideCarousels'],
    run() {
        if (enabled('hideCarousels')) hideByHeading(CAROUSEL_HEADINGS, 'azCarousel', 'az-declutter', '[data-cel-widget], .a-carousel-container, .a-section');
    },
    reset() { removeClass('az-declutter'); releaseClaims('azCarousel'); },
});

var VIDEO_HEADING = /^(videos? for this product|product videos?|videos)$/i;

defineFeature({
    name: 'product videos',
    keys: ['hideProductVideos'],
    run() {
        if (!enabled('hideProductVideos')) return;
        for (const node of $$('.VideosForThisProduct, .vse-vwdp-video-block-wrapper, #vse-related-videos-btf_feature_div, #va-related-videos-widget_feature_div')) {
            const block = node.closest('.a-cardui') || node;
            if (claim(block, 'azVideo')) block.classList.add('az-video');
        }
        hideByHeading(VIDEO_HEADING, 'azVideoHead', 'az-video', '.a-cardui, [data-cel-widget], .a-carousel-container, .a-section');
    },
    reset() { removeClass('az-video'); releaseClaims('azVideo', 'azVideoHead'); },
});

var BRAND_HEADING = /brands? in this category/i;

defineFeature({
    name: 'brand rail',
    keys: ['hideBrandCarousel'],
    run() {
        if (!enabled('hideBrandCarousel')) return;
        for (const node of $$('[id^="sims-discoveryAndInspiration_feature_div"], #brandsSpotlight_feature_div')) {
            if (claim(node, 'azBrands')) node.classList.add('az-brands');
        }
        hideByHeading(BRAND_HEADING, 'azBrandsHead', 'az-brands', '.a-cardui, [data-cel-widget], .a-carousel-container, .a-section');
    },
    reset() { removeClass('az-brands'); releaseClaims('azBrands', 'azBrandsHead'); },
});

// Look only in the product details tables. Other "Feedback" headings on the page stay.
var DETAIL_SCOPES = '#productDetails_expanderSectionTables, #prodDetails, #productDetails_feature_div';

defineFeature({
    name: 'feedback block',
    keys: ['hideFeedbackBlock'],
    run() {
        if (!enabled('hideFeedbackBlock')) return;
        for (const scope of $$(DETAIL_SCOPES)) {
            for (const heading of $$('h2, h3', scope)) {
                if (!claim(heading, 'azFeedback')) continue;
                if (!/^feedback$/i.test((heading.textContent || '').trim())) continue;
                const block = heading.closest('.a-section');
                if (block && block !== scope && !block.contains(scope)) block.classList.add('az-feedback');
            }
        }
    },
    reset() { removeClass('az-feedback'); releaseClaims('azFeedback'); },
});

// The row of icons below the offers: "10 days Replacement", "Top Brand", "Secure transaction".
defineFeature({
    name: 'trust icons',
    keys: ['hideTrustIcons'],
    run() {
        if (!enabled('hideTrustIcons')) return;
        for (const node of $$('#iconfarmv2_feature_div, #icon-farm-container')) {
            if (claim(node, 'azTrustIcons')) node.classList.add('az-trust-icons');
        }
    },
    reset() { removeClass('az-trust-icons'); releaseClaims('azTrustIcons'); },
});

// ---------- EMI and bank offers (amazon.in) ----------

var EMI_SELECTORS = '#inemi_feature_div, #emiSignalWithOfferMessaging_feature_div, #creditCardSignalWithOfferMessaging_feature_div, #exportsEMIMessage_feature_div, #emiPlansDetails, #emiOptionsSection, #installmentCalculator_feature_div';

defineFeature({
    name: 'emi',
    keys: ['hideEmi'],
    run() {
        if (!enabled('hideEmi')) return;
        for (const node of $$(EMI_SELECTORS)) {
            if (claim(node, 'azEmi')) node.classList.add('az-emi');
        }
        for (const node of $$('#promotions_feature_div .a-list-item, #apex_desktop .a-row, .offers-items li')) {
            if (!claim(node, 'azEmi')) continue;
            const text = (node.textContent || '').trim();
            if (text.length < 200 && /\bemi\b/i.test(text)) node.classList.add('az-emi');
        }
    },
    reset() { removeClass('az-emi'); releaseClaims('azEmi'); },
});

// The main price block in the middle column. The bank offers and the "classic" buttons go below it.
function centerPriceBlock() {
    return $('#centerCol #apex_desktop') || $('#centerCol #corePrice_feature_div') || $('#centerCol #corePriceDisplay_desktop_feature_div')
        || $('#apex_desktop') || $('#corePrice_feature_div');
}

// The old offers list has the full offer text.
function listedBankOffers() {
    const host = $('#promotions_feature_div, #applicable_promotion_list_sec, #itembox-InstantBankDiscount');
    if (!host) return [];
    return [...new Set($$('.offers-items-content, .a-list-item, .a-truncate-full, .a-section', host)
        .map(node => (node.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(text => text.length > 20 && text.length < 300 && /bank offer|cashback|instant discount|% off on/i.test(text)))];
}

// The 2026 offers carousel shows only a summary card, for example "3 cashback offers available".
// Amazon loads the full text only when you click the card. Thus, the chip clicks Amazon's card.
function carouselOfferCards() {
    return $$('#smx_feature_div [aria-label]')
        .map(node => ({ node, label: (node.getAttribute('aria-label') || '').trim() }))
        .filter(({ label }) => label.length < 80 && /\boffers? available\b/i.test(label));
}

// "See all offers & discounts" opens a panel that Amazon loads from its own server.
// The panel lists each bank offer under its card name, for example "SBI Credit Card".
function allOffersLink() {
    for (const node of $$('#smx_feature_div [data-smx-desktop-secondary-view]')) {
        try {
            const view = JSON.parse(node.getAttribute('data-smx-desktop-secondary-view'));
            if (/^smx-AOP-secondary-view/.test(view.name) && /^\/hz\/smx\//.test(view.url)) return { node, url: view.url };
        } catch { /* Not JSON. Try the next node. */ }
    }
    return null;
}

// Reads the panel. Each group is one card name and its offers. Nothing goes into the page as HTML.
function parseCardOffers(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clean = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    return $$('.aop-payment-offer-list > div', doc)
        .map(group => ({
            card: clean(group.querySelector('[id^="aop-fullpayment-"] span.a-size-base, [id^="aop-installments-"] span.a-size-base')),
            offers: [...new Set($$('li.aop-payment-voucher-details', group)
                .map(node => clean(node).replace(/\s*T&Cs apply\.?$/i, ''))
                .filter(Boolean))],
        }))
        .filter(group => group.card && group.offers.length)
        // "SBI Credit Card - EMI" is an EMI offer. "Hide EMI options" hides those.
        .filter(group => !(enabled('hideEmi') && /\bemi\b/i.test(group.card)));
}

// One request for each product page. The result stays in memory only, and only for this page.
var cardOffers = { asin: null, state: 'none', groups: [] };

function loadCardOffers(asin, url) {
    if (cardOffers.asin === asin) return;
    cardOffers = { asin, state: 'loading', groups: [] };
    // Firefox: content.fetch sends the request as the page, with the page's cookies. Chrome does that with fetch.
    const pageFetch = globalThis.content?.fetch ? globalThis.content.fetch.bind(globalThis.content) : fetch;
    pageFetch(url, { credentials: 'include' })
        .then(response => (response.ok ? response.text() : ''))
        .then(html => { cardOffers = { asin, state: 'done', groups: html ? parseCardOffers(html) : [] }; })
        .catch(() => { cardOffers = { asin, state: 'done', groups: [] }; })
        .finally(() => {
            // Draw the chips again with the card names. In "Disabled" mode, draw nothing.
            if (isOff()) return;
            removeFeatureNodes('bank');
            safely('bank offers', showBankOffers);
        });
}

function myCardList() {
    return settings.myCards.split(',').map(card => card.trim().toLowerCase()).filter(Boolean);
}

function clickableChip(text, note, target) {
    const chip = makeChip(text, 'good', note, 'bank');
    chip.classList.add('az-chip-click');
    chip.addEventListener('click', () => (target.querySelector('.a-declarative') || target).click());
    return chip;
}

function cardOfferChips(box, groups, link) {
    const cards = myCardList();
    const total = groups.reduce((sum, group) => sum + group.offers.length, 0);
    if (!cards.length) {
        for (const group of groups.slice(0, 3)) box.append(clickableChip(`${group.card}: ${group.offers[0]}`, '', link.node));
        return;
    }
    const mine = groups.filter(group => cards.some(card => group.card.toLowerCase().includes(card)));
    if (!mine.length) {
        box.append(makeChip('No bank offer for your cards', 'warn', `(${total} offer${total === 1 ? '' : 's'} for other cards)`, 'bank'));
        return;
    }
    for (const group of mine) {
        const more = group.offers.length - 1;
        box.append(clickableChip(`Your card, ${group.card}: ${group.offers[0]}`, more > 0 ? `(+${more} more)` : '', link.node));
    }
}

function showBankOffers() {
    if (!enabled('showBankOffers') || $('[data-az-feature="bank"]')) return;
    const offers = listedBankOffers();
    const summaries = offers.length ? [] : carouselOfferCards();
    const link = offers.length ? null : allOffersLink();
    if (link) loadCardOffers(currentAsin(), link.url);
    if (!offers.length && !summaries.length && !(link && cardOffers.groups.length)) return;

    const box = el('div', { id: 'az-bank', 'data-az-feature': 'bank' });
    if (!offers.length) {
        // Cashback and other summary cards stay as they are. Bank offers come from the panel.
        for (const { node, label } of summaries) {
            if (/\bbank\b/i.test(label) && cardOffers.groups.length) continue;
            box.append(clickableChip(label, '(click for details)', node));
        }
        if (link && cardOffers.groups.length) cardOfferChips(box, cardOffers.groups, link);
        hideDuplicateOffers();
    } else {
        const cards = myCardList();
        const mine = offers.filter(offer => cards.some(card => offer.toLowerCase().includes(card)));
        if (cards.length && mine.length) {
            for (const offer of mine) box.append(makeChip(`Your card: ${offer}`, 'good', '', 'bank'));
        } else if (cards.length) {
            box.append(makeChip('No bank offer for your cards', 'warn', `(${offers.length} offer${offers.length === 1 ? '' : 's'} for other cards)`, 'bank'));
        } else {
            for (const offer of offers.slice(0, 3)) box.append(makeChip(offer, 'good', '', 'bank'));
        }
    }
    if (!box.childElementCount) return;
    // Put the offers below the buttons when the buttons are in the middle column.
    const actions = $('#az-actions');
    const anchor = actions && actions.closest('#centerCol') ? actions : centerPriceBlock();
    anchor?.insertAdjacentElement('afterend', box);
}

// The blue chips repeat Amazon's "Offers" heading and summary cards. Thus, hide those.
// Keep "See all offers & discounts": it is in the same box, below the cards.
function hideDuplicateOffers() {
    for (const node of $$('#offersHeader_feature_div, #smx_feature_div .cardification-multi-select-carousel')) {
        node.classList.add('az-offers-dup');
    }
}

defineFeature({
    name: 'bank offers',
    keys: ['showBankOffers', 'myCards', 'minimalProductUi'],
    run: showBankOffers,
    reset() { releaseClaims('azBank'); removeFeatureNodes('bank'); removeClass('az-offers-dup'); },
});

// ---------- Buy box buttons: price history and reviews ----------

function currentAsin() {
    const fromUrl = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (fromUrl) return fromUrl[1].toUpperCase();
    const input = $('#ASIN, input[name="ASIN"]');
    return input && /^[A-Z0-9]{10}$/i.test(input.value) ? input.value.toUpperCase() : null;
}

// The price history and reviews buttons share one row below the price.
// Minimal Product UI on: the row goes below the main price. Off: below the buy box price.
function actionsRow() {
    const existing = $('#az-actions');
    if (existing && existing.isConnected) return existing;
    const target = enabled('minimalProductUi')
        ? centerPriceBlock()
        : $('#rightCol #corePrice_feature_div, #desktop_buybox #corePrice_feature_div, #buybox #corePrice_feature_div') || $('#corePrice_feature_div') || $('#apex_desktop');
    if (!target) return null;
    const row = el('div', { id: 'az-actions', 'data-az-feature': 'actions' });
    // "afterend" puts the row directly below the target. Thus, bank offers there stay below the row.
    target.insertAdjacentElement('afterend', row);
    return row;
}

function pruneActionsRow() {
    const row = $('#az-actions');
    if (row && !row.childElementCount) row.remove();
}

// Keepa has a direct link for each ASIN. Domain 10 is amazon.in. Domain 1 is amazon.com.
var KEEPA_DOMAIN = IS_IN ? 10 : 1;

function addPriceHistoryButtons() {
    if (!enabled('priceHistoryButton') || $('#az-history-row')) return;
    const asin = currentAsin();
    if (!asin) return;
    const row = actionsRow();
    if (!row) return;

    const keepa = el('button', {
        id: 'az-pricehistory', type: 'button', title: 'Open this product on Keepa', text: 'Keepa',
        onclick: () => window.open(`https://keepa.com/#!product/${KEEPA_DOMAIN}-${asin}`, '_blank', 'noopener'),
    });
    const pair = el('div', { id: 'az-history-row', 'data-az-feature': 'actions' }, keepa);

    // PriceHistory has no direct link for an ASIN. Thus, the button copies the product
    // link and opens the site. The user pastes the link in the site's search box.
    // This needs no extra permissions, and the extension sends nothing to the site.
    if (IS_IN) {
        const alt = el('button', {
            id: 'az-pricehistory-alt', type: 'button', text: 'Price History',
            title: 'Copies the product link, then opens PriceHistory. Paste the link in their search box.',
        });
        alt.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(`${location.origin}/dp/${asin}`);
                alt.textContent = 'Copied. Paste it.';
                setTimeout(() => { alt.textContent = 'Price History'; }, 2500);
            } catch { /* The browser blocked the clipboard. The site opens all the same. */ }
            window.open('https://pricehistoryapp.com/', '_blank', 'noopener');
        });
        pair.append(alt);
    }
    row.append(pair);
}

defineFeature({
    name: 'price history',
    keys: ['priceHistoryButton', 'minimalProductUi'],
    run: addPriceHistoryButtons,
    reset() { $('#az-history-row')?.remove(); pruneActionsRow(); },
});

var REVIEW_TARGETS = '#customerReviews, #reviewsMedley, #cm-cr-dp-review-list, #averageCustomerReviews_feature_div';

// The code reads the rating and the count from the page each time. It never stores them.
function reviewStats() {
    const countRaw = $('#acrCustomerReviewText')?.textContent || '';
    const count = (countRaw.match(/[\d,]+/) || [''])[0];
    const ratingSrc = $('#acrPopover')?.getAttribute('title')
        || $('#acrPopover .a-icon-alt, #averageCustomerReviews .a-icon-alt, #averageCustomerReviews_feature_div .a-icon-alt')?.textContent
        || '';
    const match = ratingSrc.match(/([\d.]+)\s*out of\s*5/i);
    return { rating: match ? match[1] : '', count };
}

// Line 2 of the button: "4.1" and five stars, filled to the nearest half star.
function fillRatingRow(row, rating) {
    const score = parseFloat(rating) || 0;
    const stars = el('span', { class: 'az-rating-stars' });
    for (let i = 1; i <= 5; i++) {
        stars.append(icon('star', { cls: score >= i - 0.5 ? 'az-star az-star-on' : 'az-star az-star-off', filled: true }));
    }
    row.replaceChildren(el('span', { class: 'az-rating-value', text: rating }), stars);
    row.dataset.text = rating;
}

function fillCountRow(row, count) {
    row.replaceChildren(el('span', { class: 'az-count-value', text: count }), ' global reviews');
    row.dataset.text = count;
}

function paintReviewStats(button) {
    const { rating, count } = reviewStats();
    const ratingRow = button.querySelector('.az-btn-rating');
    const countRow = button.querySelector('.az-btn-count');
    if (ratingRow && rating && ratingRow.dataset.text !== rating) fillRatingRow(ratingRow, rating);
    if (countRow && count && countRow.dataset.text !== count) fillCountRow(countRow, count);
}

function addReviewsButton() {
    if (!enabled('reviewsButton')) return;
    // Amazon often loads the rating after the first paint. Thus, update the button.
    const existing = $('#az-reviews');
    if (existing) { paintReviewStats(existing); return; }

    if (!$('#acrCustomerReviewLink') && !$(REVIEW_TARGETS)) return;
    const row = actionsRow();
    if (!row) return;

    const button = el('button', {
        id: 'az-reviews', type: 'button', 'data-az-feature': 'actions',
        // Amazon's own link has the correct scroll and lazy-load behavior. Use it first.
        onclick: () => {
            const link = $('#acrCustomerReviewLink');
            if (link) link.click();
            else $(REVIEW_TARGETS)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    },
    el('span', { class: 'az-btn-main', text: 'Check Review Section' }),
    el('span', { class: 'az-btn-rating' }),
    el('span', { class: 'az-btn-count' }));
    paintReviewStats(button);
    row.append(button);
}

defineFeature({
    name: 'reviews button',
    keys: ['reviewsButton', 'minimalProductUi'],
    run: addReviewsButton,
    reset() { $('#az-reviews')?.remove(); pruneActionsRow(); },
});

// ---------- Bigger price ----------

// CSS does the work. See data-az-price in content.css.
defineFeature({
    name: 'bigger price',
    keys: ['biggerPrice'],
    run: () => setRootFlag('data-az-price', enabled('biggerPrice') && 'big'),
    reset: () => setRootFlag('data-az-price', null),
});

// ---------- Extra fees ----------

// Look only in buy box parts that state charges. A false fee warning is worse than a missed one.
// Amazon adds a slot name to some ids (example: mir-layout-DELIVERY_BLOCK-slot-PRIMARY_...).
// Thus, match the start of those ids.
var FEE_SCOPES = [
    '[id^="mir-layout-DELIVERY_BLOCK"]', '[id*="DELIVERY_MESSAGE"]',
    '#deliveryBlockMessage', '#deliveryPriceBadging_feature_div',
    '#priceblock_shippingmessage', '#price-shipping-message', '#shippingMessageInsideBuyBox_feature_div',
    '#exports_desktop_qualifiedBuybox_shippingFeeMessage', '#installActionBox', '#installation_feature_div',
    '#dynamicDeliveryMessage_feature_div', '#fulfillerInfoFeature_feature_div',
].join(', ');

var FEE_WORD = '(delivery|shipping|handling|service|installation|assembly|convenience|packaging|import|customs)';
var FEE_MONEY = '[₹$]\\s*([\\d,]+(?:\\.\\d{1,2})?)';
// "Delivery charge ₹40", "Installation fee: ₹499"
var FEE_LABEL_FIRST = new RegExp(`${FEE_WORD}\\s*(?:charges?|fees?|costs?)?\\s*(?:of|:|-|–)?\\s*${FEE_MONEY}`, 'gi');
// "₹40 delivery charge", "+ ₹99 shipping"
var FEE_MONEY_FIRST = new RegExp(`${FEE_MONEY}\\s*(?:extra\\s*)?(?:for\\s+)?${FEE_WORD}\\s*(?:charges?|fees?)?`, 'gi');
// "FREE delivery" and "No delivery charge" are not charges.
var FEE_NEGATED = /\b(free|no|zero)\s*$/i;

function feeIsNegated(text, index) {
    return FEE_NEGATED.test(text.slice(Math.max(0, index - 14), index));
}

function scanFees(text) {
    const hits = [];
    for (const match of text.matchAll(FEE_LABEL_FIRST)) {
        if (!feeIsNegated(text, match.index)) hits.push({ label: match[1].toLowerCase(), amount: parseFloat(match[2].replace(/,/g, '')) });
    }
    for (const match of text.matchAll(FEE_MONEY_FIRST)) {
        if (!feeIsNegated(text, match.index)) hits.push({ label: match[2].toLowerCase(), amount: parseFloat(match[1].replace(/,/g, '')) });
    }
    return hits.filter(hit => isFinite(hit.amount) && hit.amount > 0 && hit.amount < 1000000);
}

function collectFees() {
    const byLabel = new Map();
    const record = (label, amount) => {
        if (!isFinite(amount) || amount <= 0) return;
        if (!byLabel.has(label) || byLabel.get(label) < amount) byLabel.set(label, amount);
    };
    // The best source: Amazon puts the delivery charge in an attribute, for example data-csa-c-delivery-price="₹59".
    for (const node of $$('[data-csa-c-delivery-price]')) {
        const raw = node.getAttribute('data-csa-c-delivery-price') || '';
        if (/free/i.test(raw)) continue;
        const match = raw.match(/([\d,]+(?:\.\d{1,2})?)/);
        if (match) record('delivery', parseFloat(match[1].replace(/,/g, '')));
    }
    for (const node of $$(FEE_SCOPES)) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 500) continue;
        for (const hit of scanFees(text)) record(hit.label, hit.amount);
    }
    return byLabel;
}

// The chip shows in two places: in the buy box, and in the middle column.
// In the middle column, it goes directly after the big price, on the same line.
var FEE_ANCHORS = [
    { selector: '#rightCol .apex-core-price-identifier, #desktop_buybox .apex-core-price-identifier, #buybox .apex-core-price-identifier', place: 'append' },
    { selector: '#centerCol .apex-pricetopay-value, #centerCol .priceToPay', place: 'after' },
];

function feeChipAt(anchor, place) {
    if (place === 'append') return anchor.querySelector(':scope > .az-chip-fee');
    const next = anchor.nextElementSibling;
    return next && next.matches('.az-chip-fee') ? next : null;
}

function showHiddenFees() {
    if (!enabled('showHiddenFees')) return;
    const fees = collectFees();
    if (!fees.size) { removeFeatureNodes('fees'); return; }

    const total = [...fees.values()].reduce((sum, amount) => sum + amount, 0);
    const labels = [...fees.keys()];
    const text = labels.length === 1
        ? `+${formatFee(total)} ${labels[0]} fee`
        : `+${formatFee(total)} in fees (${labels.join(', ')})`;

    for (const { selector, place } of FEE_ANCHORS) {
        const anchor = $(selector);
        if (!anchor) continue;
        let chip = feeChipAt(anchor, place);
        if (chip) {
            if (chip.dataset.text !== text) { chip.textContent = text; chip.dataset.text = text; }
            continue;
        }
        chip = makeChip(text, 'fee', '', 'fees');
        chip.classList.add('az-fee-inline');
        chip.dataset.text = text;
        chip.title = 'Charges that Amazon adds to the listed price';
        if (place === 'append') anchor.append(chip);
        else anchor.insertAdjacentElement('afterend', chip);
    }
}

defineFeature({
    name: 'extra fees',
    keys: ['showHiddenFees'],
    run: showHiddenFees,
    reset() { removeFeatureNodes('fees'); },
});

// ---------- Delivery text in the buy box ----------

// Amazon's line: "₹59 delivery <b>Tuesday, 13 October</b>. Order within 12 hrs. Details".
// A charged delivery: the fee chips show the charge, so the "₹59 delivery" words go.
// All deliveries: the text goes on three lines: "FREE delivery", the date, "Order within ...".
// The date is the important part. Thus, it is bigger.
var DELIVERY_MESSAGES = '[id^="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE"] > span';

function lineBreak() {
    return el('br', { 'data-az-feature': 'delivery-lines' });
}

function tidyDeliveryText() {
    if (!enabled('showHiddenFees')) return;
    for (const message of $$(DELIVERY_MESSAGES)) {
        const date = message.querySelector(':scope > .a-text-bold');
        if (!date || !claim(message, 'azDelivery')) continue;
        date.classList.add('az-delivery-date');

        const leading = [];
        for (let node = message.firstChild; node && node !== date; node = node.nextSibling) leading.push(node);
        const leadText = leading.map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
        if (scanFees(leadText).length) {
            for (const node of leading) hideText(node, 'delivery');
        } else if (leadText) {
            date.before(lineBreak());
        }

        // Keep the full stop at the end of the date line.
        const rest = date.nextSibling;
        if (!rest || !(rest.textContent || '').trim()) continue;
        if (rest.nodeType === Node.TEXT_NODE && rest.textContent.startsWith('.')) rest.splitText(1).before(lineBreak());
        else date.after(lineBreak());
    }
}

defineFeature({
    name: 'delivery text',
    keys: ['showHiddenFees'],
    run: tidyDeliveryText,
    reset() {
        const messages = $$('[data-az-delivery]');
        removeFeatureNodes('delivery-lines');
        showHiddenText('delivery');
        for (const message of messages) message.normalize();
        removeClass('az-delivery-date');
        releaseClaims('azDelivery');
    },
});

// ---------- Coupons ----------

// Auto-apply works only in the first 12 seconds after the page opens, and only one
// time for each coupon. Thus, a coupon that the user removes stays removed.
var COUPON_GRACE_MS = 12000;
var COUPON_TEXT = /\bcoupons?\b|collect coupon|apply .*%|clip .*coupon/i;
var COUPON_ACTION = /collect coupon|clip coupon|apply coupon|apply\s*[₹$]?[\d.,]+\s*(?:%|off)?\s*coupon/i;

// Amazon shows coupons as a checkbox, a "Collect Coupon" link, or a cart box.
// All three have data-csa-c-owner="PromotionsDiscovery".
var COUPON_ROOTS = [
    '[data-csa-c-owner="PromotionsDiscovery"]',
    '#promoPriceBlockMessage_feature_div', '#promoPriceBlockMessage',
    '#couponFeature_feature_div', '#applicablePromotionList_feature_div', '#vpcButton',
].join(', ');

// The 2026 coupon card: "Coupon Discount, Save 5% now" and an "Apply Coupon" button.
// It has scripts inside, so its text is long. Thus, it does not go through the text check.
var COUPON_CARD = '#coupons-card-feature';

function couponBlocks() {
    const found = new Set();
    const card = $(COUPON_CARD);
    if (card && card.querySelector('#coupons-card-apply-button, [id^="coupons-card-heading"]')) found.add(card);
    for (const root of $$(COUPON_ROOTS)) {
        const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 300 || !COUPON_TEXT.test(text)) continue;
        // In the cart, use the box that Amazon draws. On other pages, use the node.
        found.add(root.closest('.a-box-inner') || root);
    }
    // A wrapper and its inner span can both match. Keep only the inner one,
    // so the page does not show a green box in a green box.
    const list = [...found];
    return list.filter(box => !list.some(other => other !== box && box.contains(other)));
}

function couponControl(box) {
    // The card button is an <input> with no text. Thus, the label check below cannot find it.
    const cardButton = box.querySelector('#coupons-card-apply-button .a-button-input, #coupons-card-apply-button');
    if (cardButton) return cardButton;
    const checkbox = box.querySelector('input[type=checkbox]');
    if (checkbox && !checkbox.disabled) return checkbox;
    for (const node of $$('a, button, [role="button"], .a-button-input, .a-declarative', box)) {
        const label = (node.textContent || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        if (label.length < 60 && COUPON_ACTION.test(label)) return node;
    }
    return null;
}

// The coupon card always has a hidden "Coupon Applied" text. Thus, read its status attribute.
function couponIsApplied(box) {
    const status = box.querySelector('[data-couponclippedstatus]');
    if (status) return status.getAttribute('data-couponclippedstatus') === 'true';
    return /collected|applied/i.test(box.textContent || '');
}

function highlightCoupons() {
    if (!enabled('highlightCoupon')) return;
    const autoApply = enabled('autoApplyCoupon') && Date.now() - PAGE_LOAD_AT <= COUPON_GRACE_MS;
    for (const box of couponBlocks()) {
        if (claim(box, 'azCoupon')) box.classList.add('az-coupon');
        if (box.matches(COUPON_CARD)) box.classList.add('az-coupon-card');
        if (!autoApply) continue;
        const control = couponControl(box);
        if (!control) continue;
        if (control.type === 'checkbox' && control.checked) continue;
        if (couponIsApplied(box)) continue;
        // This claim is not released by a reset. Thus, the extension clicks a coupon one time only.
        if (!claim(control, 'azCouponClick')) continue;
        control.click();
        box.classList.add('az-coupon-auto');
    }
}

defineFeature({
    name: 'coupons',
    keys: ['highlightCoupon', 'autoApplyCoupon'],
    run: highlightCoupons,
    reset() { removeClass('az-coupon'); removeClass('az-coupon-auto'); removeClass('az-coupon-card'); releaseClaims('azCoupon'); },
});

// ---------- Section order ----------

// Each entry lists alternative selectors. The first that exists is used.
// The order of the entries is the final order on the page, from top to bottom.
var REORDER_GROUPS = [
    ['#postPurchaseWhatsInTheBox_MP_feature_div', '#whatsInTheBoxDeck'],
    ['#prodDetails', '#productDetails_feature_div', '#detailBullets_feature_div'],
    ['#brandSnapshot_feature_div'],
];

// The moved sections go directly above the first related-products rail.
var SIMS_SELECTOR = '[id^="sims-simsContainer_feature_div"], [id^="DetailPage_sims-container"], #sims-consolidated-2_feature_div, #sims-consolidated-3_feature_div, #similarities_feature_div';

// The start position of each moved node. "Disabled" mode uses it to restore the page.
var originalSpots = new Map();

function firstVisible(selector) {
    for (const node of $$(selector)) {
        if (node.offsetParent !== null || node.getClientRects().length) return node;
    }
    return $(selector);
}

function reorderDetails() {
    if (!enabled('reorderDetails')) return;
    const anchor = firstVisible(SIMS_SELECTOR);
    if (!anchor || !anchor.parentElement) return;

    const nodes = REORDER_GROUPS
        .map(group => group.map(selector => $(selector)).find(Boolean))
        .filter(node => node && node !== anchor && !node.contains(anchor));
    if (!nodes.length) return;

    // If the nodes are already in position, stop. Each move causes a mutation,
    // so a move without need makes an endless loop.
    let cursor = anchor;
    let inPlace = true;
    for (let i = nodes.length - 1; i >= 0; i--) {
        if (cursor.previousElementSibling !== nodes[i]) { inPlace = false; break; }
        cursor = nodes[i];
    }
    if (inPlace) return;

    // Record all start positions before the first move. A move changes the
    // neighbors of the other nodes, and then the restore order is wrong.
    for (const node of nodes) {
        if (!originalSpots.has(node)) {
            originalSpots.set(node, { parent: node.parentElement, prev: node.previousElementSibling, next: node.nextElementSibling });
        }
    }
    for (const node of nodes) anchor.parentElement.insertBefore(node, anchor);
}

function restoreOrder() {
    for (const [node, spot] of originalSpots) {
        if (!spot.parent || !spot.parent.isConnected) continue;
        let before = null;
        if (spot.next && spot.next.parentElement === spot.parent) before = spot.next;
        else if (spot.prev && spot.prev.parentElement === spot.parent) before = spot.prev.nextSibling;
        try { spot.parent.insertBefore(node, before); } catch { /* Amazon removed the parent. */ }
    }
    originalSpots.clear();
}

defineFeature({
    name: 'section order',
    keys: ['reorderDetails'],
    run: reorderDetails,
    reset: restoreOrder,
});
