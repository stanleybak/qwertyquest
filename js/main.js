// QwertyQuest: screens, input, the typing engine, and the frame loop.
import * as S from './skill.js';
import { Net, findRoom } from './net.js';
import { Host, newState, loadWorld, saveWorld, district, ZONE_R, JOBS, onRiver, walkable, cellOf } from './world.js';
import * as Voice from './voice.js';
import { missionFor, drawInterior } from './missions.js';
import { draw, drawPlayer, COLORS } from './render.js';

const $ = id => document.getElementById(id);
const BUILD = '2026-11-13d';
const P = S.loadProfile();
let mode = 'start';            // start | place | game
let st = newState();           // shared city state (host-owned)
let host = null;               // rules engine, present while this peer runs the game
let net = null, roomId = null, roomLabel = '';
let lastEv = 0, gotState = false, savedTotal = -1;
const me = { x: 0, y: 60, face: 1, walk: false, stumble: 0, prog: 0, me: true, act: -1, boat: false };
const others = new Map();
const held = new Set();
let auto = null, bootsUntil = 0, bossHit = 0, lastBossHp = 0;
const fx = [];
const cam = { x: 0, y: 0 };
const asked = new Set();
let curJob = 0;
let inside = null;             // { id, m, placed, pop } while visiting a building
let doorId = null, nagAt = 0;

// ---------- sound ----------
let ac = null;
function beep(freq, dur = 0.07, type = 'sine', vol = 0.08, when = 0) {
  if (!P.sound) return;
  try {
    ac ||= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(0.0002, vol * P.vol * 1.6), ac.currentTime + when);
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
// Speech uses whatever voices the device has. Pick the most natural English one.
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  const want = [/natural/i, /Google US English/i, /Samantha|Ava|Allison/i, /Aria|Jenny|Zira/i, /Google/i, /en[-_]US/i];
  for (const re of want) {
    const v = vs.find(x => re.test(x.name) || re.test(x.lang));
    if (v) { voice = v; return; }
  }
  voice = vs[0] || null;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
function say(text) {
  if (!P.sound || !P.vol || !text || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = 0.9; u.volume = Math.min(1, P.vol * 1.3);
    speechSynthesis.speak(u);
  } catch { /* no speech */ }
}
const vol = () => Math.min(1, P.vol * 1.3);
const KEY_NAMES = { ';': 'semicolon', ',': 'comma', '.': 'period', '/': 'slash', ' ': 'space' };
// letter drills: say just the next letter, by name
function sayLetter(c) {
  if (!P.sound || !P.vol || Voice.busy('npc')) return;
  const name = KEY_NAMES[c] || c.toLowerCase();
  if (!Voice.play('l/' + name, vol(), 'word')) say(KEY_NAMES[c] || c.toUpperCase());
}
/** Read a word prompt aloud: recorded clips when we have them, the device voice otherwise. */
function sayWords(text) {
  if (!P.sound || !P.vol || Voice.busy('npc')) return;
  const keys = text.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(w => 'w/' + w);
  if (!Voice.play(keys, vol(), 'word')) say(text);
}
/** A character speaks. Lines are recorded by tools/build_voices.py. */
function npc(...ids) {
  if (!P.sound || !P.vol) return;
  Voice.play(ids.map(i => 'n/' + i).filter(Voice.has), vol(), 'npc');
}
/** Say a tutorial line only the first time it is relevant. */
function tip(id) { if (P.tips[id]) return; P.tips[id] = 1; npc(id); }

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
const KEY_PITCH = 34; // key width plus gap, in px (matches style.css)
const keyEl = {}; // char -> { el, shift, right }
function buildKb() {
  const kb = $('kb'); kb.innerHTML = '';
  KB.forEach(([lo, up, fing], r) => {
    const row = document.createElement('div'); row.className = 'r';
    // real keyboards stagger the rows: Q sits 1.5 keys in, A 1.75, Z 2.25
    row.style.paddingLeft = [0, 1.5, 1.75, 0][r] * KEY_PITCH + 'px';
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
  row.style.paddingLeft = 4 * KEY_PITCH + 'px';
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
  if (S.tierOf(P.step) <= 2 && mode === 'game') p.spaced ? sayLetter(p.text[0]) : p.say && sayWords(p.say);
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
    if (T.p.spaced && mode === 'game') sayLetter(T.p.text[T.pos]);
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
    endPlacement(PL.placed);
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
    data.jobs ||= [];
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
      o.boat = !!(data[3] & 4); o.inside = !!(data[3] & 8); o.act = data[5] | 0;
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
    if (ev.t === 'built') { const s = district(ev.d).sites[ev.site]; if (s) confetti(s.x, s.y - 80); sfx.win(); tip('built'); }
    else if (ev.t === 'district') {
      toast(`🎉 ${ev.name} is finished! A new neighborhood opens: ${district(ev.d + 1).name}`, 'gold');
      confetti(me.x, me.y - 60, 120); sfx.win(); npc('district');
    } else if (ev.t === 'gold') { toast('⭐ Team combo! Bonus bricks for every site.', 'gold'); sfx.win(); npc('combo'); }
    else if (ev.t === 'boss') { toast('👾 A Typo Monster! Type to pelt it with bricks. Its weak spots are YOUR tricky keys.'); npc('boss'); }
    else if (ev.t === 'bossWin') { toast('🏆 The Typo Monster ran away! Bonus bricks for everyone.', 'gold'); confetti(me.x, me.y - 60, 100); sfx.win(); npc('bosswin'); }
    else if (ev.t === 'bossFlee') { toast('The Typo Monster kicked a brick loose and wandered off.'); npc('bossflee'); }
    else if (ev.t === 'job') { toast('🚨 ' + JOBS[ev.jt].call); npc('job' + ev.jt); beep(880, 0.12, 'square', 0.05); beep(660, 0.12, 'square', 0.05, 0.14); }
    else if (ev.t === 'jobGone') { toast(ev.jt === 3 ? 'The brick thief got away this time.' : 'That problem sorted itself out.'); if (ev.jt === 3) npc('job3gone'); }
    else if (ev.t === 'jobDone') {
      const names = (ev.who || []).map(id => (id === net.selfId ? me.name : others.get(id)?.name)).filter(Boolean);
      toast(`${JOBS[ev.jt].icon} ${names.join(' and ') || 'The crew'} ${JOBS[ev.jt].done}! The neighbors sent bricks to say thanks.`, 'gold');
      ['🙋 Thank you!', '🙆 You saved the day!', '❤️', '❤️'].forEach((t, i) => setTimeout(() => floatText(t, ev.x - 60 + i * 40, ev.y - 30 - (i % 2) * 24, '#d6336c', 18), i * 350));
      confetti(ev.x, ev.y - 40, 50); sfx.win(); npc(`job${ev.jt}done`);
      if ((ev.who || []).includes(net.selfId)) { P.thanks++; for (const it of S.newUnlocks(P)) toast(`🎁 New in your wardrobe: ${it.e} ${it.name}`, 'gold'); S.saveProfile(P); }
    }
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
  if (!P.tips.hello) { P.tips.hello = 1; npc('hello', 'walk'); }
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
  const m = [Math.round(me.x), Math.round(me.y), Math.round(me.prog * 100), (me.walk ? 1 : 0) | (me.stumble > 0.4 ? 2 : 0) | (me.boat ? 4 : 0) | (inside ? 8 : 0), me.face, me.act];
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
/** The city problem this player is standing at, if any. */
function jobAt() {
  let best = null, bd = 100;
  for (const j of st.jobs || []) {
    let d = Math.hypot(me.x - j.px, (me.y - j.py) / 0.7);
    if (j.id === curJob && d < 280) d = 0; // once you have started, a wandering thief cannot shake you off easily
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}
function autoWalk() {
  const D = district(st.d);
  let best = null, bd = Infinity;
  for (const j of st.jobs || []) {
    const d = Math.hypot(me.x - j.px, me.y - j.py) * 0.6; // problems are a bit more tempting than bricks
    if (d < bd) { bd = d; best = { x: j.px, y: j.py, job: j.id }; }
  }
  D.sites.forEach((s, k) => {
    if (st.have[k] >= s.need) return;
    const d = Math.hypot(me.x - s.x, me.y - s.y - 48);
    if (d < bd) { bd = d; best = { x: s.x, y: s.y + 48 }; }
  });
  auto = best;
}

/** The finished building whose door this player is standing at, as "district:site". */
function doorAt() {
  const i = cellOf(me.x, me.y);
  if (i === undefined || i > st.d) return null;
  const D = district(i);
  for (let k = 0; k < 6; k++) {
    const s = D.sites[k];
    if (i === st.d && st.have[k] < s.need) continue;
    if (Math.hypot(me.x - s.x, (me.y - s.y - 48) / 0.6) < ZONE_R) return `${i}:${k}`;
  }
  return null;
}
function enterBuilding(id) {
  const [i, k] = id.split(':').map(Number);
  const m = missionFor(i, k, district(i).sites[k].kind);
  inside = { id, m, placed: Math.min(m.items.length, P.rooms[id] | 0), pop: 1 };
  auto = null; held.clear();
  npc(inside.placed >= m.items.length ? `m_${m.id}_done` : `m_${m.id}`);
}
function leaveBuilding() { inside = null; T.key = null; Voice.stop(); }

function finishPrompt(secs) {
  const key = T.key, boss = key === 'boss', p = T.p;
  const job = key.startsWith('j') ? +key.slice(1) : 0;
  const bricks = !job && !boss; // building work, outdoors or indoors
  const n = bricks && P.crane > 0 ? 2 : 1;
  if (n === 2) P.crane--;
  net.toHost('done', { site: inside ? -1 : T.site, clean: T.clean, boss, n, job });
  sfx.load();
  if (inside) {
    inside.placed++; inside.pop = 0; P.rooms[inside.id] = inside.placed;
    if (inside.placed >= inside.m.items.length) {
      P.thanks++; P.crane += 3;
      toast(`❤️ ${inside.m.who} says thank you! You earned a crane: 3 double loads.`, 'gold');
      sfx.win(); npc(`m_${inside.m.id}_done`);
    }
  } else if (job) floatText(['💦 splash!', '🔧 clank!', '🪜 up!', '🚨 stop!'][T.jobType] || '👍', me.x, me.y - 100, '#2f7de1');
  else if (boss && st.boss) fx.push({ text: '🧱', x: me.x, y: me.y - 60, vx: (st.boss.x - me.x) * 2.5, vy: (st.boss.y - 80 - me.y + 60) * 2.5, life: 0.4, size: 26 });
  else floatText(n === 2 ? '+2 🧱' : '+1 🧱', me.x, me.y - 100, '#c8553d');
  if (T.clean) {
    P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak);
    if (P.streak % 5 === 0 && P.shields < 3) { P.shields++; toast(`🛡️ ${P.streak} clean in a row! You earned a shield: it forgives your next slip.`); }
  }
  if (p.burst && secs <= p.burst) floatText('⚡ Speed burst!', me.x, me.y - 130, '#e6a700', 24);
  const rankBefore = S.rankOf(P).i, stepBefore = P.step;
  const res = S.lessonPrompt(P);
  if (res) {
    toast(`${'⭐'.repeat(res.stars)} Lesson done: ${Math.round(res.acc * 100)}% accurate` + (res.stars === 3 ? '. Crane earned: 3 double loads!' : ''));
    if (res.promoted) {
      const fresh = P.step < S.STAGES.length ? `New keys: ${S.STAGES[P.step].keys.toUpperCase().split('').join(' and ')}` : `New job: ${S.stepName(P.step)}`;
      setTimeout(() => { toast(`🎉 Promotion! ${fresh}`, 'gold'); confetti(me.x, me.y - 60, 80); sfx.win(); npc('promo'); }, 900);
    }
    if (res.ready) setTimeout(() => toast('You are ready for something new. It unlocks tomorrow: sleep makes fingers smarter!'), 900);
    if (res.demoted) setTimeout(() => toast('Let\'s spend a little more time on the last keys.'), 900);
    if (res.shiftDone && P.pacing) setTimeout(() => { toast('🏁 Today\'s shift is done. Great work! Come back tomorrow for more. You can keep building for fun.', 'gold'); npc('shift'); }, 1800);
  }
  for (const it of S.newUnlocks(P)) setTimeout(() => toast(`🎁 New in your wardrobe: ${it.e} ${it.name}`, 'gold'), 1400);
  if (S.rankOf(P).i !== rankBefore) { setTimeout(() => toast(`${S.rankOf(P).icon} You are now a ${S.rankOf(P).name}!`, 'gold'), 2200); sendProfile(); }
  S.saveProfile(P);
  T.p = null; T.key = stepBefore !== P.step ? null : key + '!'; // force a fresh prompt next frame
  me.prog = 0;
}

/** Decide what, if anything, this player should be typing right now. */
function updatePrompt() {
  let job = null, zone = -1, key;
  if (inside) key = inside.placed < inside.m.items.length ? `i${inside.id}:${inside.placed}` : null;
  else {
    job = st.boss ? null : jobAt();
    zone = st.boss || job ? -1 : zoneAt();
    key = st.boss ? 'boss' : job ? `j${job.id}` : zone >= 0 ? `s${st.d}:${zone}:${myRole()}` : null;
  }
  doorId = !inside && !key ? doorAt() : null;
  me.act = job ? job.t : -1; curJob = job ? job.id : 0;
  const idle = inside ? 'All done here. Press Esc to go back outside.'
    : doorId ? (P.rooms[doorId] >= 6 ? '🚪 Press Enter to visit.' : '🚪 Someone inside needs help! Press Enter to go in.')
      : 'Walk to a glowing circle with the arrow keys, or press Enter to go to the nearest one.';
  if (!key && !T.p) $('hint').textContent = idle;
  if (key !== T.key || (key && !T.p)) {
    const wasSite = T.key && T.key.startsWith('s') && T.site >= 0 && (st.have[T.site] >= district(st.d).sites[T.site].need || !T.key.startsWith(`s${st.d}:`));
    T.key = key; T.site = zone;
    const els = { prompt: $('prompt'), found: $('found') };
    if (!key) {
      if (wasSite && !held.size && !P.tips.built2) { P.tips.built2 = 1; } // first finished building: stay put so the door tip makes sense
      else if (wasSite && !held.size) autoWalk(); // this building is done: stroll to the next one
      setPrompt(null, els, null);
      $('hint').textContent = idle;
    } else {
      const role = st.boss || job || inside ? 0 : myRole();
      T.jobType = job ? job.t : -1;
      const p = S.genPrompt(P, role, !!st.boss && !inside);
      setPrompt(p, els, finishPrompt);
      tip('type');
      $('hint').textContent = inside ? `Type to bring in the next thing for ${inside.m.who}.`
        : st.boss ? 'Throw bricks at the Typo Monster!'
          : job ? JOBS[job.t].hint
            : p.show ? (p.hint ? `Fix it! It should say: ${p.hint}` : 'Spot the mistake, then type it the right way.')
              : p.perfect ? 'Perfect run: one slip sends you back to the start.'
                : p.burst ? `Speed burst: can you finish in ${p.burst} seconds?` : 'Type it to deliver a load of bricks.';
    }
  }
  return zone;
}

// Builders we have actually heard from lately. A closed tab can linger in the
// mesh for a while, so the connection list alone overcounts.
const liveOthers = now => [...others.values()].filter(o => o.seen && now - o.at < 6000);

function debugInfo() {
  const now = performance.now(), short = id => (id || '').slice(0, 6);
  return JSON.stringify({
    build: BUILD, time: new Date().toISOString(), room: roomLabel, roomId: short(roomId),
    self: short(net?.selfId), host: short(net?.hostId), isHost: net?.isHost, ready: net?.ready,
    order: (net?.order || []).map(short),
    peers: [...(net?.peers || [])].map(id => {
      const o = others.get(id);
      return { id: short(id), name: o?.name, seen: !!o?.seen, posAgeMs: o?.at ? Math.round(now - o.at) : null };
    }),
    hostHeardAgeMs: net?.heard ? Math.round(now - net.heard) : null,
    city: { d: st.d, have: st.have, total: st.total, boss: !!st.boss, jobs: (st.jobs || []).map(j => `${JOBS[j.t].name}:${j.hp}`), roles: Object.values(st.roles || {}) },
    player: { step: P.step, lessonsToday: P.day.lessons, credits: P.credits },
    ua: navigator.userAgent,
  }, null, 1);
}

let hudAt = 0;
function updateHud(now) {
  if (now - hudAt < 250) return;
  hudAt = now;
  const D = district(st.d);
  const left = D.sites.filter((s, k) => st.have[k] < s.need).length;
  $('district').textContent = `🏙️ ${D.name}: ${6 - left} of 6 built`;
  const r = S.ROLES[myRole()];
  $('role').textContent = `Your job: ${r.icon} ${r.name}`;
  $('combo').style.width = Math.min(100, st.combo * 100) + '%';
  $('bossbar').classList.toggle('hidden', !st.boss);
  if (st.boss) { $('bosshp').style.width = st.boss.hp / st.boss.max * 100 + '%'; $('bosstxt').textContent = `TYPO MONSTER · ${Math.ceil(st.boss.left)}s`; }
  const done = Math.min(S.SHIFT_LESSONS, P.day.lessons);
  $('shift').textContent = P.pacing ? `Today ${'⭐'.repeat(done)}${'☆'.repeat(S.SHIFT_LESSONS - done)}` : `Lessons today: ${P.day.lessons}`;
  const pw = [P.shields ? `🛡️×${P.shields}` : '', P.crane ? `🏗️×${P.crane}` : '', now < bootsUntil ? '👟' : '', P.streak >= 3 ? `🔥${P.streak}` : ''].filter(Boolean).join('  ');
  $('powers').textContent = pw; $('powers').classList.toggle('hidden', !pw);
  $('crew').textContent = !net.ready ? '🔎 looking for builders…' : `👷 ${1 + liveOthers(now).length} in ${roomLabel}` + (net.isHost && others.size ? ' ★' : '');
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
  let dx = inside ? 0 : (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  let dy = inside ? 0 : (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
  if (inside) { auto = null; inside.pop += dt; }
  if (auto && !dx && !dy) {
    const ax = auto.x - me.x, ay = auto.y - me.y, d = Math.hypot(ax, ay);
    if (d < (auto.job ? 40 : 8)) auto = null; else { dx = ax / d; dy = ay / d; }
  }
  me.walk = !!(dx || dy);
  if (me.walk) {
    const len = Math.hypot(dx, dy), sp = (now < bootsUntil ? 360 : 240) * (me.stumble > 0 ? 0.3 : 1) * (me.boat ? 0.6 : 1);
    const nx = me.x + dx / len * sp * dt, ny = me.y + dy / len * sp * dt;
    if (walkable(nx, ny, st.d)) { me.x = nx; me.y = ny; }
    else if (walkable(nx, me.y, st.d)) me.x = nx;
    else if (walkable(me.x, ny, st.d)) me.y = ny;
    else auto = null;
    if (!walkable(nx, ny, st.d) && now - nagAt > 12000) { nagAt = now; toast('🔒 That land is locked. Finish this neighborhood to open more of the city.'); npc('locked'); }
    if (Math.abs(dx) > 0.1) me.face = dx > 0 ? 1 : -1;
  }
  me.stumble = Math.max(0, me.stumble - dt);
  if (!walkable(me.x, me.y, st.d)) { const D = district(st.d); me.x = D.cx; me.y = D.cy + 45; } // the city changed under us
  const wasBoat = me.boat;
  me.boat = onRiver(me.x, me.y, st.d);
  if (me.boat && !wasBoat) tip('river');
  if (auto?.job) { const j = st.jobs.find(x => x.id === auto.job); if (j) { auto.x = j.px; auto.y = j.py; } else auto = null; }
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
  if (inside) {
    drawInterior(ctx, { w: vw, h: vh, ph: $('panel').offsetHeight, t: now / 1000, m: inside.m, placed: inside.placed, pop: inside.pop, drawMe: (x, y) => drawPlayer(ctx, { ...me, boat: false, walk: false }, x, y, now / 1000) });
    updateHud(now);
    return;
  }
  draw(ctx, {
    w: vw, h: vh, cam, st, t: now / 1000, me, others: liveOthers(now).filter(o => !o.inside),
    door: doorId, roomDone: id => P.rooms[id] >= 6,
    zone, job: curJob, weak: st.boss ? S.weakKeys(P, 4) : [], bossHit, fx,
  });
  updateHud(now);
}

// ---------- input ----------
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (mode === 'start' || (mode === 'game' && document.querySelector('.screen:not(.hidden)'))) return;
  if (mode === 'place') { if (e.key.length === 1) { e.preventDefault(); typeChar(e.key); } return; }
  if (e.key.startsWith('Arrow')) { held.add(e.key); auto = null; e.preventDefault(); return; }
  if (e.key === 'Escape' && inside) { leaveBuilding(); e.preventDefault(); return; }
  if (e.key === 'Enter') { if (!inside) doorId && !T.p ? enterBuilding(doorId) : autoWalk(); e.preventDefault(); return; }
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
$('vol').value = P.vol;
$('vol').oninput = e => { P.vol = +e.target.value; P.sound = P.vol > 0; S.saveProfile(P); };
$('vol').onchange = e => { sfx.load(); e.target.blur(); };
$('btnSound').onclick = () => { P.sound = !P.sound; if (P.sound && !P.vol) P.vol = 0.7; $('vol').value = P.sound ? P.vol : 0; S.saveProfile(P); if (!P.sound) window.speechSynthesis?.cancel(); };
$('aStep').onchange = e => { P.step = +e.target.value; P.credits = 0; P.lesson = { n: 0, hit: 0, miss: 0 }; T.key = null; S.saveProfile(P); };
$('aPacing').onchange = e => { P.pacing = e.target.checked; S.saveProfile(P); };
$('aGuide').onchange = e => { P.guide = e.target.checked; S.saveProfile(P); };
$('aDebug').onclick = () => {
  const out = $('aDebugOut'); out.value = debugInfo(); out.classList.remove('hidden'); out.select();
  navigator.clipboard?.writeText(out.value).then(() => toast('Debug info copied.'), () => {});
};
$('aJoin').onclick = () => { const c = $('aRoom').value.trim(); location.hash = c ? 'room=' + encodeURIComponent(c) : ''; location.reload(); };
$('aRetest').onclick = () => { P.placed = false; S.saveProfile(P); location.reload(); };
$('aReset').onclick = () => { if (confirm('Erase this player\'s progress on this device?')) { S.resetProfile(); location.reload(); } };
document.querySelectorAll('.screen .close').forEach(b => { b.onclick = () => { b.closest('.screen').classList.add('hidden'); b.blur(); }; });
document.querySelectorAll('#hud button').forEach(b => b.addEventListener('click', () => b.blur()));

initStart();
window.__qq = { P, get st() { return st; }, get net() { return net; }, me, T }; // for debugging in the console
