// The little games inside buildings: a maze found in the dark, a hallway race,
// fetching things in order, and putting out fires or fixing leaks. This file holds their rules
// and drawing; main.js feeds them the typing.
import { emoji } from './missions.js';

function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const seedOf = id => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h; };

// ---------- maze ----------
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
export const ARROWS = ['⬆️', '➡️', '⬇️', '⬅️'];
const step = (mz, c, d) => c + DIRS[d][0] + DIRS[d][1] * mz.w;
/** Mazes grow as the city does: the building id starts with its neighborhood's number. */
export const mazeSize = id => { const di = parseInt(id) || 0; return { w: Math.min(14, 10 + di), h: Math.min(9, 6 + (di >> 1)) }; };

/**
 * A maze with a few extra openings knocked through, so there is often more
 * than one way round. Same on every visit to the same building. Some have a
 * locked door that cannot be walked around, and a key hidden in a dead end on
 * the near side of it.
 */
export function makeMaze(id) {
  const { w, h } = mazeSize(id), N = w * h;
  const r = rng(seedOf(id)), open = new Uint8Array(N), seen = new Uint8Array(N);
  const mz = { w, h, open, goal: 0, key: -1, door: -1 };
  const stack = [0]; seen[0] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1], x = c % w, y = (c / w) | 0;
    const opts = [];
    DIRS.forEach(([dx, dy], d) => {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx]) opts.push(d);
    });
    if (!opts.length) { stack.pop(); continue; }
    const d = opts[(r() * opts.length) | 0], n = step(mz, c, d);
    open[c] |= 1 << d; open[n] |= 1 << ((d + 2) % 4); seen[n] = 1; stack.push(n);
  }
  // knock a few more openings through, leaving the dead ends as they are
  for (let made = 0, tries = 0; made < Math.round(N / 20) && tries < 400; tries++) {
    const c = (r() * N) | 0, d = r() < 0.5 ? 1 : 2, x = c % w, y = (c / w) | 0;
    if ((d === 1 ? x === w - 1 : y === h - 1) || open[c] & (1 << d)) continue;
    const n = step(mz, c, d);
    if (exits(mz, c).length < 2 || exits(mz, n).length < 2) continue;
    open[c] |= 1 << d; open[n] |= 1 << ((d + 2) % 4); made++;
  }
  // the goal is the spot that takes the most choices to reach
  let far = -1, best = 0;
  for (let c = 1; c < N; c++) {
    if (exits(mz, c).length !== 1) continue;
    mz.goal = c; const n = movesLeft(mz, 0);
    if (n > far) { far = n; best = c; }
  }
  mz.goal = best;
  if (r() < 0.7) lockDoor(mz, r);
  return mz;
}
/** Every cell's parent on the way back to cell 0, skipping cell `wall`. */
function treeFrom0(mz, wall = -1) {
  const par = new Int16Array(mz.w * mz.h).fill(-2), q = [0]; par[0] = -1;
  while (q.length) {
    const a = q.shift();
    for (const d of exits(mz, a)) { const b = step(mz, a, d); if (b !== wall && par[b] === -2) { par[b] = a; q.push(b); } }
  }
  return par;
}
function lockDoor(mz, r) {
  const par = treeFrom0(mz), route = [];
  for (let c = mz.goal; c > 0; c = par[c]) route.unshift(c); // the cells from the start to the goal, start left out
  const onRoute = new Set(route);
  // a door in the back half of the route, best in a plain corridor
  let spots = route.slice(Math.floor(route.length * 0.4), -1);
  const plain = spots.filter(c => exits(mz, c).length === 2);
  if (plain.length) spots = plain;
  for (let tries = 0; tries < 12 && spots.length; tries++) {
    const door = spots.splice((r() * spots.length) | 0, 1)[0], near = treeFrom0(mz, door);
    if (near[mz.goal] !== -2) continue; // there is a way around this spot: a door here would stop nobody
    // the key goes in a dead end on the start's side of the door, as far off the route as can be
    let key = -1, deep = 0;
    for (let c = 1; c < mz.w * mz.h; c++) {
      if (near[c] === -2 || onRoute.has(c) || exits(mz, c).length !== 1) continue;
      let n = 0; for (let a = c; !onRoute.has(a) && a > 0; a = near[a]) n++;
      if (n > deep) { deep = n; key = c; }
    }
    if (key >= 0) { mz.door = door; mz.key = key; return; }
  }
}
export const exits = (mz, c) => [0, 1, 2, 3].filter(d => mz.open[c] & (1 << d));
/** Is the way out of `c` by exit `d` shut by the locked door? */
export const locked = (mz, c, d, hasKey) => !hasKey && step(mz, c, d) === mz.door;
/** Cells walked when leaving `c` by exit `d`: on to the next fork, dead end, key, locked door, or the goal. */
export function runFrom(mz, c, d, hasKey = true) {
  const path = [];
  while (path.length < mz.w * mz.h) {
    if (locked(mz, c, d, hasKey)) break;
    c = step(mz, c, d); path.push(c);
    if (c === mz.goal || (c === mz.key && !hasKey)) break;
    const outs = exits(mz, c).filter(k => k !== (d + 2) % 4);
    if (outs.length !== 1) break;
    d = outs[0];
  }
  return path;
}
/** Fewest choices from cell `c` to the goal, doors aside. */
export function movesLeft(mz, c) {
  const dist = new Map([[c, 0]]), q = [c];
  while (q.length) {
    const a = q.shift();
    if (a === mz.goal) return dist.get(a);
    for (const d of exits(mz, a)) {
      const b = runFrom(mz, a, d).pop();
      if (!dist.has(b)) { dist.set(b, dist.get(a) + 1); q.push(b); }
    }
  }
  return 0;
}
/** The cell reached by one step from `c` through exit `d`. */
export const stepTo = (mz, c, d) => step(mz, c, d);
/** What this player has explored, as text to send to the others in the maze: 'k' or '-' for the key, then the seen cells in hex. */
export function packSeen(g) { return (g.hasKey ? 'k' : '-') + packBits(g.seen); }
/** A row of yes-or-no cells as hex text, and back again (adding to what is there). */
export function packBits(a) {
  let s = '';
  for (let i = 0; i < a.length; i += 4) s += ((a[i] ? 1 : 0) | (a[i + 1] ? 2 : 0) | (a[i + 2] ? 4 : 0) | (a[i + 3] ? 8 : 0)).toString(16);
  return s;
}
export function mergeBits(a, s) {
  if (typeof s !== 'string') return;
  for (let i = 0; i < a.length; i++) if (parseInt(s[i >> 2], 16) >> (i & 3) & 1) a[i] = 1;
}
/** Add what a teammate has explored. Returns true if they have the key. */
export function mergeSeen(g, s) {
  if (typeof s !== 'string' || !s) return false;
  mergeBits(g.seen, s.slice(1));
  return s[0] === 'k';
}
/** Light up what can be seen from cell `c`: the cell itself and two cells down each open corridor. */
export function reveal(g, c) {
  const mz = g.mz;
  g.seen[c] = 1;
  for (const d of exits(mz, c)) {
    let a = c;
    for (let k = 0; k < 2 && mz.open[a] & (1 << d); k++) {
      a = step(mz, a, d); g.seen[a] = 1;
      if (a === mz.door && !g.hasKey) break; // no seeing through a shut door
    }
  }
}

// ---------- hallway run ----------
export const runX = i => 320 + i * 280; // where obstacle i stands; the goal is at runX(6)
export const runStop = placed => runX(Math.min(6, placed)) - 78;
/**
 * What stands in each of the three lanes at each of the six stops:
 * 0 a clear lane, 1 something in the way, 2 a clear lane with a ⚡ on it.
 * Half the stops have one clear lane; the others add a ⚡ lane. Same for everyone in the building.
 */
export function runCols(id) {
  const r = rng(seedOf(id) + 3), cols = [];
  let last = 1;
  for (let i = 0; i < 6; i++) {
    let free = (r() * 3) | 0;
    if (free === last) free = (free + 1 + ((r() * 2) | 0)) % 3; // never the lane the runner is already in: a move at every stop
    const col = [1, 1, 1]; col[free] = 0;
    if (i % 2 === (seedOf(id) & 1)) col[(free + 1 + ((r() * 2) | 0)) % 3] = 2;
    cols.push(col); last = free;
  }
  return cols;
}

/** The order of the list in a fetch game. Same for everyone in the same building. */
export function orderSeq(id) {
  const r = rng(seedOf(id) + 7), seq = [0, 1, 2, 3, 4, 5];
  for (let i = 5; i > 0; i--) { const j = (r() * (i + 1)) | 0; [seq[i], seq[j]] = [seq[j], seq[i]]; }
  return seq;
}

/** Fresh state for the game in a building. `placed` is saved progress, 0 to 6. */
export function newGame(m, id, placed) {
  const g = { path: [] };
  if (m.game === 'maze') {
    const mz = g.mz = makeMaze(id); g.cell = placed >= 6 ? mz.goal : 0;
    g.px = g.cell % mz.w; g.py = (g.cell / mz.w) | 0;
    g.seen = new Uint8Array(mz.w * mz.h); g.hasKey = placed >= 6;
    g.walked = new Uint8Array(mz.w * mz.h); g.walked[0] = 1; // cells this player has stood in: those corridors need no typing again
    if (placed >= 6) g.seen.fill(1); else reveal(g, 0);
  } else if (m.game === 'run') { g.rx = runStop(placed) - (placed ? 0 : 170); g.vx = g.rx; g.raced = false; g.lost = placed >= 6; g.cols = runCols(id); g.lane = g.ly = 1; g.rest = 0; g.col = -1; g.labels = {}; }
  else if (m.game === 'order') {
    g.seq = orderSeq(id); g.labels = {};
    // where each thing sits: a place on the belt, or a numbered box on the shelf
    const r = rng(seedOf(id) + 11); g.box = [0, 1, 2, 3, 4, 5];
    for (let i = 5; i > 0; i--) { const j = (r() * (i + 1)) | 0; [g.box[i], g.box[j]] = [g.box[j], g.box[i]]; }
    g.spot = []; g.box.forEach((it, p) => { g.spot[it] = p; });
    g.belt = 0; g.open = {}; g.vis = ''; g.keep = null;
    // The lab's boxes are shown open, closed, and then shuffled: four swaps that end in the order above.
    g.swaps = []; for (let k = 0; k < 4; k++) { const a = (r() * 6) | 0; g.swaps.push([a, (a + 1 + ((r() * 5) | 0)) % 6]); }
    const at = g.box.slice(); for (const [a, b] of [...g.swaps].reverse()) [at[a], at[b]] = [at[b], at[a]];
    g.start = []; at.forEach((it, p) => { g.start[it] = p; });
    g.intro = placed >= 6 ? 99 : 0;
  }
  else if (m.game === 'quiz') newQuiz(m, id, g);
  else g.labels = {};
  return g;
}

// ---------- five small games of choosing ----------
// homes: which home does this animal live in?   odd: which one in the row is different?
// tune: play back a tune of one, two, then three notes.   dig: three treasures in seven
// spots, each miss pointing the way.   pop: catch the rabbit at the hole it pops out of.
const PITCH = [262, 330, 392, 523];
function newQuiz(m, id, g) {
  const r = rng(seedOf(id) + 23), n = k => (r() * k) | 0;
  g.labels = {}; g.seq = orderSeq(id);
  if (m.fun === 'odd') g.at = g.seq.map(() => n(5));
  if (m.fun === 'tune') { g.song = [1, 2, 3].map(len => Array.from({ length: len }, () => n(4))); g.play = 0; g.sung = -1; g.lit = -1; }
  if (m.fun === 'dig') { g.gold = [n(7), n(7), n(7)]; g.dug = {}; }
  if (m.fun === 'pop') { g.hole = n(4); g.wait = 0; }
}
/** Which tune a player is on, and how far into it, from the notes played so far. */
export const tuneAt = placed => (placed < 1 ? [0, 0] : placed < 3 ? [1, placed - 1] : [2, placed - 3]);
/** How long the tune being learned takes to play. */
export const tuneLen = (g, placed) => g.song[tuneAt(placed)[0]].length * 0.75 + 0.5;
/** Play the tune along as time passes; returns the pitch of a note that starts now, or 0. */
export function tunePlay(g, placed, dt) {
  const song = g.song[tuneAt(placed)[0]], was = Math.floor(g.play / 0.75);
  g.play += dt;
  const now = Math.floor(g.play / 0.75);
  g.lit = now < song.length && g.play % 0.75 < 0.55 ? song[now] : -1;
  return (now !== was || g.play === dt) && now < song.length ? PITCH[song[now]] : 0;
}
export const pitchOf = i => PITCH[i] || 440;
/** The choices on offer. */
export function quizOpts(m, g, placed) {
  const ids = k => Array.from({ length: k }, (_, i) => i);
  if (m.fun === 'homes') return m.homes.map((h, i) => ({ id: i, icon: h }));
  if (m.fun === 'odd') { const p = m.pairs[g.seq[placed]]; return ids(5).map(i => ({ id: i, icon: i === g.at[placed] ? p[1] : p[0] })); }
  if (m.fun === 'tune') return ids(4).map(i => ({ id: i, icon: m.items[i] }));
  if (m.fun === 'dig') return ids(7).filter(i => !g.dug[i]).map(i => ({ id: i, icon: LANE_ICONS[i] }));
  return ids(4).map(i => ({ id: i, icon: LANE_ICONS[i] }));
}
/** The right choice. */
export function quizRight(m, g, placed) {
  if (m.fun === 'homes') return m.where[g.seq[placed]];
  if (m.fun === 'odd') return g.at[placed];
  if (m.fun === 'tune') { const [s, i] = tuneAt(placed); return g.song[s][i]; }
  if (m.fun === 'dig') return g.gold[placed >> 1];
  return g.hole;
}
/** What to do, in a line. */
export function quizAsk(m, g, placed) {
  if (m.fun === 'homes') return `Where does ${m.items[g.seq[placed]]} live? Type that home's word.`;
  if (m.fun === 'odd') return 'One of these is different. Type its word.';
  if (m.fun === 'tune') return `Play the tune back: note ${tuneAt(placed)[1] + 1} of ${g.song[tuneAt(placed)[0]].length}. Type that instrument's word.`;
  if (m.fun === 'dig') return 'Where is the treasure buried? Type a spot\'s word to dig there.';
  return 'Quick, catch the rabbit! Type the word of the hole he is in.';
}
/** A wrong choice: change what needs changing and say why. */
export function quizMiss(m, g, pick, right) {
  if (m.fun === 'homes') return 'That is not its home. Try another!';
  if (m.fun === 'odd') return 'That one is the same as the others. Look again!';
  if (m.fun === 'tune') { g.play = 0; return 'Not that one. Listen to the tune again.'; }
  if (m.fun === 'dig') { g.dug[pick] = right > pick ? '➡️' : '⬅️'; return `Nothing here. The treasure is further ${g.dug[pick]}`; }
  g.hole = (g.hole + 1 + ((Math.random() * 3) | 0)) % 4; g.wait = 0;
  return 'Missed! He popped up somewhere else.';
}
/** A right choice: set up what comes next. */
export function quizHit(m, g) {
  if (m.fun === 'dig') g.dug = {};
  if (m.fun === 'pop') { g.hole = (g.hole + 1 + ((Math.random() * 3) | 0)) % 4; g.wait = 0; }
}

// ---------- fires and leaks ----------
const FIRE_SPOTS = 10;
const fireSpot = i => ({ x: 0.14 + (i % 5) * 0.18, y: i < 5 ? 0.12 : 0.88 });
/** Which spots still burn (or leak): the ones this player has not dealt with, at most `hp` of them. */
export function fires(room, hp) {
  let live = [];
  for (let i = 0; i < FIRE_SPOTS; i++) if (!room.out.has(i)) live.push(i);
  if (!live.length && hp > 0) { room.out.clear(); live = [...Array(FIRE_SPOTS).keys()]; }
  return live.slice(0, hp);
}
/** The burning spot the player is standing at, or -1. */
export function nearFire(room, hp) {
  let best = -1, bd = 66;
  for (const i of fires(room, hp)) {
    const s = fireSpot(i), d = Math.hypot((s.x - room.x) * 820, (s.y - room.y) * 130);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------- drawing ----------
function frameOf(v) {
  const y0 = 96, W = Math.min(820, v.w - 24), H = Math.max(230, Math.min(400, v.h - v.ph - y0 - 48));
  return { x0: (v.w - W) / 2, y0, W, H };
}
function title(ctx, F, text) {
  ctx.fillStyle = '#0007'; ctx.font = '800 20px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, F.x0 + 20, F.y0 + 22);
}
function room(ctx, F, m) {
  const floorY = F.y0 + F.H * 0.6, fh = F.y0 + F.H - floorY;
  ctx.fillStyle = m.wall; ctx.beginPath(); ctx.roundRect(F.x0, F.y0, F.W, F.H, 18); ctx.fill();
  ctx.fillStyle = m.floor; ctx.beginPath(); ctx.roundRect(F.x0, floorY, F.W, fh, [0, 0, 18, 18]); ctx.fill();
  return { floorY, fh, fx: x => F.x0 + F.W * x, fy: y => floorY + fh * (0.22 + 0.7 * y) };
}

function drawMaze(ctx, v, F) {
  const { m, g, t } = v, mz = g.mz, MW = mz.w, MH = mz.h, pad = 16, gx = F.x0 + pad, gy = F.y0 + 42, gw = F.W - 2 * pad, gh = F.H - 42 - pad;
  const cw = gw / MW, ch = gh / MH;
  ctx.fillStyle = m.wall; ctx.beginPath(); ctx.roundRect(F.x0, F.y0, F.W, F.H, 18); ctx.fill();
  ctx.fillStyle = '#241d38'; ctx.fillRect(gx, gy, gw, gh); // the dark: not seen yet
  const sees = c => g.seen[c] || v.mates.some(o => Math.round(o.ix / 100) + Math.round(o.iy / 100) * MW === c); // friends carry a light too
  ctx.fillStyle = m.floor;
  for (let c = 0; c < MW * MH; c++) if (sees(c)) ctx.fillRect(gx + (c % MW) * cw - 0.5, gy + ((c / MW) | 0) * ch - 0.5, cw + 1, ch + 1);
  const doorSeen = mz.door >= 0 && g.seen[mz.door];
  title(ctx, F, `${m.title.toUpperCase()}: find ${m.goal}` + (g.hasKey && mz.door >= 0 && v.placed < 6 ? '   🗝️ you have the key' : doorSeen && !g.hasKey ? '   🔒 find the 🗝️ key' : ''));
  ctx.strokeStyle = '#3a2f55'; ctx.lineWidth = MW > 11 ? 4 : 6; ctx.lineCap = 'round'; ctx.beginPath();
  for (let c = 0; c < MW * MH; c++) {
    if (!sees(c)) continue;
    const x = gx + (c % MW) * cw, y = gy + ((c / MW) | 0) * ch, o = mz.open[c];
    if (!(o & 1)) { ctx.moveTo(x, y); ctx.lineTo(x + cw, y); }
    if (!(o & 2)) { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch); }
    if (!(o & 4)) { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch); }
    if (!(o & 8)) { ctx.moveTo(x, y); ctx.lineTo(x, y + ch); }
  }
  ctx.stroke();
  const cx = c => gx + (c + 0.5) * cw, cy = c => gy + (c + 0.5) * ch, big = Math.min(44, ch * 0.6, cw * 0.6);
  const at = (e, c, size, dy = 0) => emoji(ctx, e, cx(c % MW), cy((c / MW) | 0) + dy, size);
  const gl = mz.goal, found = v.placed >= 6;
  if (g.seen[gl]) emoji(ctx, m.goal, cx(gl % MW) + (found ? cw * 0.3 : 0), cy((gl / MW) | 0) + Math.sin(t * 4) * 3, big);
  if (doorSeen && !g.hasKey) { at('🚪', mz.door, big); at('🔒', mz.door, big * 0.5, 2); }
  if (mz.key >= 0 && g.seen[mz.key] && !g.hasKey) at('🗝️', mz.key, big * 0.8, Math.sin(t * 5) * 3);
  const X = cx(g.px), Y = cy(g.py);
  for (const d of v.opts) emoji(ctx, ARROWS[d], X + DIRS[d][0] * cw * 0.4, Y + DIRS[d][1] * ch * 0.4, Math.min(20, ch * 0.4) + Math.sin(t * 6) * 2);
  const s = Math.min(0.75, ch / 100);
  for (const o of v.mates) { ctx.save(); ctx.translate(cx(Math.min(MW - 1, Math.max(0, o.ix / 100))), cy(Math.min(MH - 1, Math.max(0, o.iy / 100))) + ch * 0.3); ctx.scale(s, s); v.drawMate(o, 0, 0); ctx.restore(); }
  ctx.save(); ctx.translate(X, Y + ch * 0.3); ctx.scale(s, s); v.drawMe(0, 0); ctx.restore();
  if (g.hasKey && !found) emoji(ctx, '🗝️', X + cw * 0.28, Y - ch * 0.25, big * 0.45);
}

export const LANE_ICONS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];
const BOX_SHOW = 3.5, BOX_SHUT = 0.8, BOX_SWAP = 1.1;
/** How long the lab's show-and-shuffle takes. */
export const boxIntroLen = g => BOX_SHOW + BOX_SHUT + g.swaps.length * BOX_SWAP;
/** Where a thing's box is right now: its place on the shelf (between two places mid-swap) and how far it is lifted. */
function boxNow(g, item) {
  let p = g.start[item], lift = 0;
  const t = g.intro - BOX_SHOW - BOX_SHUT;
  g.swaps.forEach(([a, b], k) => {
    const u = (t - k * BOX_SWAP) / (BOX_SWAP * 0.85);
    if (u <= 0 || (p !== a && p !== b)) return;
    const to = p === a ? b : a;
    if (u >= 1) { p = to; return; }
    lift = Math.sin(u * Math.PI) * (p === a ? 1 : -0.35); // one goes over, the other slips under
    p += (to - p) * u * u * (3 - 2 * u);
  });
  return { p, lift };
}
/** How far along the belt a thing is, 0 to 1, or -1 while it is out of sight round the back. */
export const beltX = (g, item) => { const u = (((g.belt + g.spot[item]) % 6) + 6) % 6; return u < 3 ? u / 3 : -1; };
function drawRun(ctx, v, F) {
  const { m, g, t } = v, ground = F.y0 + F.H * 0.46, fh = F.y0 + F.H - ground;
  const laneY = l => ground + fh * (0.3 + 0.27 * l);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(F.x0, F.y0, F.W, F.H, 18); ctx.clip();
  ctx.fillStyle = m.wall; ctx.fillRect(F.x0, F.y0, F.W, F.H);
  ctx.fillStyle = m.floor; ctx.fillRect(F.x0, ground, F.W, F.H);
  const cam = g.rx - F.W * 0.3, sx = X => F.x0 + X - cam;
  for (let k = Math.floor(cam / 240); k < cam / 240 + 5; k++) { // windows drifting by
    ctx.fillStyle = '#ffffff66'; ctx.fillRect(sx(k * 240 + 60), F.y0 + 44, 70, 50);
  }
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.setLineDash([14, 12]); ctx.lineDashOffset = cam; // lane lines
  for (const l of [0.5, 1.5]) { ctx.beginPath(); ctx.moveTo(F.x0, laneY(l) + 8); ctx.lineTo(F.x0 + F.W, laneY(l) + 8); ctx.stroke(); }
  ctx.setLineDash([]);
  // the one to beat runs along the wall, out of the lanes
  if (m.rival) {
    const rx = Math.max(F.x0 + 28, sx(g.vx)), ry = ground - 22 - (g.rest > 0 ? 0 : Math.abs(Math.sin(t * 7)) * (g.racing ? 12 : 2));
    ctx.fillStyle = '#0002'; ctx.beginPath(); ctx.ellipse(rx, ground + 2, 18, 5, 0, 0, 7); ctx.fill();
    emoji(ctx, m.rival[0], rx, ry, 40);
    if (g.rest > 0) emoji(ctx, '💫', rx + 16, ry - 22, 18);
    ctx.font = '800 13px system-ui'; ctx.fillStyle = '#0008'; ctx.textAlign = 'center'; ctx.fillText(m.rival[1], rx, ry - 32);
  }
  const size = Math.min(46, fh * 0.34);
  emoji(ctx, m.goal, sx(runX(6)), laneY(1) - 30 + Math.sin(t * 4) * 4, 68);
  // lane by lane, back to front, so nearer things cover farther ones
  for (let l = 0; l < 3; l++) {
    const y = laneY(l);
    for (let i = 0; i < 6; i++) {
      const x = sx(runX(i)), c = g.cols[i][l], next = i === v.placed;
      ctx.globalAlpha = i < v.placed ? 0.35 : 1;
      if (c === 1) emoji(ctx, m.items[(i + l * 2) % 6], x, y - size * 0.4, size);
      else if (c === 2 && i >= v.placed) emoji(ctx, '⚡', x, y - size * 0.4 + Math.sin(t * 6 + i) * 3, size * 0.8);
      ctx.globalAlpha = 1;
      if (next && v.opts.length) emoji(ctx, LANE_ICONS[l], x - 62, y - 6, 22 + Math.sin(t * 6) * 1.5); // the lane's number, as on the choices
    }
    for (const o of v.mates) if (Math.round(o.iy / 100) === l) v.drawMate(o, sx(o.ix), y + 8);
    if (Math.round(g.ly) === l) v.drawMe(sx(g.rx), laneY(g.ly) + 8);
  }
  ctx.restore();
  title(ctx, F, `${m.title.toUpperCase()}: get to ${m.goal}` + (m.rival && !g.lost && v.placed < 6 ? ` before ${m.rival[1]}!` : ''));
}

function drawOrder(ctx, v, F) {
  const { m, g, t } = v, R = room(ctx, F, m);
  title(ctx, F, m.title.toUpperCase());
  // the list: what to fetch, in order
  const n = 6, tw = n * 44 + 70, tx = F.x0 + F.W - tw - 16, ty = F.y0 + 10;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(tx, ty, tw, 50, 12); ctx.fill();
  ctx.fillStyle = '#6b6480'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('LIST', tx + 12, ty + 26);
  g.seq.forEach((it, k) => {
    const x = tx + 76 + k * 44, y = ty + 25;
    const got = v.mask >> it & 1, theirs = v.mates.find(o => o.want === it);
    if (it === v.want) { ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.stroke(); } // the one for this player
    else if (theirs && !got) { ctx.strokeStyle = v.colorOf(theirs); ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.stroke(); ctx.setLineDash([]); } // someone else is on it
    ctx.globalAlpha = got ? 0.3 : 1;
    emoji(ctx, m.items[it], x, y + 1, 26);
    ctx.globalAlpha = 1;
    if (got) emoji(ctx, '✅', x + 10, y + 10, 14);
  });
  // the shelf, or the belt
  const shelfY = F.y0 + F.H * 0.5, x0 = F.x0 + F.W * 0.3, sw = F.W * 0.64;
  if (m.fun === 'belt') { // things ride past, left to right
    ctx.fillStyle = '#4a4458'; ctx.beginPath(); ctx.roundRect(x0, shelfY - 2, sw, 14, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(x0, shelfY - 70, sw, 90); ctx.clip();
    ctx.fillStyle = '#ffffff33';
    for (let k = -1; k < 14; k++) ctx.fillRect(x0 + ((k + (g.belt * 4) % 1) / 12) * sw, shelfY, 6, 10);
    for (let i = 0; i < 6; i++) {
      const u = beltX(g, i);
      if (v.mask >> i & 1 || u < 0) continue;
      emoji(ctx, m.items[i], x0 + u * sw, shelfY - 26 - (v.opts.includes(i) && i === v.want ? Math.abs(Math.sin(t * 6)) * 6 : 0), 46);
    }
    ctx.restore();
  } else {
    ctx.fillStyle = '#0003'; ctx.fillRect(x0, shelfY, sw, 8);
    const ready = m.fun !== 'boxes' || g.intro >= boxIntroLen(g);
    for (let i = 0; i < 6; i++) {
      if (v.mask >> i & 1) continue;
      const hot = v.opts.includes(i);
      if (m.fun !== 'boxes') { emoji(ctx, m.items[i], R.fx(0.36 + i * 0.105), shelfY - 26 - (hot ? Math.abs(Math.sin(t * 4 + i)) * 4 : 0), 46); continue; }
      const b = boxNow(g, i), x = R.fx(0.36 + b.p * 0.105), y = shelfY - 26 - b.lift * 34 - (hot ? Math.abs(Math.sin(t * 4 + i)) * 4 : 0);
      if (g.intro < BOX_SHOW) emoji(ctx, m.items[i], x, y, 44); // first, everything in plain sight
      else if (g.open[i] > 0) { emoji(ctx, '📭', x, shelfY - 20, 30); emoji(ctx, m.items[i], x, shelfY - 52, 40); } // opened for a look
      else emoji(ctx, '📦', x, y, 44);
      if (ready) emoji(ctx, LANE_ICONS[g.spot[i]], x, shelfY + 22, 20);
    }
  }
  const nx = R.fx(0.1), ny = R.floorY + 6;
  emoji(ctx, m.face, nx, ny - 8 + Math.sin(t * 3) * 2, 78);
  ctx.font = '800 16px system-ui'; ctx.fillStyle = '#0007'; ctx.textAlign = 'center'; ctx.fillText(m.who, nx, ny + 54);
  emoji(ctx, '🧺', R.fx(0.24), ny + 30 - Math.max(0, 0.25 - v.pop) * 60, 50);
  ctx.font = '800 16px system-ui'; ctx.fillStyle = '#0007'; ctx.fillText(`${Math.min(6, v.placed)} of 6`, R.fx(0.24), ny + 66);
  v.mates.forEach((o, n) => v.drawMate(o, R.fx(0.62 + n * 0.09), R.fy(0.6)));
  v.drawMe(R.fx(0.52), R.fy(0.6));
}

/** The neighbor on the left, and how far along things are. */
function helper(ctx, v, R, count) {
  const { m, t } = v, nx = R.fx(0.1), ny = R.floorY + 6;
  emoji(ctx, m.face, nx, ny - 8 + Math.sin(t * 3) * 2, 78);
  ctx.font = '800 16px system-ui'; ctx.fillStyle = '#0007'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(m.who, nx, ny + 54);
  if (count) ctx.fillText(count, R.fx(0.24), ny + 54);
}
function drawQuiz(ctx, v, F) {
  const { m, g, t } = v, R = room(ctx, F, m), p = Math.min(6, v.placed), done = p >= 6;
  title(ctx, F, m.title.toUpperCase());
  helper(ctx, v, R, `${p} of 6`);
  const y = F.y0 + F.H * 0.46, X = (i, n) => R.fx(0.4 + (n > 1 ? i / (n - 1) : 0.5) * 0.5);
  const num = (i, x, yy) => { if (v.opts.includes(i)) emoji(ctx, LANE_ICONS[i], x, yy, 20); };
  if (m.fun === 'homes') {
    m.homes.forEach((h, i) => {
      emoji(ctx, h, X(i, 3), y - 10, 58);
      g.seq.slice(0, p).filter(a => m.where[a] === i).forEach((a, k) => emoji(ctx, m.items[a], X(i, 3) - 18 + k * 36, y + 42, 30)); // the ones already home
    });
    if (!done) emoji(ctx, m.items[g.seq[p]], R.fx(0.25), y - 6 + Math.sin(t * 5) * 5, 52);
  } else if (m.fun === 'odd') {
    const pair = m.pairs[g.seq[Math.min(5, p)]];
    for (let i = 0; i < 5; i++) emoji(ctx, done ? m.items[i] : i === g.at[p] ? pair[1] : pair[0], X(i, 5), y + Math.sin(t * 3 + i) * 3, 50);
  } else if (m.fun === 'tune') {
    for (let i = 0; i < 4; i++) {
      const lit = g.lit === i;
      if (lit) { ctx.fillStyle = '#fff8'; ctx.beginPath(); ctx.arc(X(i, 4), y, 44, 0, 7); ctx.fill(); }
      emoji(ctx, m.items[i], X(i, 4), y - (lit ? 8 : 0), lit ? 66 : 50);
    }
    emoji(ctx, done ? '🎶' : '🎵'.repeat(tuneAt(p)[1]) || '👂', R.fx(0.25), y, 30);
  } else if (m.fun === 'dig') {
    for (let i = 0; i < 7; i++) {
      const x = X(i, 7);
      ctx.fillStyle = '#c9a96a'; ctx.beginPath(); ctx.ellipse(x, y + 14, 26, 12, 0, 0, 7); ctx.fill();
      if (g.dug[i]) emoji(ctx, g.dug[i], x, y - 6, 30); else emoji(ctx, done ? '🕳️' : '❌', x, y - 4, 22);
      if (!g.dug[i] && !done) emoji(ctx, LANE_ICONS[i], x, y + 36, 18);
    }
    for (let k = 0; k < p >> 1; k++) emoji(ctx, m.items[k], R.fx(0.2) + k * 30, y - 6, 30); // treasures found
  } else {
    for (let i = 0; i < 4; i++) {
      const x = X(i, 4);
      ctx.fillStyle = '#5b4632'; ctx.beginPath(); ctx.ellipse(x, y + 20, 34, 13, 0, 0, 7); ctx.fill();
      if (i === g.hole && !done) emoji(ctx, '🐰', x, y - 8 - Math.abs(Math.sin(t * 5)) * 8, 46);
      emoji(ctx, LANE_ICONS[i], x, y + 46, 20);
    }
    for (let k = 0; k < 6 - p; k++) emoji(ctx, '🥕', R.fx(0.19) + (k % 3) * 22, y - 12 + ((k / 3) | 0) * 24, 22); // carrots still to save
  }
  v.mates.forEach((o, n) => v.drawMate(o, R.fx(0.62 + n * 0.09), R.fy(0.7)));
  v.drawMe(R.fx(0.52), R.fy(0.7));
}

/** The team building: everyone in a row, and the one thing they are all working on. */
function drawTeam(ctx, v, F) {
  const { m, t } = v, R = room(ctx, F, m), tm = v.team && v.team.key === v.roomKey ? v.team : null, on = !!tm?.on;
  title(ctx, F, m.title.toUpperCase() + (v.placed >= 6 ? '' : on ? '' : '   🔒 waiting for the whole team'));
  helper(ctx, v, R, '');
  const ids = (on ? [...tm.here] : [v.meId, ...v.mates.map(o => o.id)]).sort(), n = ids.length;
  const px = i => R.fx(0.34 + (n > 1 ? i / (n - 1) : 0.5) * 0.52), py = R.fy(0.6), top = F.y0 + 64, mid = R.fx(0.6);
  if (m.team === 'lift') { // the bell rises a notch each round
    const h = on ? tm.n / tm.goal : v.placed >= 6 ? 1 : 0, by = R.floorY - 30 - h * (R.floorY - top - 40);
    ctx.strokeStyle = '#7a6a55'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(mid, top - 20); ctx.lineTo(mid, by - 26); ctx.stroke();
    emoji(ctx, '🔔', mid + Math.sin(t * 3) * (on ? 3 : 0), by, 64);
  } else if (m.team === 'pump') { // the balloon fills, and leaks
    const lvl = on ? tm.lvl : v.placed >= 6 ? 1 : 0;
    emoji(ctx, '🎈', mid, top + 40 - lvl * 10 + Math.sin(t * 2) * 3, 30 + lvl * 80);
    ctx.fillStyle = '#0002'; ctx.fillRect(R.fx(0.34), top - 16, F.W * 0.52, 12);
    ctx.fillStyle = lvl > 0.8 ? '#2fae66' : '#ff8a3d'; ctx.fillRect(R.fx(0.34), top - 16, F.W * 0.52 * lvl, 12);
  }
  ids.forEach((id, i) => {
    const o = v.mates.find(x => x.id === id);
    if (id === v.meId) v.drawMe(px(i), py); else if (o) v.drawMate(o, px(i), py);
    if (!on) return;
    if (m.team === 'ball' && tm.turn === id) emoji(ctx, '🏀', px(i) + 22, py - 96 - Math.abs(Math.sin(t * 6)) * 14, 34);
    if (m.team === 'lift' && tm.did[id]) emoji(ctx, '💪', px(i), py - 104, 26);
  });
  if (on && m.team !== 'pump') {
    ctx.font = '800 18px system-ui'; ctx.fillStyle = '#0008'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(m.team === 'ball' ? `passes: ${tm.n} of ${tm.goal}` : `heaves: ${tm.n} of ${tm.goal}`, F.x0 + F.W - 20, F.y0 + 22);
  }
}

function drawRescue(ctx, v, F) {
  const { m, t, job } = v, R = room(ctx, F, m), fire = job.t === 0;
  title(ctx, F, fire ? '🔥 FIRE! Walk to each fire and put it out.' : '💦 BURST PIPES! Walk to each leak and fix it.');
  const live = fires(v, job.hp);
  const draw = i => {
    const s = fireSpot(i), x = R.fx(s.x), y = R.fy(s.y);
    if (v.nearF === i) {
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.4);
      ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 6; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 24;
      ctx.beginPath(); ctx.arc(0, 0, 38, 0, 7); ctx.stroke(); ctx.restore(); ctx.setLineDash([]);
    }
    if (fire) emoji(ctx, '🔥', x, y - 26, 50 + Math.sin(t * 9 + i * 2) * 6);
    else { emoji(ctx, '💦', x, y - 30 - Math.abs(Math.sin(t * 5 + i)) * 8, 42); emoji(ctx, '🔩', x, y - 6, 22); }
  };
  live.filter(i => i < 5).forEach(draw);
  emoji(ctx, m.face, R.fx(0.04), R.floorY - 4 + Math.sin(t * 14) * 2, 60);
  for (const o of v.mates) v.drawMate(o, R.fx(o.ix / 1000), R.fy(o.iy / 1000));
  v.drawMe(R.fx(v.x), R.fy(v.y));
  live.filter(i => i >= 5).forEach(draw);
}

/**
 * Draw a building's game.
 * v: { w, h, ph, t, m, g, placed, pop, opts (ids of the choices on offer), job, out, nearF, x, y, drawMe(x, y),
 *      mates (others in this building, with ix, iy, want), drawMate(o, x, y), mask (slots done), want (this player's slot), colorOf(o) }
 */
export function drawGame(ctx, v) {
  ctx.fillStyle = '#2b2340'; ctx.fillRect(0, 0, v.w, v.h);
  const F = frameOf(v);
  if (v.job) drawRescue(ctx, v, F);
  else if (v.m.game === 'maze') drawMaze(ctx, v, F);
  else if (v.m.game === 'run') drawRun(ctx, v, F);
  else if (v.m.game === 'quiz') drawQuiz(ctx, v, F);
  else if (v.m.game === 'team') drawTeam(ctx, v, F);
  else drawOrder(ctx, v, F);
}
