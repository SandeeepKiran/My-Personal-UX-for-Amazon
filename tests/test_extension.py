"""Smoke tests: load the real extension in Chromium on local copies of Amazon pages.

Run from the project folder:
    python -m pytest tests -q
"""

from __future__ import annotations

import json

import pytest

from harness import ROOT, launch

VERSION = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]


@pytest.fixture(scope="module")
def harness():
    with launch() as h:
        yield h


@pytest.fixture(autouse=True)
def clean_storage(harness):
    harness.reset_storage()
    yield
    for page in harness.context.pages:
        page.close()


# ---------- Popup ----------

def test_popup_groups_settings_by_amazon_area(harness):
    popup = harness.popup()
    popup.locator("#tab-settings").click()
    titles = popup.locator(".az-group-title").all_inner_texts()
    assert titles == [
        "Search results", "Product page: price and offers", "Product page: helpers",
        "Product page: clutter", "Add to cart and cart", "Top bar",
    ]
    assert popup.locator(".az-switch").count() == 24


def test_popup_footer_shows_version_then_credit(harness):
    footer = harness.popup().locator(".az-foot")
    assert footer.locator(".az-version").inner_text() == f"v{VERSION}"
    assert footer.locator(".az-made").inner_text() == "Made with ❤️ by Mousy!"


def test_popup_change_reaches_open_page(harness):
    page = harness.open("/dp/B0MOUSY001")
    assert page.locator('[data-az-feature="seller"]').count() == 1
    popup = harness.popup()
    popup.locator("#tab-settings").click()
    popup.locator('[data-az-key="showSellerBadge"]').click()
    page.wait_for_timeout(600)
    assert page.locator('[data-az-feature="seller"]').count() == 0


# ---------- Product page ----------

def test_product_page_features(harness):
    page = harness.open("/dp/B0MOUSY001")
    assert page.locator('[data-az-feature="seller"]').inner_text().startswith("Third-party seller: Mousy Traders")
    assert page.locator(".az-chip-fee").all_inner_texts() == ["+₹40 delivery fee"] * 2
    assert page.locator("#az-pricehistory").inner_text() == "Keepa"
    assert page.locator("#az-pricehistory-alt").count() == 1
    assert page.locator("#az-reviews .az-rating-value").inner_text() == "4.3"
    assert page.locator("#promoPriceBlockMessage_feature_div").get_attribute("class").count("az-coupon") >= 1
    assert page.locator("#promoPriceBlockMessage_feature_div input").is_checked()
    assert not page.locator("#availability span").is_visible()
    assert not page.locator("#sims-simsContainer_feature_div_01").is_visible()
    assert not page.locator("#inemi_feature_div").is_visible()


def test_account_menu_uses_name_and_safe_wishlists(harness):
    page = harness.open("/dp/B0MOUSY001")
    assert page.locator("#az-account-greeting").inner_text() == "Hello, Mousy"
    page.wait_for_selector('#az-dynamic-wishlists[data-synced="1"]', state="attached")
    # The dropdown is hidden until hover. Thus, read text_content, not inner_text.
    names = page.locator("#az-dynamic-wishlists .az-wl-name").all_text_contents()
    assert names[:2] == ["Mousy's Wishlist", "Mousy's Gift Ideas"]
    hrefs = page.locator("#az-dynamic-wishlists a").evaluate_all("links => links.map(a => a.getAttribute('href'))")
    assert all(href.startswith("/hz/wishlist/ls/MOUSYLIST") for href in hrefs)


def test_explore_menu_has_no_amazon_fresh(harness):
    page = harness.open("/dp/B0MOUSY001")
    links = page.locator("#az-nav-wrap a").all_text_contents()
    assert "Amazon Now" in links
    assert "Amazon Fresh" not in links
    assert not page.locator("#nav-main").is_visible()


def test_page_is_quiet_after_load(harness):
    """Our own DOM changes must not start new runs. Count mutations for 2 seconds."""
    page = harness.open("/dp/B0MOUSY001")
    page.wait_for_timeout(1000)
    count = page.evaluate("""() => new Promise(resolve => {
        let n = 0;
        const observer = new MutationObserver(records => { n += records.length; });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        setTimeout(() => { observer.disconnect(); resolve(n); }, 2000);
    })""")
    assert count == 0


# ---------- Panel and modes ----------

def test_alt_a_opens_panel_and_disabled_mode_removes_everything(harness):
    page = harness.open("/dp/B0MOUSY001")
    page.keyboard.press("Alt+KeyA")
    assert page.locator("#az-panel").is_visible()
    assert page.locator("#az-panel .az-made").inner_text() == "Made with ❤️ by Mousy!"
    page.locator('#az-panel input[value="off"]').check()
    page.wait_for_timeout(500)
    assert page.locator(".az-chip, [data-az-feature]").count() == 0
    assert page.evaluate("document.documentElement.getAttribute('data-az')") == "off"
    assert page.locator("#nav-main").is_visible()


def test_panel_groups_collapse_and_stay_collapsed(harness):
    page = harness.open("/dp/B0MOUSY001")
    page.locator("#az-fab").click()
    page.locator("#az-tab-settings").click()
    page.locator('#az-panel .az-group[data-group="search"] > summary').click()
    page.wait_for_timeout(300)
    page = harness.open("/dp/B0MOUSY001", page)
    page.locator("#az-fab").click()
    page.locator("#az-tab-settings").click()
    assert page.locator('#az-panel .az-group[data-group="search"]').get_attribute("open") is None
    assert page.locator('#az-panel .az-group[data-group="price"]').get_attribute("open") is not None


# ---------- Search ----------

def test_search_results(harness):
    page = harness.open("/s?k=mousy+coffee")
    assert not page.locator("#card-sponsored").is_visible()
    assert page.locator("#card-coffee .az-chip-unit").inner_text() == "₹89.90 / 100 g"
    assert page.locator("#card-oatmilk .az-chip-unit").inner_text() == "₹24.90 / 100 ml"
    assert page.locator("#card-oatmilk .az-chip-warn").inner_text() == "Only 37 ratings"
    assert page.locator("#card-filters .az-chip-unit").inner_text() == "₹1.80 / piece"


# ---------- Cart and cashback ----------

def test_cashback_tracks_items_added_during_session(harness):
    page = harness.open("/dp/B0MOUSY001?tag=mousy-21")
    assert page.locator("#az-aff-pill").inner_text().startswith("Cashback on")
    page.locator("#add-to-cart-button").click()
    page.wait_for_timeout(300)
    cart = harness.open("/gp/cart/view.html", page)
    banner = cart.locator("#az-cashback")
    assert "1 tracked" in banner.inner_text()
    assert "1 not tracked" in banner.inner_text()
    assert "az-some" in banner.get_attribute("class")
    fee = cart.locator(".az-cart-fee")
    assert fee.count() == 1
    assert fee.inner_text().startswith("₹40 delivery")
