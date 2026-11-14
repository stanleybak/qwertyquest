"""Headless check: work inside a building is shared, and two players in one building see each other.

    python3 -m http.server 8766 &      # from the repository root
    python3 tests/together.py
"""
import random
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

URL = "http://localhost:8766/index.html"
OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
tag = str(random.random())[2:8]


def browser(name):
    o = webdriver.ChromeOptions()
    for a in ("--headless=new", "--window-size=1280,900", "--no-sandbox", "--mute-audio"):
        o.add_argument(a)
    o.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    d = webdriver.Chrome(options=o)
    d.get(f"{URL}#lan={tag}")
    time.sleep(1)
    d.find_element(By.ID, "name").send_keys(name)
    d.find_element(By.ID, "go").click()
    time.sleep(0.6)
    d.find_element(By.ID, "skip").click()
    return d


def q(d, js):
    return d.execute_script(js)


def key(d, k):
    ActionChains(d).send_keys(k).perform()


def fetch(d, n):
    """Type the wanted item's word n times in the fetch-in-order game."""
    for _ in range(n):
        for _ in range(20):
            if q(d, "return !!window.__qq.CH.opts"):
                break
            time.sleep(0.2)
        t = q(d, "const i=window.__qq.inside, w=i.g.seq[i.placed]; const o=window.__qq.CH.opts.find(o=>o.id===w); return o && o.text")
        key(d, t)
        time.sleep(0.7)


a = browser("Ann")
time.sleep(6)
b = browser("Bob")
time.sleep(9)
for d in (a, b):
    q(d, "setInterval(()=>{const p=document.getElementById('party'); if(!p.classList.contains('hidden')) document.getElementById('partyGo').click()},100)")
print("same city:", q(a, "return window.__qq.net.order.length"), q(b, "return window.__qq.net.world.name"))
hostd = a if q(a, "return window.__qq.net.isHost") else b
q(hostd, "const s=window.__qq.st; s.d=1; s.have=[0,0,0,0,0,0];")  # the first neighborhood is finished
time.sleep(1)

# both go into the bakery (building 2 of the first neighborhood: fetch things in order)
for d in (a, b):
    q(d, "window.__qq.enter('0:1')")
time.sleep(1.5)
print("1 game:", q(a, "return window.__qq.inside.m.game"), "| Ann sees", q(a, "return [...window.__qq.others.values()].filter(o=>o.in==='0:1').map(o=>o.name)"),
      "| Bob sees", q(b, "return [...window.__qq.others.values()].filter(o=>o.in==='0:1').map(o=>o.name)"))
key(a, Keys.ENTER)
key(b, Keys.ENTER)
time.sleep(0.6)
fetch(a, 2)
time.sleep(1)
print("2 Ann fetched 2. Ann placed:", q(a, "return window.__qq.inside.placed"), "| Bob placed:", q(b, "return window.__qq.inside.placed"), "| Bob's dots:", b.find_element(By.ID, "dots").text)
b.save_screenshot(str(OUT / "together.png"))
fetch(b, 4)
time.sleep(1.5)
print("3 Bob fetched the other 4. Ann placed:", q(a, "return window.__qq.inside.placed"), "done for Ann:", q(a, "return window.__qq.inside.fin"),
      "| Bob:", q(b, "return window.__qq.inside.placed"), q(b, "return window.__qq.inside.fin"))
print("  city record:", q(a, "return JSON.stringify(window.__qq.st.rooms)"))

# Ann furnishes one thing next door while Bob is outside: it is done for Bob too
key(a, Keys.ESCAPE)
key(b, Keys.ESCAPE)
q(a, "window.__qq.enter('0:0'); const r=window.__qq.inside; r.x=0.36; r.y=0.1;")
time.sleep(0.4)
key(a, Keys.ENTER)
time.sleep(0.4)
key(a, q(a, "return window.__qq.T.p.text"))
time.sleep(1.2)
q(b, "window.__qq.enter('0:0')")
time.sleep(0.5)
print("4 Ann placed one thing in the house; Bob walks in later and sees:", q(b, "return window.__qq.inside.placed"), "| game:", q(b, "return window.__qq.inside.m.game"))
time.sleep(4.5)
print("5 saved with the city:", q(b, "return JSON.stringify(Object.values(JSON.parse(localStorage.getItem('qq.worlds')))[0].rooms)"))
for who, d in (("A", a), ("B", b)):
    for l in d.get_log("browser"):
        if "favicon" not in l["message"] and "WebSocket" not in l["message"]:
            print("LOG", who, l["level"], l["message"][:240])
    d.quit()

# a runaway holds still while someone types at it
a = browser("Ann")
time.sleep(6)
q(a, "const q=window.__qq, D=q.district(0); q.st.jobs.push({id:77,t:22,v:0,hp:4,max:4,left:300,who:[],x:D.cx+200,y:D.cy+120,px:D.cx+200,py:D.cy+120,tx:D.cx-300,ty:D.cy+120,stun:0}); q.me.x=D.cx+200; q.me.y=D.cy+120;")
time.sleep(0.4)
key(a, Keys.ENTER)
x0 = q(a, "return window.__qq.st.jobs[0].x")
time.sleep(4)
x1 = q(a, "return window.__qq.st.jobs[0].x")
print("6 penguin while typing: moved", round(abs(x1 - x0)), "px in 4 s | engaged:", q(a, "return window.__qq.engaged"))
key(a, Keys.ESCAPE)
q(a, "window.__qq.me.x -= 600")
time.sleep(6)
print("  after walking away: moved", round(abs(q(a, "return window.__qq.st.jobs[0].x") - x1)), "px in 6 s")
a.quit()
