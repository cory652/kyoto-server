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

  window.KS_NBT = { write, gzip, litematic, schem, parseState, T, N };
})();
