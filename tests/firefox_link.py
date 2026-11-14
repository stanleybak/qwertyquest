"""Diagnostic: how do Firefox and Chrome report the route to each other on one machine or network?

    python3 -m http.server 8766 &      # from the repository root
    python3 tests/firefox_link.py
"""
import os
import random
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By

URL = "http://localhost:8766/index.html"
tag = str(random.random())[2:8]

STATS = """
const done = arguments[arguments.length - 1];
(async () => {
  const n = window.__qq.net, out = [];
  for (const p of Object.values(n.room.getPeers())) {
    if (!p.connection) { out.push({peer: p.userId.slice(0, 6), direct: false}); continue; }
    const stats = await p.connection.getStats();
    let pair = null;
    for (const r of stats.values()) if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
    if (!pair) for (const r of stats.values()) if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r;
    const rem = pair && stats.get(pair.remoteCandidateId), loc = pair && stats.get(pair.localCandidateId);
    out.push({peer: p.userId.slice(0, 6), state: p.connection.connectionState,
      remote: rem && {type: rem.candidateType, address: rem.address, ip: rem.ip, protocol: rem.protocol},
      local: loc && {type: loc.candidateType, address: loc.address, ip: loc.ip}});
  }
  done(JSON.stringify({ok: n.okPeers.size, bad: n.badPeers.size, checking: n.checking.size, members: n.order.length, links: out}));
})().catch(e => done('ERR ' + e));
"""


def chrome():
    o = webdriver.ChromeOptions()
    for a in ("--headless=new", "--window-size=1280,900", "--no-sandbox", "--mute-audio"):
        o.add_argument(a)
    return webdriver.Chrome(options=o)


def firefox():
    # Ubuntu ships Firefox as a snap: point at the real binary, and keep the profile where the snap may write
    o = webdriver.FirefoxOptions()
    o.add_argument("-headless")
    o.set_preference("media.volume_scale", "0.0")
    snap = Path("/snap/firefox/current/usr/lib/firefox/firefox")
    if snap.exists():
        o.binary_location = str(snap)
        os.environ["TMPDIR"] = str(Path.home() / "snap/firefox/common/tmp")
        return webdriver.Firefox(options=o, service=webdriver.FirefoxService("/snap/bin/geckodriver"))
    return webdriver.Firefox(options=o)


def start(d, name):
    d.set_script_timeout(20)
    d.get(f"{URL}#lan={tag}")
    time.sleep(1.5)
    d.find_element(By.ID, "name").send_keys(name)
    d.find_element(By.ID, "go").click()
    time.sleep(0.8)
    d.find_element(By.ID, "skip").click()


ds = [("firefox-1", firefox()), ("chrome", chrome()), ("firefox-2", firefox())]
for i, (n, d) in enumerate(ds):
    start(d, n[:10])
    time.sleep(7)
time.sleep(8)
for n, d in ds:
    print(n, d.execute_async_script(STATS))
for n, d in ds:
    d.quit()
