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
    assert popup.locator(".az-switch").count() == 31


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
    assert page.locator(".az-chip-fee").all_inner_texts() == ["+₹40 delivery fee"]
    assert page.locator("#az-pricehistory").inner_text() == "Keepa"
    assert page.locator("#az-pricehistory-alt").count() == 1
    assert page.locator("#az-reviews .az-rating-value").inner_text() == "4.3"
    assert page.locator("#promoPriceBlockMessage_feature_div").get_attribute("class").count("az-coupon") >= 1
    assert page.locator("#promoPriceBlockMessage_feature_div input").is_checked()
    assert not page.locator("#availability span").is_visible()
    assert not page.locator("#sims-simsContainer_feature_div_01").is_visible()
    assert not page.locator("#inemi_feature_div").is_visible()


def test_product_page_2026_layout(harness):
    """The 2026 Amazon layout: seller card, buy box price, coupon card, offers carousel, trust icons."""
    page = harness.open("/dp/B0MOUSY010")
    # The brand (MousyLatest) and the seller (Mousy Latest) are the same.
    assert page.locator('[data-az-feature="seller"]').inner_text().startswith("Sold by the brand: Mousy Latest")
    # A company of the brand ("Mousy Innovations Pvt Ltd") is the brand too.
    page.evaluate("""() => {
        document.querySelector('[data-az-feature="seller"]').remove();
        delete document.querySelector('#desktop_buybox, #buybox, #rightCol').dataset.azSeller;
        document.querySelector('#bylineInfo').textContent = 'Visit the MousyLatest Store';
        document.querySelector('#merchant-trust-info-card').textContent = 'MousyLatest Innovations Pvt Ltd';
    }""")
    page.wait_for_timeout(400)
    assert page.locator('[data-az-feature="seller"]').inner_text().startswith("Sold by the brand: MousyLatest Innovations")
    assert page.locator(".az-chip-fee").all_inner_texts() == ["+₹59 delivery fee"] * 2
    # The middle column chip is on the same line as the big price.
    assert page.locator("#centerCol .apex-pricetopay-value + .az-chip-fee").count() == 1
    # The chips show the fee. Thus, the buy box shows only the date and the order time.
    delivery = page.locator("#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE").inner_text()
    assert delivery.splitlines() == ["Tuesday, 13 October.", "Order within 12 hrs 42 mins. Details"]
    # Minimal Product UI is on by default: the buttons go below the main price, then the offers.
    assert page.locator("#centerCol #az-actions #az-pricehistory").count() == 1
    assert page.locator("#centerCol #az-actions #az-reviews").count() == 1
    assert page.evaluate("window.mousyCouponClicks") == 1
    assert "az-coupon" in page.locator("#coupons-card-feature").get_attribute("class")
    # The cashback summary stays. The bank offers come from the "See all offers" panel.
    bank = page.locator("#az-bank .az-chip").all_inner_texts()
    assert bank[0].startswith("3 cashback offers available")
    assert bank[1].startswith("Mousy Bank Credit Card: 10% Instant Discount")
    assert bank[2].startswith("HDFC Bank Debit Card: ₹75 cashback")
    # The delivery date is bigger than the text around it.
    assert page.locator(".az-delivery-date").evaluate("n => getComputedStyle(n).fontSize") == "18px"
    assert not page.locator("#abbWrapper").is_visible()
    assert not page.locator("#iconfarmv2_feature_div").is_visible()
    # Amazon's own "Offers" heading and summary card repeat the blue chip. "See all offers" stays.
    assert not page.locator("#offersHeader_feature_div").is_visible()
    assert not page.locator("#smx-secondary-view-id").is_visible()
    assert page.locator("#cardification-secondary-view-id").is_visible()
    # Clutter: Amazon's own ads, the bundle, the rails and the brand blocks go. The other tabs stay.
    for hidden in ("#desktop-dp-ilm_feature_div_0", "#heroQuickPromo_feature_div", "#sims-productBundle_feature_div_0",
                   "#sims-simsContainer_feature_div_0", "#sims-simsContainer_feature_div_1",
                   "#aplusBrandStory_feature_div", ".btfSubNavDesktopFromTheBrandTab", "#brandSnapshot_feature_div",
                   "#sp_detail_mousy"):
        assert not page.locator(hidden).is_visible(), hidden
    assert page.locator(".btfSubNavDesktopReviewsTab").is_visible()


def test_rails_are_found_by_page_structure(harness):
    """Rails with new names go too. The product content and the blocks with their own switch stay."""
    page = harness.open("/dp/B0MOUSY020")
    for hidden in ("#sims-simsContainer_feature_div_0", "#sims-sponsoredProducts2_feature_div_0",
                   '#rhf [data-cel-widget="p13n-desktop-carousel_desktop-rhf_0"]',
                   # These two have their own switches, which are on by default.
                   "#sims-productBundle_feature_div_0", "#sims-discoveryAndInspiration_feature_div_0"):
        assert not page.locator(hidden).is_visible(), hidden
    for shown in ("#vsxoffers_feature_div", "#productDescription_feature_div", "#productDetails_feature_div",
                  "#customer-reviews_feature_div"):
        assert page.locator(shown).is_visible(), shown


def test_clutter_switch_off_shows_the_block_again(harness):
    page = harness.open("/dp/B0MOUSY010")
    assert not page.locator("#brandSnapshot_feature_div").is_visible()
    popup = harness.popup()
    popup.locator("#tab-settings").click()
    popup.locator('[data-az-key="hideBrandSnapshot"]').click()
    page.wait_for_timeout(600)
    assert page.locator("#brandSnapshot_feature_div").is_visible()
    # The other switches keep their blocks hidden.
    assert not page.locator("#aplusBrandStory_feature_div").is_visible()


def test_bank_offers_for_my_cards(harness):
    popup = harness.popup()
    popup.locator("#tab-settings").click()
    popup.locator(".az-cards input").fill("hdfc")
    popup.locator(".az-cards input").press("Enter")
    page = harness.open("/dp/B0MOUSY010")
    page.wait_for_timeout(600)
    bank = page.locator("#az-bank .az-chip").all_inner_texts()
    assert any(text.startswith("Your card, HDFC Bank Debit Card: ₹75 cashback") for text in bank)
    assert not any("Mousy Bank" in text for text in bank)

    # Case, spaces and dots do not matter: "MOUSYBANK" is "Mousy Bank".
    popup.locator(".az-cards input").fill("MOUSYBANK")
    popup.locator(".az-cards input").press("Enter")
    page.wait_for_timeout(800)
    bank = page.locator("#az-bank .az-chip").all_inner_texts()
    assert any(text.startswith("Your card, Mousy Bank Credit Card") for text in bank)


def test_minimal_ui_off_puts_buttons_in_buy_box(harness):
    page = harness.open("/dp/B0MOUSY010")
    popup = harness.popup()
    popup.locator("#tab-settings").click()
    popup.locator('[data-az-key="minimalProductUi"]').click()
    page.wait_for_timeout(600)
    assert page.locator("#centerCol #az-actions").count() == 0
    assert page.locator("#rightCol #az-actions #az-pricehistory").count() == 1
    assert page.locator("#centerCol #az-bank").count() == 1


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


@pytest.mark.parametrize("path", ["/dp/B0MOUSY001", "/dp/B0MOUSY010", "/s?k=mousy"])
def test_page_is_quiet_after_load(harness, path):
    """Our own DOM changes must not start new runs. Count mutations for 2 seconds."""
    page = harness.open(path)
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
    # The hidden "₹40 delivery" words come back, with no extra line breaks.
    assert page.locator(".az-hidden-text").count() == 0
    assert "₹40 delivery Thursday, 15 October." in page.locator("#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE").inner_text()
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
    assert page.locator("#card-iceroller .az-chip-fee").inner_text() == "+₹59 delivery fee"
    assert page.locator("#card-freedelivery .az-chip-fee").count() == 0
    # The chip shows the fee. Thus, Amazon's line shows only the date. FREE delivery stays.
    assert page.locator("#card-iceroller [data-cy='delivery-recipe']").inner_text() == "Tue, 13 Oct"
    assert page.locator("#card-freedelivery [data-cy='delivery-recipe']").inner_text().startswith("FREE delivery")


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
    # "Saved for later" is not in the cart. It is not in the counts or the list.
    assert "of 2" in banner.inner_text()
    assert "Ceramic Pour-Over" not in banner.locator(".az-cb-list").text_content()
    # Re-check reads the session again. It shows that it ran.
    banner.locator(".az-cb-recheck").click()
    cart.wait_for_timeout(200)
    assert cart.locator("#az-cashback .az-cb-recheck").inner_text() == "✓ Checked"
    assert "1 tracked" in cart.locator("#az-cashback").inner_text()


def test_cart_clips_coupon_with_hidden_collected_text(harness):
    page = harness.open("/gp/cart/view.html")
    # The click goes to the "Clip Coupon" link, not to the popover around it.
    assert page.evaluate("window.mousySavedClips || 0") == 1
    assert page.evaluate("window.mousyPopovers || 0") == 0


def test_hidden_cart_panel_extends_cashback_banner(harness):
    page = harness.open("/dp/B0MOUSY001?tag=mousy-21")
    # Make the free space that Amazon keeps for the hidden cart panel.
    # A new node starts a run, the same as when Amazon loads more of the page.
    page.evaluate("document.body.style.paddingRight = '120px'; document.body.append(document.createElement('div'))")
    page.wait_for_timeout(400)
    assert page.locator("html").get_attribute("data-az-ewc") == "closed"
    banner = page.locator("#az-cashback").bounding_box()
    width = page.evaluate("document.documentElement.clientWidth")
    assert abs(banner["x"] + banner["width"] - width) <= 1
