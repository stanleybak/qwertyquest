// Canvas drawing. Pure view code: reads state, never changes it.
import { district, CELL_W, CELL_H, ZONE_R, JOBS } from './world.js';

export const COLORS = ['#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1', '#48dbfb', '#5f7cff', '#c56cf0', '#ff78c4'];
const ITEM_EMOJI = ['🛡️', '🏗️', '👟'];
const FLOOR_H = 28;
// How each kind of neighborhood looks: ground while building, ground when finished, road, river.
const LOOK = {
  town: ['#f3e2b8', '#e9dcc0', '#b9b3a8', '#5db7f0'], farm: ['#e6d795', '#dccd8c', '#c9a877', '#5db7f0'],
  forest: ['#bfe0a3', '#b3d697', '#c2a274', '#4fa9d8'], city: ['#e0ddd6', '#d5d2cb', '#8f8c88', '#5db7f0'],
  beach: ['#f9e9ad', '#f2e1a3', '#c79a62', '#3fc1d9'], snow: ['#f6fafd', '#eaf1f7', '#cfdde8', '#bfe3f5'],
};
const TRAFFIC = { town: ['🚗', '🚌'], city: ['🚕', '🚗', '🚚'], farm: ['🚜'], beach: ['🚲'], snow: [], forest: [] };

function emoji(ctx, e, x, y, size) {
  if (!e) return;
  ctx.fillStyle = '#000'; // color emoji take their opacity from the fill style
  ctx.font = `${size}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177 | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
};

function drawGround(ctx, v) {
  const { cam, w, h, st } = v;
  ctx.fillStyle = '#8fd16a';
  ctx.fillRect(0, 0, w, h);
  const vis = (D) => Math.abs(D.cx - cam.x) < w / 2 + CELL_W && Math.abs(D.cy - cam.y) < h / 2 + CELL_H;
  for (let i = 0; i <= st.d; i++) {
    const D = district(i);
    if (!vis(D)) continue;
    const x = D.cx - cam.x + w / 2, y = D.cy - cam.y + h / 2;
    const look = LOOK[D.env] || LOOK.town, paved = D.env === 'town' || D.env === 'city';
    ctx.fillStyle = i === st.d ? look[0] : look[1];
    rr(ctx, x - CELL_W / 2 + 14, y - CELL_H / 2 + 14, CELL_W - 28, CELL_H - 28, 36); ctx.fill();
    if (D.river) {
      ctx.fillStyle = look[3];
      ctx.fillRect(x - CELL_W / 2 + 14, y + 18, CELL_W - 28, 48);
      ctx.strokeStyle = '#fff8'; ctx.lineWidth = 2;
      for (let k = 0; k < 9; k++) {
        const wx = x - CELL_W / 2 + 50 + k * 90 + Math.sin(v.t + k) * 12, wy = y + 30 + (k % 3) * 12;
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 9, wy - 6, wx + 18, wy); ctx.stroke();
      }
      if (i < st.d) { // finished districts get a bridge
        ctx.fillStyle = '#b07a4a'; ctx.fillRect(x - 70, y + 12, 140, 60);
        ctx.strokeStyle = '#7a4f2a'; ctx.lineWidth = 3; ctx.strokeRect(x - 70, y + 12, 140, 60);
        for (let k = -60; k <= 60; k += 20) { ctx.beginPath(); ctx.moveTo(x + k, y + 12); ctx.lineTo(x + k, y + 72); ctx.stroke(); }
      }
    } else {
      ctx.fillStyle = look[2];
      ctx.fillRect(x - CELL_W / 2 + 14, y + 20, CELL_W - 28, 44);
      if (paved) { // lane markings
        ctx.strokeStyle = '#fff9'; ctx.lineWidth = 3; ctx.setLineDash([18, 16]);
        ctx.beginPath(); ctx.moveTo(x - CELL_W / 2 + 30, y + 42); ctx.lineTo(x + CELL_W / 2 - 30, y + 42); ctx.stroke();
        ctx.setLineDash([]);
      } else if (D.env === 'beach') { // boardwalk planks
        ctx.strokeStyle = '#0002'; ctx.lineWidth = 2; ctx.beginPath();
        for (let k = -CELL_W / 2 + 40; k < CELL_W / 2 - 20; k += 26) { ctx.moveTo(x + k, y + 20); ctx.lineTo(x + k, y + 64); }
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#0006'; ctx.font = '800 19px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(D.name.toUpperCase(), x, y - CELL_H / 2 + 36);
  }
  // the next district: visible, but locked
  const N = district(st.d + 1);
  if (vis(N)) {
    const x = N.cx - cam.x + w / 2, y = N.cy - cam.y + h / 2;
    ctx.fillStyle = '#2f6b2f55';
    rr(ctx, x - CELL_W / 2 + 14, y - CELL_H / 2 + 14, CELL_W - 28, CELL_H - 28, 36); ctx.fill();
    ctx.strokeStyle = '#8d6e4a'; ctx.lineWidth = 5; ctx.setLineDash([4, 14]); ctx.stroke(); ctx.setLineDash([]);
    emoji(ctx, '🔒', x, y - 26, 64);
    ctx.fillStyle = '#fff'; ctx.font = '800 20px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(N.name, x, y + 30);
    ctx.font = '600 14px system-ui';
    ctx.fillText(`Finish ${district(st.d).name} to open`, x, y + 54);
  }
  // trees on the open land, the same on every screen
  const G = 150;
  const x0 = Math.floor((cam.x - w / 2) / G) - 1, x1 = Math.floor((cam.x + w / 2) / G) + 1;
  const y0 = Math.floor((cam.y - h / 2) / G) - 1, y1 = Math.floor((cam.y + h / 2) / G) + 1;
  const open = new Set();
  for (let i = 0; i <= st.d; i++) { const D = district(i); open.add(`${Math.round(D.cx / CELL_W)},${Math.round(D.cy / CELL_H)}`); }
  for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
    const r = hash(gx, gy);
    if (r > 0.3) continue;
    const wx = gx * G + hash(gy, gx) * 90, wy = gy * G + hash(gx + 9, gy) * 90;
    if (open.has(`${Math.round(wx / CELL_W)},${Math.round(wy / CELL_H)}`)) continue;
    emoji(ctx, r < 0.2 ? '🌳' : r < 0.26 ? '🌲' : '🌼', wx - cam.x + w / 2, wy - cam.y + h / 2, r < 0.26 ? 44 : 20);
  }
}

function drawBuilding(ctx, s, have, x, y, t, active) {
  const done = have >= s.need;
  const W = s.w, H = s.floors * FLOOR_H, built = H * Math.min(1, have / s.need);
  ctx.fillStyle = '#0002';
  ctx.beginPath(); ctx.ellipse(x, y, W / 2 + 12, 14, 0, 0, 7); ctx.fill();
  if (!done) {
    ctx.strokeStyle = '#8d6e4a'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.strokeRect(x - W / 2, y - H, W, H);
    for (let f = 1; f < s.floors; f++) { ctx.beginPath(); ctx.moveTo(x - W / 2, y - f * FLOOR_H); ctx.lineTo(x + W / 2, y - f * FLOOR_H); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  if (built > 0) {
    ctx.fillStyle = `hsl(${s.hue} 55% ${done ? 72 : 78}%)`;
    ctx.fillRect(x - W / 2, y - built, W, built);
    ctx.strokeStyle = `hsl(${s.hue} 40% 40%)`; ctx.lineWidth = 2;
    ctx.strokeRect(x - W / 2, y - built, W, built);
    // brick courses
    ctx.strokeStyle = `hsl(${s.hue} 40% 60% / .5)`; ctx.lineWidth = 1;
    for (let yy = 7; yy < built; yy += 7) { ctx.beginPath(); ctx.moveTo(x - W / 2, y - yy); ctx.lineTo(x + W / 2, y - yy); ctx.stroke(); }
    const cols = Math.floor(W / 34);
    for (let f = 0; f < s.floors; f++) {
      if ((f + 1) * FLOOR_H > built + 1) break;
      for (let c = 0; c < cols; c++) {
        const wx = x - W / 2 + (c + 0.5) * (W / cols) - 8, wy = y - (f + 1) * FLOOR_H + 7;
        if (f === 0 && c === Math.floor(cols / 2)) { ctx.fillStyle = `hsl(${s.hue + 180} 35% 35%)`; ctx.fillRect(wx, wy + 1, 16, FLOOR_H - 8); continue; }
        ctx.fillStyle = done ? '#fff7c2' : '#dff3ff'; ctx.fillRect(wx, wy, 16, 13);
        ctx.strokeStyle = '#0004'; ctx.strokeRect(wx, wy, 16, 13);
      }
    }
  }
  if (done) {
    ctx.fillStyle = `hsl(${s.hue + 150} 45% 45%)`;
    if (s.roof === 0) { ctx.beginPath(); ctx.moveTo(x - W / 2 - 8, y - H); ctx.lineTo(x, y - H - 34); ctx.lineTo(x + W / 2 + 8, y - H); ctx.fill(); }
    else if (s.roof === 1) ctx.fillRect(x - W / 2 - 5, y - H - 10, W + 10, 10);
    else { ctx.beginPath(); ctx.ellipse(x, y - H, W / 2, 26, 0, Math.PI, 0); ctx.fill(); }
    if (s.env === 'snow') { ctx.fillStyle = '#fff'; rr(ctx, x - W / 2 - 8, y - H - 7, W + 16, 12, 6); ctx.fill(); } // snow on the roof
    if (s.kind === 3) emoji(ctx, '🚩', x + 6, y - H - 48 + Math.sin(t * 3) * 2, 26);
  } else if (active) {
    const bw = 100, by = y - H - 24;
    ctx.fillStyle = '#fff'; rr(ctx, x - bw / 2, by - 13, bw, 26, 13); ctx.fill();
    ctx.fillStyle = '#ffb27a'; rr(ctx, x - bw / 2 + 3, by - 10, Math.max(8, (bw - 6) * have / s.need), 20, 10); ctx.fill();
    ctx.fillStyle = '#2b2340'; ctx.font = '800 16px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${have}/${s.need} 🧱`, x, by + 1);
  }
}

function drawZone(ctx, x, y, on, t) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, 0.45);
  ctx.strokeStyle = on ? '#ff8a3d' : '#0005'; ctx.lineWidth = on ? 6 : 3;
  ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 30;
  ctx.beginPath(); ctx.arc(0, 0, ZONE_R, 0, 7); ctx.stroke();
  if (on) { ctx.fillStyle = '#ff8a3d33'; ctx.fill(); }
  ctx.restore();
}

/** One builder. p: {x,y,walk,stumble,prog,face,name,color,hat,tool,pet,ride,rank,me} */
export function drawPlayer(ctx, p, x, y, t) {
  const bob = p.walk ? Math.abs(Math.sin(t * 12 + x * 0.01)) * 5 : 0;
  const wob = p.stumble > 0 ? Math.sin(p.stumble * 40) * 0.35 * Math.min(1, p.stumble * 3) : 0;
  ctx.fillStyle = '#0003';
  ctx.beginPath(); ctx.ellipse(x, y, 17, 6, 0, 0, 7); ctx.fill();
  if (p.pet) emoji(ctx, p.pet, x - p.face * 34, y - 12 - Math.abs(Math.sin(t * 6 + 1)) * (p.walk ? 6 : 2), 24);
  const ride = p.boat ? '🛶' : p.ride;
  if (ride) emoji(ctx, ride, x, y - 8, p.boat ? 46 : 34);
  ctx.save();
  ctx.translate(x, y - (ride ? 10 : 0) - bob); ctx.rotate(wob);
  // legs
  ctx.fillStyle = '#3a3350';
  const step = p.walk ? Math.sin(t * 14) * 4 : 0;
  ctx.fillRect(-9, -12, 7, 12 + step * 0.5); ctx.fillRect(2, -12, 7, 12 - step * 0.5);
  // body
  ctx.fillStyle = COLORS[p.color % COLORS.length];
  rr(ctx, -14, -38, 28, 28, 9); ctx.fill();
  ctx.strokeStyle = '#0003'; ctx.lineWidth = 2; ctx.stroke();
  // head
  ctx.fillStyle = '#ffd9b3';
  ctx.beginPath(); ctx.arc(0, -50, 13, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2340';
  const ex = p.face * 3;
  if (p.stumble > 0) { ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('x', -5 + ex, -50); ctx.fillText('x', 5 + ex, -50); }
  else { ctx.beginPath(); ctx.arc(-5 + ex, -52, 2, 0, 7); ctx.arc(5 + ex, -52, 2, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.arc(ex, -46, 4, 0.1 * Math.PI, 0.9 * Math.PI); ctx.lineWidth = 1.5; ctx.strokeStyle = '#2b2340'; ctx.stroke();
  // hat
  if (p.hat) emoji(ctx, p.hat, 0, -66, 24);
  else { ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(0, -56, 13, Math.PI, 0); ctx.fill(); ctx.fillRect(-16, -58, 32, 4); }
  const tool = p.act >= 0 && JOBS[p.act] ? JOBS[p.act].tool : p.tool;
  if (tool) emoji(ctx, tool, p.face * 20, -26 + (p.prog > 0 ? Math.sin(t * 20) * 4 : 0), 18);
  // the brick being typed into existence
  if (p.prog > 0) {
    const bw = 8 + 20 * p.prog;
    ctx.fillStyle = '#c8553d'; rr(ctx, -bw / 2, -92, bw, 12, 3); ctx.fill();
    ctx.strokeStyle = '#7a2f20'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
  if (p.stumble > 0) emoji(ctx, '💫', x + 16, y - 74, 16);
  ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = `${['🔰', '🧱', '📐', '🏛️'][p.rank | 0]} ${p.name || 'builder'}`;
  const tw = ctx.measureText(label).width + 12;
  ctx.fillStyle = p.me ? '#2b2340' : '#2b2340aa'; rr(ctx, x - tw / 2, y + 8, tw, 18, 9); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 18);
}

/** A city problem: fire, leak, stuck kitten, or brick thief. */
function drawJob(ctx, j, x, y, t, near) {
  const f = j.hp / j.max, J = JOBS[j.t], art = (J.v[j.v | 0] || J.v[0]).art;
  let top = y - 76;
  if (J.name === 'fire') {
    top = y - j.h - 60;
    for (let k = 0; k < 3; k++) emoji(ctx, '🔥', x + (k - 1) * 30, y - j.h - 6 + Math.sin(t * 9 + k * 2) * 4, 22 + 26 * f);
    emoji(ctx, '💨', x + Math.sin(t) * 20, y - j.h - 50 - (t * 30 % 30), 22);
  } else if (J.kind === 'in') {
    for (let k = 0; k < 4; k++) emoji(ctx, '💦', x + 40 + Math.sin(t * 5 + k) * 14, y - 14 - ((t * 60 + k * 17) % 50) * f, 14 + 12 * f);
    ctx.fillStyle = '#5db7f099'; ctx.beginPath(); ctx.ellipse(x + 40, y + 8, 30 + 26 * f, 9, 0, 0, 7); ctx.fill();
  } else if (J.bg) { // something stuck up high: it comes down as the work gets done
    emoji(ctx, J.bg, x, y - 44, 96);
    emoji(ctx, art, x + 8, y - 84 + (1 - f) * 50 + Math.sin(t * 5) * 2, 26);
    emoji(ctx, '🪜', x + 30, y - 22, 40);
    top = y - 116;
  } else if (J.kind === 'run') {
    const run = j.stun > 0 ? 0 : Math.abs(Math.sin(t * 12)) * 6;
    ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(x, y, 16, 6, 0, 0, 7); ctx.fill();
    emoji(ctx, art, x, y - 26 - run, 44);
    if (J.name === 'thief') emoji(ctx, '🧱', x + 20, y - 14 - run, 18);
    if (j.stun > 0) emoji(ctx, '💫', x, y - 58, 20);
  } else {
    ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(x, y + 2, 34, 9, 0, 0, 7); ctx.fill();
    emoji(ctx, art, x, y - 28 + Math.sin(t * 3) * 2, 60);
    emoji(ctx, '❗', x + 34, y - 58 + Math.sin(t * 6) * 3, 20);
  }
  const bw = 70;
  ctx.fillStyle = '#fff'; rr(ctx, x - bw / 2, top - 9, bw, 18, 9); ctx.fill();
  ctx.fillStyle = '#e5484d'; rr(ctx, x - bw / 2 + 2, top - 7, Math.max(6, (bw - 4) * f), 14, 7); ctx.fill();
  emoji(ctx, JOBS[j.t].icon, x - bw / 2 - 10, top, 20);
  if (JOBS[j.t].kind !== 'run') drawZone(ctx, x + (j.px - j.x), y + (j.py - j.y), near, t);
}

function drawBoss(ctx, b, x, y, t, weak, hit) {
  const s = 1 + Math.sin(t * 4) * 0.04 + hit * 0.15;
  ctx.save(); ctx.translate(x, y - 20); ctx.scale(s, 2 - s);
  ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(0, 20, 80, 16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = hit > 0 ? '#e7c6ff' : '#9b5de5';
  ctx.beginPath();
  for (let a = 0; a <= 32; a++) {
    const th = a / 32 * Math.PI * 2, r = 74 + Math.sin(th * 7 + t * 3) * 7;
    ctx.lineTo(Math.cos(th) * r, -60 + Math.sin(th) * r * 0.9);
  }
  ctx.fill(); ctx.strokeStyle = '#5a2aa0'; ctx.lineWidth = 4; ctx.stroke();
  for (const sx of [-26, 26]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, -78, 19, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b2340'; ctx.beginPath(); ctx.arc(sx + Math.sin(t * 2) * 7, -76 + Math.cos(t * 3) * 5, 8, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#2b2340'; ctx.beginPath(); ctx.ellipse(0, -36, 30, 14 + Math.sin(t * 6) * 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 15px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('teh', 0, -36);
  ctx.restore();
  // each player sees their own weak keys as its weak points
  weak.forEach((k, i) => {
    const a = t * 1.3 + i * Math.PI * 2 / weak.length;
    const kx = x + Math.cos(a) * 112, ky = y - 80 + Math.sin(a) * 48;
    ctx.fillStyle = '#ffe08a'; rr(ctx, kx - 15, ky - 15, 30, 30, 7); ctx.fill();
    ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#2b2340'; ctx.font = '700 17px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(k === ' ' ? '␣' : k, kx, ky + 1);
  });
}

/**
 * v: { w, h, cam, st, t, me, others: [player...] (outdoors), all: [player...] (indoors too), zone: site index or -1, weak: [keys],
 *      bossHit, fx: [{x,y,text,color,life,size}] }
 */
export function draw(ctx, v) {
  const { cam, w, h, st, t } = v;
  const sx = x => x - cam.x + w / 2, sy = y => y - cam.y + h / 2;
  drawGround(ctx, v);

  const things = [];
  for (let i = 0; i <= st.d; i++) {
    const D = district(i);
    if (Math.abs(D.cx - cam.x) > w / 2 + CELL_W || Math.abs(D.cy - cam.y) > h / 2 + CELL_H) continue;
    D.sites.forEach((s, k) => {
      const have = i < st.d ? s.need : st.have[k];
      if (i === st.d && have < s.need) drawZone(ctx, sx(s.x), sy(s.y + 48), v.zone === k, t);
      const id = `${i}:${k}`;
      if (have >= s.need) drawZone(ctx, sx(s.x), sy(s.y + 48), v.door === id, t);
      things.push({ y: s.y, f: () => {
        drawBuilding(ctx, s, have, sx(s.x), sy(s.y), t, i === st.d);
        if (have >= s.need) { // a neighbor inside needs help, or has been helped
          const fin = v.roomDone(id), by = sy(s.y) - s.floors * FLOOR_H - 62 + (fin ? 0 : Math.sin(t * 4) * 4);
          if (!fin) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx(s.x), by, 15, 0, 7); ctx.fill(); }
          emoji(ctx, fin ? '⭐' : '❗', sx(s.x), by + 1, fin ? 24 : 18);
          emoji(ctx, '🚪', sx(s.x) + s.w / 2 - 18, sy(s.y) - 14, 0.1); // warm the glyph cache
        }
      } });
    });
  }
  for (let i = 0; i <= st.d; i++) {
    const D = district(i);
    if (Math.abs(D.cx - cam.x) > w / 2 + CELL_W || Math.abs(D.cy - cam.y) > h / 2 + CELL_H) continue;
    for (const o of D.decor) things.push({ y: o.y, f: () => emoji(ctx, o.e, sx(o.x), sy(o.y) - 18, 40) });
    // traffic rolls along the road
    const cars = D.river ? [] : TRAFFIC[D.env] || [], span = CELL_W - 120;
    cars.forEach((e, k) => {
      const dir = k % 2 ? 1 : -1, u = ((t * (34 + k * 9) + k * 310 + i * 97) % span + span) % span;
      const x = D.cx + dir * (u - span / 2), y = D.cy + (dir > 0 ? 54 : 34);
      things.push({ y, f: () => {
        ctx.save(); ctx.translate(sx(x), sy(y) - 16); ctx.scale(-dir, 1); // these pictures face left
        emoji(ctx, e, 0, 0, 38); ctx.restore();
      } });
    });
  }
  for (const it of st.items) {
    things.push({ y: it.y, f: () => {
      ctx.fillStyle = '#0002'; ctx.beginPath(); ctx.ellipse(sx(it.x), sy(it.y), 14, 5, 0, 0, 7); ctx.fill();
      emoji(ctx, ITEM_EMOJI[it.t], sx(it.x), sy(it.y) - 22 - Math.sin(t * 4 + it.id) * 5, 30);
    } });
  }
  for (const j of st.jobs || []) things.push({ y: j.y + 1, f: () => drawJob(ctx, j, sx(j.x), sy(j.y), t, v.job === j.id) });
  for (const p of [...v.others, v.me]) things.push({ y: p.y, f: () => drawPlayer(ctx, p, sx(p.x), sy(p.y), t) });
  if (st.boss) things.push({ y: st.boss.y, f: () => drawBoss(ctx, st.boss, sx(st.boss.x), sy(st.boss.y), t, v.weak, v.bossHit) });
  things.sort((a, b) => a.y - b.y).forEach(o => o.f());

  for (const f of v.fx) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    if (f.text) {
      ctx.font = `800 ${f.size || 20}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, sx(f.x), sy(f.y));
      ctx.fillStyle = f.color || '#2b2340'; ctx.fillText(f.text, sx(f.x), sy(f.y));
    } else { ctx.fillStyle = f.color; ctx.fillRect(sx(f.x) - 4, sy(f.y) - 4, 8, 8); }
  }
  ctx.globalAlpha = 1;

  // red arrows point at city problems that are off screen
  for (const j of st.jobs || []) {
    const jx = j.px - cam.x, jy = j.py - cam.y;
    if (Math.abs(jx) < w / 2 && Math.abs(jy) < h / 2) continue;
    const a = Math.atan2(jy, jx), r = Math.min(w, h) / 2 - 110;
    emoji(ctx, JOBS[j.t].icon, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 30);
    ctx.save(); ctx.translate(w / 2 + Math.cos(a) * (r + 34), h / 2 + Math.sin(a) * (r + 34)); ctx.rotate(a);
    ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.fill();
    ctx.restore();
  }
  // other builders: a name tag on the building they are inside, and an arrow when they are off screen
  const tags = new Map();
  for (const o of v.all || []) {
    const col = COLORS[o.color % COLORS.length] || '#888';
    const ox = o.x - cam.x, oy = o.y - cam.y, off = Math.abs(ox) > w / 2 - 20 || Math.abs(oy) > h / 2 - 20;
    if (o.in && !off) { // standing at this door, indoors
      const n = tags.get(o.in) || 0; tags.set(o.in, n + 1);
      const label = `${o.name || 'someone'} is inside`;
      ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + 22, tx = sx(o.x), ty = sy(o.y) + 46 + n * 28;
      ctx.fillStyle = col; rr(ctx, tx - tw / 2, ty - 12, tw, 24, 12); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0006'; ctx.lineWidth = 3; ctx.strokeText(label, tx, ty + 1); ctx.fillText(label, tx, ty + 1);
    }
    if (!off) continue;
    const a = Math.atan2(oy, ox), r = Math.max(70, Math.min(w, h) / 2 - 160);
    const ax = w / 2 + Math.cos(a) * r, ay = h / 2 + Math.sin(a) * r;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
    ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-10, -15); ctx.lineTo(-10, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const label = (o.name || 'someone') + (o.in ? ' (inside)' : '');
    ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(label, ax - Math.cos(a) * 30, ay - Math.sin(a) * 30 - 18);
    ctx.fillStyle = '#2b2340'; ctx.fillText(label, ax - Math.cos(a) * 30, ay - Math.sin(a) * 30 - 18);
  }
  // arrow back to the building site when it is off screen
  const D = district(st.d);
  const dx = D.cx - cam.x, dy = D.cy + 40 - cam.y;
  if (Math.abs(dx) > w / 2 || Math.abs(dy) > h / 2) {
    const a = Math.atan2(dy, dx), r = Math.min(w, h) / 2 - 70;
    ctx.save(); ctx.translate(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); ctx.rotate(a);
    ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-12, -16); ctx.lineTo(-12, 16); ctx.fill();
    ctx.restore();
  }
}
