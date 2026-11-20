/* Kyoto Studio - block textures for the 3D build viewer.
 *
 * Two kinds of textures:
 *  1. Your own Minecraft textures. The Kyoto Studio app reads them from the Minecraft you have installed
 *     (versions/<version>/<version>.jar). On the website you can pick that .jar or any resource pack .zip.
 *     They're only read on your computer and kept in your browser storage, never uploaded.
 *  2. Kyoto's own pixel textures (made here from the block's colour and type) when there's nothing else.
 *
 * KS_TEX.atlas(palette) -> { data, layers, faces: Uint16Array(n*6), tint: Uint8Array(n*4) }
 *   faces are layer numbers for +x -x +y -y +z -z (65535 = none), tint = rgb + flags (bit 0: use texture alpha).
 */
'use strict';
(() => {
  const TS = 16;
  let TEX = null;          // name -> ImageData 16x16 (from a jar / pack)
  let source = '';         // what they came from, for the UI
  const listeners = [];

  /* ============================================ zip (jar / resource pack) ============================================ */
  async function inflateRaw(bytes) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  function zipEntries(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf instanceof ArrayBuffer ? buf : u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('That isn\'t a .jar or .zip file');
    let count = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true);
    const out = new Map(), td = new TextDecoder();
    for (let n = 0; n < count && off + 46 <= u8.length; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), size = dv.getUint32(off + 24, true);
      const nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), local = dv.getUint32(off + 42, true);
      const name = td.decode(u8.subarray(off + 46, off + 46 + nl));
      out.set(name, { method, csize, size, local });
      off += 46 + nl + el + cl;
    }
    return { u8, dv, out };
  }
  async function zipRead(z, e) {
    const lnl = z.dv.getUint16(e.local + 26, true), lel = z.dv.getUint16(e.local + 28, true);
    const start = e.local + 30 + lnl + lel, raw = z.u8.subarray(start, start + e.csize);
    return e.method === 0 ? raw.slice() : inflateRaw(raw);
  }

  /** Reads block textures out of a Minecraft .jar or a resource pack .zip. */
  async function loadZip(buf, label) {
    const z = zipEntries(buf), files = {};
    const PRE = 'assets/minecraft/textures/block/';
    const jobs = [];
    for (const [name, e] of z.out) {
      if (!name.startsWith(PRE) || !name.endsWith('.png') || name.slice(PRE.length).includes('/')) continue;
      jobs.push(zipRead(z, e).then(b => { files[name.slice(PRE.length, -4)] = b; }).catch(() => {}));
    }
    await Promise.all(jobs);
    if (Object.keys(files).length < 20) throw new Error('No block textures inside. Pick your Minecraft .jar or a resource pack .zip.');
    await useFiles(files, label);
    save(files, label).catch(() => {});
    return Object.keys(files).length;
  }
  async function useFiles(files, label) {
    const map = new Map();
    const c = document.createElement('canvas'); c.width = c.height = TS;
    const g = c.getContext('2d', { willReadFrequently: true });
    await Promise.all(Object.entries(files).map(async ([n, bytes]) => {
      try {
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const s = Math.min(bmp.width, bmp.height); // animated textures are tall strips: take the first frame
        g.clearRect(0, 0, TS, TS); g.imageSmoothingEnabled = s > TS;
        g.drawImage(bmp, 0, 0, s, s, 0, 0, TS, TS);
        map.set(n, g.getImageData(0, 0, TS, TS));
        bmp.close && bmp.close();
      } catch (e) { /* skip broken png */ }
    }));
    TEX = map; source = label;
    listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
  }

  /* ---------------- keep them for next time (IndexedDB, this computer only) ---------------- */
  const DB = 'kyoto-textures';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('t'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function save(files, label) { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('t', 'readwrite'); tx.objectStore('t').put({ files, label, at: Date.now() }, 'blocks'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function restore() {
    try {
      const db = await idb();
      const v = await new Promise((res, rej) => { const tx = db.transaction('t', 'readonly'); const r = tx.objectStore('t').get('blocks'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      if (v && v.files) { await useFiles(v.files, v.label); return true; }
    } catch (e) { /* no storage */ }
    return false;
  }
  async function forget() { try { const db = await idb(); db.transaction('t', 'readwrite').objectStore('t').delete('blocks'); } catch (e) { /* ignore */ } TEX = null; source = ''; listeners.forEach(f => f()); }

  /* ============================================ which texture goes on which face ============================================ */
  const WOOD = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped', 'pale_oak'];
  const has = n => TEX && TEX.has(n);
  const first = (...l) => l.find(has) || null;
  function props(s) { const m = /\[(.*)\]/.exec(s), o = {}; if (m) for (const kv of m[1].split(',')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); } return o; }

  /** The "family" block whose textures a stair / slab / fence / wall uses. */
  function baseOf(n) {
    for (const w of WOOD) if (n.startsWith(w + '_') && /_(stairs|slab|fence|fence_gate|pressure_plate|button|sign|wall_sign|hanging_sign|wall_hanging_sign)$/.test(n)) return w === 'bamboo' ? 'bamboo_planks' : w + '_planks';
    let b = n.replace(/_(stairs|slab|wall|fence|fence_gate|pressure_plate|button)$/, '');
    if (b === n) return null;
    if (b.endsWith('_brick') || b.endsWith('_tile')) b += 's';
    if (b === 'brick') b = 'bricks';
    if (b === 'quartz') b = 'quartz_block';
    if (b === 'purpur') b = 'purpur_block';
    if (b === 'smooth_quartz') b = 'quartz_block_bottom';
    if (b === 'smooth_sandstone') b = 'sandstone_top';
    if (b === 'smooth_red_sandstone') b = 'red_sandstone_top';
    if (b === 'petrified_oak') b = 'oak_planks';
    return b;
  }
  function names(s) {
    const n = s.replace(/^minecraft:/, '').replace(/\[.*$/, ''), p = props(s);
    let top, side, bottom, tint = 0xffffff, alpha = false;
    // special cases first
    if (n === 'grass_block') { top = 'grass_block_top'; side = 'grass_block_side'; bottom = 'dirt'; tint = -1; }
    else if (/^(water|bubble_column)$/.test(n)) { top = side = bottom = 'water_still'; tint = 0x3f76e4; }
    else if (n === 'lava') top = side = bottom = 'lava_still';
    else if (/(_log|_stem)$/.test(n) || /^stripped_.*(_log|_stem)$/.test(n)) { side = n; top = bottom = n + '_top'; }
    else if (/(_wood|_hyphae)$/.test(n)) { side = top = bottom = n.replace(/_wood$/, '_log').replace(/_hyphae$/, '_stem'); }
    else if (/_door$/.test(n)) { side = top = bottom = n + (p.half === 'upper' ? '_top' : '_bottom'); alpha = true; }
    else if (/_carpet$/.test(n)) { const w = n === 'moss_carpet' ? 'moss_block' : n.replace(/_carpet$/, '_wool'); top = side = bottom = w; }
    else if (/glass_pane$/.test(n)) { top = side = bottom = n.replace(/_pane$/, ''); alpha = true; }
    else if (n === 'snow') top = side = bottom = 'snow';
    else if (/wall_torch$/.test(n)) top = side = bottom = n.replace('wall_', '');
    else if (/_wall_(sign|hanging_sign|banner|head|skull|fan)$/.test(n)) top = side = bottom = baseOf(n.replace('_wall_', '_')) || n.replace('_wall_', '_');
    else if (n === 'dirt_path') { top = 'dirt_path_top'; side = 'dirt_path_side'; bottom = 'dirt'; }
    else if (n === 'farmland') { top = p.moisture === '7' ? 'farmland_moist' : 'farmland'; side = bottom = 'dirt'; }
    else if (n === 'mycelium' || n === 'podzol') { top = n + '_top'; side = n + '_side'; bottom = 'dirt'; }
    else if (/^(crimson|warped)_nylium$/.test(n)) { top = n; side = n + '_side'; bottom = 'netherrack'; }
    else if (n === 'smooth_stone_slab') { top = bottom = 'smooth_stone'; side = 'smooth_stone_slab_side'; }
    const b = !top ? baseOf(n) : null;
    const key = b || n;
    top = top || first(key + '_top', key, key + '_side');
    side = side || first(key + '_side', key, key + '_front', key + '_top');
    bottom = bottom || first(key + '_bottom', key + '_top', key, key + '_side');
    // tints Minecraft adds in game (grass, leaves, water)
    if (tint === -1) tint = 0x91bd59;
    else if (/^(spruce)_leaves$/.test(n)) tint = 0x619961;
    else if (/^birch_leaves$/.test(n)) tint = 0x80a755;
    else if (/^(oak|jungle|acacia|dark_oak|mangrove)_leaves$/.test(n) || /^(vine|lily_pad)$/.test(n)) tint = 0x6fa83a;
    else if (/^(short_grass|grass|tall_grass|fern|large_fern|sugar_cane)$/.test(n)) tint = 0x91bd59;
    if (/glass|ice$|_leaves$|_door$|trapdoor|bars|ladder|rail|torch|lantern|sapling|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily|rose|fern|grass$|vine|cobweb|chain/.test(n)) alpha = true;
    return { top, side, bottom, tint, alpha, n, p };
  }

  /* ============================================ Kyoto's own pixel textures ============================================ */
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function proc(n, face, rgb, alphaPal) {
    const img = new ImageData(TS, TS), d = img.data, R = rng(hashStr(n + face));
    const cr = rgb >> 16 & 255, cg = rgb >> 8 & 255, cb = rgb & 255;
    const set = (x, y, k, a = 255) => { const i = (y * TS + x) * 4; d[i] = Math.max(0, Math.min(255, cr * k)); d[i + 1] = Math.max(0, Math.min(255, cg * k)); d[i + 2] = Math.max(0, Math.min(255, cb * k)); d[i + 3] = a; };
    const kind = /planks|_stairs|_slab|_fence|bookshelf|crafting|barrel|chest|composter|lectern|_sign/.test(n) && !/stone|brick|quartz|purpur|sandstone|copper|blackstone|deepslate|tuff|mud/.test(n) ? 'planks'
      : /_log|_stem|_wood|hyphae/.test(n) ? (face === 'top' ? 'rings' : 'bark')
      : /bricks?|tiles|nether_brick/.test(n) ? 'bricks'
      : /_ore$/.test(n) ? 'ore'
      : /glass|ice/.test(n) ? 'glass'
      : /leaves|azalea/.test(n) ? 'leaves'
      : /wool|carpet/.test(n) ? 'wool'
      : /concrete$|terracotta|_block$/.test(n) && /iron|gold|diamond|emerald|lapis|redstone|netherite|copper|amethyst|coal/.test(n) ? 'metal'
      : /concrete$/.test(n) ? 'flat'
      : /dirt|mud|sand|gravel|soul|clay|powder|snow/.test(n) ? 'speckle'
      : 'stone';
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let k = 1, a = 255;
      switch (kind) {
        case 'planks': { const row = y >> 2; k = 0.92 + 0.12 * R(); if ((y & 3) === 3) k = 0.68; if (x === ((row * 7 + 3) & 15) && (y & 3) !== 3) k = 0.75; if ((x + row * 5) % 9 === 0 && R() < .5) k *= .93; break; }
        case 'bark': k = 0.8 + 0.25 * R() + ((x % 4 === 0) ? -0.18 : 0); break;
        case 'rings': { const r = Math.hypot(x - 7.5, y - 7.5); k = r > 7 ? 0.62 : 0.95 + 0.12 * Math.sin(r * 1.9) + 0.06 * R(); break; }
        case 'bricks': { const row = y >> 2, off = (row & 1) * 4; k = 0.9 + 0.18 * R(); if ((y & 3) === 3 || ((x + off) & 7) === 7) { set(x, y, 1, 255); const i = (y * TS + x) * 4; d[i] = d[i + 1] = d[i + 2] = 175 + 25 * R(); continue; } break; }
        case 'ore': { k = 1; const sx = (x * 7 + y * 3) % 5, spot = R() < .18 && sx < 3; if (!spot) { const i = (y * TS + x) * 4, v = 110 + 30 * R(); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; continue; } k = 1.1 + .2 * R(); break; }
        case 'glass': { const edge = x === 0 || y === 0 || x === 15 || y === 15; const streak = (x - y === 3 || x - y === 4) && x > 3 && x < 11; k = edge ? 1.05 : streak ? 1.25 : 1.1; a = edge ? 220 : streak ? 120 : 40; break; }
        case 'leaves': k = 0.75 + 0.45 * R(); if (R() < .12) a = 0; break;
        case 'wool': k = 0.92 + 0.1 * R() + ((x + y) % 4 === 0 ? -.05 : 0); break;
        case 'metal': { const edge = x === 0 || y === 0 || x === 15 || y === 15; k = edge ? 0.78 : (x === 1 || y === 1) ? 1.18 : 1 + 0.05 * R(); break; }
        case 'flat': k = 0.97 + 0.05 * R(); break;
        case 'speckle': k = 0.85 + 0.3 * R(); if (R() < .06) k = .7; break;
        default: { k = 0.82 + 0.26 * R(); if (R() < .08) k = .68; }
      }
      set(x, y, k, alphaPal < 255 && kind !== 'glass' ? alphaPal : a);
    }
    return img;
  }

  /* ============================================ the texture array for one build ============================================ */
  /**
   * palette: [{ s, c, alpha }]. Returns layers (RGBA 16x16 each) + per palette entry: 6 face layers and a tint.
   * Faces: +x, -x, +y(top), -y(bottom), +z, -z. Logs lying on their side get their "top" on the ends.
   */
  function atlas(palette, maxLayers = 2048) {
    const layers = [], index = new Map();
    const addLayer = (key, img) => { if (index.has(key)) return index.get(key); if (layers.length >= maxLayers) return 65535; index.set(key, layers.length); layers.push(img); return layers.length - 1; };
    const faces = new Uint16Array(palette.length * 6).fill(65535), tint = new Uint8Array(palette.length * 4);
    palette.forEach((p, i) => {
      tint.set([255, 255, 255, 0], i * 4);
      if (!p.s || p.s === 'minecraft:air' || i === 0) return;
      const nm = names(p.s);
      const real = TEX && nm.side && has(nm.side);
      let T, S, Bt;
      if (real) {
        T = addLayer(nm.top || nm.side, TEX.get(nm.top || nm.side)); S = addLayer(nm.side, TEX.get(nm.side)); Bt = addLayer(nm.bottom || nm.side, TEX.get(nm.bottom || nm.side));
        const t = nm.tint; tint.set([t >> 16 & 255, t >> 8 & 255, t & 255, nm.alpha ? 1 : 0], i * 4);
        if (nm.n === 'grass_block') { // only the top is tinted: bake a green side instead
          const st = TEX.get('grass_block_side'), ov = TEX.get('grass_block_side_overlay');
          if (st && ov) { const img = new ImageData(new Uint8ClampedArray(st.data), TS, TS); for (let q = 0; q < TS * TS; q++) if (ov.data[q * 4 + 3] > 100) { img.data[q * 4] = ov.data[q * 4] * .57; img.data[q * 4 + 1] = ov.data[q * 4 + 1] * .74; img.data[q * 4 + 2] = ov.data[q * 4 + 2] * .35; } S = addLayer('grass_side_baked', img); }
          const top = TEX.get('grass_block_top'); if (top) { const img = new ImageData(new Uint8ClampedArray(top.data), TS, TS); for (let q = 0; q < TS * TS; q++) { img.data[q * 4] *= .57; img.data[q * 4 + 1] *= .74; img.data[q * 4 + 2] *= .35; } T = addLayer('grass_top_baked', img); }
          tint.set([255, 255, 255, 0], i * 4);
        }
      } else {
        const base = nm.n.replace(/_(stairs|slab|wall|fence|fence_gate)$/, '');
        T = addLayer('k:' + base + ':top:' + p.c, proc(base, 'top', p.c, p.alpha));
        S = addLayer('k:' + base + ':side:' + p.c, proc(base, 'side', p.c, p.alpha));
        Bt = T;
        tint.set([255, 255, 255, /glass|leaves|ice/.test(base) ? 1 : 0], i * 4);
      }
      const axis = nm.p.axis;
      const f = axis === 'x' ? [T, Bt, S, S, S, S] : axis === 'z' ? [S, S, S, S, T, Bt] : [S, S, T, Bt, S, S];
      faces.set(f, i * 6);
    });
    const data = new Uint8Array(Math.max(1, layers.length) * TS * TS * 4);
    layers.forEach((img, k) => data.set(img.data, k * TS * TS * 4));
    return { data, layers: Math.max(1, layers.length), faces, tint, size: TS, real: !!TEX };
  }

  /* ============================================ shapes (for imported schematics) ============================================ */
  /** Rough block shape [x0,y0,z0,x1,y1,z1] from its state, so slabs, carpets, fences etc. aren't full cubes. */
  function shape(s) {
    const n = s.replace(/^minecraft:/, '').replace(/\[.*$/, ''), p = props(s);
    if (/_slab$/.test(n)) return p.type === 'double' ? null : p.type === 'top' ? [0, .5, 0, 1, 1, 1] : [0, 0, 0, 1, .5, 1];
    if (/carpet$/.test(n)) return [0, 0, 0, 1, .0625, 1];
    if (/pressure_plate$/.test(n)) return [.0625, 0, .0625, .9375, .0625, .9375];
    if (n === 'snow') { const l = Number(p.layers || 1); return [0, 0, 0, 1, l / 8, 1]; }
    if (/_fence$|_wall$/.test(n)) return [.3125, 0, .3125, .6875, 1, .6875];
    if (/glass_pane$|iron_bars$/.test(n)) return p.east === 'true' || p.west === 'true' ? [0, 0, .4375, 1, 1, .5625] : [.4375, 0, 0, .5625, 1, 1];
    if (/_trapdoor$/.test(n)) return p.open === 'true' ? null : p.half === 'top' ? [0, .8125, 0, 1, 1, 1] : [0, 0, 0, 1, .1875, 1];
    if (/_door$/.test(n)) { const f = p.facing; return f === 'north' ? [0, 0, .8125, 1, 1, 1] : f === 'south' ? [0, 0, 0, 1, 1, .1875] : f === 'west' ? [.8125, 0, 0, 1, 1, 1] : [0, 0, 0, .1875, 1, 1]; }
    if (/torch$/.test(n)) return [.4375, 0, .4375, .5625, .625, .5625];
    if (/lantern$/.test(n)) return [.3125, 0, .3125, .6875, .5625, .6875];
    if (/_button$/.test(n)) return [.3125, 0, .375, .6875, .125, .625];
    if (/(^|_)(sapling|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|rose_bush|fern|short_grass|grass|dead_bush|mushroom)$/.test(n)) return [.25, 0, .25, .75, .75, .75];
    if (/_bed$/.test(n)) return [0, 0, 0, 1, .5625, 1];
    if (/^(chest|trapped_chest|ender_chest)$/.test(n)) return [.0625, 0, .0625, .9375, .875, .9375];
    if (/_stairs$/.test(n)) return null; // full block is closest
    if (n === 'dirt_path' || n === 'farmland') return [0, 0, 0, 1, .9375, 1];
    if (/ladder$|vine$|_sign$|_banner$/.test(n)) return [0, 0, .875, 1, 1, 1];
    if (/(_|^)rail$/.test(n)) return [0, 0, 0, 1, .0625, 1];
    if (/_head$|_skull$/.test(n)) return [.25, 0, .25, .75, .5, .75];
    if (/candle$/.test(n)) return [.4375, 0, .4375, .5625, .375, .5625];
    if (/^(lever|tripwire|redstone_wire|string|cobweb|light)$/.test(n)) return [.25, 0, .25, .75, .1, .75];
    return null;
  }

  window.KS_TEX = { loadZip, restore, forget, atlas, shape, names, onChange: f => listeners.push(f), get source() { return source; }, get loaded() { return !!TEX; }, get count() { return TEX ? TEX.size : 0 } };
})();
