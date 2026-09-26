# Amazon — My Personal UX (v3.7.0)

Declutters Amazon, enlarges text, strips dark patterns, adds price-per-unit, seller badges, bank offers, cashback session tracking, and a refined navigation experience. Ported from the Amazon-Gemini TamperMonkey userscript (v2.2.0).

Works on **Chrome, Edge, and Firefox** from this one folder. Runs on **amazon.in** and **amazon.com** (India-only features — CashKaro watch, bank offers, EMI hiding — auto-disable on .com).

## Install

### Chrome
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `amazon-gemini` folder

### Edge
1. Open `edge://extensions`
2. Turn on **Developer mode** (left sidebar)
3. Click **Load unpacked** and select this folder

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** and select `manifest.json` inside this folder

Note: Firefox temporary add-ons are removed on browser restart. For a permanent Firefox install, the extension needs to be signed via [addons.mozilla.org](https://addons.mozilla.org) (free, can be unlisted/self-distributed).

Chrome/Edge may show a harmless warning about `browser_specific_settings` — that key is for Firefox and is safely ignored.

If your Firefox version doesn't support background service workers, everything still works — the popup keeps the toolbar badge current instead. Alternatively, change the `background` block in `manifest.json` to `{ "scripts": ["background.js"] }` for Firefox.

## Usage

- **Toolbar icon** — badge shows the active mode (ON = Simple, OFF). Click for the settings popup.
- **In-page controls** — the floating button (bottom-right) or **Alt+A** opens the same settings on the page.
- Settings **sync across devices** via your browser profile (`chrome.storage.sync`), and changes apply to open Amazon tabs live — no reload needed.

## Changes in v3.7.0

- **New: cart charges are highlighted.** Amazon prints `₹64.96 delivery Thu, 13 Aug` at the same size and weight as everything around it, so the amount reads as part of the date. Delivery, shipping, handling, packaging, service and installation charges in the cart now get a larger, bolder, pastel-red treatment. The pattern is amount-then-keyword, so *FREE delivery* is never flagged, and the font family is left alone. Part of the existing **Warn about extra fees** toggle.
- **New: a Cashback link block in the Modes view**, in both the toolbar popup and the in-page panel. It names the affiliate tag currently credited with your visit — whether that came from CashKaro or from a YouTube description — with the time left, or says nothing is tracking and offers one-click links to the cashback aggregators for your Amazon domain (CashKaro and EarnKaro on .in, Rakuten and TopCashback on .com).
- **Fixed: a closed browser no longer counts as a live cashback session.** The banner used to judge the session on elapsed time alone, so re-opening the browser the next morning still read *Cashback on · 23h*. The extension now stamps each session with a per-browser-run id kept in `chrome.storage.session`, which the browser wipes on shutdown. A session from an earlier run is reported as **unverified** (blue) rather than live or dead — affiliate cookies sometimes survive a restart, so claiming either way would be a guess. Items added to the cart in that earlier run get the same treatment and are listed under *Unverified*. Requires the background worker to widen `storage.session` access; where that API is unavailable (Firefox), the old time-only behaviour is kept.
- **Fixed: dismissing the cashback banner hid it permanently.** On the cart page the **✕** now lasts only for that page view, so re-opening the cart shows the banner again. Elsewhere it still stays hidden until a new session starts.
- **The cashback pill is now a button.** Click it to bring a dismissed banner back — previously there was no way back.
- **The breakdown dropdown surfaces tracked items too.** The summary reads *Show 8 untracked · 1 tracked* instead of only counting the failures.
- **Fixed: the nav gutter patch drifted out of line with the banner.** The patch that paints over the reclaimed cart-rail gutter was pinned to `top: 0`, but the banner sits above the nav bar and pushes it down. It is now measured from the nav bar's actual position, so it stays aligned as the banner appears and disappears.
- **Fixed: the reclaimed gutter was always white.** It was hardcoded to `#fff`, which looked correct on product pages and left a white stripe on the grey cart page. The gutter now shows the page's own background, so it matches everywhere.
- **Fixed: Amazon Now and Fresh Meat in the Explore menu were dead links.** `/now` and `/meat` do not resolve; both now point at the real amazon.in storefronts.

## Changes in v3.6.0

- **Fixed: coupons were never detected.** The scan looked for a checkbox, but Amazon now renders most coupons as a **"Collect Coupon" link** instead. All three variants — the `Apply ₹x coupon` checkbox, the Collect Coupon link, and the cart-page promotion box — share the marker `data-csa-c-owner="PromotionsDiscovery"`, so that is the hook now. Nested matches are de-duplicated to the innermost, so you never get a green box inside a green box. Already-collected and already-ticked coupons are left alone.
- **Cart coupons** are detected and highlighted too, not just product pages.
- **Cashback banner now tracks individual cart items.** When you Add to Cart during a live affiliate session, that ASIN is marked. On the cart page the banner turns **green** (all tracked), **yellow** (some) or **red** (none), and a dropdown on the right lists exactly which items will and will not earn — kept in a dropdown so the bar stays one line. An **✕** hides it; it reappears automatically when a new affiliate session starts. Marks expire after 24 hours.
- **Affiliate state at a glance:** a pastel pill beside the settings button reads *Cashback on · 21h* or *No cashback*.
- **Explore menu:** Amazon Fresh green, Amazon Now blue, Fresh Meat red, Amazon Pay yellow — all pastel, only those four.
- **Account menu:** the default wish list now has a pastel pink row, and *Support Center* is renamed *Support — Center* for consistency.

## Changes in v3.5.0

- **Fixed: the delivery fee was never detected.** Amazon suffixes the delivery block id per slot (`mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE`), so the exact-id lookup matched nothing. Now prefix-matched — and the charge is read primarily from `data-csa-c-delivery-price`, which states it as an attribute rather than prose.
- **Fee chip now appears twice:** inline to the right of the price, and under the price block.
- **Two trackers side by side**, each in its own brand colour — **Keepa** in orange, **Price History** in their purple with a green edge (both taken from PriceHistory's own logo SVG; Keepa's orange is approximated since their assets block cross-origin reads).
- **Reviews button** moved off navy to a pastel amber with dark text — much higher contrast, and the warm tone matches the stars.
- **Coupons** are outlined in green and enlarged, and ticked automatically on load. Auto-apply only ever fires once per checkbox within the first 10 seconds, so a coupon you deliberately switch off is never re-ticked. Both behaviours have their own toggle.

## Changes in v3.4.0

- **Price history fixed.** The old link (`pricehistoryapp.com/search?q=<ASIN>`) was a dead route — that path returns a 404. PriceHistory has no ASIN deep link at all: its product slugs are title-derived with a random suffix, and the only resolver is a private endpoint its own page calls. So there are now two buttons: **Check price history** opens Keepa directly (`keepa.com/#!product/10-<ASIN>` for `.in`, `1-` for `.com`), and **PriceHistory ⧉** copies the clean `/dp/<ASIN>` URL and opens their site for a paste. No third-party host permissions, and nothing about what you browse is sent anywhere.
- **Reviews button** restructured into three lines: *Check Review Section*, then the rating with five stars, then the review count. Rating and count numerals are enlarged.
- **New: extra-fee warning.** A red `+₹40 delivery fee` chip under the price when Amazon adds delivery, shipping, handling, service, installation, assembly, convenience, packaging, import or customs charges. Multiple charges are summed and listed. "FREE delivery", promo thresholds ("free shipping over ₹499") and plain prices are all correctly ignored.
- **Nav bar gutter** is painted over when the cart rail is hidden, so the top bar looks continuous instead of cut off at a white strip.
- **Price padding** fixed — the currency symbol no longer collides with the digits, and the price has room above and below.
- Scoped strictly to Amazon: empty `host_permissions`, content script limited to `www.amazon.in` and `www.amazon.com`, and excluded from `/ap/*` sign-in pages.

## Changes in v3.3.0

- Renamed to **Amazon — My Personal UX**. The second mode is now labelled **Disabled** (the toolbar badge still reads `OFF`, which is the practical limit for badge text).
- **Account dropdown rebuilt.** "Private" / "Shared" wording replaced with a lock / unlock icon, "Default List" replaced with a heart. Headers are now **Wishlists** and **Account — &lt;name&gt;**, with the name scraped live from Amazon's nav (never hardcoded) and refreshed if the nav populates late. The greeting button is larger and stays on one line.
- **New Customer Support section** in that dropdown: Support Center, Support — Chat, Message Center — Seller. All three are relative links with no tracking or account parameters, so they work on `.in` and `.com` for any signed-in user.
- **Reviews button** reworked: no more `((351))`. "Check reviews" is the headline with a live *rating · N global reviews* sub-line, and the button is bigger.
- **Cart rail no longer shifts the page.** We keep Amazon's reserved right gutter instead of zeroing it, so hiding the rail causes no reflow.
- **Bigger buy-box price** (toggleable), scoped tightly to `#corePriceDisplay_desktop_feature_div`.
- **Removed:** the Feedback block inside Product information, search-page `AdHolder` strips and left/right skyscraper ad placements.
- **Dropped** the one-result-per-row search layout — it fought Amazon's grid and broke the results page.
- Changes are now tracked in a local **git** repository in this folder.

## Changes in v3.2.0

- **Power mode removed.** It was Simple minus a handful of rules, which made the two indistinguishable in practice. Everything Power did now lives in Simple; the only modes are **Simple** and **Off**. Anyone still on `power` is migrated to `simple` automatically.
- **Fixed: the price block was being deleted.** The whole `apex_dp_center_column` slot was hidden, which took the price, deal badge and buy box with it. Only the individual junk rows inside it are hidden now — EMI, delivery-price badging, VAT message, the Rufus "Price history" link, the B2B/Amazon Business upsell and the partner offer box.
- **New:** hides the "Videos for this product" rail and the "Brands in this category on Amazon" rail.
- **New:** a **Check reviews** button next to Check price history — it reuses Amazon's own review-count link (`#acrCustomerReviewLink`), with a scroll fallback. The count is read live, never hardcoded.
- **New:** *Specs before recommendations* — moves What's in the box → Product information → the brand/Top Brand card together, directly above the first related-products rail. Switching to Off puts the page back exactly as it was.

Every new behaviour has its own toggle in Settings, and all selectors have text-content fallbacks since Amazon A/B tests its DOM.

## What changed from the userscript

- `GM_setValue/GM_getValue` → `chrome.storage.sync` (settings, synced) + `chrome.storage.local` (affiliate-tag session, cart-rail state)
- `GM_registerMenuCommand` → toolbar popup
- CSS injected via the manifest at `document_start` — zero flash of unstyled Amazon
- **Fixes:** account menu greeting now scrapes your real name from Amazon's nav (was hardcoded); wishlist names inserted via `textContent` (removed an HTML-injection vector); cashback banner removes itself when toggled off; Subscribe & Save auto-unselect only acts in the first 4 s after page load so it never fights a deliberate choice; toggling a feature off now cleans up its chips/badges live
- **amazon.com support:** price parsing handles `$`, price-history button uses camelcamelcamel on .com, Explore menu shows .com-appropriate links

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest (Chrome/Edge/Firefox) |
| `content.js` | Main logic, runs on Amazon pages |
| `content.css` | All styling, injected at document_start |
| `popup.html/js/css` | Toolbar popup |
| `background.js` | Badge (ON/OFF) sync |
| `icons/` | Extension icons |
