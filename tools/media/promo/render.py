"""Render stage.html to PNG frames (or a few stills) with Playwright.

The stage reads the screenshots from build/media/shots (make them with capture.py).
Output goes to build/media/ (git ignores it).

Usage (from the project folder):
    python tools/media/promo/render.py stills 0.5 2.0 7.0   -> build/media/stills/t_07.00.png ...
    python tools/media/promo/render.py frames               -> build/media/frames/f_00000.png ... (22 s at 30 fps)
"""
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[2] / "build" / "media"
FPS = 30
DURATION = 22.0


def open_stage(browser):
    # The stage loads "shots/<name>.png" relative to itself, so it runs from the work folder.
    shutil.copy2(HERE / "stage.html", WORK / "stage.html")
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    boxes = (WORK / "shots" / "boxes.json").read_text(encoding="utf-8")
    page.add_init_script(f"window.BOXES = {boxes};")
    page.goto((WORK / "stage.html").as_uri())
    page.evaluate("document.fonts.ready")
    page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth > 0)")
    return page


def shoot(page, t, path):
    page.evaluate(f"renderFrame({t})")
    page.screenshot(path=str(path))


def main():
    mode = sys.argv[1]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = open_stage(browser)
        if mode == "stills":
            out = WORK / "stills"
            out.mkdir(exist_ok=True)
            for t in map(float, sys.argv[2:]):
                shoot(page, t, out / f"t_{t:05.2f}.png")
        else:
            out = WORK / "frames"
            out.mkdir(exist_ok=True)
            for i in range(int(DURATION * FPS)):
                shoot(page, i / FPS, out / f"f_{i:05d}.png")
        browser.close()


if __name__ == "__main__":
    main()
