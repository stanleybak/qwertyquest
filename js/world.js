// The shared city. The host runs these rules; everyone else just renders the
// state the host broadcasts.
//
// The city is endless: districts open one after another on a spiral. A
// district's layout is a pure function of its index, so the state only has to
// carry how many districts are finished plus the brick counts of the one
// under construction. That keeps the broadcast tiny however big the city gets.

export const CELL_W = 820, CELL_H = 620;
export const ZONE_R = 80;
const NAMES = ['Homerow Heights', 'Qwerty Quay', 'Shift Street', 'Comma Corner', 'Spacebar Square',
  'Backspace Bay', 'Tab Terrace', 'Capslock Cove', 'Enter End', 'Escape Estates', 'Semicolon Springs',
  'Asterisk Alley', 'Hyphen Hill', 'Period Park', 'Bracket Bridge', 'Ampersand Acres'];
export const districtName = i => NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');

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
/** The six building sites of district i. Same answer on every peer. */
export function district(i) {
  if (cache.has(i)) return cache.get(i);
  const r = mulberry(i * 7919 + 17);
  const c = spiral(i);
  const cx = c.x * CELL_W, cy = c.y * CELL_H;
  const sites = [];
  for (let k = 0; k < 6; k++) {
    let kind = r() < 0.45 ? 0 : r() < 0.6 ? 1 : 2;
    if (k === 1 && i % 4 === 3) kind = 3;
    const K = KINDS[kind];
    sites.push({
      x: cx + (k % 3 - 1) * 250 + (r() - 0.5) * 30, y: cy + (k < 3 ? -110 : 190),
      kind, floors: K.floors, w: K.w, need: K.need + Math.min(6, Math.floor(i / 2)),
      hue: Math.floor(r() * 360), roof: Math.floor(r() * 3),
    });
  }
  const d = { i, cx, cy, sites, name: districtName(i) };
  cache.set(i, d);
  return d;
}

export function newState() {
  return {
    d: 0, have: [0, 0, 0, 0, 0, 0], total: 0, combo: 0,
    boss: null, bossIn: 150, round: 0, roundLeft: 120,
    roles: {}, order: [], items: [], itemId: 1, ev: [], evId: 0,
  };
}
const saveKey = room => 'qq.world.' + (room || 'solo');
export function loadWorld(room) {
  try {
    const s = JSON.parse(localStorage.getItem(saveKey(room)));
    if (s && typeof s.d === 'number' && Array.isArray(s.have)) return s;
  } catch { /* nothing saved */ }
  return null;
}
export function saveWorld(room, st) {
  try { localStorage.setItem(saveKey(room), JSON.stringify({ d: st.d, have: st.have, total: st.total })); } catch { /* ignore */ }
}

/** Host-side rules. `st` is the live state object; mutate it in place. */
export class Host {
  constructor(st) { this.st = st; this.clean = {}; this.itemIn = 12; }

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
    if (D.sites.every((x, k) => st.have[k] >= x.need)) {
      this.event('district', { d: st.d, name: D.name });
      st.d++; st.have = [0, 0, 0, 0, 0, 0]; st.items = [];
      if (st.boss) st.boss = null;
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
      st.combo += 0.035 + 0.065 * frac;
    } else st.combo = Math.max(0, st.combo - 0.12);
    if (st.combo >= 1) { st.combo = 0; this.event('gold'); this.sprinkle(1); }
    if (st.boss && m.boss) {
      st.boss.hp -= 1;
      if (st.boss.hp <= 0) { st.boss = null; st.bossIn = 240; this.event('bossWin'); this.sprinkle(2); }
      return;
    }
    this.addLoads(m.site | 0, m.n === 2 ? 2 : 1);
  }

  grab(from, m) {
    const i = this.st.items.findIndex(x => x.id === m.id);
    if (i < 0) return null;
    return this.st.items.splice(i, 1)[0];
  }

  /** Take over a saved city if it is further along than this one. */
  offer(w) {
    if (!w || typeof w.total !== 'number' || w.total <= this.st.total) return;
    if (!Number.isInteger(w.d) || w.d < 0 || !Array.isArray(w.have) || w.have.length !== 6) return;
    this.st.d = w.d; this.st.have = w.have.map(n => Math.max(0, n | 0)); this.st.total = w.total;
    this.st.boss = null; this.st.items = [];
  }

  tick(dt) {
    const st = this.st, D = district(st.d);
    if ((st.roundLeft -= dt) <= 0) { st.round++; st.roundLeft = 120; this.assignRoles(); this.event('round'); }
    for (const id of st.order) if (!(id in st.roles)) { this.assignRoles(); break; }
    if (st.boss) {
      st.boss.left -= dt;
      if (st.boss.left <= 0) {
        // the monster got bored: it kicks a few bricks loose and wanders off
        const k = st.have.findIndex(n => n > 0);
        if (k >= 0) { st.have[k]--; st.total--; }
        st.boss = null; st.bossIn = 200; this.event('bossFlee');
      }
    } else if (st.total >= 8 && (st.bossIn -= dt) <= 0) {
      const hp = 5 + 4 * this.players();
      st.boss = { hp, max: hp, left: 80, x: D.cx, y: D.cy + 40 };
      this.event('boss');
    }
    if ((this.itemIn -= dt) <= 0) {
      this.itemIn = 18;
      if (st.items.length < 3) {
        st.items.push({
          id: st.itemId++, t: Math.floor(Math.random() * 3),
          x: D.cx + (Math.random() - 0.5) * 640, y: D.cy + 40 + (Math.random() - 0.5) * 60,
        });
      }
    }
  }
}
