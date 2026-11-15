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

  /* ---------------- Store ---------------- */
  let kind = 'all', sort = 'top', items = [];
  $$('[data-sk]').forEach(b => b.onclick = () => { kind = b.dataset.sk; $$('[data-sk]').forEach(x => x.classList.toggle('on', x === b)); renderStore(); });
  $$('[data-ss]').forEach(b => b.onclick = () => { sort = b.dataset.ss; $$('[data-ss]').forEach(x => x.classList.toggle('on', x === b)); store(); });
  async function store() {
    $('#storeGrid').innerHTML = Array.from({ length: 8 }, () => '<div class="scard skel"></div>').join('');
    try { items = (await api('/store/items?sort=' + sort, { auth: false })).items || []; }
    catch (e) { $('#storeGrid').innerHTML = `<p class="muted center">${esc(e.message)}</p>`; return; }
    renderStore();
  }
  const HEART = icon('heart');
  function renderStore() {
    const list = items.filter(i => kind === 'all' || i.type === kind);
    if (!list.length) { $('#storeGrid').innerHTML = `<div class="sempty"><h3>Nothing here yet</h3><p>Be the first: make something in <a href="/studio" data-link>Kyoto Studio</a> and post it.</p></div>`; return; }
    $('#storeGrid').innerHTML = list.map(i => `<article class="scard reveal">
      <div class="sprev">${i.type === 'cape' ? `<div class="capeface" style="background-image:url('${CONFIG.api}/store/image?id=${i.id}')"></div>` : `<canvas data-kp="${i.id}"></canvas>`}
        <span class="stype">${i.type === 'cape' ? (i.gif ? 'Animated cape' : 'Cape') : esc(i.slot || 'Build')}</span></div>
      <div class="sbody"><b>${esc(i.title || 'Untitled')}</b><span class="muted">by ${esc(i.name)} · ${HEART}${i.likes}</span></div>
      <div class="sacts"><span class="price">Free</span><button class="btn sm" data-eq="${i.id}" data-ty="${i.type}">Wear</button></div></article>`).join('');
    $$('[data-kp]').forEach(c => api('/store/kycos?id=' + c.dataset.kp, { auth: false }).then(r => { try { drawKycos(c, JSON.parse(r.data)); } catch (e) { /* bad file */ } }).catch(() => {}));
    $$('[data-eq]').forEach(b => b.onclick = () => wear(b));
    observe();
  }
  async function wear(b) {
    if (!localStorage.getItem('kyoto.token')) { toast('Log in first', 'Type /kyoto link in game, then log in on the Edit profile page.'); return; }
    b.disabled = true; const old = b.textContent; b.textContent = 'Wearing…';
    try {
      if (b.dataset.ty === 'kycos') {
        const r = await api('/kycos/equip', { method: 'POST', body: { id: Number(b.dataset.eq) } });
        toast('You\'re wearing it', `On your ${r.slot}. It shows in game within a minute.`);
      } else {
        const blob = await (await fetch(`${CONFIG.api}/store/image?id=${b.dataset.eq}`)).blob();
        const b64 = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
        const me = await api('/me');
        let cur = {}; try { const bk = await api('/cosmetics/bulk', { method: 'POST', body: { uuids: [me.uuid] } }); cur = (bk.players || {})[me.uuid] || {}; } catch (e) { /* */ }
        await api('/cosmetics', { method: 'PUT', body: { cape: b64, accessory: cur.accessory || 0, model: cur.model || 0 } });
        toast('Cape on!', 'It shows in game within a minute.');
      }
      b.textContent = 'Wearing';
    } catch (e) { b.textContent = old; toast('Couldn\'t wear it', e.message); }
    b.disabled = false;
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
    else if (page === 'download') download();
    else observe();
  };
  // first load straight onto one of these pages
  const p = location.pathname;
  const m = /^\/(news|changelog|store|download|studio)(\/|$)/.exec(p);
  if (m) window.openPage(m[1] === 'changelog' ? 'news' : m[1], p);
})();
