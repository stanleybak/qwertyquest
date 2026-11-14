import JOBS from './jobs.js';
import { missionFor } from './missions.js';
export { JOBS }; // city problems that pop up and need typing to fix

// The shared city. The host runs these rules; everyone else just renders the
// state the host broadcasts.
//
// The city is endless: districts open one after another on a spiral. A
// district's layout is a pure function of its index, so the state only has to
// carry how many districts are finished plus the brick counts of the one
// under construction. That keeps the broadcast tiny however big the city gets.

export const CELL_W = 820, CELL_H = 620;
export const ZONE_R = 80;
// Neighborhoods come in six kinds, in turn. Each has its own look and its own problems.
export const ENVS = ['town', 'farm', 'forest', 'city', 'beach', 'snow'];
export const envOf = i => ENVS[i % ENVS.length];
const NAMES = {
  town: ['Homerow Heights', 'Shift Street', 'Comma Corner', 'Spacebar Square', 'Period Park'],
  farm: ['Qwerty Acres', 'Ampersand Farm', 'Hyphen Hill Farm', 'Tab Meadow', 'Asterisk Orchard'],
  forest: ['Backspace Woods', 'Capslock Forest', 'Bracket Grove', 'Semicolon Pines', 'Escape Hollow'],
  city: ['Enter City', 'Uppercase Uptown', 'Delete Downtown', 'Control Plaza', 'Function Square'],
  beach: ['Backspace Bay', 'Capslock Cove', 'Tab Tide Beach', 'Slash Sands', 'Home Key Harbor'],
  snow: ['Shiver Shift', 'Icicle Insert', 'Frosty Function', 'Numlock North', 'Snowy Spacebar'],
};
export const districtName = i => {
  const round = Math.floor(i / ENVS.length), list = NAMES[envOf(i)];
  return list[round % list.length] + (round >= list.length ? ` ${Math.floor(round / list.length) + 1}` : '');
};
const DECOR = {
  town: ['🌳', '🌷', '⛲', '🌳', '🚲', '🌼'], farm: ['🌾', '🌻', '🐄', '🌽', '🐓', '🌾'], forest: ['🌲', '🌲', '🍄', '🦌', '🌳', '🌲'],
  city: ['🚏', '🌳', '🛴', '🗽', '🚏', '🌳'], beach: ['🌴', '⛱️', '🐚', '🌴', '🦀', '🏄'], snow: ['🌲', '⛄', '🧊', '🌲', '🦌', '🌲'],
};
const HUES = { farm: [0, 28], forest: [18, 28], snow: [185, 50] }; // barns, cabins, icy blues

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grid cell of district i on a square spiral: 0 at the origin, then outward. */
export function spiral(i) {
  let x = 0, y = 0, dx = 1, dy = 0, run = 1, done = 0, turns = 0;
  for (let k = 0; k < i; k++) {
    x += dx; y += dy;
    if (++done === run) { done = 0; [dx, dy] = [-dy, dx]; if (++turns % 2 === 0) run++; }
  }
  return { x, y };
}

const KINDS = [
  { name: 'house', floors: 2, need: 5, w: 110 },
  { name: 'shop', floors: 3, need: 7, w: 130 },
  { name: 'tower', floors: 5, need: 10, w: 120 },
  { name: 'landmark', floors: 7, need: 16, w: 150 },
];
const cache = new Map();
const cellIdx = new Map(); // "gx,gy" -> district index, for districts made so far

/** Every third district has a river where its road would be. */
export const hasRiver = i => i % 3 === 2;
/** Is this spot open water? Finished districts get a bridge in the middle. */
export function onRiver(x, y, d) {
  const i = cellIdx.get(`${Math.round(x / CELL_W)},${Math.round(y / CELL_H)}`);
  if (i === undefined || i > d || !hasRiver(i)) return false;
  const D = district(i);
  if (y - D.cy < 18 || y - D.cy > 66 || Math.abs(x - D.cx) > CELL_W / 2 - 14) return false;
  return !(i < d && Math.abs(x - D.cx) < 70);
}

export const cellOf = (x, y) => cellIdx.get(`${Math.round(x / CELL_W)},${Math.round(y / CELL_H)}`);
let ensured = 0;
/** Only opened districts can be walked on. The rest of the land is locked. */
export function walkable(x, y, d) {
  for (; ensured <= d + 1; ensured++) district(ensured);
  const i = cellOf(x, y);
  return i !== undefined && i <= d;
}

/** The six building sites of district i. Same answer on every peer. */
export function district(i) {
  if (cache.has(i)) return cache.get(i);
  const r = mulberry(i * 7919 + 17);
  const c = spiral(i);
  const cx = c.x * CELL_W, cy = c.y * CELL_H, env = envOf(i);
  const sites = [];
  for (let k = 0; k < 6; k++) {
    let kind = r() < 0.45 ? 0 : r() < 0.6 ? 1 : 2;
    if (k === 1 && i % 4 === 3) kind = 3;
    const K = KINDS[kind];
    sites.push({
      x: cx + (k % 3 - 1) * 250 + (r() - 0.5) * 30, y: cy + (k < 3 ? -110 : 190),
      kind, floors: K.floors, w: K.w, need: K.need + Math.min(6, Math.floor(i / 2)),
      hue: Math.floor(HUES[env] ? HUES[env][0] + r() * HUES[env][1] : r() * 360), roof: Math.floor(r() * 3), env,
    });
  }
  // things standing around between the buildings
  const spots = [[-385, -215], [385, -215], [-385, 255], [385, 255], [-125, -125], [125, -125], [-125, 180], [125, 180]];
  const decor = spots.map(([dx, dy]) => ({ x: cx + dx + (r() - 0.5) * 24, y: cy + dy + (r() - 0.5) * 16, e: DECOR[env][Math.floor(r() * DECOR[env].length)] }));
  const d = { i, cx, cy, sites, decor, env, name: districtName(i), river: hasRiver(i) };
  cache.set(i, d);
  cellIdx.set(`${c.x},${c.y}`, i);
  return d;
}

export function newState() {
  return {
    d: 0, have: [0, 0, 0, 0, 0, 0], total: 0, combo: 0,
    boss: null, bossIn: 420, round: 0, roundLeft: 300,
    roles: {}, order: [], items: [], itemId: 1, ev: [], evId: 0,
    jobs: [], jobId: 1, jobIn: 150,
    gen: 0,     // how many times this city has been started over
    vote: null, // a restart being voted on: { by, yes: [ids], left }
    built: 0, next: null, // neighborhoods already constructed beyond the frontier (see Host.settle)
    rooms: {}, // how far each neighbor inside a building has been helped, 0 to 6: shared by everyone
  };
}
// Cities this device has been part of: { id: { key, name, d, have, total, at } }.
const SAVES = 'qq.worlds';
export function loadWorlds() {
  try { const o = JSON.parse(localStorage.getItem(SAVES)); if (o && typeof o === 'object') return o; } catch { /* nothing saved */ }
  return {};
}
export function saveWorld(world, st) {
  const all = loadWorlds();
  all[world.id] = { key: world.key, name: world.name, d: st.d, have: st.have, total: st.total, rooms: st.rooms || {}, built: st.built | 0, next: st.next || null, gen: st.gen | 0, at: Date.now() };
  const ids = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  for (const id of ids.slice(8)) delete all[id]; // keep the eight most recent
  try { localStorage.setItem(SAVES, JSON.stringify(all)); } catch { /* ignore */ }
}
export function dropWorld(id) {
  const all = loadWorlds();
  delete all[id];
  try { localStorage.setItem(SAVES, JSON.stringify(all)); } catch { /* ignore */ }
}
/** A city saved by an older version of the game, under the room it was played in. */
export function legacyWorld(room) {
  try {
    const k = 'qq.world.' + (room || 'solo'), s = JSON.parse(localStorage.getItem(k));
    localStorage.removeItem(k);
    if (s && typeof s.d === 'number' && Array.isArray(s.have)) return s;
  } catch { /* nothing saved */ }
  return null;
}

/** The city's record key for the neighbor in building k of neighborhood i. */
export const roomKeyOf = (i, k) => `${i}:${k}:${missionFor(i, k).id}`;
/** Is this a believable building key, like "3:2:baker", in a neighborhood that exists? */
const roomOk = (k, d) => typeof k === 'string' && /^\d{1,4}:[0-5]:[a-z]{1,12}$/.test(k) && parseInt(k) <= d;

/** Host-side rules. `st` is the live state object; mutate it in place. */
export class Host {
  constructor(st) { this.st = st; this.clean = {}; this.itemIn = 90; this.recent = []; st.rooms ||= {}; st.jobs ||= []; st.jobId ||= 1; st.jobIn ??= 100; }

  /** Start a city problem that suits this neighborhood and has not come up lately. */
  spawnJob() {
    const st = this.st, D = district(st.d);
    const built = D.sites.map((s, k) => ({ ...s, k })).filter(s => st.have[s.k] >= s.need);
    const pool = JOBS.map((_, t) => t).filter(t => JOBS[t].env.includes(D.env) && (JOBS[t].kind !== 'in' || built.length));
    let fresh = pool.filter(t => !this.recent.includes(t));
    if (!fresh.length) fresh = pool.filter(t => t !== this.recent[this.recent.length - 1]);
    if (!fresh.length) return;
    const t = fresh[Math.floor(Math.random() * fresh.length)], J = JOBS[t];
    this.recent.push(t); if (this.recent.length > 7) this.recent.shift(); // nothing repeats until seven others have had a turn
    const hp = (t === 0 ? 4 : 3) + this.players();
    const j = { id: st.jobId++, t, v: Math.floor(Math.random() * J.v.length), hp, max: hp, left: 300, who: [] };
    if (J.kind === 'in') {
      const s = built[Math.floor(Math.random() * built.length)];
      Object.assign(j, { d: st.d, site: s.k, x: Math.round(s.x), y: Math.round(s.y), h: s.floors * 28, px: Math.round(s.x), py: Math.round(s.y + 48) });
    } else {
      const side = Math.random() < 0.5 ? -1 : 1;
      j.x = Math.round(D.cx + side * (300 + Math.random() * 50)); j.y = D.cy + (D.river ? -20 : 120);
      j.px = j.x; j.py = j.y + (J.bg ? 26 : 0);
      if (J.kind === 'run') { j.tx = j.x; j.ty = j.y; j.stun = 0; }
    }
    st.jobs.push(j);
    this.event('job', { jt: t, x: Math.round(j.px), y: Math.round(j.py) });
  }

  event(t, extra = {}) {
    this.st.ev.push({ id: ++this.st.evId, t, ...extra });
    if (this.st.ev.length > 6) this.st.ev.shift();
  }
  players() { return this.st.order.length || 1; }

  assignRoles() {
    const st = this.st;
    st.roles = {};
    st.order.forEach((id, i) => { st.roles[id] = (i + st.round) % 3; });
  }

  addLoads(siteIdx, n) {
    const st = this.st, D = district(st.d);
    const s = D.sites[siteIdx];
    if (!s || st.have[siteIdx] >= s.need) {
      // that site just got finished by someone else: put the bricks where they are needed
      siteIdx = D.sites.findIndex((x, k) => st.have[k] < x.need);
      if (siteIdx < 0) return;
    }
    const need = D.sites[siteIdx].need;
    const add = Math.min(n, need - st.have[siteIdx]);
    st.have[siteIdx] += add; st.total += add;
    if (st.have[siteIdx] >= need) this.event('built', { site: siteIdx, d: st.d });
    this.settle();
  }

  /** Has every neighbor in neighborhood i been helped? */
  helped(i) {
    for (let k = 0; k < 6; k++) if (!((this.st.rooms[roomKeyOf(i, k)] | 0) >= 6)) return false;
    return true;
  }
  /**
   * Keep the city's frontier honest. A neighborhood is finished when all six
   * buildings are built AND all six neighbors inside have been helped; only
   * then does the next one open. A city that got ahead of that (older versions
   * opened land on bricks alone) steps back to its earliest unfinished
   * neighborhood. What was already built further out is remembered and comes
   * back as the city reaches it again.
   */
  settle() {
    const st = this.st;
    for (let i = 0; i < st.d; i++) {
      if (this.helped(i)) continue;
      if (st.d >= (st.built | 0)) st.next = { d: st.d, have: st.have }; // the half-built frontier
      st.built = Math.max(st.built | 0, st.d);
      st.d = i; st.have = district(i).sites.map(s => s.need);
      st.boss = null; st.items = []; st.jobs = [];
      this.event('back', { d: i, name: district(i).name });
      break;
    }
    while (district(st.d).sites.every((s, k) => st.have[k] >= s.need) && this.helped(st.d)) {
      this.event('district', { d: st.d, name: district(st.d).name });
      st.d++; st.items = []; st.jobs = []; st.boss = null;
      st.have = st.d < (st.built | 0) ? district(st.d).sites.map(s => s.need)
        : st.next && st.next.d === st.d ? st.next.have.slice() : [0, 0, 0, 0, 0, 0];
      if (st.next && st.next.d <= st.d) st.next = null;
    }
  }
  /** A bonus load on every unfinished site. */
  sprinkle(n) {
    const d = this.st.d;
    for (let k = 0; k < 6 && this.st.d === d; k++) {
      if (this.st.have[k] < district(d).sites[k].need) this.addLoads(k, n);
    }
  }

  /** A player finished a prompt. */
  done(from, m) {
    const st = this.st;
    this.clean[from] = !!m.clean;
    if (m.clean) {
      // the meter fills fastest when everyone is being accurate at the same time
      const ids = st.order.length ? st.order : [from];
      const frac = ids.filter(id => this.clean[id]).length / ids.length;
      st.combo += 0.02 + 0.03 * frac; // a team bonus every few minutes, not every few prompts
    } else { st.combo = Math.max(0, st.combo - 0.12); return; } // a prompt with a slip delivers nothing
    if (st.combo >= 1) { st.combo = 0; this.event('gold'); this.sprinkle(1); }
    if (roomOk(m.room, st.d)) { // work inside a building counts for everyone in the city
      const was = st.rooms[m.room] | 0, now = m.all ? 6 : Math.min(6, was + 1);
      st.rooms[m.room] = now;
      if (was < 6 && now >= 6) this.event('room', { room: m.room, by: from });
      this.settle();
    }
    if (m.job) {
      const i = st.jobs.findIndex(j => j.id === m.job);
      if (i < 0) return;
      const j = st.jobs[i];
      j.hp--; if (!j.who.includes(from)) j.who.push(from);
      if (JOBS[j.t].kind === 'run') j.stun = 5;
      if (j.hp <= 0) {
        st.jobs.splice(i, 1);
        this.event('jobDone', { jt: j.t, v: j.v, x: j.px, y: j.py, who: j.who });
        st.jobIn = Math.max(st.jobIn, 200); st.bossIn = Math.max(st.bossIn, 120);
        st.combo += 0.15;
        this.sprinkle(1); // grateful neighbors chip in bricks
      }
      return;
    }
    if (st.boss && m.boss) {
      st.boss.hp -= 1;
      if (st.boss.hp <= 0) { st.boss = null; st.bossIn = 480; st.jobIn = Math.max(st.jobIn, 90); this.event('bossWin'); this.sprinkle(2); }
      return;
    }
    this.addLoads(m.site | 0, m.n === 2 ? 2 : 1);
  }

  /**
   * Starting the city over needs a yes from everyone who is connected.
   * m: { start: true } to propose it, { yes: true | false } to answer.
   */
  vote(from, m) {
    const st = this.st;
    if (!m) return;
    if (m.start) { if (!st.vote) st.vote = { by: from, yes: [from], left: 60 }; }
    else if (!st.vote) return;
    else if (m.yes === false) { st.vote = null; this.event('voteNo', { by: from }); return; }
    else if (m.yes === true && !st.vote.yes.includes(from)) st.vote.yes.push(from);
    this.countVotes();
  }
  countVotes() {
    const st = this.st, v = st.vote;
    if (!v) return;
    const all = st.order.length ? st.order : [v.by];
    if (!all.every(id => v.yes.includes(id))) return;
    Object.assign(st, {
      gen: (st.gen | 0) + 1, vote: null, d: 0, have: [0, 0, 0, 0, 0, 0], total: 0, combo: 0, rooms: {}, built: 0, next: null,
      boss: null, bossIn: 420, items: [], jobs: [], jobIn: 150,
    });
    this.recent = [];
    this.event('restart');
  }

  /** Someone is busy typing at a runaway: it stays put for them. */
  hold(m) {
    const j = this.st.jobs.find(x => x.id === (m && m.job));
    if (j && JOBS[j.t].kind === 'run') j.stun = Math.max(j.stun, 3);
  }

  grab(from, m) {
    const i = this.st.items.findIndex(x => x.id === m.id);
    if (i < 0) return null;
    return this.st.items.splice(i, 1)[0];
  }

  /**
   * Another copy of this city turned up (a member's saved copy, or a host that
   * carried on alone). Keep the best of both: the one that is further along,
   * and for the same neighborhood, the taller of each building.
   */
  offer(w) {
    const st = this.st;
    if (!w || typeof w.total !== 'number' || !Number.isInteger(w.d) || w.d < 0 || !Array.isArray(w.have) || w.have.length !== 6) return;
    // A copy from before the city was last started over is out of date; one from after replaces this city.
    const gen = w.gen | 0;
    if (gen < (st.gen | 0)) return;
    if (gen > (st.gen | 0)) { Object.assign(st, { gen, d: 0, have: [0, 0, 0, 0, 0, 0], total: 0, rooms: {}, built: 0, next: null, boss: null, items: [], jobs: [] }); this.event('merged'); }
    for (const [k, n] of Object.entries(w.rooms && typeof w.rooms === 'object' ? w.rooms : {}).slice(0, 2000)) {
      if (roomOk(k, Math.max(st.d, w.d))) st.rooms[k] = Math.max(st.rooms[k] | 0, Math.min(6, Math.max(0, n | 0)));
    }
    if (w.d < st.d) { st.built = Math.max(st.built | 0, w.built | 0, w.d); this.settle(); return; }
    const sites = district(w.d).sites, theirs = w.have.map((n, k) => Math.min(sites[k].need, Math.max(0, n | 0)));
    const before = st.d + ':' + st.have.join();
    if (w.d > st.d) { st.d = w.d; st.have = theirs; st.boss = null; st.items = []; st.jobs = []; }
    else st.have = st.have.map((n, k) => Math.max(n, theirs[k]));
    st.total = Math.max(st.total, w.total);
    if (before !== st.d + ':' + st.have.join()) this.event('merged'); // the city just grew
    st.built = Math.max(st.built | 0, w.built | 0);
    this.settle();
  }

  tick(dt) {
    this.settle();
    const st = this.st, D = district(st.d);
    if (st.vote) { // someone who leaves no longer has to agree; an unanswered vote lapses
      if ((st.vote.left -= dt) <= 0) { st.vote = null; this.event('voteNo', {}); } else this.countVotes();
    }
    if ((st.roundLeft -= dt) <= 0) { st.round++; st.roundLeft = 300; this.assignRoles(); this.event('round'); }
    for (const id of st.order) if (!(id in st.roles)) { this.assignRoles(); break; }
    if (st.boss) {
      st.boss.left -= dt;
      if (st.boss.left <= 0) {
        // the monster got bored: it kicks a few bricks loose and wanders off
        const k = st.have.findIndex(n => n > 0);
        if (k >= 0) { st.have[k]--; st.total--; }
        st.boss = null; st.bossIn = 480; st.jobIn = Math.max(st.jobIn, 90); this.event('bossFlee');
      }
    } else if (st.total >= 8 && !st.jobs.length && (st.bossIn -= dt) <= 0) { // one thing at a time
      const hp = 5 + 4 * this.players();
      st.boss = { hp, max: hp, left: 80, x: D.cx, y: D.cy + 40 };
      this.event('boss');
    }
    for (let i = st.jobs.length - 1; i >= 0; i--) {
      const j = st.jobs[i];
      if (JOBS[j.t].kind === 'run') { // runaways scurry between spots, and freeze when caught up with
        if (j.stun > 0) j.stun -= dt;
        else {
          const dx = j.tx - j.x, dy = j.ty - j.y, L = Math.hypot(dx, dy);
          if (L < 10) { j.tx = D.cx + (Math.random() - 0.5) * 660; j.ty = D.cy + (D.river ? -70 + Math.random() * 70 : Math.random() * 120); }
          else { j.x += dx / L * 55 * dt; j.y += dy / L * 55 * dt; }
          j.px = j.x = Math.round(j.x * 10) / 10; j.py = j.y = Math.round(j.y * 10) / 10;
        }
      }
      // Fires, leaks and kittens wait until someone solves them. Only the thief can get away, and only if nobody is chasing.
      if (JOBS[j.t].name === 'thief' && j.stun <= 0 && (j.left -= dt) <= 0) { st.jobs.splice(i, 1); this.event('jobGone', { jt: j.t }); }
    }
    if (st.total >= 3 && !st.boss && (st.jobIn -= dt) <= 0) {
      st.jobIn = 240 + Math.random() * 180; // a calm pace: a problem every four to seven minutes, never two at once
      if (!st.jobs.length) this.spawnJob();
    }
    if ((this.itemIn -= dt) <= 0) {
      this.itemIn = 180; // a power-up is a treat, not a constant
      if (st.items.length < 1) {
        st.items.push({
          id: st.itemId++, t: Math.floor(Math.random() * 3),
          x: D.cx + (Math.random() - 0.5) * 640, y: D.cy + (D.river ? 100 : 40) + (Math.random() - 0.5) * 60,
        });
      }
    }
  }
}
