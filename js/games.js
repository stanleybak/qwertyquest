// The little games inside buildings: a maze, a hallway run, fetching things in
// order, and putting out fires or fixing leaks. This file holds their rules
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
export const MW = 8, MH = 5;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
export const ARROWS = ['⬆️', '➡️', '⬇️', '⬅️'];
const step = (c, d) => c + DIRS[d][0] + DIRS[d][1] * MW;

/** A maze with one route between any two cells. Same on every visit to the same building. */
export function makeMaze(id) {
  const r = rng(seedOf(id)), open = new Uint8Array(MW * MH), seen = new Uint8Array(MW * MH);
  const stack = [0]; seen[0] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1], x = c % MW, y = (c / MW) | 0;
    const opts = [];
    DIRS.forEach(([dx, dy], d) => {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && !seen[ny * MW + nx]) opts.push(d);
    });
    if (!opts.length) { stack.pop(); continue; }
    const d = opts[(r() * opts.length) | 0], n = step(c, d);
    open[c] |= 1 << d; open[n] |= 1 << ((d + 2) % 4); seen[n] = 1; stack.push(n);
  }
  const mz = { open, goal: 0 };
  // the goal is the spot that takes the most choices to reach
  let far = -1;
  for (let c = 1; c < MW * MH; c++) {
    if (exits(mz, c).length !== 1) continue;
    mz.goal = c; const n = movesLeft(mz, 0);
    if (n > far) { far = n; mz.best = c; }
  }
  mz.goal = mz.best;
  return mz;
}
export const exits = (mz, c) => [0, 1, 2, 3].filter(d => mz.open[c] & (1 << d));
/** Cells walked when leaving `c` by exit `d`: on to the next fork, dead end, or the goal. */
export function runFrom(mz, c, d) {
  const path = [];
  for (;;) {
    c = step(c, d); path.push(c);
    if (c === mz.goal) break;
    const outs = exits(mz, c).filter(k => k !== (d + 2) % 4);
    if (outs.length !== 1) break;
    d = outs[0];
  }
  return path;
}
/** Fewest choices from cell `c` to the goal. */
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

// ---------- hallway run ----------
export const runX = i => 320 + i * 280; // where obstacle i stands; the goal is at runX(6)
export const runStop = placed => runX(Math.min(6, placed)) - 78;

/** Fresh state for the game in a building. `placed` is saved progress, 0 to 6. */
export function newGame(m, id, placed) {
  const g = { path: [] };
  if (m.game === 'maze') {
    g.mz = makeMaze(id); g.cell = placed >= 6 ? g.mz.goal : 0;
    g.px = g.cell % MW; g.py = (g.cell / MW) | 0;
  } else if (m.game === 'run') g.rx = runStop(placed) - (placed ? 0 : 170);
  else if (m.game === 'order') {
    const r = rng(seedOf(id) + 7);
    g.seq = [0, 1, 2, 3, 4, 5]; g.labels = {};
    for (let i = 5; i > 0; i--) { const j = (r() * (i + 1)) | 0; [g.seq[i], g.seq[j]] = [g.seq[j], g.seq[i]]; }
  }
  return g;
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
  const { m, g, t } = v, pad = 16, gx = F.x0 + pad, gy = F.y0 + 42, gw = F.W - 2 * pad, gh = F.H - 42 - pad;
  const cw = gw / MW, ch = gh / MH;
  ctx.fillStyle = m.wall; ctx.beginPath(); ctx.roundRect(F.x0, F.y0, F.W, F.H, 18); ctx.fill();
  ctx.fillStyle = m.floor; ctx.fillRect(gx, gy, gw, gh);
  title(ctx, F, `${m.title.toUpperCase()}: find ${m.goal}`);
  ctx.strokeStyle = '#3a2f55'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
  for (let c = 0; c < MW * MH; c++) {
    const x = gx + (c % MW) * cw, y = gy + ((c / MW) | 0) * ch, o = g.mz.open[c];
    if (!(o & 1)) { ctx.moveTo(x, y); ctx.lineTo(x + cw, y); }
    if (!(o & 2)) { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch); }
    if (!(o & 4)) { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch); }
    if (!(o & 8)) { ctx.moveTo(x, y); ctx.lineTo(x, y + ch); }
  }
  ctx.stroke();
  const cx = c => gx + (c + 0.5) * cw, cy = c => gy + (c + 0.5) * ch;
  const gl = g.mz.goal, found = v.placed >= 6;
  emoji(ctx, m.goal, cx(gl % MW) + (found ? 26 : 0), cy((gl / MW) | 0) + Math.sin(t * 4) * 3, Math.min(44, ch * 0.55));
  const X = cx(g.px), Y = cy(g.py);
  for (const d of v.opts) emoji(ctx, ARROWS[d], X + DIRS[d][0] * cw * 0.4, Y + DIRS[d][1] * ch * 0.4, 20 + Math.sin(t * 6) * 2);
  const s = Math.min(0.75, ch / 100);
  ctx.save(); ctx.translate(X, Y + ch * 0.3); ctx.scale(s, s); v.drawMe(0, 0); ctx.restore();
}

function drawRun(ctx, v, F) {
  const { m, g, t } = v, ground = F.y0 + F.H * 0.74;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(F.x0, F.y0, F.W, F.H, 18); ctx.clip();
  ctx.fillStyle = m.wall; ctx.fillRect(F.x0, F.y0, F.W, F.H);
  ctx.fillStyle = m.floor; ctx.fillRect(F.x0, ground, F.W, F.H);
  const cam = g.rx - F.W * 0.3, sx = X => F.x0 + X - cam;
  for (let k = Math.floor(cam / 240); k < cam / 240 + 5; k++) { // windows drifting by
    ctx.fillStyle = '#ffffff66'; ctx.fillRect(sx(k * 240 + 60), F.y0 + 50, 70, 60);
    ctx.fillStyle = '#0001'; ctx.fillRect(sx(k * 240), ground, 4, F.H);
  }
  let lift = 0;
  for (let i = 0; i < 6; i++) {
    const d = (g.rx - runX(i)) / 80;
    if (i < v.placed && Math.abs(d) < 1) lift = Math.max(lift, (1 - d * d) * 78);
    ctx.globalAlpha = i < v.placed ? 0.4 : 1;
    emoji(ctx, m.items[i], sx(runX(i)), ground - 24, 52);
    ctx.globalAlpha = 1;
  }
  emoji(ctx, m.goal, sx(runX(6)), ground - 34 + Math.sin(t * 4) * 4, 68);
  v.drawMe(sx(g.rx), ground + 10 - lift);
  ctx.restore();
  title(ctx, F, `${m.title.toUpperCase()}: get to ${m.goal}`);
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
    if (k === v.placed) { ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = k < v.placed ? 0.3 : 1;
    emoji(ctx, m.items[it], x, y + 1, 26);
    ctx.globalAlpha = 1;
    if (k < v.placed) emoji(ctx, '✅', x + 10, y + 10, 14);
  });
  // the shelf
  const shelfY = F.y0 + F.H * 0.5;
  ctx.fillStyle = '#0003'; ctx.fillRect(F.x0 + F.W * 0.3, shelfY, F.W * 0.64, 8);
  for (let i = 0; i < 6; i++) {
    if (g.seq.indexOf(i) < v.placed) continue;
    const hot = v.opts.includes(i);
    emoji(ctx, m.items[i], R.fx(0.36 + i * 0.105), shelfY - 26 - (hot ? Math.abs(Math.sin(t * 4 + i)) * 6 : 0), 46);
  }
  const nx = R.fx(0.1), ny = R.floorY + 6;
  emoji(ctx, m.face, nx, ny - 8 + Math.sin(t * 3) * 2, 78);
  ctx.font = '800 16px system-ui'; ctx.fillStyle = '#0007'; ctx.textAlign = 'center'; ctx.fillText(m.who, nx, ny + 54);
  emoji(ctx, '🧺', R.fx(0.24), ny + 30 - Math.max(0, 0.25 - v.pop) * 60, 50);
  ctx.font = '800 16px system-ui'; ctx.fillStyle = '#0007'; ctx.fillText(`${Math.min(6, v.placed)} of 6`, R.fx(0.24), ny + 66);
  v.drawMe(R.fx(0.52), R.fy(0.6));
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
  v.drawMe(R.fx(v.x), R.fy(v.y));
  live.filter(i => i >= 5).forEach(draw);
}

/**
 * Draw a building's game.
 * v: { w, h, ph, t, m, g, placed, pop, opts (ids of the choices on offer), job, out, nearF, x, y, drawMe(x, y) }
 */
export function drawGame(ctx, v) {
  ctx.fillStyle = '#2b2340'; ctx.fillRect(0, 0, v.w, v.h);
  const F = frameOf(v);
  if (v.job) drawRescue(ctx, v, F);
  else if (v.m.game === 'maze') drawMaze(ctx, v, F);
  else if (v.m.game === 'run') drawRun(ctx, v, F);
  else drawOrder(ctx, v, F);
}
