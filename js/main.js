// QwertyQuest: screens, input, the typing engine, and the frame loop.
import * as S from './skill.js';
import { Net, findRoom } from './net.js';
import { Host, newState, loadWorlds, saveWorld, legacyWorld, district, ZONE_R, JOBS, onRiver, walkable, cellOf } from './world.js';
import * as Voice from './voice.js';
import { missionFor, drawInterior, nearSpot } from './missions.js';
import { draw, drawPlayer, COLORS } from './render.js';
import * as G from './games.js';
import DATA from './content-data.js';
import VERSION from './version.js';

const $ = id => document.getElementById(id);
const BUILD = '2026-11-14i';
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
const redo = [];               // prompts typed with a slip; each comes back until it is typed clean
let redoGap = 0, lastSlip = false, redoDeck = '';
const CH = { opts: null, buf: '', clean: true }; // a choice of labelled things: type one label to pick it
let engaged = null;            // what the player chose to work on by pressing Enter, e.g. 's0:2', 'j5', 'boss'

// ---------- sound ----------
let ac = null;
function beep(freq, dur = 0.07, type = 'sine', vol = 0.08, when = 0) {
  if (!P.sound) return;
  try {
    ac ||= new AudioContext();
    if (ac.state === 'suspended') ac.resume(); // after a reload the browser waits for a key press
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(0.0002, vol * P.vol * 1.6), ac.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + when + dur);
    o.connect(g).connect(ac.destination);
    o.start(ac.currentTime + when); o.stop(ac.currentTime + when + dur);
  } catch { /* no audio */ }
}
const sfx = {
  key: () => beep(620 + Math.random() * 60, 0.04, 'triangle', 0.03),
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
const KEY_NAMES = { ';': 'semicolon', ',': 'comma', '.': 'period', '/': 'slash', ' ': 'space', '\'': 'apostrophe' };
// letter drills: say just the next letter, by name
function sayLetter(c) {
  if (!P.sound || !P.vol || Voice.busy('npc')) return;
  const name = KEY_NAMES[c] || c.toLowerCase();
  if (!Voice.play('l/' + name, vol(), 'word')) say(KEY_NAMES[c] || c.toUpperCase());
}
/** Read a word prompt aloud: recorded clips when we have them, the device voice otherwise. */
function sayWords(text) {
  if (!P.sound || !P.vol || Voice.busy('npc')) return;
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (Voice.play('p/' + words.join('-'), vol(), 'word')) return; // a whole phrase, recorded in one breath
  if (!Voice.play(words.map(w => 'w/' + w), vol(), 'word')) say(text);
}
/** A character speaks. Lines are recorded by tools/build_voices.py. */
function npc(...ids) {
  if (!P.sound || !P.vol) return;
  window.speechSynthesis?.cancel();
  Voice.play(ids.map(i => 'n/' + i).filter(Voice.has), vol(), 'npc');
}
/** Say a tutorial line only the first time it is relevant. */
function tip(id) { if (P.tips[id]) return; P.tips[id] = 1; npc(id); }

// ---------- toasts and effects ----------
function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls; el.textContent = text;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 2) $('toasts').firstChild.remove(); // never a wall of messages
  setTimeout(() => el.remove(), 4200);
}
function floatText(text, x, y, color, size) { fx.push({ text, x, y, vx: 0, vy: -40, life: 1.2, color, size }); }
function confetti(x, y, n = 40) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, v = 80 + Math.random() * 220;
    fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, g: 420, life: 0.8 + Math.random() * 0.8, color: COLORS[i % COLORS.length] });
  }
}

/** Fireworks the first time a brand-new key is pressed correctly. */
function firstHit(ch) {
  const k = P.keys[ch.toLowerCase()];
  if (mode !== 'game' || !k || k.star || P.step >= S.STAGES.length || !S.STAGES[P.step].keys.includes(ch.toLowerCase())) return;
  k.star = 1;
  const r = $('panel').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top - 40;
  const add = (text, x, y, dx, dy, size, delay) => {
    const el = document.createElement('span');
    el.className = 'spark'; el.textContent = text;
    el.style.cssText = `left:${x}px;top:${y}px;font-size:${size}px;--dx:${dx}px;--dy:${dy}px;animation-delay:${delay}ms`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500 + delay);
  };
  for (let burst = 0; burst < 3; burst++) { // three bursts, like fireworks
    const bx = cx + (burst - 1) * 190, by = cy - 90 - (burst === 1 ? 70 : 0);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, d = 90 + Math.random() * 70;
      add(['⭐', '✨', '🌟'][i % 3], bx, by, Math.cos(a) * d, Math.sin(a) * d, 22 + Math.random() * 14, burst * 220);
    }
  }
  add(`${ch.toUpperCase()} ⭐`, cx, cy - 60, 0, -70, 64, 0);
  [784, 988, 1175, 1568].forEach((f, i) => beep(f, 0.18, 'triangle', 0.09, i * 0.09));
  toast(`🎆 Your first ${ch.toUpperCase()}! You found a new key.`, 'gold');
}

// ---------- keyboard guide ----------
// Each row: unshifted keys, shifted keys, which finger presses each. Both layouts share the fingers.
const FING = [[0, 0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7], [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7, 7], [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7], [0, 1, 2, 3, 3, 4, 4, 5, 6, 7]];
const KBS = {
  qwerty: [['`1234567890-=', '~!@#$%^&*()_+'], ['qwertyuiop[]\\', 'QWERTYUIOP{}|'], ['asdfghjkl;\'', 'ASDFGHJKL:"'], ['zxcvbnm,./', 'ZXCVBNM<>?']],
  dvorak: [['`1234567890[]', '~!@#$%^&*(){}'], ['\',.pyfgcrl/=\\', '"<>PYFGCRL?+|'], ['aoeuidhtns-', 'AOEUIDHTNS_'], [';qjkxbmwvz', ':QJKXBMWVZ']],
};
// Dvorak is read from which physical key went down, so it works on a keyboard
// (and a computer) that is set up for QWERTY.
const CODES = [
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];
const DV = {};
CODES.forEach((row, r) => row.forEach((code, i) => { DV[code] = [KBS.dvorak[r][0][i], KBS.dvorak[r][1][i]]; }));
/** The character a key press types on the player's chosen layout, or null. */
function charOf(e) {
  if (P.layout === 'dvorak' && DV[e.code]) return DV[e.code][e.shiftKey ? 1 : 0];
  return e.key.length === 1 ? e.key : null;
}
const FINGERS = ['left pinky', 'left ring finger', 'left middle finger', 'left pointer finger', 'right pointer finger', 'right middle finger', 'right ring finger', 'right pinky'];
function fingerOf(c) {
  const rows = KBS[P.layout] || KBS.qwerty;
  for (let r = 0; r < 4; r++) { const i = rows[r][0].indexOf(c); if (i >= 0) return FINGERS[FING[r][i]]; }
  return '';
}
const keyEl = {}; // char -> { el, shift, right }
let kbShown = null, kbNext = null;
function buildKb() {
  const kb = $('kb'); kb.innerHTML = '';
  for (const k in keyEl) delete keyEl[k];
  kbShown = kbNext = null;
  (KBS[P.layout] || KBS.qwerty).forEach(([lo, up], r) => {
    const fing = FING[r];
    const row = document.createElement('div'); row.className = 'r';
    // real keyboards stagger the rows: Q sits 1.5 keys in, A 1.75, Z 2.25
    row.style.paddingLeft = `calc(var(--kp) * ${[0, 1.5, 1.75, 0][r]})`; // --kp: key width plus gap (style.css)
    const add = (label, cls) => { const k = document.createElement('div'); k.className = 'k ' + cls; k.textContent = label; row.appendChild(k); return k; };
    if (r === 3) keyEl.shiftL = add('shift', 'wide f0');
    [...lo].forEach((c, i) => {
      const el = add(c.toUpperCase(), `f${fing[i]}` + (r === 2 && (i < 4 || (i > 5 && i < 10)) ? ' home' : ''));
      keyEl[c] = { el, shift: false, right: fing[i] >= 4 };
      keyEl[up[i]] = { el, shift: true, right: fing[i] >= 4 };
    });
    if (r === 3) keyEl.shiftR = add('shift', 'wide f7');
    kb.appendChild(row);
  });
  const row = document.createElement('div'); row.className = 'r';
  row.style.paddingLeft = 'calc(var(--kp) * 4)';
  const sp = document.createElement('div'); sp.className = 'k space f8 on'; sp.textContent = 'space';
  row.appendChild(sp); kb.appendChild(row);
  keyEl[' '] = { el: sp, shift: false, right: false };
}
function updateKb(next) {
  const kb = $('kb');
  // The guide is a crutch, so it only appears when it helps: while keys are
  // new, after a slip, or when the player has been stuck on a key for a while.
  const show = mode === 'place' ? !!T.p : P.guide && mode === 'game' && (!!T.p || !!CH.opts)
    && (P.fresh > 0 || P.step < 5 || (P.layout === 'dvorak' && P.step < S.STAGES.length) || T.miss > 0 || performance.now() - Math.max(T.last, T.shown) > 4000);
  if (show === kbShown && next === kbNext) return;
  kbShown = show; kbNext = next;
  kb.classList.toggle('hidden', !show);
  if (!show) return;
  const known = mode === 'game' && P.step < S.STAGES.length ? S.cumKeys(P.step) : null;
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
const T = { shown: 0, errs: new Set(), p: null, pos: 0, clean: true, last: 0, t0: 0, hits: 0, miss: 0, els: null, onDone: null, key: null };

function setPrompt(p, els, onDone) {
  T.p = p; T.pos = 0; T.clean = true; T.hits = 0; T.miss = 0; T.bad = new Set(); T.t0 = 0; T.errs = new Set(); T.shown = performance.now(); T.els = els; T.onDone = onDone;
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
    firstHit(want);
    sfx.key();
    if (T.pos >= T.p.text.length) { const cb = T.onDone; cb((now - T.t0) / 1000); return; }
    paintPrompt();
    if (T.p.spaced && mode === 'game') sayLetter(T.p.text[T.pos]);
    return;
  }
  S.recordKey(P, want, false, 0);
  T.miss++; T.bad.add(T.pos); T.errs.add(want === ' ' ? 'space' : want.toLowerCase());
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

// ---------- choices: several labels on offer, type one to pick it ----------
const choosing = () => !!inside && !inside.job && (inside.m.game === 'maze' || inside.m.game === 'order');
/** The key the guide should point at: only known when one choice is left in play. */
function nextKey() {
  if (T.p) return T.p.text[T.pos];
  if (!CH.opts || !CH.buf) return null;
  const live = CH.opts.filter(o => o.text.startsWith(CH.buf));
  return live.length === 1 ? live[0].text[CH.buf.length] : null;
}
function dealChoices() {
  const g = inside.g, m = inside.m;
  let opts;
  if (m.game === 'maze') { g.labels = {}; opts = G.exits(g.mz, g.cell).map(d => ({ id: d, icon: G.ARROWS[d] })); }
  else opts = g.seq.slice(inside.placed, inside.placed + 4).sort((a, b) => a - b).map(i => ({ id: i, icon: m.items[i] }));
  const used = opts.map(o => g.labels[o.id]).filter(Boolean);
  for (const o of opts) {
    let t = g.labels[o.id];
    // labels must differ, and none may be the start of another
    for (let k = 0; !t && k < 300; k++) {
      const c = S.choicePrompt(P);
      if (!used.some(u => u.startsWith(c) || c.startsWith(u)) || (k > 250 && !used.includes(c))) t = c;
    }
    o.text = g.labels[o.id] = t || 'fj'.repeat(used.length + 1);
    used.push(o.text);
  }
  CH.opts = opts; CH.buf = ''; CH.clean = true;
  T.errs = new Set(); T.miss = 0; T.shown = performance.now();
  $('panel').classList.remove('again');
  $('hint').textContent = (m.game === 'maze' ? 'Which way? Type the word by an arrow.'
    : `${m.who} wants ${m.items[g.seq[inside.placed]]}. Type its word.`) + '  (Esc to stop)';
  paintChoices();
}
function paintChoices() {
  const el = $('prompt'); el.className = 'choices'; el.innerHTML = '';
  $('found').classList.add('hidden');
  for (const o of CH.opts) {
    const live = o.text.startsWith(CH.buf);
    const chip = document.createElement('div'); chip.className = 'opt' + (live ? '' : ' off');
    const ic = document.createElement('b'); ic.textContent = o.icon; chip.appendChild(ic);
    [...o.text].forEach((c, i) => {
      const sp = document.createElement('span');
      sp.className = 'ch' + (c === ' ' ? ' sp' : '') + (live && i < CH.buf.length ? ' ok' : live && CH.buf && i === CH.buf.length ? ' cur' : '');
      sp.textContent = c; chip.appendChild(sp);
    });
    el.appendChild(chip);
  }
  updateKb(nextKey());
}
function typeChoice(ch) {
  const now = performance.now(), next = CH.buf + ch;
  const live = CH.opts.filter(o => o.text.startsWith(CH.buf));
  if (live.some(o => o.text.startsWith(next))) {
    S.recordKey(P, ch, true, CH.buf ? now - T.last : 0); S.lessonKey(P, true);
    T.last = now; CH.buf = next; sfx.key(); firstHit(ch);
    const hit = CH.opts.find(o => o.text === next);
    if (hit) chose(hit); else paintChoices();
    return;
  }
  const wants = new Set(live.map(o => o.text[CH.buf.length]));
  if (wants.size === 1) { const w = [...wants][0]; S.recordKey(P, w, false, 0); T.errs.add(w === ' ' ? 'space' : w.toLowerCase()); }
  S.lessonKey(P, false); T.miss++; sfx.bad(); me.stumble = 0.5;
  if (P.shields > 0 && CH.clean) { P.shields--; toast('🛡️ Your shield forgave that slip.'); }
  else { CH.clean = false; P.streak = 0; }
  paintChoices();
  const box = $('panel'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
}
function chose(o) {
  const g = inside.g, m = inside.m, clean = CH.clean, errs = T.errs;
  CH.buf = ''; CH.clean = true; T.errs = new Set();
  if (!clean) { // same labels stay put until one is typed with no slips
    $('panel').classList.add('again');
    $('hint').textContent = '↩ That one had a slip. Type it again with no slips.  (Esc to stop)';
    beep(300, 0.12, 'triangle', 0.06);
    net.toHost('done', { site: -1, clean: false, boss: false, n: 1, job: 0 });
    tally({ text: o.text }, false, errs, 0);
    paintChoices();
    return;
  }
  $('panel').classList.remove('again'); T.miss = 0;
  if (m.game === 'order' && o.id !== g.seq[inside.placed]) {
    $('hint').textContent = `Not yet! ${m.who} wants ${m.items[g.seq[inside.placed]]} first.  (Esc to stop)`;
    beep(220, 0.14, 'triangle', 0.06);
    paintChoices();
    return;
  }
  sfx.load();
  net.toHost('done', { site: -1, clean: true, boss: false, n: 1, job: 0 });
  CH.opts = null; $('prompt').innerHTML = '';
  if (m.game === 'maze') { g.path = G.runFrom(g.mz, g.cell, o.id); g.cell = g.path[g.path.length - 1]; }
  else {
    delete g.labels[o.id];
    inside.placed++; inside.pop = 0; rooms()[roomKey(inside.id)] = inside.placed;
    if (inside.placed >= 6) finishRoom();
  }
  tally({ text: o.text }, true, errs, 0);
}
/** The neighbor's problem is solved. */
function finishRoom() {
  inside.placed = 6; rooms()[roomKey(inside.id)] = 6;
  P.thanks++;
  toast(`❤️ ${inside.m.who} says thank you!`, 'gold');
  sfx.win(); npc(`m_${inside.m.id}_done`); inside.talk = 7;
  S.saveProfile(P);
}

// ---------- start screen ----------
const crewWord = () => { try { return localStorage.getItem('qq.crew') || ''; } catch { return ''; } };
/** A QWERTY / Dvorak switch. */
function layoutButtons(el, get, set) {
  el.innerHTML = '';
  for (const [id, label] of [['qwerty', 'QWERTY'], ['dvorak', 'Dvorak']]) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.className = get() === id ? 'sel' : '';
    b.onclick = () => { set(id); layoutButtons(el, get, set); };
    el.appendChild(b);
  }
}
/** New keys (or a new job) unlocked: stop and celebrate. */
function party(title, keys, note) {
  $('partyTitle').textContent = title;
  const box = $('partyKeys'); box.innerHTML = '';
  for (const k of keys) {
    const d = document.createElement('div'); d.className = 'cap'; d.textContent = k.toUpperCase();
    const f = document.createElement('small'); f.textContent = fingerOf(k);
    const w = document.createElement('div'); w.append(d, f); box.appendChild(w);
  }
  $('partyNote').textContent = note;
  $('party').classList.remove('hidden');
  $('partyGo').focus();
  held.clear();
  confetti(me.x, me.y - 60, 160); sfx.win(); npc('promo');
  [300, 700, 1100].forEach(ms => setTimeout(() => { confetti(me.x + (Math.random() - 0.5) * 500, me.y - 100 - Math.random() * 200, 60); }, ms));
}
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
  let layout = P.layout;
  layoutButtons($('layouts'), () => layout, l => { layout = l; });
  const go = () => {
    S.switchLayout(P, layout);
    buildKb();
    P.name = $('name').value.trim().slice(0, 12) || 'builder';
    S.saveProfile(P);
    $('start').classList.add('hidden');
    if (P.placed) startGame(); else startPlacement();
  };
  $('go').onclick = go;
  $('name').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

// ---------- warm-up (placement) ----------
const PL = { i: 0, n: 0, hit: 0, miss: 0, time: 0, placed: 0, t0: 0, timer: null, again: false };
const PLACE_SECS = 90;
function startPlacement() {
  mode = 'place';
  $('place').classList.remove('hidden');
  $('pkb').appendChild($('kb')); // the keyboard picture helps here too
  Object.assign(PL, { i: 0, n: 0, hit: 0, miss: 0, time: 0, placed: 0, t0: 0, again: false });
  nextProbe();
  PL.timer = setInterval(() => {
    if (!PL.t0) return; // the clock starts on the first key
    const left = PLACE_SECS - (performance.now() - PL.t0) / 1000;
    $('placebar').style.width = Math.max(0, left / PLACE_SECS * 100) + '%';
    if (left <= 0) endPlacement(PL.placed);
  }, 200);
  $('placebar').style.width = '100%';
  $('skip').onclick = () => endPlacement(0);
}
function nextProbe() {
  const probe = S.PROBES[PL.i];
  setPrompt(S.probePrompt(P, probe), { prompt: $('pprompt'), found: $('pfound') }, secs => {
    // A letter counts as missed once, however many wrong keys it took: fumbling
    // for one key says little about the rest.
    PL.hit += T.hits; PL.miss += T.bad.size; PL.time += secs;
    if (++PL.n < probe.n) return nextProbe();
    // Always room for two misses in a round; beyond that, one letter in five (one in eight on the harder rounds).
    const allowed = Math.max(2, Math.floor(PL.hit * (probe.step < 9 ? 0.2 : 0.12))), cps = PL.hit / Math.max(0.5, PL.time);
    const pass = PL.miss <= allowed && cps >= probe.cps;
    Object.assign(PL, { n: 0, hit: 0, miss: 0, time: 0 });
    if (pass) {
      PL.placed = probe.place; PL.i++; PL.again = false;
      return PL.i < S.PROBES.length ? nextProbe() : endPlacement(PL.placed);
    }
    if (!PL.again) { PL.again = true; return nextProbe(); } // one rough round is not the end: try this level once more
    endPlacement(PL.placed);
  });
}
function endPlacement(step) {
  if (mode !== 'place') return;
  clearInterval(PL.timer);
  P.step = step; P.placed = true; P.credits = 0; P.fresh = 12;
  S.saveProfile(P);
  setPrompt(null, { prompt: $('pprompt'), found: $('pfound') }, null);
  $('panel').appendChild($('kb'));
  $('place').classList.add('hidden');
  toast(`You start at level ${step + 1}: ${S.stepName(step)}.`, 'gold');
  startGame();
}
addEventListener('keydown', e => { if (mode === 'place' && !PL.t0 && charOf(e)) PL.t0 = performance.now(); }, true);

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
    if (data.ver !== VERSION) versionClash();
    data.jobs ||= [];
    st = data; host = null; gotState = true;
    if (first) {
      lastEv = st.evId;
      // This device's own copy of the city may hold work the host has not seen: offer it, and the host keeps the best of both.
      const mine = loadWorlds()[net.world.id];
      if (mine && (mine.d > st.d || (mine.d === st.d && mine.have.some((n, k) => n > st.have[k])))) net.toHost('offer', mine);
      if (mode === 'lobby') enterCity();
    }
    handleEvents();
  },
  myName: () => P.name,
  myVer: () => VERSION,
  onClash: () => versionClash(),
  onWorlds() {
    if (mode !== 'lobby') return;
    if (net.asking && lobbyReady && !net.worlds.has(net.asking.host)) { net.cancelAsk(); lobbyNote = 'That city just closed.'; }
    paintLobby();
  },
  onWelcome(world) {
    // Let in. If this device was hosting its own copy of the same city, keep that copy to offer for merging.
    if (host && mode === 'game') saveWorld(world, st);
    host = null; gotState = false;
    if (mode === 'lobby') { lobbyNote = ''; paintLobby(); }
  },
  onDenied() { lobbyNote = 'They can\'t let you in right now.'; paintLobby(); },
  onAsk(id, name) {
    if (asks.has(id)) return;
    asks.set(id, name); paintAsks();
    beep(880, 0.12, 'sine', 0.08); beep(1175, 0.16, 'sine', 0.08, 0.12);
  },
  onPeers(id, joined) {
    if (joined) { other(id); net.sendTo(id, 'me', profileMsg()); }
    else { others.delete(id); if (asks.delete(id)) paintAsks(); }
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
    if (ev.t === 'built') { const s = district(ev.d).sites[ev.site]; if (s && nearMe(s.x, s.y) && !inside) { confetti(s.x, s.y - 80); sfx.win(); tip('built'); } }
    else if (ev.t === 'district') {
      toast(`🎉 ${ev.name} is finished! A new neighborhood opens: ${district(ev.d + 1).name}`, 'gold');
      confetti(me.x, me.y - 60, 120); sfx.win(); if (!inside) npc('district');
    } else if (ev.t === 'gold') { toast('⭐ Team combo! Bonus bricks for every site.', 'gold'); if (!busy()) { sfx.win(); npc('combo'); } }
    // City problems and the monster never interrupt: they are announced when the player walks up to them (see greet()).
    else if (ev.t === 'boss' || ev.t === 'job') { /* quiet */ }
    else if (ev.t === 'bossWin') { if (engaged === 'boss' || !busy()) { toast('🏆 The Typo Monster ran away! Bonus bricks for everyone.', 'gold'); confetti(me.x, me.y - 60, 100); sfx.win(); npc('bosswin'); } }
    else if (ev.t === 'bossFlee') { if (!busy()) { toast('The Typo Monster kicked a brick loose and wandered off.'); npc('bossflee'); } }
    else if (ev.t === 'jobGone') { if ((!busy() || engaged?.startsWith('j')) && ev.jt === 3) { toast('The brick thief got away this time.'); npc('job3gone'); } }
    else if (ev.t === 'jobDone') {
      const names = (ev.who || []).map(id => (id === net.selfId ? me.name : others.get(id)?.name)).filter(Boolean);
      toast(`${JOBS[ev.jt].icon} ${names.join(' and ') || 'The crew'} ${JOBS[ev.jt].done}! The neighbors sent bricks to say thanks.`, 'gold');
      ['🙋 Thank you!', '🙆 You saved the day!', '❤️', '❤️'].forEach((t, i) => setTimeout(() => floatText(t, ev.x - 60 + i * 40, ev.y - 30 - (i % 2) * 24, '#d6336c', 18), i * 350));
      const mine = (ev.who || []).includes(net.selfId);
      if (!mine && busy()) continue; // someone else fixed it while this player was busy: say nothing
      if (mine || (nearMe(ev.x, ev.y) && !inside)) { confetti(ev.x, ev.y - 40, 50); sfx.win(); npc(jobClip(ev.jt, ev.v, 'done')); }
      if ((ev.who || []).includes(net.selfId)) { P.thanks++; for (const it of S.newUnlocks(P)) toast(`🎁 New in your wardrobe: ${it.e} ${it.name}`, 'gold'); S.saveProfile(P); }
    }
    else if (ev.t === 'round') setTimeout(() => { const r = S.ROLES[myRole()]; if (!busy()) toast(`New round! Your job: ${r.icon} ${r.name}`); }, 300);
  }
}
const myRole = () => (st.roles && st.roles[net?.selfId]) ?? 0;

// ---------- finding a city ----------
// After the start screen the device listens for cities on the network, then
// either goes straight into the obvious one or shows a menu.
const asks = new Map(); // host only: peer id -> name of someone waiting to be let in
let lobbyNote = '', lobbyReady = false, timersOn = false;
const rid = () => [...crypto.getRandomValues(new Uint8Array(9))].map(b => b.toString(36).padStart(2, '0')).join('');
const openCities = () => [...net.worlds.values()].filter(w => net.peers.has(w.host));

async function startGame() {
  mode = 'lobby';
  buildKb();
  const q = new URLSearchParams(location.hash.slice(1)), code = q.get('room') || crewWord();
  const room = await findRoom(code, q.get('lan'));
  roomId = room.id; roomLabel = room.label;
  net = new Net(handlers);
  applyProfile(me, profileMsg());
  $('lobby').classList.remove('hidden');
  paintLobby();
  await net.join(roomId, { password: code, lanOnly: room.lan });
  // a city saved by an older version becomes a named city
  const old = legacyWorld(roomId);
  if (old && !Object.keys(loadWorlds()).length) saveWorld({ id: rid(), key: rid(), name: `${P.name}'s city` }, old);
  setTimeout(() => {
    lobbyReady = true;
    let menu = false;
    try { menu = !!sessionStorage.getItem('qq.menu'); sessionStorage.removeItem('qq.menu'); } catch { /* ignore */ }
    const saved = loadWorlds(), ids = Object.keys(saved).sort((a, b) => saved[b].at - saved[a].at), open = openCities();
    const known = open.find(w => saved[w.id] && w.ver === VERSION);
    if (mode !== 'lobby' || net.asking) return;
    if (!menu && known) return joinCity(known);                  // our own city is already open here: walk right in
    if (!menu && !open.length && ids.length <= 1) return hostCity(ids[0]); // nothing to choose between
    if (open.some(w => w.ver !== VERSION)) versionClash();
    paintLobby();
  }, net.room ? 3500 : 0);
}
function joinCity(w) {
  lobbyNote = '';
  net.ask(w.host, loadWorlds()[w.id]?.key || '', w.name);
  paintLobby();
}
/** Host a saved city, or a brand new one when `id` is empty. */
function hostCity(id) {
  const saved = id && loadWorlds()[id];
  const world = saved ? { id, key: saved.key, name: saved.name } : { id: rid(), key: rid(), name: `${P.name}'s city` };
  st = newState();
  if (saved) Object.assign(st, { d: saved.d, have: saved.have.slice(), total: saved.total });
  host = new Host(st);
  net.open(world);
  enterCity();
}
function paintLobby() {
  const el = $('lobbyBody'); el.innerHTML = '';
  const add = (tag, text, cls) => { const x = document.createElement(tag); x.textContent = text; if (cls) x.className = cls; el.appendChild(x); return x; };
  if (net.asking || (net.world && mode === 'lobby')) {
    add('h2', `🚪 Knock, knock!`);
    add('p', `Asking to join ${net.asking ? net.asking.name : net.world.name}…`, 'sub');
    add('p', 'Someone there needs to press ✔ Let in.', 'small');
    if (net.asking) add('button', 'Never mind', '').onclick = () => { net.cancelAsk(); paintLobby(); };
    return;
  }
  if (!lobbyReady) { add('h2', '🔎 Looking for cities…'); add('p', 'Checking who is building on your Wi-Fi.', 'sub'); return; }
  add('h2', '🏙️ Pick a city');
  if (lobbyNote) add('p', lobbyNote, 'sub');
  const saved = loadWorlds(), open = openCities();
  for (const w of open) {
    const b = add('button', '', 'city'), same = w.ver === VERSION;
    b.append(`🏙️ ${w.name}`, Object.assign(document.createElement('small'), { textContent: same ? `${w.n} building there now · ask to join` : 'getting an update… one moment' }));
    b.disabled = !same; // everyone in a city runs the same version
    if (same) b.onclick = () => joinCity(w); else versionClash();
  }
  for (const id of Object.keys(saved).sort((a, b) => saved[b].at - saved[a].at).slice(0, 4)) {
    if (open.some(w => w.id === id)) continue;
    const b = add('button', '', 'city');
    b.append(`▶ ${saved[id].name}`, Object.assign(document.createElement('small'), { textContent: `saved here · ${saved[id].d} neighborhood${saved[id].d === 1 ? '' : 's'} finished` }));
    b.onclick = () => hostCity(id);
  }
  add('button', '➕ Start a brand new city', 'city').onclick = () => hostCity('');
}
/** Host: people waiting to be let in, shown under the top-right buttons. */
function paintAsks() {
  const el = $('asks'); el.innerHTML = '';
  for (const [id, name] of asks) {
    const card = document.createElement('div'); card.className = 'ask';
    const t = document.createElement('div'); t.textContent = `🙋 ${name} wants to join`;
    const yes = document.createElement('button'); yes.textContent = '✔ Let in'; yes.className = 'yes';
    const no = document.createElement('button'); no.textContent = '✖ Not now';
    yes.onclick = () => { net.admit(id); asks.delete(id); paintAsks(); toast(`${name} joined your city.`); };
    no.onclick = () => { net.deny(id); asks.delete(id); paintAsks(); };
    card.append(t, yes, no); el.appendChild(card);
  }
}

// ---------- the game ----------
/** Save the player, including where they stand, so a reload puts them back. */
function saveAll() {
  if (mode === 'game' && net?.world) P.pos = { w: net.world.id, x: Math.round(me.x), y: Math.round(me.y), f: me.face };
  S.saveProfile(P);
}

// ---------- updates ----------
// version.json holds a hash of the game's files, and js/version.js holds the
// hash this running copy was built with. When they differ, a newer game has
// been published. Everyone in a city has to run the same version, so the game
// updates itself as soon as the player is not in the middle of typing, and
// comes back to the same spot.
let latest = null, staleFor = 0, lastCheck = 0;
async function reloadInPlace() {
  saveAll();
  if (net?.world && host) saveWorld(net.world, st);
  try {
    sessionStorage.setItem('qq.resume', '1');
    if (latest) sessionStorage.setItem('qq.upd', `${latest.hash}:${updTries() + 1}`);
  } catch { /* ignore */ }
  // refresh the browser's copies first, or the reload could bring back the old files
  if (latest) await Promise.all((latest.files || []).map(f => fetch(f, { cache: 'reload' }).catch(() => {})));
  location.reload();
}
/** How many times this tab already reloaded for the newest version (a stuck cache must not loop forever). */
function updTries() {
  try { const [h, n] = (sessionStorage.getItem('qq.upd') || ':0').split(':'); return latest && h === latest.hash ? +n : 0; } catch { return 0; }
}
async function checkVersion() {
  lastCheck = performance.now();
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = await r.json();
    if (!v.hash || v.hash === VERSION) { latest = null; $('update').classList.add('hidden'); return; }
    if (!latest || latest.hash !== v.hash) { latest = v; beep(660, 0.1, 'sine', 0.06); beep(990, 0.14, 'sine', 0.06, 0.1); }
    if (mode !== 'game') { if (mode !== 'place' && updTries() < 2) reloadInPlace(); return; } // nothing to interrupt yet
    $('update').classList.remove('hidden');
  } catch { /* offline, or no version file: try again later */ }
}
/** Someone here runs a different version: find out at once whether this copy is the old one. */
function versionClash() { if (performance.now() - lastCheck > 1500) checkVersion(); }
checkVersion(); setInterval(checkVersion, 5000);
setInterval(() => {
  if (!latest || mode !== 'game') return;
  const auto = updTries() < 2;
  if (engaged || !auto) { staleFor = 0; $('updateMsg').textContent = auto ? '✨ A new version is ready. It loads when you finish this.' : '✨ A new version is ready.'; return; }
  $('updateMsg').textContent = `✨ Updating in ${Math.max(0, 3 - staleFor)}…`;
  if (++staleFor > 3) reloadInPlace();
}, 1000);

function enterCity() {
  mode = 'game';
  $('lobby').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('panel').classList.remove('hidden');
  saveWorld(net.world, st); savedTotal = st.total; // remember this city (and its key) from the first moment
  const D = district(st.d), at = P.pos;
  // back where this player was standing, if that spot is still part of this city
  if (at && at.w === net.world.id && Number.isFinite(at.x) && Number.isFinite(at.y) && walkable(at.x, at.y, st.d)) { me.x = at.x; me.y = at.y; me.face = at.f < 0 ? -1 : 1; }
  else { me.x = D.cx + (Math.random() - 0.5) * 300; me.y = D.cy + 45; }
  cam.x = me.x; cam.y = me.y;
  if (!roomId) toast('Could not reach the network. Playing solo for now.');
  else toast(`Welcome to ${net.world.name}!`, 'gold');
  if (timersOn) return;
  timersOn = true;
  setInterval(hostTick, 250);
  setInterval(() => { if (net.world && st.total !== savedTotal) { savedTotal = st.total; saveWorld(net.world, st); } saveAll(); }, 4000);
  addEventListener('pagehide', saveAll);
  setInterval(sendPos, 100);
  requestAnimationFrame(frame);
  setTimeout(() => toast('Arrow keys to walk. Press Enter at a glowing circle to start typing.'), 2500);
  if (!P.tips.hello) { P.tips.hello = 1; npc('hello', 'walk'); }
}

let lastTick = performance.now();
function hostTick() {
  const now = performance.now(), dt = Math.min(2, (now - lastTick) / 1000);
  lastTick = now;
  if (!host || !net.isHost) return;
  st.order = net.order; st.w = net.world.id; st.wn = net.world.name; st.ver = VERSION;
  host.tick(dt);
  net.broadcast('state', st);
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
    if (j.site != null) continue; // fires and leaks are inside a building: use its door
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
// How far this player has helped each neighbor: kept per city and per neighbor,
// so a new city starts fresh and a building never inherits another one's progress.
const rooms = () => (P.help[net.world.id] ||= {});
const roomKey = id => { const [i, k] = id.split(':').map(Number); return `${id}:${missionFor(i, k).id}`; };
/** The fire or leak in building `id`, if there is one. Those are solved indoors. */
const jobIn = id => (st.jobs || []).find(j => j.site != null && `${j.d}:${j.site}` === id);
function enterBuilding(id) {
  const [i, k] = id.split(':').map(Number);
  const m = missionFor(i, k);
  const job = jobIn(id);
  let placed = Math.min(6, rooms()[roomKey(id)] | 0);
  if (m.game === 'maze' && placed < 6) placed = 0; // a maze starts over on each visit
  inside = { id, m, placed, pop: 1, x: job ? 0.96 : 0.86, y: job ? 0.5 : 0.35, talk: 7, wig: null, near: null, job: job ? job.id : 0, out: new Set(), nearF: -1, g: G.newGame(m, id, placed) };
  auto = null; held.clear(); stopTyping();
  if (job) greeted.add(job.id);
  npc(job ? `job${job.t}` : placed >= 6 ? `m_${m.id}_done` : `m_${m.id}`);
}
/** Rooms the player walks around in: furnishing, and fires or leaks. */
const roomWalk = () => !!inside && (!!inside.job || inside.m.game === 'furnish');
function leaveBuilding() { inside = null; stopTyping(); Voice.stop(); }
/** Put the keyboard down: no challenge runs until the player presses Enter again. */
function stopTyping() {
  engaged = null; T.key = null; lastSlip = false; CH.opts = null;
  $('panel').classList.remove('again');
  setPrompt(null, { prompt: $('prompt'), found: $('found') }, null);
}
const nearMe = (x, y) => Math.hypot(x - me.x, y - me.y) < 900;
/** In the middle of typing, or visiting a building: not to be interrupted. */
const busy = () => !!engaged || !!inside;
const greeted = new Set();
/** The recorded line for a problem: its own variant's if there is one. */
const jobClip = (t, v, suf = '') => (v && Voice.has(`n/job${t}${suf}_${v}`) ? `job${t}${suf}_${v}` : `job${t}${suf}`);
/** Announce a problem or the monster only when a free player walks up to it. */
function greet() {
  if (busy()) return;
  for (const j of st.jobs || []) {
    if (greeted.has(j.id) || Math.hypot(j.px - me.x, j.py - me.y) > 300) continue;
    greeted.add(j.id);
    toast('🚨 ' + (JOBS[j.t].v[j.v | 0] || JOBS[j.t].v[0]).call); npc(jobClip(j.t, j.v));
  }
  const b = st.boss;
  if (!b) greeted.delete('boss');
  else if (!greeted.has('boss') && Math.hypot(b.x - me.x, b.y - me.y) < 380) {
    greeted.add('boss');
    toast('👾 A Typo Monster! Press Enter to pelt it with bricks. Its weak spots are YOUR tricky keys.'); npc('boss');
  }
}

function finishPrompt(secs) {
  const key = T.key, boss = key === 'boss', p = T.p;
  const job = key.startsWith('j') ? parseInt(key.slice(1)) : 0;
  const bricks = !job && !boss; // building work, outdoors or indoors
  const ok = T.clean;
  const n = ok && bricks && P.crane > 0 ? 2 : 1;
  if (n === 2) P.crane--;
  net.toHost('done', { site: inside ? -1 : T.site, clean: ok, boss, n, job });
  lastSlip = !ok;
  if (!ok) {
    // Not delivered. The same prompt returns after the next one, until it is typed with no slips.
    redo.push({ ...p, step: P.step }); // every slipped prompt stays owed; none is ever dropped
    redoGap = 1 + Math.floor(Math.random() * 3); // shuffled back into the deck: it returns in 1 to 3 prompts
    beep(300, 0.12, 'triangle', 0.06);
    if (!inside) floatText('↩ so close! it will come back', me.x, me.y - 100, '#8a5cf0');
  } else if (p.redo) { sfx.win(); if (!inside) floatText('✔ got it!', me.x, me.y - 124, '#2fae66', 22); }
  else sfx.load();
  if (!ok) { /* nothing delivered */ } else if (job && inside) inside.out.add(+key.split(':')[1]); // that fire is out
  else if (inside) {
    inside.placed++; inside.pop = 0; rooms()[roomKey(inside.id)] = inside.placed; inside.talk = 0;
    if (inside.placed >= 6) finishRoom();
  } else if (job) floatText(JOBS[T.jobType]?.fx || '👍', me.x, me.y - 100, '#2f7de1');
  else if (boss && st.boss) fx.push({ text: '🧱', x: me.x, y: me.y - 60, vx: (st.boss.x - me.x) * 2.5, vy: (st.boss.y - 80 - me.y + 60) * 2.5, life: 0.4, size: 26 });
  else floatText(n === 2 ? '+2 🧱' : '+1 🧱', me.x, me.y - 100, '#c8553d');
  tally(p, ok, T.errs, secs);
  T.p = null; // the next frame deals a fresh prompt while the player stays on the job
  me.prog = 0;
}
/** Score one finished prompt: streaks, spaced review, the lesson count, and anything unlocked. */
function tally(p, clean, errs, secs) {
  if (clean) {
    P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak);
    if (P.streak % 10 === 0 && P.shields < 3) { P.shields++; toast(`🛡️ ${P.streak} clean in a row! You earned a shield: it forgives your next slip.`); }
  }
  if (p.burst && secs && secs <= p.burst) floatText('⚡ Speed burst!', me.x, me.y - 130, '#e6a700', 24);
  const rankBefore = S.rankOf(P).i;
  S.reviewPrompt(P, p.text, errs);
  const res = S.lessonPrompt(P);
  if (res) {
    toast(`${'⭐'.repeat(res.stars)} Lesson done: ${Math.round(res.acc * 100)}% accurate` + (res.stars === 3 ? '. Crane earned: 3 double loads!' : ''));
    if (res.promoted) {
      const fresh = P.step < S.STAGES.length ? `New keys: ${S.STAGES[P.step].keys.toUpperCase().split('').join(' and ')}` : `New job: ${S.stepName(P.step)}`;
      const keys = P.step < S.STAGES.length ? S.STAGES[P.step].keys.split('') : [];
      setTimeout(() => party(keys.length ? 'New keys unlocked!' : 'Promotion!', keys, keys.length ? 'The keyboard picture will show you where they are.' : fresh), 900);
    }
    if (res.ready) setTimeout(() => toast('That is plenty of new keys for one day. More unlock tomorrow: sleep makes fingers smarter!'), 900);
    if (res.demoted) setTimeout(() => toast('Let\'s spend a little more time on the last keys.'), 900);
    if (res.shiftDone && P.pacing) setTimeout(() => { toast('🏁 Today\'s shift is done. Great work! Come back tomorrow for more. You can keep building for fun.', 'gold'); npc('shift'); }, 1800);
  }
  for (const it of S.newUnlocks(P)) setTimeout(() => toast(`🎁 New in your wardrobe: ${it.e} ${it.name}`, 'gold'), 1400);
  if (S.rankOf(P).i !== rankBefore) { setTimeout(() => toast(`${S.rankOf(P).icon} You are now a ${S.rankOf(P).name}!`, 'gold'), 2200); sendProfile(); }
  if (P.fresh > 0) P.fresh--;
  S.saveProfile(P);
}

/** What could be worked on from where the player stands. Nothing starts until they press Enter. */
function context() {
  if (inside) {
    const j = inside.job && st.jobs.find(x => x.id === inside.job);
    if (inside.job && !j) inside.job = 0; // solved: the room goes back to normal
    if (j) { const i = inside.nearF = G.nearFire(inside, j.hp); return { base: i >= 0 ? `j${j.id}:${i}` : null, job: j, zone: -1 }; }
    if (inside.m.game !== 'furnish') return { base: inside.placed < 6 ? `i${inside.id}:g` : null, job: null, zone: -1 };
    const sp = inside.near = nearSpot(inside);
    const ok = sp && sp.kind === 'item' && sp.i === inside.placed;
    return { base: ok ? `i${inside.id}:${sp.i}` : null, job: null, zone: -1 };
  }
  const job = jobAt();
  if (job) return { base: `j${job.id}`, job, zone: -1 };
  const zone = zoneAt();
  if (zone >= 0) return { base: `s${st.d}:${zone}`, job: null, zone };
  // the monster is a place you walk to; it never takes over what you are doing
  const nearBoss = st.boss && Math.hypot(st.boss.x - me.x, (st.boss.y - me.y) / 0.7) < 170;
  return { base: nearBoss ? 'boss' : null, job: null, zone: -1 };
}

/** Keep the prompt panel in step with where the player is and whether they chose to start. */
function updatePrompt() {
  const c = context();
  if (engaged && engaged !== c.base) stopTyping(); // walked away, or the work here is finished
  doorId = !inside && !c.base ? doorAt() : null;
  me.act = c.job ? c.job.t : -1; curJob = c.job ? c.job.id : 0;
  paintDots(c);
  if (engaged) {
    if (choosing()) { if (!CH.opts && !inside.g.path.length) dealChoices(); return c.zone; }
    if (!T.p) {
      T.key = engaged; T.site = c.zone; T.jobType = c.job ? c.job.t : -1;
      const role = c.base === 'boss' || c.job || inside ? 0 : myRole();
      while (redo.length && redo[0].step !== P.step) redo.shift(); // the level changed: let old retries go
      let p;
      // retries are dealt back in at random, and always before the challenge can end
      if (redo.length && (redoGap-- <= 0 || redo.length >= leftIn(c))) p = { ...redo.shift(), redo: true };
      else p = S.genPrompt(P, role, c.base === 'boss');
      setPrompt(p, { prompt: $('prompt'), found: $('found') }, finishPrompt);
      $('panel').classList.toggle('again', !!p.redo);
      tip('type');
      $('hint').textContent = (p.redo ? '↩ Try this one again with no slips.'
        : lastSlip ? 'Oops, a slip. That one will come back.'
          : c.job ? JOBS[c.job.t].hint
          : inside ? (inside.m.game === 'run' ? 'Type it to get past!' : `Type to bring in the next thing for ${inside.m.who}.`)
        : c.base === 'boss' ? 'Throw bricks at the Typo Monster!'
            : p.show ? (p.hint ? `Fix it! It should say: ${p.hint}` : 'Spot the mistake, then type it the right way.')
              : p.perfect ? 'Perfect run: one slip sends you back to the start.'
                : p.burst ? `Speed burst: can you finish in ${p.burst} seconds?` : 'Type it to deliver bricks.') + '  (Esc to stop)';
    }
    return c.zone;
  }
  let hint;
  if (inside && c.job) {
    const what = c.job.t ? 'leak' : 'fire';
    hint = c.base ? `Press Enter to ${c.job.t ? 'fix this leak' : 'spray this fire'}.` : `Walk to a ${what} with the arrow keys.  (Esc to go outside)`;
  } else if (inside && inside.m.game !== 'furnish') {
    const m = inside.m;
    hint = !c.base ? 'All done here! Press Esc to go back outside.'
      : (m.game === 'maze' ? `Press Enter to start looking for ${m.goal}.` : m.game === 'run' ? `Press Enter to start running to ${m.goal}.` : `Press Enter to start fetching things for ${m.who}.`) + '  (Esc to go outside)';
  } else if (inside) {
    const sp = inside.near, all = inside.placed >= inside.m.items.length;
    hint = !sp ? (all ? 'All done here! Look around, talk, or leave by the door.' : 'Walk to the glowing spot with the arrow keys.')
      : sp.kind === 'npc' ? `Press Enter to talk to ${inside.m.who}.`
        : sp.kind === 'door' ? 'Press Enter to go back outside.'
          : sp.i === inside.placed ? 'Press Enter to bring in the next thing.'
            : sp.i < inside.placed ? 'Press Enter to take a look.' : 'Not yet: the glowing spot comes first.';
  } else if (c.base === 'boss') hint = 'Press Enter to fight the Typo Monster!';
  else if (c.job) hint = `Press Enter to help. ${JOBS[c.job.t].hint}`;
  else if (c.base) hint = 'Press Enter to start building here.';
  else if (doorId && jobIn(doorId)) hint = `${JOBS[jobIn(doorId).t].icon} Trouble inside! Press Enter to go in and help.`;
  else if (doorId) hint = rooms()[roomKey(doorId)] >= 6 ? '🚪 Press Enter to visit.' : '🚪 Press Enter to go in and help.';
  else hint = 'Walk to a glowing circle. Press Enter for the nearest one.';
  $('hint').textContent = hint;
  return c.zone;
}

/** How many clean prompts this challenge still needs. */
function leftIn(c) {
  if (!engaged) return 0;
  if (c.job) return c.job.hp;
  if (inside) return inside.m.game === 'maze' ? G.movesLeft(inside.g.mz, inside.g.cell) : 6 - inside.placed;
  if (c.base === 'boss') return st.boss ? st.boss.hp : 0;
  return c.zone >= 0 ? district(st.d).sites[c.zone].need - st.have[c.zone] : 0;
}
/**
 * One dot per prompt left in this challenge. Type one with no slips and a dot
 * goes away. A slip turns a dot purple: that prompt is still owed and comes
 * back. The purple ones are part of the count, not extra.
 */
let dotsKey = '', dotsLeft = 0;
function paintDots(c) {
  const left = leftIn(c), again = Math.min(redo.length, left), key = `${left}:${again}`;
  if (key === dotsKey) return;
  const gone = engaged ? Math.max(0, dotsLeft - left) : 0; // dots just cleared, by this player or a teammate
  dotsKey = key; dotsLeft = left;
  const el = $('dots'); el.innerHTML = '';
  for (let i = 0; i < Math.min(4, gone); i++) { const d = document.createElement('i'); d.className = 'pop'; el.appendChild(d); }
  if (gone) setTimeout(() => el.querySelectorAll('.pop').forEach(x => x.remove()), 450);
  if (!left) return;
  for (let i = 0; i < Math.min(24, left); i++) { const d = document.createElement('i'); if (i >= left - again) d.className = 'again'; el.appendChild(d); }
  const t = document.createElement('span');
  t.textContent = `${left} to go` + (again ? ` (${again} to try again)` : '');
  el.appendChild(t);
}

/** Enter: start the work here, or use whatever the player is standing at. */
function pressEnter() {
  if (engaged) return;
  const c = context();
  if (c.base) {
    // Slipped prompts stay owed for the whole challenge: a whole building, a whole site, a whole problem.
    const deck = c.base[0] === 'i' ? 'i' + inside.id : c.base.split(':')[0] + (c.base[0] === 's' ? ':' + c.zone : '');
    if (deck !== redoDeck) { redo.length = 0; redoDeck = deck; }
    engaged = c.base; auto = null; return;
  }
  if (inside) {
    if (!roomWalk() || inside.job) return;
    const sp = inside.near;
    if (!sp) return;
    if (sp.kind === 'door') leaveBuilding();
    else if (sp.kind === 'npc') { inside.talk = 7; npc(inside.placed >= inside.m.items.length ? `m_${inside.m.id}_done` : `m_${inside.m.id}`); }
    else if (sp.i < inside.placed) { inside.wig = { i: sp.i, t: 0.6 }; beep(700 + sp.i * 80, 0.12, 'triangle', 0.07); }
  } else if (doorId) enterBuilding(doorId);
  else autoWalk();
}

// Builders we have actually heard from lately. A closed tab can linger in the
// mesh for a while, so the connection list alone overcounts.
const liveOthers = now => [...others.values()].filter(o => o.seen && now - o.at < 6000);

function debugInfo() {
  const now = performance.now(), short = id => (id || '').slice(0, 6);
  return JSON.stringify({
    build: BUILD, version: VERSION, newest: latest?.hash, time: new Date().toISOString(), room: roomLabel, roomId: short(roomId), city: net?.world?.name, citiesSeen: [...(net?.worlds.values() || [])].map(w => w.name),
    self: short(net?.selfId), host: short(net?.hostId), isHost: net?.isHost, ready: net?.ready,
    order: (net?.order || []).map(short),
    peers: [...(net?.peers || [])].map(id => {
      const o = others.get(id);
      return { id: short(id), name: o?.name, seen: !!o?.seen, posAgeMs: o?.at ? Math.round(now - o.at) : null };
    }),
    sameNetworkOnly: net?.lanOnly, shutOut: net?.badPeers.size, stillChecking: net?.checking.size,
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
  $('district').textContent = `🏙️ ${D.name}  ${6 - left}/6`;
  const r = S.ROLES[myRole()];
  $('role').textContent = `Your job: ${r.icon} ${r.name}`;
  $('combo').style.width = Math.min(100, st.combo * 100) + '%';
  $('bossbar').classList.toggle('hidden', !st.boss);
  if (st.boss) { $('bosshp').style.width = st.boss.hp / st.boss.max * 100 + '%'; $('bosstxt').textContent = `TYPO MONSTER · ${Math.ceil(st.boss.left)}s`; }
  const done = Math.min(S.SHIFT_LESSONS, P.day.lessons);
  $('shift').textContent = P.pacing ? `⭐ ${done}/${S.SHIFT_LESSONS}` : `⭐ ${P.day.lessons}`;
  const pw = [P.shields ? `🛡️×${P.shields}` : '', P.crane ? `🏗️×${P.crane}` : '', now < bootsUntil ? '👟' : '', P.streak >= 3 ? `🔥${P.streak}` : ''].filter(Boolean).join('  ');
  $('powers').textContent = pw; $('powers').classList.toggle('hidden', !pw);
  const crew = liveOthers(now).length;
  $('crew').textContent = !net.ready ? '🔎' : `👷 ${1 + crew}`;
  $('crew').title = `Builders in ${net.world?.name}` + (net.isHost && crew ? ' (this device is keeping the city)' : '');
  $('comboBox').classList.toggle('hidden', !crew); // the team meter only matters with a team
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
  if (inside) {
    auto = null; inside.pop += dt; inside.talk = Math.max(0, inside.talk - dt);
    if (inside.wig && (inside.wig.t -= dt) <= 0) inside.wig = null;
    const walk = roomWalk(), g = inside.g;
    const ix = walk ? (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0) : 0, iy = walk ? (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0) : 0;
    inside.x = Math.min(0.97, Math.max(0.04, inside.x + ix * 0.4 * dt));
    inside.y = Math.min(1, Math.max(0, inside.y + iy * 1.3 * dt));
    if (ix) me.face = ix;
    inside.walk = !!(ix || iy);
    if (!walk && inside.m.game === 'maze' && g.path.length) { // walk the corridor to the next fork
      const tx = g.path[0] % G.MW, ty = (g.path[0] / G.MW) | 0, ax = tx - g.px, ay = ty - g.py, L = Math.hypot(ax, ay), s = 5 * dt;
      if (L <= s) { g.px = tx; g.py = ty; g.path.shift(); if (!g.path.length && g.cell === g.mz.goal && inside.placed < 6) finishRoom(); }
      else { g.px += ax / L * s; g.py += ay / L * s; if (ax) me.face = ax > 0 ? 1 : -1; }
      inside.walk = true;
    } else if (!walk && inside.m.game === 'run') {
      const gap = G.runStop(inside.placed) - g.rx, s = 420 * dt;
      g.rx += Math.abs(gap) <= s ? gap : Math.sign(gap) * s;
      inside.walk = Math.abs(gap) > 1; me.face = 1;
    }
  }
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
  if (!modal) greet();

  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.x += f.vx * dt; f.y += f.vy * dt; if (f.g) f.vy += f.g * dt;
    if ((f.life -= dt) <= 0) fx.splice(i, 1);
  }
  cam.x += (me.x - cam.x) * Math.min(1, dt * 6);
  cam.y += (me.y - 50 + $('panel').offsetHeight / 2 - cam.y) * Math.min(1, dt * 6);
  if (inside) {
    updateKb(nextKey());
    const drawMe = (x, y) => drawPlayer(ctx, { ...me, boat: false, walk: inside.walk }, x, y, now / 1000);
    const job = inside.job && st.jobs.find(j => j.id === inside.job);
    if (job || inside.m.game !== 'furnish') G.drawGame(ctx, { w: vw, h: vh, ph: $('panel').offsetHeight, t: now / 1000, m: inside.m, g: inside.g, placed: inside.placed, pop: inside.pop, opts: CH.opts ? CH.opts.map(o => o.id) : [], job, out: inside.out, nearF: inside.nearF, x: inside.x, y: inside.y, drawMe });
    else drawInterior(ctx, { w: vw, h: vh, ph: $('panel').offsetHeight, t: now / 1000, m: inside.m, placed: inside.placed, pop: inside.pop, x: inside.x, y: inside.y, near: inside.near, talk: inside.talk, wig: inside.wig, drawMe: (x, y) => drawPlayer(ctx, { ...me, boat: false, walk: inside.walk }, x, y, now / 1000) });
    updateHud(now);
    return;
  }
  draw(ctx, {
    w: vw, h: vh, cam, st, t: now / 1000, me, others: liveOthers(now).filter(o => !o.inside),
    door: doorId, roomDone: id => rooms()[roomKey(id)] >= 6,
    zone, job: curJob, weak: st.boss ? S.weakKeys(P, 4) : [], bossHit, fx,
  });
  updateKb(T.p ? T.p.text[T.pos] : null);
  updateHud(now);
}

// ---------- input ----------
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (mode === 'start' || mode === 'lobby' || (mode === 'game' && document.querySelector('.screen:not(.hidden)'))) return;
  const ch = charOf(e);
  if (mode === 'place') { if (ch) { e.preventDefault(); typeChar(ch); } return; }
  if (e.key.startsWith('Arrow')) { held.add(e.key); auto = null; e.preventDefault(); return; }
  if (e.key === 'Escape') { if (engaged) stopTyping(); else if (inside) leaveBuilding(); e.preventDefault(); return; }
  if (e.key === 'Enter') { pressEnter(); e.preventDefault(); return; }
  if (e.key === 'Tab' || e.key === 'Backspace') { e.preventDefault(); return; }
  if (ch) { e.preventDefault(); CH.opts ? typeChoice(ch) : typeChar(ch); }
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
  $('aRoom').value = new URLSearchParams(location.hash.slice(1)).get('room') || crewWord();
  const weak = S.weakKeys(P, 6).map(k => (k === ' ' ? 'space' : k.toUpperCase())).join(' ');
  $('aStats').textContent = `Loads delivered: ${P.loads} · three-star lessons: ${P.stars3} · best clean streak: ${P.bestStreak} · days played: ${P.days} · ` +
    `progress to next step: ${P.credits}/${S.creditsNeeded(P)}` + (weak ? ` · keys to work on: ${weak}` : '');
  $('adult').classList.remove('hidden');
}
$('btnWear').onclick = openWardrobe;
$('btnAdult').onclick = openAdult;
$('btnKeys').onclick = () => {
  let layout = P.layout;
  layoutButtons($('kLayouts'), () => layout, l => { layout = l; });
  $('kGo').onclick = () => {
    if (layout !== P.layout) { S.switchLayout(P, layout); S.saveProfile(P); location.reload(); }
    else $('keys').classList.add('hidden');
  };
  $('kRetest').onclick = () => { S.switchLayout(P, layout); P.placed = false; S.saveProfile(P); location.reload(); };
  $('keys').classList.remove('hidden');
};
$('partyGo').onclick = () => { $('party').classList.add('hidden'); $('partyGo').blur(); };
// Volume: the speaker button opens a slider under it; all the way down is mute.
// The grown-ups panel has the same slider, and the two stay in step.
function showVol() {
  const v = P.sound ? P.vol : 0;
  $('vol').value = v; $('volQuick').value = v;
  $('volPct').textContent = Math.round(v * 100) + '%';
  $('btnSound').textContent = v ? (v < 0.5 ? '🔉' : '🔊') : '🔇';
}
function setVol(v) {
  P.vol = v; P.sound = v > 0; P.volSet = true;
  S.saveProfile(P); showVol();
  if (!v) window.speechSynthesis?.cancel();
}
function volOpen(open) {
  $('volPop').classList.toggle('hidden', !open);
  $('btnSound').setAttribute('aria-expanded', open);
}
for (const id of ['vol', 'volQuick']) {
  $(id).oninput = e => setVol(+e.target.value);
  $(id).onchange = e => { sfx.load(); e.target.blur(); }; // a sample at the new volume; blur so typing goes back to the game
}
showVol();
addEventListener('pointerdown', e => { if (!$('soundWrap').contains(e.target)) volOpen(false); }, true);
$('btnSound').onclick = () => { volOpen($('volPop').classList.contains('hidden')); $('btnSound').blur(); };
$('aStep').onchange = e => { P.step = +e.target.value; P.credits = 0; P.fresh = 12; P.lesson = { n: 0, hit: 0, miss: 0 }; stopTyping(); S.saveProfile(P); };
$('aPacing').onchange = e => { P.pacing = e.target.checked; S.saveProfile(P); };
$('aGuide').onchange = e => { P.guide = e.target.checked; S.saveProfile(P); };
$('aDebug').onclick = () => {
  const out = $('aDebugOut'); out.value = debugInfo(); out.classList.remove('hidden'); out.select();
  navigator.clipboard?.writeText(out.value).then(() => toast('Debug info copied.'), () => {});
};
$('aJoin').onclick = () => { try { localStorage.setItem('qq.crew', $('aRoom').value.trim()); } catch { /* ignore */ } location.hash = ''; location.reload(); };
$('aMake').onclick = () => { // four random words: easy to read out over the phone, hard to guess
  const ws = DATA.words.flat().filter(w => w.length >= 4 && w.length <= 6), r = crypto.getRandomValues(new Uint32Array(4));
  $('aRoom').value = [...r].map(n => ws[n % ws.length]).join(' ');
};
$('aLeave').onclick = () => { try { sessionStorage.setItem('qq.menu', '1'); } catch { /* ignore */ } location.reload(); };
$('aRetest').onclick = () => { P.placed = false; S.saveProfile(P); location.reload(); };
$('aReset').onclick = () => { if (confirm('Erase this player\'s progress on this device?')) { S.resetProfile(); location.reload(); } };
document.querySelectorAll('.screen .close').forEach(b => { b.onclick = () => { b.closest('.screen').classList.add('hidden'); b.blur(); }; });
document.querySelectorAll('#hud button').forEach(b => b.addEventListener('click', () => b.blur()));

$('updateGo').onclick = reloadInPlace;
initStart();
// coming back from an update: skip the start screen and walk straight back in
let resume = false;
try { resume = !!sessionStorage.getItem('qq.resume'); sessionStorage.removeItem('qq.resume'); } catch { /* ignore */ }
if (resume && P.name && P.placed) { $('start').classList.add('hidden'); startGame(); }
window.__qq = { P, get inside() { return inside; }, get st() { return st; }, get net() { return net; }, me, T, CH, G, enter: id => enterBuilding(id), get engaged() { return engaged; }, get redo() { return redo; }, get host() { return host; }, district, party }; // for debugging in the console
