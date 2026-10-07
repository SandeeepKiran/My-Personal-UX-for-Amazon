# Known risks and lessons

Amazon changes its pages often. These notes tell you what broke before, so it does not
break again. Read them before you change a feature.

## 1. Selectors break

Amazon changes its ids and classes every few months. Expect to fix one or two selectors
each year. Each feature keeps its selectors at the top of its block, in the file for its
part of Amazon (see the map in `AGENTS.md`).

When a feature stops working on the real site:

1. Open the page. Push `F12` and look at the **Console**.
2. Find the line `[My Personal UX] <feature name> failed:`. Each feature runs in `safely()`,
   so one broken feature does not stop the others.
3. Find the new id or class in **Elements**. Add it to the selector list. Keep the old one,
   because Amazon tests two page versions at the same time.
4. Change the test page in `tests/fixtures/` so that it uses the new markup too.

Prefer a stable mark to an exact id:

| Feature | Stable mark | Lesson |
|---|---|---|
| Delivery fee | the attribute `data-csa-c-delivery-price` | The block id has a suffix for each slot. Use a prefix match: `[id^="mir-layout-DELIVERY_BLOCK"]` (fixed in 3.5.0). |
| Coupons | `[data-csa-c-owner="PromotionsDiscovery"]` | Most coupons are a "Collect Coupon" link, not a checkbox. The mark is on all three types (fixed in 3.6.0). |
| Rails | the heading text | Rail ids change. The heading text changes less. Skip boxes that contain `#keepaContainer` or `[id^="keepa"]`. |

## 2. Do not do these things

- **Do not hide the whole `apex_dp_center_column` slot.** It contains the price and the
  buy box. Version 3.2.0 hid it and removed the price. Hide only the rows inside it.
- **Do not change cart contents, checkout, payment or account actions.** The extension
  must only read and show. It does not run on checkout pages.
- **Do not trust page text.** Wishlist names and the account name come from the page.
  Put them in with `textContent` only.

## 3. Cashback logic is easy to get wrong

- **24 hours is not enough.** A browser restart ends the session, even if less than
  24 hours went by. The browser run id (`storage.session`) finds this. A session from an
  earlier run shows as **unverified** (blue), not live or dead (fixed in 3.7.0).
- **A reload is not a new click.** `isFreshClickThrough()` (`cashback.js`) uses the
  Navigation Timing type and `document.referrer`. A reload or a restored tab must not
  start a new session. Some cashback redirect pages send no referrer. Read the comments
  in that function before you change it.
- **PriceHistory has no link by ASIN.** The old `search?q=<ASIN>` link gives a 404. The
  button copies the product link and opens the site (since 3.4.0).

## 4. Test safely on the real site

1. Do not place, change or cancel a real order. You can add a cheap item to the cart to
   test Add to Cart tracking and the protection plan pop-up. Stop before checkout.
2. To test the cashback watch, open a product link with `?tag=mousy-21` at the end.
   Then open the cart with an item that you added before the tag.
3. After each change, set the mode to **Disabled**. Make sure that the page is normal
   Amazon, with no chips, classes or added elements.
