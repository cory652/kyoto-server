/* Tiny NBT writer + Litematica (.litematic) and WorldEdit/Sponge (.schem) exporters for Kyoto Studio.
 * Everything runs in the browser; files are gzip'd with the built-in CompressionStream. */
'use strict';
(() => {
  const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };
  // tagged values: { t: T.X, v: ... }  (compounds: plain objects of tagged values; lists: { t: T.LIST, of: T.X, v: [...] })
  const tag = (t, v, of) => ({ t, v, of });
  const N = {
    byte: v => tag(T.BYTE, v), short: v => tag(T.SHORT, v), int: v => tag(T.INT, v), long: v => tag(T.LONG, v), str: v => tag(T.STRING, String(v)),
    comp: v => tag(T.COMPOUND, v), list: (of, v) => tag(T.LIST, v, of), ints: v => tag(T.INT_ARRAY, v), longs: v => tag(T.LONG_ARRAY, v), bytes: v => tag(T.BYTE_ARRAY, v)
  };

  class Out {
    constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; this.dv = new DataView(this.buf.buffer); }
    need(k) { if (this.n + k <= this.buf.length) return; let s = this.buf.length; while (s < this.n + k) s *= 2; const b = new Uint8Array(s); b.set(this.buf.subarray(0, this.n)); this.buf = b; this.dv = new DataView(b.buffer); }
    u8(v) { this.need(1); this.buf[this.n++] = v & 255; }
    i16(v) { this.need(2); this.dv.setInt16(this.n, v); this.n += 2; }
    i32(v) { this.need(4); this.dv.setInt32(this.n, v | 0); this.n += 4; }
    u32(v) { this.need(4); this.dv.setUint32(this.n, v >>> 0); this.n += 4; }
    i64(v) { this.need(8); this.dv.setBigInt64(this.n, BigInt(v)); this.n += 8; }
    str(s) { const b = new TextEncoder().encode(s); this.i16(b.length); this.need(b.length); this.buf.set(b, this.n); this.n += b.length; }
    bytes() { return this.buf.subarray(0, this.n); }
  }
  function payload(o, t) {
    switch (t.t) {
      case T.BYTE: o.u8(t.v); break;
      case T.SHORT: o.i16(t.v); break;
      case T.INT: o.i32(t.v); break;
      case T.LONG: o.i64(t.v); break;
      case T.STRING: o.str(t.v); break;
      case T.BYTE_ARRAY: o.i32(t.v.length); o.need(t.v.length); o.buf.set(t.v, o.n); o.n += t.v.length; break;
      case T.INT_ARRAY: o.i32(t.v.length); for (const x of t.v) o.i32(x); break;
      // long arrays come as Uint32Array pairs [lo, hi, lo, hi...] so huge schematics stay fast
      case T.LONG_ARRAY: o.i32(t.v.length / 2); for (let i = 0; i < t.v.length; i += 2) { o.u32(t.v[i + 1]); o.u32(t.v[i]); } break;
      case T.LIST: o.u8(t.v.length ? t.of : (t.of || T.END)); o.i32(t.v.length); for (const x of t.v) payload(o, x); break;
      case T.COMPOUND: for (const [k, x] of Object.entries(t.v)) { o.u8(x.t); o.str(k); payload(o, x); } o.u8(T.END); break;
      default: throw new Error('bad tag ' + t.t);
    }
  }
  function write(root, name = '') { const o = new Out(); o.u8(T.COMPOUND); o.str(name); payload(o, root); return o.bytes(); }
  async function gzip(bytes) {
    const cs = new CompressionStream('gzip');
    const blob = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).blob();
    return blob;
  }

  /** "minecraft:oak_stairs[facing=north,half=bottom]" -> { Name, Properties } */
  function parseState(s) {
    const m = /^([^\[]+)(?:\[(.*)\])?$/.exec(s);
    const name = m ? m[1] : s, props = {};
    if (m && m[2]) for (const kv of m[2].split(',')) { const i = kv.indexOf('='); if (i > 0) props[kv.slice(0, i)] = kv.slice(i + 1); }
    return { name: name.includes(':') ? name : 'minecraft:' + name, props };
  }

  /**
   * Litematica schematic. blocks: Map "x,y,z" -> state string (0-based, inside size). size: [x, y, z].
   * Returns a gzip Blob. Format: Litematica schematic version 7 (MC 1.21+).
   */
  async function litematic({ name, author, description, size, blocks, dataVersion, preview }) {
    const [sx, sy, sz] = size, vol = sx * sy * sz;
    const pal = ['minecraft:air'], idx = new Map([['minecraft:air', 0]]);
    const cells = new Uint32Array(vol);
    let total = 0;
    for (const [k, s] of blocks) {
      if (!s || s === 'minecraft:air') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) continue;
      let p = idx.get(s); if (p === undefined) { p = pal.length; pal.push(s); idx.set(s, p); }
      cells[(y * sz + z) * sx + x] = p; total++;
    }
    const bits = Math.max(2, Math.ceil(Math.log2(pal.length)));
    const longs = Math.ceil(vol * bits / 64);
    const words = new Uint32Array(longs * 2); // [lo, hi] per long, tightly packed bits like Litematica's bit array
    for (let i = 0; i < vol; i++) {
      const v = cells[i]; if (!v) continue;
      const p = i * bits, w = p >>> 5, b = p & 31;
      words[w] = (words[w] | (v << b)) >>> 0;
      if (b + bits > 32) words[w + 1] = (words[w + 1] | (v >>> (32 - b))) >>> 0;
    }
    const palette = pal.map(s => { const { name: n, props } = parseState(s); const c = { Name: N.str(n) }; if (Object.keys(props).length) c.Properties = N.comp(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, N.str(v)]))); return N.comp(c); });
    const now = Date.now();
    const meta = {
      Name: N.str(name || 'Kyoto Build'), Author: N.str(author || 'Kyoto Studio'), Description: N.str(description || 'Recorded with Kyoto Client'),
      RegionCount: N.int(1), TotalVolume: N.int(vol), TotalBlocks: N.int(total), TimeCreated: N.long(now), TimeModified: N.long(now),
      EnclosingSize: N.comp({ x: N.int(sx), y: N.int(sy), z: N.int(sz) })
    };
    if (preview) meta.PreviewImageData = N.ints(preview);
    const region = {
      Position: N.comp({ x: N.int(0), y: N.int(0), z: N.int(0) }), Size: N.comp({ x: N.int(sx), y: N.int(sy), z: N.int(sz) }),
      BlockStatePalette: N.list(T.COMPOUND, palette), BlockStates: N.longs(words),
      TileEntities: N.list(T.COMPOUND, []), Entities: N.list(T.COMPOUND, []), PendingBlockTicks: N.list(T.COMPOUND, []), PendingFluidTicks: N.list(T.COMPOUND, [])
    };
    const root = N.comp({
      MinecraftDataVersion: N.int(dataVersion || 4440), Version: N.int(7), SubVersion: N.int(1),
      Metadata: N.comp(meta), Regions: N.comp({ [(name || 'Build').slice(0, 40)]: N.comp(region) })
    });
    return gzip(write(root));
  }

  /** WorldEdit / Sponge schematic v2 (.schem). */
  async function schem({ name, author, size, blocks, dataVersion }) {
    const [sx, sy, sz] = size, vol = sx * sy * sz;
    const pal = new Map([['minecraft:air', 0]]);
    const ids = new Uint32Array(vol);
    for (const [k, s] of blocks) {
      if (!s || s === 'minecraft:air') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) continue;
      let p = pal.get(s); if (p === undefined) { p = pal.size; pal.set(s, p); }
      ids[(y * sz + z) * sx + x] = p; // Sponge order: x + z*W + y*W*L
    }
    const data = []; // varints
    for (let i = 0; i < vol; i++) { let v = ids[i]; while (v >= 0x80) { data.push((v & 0x7f) | 0x80); v >>>= 7; } data.push(v); }
    const palette = {}; for (const [s, p] of pal) palette[s] = N.int(p);
    const root = N.comp({
      Version: N.int(2), DataVersion: N.int(dataVersion || 4440), Width: N.short(sx), Height: N.short(sy), Length: N.short(sz),
      PaletteMax: N.int(pal.size), Palette: N.comp(palette), BlockData: N.bytes(Uint8Array.from(data)),
      BlockEntities: N.list(T.COMPOUND, []), Offset: N.ints([0, 0, 0]),
      Metadata: N.comp({ Name: N.str(name || 'Kyoto Build'), Author: N.str(author || 'Kyoto Studio'), Date: N.long(Date.now()) })
    });
    return gzip(write(root, 'Schematic'));
  }

  /* ============================================ reading (for importing schematics) ============================================ */
  // Plain values back: compounds -> objects, lists -> arrays, long -> Number, long arrays -> { longs: Uint32Array [lo, hi, ...] }
  function read(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), td = new TextDecoder();
    let p = 0;
    const str = () => { const n = dv.getUint16(p); p += 2; const s = td.decode(u8.subarray(p, p + n)); p += n; return s; };
    function val(t) {
      switch (t) {
        case 1: return dv.getInt8(p++);
        case 2: { const v = dv.getInt16(p); p += 2; return v; }
        case 3: { const v = dv.getInt32(p); p += 4; return v; }
        case 4: { const hi = dv.getInt32(p), lo = dv.getUint32(p + 4); p += 8; return hi * 4294967296 + lo; }
        case 5: { const v = dv.getFloat32(p); p += 4; return v; }
        case 6: { const v = dv.getFloat64(p); p += 8; return v; }
        case 7: { const n = dv.getInt32(p); p += 4; const v = u8.slice(p, p + n); p += n; return v; }
        case 8: return str();
        case 9: { const of = u8[p++], n = dv.getInt32(p); p += 4; const a = []; for (let i = 0; i < n; i++) a.push(val(of)); return a; }
        case 10: { const o = {}; for (;;) { const ty = u8[p++]; if (ty === 0) break; const k = str(); o[k] = val(ty); } return o; }
        case 11: { const n = dv.getInt32(p); p += 4; const a = new Int32Array(n); for (let i = 0; i < n; i++) { a[i] = dv.getInt32(p); p += 4; } return a; }
        case 12: { const n = dv.getInt32(p); p += 4; const a = new Uint32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2 + 1] = dv.getUint32(p); a[i * 2] = dv.getUint32(p + 4); p += 8; } return { longs: a }; }
        default: throw new Error('Broken NBT (tag ' + t + ')');
      }
    }
    const t = u8[p++]; if (t !== 10) throw new Error('Not an NBT file');
    str();
    return val(10);
  }
  async function gunzipMaybe(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8[0] === 0x1f && u8[1] === 0x8b) return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    return u8;
  }
  const stateStr = c => { const n = c.Name || 'minecraft:air', pr = c.Properties || {}; const ks = Object.keys(pr).sort(); return ks.length ? `${n}[${ks.map(k => k + '=' + pr[k]).join(',')}]` : n; };

  /**
   * Any schematic (.litematic, .schem, structure .nbt) -> the same shape as a .kybuild, so the viewer can play it.
   * The "build" is put together layer by layer from the bottom, so you can watch how it would go up.
   */
  function toBuild(root, fileName) {
    const blocks = []; // [x, y, z, state]
    let name = (fileName || 'Schematic').replace(/\.(litematic|schem|schematic|nbt)$/i, ''), author = '', kind = '';
    let dataVersion = root.MinecraftDataVersion || root.DataVersion || 0;
    if (root.Regions) {
      kind = 'Litematica';
      const m = root.Metadata || {}; if (m.Name) name = m.Name; author = m.Author || '';
      for (const r of Object.values(root.Regions)) {
        const pos = r.Position || { x: 0, y: 0, z: 0 }, sz = r.Size || { x: 0, y: 0, z: 0 };
        const sx = Math.abs(sz.x), sy = Math.abs(sz.y), sz2 = Math.abs(sz.z);
        const ox = pos.x + (sz.x < 0 ? sz.x + 1 : 0), oy = pos.y + (sz.y < 0 ? sz.y + 1 : 0), oz = pos.z + (sz.z < 0 ? sz.z + 1 : 0);
        const pal = (r.BlockStatePalette || []).map(stateStr);
        const words = (r.BlockStates && r.BlockStates.longs) || new Uint32Array(0);
        const bits = Math.max(2, Math.ceil(Math.log2(Math.max(1, pal.length)))), mask = (1 << bits) - 1, vol = sx * sy * sz2;
        for (let i = 0; i < vol; i++) {
          const bp = i * bits, w = bp >>> 5, b = bp & 31;
          let v = words[w] >>> b;
          if (b + bits > 32) v |= words[w + 1] << (32 - b);
          v &= mask;
          if (!v) continue;
          const x = i % sx, z = Math.floor(i / sx) % sz2, y = Math.floor(i / (sx * sz2));
          const st = pal[v]; if (st && !/(^|:)(air|cave_air|void_air)$/.test(st)) blocks.push([ox + x, oy + y, oz + z, st]);
        }
      }
    } else if (root.Schematic || root.Palette || root.BlockData) {
      kind = 'WorldEdit';
      const s = root.Schematic || root, W = s.Width, H = s.Height, L = s.Length;
      const B = s.Blocks || s; // v3 keeps them under Blocks
      const palObj = B.Palette || {}, data = B.Data || B.BlockData || new Uint8Array(0);
      const pal = []; for (const [k, v] of Object.entries(palObj)) pal[v] = k;
      if (s.Metadata && s.Metadata.Name) name = s.Metadata.Name;
      dataVersion = s.DataVersion || dataVersion;
      let p = 0;
      for (let i = 0; i < W * H * L && p < data.length; i++) {
        let v = 0, sh = 0, b; do { b = data[p++]; v |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80);
        const st = pal[v]; if (!st || /(^|:)(air|cave_air|void_air)(\[|$)/.test(st)) continue;
        blocks.push([i % W, Math.floor(i / (W * L)), Math.floor(i / W) % L, st]);
      }
    } else if (root.blocks && (root.palette || root.palettes)) {
      kind = 'Structure';
      const pal = (root.palette || root.palettes[0]).map(stateStr);
      for (const b of root.blocks) { const st = pal[b.state]; if (st && !/(^|:)(air|cave_air|void_air|structure_void)$/.test(st)) blocks.push([b.pos[0], b.pos[1], b.pos[2], st]); }
    } else throw new Error('That isn\'t a schematic Kyoto knows (.litematic, .schem or structure .nbt)');
    if (!blocks.length) throw new Error('The schematic is empty');
    if (blocks.length > 3000000) throw new Error('That schematic is too big to preview (over 3 million blocks)');
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const [x, y, z] of blocks) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z; }
    const palette = [{ s: 'minecraft:air', c: 0 }], idx = new Map([['minecraft:air', 0]]);
    const shape = window.KS_TEX ? KS_TEX.shape : () => null;
    const P = s => { let i = idx.get(s); if (i === undefined) { i = palette.length; idx.set(s, i); const e = { s, c: 0 }; const b = shape(s); if (b) e.b = b; if (/lantern|torch|glowstone|sea_lantern|shroomlight|froglight|lamp|fire|lava|beacon|end_rod|candle/.test(s)) e.l = 14; palette.push(e); } return i; };
    // build order: bottom layer first, then outward from the middle, like a person would build it
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    blocks.sort((a, b) => a[1] - b[1] || (Math.abs(a[0] - cx) + Math.abs(a[2] - cz)) - (Math.abs(b[0] - cx) + Math.abs(b[2] - cz)));
    const events = [], final = [];
    blocks.forEach(([x, y, z, st], i) => { const p = P(st); events.push([i * 300, x - x0, y - y0, z - z0, p]); final.push([x - x0, y - y0, z - z0, p]); });
    return { format: 'kybuild', version: 1, name, author: author || kind + ' schematic', mode: 'schematic', kind, mc: '', dataVersion: dataVersion || 4440, created: Date.now(),
      duration: blocks.length * 300, origin: [0, 0, 0], size: [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1], palette, start: [], events, final, player: [], stats: { placed: blocks.length, broken: 0 } };
  }
  async function importSchematic(bytes, fileName) { return toBuild(read(await gunzipMaybe(bytes)), fileName); }

  window.KS_NBT = { write, gzip, litematic, schem, parseState, read, gunzipMaybe, importSchematic, T, N };
})();
