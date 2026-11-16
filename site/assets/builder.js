/* Kyoto Cosmetic Builder: build voxel or picture cosmetics on a Minecraft player, make capes, export .kycos.
 * Everything is drawn with plain WebGL (no libraries). Units are skin pixels: the player is 32 px tall,
 * feet at y=0, +y up, +z = the way the player faces, +x = the player's left. */
'use strict';
(() => {
  /* ===================================================== basics ===================================================== */
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HOOKS = window.KS_HOOKS || {}; // set by the Kyoto Studio app (studio-app.js) before this file loads
  const ASSET = HOOKS.assets ?? '';
  const API = HOOKS.server || (/onrender\.com$|localhost|127\.0\.0\.1|kyotoclient/.test(location.hostname) ? location.origin : 'https://kyoto-server.onrender.com');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function toast(t, s = '', k = '') {
    const el = document.createElement('div'); el.className = 'toast ' + k; el.innerHTML = `<b>${esc(t)}</b>${esc(s)}`;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 4200);
  }
  function modal(html) { $('#mbody').innerHTML = html; $('#modal').hidden = false; }
  const closeModal = () => { $('#modal').hidden = true; };
  $('#modal').onclick = e => { if (e.target.id === 'modal' || e.target.hasAttribute('data-close')) closeModal(); };
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = localStorage.getItem('kyoto.token');
    if (tok) headers.Authorization = 'Bearer ' + tok;
    const r = await fetch(API + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let d = {}; try { d = await r.json(); } catch (e) { /* */ }
    if (!r.ok) { const e = new Error(d.error || 'Error ' + r.status); e.status = r.status; throw e; }
    return d;
  }

  /* ===================================================== math ===================================================== */
  const M = {
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; },
    look(e, c, u) {
      let z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
    },
    mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
    trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; },
    scale(x, y, z) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; },
    rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
    ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
    rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
    inv(m) {
      const a = m, o = new Array(16);
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
      const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return null; d = 1 / d;
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
      return o;
    },
    xf(m, p) { const x = p[0], y = p[1], z = p[2], w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w]; }
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const hexRgb = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

  /* ===================================================== WebGL ===================================================== */
  const cv = $('#gl');
  const gl = cv.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) { document.body.innerHTML = '<p style="padding:40px">Your browser can\'t do WebGL, so the builder can\'t run here.</p>'; return; }
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `attribute vec3 p; attribute vec2 uv; attribute vec4 c; uniform mat4 mvp; uniform mat4 mdl; varying vec2 vu; varying vec4 vc; varying vec3 wp;
    void main(){ vu = uv; vc = c; wp = (mdl * vec4(p, 1.0)).xyz; gl_Position = mvp * vec4(p, 1.0); }`));
  // lighting preview: a sky tint + ambient, and an optional point light (torch / glow) that falls off with distance
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform sampler2D t; uniform float cut; uniform float lit; uniform vec3 tint; uniform vec4 pl; uniform vec3 plc; uniform vec3 fogc; uniform float fog;
    varying vec2 vu; varying vec4 vc; varying vec3 wp;
    void main(){ vec4 col = texture2D(t, vu) * vc; if (col.a < cut) discard;
      if (lit > 0.5) {
        float d = pl.w > 0.0 ? max(0.0, 1.0 - distance(wp, pl.xyz) / pl.w) : 0.0;
        vec3 l = tint + plc * d * d;
        col.rgb = col.rgb * l;
        col.rgb = mix(col.rgb, fogc, fog);
      }
      gl_FragColor = col; }`));
  gl.linkProgram(prog); gl.useProgram(prog);
  const L = { p: gl.getAttribLocation(prog, 'p'), uv: gl.getAttribLocation(prog, 'uv'), c: gl.getAttribLocation(prog, 'c'), mvp: gl.getUniformLocation(prog, 'mvp'), cut: gl.getUniformLocation(prog, 'cut'),
    mdl: gl.getUniformLocation(prog, 'mdl'), lit: gl.getUniformLocation(prog, 'lit'), tint: gl.getUniformLocation(prog, 'tint'), pl: gl.getUniformLocation(prog, 'pl'), plc: gl.getUniformLocation(prog, 'plc'), fogc: gl.getUniformLocation(prog, 'fogc'), fog: gl.getUniformLocation(prog, 'fog') };
  const ID4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  /** Lighting presets (Studio = flat, like the editor always looked). bg = background colour. */
  const LIGHTS = {
    studio: { name: 'Studio', tint: [1, 1, 1], bg: [.105, .105, .125], lit: 0 },
    noon: { name: 'Noon', tint: [1.06, 1.03, .96], bg: [.47, .65, .95], fogc: [.6, .75, 1], fog: .04, lit: 1 },
    sunset: { name: 'Sunset', tint: [1.08, .74, .55], bg: [.62, .33, .32], fogc: [.85, .45, .35], fog: .08, lit: 1 },
    night: { name: 'Night', tint: [.32, .37, .58], bg: [.025, .035, .08], fogc: [.02, .03, .07], fog: .1, lit: 1 },
    cave: { name: 'Cave + torch', tint: [.1, .1, .12], bg: [.015, .015, .02], torch: [1.25, .82, .45], radius: 30, lit: 1 },
    nether: { name: 'Nether', tint: [.95, .52, .42], bg: [.24, .05, .04], fogc: [.35, .07, .04], fog: .14, torch: [.9, .35, .1], radius: 40, lit: 1 },
    end: { name: 'The End', tint: [.78, .72, .95], bg: [.05, .035, .09], fogc: [.1, .05, .15], fog: .1, lit: 1 },
    glow: { name: 'Showcase', tint: [.55, .5, .7], bg: [.06, .05, .1], torch: [.9, .75, 1.2], radius: 34, lit: 1 }
  };
  let light = LIGHTS[localStorage.getItem('kyoto.studio.light')] ? localStorage.getItem('kyoto.studio.light') : 'studio';
  function setLight(k) { if (!LIGHTS[k]) return; light = k; try { localStorage.setItem('kyoto.studio.light', k); } catch (e) { /* */ } redraw(); }
  let lightOn = true; // lines/overlays turn it off while they draw
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function texFrom(src, smooth = false) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const f = smooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const white = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); return texFrom(c); })();

  /** Interleaved vertices: x y z u v r g b a */
  class Mesh {
    constructor() { this.a = []; this.buf = gl.createBuffer(); this.n = 0; this.dirty = true; }
    clear() { this.a.length = 0; this.dirty = true; return this; }
    v(x, y, z, u, v, r, g, b, al) { this.a.push(x, y, z, u, v, r, g, b, al); }
    quad(p, uv, c) { // p: 4 points, uv: 4 [u,v], c: [r,g,b,a]
      for (const i of [0, 1, 2, 0, 2, 3]) this.v(p[i][0], p[i][1], p[i][2], uv[i][0], uv[i][1], c[0], c[1], c[2], c[3]);
    }
    line(a, b, c) { this.v(a[0], a[1], a[2], 0, 0, ...c); this.v(b[0], b[1], b[2], 0, 0, ...c); }
    draw(mvp, tex, mode = this.mode || gl.TRIANGLES, cut = 0.02, mdl = null) {
      if (this.dirty) { gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.a), gl.DYNAMIC_DRAW); this.n = this.a.length / 9; this.dirty = false; }
      if (!this.n) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(L.p); gl.vertexAttribPointer(L.p, 3, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(L.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, 36, 12);
      gl.enableVertexAttribArray(L.c); gl.vertexAttribPointer(L.c, 4, gl.FLOAT, false, 36, 20);
      gl.uniformMatrix4fv(L.mvp, false, mvp); gl.uniform1f(L.cut, cut);
      gl.uniformMatrix4fv(L.mdl, false, mdl || ID4); gl.uniform1f(L.lit, mode === gl.TRIANGLES && lightOn && mdl ? LIGHTS[light].lit : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex || white);
      gl.drawArrays(mode, 0, this.n);
    }
  }

  /** A box with Minecraft "box UV" mapping. sizes in px, tex size tw x th. */
  function box(m, x0, y0, z0, x1, y1, z1, u, v, w, h, d, tw, th, inflate = 0, alpha = 1) {
    x0 -= inflate; y0 -= inflate; z0 -= inflate; x1 += inflate; y1 += inflate; z1 += inflate;
    const U = x => x / tw, V = y => y / th;
    const c = k => [k, k, k, alpha];
    // front (+z)
    m.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[U(u + d), V(v + d + h)], [U(u + d + w), V(v + d + h)], [U(u + d + w), V(v + d)], [U(u + d), V(v + d)]], c(.92));
    // back (-z)
    m.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [[U(u + 2 * d + w), V(v + d + h)], [U(u + 2 * d + 2 * w), V(v + d + h)], [U(u + 2 * d + 2 * w), V(v + d)], [U(u + 2 * d + w), V(v + d)]], c(.7));
    // right (-x)
    m.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[U(u), V(v + d + h)], [U(u + d), V(v + d + h)], [U(u + d), V(v + d)], [U(u), V(v + d)]], c(.8));
    // left (+x)
    m.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[U(u + d + w), V(v + d + h)], [U(u + 2 * d + w), V(v + d + h)], [U(u + 2 * d + w), V(v + d)], [U(u + d + w), V(v + d)]], c(.8));
    // top
    m.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[U(u + d), V(v + d)], [U(u + d + w), V(v + d)], [U(u + d + w), V(v)], [U(u + d), V(v)]], c(1));
    // bottom
    m.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[U(u + d + w), V(v)], [U(u + d + 2 * w), V(v)], [U(u + d + 2 * w), V(v + d)], [U(u + d + w), V(v + d)]], c(.55));
  }

  /* ===================================================== skin ===================================================== */
  const skin = document.createElement('canvas'); skin.width = skin.height = 64;
  const sg = skin.getContext('2d');
  let skinTex = null;
  function defaultSkin() {
    const i = new Image(); i.onload = () => loadSkinImage(i, false); i.onerror = () => drawnSkin(); i.src = ASSET + '/img/skins/steve.png';
  }
  function drawnSkin() {
    sg.clearRect(0, 0, 64, 64);
    const f = (c, x, y, w, h) => { sg.fillStyle = c; sg.fillRect(x, y, w, h); };
    // head
    f('#e8b796', 0, 8, 32, 8); f('#e8b796', 8, 0, 16, 8); f('#2b1d3a', 8, 0, 8, 8); f('#2b1d3a', 0, 8, 32, 2); f('#2b1d3a', 24, 8, 8, 8);
    f('#ffffff', 9, 12, 2, 1); f('#ffffff', 13, 12, 2, 1); f('#4a2f6b', 10, 12, 1, 1); f('#4a2f6b', 13, 12, 1, 1); f('#b9776a', 11, 14, 2, 1);
    // body (hoodie)
    f('#6b4cd6', 16, 16, 24, 16); f('#8f74ff', 20, 20, 8, 12); f('#ffffff', 23, 24, 2, 2);
    // arms
    f('#6b4cd6', 40, 16, 16, 16); f('#e8b796', 44, 28, 4, 4); f('#6b4cd6', 32, 48, 16, 16); f('#e8b796', 36, 60, 4, 4);
    // legs
    f('#2a2a35', 0, 16, 16, 16); f('#2a2a35', 16, 48, 16, 16); f('#ffffff', 4, 28, 4, 4); f('#ffffff', 20, 60, 4, 4);
    skinChanged();
  }
  function loadSkinImage(img, slim) {
    sg.clearRect(0, 0, 64, 64);
    if (img.height === 32) { // old 64x32 skin: copy right limbs to the left
      sg.drawImage(img, 0, 0);
      sg.drawImage(img, 0, 16, 16, 16, 16, 48, 16, 16);
      sg.drawImage(img, 40, 16, 16, 16, 32, 48, 16, 16);
    } else sg.drawImage(img, 0, 0, 64, 64);
    if (slim !== undefined) setArms(slim ? 'slim' : 'wide');
    skinChanged();
  }
  /* ---------- skin layers: the skin is made of stacked 64x64 layers (visible, opacity, blend, alpha lock) ---------- */
  let layerSeq = 1;
  function mkLayer(name, src) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (src) g.drawImage(src, 0, 0);
    return { id: layerSeq++, uid: Math.random().toString(36).slice(2, 10), name: name || 'Layer', c, g, vis: true, op: 1, blend: 'source-over', lock: false };
  }
  const SL = { list: [], active: 0 };
  let pg = null; // the layer you paint on
  function activeLayer() { return SL.list[SL.active] || SL.list[0]; }
  function useLayer(i) { SL.active = clamp(i, 0, SL.list.length - 1); pg = activeLayer().g; }
  function composite() {
    if (!SL.list.length) return;
    sg.save(); sg.clearRect(0, 0, 64, 64);
    for (const ly of SL.list) if (ly.vis && ly.op > 0) { sg.globalAlpha = ly.op; sg.globalCompositeOperation = ly.blend || 'source-over'; sg.drawImage(ly.c, 0, 0); }
    sg.restore();
  }
  /** A skin loaded from outside (file, name, default) becomes a single "Base" layer. */
  function resetLayers() { SL.list = [mkLayer('Base', skin)]; useLayer(0); }
  function layersJson() { return { active: SL.active, list: SL.list.map(l => ({ id: l.id, uid: l.uid, name: l.name, vis: l.vis, op: l.op, blend: l.blend, lock: l.lock, png: l.c.toDataURL('image/png') })) }; }
  function loadLayersJson(j) {
    return new Promise(res => {
      if (!j || !Array.isArray(j.list) || !j.list.length) return res(false);
      let left = j.list.length; const out = j.list.map(x => Object.assign(mkLayer(x.name), { uid: x.uid || Math.random().toString(36).slice(2, 10), vis: x.vis !== false, op: x.op == null ? 1 : x.op, blend: x.blend || 'source-over', lock: !!x.lock }));
      j.list.forEach((x, i) => { const im = new Image(); im.onload = im.onerror = () => { try { out[i].g.drawImage(im, 0, 0); } catch (e) { /* */ } if (--left === 0) { SL.list = out; useLayer(j.active || 0); composite(); skinChanged(true); res(true); } }; im.src = x.png; });
    });
  }
  function saveLayers() { try { if (SL.list.length > 1 || SL.list[0].op !== 1 || !SL.list[0].vis) localStorage.setItem('kyoto.studio.layers', JSON.stringify(layersJson())); else localStorage.removeItem('kyoto.studio.layers'); } catch (e) { /* too big */ } }
  function skinChanged(keepLayers) {
    if (keepLayers !== true) resetLayers();
    if (skinTex) gl.deleteTexture(skinTex);
    skinTex = texFrom(skin);
    const p = $('#skinPrev').getContext('2d'); p.clearRect(0, 0, 64, 64); p.drawImage(skin, 0, 0);
    try { localStorage.setItem('kyoto.builder.skin', skin.toDataURL()); } catch (e) { /* full */ }
    saveLayers();
    buildPlayer(); draw2d(); redraw();
    if (HOOKS.onLayers) HOOKS.onLayers();
  }

  /* ===================================================== the player ===================================================== */
  const PIVOT = { head: [0, 24, 0], body: [0, 24, 0], rarm: [-5, 22, 0], larm: [5, 22, 0], rleg: [-1.9, 12, 0], lleg: [1.9, 12, 0] };
  const PART_KEYS = ['head', 'body', 'rarm', 'larm', 'rleg', 'lleg'];
  const parts = {}; for (const k of PART_KEYS) parts[k] = { base: new Mesh(), over: new Mesh(), gBase: new Mesh(), gOver: new Mesh() };
  /** Each body part and its outer layer (hat, jacket, sleeves, pants) can be hidden on its own. */
  const partOn = { head: true, body: true, rarm: true, larm: true, rleg: true, lleg: true };
  const layerOn = { head: true, body: true, rarm: true, larm: true, rleg: true, lleg: true };
  let arms = 'wide';
  /** Box of a part (relative to its pivot), its UV origin and size, and the outer layer's UV origin + how much bigger it is. */
  function spec(k) {
    const aw = arms === 'slim' ? 3 : 4;
    return {
      head: { b: [-4, 0, -4, 4, 8, 4], uv: [0, 0], ov: [32, 0], s: [8, 8, 8], inf: .5 },
      body: { b: [-4, -12, -2, 4, 0, 2], uv: [16, 16], ov: [16, 32], s: [8, 12, 4], inf: .25 },
      rarm: { b: [-aw + 1, -10, -2, 1, 2, 2], uv: [40, 16], ov: [40, 32], s: [aw, 12, 4], inf: .25 },
      larm: { b: [-1, -10, -2, aw - 1, 2, 2], uv: [32, 48], ov: [48, 48], s: [aw, 12, 4], inf: .25 },
      rleg: { b: [-2.1, -12, -2, 1.9, 0, 2], uv: [0, 16], ov: [0, 32], s: [4, 12, 4], inf: .25 },
      lleg: { b: [-1.9, -12, -2, 2.1, 0, 2], uv: [16, 48], ov: [0, 48], s: [4, 12, 4], inf: .25 }
    }[k];
  }
  /** Pixel grid lines on every face of a box, so you can see each pixel you can paint. */
  function gridBox(m, b, s, inflate) {
    const [x0, y0, z0, x1, y1, z1] = [b[0] - inflate, b[1] - inflate, b[2] - inflate, b[3] + inflate, b[4] + inflate, b[5] + inflate];
    const [w, h, d] = s, e = .012, C = [0, 0, 0, .38];
    const lerp = (a, c, t) => a + (c - a) * t;
    for (let i = 0; i <= w; i++) { const x = lerp(x0, x1, i / w); m.line([x, y0, z1 + e], [x, y1, z1 + e], C); m.line([x, y0, z0 - e], [x, y1, z0 - e], C); m.line([x, y1 + e, z0], [x, y1 + e, z1], C); m.line([x, y0 - e, z0], [x, y0 - e, z1], C); }
    for (let j = 0; j <= h; j++) { const y = lerp(y0, y1, j / h); m.line([x0, y, z1 + e], [x1, y, z1 + e], C); m.line([x0, y, z0 - e], [x1, y, z0 - e], C); m.line([x0 - e, y, z0], [x0 - e, y, z1], C); m.line([x1 + e, y, z0], [x1 + e, y, z1], C); }
    for (let k = 0; k <= d; k++) { const z = lerp(z0, z1, k / d); m.line([x0 - e, y0, z], [x0 - e, y1, z], C); m.line([x1 + e, y0, z], [x1 + e, y1, z], C); m.line([x0, y1 + e, z], [x1, y1 + e, z], C); m.line([x0, y0 - e, z], [x1, y0 - e, z], C); }
  }
  function buildPlayer() {
    for (const k of PART_KEYS) {
      const p = parts[k], sp = spec(k), [w, h, d] = sp.s;
      for (const m of [p.base, p.over, p.gBase, p.gOver]) m.clear();
      box(p.base, ...sp.b, sp.uv[0], sp.uv[1], w, h, d, 64, 64);
      box(p.over, ...sp.b, sp.ov[0], sp.ov[1], w, h, d, 64, 64, sp.inf);
      gridBox(p.gBase, sp.b, sp.s, 0); gridBox(p.gOver, sp.b, sp.s, sp.inf);
    }
  }
  /** Solid boxes of the visible body in model space (rest pose) - you build onto these. */
  function bodySolids() {
    const out = [];
    for (const k of PART_KEYS) if (partOn[k]) { const b = spec(k).b, pv = PIVOT[k]; out.push([b[0] + pv[0], b[1] + pv[1], b[2] + pv[2], b[3] + pv[0], b[4] + pv[1], b[5] + pv[2]]); }
    return out;
  }

  /* ===================================================== the cosmetic ===================================================== */
  const SLOT_PIVOT = { head: PIVOT.head, back: PIVOT.body, arm: PIVOT.rarm, leg: PIVOT.rleg };
  const SLOT_DEF = {
    head: { n: [16, 16, 16], center: [0, 4, 0] }, back: { n: [24, 24, 8], center: [0, -6, -4] },
    arm: { n: [12, 16, 12], center: [-1, -4, 0] }, leg: { n: [12, 14, 12], center: [0, -6, 0] }
  };
  const SLOT_NAMES = { head: 'Head', back: 'Back', arm: 'Arm', leg: 'Leg' };
  const PALETTE0 = ['#ffffff', '#d9dce3', '#8a8f9a', '#2a2a33', '#ff8fc8', '#ff5d8f', '#c13c9c', '#a98bff', '#6b4cd6', '#7fd8ff', '#3aa8ff', '#6ee7b7', '#3ddc84', '#ffe14d', '#ffb347', '#ff6a3d'];
  const S = {
    name: 'My Cosmetic', slot: 'head', kind: 'voxel', mirror: false, n: [16, 16, 16], vs: 1, center: [0, 4, 0],
    vox: new Map(), // "x,y,z" -> "#rrggbb"
    color: '#ff8fc8', palette: PALETTE0.slice(),
    pic: null, picSize: [8, 8], picOff: [0, 4, -5], picRot: [0, 0, 0],
    tool: 'place', symX: false,
    anim: null,       // { len, loop, groups: [{ name, pivot:[x,y,z], mirror, ease, keys:[{ t, r:[x,y,z], p:[x,y,z], s }] }] }
    part: new Map()   // "x,y,z" -> moving part index (voxels not listed are part 0)
  };
  /* ---------- animation (keyframes): playback clock + pose maths (same maths as the mod) ---------- */
  const AN = { playing: false, t: 0, at: 0, tint: false, sel: 0 };
  const PART_COLS = ['#ff8fc8', '#6ee7b7', '#7cc4ff', '#ffd166', '#c39bff', '#ff9f6e', '#5eead4', '#f472b6'];
  function animNow() { if (!S.anim) return 0; const t = AN.playing ? AN.t + (performance.now() - AN.at) / 1000 : AN.t; return t; }
  const EASE = {
    linear: k => k, smooth: k => k * k * (3 - 2 * k), step: k => k < 1 ? 0 : 1,
    bounce: k => { const n = 7.5625, d = 2.75; let x = k; if (x < 1 / d) return n * x * x; if (x < 2 / d) { x -= 1.5 / d; return n * x * x + .75; } if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + .9375; } x -= 2.625 / d; return n * x * x + .984375; },
    elastic: k => k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - .75) * (2 * Math.PI / 3)) + 1
  };
  /** [rx, ry, rz (deg), px, py, pz, s] of a moving part at time t. */
  function partPose(g, t) {
    const k = g.keys, len = S.anim.len, loop = S.anim.loop !== false;
    const P = x => [...x.r, ...x.p, x.s];
    if (!k.length) return null;
    if (k.length === 1) return P(k[0]);
    t = loop ? ((t % len) + len) % len : Math.min(t, len);
    let a = null, b = null, ta = 0, tb = 0;
    for (let i = 0; i < k.length; i++) if (k[i].t > t) { b = k[i]; tb = b.t; if (i === 0) { if (!loop) return P(b); a = k[k.length - 1]; ta = a.t - len; } else { a = k[i - 1]; ta = a.t; } break; }
    if (!b) { a = k[k.length - 1]; ta = a.t; if (!loop) return P(a); b = k[0]; tb = b.t + len; }
    const f = tb - ta <= 1e-4 ? 1 : (EASE[g.ease] || EASE.smooth)(clamp((t - ta) / (tb - ta), 0, 1));
    const A = P(a), B = P(b); return A.map((v, i) => v + (B[i] - v) * f);
  }
  /** Matrix that moves a part (in slot space): pivot, scale, Z, X, Y, back, then offset. flip = left half of a mirrored part. */
  function partMatrix(g, pose, flip) {
    if (!pose) return M.trans(0, 0, 0);
    const d = Math.PI / 180, [rx, ry0, rz0, px0, py, pz, sc] = pose;
    const ry = flip ? -ry0 : ry0, rz = flip ? -rz0 : rz0, px = flip ? -px0 : px0, pv = g.pivot;
    return M.mul(M.trans(pv[0] + px, pv[1] + py, pv[2] + pz), M.mul(M.ry(ry * d), M.mul(M.rx(rx * d), M.mul(M.rz(rz * d), M.mul(M.scale(sc, sc, sc), M.trans(-pv[0], -pv[1], -pv[2]))))));
  }
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const voxMesh = new Mesh(), lines = new Mesh(), floor = new Mesh(), ghost = new Mesh(), picMesh = new Mesh(), capeMesh = new Mesh();
  let picTex = null, capeTexGL = null, capeFrames = 1;

  function gridMin() { return [S.center[0] - S.n[0] / 2 * S.vs, S.center[1] - S.n[1] / 2 * S.vs, S.center[2] - S.n[2] / 2 * S.vs]; }

  const partMeshes = []; // [part][0 right/whole, 1 left half of a mirrored part]
  const partOf = k => { const p = S.part.get(k) || 0; return S.anim && p < S.anim.groups.length ? p : 0; };
  function buildVox() {
    voxMesh.clear();
    const animated = !!(S.anim && S.anim.groups.length);
    const ng = animated ? S.anim.groups.length : 0;
    while (partMeshes.length < ng) partMeshes.push([new Mesh(), new Mesh()]);
    for (const pm of partMeshes) { pm[0].clear(); pm[1].clear(); }
    const g = gridMin(), vs = S.vs;
    const F = [[1, 0, 0, .8], [-1, 0, 0, .8], [0, 1, 0, 1], [0, -1, 0, .55], [0, 0, 1, .9], [0, 0, -1, .7]];
    for (const [k, col0] of S.vox) {
      const [x, y, z] = k.split(',').map(Number);
      const gi = animated ? partOf(k) : 0;
      let col = col0;
      if (animated && AN.tint) { const [a1, a2, a3] = hexRgb(col0), [b1, b2, b3] = hexRgb(PART_COLS[gi % 8]); col = rgbHex((a1 * .35 + b1 * .65) * 255, (a2 * .35 + b2 * .65) * 255, (a3 * .35 + b3 * .65) * 255); }
      const [r, gg, b] = hexRgb(col);
      const x0 = g[0] + x * vs, y0 = g[1] + y * vs, z0 = g[2] + z * vs, x1 = x0 + vs, y1 = y0 + vs, z1 = z0 + vs;
      let tm = voxMesh;
      if (animated) { const gr = S.anim.groups[gi]; tm = partMeshes[gi][gr.mirror && x0 + vs / 2 < gr.pivot[0] ? 1 : 0]; }
      for (const [dx, dy, dz, l] of F) {
        const nk = key(x + dx, y + dy, z + dz);
        if (S.vox.has(nk) && (!animated || partOf(nk) === gi)) continue;
        const c = [r * l, gg * l, b * l, 1], uv = [[0, 0], [0, 0], [0, 0], [0, 0]];
        if (dx === 1) tm.quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], uv, c);
        if (dx === -1) tm.quad([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], uv, c);
        if (dy === 1) tm.quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], uv, c);
        if (dy === -1) tm.quad([[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], uv, c);
        if (dz === 1) tm.quad([[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], uv, c);
        if (dz === -1) tm.quad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], uv, c);
      }
    }
    $('#stVox').textContent = S.vox.size.toLocaleString();
    $('#stSize').textContent = Math.max(1, Math.round(JSON.stringify(exportData()).length / 1024)) + ' KB';
  }
  function buildLines() {
    lines.clear();
    if (S.kind !== 'voxel') return;
    const g = gridMin(), e = add(g, [S.n[0] * S.vs, S.n[1] * S.vs, S.n[2] * S.vs]);
    const C = [1, .56, .78, .7];
    const c = [[g[0], g[1], g[2]], [e[0], g[1], g[2]], [e[0], e[1], g[2]], [g[0], e[1], g[2]], [g[0], g[1], e[2]], [e[0], g[1], e[2]], [e[0], e[1], e[2]], [g[0], e[1], e[2]]];
    for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) lines.line(c[a], c[b], C);
    // light grid on the bottom of the build space
    const G = [1, 1, 1, .08];
    for (let i = 1; i < S.n[0]; i++) lines.line([g[0] + i * S.vs, g[1], g[2]], [g[0] + i * S.vs, g[1], e[2]], G);
    for (let k = 1; k < S.n[2]; k++) lines.line([g[0], g[1], g[2] + k * S.vs], [e[0], g[1], g[2] + k * S.vs], G);
  }
  (function buildFloor() {
    const C = [1, 1, 1, .07], A = [1, 1, 1, .16];
    for (let i = -24; i <= 24; i += 2) { floor.line([i, 0, -24], [i, 0, 24], i === 0 ? A : C); floor.line([-24, 0, i], [24, 0, i], i === 0 ? A : C); }
  })();
  function buildPic() {
    picMesh.clear();
    if (S.kind !== 'texture' || !S.pic) return;
    const [w, h] = S.picSize, c = [1, 1, 1, 1];
    picMesh.quad([[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]], [[0, 1], [1, 1], [1, 0], [0, 0]], c);
    picMesh.quad([[w / 2, -h / 2, 0], [-w / 2, -h / 2, 0], [-w / 2, h / 2, 0], [w / 2, h / 2, 0]], [[1, 1], [0, 1], [0, 0], [1, 0]], c);
  }
  function picMatrix() {
    const r = S.picRot.map(a => a * Math.PI / 180);
    // same order as the mod: Z, then X, then Y, then move
    return M.mul(M.trans(...S.picOff), M.mul(M.ry(r[1]), M.mul(M.rx(r[0]), M.rz(r[2]))));
  }

  /* ===================================================== camera + drawing ===================================================== */
  const cam = { yaw: .7, pitch: .32, dist: 44, target: [0, 17, 0] };
  let VP = null, needs = true, anim = false, t0 = performance.now();
  const redraw = () => { needs = true; };
  function camPos() { return add(cam.target, [Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, Math.sin(cam.pitch) * cam.dist, Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist]); }
  function slotWorldCenter() { return add(SLOT_PIVOT[S.slot], S.kind === 'voxel' ? S.center : S.picOff); }
  function frameView() { cam.target = slotWorldCenter(); cam.dist = Math.max(22, Math.max(...S.n) * S.vs * 2.2); redraw(); }

  function boneAngle(part, t) {
    if (!anim) return 0;
    const ph = t * 6, sp = .7;
    return { rarm: Math.cos(ph + Math.PI) * sp, larm: Math.cos(ph) * sp, rleg: Math.cos(ph) * 1.4 * sp * .8, lleg: Math.cos(ph + Math.PI) * 1.4 * sp * .8 }[part] || 0;
  }
  function slotMatrix(left, t) {
    const part = { head: 'head', back: 'body', arm: left ? 'larm' : 'rarm', leg: left ? 'lleg' : 'rleg' }[S.slot];
    const pv = PIVOT[part];
    let m = M.mul(M.trans(...pv), M.rx(boneAngle(part, t)));
    if (left) m = M.mul(m, M.scale(-1, 1, 1));
    return m;
  }
  function resize() {
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * d), h = Math.round(r.height * d);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; redraw(); }
  }
  function frame(now, once) {
    resize();
    if (needs || anim || (AN.playing && S.anim) || (LIGHTS[light].torch)) {
      needs = false;
      const t = (now - t0) / 1000;
      gl.viewport(0, 0, cv.width, cv.height);
      const LT = LIGHTS[light], bg = LT.bg;
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform3fv(L.tint, LT.tint); gl.uniform3fv(L.fogc, LT.fogc || [0, 0, 0]); gl.uniform1f(L.fog, LT.fog || 0);
      if (LT.torch) { // the torch floats beside the camera, a bit up and to the left, so the side you look at is lit
        const cp = camPos(), f = norm(sub(cam.target, cp)), r = norm(cross(f, [0, 1, 0]));
        const tp = add(cam.target, add(f.map(v => -v * 14), add(r.map(v => -v * 9), [0, 7 + Math.sin(t * 9) * .25 + Math.sin(t * 23) * .12, 0])));
        gl.uniform4f(L.pl, tp[0], tp[1], tp[2], LT.radius * (1 + Math.sin(t * 13) * .02)); gl.uniform3fv(L.plc, LT.torch);
      } else { gl.uniform4f(L.pl, 0, 0, 0, 0); gl.uniform3fv(L.plc, [0, 0, 0]); }
      const P = M.persp(.75, cv.width / Math.max(1, cv.height), .5, 600);
      const V = M.look(camPos(), cam.target, [0, 1, 0]);
      VP = M.mul(P, V);
      if ($('#showGrid').checked) floor.draw(VP, null, gl.LINES);
      // player
      const skinMode = MODE === 'skin', grid = $('#showGrid').checked;
      for (const k of PART_KEYS) {
        const mw = M.mul(M.trans(...PIVOT[k]), M.rx(boneAngle(k, t))), m = M.mul(VP, mw);
        if (partOn[k]) {
          parts[k].base.draw(m, skinTex, gl.TRIANGLES, skinMode ? .02 : .5, mw);
          if (skinMode && grid && paintLayer === 'base') { gl.depthMask(false); parts[k].gBase.draw(m, null, gl.LINES); gl.depthMask(true); }
        }
        if (layerOn[k]) {
          parts[k].over.draw(m, skinTex, gl.TRIANGLES, .5, mw);
          if (skinMode && grid && paintLayer === 'outer') { gl.depthMask(false); parts[k].gOver.draw(m, null, gl.LINES); gl.depthMask(true); }
        }
      }
      if (skinMode && paintHover) { gl.disable(gl.DEPTH_TEST); paintHoverMesh.draw(VP, null); gl.enable(gl.DEPTH_TEST); }
      // cape preview
      if (capeTexGL && (capeShown || paneNow === 'cape')) {
        const fi = capeFrames > 1 ? Math.floor(t * 10) % capeFrames : 0;
        buildCape(fi);
        const cw = M.mul(M.trans(...PIVOT.body), M.rx(anim ? .15 + Math.sin(t * 6) * .05 : .1));
        capeMesh.draw(M.mul(VP, cw), capeTexGL, gl.TRIANGLES, .5, cw);
      }
      // the cosmetic (+ its mirror)
      if (MODE !== 'skin') for (const left of S.mirror && S.slot !== 'head' && S.slot !== 'back' ? [false, true] : [false]) {
        const sw = slotMatrix(left, t), sm = M.mul(VP, sw);
        const animated = S.anim && S.anim.groups.length, at = animated ? animNow() : 0;
        if (S.kind === 'voxel') {
          if (!animated) voxMesh.draw(sm, null, gl.TRIANGLES, .02, sw);
          else S.anim.groups.forEach((g, gi) => {
            if (!partMeshes[gi]) return;
            const pose = partPose(g, at);
            for (const side of [0, 1]) { const w = M.mul(sw, partMatrix(g, pose, side === 1)); partMeshes[gi][side].draw(M.mul(VP, w), null, gl.TRIANGLES, .02, w); }
          });
        } else if (picTex) {
          const w = M.mul(sw, M.mul(animated ? partMatrix(S.anim.groups[0], partPose(S.anim.groups[0], at), false) : M.trans(0, 0, 0), picMatrix()));
          picMesh.draw(M.mul(VP, w), picTex, gl.TRIANGLES, .1, w);
        }
      }
      if (HOOKS.overlay) { lightOn = false; try { HOOKS.overlay(VP, t); } catch (e) { /* */ } lightOn = true; }
      // build space + hover
      if ($('#showGrid').checked && MODE !== 'skin') {
        gl.depthMask(false);
        lines.draw(M.mul(VP, slotMatrix(false, t)), null, gl.LINES);
        if (!anim && hover) ghost.draw(M.mul(VP, slotMatrix(false, 0)), null);
        gl.depthMask(true);
      }
    }
    if (!once) requestAnimationFrame(frame);
  }

  /* ===================================================== picking ===================================================== */
  let hover = null; // { cell:[x,y,z], kind:'place'|'hit' }
  function ray(mx, my) {
    const r = cv.getBoundingClientRect();
    const nx = (mx - r.left) / r.width * 2 - 1, ny = 1 - (my - r.top) / r.height * 2;
    const inv = M.inv(VP); if (!inv) return null;
    const a = M.xf(inv, [nx, ny, -1]), b = M.xf(inv, [nx, ny, 1]);
    return { o: a, d: norm(sub(b, a)) };
  }
  /** Walks the ray through the build space. Returns { hit: [x,y,z] filled voxel, prev: empty cell before it, body: true if it hit the player }. */
  function cast(mx, my) {
    if (!VP) return null;
    const R = ray(mx, my); if (!R) return null;
    const pv = SLOT_PIVOT[S.slot], g = add(pv, gridMin()), vs = S.vs, n = S.n;
    // ray in grid units
    const o = [(R.o[0] - g[0]) / vs, (R.o[1] - g[1]) / vs, (R.o[2] - g[2]) / vs], d = R.d;
    // enter the box [0, n]
    let tmin = 0, tmax = 1e9;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < 0 || o[i] > n[i]) return null; continue; }
      let t1 = (0 - o[i]) / d[i], t2 = (n[i] - o[i]) / d[i]; if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if (tmin > tmax) return null;
    const p = [o[0] + d[0] * (tmin + 1e-4), o[1] + d[1] * (tmin + 1e-4), o[2] + d[2] * (tmin + 1e-4)];
    let c = p.map((v, i) => clamp(Math.floor(v), 0, n[i] - 1));
    const step = d.map(v => v > 0 ? 1 : -1);
    const tD = d.map(v => Math.abs(1 / (v || 1e-9)));
    const tM = c.map((cc, i) => d[i] > 0 ? (cc + 1 - p[i]) / d[i] : (p[i] - cc) / (-d[i] || 1e-9));
    const solids = bodySolids();
    const solidAt = (x, y, z) => { // cell centre inside the body?
      const w = [g[0] + (x + .5) * vs, g[1] + (y + .5) * vs, g[2] + (z + .5) * vs];
      return solids.some(s => w[0] > s[0] && w[0] < s[3] && w[1] > s[1] && w[1] < s[4] && w[2] > s[2] && w[2] < s[5]);
    };
    let prev = null, last = null;
    for (let i = 0; i < 400; i++) {
      if (c.some((v, k) => v < 0 || v >= n[k])) break;
      if (S.vox.has(key(...c))) return { hit: c.slice(), prev };
      if (solidAt(...c)) return { body: true, prev };
      prev = c.slice(); last = c.slice();
      const ax = tM[0] < tM[1] ? (tM[0] < tM[2] ? 0 : 2) : (tM[1] < tM[2] ? 1 : 2);
      c[ax] += step[ax]; tM[ax] += tD[ax];
    }
    return { wall: last, prev: last };
  }
  function updateHover(e) {
    if (S.kind !== 'voxel') { hover = null; ghost.clear(); return; }
    const r = cast(e.clientX, e.clientY);
    let cell = null, mode = S.tool;
    if (r) {
      if (mode === 'place') cell = r.prev;
      else cell = r.hit || null;
    }
    hover = cell ? { cell } : null;
    ghost.clear();
    if (hover) {
      const g = gridMin(), [x, y, z] = cell, vs = S.vs, k = .02;
      const col = mode === 'erase' ? [1, .35, .4, .45] : mode === 'place' ? [...hexRgb(S.color), .45] : mode === 'group' ? [...hexRgb(PART_COLS[AN.sel % 8]), .55] : [1, 1, 1, .35];
      box(ghost, g[0] + x * vs - k, g[1] + y * vs - k, g[2] + z * vs - k, g[0] + (x + 1) * vs + k, g[1] + (y + 1) * vs + k, g[2] + (z + 1) * vs + k, 0, 0, 0, 0, 0, 1, 1, 0, 1);
      for (let i = 5; i < ghost.a.length; i += 9) { ghost.a[i] = col[0]; ghost.a[i + 1] = col[1]; ghost.a[i + 2] = col[2]; ghost.a[i + 3] = col[3]; }
      $('#stHover').textContent = `x ${x}  y ${y}  z ${z}`;
    } else $('#stHover').textContent = '—';
    redraw();
  }

  /* ===================================================== editing ===================================================== */
  const undo = [], redo = [];
  const snap = () => JSON.stringify({ v: [...S.vox], p: [...S.part] });
  function pushUndo() { undo.push(snap()); if (undo.length > 80) undo.shift(); redo.length = 0; }
  function restore(s) { const j = JSON.parse(s); if (Array.isArray(j)) S.vox = new Map(j); else { S.vox = new Map(j.v); S.part = new Map(j.p || []); } changed(); }
  function changed() { buildVox(); save(); redraw(); }
  const mirrorCell = c => [S.n[0] - 1 - c[0], c[1], c[2]];
  function setCell(c, v) {
    const cells = [c]; if (S.symX) cells.push(mirrorCell(c));
    for (const cc of cells) {
      if (cc.some((x, i) => x < 0 || x >= S.n[i])) continue;
      const k = key(...cc);
      if (v) { if (!S.vox.has(k) && S.anim && AN.sel) S.part.set(k, AN.sel); S.vox.set(k, v); } else { S.vox.delete(k); S.part.delete(k); }
    }
  }
  function setPart(c) { const cells = [c]; if (S.symX) cells.push(mirrorCell(c)); for (const cc of cells) { const k = key(...cc); if (S.vox.has(k)) { if (AN.sel) S.part.set(k, AN.sel); else S.part.delete(k); } } }
  function shadeVox(c, darker) {
    const cells = [c]; if (S.symX) cells.push(mirrorCell(c));
    for (const cc of cells) { const k = key(...cc); if (!S.vox.has(k) || strokeSeen.has(k)) continue; strokeSeen.add(k); const [r, g, b] = hexRgb(S.vox.get(k)).map(v => v * 255); S.vox.set(k, rgbHex(...shadeRgb(r, g, b, darker))); }
  }
  function applyTool(e, first) {
    const r = cast(e.clientX, e.clientY); if (!r) return;
    if (S.tool === 'place') { if (first && r.prev) { if (S.vox.size >= 12000) return toast('That\'s the limit', '12,000 voxels max'); setCell(r.prev, S.color); changed(); } }
    else if (S.tool === 'erase') { if (r.hit) { setCell(r.hit, null); changed(); } }
    else if (S.tool === 'paint') { if (r.hit) { setCell(r.hit, S.color); changed(); } }
    else if (S.tool === 'pick') { if (r.hit) { setColor(S.vox.get(key(...r.hit))); setTool('place'); } }
    else if (S.tool === 'shade') { if (first) strokeSeen = new Set(); if (r.hit) { shadeVox(r.hit, (shadeOpt.mode === 'darken') !== e.shiftKey); changed(); } }
    else if (S.tool === 'group') { if (r.hit && S.anim) { setPart(r.hit); changed(); } }
    else if (S.tool === 'pivot') { if (first && (r.hit || r.prev) && HOOKS.pickPivot) { const c = r.hit || r.prev, g = gridMin(); HOOKS.pickPivot([g[0] + (c[0] + .5) * S.vs, g[1] + (c[1] + .5) * S.vs, g[2] + (c[2] + .5) * S.vs]); } }
    else if (S.tool === 'fill' && first && r.hit) {
      const from = S.vox.get(key(...r.hit)); if (from === S.color) return;
      const q = [r.hit], seen = new Set();
      while (q.length) {
        const c = q.pop(), k = key(...c); if (seen.has(k) || S.vox.get(k) !== from) continue; seen.add(k); S.vox.set(k, S.color);
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) q.push([c[0] + dx, c[1] + dy, c[2] + dz]);
      }
      changed();
    }
  }

  /* ===================================================== skin painting (Kyoto Studio) ===================================================== */
  let MODE = localStorage.getItem('kyoto.studio.mode') || 'skin';
  let paintLayer = 'base', brush = 1, mirrorPaint = false, paintHover = null;
  const paintHoverMesh = new Mesh();
  const skinUndo = [], skinRedo = [];
  function updateSkinTex() {
    composite();
    gl.bindTexture(gl.TEXTURE_2D, skinTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skin);
    draw2d(); redraw();
    clearTimeout(updateSkinTex.t); updateSkinTex.t = setTimeout(() => { try { localStorage.setItem('kyoto.builder.skin', skin.toDataURL()); } catch (e) { /* */ } const p = $('#skinPrev').getContext('2d'); p.clearRect(0, 0, 64, 64); p.drawImage(skin, 0, 0); saveLayers(); if (HOOKS.onLayers) HOOKS.onLayers(); }, 300);
  }
  const skinSnap = () => ({ active: SL.active, list: SL.list.map(l => ({ l, name: l.name, vis: l.vis, op: l.op, blend: l.blend, lock: l.lock, img: l.g.getImageData(0, 0, 64, 64) })) });
  function skinRestore(sn) {
    SL.list = sn.list.map(x => { Object.assign(x.l, { name: x.name, vis: x.vis, op: x.op, blend: x.blend, lock: x.lock }); x.l.g.putImageData(x.img, 0, 0); return x.l; });
    useLayer(sn.active); updateSkinTex();
  }
  function pushSkinUndo() { skinUndo.push(skinSnap()); if (skinUndo.length > 100) skinUndo.shift(); skinRedo.length = 0; }
  // faces: 0 +z front, 1 -z back, 2 -x right, 3 +x left, 4 +y top, 5 -y bottom
  function faceRect(sp, uv, f) {
    const [u, v] = uv, [w, h, d] = sp.s;
    return [[u + d, v + d, w, h], [u + 2 * d + w, v + d, w, h], [u, v + d, d, h], [u + d + w, v + d, d, h], [u + d, v, w, d], [u + d + w, v, w, d]][f];
  }
  /** Which skin pixel is at a point on a face of a part. */
  function facePixel(k, layer, P, f) {
    const sp = spec(k), pv = PIVOT[k], inf = layer === 'outer' ? sp.inf : 0;
    const [x0, y0, z0, x1, y1, z1] = [sp.b[0] + pv[0] - inf, sp.b[1] + pv[1] - inf, sp.b[2] + pv[2] - inf, sp.b[3] + pv[0] + inf, sp.b[4] + pv[1] + inf, sp.b[5] + pv[2] + inf];
    const [w, h, d] = sp.s, [rx, ry] = faceRect(sp, layer === 'outer' ? sp.ov : sp.uv, f);
    const fx = (P[0] - x0) / (x1 - x0), fy = (y1 - P[1]) / (y1 - y0), fz = (P[2] - z0) / (z1 - z0);
    const cl = (t, n) => clamp(Math.floor(t * n), 0, n - 1);
    switch (f) {
      case 0: return [rx + cl(fx, w), ry + cl(fy, h)];
      case 1: return [rx + cl(1 - fx, w), ry + cl(fy, h)];
      case 2: return [rx + cl(fz, d), ry + cl(fy, h)];
      case 3: return [rx + cl(1 - fz, d), ry + cl(fy, h)];
      case 4: return [rx + cl(fx, w), ry + cl(fz, d)];
      default: return [rx + cl(fx, w), ry + cl(fz, d)];
    }
  }
  /** Casts the mouse ray at the visible parts of the layer you're painting. */
  function pickPixel(mx, my, layerOverride) {
    if (!VP) return null;
    const R = ray(mx, my); if (!R) return null;
    const layer = layerOverride || paintLayer;
    let best = null;
    for (const k of PART_KEYS) {
      if (layer === 'base' ? !partOn[k] : !layerOn[k]) continue;
      const hit = hitBox(R, k, layer);
      if (hit && (!best || hit.t < best.t)) best = Object.assign(hit, { k, layer });
    }
    if (!best) return null;
    best.px = facePixel(best.k, layer, best.P, best.f);
    return best;
  }
  function boxAbs(k, layer) {
    const sp = spec(k), pv = PIVOT[k], inf = layer === 'outer' ? sp.inf : 0;
    return [sp.b[0] + pv[0] - inf, sp.b[1] + pv[1] - inf, sp.b[2] + pv[2] - inf, sp.b[3] + pv[0] + inf, sp.b[4] + pv[1] + inf, sp.b[5] + pv[2] + inf];
  }
  function hitBox(R, k, layer) {
    const b = boxAbs(k, layer); let tmin = -1e9, tmax = 1e9, ax = -1, sgn = 0;
    for (let i = 0; i < 3; i++) {
      const lo = b[i], hi = b[i + 3];
      if (Math.abs(R.d[i]) < 1e-9) { if (R.o[i] < lo || R.o[i] > hi) return null; continue; }
      let t1 = (lo - R.o[i]) / R.d[i], t2 = (hi - R.o[i]) / R.d[i], s1 = -1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; s1 = 1; }
      if (t1 > tmin) { tmin = t1; ax = i; sgn = s1; }
      tmax = Math.min(tmax, t2);
    }
    if (tmin > tmax || tmax < 0 || ax < 0) return null;
    const P = [R.o[0] + R.d[0] * tmin, R.o[1] + R.d[1] * tmin, R.o[2] + R.d[2] * tmin];
    const f = ax === 2 ? (sgn > 0 ? 0 : 1) : ax === 0 ? (sgn > 0 ? 3 : 2) : (sgn > 0 ? 4 : 5);
    return { t: tmin, P, f };
  }
  /** The same spot on the other side of the body (for mirror painting). */
  function mirrorHit(hit) {
    const P = [-hit.P[0], hit.P[1], hit.P[2]];
    const f = hit.f === 2 ? 3 : hit.f === 3 ? 2 : hit.f;
    for (const k of PART_KEYS) {
      const b = boxAbs(k, hit.layer), e = .02;
      if (P[0] >= b[0] - e && P[0] <= b[3] + e && P[1] >= b[1] - e && P[1] <= b[4] + e && P[2] >= b[2] - e && P[2] <= b[5] + e) return { k, layer: hit.layer, f, P, px: facePixel(k, hit.layer, P, f) };
    }
    return null;
  }
  const rgba = hex => { const [r, g, b] = hexRgb(hex); return [r * 255 | 0, g * 255 | 0, b * 255 | 0, 255]; };
  function setPx(x, y, c, g = pg) {
    if (activeLayer().lock && g === pg && pg.getImageData(x, y, 1, 1).data[3] === 0) return; // alpha lock: only paint where there's already paint
    const id = g.createImageData(1, 1); id.data.set(c); g.putImageData(id, x, y);
  }
  function getPx(x, y, g = pg) { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }
  /* ---------- shading brush: darkens / lightens what's there, shifting the hue like pixel artists do ---------- */
  const shadeOpt = { mode: 'darken', strength: 2, hue: true, dither: false };
  let strokeSeen = new Set();
  function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
  function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; if (!s) return [l * 255, l * 255, l * 255]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
  function shadeRgb(r, g, b, darker) {
    const k = [0, .06, .11, .17, .24][shadeOpt.strength] || .11;
    let [h, s, l] = rgb2hsl(r, g, b);
    if (shadeOpt.hue && s > .04) { const to = darker ? 250 : 55, d = ((to - h + 540) % 360) - 180; h += Math.sign(d) * Math.min(Math.abs(d), 5 * shadeOpt.strength); s = clamp(s + (darker ? .02 : -.02), 0, 1); }
    l = clamp(l + (darker ? -k : k), 0, 1);
    return hsl2rgb(h, s, l).map(v => clamp(Math.round(v), 0, 255));
  }
  function shadePixel(X, Y, darker) {
    const id = X + ',' + Y; if (strokeSeen.has(id)) return; strokeSeen.add(id);
    if (shadeOpt.dither && (X + Y) % 2) return;
    let c = getPx(X, Y);
    if (c[3] === 0) { if (activeLayer().lock) return; c = getPx(X, Y, sg); if (c[3] === 0) return; } // empty layer: shade what you see (great on a "Shading" layer)
    const [r, g, b] = shadeRgb(c[0], c[1], c[2], darker);
    const id2 = pg.createImageData(1, 1); id2.data.set([r, g, b, Math.max(c[3], 255 * (c[3] > 0))]); pg.putImageData(id2, X, Y);
  }
  /** Applies the current skin tool at a pixel, clipped to the face it's on so brushes never bleed onto other parts. */
  function paintPixel(hit, first) {
    const sp = spec(hit.k), [rx, ry, rw, rh] = faceRect(sp, hit.layer === 'outer' ? sp.ov : sp.uv, hit.f), [x, y] = hit.px;
    const tool = S.tool;
    if (tool === 'pick') { const c = getPx(x, y, sg); if (c[3] > 0) { setColor(rgbHex(c[0], c[1], c[2])); setTool('place'); } return; }
    if (tool === 'fill') {
      if (!first) return;
      const from = getPx(x, y).join(','), to = tool === 'fill' ? rgba(S.color) : [0, 0, 0, 0];
      if (from === to.join(',')) return;
      const img = pg.getImageData(0, 0, 64, 64), st = [[x, y]], seen = new Set(), lock = activeLayer().lock;
      while (st.length) {
        const [cx, cy] = st.pop(), k = cx + ',' + cy;
        if (seen.has(k) || cx < rx || cy < ry || cx >= rx + rw || cy >= ry + rh) continue; seen.add(k);
        const i = (cy * 64 + cx) * 4; if ([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]].join(',') !== from) continue;
        if (!(lock && img.data[i + 3] === 0)) img.data.set(to, i);
        st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      pg.putImageData(img, 0, 0); return;
    }
    const c = tool === 'erase' ? [0, 0, 0, 0] : rgba(S.color);
    const r = brush - 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy; if (X < rx || Y < ry || X >= rx + rw || Y >= ry + rh) continue;
      if (tool === 'shade') shadePixel(X, Y, (shadeOpt.mode === 'darken') !== !!hit.invert);
      else if (c[3] === 0) pg.clearRect(X, Y, 1, 1); else setPx(X, Y, c);
    }
  }
  function paint3d(e, first) {
    if (first) strokeSeen = new Set();
    const hit = pickPixel(e.clientX, e.clientY); if (!hit) return;
    hit.invert = e.shiftKey;
    paintPixel(hit, first);
    if (mirrorPaint) { const m = mirrorHit(hit); if (m && !(m.k === hit.k && m.px[0] === hit.px[0] && m.px[1] === hit.px[1])) paintPixel(m, first); }
    updateSkinTex();
  }
  function updatePaintHover(e) {
    paintHoverMesh.clear(); paintHover = null;
    const hit = pickPixel(e.clientX, e.clientY);
    if (hit) {
      paintHover = hit;
      // outline the pixel square on that face
      const sp = spec(hit.k), b = boxAbs(hit.k, hit.layer), [w, h, d] = sp.s;
      const sx = (b[3] - b[0]) / w, sy = (b[4] - b[1]) / h, sz = (b[5] - b[2]) / d;
      const [x, y] = hit.px, [rx, ry] = faceRect(sp, hit.layer === 'outer' ? sp.ov : sp.uv, hit.f);
      const i = x - rx, j = y - ry, e2 = .03, C = MODE === 'skin' && S.tool === 'erase' ? [1, .4, .45, .9] : [...hexRgb(S.color), .95];
      let q;
      switch (hit.f) {
        case 0: q = [[b[0] + i * sx, b[4] - (j + 1) * sy, b[5] + e2], [b[0] + (i + 1) * sx, b[4] - (j + 1) * sy, b[5] + e2], [b[0] + (i + 1) * sx, b[4] - j * sy, b[5] + e2], [b[0] + i * sx, b[4] - j * sy, b[5] + e2]]; break;
        case 1: q = [[b[3] - i * sx, b[4] - (j + 1) * sy, b[2] - e2], [b[3] - (i + 1) * sx, b[4] - (j + 1) * sy, b[2] - e2], [b[3] - (i + 1) * sx, b[4] - j * sy, b[2] - e2], [b[3] - i * sx, b[4] - j * sy, b[2] - e2]]; break;
        case 2: q = [[b[0] - e2, b[4] - (j + 1) * sy, b[2] + i * sz], [b[0] - e2, b[4] - (j + 1) * sy, b[2] + (i + 1) * sz], [b[0] - e2, b[4] - j * sy, b[2] + (i + 1) * sz], [b[0] - e2, b[4] - j * sy, b[2] + i * sz]]; break;
        case 3: q = [[b[3] + e2, b[4] - (j + 1) * sy, b[5] - i * sz], [b[3] + e2, b[4] - (j + 1) * sy, b[5] - (i + 1) * sz], [b[3] + e2, b[4] - j * sy, b[5] - (i + 1) * sz], [b[3] + e2, b[4] - j * sy, b[5] - i * sz]]; break;
        case 4: q = [[b[0] + i * sx, b[4] + e2, b[2] + j * sz], [b[0] + (i + 1) * sx, b[4] + e2, b[2] + j * sz], [b[0] + (i + 1) * sx, b[4] + e2, b[2] + (j + 1) * sz], [b[0] + i * sx, b[4] + e2, b[2] + (j + 1) * sz]]; break;
        default: q = [[b[0] + i * sx, b[1] - e2, b[2] + j * sz], [b[0] + (i + 1) * sx, b[1] - e2, b[2] + j * sz], [b[0] + (i + 1) * sx, b[1] - e2, b[2] + (j + 1) * sz], [b[0] + i * sx, b[1] - e2, b[2] + (j + 1) * sz]];
      }
      for (let n = 0; n < 4; n++) paintHoverMesh.line(q[n], q[(n + 1) % 4], C);
      paintHoverMesh.mode = gl.LINES;
      $('#stHover').textContent = `${{ head: 'Head', body: 'Body', rarm: 'Right arm', larm: 'Left arm', rleg: 'Right leg', lleg: 'Left leg' }[hit.k]}${hit.layer === 'outer' ? ' (outer)' : ''} · pixel ${x}, ${y}`;
    } else $('#stHover').textContent = '—';
    redraw();
  }

  /* ---------- the flat 2D skin editor ---------- */
  const c2d = () => $('#skin2d');
  const REGIONS = () => {
    const out = [];
    for (const k of PART_KEYS) { const sp = spec(k); for (const [uv, lay] of [[sp.uv, 'base'], [sp.ov, 'outer']]) for (let f = 0; f < 6; f++) out.push({ k, lay, f, r: faceRect(sp, uv, f) }); }
    return out;
  };
  function draw2d() {
    const cv2 = c2d(); if (!cv2) return;
    const g2 = cv2.getContext('2d'), Z = cv2.width / 64;
    g2.clearRect(0, 0, cv2.width, cv2.height);
    g2.fillStyle = '#1b1b20'; g2.fillRect(0, 0, cv2.width, cv2.height);
    // checker in paintable areas
    for (const R of REGIONS()) {
      const vis = R.lay === 'base' ? partOn[R.k] : layerOn[R.k];
      const [x, y, w, h] = R.r;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { g2.fillStyle = (i + j) % 2 ? '#2c2c33' : '#26262c'; g2.fillRect((x + i) * Z, (y + j) * Z, Z, Z); }
      if (!vis) { g2.fillStyle = 'rgba(0,0,0,.55)'; g2.fillRect(x * Z, y * Z, w * Z, h * Z); }
    }
    g2.imageSmoothingEnabled = false; g2.drawImage(skin, 0, 0, cv2.width, cv2.height);
    if ($('#grid2d') && $('#grid2d').checked) {
      g2.strokeStyle = 'rgba(0,0,0,.35)'; g2.lineWidth = 1;
      for (const R of REGIONS()) { const [x, y, w, h] = R.r; for (let i = 0; i <= w; i++) { g2.beginPath(); g2.moveTo((x + i) * Z + .5, y * Z); g2.lineTo((x + i) * Z + .5, (y + h) * Z); g2.stroke(); } for (let j = 0; j <= h; j++) { g2.beginPath(); g2.moveTo(x * Z, (y + j) * Z + .5); g2.lineTo((x + w) * Z, (y + j) * Z + .5); g2.stroke(); } }
    }
    g2.strokeStyle = 'rgba(255,143,200,.55)'; g2.lineWidth = 1.5;
    for (const R of REGIONS()) { const [x, y, w, h] = R.r; g2.strokeRect(x * Z + .5, y * Z + .5, w * Z - 1, h * Z - 1); }
  }
  function region2d(px, py) {
    for (const R of REGIONS()) { const [x, y, w, h] = R.r; if (px >= x && py >= y && px < x + w && py < y + h) return R; }
    return null;
  }
  let drag2d = false;
  function paint2d(e, first) {
    const cv2 = c2d(), r = cv2.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) / r.width * 64), py = Math.floor((e.clientY - r.top) / r.height * 64);
    const R = region2d(px, py); if (!R) return;
    if (R.lay === 'base' ? !partOn[R.k] : !layerOn[R.k]) return;
    if (first) strokeSeen = new Set();
    paintPixel({ k: R.k, layer: R.lay, f: R.f, px: [px, py], invert: e.shiftKey }, first);
    updateSkinTex();
  }
  function wire2d() {
    const cv2 = c2d(); if (!cv2) return;
    cv2.addEventListener('pointerdown', e => { e.preventDefault(); cv2.setPointerCapture(e.pointerId); pushSkinUndo(); drag2d = true; paint2d(e, true); });
    cv2.addEventListener('pointermove', e => {
      const r = cv2.getBoundingClientRect(), px = Math.floor((e.clientX - r.left) / r.width * 64), py = Math.floor((e.clientY - r.top) / r.height * 64);
      const R = region2d(px, py);
      $('#stHover').textContent = R ? `${{ head: 'Head', body: 'Body', rarm: 'Right arm', larm: 'Left arm', rleg: 'Right leg', lleg: 'Left leg' }[R.k]}${R.lay === 'outer' ? ' (outer)' : ''} · pixel ${px}, ${py}` : '—';
      if (drag2d && S.tool !== 'fill' && S.tool !== 'pick') paint2d(e, false);
    });
    cv2.addEventListener('pointerup', () => { drag2d = false; });
    cv2.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ---------- skin actions ---------- */
  function loadDefault(which) {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => { pushSkinUndo(); loadSkinImage(i, which === 'alex'); toast(which === 'alex' ? 'Alex' : 'Steve', 'Loaded the default skin.', 'ok'); };
    i.src = ASSET + '/img/skins/' + which + '.png';
  }
  function clearSkin(all) {
    pushSkinUndo();
    for (const ly of SL.list) { if (all) ly.g.clearRect(0, 0, 64, 64); else for (const R of REGIONS()) if (R.lay === 'outer') ly.g.clearRect(...R.r); }
    updateSkinTex();
    toast(all ? 'Skin cleared' : 'Outer layer cleared', 'Ctrl+Z brings it back.');
  }
  function downloadSkin() { skin.toBlob(b => download(b, (S.name || 'skin').replace(/[^\w-]+/g, '_') + '_skin.png'), 'image/png'); }

  function setMode(m) {
    MODE = m; localStorage.setItem('kyoto.studio.mode', m);
    $$('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    document.body.classList.toggle('skinmode', m === 'skin');
    $$('[data-pt]').forEach(b => b.hidden = !(b.dataset.for || 'both').split(' ').includes(m) && b.dataset.for !== undefined);
    const first = $$('[data-pt]').find(b => !b.hidden && (m === 'skin' ? b.dataset.pt === 'skin' : b.dataset.pt === 'cosmetic'));
    if (first) first.click();
    $('#slotLabel').textContent = m === 'skin' ? 'Skin' : SLOT_NAMES[S.slot];
    $('#kindLabel').textContent = m === 'skin' ? (paintLayer === 'base' ? 'Painting the base layer' : 'Painting the outer layer') : (S.kind === 'voxel' ? 'Voxel' : 'Picture');
    $('#tools').style.opacity = m === 'skin' || S.kind === 'voxel' ? 1 : .35;
    $('[data-tool=paint]').hidden = m === 'skin';
    $$('[data-tool=group],[data-tool=pivot]').forEach(b => b.hidden = m === 'skin' || !S.anim);
    if (m === 'skin' && (S.tool === 'group' || S.tool === 'pivot')) setTool('place');
    if (m === 'skin' && S.tool === 'paint') setTool('place');
    setTool(S.tool);
    hover = null; ghost.clear(); paintHoverMesh.clear(); paintHover = null;
    if (m === 'skin') { cam.target = [0, 16, 0]; cam.dist = 50; }
    else frameView();
    draw2d(); redraw();
  }

  /* ===================================================== mouse ===================================================== */
  let drag = null;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const orbit = e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey);
    if (orbit) { drag = { mode: (e.shiftKey || e.button === 1) ? 'pan' : 'orbit', x: e.clientX, y: e.clientY, moved: false }; return; }
    if (e.button === 0 && MODE === 'skin') {
      if (anim) { $('#animate').checked = false; anim = false; }
      pushSkinUndo(); drag = { mode: 'skin' }; paint3d(e, true); updatePaintHover(e); return;
    }
    if (e.button === 0 && S.kind === 'voxel') {
      if (anim) { $('#animate').checked = false; anim = false; }
      pushUndo(); drag = { mode: 'edit' }; applyTool(e, true); updateHover(e);
    }
  });
  cv.addEventListener('pointermove', e => {
    if (drag && (drag.mode === 'orbit' || drag.mode === 'pan')) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.mode === 'orbit') { cam.yaw -= dx * .008; cam.pitch = clamp(cam.pitch + dy * .008, -1.45, 1.45); }
      else {
        const f = norm(sub(cam.target, camPos())), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), k = cam.dist * .0016;
        cam.target = add(cam.target, add(r.map(v => -v * dx * k), u.map(v => v * dy * k)));
      }
      redraw(); return;
    }
    if (MODE === 'skin') {
      if (drag && drag.mode === 'skin' && (S.tool === 'place' || S.tool === 'erase' || S.tool === 'shade')) paint3d(e, false);
      updatePaintHover(e); return;
    }
    if (drag && drag.mode === 'edit' && (S.tool === 'erase' || S.tool === 'paint' || S.tool === 'shade' || S.tool === 'group')) applyTool(e, false);
    updateHover(e);
  });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('pointerleave', () => { hover = null; ghost.clear(); paintHover = null; paintHoverMesh.clear(); redraw(); });
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * .0012), 6, 200); redraw(); }, { passive: false });

  /* ===================================================== UI ===================================================== */
  const TOOL_NAMES = { place: 'Place', erase: 'Erase', paint: 'Paint', pick: 'Pick colour', fill: 'Fill (bucket)', shade: 'Shade', group: 'Moving part brush', pivot: 'Set pivot' };
  const HINTS = { place: 'Left click: place a voxel', erase: 'Left click / drag: erase', paint: 'Left click / drag: paint', pick: 'Left click a voxel to use its colour', fill: 'Left click: repaint every touching voxel of that colour', shade: 'Drag: darken (Shift: lighten) once per stroke', group: 'Drag over voxels to put them in the selected moving part', pivot: 'Click a voxel: the part turns around that point' };
  const SKIN_TOOL_NAMES = { place: 'Pencil', erase: 'Eraser', paint: 'Pencil', pick: 'Pick colour', fill: 'Fill', shade: 'Shading brush', group: 'Pencil', pivot: 'Pencil' };
  const SKIN_HINTS = { place: 'Left click / drag: draw pixels', erase: 'Left click / drag: erase pixels', paint: 'Left click / drag: draw', pick: 'Left click: grab a colour from the skin', fill: 'Left click: fill an area of one colour (stays on that face)', shade: 'Drag: shade (Shift: the other way). Each pixel changes once per stroke', group: '', pivot: '' };
  function setTool(t) {
    S.tool = t; $$('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    const sk = typeof MODE !== 'undefined' && MODE === 'skin';
    $('#stTool').textContent = (sk ? SKIN_TOOL_NAMES : TOOL_NAMES)[t]; $('#hint').textContent = (sk ? SKIN_HINTS : HINTS)[t] + ' · Right drag: orbit · Shift + right drag: pan · Wheel: zoom';
  }
  $$('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $$('[data-toggle=symX]').forEach(b => b.onclick = () => { S.symX = !S.symX; b.classList.toggle('on', S.symX); toast(S.symX ? 'Symmetry on' : 'Symmetry off', S.symX ? 'Everything you do is mirrored left/right.' : ''); });
  addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return act(e.shiftKey ? 'redo' : 'undo'); }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); return act('redo'); }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); return act('export'); }
    const map = { p: 'place', e: 'erase', b: 'paint', i: 'pick', f: 'fill', s: 'shade' };
    if (map[k] && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(map[k]);
    if (k === 'g' && MODE !== 'skin' && S.anim) setTool('group');
    if (k === ' ' && S.anim && MODE !== 'skin' && HOOKS.togglePlay) { e.preventDefault(); HOOKS.togglePlay(); }
    if (k === 'm') { if (MODE === 'skin') { const c = $('#mirrorPaint'); c.checked = !c.checked; c.onchange({ target: c }); toast(c.checked ? 'Mirror on' : 'Mirror off', ''); } else $('[data-toggle=symX]').click(); }
    if (k === '.' || k === 'home') frameView();
  });

  function act(a) {
    if (MODE === 'skin' && (a === 'undo' || a === 'redo' || a === 'clear')) {
      if (a === 'undo' && skinUndo.length) { skinRedo.push(skinSnap()); skinRestore(skinUndo.pop()); }
      else if (a === 'redo' && skinRedo.length) { skinUndo.push(skinSnap()); skinRestore(skinRedo.pop()); }
      else if (a === 'clear') clearSkin(true);
      return;
    }
    if (a === 'undo' && undo.length) { redo.push(snap()); restore(undo.pop()); }
    else if (a === 'redo' && redo.length) { undo.push(snap()); restore(redo.pop()); }
    else if (a === 'clear') { if (!S.vox.size) return; pushUndo(); S.vox.clear(); changed(); toast('Cleared', 'Ctrl+Z brings it back.'); }
    else if (a === 'new') { if (S.vox.size && !confirm('Start a new cosmetic? Your current one is replaced.')) return; reset(); }
    else if (a === 'export') exportFile();
    else if (a === 'post') post();
    else if (a === 'wear') wear();
    else if (a === 'help') help();
    else if (a === 'home' && HOOKS.home) HOOKS.home();
  }
  $$('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act));

  // property tabs
  let paneNow = 'cosmetic', capeShown = false;
  $$('[data-pt]').forEach(b => b.onclick = () => {
    paneNow = b.dataset.pt;
    $$('[data-pt]').forEach(x => x.classList.toggle('on', x === b));
    $$('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== paneNow);
    redraw();
  });

  // kind + slot
  function setKind(k) {
    S.kind = k; $$('[data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === k));
    $('#voxelProps').hidden = k !== 'voxel'; $('#pictureProps').hidden = k !== 'texture';
    $('#kindLabel').textContent = k === 'voxel' ? 'Voxel' : 'Picture';
    $('#tools').style.opacity = k === 'voxel' ? 1 : .35;
    buildLines(); buildPic(); save(); redraw();
  }
  $$('[data-kind]').forEach(b => b.onclick = () => setKind(b.dataset.kind));
  function setSlot(sl, keepGrid) {
    if (!keepGrid && S.vox.size && sl !== S.slot && !confirm('Changing where it goes moves the build space. Keep your voxels?')) return;
    S.slot = sl;
    if (!keepGrid) { S.n = SLOT_DEF[sl].n.slice(); S.center = SLOT_DEF[sl].center.slice(); }
    $$('[data-slot]').forEach(b => b.classList.toggle('on', b.dataset.slot === sl));
    $('#mirrorRow').hidden = sl === 'head' || sl === 'back';
    $('#slotLabel').textContent = SLOT_NAMES[sl];
    syncInputs(); buildLines(); buildVox(); frameView(); save();
  }
  $$('[data-slot]').forEach(b => b.onclick = () => setSlot(b.dataset.slot));
  $('#mirror').onchange = e => { S.mirror = e.target.checked; save(); redraw(); };
  $$('[data-vs]').forEach(b => b.onclick = () => { S.vs = Number(b.dataset.vs); $$('[data-vs]').forEach(x => x.classList.toggle('on', x === b)); buildLines(); buildVox(); save(); redraw(); });

  function syncInputs() {
    $('#gW').value = S.n[0]; $('#gH').value = S.n[1]; $('#gD').value = S.n[2];
    $('#cX').value = S.center[0]; $('#cY').value = S.center[1]; $('#cZ').value = S.center[2];
    $('#pW').value = S.picSize[0]; $('#pH').value = S.picSize[1];
    $('#pX').value = S.picOff[0]; $('#pY').value = S.picOff[1]; $('#pZ').value = S.picOff[2];
    $('#rX').value = S.picRot[0]; $('#rY').value = S.picRot[1]; $('#rZ').value = S.picRot[2];
    $('#mirror').checked = S.mirror; $('#cosName').value = S.name;
    $$('[data-vs]').forEach(x => x.classList.toggle('on', Number(x.dataset.vs) === S.vs));
  }
  const num = (id, lo, hi, d) => { const v = Number($(id).value); return Number.isFinite(v) ? clamp(v, lo, hi) : d; };
  ['#gW', '#gH', '#gD'].forEach((id, i) => $(id).onchange = () => {
    const nv = Math.round(num(id, 1, 48, S.n[i]));
    for (const k of [...S.vox.keys()]) if (Number(k.split(',')[i]) >= nv) S.vox.delete(k);
    S.n[i] = nv; syncInputs(); buildLines(); changed();
  });
  ['#cX', '#cY', '#cZ'].forEach((id, i) => $(id).onchange = () => { S.center[i] = num(id, -40, 40, S.center[i]); buildLines(); buildVox(); save(); redraw(); });
  ['#pW', '#pH'].forEach((id, i) => $(id).onchange = () => { S.picSize[i] = num(id, .5, 64, S.picSize[i]); buildPic(); save(); redraw(); });
  ['#pX', '#pY', '#pZ'].forEach((id, i) => $(id).onchange = () => { S.picOff[i] = num(id, -40, 40, S.picOff[i]); save(); redraw(); });
  ['#rX', '#rY', '#rZ'].forEach((id, i) => $(id).onchange = () => { S.picRot[i] = num(id, -360, 360, S.picRot[i]); save(); redraw(); });
  $('#cosName').oninput = e => { S.name = e.target.value.slice(0, 32); save(); };

  // colours
  function setColor(c) {
    if (!/^#[0-9a-f]{6}$/i.test(c || '')) return;
    S.color = c.toLowerCase(); $('#colorIn').value = S.color; $('#colorHex').textContent = S.color;
    renderPalette();
  }
  function renderPalette() {
    $('#palette').innerHTML = S.palette.map(c => `<button style="background:${c}" class="${c === S.color ? 'on' : ''}" data-c="${c}" title="${c}"></button>`).join('');
    const [r, g, b] = hexRgb(S.color).map(v => v * 255);
    const shades = [.35, .55, .75, .9, 1.1, 1.3, 1.5, 1.75].map(k => k <= 1 ? rgbHex(r * k, g * k, b * k) : rgbHex(r + (255 - r) * (k - 1), g + (255 - g) * (k - 1), b + (255 - b) * (k - 1)));
    $('#shades').innerHTML = shades.map(c => `<button style="background:${c}" data-c="${c}" title="${c}"></button>`).join('');
    $$('[data-c]').forEach(b => {
      b.onclick = () => setColor(b.dataset.c);
      b.oncontextmenu = e => { e.preventDefault(); if (b.closest('#palette')) { S.palette = S.palette.filter(x => x !== b.dataset.c); renderPalette(); save(); } };
    });
  }
  $('#colorIn').oninput = e => setColor(e.target.value);
  $('#addSwatch').onclick = () => { if (!S.palette.includes(S.color)) { S.palette.push(S.color); if (S.palette.length > 48) S.palette.shift(); renderPalette(); save(); } };

  // character
  function setArms(a) { arms = a; $$('[data-arms]').forEach(b => b.classList.toggle('on', b.dataset.arms === a)); localStorage.setItem('kyoto.builder.arms', a); buildPlayer(); if (typeof draw2d === 'function' && skinTex) draw2d(); redraw(); }
  $$('[data-arms]').forEach(b => b.onclick = () => setArms(b.dataset.arms));
  function syncParts() { $$('[data-part]').forEach(c => { c.checked = partOn[c.dataset.part]; }); $$('[data-layer]').forEach(c => { c.checked = layerOn[c.dataset.layer]; }); }
  $$('[data-part]').forEach(c => c.onchange = () => { partOn[c.dataset.part] = c.checked; draw2d(); redraw(); saveParts(); });
  $$('[data-layer]').forEach(c => c.onchange = () => { layerOn[c.dataset.layer] = c.checked; draw2d(); redraw(); saveParts(); });
  $$('[data-allparts]').forEach(b => b.onclick = () => { const v = b.dataset.allparts === 'on'; for (const k of PART_KEYS) { partOn[k] = v; layerOn[k] = v; } syncParts(); draw2d(); redraw(); saveParts(); });
  $$('[data-alllayers]').forEach(b => b.onclick = () => { const v = b.dataset.alllayers === 'on'; for (const k of PART_KEYS) layerOn[k] = v; syncParts(); draw2d(); redraw(); saveParts(); });
  function saveParts() { try { localStorage.setItem('kyoto.studio.parts', JSON.stringify({ partOn, layerOn })); } catch (e) { /* */ } }
  try { const sp = JSON.parse(localStorage.getItem('kyoto.studio.parts') || 'null'); if (sp) { Object.assign(partOn, sp.partOn); Object.assign(layerOn, sp.layerOn); } } catch (e) { /* */ }
  syncParts();
  // skin mode controls
  $$('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $$('[data-player]').forEach(b => b.onclick = () => { paintLayer = b.dataset.player; $$('[data-player]').forEach(x => x.classList.toggle('on', x === b)); setMode(MODE); });
  $$('[data-brush]').forEach(b => b.onclick = () => { brush = Number(b.dataset.brush); $$('[data-brush]').forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-skin]').forEach(b => b.onclick = () => loadDefault(b.dataset.skin));
  if ($('#mirrorPaint')) $('#mirrorPaint').onchange = e => { mirrorPaint = e.target.checked; };
  if ($('#grid2d')) $('#grid2d').onchange = draw2d;
  if ($('#skinClearAll')) $('#skinClearAll').onclick = () => { if (confirm('Erase the whole skin? (Ctrl+Z undoes it)')) clearSkin(true); };
  if ($('#skinClearOuter')) $('#skinClearOuter').onclick = () => clearSkin(false);
  if ($('#skinDl')) $('#skinDl').onclick = downloadSkin;
  wire2d();
  $('#animate').onchange = e => { anim = e.target.checked; t0 = performance.now(); redraw(); };
  $('#showGrid').onchange = redraw;
  $('#skinFile').onchange = e => { const f = e.target.files[0]; if (f) readImage(f).then(img => { loadSkinImage(img); toast('Skin loaded', f.name, 'ok'); }); e.target.value = ''; };
  $('#skinGo').onclick = async () => {
    const n = $('#skinName').value.trim(); if (!n) return;
    try {
      const r = await fetch(API + '/mcskin?name=' + encodeURIComponent(n));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Not found');
      const slim = r.headers.get('X-Skin-Slim') === '1';
      const img = await blobImage(await r.blob());
      loadSkinImage(img, slim); toast('Skin loaded', `${n}${slim ? ' (slim arms)' : ''}`, 'ok');
    } catch (e) { toast('Couldn\'t get that skin', e.message, 'bad'); }
  };
  $('#skinName').onkeydown = e => { if (e.key === 'Enter') $('#skinGo').click(); };
  function readImage(file) { return blobImage(file); }
  function blobImage(blob) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not a picture')); i.src = URL.createObjectURL(blob); }); }

  // picture
  $('#picFile').onchange = e => { const f = e.target.files[0]; if (f) setPicture(f); e.target.value = ''; };
  async function setPicture(f) {
    const img = await readImage(f);
    // keep it small: max 256 px on the long side, always PNG
    const sc = Math.min(1, 256 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    S.pic = c.toDataURL('image/png');
    const asp = c.width / c.height; S.picSize = asp >= 1 ? [12, +(12 / asp).toFixed(1)] : [+(12 * asp).toFixed(1), 12];
    $('#picName').textContent = f.name || 'Picture';
    loadPicTex(); setKind('texture'); syncInputs(); buildPic(); save(); redraw();
  }
  function loadPicTex() { if (!S.pic) return; const i = new Image(); i.onload = () => { if (picTex) gl.deleteTexture(picTex); picTex = texFrom(i, false); redraw(); }; i.src = S.pic; }

  /* ===================================================== cape template ===================================================== */
  let capeFit = 'cover', capeInside = 'dark', capeSrcFrames = null, capeOut = null, capeName = 'cape';
  $$('[data-fit]').forEach(b => b.onclick = () => { capeFit = b.dataset.fit; $$('[data-fit]').forEach(x => x.classList.toggle('on', x === b)); makeCape(); });
  $$('[data-inside]').forEach(b => b.onclick = () => { capeInside = b.dataset.inside; $$('[data-inside]').forEach(x => x.classList.toggle('on', x === b)); makeCape(); });
  $('#capeFile').onchange = e => { const f = e.target.files[0]; if (f) loadCapeFile(f); e.target.value = ''; };
  async function loadCapeFile(f) {
    capeName = (f.name || 'cape').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 32) || 'cape';
    $('#capeName').textContent = f.name;
    capeSrcFrames = null;
    if (/gif$/i.test(f.type) && 'ImageDecoder' in window) {
      try {
        const dec = new ImageDecoder({ data: await f.arrayBuffer(), type: 'image/gif' });
        await dec.tracks.ready; const count = Math.min(dec.tracks.selectedTrack.frameCount, 120);
        const frames = [];
        for (let i = 0; i < count; i++) {
          const { image } = await dec.decode({ frameIndex: i });
          const c = document.createElement('canvas'); c.width = image.displayWidth; c.height = image.displayHeight;
          c.getContext('2d').drawImage(image, 0, 0); frames.push({ img: c, ms: (image.duration || 100000) / 1000 }); image.close();
        }
        // the mod plays strips at 100 ms a frame: repeat frames to keep the GIF's timing
        capeSrcFrames = [];
        for (const fr of frames) for (let k = 0; k < clamp(Math.round(fr.ms / 100), 1, 10); k++) capeSrcFrames.push(fr.img);
        capeSrcFrames = capeSrcFrames.slice(0, 120);
      } catch (e) { capeSrcFrames = null; }
    }
    if (!capeSrcFrames) capeSrcFrames = [await readImage(f)];
    makeCape();
    $('#capeDl').disabled = $('#capeUse').disabled = $('#capePost').disabled = false;
    capeShown = true;
    toast(capeSrcFrames.length > 1 ? `Animated cape: ${capeSrcFrames.length} frames` : 'Cape ready', 'Spin the camera to see it on your back.', 'ok');
  }
  function avgColor(img) { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function drawFit(g, img, x, y, w, h, mirror) {
    const iw = img.width, ih = img.height;
    let sx = 0, sy = 0, sw = iw, sh = ih, dx = x, dy = y, dw = w, dh = h;
    if (capeFit === 'cover') { const k = Math.max(w / iw, h / ih); sw = w / k; sh = h / k; sx = (iw - sw) / 2; sy = (ih - sh) / 2; }
    else if (capeFit === 'contain') { const k = Math.min(w / iw, h / ih); dw = iw * k; dh = ih * k; dx = x + (w - dw) / 2; dy = y + (h - dh) / 2; }
    g.save();
    if (mirror) { g.translate(x * 2 + w, 0); g.scale(-1, 1); }
    g.imageSmoothingEnabled = true; g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    g.restore();
  }
  function makeCape() {
    if (!capeSrcFrames) return;
    const f0 = capeSrcFrames[0], many = capeSrcFrames.length > 1;
    const R = clamp(Math.ceil(Math.max(f0.width / 10, f0.height / 16)), 1, many ? 6 : 16);
    const W = 64 * R, H = 32 * R, out = document.createElement('canvas');
    out.width = W; out.height = H * capeSrcFrames.length;
    const g = out.getContext('2d');
    capeSrcFrames.forEach((img, i) => {
      const oy = i * H, [r, gg, b] = avgColor(img), edge = `rgb(${r * .7 | 0},${gg * .7 | 0},${b * .7 | 0})`;
      g.fillStyle = edge;
      g.fillRect(0, oy + R, R, 16 * R); g.fillRect(11 * R, oy + R, R, 16 * R); g.fillRect(R, oy, 10 * R, R); g.fillRect(11 * R, oy, 10 * R, R);
      if (capeFit === 'contain') { g.fillStyle = edge; g.fillRect(R, oy + R, 10 * R, 16 * R); }
      drawFit(g, img, R, oy + R, 10 * R, 16 * R, false); // outside (what people see)
      if (capeInside === 'same') drawFit(g, img, 12 * R, oy + R, 10 * R, 16 * R, true);
      else { g.fillStyle = capeInside === 'edge' ? `rgb(${r},${gg},${b})` : '#17171c'; g.fillRect(12 * R, oy + R, 10 * R, 16 * R); }
    });
    capeOut = out; capeFrames = capeSrcFrames.length;
    const prev = $('#capeTex'); prev.width = W; prev.height = H; prev.getContext('2d').drawImage(out, 0, 0, W, H, 0, 0, W, H);
    if (capeTexGL) gl.deleteTexture(capeTexGL);
    capeTexGL = texFrom(out);
    redraw();
  }
  function buildCape(fi) {
    capeMesh.clear();
    // box UV on a 64x32 frame, front picture on the outside (-z)
    const T = [64, 32 * capeFrames];
    const m = new Mesh();
    box(m, -5, -16, -3, 5, 0, -2, 0, 0, 10, 16, 1, 64, 32);
    // squeeze the 64x32 uvs into frame fi of the strip, and swap front/back so the picture faces outward
    for (let i = 0; i < m.a.length; i += 9) {
      let x = m.a[i], y = m.a[i + 1], z = m.a[i + 2], u = m.a[i + 3], v = m.a[i + 4];
      z = -5 - z; x = -x; // rotate 180°: picture side now at the back
      capeMesh.v(x, y, z, u, (v * 32 + fi * 32) / T[1], m.a[i + 5], m.a[i + 6], m.a[i + 7], m.a[i + 8]);
    }
    void T;
  }
  const capePng = () => new Promise(r => capeOut.toBlob(r, 'image/png'));
  $('#capeDl').onclick = async () => download(await capePng(), capeName + '.png');
  $('#capeUse').onclick = async () => {
    if (!me) return needLogin();
    try {
      const b64 = await blobB64(await capePng());
      if (b64.length > 2000000) throw new Error('Too big - try a shorter GIF or a smaller picture');
      let cur = {}; try { const r = await api('/cosmetics/bulk', { method: 'POST', body: { uuids: [me.uuid] } }); cur = (r.players || {})[me.uuid] || {}; } catch (e) { /* */ }
      await api('/cosmetics', { method: 'PUT', body: { cape: b64, accessory: cur.accessory || 0, model: cur.model || 0 } });
      toast('Cape on!', 'Every Kyoto player sees it next time they load you in.', 'ok');
    } catch (e) { toast('Couldn\'t set the cape', e.message, 'bad'); }
  };
  $('#capePost').onclick = async () => {
    if (!me) return needLogin();
    const b = await capePng(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (capeName || 'cape') + (capeFrames > 1 ? '.gif' : '.png'); a.click();
    modal(`<h2>Post your cape to the Store</h2><p>Your cape file just downloaded in Minecraft's cape layout (HD). Open the Store, press <b>Post a cosmetic</b>, choose <b>Cape</b> and pick that file.</p>
      <div class="mrow"><button class="pri ghost" data-close>Later</button><a class="pri" href="${API}/store?sell=1" target="_blank" style="text-decoration:none">Open the Store</a></div>`);
  };
  const _oldCapePost = async () => {
    if (!me) return needLogin();
    const title = prompt('Name your cape', capeName.replace(/_/g, ' ')); if (title === null) return;
    try {
      const b64 = await blobB64(await capePng());
      const r = await api('/hub/post', { method: 'POST', body: { type: 'cape', title: title.slice(0, 40), text: 'Made in the Kyoto Cosmetic Builder', image: b64 } });
      toast(r.pending ? 'Sent for approval' : 'Posted to the Hub', r.pending ? 'A Kyoto mod will check it soon.' : 'It\'s in the Store too.', 'ok');
    } catch (e) { toast('Couldn\'t post', e.message, 'bad'); }
  };
  const blobB64 = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });

  /* ===================================================== files ===================================================== */
  function exportData() {
    const base = { format: 'kycos', version: 1, name: S.name || 'Cosmetic', author: me ? me.name : '', slot: S.slot, kind: S.kind, mirror: S.mirror && (S.slot === 'arm' || S.slot === 'leg') };
    const an = animOut(); if (an) base.anim = an;
    if (S.kind === 'texture') return Object.assign(base, { texture: { png: (S.pic || ',').split(',')[1], size: S.picSize, offset: S.picOff, rot: S.picRot } });
    const pal = [...new Set(S.vox.values())], idx = new Map(pal.map((c, i) => [c, i]));
    const out = Object.assign(base, { grid: { n: S.n, vs: S.vs, center: S.center }, palette: pal, voxels: [...S.vox].map(([k, c]) => S.anim && S.anim.groups.length > 1 ? [...k.split(',').map(Number), idx.get(c), partOf(k)] : [...k.split(',').map(Number), idx.get(c)]) });
    return out;
  }
  function animOut() {
    if (!S.anim || !S.anim.groups.length || !S.anim.groups.some(g => g.keys.length)) return null;
    const r = v => Math.round(v * 1000) / 1000;
    return { len: r(S.anim.len), loop: S.anim.loop !== false, groups: S.anim.groups.slice(0, 8).map(g => ({ name: g.name, pivot: g.pivot.map(r), mirror: !!g.mirror, ease: g.ease || 'smooth', keys: g.keys.slice().sort((a, b) => a.t - b.t).map(k => ({ t: r(k.t), r: k.r.map(r), p: k.p.map(r), s: r(k.s) })) })) };
  }
  function validate() {
    if (S.kind === 'voxel' && !S.vox.size) { toast('Nothing to export yet', 'Place some voxels first.', 'bad'); return false; }
    if (S.kind === 'texture' && !S.pic) { toast('No picture yet', 'Choose a PNG in the Cosmetic tab.', 'bad'); return false; }
    return true;
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function exportFile() {
    if (!validate()) return;
    if (HOOKS.exportFile) return HOOKS.exportFile();
    const name = (S.name || 'cosmetic').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'cosmetic';
    download(new Blob([JSON.stringify(exportData())], { type: 'application/json' }), name + '.kycos');
    modal(`<h2>Exported ${esc(name)}.kycos</h2><p>To wear it in game:</p><ol>
      <li>Drag the file onto the <b>Kyoto Launcher</b> (it goes into your <code>kyoto/cosmetics</code> folder), or put it there yourself.</li>
      <li>In game type <code>/kyoto kycos wear ${esc(name)}.kycos</code></li></ol>
      <p>Or skip all that: press <b>Wear now</b> up top (needs your Kyoto login).</p><div class="mrow"><button class="pri" data-close>Got it</button></div>`);
  }
  function loadKycos(d) {
    if (d.format !== 'kycos') throw new Error('Not a .kycos file');
    S.name = d.name || 'Cosmetic'; S.mirror = !!d.mirror;
    S.anim = d.anim && Array.isArray(d.anim.groups) ? JSON.parse(JSON.stringify(d.anim)) : null; S.part = new Map(); AN.t = 0; AN.sel = 0;
    if (HOOKS.onAnim) HOOKS.onAnim();
    setSlot(d.slot in SLOT_DEF ? d.slot : 'head', true);
    if (d.kind === 'texture') {
      S.pic = 'data:image/png;base64,' + d.texture.png; S.picSize = d.texture.size; S.picOff = d.texture.offset; S.picRot = d.texture.rot;
      loadPicTex(); setKind('texture');
    } else {
      S.n = d.grid.n.slice(); S.vs = d.grid.vs; S.center = d.grid.center.slice();
      S.vox = new Map(d.voxels.map(v => [key(v[0], v[1], v[2]), d.palette[v[3]] || '#ffffff']));
      S.part = new Map(d.voxels.filter(v => v[4] > 0).map(v => [key(v[0], v[1], v[2]), v[4]]));
      for (const c of d.palette) if (!S.palette.includes(c)) S.palette.push(c);
      setKind('voxel');
    }
    syncInputs(); renderPalette(); buildLines(); buildVox(); buildPic(); frameView(); save();
  }
  $('#openFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { pushUndo(); loadKycos(JSON.parse(await f.text())); toast('Opened', f.name, 'ok'); } catch (err) { toast('Couldn\'t open it', err.message, 'bad'); }
  };

  // drag & drop: skins (64x64 / 64x32 PNG), pictures, capes, .kycos
  const view = $('.view'); let dd = 0;
  view.addEventListener('dragenter', e => { e.preventDefault(); dd++; $('#dropHint').hidden = false; });
  view.addEventListener('dragover', e => e.preventDefault());
  view.addEventListener('dragleave', () => { if (--dd <= 0) { dd = 0; $('#dropHint').hidden = true; } });
  view.addEventListener('drop', async e => {
    e.preventDefault(); dd = 0; $('#dropHint').hidden = true;
    const f = e.dataTransfer.files[0]; if (!f) return;
    if (/\.kycos$/i.test(f.name) || f.type === 'application/json') { try { pushUndo(); loadKycos(JSON.parse(await f.text())); } catch (err) { toast('Couldn\'t open it', err.message, 'bad'); } return; }
    if (/gif$/i.test(f.type) || paneNow === 'cape') { $('[data-pt=cape]').click(); return loadCapeFile(f); }
    const img = await readImage(f).catch(() => null); if (!img) return toast('Not a picture', f.name, 'bad');
    if (img.width === 64 && (img.height === 64 || img.height === 32)) { loadSkinImage(img); toast('Skin loaded', f.name, 'ok'); }
    else setPicture(f);
  });

  /* ===================================================== account ===================================================== */
  let me = null;
  async function whoami() {
    if (!localStorage.getItem('kyoto.token')) { $('#who').innerHTML = '<a href="/edit" data-login>Log in</a> to wear or post'; wireLogin(); return; }
    let cached = null; try { cached = JSON.parse(localStorage.getItem('kyoto.me') || 'null'); } catch (e) { /* */ }
    const showMe = m => { $('#who').innerHTML = `<img src="https://mc-heads.net/avatar/${encodeURIComponent(m.name)}/32" alt="" style="width:20px;height:20px;border-radius:5px;vertical-align:-5px;margin-right:6px;image-rendering:pixelated">${esc(m.name)}`; };
    if (cached) { me = cached; showMe(cached); }
    try { me = await api('/me'); localStorage.setItem('kyoto.me', JSON.stringify({ name: me.name, uuid: me.uuid, plus: !!me.plus })); showMe(me); }
    catch (e) { if (e.status === 401 || !cached) { me = null; localStorage.removeItem('kyoto.me'); $('#who').innerHTML = '<a href="/edit" data-login>Log in</a> to wear or post'; wireLogin(); } }
  }
  function wireLogin() {
    const a = $('[data-login]'); if (a && HOOKS.login) a.onclick = e => { e.preventDefault(); HOOKS.login(); };
  }
  function needLogin() {
    if (HOOKS.login) return HOOKS.login();
    modal(`<h2>Log in first</h2><p>In Minecraft with Kyoto, type <code>/kyoto link</code>, then enter the code on the website's <b>Edit profile</b> page. Come back here after and you're set. Your cosmetic is autosaved.</p>
      <div class="mrow"><a class="pri" href="/edit" style="text-decoration:none">Log in</a></div>`);
  }
  async function wear() {
    if (MODE === 'skin') {
      if (!me) return needLogin();
      try { await api('/skin', { method: 'PUT', body: { skin: skin.toDataURL('image/png').split(',')[1], slim: arms === 'slim' } }); toast('Skin on!', 'Kyoto players see it in game within a minute. Press F5 to see yourself.', 'ok'); }
      catch (e) { toast('Couldn\'t wear it', e.message, 'bad'); }
      return;
    }
    if (!validate()) return; if (!me) return needLogin();
    try { await api('/kycos', { method: 'PUT', body: { data: JSON.stringify(exportData()) } }); toast('You\'re wearing it', `${S.name} on your ${SLOT_NAMES[S.slot].toLowerCase()}. It shows in game within a minute (F5 to see yourself).`, 'ok'); }
    catch (e) { toast('Couldn\'t wear it', e.message, 'bad'); }
  }
  function post() {
    if (MODE === 'skin' && HOOKS.post) return HOOKS.post();
    if (!validate()) return; if (!me) return needLogin();
    if (HOOKS.post) return HOOKS.post();
    // the .kycos file is only for posting: save it, then open the Store's post form
    exportFile();
    modal(`<h2>Post it to the Kyoto Store</h2><p>Your <b>.kycos</b> file just downloaded. On the Store page, add a name, description, price (or free) and a few photos of it in game, then pick that file.</p>
      <ol class="steps2"><li>Wear it first (<b>Wear</b> button) and take screenshots in game with F5 + F2.</li><li>Open the Store and press <b>Post a cosmetic</b>.</li><li>Pick the .kycos file + your screenshots.</li></ol>
      <div class="mrow"><button class="pri ghost" data-close>Later</button><a class="pri" href="${API}/store?sell=1" target="_blank" style="text-decoration:none">Open the Store</a></div>`);
  }
  function help() {
    modal(`<h2>How the builder works</h2><ul>
      <li><b>Right drag</b> to spin around, <b>Shift + right drag</b> (or middle drag) to pan, <b>wheel</b> to zoom. <kbd>.</kbd> frames the build space.</li>
      <li><b>Place</b> <kbd>P</kbd>: click on the body or on a voxel. <b>Erase</b> <kbd>E</kbd> and <b>Paint</b> <kbd>B</kbd> work while you drag. <b>Pick</b> <kbd>I</kbd> grabs a colour, <b>Fill</b> <kbd>F</kbd> repaints a whole patch.</li>
      <li><b>Symmetry</b> <kbd>M</kbd> mirrors left/right as you build. <kbd>Ctrl+Z</kbd> undo, <kbd>Ctrl+Y</kbd> redo, <kbd>Ctrl+S</kbd> export.</li>
      <li><b>Where it goes</b>: head follows where you look, back stays on the body, arm and leg swing as you walk. Turn on <b>Both sides</b> for arms/legs.</li>
      <li><b>Picture</b> cosmetics are a flat PNG you can size, move and rotate: wings, signs, halos.</li>
      <li><b>Cape</b> tab: any PNG or GIF becomes a cape. GIFs turn into animated capes.</li>
      <li>Drop a skin PNG, a picture, a GIF or a .kycos file right onto the 3D view.</li></ul>
      <div class="mrow"><button class="pri" data-close>Let's build</button></div>`);
  }

  /* ===================================================== save / start ===================================================== */
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        localStorage.setItem('kyoto.builder', JSON.stringify({ name: S.name, slot: S.slot, kind: S.kind, mirror: S.mirror, n: S.n, vs: S.vs, center: S.center, vox: [...S.vox], color: S.color, palette: S.palette, pic: S.pic, picSize: S.picSize, picOff: S.picOff, picRot: S.picRot, anim: S.anim, part: [...S.part] }));
        $('#stSaved').textContent = 'Autosaved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } catch (e) { $('#stSaved').textContent = 'Too big to autosave - export it'; }
      if (HOOKS.onSave) HOOKS.onSave();
    }, 400);
  }
  function reset() {
    Object.assign(S, { name: 'My Cosmetic', mirror: false, vox: new Map(), pic: null, picSize: [8, 8], picOff: [0, 4, -5], picRot: [0, 0, 0], anim: null, part: new Map() });
    AN.t = 0; AN.playing = false; AN.sel = 0; if (HOOKS.onAnim) HOOKS.onAnim();
    undo.length = 0; redo.length = 0;
    setSlot('head', false); setKind('voxel'); syncInputs(); buildVox(); buildPic(); save();
  }
  /** Everything the Studio extras (studio-plus.js) and the desktop app need. */
  window.KS = {
    S, key, PALETTE0, SLOT_DEF, SLOT_NAMES, cam, canvas: cv, skin, partOn, layerOn,
    toast, modal, closeModal, api, esc, pushUndo, changed, exportData, loadKycos, validate, frameView, redraw, save,
    setSlot, setKind, syncInputs, renderPalette, buildLines, buildVox, buildPic, setColor, setMode, setArms, whoami, loadSkinImage,
    getMode: () => MODE, getArms: () => arms, me: () => me, setAnim: on => { anim = on; $('#animate').checked = on; redraw(); },
    renderNow: () => { needs = true; frame(performance.now(), true); },
    skinPng: () => skin.toDataURL('image/png'),
    loadSkinUrl: (url, slim) => new Promise(res => { const i = new Image(); i.onload = () => { loadSkinImage(i, slim); res(true); }; i.onerror = () => res(false); i.src = url; }),
    state: () => ({ name: S.name, slot: S.slot, kind: S.kind, mirror: S.mirror, n: S.n, vs: S.vs, center: S.center, vox: [...S.vox], color: S.color, palette: S.palette, pic: S.pic, picSize: S.picSize, picOff: S.picOff, picRot: S.picRot, anim: S.anim, part: [...S.part], mode: MODE, arms, skin: skin.toDataURL('image/png'), layers: SL.list.length > 1 ? layersJson() : null }),
    loadState: st => { localStorage.setItem('kyoto.builder', JSON.stringify(st)); if (st.skin) localStorage.setItem('kyoto.builder.skin', st.skin); else localStorage.removeItem('kyoto.builder.skin'); if (st.layers) localStorage.setItem('kyoto.studio.layers', JSON.stringify(st.layers)); else localStorage.removeItem('kyoto.studio.layers'); if (st.arms) localStorage.setItem('kyoto.builder.arms', st.arms); if (st.mode) { MODE = st.mode; localStorage.setItem('kyoto.studio.mode', st.mode); } },
    // Studio Pro (studio-pro.js): animation, layers, shading, lighting, capes, collab
    M, Mesh, box, gl, texFrom, hexRgb, rgbHex, clamp, AN, PART_COLS, partPose, partMatrix, animOut, EASE, slotMatrix, SLOT_PIVOT, gridMin, LIGHTS,
    setLight, getLight: () => light, setTool, getTool: () => S.tool, shadeOpt, shadeRgb, setArmsRaw: a => setArms(a),
    layers: SL, mkLayer, useLayer, composite, updateSkinTex, pushSkinUndo, layersJson, loadLayersJson, activeLayer,
    useCapeStrip: (out, frames, name) => { capeOut = out; capeFrames = frames; capeName = name || 'cape'; const prev = $('#capeTex'); prev.width = out.width; prev.height = out.height / frames; prev.getContext('2d').drawImage(out, 0, 0, out.width, out.height / frames, 0, 0, prev.width, prev.height); if (capeTexGL) gl.deleteTexture(capeTexGL); capeTexGL = texFrom(out); capeShown = true; $('#capeDl').disabled = $('#capeUse').disabled = $('#capePost').disabled = false; redraw(); },
    hoverWorld: () => {
      if (MODE === 'skin') return paintHover ? paintHover.P.slice() : null;
      if (!hover) return null; const g = gridMin(), c = hover.cell, pv = SLOT_PIVOT[S.slot];
      return [pv[0] + g[0] + (c[0] + .5) * S.vs, pv[1] + g[1] + (c[1] + .5) * S.vs, pv[2] + g[2] + (c[2] + .5) * S.vs];
    },
    project: w => { if (!VP) return null; const r = cv.getBoundingClientRect(); const x = VP[0] * w[0] + VP[4] * w[1] + VP[8] * w[2] + VP[12], y = VP[1] * w[0] + VP[5] * w[1] + VP[9] * w[2] + VP[13], ww = VP[3] * w[0] + VP[7] * w[1] + VP[11] * w[2] + VP[15]; if (ww <= 0) return null; return [(x / ww * .5 + .5) * r.width, (1 - (y / ww * .5 + .5)) * r.height]; },
    skinCanvas: skin, loadPicTex: () => loadPicTex(), buildPlayerNow: () => buildPlayer(), draw2d: () => draw2d()
  };
  function start() {
    let saved = null; try { saved = JSON.parse(localStorage.getItem('kyoto.builder') || 'null'); } catch (e) { /* */ }
    const sk = localStorage.getItem('kyoto.builder.skin');
    arms = localStorage.getItem('kyoto.builder.arms') || 'wide'; setArms(arms);
    let layersSaved = null; try { layersSaved = JSON.parse(localStorage.getItem('kyoto.studio.layers') || 'null'); } catch (e) { /* */ }
    if (sk) { const i = new Image(); i.onload = () => { loadSkinImage(i); if (layersSaved) loadLayersJson(layersSaved); }; i.src = sk; } else defaultSkin();
    if (saved) {
      Object.assign(S, { name: saved.name, mirror: saved.mirror, n: saved.n, vs: saved.vs, center: saved.center, vox: new Map(saved.vox || []), color: saved.color || S.color, anim: saved.anim || null, part: new Map(saved.part || []),
        palette: saved.palette && saved.palette.length ? saved.palette : PALETTE0.slice(), pic: saved.pic, picSize: saved.picSize || S.picSize, picOff: saved.picOff || S.picOff, picRot: saved.picRot || S.picRot });
      setSlot(saved.slot || 'head', true); setKind(saved.kind || 'voxel'); loadPicTex();
    } else { setSlot('head', false); setKind('voxel'); }
    syncInputs(); setColor(S.color); buildVox(); buildLines(); buildPic(); frameView(); setTool('place');
    whoami();
    setMode(MODE);
    if (!localStorage.getItem('kyoto.builder.seenHelp') && !HOOKS.noHelp) { localStorage.setItem('kyoto.builder.seenHelp', '1'); setTimeout(help, 400); }
    requestAnimationFrame(frame);
    window.KS.started = true;
    document.dispatchEvent(new Event('ks-ready'));
  }
  $$('[data-cam]').forEach(b => b.onclick = () => {
    const v = b.dataset.cam;
    if (v === 'reset') return frameView();
    cam.yaw = { front: 0, side: -Math.PI / 2, back: Math.PI, top: cam.yaw }[v]; cam.pitch = v === 'top' ? 1.4 : .12; redraw();
  });
  // the desktop app loads the project from disk first
  // (and waits for the rest of the page's scripts, so the extras are hooked in before it starts)
  const domReady = () => document.readyState === 'loading' ? new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true })) : null;
  Promise.resolve(domReady()).then(() => HOOKS.beforeStart ? HOOKS.beforeStart(window.KS) : null).catch(() => {}).then(start);
})();
