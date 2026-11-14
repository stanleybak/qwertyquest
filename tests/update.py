"""Headless check: a new version.json offers an update, and the reload returns to the same spot.

    python3 -m http.server 8766 &      # from the repository root
    python3 tests/update.py
"""
import json
import random
import subprocess
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By

ROOT = Path(__file__).resolve().parent.parent
o = webdriver.ChromeOptions()
for a in ("--headless=new", "--window-size=1280,900", "--no-sandbox", "--mute-audio"):
    o.add_argument(a)
o.set_capability("goog:loggingPrefs", {"browser": "ALL"})
d = webdriver.Chrome(options=o)
d.get("http://localhost:8766/index.html#room=upd-%s" % random.random())
time.sleep(1)
d.find_element(By.ID, "name").send_keys("Stan")
d.find_element(By.ID, "go").click()
time.sleep(0.6)
d.find_element(By.ID, "skip").click()
time.sleep(5.5)
q = d.execute_script
q("const q=window.__qq; q.me.x=-222; q.me.y=133; for (let i=0;i<2;i++) q.host.done(q.net.selfId, {site:0, clean:true, n:1});")
city = q("return window.__qq.net.world.id")
print("before: update card hidden:", q("return document.getElementById('update').classList.contains('hidden')"))
try:
    (ROOT / "version.json").write_text(json.dumps({"hash": "pretend-new-version"}) + "\n")
    time.sleep(23)
    print("after a new version.json: card hidden:", q("return document.getElementById('update').classList.contains('hidden')"))
    d.save_screenshot(str(ROOT / "tests" / "out" / "update.png"))
    d.find_element(By.ID, "updateGo").click()
    time.sleep(7)
    print("after Update now: start screen skipped:", q("return document.getElementById('start').classList.contains('hidden')"),
          "| same city:", q("return window.__qq.net.world && window.__qq.net.world.id") == city,
          "| position:", q("return [Math.round(window.__qq.me.x), Math.round(window.__qq.me.y)]"),
          "| bricks:", q("return window.__qq.st.have"))
finally:
    subprocess.run(["python3", str(ROOT / "tools" / "stamp_version.py")], check=True, capture_output=True)
for l in d.get_log("browser"):
    if "favicon" not in l["message"]:
        print("LOG", l["level"], l["message"][:240])
d.quit()
