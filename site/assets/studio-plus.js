/* Kyoto Studio extras (website + desktop app): templates, shapes, move/flip tools, a step-by-step tutorial,
 * logging in with your /kyoto link code, and posting to the Store with automatic photos. Runs after builder.js. */
'use strict';
(() => {
  const HOOKS = window.KS_HOOKS = window.KS_HOOKS || {};
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ready = fn => (window.KS && window.KS.started) ? fn() : document.addEventListener('ks-ready', fn, { once: true });
  const K = () => window.KS;

  /* ======================================== templates (templates.js) ======================================== */
  const TPL = window.KS_TPL, T = TPL.list, tplData = t => TPL.data(T.indexOf(t)), iso = TPL.iso;
  function useTemplate(i) {
    const ks = K(); if (ks.getMode() !== 'cosmetic') ks.setMode('cosmetic');
    ks.pushUndo(); ks.loadKycos(tplData(T[i])); ks.closeModal();
    ks.toast(T[i].name + ' added', 'Change it however you like. Ctrl+Z takes it back.', 'ok');
  }
  function templates() {
    const ks = K();
    ks.modal(`<h2>Start from a template</h2><p>Pick one, then make it yours: recolour it, add to it, or take bits away.</p>
      <div class="tpls">${T.map((t, i) => `<button class="tpl" data-tpl="${i}"><canvas width="200" height="150"></canvas><b>${ks.esc(t.name)}</b><small>${ks.esc(t.desc)}</small><i>${ks.esc(ks.SLOT_NAMES[t.slot])}</i></button>`).join('')}</div>`);
    $$('[data-tpl]').forEach(b => { iso(b.querySelector('canvas'), tplData(T[Number(b.dataset.tpl)])); b.onclick = () => useTemplate(Number(b.dataset.tpl)); });
  }
  HOOKS.useTemplate = useTemplate;

  /* ======================================== shapes + move / flip ======================================== */
  function shape(kind) {
    const ks = K(), S = ks.S;
    if (ks.getMode() !== 'cosmetic' || S.kind !== 'voxel') return;
    const size = Math.max(1, Math.min(24, Number($('#shSize').value) || 6)), hollow = $('#shHollow').checked;
    const c = S.n.map(v => Math.floor(v / 2)), r = size / 2, h0 = Math.floor(size / 2);
    ks.pushUndo(); let added = 0;
    const put = (x, y, z) => { if (x < 0 || y < 0 || z < 0 || x >= S.n[0] || y >= S.n[1] || z >= S.n[2]) return; S.vox.set(ks.key(x, y, z), S.color); added++; };
    for (let dx = -h0; dx < size - h0; dx++) for (let dy = -h0; dy < size - h0; dy++) for (let dz = -h0; dz < size - h0; dz++) {
      const x = dx + .5 - (size % 2 ? .5 : 0), y = dy + .5 - (size % 2 ? .5 : 0), z = dz + .5 - (size % 2 ? .5 : 0);
      const edge = (a, lo, hi) => a === lo || a === hi;
      let on = false;
      if (kind === 'cube') on = !hollow || edge(dx, -h0, size - h0 - 1) || edge(dy, -h0, size - h0 - 1) || edge(dz, -h0, size - h0 - 1);
      else if (kind === 'sphere') { const d = Math.hypot(x, y, z); on = d <= r && (!hollow || d > r - 1.1); }
      else if (kind === 'ring') { const d = Math.hypot(x, z); on = dy === 0 && Math.abs(d - (r - .5)) < .62; }
      else if (kind === 'cylinder') { const d = Math.hypot(x, z); on = d <= r && (!hollow || d > r - 1.1 || edge(dy, -h0, size - h0 - 1)); }
      else if (kind === 'pyramid') { const lvl = dy + h0, half = (size - lvl) / 2; on = Math.abs(x) <= half && Math.abs(z) <= half && (!hollow || Math.abs(x) > half - 1 || Math.abs(z) > half - 1 || lvl === 0); }
      else if (kind === 'line') on = dy === 0 && dz === 0;
      if (on) put(c[0] + dx, c[1] + dy, c[2] + dz);
    }
    ks.changed();
    ks.toast(added ? 'Added a ' + kind : 'Didn\'t fit', added ? 'Use Move to slide it into place. Ctrl+Z to undo.' : 'Make the build space bigger or the shape smaller.', added ? 'ok' : 'bad');
  }
  function transform(fn) {
    const ks = K(), S = ks.S; if (!S.vox.size) return ks.toast('Nothing to move yet', 'Place some voxels first.');
    ks.pushUndo(); const out = new Map(); let lost = 0;
    for (const [k, c] of S.vox) {
      const p = fn(k.split(',').map(Number));
      if (p.some((v, i) => v < 0 || v >= S.n[i])) { lost++; continue; }
      out.set(ks.key(...p), c);
    }
    S.vox = out; ks.changed();
    if (lost) ks.toast(lost + ' voxels fell off the edge', 'Ctrl+Z to undo, or make the build space bigger.', 'bad');
  }
  function recolour() {
    const ks = K(), S = ks.S; const cols = [...new Set(S.vox.values())]; if (!cols.length) return;
    ks.modal(`<h2>Recolour</h2><p>Click a colour in your build to swap it for your current colour <span class="sw1" style="background:${S.color}"></span>.</p>
      <div class="recols">${cols.map(c => `<button data-rc="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>`);
    $$('[data-rc]').forEach(b => b.onclick = () => { ks.pushUndo(); for (const [k, c] of S.vox) if (c === b.dataset.rc) S.vox.set(k, S.color); ks.changed(); ks.closeModal(); });
  }
  function hollowOut() {
    const ks = K(), S = ks.S, inner = [];
    for (const k of S.vox.keys()) { const [x, y, z] = k.split(',').map(Number); if ([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].every(d => S.vox.has(ks.key(x + d[0], y + d[1], z + d[2])))) inner.push(k); }
    if (!inner.length) return ks.toast('Already hollow', 'No hidden voxels inside.');
    ks.pushUndo(); inner.forEach(k => S.vox.delete(k)); ks.changed(); ks.toast('Removed ' + inner.length + ' hidden voxels', 'Lighter file, same look.', 'ok');
  }

  /* ======================================== tutorial ======================================== */
  const TOURS = {
    cosmetic: [
      ['.modes', 'What are you making?', 'Paint a <b>Skin</b>, or build a <b>Cosmetic</b> (hats, wings, backpacks...) that floats on your player.'],
      ['#slotSeg', 'Where it goes', 'Head follows where you look, Back stays on your body, Arm and Leg swing when you walk.'],
      ['#tools', 'Your tools', '<b>Place</b> adds blocks, <b>Erase</b> removes them, <b>Paint</b> recolours, <b>Pick</b> grabs a colour, <b>Fill</b> paints a whole patch. The letters are shortcuts.'],
      ['.view', 'Build on the player', 'Left click on the player to stick your first block on. <b>Right drag</b> spins the camera, the <b>wheel</b> zooms.'],
      ['#shapes', 'Shapes', 'In a hurry? Drop a whole cube, sphere or ring in, then move it into place with the arrows.'],
      ['[data-pt="colors"]', 'Colours', 'Pick any colour here. Shades of your colour are made for you.'],
      ['#tplBtn', 'Templates', 'Or start from a crown, halo, ears, wings and more.'],
      ['[data-act="wear"]', 'Wear it', 'Puts it on you in game right away. Every Kyoto player sees it.'],
      ['[data-act="post"]', 'Share it', 'Post it to the Kyoto Store with photos. Free, or for coins.']
    ],
    skin: [
      ['.modes', 'Skin mode', 'Paint your own Minecraft skin, like Skindex.'],
      ['#layerSeg', 'Two layers', 'The <b>base</b> is your body. The <b>outer layer</b> is the 3D bits on top: hat, jacket, sleeves, pants.'],
      ['#tools', 'Brushes', '<b>Pencil</b>, <b>Eraser</b>, <b>Fill</b> and <b>Pick</b>. Turn on mirror to paint both sides at once.'],
      ['.view', 'Paint in 3D', 'Click right on the model. The grid shows every pixel you can paint. Right drag to spin it.'],
      ['#skin2d', 'Or paint flat', 'This is the real skin file. Paint here too, both views update together.'],
      ['[data-pt="character"]', 'Hide parts', 'In <b>Body</b> you can hide any arm, leg or 3D layer to reach the pixels behind it.'],
      ['[data-act="wear"]', 'Wear it', 'Sets it as your Kyoto skin, or download the PNG for minecraft.net.']
    ]
  };
  let tour = null;
  function startTour() {
    const ks = K(); endTour();
    const steps = TOURS[ks.getMode() === 'skin' ? 'skin' : 'cosmetic'];
    const ov = document.createElement('div'); ov.className = 'tour'; ov.innerHTML = '<div class="tour-hole"></div><div class="tour-tip"><small></small><h3></h3><p></p><div class="tour-row"><button class="pri ghost" data-t="skip">Skip</button><span></span><button class="pri ghost" data-t="back">Back</button><button class="pri" data-t="next">Next</button></div></div>';
    document.body.appendChild(ov); tour = { i: 0, steps, ov };
    ov.querySelector('[data-t="skip"]').onclick = endTour;
    ov.querySelector('[data-t="back"]').onclick = () => show(tour.i - 1);
    ov.querySelector('[data-t="next"]').onclick = () => show(tour.i + 1);
    addEventListener('resize', place);
    show(0);
  }
  function show(i) {
    if (!tour) return;
    if (i >= tour.steps.length) { endTour(); localStorage.setItem('kyoto.studio.toured', '1'); K().toast('You\'re ready', 'Help (top bar) has every shortcut. Have fun!', 'ok'); return; }
    tour.i = Math.max(0, i);
    const [sel, title, text] = tour.steps[tour.i];
    const target = $(sel);
    if (target && target.closest('[data-pane]') && target.closest('[data-pane]').hidden) { const pane = target.closest('[data-pane]').dataset.pane; const tab = $(`[data-pt="${pane}"]`); if (tab) tab.click(); }
    const tip = tour.ov.querySelector('.tour-tip');
    tip.querySelector('small').textContent = `Step ${tour.i + 1} of ${tour.steps.length}`;
    tip.querySelector('h3').textContent = title; tip.querySelector('p').innerHTML = text;
    tip.querySelector('[data-t="back"]').hidden = tour.i === 0;
    tip.querySelector('[data-t="next"]').textContent = tour.i === tour.steps.length - 1 ? 'Done' : 'Next';
    tour.target = target; place();
  }
  function place() {
    if (!tour) return;
    const hole = tour.ov.querySelector('.tour-hole'), tip = tour.ov.querySelector('.tour-tip');
    const r = tour.target ? tour.target.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, right: innerWidth / 2, bottom: innerHeight / 2 };
    const pad = 6; Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const tw = 320, th = tip.offsetHeight || 170;
    let x = r.right + 16, y = r.top;
    if (x + tw > innerWidth - 10) x = r.left - tw - 16;
    if (x < 10) { x = Math.min(innerWidth - tw - 10, Math.max(10, r.left)); y = r.bottom + 14; if (y + th > innerHeight - 10) y = r.top - th - 14; }
    if (r.width > innerWidth * .4 && r.height > innerHeight * .4) { x = r.left + r.width / 2 - tw / 2; y = r.top + 24; }
    tip.style.left = Math.max(10, x) + 'px'; tip.style.top = Math.max(10, Math.min(innerHeight - th - 10, y)) + 'px';
  }
  function endTour() { if (tour) { tour.ov.remove(); tour = null; removeEventListener('resize', place); } }
  HOOKS.startTour = startTour;

  /* ======================================== log in (code from /kyoto link) ======================================== */
  HOOKS.login = HOOKS.login || function login() {
    const ks = K();
    ks.modal(`<h2>Log in to Kyoto</h2><p>In Minecraft (with Kyoto Client), type <code>/kyoto link</code>. Type the 6 numbers it shows here.</p>
      <div class="otp" id="ksOtp">${'<input inputmode="numeric" maxlength="1">'.repeat(6)}</div>
      <label>Minecraft name <small>(optional)</small><input id="ksName" maxlength="16" placeholder="heffm"></label>
      <p class="note" id="ksMsg"></p><div class="mrow"><button class="pri ghost" data-close>Cancel</button><button class="pri" id="ksGo">Log in</button></div>`);
    const ins = $$('#ksOtp input');
    ins.forEach((inp, i) => {
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && ins[i + 1]) ins[i + 1].focus(); };
      inp.onkeydown = e => { if (e.key === 'Backspace' && !inp.value && ins[i - 1]) ins[i - 1].focus(); if (e.key === 'Enter') $('#ksGo').click(); };
      inp.onpaste = e => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length) { e.preventDefault(); t.split('').forEach((c, j) => { if (ins[j]) ins[j].value = c; }); ins[Math.min(5, t.length)].focus(); } };
    });
    setTimeout(() => ins[0].focus(), 50);
    $('#ksGo').onclick = async () => {
      const code = ins.map(i => i.value).join('');
      if (code.length !== 6) { $('#ksMsg').textContent = 'Type all 6 numbers.'; return; }
      $('#ksGo').disabled = true; $('#ksGo').textContent = 'Checking…';
      try {
        const r = await ks.api('/web/login', { method: 'POST', body: { code, name: $('#ksName').value.trim() } });
        localStorage.setItem('kyoto.token', r.token); localStorage.setItem('kyoto.me', JSON.stringify({ name: r.name, uuid: r.uuid }));
        if (HOOKS.onLogin) HOOKS.onLogin(r);
        ks.closeModal(); ks.whoami(); ks.toast('Welcome, ' + r.name, 'You can wear and post now.', 'ok');
      } catch (e) { $('#ksMsg').textContent = e.message; $('#ksGo').disabled = false; $('#ksGo').textContent = 'Log in'; }
    };
  };

  /* ======================================== post to the Store with automatic photos ======================================== */
  function shoot(yaw, pitch) {
    const ks = K(), cam = ks.cam, grid = $('#showGrid'), wasGrid = grid.checked;
    const keep = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, target: cam.target.slice() };
    grid.checked = false;
    const sc = ks.S.slot === 'head' ? [0, 26, 0] : ks.S.slot === 'back' ? [0, 18, 0] : [0, 16, 0];
    cam.target = sc; cam.dist = ks.S.slot === 'head' ? 30 : 40; cam.yaw = yaw; cam.pitch = pitch;
    ks.renderNow();
    const src = ks.canvas;
    const side = Math.min(src.width, src.height), out = document.createElement('canvas'); out.width = out.height = 720;
    const g = out.getContext('2d');
    const bg = g.createRadialGradient(360, 300, 40, 360, 360, 520); bg.addColorStop(0, '#2a2440'); bg.addColorStop(1, '#0c0c12'); g.fillStyle = bg; g.fillRect(0, 0, 720, 720);
    g.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, 720, 720);
    Object.assign(cam, keep); grid.checked = wasGrid; ks.redraw();
    return out.toDataURL('image/jpeg', 0.9);
  }
  HOOKS.shoot = shoot;
  HOOKS.post = function post() {
    const ks = K(), S = ks.S;
    if (ks.getMode() === 'skin') return ks.toast('Skins can\'t go in the Store yet', 'Press Wear to use it as your Kyoto skin, or download the PNG for minecraft.net.');
    const angles = [[0.55, 0.25, 'Front'], [Math.PI, 0.2, 'Back'], [-1.4, 0.15, 'Side'], [0.9, 0.9, 'Top']];
    const shots = angles.map(([y, p, n]) => ({ n, url: shoot(y, p), on: true }));
    ks.modal(`<h2>Post to the Kyoto Store</h2><p>Every Kyoto player can find it, get it and wear it. A Kyoto mod checks new posts first.</p>
      <label>Name<input id="pName" maxlength="40" value="${ks.esc(S.name)}"></label>
      <label>Description<textarea id="pDesc" maxlength="600" rows="3" placeholder="What is it? What does it go with?"></textarea></label>
      <div class="pricebox2"><span>Price</span><div class="seg" id="pPrice"><button class="on" data-pp="free">Free</button><button data-pp="coins">Coins</button></div><input id="pCoins" type="number" min="1" max="100000" placeholder="100" hidden></div>
      <h4>Photos <small>(click to leave one out)</small></h4>
      <div class="shots" id="pShots">${shots.map((s, i) => `<button class="shot on" data-shot="${i}"><img src="${s.url}" alt=""><span>${s.n}</span></button>`).join('')}</div>
      <label class="dropbtn sm"><input type="file" id="pOwn" accept="image/*" multiple hidden><span id="pOwnName">+ Add your own in-game screenshots</span></label>
      <p class="note" id="pMsg"></p><div class="mrow"><button class="pri ghost" data-close>Cancel</button><button class="pri" id="pGo">Post it</button></div>`);
    let paid = false, own = [];
    $$('[data-pp]').forEach(b => b.onclick = () => { paid = b.dataset.pp === 'coins'; $$('[data-pp]').forEach(x => x.classList.toggle('on', x === b)); $('#pCoins').hidden = !paid; });
    $$('[data-shot]').forEach(b => b.onclick = () => { const s = shots[Number(b.dataset.shot)]; s.on = !s.on; b.classList.toggle('on', s.on); });
    $('#pOwn').onchange = async e => { own = [...e.target.files].slice(0, 4); $('#pOwnName').textContent = own.length ? own.length + ' screenshot' + (own.length > 1 ? 's' : '') + ' added' : '+ Add your own in-game screenshots'; };
    $('#pGo').onclick = async () => {
      const name = $('#pName').value.trim(); if (!name) { $('#pMsg').textContent = 'Give it a name.'; return; }
      $('#pGo').disabled = true; $('#pGo').textContent = 'Posting…';
      try {
        const photos = [];
        for (const f of own) photos.push(await fileJpeg(f));
        for (const s of shots) if (s.on) photos.push(s.url.split(',')[1]);
        S.name = name;
        const r = await ks.api('/store/listing', { method: 'POST', body: { type: 'kycos', name, desc: $('#pDesc').value.trim(), price: paid ? Number($('#pCoins').value) || 0 : 0, data: JSON.stringify(ks.exportData()), photos: photos.slice(0, 4) } });
        ks.closeModal(); ks.toast(r.pending ? 'Sent for approval' : 'It\'s in the Store!', r.pending ? 'A Kyoto mod checks it soon. It\'s already in your Locker.' : 'Every Kyoto player can get it now.', 'ok');
      } catch (e) { $('#pMsg').textContent = e.message; $('#pGo').disabled = false; $('#pGo').textContent = 'Post it'; }
    };
  };
  async function fileJpeg(file) {
    const img = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * k | 0; c.height = img.height * k | 0; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  }

  /* ======================================== wiring ======================================== */
  ready(() => {
    $('#tplBtn').onclick = templates;
    $('#tourBtn').onclick = startTour;
    $$('[data-shape]').forEach(b => b.onclick = () => shape(b.dataset.shape));
    $$('[data-mv]').forEach(b => b.onclick = () => { const d = b.dataset.mv.split(',').map(Number); transform(p => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]); });
    $$('[data-xf]').forEach(b => b.onclick = () => {
      const S = K().S, a = b.dataset.xf;
      if (a === 'flip') transform(p => [S.n[0] - 1 - p[0], p[1], p[2]]);
      else if (a === 'rot') { const cx = (S.n[0] - 1) / 2, cz = (S.n[2] - 1) / 2; transform(p => [Math.round(cx + (p[2] - cz)), p[1], Math.round(cz - (p[0] - cx))]); }
      else if (a === 'recolor') recolour();
      else if (a === 'hollow') hollowOut();
    });
    // first visit: offer the tutorial (the old help popup is skipped when the app asks)
    if (!localStorage.getItem('kyoto.studio.toured') && !HOOKS.noTour) setTimeout(() => {
      localStorage.setItem('kyoto.studio.toured', '1');
      K().modal(`<h2>Welcome to Kyoto Studio</h2><p>Make your own Minecraft skins and cosmetics, wear them in game, and share them in the Kyoto Store.</p><p>Want a quick tour? It takes under a minute.</p>
        <div class="mrow"><button class="pri ghost" data-close>I'll explore</button><button class="pri" id="ksTour">Show me around</button></div>`);
      $('#ksTour').onclick = () => { K().closeModal(); startTour(); };
    }, 600);
  });
})();
