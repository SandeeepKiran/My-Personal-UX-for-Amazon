# Release

> **Who does what.** Any agent can do part 1 (local work). Only **Claude Code** does
> part 2 (GitHub), and only when the owner asks. Only the owner does part 3 (stores).

## 1. Make the packages (local)

1. Change `version` in `manifest.json`. Use `MAJOR.MINOR.PATCH`:
   MAJOR for a large or breaking change, MINOR for a new feature, PATCH for a fix.
2. In `CHANGELOG.md`, change `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`.
   Add a new, empty `## [Unreleased]` above it.
3. Change the version in `README.md` and in `tools/media/promo/stage.html`.
4. Run the tests: `python -m pytest tests -q`.
5. Make the media again: `pwsh tools/media/promo/build_promo.ps1`.
6. Run the build: `python tools/build.py`.

The build makes these files:

| File | For |
|---|---|
| `dist/my-personal-ux-<version>-chrome.zip` | Chrome Web Store |
| `dist/my-personal-ux-<version>-edge.zip` | Microsoft Edge Add-ons |
| `dist/my-personal-ux-<version>-firefox.zip` | addons.mozilla.org (AMO) |

The zips have only `manifest.json`, `icons/`, `src/` and `LICENSE` (if it exists).
Tests, tools, docs and any other file stay out.

7. Check the Firefox package: `npx web-ext lint --source-dir dist/firefox`.

## 2. GitHub (Claude Code only, when the owner asks)

1. Commit the changes. Use the message `Release vx.y.z`.
2. Make the tag: `git tag vx.y.z`.
3. Push the commit and the tag: `git push origin main --follow-tags`.
4. Make a GitHub release for the tag. Use the text of the `## [x.y.z]` section in
   `CHANGELOG.md` as the release notes. Attach the three zips from `dist/`.

The repository has no tags before v5.0.0. Version 3.7.0 is the first commit.

## 3. Upload to the stores (the owner only)

### Chrome Web Store

1. Open the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
2. Pay the one-time developer fee (first time only).
3. Upload the Chrome zip.
4. Add screenshots. The store accepts 1280 × 800 or 640 × 400 only. The images in
   `docs/media/` are 1280 × 720, so add 40 px at the top and the bottom first.
5. On the Privacy tab, write: "The extension keeps settings in browser storage. It
   collects no user data." Explain the `storage` permission.

### Microsoft Edge Add-ons

1. Open [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge) (free).
2. Upload the Edge zip. Use the same text and images as for Chrome.

### Firefox (AMO)

1. Open [addons.mozilla.org developer hub](https://addons.mozilla.org/developers/) (free).
2. Upload the Firefox zip.
3. Choose **On this site** (listed) or **On your own** (unlisted, signed for your own use).
4. If AMO asks for the source code: the code is not minified, so the zip is the source.

The Firefox add-on id is `my-personal-ux-amazon@mousy` (in `manifest.json`). Do not
change it after the first upload. AMO uses it to know that a new version is the same add-on.

## 3. Name and trademark

Stores can refuse a name that starts with a brand name ("Amazon — …"). If a store
refuses the name, use **My Personal UX for Amazon**. The `short_name` is already
`My Personal UX`.
