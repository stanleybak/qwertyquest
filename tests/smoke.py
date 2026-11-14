"""Headless smoke test: start alone, deliver bricks, open the volume slider.

    python3 -m http.server 8766 &      # from the repository root
    python3 tests/smoke.py
"""
import random
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
o = webdriver.ChromeOptions()
for a in ("--headless=new", "--window-size=1280,900", "--no-sandbox", "--mute-audio"):
    o.add_argument(a)
o.set_capability("goog:loggingPrefs", {"browser": "ALL"})
d = webdriver.Chrome(options=o)
d.get("http://localhost:8766/index.html#room=smoke-%s" % random.random())
time.sleep(1)
d.find_element(By.ID, "name").send_keys("Stan")
d.find_element(By.ID, "go").click()
time.sleep(0.6)
d.find_element(By.ID, "skip").click()
time.sleep(5.5)
q = d.execute_script
key = lambda k: ActionChains(d).send_keys(k).perform()
q("setInterval(()=>{const p=document.getElementById('party'); if(!p.classList.contains('hidden')) document.getElementById('partyGo').click()},100)")
print("city:", q("return window.__qq.net.world.name"), "| host:", q("return window.__qq.net.isHost"))
key(Keys.ENTER)
time.sleep(3)
key(Keys.ENTER)
time.sleep(0.4)
for _ in range(3):
    t = q("return window.__qq.T.p && window.__qq.T.p.text")
    key(t or "")
    time.sleep(0.4)
print("delivered:", q("return window.__qq.st.have"), "| dots:", d.find_element(By.ID, "dots").text)
key(Keys.ESCAPE)
d.find_element(By.ID, "btnSound").click()
time.sleep(0.3)
print("volume slider open:", not q("return document.getElementById('volPop').classList.contains('hidden')"),
      "| volume:", q("return window.__qq.P.vol"))
d.save_screenshot(str(OUT / "smoke.png"))
q("window.__qq.st.d=1; window.__qq.st.have=[0,0,0,0,0,0]; window.__qq.enter('0:1')")
time.sleep(0.3)
key(Keys.ENTER)
time.sleep(0.4)
print("building game choices:", q("return window.__qq.CH.opts && window.__qq.CH.opts.length"))
print("saved cities:", q("return Object.values(JSON.parse(localStorage.getItem('qq.worlds'))).map(w => w.name + ':' + w.total)"))
for l in d.get_log("browser"):
    if "favicon" not in l["message"]:
        print("LOG", l["level"], l["message"][:240])
d.quit()
