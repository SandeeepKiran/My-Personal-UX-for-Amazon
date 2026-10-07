# Settings map

The list in `src/shared/settings.js` (`GROUPS`) is the only source. This page is a copy
for people. Change both when you add or change a setting.

All switches are on by default. "IN" means amazon.in only.

## 🔍 Search results

| Key | Label | Feature (file) |
|---|---|---|
| `hideSponsored` | Hide sponsored results | search results, search ads (`search.js`) |
| `showUnitPrice` | Show price per unit | search results (`search.js`) |
| `flagFewReviews` | Flag few ratings (fewer than 50) | search results (`search.js`) |

## 🏷️ Product page: price and offers

| Key | Label | Feature (file) |
|---|---|---|
| `biggerPrice` | Bigger price | bigger price (`product.js`) |
| `showHiddenFees` | Warn about extra fees | extra fees (`product.js`), cart fees (`cart.js`) |
| `highlightCoupon` | Highlight coupons | coupons (`product.js`) |
| `autoApplyCoupon` | Apply coupons automatically | coupons (`product.js`) |
| `showBankOffers` (IN) | Show bank offers | bank offers (`product.js`) |
| `hideEmi` (IN) | Hide EMI options | emi (`product.js`) |
| `myCards` (text) | My cards — bank names, comma between | bank offers (`product.js`) |

## 🧰 Product page: helpers

| Key | Label | Feature (file) |
|---|---|---|
| `showSellerBadge` | Show the seller | seller badge (`product.js`) |
| `priceHistoryButton` | Price history buttons (Keepa, PriceHistory) | price history (`product.js`) |
| `reviewsButton` | Reviews button | reviews button (`product.js`) |

## 🧹 Product page: clutter

| Key | Label | Feature (file) |
|---|---|---|
| `stripUrgency` | Remove urgency text | urgency (`product.js`) |
| `hideCarousels` | Hide recommendation rails | carousels (`product.js`) |
| `hideProductVideos` | Hide the video rail | product videos (`product.js`) |
| `hideBrandCarousel` | Hide the brand rail | brand rail (`product.js`) |
| `hideFeedbackBlock` | Hide the Feedback block | feedback block (`product.js`) |
| `reorderDetails` | Specs before recommendations | section order (`product.js`) |

## 🛒 Add to cart and cart

| Key | Label | Feature (file) |
|---|---|---|
| `fixSubscribeSave` | Choose one-time purchase | subscribe and save (`cart.js`) |
| `dismissWarranty` | Decline protection plans | protection plans (`cart.js`) |
| `ewcCollapse` | Fold the cart side panel | cart side panel (`cart.js`) |
| `cashkaroWatch` (IN) | Cashback watch | cashback banner (`cashback.js`) |

## 🧭 Top bar

| Key | Label | Feature (file) |
|---|---|---|
| `customAccountMenu` | Clean Account menu | account menu (`navbar.js`) |
| `hideNavExtras` | Explore menu | explore menu (`navbar.js`) |

## How to add a setting

1. Add a row `[key, label, hint]` to the correct group in `GROUPS`. For amazon.in only,
   add `true` as the fourth value.
2. In the feature, read the setting with `enabled('key')`.
3. Add the key to the `keys` list of the feature, so a change resets the feature.
4. Add a row to this page.
5. Update the switch count in `tests/test_extension.py` (now 24).
6. Run the tests.
