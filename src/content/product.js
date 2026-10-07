// My Personal UX for Amazon: product page.
// Features: seller badge, clutter removal, EMI and bank offers, price history and
// reviews buttons, bigger price, extra-fee warning, coupons, and section order.
'use strict';

// ---------- Seller ----------

function annotateSeller() {
    if (!enabled('showSellerBadge')) return;
    const buyBox = $('#desktop_buybox, #buybox, #rightCol');
    if (!buyBox || !claim(buyBox, 'azSeller')) return;
    const sellerEl = $('#sellerProfileTriggerId') || $('#merchant-info a') || $('#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"] span');
    const name = sellerEl ? sellerEl.textContent.trim() : '';
    if (!name) return;
    // Cloudtail and Appario are Amazon's own seller companies in India.
    const isAmazon = /amazon|cloudtail|appario/i.test(name);
    const chip = isAmazon
        ? makeChip(`Sold by ${name}`, 'good', '', 'seller')
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

function showBankOffers() {
    if (!enabled('showBankOffers')) return;
    const host = $('#promotions_feature_div, #applicable_promotion_list_sec, #itembox-InstantBankDiscount');
    if (!host || !claim(host, 'azBank')) return;
    const offers = [...new Set($$('.offers-items-content, .a-list-item, .a-truncate-full, .a-section', host)
        .map(node => (node.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(text => text.length > 20 && text.length < 300 && /bank offer|cashback|instant discount|% off on/i.test(text)))];
    if (!offers.length) return;

    const cards = settings.myCards.split(',').map(card => card.trim().toLowerCase()).filter(Boolean);
    const mine = offers.filter(offer => cards.some(card => offer.toLowerCase().includes(card)));
    const box = el('div', { 'data-az-feature': 'bank' });
    if (cards.length && mine.length) {
        for (const offer of mine) box.append(makeChip(`Your card: ${offer}`, 'good', '', 'bank'));
    } else if (cards.length) {
        box.append(makeChip('No bank offer for your cards', 'warn', `(${offers.length} offer${offers.length === 1 ? '' : 's'} for other cards)`, 'bank'));
    } else {
        for (const offer of offers.slice(0, 3)) box.append(makeChip(offer, 'good', '', 'bank'));
    }
    ($('#corePrice_feature_div') || $('#apex_desktop') || host).insertAdjacentElement('afterend', box);
}

defineFeature({
    name: 'bank offers',
    keys: ['showBankOffers', 'myCards'],
    run: showBankOffers,
    reset() { releaseClaims('azBank'); removeFeatureNodes('bank'); },
});

// ---------- Buy box buttons: price history and reviews ----------

function currentAsin() {
    const fromUrl = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (fromUrl) return fromUrl[1].toUpperCase();
    const input = $('#ASIN, input[name="ASIN"]');
    return input && /^[A-Z0-9]{10}$/i.test(input.value) ? input.value.toUpperCase() : null;
}

// The price history and reviews buttons share one row below the price.
function actionsRow() {
    const existing = $('#az-actions');
    if (existing && existing.isConnected) return existing;
    const target = $('#corePrice_feature_div') || $('#apex_desktop');
    if (!target) return null;
    const row = el('div', { id: 'az-actions', 'data-az-feature': 'actions' });
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
    keys: ['priceHistoryButton'],
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
    keys: ['reviewsButton'],
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

// The chip shows in two places: next to the price, and below the price block.
var FEE_ANCHORS = [
    { selector: '.apex-core-price-identifier', cls: 'az-fee-inline' },
    { selector: '#corePriceDisplay_desktop_feature_div', cls: 'az-fee-block' },
];

function showHiddenFees() {
    if (!enabled('showHiddenFees')) return;
    const fees = collectFees();
    if (!fees.size) { for (const chip of $$('.az-chip-fee')) chip.remove(); return; }

    const total = [...fees.values()].reduce((sum, amount) => sum + amount, 0);
    const labels = [...fees.keys()];
    const text = labels.length === 1
        ? `+${formatFee(total)} ${labels[0]} fee`
        : `+${formatFee(total)} in fees (${labels.join(', ')})`;

    for (const { selector, cls } of FEE_ANCHORS) {
        const anchor = $(selector);
        if (!anchor) continue;
        let chip = anchor.querySelector(':scope > .az-chip-fee');
        if (chip) {
            if (chip.dataset.text !== text) { chip.textContent = text; chip.dataset.text = text; }
            continue;
        }
        chip = makeChip(text, 'fee', '', 'fees');
        chip.classList.add(cls);
        chip.dataset.text = text;
        chip.title = 'Charges that Amazon adds to the listed price';
        anchor.append(chip);
    }
}

defineFeature({
    name: 'extra fees',
    keys: ['showHiddenFees'],
    run: showHiddenFees,
    reset() { for (const chip of $$('.az-chip-fee')) chip.remove(); },
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

function couponBlocks() {
    const found = new Set();
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
    const checkbox = box.querySelector('input[type=checkbox]');
    if (checkbox && !checkbox.disabled) return checkbox;
    for (const node of $$('a, button, [role="button"], .a-button-input, .a-declarative', box)) {
        const label = (node.textContent || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        if (label.length < 60 && COUPON_ACTION.test(label)) return node;
    }
    return null;
}

function highlightCoupons() {
    if (!enabled('highlightCoupon')) return;
    const autoApply = enabled('autoApplyCoupon') && Date.now() - PAGE_LOAD_AT <= COUPON_GRACE_MS;
    for (const box of couponBlocks()) {
        if (claim(box, 'azCoupon')) box.classList.add('az-coupon');
        if (!autoApply) continue;
        const control = couponControl(box);
        if (!control) continue;
        if (control.type === 'checkbox' && control.checked) continue;
        if (/collected|applied/i.test(box.textContent || '')) continue;
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
    reset() { removeClass('az-coupon'); removeClass('az-coupon-auto'); releaseClaims('azCoupon'); },
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
