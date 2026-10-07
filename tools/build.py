"""Make the store packages for Chrome, Edge and Firefox.

Usage (from the project folder):
    python tools/build.py

Output: dist/<browser>/ (a folder you can load unpacked) and
dist/my-personal-ux-<version>-<browser>.zip (the file for the store).

The source folder works in all three browsers as it is. This script only removes the
manifest keys that a browser does not use, so the stores show no warnings.
It does not upload anything.
"""

from __future__ import annotations

import copy
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

# Only these paths go into a package. Any other file in the folder stays out.
INCLUDE = ["manifest.json", "icons", "src", "LICENSE"]

# A fixed date in the zip entries makes the same input give the same zip.
ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def chromium_manifest(manifest: dict) -> dict:
    """Chrome and Edge use the service worker and ignore Firefox settings."""
    out = copy.deepcopy(manifest)
    out.pop("browser_specific_settings", None)
    out["background"] = {"service_worker": manifest["background"]["service_worker"]}
    return out


def firefox_manifest(manifest: dict) -> dict:
    """Firefox uses background scripts. It does not support a service worker."""
    out = copy.deepcopy(manifest)
    out["background"] = {"scripts": manifest["background"]["scripts"]}
    return out


TARGETS = {
    "chrome": chromium_manifest,
    "edge": chromium_manifest,
    "firefox": firefox_manifest,
}


def copy_sources(target: Path) -> None:
    for name in INCLUDE:
        source = ROOT / name
        if not source.exists():
            continue
        if source.is_dir():
            shutil.copytree(source, target / name)
        elif name != "manifest.json":
            shutil.copy2(source, target / name)


def write_zip(folder: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(folder.rglob("*")):
            if not file.is_file():
                continue
            # Stores need forward slashes in the paths inside the zip.
            info = zipfile.ZipInfo(file.relative_to(folder).as_posix(), ZIP_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, file.read_bytes())


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    for browser, make_manifest in TARGETS.items():
        folder = DIST / browser
        folder.mkdir()
        copy_sources(folder)
        (folder / "manifest.json").write_text(
            json.dumps(make_manifest(manifest), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        zip_path = DIST / f"my-personal-ux-{version}-{browser}.zip"
        write_zip(folder, zip_path)
        print(f"{browser:8} -> {zip_path.relative_to(ROOT)} ({zip_path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
