"""Headless check of finding, joining and merging cities.

    python3 -m http.server 8766 &      # from the repository root
    python3 tests/join_flow.py

Uses private test rooms (#lan=...) with sound muted, never the real network room.
"""
import random
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By

URL = "http://localhost:8766/index.html"
OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
tag = str(random.random())[2:8]


def browser():
    o = webdriver.ChromeOptions()
    for a in ("--headless=new", "--window-size=1280,900", "--no-sandbox", "--mute-audio"):
        o.add_argument(a)
    o.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return webdriver.Chrome(options=o)


def start(d, name, first=True, room=""):
    d.get(f"{URL}#lan={tag}{room}")
    if not first:
        d.refresh()  # same address as before, so the browser would not reload by itself
    time.sleep(1)
    box = d.find_element(By.ID, "name")
    box.clear()
    box.send_keys(name)
    d.find_element(By.ID, "go").click()
    time.sleep(0.6)
    if first:
        d.find_element(By.ID, "skip").click()


def q(d, js):
    return d.execute_script(js)


def lobby(d):
    return d.find_element(By.ID, "lobbyBody").text.replace("\n", " | ")


def info(d):
    return q(d, "const n=window.__qq.net, s=window.__qq.st; return JSON.stringify({city:n.world&&n.world.name, host:n.isHost, members:n.order.length, d:s.d, have:s.have, total:s.total})")


def logs(d, who):
    for l in d.get_log("browser"):
        if "favicon" not in l["message"]:
            print("LOG", who, l["level"], l["message"][:240])


def toasts(d):
    return d.find_element(By.ID, "toasts").text.replace("\n", " | ")


def saved(d):
    return q(d, "return Object.values(JSON.parse(localStorage.getItem('qq.worlds')) || {}).map(w => w.name)")


a, b, c = browser(), browser(), browser()
start(a, "Ann")
time.sleep(6)
print("1 Ann alone, straight in:", info(a))
q(a, "const q=window.__qq; for (let i=0;i<3;i++) q.host.done(q.net.selfId, {site:0, clean:true, n:1});")

# Bob has never played: one city is open, so he walks in with no menu and no asking
start(b, "Bob")
time.sleep(8)
print("2 Bob walks in:", info(b))

# Cy has a city of his own from another day: he walks in too, and it is merged
c.get(f"{URL}#lan={tag}")
q(c, "localStorage.setItem('qq.worlds', JSON.stringify({old1: {key:'k', name:\"Cy's city\", d:0, have:[0,0,4,0,0,0], total:4, at:Date.now()}}))")
start(c, "Cy")
time.sleep(9)
print("3 Cy walks in with his own city (building 3 at 4):", info(c))
print("  Ann's city after the merge:", info(a), "| Cy's saved cities:", saved(c))

# Bob reloads: straight back in
start(b, "Bob", first=False)
time.sleep(8)
print("4 Bob reloaded:", info(b))

# Ann (the host) leaves; the others keep the city
a.quit()
time.sleep(8)
print("5 Ann gone. Bob:", info(b))
print("            Cy:", info(c))

for who, d in (("B", b), ("C", c)):
    logs(d, who)
    d.quit()

# two devices start at the same moment: each opens a city, then the two fold into one
a, b = browser(), browser()
start(a, "Ann", room="s")
start(b, "Bob", room="s")
time.sleep(6)
q(a, "const q=window.__qq; if (q.host) q.host.done(q.net.selfId, {site:0, clean:true, n:1});")
q(b, "const q=window.__qq; if (q.host) q.host.done(q.net.selfId, {site:1, clean:true, n:1});")
time.sleep(9)
print("6 started together. Ann:", info(a))
print("                    Bob:", info(b))

# a device running another version of the game is turned away
other, host_d = (b, a) if q(a, "return window.__qq.net.isHost") else (a, b)
host_id = q(host_d, "return window.__qq.net.selfId")
n0 = q(host_d, "return window.__qq.net.order.length")
q(other, "window.__qq.net._send('ask', {key:'', name:'Old Bob', ver:'some-older-version'}, '%s')" % host_id)
time.sleep(1.5)
print("7 ask from another version: members before/after:", n0, q(host_d, "return window.__qq.net.order.length"))
logs(a, "A")
logs(b, "B")
a.quit()
b.quit()
