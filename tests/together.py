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
        t = q(d, "const i=window.__qq.inside; const o=window.__qq.CH.opts.find(o=>o.id===i.want); return o && o.text")
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
time.sleep(1)
print("  each has their own item: Ann", q(a, "return window.__qq.inside.want"), "| Bob", q(b, "return window.__qq.inside.want"),
      "| list order", q(a, "return window.__qq.inside.g.seq"))
bob_item = q(b, "return window.__qq.CH.opts.find(o=>o.id===window.__qq.inside.want).text")
key(b, bob_item[:1])  # Bob starts typing his
fetch(a, 2)
time.sleep(1)
print("  Bob's half-typed word survived Ann's two fetches:", q(b, "return window.__qq.CH.buf") == bob_item[:1])
key(b, bob_item[1:])
time.sleep(0.7)
print("2 Ann fetched 2. Ann placed:", q(a, "return window.__qq.inside.placed"), "| Bob placed:", q(b, "return window.__qq.inside.placed"), "| Bob's dots:", b.find_element(By.ID, "dots").text)
b.save_screenshot(str(OUT / "together.png"))
fetch(b, 3)
time.sleep(1.5)
print("  when it is done:", a.find_element(By.ID, "hint").text)
key(a, Keys.ENTER)
time.sleep(0.4)
print("  Ann pressed Enter: outside again:", q(a, "return !window.__qq.inside"))
q(a, "window.__qq.enter('0:1')")
time.sleep(0.5)
print("3 Bob fetched the other 4 (from the back of the list). Ann placed:", q(a, "return window.__qq.inside.placed"), "done for Ann:", q(a, "return window.__qq.inside.fin"),
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
# Ann stands at the second spot without starting: it is still free for Bob
q(a, "const r=window.__qq.inside; r.x=0.53; r.y=0.1;")
q(b, "const r=window.__qq.inside; r.x=0.53; r.y=0.1;")
time.sleep(1.2)
print("  Ann only standing there, Bob at the same spot:", b.find_element(By.ID, "hint").text)
q(b, "const r=window.__qq.inside; r.x=0.9; r.y=0.5;")
# Ann starts on the second spot; Bob cannot take that one, but can do another at the same time
key(a, Keys.ENTER)
time.sleep(1.2)
q(b, "const r=window.__qq.inside; r.x=0.53; r.y=0.1;")
time.sleep(0.5)
print("  Bob at Ann's spot:", b.find_element(By.ID, "hint").text, "| Bob's glowing spot:", q(b, "return window.__qq.inside.want"))
key(a, Keys.ESCAPE)
time.sleep(1.2)
print("  Ann pressed Esc:", b.find_element(By.ID, "hint").text)
key(a, Keys.ENTER)
time.sleep(1.2)
key(a, Keys.ESCAPE)
key(a, Keys.ESCAPE)  # Ann leaves the building
time.sleep(1.2)
print("  Ann started again, then left the building:", b.find_element(By.ID, "hint").text)
q(a, "window.__qq.enter('0:0'); const r=window.__qq.inside; r.x=0.53; r.y=0.1;")
time.sleep(0.5)
key(a, Keys.ENTER)
time.sleep(1.2)
q(b, "const r=window.__qq.inside; r.x=0.36+2*0.17; r.y=0.85;")  # spot 6
time.sleep(0.5)
key(b, Keys.ENTER)
time.sleep(0.4)
key(b, q(b, "return window.__qq.T.p.text"))
time.sleep(0.4)
key(a, q(a, "return window.__qq.T.p.text"))
time.sleep(1.5)
print("  both placed one, out of order: Ann's spots filled", bin(q(a, "return window.__qq.inside.mask")), "| Bob's", bin(q(b, "return window.__qq.inside.mask")))
b.save_screenshot(str(OUT / "any_order.png"))
time.sleep(4.5)
time.sleep(1)
print("5 saved with the city:", q(b, "return JSON.stringify(Object.values(JSON.parse(localStorage.getItem('qq.worlds')))[0].rooms)"))
for who, d in (("A", a), ("B", b)):
    for l in d.get_log("browser"):
        if "favicon" not in l["message"] and "WebSocket" not in l["message"]:
            print("LOG", who, l["level"], l["message"][:240])

# Ann and Bob are in the same building; if Bob is in a different scene there (a fire), Ann does not see him in her maze
key(a, Keys.ESCAPE)
key(a, Keys.ESCAPE)
key(b, Keys.ESCAPE)
key(b, Keys.ESCAPE)
q(a, "window.__qq.enter('0:2')")
q(b, "window.__qq.enter('0:2')")
time.sleep(1.5)
print("5b both in the maze: Ann sees", q(a, "return window.__qq.matesHere(performance.now()).map(o => o.name)"),
      "| if Bob were at a fire there instead:", q(a, "for (const o of window.__qq.others.values()) o.scene = 'fire'; return window.__qq.matesHere(performance.now()).map(o => o.name)"))
for d in (a, b):
    d.quit()

# three players, where two of them cannot reach each other directly: all three still see everyone
tag = tag + "t"
a = browser("Ann")
time.sleep(6)
b = browser("Bob")
time.sleep(8)
c = browser("Cy")
time.sleep(9)
ids = {n: q(d, "return window.__qq.net.selfId") for n, d in (("a", a), ("b", b), ("c", c))}
q(b, "const n=window.__qq.net; n.badPeers.set('%s', Infinity); n.okPeers.delete('%s'); n.peers.delete('%s');" % ((ids["c"],) * 3))
q(c, "const n=window.__qq.net; n.badPeers.set('%s', Infinity); n.okPeers.delete('%s'); n.peers.delete('%s');" % ((ids["b"],) * 3))
q(b, "window.__qq.others.clear()")
q(c, "window.__qq.others.clear()")
time.sleep(10)
for n, d in (("Ann", a), ("Bob", b), ("Cy", c)):
    print("7", n, "counter:", d.find_element(By.ID, "crew").text, "| sees:",
          q(d, "const now=performance.now(); return [...window.__qq.others.values()].map(o => o.name + (o.seen && now-o.at<3000 ? '' : ' (no position)'))"))
for d in (a, b, c):
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

# who is here: the list under the 👷 button, a tag on the building someone is in, and an arrow to someone far away
tag = tag + "w"
a = browser("Ann")
time.sleep(6)
b = browser("Bob")
time.sleep(9)
hostd = a if q(a, "return window.__qq.net.isHost") else b
q(hostd, "const q=window.__qq, D=q.district(0); D.sites.forEach((s,k)=>q.host.addLoads(k, s.need));")
time.sleep(1)
q(b, "const q=window.__qq, s=q.district(0).sites[1]; q.me.x=s.x; q.me.y=s.y+48; q.enter('0:1')")
q(a, "const q=window.__qq, s=q.district(0).sites[1]; q.me.x=s.x+200; q.me.y=s.y+60;")
time.sleep(1.5)
a.find_element(By.ID, "crew").click()
time.sleep(0.6)
print("8 Ann's list:", a.find_element(By.ID, "crewPop").text.replace("\n", " | "))
a.save_screenshot(str(OUT / "who.png"))
a.find_element(By.ID, "crew").click()
a.set_window_size(760, 560)  # a small window, so Bob's building is off screen from the far corner
q(a, "const q=window.__qq, D=q.district(0); q.me.x=D.cx-370; q.me.y=D.cy+270;")
time.sleep(2.5)
a.save_screenshot(str(OUT / "arrow.png"))
a.set_window_size(1280, 900)

# restarting the city needs a yes from everyone
state = lambda d: q(d, "const s=window.__qq.st; return JSON.stringify({d:s.d, have:s.have, rooms:Object.keys(s.rooms).length, gen:s.gen})")
q(a, "window.confirm = () => true")
a.find_element(By.ID, "btnAdult").click()
time.sleep(0.3)
a.find_element(By.ID, "aRestart").click()
time.sleep(1.2)
print("9 Ann asks to restart. Ann:", a.find_element(By.ID, "vote").text.replace("\n", " | "))
print("  Bob:", b.find_element(By.ID, "vote").text.replace("\n", " | "))
b.save_screenshot(str(OUT / "vote.png"))
b.find_elements(By.CSS_SELECTOR, "#vote button")[1].click()  # no
time.sleep(1.2)
print("  Bob says no:", state(a), "| card gone:", "hidden" in a.find_element(By.ID, "vote").get_attribute("class"))
a.find_element(By.ID, "btnAdult").click()
time.sleep(0.3)
a.find_element(By.ID, "aRestart").click()
time.sleep(1.2)
b.find_element(By.CSS_SELECTOR, "#vote button.yes").click()
time.sleep(1.5)
print("  asked again, Bob says yes. Ann:", state(a), "| Bob:", state(b), "| Bob still inside:", q(b, "return !!window.__qq.inside"))
time.sleep(4.5)
print("  saved copy:", q(b, "const w=Object.values(JSON.parse(localStorage.getItem('qq.worlds')))[0]; return JSON.stringify({d:w.d, have:w.have, gen:w.gen})"))
a.quit()
b.quit()
