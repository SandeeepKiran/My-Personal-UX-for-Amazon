"""Start Chromium with the extension, and serve the test pages as amazon.in.

The tests and the media scripts use this file. No request goes to the internet:
every amazon.in request gets a local test page or a 404, and other hosts are blocked.
"""

from __future__ import annotations

import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from playwright.sync_api import BrowserContext, Page, Route, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
BASE = "https://www.amazon.in"

# Paths on the copy of amazon.in, and the test page for each path.
PAGES = {
    "/mock.css": ("mock.css", "text/css"),
    "/dp/B0MOUSY001": ("product.html", "text/html"),
    "/s": ("search.html", "text/html"),
    "/gp/cart/view.html": ("cart.html", "text/html"),
    "/hz/wishlist/ls": ("wishlist.html", "text/html"),
}


def _serve(route: Route) -> None:
    url = route.request.url
    if url.startswith("chrome-extension://"):
        route.continue_()
        return
    if not url.startswith(BASE):
        route.abort()
        return
    path = url[len(BASE):].split("?")[0].split("#")[0]
    if path not in PAGES:
        route.fulfill(status=404, body="Not found", content_type="text/plain")
        return
    name, content_type = PAGES[path]
    body = (FIXTURES / name).read_text(encoding="utf-8")
    if name.endswith(".html"):
        body = body.replace("<!--NAV-->", (FIXTURES / "nav.html").read_text(encoding="utf-8"))
    route.fulfill(status=200, body=body, content_type=f"{content_type}; charset=utf-8")


class Harness:
    def __init__(self, context: BrowserContext, extension_id: str) -> None:
        self.context = context
        self.extension_id = extension_id

    def open(self, path: str, page: Page | None = None) -> Page:
        page = page or self.context.new_page()
        page.goto(BASE + path)
        # The content scripts start after the settings load. The settings button is the sign.
        page.wait_for_selector("#az-fab", state="attached", timeout=10000)
        page.wait_for_timeout(700)
        return page

    def popup(self, page: Page | None = None) -> Page:
        page = page or self.context.new_page()
        page.goto(f"chrome-extension://{self.extension_id}/src/popup/popup.html")
        # The groups are on the Settings tab, which is hidden at first.
        page.wait_for_selector(".az-group", state="attached")
        return page

    def reset_storage(self) -> None:
        worker = self.context.service_workers[0]
        worker.evaluate("Promise.all([chrome.storage.sync.clear(), chrome.storage.local.clear()])")


@contextmanager
def launch(headless: bool = True, viewport: dict | None = None, device_scale_factor: float = 1) -> Iterator[Harness]:
    with sync_playwright() as playwright, tempfile.TemporaryDirectory(prefix="mpux-") as profile:
        context = playwright.chromium.launch_persistent_context(
            profile,
            channel="chromium",
            headless=headless,
            viewport=viewport or {"width": 1440, "height": 900},
            device_scale_factor=device_scale_factor,
            args=[f"--disable-extensions-except={ROOT}", f"--load-extension={ROOT}"],
        )
        context.route("**/*", _serve)
        worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
        extension_id = worker.url.split("/")[2]
        try:
            yield Harness(context, extension_id)
        finally:
            context.close()
