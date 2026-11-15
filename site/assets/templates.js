/* Kyoto Studio starter templates (used by the editor and the desktop app's home screen). */
'use strict';
(() => {
  const SLOT_DEF = {
    head: { n: [16, 16, 16], center: [0, 4, 0] }, back: { n: [24, 24, 8], center: [0, -6, -4] },
    arm: { n: [12, 16, 12], center: [-1, -4, 0] }, leg: { n: [12, 14, 12], center: [0, -6, 0] }
  };

  // Coordinates are skin pixels from the slot's pivot (head: neck, back: top of the body, arm: shoulder).
  // The head is x -4..3, y 0..7, z -4..3 (+z = face). The body's back is at z -3.
  const T = [];
  const tpl = (name, slot, desc, build) => T.push({ name, slot, desc, build });
  tpl('Crown', 'head', 'A gold crown with jewels', set => {
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) {
      if (x !== -5 && x !== 4 && z !== -5 && z !== 4) continue;
      set(x, 8, z, '#ffd34a');
      if ((x + z) % 2 === 0) set(x, 9, z, '#ffe58a');
      if ((x === -5 || x === 4) && (z === -5 || z === 4)) set(x, 10, z, '#fff1b8');
    }
    for (const [x, z] of [[-1, 4], [0, 4], [-5, 0], [4, -1], [-1, -5]]) set(x, 8, z, '#ff3d5a');
  });
  tpl('Halo', 'head', 'A glowing ring above your head', set => {
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) { const d = Math.hypot(x + .5, z + .5); if (Math.abs(d - 4.6) < .62) set(x, 11, z, '#fff1a0'); }
  });
  tpl('Cat Ears', 'head', 'Fluffy ears with pink insides', set => {
    for (const side of [1, -1]) {
      const bx = side > 0 ? 1 : -4;
      for (let x = 0; x < 3; x++) set(bx + x, 8, -1, '#2a2a33'), set(bx + x, 8, 0, x === 1 ? '#ff8fc8' : '#2a2a33');
      for (let x = 0; x < 2; x++) set(bx + (side > 0 ? x : x + 1), 9, -1, '#2a2a33'), set(bx + (side > 0 ? x : x + 1), 9, 0, '#2a2a33');
      set(bx + (side > 0 ? 0 : 2), 10, 0, '#2a2a33');
    }
  });
  tpl('Devil Horns', 'head', 'Curved red horns', set => {
    for (const m of [1, -1]) {
      const X = x => m > 0 ? x : -x - 1;
      [[2, 8], [3, 9], [3, 10], [4, 11]].forEach(([x, y], i) => set(X(x), y, 0, i === 3 ? '#3a0d12' : '#d6283b'));
      set(X(2), 8, 1, '#b51f30');
    }
  });
  tpl('Top Hat', 'head', 'A classy top hat with a red band', set => {
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) set(x, 8, z, '#1b1b22');
    for (let y = 9; y <= 11; y++) for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) if (y === 11 || x === -4 || x === 3 || z === -4 || z === 3) set(x, y, z, y === 9 ? '#c8283b' : '#22222b');
  });
  tpl('Party Hat', 'head', 'Striped cone with a pom-pom', set => {
    const cols = ['#ff5d8f', '#ffe14d', '#3aa8ff', '#6ee7b7'];
    [[3.2, 8], [2.4, 9], [1.6, 10], [.8, 11]].forEach(([r, y], i) => { for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) if (Math.hypot(x + .5, z + .5) <= r) set(x, y, z, cols[i]); });
  });
  tpl('Headphones', 'head', 'Over-ear headphones', set => {
    for (let x = -5; x <= 4; x++) set(x, 8, 0, '#2a2a33');
    for (const sx of [-5, 4]) for (let y = 5; y <= 7; y++) set(sx, y, 0, '#2a2a33');
    for (const sx of [[-6, -5], [4, 5]]) for (const x of sx) for (let y = 2; y <= 5; y++) for (let z = -2; z <= 1; z++) set(x, y, z, (x === -6 || x === 5) ? '#a98bff' : '#2a2a33');
  });
  tpl('Backpack', 'back', 'An adventurer backpack', set => {
    for (let x = -3; x <= 2; x++) for (let y = -11; y <= -2; y++) for (let z = -6; z <= -3; z++) set(x, y, z, y >= -3 ? '#6b4128' : '#8a5a3c');
    for (let x = -2; x <= 1; x++) for (let y = -9; y <= -6; y++) set(x, y, -7, '#7a4d33');
    set(-1, -7, -8, '#ffd34a'); set(0, -7, -8, '#ffd34a');
  });
  tpl('Angel Wings', 'back', 'Soft white feathered wings', set => wings(set, '#f4f6ff', '#bfe3ff'));
  tpl('Dragon Wings', 'back', 'Dark purple dragon wings', set => wings(set, '#4a1e8c', '#b05cff'));
  tpl('Gold Bracelet', 'arm', 'A bracelet on both wrists (turn on Both sides)', set => {
    for (let x = -4; x <= 1; x++) for (let z = -3; z <= 2; z++) if (x === -4 || x === 1 || z === -3 || z === 2) set(x, -8, z, '#ffd34a');
  }, true);
  function wings(set, a, b) {
    for (const m of [1, -1]) for (let i = 0; i <= 8; i++) {
      const x = m > 0 ? 3 + i : -4 - i;
      const top = -1 + Math.round(3 * Math.sin(i / 8 * Math.PI * .8)), bot = -10 + Math.round(i * .9);
      for (let y = bot; y <= top; y++) set(x, y, -4, y === top || i === 8 ? b : a);
    }
  }
  function tplData(t) {
    const d = SLOT_DEF[t.slot], vox = new Map();
    const o = [d.center[0] - d.n[0] / 2, d.center[1] - d.n[1] / 2, d.center[2] - d.n[2] / 2];
    t.build((x, y, z, c) => {
      const g = [x - o[0], y - o[1], z - o[2]];
      if (g.every((v, i) => v >= 0 && v < d.n[i])) vox.set(g.join(','), c);
    });
    const pal = [...new Set(vox.values())];
    return { format: 'kycos', version: 1, name: t.name, slot: t.slot, kind: 'voxel', mirror: t.slot === 'arm', grid: { n: d.n.slice(), vs: 1, center: d.center.slice() }, palette: pal,
      voxels: [...vox].map(([k, c]) => [...k.split(',').map(Number), pal.indexOf(c)]) };
  }
  /** Small isometric picture of a voxel build (template cards, Store). */
  function iso(canvas, d) {
    const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height; g.clearRect(0, 0, W, H);
    const vox = d.voxels || [], pal = d.palette || ['#fff']; if (!vox.length) return;
    const set = new Set(vox.map(v => v[0] + ',' + v[1] + ',' + v[2]));
    const P0 = (x, y, z) => [(x - z) * .866, -y + (x + z) * .5];
    let a = 1e9, b = -1e9, c = 1e9, e = -1e9;
    for (const [x, y, z] of vox) for (const q of [[x, y, z], [x + 1, y + 1, z + 1], [x + 1, y, z], [x, y + 1, z + 1]]) { const p = P0(...q); a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); e = Math.max(e, p[1]); }
    const s = Math.min(W * .8 / (b - a || 1), H * .8 / (e - c || 1)), ox = W / 2 - (a + b) / 2 * s, oy = H / 2 - (c + e) / 2 * s;
    const P = (x, y, z) => { const p = P0(x, y, z); return [ox + p[0] * s, oy + p[1] * s]; };
    const sh = (h, k) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16 & 255) * k | 0},${(n >> 8 & 255) * k | 0},${(n & 255) * k | 0})`; };
    const face = (pts, col) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = col; g.lineWidth = .7; g.stroke(); };
    for (const [x, y, z, ci] of vox.slice().sort((p, q) => (p[0] + p[2] - p[1] * .01) - (q[0] + q[2] - q[1] * .01) || p[1] - q[1])) {
      const col = pal[ci] || '#ffffff';
      if (!set.has(x + ',' + (y + 1) + ',' + z)) face([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], sh(col, 1));
      if (!set.has(x + ',' + y + ',' + (z + 1))) face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], sh(col, .78));
      if (!set.has((x + 1) + ',' + y + ',' + z)) face([P(x + 1, y, z), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z)], sh(col, .62));
    }
  }
  window.KS_TPL = { list: T, data: i => tplData(T[i]), iso };
})();
