/* Kyoto Studio Pro: animated cosmetics (keyframes), skin layers, shading brush, reference image,
   cape animator (flipbook), lighting preview and live collab links. Runs on top of builder.js (window.KS). */
(function () {
  'use strict';
  const HOOKS = window.KS_HOOKS = window.KS_HOOKS || {};
  const ready = fn => (window.KS && window.KS.started) ? fn() : document.addEventListener('ks-ready', fn, { once: true });
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const r3 = v => Math.round(v * 1000) / 1000;
  const ICON = {
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor"/></svg>',
    key: '<svg viewBox="0 0 24 24"><path d="M12 3l9 9-9 9-9-9z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="m6 10 6 6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    merge: '<svg viewBox="0 0 24 24"><path d="M7 4v5a5 5 0 0 0 5 5 5 5 0 0 1 5 5v1M17 4v5a5 5 0 0 1-2 4"/><path d="m4 17 3 3 3-3"/></svg>',
    first: '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 5l-9 7 9 7z"/></svg>',
    prevk: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
    nextk: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    pick: '<svg viewBox="0 0 24 24"><path d="m14 6 4 4M5 19l1-4 8.5-8.5a2.8 2.8 0 0 1 4 4L10 19z"/></svg>',
    flip: '<svg viewBox="0 0 24 24"><path d="M12 3v18M8 7 4 12l4 5M16 7l4 5-4 5"/></svg>'
  };
  const icon = (n, cls) => { const s = h('span', { class: 'ic' + (cls ? ' ' + cls : '') }); s.innerHTML = ICON[n]; return s; };

  ready(() => {
    const KS = window.KS, S = KS.S, AN = KS.AN;
    const after = () => { KS.buildVox(); KS.save(); KS.redraw(); };

    /* ================================================================ lighting preview ================================================================ */
    const lightBtn = $('#lightBtn');
    function syncLight() { $('#lightName').textContent = KS.LIGHTS[KS.getLight()].name; }
    lightBtn.onclick = e => {
      e.stopPropagation();
      const old = $('#lightMenu'); if (old) { old.remove(); return; }
      const menu = h('div', { id: 'lightMenu', class: 'popmenu' }, Object.entries(KS.LIGHTS).map(([k, L]) => {
        const sw = h('i', { class: 'lsw', style: `background:linear-gradient(135deg, rgb(${L.bg.map(v => v * 255 | 0)}), rgb(${L.tint.map(v => Math.min(255, v * 200) | 0)}))` });
        return h('button', { class: k === KS.getLight() ? 'on' : '', onclick: () => { KS.setLight(k); syncLight(); menu.remove(); } }, sw, L.name);
      }));
      lightBtn.parentElement.append(menu);
      setTimeout(() => addEventListener('click', function off(ev) { if (!menu.contains(ev.target)) { menu.remove(); removeEventListener('click', off); } }), 0);
    };
    syncLight();

    /* ================================================================ tool options bar (shading brush) ================================================================ */
    const bar = $('#toolbar2');
    function renderBar() {
      const so = KS.shadeOpt;
      bar.innerHTML = '';
      bar.append(
        h('b', {}, 'Shading brush'),
        h('div', { class: 'seg mini' }, ['darken', 'lighten'].map(m => h('button', { class: so.mode === m ? 'on' : '', onclick: () => { so.mode = m; renderBar(); } }, m === 'darken' ? 'Darken' : 'Lighten'))),
        h('label', { class: 'mini' }, 'Strength', h('input', { type: 'range', min: 1, max: 4, value: so.strength, oninput: e => { so.strength = +e.target.value; } })),
        h('label', { class: 'mchk' }, h('input', { type: 'checkbox', checked: so.hue, onchange: e => { so.hue = e.target.checked; } }), h('span'), 'Hue shift'),
        h('label', { class: 'mchk' }, h('input', { type: 'checkbox', checked: so.dither, onchange: e => { so.dither = e.target.checked; } }), h('span'), 'Dither'),
        h('small', {}, 'Shift = the other way')
      );
    }
    renderBar();
    let lastTool = '';
    setInterval(() => { const t = KS.getTool(); if (t !== lastTool) { lastTool = t; bar.hidden = t !== 'shade'; } }, 200);

    /* ================================================================ skin layers ================================================================ */
    const SL = KS.layers, lp = $('#layersPanel');
    const BLENDS = { 'source-over': 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', 'soft-light': 'Soft light', darken: 'Darken', lighten: 'Lighten' };
    function layerOp(fn, msg) { KS.pushSkinUndo(); fn(); KS.updateSkinTex(); renderLayers(); if (msg) KS.toast(msg, ''); }
    function renderLayers() {
      if (!lp || !SL.list.length) return;
      lp.innerHTML = '';
      const list = h('div', { class: 'layers' });
      for (let i = SL.list.length - 1; i >= 0; i--) {
        const ly = SL.list[i], on = i === SL.active;
        const th = h('canvas', { width: 64, height: 64, class: 'lthumb' }); th.getContext('2d').drawImage(ly.c, 0, 0);
        const eye = h('button', { class: 'lb' + (ly.vis ? '' : ' off'), title: ly.vis ? 'Hide' : 'Show', onclick: e => { e.stopPropagation(); layerOp(() => { ly.vis = !ly.vis; }); } }); eye.innerHTML = ly.vis ? ICON.eye : ICON.eyeOff;
        const lk = h('button', { class: 'lb' + (ly.lock ? ' lit' : ' dim'), title: 'Alpha lock: only paint over pixels already on this layer', onclick: e => { e.stopPropagation(); ly.lock = !ly.lock; KS.layersJson && renderLayers(); } }); lk.innerHTML = ICON.lock;
        const name = h('span', { class: 'lname', title: 'Double click to rename' }, ly.name);
        name.ondblclick = e => { e.stopPropagation(); const n = prompt('Layer name', ly.name); if (n != null && n.trim()) { ly.name = n.trim().slice(0, 24); renderLayers(); KS.updateSkinTex(); } };
        list.append(h('div', { class: 'layer' + (on ? ' on' : ''), onclick: () => { KS.useLayer(i); renderLayers(); } }, eye, th, h('div', { class: 'lmeta' }, name, h('small', {}, `${BLENDS[ly.blend] || 'Normal'} · ${Math.round(ly.op * 100)}%`)), lk));
      }
      const A = KS.activeLayer();
      const tools = h('div', { class: 'ltools' },
        btn('plus', 'New layer', () => layerOp(() => { SL.list.splice(SL.active + 1, 0, KS.mkLayer('Layer ' + (SL.list.length + 1))); KS.useLayer(SL.active + 1); })),
        btn('copy', 'Duplicate', () => layerOp(() => { const c = KS.mkLayer(A.name + ' copy', A.c); Object.assign(c, { op: A.op, blend: A.blend, vis: A.vis }); SL.list.splice(SL.active + 1, 0, c); KS.useLayer(SL.active + 1); })),
        btn('merge', 'Merge down', () => { if (SL.active === 0) return KS.toast('Nothing below', 'This is the bottom layer.'); layerOp(() => { const below = SL.list[SL.active - 1], g = below.g; g.save(); g.globalAlpha = A.op; g.globalCompositeOperation = A.blend; if (A.vis) g.drawImage(A.c, 0, 0); g.restore(); SL.list.splice(SL.active, 1); KS.useLayer(SL.active - 1); }); }),
        btn('up', 'Move up', () => { if (SL.active >= SL.list.length - 1) return; layerOp(() => { const i = SL.active; [SL.list[i], SL.list[i + 1]] = [SL.list[i + 1], SL.list[i]]; KS.useLayer(i + 1); }); }),
        btn('down', 'Move down', () => { if (SL.active <= 0) return; layerOp(() => { const i = SL.active; [SL.list[i], SL.list[i - 1]] = [SL.list[i - 1], SL.list[i]]; KS.useLayer(i - 1); }); }),
        btn('trash', 'Delete layer', () => { if (SL.list.length < 2) return KS.toast('Keep one layer', 'Clear it instead.'); layerOp(() => { SL.list.splice(SL.active, 1); KS.useLayer(Math.min(SL.active, SL.list.length - 1)); }, 'Layer deleted'); })
      );
      const props = h('div', { class: 'lprops' },
        h('label', {}, 'Opacity', h('input', { type: 'range', min: 0, max: 100, value: Math.round(A.op * 100), oninput: e => { A.op = e.target.value / 100; KS.updateSkinTex(); }, onchange: renderLayers })),
        h('label', {}, 'Blend', h('select', { onchange: e => layerOp(() => { A.blend = e.target.value; }) }, Object.entries(BLENDS).map(([k, v]) => h('option', { value: k, selected: A.blend === k }, v))))
      );
      const more = h('div', { class: 'lmore' },
        h('label', { class: 'mini filebtn2' }, 'Import PNG as layer', h('input', { type: 'file', accept: 'image/png', hidden: true, onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const im = new Image(); im.onload = () => layerOp(() => { const c = KS.mkLayer(f.name.replace(/\.png$/i, '').slice(0, 24)); c.g.drawImage(im, 0, 0, 64, im.height === 32 ? 32 : 64); SL.list.splice(SL.active + 1, 0, c); KS.useLayer(SL.active + 1); }, 'Imported as a new layer'); im.src = URL.createObjectURL(f); } })),
        h('button', { class: 'mini', onclick: () => layerOp(() => { A.g.clearRect(0, 0, 64, 64); }, 'Layer cleared') }, 'Clear layer'),
        h('button', { class: 'mini', onclick: () => layerOp(() => { const flat = KS.mkLayer('Merged', KS.skinCanvas); SL.list = [flat]; KS.useLayer(0); }, 'Flattened') }, 'Flatten')
      );
      lp.append(list, tools, props, more);
    }
    function btn(ic, title, fn) { const b = h('button', { class: 'lb', title, onclick: fn }); b.innerHTML = ICON[ic]; return b; }
    let lt = 0; HOOKS.onLayers = () => { clearTimeout(lt); lt = setTimeout(renderLayers, 60); };
    renderLayers();

    /* ================================================================ reference image ================================================================ */
    const REF = (() => { try { return JSON.parse(localStorage.getItem('kyoto.studio.ref') || 'null') || {}; } catch (e) { return {}; } })();
    let refWin = null, refPick = false;
    function saveRef() { try { localStorage.setItem('kyoto.studio.ref', JSON.stringify(REF)); } catch (e) { delete REF.src; KS.toast('Picture too big to remember', 'It stays until you close the page.'); } }
    function openRef() {
      if (refWin) { refWin.hidden = false; return; }
      const img = h('img', { alt: '', draggable: 'false' });
      const empty = h('div', { class: 'refempty' }, h('b', {}, 'Drop, paste (Ctrl+V) or choose a picture'), h('small', {}, 'Great for copying a character, a texture or a colour scheme'),
        h('label', { class: 'pri ghost sm' }, 'Choose…', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadRef(f); } })));
      const body = h('div', { class: 'refbody' }, img, empty);
      const op = h('input', { type: 'range', min: 10, max: 100, value: Math.round((REF.op || 1) * 100), title: 'Opacity', oninput: e => { REF.op = e.target.value / 100; apply(); saveRef(); } });
      const tb = (ic, title, fn) => { const b = h('button', { class: 'lb', title, onclick: fn }); b.innerHTML = ICON[ic]; return b; };
      const pickB = tb('pick', 'Pick a colour from the picture', () => { refPick = !refPick; pickB.classList.toggle('lit', refPick); body.classList.toggle('picking', refPick); });
      const head = h('div', { class: 'refhead' }, h('b', {}, 'Reference'), op,
        pickB,
        tb('flip', 'Flip', () => { REF.flip = !REF.flip; apply(); saveRef(); }),
        h('button', { class: 'lb txt', title: 'Black and white (see shading values)', onclick: () => { REF.gray = !REF.gray; apply(); saveRef(); } }, 'B/W'),
        tb('lock', 'Click-through: lock it in place and draw under it', () => { REF.pass = !REF.pass; apply(); saveRef(); }),
        tb('trash', 'Remove picture', () => { delete REF.src; apply(); saveRef(); }),
        tb('close', 'Close', () => { refWin.hidden = true; REF.open = false; saveRef(); }));
      refWin = h('div', { id: 'refWin', class: 'refwin' }, head, body);
      document.body.append(refWin);
      const pos = REF.pos || [innerWidth - 640, 70, 300, 260];
      Object.assign(refWin.style, { left: Math.min(innerWidth - 120, pos[0]) + 'px', top: Math.min(innerHeight - 80, pos[1]) + 'px', width: pos[2] + 'px', height: pos[3] + 'px' });
      // drag by the header
      head.onpointerdown = e => {
        if (e.target.closest('button,input,label')) return;
        const sx = e.clientX - refWin.offsetLeft, sy = e.clientY - refWin.offsetTop; head.setPointerCapture(e.pointerId);
        head.onpointermove = m => { refWin.style.left = Math.max(0, Math.min(innerWidth - 80, m.clientX - sx)) + 'px'; refWin.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - sy)) + 'px'; };
        head.onpointerup = () => { head.onpointermove = null; keepPos(); };
      };
      new ResizeObserver(() => keepPos()).observe(refWin);
      function keepPos() { REF.pos = [refWin.offsetLeft, refWin.offsetTop, refWin.offsetWidth, refWin.offsetHeight]; clearTimeout(keepPos.t); keepPos.t = setTimeout(saveRef, 300); }
      refWin.addEventListener('dragover', e => e.preventDefault());
      refWin.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) loadRef(f); });
      // colour picking: sample the shown pixel
      img.onclick = e => {
        if (!refPick) return;
        const r = img.getBoundingClientRect(), c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        let x = (e.clientX - r.left) / r.width * c.width; if (REF.flip) x = c.width - x;
        const d = g.getImageData(Math.floor(x), Math.floor((e.clientY - r.top) / r.height * c.height), 1, 1).data;
        KS.setColor(KS.rgbHex(d[0], d[1], d[2])); KS.toast('Colour picked', KS.rgbHex(d[0], d[1], d[2]));
      };
      function apply() {
        empty.hidden = !!REF.src; img.hidden = !REF.src; if (REF.src && img.src !== REF.src) img.src = REF.src;
        img.style.opacity = REF.op || 1; img.style.transform = REF.flip ? 'scaleX(-1)' : ''; img.style.filter = REF.gray ? 'grayscale(1)' : '';
        refWin.classList.toggle('pass', !!REF.pass);
      }
      openRef.apply = apply; apply();
      REF.open = true; saveRef();
    }
    function loadRef(file) {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1024 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.max(1, im.width * k | 0); c.height = Math.max(1, im.height * k | 0);
        const g = c.getContext('2d'); g.imageSmoothingEnabled = im.width > 128; g.drawImage(im, 0, 0, c.width, c.height);
        REF.src = c.toDataURL(im.width <= 128 ? 'image/png' : 'image/webp', .9);
        openRef(); openRef.apply(); saveRef();
      };
      im.src = URL.createObjectURL(file);
    }
    $('#refBtn').onclick = () => { if (refWin && !refWin.hidden) { refWin.hidden = true; REF.open = false; saveRef(); } else openRef(); };
    addEventListener('paste', e => {
      if (e.target.matches && e.target.matches('input, textarea')) return;
      const f = [...(e.clipboardData || {}).files || []].find(x => /^image\//.test(x.type));
      if (f) { e.preventDefault(); loadRef(f); KS.toast('Reference image', 'Pasted. Drag it around, pick colours from it.', 'ok'); }
    });
    if (REF.open) openRef();

    /* ================================================================ animated cosmetics ================================================================ */
    const pane = $('#animPane'), tl = $('#timeline');
    const PRESETS = {
      spin: { name: 'Spin', len: 2, ease: 'linear', keys: [{ t: 0, r: [0, 0, 0] }, { t: 2, r: [0, 360, 0] }], hint: 'Turns around and around' },
      bob: { name: 'Bob', len: 2, keys: [{ t: 0, p: [0, 0, 0] }, { t: 1, p: [0, 1.5, 0] }], hint: 'Floats up and down' },
      flap: { name: 'Flap', len: 1, mirror: true, keys: [{ t: 0, r: [0, -10, 0] }, { t: .5, r: [0, 35, 0] }], hint: 'Wings: both halves flap (set the pivot in the middle)' },
      pulse: { name: 'Pulse', len: 1.2, keys: [{ t: 0, s: 1 }, { t: .6, s: 1.15 }], hint: 'Grows and shrinks' },
      wiggle: { name: 'Wiggle', len: .8, keys: [{ t: 0, r: [0, 0, -12] }, { t: .4, r: [0, 0, 12] }], hint: 'Tilts side to side' },
      sway: { name: 'Sway', len: 3, keys: [{ t: 0, r: [-8, 0, 0] }, { t: 1.5, r: [8, 0, 0] }], hint: 'Rocks forward and back (tails, antennas)' },
      hover: { name: 'Hover spin', len: 4, ease: 'linear', keys: [{ t: 0, r: [0, 0, 0], p: [0, 0, 0] }, { t: 1, r: [0, 90, 0], p: [0, 1, 0] }, { t: 2, r: [0, 180, 0], p: [0, 0, 0] }, { t: 3, r: [0, 270, 0], p: [0, 1, 0] }, { t: 4, r: [0, 360, 0], p: [0, 0, 0] }], hint: 'Spins while floating (halos)' },
      orbit: { name: 'Orbit', len: 3, ease: 'linear', keys: [{ t: 0, p: [3, 0, 0] }, { t: .75, p: [0, 0, 3] }, { t: 1.5, p: [-3, 0, 0] }, { t: 2.25, p: [0, 0, -3] }, { t: 3, p: [3, 0, 0] }], hint: 'Circles around (orbs, pets)' },
      beat: { name: 'Heartbeat', len: 1.2, ease: 'linear', keys: [{ t: 0, s: 1 }, { t: .1, s: 1.2 }, { t: .2, s: 1 }, { t: .3, s: 1.12 }, { t: .45, s: 1 }], hint: 'Two quick pumps, then a rest' },
      jelly: { name: 'Jelly', len: 1, ease: 'elastic', keys: [{ t: 0, s: 1, r: [0, 0, 0] }, { t: .5, s: 1.1, r: [0, 0, 6] }], hint: 'Wobbly and bouncy' }
    };
    const fullKey = k => ({ t: k.t, r: (k.r || [0, 0, 0]).slice(), p: (k.p || [0, 0, 0]).slice(), s: k.s == null ? 1 : k.s });
    let selKey = -1, clip = null;
    const G = () => S.anim && S.anim.groups[AN.sel];
    function slotCenter() { return S.kind === 'voxel' ? S.center.slice() : S.picOff.slice(); }
    function startAnim() {
      KS.pushUndo();
      S.anim = { len: 2, loop: true, groups: [{ name: 'Whole thing', pivot: slotCenter().map(r3), mirror: false, ease: 'smooth', keys: [] }] };
      AN.sel = 0; AN.t = 0; AN.playing = true; AN.at = performance.now();
      afterAnim(); KS.toast('Animation on', 'Pick a preset or add keyframes. Everything moves together until you add parts.', 'ok');
    }
    function afterAnim(keepUi) {
      $$('[data-tool=group],[data-tool=pivot]').forEach(b => b.hidden = !S.anim || KS.getMode() === 'skin');
      if (!S.anim && (KS.getTool() === 'group' || KS.getTool() === 'pivot')) KS.setTool('place');
      after(); if (!keepUi) renderAnim(); renderTimeline();
    }
    HOOKS.onAnim = () => { selKey = -1; setTimeout(() => afterAnim(), 0); };
    HOOKS.togglePlay = () => { togglePlay(); };
    HOOKS.pickPivot = w => { const g = G(); if (!g) return; g.pivot = w.map(r3); KS.setTool('place'); KS.toast('Pivot set', `${g.name} now turns around ${g.pivot.join(', ')}`, 'ok'); afterAnim(); };
    function togglePlay() {
      if (!S.anim) return;
      if (AN.playing) { AN.t = KS.AN.t + (performance.now() - AN.at) / 1000; AN.t %= S.anim.len; AN.playing = false; } else { AN.at = performance.now(); AN.playing = true; }
      renderTimeline(); KS.redraw();
    }
    function curT() { return S.anim ? (AN.playing ? (AN.t + (performance.now() - AN.at) / 1000) % S.anim.len : AN.t) : 0; }
    function seek(t) { AN.t = Math.max(0, Math.min(S.anim.len, t)); if (AN.playing) AN.at = performance.now(); KS.redraw(); updateHead(); fillXf(); }
    function partCount(i) { let n = 0; for (const k of S.vox.keys()) if ((S.part.get(k) || 0) === i) n++; return n; }

    function renderAnim() {
      if (!pane) return;
      pane.innerHTML = '';
      if (!S.anim) {
        pane.append(
          h('div', { class: 'animhero' },
            h('div', { class: 'animdemo' }, h('i'), h('i'), h('i')),
            h('h3', {}, 'Make it move'),
            h('p', {}, 'Spinning halos, flapping wings, bobbing pets, wagging tails. Keyframes play in game for every Kyoto player.'),
            h('button', { class: 'pri wide', onclick: startAnim }, 'Start animating')),
          h('ol', { class: 'steps3' }, h('li', {}, h('b', {}, 'Parts: '), 'split your build into up to 8 moving parts with the part brush.'), h('li', {}, h('b', {}, 'Pivot: '), 'click where each part turns (a wing turns at the shoulder).'), h('li', {}, h('b', {}, 'Keys: '), 'pick a preset, or pose it at a time on the timeline.')));
        return;
      }
      const A = S.anim;
      // parts
      const parts = h('div', { class: 'parts' }, A.groups.map((g, i) => h('div', { class: 'part' + (i === AN.sel ? ' on' : ''), onclick: () => { AN.sel = i; selKey = -1; renderAnim(); renderTimeline(); } },
        h('i', { class: 'pdot', style: 'background:' + KS.PART_COLS[i % 8] }),
        h('span', {}, g.name), h('small', {}, S.kind === 'voxel' ? `${partCount(i)} vox · ${g.keys.length} keys` : `${g.keys.length} keys`))));
      const g = G();
      pane.append(
        h('h4', {}, 'Moving parts ', h('small', {}, S.kind === 'voxel' ? '(new voxels go in the selected part)' : '(pictures move as one part)')),
        parts,
        h('div', { class: 'duo2' },
          h('button', { class: 'pri ghost', disabled: A.groups.length >= 8 || S.kind !== 'voxel', onclick: () => { A.groups.push({ name: 'Part ' + (A.groups.length + 1), pivot: slotCenter().map(r3), mirror: false, ease: 'smooth', keys: [] }); AN.sel = A.groups.length - 1; KS.setTool('group'); AN.tint = true; afterAnim(); KS.toast('New part', 'Drag over voxels with the part brush (G) to move them into it.'); } }, '+ Add part'),
          h('button', { class: 'pri ghost' + (AN.tint ? ' lit' : ''), onclick: () => { AN.tint = !AN.tint; afterAnim(); } }, AN.tint ? 'Hide part colours' : 'Show part colours')),
        S.kind === 'voxel' ? h('button', { class: 'pri wide' + (KS.getTool() === 'group' ? '' : ' ghost'), style: 'margin-top:6px', onclick: () => { KS.setTool('group'); AN.tint = true; afterAnim(); } }, 'Part brush (G): paint voxels into "' + g.name + '"') : null,
        h('h4', {}, 'Selected part'),
        h('div', { class: 'row2' }, h('input', { class: 'tin', value: g.name, maxlength: 20, onchange: e => { g.name = e.target.value.trim().slice(0, 20) || g.name; afterAnim(); } }),
          AN.sel > 0 ? h('button', { class: 'lb', title: 'Delete part (its voxels go back to the first part)', onclick: () => { if (!confirm(`Delete "${g.name}"?`)) return; const i = AN.sel; for (const [k, p] of [...S.part]) { if (p === i) S.part.delete(k); else if (p > i) S.part.set(k, p - 1); } A.groups.splice(i, 1); AN.sel = 0; afterAnim(); } }, icon('trash')) : null),
        h('label', { class: 'sub' }, 'Pivot ', h('small', {}, '(the point it turns and grows around)')),
        h('div', { class: 'trio' }, [0, 1, 2].map(i => h('label', {}, 'XYZ'[i], h('input', { type: 'number', step: .5, value: g.pivot[i], onchange: e => { g.pivot[i] = +e.target.value || 0; afterAnim(true); } })))),
        h('div', { class: 'duo2', style: 'margin-top:6px' },
          h('button', { class: 'pri ghost', disabled: S.kind !== 'voxel', onclick: () => { KS.setTool('pivot'); KS.toast('Set the pivot', 'Click a voxel (or the empty space next to one).'); } }, 'Click to set pivot'),
          h('button', { class: 'pri ghost', onclick: () => { g.pivot = centerOf(AN.sel).map(r3); afterAnim(); } }, 'Centre of part')),
        h('label', { class: 'row' }, h('span', {}, 'Mirrored halves ', h('small', {}, '(left side moves the opposite way: wings)')), h('input', { type: 'checkbox', checked: g.mirror, onchange: e => { g.mirror = e.target.checked; afterAnim(true); } }), h('i', { class: 'sw' })),
        h('label', { class: 'row' }, h('span', {}, 'Easing'), h('select', { class: 'tsel', onchange: e => { g.ease = e.target.value; afterAnim(true); } }, ['smooth', 'linear', 'bounce', 'elastic', 'step'].map(v => h('option', { value: v, selected: g.ease === v }, v[0].toUpperCase() + v.slice(1))))),
        h('h4', {}, 'Presets ', h('small', {}, '(replace this part\'s keys)')),
        h('div', { class: 'presets' }, Object.entries(PRESETS).map(([k, p]) => h('button', { title: p.hint, onclick: () => applyPreset(k) }, h('i', { class: 'pv pv-' + k }), p.name))),
        h('h4', {}, 'Pose at the playhead ', h('small', {}, '(changing a value adds a key)')),
        h('div', { id: 'xform3' }),
        h('h4', {}, 'Clip'),
        h('div', { class: 'duo' }, h('label', {}, 'Length (s)', h('input', { type: 'number', min: .1, max: 30, step: .1, value: A.len, onchange: e => { const nl = Math.max(.1, Math.min(30, +e.target.value || 1)), k = nl / A.len; if (confirm('Stretch the keys to the new length? (Cancel keeps their times)')) for (const gg of A.groups) for (const kk of gg.keys) kk.t = r3(kk.t * k); else for (const gg of A.groups) gg.keys = gg.keys.filter(kk => kk.t <= nl); A.len = nl; AN.t = Math.min(AN.t, nl); afterAnim(); } })),
          h('label', { class: 'row small' }, h('span', {}, 'Loop'), h('input', { type: 'checkbox', checked: A.loop !== false, onchange: e => { A.loop = e.target.checked; afterAnim(true); } }), h('i', { class: 'sw' }))),
        h('button', { class: 'pri ghost danger wide', style: 'margin-top:10px', onclick: () => { if (!confirm('Remove the animation? (Ctrl+Z won\'t bring it back)')) return; S.anim = null; S.part = new Map(); AN.playing = false; AN.tint = false; afterAnim(); } }, 'Remove animation'),
        h('p', { class: 'note' }, 'Space plays/pauses. The animation is saved inside the .kycos, Wear now shows it in game right away.')
      );
      fillXf();
    }
    function centerOf(i) {
      const g0 = KS.gridMin(); let n = 0, c = [0, 0, 0];
      for (const k of S.vox.keys()) if ((S.part.get(k) || 0) === i) { const v = k.split(',').map(Number); for (let j = 0; j < 3; j++) c[j] += g0[j] + (v[j] + .5) * S.vs; n++; }
      return n ? c.map(v => v / n) : slotCenter();
    }
    function applyPreset(k) {
      const p = PRESETS[k], g = G(); if (!g) return;
      g.keys = p.keys.map(fullKey); g.ease = p.ease || 'smooth'; if (p.mirror) g.mirror = true;
      if (Math.abs(S.anim.len - p.len) > 1e-3) {
        if (S.anim.groups.filter(x => x !== g && x.keys.length).length === 0) S.anim.len = p.len;
        else { const m = S.anim.len / p.len; g.keys.forEach(x => { x.t = r3(x.t * m); }); }
      }
      if (k === 'flap' && S.kind === 'voxel') g.pivot = [centerOf(AN.sel)[0], g.pivot[1], g.pivot[2]].map(r3);
      AN.playing = true; AN.at = performance.now(); AN.t = 0; selKey = -1;
      afterAnim(); KS.toast(p.name, p.hint, 'ok');
    }
    // the pose editor: shows the value at the playhead; typing one sets/updates a key there
    function fillXf() {
      const box = $('#xform3'); if (!box || !S.anim) return;
      const g = G(), t = curT(), pose = KS.partPose(g, t) || [0, 0, 0, 0, 0, 0, 1];
      box.innerHTML = '';
      const fld = (label, idx, step) => h('label', {}, label, h('input', { type: 'number', step, value: r3(pose[idx]), onchange: e => setAt(idx, +e.target.value || 0) }));
      box.append(h('div', { class: 'xrow' }, h('span', {}, 'Turn °'), fld('X', 0, 5), fld('Y', 1, 5), fld('Z', 2, 5)),
        h('div', { class: 'xrow' }, h('span', {}, 'Move px'), fld('X', 3, .5), fld('Y', 4, .5), fld('Z', 5, .5)),
        h('div', { class: 'xrow' }, h('span', {}, 'Size ×'), h('label', {}, '', h('input', { type: 'number', step: .05, min: .05, max: 4, value: r3(pose[6]), onchange: e => setAt(6, Math.max(.05, Math.min(4, +e.target.value || 1))) }))));
    }
    function keyAt(g, t, make) {
      let k = g.keys.find(x => Math.abs(x.t - t) < .02);
      if (!k && make) { const pose = KS.partPose(g, t) || [0, 0, 0, 0, 0, 0, 1]; k = { t: r3(t), r: pose.slice(0, 3).map(r3), p: pose.slice(3, 6).map(r3), s: r3(pose[6]) }; g.keys.push(k); g.keys.sort((a, b) => a.t - b.t); if (g.keys.length > 48) { g.keys.pop(); KS.toast('48 keys max', 'per part'); } }
      return k;
    }
    function setAt(idx, v) {
      const g = G(); if (AN.playing) togglePlay();
      const k = keyAt(g, AN.t, true);
      if (idx < 3) k.r[idx] = Math.max(-1440, Math.min(1440, v)); else if (idx < 6) k.p[idx - 3] = Math.max(-48, Math.min(48, v)); else k.s = v;
      selKey = g.keys.indexOf(k); afterAnim(true); renderAnimParts(); fillXf();
    }
    function renderAnimParts() { const ps = pane.querySelectorAll('.part small'); S.anim && S.anim.groups.forEach((g, i) => { if (ps[i]) ps[i].textContent = S.kind === 'voxel' ? `${partCount(i)} vox · ${g.keys.length} keys` : `${g.keys.length} keys`; }); }

    /* ---------- the timeline (docked under the 3D view while the Animate tab is open) ---------- */
    let headEl = null, timeEl = null, trackW = 1;
    function renderTimeline() {
      const show = !!S.anim && $('[data-pane=animate]') && !$('[data-pane=animate]').hidden && KS.getMode() !== 'skin';
      tl.hidden = !show; document.body.classList.toggle('tl-open', show);
      if (!show) return;
      const A = S.anim; tl.innerHTML = '';
      const ctrl = h('div', { class: 'tlctrl' },
        tbtn('first', 'Back to start', () => seek(0)),
        tbtn('prevk', 'Previous key', () => jumpKey(-1)),
        tbtn(AN.playing ? 'pause' : 'play', 'Play / pause (Space)', togglePlay, 'big'),
        tbtn('nextk', 'Next key', () => jumpKey(1)),
        timeEl = h('code', { class: 'tltime' }, ''),
        h('span', { class: 'grow' }),
        tbtn('key', 'Add a key here for the selected part (K)', () => { if (AN.playing) togglePlay(); const k = keyAt(G(), AN.t, true); selKey = G().keys.indexOf(k); afterAnim(true); renderAnimParts(); }),
        tbtn('copy', 'Copy key', () => { const k = G().keys[selKey]; if (k) { clip = fullKey(k); KS.toast('Key copied', 'Move the playhead, then paste.'); } }),
        h('button', { class: 'tb txt', title: 'Paste key at the playhead', onclick: () => { if (!clip) return; const g = G(); g.keys = g.keys.filter(x => Math.abs(x.t - AN.t) >= .02); g.keys.push(Object.assign(fullKey(clip), { t: r3(AN.t) })); g.keys.sort((a, b) => a.t - b.t); afterAnim(true); } }, 'Paste'),
        tbtn('trash', 'Delete selected key (Del)', () => delKey()));
      const rows = h('div', { class: 'tlrows' });
      const ruler = h('div', { class: 'tlruler' });
      const steps = A.len <= 2 ? .1 : A.len <= 6 ? .5 : 1;
      for (let t = 0; t <= A.len + 1e-6; t += steps) ruler.append(h('span', { style: `left:${t / A.len * 100}%`, class: Math.abs(t - Math.round(t)) < 1e-6 ? 'maj' : '' }, Math.abs(t - Math.round(t)) < 1e-6 || A.len <= 2 ? (Math.round(t * 10) / 10) + 's' : ''));
      const tracks = h('div', { class: 'tltracks' }, ruler);
      A.groups.forEach((g, gi) => {
        rows.append(h('div', { class: 'tlname' + (gi === AN.sel ? ' on' : ''), onclick: () => { AN.sel = gi; selKey = -1; renderAnim(); renderTimeline(); } }, h('i', { class: 'pdot', style: 'background:' + KS.PART_COLS[gi % 8] }), g.name));
        const tr = h('div', { class: 'tltrack' + (gi === AN.sel ? ' on' : '') });
        // shaded spans between keys
        g.keys.forEach((k, ki) => {
          const d = h('button', { class: 'kf' + (gi === AN.sel && ki === selKey ? ' sel' : ''), style: `left:${k.t / A.len * 100}%;--c:${KS.PART_COLS[gi % 8]}`, title: `${k.t.toFixed(2)}s` });
          d.onpointerdown = e => {
            e.stopPropagation(); AN.sel = gi; selKey = ki; if (AN.playing) togglePlay(); seek(k.t);
            const rect = tr.getBoundingClientRect(); d.setPointerCapture(e.pointerId); let moved = false;
            d.onpointermove = m => { moved = true; let t = (m.clientX - rect.left) / rect.width * A.len; t = Math.max(0, Math.min(A.len, Math.round(t / .05) * .05)); k.t = r3(t); d.style.left = (t / A.len * 100) + '%'; seek(t); };
            d.onpointerup = () => { d.onpointermove = null; if (moved) { g.keys.sort((a, b) => a.t - b.t); selKey = g.keys.indexOf(k); afterAnim(true); } renderAnim(); renderTimeline(); };
          };
          tr.append(d);
        });
        tracks.append(tr);
      });
      headEl = h('div', { class: 'tlhead' }, h('i'));
      tracks.append(headEl);
      tracks.onpointerdown = e => {
        if (e.target.classList.contains('kf')) return;
        const rect = tracks.getBoundingClientRect(); tracks.setPointerCapture(e.pointerId);
        const go = m => seek(Math.max(0, Math.min(A.len, (m.clientX - rect.left) / rect.width * A.len)));
        if (AN.playing) togglePlay(); go(e);
        tracks.onpointermove = go; tracks.onpointerup = () => { tracks.onpointermove = null; };
      };
      tl.append(ctrl, h('div', { class: 'tlbody' }, h('div', { class: 'tlleft' }, h('div', { class: 'tlrulerpad' }), rows), tracks));
      trackW = 1; updateHead();
    }
    function tbtn(ic, title, fn, cls) { const b = h('button', { class: 'tb' + (cls ? ' ' + cls : ''), title, onclick: fn }); b.innerHTML = ICON[ic]; return b; }
    function updateHead() {
      if (!S.anim || tl.hidden || !headEl) return;
      const t = curT(); headEl.style.left = (t / S.anim.len * 100) + '%';
      if (timeEl) timeEl.textContent = `${t.toFixed(2)} / ${S.anim.len.toFixed(1)}s`;
    }
    (function loop() { if (AN.playing) updateHead(); requestAnimationFrame(loop); })();
    function jumpKey(dir) {
      const g = G(); if (!g || !g.keys.length) return; if (AN.playing) togglePlay();
      const t = AN.t, ks = g.keys;
      let k = dir > 0 ? ks.find(x => x.t > t + .01) : [...ks].reverse().find(x => x.t < t - .01);
      if (!k) k = dir > 0 ? ks[0] : ks[ks.length - 1];
      selKey = ks.indexOf(k); seek(k.t); renderTimeline();
    }
    function delKey() { const g = G(); if (!g || selKey < 0 || !g.keys[selKey]) return; g.keys.splice(selKey, 1); selKey = -1; afterAnim(true); renderTimeline(); renderAnimParts(); fillXf(); }
    addEventListener('keydown', e => {
      if (!S.anim || e.target.matches('input, textarea, select') || tl.hidden) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selKey >= 0) { e.preventDefault(); delKey(); } }
      if (e.key.toLowerCase() === 'k' && !e.ctrlKey) { const k = keyAt(G(), AN.t, true); selKey = G().keys.indexOf(k); afterAnim(true); }
      if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); jumpKey(-1); }
      if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); jumpKey(1); }
    });
    // show the timeline when the Animate tab opens
    $$('[data-pt]').forEach(b => b.addEventListener('click', () => setTimeout(() => { renderTimeline(); if (b.dataset.pt === 'animate') renderAnim(); }, 0)));
    $$('[data-mode]').forEach(b => b.addEventListener('click', () => setTimeout(() => afterAnim(), 0)));
    renderAnim(); afterAnim();
    // keep the pose editor in sync while the playhead moves
    setInterval(() => { if (S.anim && AN.playing && !tl.hidden && !document.activeElement.closest('#xform3')) fillXf(); }, 250);

    /* ================================================================ cape animator (flipbook) ================================================================ */
    // A cape texture is 64x32 (Minecraft's layout). The part people see is the 10x16 outside at (1,1); the inside is at (12,1).
    const FB = (() => { try { return JSON.parse(localStorage.getItem('kyoto.studio.flip') || 'null'); } catch (e) { return null; } })() || { res: 1, fps: 10, frames: [], onion: true, mirrorIn: true };
    let fbFrames = [], fbCur = 0, fbTool = 'pen', fbWin = null, fbPlay = null, fbUndo = [], fbColor = S.color || '#ff8fc8';
    const REG = [ // [x, y, w, h, label]
      [1, 1, 10, 16, 'Outside'], [12, 1, 10, 16, 'Inside'], [0, 1, 1, 16, 'Edge'], [11, 1, 1, 16, 'Edge'], [1, 0, 10, 1, 'Top'], [11, 0, 10, 1, 'Bottom']
    ];
    function fbNew(src) { const R = FB.res, c = document.createElement('canvas'); c.width = 64 * R; c.height = 32 * R; const g = c.getContext('2d', { willReadFrequently: true }); if (src) { g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height); } return { c, g, hold: 1 }; }
    function fbSave() {
      clearTimeout(fbSave.t);
      fbSave.t = setTimeout(() => { try { localStorage.setItem('kyoto.studio.flip', JSON.stringify(Object.assign({}, FB, { frames: fbFrames.map(f => ({ png: f.c.toDataURL(), hold: f.hold })) }))); } catch (e) { /* too big */ } }, 500);
    }
    function fbLoad() {
      return Promise.all((FB.frames || []).map(f => new Promise(res => { const im = new Image(); im.onload = () => { const fr = fbNew(im); fr.hold = f.hold || 1; res(fr); }; im.onerror = () => res(null); im.src = f.png; }))).then(a => { fbFrames = a.filter(Boolean); if (!fbFrames.length) fbFrames = [starterFrame()]; });
    }
    function starterFrame() {
      const f = fbNew(), g = f.g, R = FB.res;
      g.fillStyle = '#2b2440'; g.fillRect(0, R, R, 16 * R); g.fillRect(11 * R, R, R, 16 * R); g.fillRect(R, 0, 10 * R, R); g.fillRect(11 * R, 0, 10 * R, R);
      g.fillStyle = '#4a3a7a'; g.fillRect(R, R, 10 * R, 16 * R); g.fillStyle = '#17171c'; g.fillRect(12 * R, R, 10 * R, 16 * R);
      return f;
    }
    async function openFlip() {
      if (!fbFrames.length) await fbLoad();
      if (fbWin) { fbWin.hidden = false; drawFb(); return; }
      fbWin = h('div', { id: 'fbWin', class: 'fbwin' });
      document.body.append(fbWin);
      buildFb();
    }
    // only the used part of the 64x32 texture is shown (22x17 px), as big as fits
    const Z = () => Math.max(6, Math.floor(Math.min((innerWidth - 330) / (22 * FB.res), (innerHeight - 250) / (17 * FB.res))));
    let fbCanvas = null, fbPrev = null, fbStroke = null;
    function buildFb() {
      fbWin.innerHTML = '';
      const tools = [['pen', 'Pencil'], ['erase', 'Eraser'], ['fill', 'Fill'], ['pick', 'Pick'], ['shade', 'Shade']];
      const colorIn = h('input', { type: 'color', value: fbColor, oninput: e => { fbColor = e.target.value; } });
      fbCanvas = h('canvas', { class: 'fbcanvas' });
      fbPrev = h('canvas', { class: 'fbprev', width: 10 * FB.res, height: 16 * FB.res });
      const strip = h('div', { class: 'fbstrip' });
      const head = h('div', { class: 'fbhead' },
        h('b', {}, 'Cape animator'),
        h('div', { class: 'seg mini' }, tools.map(([k, n]) => h('button', { class: fbTool === k ? 'on' : '', onclick: () => { fbTool = k; buildFb(); } }, n))),
        colorIn,
        h('div', { class: 'fbpal' }, S.palette.slice(0, 16).map(c => h('button', { style: 'background:' + c, title: c, onclick: () => { fbColor = c; colorIn.value = c; } }))),
        h('span', { class: 'grow' }),
        h('label', { class: 'mchk' }, h('input', { type: 'checkbox', checked: FB.onion, onchange: e => { FB.onion = e.target.checked; drawFb(); fbSave(); } }), h('span'), 'Onion skin'),
        h('label', { class: 'mchk', title: 'Whatever you draw outside is copied (mirrored) to the inside' }, h('input', { type: 'checkbox', checked: FB.mirrorIn, onchange: e => { FB.mirrorIn = e.target.checked; fbSave(); } }), h('span'), 'Copy to inside'),
        h('label', { class: 'mini' }, 'Detail', h('select', { onchange: e => setRes(+e.target.value) }, [1, 2, 4].map(r => h('option', { value: r, selected: FB.res === r }, r === 1 ? 'Normal 64×32' : `HD ${64 * r}×${32 * r}`)))),
        h('button', { class: 'lb', title: 'Close', onclick: () => { stopFb(); fbWin.hidden = true; } }, icon('close')));
      const side = h('div', { class: 'fbside' },
        h('div', { class: 'fbprevwrap' }, fbPrev, h('small', {}, 'Live preview')),
        h('label', { class: 'mini' }, 'Speed', h('select', { onchange: e => { FB.fps = +e.target.value; fbSave(); startFb(); } }, [[10, 'Fast (10 fps)'], [5, 'Normal (5 fps)'], [2.5, 'Slow (2.5 fps)']].map(([v, n]) => h('option', { value: v, selected: FB.fps === v }, n)))),
        h('p', { class: 'note' }, 'In game capes play at up to 10 frames a second. "Hold" keeps a frame on screen longer.'),
        h('button', { class: 'pri wide', onclick: applyFb }, 'Put it on the 3D cape'),
        h('button', { class: 'pri ghost wide', onclick: exportGif }, 'Download GIF'),
        h('button', { class: 'pri ghost wide', onclick: () => fbStripPng().then(b => dl(b, 'cape_strip.png')) }, 'Download strip PNG'),
        h('label', { class: 'pri ghost wide filebtn2' }, 'Import GIF / PNG frames', h('input', { type: 'file', accept: 'image/gif,image/png', hidden: true, onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFb(f); } })),
        h('button', { class: 'pri ghost wide danger', onclick: () => { if (!confirm('Start over with one blank frame?')) return; fbFrames = [starterFrame()]; fbCur = 0; buildFb(); fbSave(); } }, 'Start over'));
      const frameBtns = h('div', { class: 'fbfbtns' },
        h('button', { class: 'mini', onclick: () => { fbFrames.splice(fbCur + 1, 0, fbNew()); fbCur++; buildFb(); fbSave(); } }, '+ Blank'),
        h('button', { class: 'mini', onclick: () => { const f = fbNew(fbFrames[fbCur].c); f.hold = fbFrames[fbCur].hold; fbFrames.splice(fbCur + 1, 0, f); fbCur++; buildFb(); fbSave(); } }, 'Duplicate'),
        h('button', { class: 'mini', onclick: () => { if (fbCur > 0) { [fbFrames[fbCur - 1], fbFrames[fbCur]] = [fbFrames[fbCur], fbFrames[fbCur - 1]]; fbCur--; buildFb(); fbSave(); } } }, '←'),
        h('button', { class: 'mini', onclick: () => { if (fbCur < fbFrames.length - 1) { [fbFrames[fbCur + 1], fbFrames[fbCur]] = [fbFrames[fbCur], fbFrames[fbCur + 1]]; fbCur++; buildFb(); fbSave(); } } }, '→'),
        h('label', { class: 'mini' }, 'Hold', h('select', { onchange: e => { fbFrames[fbCur].hold = +e.target.value; fbSave(); buildFb(); } }, [1, 2, 3, 4, 6, 8, 10].map(v => h('option', { value: v, selected: fbFrames[fbCur].hold === v }, v + '×')))),
        h('button', { class: 'mini danger', onclick: () => { if (fbFrames.length < 2) return; fbFrames.splice(fbCur, 1); fbCur = Math.min(fbCur, fbFrames.length - 1); buildFb(); fbSave(); } }, 'Delete'));
      fbFrames.forEach((f, i) => {
        const t = h('canvas', { width: 10 * FB.res, height: 16 * FB.res, class: i === fbCur ? 'on' : '' });
        t.getContext('2d').drawImage(f.c, FB.res, FB.res, 10 * FB.res, 16 * FB.res, 0, 0, 10 * FB.res, 16 * FB.res);
        strip.append(h('button', { class: 'fbthumb' + (i === fbCur ? ' on' : ''), onclick: () => { fbCur = i; buildFb(); } }, t, h('small', {}, (i + 1) + (f.hold > 1 ? ` · ${f.hold}×` : ''))));
      });
      strip.append(h('button', { class: 'fbthumb add', title: 'New frame (copy of this one)', onclick: () => { const f = fbNew(fbFrames[fbCur].c); fbFrames.splice(fbCur + 1, 0, f); fbCur++; buildFb(); fbSave(); } }, '+'));
      fbWin.append(head, h('div', { class: 'fbmain' }, h('div', { class: 'fbstage' }, fbCanvas, h('div', { class: 'fbinfo', id: 'fbInfo' }, 'Frame ' + (fbCur + 1) + ' of ' + fbFrames.length + ' · Ctrl+Z undo · , and . change frame')), side), h('div', { class: 'fbbottom' }, strip, frameBtns));
      wireFbCanvas(); drawFb(); startFb();
    }
    function setRes(r) {
      if (r === FB.res) return;
      if (!confirm('Change the detail? Your frames are rescaled.')) return buildFb();
      const old = fbFrames; FB.res = r; fbFrames = old.map(f => { const n = fbNew(f.c); n.hold = f.hold; return n; }); buildFb(); fbSave();
    }
    function drawFb() {
      if (!fbCanvas) return;
      const R = FB.res, z = Z(), W = 22 * R, H = 17 * R;
      fbCanvas.width = W * z; fbCanvas.height = H * z;
      const g = fbCanvas.getContext('2d'); g.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y += R) for (let x = 0; x < W; x += R) { g.fillStyle = ((x + y) / R) % 2 ? '#24242b' : '#1d1d23'; g.fillRect(x * z, y * z, R * z, R * z); }
      if (FB.onion && fbFrames.length > 1) { g.globalAlpha = .28; g.drawImage(fbFrames[(fbCur - 1 + fbFrames.length) % fbFrames.length].c, 0, 0, W, H, 0, 0, W * z, H * z); g.globalAlpha = 1; }
      g.drawImage(fbFrames[fbCur].c, 0, 0, W, H, 0, 0, W * z, H * z);
      // the corners nothing uses
      g.fillStyle = 'rgba(10,10,14,.8)'; g.fillRect(0, 0, R * z, R * z); g.fillRect(21 * R * z, 0, R * z, R * z);
      if (z >= 8) { g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; for (let x = 0; x <= W; x++) { g.beginPath(); g.moveTo(x * z + .5, 0); g.lineTo(x * z + .5, H * z); g.stroke(); } for (let y = 0; y <= H; y++) { g.beginPath(); g.moveTo(0, y * z + .5); g.lineTo(W * z, y * z + .5); g.stroke(); } }
      REG.forEach(([x, y, w, hh, label], i) => {
        g.strokeStyle = i === 0 ? 'rgba(255,143,200,.95)' : 'rgba(169,139,255,.5)'; g.lineWidth = i === 0 ? 2 : 1;
        g.strokeRect(x * R * z + 1, y * R * z + 1, w * R * z - 2, hh * R * z - 2);
        if (i < 2) { g.font = '700 12px Inter, sans-serif'; const tw = g.measureText(label).width; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x * R * z + 6, (y + hh) * R * z - 24, tw + 10, 18); g.fillStyle = '#fff'; g.fillText(label, x * R * z + 11, (y + hh) * R * z - 11); }
      });
    }
    function fbPixel(e) { const r = fbCanvas.getBoundingClientRect(), R = FB.res; return [Math.floor((e.clientX - r.left) / r.width * 22 * R), Math.floor((e.clientY - r.top) / r.height * 17 * R)]; }
    function fbSet(x, y, rgba) {
      const R = FB.res, f = fbFrames[fbCur];
      if (x < 0 || y < 0 || x >= 22 * R || y >= 17 * R) return;
      const put = (X, Y) => { if (rgba[3] === 0) f.g.clearRect(X, Y, 1, 1); else { const id = f.g.createImageData(1, 1); id.data.set(rgba); f.g.putImageData(id, X, Y); } };
      put(x, y);
      // outside -> inside, mirrored (the inside is seen from behind)
      if (FB.mirrorIn && x >= R && x < 11 * R && y >= R && y < 17 * R) { const ix = 12 * R + (11 * R - 1 - x); const c = rgba.slice(); if (c[3]) { c[0] *= .62; c[1] *= .62; c[2] *= .62; } put(ix, y); if (c[3]) { const id = f.g.createImageData(1, 1); id.data.set(c.map(Math.round)); f.g.putImageData(id, ix, y); } }
    }
    function wireFbCanvas() {
      fbCanvas.oncontextmenu = e => e.preventDefault();
      fbCanvas.onpointerdown = e => {
        e.preventDefault(); fbCanvas.setPointerCapture(e.pointerId);
        const f = fbFrames[fbCur]; fbUndo.push({ i: fbCur, img: f.g.getImageData(0, 0, f.c.width, f.c.height) }); if (fbUndo.length > 60) fbUndo.shift();
        fbStroke = { seen: new Set(), last: null, right: e.button === 2 };
        fbAt(e, true);
        fbCanvas.onpointermove = m => fbAt(m, false);
        fbCanvas.onpointerup = () => { fbCanvas.onpointermove = null; fbStroke = null; fbSave(); buildStripThumb(); };
      };
    }
    function buildStripThumb() { const t = fbWin.querySelectorAll('.fbthumb canvas')[fbCur]; if (t) { const g = t.getContext('2d'); g.clearRect(0, 0, t.width, t.height); g.drawImage(fbFrames[fbCur].c, FB.res, FB.res, 10 * FB.res, 16 * FB.res, 0, 0, t.width, t.height); } }
    function fbAt(e, first) {
      const [x, y] = fbPixel(e), f = fbFrames[fbCur], hex = KS.hexRgb(fbColor), rgba = [hex[0] * 255 | 0, hex[1] * 255 | 0, hex[2] * 255 | 0, 255];
      const tool = fbStroke.right ? 'erase' : fbTool;
      if (tool === 'pick') { const d = f.g.getImageData(x, y, 1, 1).data; if (d[3]) { fbColor = KS.rgbHex(d[0], d[1], d[2]); fbWin.querySelector('input[type=color]').value = fbColor; fbTool = 'pen'; buildFb(); } return; }
      if (tool === 'fill') {
        if (!first) return;
        const W = f.c.width, Hh = f.c.height, img = f.g.getImageData(0, 0, W, Hh), at = (X, Y) => (Y * W + X) * 4, from = [...img.data.slice(at(x, y), at(x, y) + 4)].join();
        if (from === rgba.join()) return;
        // stay inside the region you clicked
        const reg = REG.find(([rx, ry, rw, rh]) => x >= rx * FB.res && y >= ry * FB.res && x < (rx + rw) * FB.res && y < (ry + rh) * FB.res); if (!reg) return;
        const [rx, ry, rw, rh] = reg.map((v, i) => i < 4 ? v * FB.res : v), st = [[x, y]], seen = new Set();
        while (st.length) { const [X, Y] = st.pop(), k = X + ',' + Y; if (seen.has(k) || X < rx || Y < ry || X >= rx + rw || Y >= ry + rh) continue; seen.add(k); if ([...img.data.slice(at(X, Y), at(X, Y) + 4)].join() !== from) continue; fbSet(X, Y, rgba); img.data.set(rgba, at(X, Y)); st.push([X + 1, Y], [X - 1, Y], [X, Y + 1], [X, Y - 1]); }
        drawFb(); return;
      }
      // pencil / eraser / shade, with lines between mouse events so fast strokes have no gaps
      const pts = []; const L = fbStroke.last || [x, y]; const n = Math.max(Math.abs(x - L[0]), Math.abs(y - L[1]), 1);
      for (let i = 1; i <= n; i++) pts.push([Math.round(L[0] + (x - L[0]) * i / n), Math.round(L[1] + (y - L[1]) * i / n)]);
      if (first) pts.unshift([x, y]);
      fbStroke.last = [x, y];
      for (const [X, Y] of pts) {
        if (tool === 'erase') fbSet(X, Y, [0, 0, 0, 0]);
        else if (tool === 'shade') { const k = X + ',' + Y; if (fbStroke.seen.has(k)) continue; fbStroke.seen.add(k); const d = f.g.getImageData(X, Y, 1, 1).data; if (!d[3]) continue; fbSet(X, Y, [...KS.shadeRgb(d[0], d[1], d[2], (KS.shadeOpt.mode === 'darken') !== e.shiftKey), 255]); }
        else fbSet(X, Y, rgba);
      }
      drawFb();
    }
    function startFb() {
      stopFb(); let i = 0, held = 0;
      const tick = () => {
        if (!fbWin || fbWin.hidden) return;
        const f = fbFrames[i % fbFrames.length]; if (!f) return;
        const g = fbPrev.getContext('2d'), R = FB.res; g.clearRect(0, 0, fbPrev.width, fbPrev.height); g.drawImage(f.c, R, R, 10 * R, 16 * R, 0, 0, 10 * R, 16 * R);
        if (++held >= f.hold) { held = 0; i++; }
      };
      tick(); fbPlay = setInterval(tick, 1000 / FB.fps);
    }
    function stopFb() { if (fbPlay) clearInterval(fbPlay); fbPlay = null; }
    /** All frames as one vertical strip (what the mod plays at 10 fps): holds and speed become repeated frames. */
    function fbStrip() {
      const rep = 10 / FB.fps, seq = [];
      for (const f of fbFrames) for (let k = 0; k < Math.round(f.hold * rep); k++) seq.push(f);
      const frames = seq.slice(0, 120), R = FB.res, out = document.createElement('canvas');
      out.width = 64 * R; out.height = 32 * R * frames.length;
      const g = out.getContext('2d'); frames.forEach((f, i) => g.drawImage(f.c, 0, i * 32 * R));
      return { out, n: frames.length };
    }
    const fbStripPng = () => new Promise(r => fbStrip().out.toBlob(r, 'image/png'));
    function applyFb() {
      const { out, n } = fbStrip();
      KS.useCapeStrip(out, n, (S.name || 'cape').replace(/[^\w-]+/g, '_'));
      stopFb(); fbWin.hidden = true;
      const capeTab = $('[data-pt=cape]'); if (capeTab && KS.getMode() !== 'skin') capeTab.click();
      KS.cam.yaw = Math.PI; KS.cam.pitch = .15; KS.redraw();
      KS.toast(n > 1 ? `Animated cape: ${fbFrames.length} frames` : 'Cape ready', 'Use as my cape or post it from the Cape tab.', 'ok');
    }
    function exportGif() {
      if (!window.KGIF) return;
      const frames = fbFrames.map(f => f.g.getImageData(0, 0, f.c.width, f.c.height));
      const bytes = window.KGIF.encode(frames, { delays: fbFrames.map(f => f.hold * 1000 / FB.fps) });
      dl(new Blob([bytes], { type: 'image/gif' }), (S.name || 'cape').replace(/[^\w-]+/g, '_') + '_cape.gif');
    }
    async function importFb(file) {
      let imgs = [];
      if (/gif$/i.test(file.type) && 'ImageDecoder' in window) {
        try {
          const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' }); await dec.tracks.ready;
          for (let i = 0; i < Math.min(60, dec.tracks.selectedTrack.frameCount); i++) { const { image } = await dec.decode({ frameIndex: i }); const c = document.createElement('canvas'); c.width = image.displayWidth; c.height = image.displayHeight; c.getContext('2d').drawImage(image, 0, 0); imgs.push(c); image.close(); }
        } catch (e) { imgs = []; }
      }
      if (!imgs.length) { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }).catch(() => null); if (!im) return KS.toast('Couldn\'t read that', file.name, 'bad'); imgs = [im]; }
      const first = imgs[0], layout = Math.abs(first.width / first.height - 2) < .01; // already a cape layout
      // a tall strip of cape frames (64x32 each)?
      if (imgs.length === 1 && first.width * 2 < first.height && Math.abs((first.height / (first.width / 2)) % 1) < .01) {
        const n = first.height / (first.width / 2), fw = first.width, fh = first.width / 2; imgs = [];
        for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = fw; c.height = fh; c.getContext('2d').drawImage(first, 0, i * fh, fw, fh, 0, 0, fw, fh); imgs.push(c); }
        fbFrames = imgs.map(c => fbNew(c));
      } else if (layout) fbFrames = imgs.map(c => fbNew(c));
      else fbFrames = imgs.map(im => { // any picture: fit it onto the outside
        const f = starterFrame(), R = FB.res, k = Math.max(10 * R / im.width, 16 * R / im.height), sw = 10 * R / k, sh = 16 * R / k;
        f.g.imageSmoothingEnabled = true; f.g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, R, R, 10 * R, 16 * R); return f;
      });
      fbCur = 0; buildFb(); fbSave(); KS.toast('Imported', `${fbFrames.length} frame${fbFrames.length > 1 ? 's' : ''}`, 'ok');
    }
    addEventListener('keydown', e => {
      if (!fbWin || fbWin.hidden || e.target.matches('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); const u = fbUndo.pop(); if (u && fbFrames[u.i]) { fbFrames[u.i].g.putImageData(u.img, 0, 0); fbCur = u.i; buildFb(); fbSave(); } }
      if (e.key === ',') { fbCur = (fbCur - 1 + fbFrames.length) % fbFrames.length; buildFb(); }
      if (e.key === '.') { fbCur = (fbCur + 1) % fbFrames.length; buildFb(); }
      if (e.key === 'Escape') { stopFb(); fbWin.hidden = true; }
      const tm = { b: 'pen', e: 'erase', f: 'fill', i: 'pick', s: 'shade' }[e.key.toLowerCase()];
      if (tm && !e.ctrlKey) { e.stopImmediatePropagation(); fbTool = tm; buildFb(); }
    }, true);
    addEventListener('resize', () => { if (fbWin && !fbWin.hidden) drawFb(); });
    if ($('#flipBtn')) $('#flipBtn').onclick = openFlip;
    function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }

    /* ================================================================ collab link (live co-editing) ================================================================ */
    const API = (window.KS_HOOKS.server || '').replace(/\/$/, '');
    const cid = (() => { let v = sessionStorage.getItem('kyoto.collab.cid'); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); sessionStorage.setItem('kyoto.collab.cid', v); } return v; })();
    const C = { code: null, host: false, seq: 0, members: [], timer: null, base: null, busy: false, outbox: [], snapAt: 0, fails: 0, locked: false };
    async function post(path, body) {
      const headers = { 'Content-Type': 'application/json' }; const tok = localStorage.getItem('kyoto.token'); if (tok) headers.Authorization = 'Bearer ' + tok;
      const r = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify(Object.assign({ cid }, body)) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Server error'); return j;
    }
    // what we share: everything about the project except the camera and tool
    const metaOf = () => JSON.stringify({ name: S.name, slot: S.slot, kind: S.kind, mirror: S.mirror, n: S.n, vs: S.vs, center: S.center, picSize: S.picSize, picOff: S.picOff, picRot: S.picRot, anim: S.anim, arms: KS.getArms(), palette: S.palette });
    const layerSig = () => JSON.stringify(SL.list.map(l => [l.uid, l.name, l.vis, l.op, l.blend, l.lock]));
    function takeBase() {
      C.base = { meta: metaOf(), pic: S.pic || '', vox: new Map(S.vox), part: new Map(S.part), sig: layerSig(), px: new Map(SL.list.map(l => [l.uid, l.g.getImageData(0, 0, 64, 64).data.slice()])) };
    }
    function fullState() { return { meta: metaOf(), pic: S.pic || '', vox: [...S.vox], part: [...S.part], layers: KS.layersJson() }; }
    function diffOps() {
      const B = C.base, ops = [];
      const meta = metaOf(); if (meta !== B.meta) { ops.push({ t: 'meta', d: meta }); B.meta = meta; }
      if ((S.pic || '') !== B.pic) { ops.push({ t: 'pic', d: S.pic || '' }); B.pic = S.pic || ''; }
      let set = [], del = [];
      for (const [k, c] of S.vox) { const p = S.part.get(k) || 0; if (B.vox.get(k) !== c || (B.part.get(k) || 0) !== p) set.push([k, c, p]); }
      for (const k of B.vox.keys()) if (!S.vox.has(k)) del.push(k);
      for (let i = 0; i < set.length || i < del.length; i += 3000) ops.push({ t: 'vox', set: set.slice(i, i + 3000), del: del.slice(i, i + 3000) });
      if (set.length || del.length) { B.vox = new Map(S.vox); B.part = new Map(S.part); }
      const sig = layerSig();
      if (sig !== B.sig) { ops.push({ t: 'layers', d: KS.layersJson() }); B.sig = sig; B.px = new Map(SL.list.map(l => [l.uid, l.g.getImageData(0, 0, 64, 64).data.slice()])); }
      else for (const l of SL.list) {
        const now = l.g.getImageData(0, 0, 64, 64).data, was = B.px.get(l.uid); if (!was) continue;
        const d = [];
        for (let i = 0; i < now.length; i += 4) if (now[i] !== was[i] || now[i + 1] !== was[i + 1] || now[i + 2] !== was[i + 2] || now[i + 3] !== was[i + 3]) d.push(i / 4, now[i], now[i + 1], now[i + 2], now[i + 3]);
        if (d.length) { ops.push({ t: 'px', id: l.uid, d }); B.px.set(l.uid, now.slice()); }
      }
      return ops;
    }
    let applying = false;
    async function applyOps(list) {
      if (!list.length) return;
      applying = true;
      let voxDirty = false, skinDirty = false, metaDirty = false;
      for (const { op } of list) {
        if (op.t === 'meta') { const m = JSON.parse(op.d); Object.assign(S, { name: m.name, slot: m.slot, kind: m.kind, mirror: m.mirror, n: m.n, vs: m.vs, center: m.center, picSize: m.picSize, picOff: m.picOff, picRot: m.picRot, anim: m.anim, palette: m.palette || S.palette }); if (m.arms && m.arms !== KS.getArms()) KS.setArmsRaw(m.arms); metaDirty = true; C.base.meta = op.d; }
        else if (op.t === 'pic') { S.pic = op.d || null; C.base.pic = op.d || ''; metaDirty = true; if (S.pic) { const i = new Image(); i.onload = () => { KS.redraw(); }; i.src = S.pic; } }
        else if (op.t === 'vox') { for (const [k, c, p] of op.set || []) { S.vox.set(k, c); if (p) S.part.set(k, p); else S.part.delete(k); C.base.vox.set(k, c); if (p) C.base.part.set(k, p); else C.base.part.delete(k); } for (const k of op.del || []) { S.vox.delete(k); S.part.delete(k); C.base.vox.delete(k); C.base.part.delete(k); } voxDirty = true; }
        else if (op.t === 'layers') { await KS.loadLayersJson(op.d); skinDirty = true; C.base.sig = layerSig(); C.base.px = new Map(SL.list.map(l => [l.uid, l.g.getImageData(0, 0, 64, 64).data.slice()])); }
        else if (op.t === 'px') {
          const l = SL.list.find(x => x.uid === op.id); if (!l) continue;
          const img = l.g.getImageData(0, 0, 64, 64), d = op.d;
          for (let i = 0; i < d.length; i += 5) img.data.set([d[i + 1], d[i + 2], d[i + 3], d[i + 4]], d[i] * 4);
          l.g.putImageData(img, 0, 0); C.base.px.set(l.uid, img.data.slice()); skinDirty = true;
        }
      }
      if (metaDirty) { KS.setSlot(S.slot, true); KS.setKind(S.kind); KS.syncInputs(); KS.renderPalette(); KS.buildLines(); KS.buildPic(); if (S.pic && list.some(x => x.op.t === 'pic')) reloadPic(); renderAnim(); renderTimeline(); $$('[data-tool=group],[data-tool=pivot]').forEach(b => b.hidden = !S.anim || KS.getMode() === 'skin'); if (KS.getMode() === 'skin') { $('#slotLabel').textContent = 'Skin'; $('#kindLabel').textContent = 'Painting'; } }
      if (voxDirty || metaDirty) { KS.buildVox(); KS.save(); }
      if (skinDirty) { KS.updateSkinTex(); renderLayers(); }
      KS.redraw(); applying = false;
    }
    function reloadPic() { /* builder reloads its texture through the picture input path */ if (KS.loadPicTex) KS.loadPicTex(); }
    async function loadFull(st) {
      if (!st || !st.meta) return;
      const ops = [{ op: { t: 'meta', d: st.meta } }, { op: { t: 'pic', d: st.pic || '' } }];
      S.vox = new Map(st.vox || []); S.part = new Map(st.part || []);
      takeBase();
      await applyOps(ops);
      if (st.layers) await KS.loadLayersJson(st.layers);
      KS.buildVox(); KS.frameView(); takeBase(); renderLayers();
    }
    async function tick() {
      if (!C.code || C.busy) return; C.busy = true;
      try {
        const ops = applying ? [] : diffOps();
        const r = await post('/collab/sync', { code: C.code, since: C.seq, ops, cursor: KS.hoverWorld(), mode: KS.getMode() });
        C.fails = 0;
        if (r.gone) { leave(true); KS.toast('Live session ended', 'The room closed.', 'bad'); return; }
        if (r.resync) { await loadFull(JSON.parse(r.snapshot)); await applyOps(r.ops || []); C.seq = r.seq; }
        else { await applyOps(r.ops || []); C.seq = r.seq; }
        C.members = r.members || []; C.locked = !!r.locked; renderPresence();
        if (C.host && Date.now() - C.snapAt > 20000) { C.snapAt = Date.now(); post('/collab/snapshot', { code: C.code, seq: C.seq, state: fullState() }).catch(() => {}); }
      } catch (e) { if (++C.fails === 4) KS.toast('Live connection trouble', 'Still trying…', 'bad'); }
      finally { C.busy = false; }
    }
    async function startCollab() {
      try {
        const r = await post('/collab/create', { state: fullState(), mode: KS.getMode() });
        C.code = r.code; C.host = true; C.seq = 0; C.snapAt = Date.now(); takeBase(); C.members = r.members; run(); renderPresence(); shareModal();
      } catch (e) { KS.toast('Couldn\'t start a live session', e.message, 'bad'); }
    }
    async function joinCollab(code) {
      code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) return KS.toast('That code looks wrong', 'Codes are 6 letters and numbers.', 'bad');
      try {
        const r = await post('/collab/join', { code, mode: KS.getMode() });
        if (S.vox.size && !confirm('Joining loads their project here. Your current one is replaced (export it first if you want to keep it). Join?')) return;
        C.code = r.code; C.host = !!r.host; C.seq = 0;
        await loadFull(JSON.parse(r.snapshot)); await applyOps(r.ops || []); C.seq = r.seq;
        C.members = r.members; run(); renderPresence(); KS.closeModal();
        KS.toast('You\'re in', `Live with ${r.members.filter(m => m.id !== cid).map(m => m.name).join(', ') || 'nobody yet'}.`, 'ok');
        history.replaceState(null, '', location.pathname + '?collab=' + C.code);
      } catch (e) { KS.toast('Couldn\'t join', e.message, 'bad'); }
    }
    function run() { clearInterval(C.timer); C.timer = setInterval(tick, 700); }
    function leave(silent) {
      if (!C.code) return; const code = C.code;
      clearInterval(C.timer); C.code = null; C.members = []; renderPresence(); $('#cursors').innerHTML = '';
      if (!silent) post('/collab/leave', { code, close: C.host && confirm('Close the room for everyone? (Cancel leaves it open for them)') }).catch(() => {});
      if (/collab=/.test(location.search)) history.replaceState(null, '', location.pathname);
    }
    const linkOf = code => (API || location.origin) + '/builder?collab=' + code;
    function shareModal() {
      const link = linkOf(C.code);
      KS.modal(`<h2>Live session</h2><p>Send this link (or the code) to friends. Everyone edits the same skin or cosmetic at once and sees each other's cursors. Up to 8 people, no account needed to join.</p>
        <div class="codebig">${C.code}</div>
        <div class="linkrow"><input readonly value="${KS.esc(link)}" id="collabLink"><button class="pri" id="copyLink">Copy link</button></div>
        <label class="row" style="margin-top:10px"><span>Lock the room (no new people)</span><input type="checkbox" id="lockRoom" ${C.locked ? 'checked' : ''} ${C.host ? '' : 'disabled'}><i class="sw"></i></label>
        <div class="mrow"><button class="pri ghost danger" id="leaveLive">Leave</button><button class="pri" data-close>Keep editing</button></div>`);
      $('#copyLink').onclick = () => { navigator.clipboard.writeText(link).then(() => KS.toast('Link copied', 'Paste it to your friends.', 'ok')); };
      $('#lockRoom').onchange = e => post('/collab/lock', { code: C.code, locked: e.target.checked }).then(r => { C.locked = r.locked; KS.toast(r.locked ? 'Room locked' : 'Room open', ''); }).catch(err => KS.toast('Couldn\'t', err.message, 'bad'));
      $('#leaveLive').onclick = () => { KS.closeModal(); leave(); KS.toast('Left the live session', 'Your copy stays here.'); };
    }
    function collabModal() {
      if (C.code) return shareModal();
      KS.modal(`<h2>Edit live with friends</h2><p>Start a session and send the link. Everyone sees changes as they happen: voxels, skin pixels, layers, animation, everything.</p>
        <div class="mrow" style="justify-content:flex-start"><button class="pri" id="startLive">Start a live session</button></div>
        <h4 style="margin:18px 0 6px">Got a code?</h4><div class="linkrow"><input id="joinCode" placeholder="ABC123" maxlength="6" style="text-transform:uppercase;letter-spacing:.2em;font-weight:700"><button class="pri ghost" id="joinLive">Join</button></div>`);
      $('#startLive').onclick = () => { KS.closeModal(); startCollab(); };
      $('#joinLive').onclick = () => joinCollab($('#joinCode').value);
      $('#joinCode').onkeydown = e => { if (e.key === 'Enter') joinCollab(e.target.value); };
    }
    $('#collabBtn').onclick = collabModal;
    function renderPresence() {
      const p = $('#presence'); if (!p) return;
      p.hidden = !C.code; $('#collabBtn').classList.toggle('live', !!C.code); $('#collabBtn').textContent = C.code ? 'Live · ' + C.code : 'Live';
      p.innerHTML = '';
      for (const m of C.members) p.append(h('span', { class: 'pav' + (m.id === cid ? ' me' : ''), style: '--c:' + m.color, title: m.name + (m.host ? ' (host)' : '') + (m.id === cid ? ' (you)' : '') + (m.mode ? ` · ${m.mode}` : '') }, m.name.replace(/^Guest /, '').slice(0, 2).toUpperCase()));
    }
    // remote cursors: a dot + name, projected onto the 3D view every frame
    const curBox = $('#cursors');
    (function drawCursors() {
      if (C.code && curBox) {
        const others = C.members.filter(m => m.id !== cid && m.cursor && m.cursor.length === 3 && m.mode === KS.getMode());
        while (curBox.children.length > others.length) curBox.lastChild.remove();
        while (curBox.children.length < others.length) curBox.append(h('div', { class: 'rcur' }, h('i'), h('span')));
        others.forEach((m, i) => {
          const el = curBox.children[i], p = KS.project(m.cursor);
          if (!p) { el.hidden = true; return; } el.hidden = false;
          el.style.transform = `translate(${p[0]}px, ${p[1]}px)`; el.style.setProperty('--c', m.color); el.lastChild.textContent = m.name;
        });
      }
      requestAnimationFrame(drawCursors);
    })();
    addEventListener('beforeunload', () => { if (C.code) navigator.sendBeacon && navigator.sendBeacon(API + '/collab/leave', new Blob([JSON.stringify({ cid, code: C.code })], { type: 'application/json' })); });
    const qc = new URLSearchParams(location.search).get('collab');
    if (qc) setTimeout(() => joinCollab(qc), 300);
    HOOKS.joinCollab = joinCollab;
  });
})();
