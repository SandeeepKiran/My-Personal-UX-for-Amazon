# AGENTS.md — Amazon — My Personal UX

Read this file first. It has the rules and a map of the code. More detail is in `docs/`.

## 1. Hard rules

1. **Keep everything local.** Only **Claude Code** pushes to GitHub, and only when the
   owner (Sandeep) asks for it. Every other agent (Cursor, Codex and others) must not
   `git push`, make a GitHub release, or upload to a store, a server or a file host.
   Those agents can make local commits only when the owner asks for them.
   Store uploads are always done by the owner, by hand.
2. Do not use `innerHTML`, `outerHTML` or `insertAdjacentHTML`. Make DOM with `el()`
   (popup and panel) or with `document.createElement` and `textContent`. For a static
   SVG, use `svgFrom()` in `core.js`.
3. Do not add permissions or `host_permissions` to `manifest.json`. The only permission
   is `storage`. If a feature needs more, ask the owner first.
4. Use only promise-based extension APIs through `ext` (`globalThis.browser ?? globalThis.chrome`).
   Firefox does not accept callbacks.
5. Write code comments in ASD-STE100 (Simplified Technical English): short sentences,
   active voice, one instruction for each sentence. Write a comment only when the code
   cannot show the reason.
6. Use the name **Mousy** in test data, demo pages and media. Do not use generic names.
7. Keep the footer text `Made with ❤️ by Mousy!` below the version number.
8. Run the tests before you say that a change is done.

## 2. Map of the code

```
manifest.json            MV3 manifest for Chrome, Edge and Firefox (one file)
src/shared/settings.js   Settings list (GROUPS), defaults, and the UI builders. Popup + page use it.
src/background/          Toolbar badge (ON / OFF) and storage.session access
src/popup/               Toolbar popup (html, css, js)
src/content/core.js      Shared helpers: storage, claims, chips, money, icons, defineFeature
src/content/search.js    Search results: sponsored, unit price, few ratings
src/content/product.js   Product page: seller, clutter, EMI, bank offers, price history,
                         reviews, bigger price, fees, coupons, section order
src/content/cart.js      Cart: Subscribe & Save, protection plans, cart fees, side panel
src/content/cashback.js  Affiliate tag session, tracked items, cashback banner
src/content/navbar.js    Top bar: account menu, wishlists, Explore menu
src/content/panel.js     In-page settings panel, round button, Alt+A
src/content/main.js      Start-up, run loop, MutationObserver, storage listener, modes
src/content/content.css  All page styles (injected at document_start)
tests/                   Playwright tests and the Amazon-like test pages (fixtures/)
tools/build.py           Makes dist/<browser>/ and the store zips
tools/media/capture.py   Takes the screenshots for the video and the README
tools/media/promo/       The promo video: stage.html (scenes), audio.py, render.py, build_promo.ps1
docs/                    Architecture, settings map, testing, release
docs/media/              Finished media: promo.mp4, poster, GIF, README images, share text
CHANGELOG.md             All changes, one section for each version
dist/, build/            Output only. Git ignores them. Do not edit files in them.
```

## 3. Things that are easy to break

Also read `docs/known-risks.md`: Amazon selectors, cashback logic, and safe tests on the real site.

- **One shared scope.** All content scripts share one global scope, in the order in
  `manifest.json`. Declare a value that another file uses with `var` or as a `function`
  declaration. A top-level `const` or `let` is not visible as a property of the global
  object, and a second declaration of the same name stops the script.
- **Script order.** `settings.js` and `core.js` load first. `main.js` loads last.
  A new feature file goes between them. Add it to `manifest.json` in the correct order.
- **Features.** Each feature calls `defineFeature({ name, keys, run, reset })`.
  `run` must be safe to call many times (the observer calls it after each page change).
  `reset` must remove everything that `run` added. Use `claim(node, tag)` so a node gets
  changed only once.
- **No loops.** The observer ignores changes inside the extension's own nodes
  (`[id^="az-"]`, `[data-az-feature]`, `.az-chip`). Give every node that you add one of
  these marks. A test checks that the page has 0 changes when nothing happens.
- **New setting.** Add it to `GROUPS` in `settings.js`. The default becomes `true`, and the
  popup and the panel show it automatically. Add a row to `docs/settings.md`.
- **India only.** A setting with `inOnly` set is off on amazon.com. Use `enabled(key)`, not
  `settings[key]`, to read a setting.
- **Version.** The footer reads the version from `manifest.json`. When you change the
  version, also change `README.md` (line 7), `tools/media/promo/stage.html` (outro text),
  and add a section to `CHANGELOG.md`. Then make the media again (see below), because
  the images show the footer.
- **Changelog.** Add each change under `## [Unreleased]` in `CHANGELOG.md`. At release
  time, change that heading to `## [x.y.z] - YYYY-MM-DD`. Use the groups Added, Changed,
  Removed, Fixed, Security.

## 4. Commands

```powershell
python -m pytest tests -q                    # 11 tests, about 30 s
python tools/build.py                        # dist/chrome, dist/edge, dist/firefox + zips
npx web-ext lint --source-dir dist/firefox   # Firefox rules (run after the build)
pwsh tools/media/promo/build_promo.ps1       # Video, poster, GIF and README images (about 8 min)
```

Run all commands from the project folder (the folder with `manifest.json`).
The media scripts need `ffmpeg` and `numpy`.

The tests load the real extension in Chromium. They serve the files in `tests/fixtures/`
as `https://www.amazon.in/...`. They block all other network traffic.

## 5. The owner

Sandeep is a QA engineer and is newer to coding. Explain changes in plain words and give
a short reason for each one. Prefer solutions that do not need admin rights.
