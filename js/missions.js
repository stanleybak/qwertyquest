// What is inside each finished building: a neighbor who needs help, and six
// things to put in the room. Each typed prompt places one thing.

// game: furnish (walk to each spot), order (fetch things in the order on the list),
// maze (pick a way at each fork), run (get past six things in a hallway).
const M = (id, who, face, title, ask, thanks, items, wall, floor, game = 'furnish', goal = '') => ({ id, who, face, title, ask, thanks, items, wall, floor, game, goal });

// Grouped as homes, shops, halls and landmarks. Lines match tools/build_voices.py.
export const MISSIONS = [
  [
    M('grandma', 'Grandma Rose', '👵', 'Grandma\'s house', 'Hello, dear. My new house is so empty. Will you help me bring in the furniture?',
      'Oh, it\'s lovely. It feels like home. Thank you, dear.', ['🛋️', '🛏️', '🪴', '🖼️', '🕰️', '🫖'], '#f6d6c9', '#c99a6b'),
    M('roomkid', 'Pip', '🧒', 'Pip\'s room', 'This is my new room! I made an obstacle course. Race to the flag, and get past all my toys!',
      'You made it! Best race ever! You\'re awesome!', ['⚽', '🧸', '🎮', '📚', '🪁', '🚀'], '#cfe8ff', '#8fb2d9', 'run', '🏁'),
  ],
  [
    M('baker', 'Baker Bo', '🧑‍🍳', 'The bakery', 'Welcome to my bakery! I have a big order to pack. Bring me the treats in the order on my list!',
      'Mmm. The order is all packed. Thank you, my friend!', ['🍞', '🥐', '🧁', '🍪', '🥧', '🎂'], '#ffe9b8', '#d9a35f', 'order'),
    M('petshop', 'Ms. Paws', '🧑‍🦰', 'The pet shop', 'Oh no! Nibbles the hamster ran off into the back room. Can you find your way to him?',
      'You found Nibbles! You\'re the best!', ['🐠', '🐹', '🐇', '🦜', '🐢', '🐈'], '#d9f5d0', '#9ac88a', 'maze', '🐹'),
  ],
  [
    M('librarian', 'Mr. Quill', '🧑‍🏫', 'The library', 'Shh. Welcome to the library. Could you help me put the books on the shelves?',
      'Wonderful. So many stories to read. Thank you.', ['📕', '📗', '📘', '📙', '📔', '🌍'], '#e6dcf5', '#a58fc7'),
    M('scientist', 'Dr. Fizz', '🧑‍🔬', 'The science lab', 'My big experiment is ready! Hand me the lab things in the order on my list!',
      'Eureka! It all works! Thank you, thank you!', ['🔬', '🧪', '🧲', '🔭', '⚗️', '💡'], '#d6f0f2', '#86b8bd', 'order'),
  ],
  [
    M('guide', 'Lady Marble', '🧑‍🎨', 'The museum', 'Welcome to the museum. Our crown is lost in the back halls. Can you find your way to it?',
      'Magnificent. The crown is back where it belongs!', ['🦕', '🏺', '🗿', '💎', '🖼️', '👑'], '#f2ead8', '#b9a47a', 'maze', '👑'),
    M('captain', 'Captain Tide', '🧑‍✈️', 'The boathouse', 'Ahoy! The boat is leaving! Run down the dock and hop over everything in your way, matey!',
      'Shipshape! You made it aboard. Thank ye kindly!', ['📦', '🛢️', '🦀', '🪢', '🐟', '⚓'], '#d3e9f7', '#8a6a48', 'run', '⛵'),
  ],
];

/** The mission inside building `k` of district `di`. Same on every device. */
export function missionFor(di, k) {
  // Walk through all eight neighbors in turn, so each neighborhood has every kind of game.
  const n = di * 6 + k;
  return MISSIONS[[0, 1, 1, 0, 2, 2, 3, 3][n % 8]][[0, 0, 1, 1, 0, 1, 0, 1][n % 8]];
}

export function emoji(ctx, e, x, y, size) {
  ctx.fillStyle = '#000'; // color emoji take their opacity from the fill style
  ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}
export function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    if (ctx.measureText(line + ' ' + w).width > maxW && line) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out;
}

/** Things in the room you can walk up to. Positions are fractions of the floor. */
export function roomSpots(m) {
  const out = [{ kind: 'npc', x: 0.1, y: 0.3 }, { kind: 'door', x: 0.95, y: 0.2 }];
  m.items.forEach((_, i) => out.push({ kind: 'item', i, x: 0.36 + (i % 3) * 0.17, y: i < 3 ? 0.1 : 0.85 }));
  return out;
}
/** The spot the visitor is standing at, if any. room: { m, x, y } */
export function nearSpot(room) {
  let best = null, bd = 62;
  for (const s of roomSpots(room.m)) {
    const d = Math.hypot((s.x - room.x) * 820, (s.y - room.y) * 130);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/**
 * Draw the inside of a building.
 * v: { w, h, ph (prompt panel height), t, m, placed, pop, x, y, near, talk, wig, drawMe(x, y) }
 */
export function drawInterior(ctx, v) {
  const { w, h, t, m } = v;
  ctx.fillStyle = '#2b2340'; ctx.fillRect(0, 0, w, h);
  const y0 = 96, W = Math.min(820, w - 24), H = Math.max(230, Math.min(400, h - v.ph - y0 - 48)), x0 = (w - W) / 2;
  const floorY = y0 + H * 0.6, fh = y0 + H - floorY;
  const fx = x => x0 + W * x, fy = y => floorY + fh * (0.22 + 0.7 * y);
  ctx.fillStyle = m.wall; ctx.beginPath(); ctx.roundRect(x0, y0, W, H, 18); ctx.fill();
  ctx.fillStyle = m.floor; ctx.beginPath(); ctx.roundRect(x0, floorY, W, fh, [0, 0, 18, 18]); ctx.fill();
  ctx.strokeStyle = '#0002'; ctx.lineWidth = 2;
  for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x0 + W * i / 8, floorY); ctx.lineTo(x0 + W * i / 8 - 20, y0 + H); ctx.stroke(); }
  ctx.fillStyle = '#bfe6ff'; ctx.fillRect(x0 + W - 250, y0 + 34, 90, 70);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.strokeRect(x0 + W - 250, y0 + 34, 90, 70);
  emoji(ctx, '☁️', x0 + W - 215 + Math.sin(t * 0.4) * 12, y0 + 60, 22);
  ctx.fillStyle = '#0006'; ctx.font = '800 20px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(m.title.toUpperCase(), x0 + 20, y0 + 22);

  const done = v.placed >= m.items.length;
  const ring = (s, hot) => {
    ctx.save(); ctx.translate(fx(s.x), fy(s.y)); ctx.scale(1, 0.4);
    ctx.strokeStyle = hot ? '#ff8a3d' : '#0003'; ctx.lineWidth = hot ? 6 : 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 24;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.stroke();
    if (hot && v.near === s) { ctx.fillStyle = '#ff8a3d44'; ctx.fill(); }
    ctx.restore(); ctx.setLineDash([]);
  };
  const spots = roomSpots(m);
  for (const s of spots) if (s.kind !== 'item' || s.i >= v.placed) ring(s, s.kind === 'item' ? s.i === v.placed : v.near === s);

  const drawItem = s => {
    const wall = s.i < 3, ix = fx(s.x), iy = wall ? y0 + H * 0.36 : fy(s.y) - 22;
    if (s.i < v.placed) {
      const grow = s.i === v.placed - 1 ? Math.min(1, v.pop * 4) : 1;
      const wig = v.wig && v.wig.i === s.i ? Math.sin(v.wig.t * 30) * 8 * v.wig.t : 0;
      emoji(ctx, m.items[s.i], ix + wig, iy - (1 - grow) * 30, 56 * (0.4 + 0.6 * grow));
    } else if (wall) { ctx.fillStyle = '#0002'; ctx.font = '800 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', ix, iy); }
  };
  spots.filter(s => s.kind === 'item' && s.i < 3).forEach(drawItem);

  // the neighbor, and what they say when you talk to them
  const nx = fx(0.1), ny = floorY + 6;
  ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(nx, ny + 34, 30, 8, 0, 0, 7); ctx.fill();
  emoji(ctx, m.face, nx, ny - 8 + Math.sin(t * 3) * 2, 78);
  ctx.font = '800 16px system-ui'; ctx.fillStyle = '#0007'; ctx.textAlign = 'center';
  ctx.fillText(m.who, nx, ny + 54);
  emoji(ctx, '🚪', fx(0.95), floorY - 34, 60);

  const floorItems = spots.filter(s => s.kind === 'item' && s.i >= 3);
  floorItems.filter(s => s.y <= v.y).forEach(drawItem);
  v.drawMe(fx(v.x), fy(v.y));
  floorItems.filter(s => s.y > v.y).forEach(drawItem);

  if (v.talk > 0) {
    ctx.font = '600 18px system-ui';
    const lines = wrap(ctx, done ? m.thanks : m.ask, Math.min(340, W * 0.45));
    const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24, bh = lines.length * 24 + 16;
    const bx = Math.max(x0 + 8, nx - 30), by = ny - 70 - bh;
    ctx.globalAlpha = Math.min(1, v.talk * 2);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx - 6, by + bh - 1); ctx.lineTo(nx + 4, by + bh + 12); ctx.lineTo(nx + 16, by + bh - 1); ctx.fill();
    ctx.fillStyle = '#2b2340'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, bx + 12, by + 20 + i * 24));
    ctx.globalAlpha = 1;
  }
}
