#!/usr/bin/env python3
"""Nóra angol kalandja - localhost server.

Python standard library only. Serves the static web app from ./web and offers a
tiny JSON API:

    GET  /api/dictionary   parsed data/dictionary.csv (+ data/topics.csv)
    GET  /api/progress     data/progress.json (204 if it does not exist yet)
    POST /api/progress     replaces data/progress.json (atomic write + daily backup)

Run:  py server.py          (opens the browser)
      py server.py --no-browser
"""
from __future__ import annotations

import csv
import io
import json
import os
import shutil
import sys
import threading
import time
import webbrowser
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
DATA_DIR = ROOT / "data"
BACKUP_DIR = DATA_DIR / "backups"
DICTIONARY_FILE = DATA_DIR / "dictionary.csv"
TOPICS_FILE = DATA_DIR / "topics.csv"
PROGRESS_FILE = DATA_DIR / "progress.json"

HOST = "127.0.0.1"
PORT = 8765
MAX_BODY = 2 * 1024 * 1024
BACKUPS_TO_KEEP = 30
ALLOWED_HOSTS = {"localhost", "127.0.0.1", "[::1]"}

write_lock = threading.Lock()

# Column names are accepted in English or Hungarian, in any letter case.
HEADER_ALIASES = {
    "topic": "topic", "tema": "topic", "téma": "topic", "kategoria": "topic", "kategória": "topic",
    "english": "english", "angol": "english", "en": "english",
    "hungarian": "hungarian", "magyar": "hungarian", "hu": "hungarian",
    "emoji": "emoji", "kep": "emoji", "kép": "emoji", "icon": "emoji", "ikon": "emoji",
    "color": "color", "colour": "color", "szin": "color", "szín": "color",
}
DEFAULT_COLORS = ["#ff9f43", "#ff6b9d", "#4dabf7", "#9775fa", "#ff6b6b", "#51cf66",
                  "#fcc419", "#22b8cf", "#38d9a9", "#f783ac", "#74c0fc", "#a9e34b"]


# ---------------------------------------------------------------- dictionary

def read_text(path: Path) -> str:
    """Excel on a Hungarian Windows may save CSV as cp1250 instead of UTF-8."""
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1250", errors="replace")


def read_rows(path: Path) -> list[dict]:
    """Rows of a CSV file as dicts with canonical column names and a '_line' number."""
    if not path.exists():
        return []
    text = read_text(path)
    header_line = next((ln for ln in text.splitlines()
                        if ln.strip() and not ln.lstrip().startswith("#")), "")
    delimiter = max(";,\t", key=header_line.count)  # Hungarian Excel uses ';'
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    header: list[str] | None = None
    rows: list[dict] = []
    for row in reader:
        if not row or not any(cell.strip() for cell in row):
            continue
        if row[0].lstrip().startswith("#"):
            continue
        if header is None:
            header = [HEADER_ALIASES.get(c.strip().lower(), c.strip().lower()) for c in row]
            continue
        rec = {header[i]: row[i].strip() for i in range(min(len(header), len(row)))}
        rec["_line"] = reader.line_num
        rows.append(rec)
    return rows


def build_dictionary() -> dict:
    warnings: list[str] = []
    words: list[dict] = []
    seen: set[str] = set()

    for r in read_rows(DICTIONARY_FILE):
        line = r["_line"]
        topic, english, hungarian = r.get("topic", ""), r.get("english", ""), r.get("hungarian", "")
        if not (topic and english and hungarian):
            warnings.append(f"dictionary.csv, {line}. sor: hiányzik a téma, az angol vagy a magyar szó - kihagyva.")
            continue
        alts = [a.strip() for a in english.split("|") if a.strip()]
        key = alts[0].lower()
        if key in seen:
            warnings.append(f"dictionary.csv, {line}. sor: a(z) '{alts[0]}' szó már szerepel - kihagyva.")
            continue
        seen.add(key)
        visual = r.get("emoji", "").strip()
        if not visual:
            warnings.append(f"dictionary.csv, {line}. sor: a(z) '{alts[0]}' szóhoz nincs emoji.")
            visual = "🔤"
        words.append({"key": key, "topic": topic, "english": alts[0], "alts": alts,
                      "hu": hungarian, "visual": visual})

    if not words:
        warnings.append("A szótár üres vagy nem olvasható: data/dictionary.csv")

    topics: list[dict] = []
    known: set[str] = set()
    for r in read_rows(TOPICS_FILE):
        name = r.get("topic", "")
        if name and name not in known:
            known.add(name)
            topics.append({"name": name, "emoji": r.get("emoji", ""), "color": r.get("color", "")})
    for w in words:
        if w["topic"] not in known:
            known.add(w["topic"])
            topics.append({"name": w["topic"], "emoji": "", "color": ""})
    used = {w["topic"] for w in words}
    topics = [t for t in topics if t["name"] in used]
    for i, t in enumerate(topics):
        first = next(w for w in words if w["topic"] == t["name"])
        if not t["emoji"]:
            t["emoji"] = first["visual"] if not first["visual"].startswith(("color:", "img:")) else "📚"
        if not t["color"]:
            t["color"] = DEFAULT_COLORS[i % len(DEFAULT_COLORS)]

    return {"words": words, "topics": topics, "warnings": warnings}


# ------------------------------------------------------------------ progress

def load_progress() -> dict | None:
    """Current progress; falls back to the newest backup if the file is damaged."""
    if not PROGRESS_FILE.exists():
        return None
    try:
        data = json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (OSError, ValueError):
        pass
    stamp = time.strftime("%Y%m%d-%H%M%S")
    try:
        shutil.copy2(PROGRESS_FILE, DATA_DIR / f"progress.corrupt-{stamp}.json")
    except OSError:
        pass
    for backup in sorted(BACKUP_DIR.glob("progress-*.json"), reverse=True):
        try:
            data = json.loads(backup.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                print(f"A progress.json sérült, visszaállítva innen: {backup.name}")
                return data
        except (OSError, ValueError):
            continue
    return None


def daily_backup() -> None:
    if not PROGRESS_FILE.exists():
        return
    BACKUP_DIR.mkdir(exist_ok=True)
    target = BACKUP_DIR / f"progress-{date.today().isoformat()}.json"
    if not target.exists():
        shutil.copy2(PROGRESS_FILE, target)
    for old in sorted(BACKUP_DIR.glob("progress-*.json"))[:-BACKUPS_TO_KEEP]:
        old.unlink(missing_ok=True)


def save_progress(data: dict) -> None:
    with write_lock:
        DATA_DIR.mkdir(exist_ok=True)
        daily_backup()
        tmp = PROGRESS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, PROGRESS_FILE)


# -------------------------------------------------------------------- server

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".webp": "image/webp",
        "": "application/octet-stream",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # keep the console quiet
        pass

    # -- helpers
    def _host_ok(self) -> bool:
        host = self.headers.get("Host") or ""
        host = host[:host.index("]") + 1] if host.startswith("[") and "]" in host else host.rsplit(":", 1)[0]
        return host in ALLOWED_HOSTS

    def _json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _empty(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    # -- routes
    def do_GET(self):
        if not self._host_ok():
            return self._json({"error": "bad host"}, 403)
        path = urlparse(self.path).path
        if path == "/api/dictionary":
            return self._json(build_dictionary())
        if path == "/api/progress":
            data = load_progress()
            return self._empty(204) if data is None else self._json(data)
        if path.startswith("/api/"):
            return self._json({"error": "not found"}, 404)
        return super().do_GET()

    def do_POST(self):
        if not self._host_ok():
            return self._json({"error": "bad host"}, 403)
        if urlparse(self.path).path != "/api/progress":
            return self._json({"error": "not found"}, 404)
        # Custom header = cross-site pages cannot send this without a CORS preflight.
        if not self.headers.get("X-Requested-With"):
            return self._json({"error": "forbidden"}, 403)
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self._json({"error": "length required"}, 411)
        if length <= 0 or length > MAX_BODY:
            return self._json({"error": "bad size"}, 413)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._json({"error": "bad json"}, 400)
        if not isinstance(data, dict) or "player" not in data:
            return self._json({"error": "not a progress file"}, 400)
        try:
            save_progress(data)
        except OSError as exc:
            return self._json({"error": str(exc)}, 500)
        return self._json({"ok": True})


class TutorServer(ThreadingHTTPServer):
    # On Windows SO_REUSEADDR would let a second copy bind the same port - we want that to fail.
    allow_reuse_address = os.name != "nt"
    daemon_threads = True


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    url = f"http://{HOST}:{PORT}/"
    open_browser = "--no-browser" not in sys.argv
    try:
        server = TutorServer((HOST, PORT), Handler)
    except OSError:
        print(f"A {PORT}-es port foglalt - valószínűleg a program már fut. Megnyitom a böngészőt.")
        if open_browser:
            webbrowser.open(url)
        return
    print("=" * 56)
    print("  Nóra angol kalandja")
    print(f"  Cím: {url}")
    print("  Az ablak bezárásával a program leáll.")
    print("=" * 56)
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
