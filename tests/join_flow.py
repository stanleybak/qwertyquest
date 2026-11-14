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


def start(d, name, first=True):
    d.get(f"{URL}#lan={tag}")
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


a, b = browser(), browser()
start(a, "Ann")
time.sleep(6)
print("1 Ann alone, straight in:", info(a))

start(b, "Bob")
time.sleep(5.5)
print("2 Bob sees a menu:", lobby(b))
b.save_screenshot(str(OUT / "lobby_menu.png"))
b.find_element(By.CSS_SELECTOR, "#lobbyBody button.city").click()
time.sleep(1.5)
print("3 Bob waits:", lobby(b))
print("  Ann is asked:", a.find_element(By.ID, "asks").text.replace("\n", " | "))
a.save_screenshot(str(OUT / "host_ask.png"))
b.save_screenshot(str(OUT / "knock.png"))
a.find_elements(By.CSS_SELECTOR, "#asks button")[1].click()  # not now
time.sleep(1.5)
print("4 after 'Not now':", lobby(b))
b.find_element(By.CSS_SELECTOR, "#lobbyBody button.city").click()
time.sleep(2.5)
a.find_element(By.CSS_SELECTOR, "#asks button.yes").click()
time.sleep(2.5)
print("5 let in. Ann:", info(a))
print("          Bob:", info(b))

# Ann builds a little, then Bob reloads: he holds the key, so he walks straight back in
q(a, "const q=window.__qq; for (let i=0;i<3;i++) q.host.done(q.net.selfId, {site:0, clean:true, n:1});")
time.sleep(5)
start(b, "Bob", first=False)
time.sleep(7)
print("6 Bob reloaded, back in without asking:", info(b), "| Ann asked again?", repr(a.find_element(By.ID, "asks").text))

# Ann leaves; Bob takes over the same city
a.quit()
time.sleep(7)
print("7 Ann gone, Bob keeps the city:", info(b))
q(b, "const q=window.__qq; for (let i=0;i<2;i++) q.host.done(q.net.selfId, {site:1, clean:true, n:1});")
time.sleep(5)

# Cy has an older copy of the same city with different progress, and opens it alone on another "network"
c = browser()
start(c, "Cy")
time.sleep(5.5)
print("8 Cy (a stranger) sees:", lobby(c))
c.find_elements(By.CSS_SELECTOR, "#lobbyBody button.city")[-1].click()  # start a brand new city
time.sleep(2)
print("  Cy in his own new city:", info(c), "| Bob still:", info(b))
# leave the city from the settings panel: the menu must come back
c.find_element(By.ID, "btnAdult").click()
time.sleep(0.3)
c.find_element(By.ID, "aLeave").click()
time.sleep(1.5)
c.find_element(By.ID, "go").click()
time.sleep(5.5)
print("9 Cy left his city, menu again:", lobby(c))
c.save_screenshot(str(OUT / "lobby_two.png"))

# best of both: a member's saved copy with a taller building 2 is offered on joining
world = q(b, "return JSON.stringify(window.__qq.net.world)")
q(c, "const w=%s; const all=JSON.parse(localStorage.getItem('qq.worlds')) || {}; all[w.id]={key:w.key,name:w.name,d:0,have:[0,0,4,0,0,0],total:4,at:Date.now()}; localStorage.setItem('qq.worlds', JSON.stringify(all));" % world)
start(c, "Cy", first=False)
time.sleep(9)
print("10 Cy holds an old copy (building 3 at 4): merged. Bob:", info(b))
print("                                                   Cy:", info(c))
logs(b, "B")
logs(c, "C")
b.quit()
c.quit()

# a device running another version of the game is turned away without bothering the host
a, b = browser(), browser()
tag = tag + "v"
start(a, "Ann")
time.sleep(6)
start(b, "Bob")
time.sleep(5.5)
host_id = q(a, "return window.__qq.net.selfId")
q(b, "window.__qq.net._send('ask', {key:'', name:'Old Bob', ver:'some-older-version'}, '%s')" % host_id)
time.sleep(1.5)
print("11 ask from another version: host shown a card?", repr(a.find_element(By.ID, "asks").text), "| members:", q(a, "return window.__qq.net.order.length"))
a.quit()
b.quit()
