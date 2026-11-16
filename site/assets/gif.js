/* Kyoto Studio: a tiny animated GIF encoder (GIF89a + LZW), no libraries.
   KGIF.encode(frames, { delays:[ms], loop:true }) -> Uint8Array. frames = ImageData[] all the same size.
   Colours: exact when the animation uses <= 255 colours (pixel art), otherwise reduced to a 6-7-6 colour cube. Transparent pixels stay transparent. */
(function () {
  'use strict';
  function buildPalette(frames) {
    const map = new Map();
    for (const f of frames) {
      const d = f.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const c = d[i] << 16 | d[i + 1] << 8 | d[i + 2];
        if (!map.has(c)) { map.set(c, map.size + 1); if (map.size > 255) return null; }
      }
    }
    return map;
  }
  function cubeIndex(r, g, b) { return 1 + (Math.round(r / 255 * 5) * 42 + Math.round(g / 255 * 6) * 6 + Math.round(b / 255 * 5)); }
  function lzw(indices, minCode, out) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, dict = new Map();
    let cur = 0, bits = 0; const bytes = [];
    const put = code => { cur |= code << bits; bits += size; while (bits >= 8) { bytes.push(cur & 255); cur >>>= 8; bits -= 8; } };
    put(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = prefix * 4096 + k;
      const hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      put(prefix);
      if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
      else { put(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
      prefix = k;
    }
    put(prefix); put(eoi);
    if (bits > 0) bytes.push(cur & 255);
    out.push(minCode);
    for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(bytes[i + j]); }
    out.push(0);
  }
  function encode(frames, opt = {}) {
    const w = frames[0].width, h = frames[0].height, out = [];
    const str = s => { for (const ch of s) out.push(ch.charCodeAt(0)); };
    const u16 = v => out.push(v & 255, v >> 8 & 255);
    let pal = buildPalette(frames); const exact = !!pal;
    const table = new Uint8Array(256 * 3);
    if (exact) for (const [c, i] of pal) { table[i * 3] = c >> 16 & 255; table[i * 3 + 1] = c >> 8 & 255; table[i * 3 + 2] = c & 255; }
    else for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) { const i = 1 + r * 42 + g * 6 + b; table[i * 3] = r * 51; table[i * 3 + 1] = Math.round(g * 42.5); table[i * 3 + 2] = b * 51; }
    str('GIF89a'); u16(w); u16(h); out.push(0xF7, 0, 0); // global table, 256 colours
    for (const v of table) out.push(v);
    if (opt.loop !== false) { out.push(0x21, 0xFF, 11); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0); }
    frames.forEach((f, n) => {
      const delay = Math.max(2, Math.round((opt.delays ? opt.delays[n] : 100) / 10));
      out.push(0x21, 0xF9, 4, 0x09, delay & 255, delay >> 8 & 255, 0, 0); // dispose: restore to background, transparent index 0
      out.push(0x2C); u16(0); u16(0); u16(w); u16(h); out.push(0);
      const d = f.data, idx = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) idx[p] = d[i + 3] < 128 ? 0 : exact ? pal.get(d[i] << 16 | d[i + 1] << 8 | d[i + 2]) : cubeIndex(d[i], d[i + 1], d[i + 2]);
      lzw(idx, 8, out);
    });
    out.push(0x3B);
    return new Uint8Array(out);
  }
  window.KGIF = { encode };
})();
