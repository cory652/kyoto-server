/* Kyoto profile rooms: little 3D voxel dioramas with your Minecraft skin standing in them.
   window.KY_ROOM(canvas, { scene, pose, time }, skinUrl, slim) -> { stop() } */
'use strict';
(() => {
  /* ---------------- tiny matrix helpers (column-major) ---------------- */
  const M = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; },
    look(e, c, u) {
      const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(u, z)), y = cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
    },
    tr: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
    sc: s => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1],
    rx: a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
    ry: a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
    rz: a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  };
  function norm(v) { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---------------- voxel world builder ---------------- */
  function World() {
    const vox = new Map(), lights = [];
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const w = {
      vox, lights, seat: null, stand: [12, 1, 13], outdoor: false, sky: null,
      set(x, y, z, col, e = 0) { vox.set(key(x, y, z), { x, y, z, c: typeof col === 'string' ? hex(col) : col, e }); },
      del(x, y, z) { vox.delete(key(x, y, z)); },
      box(x0, y0, z0, x1, y1, z1, col, e) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) w.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col, e); },
      light(x, y, z, col, power = 1, flick = 0) { lights.push({ p: [x + .5, y + .5, z + .5], c: hex(col), power, flick }); },
      has: (x, y, z) => vox.has(key(x, y, z))
    };
    return w;
  }
  const vary = (h, amt = .06) => () => { const c = hex(h), k = 1 + (rnd() - .5) * amt * 2; return c.map(v => Math.min(1, v * k)); };
  // shared bits
  function room(w, floor, wallA, wallB, size = 24, height = 15) {
    w.box(0, -1, 0, size - 1, -1, size - 1, typeof floor === 'function' ? floor : vary(floor, .08));
    w.box(0, 0, 0, size - 1, height, 0, typeof wallA === 'function' ? wallA : vary(wallA, .03));
    w.box(0, 0, 1, 0, height, size - 1, typeof wallB === 'function' ? wallB : vary(wallB || wallA, .03));
  }
  const planks = (a, b) => (x, y, z) => { const c = hex(((z >> 1) + (x % 7 === 0 ? 1 : 0)) % 2 ? a : b); const k = 1 + (rnd() - .5) * .08; return c.map(v => v * k); };
  function windowOn(w, x0, y0, x1, y1, glass, frame = '#5a3b22', z = 0) {
    w.box(x0 - 1, y0 - 1, z, x1 + 1, y1 + 1, z, frame);
    w.box(x0, y0, z, x1, y1, z, glass, .9);
    const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1; for (let x = x0; x <= x1; x++) w.set(x, my, z, frame); for (let y = y0; y <= y1; y++) w.set(mx, y, z, frame);
  }
  function rug(w, x0, z0, x1, z1, a, b) { w.box(x0, 0, z0, x1, 0, z1, (x, y, z) => hex((x === x0 || x === x1 || z === z0 || z === z1) ? b : ((x + z) % 4 ? a : b))); }
  function plant(w, x, z, pot = '#b5653a') { w.box(x, 0, z, x + 1, 1, z + 1, pot); w.box(x - 1, 2, z - 1, x + 2, 4, z + 2, vary('#3f9b4a', .15)); w.box(x, 5, z, x + 1, 5, z + 1, '#4fb35b'); for (const [a, b] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) w.del(x + a, 4, z + b); }
  function lamp(w, x, z, h, shade, glow) { w.box(x, 0, z, x, h, z, '#2a2a30'); w.box(x - 1, h + 1, z - 1, x + 1, h + 2, z + 1, shade); w.set(x, h + 1, z, glow, 1); w.light(x, h + 1, z, glow, 1.2); }

  /* ---------------- the scenes ---------------- */
  const SCENES = {
    christmas(w) {
      room(w, planks('#7a4a2b', '#6c3f23'), (x, y) => hex(y < 4 ? '#5a2d1e' : (x % 4 < 2 ? '#8e1f2a' : '#7a1823')), (x, y, z) => hex(y < 4 ? '#5a2d1e' : (z % 4 < 2 ? '#1f5e38' : '#1a5131')));
      windowOn(w, 15, 6, 20, 11, '#1b2e5c');
      for (let i = 0; i < 6; i++) w.set(15 + i, 6, 0, '#e8f2ff', .9);
      rug(w, 8, 9, 17, 17, '#a8263a', '#e9d9b0');
      // tree
      const tx = 5, tz = 6;
      w.box(tx, 0, tz, tx, 2, tz, '#5a3a1f');
      for (let y = 3; y <= 14; y++) { const r = Math.max(0, Math.round((15 - y) * .42)); for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (x * x + z * z <= r * r + 1) w.set(tx + x, y, tz + z, vary('#1f6b3a', .18)()); }
      w.set(tx, 15, tz, '#ffd84a', 1); w.light(tx, 15, tz, '#ffd84a', 1.4);
      const bulbs = ['#ff4a5a', '#ffd84a', '#4ab8ff', '#7dff8a', '#ff8ae0'];
      for (let y = 4; y <= 13; y += 2) { const r = Math.max(1, Math.round((15 - y) * .42)); for (let a = 0; a < 6; a++) { const ang = a / 6 * 6.28 + y; const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r); if (w.has(tx + x, y, tz + z)) { const c = bulbs[(a + y) % bulbs.length]; w.set(tx + x, y, tz + z, c, 1); if (a % 3 === 0) w.light(tx + x, y, tz + z, c, .45, 1); } } }
      // presents
      for (const [x, z, s, c, r] of [[8, 4, 1, '#d63a4a', '#ffd84a'], [3, 10, 1, '#3a7ad6', '#ffffff'], [8, 8, 0, '#3aa860', '#d63a4a'], [2, 3, 0, '#ffd84a', '#d63a4a']]) { w.box(x, 0, z, x + s + 1, s + 1, z + s + 1, c); w.box(x, 0, z + ((s + 1) >> 1), x + s + 1, s + 1, z + ((s + 1) >> 1), r); }
      // fireplace on the right wall
      w.box(1, 0, 15, 2, 7, 22, vary('#8a8f99', .1)); w.box(1, 8, 14, 3, 8, 23, '#5a3a1f');
      w.box(1, 0, 17, 2, 4, 20, '#1a1a1e'); w.box(2, 0, 17, 2, 0, 20, '#3a2a1a');
      for (const [y, z, c] of [[1, 18, '#ff7a1a'], [1, 19, '#ffb030'], [2, 18, '#ffcf4a'], [1, 17, '#ff5a1a'], [1, 20, '#ff9a2a']]) w.set(2, y, z, c, 1);
      w.light(3, 1, 18, '#ff8a2a', 2.2, 2);
      for (const z of [15, 18, 21]) { w.box(3, 6, z, 3, 7, z, z === 18 ? '#3aa860' : '#d63a4a'); w.set(3, 5, z, '#ffffff'); }
      w.stand = [12, 0, 13]; w.seat = null;
    },
    bedroom(w) {
      room(w, planks('#c49a6c', '#b88c5f'), vary('#8fa6c8', .03), vary('#a9bdd9', .03));
      windowOn(w, 4, 6, 9, 11, '#9fd2ff'); w.light(6, 9, 2, '#cfe6ff', .8);
      // bed
      w.box(14, 0, 1, 22, 2, 9, '#6d4c33'); w.box(14, 3, 1, 22, 3, 9, '#f2f2f2'); w.box(14, 4, 1, 22, 4, 9, vary('#5b6fd6', .05)); w.box(15, 4, 1, 21, 5, 2, '#ffffff'); w.box(14, 3, 1, 22, 7, 1, '#6d4c33');
      // desk + monitor
      w.box(2, 4, 13, 5, 4, 21, '#3d3d46'); w.box(2, 0, 13, 5, 3, 13, '#3d3d46'); w.box(2, 0, 21, 5, 3, 21, '#3d3d46');
      w.box(2, 5, 15, 2, 9, 19, '#1a1a20'); w.box(3, 6, 15, 3, 8, 19, '#57c1ff', .95); w.light(4, 7, 17, '#57c1ff', .9);
      w.box(4, 5, 16, 4, 5, 18, '#24242c');
      rug(w, 9, 11, 17, 18, '#e6c4a0', '#b88a5c');
      plant(w, 21, 20); lamp(w, 22, 12, 6, '#ffe2a8', '#ffd38a');
      w.box(10, 9, 0, 13, 12, 0, (x, y) => hex((x + y) % 2 ? '#ff7aa8' : '#ffd36b')); // poster
      w.box(16, 10, 1, 21, 10, 2, '#6d4c33'); for (let x = 16; x <= 21; x += 2) w.box(x, 11, 1, x, 12, 1, ['#d64a4a', '#4a8ad6', '#4ad67a'][(x / 2) % 3 | 0]);
      w.stand = [11, 0, 13];
    },
    garden(w) {
      w.outdoor = true;
      w.box(0, -1, 0, 23, -1, 23, vary('#5cb85c', .14));
      for (let x = 0; x < 24; x++) { if (x % 3 === 0) w.box(x, 0, 0, x, 3, 0, '#e9e3d6'); else w.box(x, 2, 0, x, 2, 0, '#e9e3d6'); }
      for (let z = 1; z < 24; z++) { if (z % 3 === 0) w.box(0, 0, z, 0, 3, z, '#e9e3d6'); else w.box(0, 2, z, 0, 2, z, '#e9e3d6'); }
      // cherry tree
      w.box(5, 0, 5, 6, 8, 6, '#6b4630');
      for (let i = 0; i < 260; i++) { const x = 5 + Math.round((rnd() - .5) * 11), y = 9 + Math.round(rnd() * 6), z = 5 + Math.round((rnd() - .5) * 11); if ((x - 5.5) ** 2 + (y - 11) ** 2 * 1.6 + (z - 5.5) ** 2 < 32) w.set(x, y, z, rnd() < .5 ? '#ffb7d5' : '#ff9ac4'); }
      for (let i = 0; i < 18; i++) w.set(1 + (rnd() * 12 | 0), 0, 1 + (rnd() * 12 | 0), '#ffc6dd');
      // pond
      for (let x = 13; x <= 21; x++) for (let z = 15; z <= 21; z++) if ((x - 17) ** 2 / 16 + (z - 18) ** 2 / 9 < 1) { w.set(x, -1, z, '#3a8fd6', .25); } else if ((x - 17) ** 2 / 20 + (z - 18) ** 2 / 12 < 1) w.set(x, 0, z, '#9aa0a8');
      w.set(16, 0, 17, '#5cd65c'); w.set(18, 0, 19, '#5cd65c');
      // flowers
      for (let i = 0; i < 40; i++) { const x = 2 + (rnd() * 20 | 0), z = 2 + (rnd() * 20 | 0); if (!w.has(x, 0, z) && !(x > 11 && x < 22 && z > 13)) { w.set(x, 0, z, '#3f9b4a'); w.set(x, 1, z, ['#ff5a7a', '#ffd84a', '#ffffff', '#b07aff'][i % 4]); } }
      // lanterns
      for (const [x, z] of [[11, 3], [3, 18], [21, 9]]) { w.box(x, 0, z, x, 4, z, '#2a2a30'); w.set(x, 5, z, '#ffcf6a', 1); w.light(x, 5, z, '#ffcf6a', 1.1, 1); }
      w.stand = [11, 0, 11];
    },
    beach(w) {
      w.outdoor = true;
      for (let x = 0; x < 24; x++) for (let z = 0; z < 24; z++) w.set(x, -1, z, z < 7 ? (z < 5 ? hex('#2e8fd6').map(v => v * (0.9 + rnd() * .15)) : '#7fd0e8') : vary('#f2d79b', .08)(), z < 5 ? .15 : 0);
      for (let x = 0; x < 24; x++) if (rnd() < .5) w.set(x, -1, 5, '#ffffff');
      // palm
      for (let y = 0; y < 13; y++) w.set(4 + (y > 6 ? 1 : 0) + (y > 10 ? 1 : 0), y, 15, vary('#9b7148', .12)());
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) for (let i = 1; i < 6; i++) w.set(6 + dx * i, 13 - (i > 3 ? i - 3 : 0), 15 + dz * i, '#3faa4a');
      w.set(6, 12, 15, '#6b4a2a'); w.set(7, 12, 16, '#6b4a2a');
      // umbrella + towel
      w.box(17, 0, 12, 17, 7, 12, '#ffffff');
      for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) { const d = Math.hypot(x, z); if (d < 4.6) w.set(17 + x, 8 - (d > 3 ? 1 : 0), 12 + z, ((Math.atan2(z, x) + 3.15) / .785 | 0) % 2 ? '#ff5a6a' : '#ffffff'); }
      w.box(14, 0, 15, 20, 0, 18, (x) => hex(x % 2 ? '#3aa0ff' : '#ffd84a'));
      w.box(9, 0, 18, 11, 1, 19, '#ffffff'); w.set(10, 2, 18, '#ff5a6a');
      // sun
      w.box(19, 14, 0, 22, 17, 0, '#ffe066', 1); w.light(20, 15, 2, '#fff1b0', 1.5);
      w.stand = [11, 0, 12];
    },
    space(w) {
      room(w, (x, y, z) => hex((x % 4 === 0 || z % 4 === 0) ? '#2a3350' : '#151a2c'), (x, y) => hex(y % 5 === 0 ? '#2a3350' : '#1c2238'), (x, y, z) => hex(y % 5 === 0 ? '#2a3350' : '#1c2238'));
      w.box(3, 4, 0, 20, 13, 0, '#05060f', .9);
      for (let i = 0; i < 40; i++) w.set(3 + (rnd() * 18 | 0), 4 + (rnd() * 10 | 0), 0, rnd() < .3 ? '#b8d4ff' : '#ffffff', 1);
      for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (x * x + y * y <= 9) w.set(15 + x, 9 + y, 0, (x + y) % 3 ? '#c76a4a' : '#e08a5a', .8);
      for (let x = -5; x <= 5; x++) w.set(15 + x, 9 + (x >> 2), 0, '#d8c8a0', .8);
      // control desk
      w.box(1, 0, 6, 3, 4, 18, '#3a4258'); w.box(3, 5, 6, 3, 5, 18, '#2a3046');
      for (let z = 7; z <= 17; z += 2) w.set(3, 4, z, ['#ff4a6a', '#4affb0', '#4ab8ff', '#ffd84a'][(z / 2) % 4 | 0], 1);
      w.box(1, 6, 9, 1, 10, 15, '#0d1020'); w.box(2, 7, 10, 2, 9, 14, '#4affd0', .95); w.light(3, 8, 12, '#4affd0', 1.2);
      for (const x of [6, 18]) { w.box(x, 15, 1, x + 1, 15, 22, '#9ad8ff', 1); w.light(x, 14, 12, '#9ad8ff', .8); }
      // hologram
      w.box(16, 0, 15, 18, 1, 17, '#2a3046'); for (let y = 2; y < 7; y++) w.set(17, y, 16, '#6af0ff', .7);
      w.light(17, 5, 16, '#6af0ff', 1, 1);
      w.stand = [11, 0, 13];
    },
    halloween(w) {
      room(w, planks('#3a2a3a', '#2e2230'), (x, y) => hex(y < 3 ? '#1f1620' : (x % 5 ? '#3a2448' : '#2e1c3a')), (x, y, z) => hex(y < 3 ? '#1f1620' : (z % 5 ? '#3a2448' : '#2e1c3a')));
      windowOn(w, 14, 6, 20, 12, '#20203a', '#1a1218');
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) if (x * x + y * y < 2) w.set(19 + x, 11 + y, 0, '#f0f0d0', 1);
      const pumpkin = (x, z, s) => { w.box(x, 0, z, x + s, s, z + s, (a, b, c) => hex((a - x) % 2 ? '#e8761a' : '#d4650f')); w.box(x + (s >> 1), s + 1, z + (s >> 1), x + (s >> 1), s + 1, z + (s >> 1), '#3a6a2a'); if (s >= 3) { w.set(x + 1, s - 1, z + s, '#ffd24a', 1); w.set(x + s - 1, s - 1, z + s, '#ffd24a', 1); for (let i = 1; i < s; i++) w.set(x + i, 1, z + s, '#ffd24a', 1); w.light(x + (s >> 1), s >> 1, z + s + 1, '#ff9a2a', 1.3, 2); } };
      pumpkin(3, 15, 4); pumpkin(18, 17, 3); pumpkin(8, 3, 2); pumpkin(20, 4, 2);
      // gravestones
      for (const [x, z] of [[4, 4], [14, 5]]) { w.box(x, 0, z, x + 2, 4, z, vary('#8a8a96', .1)); w.set(x + 1, 5, z, '#8a8a96'); }
      // cobweb corner
      for (let i = 0; i < 6; i++) { w.set(1, 15 - i, 1 + i, '#d8d8e0'); w.set(1 + i, 15 - i, 1, '#d8d8e0'); }
      for (let i = 0; i < 4; i++) w.set(1 + i, 15, 1 + i, '#d8d8e0');
      // purple lights along the ceiling edge
      for (let x = 2; x < 23; x += 3) { w.set(x, 14, 1, '#b05aff', 1); w.light(x, 13, 2, '#b05aff', .5, 1); }
      // cauldron
      w.box(9, 0, 18, 13, 3, 22, '#2a2a2e'); w.box(10, 3, 19, 12, 3, 21, '#6aff4a', .9); w.light(11, 4, 20, '#6aff4a', 1.2, 2);
      w.stand = [12, 0, 12];
    },
    gamer(w) {
      room(w, (x, y, z) => hex((x + z) % 2 ? '#1a1a22' : '#202029'), vary('#22222c', .03), vary('#262630', .03));
      // RGB strips
      const rgb = i => ['#ff3a6a', '#ff9a3a', '#ffe03a', '#3aff7a', '#3ad8ff', '#6a5aff', '#d03aff'][i % 7];
      for (let x = 1; x < 24; x++) w.set(x, 14, 1, rgb(x), 1);
      for (let z = 2; z < 24; z++) w.set(1, 14, z, rgb(z + 3), 1);
      for (let i = 0; i < 6; i++) w.light(2 + i * 4, 13, 2, rgb(i * 2), .55, 1);
      // desk with two monitors
      w.box(4, 5, 1, 19, 5, 6, '#111116'); w.box(4, 0, 1, 4, 4, 1, '#111116'); w.box(19, 0, 1, 19, 4, 1, '#111116'); w.box(4, 0, 6, 4, 4, 6, '#111116'); w.box(19, 0, 6, 19, 4, 6, '#111116');
      for (let x = 4; x <= 19; x++) w.set(x, 5, 6, rgb(x), 1);
      w.box(6, 7, 2, 11, 11, 2, '#08080c'); w.box(7, 8, 3, 10, 10, 3, '#3a7aff', .95);
      w.box(12, 7, 2, 17, 11, 2, '#08080c'); w.box(13, 8, 3, 16, 10, 3, '#ff3a8a', .95);
      w.box(8, 6, 2, 9, 6, 3, '#202028'); w.box(14, 6, 2, 15, 6, 3, '#202028');
      w.light(9, 9, 5, '#3a7aff', 1); w.light(14, 9, 5, '#ff3a8a', 1);
      w.box(9, 6, 4, 13, 6, 5, '#2a2a34'); for (let x = 9; x <= 13; x++) w.set(x, 6, 4, rgb(x + 2), .8);
      w.box(15, 6, 4, 15, 6, 4, '#2a2a34');
      // PC tower
      w.box(20, 0, 2, 22, 6, 6, '#16161c'); w.box(20, 1, 6, 20, 5, 6, '#2a2a40', .3); for (let y = 1; y < 6; y++) w.set(21, y, 6, rgb(y), 1);
      // beanbag
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 0; y < 3; y++) if (x * x + z * z + y * y * 1.5 < 7) w.set(5 + x, y, 18 + z, '#7a3aff');
      rug(w, 8, 10, 18, 18, '#2a2a40', '#7a3aff');
      w.stand = [12, 0, 12];
    },
    cafe(w) {
      room(w, (x, y, z) => hex((x + z) % 2 ? '#e8e0d0' : '#2a2420'), (x, y) => hex(y < 5 ? '#6b4630' : '#e9d9bf'), (x, y, z) => hex(y < 5 ? '#6b4630' : '#e9d9bf'));
      // counter
      w.box(1, 0, 3, 9, 4, 6, '#6b4630'); w.box(1, 5, 3, 9, 5, 6, '#2a2420');
      w.box(2, 6, 3, 4, 9, 4, '#c0c4cc'); w.set(3, 7, 5, '#2a2420'); w.box(6, 6, 4, 6, 6, 4, '#ffffff'); w.box(7, 6, 4, 7, 6, 4, '#ffffff'); w.set(6, 7, 4, '#8a5a3a');
      // menu board
      w.box(3, 9, 0, 10, 13, 0, '#1a1a1a'); for (let y = 10; y <= 12; y++) for (let x = 4; x < 10; x += 1 + (y % 2)) w.set(x, y, 0, '#f0f0f0', .4);
      // tables
      for (const [x, z] of [[15, 9], [15, 18], [8, 17]]) { w.box(x, 0, z, x, 3, z, '#2a2420'); w.box(x - 1, 4, z - 1, x + 1, 4, z + 1, '#a8774e'); w.set(x, 5, z, '#ffffff'); for (const [a, b] of [[-3, 0], [3, 0]]) { w.box(x + a, 0, z + b, x + a, 2, z + b, '#5a3a24'); } }
      plant(w, 21, 2); plant(w, 2, 21);
      // hanging lights
      for (const [x, z] of [[15, 9], [15, 18], [8, 17], [5, 4]]) { w.box(x, 12, z, x, 15, z, '#1a1a1a'); w.set(x, 11, z, '#ffd38a', 1); w.light(x, 10, z, '#ffc77a', 1.2); }
      windowOn(w, 14, 5, 20, 11, '#a8d8ff', '#3a2a20');
      w.stand = [11, 0, 12];
    }
  };

  /* ---------------- player from a skin ---------------- */
  function skinPixels(img) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    if (img.height === 32) { // old skins: mirror the right arm/leg into the left slots
      const flip = (sx, sy, dx, dy) => { g.save(); g.translate(dx + 16, dy); g.scale(-1, 1); g.drawImage(c, sx, sy, 16, 16, 0, 0, 16, 16); g.restore(); };
      flip(0, 16, 16, 48); flip(40, 16, 32, 48);
    }
    const d = g.getImageData(0, 0, 64, 64).data;
    return (x, y) => { const i = (y * 64 + x) * 4; return d[i + 3] < 30 ? null : [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]; };
  }
  // one Minecraft box as textured pixel quads
  function skinBox(px, out, u, v, w, h, d, off, grow = 0) {
    const [ox, oy, oz] = off, gs = grow;
    const sx = (w + gs * 2) / w, sy = (h + gs * 2) / h, sz = (d + gs * 2) / d;
    const P = (x, y, z) => [ox - gs + x * sx, oy - gs + y * sy, oz - gs + z * sz];
    const face = (tu, tv, tw, th, map, n) => {
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
        const c = px(tu + i, tv + j); if (!c) continue;
        const q = map(i, j); out.push([q.map(p => P(...p)), n, c]);
      }
    };
    // front (+z)
    face(u + d, v + d, w, h, (i, j) => [[i, h - j - 1, d], [i + 1, h - j - 1, d], [i + 1, h - j, d], [i, h - j, d]], [0, 0, 1]);
    // back (-z)
    face(u + 2 * d + w, v + d, w, h, (i, j) => [[w - i, h - j - 1, 0], [w - i - 1, h - j - 1, 0], [w - i - 1, h - j, 0], [w - i, h - j, 0]], [0, 0, -1]);
    // right (-x)
    face(u, v + d, d, h, (i, j) => [[0, h - j - 1, i], [0, h - j - 1, i + 1], [0, h - j, i + 1], [0, h - j, i]], [-1, 0, 0]);
    // left (+x)
    face(u + d + w, v + d, d, h, (i, j) => [[w, h - j - 1, d - i], [w, h - j - 1, d - i - 1], [w, h - j, d - i - 1], [w, h - j, d - i]], [1, 0, 0]);
    // top (+y)
    face(u + d, v, w, d, (i, j) => [[i, h, j + 1], [i + 1, h, j + 1], [i + 1, h, j], [i, h, j]], [0, 1, 0]);
    // bottom (-y)
    face(u + d + w, v, w, d, (i, j) => [[i, 0, d - j - 1], [i + 1, 0, d - j - 1], [i + 1, 0, d - j], [i, 0, d - j]], [0, -1, 0]);
  }
  function playerParts(px, slim) {
    const aw = slim ? 3 : 4;
    const part = (pivot, boxes) => { const q = []; for (const b of boxes) skinBox(px, q, ...b); return { pivot, q }; };
    return {
      head: part([4, 24, 2], [[0, 0, 8, 8, 8, [0, 24, -2]], [32, 0, 8, 8, 8, [0, 24, -2], .5]]),
      body: part([4, 12, 2], [[16, 16, 8, 12, 4, [0, 12, 0]], [16, 32, 8, 12, 4, [0, 12, 0], .25]]),
      rarm: part([-aw / 2, 22, 2], [[40, 16, aw, 12, 4, [-aw, 12, 0]], [40, 32, aw, 12, 4, [-aw, 12, 0], .25]]),
      larm: part([8 + aw / 2, 22, 2], [[32, 48, aw, 12, 4, [8, 12, 0]], [48, 48, aw, 12, 4, [8, 12, 0], .25]]),
      rleg: part([2, 12, 2], [[0, 16, 4, 12, 4, [0, 0, 0]], [0, 32, 4, 12, 4, [0, 0, 0], .25]]),
      lleg: part([6, 12, 2], [[16, 48, 4, 12, 4, [4, 0, 0]], [0, 48, 4, 12, 4, [4, 0, 0], .25]])
    };
  }

  /* ---------------- GL ---------------- */
  const VS = `attribute vec3 p;attribute vec3 n;attribute vec3 c;attribute float e;
uniform mat4 vp,m;varying vec3 vp_,vn,vc;varying float ve;
void main(){vec4 w=m*vec4(p,1.);vp_=w.xyz;vn=normalize(mat3(m)*n);vc=c;ve=e;gl_Position=vp*w;}`;
  const FS = `precision mediump float;varying vec3 vp_,vn,vc;varying float ve;
uniform vec3 amb,sunDir,sunCol;uniform vec3 lp[12];uniform vec3 lc[12];uniform float lk[12];uniform int ln;
void main(){vec3 col=vc*(amb+sunCol*max(dot(vn,sunDir),0.));
for(int i=0;i<12;i++){if(i>=ln)break;vec3 d=lp[i]-vp_;float r=length(d);float f=max(dot(vn,d/r),0.)*.7+.3;col+=vc*lc[i]*lk[i]*f/(1.+r*r*.045);}
col=mix(col,vc*1.15,ve);col=col/(1.+col*.35);gl_FragColor=vec4(pow(col,vec3(.95)),1.);}`;

  function upload(gl, quads) {
    const n = quads.length, data = new Float32Array(n * 6 * 10);
    let o = 0;
    for (const [v, nm, c, e = 0] of quads) for (const k of [0, 1, 2, 0, 2, 3]) { const p = v[k]; data.set([p[0], p[1], p[2], nm[0], nm[1], nm[2], c[0], c[1], c[2], e], o); o += 10; }
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { b, count: n * 6 };
  }
  function voxelQuads(w) {
    const out = [];
    const F = [[[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
      [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
      [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]]];
    for (const v of w.vox.values()) for (const [n, q] of F) {
      if (w.has(v.x + n[0], v.y + n[1], v.z + n[2])) continue;
      // fake AO: darken faces next to walls
      const shade = n[1] === 1 ? 1 : n[1] === -1 ? .6 : n[0] ? .86 : .93;
      out.push([q.map(p => [v.x + p[0], v.y + p[1], v.z + p[2]]), n, v.c.map(x => x * shade), v.e]);
    }
    return out;
  }

  window.KY_ROOM = function (canvas, cfg, skinUrl, slim) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) { canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Your browser can\'t show 3D rooms.' })); return { stop() {} }; }
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const A = n => gl.getAttribLocation(pr, n), U = n => gl.getUniformLocation(pr, n);
    const att = ['p', 'n', 'c', 'e'].map(A);
    const bind = buf => { gl.bindBuffer(gl.ARRAY_BUFFER, buf.b); [3, 3, 3, 1].reduce((off, sz, i) => { gl.enableVertexAttribArray(att[i]); gl.vertexAttribPointer(att[i], sz, gl.FLOAT, false, 40, off * 4); return off + sz; }, 0); };
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

    seed = 7 + [...(cfg.scene || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const w = World(); (SCENES[cfg.scene] || SCENES.bedroom)(w);
    const night = cfg.time !== 'day';
    const sceneBuf = upload(gl, voxelQuads(w));
    const lights = w.lights.slice(0, 12);
    let parts = null;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { try { const pl = playerParts(skinPixels(img), slim); parts = {}; for (const k in pl) parts[k] = { pivot: pl[k].pivot, buf: upload(gl, pl[k].q) }; } catch (e) { /* tainted or bad skin */ } };
    img.src = skinUrl;

    let yaw = .62, pitch = .5, dist = 54, drag = null, run = true, idle = 0;
    canvas.onpointerdown = e => { drag = [e.clientX, e.clientY, yaw, pitch]; canvas.setPointerCapture(e.pointerId); idle = performance.now(); };
    canvas.onpointermove = e => { if (!drag) return; yaw = Math.max(-.05, Math.min(1.62, drag[2] - (e.clientX - drag[0]) / 160)); pitch = Math.max(.12, Math.min(1.2, drag[3] + (e.clientY - drag[1]) / 220)); idle = performance.now(); };
    canvas.onpointerup = () => { drag = null; };
    canvas.onwheel = e => { e.preventDefault(); dist = Math.max(28, Math.min(70, dist + e.deltaY * .03)); };

    const amb = night ? [.26, .27, .38] : [.55, .56, .6], sun = night ? [.18, .2, .32] : [.75, .72, .62];
    const sunDir = norm(night ? [.4, .8, .6] : [.5, .9, .7]);
    const fit = () => { const r = devicePixelRatio || 1; canvas.width = canvas.clientWidth * r; canvas.height = canvas.clientHeight * r; };
    fit(); const ro = new ResizeObserver(fit); ro.observe(canvas);

    const S = .25; // skin pixel -> world units
    function frame(t) {
      if (!run || !canvas.isConnected) { ro.disconnect(); return; }
      const s = t / 1000;
      if (!drag && t - idle > 2500) yaw += (.62 + Math.sin(s * .2) * .35 - yaw) * .01;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const c = [11, 3.2, 11], eye = [c[0] + Math.sin(yaw) * Math.cos(pitch) * dist, c[1] + Math.sin(pitch) * dist, c[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
      const vp = M.mul(M.persp(.62, canvas.width / canvas.height, .5, 200), M.look(eye, c, [0, 1, 0]));
      gl.uniformMatrix4fv(U('vp'), false, vp);
      gl.uniform3fv(U('amb'), amb); gl.uniform3fv(U('sunDir'), sunDir); gl.uniform3fv(U('sunCol'), sun);
      gl.uniform1i(U('ln'), lights.length);
      lights.forEach((l, i) => {
        const fl = l.flick === 2 ? .8 + .25 * Math.sin(s * 11 + i) * Math.sin(s * 7.3 + i * 2) : l.flick === 1 ? .75 + .25 * Math.sin(s * 2 + i * 1.7) : 1;
        gl.uniform3fv(U(`lp[${i}]`), l.p); gl.uniform3fv(U(`lc[${i}]`), l.c); gl.uniform1f(U(`lk[${i}]`), l.power * fl * (night ? 1 : .55));
      });
      gl.uniformMatrix4fv(U('m'), false, M.id()); bind(sceneBuf); gl.drawArrays(gl.TRIANGLES, 0, sceneBuf.count);
      if (parts) {
        const pose = cfg.pose || 'wave', sit = pose === 'sit';
        const root = M.mul(M.tr(w.stand[0] + 1, (w.stand[1] + (sit ? 0 : 0)) + (sit ? -3 * S * 0 : 0), w.stand[2] + 1), M.mul(M.ry(Math.sin(s * .4) * .25), M.mul(M.sc(S), M.tr(-4, sit ? -12 + 4 : 0, -2))));
        const breathe = Math.sin(s * 2) * .35;
        const rot = {
          head: M.mul(M.ry(Math.sin(s * .7) * .35), M.rx(Math.sin(s * .9) * .08)),
          body: M.id(),
          rarm: pose === 'wave' ? M.mul(M.rz(-2.6 + Math.sin(s * 6) * .35), M.id()) : sit ? M.rx(-.6) : M.rz(-.05 - breathe * .05),
          larm: sit ? M.rx(-.6) : M.rz(.05 + breathe * .05),
          rleg: sit ? M.rx(-1.5) : M.id(),
          lleg: sit ? M.rx(-1.5) : M.id()
        };
        for (const k in parts) {
          const pt = parts[k], pv = pt.pivot;
          const m = M.mul(root, M.mul(M.tr(pv[0], pv[1], pv[2]), M.mul(rot[k], M.tr(-pv[0], -pv[1], -pv[2]))));
          gl.uniformMatrix4fv(U('m'), false, m); bind(pt.buf); gl.drawArrays(gl.TRIANGLES, 0, pt.buf.count);
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { stop() { run = false; } };
  };
  window.KY_ROOM.SCENES = ['christmas', 'bedroom', 'garden', 'beach', 'space', 'halloween', 'gamer', 'cafe'];
})();
