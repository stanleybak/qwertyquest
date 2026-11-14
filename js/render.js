// Canvas drawing. Pure view code: reads state, never changes it.
import { district, CELL_W, CELL_H, ZONE_R, JOBS } from './world.js';

export const COLORS = ['#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1', '#48dbfb', '#5f7cff', '#c56cf0', '#ff78c4'];
const ITEM_EMOJI = ['🛡️', '🏗️', '👟'];
const FLOOR_H = 28;

function emoji(ctx, e, x, y, size) {
  if (!e) return;
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
    ctx.fillStyle = i === st.d ? '#f3e2b8' : '#e9dcc0';
    rr(ctx, x - CELL_W / 2 + 14, y - CELL_H / 2 + 14, CELL_W - 28, CELL_H - 28, 36); ctx.fill();
    if (D.river) {
      ctx.fillStyle = '#5db7f0';
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
      ctx.fillStyle = '#b9b3a8';
      ctx.fillRect(x - CELL_W / 2 + 14, y + 20, CELL_W - 28, 44);
      ctx.strokeStyle = '#fff9'; ctx.lineWidth = 3; ctx.setLineDash([18, 16]);
      ctx.beginPath(); ctx.moveTo(x - CELL_W / 2 + 30, y + 42); ctx.lineTo(x + CELL_W / 2 - 30, y + 42); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#0005'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(D.name.toUpperCase(), x, y - CELL_H / 2 + 34);
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
    if (s.kind === 3) emoji(ctx, '🚩', x + 6, y - H - 48 + Math.sin(t * 3) * 2, 26);
  } else if (active) {
    const bw = 76, by = y - H - 20;
    ctx.fillStyle = '#fff'; rr(ctx, x - bw / 2, by - 9, bw, 18, 9); ctx.fill();
    ctx.fillStyle = '#ff8a3d'; rr(ctx, x - bw / 2 + 2, by - 7, Math.max(6, (bw - 4) * have / s.need), 14, 7); ctx.fill();
    ctx.fillStyle = '#2b2340'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
function drawPlayer(ctx, p, x, y, t) {
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
  const f = j.hp / j.max;
  let top = y - 70;
  if (j.t === 0) {
    top = y - j.h - 60;
    for (let k = 0; k < 3; k++) emoji(ctx, '🔥', x + (k - 1) * 30, y - j.h - 6 + Math.sin(t * 9 + k * 2) * 4, 22 + 26 * f);
    emoji(ctx, '💨', x + Math.sin(t) * 20, y - j.h - 50 - (t * 30 % 30), 22);
  } else if (j.t === 1) {
    for (let k = 0; k < 4; k++) emoji(ctx, '💦', x + 40 + Math.sin(t * 5 + k) * 14, y - 14 - ((t * 60 + k * 17) % 50) * f, 14 + 12 * f);
    ctx.fillStyle = '#5db7f099'; ctx.beginPath(); ctx.ellipse(x + 40, y + 8, 30 + 26 * f, 9, 0, 0, 7); ctx.fill();
  } else if (j.t === 2) {
    emoji(ctx, '🌳', x, y - 44, 96);
    emoji(ctx, '🐱', x + 8, y - 84 + (1 - f) * 50 + Math.sin(t * 5) * 2, 26);
    emoji(ctx, '🪜', x + 30, y - 22, 40);
    top = y - 116;
  } else {
    const run = j.stun > 0 ? 0 : Math.abs(Math.sin(t * 12)) * 6;
    ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(x, y, 16, 6, 0, 0, 7); ctx.fill();
    emoji(ctx, '🦹', x, y - 26 - run, 44);
    emoji(ctx, '🧱', x + 20, y - 14 - run, 18);
    if (j.stun > 0) emoji(ctx, '💫', x, y - 58, 20);
  }
  const bw = 70;
  ctx.fillStyle = '#fff'; rr(ctx, x - bw / 2, top - 9, bw, 18, 9); ctx.fill();
  ctx.fillStyle = '#e5484d'; rr(ctx, x - bw / 2 + 2, top - 7, Math.max(6, (bw - 4) * f), 14, 7); ctx.fill();
  emoji(ctx, JOBS[j.t].icon, x - bw / 2 - 10, top, 20);
  if (j.t !== 3) drawZone(ctx, x + (j.px - j.x), y + (j.py - j.y), near, t);
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
 * v: { w, h, cam, st, t, me, others: [player...], zone: site index or -1, weak: [keys],
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
      things.push({ y: s.y, f: () => drawBuilding(ctx, s, have, sx(s.x), sy(s.y), t, i === st.d) });
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
