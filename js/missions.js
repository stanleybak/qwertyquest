// What is inside each finished building: a neighbor who needs help, and six
// things to put in the room. Each typed prompt places one thing.

const M = (id, who, face, title, ask, thanks, items, wall, floor) => ({ id, who, face, title, ask, thanks, items, wall, floor });

// Indexed by building kind (house, shop, tower, landmark). Lines match tools/build_voices.py.
export const MISSIONS = [
  [
    M('grandma', 'Grandma Rose', '👵', 'Grandma\'s house', 'Hello, dear. My new house is so empty. Will you help me bring in the furniture?',
      'Oh, it\'s lovely. It feels like home. Thank you, dear.', ['🛋️', '🛏️', '🪴', '🖼️', '🕰️', '🫖'], '#f6d6c9', '#c99a6b'),
    M('roomkid', 'Pip', '🧒', 'Pip\'s room', 'This is my new room! It\'s got nothing in it yet. Help me set it up!',
      'Best room ever! Thanks! You\'re awesome!', ['🛏️', '🧸', '🎮', '📚', '🪁', '🚀'], '#cfe8ff', '#8fb2d9'),
  ],
  [
    M('baker', 'Baker Bo', '🧑‍🍳', 'The bakery', 'Welcome to my bakery! The shelves are bare. Help me fill them up!',
      'Mmm. It smells delicious in here now. Thank you, my friend!', ['🍞', '🥐', '🧁', '🍪', '🥧', '🎂'], '#ffe9b8', '#d9a35f'),
    M('petshop', 'Ms. Paws', '🧑‍🦰', 'The pet shop', 'The pets arrive today and nothing is ready! Can you help me?',
      'Every pet has a home. You\'re the best!', ['🐠', '🐹', '🐇', '🦜', '🐢', '🐈'], '#d9f5d0', '#9ac88a'),
  ],
  [
    M('librarian', 'Mr. Quill', '🧑‍🏫', 'The library', 'Shh. Welcome to the library. Could you help me put the books on the shelves?',
      'Wonderful. So many stories to read. Thank you.', ['📕', '📗', '📘', '📙', '📔', '🌍'], '#e6dcf5', '#a58fc7'),
    M('scientist', 'Dr. Fizz', '🧑‍🔬', 'The science lab', 'My lab needs equipment for the big experiment! Give me a hand?',
      'Eureka! It all works! Thank you, thank you!', ['🔬', '🧪', '🧲', '🔭', '⚗️', '💡'], '#d6f0f2', '#86b8bd'),
  ],
  [
    M('guide', 'Lady Marble', '🧑‍🎨', 'The museum', 'Welcome to the museum. Help me put our treasures on display!',
      'Magnificent. The museum is open to all!', ['🦕', '🏺', '🗿', '💎', '🖼️', '👑'], '#f2ead8', '#b9a47a'),
    M('captain', 'Captain Tide', '🧑‍✈️', 'The boathouse', 'Ahoy! This old boathouse needs gear before we can sail. Lend a hand, matey?',
      'Shipshape! We sail at dawn. Thank ye kindly!', ['⚓', '🛟', '🧭', '🗺️', '🎣', '⛵'], '#d3e9f7', '#8a6a48'),
  ],
];

/** The mission inside building `k` of district `di`. Same on every device. */
export function missionFor(di, k, kind) {
  const list = MISSIONS[kind] || MISSIONS[0];
  return list[(di * 5 + k * 3 + (di >> 1)) % list.length];
}

function emoji(ctx, e, x, y, size) {
  ctx.fillStyle = '#000'; // color emoji take their opacity from the fill style
  ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}
function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    if (ctx.measureText(line + ' ' + w).width > maxW && line) { out.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out;
}

/** Draw the inside of a building. v: { w, h, ph (prompt panel height), t, m, placed, pop, drawMe(x, y) } */
export function drawInterior(ctx, v) {
  const { w, h, t, m } = v;
  ctx.fillStyle = '#2b2340'; ctx.fillRect(0, 0, w, h);
  const y0 = 96, W = Math.min(820, w - 24), H = Math.max(230, Math.min(400, h - v.ph - y0 - 48)), x0 = (w - W) / 2;
  const floorY = y0 + H * 0.66;
  ctx.fillStyle = m.wall; ctx.beginPath(); ctx.roundRect(x0, y0, W, H, 18); ctx.fill();
  ctx.fillStyle = m.floor; ctx.beginPath(); ctx.roundRect(x0, floorY, W, H - (floorY - y0), [0, 0, 18, 18]); ctx.fill();
  ctx.strokeStyle = '#0002'; ctx.lineWidth = 2;
  for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x0 + W * i / 8, floorY); ctx.lineTo(x0 + W * i / 8 - 20, y0 + H); ctx.stroke(); }
  // window
  ctx.fillStyle = '#bfe6ff'; ctx.fillRect(x0 + W - 150, y0 + 30, 100, 80);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.strokeRect(x0 + W - 150, y0 + 30, 100, 80);
  ctx.beginPath(); ctx.moveTo(x0 + W - 100, y0 + 30); ctx.lineTo(x0 + W - 100, y0 + 110); ctx.stroke();
  emoji(ctx, '☁️', x0 + W - 120 + Math.sin(t * 0.4) * 14, y0 + 58, 22);
  ctx.fillStyle = '#0006'; ctx.font = '800 16px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(m.title.toUpperCase() + '  ·  ESC TO GO BACK OUTSIDE', x0 + 20, y0 + 22);

  // six spots: three on the wall, three on the floor
  m.items.forEach((it, i) => {
    const sx = x0 + W * (0.36 + (i % 3) * 0.17), sy = i < 3 ? y0 + H * 0.38 : floorY + (H - (floorY - y0)) * 0.45;
    if (i < v.placed) {
      const grow = i === v.placed - 1 ? Math.min(1, v.pop * 4) : 1;
      emoji(ctx, it, sx, sy - (1 - grow) * 30, 58 * (0.4 + 0.6 * grow));
    } else {
      ctx.strokeStyle = i === v.placed ? '#ff8a3d' : '#0003'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(sx, sy, 30, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#0003'; ctx.font = '800 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', sx, sy + 1);
    }
  });

  // the neighbor and what they are saying
  const nx = x0 + W * 0.12, ny = floorY + 6;
  ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(nx, ny + 34, 30, 8, 0, 0, 7); ctx.fill();
  emoji(ctx, m.face, nx, ny - 8 + Math.sin(t * 3) * 2, 78);
  const done = v.placed >= m.items.length;
  ctx.font = '600 15px system-ui';
  const lines = wrap(ctx, done ? m.thanks : m.ask, Math.min(300, W * 0.4));
  const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24, bh = lines.length * 20 + 16;
  const bx = Math.max(x0 + 8, nx - 30), by = ny - 70 - bh;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(nx - 6, by + bh - 1); ctx.lineTo(nx + 4, by + bh + 12); ctx.lineTo(nx + 16, by + bh - 1); ctx.fill();
  ctx.fillStyle = '#2b2340'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, bx + 12, by + 18 + i * 20));
  ctx.font = '800 13px system-ui'; ctx.fillStyle = '#0007';
  ctx.fillText(m.who, nx - 30, ny + 54);

  v.drawMe(x0 + W * 0.26, floorY + Math.min(62, (H - (floorY - y0)) * 0.6));
  emoji(ctx, '🚪', x0 + W - 46, floorY - 34, 60);
}
