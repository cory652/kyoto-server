/* Tiny QR code maker (byte mode, error correction M, versions 1-6 = up to 106 characters).
   window.KY_QR(text) -> 2D array of booleans (true = dark). */
(function (root) {
  'use strict';
  const EC = [0, 10, 16, 26, 18, 24, 16], BLOCKS = [0, 1, 1, 1, 2, 2, 4];
  const rawModules = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; } return r; };
  const dataCap = v => Math.floor(rawModules(v) / 8) - EC[v] * BLOCKS[v];
  function mul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
  function divisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = mul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; }
  function remainder(data, div) { const r = new Array(div.length).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < r.length; i++) r[i] ^= mul(div[i], f); } return r; }

  function make(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    let v = 1; while (v <= 6 && dataCap(v) < bytes.length + 2) v++;
    if (v > 6) throw new Error('Text too long for this QR maker');
    const size = v * 4 + 17, cap = dataCap(v);
    // bit stream
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0xEC; data.length < cap; p ^= 0xEC ^ 0x11) data.push(p);
    // blocks + error correction, interleaved
    const nb = BLOCKS[v], raw = Math.floor(rawModules(v) / 8), short = Math.floor(raw / nb), nShort = nb - raw % nb, ecLen = EC[v], div = divisor(ecLen);
    const blocks = []; let k = 0;
    for (let i = 0; i < nb; i++) { const len = short - ecLen + (i < nShort ? 0 : 1); const d = data.slice(k, k + len); k += len; blocks.push({ d, e: remainder(d, div) }); }
    const out = []; const maxD = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
    // modules
    const M = Array.from({ length: size }, () => new Array(size).fill(false)), F = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (v >= 2) { const pos = [6, size - 7]; for (const a of pos) for (const b of pos) { if ((a === 6 && b === 6) || (a === 6 && b === size - 7) || (a === size - 7 && b === 6)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); } }
    const fmt = (mask, real) => {
      const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412, bit = i => real ? ((b >>> i) & 1) === 1 : false;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    fmt(0, false);
    // zigzag data
    const all = []; out.forEach(b => { for (let i = 7; i >= 0; i--) all.push((b >>> i) & 1); });
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x]) { M[y][x] = i < all.length ? all[i] === 1 : false; i++; }
      }
    }
    // pick the mask with the lowest penalty
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) for (let dir = 0; dir < 2; dir++) { let run = 1; for (let x = 1; x < size; x++) { const a = dir ? M[x][y] : M[y][x], b = dir ? M[x - 1][y] : M[y][x - 1]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
      for (const row of M) for (const c of row) if (c) dark++;
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { apply(m); fmt(m, true); const p = penalty(); if (p < bestP) { bestP = p; best = m; } apply(m); }
    apply(best); fmt(best, true);
    return M;
  }
  /** Draws the code into an <svg> string (rounded modules, dots for the eyes). */
  function svg(text, { fg = '#fff', bg = 'transparent', pad = 2, round = .38 } = {}) {
    const M = make(text), n = M.length, s = n + pad * 2;
    const eye = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (M[y][x] && !eye(x, y)) d += `<rect x="${x + pad + .06}" y="${y + pad + .06}" width=".88" height=".88" rx="${round}"/>`;
    const eyes = [[0, 0], [n - 7, 0], [0, n - 7]].map(([x, y]) => `<rect x="${x + pad + .5}" y="${y + pad + .5}" width="6" height="6" rx="1.8" fill="none" stroke="${fg}" stroke-width="1"/><rect x="${x + pad + 2}" y="${y + pad + 2}" width="3" height="3" rx=".9"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="geometricPrecision"><rect width="${s}" height="${s}" fill="${bg}"/><g fill="${fg}">${d}${eyes}</g></svg>`;
  }
  root.KY_QR = make; root.KY_QR.svg = svg;
  if (typeof module !== 'undefined') module.exports = root.KY_QR;
})(typeof window !== 'undefined' ? window : globalThis);
