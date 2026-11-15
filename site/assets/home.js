/* Kyoto website 2.0: custom cursor, header, menu, news, socials, Kyoto+, hero motion. Loaded after site.js. */
'use strict';
(() => {
  const fine = matchMedia('(pointer: fine)').matches;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- custom cursor (desktop only, pauses when the mouse stops) ---------------- */
  const cur = $('#cur');
  if (fine && cur && !calm) {
    document.documentElement.classList.add('has-cur');
    const dot = cur.querySelector('.dot'), ring = cur.querySelector('.ring');
    let mx = -100, my = -100, rx = -100, ry = -100, running = false, idle = 0;
    const SPARKS = [];
    const tick = () => {
      rx += (mx - rx) * .2; ry += (my - ry) * .2;
      dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
      ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      for (let i = SPARKS.length - 1; i >= 0; i--) {
        const s = SPARKS[i]; s.life -= 1;
        s.el.style.transform = `translate3d(${s.x}px,${(s.y += s.vy)}px,0) scale(${s.life / 30})`; s.el.style.opacity = s.life / 30;
        if (s.life <= 0) { s.el.remove(); SPARKS.splice(i, 1); }
      }
      if (Math.abs(mx - rx) < .3 && Math.abs(my - ry) < .3 && !SPARKS.length && ++idle > 20) { running = false; return; }
      requestAnimationFrame(tick);
    };
    let lastSpark = 0;
    addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY; idle = 0;
      cur.classList.remove('gone');
      const now = performance.now();
      if (now - lastSpark > 45 && SPARKS.length < 14 && document.body.classList.contains('on-home')) {
        lastSpark = now;
        const el = document.createElement('i'); el.className = 'spark'; cur.appendChild(el);
        SPARKS.push({ el, x: mx + (Math.random() - .5) * 8, y: my + (Math.random() - .5) * 8, vy: .4 + Math.random() * .5, life: 30 });
      }
      if (!running) { running = true; requestAnimationFrame(tick); }
    }, { passive: true });
    document.addEventListener('mouseleave', () => cur.classList.add('gone'));
    document.addEventListener('mousedown', () => cur.classList.add('down'));
    document.addEventListener('mouseup', () => cur.classList.remove('down'));
    document.addEventListener('mouseover', e => {
      const t = e.target;
      const text = t.closest && t.closest('input, textarea, select, [contenteditable]');
      const hot = t.closest && t.closest('a, button, summary, label, [data-mn], .tile, .ncard, .compare');
      cur.classList.toggle('hot', !!hot && !text);
      cur.classList.toggle('text', !!text);
    }, { passive: true });
  }

  /* ---------------- page flag (cursor sparks + styles only on the landing page) ---------------- */
  const flag = () => document.body.classList.toggle('on-home', !$('#page-home').hidden);
  flag(); addEventListener('popstate', flag); document.addEventListener('click', () => setTimeout(flag, 0));

  /* ---------------- header: compact on scroll, menu overlay ---------------- */
  const nav = $('#nav');
  let tick = false;
  addEventListener('scroll', () => {
    if (tick) return; tick = true;
    requestAnimationFrame(() => { nav.classList.toggle('compact', scrollY > 120); tick = false; hero(); });
  }, { passive: true });
  const menu = $('#menu'), mb = $('#menuBtn');
  const setMenu = open => { menu.hidden = !open; mb.classList.toggle('open', open); document.body.classList.toggle('menu-open', open); };
  mb.onclick = () => setMenu(menu.hidden);
  menu.addEventListener('click', e => { if (e.target.closest('a') || e.target === menu) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { setMenu(false); closeArticle(); } });

  /* ---------------- hero: slow parallax + logo tilt (only while the hero is on screen) ---------------- */
  const art = $('#heroArt'), logo = $('.h2-logo');
  const setArt = () => { art.style.backgroundImage = `url(/img/${theme}.webp)`; };
  setArt();
  const tp = $('#themePill'); if (tp) tp.addEventListener('click', () => setTimeout(setArt, 50));
  function hero() {
    const y = scrollY;
    if (y > innerHeight * 1.2 || calm) return;
    art.style.transform = `translate3d(0,${y * .35}px,0) scale(${1.08 + y / 6000})`;
    $('.h2-center').style.transform = `translate3d(0,${y * .18}px,0)`;
    $('.h2-center').style.opacity = Math.max(0, 1 - y / (innerHeight * .75));
  }
  if (fine && !calm) {
    let lt = false;
    $('.hero2').addEventListener('mousemove', e => {
      if (lt) return; lt = true;
      requestAnimationFrame(() => {
        const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
        logo.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 14}deg)`;
        lt = false;
      });
    });
    $('.hero2').addEventListener('mouseleave', () => { logo.style.transform = ''; });
  }

  /* ---------------- tiles: light follows the mouse ---------------- */
  $$('.tile').forEach(t => t.addEventListener('mousemove', e => {
    const r = t.getBoundingClientRect();
    t.style.setProperty('--x', (e.clientX - r.left) / r.width * 100 + '%'); t.style.setProperty('--y', (e.clientY - r.top) / r.height * 100 + '%');
  }));
  $$('.tiles .tile, .plusbar, .newswrap, .cta').forEach(el => el.classList.add('reveal'));

  /* ---------------- socials ---------------- */
  const SOC = [['discord', 'Discord', 'discord'], ['tiktok', 'TikTok', 'tiktok'], ['youtube', 'YouTube', 'youtube'], ['twitch', 'Twitch', 'twitch'], ['x', 'X', 'xlogo'], ['instagram', 'Instagram', 'instagram']];
  const socials = Object.assign({}, CONFIG.socials || {}, CONFIG.discordUrl ? { discord: CONFIG.discordUrl } : {});
  const socHtml = big => {
    const have = SOC.filter(([k]) => socials[k]);
    if (!have.length) return big ? '<p class="muted small">Our socials are coming soon.</p>' : '';
    return have.map(([k, n, ic]) => `<a href="${esc(socials[k])}" target="_blank" rel="noopener" title="${n}" class="s-${k}">${icon(ic)}${big ? `<span>${n}</span>` : ''}</a>`).join('');
  };
  $('#socList').innerHTML = socHtml(true); $('#footSoc').innerHTML = socHtml(false); $('#menuSoc').innerHTML = socHtml(false);
  $('#year').textContent = new Date().getFullYear();

  /* ---------------- Kyoto+ ---------------- */
  let kofi = '';
  api('/config', { auth: false }).then(c => { kofi = c.kofiUrl || ''; if (kofi) $('#plusBtn').href = kofi; }).catch(() => {});
  $('#plusBtn').addEventListener('click', e => { if (!kofi) { e.preventDefault(); toast('Kyoto+ is almost ready', 'The Ko-fi page goes up soon. Type /kyoto plus in game to check.'); } });

  /* ---------------- news ---------------- */
  let NEWS = [], TAG = 'All';
  const ARTS = ['starry', 'winter', 'spring', 'summer', 'fall', 'cozy', 'christmas', 'newyear', 'valentines', 'easter', 'halloween', 'thanksgiving'];
  const artFor = n => n.image || `/img/${ARTS[Math.abs([...String(n.id)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % ARTS.length]}.webp`;
  const when = t => { const s = (Date.now() - t) / 1000; if (s < 3600) return Math.max(1, Math.floor(s / 60)) + ' minutes ago'; if (s < 86400) return Math.floor(s / 3600) + ' hours ago';
    if (s < 2592000) return Math.floor(s / 86400) + ' days ago'; return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  const FALLBACK = [
    { id: 'w1', tag: 'Announcement', title: 'Welcome to Kyoto', at: Date.now() - 36e5, body: 'Kyoto is a full Minecraft client that\'s just a Fabric mod. Grab the launcher, press Play, done.' },
    { id: 'w2', tag: 'Update', title: 'Kyoto 6.5: TikTok gifts + a new lyrics menu', at: Date.now() - 864e5, body: 'TikTok LIVE gifts show up in game, the lyrics menu got 15 presets, and Discord status works with no setup.' },
    { id: 'w3', tag: 'Update', title: 'Kyoto Launcher 2.0', at: Date.now() - 2 * 864e5, body: 'A mod browser for Modrinth and CurseForge, the Hub and Store in the launcher, and all new settings.' },
    { id: 'w4', tag: 'Event', title: 'Suggest anything', at: Date.now() - 3 * 864e5, body: 'A lot of Kyoto came straight from players. Post your ideas in the Hub.' }];
  function render() {
    const tags = ['All', ...new Set(NEWS.map(n => n.tag))];
    $('#newsTabs').innerHTML = tags.map(t => `<button class="${t === TAG ? 'on' : ''}" data-ntag="${esc(t)}">${esc(t)}</button>`).join('');
    $$('[data-ntag]').forEach(b => b.onclick = () => { TAG = b.dataset.ntag; render(); });
    const list = NEWS.filter(n => TAG === 'All' || n.tag === TAG);
    if (!list.length) { $('#newsGrid').innerHTML = '<p class="muted">Nothing here yet.</p>'; return; }
    const [f, ...rest] = list;
    $('#newsGrid').innerHTML = `
      <article class="ncard big" data-nid="${esc(f.id)}"><div class="nimg" style="background-image:url('${esc(artFor(f))}')"></div>
        ${f.pinned ? '<span class="ribbon">Pinned</span>' : (Date.now() - f.at < 7 * 864e5 ? '<span class="ribbon">New</span>' : '')}
        <span class="nwhen">${esc(when(f.at))}</span>
        <div class="nbody"><small>${esc(f.tag)}</small><h3>${esc(f.title)}</h3>
          <div class="nfoot"><span class="by"><img class="logo-k" src="/img/logos/logo_k_${theme}.png" alt="">Kyoto team</span><span class="more">${icon('arrow')} Read more</span></div></div></article>
      <div class="nside">${rest.slice(0, 4).map(n => `<article class="ncard row" data-nid="${esc(n.id)}"><div class="nimg" style="background-image:url('${esc(artFor(n))}')"></div>
        <div class="nbody"><small>${esc(n.tag)} · ${esc(when(n.at))}</small><h4>${esc(n.title)}</h4></div><span class="go">${icon('arrow')}</span></article>`).join('')}</div>`;
    $$('[data-nid]').forEach(c => c.onclick = () => openArticle(c.dataset.nid));
  }
  function md(text) {
    return esc(text).split(/\n{2,}/).map(b => {
      const lines = b.split('\n'); const inl = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      return lines.every(l => /^- /.test(l)) ? '<ul>' + lines.map(l => `<li>${inl(l.slice(2))}</li>`).join('') + '</ul>' : `<p>${inl(lines.join('<br>'))}</p>`;
    }).join('');
  }
  const art2 = document.createElement('div'); art2.id = 'article'; art2.hidden = true; document.body.appendChild(art2);
  function openArticle(id) {
    const n = NEWS.find(x => String(x.id) === String(id)); if (!n) return;
    art2.innerHTML = `<div class="a-card"><button class="a-close" aria-label="Close">${icon('x')}</button><div class="a-img" style="background-image:url('${esc(artFor(n))}')"></div>
      <div class="a-body"><small>${esc(n.tag)} · ${esc(new Date(n.at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}</small><h2>${esc(n.title)}</h2>${md(n.body || '')}</div></div>`;
    art2.hidden = false; document.body.classList.add('menu-open');
    art2.querySelector('.a-close').onclick = closeArticle;
    art2.onclick = e => { if (e.target === art2) closeArticle(); };
  }
  function closeArticle() { art2.hidden = true; document.body.classList.remove('menu-open'); }
  api('/news', { auth: false }).then(r => { NEWS = (r.news && r.news.length ? r.news : FALLBACK).sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at)); render(); })
    .catch(() => { NEWS = FALLBACK; render(); });
  // "Changelog" link = news filtered to updates
  $$('[data-tag]').forEach(a => a.addEventListener('click', () => { TAG = NEWS.some(n => n.tag === a.dataset.tag) ? a.dataset.tag : 'All'; render(); }));

  observe();
})();
