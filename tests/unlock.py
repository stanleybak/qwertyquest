"""Headless check: new land opens only when every building is built and every neighbor helped,
and a city that got ahead steps back to its earliest unfinished neighborhood.

    python3 -m http.server 8766 &      # from the repository root
    python3 tests/unlock.py
"""
import random
import time

from selenium import webdriver
from selenium.webdriver.common.by import By

o = webdriver.ChromeOptions()
for a in ("--headless=new", "--window-size=1280,900", "--no-sandbox", "--mute-audio"):
    o.add_argument(a)
o.set_capability("goog:loggingPrefs", {"browser": "ALL"})
d = webdriver.Chrome(options=o)
d.get("http://localhost:8766/index.html#room=unlock-%s" % random.random())
time.sleep(1)
d.find_element(By.ID, "name").send_keys("Stan")
d.find_element(By.ID, "go").click()
time.sleep(0.6)
d.find_element(By.ID, "skip").click()
time.sleep(5.5)
q = d.execute_script
hud = lambda: d.find_element(By.ID, "district").text
state = lambda: q("const s=window.__qq.st; return JSON.stringify({d:s.d, have:s.have, built:s.built, next:s.next})")
HELP = "const q=window.__qq; for (let k=0;k<6;k++) q.host.done(q.net.selfId, {site:-1, clean:true, n:1, all:true, room: q.roomKeyOf(%d, k)});"

q("const q=window.__qq, D=q.district(0); D.sites.forEach((s,k)=>q.host.addLoads(k, s.need));")
time.sleep(0.6)
print("1 all six built, nobody helped:", state(), "|", hud(), "|", d.find_element(By.ID, "hint").text)
q(HELP % 0)
time.sleep(0.6)
print("2 all six neighbors helped:", state(), "|", hud())

# a city from before this rule: four neighborhoods open, building in the fifth, neighbors only helped in the first
q("const s=window.__qq.st; s.d=4; s.have=[2,0,1,0,0,0];")
time.sleep(0.8)
print("3 an old city that got ahead (was at 5th, bricks [2,0,1,..]):", state(), "|", hud())
print("  message:", d.find_element(By.ID, "toasts").text.replace("\n", " | ")[:160])
for i in (1, 2):
    q(HELP % i)
    time.sleep(0.5)
    print("  helped everyone in neighborhood", i + 1, "->", state())
q(HELP % 3)
time.sleep(0.5)
print("4 helped everyone in neighborhood 4: back at the old frontier with its bricks:", state(), "|", hud())
for l in d.get_log("browser"):
    if "favicon" not in l["message"] and "WebSocket" not in l["message"]:
        print("LOG", l["level"], l["message"][:240])
d.quit()
