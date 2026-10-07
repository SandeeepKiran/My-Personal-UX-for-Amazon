# Testing

## 1. What you need

- Python 3.11 with `pytest` and `playwright`
- Playwright Chromium (`python -m playwright install chromium`)
- Node.js, only for `npx web-ext lint`

## 2. Run the tests

```powershell
python -m pytest tests -q
```

The tests take about 30 seconds. No window opens. The harness uses
`channel="chromium"`, which is the new headless mode. The old headless mode cannot load
extensions. Do not remove that line.

## 3. How the tests work

`tests/harness.py` does these steps:

1. Start Chromium with `--load-extension` (this folder).
2. Send each request for `https://www.amazon.in/...` to a local file in `tests/fixtures/`.
3. Block all other network traffic. Thus, the tests never go to the real Amazon.
4. Open the popup at `chrome-extension://<id>/src/popup/popup.html`.

The test pages are small copies of Amazon pages. They use the same ids and classes
as Amazon, and they use Mousy test data:

| Path | File | Contents |
|---|---|---|
| `/dp/B0MOUSY001` | `product.html` | Mousy Cold Brew Coffee Beans, ₹899, ₹40 delivery, coupon, rails |
| `/s?k=mousy+coffee` | `search.html` | 2 sponsored + 7 Mousy products |
| `/gp/cart/view.html` | `cart.html` | 2 items, one with a ₹40 delivery charge |
| `/hz/wishlist/ls` | `wishlist.html` | Mousy's Wishlist, Mousy's Gift Ideas, a bad `javascript:` link |

All pages include `nav.html` ("Hello, Mousy") and `mock.css`.

## 4. The tests

| Test | It checks that… |
|---|---|
| `test_popup_groups_settings_by_amazon_area` | the popup has 6 groups and 24 switches |
| `test_popup_footer_shows_version_then_credit` | the footer shows `v5.0.0`, then "Made with ❤️ by Mousy!" |
| `test_popup_change_reaches_open_page` | a switch in the popup changes an open page |
| `test_product_page_features` | the seller, fee, history, reviews and coupon features work |
| `test_account_menu_uses_name_and_safe_wishlists` | the menu shows "Mousy" and drops the `javascript:` link |
| `test_explore_menu_has_no_amazon_fresh` | Amazon Fresh is not in the Explore menu |
| `test_page_is_quiet_after_load` | the extension makes 0 page changes when nothing happens |
| `test_alt_a_opens_panel_and_disabled_mode_removes_everything` | Alt+A works, and Disabled removes all changes |
| `test_panel_groups_collapse_and_stay_collapsed` | a folded group stays folded after a reload |
| `test_search_results` | unit prices and "few ratings" are correct |
| `test_cashback_tracks_items_added_during_session` | Add to Cart during a session marks the item |

## 5. Manual checks before a release

The test pages are copies. Amazon changes its real pages often. Do these checks on
the real sites before a release:

1. Load the extension in Chrome, Edge and Firefox (see the README).
2. Open a product page on amazon.in. Make sure that the fee chip, coupon, Keepa button
   and reviews button show.
3. Open a search page. Make sure that sponsored results are gone and unit prices show.
4. Add an item to the cart. Open the cart. Make sure that the delivery charge is red.
5. Push Alt+A. Set the mode to Disabled. Make sure that the page is normal Amazon.
6. Do steps 2 and 3 again on amazon.com.

## 6. Firefox lint

```powershell
python tools/build.py
npx web-ext lint --source-dir dist/firefox
```

The result must be 0 errors and 0 warnings.
