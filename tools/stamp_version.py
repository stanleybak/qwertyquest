#!/usr/bin/env python3
"""Write version.json: a hash of every file the game page loads.

A running game fetches version.json now and then; when the hash differs from
the one it started with, it offers to update. The pre-commit hook in
.githooks/ runs this, so the hash changes whenever the game does.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
files = [ROOT / "index.html", ROOT / "style.css", *sorted((ROOT / "js").glob("*.js")), *sorted((ROOT / "vendor").glob("*.js"))]
h = hashlib.sha256()
for f in files:
    h.update(f.relative_to(ROOT).as_posix().encode())
    h.update(f.read_bytes())
out = ROOT / "version.json"
text = json.dumps({"hash": h.hexdigest()[:16]}) + "\n"
if not out.exists() or out.read_text() != text:
    out.write_text(text)
print("version", h.hexdigest()[:16])
