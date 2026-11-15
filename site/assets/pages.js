/* Kyoto website: the separate pages (/news, /changelog, /store, /download, /studio). Loaded after site.js + home.js. */
'use strict';
(() => {
  /* ---------------- News + Changelog ---------------- */
  let tag = 'All';
  async function news(path) {
    const isLog = path.startsWith('/changelog');
    const idm = /^\/news\/([\w-]+)/.exec(path);
    $('#newsEyebrow').textContent = isLog ? 'Changelog' : 'News';
    $('#newsTitle').textContent = isLog ? 'Every Kyoto update' : 'What\'s new in Kyoto';
    $('#newsSub').textContent = isLog ? 'What changed in each version, newest first.' : 'Updates, events and announcements from the Kyoto team.';
    if (isLog) tag = 'Update';
    $('#newsPage').innerHTML = '<div class="nskel big"></div><div class="nskel"></div><div class="nskel"></div>';
    const N = window.KY_NEWS; if (!N) return;
    const all = await N.ready;
    const tags = ['All', ...new Set(all.map(n => n.tag))];
    if (!tags.includes(tag)) tag = 'All';
    $('#newsPageTabs').innerHTML = tags.map(t => `<button class="${t === tag ? 'on' : ''}" data-pt2="${esc(t)}">${esc(t)}</button>`).join('');
    $$('[data-pt2]').forEach(b => b.onclick = () => { tag = b.dataset.pt2; news(tag === 'Update' && isLog ? '/changelog' : '/news'); if (isLog && tag !== 'Update') history.replaceState(null, '', '/news'); });
    const list = all.filter(n => tag === 'All' || n.tag === tag);
    if (!list.length) { $('#newsPage').innerHTML = '<p class="muted center">Nothing here yet.</p>'; return; }
    $('#newsPage').innerHTML = list.map((n, i) => `
      <article class="ncard ${i === 0 ? 'big wide' : 'tall'} reveal" data-nid2="${esc(n.id)}">
        <div class="nimg" style="background-image:url('${esc(N.artFor(n))}')"></div>
        ${n.pinned ? '<span class="ribbon">Pinned</span>' : (Date.now() - n.at < 7 * 864e5 ? '<span class="ribbon">New</span>' : '')}
        <span class="nwhen">${esc(N.when(n.at))}</span>
        <div class="nbody"><small>${esc(n.tag)}</small><h3>${esc(n.title)}</h3>
          ${i === 0 ? `<p class="nsum">${esc(String(n.body || '').replace(/\*\*/g, '').split('\n')[0].slice(0, 160))}</p>` : ''}
          <span class="more">${icon('arrow')} Read more</span></div></article>`).join('');
    $$('[data-nid2]').forEach(c => c.onclick = () => { history.pushState(null, '', '/news/' + c.dataset.nid2); N.open(c.dataset.nid2); });
    observe();
    if (idm) N.open(idm[1]);
  }
  // closing an article opened from /news/<id> goes back to /news
  document.addEventListener('click', e => {
    if (!/^\/news\/[\w-]+/.test(location.pathname)) return;
    if (e.target.closest('.a-close') || e.target.id === 'article') history.replaceState(null, '', '/news');
  }, true);

  /* ---------------- Cosmetics (Store + Locker) ---------------- */
  let kind = 'all', sort = 'top', view = 'browse', items = [], coins = null;
  const loggedIn = () => !!localStorage.getItem('kyoto.token');
  $$('[data-sk]').forEach(b => b.onclick = () => { kind = b.dataset.sk; $$('[data-sk]').forEach(x => x.classList.toggle('on', x === b)); renderStore(); });
  $$('[data-ss]').forEach(b => b.onclick = () => { sort = b.dataset.ss; $$('[data-ss]').forEach(x => x.classList.toggle('on', x === b)); store(); });
  $$('[data-cv]').forEach(b => b.onclick = () => {
    if (b.dataset.cv === 'locker' && !loggedIn()) return needLogin();
    view = b.dataset.cv; $$('[data-cv]').forEach(x => x.classList.toggle('on', x === b)); $('#storeSort').hidden = view === 'locker'; store();
  });
  const needLogin = () => toast('Log in first', 'Type /kyoto link in game, then log in on the Edit profile page.');
  function setCoins(n) { if (n === null || n === undefined) return; coins = n; $('#cosCoins b').textContent = n.toLocaleString(); }
  async function store() {
    $('#storeGrid').innerHTML = Array.from({ length: 8 }, () => '<div class="scard skel"></div>').join('');
    try {
      const r = view === 'locker' ? await api('/library') : await api('/store/items?sort=' + sort);
      items = r.items || []; setCoins(r.coins);
    } catch (e) { $('#storeGrid').innerHTML = `<p class="muted center">${esc(e.message)}</p>`; return; }
    renderStore();
  }
  const HEART = icon('heart');
  const priceTag = i => i.price > 0 ? `<span class="price paid">${icon('coin')}${i.price.toLocaleString()}</span>` : '<span class="price">Free</span>';
  const slotName = s => ({ head: 'Head', back: 'Back', arm: 'Arm', leg: 'Leg', cape: 'Cape' }[s] || 'Cosmetic');
  function preview(i, big) {
    if (i.photos > 0) return `<img class="sphoto" src="${CONFIG.api}/store/photo?id=${i.id}&n=0" alt="" loading="lazy">`;
    return i.type === 'cape' ? `<div class="capeface${big ? ' big' : ''}" style="background-image:url('${CONFIG.api}/store/image?id=${i.id}')"></div>` : `<canvas data-kp="${i.id}"></canvas>`;
  }
  function action(i) {
    if (view === 'locker' || i.owned) return i.wearing ? `<button class="btn sm ghost" data-off="${i.slot}">Take off</button>` : `<button class="btn sm" data-wear="${i.id}">Wear</button>`;
    return `<button class="btn sm glow" data-get="${i.id}">${i.price > 0 ? 'Buy' : 'Get'}</button>`;
  }
  function renderStore() {
    const list = items.filter(i => kind === 'all' || i.type === kind);
    if (!list.length) {
      $('#storeGrid').innerHTML = view === 'locker'
        ? `<div class="sempty"><h3>Your Locker is empty</h3><p>Get something from <a href="#" data-cv2>Browse</a> and it shows up here and in game.</p></div>`
        : `<div class="sempty"><h3>Nothing here yet</h3><p>Be the first: make something in <a href="/studio" data-link>Kyoto Studio</a> and post it.</p></div>`;
      const b2 = $('[data-cv2]'); if (b2) b2.onclick = e => { e.preventDefault(); $('[data-cv="browse"]').click(); };
      return;
    }
    $('#storeGrid').innerHTML = list.map(i => `<article class="scard reveal${i.wearing ? ' wearing' : ''}" data-open="${i.id}">
      <div class="sprev">${preview(i)}<span class="stype">${slotName(i.slot)}${i.gif ? ' · Animated' : ''}</span>${i.pending ? '<span class="spend">Waiting for approval</span>' : ''}${i.wearing ? '<span class="swear">Wearing</span>' : ''}</div>
      <div class="sbody"><b>${esc(i.title || 'Untitled')}</b><span class="muted">by ${esc(i.creator)} · ${HEART}${i.likes}</span></div>
      <div class="sacts">${i.owned && view !== 'locker' ? '<span class="price own">Owned</span>' : priceTag(i)}${action(i)}</div></article>`).join('');
    $$('[data-kp]').forEach(c => api('/store/kycos?id=' + c.dataset.kp, { auth: false }).then(r => { try { drawKycos(c, JSON.parse(r.data)); } catch (e) { /* bad file */ } }).catch(() => {}));
    wireButtons($('#storeGrid'));
    $$('#storeGrid [data-open]').forEach(c => c.onclick = e => { if (!e.target.closest('button')) openItem(Number(c.dataset.open)); });
    observe();
  }
  function wireButtons(root) {
    $$('[data-get]', root).forEach(b => b.onclick = () => getItem(b, Number(b.dataset.get)));
    $$('[data-wear]', root).forEach(b => b.onclick = () => wearItem(b, Number(b.dataset.wear)));
    $$('[data-off]', root).forEach(b => b.onclick = () => takeOff(b, b.dataset.off));
  }
  async function getItem(b, id) {
    if (!loggedIn()) return needLogin();
    const it = items.find(x => x.id === id) || {};
    if (it.price > 0 && !confirm(`Buy "${it.title}" for ${it.price} coins?`)) return;
    b.disabled = true;
    try {
      const r = await api('/store/get', { method: 'POST', body: { id } }); setCoins(r.coins);
      it.owned = true; toast('It\'s yours', 'Added to your Locker. Wear it now or later in game (Cosmetics > Locker).');
      closeItem(); renderStore();
    } catch (e) { toast('Couldn\'t get it', e.message); }
    b.disabled = false;
  }
  async function wearItem(b, id) {
    if (!loggedIn()) return needLogin();
    b.disabled = true;
    try {
      const r = await api('/library/wear', { method: 'POST', body: { id } });
      items.forEach(x => { if (x.slot === r.slot) x.wearing = x.id === id; });
      toast('You\'re wearing it', 'It shows in game within a minute. Press F5 to see yourself.');
      closeItem(); renderStore();
    } catch (e) { toast('Couldn\'t wear it', e.message); }
    b.disabled = false;
  }
  async function takeOff(b, slot) {
    b.disabled = true;
    try { await api('/library/unwear', { method: 'POST', body: { slot } }); items.forEach(x => { if (x.slot === slot) x.wearing = false; }); closeItem(); renderStore(); }
    catch (e) { toast('Couldn\'t do that', e.message); }
    b.disabled = false;
  }
  /* item details */
  const modal = document.createElement('div'); modal.className = 'cmodal'; modal.hidden = true; document.body.appendChild(modal);
  modal.onclick = e => { if (e.target === modal || e.target.closest('[data-x]')) closeItem(); };
  function closeItem() { modal.hidden = true; document.body.classList.remove('menu-open'); }
  async function openItem(id) {
    let i = items.find(x => x.id === id);
    try { i = Object.assign({}, i, await api('/store/item?id=' + id)); if (i.wearing === undefined) i.wearing = (items.find(x => x.id === id) || {}).wearing; } catch (e) { /* use what we have */ }
    const shots = [];
    for (let n = 0; n < i.photos; n++) shots.push(`${CONFIG.api}/store/photo?id=${i.id}&n=${n}`);
    modal.innerHTML = `<div class="cbox"><button class="cx" data-x>${icon('x')}</button>
      <div class="cgal"><div class="cmain">${shots.length ? `<img src="${shots[0]}" alt="">` : preview(i, true)}</div>
        ${shots.length > 1 || (shots.length && true) ? `<div class="cthumbs">${shots.map((u, n) => `<img src="${u}" data-n="${n}" class="${n ? '' : 'on'}" alt="">`).join('')}${shots.length ? `<div class="cthumb-r" data-raw>${i.type === 'cape' ? `<div class="capeface" style="background-image:url('${CONFIG.api}/store/image?id=${i.id}')"></div>` : '<canvas data-kp2></canvas>'}</div>` : ''}</div>` : ''}</div>
      <div class="cinfo"><span class="eyebrow">${slotName(i.slot)}${i.gif ? ' · Animated' : ''}</span><h2>${esc(i.title)}</h2>
        <div class="cby"><img src="https://mc-heads.net/avatar/${encodeURIComponent(i.creator)}/32" alt=""><span>by <a href="/u/${encodeURIComponent(i.creator)}" data-link>${esc(i.creator)}</a></span></div>
        <p class="cdesc">${esc(i.desc || 'No description.').replace(/\n/g, '<br>')}</p>
        <div class="cstats"><span>${HEART} ${i.likes} likes</span><span>${icon('users')} ${i.owners || 0} own it</span></div>
        <div class="cbuy">${i.owned ? '<span class="price own big">In your Locker</span>' : priceTag(i)}${action(i)}</div>
        <p class="muted small">Wear it in game from <b>Cosmetics &gt; Locker</b>, or right here. Every Kyoto player sees it.</p></div></div>`;
    $$('.cthumbs img', modal).forEach(t => t.onclick = () => { $$('.cthumbs img, .cthumb-r', modal).forEach(x => x.classList.remove('on')); t.classList.add('on'); $('.cmain', modal).innerHTML = `<img src="${t.src}" alt="">`; });
    const raw = $('[data-raw]', modal); if (raw) raw.onclick = () => { $$('.cthumbs img', modal).forEach(x => x.classList.remove('on')); raw.classList.add('on'); $('.cmain', modal).innerHTML = preview(Object.assign({}, i, { photos: 0 }), true); drawIn(modal, i); };
    drawIn(modal, i);
    wireButtons(modal);
    modal.hidden = false; document.body.classList.add('menu-open');
  }
  function drawIn(root, i) {
    $$('canvas', root).forEach(c => api('/store/kycos?id=' + i.id, { auth: false }).then(r => drawKycos(c, JSON.parse(r.data))).catch(() => {}));
  }
  /* post a cosmetic */
  $('#cosSell').onclick = () => {
    if (!loggedIn()) return needLogin();
    modal.innerHTML = `<div class="cbox sell"><button class="cx" data-x>${icon('x')}</button><form id="sellForm">
      <span class="eyebrow">Post a cosmetic</span><h2>Put it in the Kyoto Store</h2>
      <div class="seg" id="sType"><button type="button" class="on" data-t="kycos">Cosmetic (.kycos)</button><button type="button" data-t="cape">Cape</button></div>
      <label class="fld"><span>Name</span><input name="name" maxlength="40" required placeholder="Sakura Crown"></label>
      <label class="fld"><span>Description</span><textarea name="desc" maxlength="600" rows="3" placeholder="What it is, how it moves, what it goes well with..."></textarea></label>
      <div class="fld"><span>Price</span><div class="pricebox"><button type="button" class="on" data-p="free">Free</button><button type="button" data-p="coins">Coins</button><input name="price" type="number" min="1" max="100000" placeholder="100" hidden></div></div>
      <label class="fld drop" id="sFile"><span id="sFileLbl">Your .kycos file (export it from Kyoto Studio)</span><input type="file" name="file" accept=".kycos,application/json" required><b id="sFileName">Choose file</b></label>
      <label class="fld drop"><span>Photos (up to 4): show it in game, from the front and back</span><input type="file" name="photos" accept="image/*" multiple><b id="sPhotoName">Choose photos</b></label>
      <div class="sthumbs" id="sThumbs"></div>
      <p class="muted small" id="sCapeNote" hidden>Capes must already be in Minecraft's cape layout (PNG or GIF, 2:1 like 64x32 or 1024x512). Got any other picture, like a phone wallpaper? Turn it into a cape in <a href="/builder">Kyoto Studio</a> first.</p>
      <button class="btn glow wide" id="sGo">Post it</button><p class="muted small">New posts are checked by a Kyoto mod before they go live.</p></form></div>`;
    let t = 'kycos', paid = false; const f = $('#sellForm', modal);
    $$('[data-t]', modal).forEach(b => b.onclick = () => {
      t = b.dataset.t; $$('[data-t]', modal).forEach(x => x.classList.toggle('on', x === b));
      $('#sFileLbl').textContent = t === 'cape' ? 'Your cape (PNG or GIF in cape layout)' : 'Your .kycos file (export it from Kyoto Studio)';
      f.file.accept = t === 'cape' ? 'image/png,image/gif' : '.kycos,application/json'; f.file.value = ''; $('#sFileName').textContent = 'Choose file'; $('#sCapeNote').hidden = t !== 'cape';
    });
    $$('[data-p]', modal).forEach(b => b.onclick = () => { paid = b.dataset.p === 'coins'; $$('[data-p]', modal).forEach(x => x.classList.toggle('on', x === b)); f.price.hidden = !paid; });
    f.file.onchange = () => { $('#sFileName').textContent = f.file.files[0] ? f.file.files[0].name : 'Choose file'; };
    f.photos.onchange = () => {
      const fs2 = [...f.photos.files].slice(0, 4); $('#sPhotoName').textContent = fs2.length ? fs2.length + ' photo' + (fs2.length > 1 ? 's' : '') : 'Choose photos';
      $('#sThumbs').innerHTML = fs2.map(x => `<img src="${URL.createObjectURL(x)}" alt="">`).join('');
    };
    f.onsubmit = async e => {
      e.preventDefault(); const go = $('#sGo'); go.disabled = true; go.textContent = 'Posting…';
      try {
        const file = f.file.files[0]; if (!file) throw new Error(t === 'cape' ? 'Pick your cape' : 'Pick your .kycos file');
        const body = { type: t, name: f.name.value.trim(), desc: f.desc.value.trim(), price: paid ? Number(f.price.value) || 0 : 0, photos: [] };
        if (t === 'cape') body.image = await b64(file); else body.data = await file.text();
        for (const ph of [...f.photos.files].slice(0, 4)) body.photos.push(await b64(await shrink(ph)));
        const r = await api('/store/listing', { method: 'POST', body });
        closeItem(); toast(r.pending ? 'Sent for approval' : 'It\'s live!', r.pending ? 'A Kyoto mod checks it soon. It\'s already in your Locker.' : 'It\'s in the Store now.');
        view === 'locker' ? store() : $('[data-cv="locker"]').click();
      } catch (err) { toast('Couldn\'t post it', err.message); go.disabled = false; go.textContent = 'Post it'; }
    };
    modal.hidden = false; document.body.classList.add('menu-open');
  };
  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  /** Big phone photos -> max 1600px JPEG so uploads stay small. GIFs are kept as they are. */
  async function shrink(file) {
    if (file.type === 'image/gif' || file.size < 900000) return file;
    const img = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * k | 0; c.height = img.height * k | 0; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
  }
  /** Small isometric picture of a .kycos build. */
  function drawKycos(canvas, d) {
    const g = canvas.getContext('2d'), W = canvas.width = 320, H = canvas.height = 320;
    g.clearRect(0, 0, W, H);
    if (d.kind === 'texture') { const i = new Image(); i.onload = () => { const k = Math.min(240 / i.width, 240 / i.height); g.imageSmoothingEnabled = false; g.drawImage(i, (W - i.width * k) / 2, (H - i.height * k) / 2, i.width * k, i.height * k); }; i.src = 'data:image/png;base64,' + d.texture.png; return; }
    const vox = d.voxels || [], pal = d.palette || ['#fff']; if (!vox.length) return;
    const set = new Set(vox.map(v => v[0] + ',' + v[1] + ',' + v[2]));
    const iso = (x, y, z) => [(x - z) * .866, -y + (x + z) * .5];
    let a = 1e9, b = -1e9, c = 1e9, e = -1e9;
    for (const [x, y, z] of vox) for (const q of [[x, y, z], [x + 1, y + 1, z + 1], [x + 1, y, z], [x, y + 1, z + 1]]) { const p = iso(...q); a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); e = Math.max(e, p[1]); }
    const s = Math.min(260 / (b - a || 1), 260 / (e - c || 1)), ox = W / 2 - (a + b) / 2 * s, oy = H / 2 - (c + e) / 2 * s;
    const P = (x, y, z) => { const p = iso(x, y, z); return [ox + p[0] * s, oy + p[1] * s]; };
    const sh = (h, k) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16 & 255) * k | 0},${(n >> 8 & 255) * k | 0},${(n & 255) * k | 0})`; };
    const face = (pts, col) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = col; g.lineWidth = .6; g.stroke(); };
    for (const [x, y, z, ci] of vox.slice().sort((p, q) => (p[0] + p[2] - p[1] * .01) - (q[0] + q[2] - q[1] * .01) || p[1] - q[1])) {
      const col = pal[ci] || '#ffffff';
      if (!set.has(x + ',' + (y + 1) + ',' + z)) face([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], sh(col, 1));
      if (!set.has(x + ',' + y + ',' + (z + 1))) face([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], sh(col, .78));
      if (!set.has((x + 1) + ',' + y + ',' + z)) face([P(x + 1, y, z), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z)], sh(col, .62));
    }
  }

  /* ---------------- Download ---------------- */
  function download() {
    api('/version', { auth: false }).then(r => { if (r && r.mc) $('#dlMc').textContent = r.mc; }).catch(() => {});
    observe();
  }

  window.openPage = (page, path) => {
    if (page === 'news') news(path);
    else if (page === 'store') store();
    else if (page === 'hub') window.KY_HUB && window.KY_HUB.open();
    else if (page === 'download') download();
    else observe();
  };
  // first load straight onto one of these pages
  const p = location.pathname;
  const m = /^\/(news|changelog|store|cosmetics|download|studio|hub)(\/|$)/.exec(p);
  if (/[?&]sell=1/.test(location.search)) setTimeout(() => $('#cosSell') && $('#cosSell').click(), 400);
  if (m) setTimeout(() => window.openPage({ changelog: 'news', cosmetics: 'store' }[m[1]] || m[1], p), 0);
})();
