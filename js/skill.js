// Player profile, per-key tracking, the difficulty ladder, and prompt generation.
// Everything here is local to one player and saved in localStorage.
import DATA from './content-data.js';

// The key stages and their word lists depend on the keyboard layout.
export let STAGES = DATA.stages;
let LD = DATA;
const NS = DATA.stages.length;       // key stages (steps 0..NS-1), the same count on every layout
export function setLayout(name) {
  LD = name === 'dvorak' ? DATA.dvorak : DATA;
  STAGES = LD.stages;
  cumKeysCache.length = wordsCache.length = lowCache.length = 0;
}
/** Change keyboard layout. Each layout keeps its own level and key history. */
export function switchLayout(p, name) {
  if (p.layout === name) return;
  const mine = { step: p.step, placed: p.placed, credits: p.credits, badRun: p.badRun, keys: p.keys, fresh: p.fresh, lesson: p.lesson };
  Object.assign(p, p.other || { step: 0, placed: false, credits: 0, badRun: 0, keys: {}, fresh: 12, lesson: { n: 0, hit: 0, miss: 0 } });
  p.other = mine; p.layout = name;
  setLayout(name);
}
export const MAX_STEP = NS + 3;      // then: capitals, sentences, fluency, mastery
export const LESSON_LEN = 12;        // prompts per lesson
export const SHIFT_LESSONS = 9;      // lessons in one daily shift (about 20 minutes)
export const MAX_PROMOS = 3;         // new steps a player can unlock in one day
export const CREDITS_TO_ADVANCE = 3; // lessons at 95%+ needed to unlock the next step
// The first five steps (the home row) are gentler: two lessons at 90%+, and up to five new steps a day.
const early = p => p.step < 5;
export const creditsNeeded = p => (early(p) ? 2 : CREDITS_TO_ADVANCE);

export const ROLES = [
  { id: 0, name: 'Hauler', icon: '🧱', tip: 'short and quick' },
  { id: 1, name: 'Builder', icon: '🏗️', tip: 'longer loads' },
  { id: 2, name: 'Inspector', icon: '🔍', tip: 'fix the mistake' },
];

export const tierOf = step => (step < 5 ? 1 : step < NS ? 2 : step - NS + 3);
export const stepName = step =>
  step < NS ? STAGES[step].name
    : ['Capitals and punctuation', 'Sentences and numbers', 'Fluency', 'Mastery'][step - NS];

const cumKeysCache = [];
export function cumKeys(step) {
  const s = Math.min(step, NS - 1);
  if (!cumKeysCache[s]) cumKeysCache[s] = STAGES.slice(0, s + 1).map(x => x.keys).join('');
  return cumKeysCache[s];
}
const wordsCache = [];
const lowCache = [];
/** Real phrases typeable with the keys learned by `step`. */
function phrasesUpTo(step) {
  const s = Math.min(step, NS - 1);
  if (!lowCache[s]) lowCache[s] = LD.low.slice(0, s + 1).flat();
  return lowCache[s];
}
function wordsUpTo(step) {
  const s = Math.min(step, NS - 1);
  if (!wordsCache[s]) wordsCache[s] = LD.words.slice(0, s + 1).flat();
  return wordsCache[s];
}

// ---------- cosmetics ----------
// Earned with streaks, accurate lessons and days played. Never with speed.
export const ITEMS = [
  { id: 'h0', slot: 'hat', e: '', name: 'Hard hat', how: 'Yours from the start', ok: () => true },
  { id: 'h1', slot: 'hat', e: '🧢', name: 'Cap', how: '10 clean loads in a row', ok: p => p.bestStreak >= 10 },
  { id: 'h2', slot: 'hat', e: '🎩', name: 'Top hat', how: '3 three-star lessons', ok: p => p.stars3 >= 3 },
  { id: 'h3', slot: 'hat', e: '🤠', name: 'Cowboy hat', how: '25 clean loads in a row', ok: p => p.bestStreak >= 25 },
  { id: 'h4', slot: 'hat', e: '🎓', name: 'Grad cap', how: '10 three-star lessons', ok: p => p.stars3 >= 10 },
  { id: 'h6', slot: 'hat', e: '🪖', name: 'Rescue helmet', how: 'Help fix 5 city problems', ok: p => p.thanks >= 5 },
  { id: 'h5', slot: 'hat', e: '👑', name: 'Crown', how: 'Become mayor', ok: p => p.stars3 >= 25 },
  { id: 't0', slot: 'tool', e: '🔨', name: 'Hammer', how: 'Yours from the start', ok: () => true },
  { id: 't1', slot: 'tool', e: '🔧', name: 'Wrench', how: '5 clean loads in a row', ok: p => p.bestStreak >= 5 },
  { id: 't2', slot: 'tool', e: '🪚', name: 'Saw', how: '2 three-star lessons', ok: p => p.stars3 >= 2 },
  { id: 't3', slot: 'tool', e: '🖌️', name: 'Paintbrush', how: '8 three-star lessons', ok: p => p.stars3 >= 8 },
  { id: 't4', slot: 'tool', e: '🪄', name: 'Magic wand', how: '60 clean loads in a row', ok: p => p.bestStreak >= 60 },
  { id: 'p0', slot: 'pet', e: '', name: 'No pet', how: '', ok: () => true },
  { id: 'p1', slot: 'pet', e: '🐤', name: 'Chick', how: 'Play on 2 different days', ok: p => p.days >= 2 },
  { id: 'p2', slot: 'pet', e: '🐶', name: 'Puppy', how: '15 clean loads in a row', ok: p => p.bestStreak >= 15 },
  { id: 'p3', slot: 'pet', e: '🐱', name: 'Kitten', how: '5 three-star lessons', ok: p => p.stars3 >= 5 },
  { id: 'p4', slot: 'pet', e: '🐢', name: 'Turtle', how: 'A lesson with no mistakes', ok: p => p.perfect >= 1 },
  { id: 'p5', slot: 'pet', e: '🦖', name: 'Dino', how: '40 clean loads in a row', ok: p => p.bestStreak >= 40 },
  { id: 'p6', slot: 'pet', e: '🦄', name: 'Unicorn', how: '20 three-star lessons', ok: p => p.stars3 >= 20 },
  { id: 'p7', slot: 'pet', e: '🐕‍🦺', name: 'Rescue dog', how: 'Help fix 20 city problems', ok: p => p.thanks >= 20 },
  { id: 'r0', slot: 'ride', e: '', name: 'On foot', how: '', ok: () => true },
  { id: 'r1', slot: 'ride', e: '🛴', name: 'Scooter', how: '20 clean loads in a row', ok: p => p.bestStreak >= 20 },
  { id: 'r2', slot: 'ride', e: '🛹', name: 'Skateboard', how: '7 three-star lessons', ok: p => p.stars3 >= 7 },
  { id: 'r3', slot: 'ride', e: '🚲', name: 'Bike', how: 'Play on 5 different days', ok: p => p.days >= 5 },
  { id: 'r4', slot: 'ride', e: '🚜', name: 'Tractor', how: '15 three-star lessons', ok: p => p.stars3 >= 15 },
];
export const itemById = id => ITEMS.find(i => i.id === id);
const RANKS = [[0, 'Apprentice', '🔰'], [3, 'Builder', '🧱'], [10, 'Architect', '📐'], [25, 'Mayor', '🏛️']];
export function rankOf(p) {
  let r = 0;
  RANKS.forEach((x, i) => { if (p.stars3 >= x[0]) r = i; });
  return { i: r, name: RANKS[r][1], icon: RANKS[r][2] };
}

// ---------- profile ----------
const KEY = 'qq.profile.v1';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY)); } catch { /* fresh start */ }
  p = Object.assign({
    name: '', color: 0, step: 0, placed: false, credits: 0, badRun: 0,
    lesson: { n: 0, hit: 0, miss: 0 }, keys: {}, streak: 0, bestStreak: 0,
    stars3: 0, perfect: 0, days: 0, loads: 0, thanks: 0, help: {}, tips: {}, fresh: 12, shields: 0, crane: 0,
    wear: { hat: 'h0', tool: 't0', pet: 'p0', ride: 'r0' }, seen: ['h0', 't0', 'p0', 'r0'],
    day: { date: '', lessons: 0, promos: 0 }, pacing: true, guide: true, sound: true, vol: 0.5, volSet: false,
    layout: 'qwerty', other: null,
  }, p || {});
  if (!p.volSet) p.vol = 0.5; // nobody picked a volume on this device yet: start in the middle
  setLayout(p.layout);
  rollDay(p);
  return p;
}
export function rollDay(p) {
  if (p.day.date !== today()) {
    p.day = { date: today(), lessons: 0, promos: 0 }; p.days++;
    // a night away loosens every key a little, so each one comes back for review sooner
    for (const k of Object.values(p.keys)) if (k.iv) { k.iv = Math.max(3, k.iv / 2); k.due = Math.min(k.due, p.loads + k.iv); }
  }
}
export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ }
}
export function resetProfile() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** Newly earned cosmetics since last check. */
export function newUnlocks(p) {
  const out = ITEMS.filter(i => !p.seen.includes(i.id) && i.ok(p));
  out.forEach(i => p.seen.push(i.id));
  return out;
}

// ---------- per-key tracking ----------
const keyId = ch => (ch === ' ' ? 'space' : ch.toLowerCase());

export function recordKey(p, ch, ok, ms) {
  const k = p.keys[keyId(ch)] || (p.keys[keyId(ch)] = { n: 0, e: 0, ms: 0 });
  k.n++;
  if (!ok) k.e++;
  else if (ms > 0 && ms < 4000) k.ms = k.ms ? k.ms * 0.8 + ms * 0.2 : ms;
  if (k.n > 60) { k.n *= 0.5; k.e *= 0.5; } // old mistakes fade
}
/**
 * Spaced review, per key. After each prompt, a key typed cleanly waits twice
 * as many prompts before it is due again; a key that was missed is due again
 * almost at once. Due keys pull the next prompts toward themselves.
 */
export function reviewPrompt(p, text, missed) {
  for (const ch of new Set(text)) {
    const k = p.keys[keyId(ch)];
    if (!k) continue;
    k.iv = missed.has(keyId(ch)) ? 3 : Math.min(600, Math.max(4, (k.iv || 4) * 2));
    k.due = p.loads + k.iv;
  }
}
/** Learned keys that are due for review, most overdue first. */
export function dueKeys(p) {
  return Object.entries(p.keys).filter(([c, k]) => c.length === 1 && k.due !== undefined && k.due <= p.loads)
    .sort((a, b) => a[1].due - b[1].due).map(x => x[0]);
}
function medianMs(p) {
  const v = Object.values(p.keys).map(k => k.ms).filter(Boolean).sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 400;
}
function weakness(p, ch, med) {
  const k = p.keys[keyId(ch)];
  if (!k) return 0.35; // untested keys deserve a look
  const err = (k.e + 0.5) / (k.n + 3);
  const slow = k.ms ? Math.min(2, Math.max(0, k.ms / med - 1)) : 0.2;
  const due = k.due !== undefined && k.due <= p.loads ? 0.8 : 0;
  return err * 3 + slow * 0.6 + due;
}
/** The player's weakest keys among those they have learned. */
export function weakKeys(p, n = 4) {
  const med = medianMs(p);
  const pool = p.step < NS ? cumKeys(p.step).split('') : Object.keys(p.keys).filter(k => k.length === 1);
  return pool.filter(c => p.keys[keyId(c)]).map(c => [c, weakness(p, c, med)])
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
}

// ---------- prompt generation ----------
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const cap = w => w[0].toUpperCase() + w.slice(1);

/** Choose from `list`, leaning toward the player's weak keys (and `boost` keys). */
function pickWeak(p, list, { tries = 8, boost = '', filter = null } = {}) {
  const med = medianMs(p);
  let best = null, bestScore = -1;
  for (let i = 0; i < tries; i++) {
    const w = pick(list);
    if (filter && !filter(w)) continue;
    let s = 0;
    for (const c of w) s += weakness(p, c, med) + (boost.includes(c) ? 0.6 : 0);
    s = s / w.length + Math.random() * 0.4;
    if (s > bestScore) { bestScore = s; best = w; }
  }
  return best || pick(list);
}

function letters(p, len, focus) {
  const pool = cumKeys(p.step).split('');
  const fresh = STAGES[Math.min(p.step, NS - 1)].keys.split('');
  const med = medianMs(p);
  let out = '';
  while (out.length < len) {
    let c;
    if (Math.random() < (focus ? 0.15 : 0.5)) c = pick(fresh);
    else {
      c = pick(pool);
      for (let i = 0; i < (focus ? 6 : 2); i++) {
        const d = pick(pool);
        if (weakness(p, d, med) > weakness(p, c, med)) c = d;
      }
    }
    if (out.length >= 2 && out.at(-1) === c && out.at(-2) === c) continue;
    out += c;
  }
  return out;
}

/** Swap one letter for a wrong one. Returns the wrong spelling and where. */
function misspell(word) {
  const idx = [...word].map((c, i) => (/[a-z]/.test(c) && i > 0 ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return null;
  const i = pick(idx);
  const near = { a: 'se', b: 'vn', c: 'xv', d: 'sf', e: 'wr', f: 'dg', g: 'fh', h: 'gj', i: 'uo', j: 'hk', k: 'jl', l: 'k', m: 'n', n: 'bm', o: 'ip', p: 'o', q: 'w', r: 'et', s: 'ad', t: 'ry', u: 'yi', v: 'cb', w: 'qe', x: 'zc', y: 'tu', z: 'x' };
  const c = pick((near[word[i]] || 'e').split(''));
  return { wrong: word.slice(0, i) + c + word.slice(i + 1), at: i };
}
function inspect(text, hint) {
  // misspell one word of at least 3 letters inside `text`
  const spans = [...text.matchAll(/[A-Za-z]{3,}/g)];
  if (!spans.length) return { text };
  const m = pick(spans);
  const bad = misspell(m[0].toLowerCase());
  if (!bad) return { text };
  const wrongWord = m[0][0] + bad.wrong.slice(1);
  return {
    text, show: text.slice(0, m.index) + wrongWord + text.slice(m.index + m[0].length),
    mark: m.index + bad.at, hint: hint ? m[0] : null,
  };
}
const chunks = s => s.split(/(?<=[.!?;:])\s+/).filter(c => c.length >= 20);

/**
 * Make the next prompt for this player.
 * role: 0 hauler, 1 builder, 2 inspector. boss: aim at the player's weak keys.
 * Every prompt, whatever its length, is worth one load of bricks.
 */
/** A short prompt to label one choice (a maze exit, a thing to fetch). */
export function choicePrompt(p) {
  return genPrompt(p.step > NS ? { ...p, step: NS } : p, 0).text;
}

export function genPrompt(p, role = 0, boss = false) {
  const step = p.step;
  const fresh = step < NS ? STAGES[step].keys : '';
  if (step < 5) {
    const ws = wordsUpTo(step), ph = phrasesUpTo(step);
    if (ph.length > 8 && role === 1 && Math.random() < 0.6 && !boss) {
      const t = pickWeak(p, ph, { boost: fresh });
      return { text: t, say: t };
    }
    if (ws.length > 8 && Math.random() < 0.5 && !boss) {
      const w = pickWeak(p, ws, { boost: fresh });
      if (role === 2 && w.length >= 3) return { ...inspect(w, true), say: w };
      return { text: w, say: w };
    }
    const t = letters(p, boss ? 4 : role === 1 ? 5 : role === 2 ? 4 : 3, boss);
    return { text: t, say: t.split('').join(', '), spaced: true };
  }
  if (step < NS) {
    const ws = wordsUpTo(step);
    // half the time, insist on a word that uses one of the newest keys
    const useFresh = !boss && Math.random() < 0.5 && LD.words[step].length >= 6;
    const o = boss ? { tries: 40 } : { boost: fresh, tries: useFresh ? 16 : 8 };
    if (useFresh) o.filter = w => [...fresh].some(c => w.includes(c));
    if (role === 2 && !boss) {
      const w = pickWeak(p, ws, { ...o, filter: x => x.length >= 3 && (!o.filter || o.filter(x)) });
      return { ...inspect(w, true), say: w };
    }
    if (role === 0 || boss) {
      const short = phrasesUpTo(step).filter(x => x.length <= 12);
      if (!boss && short.length >= 6 && Math.random() < 0.35) { const t = pickWeak(p, short, o.filter ? { boost: fresh } : o); return { text: t, say: t }; }
      const w = pickWeak(p, ws, { ...o, filter: x => x.length <= (boss ? 9 : 5) && (!o.filter || o.filter(x)) });
      return { text: w, say: w };
    }
    // builders get real phrases and sentences whenever the keys allow it
    const ph = phrasesUpTo(step);
    if (ph.length >= 10 && Math.random() < 0.8) {
      const t = pickWeak(p, ph, { boost: fresh, tries: 12, filter: useFresh && LD.low[step].length >= 6 ? o.filter : null });
      return { text: t, say: t };
    }
    const a = pickWeak(p, ws, o), b = pickWeak(p, ws, o);
    const keys = cumKeys(step);
    const sep = keys.includes('/') && Math.random() < 0.25 ? '/'
      : keys.includes(',') && Math.random() < 0.4 ? ', '
        : Math.random() < 0.15 ? '; ' : ' ';
    const end = keys.includes('.') && Math.random() < 0.5 ? '.' : '';
    return { text: a + sep + b + end, say: `${a} ${b}` };
  }
  const all = wordsUpTo(NS);
  if (boss) {
    const ws = [0, 1, 2].map(() => pickWeak(p, all, { tries: 40 }));
    const wk = weakKeys(p, 6).filter(c => /[^a-z]/.test(c));
    return { text: cap(ws.join(' ')) + (wk.length ? ` ${pick(wk)}` : '!') };
  }
  if (step === NS) { // capitals and punctuation
    if (role === 2) return inspect(cap(pickWeak(p, all, { filter: x => x.length >= 5 })) + pick(['.', '!', '?']), true);
    if (role === 0) return { text: pick([pick(DATA.names), pick(DATA.places), pick(DATA.days), cap(pickWeak(p, all)) + pick(['.', '!', '?', ','])]) };
    const n = pick(DATA.names), n2 = pick(DATA.names.filter(x => x !== n)), pl = pick(DATA.places), d = pick(DATA.days);
    return { text: pick([pick(DATA.phrases), pick(DATA.phrases), `${n} and ${n2}`, `${n} is in ${pl}.`, `Is ${n} in ${pl}?`, `See you on ${d}!`, `${d}, ${pl}`]) };
  }
  if (step === NS + 1) { // sentences and numbers
    const short = DATA.facts.filter(f => f.length <= 42);
    if (role === 0) return { text: pick(short) };
    if (role === 2) return inspect(pick(short), false);
    return { text: pick(DATA.facts) };
  }
  if (step === NS + 2) { // fluency
    const c = pick(chunks(pick(DATA.passages)));
    if (role === 0) return { text: c };
    if (role === 2) return inspect(c, false);
    return { text: pick(DATA.passages) };
  }
  // mastery: speed bursts, code, perfect runs
  if (role === 2) return inspect(pick(chunks(pick(DATA.passages))), false);
  const code = pick(DATA.code);
  if (role === 0) return { text: code, burst: Math.round(code.length / 5 * 10) / 10 };
  return { text: code, perfect: true };
}

// ---------- lessons and promotion ----------
/** Count one keystroke toward the current lesson. */
export function lessonKey(p, ok, ms = 0) {
  ok ? p.lesson.hit++ : p.lesson.miss++;
  if (ok && ms > 0 && ms < 4000) { p.lesson.t = (p.lesson.t || 0) + ms; p.lesson.k = (p.lesson.k || 0) + 1; } // for typing speed
}
// Keys per second that count as fast at each tier of the ladder (3 a second is about 36 words a minute).
const FAST = [0, 1.6, 2.2, 2.6, 3, 3.5, 4];

/**
 * Count one finished prompt. When a lesson ends, returns a summary:
 * { acc, stars, promoted, fast (promoted for speed), demoted, shiftDone, ready }.
 */
export function lessonPrompt(p) {
  rollDay(p);
  p.loads++;
  if (++p.lesson.n < LESSON_LEN) return null;
  const { hit, miss } = p.lesson;
  const acc = hit / Math.max(1, hit + miss);
  const cps = p.lesson.k >= 12 ? p.lesson.k / (p.lesson.t / 1000) : 0;
  p.lesson = { n: 0, hit: 0, miss: 0 };
  const stars = acc >= 0.95 ? 3 : acc >= 0.9 ? 2 : 1;
  const good = stars === 3 || (early(p) && stars === 2);
  const counts = !p.pacing || p.day.lessons < SHIFT_LESSONS; // lessons past the shift are just for fun
  p.day.lessons++;
  const res = { acc, stars, promoted: false, demoted: false, ready: false, shiftDone: p.day.lessons === SHIFT_LESSONS };
  if (stars === 3) { p.stars3++; p.crane += 3; }
  if (miss === 0) p.perfect++;
  if (counts) {
    if (good) { p.credits++; p.badRun = 0; }
    else if (acc < 0.8) {
      p.credits = Math.max(0, p.credits - 1);
      if (++p.badRun >= 2 && p.step > 0) { p.step--; p.credits = 0; p.badRun = 0; p.fresh = 12; res.demoted = true; }
    } else p.badRun = 0;
  }
  // Fast and nearly flawless: this step is already easy for this player, so move
  // them straight up without waiting for more lessons or for tomorrow.
  if (stars === 3 && miss <= 2 && cps >= FAST[tierOf(p.step)] && p.step < MAX_STEP && !res.demoted) {
    p.step++; p.credits = 0; p.badRun = 0; p.fresh = 12; res.promoted = res.fast = true;
    return res;
  }
  if (p.credits >= creditsNeeded(p) && p.step < MAX_STEP) {
    if (p.pacing && (p.day.promos | 0) >= (early(p) ? 5 : MAX_PROMOS)) { res.ready = !p.day.told; p.day.told = true; } // enough new things for one day
    else { p.step++; p.credits = 0; p.fresh = 12; p.day.promos = (p.day.promos | 0) + 1; res.promoted = true; }
  }
  return res;
}

// ---------- tricky-key practice ----------
const errRate = k => (k.e + 0.5) / (k.n + 3);
const learned = p => (p.step < NS ? cumKeys(p.step).split('') : Object.keys(p.keys)).filter(c => c.length === 1 && c !== ' ');
/** The keys this player slips on most: only keys with real, repeated mistakes. */
export function troubleKeys(p, n = 3) {
  return learned(p).map(c => [c, p.keys[keyId(c)]]).filter(([, k]) => k && k.e >= 1.5 && errRate(k) > 0.06)
    .sort((a, b) => errRate(b[1]) - errRate(a[1])).slice(0, n).map(x => x[0]);
}
/**
 * A short drill for the keys in `hard`: each one woven between three keys the
 * player finds easy, then the hard ones mixed together, and last a few real
 * words that lean on those keys, the longer the better.
 */
export function drillSet(p, hard) {
  let easy = learned(p).filter(c => !hard.includes(c) && p.keys[keyId(c)]?.n >= 5)
    .sort((a, b) => errRate(p.keys[keyId(a)]) - errRate(p.keys[keyId(b)])).slice(0, 4);
  if (!easy.length) easy = STAGES[0].keys.split('').filter(c => !hard.includes(c));
  if (!easy.length) easy = [hard[0]];
  const out = [];
  const some = () => [...easy].sort(() => Math.random() - 0.5); // the easy keys, shuffled: three or four different letters in every line
  for (const h of hard) {
    const [a, b = a, c = a] = some();
    out.push([h, a, h, b, h, c]);
    if (hard.length <= 2) { const [d, e = d] = some(); out.push([d, h, h, e, h, d]); }
  }
  out.push(Array.from({ length: 6 }, (_, k) => (k === 3 ? pick(easy) : hard[(k > 3 ? k - 1 : k) % hard.length])));
  const drills = out.map(a => ({ text: a.join(''), spaced: true }));
  // words: the ones with the most tricky letters in them, each tricky key getting its turn
  const uses = w => [...w].filter(c => hard.includes(c)).length;
  const pool = wordsUpTo(p.step).filter(w => !w.includes(' ') && w.length >= 3 && uses(w))
    .map(w => [w, uses(w) * 2 + w.length * 0.3 + Math.random() * 2]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const words = [];
  for (let i = 0; words.length < 5 && i < 5; i++) {
    const w = pool.find(x => x.includes(hard[i % hard.length]) && !words.includes(x)) || pool.find(x => !words.includes(x));
    if (w) words.push(w);
  }
  return [...drills, ...words.map(w => ({ text: w, say: w }))];
}
