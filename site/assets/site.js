/* Kyoto Client website: landing page, profile editor (/edit) and public profiles (/u/<name>). */
'use strict';
const CONFIG = {
  // The Kyoto server. Same server hosts this site, so normally it's just this page's address.
  api: /onrender\.com$|localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin : 'https://kyoto-server.onrender.com',
  launcherUrl: 'https://cdn.discordapp.com/attachments/1571013133319933982/1571013394113237073/Kyoto_Launcher.exe?ex=6af92fbd&is=6af7de3d&hm=53eaec80108ab0c99fd950e26e0a9c1d051144dd82411bfd4861ce9d9bb07f8c&',   // >>> link to KyotoLauncher.exe (Discord attachment, GitHub release...) <<<
  discordUrl: '',    // >>> your Discord invite <<<
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// icon placeholders in the HTML -> SVGs
document.body.innerHTML = document.body.innerHTML.replace(/__I_(\w+)__/g, (m, n) => icon(n));

function toast(title, text = '', kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind;
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`; $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s, transform .4s'; el.style.opacity = 0; el.style.transform = 'translateY(8px)'; }, 3800);
  setTimeout(() => el.remove(), 4300);
}
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = localStorage.getItem('kyoto.token');
  if (tok && opts.auth !== false) headers.Authorization = 'Bearer ' + tok;
  const r = await fetch(CONFIG.api + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {}; try { data = await r.json(); } catch (e) { /* not json */ }
  if (!r.ok) { const e = new Error(data.error || `Error ${r.status}`); e.status = r.status; throw e; }
  return data;
}

/* ===================== seasons: background + logo follow each other ===================== */
const THEMES = ['starry', 'winter', 'spring', 'summer', 'fall', 'cozy', 'halloween', 'thanksgiving', 'christmas', 'newyear', 'valentines', 'easter'];
const TINT = { starry: '230,232,240', winter: '191,227,255', spring: '255,183,213', summer: '255,211,107', fall: '255,154,77', cozy: '255,194,122',
  halloween: '255,138,42', thanksgiving: '255,176,80', christmas: '255,120,120', newyear: '255,224,138', valentines: '255,122,168', easter: '201,168,255' };
function season() {
  const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
  if (m === 12 && day >= 27 || m === 1 && day <= 2) return 'newyear';
  if (m === 12) return 'christmas';
  if (m === 2 && day >= 7 && day <= 14) return 'valentines';
  if (m === 10 && day >= 15) return 'halloween';
  if (m === 11 && day <= 28) return 'thanksgiving';
  if (m >= 3 && m <= 5) return 'spring'; if (m >= 6 && m <= 8) return 'summer'; if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}
let theme = localStorage.getItem('kyoto.theme') || season();
function setTheme(t, save) {
  theme = t; if (save) localStorage.setItem('kyoto.theme', t);
  const art = $('#art'); art.style.opacity = 0;
  const img = new Image(); img.src = `/img/${t}.webp`;
  img.onload = () => { art.style.backgroundImage = `url(/img/${t}.webp)`; art.style.opacity = 1; };
  $$('.logo-k').forEach(l => { l.style.transition = 'opacity .4s'; l.style.opacity = 0; setTimeout(() => { l.src = `/img/logos/logo_k_${t}.png`; l.style.opacity = 1; }, 300); });
  document.documentElement.style.setProperty('--tint', TINT[t] || TINT.starry);
  const pill = $('#themePill'); if (pill) pill.textContent = `${t[0].toUpperCase() + t.slice(1)} theme · change`;
}
setTheme(theme);
$('#themePill').onclick = () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length], true);

/* ===================== starfield + shooting stars ===================== */
// Stars are painted ONCE (no per-frame redraw, nothing moves on scroll or mouse).
// Shooting stars use a second canvas that only animates while one is flying.
(() => {
  const c = $('#stars'), g = c.getContext('2d');
  const sc = document.createElement('canvas'); sc.id = 'shoot'; c.after(sc);
  const h = sc.getContext('2d');
  const D = Math.min(1.25, devicePixelRatio || 1);
  let W = 0, H = 0, shoot = null, last = 0, hidden = document.hidden;
  const paint = () => {
    const w = innerWidth, hh = innerHeight;
    if (Math.abs(w * D - W) < 2 && Math.abs(hh * D - H) < 160) return; // ignore mobile URL-bar jitter
    W = c.width = sc.width = Math.round(w * D); H = c.height = sc.height = Math.round(hh * D);
    g.clearRect(0, 0, W, H); g.fillStyle = '#fff';
    const n = Math.min(240, Math.round(w * hh / 7000));
    for (let i = 0; i < n; i++) {
      g.globalAlpha = .25 + Math.random() * .75;
      g.beginPath(); g.arc(Math.random() * W, Math.random() * H, (Math.random() ** 2 * 1.2 + .4) * D, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
  };
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(paint, 200); }); paint();
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });
  function fly(now) {
    const s = shoot; if (!s) return;
    const dt = Math.min(3, (now - last) / 16.67); last = now;
    s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    h.clearRect(0, 0, W, H);
    if (s.t >= s.life) { shoot = null; return; }
    const k = s.t / s.life, a = Math.min(1, k * 6) * Math.max(0, 1 - k);
    const n = Math.hypot(s.vx, s.vy), l = s.len * Math.min(1, k * 4);
    const tx = s.x - s.vx / n * l, ty = s.y - s.vy / n * l;
    const grad = h.createLinearGradient(s.x, s.y, tx, ty);
    grad.addColorStop(0, `rgba(255,255,255,${a})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
    h.strokeStyle = grad; h.lineWidth = 1.6 * D; h.lineCap = 'round';
    h.beginPath(); h.moveTo(s.x, s.y); h.lineTo(tx, ty); h.stroke();
    requestAnimationFrame(fly);
  }
  (function schedule() {
    setTimeout(() => {
      if (!hidden && !shoot && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const fromRight = Math.random() < .5, ang = (16 + Math.random() * 22) * Math.PI / 180, sp = (8 + Math.random() * 6) * D;
        shoot = { x: fromRight ? W * (.5 + Math.random() * .45) : W * Math.random() * .5, y: H * Math.random() * .4,
          vx: (fromRight ? -1 : 1) * Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, life: 60 + Math.random() * 25, len: (130 + Math.random() * 120) * D };
        last = performance.now(); requestAnimationFrame(fly);
      }
      schedule();
    }, 3000 + Math.random() * 5000);
  })();
})();

/* soft light following the cursor + nav background on scroll */
let navTick = false;
addEventListener('scroll', () => { if (navTick) return; navTick = true; requestAnimationFrame(() => { $('#nav').classList.toggle('scrolled', scrollY > 30); navTick = false; }); }, { passive: true });

/* ===================== router ===================== */
function route() {
  const p = location.pathname;
  const user = /^\/u\/([A-Za-z0-9_]{1,16})\/?$/.exec(p) || (new URLSearchParams(location.search).get('u') ? [0, new URLSearchParams(location.search).get('u')] : null);
  const edit = p.startsWith('/edit'), mod = p.startsWith('/mod');
  $('#page-home').hidden = !!user || edit || mod;
  $('#page-edit').hidden = !edit;
  $('#page-mod').hidden = !mod;
  $('#page-user').hidden = !user;
  $('#nav').style.display = user ? 'none' : '';
  if (user) return openUser(user[1]);
  if (edit) return openEditor();
  if (mod) return openMod();
  if (location.hash) setTimeout(() => { const t = $(location.hash); if (t) t.scrollIntoView({ behavior: 'smooth' }); }, 60);
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (a && a.origin === location.origin) {
    e.preventDefault();
    const u = new URL(a.href);
    if (u.pathname === location.pathname && u.hash) { const t = $(u.hash); if (t) t.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', u.hash); return; }
    history.pushState(null, '', u.pathname + u.search + u.hash); scrollTo(0, 0); route();
  }
  const s = e.target.closest('a[data-scroll]');
  if (s) { e.preventDefault(); const t = $(s.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
});
addEventListener('popstate', route);

/* ===================== landing ===================== */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
const observe = () => $$('.reveal:not(.in)').forEach(el => io.observe(el));

const FEATURES = [
  ['monitor', 'Video screens', 'Movie night anywhere in your world.', ['YouTube, Twitch, Kick, Vimeo', 'Everyone watches in sync', 'Or a private mini player']],
  ['moon', 'Custom sky + time', 'Paint the sky, pick the hour.', ['Galaxy, aurora, shooting stars', 'Sky colours that match your theme', 'Only you see it']],
  ['music', 'Synced lyrics', 'Lyrics that float in your world.', ['Spotify, YouTube, Apple Music', 'Words light up as they\'re sung', 'Hide behind walls, fade on pause']],
  ['users', 'Friends + calls', 'Everyone you play with, in one place.', ['DMs with pictures', 'Join their server in one click', 'Voice calls with Simple Voice Chat']],
  ['cape', 'Capes + particles', 'Look different. Pay nothing.', ['PNG or animated GIF capes', 'Particles around your player', 'Every Kyoto player sees them']],
  ['layout', 'HUD editor', 'Drag anything anywhere.', ['Move and resize every element', 'Snapping guides', 'Right-click to reset']],
  ['zap', 'Performance', 'More FPS in one click.', ['Max FPS / Balanced / Quality', 'Dynamic render distance', 'Background FPS caps']],
  ['crosshair', 'Crosshair studio', 'Pick one or draw your own.', ['15x15 pixel painter', 'Turns red on target', 'Dynamic spread']],
  ['shield', 'Legit by design', 'Info, never advantages.', ['No aim, no autoclick', 'Display-only hitboxes', 'Safe on every server']],
];
$('#featGrid').innerHTML = FEATURES.map(([ic, t, d, li], i) => `<div class="fcard reveal" style="transition-delay:${(i % 3) * .08}s"><div class="fi">${icon(ic)}</div><h3>${esc(t)}</h3><p>${esc(d)}</p><ul>${li.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
$$('.fcard').forEach(c => c.addEventListener('mousemove', e => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }));
const MARQ = [['monitor', 'Video screens'], ['moon', 'Custom skies'], ['clock', 'Your own time of day'], ['music', 'Synced lyrics'], ['cape', 'Free capes'], ['users', 'Friends + DMs'],
  ['chat', 'Kyoto Hub'], ['layout', 'HUD editor'], ['zap', 'FPS boost'], ['crosshair', 'Crosshair studio'], ['sparkles', 'Seasonal themes'], ['gamepad', 'Any server'], ['rocket', 'One-click launcher']];
const mq = MARQ.map(([i, t]) => `<span>${icon(i)}${t}</span>`).join(''); $('#marquee').innerHTML = mq + mq;

$('#sources').innerHTML = [['youtube', 'YouTube'], ['twitch', 'Twitch'], ['kick', 'Kick'], ['globe', 'Vimeo + more'], ['film', 'Your own files']].map(([i, t]) => `<span>${icon(i)}${t}</span>`).join('');
$('#mnTabs').innerHTML = [1, 2, 3].map(n => `<button data-mn="${n}" class="${n === 1 ? 'on' : ''}">${icon('play')} Movie night ${n}</button>`).join('');
$$('[data-mn]').forEach(b => b.onclick = () => { $$('[data-mn]').forEach(x => x.classList.toggle('on', x === b)); const v = $('#mnVideo'); v.src = `/media/movienight-${b.dataset.mn}.mp4`; v.play().catch(() => {}); });
setInterval(() => { const v = $('#mnVideo'); if (!v || !v.duration) return; $('.vprog i').style.width = (v.currentTime / v.duration * 100) + '%'; $('.vtime').textContent = `0:0${Math.floor(v.currentTime)}`; }, 250);

(() => { // before/after sky
  const box = $('#compare'); let drag = false;
  const set = x => { const r = box.getBoundingClientRect(); const p = Math.max(0, Math.min(100, (x - r.left) / r.width * 100)); box.querySelector('.after').style.clipPath = `inset(0 0 0 ${p}%)`; box.querySelector('.handle').style.left = p + '%'; };
  box.onpointerdown = e => { drag = true; box.setPointerCapture(e.pointerId); set(e.clientX); };
  box.onpointermove = e => { if (drag) set(e.clientX); }; box.onpointerup = () => { drag = false; };
  // gentle auto-sweep while it's on screen, until you grab it
  let auto = true, visible = false, t0 = 0;
  box.addEventListener('pointerdown', () => { auto = false; });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && auto) { t0 = performance.now(); requestAnimationFrame(sweep); } }).observe(box);
  function sweep(now) { if (!auto || !visible) return; const r = box.getBoundingClientRect(); set(r.left + r.width * (.5 + .3 * Math.sin((now - t0) / 1800 + 1.57))); requestAnimationFrame(sweep); }
  $$('[data-sky]').forEach(b => b.onclick = () => { $$('[data-sky]').forEach(x => x.classList.toggle('on', x === b)); $('#skyAfter').src = `/media/sky-${b.dataset.sky}.webp`; });
})();

// capes: placeholders until the real capes are added (drop PNGs in /media/capes and list them here)
const CAPES = [['Starry', 'linear-gradient(170deg,#1b1f3a,#07070c 70%)'], ['Sakura', 'linear-gradient(170deg,#ffb7d5,#7a3a64)'], ['Ember', 'linear-gradient(170deg,#ffb050,#5a1a10)'],
  ['Frost', 'linear-gradient(170deg,#e6f3ff,#3a5a8a)'], ['Midnight', 'linear-gradient(170deg,#6a4cff,#120a2a)']];
$('#capeRow').innerHTML = CAPES.map(([n, bg]) => `<div class="cape-wrap"><div class="cape" style="background:${bg}"></div>${esc(n)}</div>`).join('');

// videos only play while on screen (saves a lot of CPU/GPU)
const vio = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: .05 });
$$('#page-home video').forEach(v => { v.preload = 'metadata'; v.removeAttribute('autoplay'); vio.observe(v); });

const FAQ = [['Is Kyoto free?', 'Yes. No account to buy, no subscription, no ads. Capes and particles are free too.'],
  ['Will I get banned?', 'Kyoto is built to be legit: no aim help, no autoclick, no x-ray. Combat features only show information. As with any mod, check each server\'s rules.'],
  ['Which Minecraft versions?', 'Pick your version in the Kyoto Launcher. Versions marked Kyoto get the mod added automatically; more versions are on the way.'],
  ['Can I watch Netflix or Crunchyroll on screens?', 'No: those use copy protection (DRM) that only their own apps can play. Screens play YouTube, Twitch, Kick, Vimeo, Dailymotion and Streamable, and the mini player can also play video files from your PC.'],
  ['How do I log in to edit my profile?', 'In Minecraft with Kyoto, type /kyoto link (or open your profile and press Edit on website). Type the 6-digit code on the Edit profile page. No password ever.'],
  ['Does it work with other mods?', 'Yes, it\'s a normal Fabric mod. Use it with Sodium, Iris, Mod Menu and most others.']];
$('#faqList').innerHTML = FAQ.map(([q, a]) => `<details class="reveal"><summary>${esc(q)}${icon('chevron')}</summary><p>${esc(a)}</p></details>`).join('');
$('#footDiscord').href = CONFIG.discordUrl || '#'; if (!CONFIG.discordUrl) $('#footDiscord').style.display = 'none';
$('#dlLauncher').onclick = e => { if (!CONFIG.launcherUrl) { e.preventDefault(); toast('Launcher download', 'The download link is coming soon - grab it from the Kyoto Discord.'); } };
if (CONFIG.launcherUrl) $('#dlLauncher').href = CONFIG.launcherUrl;

function countUp(el, to) { const t0 = performance.now(); (function f(n) { const k = Math.min(1, (n - t0) / 1400); el.textContent = Math.round(to * (1 - (1 - k) ** 3)).toLocaleString(); if (k < 1) requestAnimationFrame(f); })(t0); }
api('/stats', { auth: false }).then(s => { $('#navOnline b').textContent = s.online; countUp($('[data-count=online]'), s.online); countUp($('[data-count=users]'), s.users); }).catch(() => { $('#navOnline').style.display = 'none'; });
api('/mods/list', { auth: false }).then(r => {
  const vs = r.versions || [];
  $('#jarList').innerHTML = vs.length ? vs.map(v => `<a href="${CONFIG.api}/mods/kyoto-${esc(v)}.jar">${icon('download')} Minecraft ${esc(v)}<span class="muted small">${r.files && r.files[v] ? (r.files[v].size / 1e6).toFixed(1) + ' MB' : ''}</span></a>`).join('') : '<p class="muted small">The jar is coming soon. Use the launcher.</p>';
  if (vs[0]) $('#heroMc').textContent = vs[0];
}).catch(() => { $('#jarList').innerHTML = '<p class="muted small">Couldn\'t reach the Kyoto server. Try again in a minute.</p>'; });

/* ===================== profile renderer (public page, editor preview, landing mini) ===================== */
const FONTS = { poppins: "'Poppins', sans-serif", inter: "'Inter', sans-serif", mono: "'JetBrains Mono', monospace", serif: "'Playfair Display', serif", pixel: "'Silkscreen', monospace" };
const CARDS = ['glass', 'solid', 'outline', 'none'];
function renderProfile(root, p, opts = {}) {
  root.querySelectorAll('canvas').forEach(c => c._stop && c._stop());
  const accent = p.accent || `hsl(${p.hue ?? 262} 70% 65%)`;
  root.style.setProperty('--pa', accent); root.style.setProperty('--pt', p.textColor || '#ffffff');
  root.style.setProperty('--pf', FONTS[p.font] || FONTS.poppins); root.style.setProperty('--po', (p.cardOpacity ?? 62) / 100);
  const layout = ['card', 'floating', 'compact'][p.layout || 0];
  const card = layout === 'floating' ? 'floating' : CARDS[p.cardStyle || 0];
  const media = opts.media || {};
  let bg = '';
  if (media.video) bg = `<video src="${esc(media.video)}" autoplay muted loop playsinline></video>`;
  else if (media.image) bg = `<img src="${esc(media.image)}" alt="">`;
  const owner = (p.badges || []).includes('owner');
  const name = p.displayName || p.name || 'Player';
  const nameFx = ['', 'glow', 'rainbow', 'wave', 'typewriter'][p.nameEffect ?? 1] || '';
  const letters = nameFx === 'rainbow' || nameFx === 'wave' ? [...name].map((ch, i) => `<span style="animation-delay:${i * .08}s">${esc(ch)}</span>`).join('') : esc(name);
  const avatar = media.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(p.name || 'MHF_Steve')}/128`;
  const badges = [owner ? `<span class="owner">${icon('crown')}Owner of Kyoto Client</span>` : '', `<span>${icon('sparkles')}Kyoto</span>`, ...(p.tags || []).map(t => `<span>${esc(t)}</span>`)].join('');
  const links = (p.links || []).map(l => { const href = /^https?:/.test(l) ? l : 'https://' + l; const li = linkInfo(href); return opts.noLinks ? `<a title="${esc(li.name)}" aria-disabled="true">${icon(li.icon)}</a>` : `<a href="${esc(href)}" target="_blank" rel="noopener" title="${esc(li.name)}">${icon(li.icon)}</a>`; }).join('');
  root.innerHTML = `<div class="pr-bg">${bg}</div><div class="pr-dim" style="opacity:${bg ? (p.bgDim ?? 45) / 100 : 0}"></div><canvas class="pr-fx"></canvas>
    ${opts.back ? `<a class="btn ghost sm pr-back" href="/" data-link>${icon('arrow')} Kyoto</a>` : ''}
    <div class="pr-card ${card} ${layout === 'compact' ? 'compact' : ''}">
      <div class="pr-av ${p.avatarGlow !== false ? 'glow' : ''}">${owner ? `<span class="pr-crown">${icon('crown')}</span>` : ''}<img src="${esc(avatar)}" alt=""></div>
      <h1 class="pr-name ${nameFx}">${letters}</h1>
      <div class="pr-meta"><span>@${esc(p.name || '')}</span>${p.location ? `<span>${icon('pin')}${esc(p.location)}</span>` : ''}</div>
      <div class="pr-badges">${badges}</div>
      <p class="pr-bio"></p>
      <div class="pr-links">${links}</div>
    </div>
    ${p.showViews !== false && p.views ? `<div class="pr-views">${icon('eye')}${Number(p.views).toLocaleString()}</div>` : ''}
    ${media.audio ? `<div class="pr-music paused"><button>${icon('play')}</button><div class="bars"><i></i><i></i><i></i></div><span>${esc((p.audioName || 'Profile music').replace(/\.(mp3|wav|ogg)$/i, ''))}</span></div>` : ''}`;
  // bio (optionally typed out)
  const bioEl = root.querySelector('.pr-bio'), bio = p.bio || '';
  if (p.typewriterBio && !opts.static) { let i = 0; const tick = () => { if (!root.contains(bioEl)) return; bioEl.textContent = bio.slice(0, ++i); if (i < bio.length) setTimeout(tick, 35); }; tick(); }
  else bioEl.textContent = bio;
  if (nameFx === 'typewriter' && !opts.static) { const h = root.querySelector('.pr-name'); let i = 0; const t = () => { if (!root.contains(h)) return; h.textContent = name.slice(0, ++i); if (i < name.length) setTimeout(t, 90); }; t(); }
  effects(root.querySelector('.pr-fx'), p.bgEffect ?? 1, accent);
  if (media.audio) {
    const audio = new Audio(media.audio); audio.loop = true; audio.volume = .6; root._audio = audio;
    const bar = root.querySelector('.pr-music'), btn = bar.querySelector('button');
    const sync = () => { bar.classList.toggle('paused', audio.paused); btn.innerHTML = icon(audio.paused ? 'play' : 'pause'); };
    btn.onclick = () => { audio.paused ? audio.play().catch(() => {}) : audio.pause(); sync(); };
    audio.onplay = sync; audio.onpause = sync;
  }
  return root;
}
function effects(c, type, accent) {
  if (!c || !type) return;
  const g = c.getContext('2d'); let W, H, run = true, parts = [], shoot = null;
  const size = () => { W = c.width = c.clientWidth * 1.5; H = c.height = c.clientHeight * 1.5; };
  size(); new ResizeObserver(size).observe(c);
  const n = [0, 90, 70, 50, 110, 40, 90][type];
  for (let i = 0; i < n; i++) parts.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random(), p: Math.random() * 7 });
  c._stop = () => { run = false; };
  (function f(now) {
    if (!run || !c.isConnected) return;
    g.clearRect(0, 0, W, H);
    for (const q of parts) {
      if (type === 1 || type === 6) { g.globalAlpha = .25 + .75 * Math.abs(Math.sin(now / 900 * (.5 + q.s) + q.p)); g.fillStyle = '#fff'; g.fillRect(q.x, q.y, q.s > .85 ? 2.4 : 1.4, q.s > .85 ? 2.4 : 1.4); }
      else if (type === 2) { q.y += .6 + q.s; q.x += Math.sin(now / 900 + q.p) * .4; g.globalAlpha = .85; g.fillStyle = '#fff'; g.beginPath(); g.arc(q.x, q.y, 1 + q.s * 2, 0, 6.3); g.fill(); }
      else if (type === 3) { q.y += .5 + q.s * .8; q.x += .5 + Math.sin(now / 700 + q.p) * .6; g.globalAlpha = .9; g.fillStyle = q.s > .5 ? '#ffb7d5' : '#ffd6e8'; g.beginPath(); g.ellipse(q.x, q.y, 5, 3, now / 900 + q.p, 0, 6.3); g.fill(); }
      else if (type === 4) { q.y += 9 + q.s * 6; q.x -= 1; g.globalAlpha = .4; g.strokeStyle = '#a8c8ff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - 1.5, q.y + 12); g.stroke(); }
      else if (type === 5) { q.x += Math.cos(now / 1500 + q.p) * .5; q.y += Math.sin(now / 1300 + q.p * 2) * .5; g.globalAlpha = .4 + .6 * Math.abs(Math.sin(now / 400 + q.p * 3)); g.fillStyle = accent; g.shadowColor = accent; g.shadowBlur = 12; g.beginPath(); g.arc(q.x, q.y, 2.5, 0, 6.3); g.fill(); g.shadowBlur = 0; }
      if (q.y > H + 10) { q.y = -10; q.x = Math.random() * W; } if (q.x > W + 10) q.x = -10; if (q.x < -10) q.x = W + 10;
    }
    if (type === 6) {
      if (!shoot && Math.random() < .012) shoot = { x: W * Math.random() * .6, y: H * Math.random() * .35, l: 1 };
      if (shoot) {
        shoot.x += 14; shoot.y += 5.5; shoot.l -= .02;
        const gr = g.createLinearGradient(shoot.x, shoot.y, shoot.x - 180, shoot.y - 70); gr.addColorStop(0, `rgba(255,255,255,${shoot.l})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 1; g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(shoot.x, shoot.y); g.lineTo(shoot.x - 180, shoot.y - 70); g.stroke();
        if (shoot.l <= 0) shoot = null;
      }
    }
    g.globalAlpha = 1; requestAnimationFrame(f);
  })(performance.now());
}
function mediaUrls(p, name, bust = '') {
  const base = `${CONFIG.api}/profile/${encodeURIComponent(name)}`;
  return { video: p.videoExt ? `${base}/video${bust}` : null, image: p.imageExt ? `${base}/image${bust}` : null, avatar: p.avatarExt ? `${base}/avatar${bust}` : null, audio: p.audioExt ? `${base}/audio${bust}` : null };
}

// landing: a sample profile in the phone
renderProfile($('#pfMini'), { name: 'heffm', displayName: 'hef', bio: 'hef the man', location: 'Hef Town', badges: ['owner', 'kyoto'], tags: ['Builder'], links: ['youtube.com/@hef', 'tiktok.com/@hef', 'discord.gg/kyoto'], accent: '#ff5d7a', nameEffect: 1, bgEffect: 6, views: 245 },
  { media: { image: '/media/sky-night.webp' }, static: true, noLinks: true });
$('#pfMini .pr-dim').style.opacity = .35;

/* ===================== public profile /u/<name> ===================== */
async function openUser(name) {
  const root = $('#userRoot');
  root.innerHTML = '<div class="pr-404"><p class="muted">Loading profile…</p></div>';
  try {
    const p = await api(`/profile/${encodeURIComponent(name)}`, { auth: false });
    document.title = `${p.displayName || p.name} · Kyoto`;
    renderProfile(root, p, { media: mediaUrls(p, p.name), back: true });
    const enter = document.createElement('div'); enter.className = 'pr-enter'; enter.innerHTML = `<span>click to enter</span>`; root.appendChild(enter);
    enter.onclick = () => { enter.classList.add('gone'); if (root._audio) root._audio.play().catch(() => {}); };
    if (p.cursorTrail) cursorTrail(root, p.accent);
  } catch (e) {
    root.innerHTML = `<div class="pr-bg"></div><div class="pr-404"><h2>${e.status === 404 ? 'No profile yet' : 'Couldn\'t load this profile'}</h2><p class="muted">${e.status === 404 ? esc(name) + ' hasn\'t made a Kyoto profile.' : esc(e.message)}</p><a class="btn" href="/" data-link>Back to Kyoto</a></div>`;
  }
}
function cursorTrail(root, color) {
  let last = 0;
  root.addEventListener('mousemove', e => { const now = performance.now(); if (now - last < 24) return; last = now;
    const d = document.createElement('i'); d.className = 'trail'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; if (color) d.style.setProperty('--pa', color); document.body.appendChild(d); setTimeout(() => d.remove(), 700); });
}

/* ===================== editor /edit ===================== */
let ME = null, P = {}, SAVED = '', MEDIA = {};
const FIELDS = ['displayName', 'bio', 'location', 'tags', 'links', 'accent', 'textColor', 'layout', 'cardStyle', 'cardOpacity', 'bgDim', 'font', 'showViews', 'avatarGlow', 'nameEffect', 'bgEffect', 'cursorTrail', 'typewriterBio'];
const DEF = { displayName: '', bio: '', location: '', tags: [], links: [], accent: '#a855f7', textColor: '#ffffff', layout: 0, cardStyle: 0, cardOpacity: 62, bgDim: 45, font: 'poppins', showViews: true, avatarGlow: true, nameEffect: 1, bgEffect: 1, cursorTrail: false, typewriterBio: false };

async function openEditor() {
  const q = new URLSearchParams(location.search);
  if (q.get('code')) { // came from "Edit on website" in game
    $('#lgName').value = q.get('name') || ''; fillOtp(q.get('code'));
    history.replaceState(null, '', '/edit'); await login();
    return;
  }
  if (!localStorage.getItem('kyoto.token')) return showLogin();
  try { const me = await api('/me'); startDash(me); } catch (e) { localStorage.removeItem('kyoto.token'); showLogin(); }
}
function showLogin() { $('#loginWrap').hidden = false; $('#dash').hidden = true; setTimeout(() => ($('#lgName').value ? $$('#otp input')[0] : $('#lgName')).focus(), 50); }
function fillOtp(code) { const ins = $$('#otp input'); [...String(code).replace(/\D/g, '')].slice(0, 6).forEach((d, i) => ins[i].value = d); }
$$('#otp input').forEach((inp, i, all) => {
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && all[i + 1]) all[i + 1].focus(); if (all.every(x => x.value)) login(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !inp.value && all[i - 1]) all[i - 1].focus(); });
  inp.addEventListener('paste', e => { e.preventDefault(); fillOtp((e.clipboardData || window.clipboardData).getData('text')); if (all.every(x => x.value)) login(); });
});
$('#lgBtn').onclick = () => login();
let logging = false;
async function login() {
  if (logging) return; logging = true;
  const code = $$('#otp input').map(i => i.value).join(''), name = $('#lgName').value.trim();
  try {
    if (code.length !== 6) throw new Error('Type the 6-digit code from the game');
    $('#lgBtn').textContent = 'Checking…';
    const r = await api('/web/login', { method: 'POST', body: { name, code }, auth: false });
    localStorage.setItem('kyoto.token', r.token);
    if (location.pathname.startsWith('/mod')) { toast(`Welcome, ${r.name}`, 'Opening the staff panel', 'ok'); $('#page-edit').hidden = true; $('#page-mod').hidden = false; openMod(); return; }
    toast(`Welcome, ${r.name}`, 'You can edit your profile now', 'ok');
    startDash(await api('/me'));
  } catch (e) {
    $('#lgMsg').textContent = e.message; $('#otp').classList.remove('shake'); void $('#otp').offsetWidth; $('#otp').classList.add('shake');
    $$('#otp input').forEach(i => i.value = ''); $$('#otp input')[0].focus();
  } finally { logging = false; $('#lgBtn').textContent = 'Log in'; }
}
function startDash(me) {
  ME = me; $('#loginWrap').hidden = true; $('#dash').hidden = false;
  $('#meName').textContent = me.name; $('#meHead').src = `https://mc-heads.net/avatar/${encodeURIComponent(me.name)}/64`;
  $('#meSub').textContent = me.owner ? 'Owner of Kyoto Client' : 'Kyoto profile';
  $('#viewProfile').href = `/u/${encodeURIComponent(me.name)}`;
  if (me.staff && !$('#staffLink')) $('#viewProfile').insertAdjacentHTML('beforebegin', `<a class="btn ghost wide" id="staffLink" href="/mod" data-link>${icon('shield')} Staff panel</a>`);
  const prof = me.profile || {};
  P = {}; for (const f of FIELDS) P[f] = prof[f] ?? DEF[f];
  if (!prof.accent && prof.hue != null) P.accent = hslHex(prof.hue);
  P._raw = prof;
  SAVED = JSON.stringify(pick(P));
  MEDIA = mediaUrls(prof, me.name, '?t=' + Date.now());
  bindForm(); updateMediaPreviews(); refresh(false);
}
function pick(o) { const r = {}; for (const f of FIELDS) r[f] = o[f]; return r; }
function hslHex(h) { const a = .7 * Math.min(.65, .35); const f = n => { const k = (n + h / 30) % 12; const c = .65 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; }

function bindForm() {
  const v = id => $('#f_' + id);
  for (const id of ['displayName', 'bio', 'location']) { v(id).value = P[id] || ''; v(id).oninput = () => { P[id] = v(id).value; refresh(); }; }
  for (const id of ['cardOpacity', 'bgDim']) { v(id).value = P[id]; $('#o_' + id).textContent = P[id] + '%'; v(id).oninput = () => { P[id] = +v(id).value; $('#o_' + id).textContent = P[id] + '%'; refresh(); }; }
  for (const id of ['accent', 'textColor']) { v(id).value = P[id]; $('#cv_' + id).textContent = P[id]; v(id).oninput = () => { P[id] = v(id).value; $('#cv_' + id).textContent = P[id]; refresh(); }; }
  v('font').value = P.font; v('font').onchange = () => { P.font = v('font').value; refresh(); };
  for (const id of ['showViews', 'avatarGlow', 'cursorTrail', 'typewriterBio']) { v(id).checked = !!P[id]; v(id).onchange = () => { P[id] = v(id).checked; refresh(); }; }
  choices('#c_layout', ['Card', 'Floating', 'Compact'], 'layout', i => `<div class="mini ${['card', 'floating', 'compact'][i]}"><div class="m-card"></div><div class="m-av"></div><div class="m-l1"></div><div class="m-l2"></div></div>`);
  choices('#c_cardStyle', ['Glass', 'Solid', 'Outline', 'None'], 'cardStyle', i => `<div class="mini"><div class="m-card" style="${['backdrop-filter:blur(4px)', 'background:#16171c', 'background:transparent;border:1.5px solid ' + P.accent, 'background:none'][i]}"></div><div class="m-av"></div><div class="m-l1"></div><div class="m-l2"></div></div>`);
  choices('#c_nameEffect', ['None', 'Glow', 'Rainbow', 'Wave', 'Typewriter'], 'nameEffect');
  choices('#c_bgEffect', ['None', 'Stars', 'Snow', 'Sakura', 'Rain', 'Fireflies', 'Shooting stars'], 'bgEffect');
  $('#swatches').innerHTML = ['#a855f7', '#ff5d7a', '#ff9a4d', '#ffd36b', '#7ee2a0', '#5cc8ff', '#6b8bff', '#e8eaf0', '#ffb7d5'].map(c => `<button style="background:${c}" data-c="${c}" title="${c}"></button>`).join('');
  $$('#swatches button').forEach(b => b.onclick = () => { P.accent = b.dataset.c; v('accent').value = P.accent; $('#cv_accent').textContent = P.accent; refresh(); });
  renderTags(); renderLinks();
}
function choices(sel, names, key, preview) {
  const box = $(sel);
  box.innerHTML = names.map((n, i) => `<div class="choice ${P[key] === i ? 'on' : ''}" data-i="${i}">${preview ? preview(i) : ''}${esc(n)}</div>`).join('');
  $$('.choice', box).forEach(c => c.onclick = () => { P[key] = +c.dataset.i; $$('.choice', box).forEach(x => x.classList.toggle('on', x === c)); refresh(); });
}
function renderTags() {
  const box = $('#tagBox'), inp = $('#tagInput');
  $$('.tagchip', box).forEach(t => t.remove());
  P.tags.forEach((t, i) => { const el = document.createElement('span'); el.className = 'tagchip'; el.innerHTML = `${esc(t)}<button>${icon('x')}</button>`; el.querySelector('button').onclick = () => { P.tags.splice(i, 1); renderTags(); refresh(); }; box.insertBefore(el, inp); });
  inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) { e.preventDefault(); if (P.tags.length >= 8) return toast('8 tags max'); P.tags = [...P.tags, inp.value.trim()]; inp.value = ''; renderTags(); refresh(); } };
}
function renderLinks() {
  $('#linkList').innerHTML = P.links.length ? P.links.map((l, i) => { const li = linkInfo(/^https?:/.test(l) ? l : 'https://' + l); return `<div class="linkrow">${icon(li.icon)}<div><b>${esc(li.name)}</b><span>${esc(l)}</span></div><button data-del="${i}">${icon('trash')}</button></div>`; }).join('') : '<p class="muted small">No links yet.</p>';
  $$('[data-del]').forEach(b => b.onclick = () => { P.links.splice(+b.dataset.del, 1); renderLinks(); refresh(); });
}
$('#linkAdd').onclick = () => {
  const v = $('#linkInput').value.trim(); if (!v) return;
  if (!/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v)) return toast('That doesn\'t look like a link', 'Example: youtube.com/@you', 'bad');
  if (P.links.length >= 8) return toast('8 links max');
  P.links = [...P.links, v]; $('#linkInput').value = ''; renderLinks(); refresh();
};
$('#linkInput').onkeydown = e => { if (e.key === 'Enter') $('#linkAdd').click(); };
$$('#sideNav button').forEach(b => b.onclick = () => { $$('#sideNav button').forEach(x => x.classList.toggle('on', x === b)); $$('.panel .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === b.dataset.tab)); });
$$('#pvSize button').forEach(b => b.onclick = () => { $$('#pvSize button').forEach(x => x.classList.toggle('on', x === b)); $('#pvFrame').classList.toggle('mc', b.dataset.pv === 'mc'); });

let pvTimer = 0;
function refresh(dirty = true) {
  $$('.count').forEach(c => { const f = $('#' + c.dataset.for); c.textContent = `${f.value.length}/${f.maxLength}`; });
  const changed = JSON.stringify(pick(P)) !== SAVED;
  $('#saveBar').classList.toggle('show', changed);
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => renderProfile($('#pvRoot'), Object.assign({}, P._raw, pick(P), { name: ME.name, badges: ME.owner ? ['owner', 'kyoto'] : ['kyoto'], views: (P._raw || {}).views }), { media: MEDIA }), dirty ? 120 : 0);
}
$('#saveBtn').onclick = async () => {
  try { $('#saveBtn').disabled = true; await api('/profile', { method: 'PUT', body: pick(P) }); SAVED = JSON.stringify(pick(P)); refresh(false); toast('Saved', 'Your profile is live, in game too', 'ok'); }
  catch (e) { toast('Couldn\'t save', e.message, 'bad'); if (e.status === 401) { localStorage.removeItem('kyoto.token'); showLogin(); } }
  finally { $('#saveBtn').disabled = false; }
};
$('#resetBtn').onclick = () => { const s = JSON.parse(SAVED); Object.assign(P, s); bindForm(); refresh(false); };
$('#logoutBtn').onclick = async () => { try { await api('/web/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ } localStorage.removeItem('kyoto.token'); toast('Logged out'); showLogin(); };
addEventListener('beforeunload', e => { if (ME && JSON.stringify(pick(P)) !== SAVED) { e.preventDefault(); e.returnValue = ''; } });

// media uploads
function updateMediaPreviews() {
  $('#pv_avatar').innerHTML = `<img src="${esc(MEDIA.avatar || `https://mc-heads.net/avatar/${encodeURIComponent(ME.name)}/128`)}" alt="" style="object-fit:contain;image-rendering:pixelated">`;
  $('#pv_bg').innerHTML = MEDIA.video ? `<video src="${esc(MEDIA.video)}" autoplay muted loop playsinline></video>` : MEDIA.image ? `<img src="${esc(MEDIA.image)}" alt="">` : 'No background';
  $('#pv_audio').innerHTML = MEDIA.audio ? `<audio src="${esc(MEDIA.audio)}" controls style="width:90%"></audio>` : 'No music';
}
const LIM = { avatar: 3e6, video: 15e6, image: 6e6, audio: 10e6 };
$$('.up').forEach(card => {
  const ui = card.dataset.kind;
  card.querySelector('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    const kind = ui === 'bg' ? (['png', 'jpg', 'jpeg'].includes(ext) ? 'image' : 'video') : ui;
    if (f.size > LIM[kind]) return toast('File too big', `Max ${LIM[kind] / 1e6} MB`, 'bad');
    card.classList.add('busy');
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
      await api('/profile/media', { method: 'PUT', body: { kind, ext, data, fileName: f.name } });
      const me = await api('/me'); P._raw = Object.assign(P._raw, me.profile); MEDIA = mediaUrls(me.profile, ME.name, '?t=' + Date.now());
      updateMediaPreviews(); refresh(false); toast('Uploaded', f.name, 'ok');
    } catch (err) { toast('Upload failed', err.message, 'bad'); }
    finally { card.classList.remove('busy'); }
  };
  card.querySelector('[data-remove]').onclick = async () => {
    const kinds = ui === 'bg' ? ['video', 'image'] : [ui];
    try { for (const k of kinds) await api('/profile/media', { method: 'PUT', body: { kind: k, remove: true } });
      const me = await api('/me'); P._raw = Object.assign(P._raw, me.profile); MEDIA = mediaUrls(me.profile, ME.name, '?t=' + Date.now()); updateMediaPreviews(); refresh(false); toast('Removed');
    } catch (err) { toast('Couldn\'t remove', err.message, 'bad'); }
  };
});


/* ===================== staff panel (/mod) ===================== */
var MOD = null, MQ = null, PSEL = null;
const ago = t => { if (!t) return 'never'; const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };
const until = t => !t ? 'Permanent' : t < Date.now() ? 'Expired' : 'Ends ' + new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const head = n => `<img class="mhead-img" src="https://mc-heads.net/avatar/${encodeURIComponent(n || 'MHF_Steve')}/40" alt="" loading="lazy">`;
const empty = (ic, t) => `<div class="mempty">${icon(ic)}<span>${esc(t)}</span></div>`;
async function openMod() {
  if (!localStorage.getItem('kyoto.token')) { $('#page-mod').hidden = true; $('#page-edit').hidden = false; $('#dash').hidden = true; showLogin(); $('#lgMsg').textContent = 'Staff: log in with your code to open the staff panel.'; return; }
  try { MOD = await api('/mod/me'); } catch (e) { if (e.status === 401) { localStorage.removeItem('kyoto.token'); return openMod(); } $('#modGate').hidden = false; $('#modGateMsg').textContent = e.message; return; }
  if (!MOD.staff) { $('#mdash').hidden = true; $('#modGate').hidden = false; $('#modGateMsg').textContent = `Signed in as ${MOD.name}. This area is only for Kyoto staff.`; return; }
  $('#modGate').hidden = true; $('#mdash').hidden = false;
  $('#modName').textContent = MOD.name; $('#modHead').src = `https://mc-heads.net/avatar/${encodeURIComponent(MOD.name)}/64`;
  $('#modRole').textContent = MOD.owner ? 'Owner' : 'Moderator';
  $('#navStaff').style.display = ''; $('#sAdd').closest('.card').style.display = MOD.owner ? '' : 'none';
  modTab(new URLSearchParams(location.search).get('tab') || 'overview');
}
function modTab(t) {
  $$('#modNav button').forEach(b => b.classList.toggle('on', b.dataset.mt === t));
  $$('.mpanel .tab').forEach(x => x.classList.toggle('on', x.dataset.mt === t));
  history.replaceState(null, '', '/mod' + (t === 'overview' ? '' : '?tab=' + t));
  modLoad(t);
}
$$('#modNav button').forEach(b => b.onclick = () => modTab(b.dataset.mt));
$('#modRefresh').onclick = () => { const t = ($('#modNav button.on') || {}).dataset; modLoad(t ? t.mt : 'overview'); toast('Refreshed'); };
async function modDo(path, body, ok) {
  try { await api(path, { method: 'POST', body }); if (ok) toast(ok, '', 'ok'); const t = $('#modNav button.on').dataset.mt; modLoad(t); if (PSEL && t === 'players') showPlayer(PSEL); return true; }
  catch (e) { toast('Couldn\'t do that', e.message, 'bad'); return false; }
}
async function modQueue() { MQ = await api('/mod/queue'); $('#nbReports').textContent = MQ.reports.length || ''; $('#nbPending').textContent = MQ.pending.length || ''; return MQ; }
async function modLoad(t) {
  try {
    if (t === 'overview') {
      const [o] = await Promise.all([api('/mod/overview'), modQueue()]);
      const st = [['Players', o.users, 'users'], ['Online now', o.online, 'activity'], ['New today', o.newToday, 'userplus'], ['Chat today', o.chatToday, 'chat'],
        ['Reports', o.reports, 'flag'], ['Awaiting approval', o.pending, 'cape'], ['Active bans', o.bans, 'ban'], ['Muted', o.mutes, 'mute']];
      $('#mStats').innerHTML = st.map(([l, v, ic]) => `<div class="mstat">${icon(ic)}<b>${Number(v || 0).toLocaleString()}</b><span>${l}</span></div>`).join('');
      $('#mStaffMini').innerHTML = o.staff.map(x => `<div class="mrow">${head(x.name)}<b>${esc(x.name)}</b><span class="pill ${x.role}">${x.role === 'owner' ? 'Owner' : 'Mod'}</span></div>`).join('');
      $('#mRecent').innerHTML = o.recent.length ? o.recent.map(logRow).join('') : empty('history', 'No staff actions yet');
    }
    if (t === 'reports') {
      const q = await modQueue();
      $('#mReports').innerHTML = q.reports.length ? q.reports.map(r => {
        const tg = r.target || {};
        return `<div class="mitem"><div class="mi-main">${head(tg.name)}<div><div class="mi-top"><b>${esc(tg.name || 'Unknown')}</b><span class="pill">${esc(r.kind)}</span><span class="muted small">reported by ${esc(r.byName)} · ${ago(r.at)}</span></div>
          <p class="mi-text">${tg.gone ? '<i class="muted">Already deleted</i>' : esc(tg.text || '(no text)')}</p>${tg.image ? `<img class="mi-img" src="${CONFIG.api}/hub/image?id=${tg.image}&auth=${encodeURIComponent(localStorage.getItem('kyoto.token') || '')}" alt="">` : ''}
          <p class="muted small">Reason: ${esc(r.reason || 'none given')}</p></div></div>
          <div class="mi-act">${tg.gone ? '' : `<button class="btn sm danger" data-del="${esc(r.kind === 'chat' ? 'chat' : 'post')}:${esc(r.id)}">${icon('trash')} Delete</button>`}
          ${tg.name ? `<button class="btn ghost sm" data-ban="${esc(tg.name)}">${icon('ban')} Ban</button><button class="btn ghost sm" data-pl="${esc(tg.name)}">${icon('user')} Player</button>` : ''}
          <button class="btn ghost sm" data-dis="${r.at}|${esc(r.by)}">${icon('check')} Dismiss</button></div></div>`;
      }).join('') : empty('check', 'No reports. Nice and quiet.');
    }
    if (t === 'approvals') {
      const q = await modQueue();
      $('#mPending').innerHTML = q.pending.length ? q.pending.map(p => `<div class="mcape"><img src="${CONFIG.api}/hub/image?id=${p.id}&auth=${encodeURIComponent(localStorage.getItem('kyoto.token') || '')}" alt=""><b>${esc(p.title || 'Untitled')}</b><span class="muted small">by ${esc(p.name)} · ${ago(p.at)}</span>
        <div class="mi-act"><button class="btn sm" data-ok="${p.id}">${icon('check')} Approve</button><button class="btn ghost sm" data-del="post:${p.id}">${icon('x')} Reject</button></div></div>`).join('') : empty('cape', 'Nothing waiting for approval');
    }
    if (t === 'players') playerSearch();
    if (t === 'bans') {
      const q = await modQueue();
      $('#mBans').innerHTML = q.banList.length ? q.banList.map(b => `<div class="mitem"><div class="mi-main">${head(b.name)}<div><div class="mi-top"><b>${esc(b.name)}</b><span class="pill bad">Banned</span><span class="muted small">${until(b.until)}</span></div>
        <p class="mi-text">${esc(b.reason || 'No reason saved')}</p><p class="muted small">${b.byName ? 'By ' + esc(b.byName) + ' · ' + ago(b.at) : ''}</p></div></div>
        <div class="mi-act"><button class="btn ghost sm" data-unban="${esc(b.name)}">${icon('check')} Unban</button></div></div>`).join('') : empty('ban', 'Nobody is banned');
    }
    if (t === 'chat') {
      const c = await api('/mod/chat');
      $('#mChat').innerHTML = c.messages.length ? c.messages.map(m => `<div class="mitem slim"><div class="mi-main">${head(m.name)}<div><div class="mi-top"><b>${esc(m.name)}</b>${m.staff ? '<span class="pill owner">Staff</span>' : ''}<span class="muted small">${ago(m.at)}</span></div><p class="mi-text">${esc(m.text)}</p></div></div>
        <div class="mi-act"><button class="btn ghost sm" data-del="chat:${m.id}">${icon('trash')}</button>${m.staff ? '' : `<button class="btn ghost sm" data-mute="${esc(m.name)}">${icon('mute')}</button><button class="btn ghost sm" data-ban="${esc(m.name)}">${icon('ban')}</button>`}</div></div>`).join('') : empty('chat', 'No chat messages yet');
    }
    if (t === 'staff') {
      const o = await api('/mod/overview');
      $('#mStaff').innerHTML = o.staff.map(x => `<div class="mitem slim"><div class="mi-main">${head(x.name)}<div><div class="mi-top"><b>${esc(x.name)}</b><span class="pill ${x.role}">${x.role === 'owner' ? 'Owner' : 'Moderator'}</span></div>
        <p class="muted small">${x.role === 'owner' ? 'Set with the OWNERS setting on Render' : 'Added in the staff panel'}</p></div></div>
        <div class="mi-act">${MOD.owner && x.role === 'mod' ? `<button class="btn ghost sm" data-unstaff="${esc(x.name)}">${icon('x')} Remove</button>` : ''}</div></div>`).join('');
    }
    if (t === 'log') {
      const l = await api('/mod/audit');
      $('#mLog').innerHTML = l.log.length ? l.log.map(logRow).join('') : empty('history', 'No staff actions yet');
    }
  } catch (e) { toast('Couldn\'t load', e.message, 'bad'); if (e.status === 401) { localStorage.removeItem('kyoto.token'); openMod(); } }
}
function logRow(x) { return `<div class="mrow log">${head(x.byName)}<div><b>${esc(x.byName)}</b> <span>${esc(x.action)}</span> ${x.target ? `<b>${esc(x.target)}</b>` : ''}${x.detail ? `<div class="muted small">${esc(x.detail)}</div>` : ''}</div><span class="muted small">${ago(x.at)}</span></div>`; }
let pTimer;
$('#pSearch').oninput = () => { clearTimeout(pTimer); pTimer = setTimeout(playerSearch, 250); };
async function playerSearch() {
  try {
    const r = await api('/mod/players?q=' + encodeURIComponent($('#pSearch').value.trim()));
    $('#pList').innerHTML = r.players.length ? r.players.map(p => `<button class="mrow pick ${PSEL === p.name ? 'on' : ''}" data-pl="${esc(p.name)}">${head(p.name)}<b>${esc(p.name)}</b>
      ${p.online ? '<i class="dot on"></i>' : ''}${p.owner ? '<span class="pill owner">Owner</span>' : p.staff ? '<span class="pill mod">Mod</span>' : ''}${p.banned ? '<span class="pill bad">Banned</span>' : ''}${p.muted ? '<span class="pill">Muted</span>' : ''}</button>`).join('') : empty('search', 'No players found');
  } catch (e) { toast('Search failed', e.message, 'bad'); }
}
async function showPlayer(name) {
  PSEL = name; $$('#pList .mrow').forEach(b => b.classList.toggle('on', b.dataset.pl === name));
  try {
    const p = await api('/mod/player?name=' + encodeURIComponent(name));
    const pr = p.profile;
    $('#pDetail').innerHTML = `<div class="pd-head"><img src="https://mc-heads.net/body/${encodeURIComponent(p.name)}/90" alt=""><div><h3>${esc(p.name)}</h3>
      <div class="mi-top">${p.online ? '<span class="pill ok">Online' + (p.server ? ' · ' + esc(p.server) : '') + '</span>' : `<span class="pill">Last seen ${ago(p.lastSeen)}</span>`}
      ${p.owner ? '<span class="pill owner">Owner</span>' : p.staff ? '<span class="pill mod">Mod</span>' : ''}${p.banned ? '<span class="pill bad">Banned</span>' : ''}${p.muted ? `<span class="pill">Muted · ${until(p.mutedUntil)}</span>` : ''}</div>
      <p class="muted small">Joined ${p.joined ? new Date(p.joined).toLocaleDateString() : 'unknown'} · ${p.friends} friends · ${p.posts} Hub posts · ${p.reports} reports · ${pr.views} profile views</p></div></div>
      ${p.ban ? `<div class="pd-ban">${icon('ban')}<div><b>Banned: ${esc(p.ban.reason || '')}</b><span class="muted small">${until(p.ban.until)}${p.ban.byName ? ' · by ' + esc(p.ban.byName) : ''}</span></div></div>` : ''}
      <div class="pd-acts">${p.owner ? '' : p.banned ? `<button class="btn sm" data-unban="${esc(p.name)}">${icon('check')} Unban</button>` : `<button class="btn sm danger" data-ban="${esc(p.name)}">${icon('ban')} Ban</button>`}
        ${p.owner ? '' : p.muted ? `<button class="btn ghost sm" data-unmute="${esc(p.name)}">${icon('volume')} Unmute</button>` : `<button class="btn ghost sm" data-mute="${esc(p.name)}">${icon('mute')} Mute</button>`}
        ${p.owner ? '' : `<button class="btn ghost sm" data-reset="${esc(p.name)}">${icon('refresh')} Reset profile</button>`}
        <a class="btn ghost sm" href="/u/${encodeURIComponent(p.name)}" target="_blank">${icon('external')} View profile</a></div>
      <h4>Profile</h4><div class="pd-prof"><p><b>${esc(pr.displayName || p.name)}</b>${pr.location ? ' · ' + esc(pr.location) : ''}</p><p>${esc(pr.bio || 'No bio')}</p>
        ${pr.links.length ? `<p class="muted small">${pr.links.map(esc).join(' · ')}</p>` : ''}${pr.media.length ? `<p class="muted small">Uploaded: ${pr.media.join(', ')}</p>` : ''}</div>
      <h4>Recent Hub chat</h4>${p.chat.length ? p.chat.map(m => `<div class="mrow slim"><span class="mi-text">${esc(m.text)}</span><span class="muted small">${ago(m.at)}</span><button class="btn ghost xs" data-del="chat:${m.id}">${icon('trash')}</button></div>`).join('') : '<p class="muted small">No messages</p>'}
      <h4>History</h4>${p.history.length ? p.history.map(logRow).join('') : '<p class="muted small">No staff actions on this player</p>'}`;
  } catch (e) { $('#pDetail').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
function modal(title, sub, body, okText, onOk, danger = true) {
  $('#mmTitle').textContent = title; $('#mmSub').textContent = sub; $('#mmBody').innerHTML = body;
  $('#mmOk').textContent = okText; $('#mmOk').classList.toggle('danger', danger); $('#mModal').hidden = false;
  $('#mmOk').onclick = async () => { $('#mmOk').disabled = true; const ok = await onOk(); $('#mmOk').disabled = false; if (ok !== false) $('#mModal').hidden = true; };
  const f = $('#mmBody input, #mmBody select'); if (f) setTimeout(() => f.focus(), 50);
}
$('#mmCancel').onclick = () => { $('#mModal').hidden = true; };
$('#mModal').onclick = e => { if (e.target.id === 'mModal') $('#mModal').hidden = true; };
function banDialog(name) {
  if (!name) return toast('Type a Minecraft name first');
  modal(`Ban ${name}`, 'They lose the Hub, DMs and their website profile until the ban ends.',
    `<label>Reason<input id="mmReason" maxlength="160" placeholder="e.g. Spamming links in Hub chat"></label>
     <label>How long<select id="mmLen"><option value="1">1 hour</option><option value="24">1 day</option><option value="168" selected>7 days</option><option value="720">30 days</option><option value="0">Permanent</option></select></label>
     <label class="mcheck"><input type="checkbox" id="mmWipe" checked> Delete their Hub posts and chat messages</label>`,
    'Ban', () => modDo('/mod/ban', { name, reason: $('#mmReason').value.trim(), hours: Number($('#mmLen').value), wipe: $('#mmWipe').checked }, `${name} banned`));
}
function muteDialog(name) {
  if (!name) return toast('Type a Minecraft name first');
  modal(`Mute ${name}`, "They can still play and use Kyoto, but can't post or chat in the Hub.",
    `<label>How long<select id="mmLen"><option value="15">15 minutes</option><option value="60" selected>1 hour</option><option value="1440">1 day</option><option value="10080">7 days</option></select></label>`,
    'Mute', () => modDo('/mod/mute', { name, minutes: Number($('#mmLen').value) }, `${name} muted`));
}
$('#bOpen').onclick = () => banDialog($('#bName').value.trim());
$('#mOpen').onclick = () => muteDialog($('#bName').value.trim());
$('#sAdd').onclick = async () => { const n = $('#sName').value.trim(); if (!n) return; if (await modDo('/mod/staff/add', { name: n }, `${n} is now a moderator`)) $('#sName').value = ''; };
$('#clearReports').onclick = () => modal('Clear all reports?', 'This removes every report without deleting anything.', '', 'Clear', () => modDo('/mod/clearreports', {}, 'Reports cleared'));
$('#page-mod').addEventListener('click', e => {
  const b = e.target.closest('[data-del],[data-ban],[data-unban],[data-mute],[data-unmute],[data-ok],[data-dis],[data-pl],[data-reset],[data-unstaff]');
  if (!b) return; const d = b.dataset;
  if (d.pl !== undefined) { if (!$('.mpanel .tab[data-mt=players]').classList.contains('on')) modTab('players'); return showPlayer(d.pl); }
  if (d.del) { const [kind, id] = d.del.split(':'); return modDo('/mod/delete', { kind, id }, kind === 'chat' ? 'Message deleted' : 'Post removed'); }
  if (d.ban) return banDialog(d.ban);
  if (d.mute) return muteDialog(d.mute);
  if (d.unban) return modDo('/mod/unban', { name: d.unban }, `${d.unban} unbanned`);
  if (d.unmute) return modDo('/mod/unmute', { name: d.unmute }, `${d.unmute} unmuted`);
  if (d.ok) return modDo('/mod/approve', { id: Number(d.ok) }, 'Approved, it is live in the Hub');
  if (d.dis) { const [at, by] = d.dis.split('|'); return modDo('/mod/report/dismiss', { at: Number(at), by }, 'Report dismissed'); }
  if (d.reset) return modal(`Reset ${d.reset}'s profile?`, 'Removes their bio, links, name, and uploaded media. This cannot be undone.', '', 'Reset', () => modDo('/mod/profile/reset', { name: d.reset }, 'Profile reset'));
  if (d.unstaff) return modal(`Remove ${d.unstaff} from staff?`, 'They lose access to this panel right away.', '', 'Remove', () => modDo('/mod/staff/remove', { name: d.unstaff }, 'Removed from staff'));
});

/* ===================== start ===================== */
route(); observe();
