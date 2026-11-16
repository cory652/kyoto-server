/* Kyoto Studio - Build Timelapse.
 * Opens a .kybuild recorded by Kyoto Client's Build Recorder, plays it back as a 3D timelapse (WebGL2, one instanced
 * draw for every block that ever existed), counts the materials, and exports Litematica (.litematic) / WorldEdit (.schem).
 * Coordinates are blocks relative to the recording's origin (its lowest corner). */
'use strict';
(() => {
  const HOOKS = window.KS_HOOKS || {};
  const APP = window.kyotoApp || null;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function toast(t, s = '', k = '') { const el = document.createElement('div'); el.className = 'toast ' + k; el.innerHTML = `<b>${esc(t)}</b>${esc(s)}`; $('#toasts').appendChild(el); setTimeout(() => el.remove(), 4500); }
  const modal = html => { $('#mbody').innerHTML = html; $('#modal').hidden = false; };
  const closeModal = () => { $('#modal').hidden = true; };
  $('#modal').onclick = e => { if (e.target.id === 'modal' || e.target.hasAttribute('data-close')) closeModal(); };
  const fmtTime = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const pretty = s => s.replace(/^minecraft:/, '').replace(/\[.*$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  /* ============================================ colours for blocks without a map colour ============================================ */
  const DYES = { white: 0xe9ecec, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919, pink: 0xed8dac, gray: 0x3e4447, light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519 };
  const WOODS = { oak: 0xb8945f, spruce: 0x7a5a34, birch: 0xd7cb8d, jungle: 0xb88764, acacia: 0xba6337, dark_oak: 0x4f3218, mangrove: 0x773934, cherry: 0xe3b3ad, bamboo: 0xc9b65a, crimson: 0x6a344b, warped: 0x2b6963, pale_oak: 0xe2d9d3 };
  const KNOWN = [
    [/water/, 0x3f76e4], [/lava/, 0xd96415], [/grass_block|moss|leaves|vine|fern|grass/, 0x6aa84f], [/dirt|mud|coarse|rooted|farmland|path/, 0x866043], [/sandstone/, 0xd8cb94], [/red_sand/, 0xbe6621], [/sand/, 0xdbcfa3],
    [/gravel/, 0x837f7e], [/deepslate/, 0x4d4d51], [/cobble/, 0x7a7a7a], [/andesite/, 0x888888], [/diorite/, 0xbcbcbc], [/granite/, 0x956755], [/tuff/, 0x6c6d66], [/calcite/, 0xdfe0dc], [/stone/, 0x7d7d7d],
    [/brick/, 0x966253], [/quartz/, 0xebe5de], [/prismarine/, 0x5aa79a], [/copper/, 0xc06c50], [/gold/, 0xf7d33d], [/iron/, 0xdcdcdc], [/diamond/, 0x62dbd5], [/emerald/, 0x2fbf5a], [/lapis/, 0x2558a8], [/redstone/, 0xa8130a],
    [/netherrack|nether_wart/, 0x6f3535], [/nether_brick/, 0x2c161a], [/blackstone/, 0x2b2529], [/basalt/, 0x4c4b50], [/end_stone/, 0xdde0a5], [/purpur/, 0xa97ea9], [/obsidian/, 0x14121d], [/glowstone|shroomlight/, 0xf3c35f],
    [/sea_lantern|lantern|torch|froglight/, 0xf6e6b0], [/glass/, 0xc4e7f0], [/ice/, 0x9fc0f5], [/snow/, 0xf3f8f8], [/clay/, 0xa1a7b2], [/amethyst/, 0x8a62c4], [/sculk/, 0x0c2a33], [/bone/, 0xe2ddc4], [/hay/, 0xc9a51d],
    [/wool|carpet|concrete|terracotta|bed|banner|candle|shulker/, null], [/bookshelf/, 0x6c5232], [/crafting|barrel|chest|composter|lectern/, 0x9c7a4c], [/furnace|smoker|dispenser|dropper|observer|piston/, 0x6f6f6f]
  ];
  function guessColor(name) {
    const n = name.replace(/^minecraft:/, '').replace(/\[.*$/, '');
    for (const [d, c] of Object.entries(DYES)) if (n.startsWith(d + '_') && /wool|carpet|concrete|terracotta|bed|banner|candle|shulker|glass/.test(n)) return n.includes('terracotta') ? mix(c, 0x985f45, .45) : c;
    for (const [w, c] of Object.entries(WOODS)) if (n.startsWith(w + '_')) return /log|wood|stem/.test(n) ? mix(c, 0x3b2a18, .35) : c;
    for (const [rx, c] of KNOWN) if (rx.test(n) && c !== null) return c;
    if (n.includes('terracotta')) return 0x985f45;
    return 0x9a9a9a;
  }
  function mix(a, b, k) { const r = (a >> 16 & 255) * (1 - k) + (b >> 16 & 255) * k, g = (a >> 8 & 255) * (1 - k) + (b >> 8 & 255) * k, bl = (a & 255) * (1 - k) + (b & 255) * k; return (r << 16) | (g << 8) | bl | 0; }

  /* ============================================ loading ============================================ */
  let B = null; // the open build
  async function readFile(buf) {
    let bytes = new Uint8Array(buf);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const d = JSON.parse(new TextDecoder().decode(bytes));
    if (d.format !== 'kybuild') throw new Error('That isn\'t a .kybuild file');
    return d;
  }
  async function openData(d) {
    $('#drop').hidden = true; $('#vbtns').hidden = false;
    B = prepare(d);
    buildGpu();
    frameView(true);
    setTime(0); playing = true; updatePlay();
    ['#playBtn', '#scrub', '#exportBtn', '#shotBtn', '#videoBtn'].forEach(s => { $(s).disabled = false; });
    $('#bTitle').textContent = d.name || 'Build';
    document.title = (d.name || 'Build') + ' - Kyoto Studio';
    renderInfo(); renderMats(); drawHist();
    $('#slice').max = B.size[1]; $('#slice').value = B.size[1]; $('#sliceLbl').textContent = 'All';
  }
  async function openFile(file) {
    try { await openData(await readFile(await file.arrayBuffer())); toast('Opened', file.name, 'ok'); }
    catch (e) { console.error(e); toast('Couldn\'t open it', e.message, 'bad'); }
  }
  for (const id of ['#fileIn', '#fileIn2']) $(id).onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
  const view = $('#view');
  view.addEventListener('dragover', e => { e.preventDefault(); view.classList.add('dragging'); });
  view.addEventListener('dragleave', () => view.classList.remove('dragging'));
  view.addEventListener('drop', e => { e.preventDefault(); view.classList.remove('dragging'); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

  /**
   * Turns the file into "runs": every block that ever existed, with when it appeared (t0) and disappeared (t1).
   * Times are in two flavours: real time (ms) and "even" time (each change gets the same slice), so AFK breaks don't drag.
   */
  function prepare(d) {
    const [SX, SY, SZ] = d.size;
    const K = (x, y, z) => (y * SZ + z) * SX + x;
    const pal = d.palette.map((p, i) => {
      const s = p.s || 'minecraft:air', f = p.f || 0, base = s.replace(/\[.*$/, '');
      let c = p.c || 0; if (!c) c = guessColor(s);
      let alpha = 255;
      if (/(^|:)(water|bubble_column)$/.test(base)) { c = 0x3f76e4; alpha = 150; }
      else if (/glass|(^|:|_)ice$/.test(base)) alpha = /tinted/.test(base) ? 200 : 110;
      return { s, c, f, l: p.l || 0, b: p.b || [0, 0, 0, 1, 1, 1], alpha, base: s.replace(/\[.*$/, ''), id: i };
    });
    const startMap = new Map(), finalMap = new Map();
    for (const [x, y, z, p] of d.start || []) startMap.set(K(x, y, z), p);
    for (const [x, y, z, p] of d.final || []) finalMap.set(K(x, y, z), p);
    const events = (d.events || []).slice().sort((a, b) => a[0] - b[0]);
    const dur = Math.max(d.duration || 0, events.length ? events[events.length - 1][0] : 0, 1);
    // even pacing: event i happens at i/(n) of the way
    const n = Math.max(1, events.length);
    const EV = 1000 * n; // "even" timeline length, 1 s per change at 1x
    const runs = new Map(); // key -> [{p, t0, t1, e0, e1}]
    // what was there before you started counts as "already there" (dimmed, and hidden with that switch off)
    for (const [k, p] of startMap) runs.set(k, [{ p, t0: -1, t1: Infinity, e0: -1, e1: Infinity, terrain: true }]);
    events.forEach(([t, x, y, z, p], i) => {
      const k = K(x, y, z);
      let r = runs.get(k);
      if (!r) { r = [{ p: 0, t0: -1, t1: Infinity, e0: -1, e1: Infinity }]; runs.set(k, r); }
      const last = r[r.length - 1];
      if (last.p === p) return;
      last.t1 = t; last.e1 = i * 1000;
      r.push({ p, t0: t, t1: Infinity, e0: i * 1000, e1: Infinity });
    });
    // what the world looked like at the very end wins (fixes anything the recorder missed)
    for (const [k, r] of runs) {
      const fin = finalMap.has(k) ? finalMap.get(k) : 0, last = r[r.length - 1];
      if (last.p !== fin && finalMap.size) { last.t1 = dur; last.e1 = EV; r.push({ p: fin, t0: dur, t1: Infinity, e0: EV, e1: Infinity }); }
    }
    let terrain = 0;
    for (const [k, p] of finalMap) if (!runs.has(k) && p) { runs.set(k, [{ p, t0: -1, t1: Infinity, e0: -1, e1: Infinity, terrain: true }]); terrain++; }
    const built = new Set([...startMap.keys()]);
    // materials: what's there at the end (built part + everything)
    return { d, size: [SX, SY, SZ], K, pal, runs, events, dur, EV, built, terrain, finalMap, player: d.player || [] };
  }

  /* ============================================ WebGL2 ============================================ */
  const cv = $('#gl');
  const gl = cv.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) { $('#drop').querySelector('.dcard').innerHTML = '<h1>Your browser can\'t show 3D here</h1><p>Kyoto Studio needs WebGL 2. Try Chrome, Edge or the Kyoto Studio app.</p>'; }
  const VS = `#version 300 es
  layout(location=0) in vec3 aCorner; layout(location=1) in vec3 aNormal;
  layout(location=2) in vec3 iPos; layout(location=3) in vec4 iData;
  uniform mat4 uVP; uniform float uTime, uAnim, uSlice, uTerrain, uHi; uniform sampler2D uPal; uniform vec3 uCam;
  out vec3 vN; out vec4 vCol; out vec3 vLocal; out vec3 vWorld; out float vFlash, vDist, vEmis;
  void main(){
    float pid=iData.x, t0=iData.y, t1=iData.z, fl=iData.w;
    bool terrain = mod(fl,2.0) >= 1.0;
    float hold = uAnim*0.6;
    if (uTime < t0 || uTime >= t1 + hold || iPos.y > uSlice || (terrain && uTerrain < 0.5)) { gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
    vec4 c = texelFetch(uPal, ivec2(int(pid),0), 0);
    vec3 bmin = texelFetch(uPal, ivec2(int(pid),1), 0).rgb, bmax = texelFetch(uPal, ivec2(int(pid),2), 0).rgb;
    vec4 ex = texelFetch(uPal, ivec2(int(pid),3), 0);
    float k = (uAnim > 0.0 && t0 >= 0.0) ? clamp((uTime - t0)/uAnim, 0.0, 1.0) : 1.0;
    float km = k - 1.0;
    float pop = k < 1.0 ? 1.0 + 2.70158*km*km*km + 1.70158*km*km : 1.0;
    float gone = uTime >= t1 ? 1.0 - clamp((uTime - t1)/max(hold,0.0001), 0.0, 1.0) : 1.0;
    float s = max(pop*gone, 0.0);
    vec3 ctr = (bmin+bmax)*0.5, loc = mix(bmin, bmax, aCorner);
    vec3 p = iPos + ctr + (loc-ctr)*s;
    gl_Position = uVP*vec4(p,1.0);
    vN = aNormal; vCol = c; vLocal = aCorner; vWorld = iPos + loc; vEmis = ex.r;
    vFlash = t0 < 0.0 ? 0.0 : 1.0 - clamp((uTime-t0)/(uAnim*1.6+0.0001), 0.0, 1.0);
    vDist = distance(p, uCam);
    if (terrain) vCol.rgb = mix(vCol.rgb, vec3(dot(vCol.rgb, vec3(.3,.59,.11))), 0.45)*0.78;
    if (uHi > 0.5) { if (ex.b > 0.5) vFlash = max(vFlash, 0.35 + 0.25*sin(uTime*0.0)); else vCol.rgb *= 0.28; }
  }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vN; in vec4 vCol; in vec3 vLocal; in vec3 vWorld; in float vFlash, vDist, vEmis;
  uniform vec3 uSun, uFog; uniform float uFogDist, uPass, uSunI;
  out vec4 o;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
  void main(){
    float a = vCol.a;
    if (uPass < 0.5 && a < 0.99) discard;
    if (uPass > 0.5 && a >= 0.99) discard;
    vec3 n = normalize(vN);
    float shade = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.5 : (abs(n.x) > 0.5 ? 0.74 : 0.87));
    shade *= mix(0.7, 1.0, uSunI) * (0.8 + 0.2*max(dot(n, normalize(uSun)), 0.0));
    vec2 uv = abs(n.x) > 0.5 ? vLocal.yz : (abs(n.y) > 0.5 ? vLocal.xz : vLocal.xy);
    float e = min(min(uv.x, 1.0-uv.x), min(uv.y, 1.0-uv.y));
    float edge = smoothstep(0.0, 0.07, e);
    float px = 0.9 + 0.1*hash(floor(vWorld*8.0 + n*0.01));
    vec3 col = vCol.rgb * shade * (0.8 + 0.2*edge) * px;
    col = mix(col, vCol.rgb*1.15, vEmis*0.7);
    col += vFlash * vec3(0.55, 0.55, 0.6);
    float fog = clamp((vDist - uFogDist)/(uFogDist*1.6), 0.0, 0.85);
    o = vec4(mix(col, uFog, fog), a);
  }`;
  function prog(vs, fs) {
    const c = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, c(gl.VERTEX_SHADER, vs)); gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  let P = null, LP = null, cubeBuf, instBuf, palTex, vao, pvao, pInstBuf, gridVao, gridBuf, gridCount = 0, instCount = 0;
  const PLAYER_PAL = 3; // extra palette slots at the end for the builder figure
  if (gl) {
    P = prog(VS, FS);
    LP = prog(`#version 300 es
      layout(location=0) in vec3 a; uniform mat4 uVP; void main(){ gl_Position = uVP*vec4(a,1.0); }`,
    `#version 300 es
      precision mediump float; uniform vec4 uC; out vec4 o; void main(){ o = uC; }`);
    // a unit cube: 6 faces, corners 0..1, with normals
    const F = [[[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]], [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
      [[0, -1, 0], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]]], [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]], [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]]];
    const v = [];
    for (const [n, q] of F) for (const i of [0, 1, 2, 0, 2, 3]) v.push(...q[i], ...n);
    cubeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    const mkVao = buf => {
      const a = gl.createVertexArray(); gl.bindVertexArray(a);
      gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 28, 12); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null); return a;
    };
    instBuf = gl.createBuffer(); vao = mkVao(instBuf);
    pInstBuf = gl.createBuffer(); pvao = mkVao(pInstBuf);
    gridBuf = gl.createBuffer(); gridVao = gl.createVertexArray(); gl.bindVertexArray(gridVao); gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0); gl.bindVertexArray(null);
  }

  let pacing = 'even'; // 'even' | 'real'
  let highlight = null; // base block name
  function buildGpu() {
    if (!gl) return;
    const { runs, size: [SX, SY, SZ], pal } = B;
    let n = 0; for (const r of runs.values()) for (const x of r) if (x.p) n++;
    const data = new Float32Array(n * 7);
    let i = 0;
    for (const [k, r] of runs) {
      const x = k % SX, z = Math.floor(k / SX) % SZ, y = Math.floor(k / (SX * SZ));
      for (const run of r) {
        if (!run.p) continue;
        const t0 = pacing === 'even' ? run.e0 : run.t0, t1 = pacing === 'even' ? run.e1 : run.t1;
        data.set([x, y, z, run.p, t0, t1 === Infinity ? 3e38 : t1, run.terrain ? 1 : 0], i * 7); i++;
      }
    }
    instCount = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    // palette texture: row 0 colour, 1 box min, 2 box max, 3 extras (emissive, -, highlighted)
    const W = pal.length + PLAYER_PAL, tex = new Uint8Array(W * 4 * 4);
    const put = (row, col, r, g, b, a) => tex.set([r, g, b, a], (row * W + col) * 4);
    pal.forEach((p, c) => {
      put(0, c, p.c >> 16 & 255, p.c >> 8 & 255, p.c & 255, p.alpha);
      put(1, c, p.b[0] * 255, p.b[1] * 255, p.b[2] * 255, 255);
      put(2, c, p.b[3] * 255, p.b[4] * 255, p.b[5] * 255, 255);
      put(3, c, p.l > 7 ? 255 : p.l * 30, 0, highlight && p.base === highlight ? 255 : 0, 255);
    });
    // builder figure: legs, body, head (each fits inside one block cell)
    const pl = pal.length;
    [[0x3b48a8, [.25, 0, .37, .75, .75, .63]], [0x2aa6a6, [.2, 0, .35, .8, .8, .65]], [0xe0ac86, [.25, 0, .25, .75, .5, .75]]].forEach(([c, b], j) => {
      put(0, pl + j, c >> 16 & 255, c >> 8 & 255, c & 255, 255);
      put(1, pl + j, b[0] * 255, b[1] * 255, b[2] * 255, 255); put(2, pl + j, b[3] * 255, b[4] * 255, b[5] * 255, 255); put(3, pl + j, 0, 0, 255, 255);
    });
    if (palTex) gl.deleteTexture(palTex);
    palTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, palTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex);
    // ground grid
    const g = [], pad = 4;
    for (let x = -pad; x <= SX + pad; x++) g.push(x, 0, -pad, x, 0, SZ + pad);
    for (let z = -pad; z <= SZ + pad; z++) g.push(-pad, 0, z, SX + pad, 0, z);
    gridCount = g.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g), gl.STATIC_DRAW);
  }

  /* ============================================ math ============================================ */
  const M = {
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; },
    look(e, c, u) { let z = nrm(sub(e, c)), x = nrm(crs(u, z)), y = crs(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]; },
    mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
    inv(m) { const a = m, o = new Array(16);
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
      const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return null; d = 1 / d;
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d; return o; },
    xf(m, p) { const x = p[0], y = p[1], z = p[2], w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w]; }
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* ============================================ camera ============================================ */
  const cam = { yaw: .75, pitch: .45, dist: 40, target: [0, 0, 0], mode: 'orbit' };
  const camGoal = { yaw: .75, pitch: .45, dist: 40, target: [0, 0, 0] };
  function frameView(snap) {
    if (!B) return;
    const [SX, SY, SZ] = B.size;
    camGoal.target = [SX / 2, SY * .35, SZ / 2]; camGoal.dist = Math.max(14, Math.hypot(SX, SY, SZ) * 1.25); camGoal.pitch = .5;
    if (snap) Object.assign(cam, JSON.parse(JSON.stringify(camGoal)));
  }
  function camPos() { return add(cam.target, [Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, Math.sin(cam.pitch) * cam.dist, Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist]); }
  $$('[data-cam]').forEach(b => b.onclick = () => {
    const m = b.dataset.cam;
    if (m === 'frame') { frameView(false); cam.mode = 'orbit'; }
    else if (m === 'top') { frameView(false); camGoal.pitch = 1.45; cam.mode = 'orbit'; }
    else cam.mode = m;
    $$('[data-cam]').forEach(x => x.classList.toggle('on', x.dataset.cam === cam.mode));
  });
  let drag = null;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey }; cv.setPointerCapture(e.pointerId); if (cam.mode !== 'orbit') { cam.mode = 'orbit'; $$('[data-cam]').forEach(x => x.classList.toggle('on', x.dataset.cam === 'orbit')); } });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.b === 2 || drag.b === 1 || drag.shift) {
        const s = camGoal.dist * .0016, r = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
        camGoal.target = add(camGoal.target, [-r[0] * dx * s, dy * s, -r[2] * dx * s]);
      } else { camGoal.yaw -= dx * .006; camGoal.pitch = clamp(camGoal.pitch + dy * .006, -0.2, 1.52); }
      $('#hover').hidden = true;
    } else hoverAt(e);
  });
  cv.addEventListener('pointerleave', () => { $('#hover').hidden = true; });
  cv.addEventListener('wheel', e => { e.preventDefault(); camGoal.dist = clamp(camGoal.dist * Math.exp(e.deltaY * .0012), 3, 600); }, { passive: false });

  /* ============================================ time ============================================ */
  let T = 0, playing = false, lastNow = performance.now(), speedMode = 'fit30', sliceY = 1e9, showTerrain = true, showPlayer = true, popAnim = true, showGrid = true, sky = 'day';
  const totalT = () => !B ? 1 : pacing === 'even' ? B.EV : B.dur;
  function speed() {
    if (speedMode.startsWith('fit')) return totalT() / (Number(speedMode.slice(3)) * 1000);
    return pacing === 'even' ? Number(speedMode) * 4 : Number(speedMode); // even: 1x = 4 changes a second
  }
  function setTime(t) { T = clamp(t, 0, totalT()); }
  function updatePlay() { $('#playIco').innerHTML = playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M7 5v14l12-7z"/>'; }
  $('#playBtn').onclick = () => { if (T >= totalT() - 1) setTime(0); playing = !playing; updatePlay(); };
  $('#scrub').oninput = e => { setTime(totalT() * e.target.value / 1000); };
  $('#speed').onchange = e => { speedMode = e.target.value; };
  $('#optTerrain').onchange = e => { showTerrain = e.target.checked; };
  $('#optPlayer').onchange = e => { showPlayer = e.target.checked; };
  $('#optPop').onchange = e => { popAnim = e.target.checked; };
  $('#optGrid').onchange = e => { showGrid = e.target.checked; };
  $('#slice').oninput = e => { const v = Number(e.target.value); sliceY = v >= Number(e.target.max) ? 1e9 : v - 1; $('#sliceLbl').textContent = sliceY > 1e8 ? 'All' : 'Up to ' + v; };
  $$('[data-sky]').forEach(b => b.onclick = () => { sky = b.dataset.sky; $$('[data-sky]').forEach(x => x.classList.toggle('on', x === b)); document.body.dataset.sky = sky; });
  addEventListener('keydown', e => {
    if (!B || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); $('#playBtn').click(); }
    if (e.key === 'ArrowRight') setTime(T + (pacing === 'even' ? 1000 : totalT() / 100));
    if (e.key === 'ArrowLeft') setTime(T - (pacing === 'even' ? 1000 : totalT() / 100));
    if (e.key === 'Home') setTime(0);
    if (e.key === 'End') setTime(totalT());
  });
  /** Real recording time at the current playback point (for labels). */
  function realTime() {
    if (pacing === 'real' || !B.events.length) return T;
    const i = clamp(Math.floor(T / 1000), 0, B.events.length - 1);
    return B.events[i][0];
  }
  function changesSoFar() {
    if (!B) return 0;
    if (pacing === 'even') return clamp(Math.floor(T / 1000) + 1, 0, B.events.length);
    let lo = 0, hi = B.events.length; while (lo < hi) { const m = (lo + hi) >> 1; if (B.events[m][0] <= T) lo = m + 1; else hi = m; } return lo;
  }

  /* ============================================ drawing ============================================ */
  const SKY = { day: { fog: [.62, .74, .9], sun: [.4, 1, .3], i: 1, clear: [.55, .69, .88] }, sunset: { fog: [.78, .55, .52], sun: [-.8, .5, .2], i: .8, clear: [.6, .44, .5] }, night: { fog: [.06, .07, .13], sun: [.2, 1, .1], i: .45, clear: [.04, .05, .1] } };
  function resize() { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); const w = Math.round(r.width * d), h = Math.round(r.height * d); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
  let VP = null;
  function playerAt(tReal) {
    const p = B.player; if (!p.length) return null;
    let lo = 0, hi = p.length - 1; if (tReal <= p[0][0]) return p[0]; if (tReal >= p[hi][0]) return p[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= tReal) lo = m; else hi = m; }
    const a = p[lo], b = p[hi], k = (tReal - a[0]) / Math.max(1, b[0] - a[0]);
    return [tReal, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, a[4] + (((b[4] - a[4] + 540) % 360) - 180) * k, a[5]];
  }
  function draw(now) {
    if (!gl || !B) return;
    resize();
    const sk = SKY[sky];
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(...sk.clear, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    // camera modes
    const t = now / 1000;
    if (cam.mode === 'cinematic') { camGoal.yaw += .0022; camGoal.pitch = .42 + Math.sin(t * .2) * .08; }
    let eye, tgt;
    const pp = showPlayer ? playerAt(realTime()) : null;
    if (cam.mode === 'follow' && pp) {
      const yaw = pp[4] * Math.PI / 180, back = [Math.sin(yaw) * 6, 3.2, -Math.cos(yaw) * 6];
      const goalEye = add([pp[1], pp[2] + 1.6, pp[3]], back);
      cam.fEye = cam.fEye ? cam.fEye.map((v, i) => v + (goalEye[i] - v) * .06) : goalEye;
      cam.fTgt = cam.fTgt ? cam.fTgt.map((v, i) => v + ([pp[1], pp[2] + 1.2, pp[3]][i] - v) * .08) : [pp[1], pp[2] + 1.2, pp[3]];
      eye = cam.fEye; tgt = cam.fTgt;
    } else {
      for (const k of ['yaw', 'pitch', 'dist']) cam[k] += (camGoal[k] - cam[k]) * .14;
      cam.target = cam.target.map((v, i) => v + (camGoal.target[i] - v) * .14);
      eye = camPos(); tgt = cam.target; cam.fEye = null; cam.fTgt = null;
    }
    const proj = M.persp(.8, cv.width / Math.max(1, cv.height), .1, 2000);
    VP = M.mul(proj, M.look(eye, tgt, [0, 1, 0]));
    // grid
    if (showGrid) {
      gl.useProgram(LP.p); gl.uniformMatrix4fv(LP.u.uVP, false, VP); gl.uniform4f(LP.u.uC, 1, 1, 1, sky === 'night' ? .07 : .12);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.bindVertexArray(gridVao); gl.drawArrays(gl.LINES, 0, gridCount); gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.useProgram(P.p);
    const u = P.u;
    gl.uniformMatrix4fv(u.uVP, false, VP);
    gl.uniform1f(u.uTime, T);
    gl.uniform1f(u.uAnim, popAnim ? Math.max(1, 260 * speed()) : 0);
    gl.uniform1f(u.uSlice, sliceY);
    gl.uniform1f(u.uTerrain, showTerrain ? 1 : 0);
    gl.uniform1f(u.uHi, highlight ? 1 : 0);
    gl.uniform3fv(u.uCam, eye);
    gl.uniform3fv(u.uSun, sk.sun); gl.uniform3fv(u.uFog, sk.fog); gl.uniform1f(u.uSunI, sk.i);
    gl.uniform1f(u.uFogDist, Math.max(40, cam.dist * 1.4));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, palTex); gl.uniform1i(u.uPal, 0);
    // pass 1: solid blocks, pass 2: glass + water on top
    gl.bindVertexArray(vao);
    gl.uniform1f(u.uPass, 0); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, instCount);
    if (pp) drawPlayer(pp, u);
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(u.uPass, 1); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, instCount);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  function drawPlayer(pp, u) {
    const x = pp[1] - .5, y = pp[2], z = pp[3] - .5, pl = B.pal.length;
    const d = new Float32Array([x, y, z, pl, -1, 3e38, 0, x, y + .75, z, pl + 1, -1, 3e38, 0, x, y + 1.5, z, pl + 2, -1, 3e38, 0]);
    gl.bindBuffer(gl.ARRAY_BUFFER, pInstBuf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(pvao);
    gl.uniform1f(u.uSlice, 1e9); gl.uniform1f(u.uHi, 0);
    gl.uniform1f(u.uPass, 0); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, 3);
    gl.uniform1f(u.uSlice, sliceY); gl.uniform1f(u.uHi, highlight ? 1 : 0);
  }

  function loop(now) {
    const dt = Math.min(100, now - lastNow); lastNow = now;
    if (B && playing) {
      T += dt * speed();
      if (T >= totalT()) { if ($('#loop').checked && !recording) { T = 0; } else { T = totalT(); playing = false; updatePlay(); if (recording) stopRecording(); } }
    }
    if (B) {
      $('#scrub').value = Math.round(T / totalT() * 1000);
      $('#tNow').textContent = fmtTime(realTime()); $('#tEnd').textContent = fmtTime(B.dur);
      $('#cNow').textContent = changesSoFar().toLocaleString();
      drawHistCursor();
    }
    draw(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ============================================ hover: what block is that? ============================================ */
  function stateAt(k) {
    const r = B.runs.get(k); if (!r) return null;
    for (const run of r) {
      const t0 = pacing === 'even' ? run.e0 : run.t0, t1 = pacing === 'even' ? run.e1 : run.t1;
      if (T >= t0 && T < t1) return run.p ? (run.terrain && !showTerrain ? null : run) : null;
    }
    return null;
  }
  function hoverAt(e) {
    if (!B || !VP) return;
    const r = cv.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = 1 - (e.clientY - r.top) / r.height * 2;
    const inv = M.inv(VP); if (!inv) return;
    const a = M.xf(inv, [nx, ny, -1]), b = M.xf(inv, [nx, ny, 1]), d = nrm(sub(b, a));
    const [SX, SY, SZ] = B.size;
    // step into the box, then walk cell by cell (DDA)
    let t0 = 0, t1 = 1e9;
    for (let i = 0; i < 3; i++) { const lo = 0, hi = [SX, SY, SZ][i]; if (Math.abs(d[i]) < 1e-9) { if (a[i] < lo || a[i] > hi) return hide(); continue; } let ta = (lo - a[i]) / d[i], tb = (hi - a[i]) / d[i]; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); }
    if (t0 > t1) return hide();
    let p = add(a, d.map(v => v * (t0 + 1e-4)));
    let c = p.map(Math.floor); const step = d.map(Math.sign), tMax = [], tDelta = [];
    for (let i = 0; i < 3; i++) { tDelta[i] = Math.abs(1 / (d[i] || 1e-9)); tMax[i] = d[i] > 0 ? (c[i] + 1 - p[i]) * tDelta[i] : (p[i] - c[i]) * tDelta[i]; }
    for (let n = 0; n < 1500; n++) {
      if (c[0] < 0 || c[1] < 0 || c[2] < 0 || c[0] >= SX || c[1] >= SY || c[2] >= SZ) break;
      if (c[1] <= sliceY) { const run = stateAt(B.K(c[0], c[1], c[2])); if (run) return show(e, run, c); }
      const i = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      c[i] += step[i]; tMax[i] += tDelta[i];
    }
    hide();
    function hide() { $('#hover').hidden = true; }
  }
  function show(e, run, c) {
    const p = B.pal[run.p], h = $('#hover');
    const props = (p.s.match(/\[(.*)\]/) || [])[1];
    const when = run.t0 >= 0 ? 'Placed at ' + fmtTime(run.t0) : run.terrain ? 'Was already there' : 'There from the start';
    h.innerHTML = `<i style="background:#${p.c.toString(16).padStart(6, '0')}"></i><b>${esc(pretty(p.s))}</b><small>${esc(when)} · ${c[0]}, ${c[1]}, ${c[2]}</small>${props ? `<code>${esc(props.replace(/,/g, ', '))}</code>` : ''}`;
    const r = view.getBoundingClientRect();
    h.style.left = Math.min(r.width - 260, e.clientX - r.left + 16) + 'px'; h.style.top = (e.clientY - r.top + 16) + 'px';
    h.hidden = false;
  }

  /* ============================================ info, materials, timeline ============================================ */
  function renderInfo() {
    const d = B.d, st = d.stats || {};
    const [SX, SY, SZ] = B.size;
    $('#info').innerHTML = `
      <span>Name</span><b>${esc(d.name)}</b><span>Builder</span><b>${esc(d.author || '?')}</b>
      <span>Recorded</span><b>${new Date(d.created || Date.now()).toLocaleDateString()}</b><span>Time spent</span><b>${fmtTime(d.duration)}</b>
      <span>Placed</span><b>${(st.placed || 0).toLocaleString()}</b><span>Broken</span><b>${(st.broken || 0).toLocaleString()}</b>
      <span>Size</span><b>${SX} × ${SY} × ${SZ}</b><span>Minecraft</span><b>${esc(d.mc || '?')}</b>
      <span>Recorded as</span><b>${d.mode === 'area' ? 'Area' : 'Follow me'}</b>
      <span>Pacing</span><b><select id="pace"><option value="even">Even (best)</option><option value="real">Real time</option></select></b>`;
    $('#pace').value = pacing;
    $('#pace').onchange = e => { const frac = T / totalT(); pacing = e.target.value; buildGpu(); setTime(frac * totalT()); drawHist(); };
  }
  function materials(builtOnly) {
    const m = new Map();
    for (const [k, p] of B.finalMap) {
      if (!p || (builtOnly && !B.built.has(k))) continue;
      const base = B.pal[p].base; const e = m.get(base) || { base, n: 0, c: B.pal[p].c, ids: new Set() };
      e.n++; e.ids.add(p); m.set(base, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }
  let matsBuilt = true;
  function renderMats() {
    const list = materials(matsBuilt);
    const total = list.reduce((s, x) => s + x.n, 0);
    $('#matCount').textContent = total.toLocaleString() + ' blocks';
    $('#mats').innerHTML = `<div class="seg mini"><button data-mb="1" class="${matsBuilt ? 'on' : ''}">What you built</button><button data-mb="0" class="${matsBuilt ? '' : 'on'}">Whole area</button></div>` +
      (list.length ? list.map(x => `<button class="mat ${highlight === x.base ? 'on' : ''}" data-mat="${esc(x.base)}"><i style="background:#${x.c.toString(16).padStart(6, '0')}"></i><span>${esc(pretty(x.base))}</span><b>${x.n.toLocaleString()}</b><small>${x.n >= 64 ? Math.floor(x.n / 64) + ' st' + (x.n % 64 ? ' + ' + x.n % 64 : '') : ''}</small></button>`).join('')
        : '<p class="muted">No blocks yet.</p>') + (list.length ? '<button class="ghost wide" id="copyMats">Copy the list</button>' : '');
    $$('[data-mb]').forEach(b => b.onclick = () => { matsBuilt = b.dataset.mb === '1'; renderMats(); });
    $$('[data-mat]').forEach(b => b.onclick = () => { highlight = highlight === b.dataset.mat ? null : b.dataset.mat; buildGpu(); renderMats(); });
    const cp = $('#copyMats'); if (cp) cp.onclick = () => { navigator.clipboard.writeText(list.map(x => `${pretty(x.base)}: ${x.n}`).join('\n')); toast('Copied', 'Paste it anywhere.', 'ok'); };
  }
  function drawHist() {
    const c = $('#hist'), r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
    const g = c.getContext('2d'), W = c.width, H = c.height, bins = Math.max(20, Math.floor(W / (4 * d)));
    const counts = new Array(bins).fill(0);
    B.events.forEach((e, i) => { const t = pacing === 'even' ? i * 1000 : e[0]; counts[Math.min(bins - 1, Math.floor(t / totalT() * bins))]++; });
    const max = Math.max(1, ...counts);
    hist = { counts, max, bins };
    drawHistCursor(true);
  }
  let hist = null, lastHistX = -1;
  function drawHistCursor(force) {
    if (!hist) return;
    const c = $('#hist'), g = c.getContext('2d'), W = c.width, H = c.height;
    const cx = Math.round(T / totalT() * W);
    if (!force && cx === lastHistX) return;
    lastHistX = cx;
    g.clearRect(0, 0, W, H);
    const bw = W / hist.bins;
    hist.counts.forEach((n, i) => {
      const h = Math.max(n ? 2 : 0, Math.round(Math.sqrt(n / hist.max) * (H - 2)));
      const x = i * bw; g.fillStyle = x < cx ? '#ff8fc8' : 'rgba(255,255,255,.18)'; g.fillRect(x + .5, H - h, Math.max(1, bw - 1), h);
    });
  }
  addEventListener('resize', () => { if (B) drawHist(); });

  /* ============================================ export ============================================ */
  function blocksFor(builtOnly) {
    const [SX, SY, SZ] = B.size;
    const keys = [...B.finalMap.entries()].filter(([k, p]) => p && (!builtOnly || B.built.has(k)));
    if (!keys.length) return null;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
    const xyz = k => [k % SX, Math.floor(k / SX) % SZ, Math.floor(k / (SX * SZ))];
    for (const [k] of keys) { const [x, z, y] = xyz(k); x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
    const blocks = new Map();
    for (const [k, p] of keys) { const [x, z, y] = xyz(k); blocks.set(`${x - x0},${y - y0},${z - z0}`, B.pal[p].s); }
    return { blocks, size: [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1], count: keys.length };
  }
  function previewInts() {
    try {
      const wasT = T; setTime(totalT()); draw(performance.now());
      const s = Math.min(cv.width, cv.height), c = document.createElement('canvas'); c.width = c.height = 140;
      c.getContext('2d').drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, 0, 0, 140, 140);
      setTime(wasT);
      const d = c.getContext('2d').getImageData(0, 0, 140, 140).data, out = new Int32Array(140 * 140);
      for (let i = 0; i < out.length; i++) out[i] = (255 << 24) | (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
      return Array.from(out);
    } catch (e) { return null; }
  }
  async function saveBlob(blob, name, ext) {
    if (APP && APP.saveFile) {
      const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
      const f = await APP.saveFile({ name, ext, base64: true, data: b64, title: 'Save', filterName: ext.toUpperCase() });
      if (f) toast('Saved', f, 'ok');
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.' + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  $('#exportBtn').onclick = () => {
    if (!B) return;
    const nb = blocksFor(true), na = blocksFor(false);
    modal(`<h2>Export a schematic</h2><p>Paste your build back into any world with <b>Litematica</b>, or with <b>WorldEdit</b>.</p>
      <label>Name<input id="exName" maxlength="40" value="${esc(B.d.name || 'Build')}"></label>
      <div class="opt"><span>Format</span><div class="seg" id="exFmt"><button class="on" data-f="litematic">Litematica (.litematic)</button><button data-f="schem">WorldEdit (.schem)</button></div></div>
      <div class="opt"><span>Include</span><div class="seg" id="exInc"><button class="on" data-i="built">What you built${nb ? ` (${nb.count.toLocaleString()})` : ''}</button><button data-i="all">Whole area${na ? ` (${na.count.toLocaleString()})` : ''}</button></div></div>
      <p class="note" id="exNote">Put it in your <code>schematics</code> folder: <code>%APPDATA%\\.kyotoclient\\schematics</code> (Kyoto) or <code>.minecraft\\schematics</code>. Then open Litematica's menu (M) → Load Schematics.</p>
      <div class="mrow"><button class="ghost" data-close>Cancel</button><button class="pri" id="exGo">Export</button></div>`);
    let fmt = 'litematic', inc = 'built';
    $$('#exFmt [data-f]').forEach(b => b.onclick = () => { fmt = b.dataset.f; $$('#exFmt [data-f]').forEach(x => x.classList.toggle('on', x === b)); $('#exNote').innerHTML = fmt === 'schem' ? 'Put it in <code>config\\worldedit\\schematics</code> (or your server\'s WorldEdit folder), then <code>//schem load name</code> and <code>//paste</code>.' : 'Put it in your <code>schematics</code> folder: <code>%APPDATA%\\.kyotoclient\\schematics</code> (Kyoto) or <code>.minecraft\\schematics</code>. Then open Litematica\'s menu (M) → Load Schematics.'; });
    $$('#exInc [data-i]').forEach(b => b.onclick = () => { inc = b.dataset.i; $$('#exInc [data-i]').forEach(x => x.classList.toggle('on', x === b)); });
    $('#exGo').onclick = async () => {
      const sel = inc === 'built' ? nb : na;
      if (!sel) return toast('Nothing to export', inc === 'built' ? 'No built blocks in this recording. Try Whole area.' : 'The area is empty.', 'bad');
      $('#exGo').disabled = true; $('#exGo').textContent = 'Making it…';
      try {
        const name = $('#exName').value.trim() || 'Build';
        const opts = { name, author: B.d.author, description: `Recorded with Kyoto Client · ${fmtTime(B.d.duration)} of building`, size: sel.size, blocks: sel.blocks, dataVersion: B.d.dataVersion };
        const blob = fmt === 'schem' ? await KS_NBT.schem(opts) : await KS_NBT.litematic(Object.assign(opts, { preview: previewInts() }));
        await saveBlob(blob, name.replace(/[\\/:*?"<>|]/g, ''), fmt);
        closeModal(); toast('Exported ' + name + '.' + fmt, sel.count.toLocaleString() + ' blocks · ' + sel.size.join(' × '), 'ok');
      } catch (e) { console.error(e); toast('Couldn\'t export', e.message, 'bad'); $('#exGo').disabled = false; $('#exGo').textContent = 'Export'; }
    };
  };
  $('#shotBtn').onclick = () => {
    draw(performance.now());
    cv.toBlob(b => saveBlob(b, (B.d.name || 'build') + ' timelapse', 'png'), 'image/png');
  };

  /* ============================================ video ============================================ */
  let recorder = null, recording = false, chunks = [];
  $('#videoBtn').onclick = () => {
    if (recording) return stopRecording();
    modal(`<h2>Record a timelapse video</h2><p>Plays the whole build from the start and saves it as a video, perfect for TikTok or YouTube Shorts. Set up the camera first (try <b>Cinematic</b>).</p>
      <div class="opt"><span>Length</span><div class="seg" id="vLen"><button data-l="15">15 s</button><button class="on" data-l="30">30 s</button><button data-l="60">1 min</button></div></div>
      <div class="mrow"><button class="ghost" data-close>Cancel</button><button class="pri" id="vGo">Record</button></div>`);
    let len = 30;
    $$('#vLen [data-l]').forEach(b => b.onclick = () => { len = Number(b.dataset.l); $$('#vLen [data-l]').forEach(x => x.classList.toggle('on', x === b)); });
    $('#vGo').onclick = () => { closeModal(); startRecording(len); };
  };
  function startRecording(len) {
    if (!cv.captureStream || !window.MediaRecorder) return toast('Can\'t record here', 'Your browser doesn\'t support recording. Try Chrome or the Kyoto Studio app.', 'bad');
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    chunks = [];
    recorder = new MediaRecorder(cv.captureStream(60), { mimeType: type, videoBitsPerSecond: 12e6 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { saveBlob(new Blob(chunks, { type: 'video/webm' }), (B.d.name || 'build') + ' timelapse', 'webm'); };
    speedMode = 'fit' + len; $('#speed').value = 'fit' + (['15', '30', '60'].includes(String(len)) ? len : 30);
    setTime(0); playing = true; updatePlay();
    recording = true; recorder.start(250);
    $('#recdot').hidden = false; $('#videoBtn').textContent = 'Stop recording';
  }
  function stopRecording() {
    recording = false; $('#recdot').hidden = true; $('#videoBtn').textContent = 'Record video';
    if (recorder && recorder.state !== 'inactive') setTimeout(() => recorder.stop(), 600); // a little hold on the finished build
  }

  /* ============================================ demo build (a little cottage) ============================================ */
  function demo() {
    const pal = [{ s: 'minecraft:air', c: 0 }], id = new Map([['minecraft:air', 0]]);
    const P = (s, c, extra) => { if (id.has(s)) return id.get(s); id.set(s, pal.length); pal.push(Object.assign({ s, c }, extra || {})); return pal.length - 1; };
    const grass = P('minecraft:grass_block[snowy=false]', 0x7fb238), dirt = P('minecraft:dirt', 0x976d4d), cob = P('minecraft:cobblestone', 0x707070),
      log = P('minecraft:spruce_log[axis=y]', 0x815631), plank = P('minecraft:oak_planks', 0x8f7748), glass = P('minecraft:glass_pane', 0, { f: 1 }),
      roof = P('minecraft:dark_oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]', 0x664c33, { b: [0, 0, 0, 1, .5, 1] }),
      roofS = P('minecraft:dark_oak_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]', 0x664c33, { b: [0, 0, 0, 1, .5, 1] }),
      lantern = P('minecraft:lantern[hanging=false,waterlogged=false]', 0xa7a7a7, { l: 15, b: [.31, 0, .31, .69, .56, .69] }),
      door = P('minecraft:oak_door[facing=south,half=lower,hinge=left,open=false,powered=false]', 0x8f7748, { b: [0, 0, .81, 1, 1, 1] }),
      doorU = P('minecraft:oak_door[facing=south,half=upper,hinge=left,open=false,powered=false]', 0x8f7748, { b: [0, 0, .81, 1, 1, 1] }),
      flower = P('minecraft:poppy', 0x007c00, { f: 8, b: [.3, 0, .3, .7, .6, .7] }), leaves = P('minecraft:oak_leaves[distance=1,persistent=true,waterlogged=false]', 0x007c00, { f: 1 });
    const W = 13, H = 10, L = 11, final = [], start = [], events = [];
    const fin = new Map();
    for (let x = 0; x < W; x++) for (let z = 0; z < L; z++) { fin.set(`${x},0,${z}`, grass); }
    let t = 0;
    const put = (x, y, z, p) => { const k = `${x},${y},${z}`; const before = fin.get(k) || 0; if (before === p) return; if (!start.some(s => s[0] === x && s[1] === y && s[2] === z)) start.push([x, y, z, before]); t += 900 + Math.random() * 2200; events.push([Math.round(t), x, y, z, p]); fin.set(k, p); };
    const x0 = 2, z0 = 2, x1 = 10, z1 = 8;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) put(x, 0, z, cob);
    for (let y = 1; y <= 4; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1; if (!edge) continue;
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      if (corner) put(x, y, z, log);
      else if ((y === 2 || y === 3) && (x === 4 || x === 8) && (z === z0 || z === z1)) put(x, y, z, glass);
      else if ((y === 2 || y === 3) && z === 5 && (x === x0 || x === x1)) put(x, y, z, glass);
      else if (x === 6 && z === z1 && y <= 2) put(x, y, z, y === 1 ? door : doorU);
      else put(x, y, z, plank);
    }
    for (let s = 0; s <= 3; s++) for (let x = x0 - 1; x <= x1 + 1; x++) { put(x, 5 + s, z0 - 1 + s, roofS); put(x, 5 + s, z1 + 1 - s, roof); }
    for (let x = x0 - 1; x <= x1 + 1; x++) put(x, 9, 5, plank);
    put(6, 1, z1 + 2, lantern); put(3, 1, 10, flower); put(9, 1, 10, flower); put(1, 1, 1, leaves); put(11, 1, 9, leaves);
    for (const [k, p] of fin) { const [x, y, z] = k.split(',').map(Number); if (p) final.push([x, y, z, p]); }
    // the builder walks around the house
    const player = []; for (let i = 0; i <= t; i += 500) { const a = i / t * Math.PI * 6; player.push([i, 6 + Math.cos(a) * 7, 1 + Math.min(5, i / t * 8), 5 + Math.sin(a) * 7, (a * 180 / Math.PI + 90) % 360, 20]); }
    return { format: 'kybuild', version: 1, name: 'Cozy Cottage (demo)', author: 'Kyoto', mode: 'follow', mc: '26.3', dataVersion: 4440, created: Date.now(), duration: Math.round(t), origin: [0, 64, 0], size: [W, H, L],
      palette: pal, start, events, final, player, stats: { placed: events.length, broken: 0 } };
  }
  $('#demoBtn').onclick = () => openData(demo());

  /* ============================================ desktop app ============================================ */
  if (APP) {
    $('#homeBtn').hidden = false; $('#homeBtn').onclick = () => { location.href = 'home.html'; };
    $('#logoLink').href = 'home.html';
    if (APP.builds) {
      APP.builds.list().then(list => {
        if (!list.length) return;
        $('#recent').innerHTML = '<h4>Your recordings</h4>' + list.slice(0, 8).map((b, i) => `<button class="rb" data-rb="${i}"><b>${esc(b.name)}</b><small>${new Date(b.mtime).toLocaleString()} · ${(b.size / 1024).toFixed(0)} KB</small></button>`).join('');
        $$('[data-rb]').forEach(btn => btn.onclick = async () => { try { const r = await APP.builds.read(list[Number(btn.dataset.rb)].path); await openData(await readFile(Uint8Array.from(atob(r), c => c.charCodeAt(0)).buffer)); } catch (e) { toast('Couldn\'t open it', e.message, 'bad'); } });
        const want = new URLSearchParams(location.search).get('rec');
        if (want !== null && list[Number(want)]) { const b = $(`[data-rb="${Number(want)}"]`); if (b) b.click(); }
      });
      APP.builds.pending().then(async b64 => { if (b64) { try { await openData(await readFile(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer)); } catch (e) { toast('Couldn\'t open it', e.message, 'bad'); } } });
    }
  }
  window.KS_BUILD = { openData, demo };
})();
