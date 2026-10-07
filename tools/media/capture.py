"""Take screenshots of the extension on the local test pages.

Usage (from the project folder):
    python tools/media/capture.py [output folder]    (default: build/media/shots)

The script writes PNG files at 2x scale and boxes.json (element positions in CSS
pixels of a 1440 x 900 page). The promo video and the README images use them.
All data on the test pages uses the name Mousy. Nothing goes to the internet.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tests"))

from harness import launch  # noqa: E402

PRODUCT = "/dp/B0MOUSY001?tag=mousy-21"


def box(page, selector: str) -> dict | None:
    handle = page.locator(selector).first
    if handle.count() == 0:
        return None
    rect = handle.bounding_box()
    return {key: round(value, 1) for key, value in rect.items()} if rect else None


def set_mode(h, mode: str) -> None:
    worker = h.context.service_workers[0]
    worker.evaluate(
        """async mode => {
            const { settings } = await chrome.storage.sync.get({ settings: {} });
            await chrome.storage.sync.set({ settings: { ...settings, mode } });
        }""",
        mode,
    )


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    boxes: dict[str, dict] = {}
    with launch(viewport={"width": 1440, "height": 900}, device_scale_factor=2) as h:
        h.reset_storage()

        # Product page, extension off.
        set_mode(h, "off")
        page = h.open(PRODUCT)
        page.mouse.move(0, 0)
        page.screenshot(path=out / "product_off.png")
        boxes["product_off"] = {
            "urgency": box(page, "#availability span"),
            "emi": box(page, "#inemi_feature_div"),
            "delivery": box(page, "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE"),
            "fab": box(page, "#az-fab"),
        }
        page.locator("#az-fab").click()
        page.wait_for_timeout(400)
        page.mouse.move(0, 0)
        page.screenshot(path=out / "product_off_panel.png")
        boxes["product_off_panel"] = {"simple": box(page, '#az-panel input[value="simple"]')}

        # Same page, Simple mode, panel still open.
        page.locator('#az-panel input[value="simple"]').check()
        page.wait_for_timeout(900)
        page.mouse.move(0, 0)
        page.screenshot(path=out / "product_on_panel.png")

        # Clean page, panel closed.
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        page.mouse.move(0, 0)
        page.screenshot(path=out / "product_on.png")
        boxes["product_on"] = {
            "fee": box(page, ".az-chip-fee.az-fee-inline"),
            "coupon": box(page, ".az-coupon"),
            "actions": box(page, "#az-actions"),
            "price": box(page, "#corePriceDisplay_desktop_feature_div"),
            "seller": box(page, '[data-az-feature="seller"]'),
            "banner": box(page, "#az-cashback"),
        }

        # Add the product to the cart while the cashback session is live.
        page.locator("#add-to-cart-button").click()
        page.wait_for_timeout(300)

        # Search page, off and on.
        set_mode(h, "off")
        search = h.open("/s?k=mousy+coffee")
        search.mouse.move(0, 0)
        search.screenshot(path=out / "search_off.png")
        boxes["search_off"] = {"sponsored": box(search, "#card-sponsored")}
        set_mode(h, "simple")
        search.wait_for_timeout(900)
        search.screenshot(path=out / "search_on.png")
        boxes["search_on"] = {
            "unit": box(search, "#card-coffee .az-chip-unit"),
            "few": box(search, "#card-oatmilk .az-chip-warn"),
        }

        # Cart page with the item list open.
        cart = h.open("/gp/cart/view.html")
        cart.locator("#az-cashback summary").click()
        cart.wait_for_timeout(300)
        cart.mouse.move(0, 0)
        cart.screenshot(path=out / "cart_on.png")
        boxes["cart_on"] = {
            "banner": box(cart, "#az-cashback"),
            "list": box(cart, ".az-cb-list"),
            "fee": box(cart, ".az-cart-fee"),
        }

        # Popup, Settings tab. Two groups open, the others closed, so all areas show.
        h.context.service_workers[0].evaluate(
            "chrome.storage.local.set({ uiCollapsed: ['tools', 'declutter', 'cart', 'nav'] })"
        )
        popup = h.context.new_page()
        popup.set_viewport_size({"width": 360, "height": 900})
        h.popup(popup)
        popup.locator("#tab-settings").click()
        popup.add_style_tag(content="main { max-height: none !important; }")
        popup.wait_for_timeout(300)
        popup.locator("body").screenshot(path=out / "popup_settings.png")
        popup.locator("#tab-modes").click()
        popup.wait_for_timeout(200)
        popup.locator("body").screenshot(path=out / "popup_modes.png")

    (out / "boxes.json").write_text(json.dumps(boxes, indent=2), encoding="utf-8")
    print(f"Wrote screenshots to {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "build" / "media" / "shots")
