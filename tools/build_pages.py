#!/usr/bin/env python3
"""Build the static GitHub Pages site into ./_site.

Copies web/ and pre-renders the dictionary (the same parsing server.py does on every
request) to dictionary.json, since static hosting has no /api. Progress is then kept
in the browser's localStorage by web/js/api.js.

Run:  py tools/build_pages.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402  (importing does not start it)

OUT = ROOT / "_site"


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(server.WEB_DIR, OUT)
    dictionary = server.build_dictionary()
    for warning in dictionary["warnings"]:
        print("figyelmeztetés:", warning)
    if not dictionary["words"]:
        sys.exit("A szótár üres - a build megszakítva.")
    (OUT / "dictionary.json").write_text(
        json.dumps(dictionary, ensure_ascii=False), encoding="utf-8")
    (OUT / ".nojekyll").touch()
    print(f"Kész: {OUT} ({len(dictionary['words'])} szó, {len(dictionary['topics'])} téma)")


if __name__ == "__main__":
    main()
