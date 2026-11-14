// QwertyQuest: screens, input, the typing engine, and the frame loop.
import * as S from './skill.js';
import { Net, findRoom } from './net.js';
import { Host, newState, loadWorld, saveWorld, district, ZONE_R } from './world.js';
import { draw, COLORS } from './render.js';

const $ = id => document.getElementById(id);
const P = S.loadProfile();
let mode = 'start';            // start | place | game
let st = newState();           // shared city state (host-owned)
let host = null;               // rules engine, present while this peer runs the game
let net = null, roomId = null, roomLabel = '';
let lastEv = 0, gotState = false, savedTotal = -1;
const me = { x: 0, y: 60, face: 1, walk: false, stumble: 0, prog: 0, me: true };
const others = new Map();
const held = new Set();
let auto = null, bootsUntil = 0, bossHit = 0, lastBossHp = 0;
const fx = [];
const cam = { x: 0, y: 0 };
const asked = new Set();

// ---------- sound ----------
let ac = null;
function beep(freq, dur = 0.07, type = 'sine', vol = 0.08, when = 0) {
  if (!P.sound) return;
  try {
    ac ||= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + when + dur);
    o.connect(g).connect(ac.destination);
    o.start(ac.currentTime + when); o.stop(ac.currentTime + when + dur);
  } catch { /* no audio */ }
}
const sfx = {
  key: () => beep(620 + Math.random() * 60, 0.04, 'triangle', 0.05),
  bad: () => beep(150, 0.16, 'sawtooth', 0.06),
  load: () => { beep(660, 0.08); beep(880, 0.1, 'sine', 0.08, 0.07); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, 'triangle', 0.09, i * 0.1)),
};
function say(text) {
  if (!P.sound || !text || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/;/g, 'semicolon'));
    u.rate = 0.85; u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch { /* no speech */ }
}

// ---------- toasts and effects ----------
function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls; el.textContent = text;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => el.remove(), 4200);
}
function floatText(text, x, y, color, size) { fx.push({ text, x, y, vx: 0, vy: -40, life: 1.2, color, size }); }
function confetti(x, y, n = 40) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, v = 80 + Math.random() * 220;
    fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, g: 420, life: 0.8 + Math.random() * 0.8, color: COLORS[i % COLORS.length] });
  }
}

// ---------- keyboard guide ----------
const KB = [
  ['`1234567890-=', '~!@#$%^&*()_+', [0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7]],
  ['qwertyuiop[]\\', 'QWERTYUIOP{}|', [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7, 7]],
  ['asdfghjkl;\'', 'ASDFGHJKL:"', [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7]],
  ['zxcvbnm,./', 'ZXCVBNM<>?', [0, 1, 2, 3, 3, 4, 4, 5, 6, 7]],
];
const keyEl = {}; // char -> { el, shift, right }
function buildKb() {
  const kb = $('kb'); kb.innerHTML = '';
  KB.forEach(([lo, up, fing], r) => {
    const row = document.createElement('div'); row.className = 'r';
    const add = (label, cls) => { const k = document.createElement('div'); k.className = 'k ' + cls; k.textContent = label; row.appendChild(k); return k; };
    if (r === 3) keyEl.shiftL = add('shift', 'wide f0');
    [...lo].forEach((c, i) => {
      const el = add(c.toUpperCase(), `f${fing[i]}` + ('asdfjkl;'.includes(c) ? ' home' : ''));
      keyEl[c] = { el, shift: false, right: fing[i] >= 4 };
      keyEl[up[i]] = { el, shift: true, right: fing[i] >= 4 };
    });
    if (r === 3) keyEl.shiftR = add('shift', 'wide f7');
    kb.appendChild(row);
  });
  const row = document.createElement('div'); row.className = 'r';
  const sp = document.createElement('div'); sp.className = 'k space f8 on'; sp.textContent = 'space';
  row.appendChild(sp); kb.appendChild(row);
  keyEl[' '] = { el: sp, shift: false, right: false };
}
function updateKb(next) {
  const kb = $('kb');
  const show = P.guide && mode === 'game';
  kb.classList.toggle('hidden', !show);
  if (!show) return;
  const known = P.step < S.STAGES.length ? S.cumKeys(P.step) : null;
  kb.querySelectorAll('.k').forEach(k => k.classList.remove('next'));
  for (const c in keyEl) {
    if (c.length > 1) continue;
    const k = keyEl[c];
    if (!k.shift && c !== ' ') k.el.classList.toggle('on', !known || known.includes(c));
  }
  const k = next != null && keyEl[next];
  if (k) {
    k.el.classList.add('next');
    if (k.shift) (k.right ? keyEl.shiftL : keyEl.shiftR).classList.add('next');
  }
}

// ---------- typing engine (shared by the warm-up and the game) ----------
const T = { p: null, pos: 0, clean: true, last: 0, t0: 0, hits: 0, miss: 0, els: null, onDone: null, key: null };

function setPrompt(p, els, onDone) {
  T.p = p; T.pos = 0; T.clean = true; T.hits = 0; T.miss = 0; T.t0 = 0; T.els = els; T.onDone = onDone;
  if (!p) { els.prompt.innerHTML = ''; els.found.classList.add('hidden'); me.prog = 0; updateKb(null); return; }
  els.prompt.className = (p.spaced ? 'spaced' : p.text.length > 70 ? 'long' : '');
  els.prompt.innerHTML = '';
  for (const c of p.text) {
    const s = document.createElement('span');
    s.className = 'ch' + (c === ' ' ? ' sp' : '');
    s.textContent = c;
    els.prompt.appendChild(s);
  }
  if (p.show) {
    const f = els.found; f.classList.remove('hidden'); f.innerHTML = '';
    f.append('Found on site: ', p.show.slice(0, p.mark));
    const b = document.createElement('b'); b.textContent = p.show[p.mark]; f.append(b, p.show.slice(p.mark + 1));
  } else els.found.classList.add('hidden');
  paintPrompt();
  if (S.tierOf(P.step) <= 2 && mode === 'game' && p.say) say(p.say);
}
function paintPrompt() {
  const kids = T.els.prompt.children;
  for (let i = 0; i < kids.length; i++) {
    kids[i].classList.toggle('ok', i < T.pos);
    kids[i].classList.toggle('cur', i === T.pos);
    kids[i].classList.remove('err');
  }
  me.prog = T.p ? T.pos / T.p.text.length : 0;
  updateKb(T.p ? T.p.text[T.pos] : null);
}
function typeChar(ch) {
  if (!T.p) return;
  const want = T.p.text[T.pos], now = performance.now();
  if (!T.t0) T.t0 = now;
  if (ch === want) {
    S.recordKey(P, want, true, T.pos > 0 ? now - T.last : 0);
    T.last = now; T.hits++; T.pos++;
    if (mode === 'game') S.lessonKey(P, true);
    sfx.key();
    if (T.pos >= T.p.text.length) { const cb = T.onDone; cb((now - T.t0) / 1000); return; }
    paintPrompt();
    return;
  }
  S.recordKey(P, want, false, 0);
  T.miss++;
  sfx.bad();
  if (mode === 'game') {
    S.lessonKey(P, false);
    me.stumble = 0.5;
    if (P.shields > 0 && T.clean) { P.shields--; floatText('🛡️ saved!', me.x, me.y - 100, '#2f7de1'); }
    else { T.clean = false; P.streak = 0; }
    if (T.p.perfect) T.pos = 0;
  }
  paintPrompt();
  T.els.prompt.children[T.pos]?.classList.add('err');
  const box = T.els.prompt.closest('#panel, .card');
  box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
}

// ---------- start screen ----------
function initStart() {
  const row = $('colors');
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = c; b.className = i === P.color ? 'sel' : ''; b.ariaLabel = 'color ' + (i + 1);
    b.onclick = () => { P.color = i; [...row.children].forEach((x, j) => x.classList.toggle('sel', j === i)); };
    row.appendChild(b);
  });
  $('name').value = P.name;
  $('name').focus();
  const go = () => {
    P.name = $('name').value.trim().slice(0, 12) || 'builder';
    S.saveProfile(P);
    $('start').classList.add('hidden');
    if (P.placed) startGame(); else startPlacement();
  };
  $('go').onclick = go;
  $('name').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

// ---------- warm-up (placement) ----------
const PL = { i: 0, n: 0, hit: 0, miss: 0, time: 0, placed: 0, t0: 0, timer: null };
function startPlacement() {
  mode = 'place';
  $('place').classList.remove('hidden');
  Object.assign(PL, { i: 0, n: 0, hit: 0, miss: 0, time: 0, placed: 0, t0: 0 });
  nextProbe();
  PL.timer = setInterval(() => {
    if (!PL.t0) return; // the clock starts on the first key
    const left = 60 - (performance.now() - PL.t0) / 1000;
    $('placebar').style.width = Math.max(0, left / 60 * 100) + '%';
    if (left <= 0) endPlacement(PL.placed);
  }, 200);
  $('placebar').style.width = '100%';
  $('skip').onclick = () => endPlacement(0);
}
function nextProbe() {
  const probe = S.PROBES[PL.i];
  setPrompt(S.probePrompt(P, probe), { prompt: $('pprompt'), found: $('pfound') }, secs => {
    PL.hit += T.hits; PL.miss += T.miss; PL.time += secs;
    if (++PL.n < probe.n) return nextProbe();
    const acc = PL.hit / (PL.hit + PL.miss), cps = PL.hit / Math.max(0.5, PL.time);
    if (acc >= 0.9 && cps >= probe.cps) {
      PL.placed = probe.place;
      Object.assign(PL, { i: PL.i + 1, n: 0, hit: 0, miss: 0, time: 0 });
      return PL.i < S.PROBES.length ? nextProbe() : endPlacement(PL.placed);
    }
    endPlacement(PL.i === 0 ? (acc >= 0.7 ? 2 : 0) : PL.placed);
  });
}
function endPlacement(step) {
  if (mode !== 'place') return;
  clearInterval(PL.timer);
  P.step = step; P.placed = true; P.credits = 0;
  S.saveProfile(P);
  setPrompt(null, { prompt: $('pprompt'), found: $('pfound') }, null);
  $('place').classList.add('hidden');
  startGame();
}
addEventListener('keydown', e => { if (mode === 'place' && !PL.t0 && e.key.length === 1) PL.t0 = performance.now(); }, true);

// ---------- network glue ----------
function profileMsg() {
  const w = P.wear, e = id => S.itemById(id)?.e || '';
  return { name: P.name, color: P.color, hat: e(w.hat), tool: e(w.tool), pet: e(w.pet), ride: e(w.ride), rank: S.rankOf(P).i };
}
function applyProfile(o, m) {
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  Object.assign(o, { name: s(m.name, 12), color: m.color | 0, hat: s(m.hat, 8), tool: s(m.tool, 8), pet: s(m.pet, 8), ride: s(m.ride, 8), rank: Math.min(3, Math.max(0, m.rank | 0)) });
}
function sendProfile() { applyProfile(me, profileMsg()); net?.broadcast('me', profileMsg()); }
function other(id) {
  if (!others.has(id)) others.set(id, { x: 0, y: 0, tx: 0, ty: 0, face: 1, prog: 0, stumble: 0, walk: false, name: '', color: 0, rank: 0, seen: false });
  return others.get(id);
}
function grant(t) {
  if (t === 0) { P.shields = Math.min(3, P.shields + 1); toast('🛡️ Shield! Your next slip is forgiven.'); }
  else if (t === 1) { P.crane += 3; toast('🏗️ Crane! Your next 3 loads count double.'); }
  else { bootsUntil = performance.now() + 30000; toast('👟 Speedy boots for 30 seconds!'); }
  sfx.load();
}

const handlers = {
  getState: () => st,
  onBecomeHost() {
    host ||= new Host(st);
    host.st = st;
    st.order = net.order;
    host.assignRoles();
    gotState = true;
  },
  onState(data) {
    const first = !gotState;
    st = data; host = null; gotState = true;
    if (first) {
      lastEv = st.evId;
      const saved = loadWorld(roomId);
      if (saved && saved.total > st.total) net.toHost('offer', saved); // our remembered city is bigger: share it
    }
    handleEvents();
  },
  onPeers(id, joined) {
    if (joined) { other(id); net.sendTo(id, 'me', profileMsg()); }
    else others.delete(id);
    if (net.isHost) st.order = net.order;
  },
  onMsg(kind, data, from) {
    if (kind === 'pos') {
      const o = other(from);
      [o.tx, o.ty] = [+data[0] || 0, +data[1] || 0];
      o.prog = Math.min(1, Math.max(0, data[2] / 100 || 0));
      o.walk = !!(data[3] & 1); if (data[3] & 2) o.stumble = 0.5;
      o.face = data[4] < 0 ? -1 : 1;
      if (!o.seen) { o.x = o.tx; o.y = o.ty; o.seen = true; }
      o.at = performance.now();
    } else if (kind === 'me') applyProfile(other(from), data || {});
    else if (kind === 'grant') grant(data.t | 0);
    else if (!host) return;
    else if (kind === 'done') host.done(from, data || {});
    else if (kind === 'offer') host.offer(data);
    else if (kind === 'grab') {
      const it = host.grab(from, data || {});
      if (it) from === net.selfId ? grant(it.t) : net.sendTo(from, 'grant', { t: it.t });
    }
  },
};

function handleEvents() {
  for (const ev of st.ev) {
    if (ev.id <= lastEv) continue;
    lastEv = ev.id;
    if (ev.t === 'built') { const s = district(ev.d).sites[ev.site]; if (s) confetti(s.x, s.y - 80); sfx.win(); }
    else if (ev.t === 'district') {
      toast(`🎉 ${ev.name} is finished! A new neighborhood opens: ${district(ev.d + 1).name}`, 'gold');
      confetti(me.x, me.y - 60, 120); sfx.win();
    } else if (ev.t === 'gold') { toast('⭐ Team combo! Bonus bricks for every site.', 'gold'); sfx.win(); }
    else if (ev.t === 'boss') toast('👾 A Typo Monster! Type to pelt it with bricks. Its weak spots are YOUR tricky keys.');
    else if (ev.t === 'bossWin') { toast('🏆 The Typo Monster ran away! Bonus bricks for everyone.', 'gold'); confetti(me.x, me.y - 60, 100); sfx.win(); }
    else if (ev.t === 'bossFlee') toast('The Typo Monster kicked a brick loose and wandered off.');
    else if (ev.t === 'round') setTimeout(() => { const r = S.ROLES[myRole()]; toast(`New round! Your job: ${r.icon} ${r.name}`); T.key = null; }, 300);
  }
}
const myRole = () => (st.roles && st.roles[net?.selfId]) ?? 0;

// ---------- the game ----------
async function startGame() {
  mode = 'game';
  $('hud').classList.remove('hidden'); $('panel').classList.remove('hidden');
  buildKb();
  const code = new URLSearchParams(location.hash.slice(1)).get('room') || '';
  const room = await findRoom(code);
  roomId = room.id; roomLabel = room.label;
  const saved = loadWorld(roomId);
  if (saved) Object.assign(st, { d: saved.d, have: saved.have, total: saved.total });
  host = new Host(st); // provisional, until we learn whether someone else is hosting
  const D = district(st.d);
  me.x = D.cx + (Math.random() - 0.5) * 300; me.y = D.cy + 45; cam.x = me.x; cam.y = me.y;
  net = new Net(handlers);
  applyProfile(me, profileMsg());
  await net.join(roomId);
  if (!roomId) toast('Could not reach the network. Playing solo for now.');
  setInterval(hostTick, 250);
  setInterval(() => { if (st.total !== savedTotal) { savedTotal = st.total; saveWorld(roomId, st); } S.saveProfile(P); }, 4000);
  setInterval(sendPos, 100);
  requestAnimationFrame(frame);
  toast(S.tierOf(P.step) <= 2 ? 'Use the arrow keys to walk to a glowing circle. Then type!' : 'Arrow keys to walk, Enter to jump to the nearest site. Then type!');
}

let lastTick = performance.now();
function hostTick() {
  const now = performance.now(), dt = Math.min(2, (now - lastTick) / 1000);
  lastTick = now;
  if (!host || !(net.isHost || !net.hostId)) return;
  if (net.isHost) st.order = net.order; else st.order = [net.selfId];
  host.tick(dt);
  if (net.isHost) net.broadcast('state', st);
  handleEvents();
}

let lastPos = '', lastPosAt = 0;
function sendPos() {
  if (!net || !net.peers.size) return;
  const m = [Math.round(me.x), Math.round(me.y), Math.round(me.prog * 100), (me.walk ? 1 : 0) | (me.stumble > 0.4 ? 2 : 0), me.face];
  const k = m.join(), now = performance.now();
  if (k === lastPos && now - lastPosAt < 1000) return;
  lastPos = k; lastPosAt = now;
  net.broadcast('pos', m);
}

function zoneAt() {
  const D = district(st.d);
  let best = -1, bd = 1;
  D.sites.forEach((s, k) => {
    if (st.have[k] >= s.need) return;
    const dx = (me.x - s.x) / ZONE_R, dy = (me.y - s.y - 48) / (ZONE_R * 0.6);
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = k; }
  });
  return best;
}
function autoWalk() {
  const D = district(st.d);
  let best = null, bd = Infinity;
  D.sites.forEach((s, k) => {
    if (st.have[k] >= s.need) return;
    const d = Math.hypot(me.x - s.x, me.y - s.y - 48);
    if (d < bd) { bd = d; best = { x: s.x, y: s.y + 48 }; }
  });
  auto = best;
}

function finishPrompt(secs) {
  const boss = T.key === 'boss', p = T.p;
  const n = P.crane > 0 ? 2 : 1;
  if (P.crane > 0) P.crane--;
  net.toHost('done', { site: T.site, clean: T.clean, boss, n });
  sfx.load();
  if (boss && st.boss) fx.push({ text: '🧱', x: me.x, y: me.y - 60, vx: (st.boss.x - me.x) * 2.5, vy: (st.boss.y - 80 - me.y + 60) * 2.5, life: 0.4, size: 26 });
  else floatText(n === 2 ? '+2 🧱' : '+1 🧱', me.x, me.y - 100, '#c8553d');
  if (T.clean) {
    P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak);
    if (P.streak % 5 === 0 && P.shields < 3) { P.shields++; toast(`🛡️ ${P.streak} clean loads in a row! You earned a shield.`); }
  }
  if (p.burst && secs <= p.burst) floatText('⚡ Speed burst!', me.x, me.y - 130, '#e6a700', 24);
  const rankBefore = S.rankOf(P).i, stepBefore = P.step;
  const res = S.lessonPrompt(P);
  if (res) {
    toast(`${'⭐'.repeat(res.stars)} Lesson done: ${Math.round(res.acc * 100)}% accurate` + (res.stars === 3 ? '. Crane earned: 3 double loads!' : ''));
    if (res.promoted) {
      const fresh = P.step < S.STAGES.length ? `New keys: ${S.STAGES[P.step].keys.toUpperCase().split('').join(' and ')}` : `New job: ${S.stepName(P.step)}`;
      setTimeout(() => { toast(`🎉 Promotion! ${fresh}`, 'gold'); confetti(me.x, me.y - 60, 80); sfx.win(); }, 900);
    }
    if (res.ready) setTimeout(() => toast('You are ready for something new. It unlocks tomorrow: sleep makes fingers smarter!'), 900);
    if (res.demoted) setTimeout(() => toast('Let\'s spend a little more time on the last keys.'), 900);
    if (res.shiftDone && P.pacing) setTimeout(() => toast('🏁 Today\'s shift is done. Great work! Come back tomorrow for more. You can keep building for fun.', 'gold'), 1800);
  }
  for (const it of S.newUnlocks(P)) setTimeout(() => toast(`🎁 New in your wardrobe: ${it.e} ${it.name}`, 'gold'), 1400);
  if (S.rankOf(P).i !== rankBefore) { setTimeout(() => toast(`${S.rankOf(P).icon} You are now a ${S.rankOf(P).name}!`, 'gold'), 2200); sendProfile(); }
  S.saveProfile(P);
  T.p = null; T.key = stepBefore !== P.step ? null : T.key + '!'; // force a fresh prompt next frame
  me.prog = 0;
}

function updatePrompt() {
  const zone = st.boss ? -1 : zoneAt();
  const key = st.boss ? 'boss' : zone >= 0 ? `s${st.d}:${zone}:${myRole()}` : null;
  if (key !== T.key || (key && !T.p)) {
    const wasSite = T.key && T.key !== 'boss' && T.site >= 0 && st.have[T.site] >= district(st.d).sites[T.site].need || (T.key && T.key.startsWith('s') && !T.key.startsWith(`s${st.d}:`));
    T.key = key; T.site = zone;
    const els = { prompt: $('prompt'), found: $('found') };
    if (!key) {
      if (wasSite && !held.size) autoWalk(); // this building is done: stroll to the next one
      setPrompt(null, els, null);
      $('hint').textContent = 'Walk to a glowing circle with the arrow keys, or press Enter to go to the nearest one.';
    } else {
      const role = st.boss ? 0 : myRole();
      const p = S.genPrompt(P, role, !!st.boss);
      setPrompt(p, els, finishPrompt);
      $('hint').textContent = st.boss ? 'Throw bricks at the Typo Monster!'
        : p.show ? (p.hint ? `Fix it! It should say: ${p.hint}` : 'Spot the mistake, then type it the right way.')
          : p.perfect ? 'Perfect run: one slip sends you back to the start.'
            : p.burst ? `Speed burst: can you finish in ${p.burst} seconds?` : '';
    }
  }
  return zone;
}

let hudAt = 0;
function updateHud(now) {
  if (now - hudAt < 250) return;
  hudAt = now;
  const D = district(st.d);
  const left = D.sites.filter((s, k) => st.have[k] < s.need).length;
  $('district').textContent = `🏙️ ${D.name} · ${6 - left}/6`;
  const r = S.ROLES[myRole()];
  $('role').textContent = `${r.icon} ${r.name}: ${r.tip}`;
  $('combo').style.width = Math.min(100, st.combo * 100) + '%';
  $('bossbar').classList.toggle('hidden', !st.boss);
  if (st.boss) { $('bosshp').style.width = st.boss.hp / st.boss.max * 100 + '%'; $('bosstxt').textContent = `TYPO MONSTER · ${Math.ceil(st.boss.left)}s`; }
  const done = Math.min(S.SHIFT_LESSONS, P.day.lessons);
  $('shift').textContent = (P.pacing ? `Shift ${'●'.repeat(done)}${'○'.repeat(S.SHIFT_LESSONS - done)}` : `Lessons ${P.day.lessons}`) + ` · ${P.lesson.n}/${S.LESSON_LEN}`;
  $('powers').textContent = `🛡️${P.shields} 🏗️${P.crane}` + (now < bootsUntil ? ' 👟' : '') + ` 🔥${P.streak}`;
  $('crew').textContent = !net.ready ? '🔎 looking for builders…' : `👷 ${1 + others.size} in ${roomLabel}` + (net.isHost && others.size ? ' ★' : '');
  $('btnSound').textContent = P.sound ? '🔊' : '🔇';
}

const cv = $('cv'), ctx = cv.getContext('2d');
let vw = 0, vh = 0;
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  vw = innerWidth; vh = innerHeight;
  cv.width = vw * dpr; cv.height = vh * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  // walking
  let dx = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  let dy = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
  if (auto && !dx && !dy) {
    const ax = auto.x - me.x, ay = auto.y - me.y, d = Math.hypot(ax, ay);
    if (d < 8) auto = null; else { dx = ax / d; dy = ay / d; }
  }
  me.walk = !!(dx || dy);
  if (me.walk) {
    const len = Math.hypot(dx, dy), sp = (now < bootsUntil ? 360 : 240) * (me.stumble > 0 ? 0.3 : 1);
    me.x += dx / len * sp * dt; me.y += dy / len * sp * dt;
    if (Math.abs(dx) > 0.1) me.face = dx > 0 ? 1 : -1;
  }
  me.stumble = Math.max(0, me.stumble - dt);
  for (const o of others.values()) {
    o.x += (o.tx - o.x) * Math.min(1, dt * 12); o.y += (o.ty - o.y) * Math.min(1, dt * 12);
    o.stumble = Math.max(0, o.stumble - dt);
  }

  // pick-ups
  for (const it of st.items) {
    if (Math.hypot(it.x - me.x, it.y - me.y) < 34 && !asked.has(it.id)) { asked.add(it.id); net.toHost('grab', { id: it.id }); }
  }
  if (st.boss) { if (st.boss.hp < lastBossHp) bossHit = 0.25; lastBossHp = st.boss.hp; } else lastBossHp = 0;
  bossHit = Math.max(0, bossHit - dt);

  const modal = document.querySelector('.screen:not(.hidden)');
  const zone = modal ? -1 : updatePrompt();

  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.x += f.vx * dt; f.y += f.vy * dt; if (f.g) f.vy += f.g * dt;
    if ((f.life -= dt) <= 0) fx.splice(i, 1);
  }
  cam.x += (me.x - cam.x) * Math.min(1, dt * 6);
  cam.y += (me.y - 50 + $('panel').offsetHeight / 2 - cam.y) * Math.min(1, dt * 6);
  draw(ctx, {
    w: vw, h: vh, cam, st, t: now / 1000, me, others: [...others.values()].filter(o => o.seen && now - o.at < 6000),
    zone, weak: st.boss ? S.weakKeys(P, 4) : [], bossHit, fx,
  });
  updateHud(now);
}

// ---------- input ----------
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (mode === 'start' || (mode === 'game' && document.querySelector('.screen:not(.hidden)'))) return;
  if (mode === 'place') { if (e.key.length === 1) { e.preventDefault(); typeChar(e.key); } return; }
  if (e.key.startsWith('Arrow')) { held.add(e.key); auto = null; e.preventDefault(); return; }
  if (e.key === 'Enter') { autoWalk(); e.preventDefault(); return; }
  if (e.key === 'Tab' || e.key === 'Backspace') { e.preventDefault(); return; }
  if (e.key.length === 1) { e.preventDefault(); typeChar(e.key); }
});
addEventListener('keyup', e => held.delete(e.key));
addEventListener('blur', () => held.clear());

// ---------- wardrobe and grown-ups ----------
function openWardrobe() {
  const list = $('wearlist'); list.innerHTML = '';
  for (const [slot, title] of [['hat', 'Hats'], ['tool', 'Tools'], ['pet', 'Pets'], ['ride', 'Rides']]) {
    const h = document.createElement('h3'); h.textContent = title; list.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'items';
    for (const it of S.ITEMS.filter(i => i.slot === slot)) {
      const ok = it.ok(P);
      const b = document.createElement('button');
      b.className = 'item' + (ok ? '' : ' locked') + (P.wear[slot] === it.id ? ' sel' : '');
      const e = document.createElement('span'); e.className = 'e'; e.textContent = ok ? (it.e || (slot === 'hat' ? '⛑️' : '–')) : '🔒';
      const t = document.createElement('span'); t.textContent = it.name;
      const sm = document.createElement('small'); sm.textContent = ok ? '' : it.how; t.appendChild(sm);
      b.append(e, t);
      if (ok) b.onclick = () => { P.wear[slot] = it.id; S.saveProfile(P); sendProfile(); openWardrobe(); };
      grid.appendChild(b);
    }
    list.appendChild(grid);
  }
  $('wear').classList.remove('hidden');
}
function openAdult() {
  const sel = $('aStep'); sel.innerHTML = '';
  for (let i = 0; i <= S.MAX_STEP; i++) {
    const o = document.createElement('option'); o.value = i;
    o.textContent = `${i + 1}. ${S.stepName(i)}` + (i < S.STAGES.length ? ` (${S.STAGES[i].keys.toUpperCase()})` : '');
    sel.appendChild(o);
  }
  sel.value = P.step; $('aPacing').checked = P.pacing; $('aGuide').checked = P.guide;
  $('aRoom').value = new URLSearchParams(location.hash.slice(1)).get('room') || '';
  const weak = S.weakKeys(P, 6).map(k => (k === ' ' ? 'space' : k.toUpperCase())).join(' ');
  $('aStats').textContent = `Loads delivered: ${P.loads} · three-star lessons: ${P.stars3} · best clean streak: ${P.bestStreak} · days played: ${P.days} · ` +
    `progress to next step: ${P.credits}/${S.CREDITS_TO_ADVANCE}` + (weak ? ` · keys to work on: ${weak}` : '');
  $('adult').classList.remove('hidden');
}
$('btnWear').onclick = openWardrobe;
$('btnAdult').onclick = openAdult;
$('btnSound').onclick = () => { P.sound = !P.sound; S.saveProfile(P); if (!P.sound) window.speechSynthesis?.cancel(); };
$('aStep').onchange = e => { P.step = +e.target.value; P.credits = 0; P.lesson = { n: 0, hit: 0, miss: 0 }; T.key = null; S.saveProfile(P); };
$('aPacing').onchange = e => { P.pacing = e.target.checked; S.saveProfile(P); };
$('aGuide').onchange = e => { P.guide = e.target.checked; S.saveProfile(P); };
$('aJoin').onclick = () => { const c = $('aRoom').value.trim(); location.hash = c ? 'room=' + encodeURIComponent(c) : ''; location.reload(); };
$('aRetest').onclick = () => { P.placed = false; S.saveProfile(P); location.reload(); };
$('aReset').onclick = () => { if (confirm('Erase this player\'s progress on this device?')) { S.resetProfile(); location.reload(); } };
document.querySelectorAll('.screen .close').forEach(b => { b.onclick = () => { b.closest('.screen').classList.add('hidden'); b.blur(); }; });
document.querySelectorAll('#hud button').forEach(b => b.addEventListener('click', () => b.blur()));

initStart();
window.__qq = { P, get st() { return st; }, get net() { return net; }, me, T }; // for debugging in the console
