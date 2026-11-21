/* Kyoto website: Wrapped, Badges, Events, Creator Program, Dev log, Feedback, Bug reports, Docs, "Me" (profile tools + analytics),
   profile widgets + guestbook + music visualizer, light/dark mode and languages. */
'use strict';
(() => {
  const root = () => $('#moreRoot');
  const me = () => { try { return JSON.parse(localStorage.getItem('kyoto.me') || 'null'); } catch (e) { return null; } };
  const loggedIn = () => !!localStorage.getItem('kyoto.token');
  const needLogin = () => toast(t('Log in first'), t('Type /kyoto link in game, then log in on the Edit profile page.'));
  const head = (n, s = 40) => `https://mc-heads.net/avatar/${encodeURIComponent(n || 'MHF_Steve')}/${s}`;
  const fmt = n => Number(n || 0).toLocaleString();
  const ago = x => { const s = (Date.now() - x) / 1000; return s < 60 ? t('just now') : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : s < 2592000 ? Math.floor(s / 86400) + 'd' : new Date(x).toLocaleDateString(); };
  const loading = () => '<div class="cload"><i></i><i></i><i></i></div>';
  const errBox = e => `<div class="sempty"><h3>${t('Couldn\'t load this')}</h3><p>${esc(e.message)}</p></div>`;
  let token = 0;
  function modal(html, cls = '') {
    const box = document.createElement('div'); box.className = 'cmodal';
    box.innerHTML = `<div class="cbox sell ${cls}"><button class="cx" data-x>${icon('x')}</button>${html}</div>`;
    document.body.appendChild(box);
    box.onclick = e => { if (e.target === box || e.target.closest('[data-x]')) box.remove(); };
    return box;
  }
  const NAV = [['wrapped', 'Wrapped', 'sparkles'], ['events', 'Events', 'clock'], ['badges', 'Badges', 'trophy'], ['blog', 'Dev log', 'edit'], ['feedback', 'Feedback', 'chat'], ['creator-program', 'Creator program', 'star'], ['docs', 'Docs', 'bookmark'], ['bug', 'Report a bug', 'flag']];
  function frame(key, title, sub, inner, acts = '') {
    root().innerHTML = `<header class="phero more-hero"><span class="eyebrow">Kyoto</span><h1>${esc(t(title))}</h1>${sub ? `<p>${esc(t(sub))}</p>` : ''}${acts ? `<div class="phero-acts">${acts}</div>` : ''}</header>
      <nav class="ctabs">${NAV.map(([k, n, ic]) => `<a href="/${k}" data-link class="${key === k ? 'on' : ''}">${icon(ic)}${esc(t(n))}</a>`).join('')}${loggedIn() ? `<a href="/me" data-link class="${key === 'me' ? 'on' : ''}">${icon('user')}${esc(t('Me'))}</a>` : ''}</nav>
      <section class="cwrap more">${inner}</section>`;
  }

  /* ================================================================ languages ================================================================ */
  const LANGS = { en: 'English', es: 'Español', pt: 'Português', fr: 'Français', de: 'Deutsch' };
  const L = {
    es: { 'News': 'Noticias', 'Changelog': 'Cambios', 'Features': 'Funciones', 'Cosmetics': 'Cosméticos', 'Studio': 'Studio', 'Hub': 'Hub', 'Community': 'Comunidad', 'Support': 'Ayuda', 'Socials': 'Redes', 'Download': 'Descargar', 'Log in': 'Iniciar sesión', 'online': 'en línea', 'Menu': 'Menú',
      'Wrapped': 'Resumen', 'Events': 'Eventos', 'Badges': 'Insignias', 'Dev log': 'Diario de desarrollo', 'Feedback': 'Ideas', 'Creator program': 'Programa de creadores', 'Docs': 'Guías', 'Report a bug': 'Reportar un error', 'Me': 'Yo',
      'Log in first': 'Inicia sesión primero', 'Type /kyoto link in game, then log in on the Edit profile page.': 'Escribe /kyoto link en el juego y luego inicia sesión en Editar perfil.', 'just now': 'ahora', "Couldn't load this": 'No se pudo cargar',
      'Your year on Kyoto': 'Tu año en Kyoto', 'Every badge and how rare it is.': 'Todas las insignias y lo raras que son.', 'Build contests, PvP nights and parties with Kyoto players.': 'Concursos, noches de PvP y fiestas con jugadores de Kyoto.',
      'Vote on what Kyoto makes next.': 'Vota qué hace Kyoto después.', 'Something broke? Tell us and we\'ll fix it.': '¿Algo se rompió? Cuéntanos y lo arreglamos.', 'How to use Kyoto Client, the launcher, Studio and the Hub.': 'Cómo usar Kyoto Client, el launcher, Studio y el Hub.',
      'Make Kyoto content, get your own creator code and earn coins.': 'Crea contenido de Kyoto, consigue tu código de creador y gana monedas.', 'What\'s new and what\'s next for Kyoto.': 'Lo nuevo y lo próximo de Kyoto.', 'Light mode': 'Modo claro', 'Dark mode': 'Modo oscuro',
      'Profile editor': 'Editor de perfil', 'Kyoto Studio': 'Kyoto Studio', 'Creators': 'Creadores', 'Leaderboards': 'Clasificación', 'Edit profile': 'Editar perfil', 'Hours played': 'Horas jugadas', 'Days played': 'Días jugados', 'Friends': 'Amigos', 'Messages': 'Mensajes', 'Top servers': 'Servidores favoritos', 'Achievements': 'Logros', 'Level': 'Nivel', 'Share': 'Compartir', 'Copy link': 'Copiar enlace',
      'Send': 'Enviar', 'Sign the guestbook': 'Firma el libro de visitas', 'Guestbook': 'Libro de visitas', 'Listening to': 'Escuchando', 'Playing on': 'Jugando en', 'Offline': 'Desconectado' },
    pt: { 'News': 'Notícias', 'Changelog': 'Mudanças', 'Features': 'Recursos', 'Cosmetics': 'Cosméticos', 'Community': 'Comunidade', 'Support': 'Suporte', 'Socials': 'Redes', 'Download': 'Baixar', 'Log in': 'Entrar', 'online': 'online', 'Menu': 'Menu',
      'Wrapped': 'Retrospectiva', 'Events': 'Eventos', 'Badges': 'Insígnias', 'Dev log': 'Diário de dev', 'Feedback': 'Ideias', 'Creator program': 'Programa de criadores', 'Docs': 'Guias', 'Report a bug': 'Reportar um bug', 'Me': 'Eu',
      'Log in first': 'Entre primeiro', 'just now': 'agora', "Couldn't load this": 'Não deu para carregar', 'Your year on Kyoto': 'Seu ano no Kyoto', 'Light mode': 'Modo claro', 'Dark mode': 'Modo escuro', 'Profile editor': 'Editor de perfil', 'Creators': 'Criadores', 'Leaderboards': 'Rankings', 'Edit profile': 'Editar perfil',
      'Hours played': 'Horas jogadas', 'Days played': 'Dias jogados', 'Friends': 'Amigos', 'Messages': 'Mensagens', 'Top servers': 'Servidores favoritos', 'Achievements': 'Conquistas', 'Level': 'Nível', 'Share': 'Compartilhar', 'Copy link': 'Copiar link', 'Send': 'Enviar', 'Guestbook': 'Livro de visitas', 'Sign the guestbook': 'Assine o livro de visitas', 'Listening to': 'Ouvindo', 'Playing on': 'Jogando em', 'Offline': 'Offline' },
    fr: { 'News': 'Actus', 'Changelog': 'Nouveautés', 'Features': 'Fonctions', 'Cosmetics': 'Cosmétiques', 'Community': 'Communauté', 'Support': 'Aide', 'Socials': 'Réseaux', 'Download': 'Télécharger', 'Log in': 'Connexion', 'online': 'en ligne', 'Menu': 'Menu',
      'Wrapped': 'Bilan', 'Events': 'Événements', 'Badges': 'Badges', 'Dev log': 'Journal de dev', 'Feedback': 'Idées', 'Creator program': 'Programme créateurs', 'Docs': 'Guides', 'Report a bug': 'Signaler un bug', 'Me': 'Moi',
      'Log in first': 'Connecte-toi d\'abord', 'just now': 'à l\'instant', "Couldn't load this": 'Chargement impossible', 'Your year on Kyoto': 'Ton année sur Kyoto', 'Light mode': 'Mode clair', 'Dark mode': 'Mode sombre', 'Profile editor': 'Éditeur de profil', 'Creators': 'Créateurs', 'Leaderboards': 'Classements', 'Edit profile': 'Modifier le profil',
      'Hours played': 'Heures jouées', 'Days played': 'Jours joués', 'Friends': 'Amis', 'Messages': 'Messages', 'Top servers': 'Serveurs préférés', 'Achievements': 'Succès', 'Level': 'Niveau', 'Share': 'Partager', 'Copy link': 'Copier le lien', 'Send': 'Envoyer', 'Guestbook': 'Livre d\'or', 'Sign the guestbook': 'Signe le livre d\'or', 'Listening to': 'Écoute', 'Playing on': 'Joue sur', 'Offline': 'Hors ligne' },
    de: { 'News': 'News', 'Changelog': 'Änderungen', 'Features': 'Funktionen', 'Cosmetics': 'Kosmetik', 'Community': 'Community', 'Support': 'Hilfe', 'Socials': 'Socials', 'Download': 'Download', 'Log in': 'Anmelden', 'online': 'online', 'Menu': 'Menü',
      'Wrapped': 'Rückblick', 'Events': 'Events', 'Badges': 'Abzeichen', 'Dev log': 'Entwickler-Log', 'Feedback': 'Ideen', 'Creator program': 'Creator-Programm', 'Docs': 'Anleitungen', 'Report a bug': 'Bug melden', 'Me': 'Ich',
      'Log in first': 'Erst anmelden', 'just now': 'gerade eben', "Couldn't load this": 'Konnte nicht laden', 'Your year on Kyoto': 'Dein Jahr auf Kyoto', 'Light mode': 'Hell', 'Dark mode': 'Dunkel', 'Profile editor': 'Profil-Editor', 'Creators': 'Creator', 'Leaderboards': 'Bestenlisten', 'Edit profile': 'Profil bearbeiten',
      'Hours played': 'Gespielte Stunden', 'Days played': 'Gespielte Tage', 'Friends': 'Freunde', 'Messages': 'Nachrichten', 'Top servers': 'Lieblingsserver', 'Achievements': 'Erfolge', 'Level': 'Level', 'Share': 'Teilen', 'Copy link': 'Link kopieren', 'Send': 'Senden', 'Guestbook': 'Gästebuch', 'Sign the guestbook': 'Ins Gästebuch schreiben', 'Listening to': 'Hört', 'Playing on': 'Spielt auf', 'Offline': 'Offline' }
  };
  let lang = localStorage.getItem('kyoto.lang') || (navigator.language || 'en').slice(0, 2);
  if (!LANGS[lang]) lang = 'en';
  function t(s) { return (L[lang] && L[lang][s]) || s; }
  window.KY_T = t;
  // translate the fixed parts of the page (nav, menu, footer) by their English text
  const ORIG = new WeakMap();
  function translateChrome() {
    for (const sel of ['#nav', '#menu', '#siteFoot .foot2']) {
      const box = $(sel); if (!box) continue;
      const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      let n; while ((n = walk.nextNode())) {
        const txt = n.nodeValue.trim(); if (!txt) continue;
        if (!ORIG.has(n)) ORIG.set(n, n.nodeValue);
        const o = ORIG.get(n), k = o.trim();
        n.nodeValue = o.replace(k, t(k));
      }
    }
    document.documentElement.lang = lang;
  }

  /* ================================================================ light / dark ================================================================ */
  function applyMode() { document.documentElement.classList.toggle('light', localStorage.getItem('kyoto.mode') === 'light'); const b = $('#modeBtn'); if (b) { const l = document.documentElement.classList.contains('light'); b.innerHTML = icon(l ? 'moon' : 'sun'); b.title = t(l ? 'Dark mode' : 'Light mode'); } }
  (function addNavTools() {
    const right = $('.nav-right'); if (!right || $('#modeBtn')) return;
    const box = document.createElement('div'); box.className = 'navtools';
    box.innerHTML = `<button class="navtool" id="modeBtn"></button><select class="navlang" id="langSel" title="Language">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${k === lang ? 'selected' : ''} title="${n}">${k.toUpperCase()}</option>`).join('')}</select>`;
    right.insertBefore(box, right.firstChild);
    $('#modeBtn').onclick = () => { localStorage.setItem('kyoto.mode', document.documentElement.classList.contains('light') ? 'dark' : 'light'); applyMode(); };
    $('#langSel').onchange = e => { lang = e.target.value; localStorage.setItem('kyoto.lang', lang); translateChrome(); applyMode(); if (!$('#page-more').hidden) openMore(location.pathname); };
    // more links in the menu + footer
    const fr = $('#siteFoot .f-row'); if (fr) { const legal = $('.f-legal', fr); NAV.forEach(([k, n]) => { const a = document.createElement('a'); a.href = '/' + k; a.dataset.link = ''; a.textContent = n; fr.insertBefore(a, $('#themePill') || legal); }); }
    applyMode(); translateChrome();
  })();

  /* ================================================================ router ================================================================ */
  async function openMore(p) {
    const [, a, b] = /^\/([a-z-]+)(?:\/([^/]+))?/.exec(p) || [];
    document.title = 'Kyoto · ' + t((NAV.find(n => n[0] === a) || [0, a === 'me' ? 'Me' : 'Kyoto'])[1]);
    try {
      if (a === 'wrapped') return wrapped(b);
      if (a === 'badges') return badges();
      if (a === 'events') return events();
      if (a === 'blog') return b ? blogPost(b) : blog();
      if (a === 'feedback') return feedback();
      if (a === 'bug') return bug();
      if (a === 'docs') return docs(b);
      if (a === 'creator-program') return program();
      if (a === 'me') return mePage();
    } catch (e) { root().innerHTML = errBox(e); }
  }
  window.openMore = openMore;
  window.KY_MORE_PATHS = /^\/(wrapped|badges|events|blog|feedback|bug|docs|creator-program|me)(\/|$)/;

  /* ================================================================ Wrapped ================================================================ */
  async function wrapped(name) {
    const tk = ++token;
    const who = name || (me() && me().name);
    if (!who) { frame('wrapped', 'Kyoto Wrapped', 'Your year on Kyoto', `<div class="sempty"><h3>${t('Log in first')}</h3><p>${t('Type /kyoto link in game, then log in on the Edit profile page.')}</p><form class="wfind" id="wfind"><input placeholder="Or type a player name"><button class="btn">Go</button></form></div>`); $('#wfind').onsubmit = e => { e.preventDefault(); const v = $('#wfind input').value.trim(); if (v) { history.pushState(null, '', '/wrapped/' + encodeURIComponent(v)); openMore('/wrapped/' + v); } }; return; }
    frame('wrapped', 'Kyoto Wrapped', 'Your year on Kyoto', loading());
    const w = await api('/wrapped?name=' + encodeURIComponent(who), { auth: loggedIn() }).catch(e => { $('.cwrap').innerHTML = errBox(e); return null; });
    if (!w || tk !== token) return;
    const top = w.servers[0];
    const slides = [
      ['sparkles', `${w.year}`, `${esc(w.name)}'s Kyoto Wrapped`, 'Let\'s look back.'],
      ['clock', fmt(w.hours), t('Hours played'), w.topPct <= 50 ? `That's more than ${100 - w.topPct}% of Kyoto players.` : 'Every hour counts.'],
      ['history', fmt(w.days), t('Days played'), w.nights ? `${fmt(w.nights)} of them were late nights.` : 'A regular.'],
      ['server', top ? esc(top.host) : '—', 'Your #1 server', top ? `${fmt(Math.round(top.mins / 60))} hours there.${w.servers[1] ? ' Then ' + esc(w.servers[1].host) + (w.servers[2] ? ' and ' + esc(w.servers[2].host) : '') + '.' : ''}` : 'Play on a server with Kyoto to see this.'],
      ['users', fmt(w.friends), t('Friends'), w.streakBest ? `Your best streak with a friend: ${w.streakBest} days.` : 'Add friends in the Hub.'],
      ['chat', fmt(w.msgs), t('Messages'), w.gifts ? `And you sent ${fmt(w.gifts)} gifts.` : 'In the Kyoto Hub.'],
      ['trophy', `${t('Level')} ${w.level}`, `${fmt(w.achCount)} ${t('Achievements').toLowerCase()}`, w.achievements.map(a => esc(a.name)).slice(-3).join(' · ') || 'Unlock some by playing.'],
      ['coin', fmt(w.coins), 'Kyoto coins', w.daily ? `${w.daily} day login streak.` : 'Play every day for more.'],
      ['heart', 'Thanks', 'for playing with Kyoto', 'See you next year.']
    ];
    $('.cwrap').innerHTML = `<div class="wrapped"><div class="wstage" id="wstage">${slides.map((s, i) => `<div class="wslide${i === 0 ? ' on' : ''}" style="--h:${(i * 37) % 360}"><div class="wic">${icon(s[0])}</div><b>${s[1]}</b><h3>${s[2]}</h3><p>${s[3]}</p></div>`).join('')}
      <div class="wbars">${slides.map((_, i) => `<i data-w="${i}"><em></em></i>`).join('')}</div><button class="wprev" id="wprev"></button><button class="wnext" id="wnext"></button></div>
      <div class="wacts"><button class="btn ghost" id="wcopy">${icon('link')} ${t('Copy link')}</button><a class="btn ghost" href="/u/${encodeURIComponent(w.name)}" data-link>${icon('user')} Profile</a></div></div>`;
    let i = 0, tm = 0;
    const go = n => { i = (n + slides.length) % slides.length; $$('.wslide').forEach((s, k) => s.classList.toggle('on', k === i)); $$('.wbars i').forEach((b, k) => { b.classList.toggle('done', k < i); b.classList.toggle('now', k === i); }); clearTimeout(tm); tm = setTimeout(() => { if (tk === token && $('#wstage')) go(i + 1); }, 5000); };
    $('#wnext').onclick = () => go(i + 1); $('#wprev').onclick = () => go(i - 1); go(0);
    $('#wcopy').onclick = () => { navigator.clipboard.writeText(location.origin + '/wrapped/' + encodeURIComponent(w.name)); toast(t('Copy link'), location.host + '/wrapped/' + w.name); };
  }

  /* ================================================================ Badges ================================================================ */
  async function badges() {
    frame('badges', 'Badges', 'Every badge and how rare it is.', loading());
    const r = await api('/badges', { auth: false });
    const card = b => `<div class="bdg ${b.pct < 5 ? 'rare' : b.pct < 20 ? 'uncommon' : ''}"><div class="bic">${icon(b.icon || 'star')}</div><div><b>${esc(b.name)}</b><span>${esc(b.how)}</span></div><em>${b.pct < 0.1 && b.n ? '<0.1' : b.pct}%<small>${fmt(b.n)} ${b.n === 1 ? 'player' : 'players'}</small></em></div>`;
    $('.cwrap').innerHTML = `<h3 class="csub">${icon('crown')} Special badges</h3><div class="bgrid">${r.special.map(card).join('')}</div>
      <h3 class="csub">${icon('trophy')} Achievement badges <small class="muted">rarest first · out of ${fmt(r.players)} players</small></h3><div class="bgrid">${r.achievements.map(card).join('')}</div>`;
  }

  /* ================================================================ Events ================================================================ */
  let evMonth = null;
  async function events() {
    frame('events', 'Events', 'Build contests, PvP nights and parties with Kyoto players.', loading(),
      `<button class="btn glow" id="evNew">${icon('plus')} Post an event</button><a class="btn ghost" href="${CONFIG.api}/events/ics" target="_blank">${icon('clock')} Add to my calendar</a>`);
    const r = await api('/events', { auth: loggedIn() });
    const KIND = { build: ['Build', 'edit'], pvp: ['PvP', 'crosshair'], party: ['Party', 'sparkles'], contest: ['Contest', 'trophy'], stream: ['Stream', 'film'], other: ['Event', 'star'] };
    const d0 = evMonth || new Date(); d0.setDate(1); d0.setHours(0, 0, 0, 0); evMonth = d0;
    const first = new Date(d0), startDay = (first.getDay() + 6) % 7, days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    const byDay = {}; for (const e of r.events) { const d = new Date(e.start); if (d.getMonth() === d0.getMonth() && d.getFullYear() === d0.getFullYear()) (byDay[d.getDate()] = byDay[d.getDate()] || []).push(e); }
    const today = new Date();
    let cells = ''; for (let k = 0; k < startDay; k++) cells += '<div class="cal-c empty"></div>';
    for (let dd = 1; dd <= days; dd++) { const isT = today.getDate() === dd && today.getMonth() === d0.getMonth() && today.getFullYear() === d0.getFullYear(); cells += `<div class="cal-c${isT ? ' today' : ''}"><span>${dd}</span>${(byDay[dd] || []).slice(0, 3).map(e => `<button data-ev="${e.id}" class="cal-e k-${e.kind}">${esc(e.title)}</button>`).join('')}</div>`; }
    const row = e => { const s = new Date(e.start), live = e.start < Date.now() && e.end > Date.now(); return `<article class="evrow${live ? ' live' : ''}" id="ev${e.id}"><div class="evdate"><b>${s.getDate()}</b><span>${s.toLocaleString([], { month: 'short' })}</span></div>
      <div class="evbody"><div class="evtop"><span class="evk k-${e.kind}">${icon(KIND[e.kind][1])}${KIND[e.kind][0]}</span>${live ? '<span class="evlive">LIVE NOW</span>' : ''}${e.official ? '<span class="evoff">Official</span>' : ''}</div>
      <h3>${esc(e.title)}</h3><p>${esc(e.desc)}</p><small>${s.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} – ${new Date(e.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${e.server ? ' · ' + icon('server') + ' ' + esc(e.server) : ''} · by ${esc(e.host)}</small></div>
      <div class="evact"><button class="btn sm ${e.me ? '' : 'ghost'}" data-rsvp="${e.id}">${e.me ? icon('check') + ' Going' : 'I\'m going'}</button><small>${fmt(e.going)} going</small>${e.mine ? `<button class="btn xs ghost" data-evdel="${e.id}">${icon('trash')}</button>` : ''}</div></article>`; };
    $('.cwrap').innerHTML = `<div class="evgrid"><div><h3 class="csub">${icon('clock')} Coming up</h3>${r.events.length ? r.events.map(row).join('') : '<div class="sempty"><h3>No events yet</h3><p>Kyoto+ members, creators and staff can post one.</p></div>'}</div>
      <aside class="cal"><div class="cal-h"><button id="calPrev">${icon('chevron')}</button><b>${d0.toLocaleString([], { month: 'long', year: 'numeric' })}</b><button id="calNext">${icon('chevron')}</button></div>
      <div class="cal-g">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<i>${x}</i>`).join('')}${cells}</div></aside></div>`;
    $('#calPrev').onclick = () => { evMonth = new Date(d0.getFullYear(), d0.getMonth() - 1, 1); events(); };
    $('#calNext').onclick = () => { evMonth = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); events(); };
    $$('[data-ev]').forEach(b => b.onclick = () => { const el = $('#ev' + b.dataset.ev); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); } });
    $$('[data-rsvp]').forEach(b => b.onclick = async () => { if (!loggedIn()) return needLogin(); try { await api('/events/rsvp', { method: 'POST', body: { id: Number(b.dataset.rsvp) } }); events(); } catch (e) { toast('Couldn\'t do that', e.message); } });
    $$('[data-evdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this event?')) return; await api('/events/delete', { method: 'POST', body: { id: Number(b.dataset.evdel) } }); events(); });
    $('#evNew').onclick = () => {
      if (!loggedIn()) return needLogin();
      if (!r.canHost) return toast('Can\'t post events yet', 'Kyoto+ members, Kyoto creators and staff can post events.');
      const box = modal(`<h3>Post an event</h3><label>Name<input id="evT" maxlength="60" placeholder="Build contest: tiny houses"></label>
        <div class="two"><label>Starts<input type="datetime-local" id="evS"></label><label>How long<select id="evL"><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="6">6 hours</option><option value="24">All day</option></select></label></div>
        <div class="two"><label>Type<select id="evK">${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label><label>Server (optional)<input id="evSv" maxlength="60" placeholder="donutsmp.net"></label></div>
        <label>What happens<textarea id="evD" maxlength="400" placeholder="Rules, prizes, where to meet..."></textarea></label>
        <div class="mrow"><button class="btn ghost" data-x>Cancel</button><button class="btn glow" id="evGo">Post</button></div>`, 'evform');
      $('#evGo', box).onclick = async () => {
        const start = new Date($('#evS', box).value).getTime(); if (!start) return toast('Pick a start time');
        try { await api('/events', { method: 'POST', body: { title: $('#evT', box).value, desc: $('#evD', box).value, kind: $('#evK', box).value, server: $('#evSv', box).value, start, end: start + Number($('#evL', box).value) * 3600000 } }); box.remove(); toast('Event posted'); events(); }
        catch (e) { toast('Couldn\'t post it', e.message); }
      };
    };
  }

  /* ================================================================ Dev log ================================================================ */
  // tiny safe markdown: # headings, **bold**, *italic*, `code`, [links](https://), - lists, > quotes, images ![](https://)
  function md(s) {
    const inline = x => esc(x).replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let out = '', list = false;
    for (const line of String(s).split('\n')) {
      const l = line.trimEnd();
      if (/^\s*[-*] /.test(l)) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`; continue; }
      if (list) { out += '</ul>'; list = false; }
      if (/^### /.test(l)) out += `<h4>${inline(l.slice(4))}</h4>`; else if (/^## /.test(l)) out += `<h3>${inline(l.slice(3))}</h3>`; else if (/^# /.test(l)) out += `<h2>${inline(l.slice(2))}</h2>`;
      else if (/^> /.test(l)) out += `<blockquote>${inline(l.slice(2))}</blockquote>`; else if (l.trim()) out += `<p>${inline(l)}</p>`;
    }
    return out + (list ? '</ul>' : '');
  }
  async function blog() {
    frame('blog', 'Dev log', 'What\'s new and what\'s next for Kyoto.', loading(), me() ? '<span id="blogNewSlot"></span>' : '');
    const r = await api('/blog', { auth: false });
    $('.cwrap').innerHTML = r.posts.length ? `<div class="bloglist">${r.posts.map(p => `<a class="bpost" href="/blog/${p.id}" data-link>${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : `<div class="bcover">${icon('edit')}</div>`}<div><small>${new Date(p.at).toLocaleDateString()} · ${esc(p.by)}${p.tags.length ? ' · ' + p.tags.map(esc).join(', ') : ''}</small><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}…</p></div></a>`).join('')}</div>`
      : '<div class="sempty"><h3>No posts yet</h3><p>The first dev log is coming soon.</p></div>';
    if (loggedIn()) api('/mod/me').then(m => { if (m.staff && $('#blogNewSlot')) { $('#blogNewSlot').outerHTML = `<button class="btn glow" id="blogNew">${icon('plus')} New post</button>`; $('#blogNew').onclick = () => blogEditor(); } }).catch(() => {});
  }
  function blogEditor(p) {
    const box = modal(`<h3>${p ? 'Edit post' : 'New dev log post'}</h3><label>Title<input id="bT" maxlength="90" value="${esc(p ? p.title : '')}"></label>
      <div class="two"><label>Tags (commas)<input id="bG" value="${esc(p ? p.tags.join(', ') : '')}" placeholder="update, mod"></label><label>Cover image link (https://)<input id="bC" value="${esc(p ? p.cover : '')}"></label></div>
      <label>Text <small class="muted"># heading, **bold**, - list, [link](https://), ![picture](https://)</small><textarea id="bB" class="tall">${esc(p ? p.body : '')}</textarea></label>
      <div class="mrow"><button class="btn ghost" data-x>Cancel</button><button class="btn glow" id="bGo">${p ? 'Save' : 'Post'}</button></div>`, 'wide');
    $('#bGo', box).onclick = async () => { try { await api('/blog', { method: 'POST', body: { id: p ? p.id : undefined, title: $('#bT', box).value, tags: $('#bG', box).value, cover: $('#bC', box).value, body: $('#bB', box).value } }); box.remove(); toast('Saved'); p ? blogPost(p.id) : blog(); } catch (e) { toast('Couldn\'t save', e.message); } };
  }
  async function blogPost(id) {
    frame('blog', 'Dev log', '', loading());
    const p = await api('/blog/one?id=' + Number(id), { auth: loggedIn() });
    document.title = p.title + ' · Kyoto dev log';
    $('.cwrap').innerHTML = `<article class="barticle">${p.cover ? `<img class="bhero" src="${esc(p.cover)}" alt="">` : ''}<small>${new Date(p.at).toLocaleDateString([], { dateStyle: 'long' })} · ${esc(p.by)}</small><h1>${esc(p.title)}</h1><div class="bmd">${md(p.body)}</div>
      <div class="bfoot"><button class="btn sm ${p.liked ? '' : 'ghost'}" id="bLike">${icon('heart')} ${fmt(p.likes)}</button><a class="btn sm ghost" href="/blog" data-link>${icon('arrow')} All posts</a>${p.canEdit ? `<button class="btn sm ghost" id="bEdit">${icon('edit')} Edit</button><button class="btn sm ghost" id="bDel">${icon('trash')}</button>` : ''}</div></article>`;
    $('#bLike').onclick = async () => { if (!loggedIn()) return needLogin(); const r = await api('/blog/like', { method: 'POST', body: { id: p.id } }); $('#bLike').innerHTML = `${icon('heart')} ${fmt(r.likes)}`; $('#bLike').classList.toggle('ghost', !r.liked); };
    if (p.canEdit) { $('#bEdit').onclick = () => blogEditor(p); $('#bDel').onclick = async () => { if (!confirm('Delete this post?')) return; await api('/blog/delete', { method: 'POST', body: { id: p.id } }); history.pushState(null, '', '/blog'); blog(); }; }
  }

  /* ================================================================ Feedback board ================================================================ */
  let fbStatus = '', fbSort = 'top', fbOpen = null;
  const STAT = { open: ['Open', '#afafaf'], planned: ['Planned', '#c1c1c1'], working: ['Working on it', '#e6e6e6'], done: ['Done', '#e2e2e2'], no: ['Not planned', '#b3b3b3'] };
  async function feedback() {
    frame('feedback', 'Feedback', 'Vote on what Kyoto makes next.', loading(), `<button class="btn glow" id="fbNew">${icon('plus')} Share an idea</button>`);
    const r = await api(`/feedback?sort=${fbSort}&status=${fbStatus}`, { auth: loggedIn() });
    $('.cwrap').innerHTML = `<div class="sbar in"><div class="ntabs big">${[['', 'All'], ...Object.entries(STAT).map(([k, v]) => [k, v[0] + ' ' + (r.counts[k] || 0)])].map(([k, n]) => `<button data-fs="${k}" class="${fbStatus === k ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>
      <div class="sbar-r"><div class="ntabs"><button data-fo="top" class="${fbSort === 'top' ? 'on' : ''}">Top</button><button data-fo="new" class="${fbSort === 'new' ? 'on' : ''}">New</button></div></div></div>
      <div class="fblist">${r.items.map(f => `<article class="fb">
        <button class="fbvote${f.voted ? ' on' : ''}" data-fv="${f.id}">${icon('chevron')}<b>${fmt(f.votes)}</b></button>
        <div class="fbbody"><div class="fbtop"><span class="fbs" style="--c:${STAT[f.status][1]}">${STAT[f.status][0]}</span><span class="fbc">${esc(f.cat)}</span><small>${esc(f.by)} · ${ago(f.at)}</small></div>
          <h3>${esc(f.title)}</h3>${f.text ? `<p>${esc(f.text)}</p>` : ''}
          <div class="fbacts"><button class="btn xs ghost" data-fr="${f.id}">${icon('chat')} ${f.replies.length}</button>${r.staff ? `<select data-fst="${f.id}">${Object.entries(STAT).map(([k, v]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>` : ''}${f.mine || r.staff ? `<button class="btn xs ghost" data-fdel="${f.id}">${icon('trash')}</button>` : ''}</div>
          <div class="fbreplies" ${fbOpen === f.id ? '' : 'hidden'} id="fbr${f.id}">${f.replies.map(x => `<div class="fbreply${x.staff ? ' staff' : ''}"><img src="${head(x.name, 20)}" alt=""><b>${esc(x.name)}</b>${x.staff ? '<span class="tag mod">Kyoto</span>' : ''}<span>${esc(x.text)}</span></div>`).join('')}
            ${loggedIn() ? `<form data-frf="${f.id}"><input maxlength="400" placeholder="Reply..."><button class="btn xs">Send</button></form>` : ''}</div></div></article>`).join('') || '<div class="sempty"><h3>Nothing here yet</h3><p>Share the first idea.</p></div>'}</div>`;
    $$('[data-fs]').forEach(b => b.onclick = () => { fbStatus = b.dataset.fs; feedback(); });
    $$('[data-fo]').forEach(b => b.onclick = () => { fbSort = b.dataset.fo; feedback(); });
    $$('[data-fv]').forEach(b => b.onclick = async () => { if (!loggedIn()) return needLogin(); const x = await api('/feedback/vote', { method: 'POST', body: { id: Number(b.dataset.fv) } }); b.classList.toggle('on', x.voted); $('b', b).textContent = fmt(x.votes); });
    $$('[data-fr]').forEach(b => b.onclick = () => { const el = $('#fbr' + b.dataset.fr); el.hidden = !el.hidden; fbOpen = el.hidden ? null : Number(b.dataset.fr); });
    $$('[data-frf]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const v = $('input', f).value.trim(); if (!v) return; try { await api('/feedback/reply', { method: 'POST', body: { id: Number(f.dataset.frf), text: v } }); fbOpen = Number(f.dataset.frf); feedback(); } catch (err) { toast('Couldn\'t reply', err.message); } });
    $$('[data-fst]').forEach(s => s.onchange = async () => { await api('/feedback/status', { method: 'POST', body: { id: Number(s.dataset.fst), status: s.value } }); feedback(); });
    $$('[data-fdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this idea?')) return; await api('/feedback/delete', { method: 'POST', body: { id: Number(b.dataset.fdel) } }); feedback(); });
    $('#fbNew').onclick = () => {
      if (!loggedIn()) return needLogin();
      const box = modal(`<h3>Share an idea</h3><label>What should Kyoto add or change?<input id="fT" maxlength="80" placeholder="Short and clear"></label>
        <label>Where<select id="fC"><option value="mod">The mod</option><option value="website">Website</option><option value="launcher">Launcher</option><option value="studio">Kyoto Studio</option><option value="hub">Hub</option><option value="other">Something else</option></select></label>
        <label>More details (optional)<textarea id="fX" maxlength="600"></textarea></label><div class="mrow"><button class="btn ghost" data-x>Cancel</button><button class="btn glow" id="fGo">Post</button></div>`);
      $('#fGo', box).onclick = async () => { try { await api('/feedback', { method: 'POST', body: { title: $('#fT', box).value, cat: $('#fC', box).value, text: $('#fX', box).value } }); box.remove(); fbSort = 'new'; feedback(); toast('Posted', 'People can vote on it now.'); } catch (e) { toast('Couldn\'t post', e.message); } };
    };
  }

  /* ================================================================ Bug report ================================================================ */
  function bug() {
    frame('bug', 'Report a bug', 'Something broke? Tell us and we\'ll fix it.', `<form class="bugform" id="bugForm">
      <div class="bughelp"><h3>${icon('shield')} Got a crash?</h3><p>Open the <b>Kyoto Launcher</b> → <b>Tools</b> → <b>Crash Doctor</b> → <b>Copy report</b>, then paste it below. It tells us exactly what went wrong.</p><p class="muted small">No launcher? Attach <code>.minecraft/logs/latest.log</code> or the newest file in <code>.minecraft/crash-reports</code>.</p></div>
      <div class="two"><label>Where<select id="bgW"><option value="mod">The mod (in game)</option><option value="launcher">Launcher</option><option value="studio">Kyoto Studio</option><option value="website">Website</option><option value="hub">Hub</option><option value="other">Something else</option></select></label>
      <label>Version (optional)<input id="bgV" maxlength="40" placeholder="6.13.1"></label></div>
      <label>What happened? (short)<input id="bgT" maxlength="100" placeholder="Game crashes when I open the HUD editor" required></label>
      <label>How do we make it happen?<textarea id="bgS" maxlength="3000" placeholder="1. Join DonutSMP&#10;2. Press Right Shift&#10;3. ..."></textarea></label>
      <label>Crash Doctor report / log <small class="muted">paste, or pick a file</small><textarea id="bgL" class="mono" placeholder="Paste the report here"></textarea></label>
      <div class="two"><label class="filepick">${icon('upload')} Attach a .log / .txt<input type="file" id="bgF" accept=".log,.txt,text/plain" hidden></label><label>How can we reach you? (optional)<input id="bgC" maxlength="80" placeholder="Discord name"></label></div>
      <button class="btn glow big" id="bgGo">${icon('flag')} Send report</button></form>`);
    $('#bgF').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 2e6) return toast('Too big', 'Logs up to 2 MB'); const txt = await f.text(); $('#bgL').value = txt.length > 200000 ? txt.slice(-200000) : txt; toast('Log attached', f.name); };
    $('#bugForm').onsubmit = async e => {
      e.preventDefault(); $('#bgGo').disabled = true;
      try { const r = await api('/bugs', { method: 'POST', auth: loggedIn(), body: { where: $('#bgW').value, version: $('#bgV').value, title: $('#bgT').value, steps: $('#bgS').value, log: $('#bgL').value, contact: $('#bgC').value, os: navigator.userAgent.slice(0, 60) } });
        $('.cwrap').innerHTML = `<div class="sempty ok"><h3>${icon('check')} Thanks! Report #${r.id} is in.</h3><p>We'll look at it soon. If it's urgent, ping us in the Kyoto Discord with the number.</p><a class="btn" href="/" data-link>Back to Kyoto</a></div>`; }
      catch (err) { toast('Couldn\'t send', err.message); $('#bgGo').disabled = false; }
    };
  }

  /* ================================================================ Docs ================================================================ */
  const DOCS = [
    ['start', 'Getting started', `# Getting started
1. Download the **Kyoto Launcher** (Download page) and open it.
2. Log in with your Microsoft account and press **Play**. The launcher installs Fabric and Kyoto Client for you.
3. In game, press **Right Shift** to open the Kyoto menu. Start on **Home** and pick a style (PvP, Builder, Streamer...).
4. Type \`/kyoto link\` to connect your Kyoto account (Hub, friends, profile, cosmetics).

> Kyoto is legit by design: info and looks only, no advantages. It's safe on every server.`],
    ['menu', 'The Kyoto menu', `# The Kyoto menu (Right Shift)
- **Home**: one-click setups and the most useful switches.
- **Your server's tab**: everything made for the server you're on (DonutSMP, Hypixel, Lifesteal...).
- **All features**: every feature as a card. Click to turn on/off, the gear opens its settings.
- **Search**: type anything ("zoom", "money", "cape").
- **Settings > Classic Menu** brings the old menu back.`],
    ['keys', 'Keybinds', `# Keybinds
Change them in **Options > Controls > Key Binds > Kyoto**.
- **Right Shift** Kyoto menu · **Left Alt** freelook (hold)
- **C** zoom · **V** wide zoom · **H** hide HUD · **K** lyrics
- **B** add waypoint · **N** waypoints · **U** share location
- No key yet (set your own): Save clip, Clean screenshot, Emotes, Light levels, Chunk borders, Slime chunks, Screenshot Studio`],
    ['commands', 'Commands', `# Commands
- \`/kyoto link\` connect your account
- \`/kyoto price <item>\` · \`/kyoto watch <item> <price>\` · \`/kyoto flips\` (DonutSMP)
- \`/kyoto seed <number>\` then \`/kyoto slime\` slime chunk map
- \`/kyoto pet <type> [name]\` · \`/kyoto emote [name]\`
- \`/kyoto rewards\` daily streak + weekly challenges
- \`/kyoto share on|off\` share your live location with friends
- \`/kyoto nearbyvoice on|off\` proximity voice (needs Simple Voice Chat)
- \`/kyoto shots\` · \`/kyoto clips\` · \`/kyoto queue\``],
    ['servers', 'Server packs', `# Server packs
Kyoto knows popular servers and turns on extras for them by itself: **DonutSMP**, **Hypixel**, **Lifesteal**, **Practice**, **MCC Island** and normal **SMPs**.
- Money per hour, AH price tooltips, bounty alerts, pay confirm (DonutSMP)
- BedWars generator timers, player stats (Hypixel)
- Hearts warning (Lifesteal), Elo + match history (Practice)
Pick a different pack (or turn it off) at the top of the server tab. Features a server doesn't allow are turned off there.`],
    ['overlays', 'Stream overlays', `# Stream overlays
Go to **kyoto-server.onrender.com/overlay/setup**, pick a style and copy the link into OBS / TikTok LIVE Studio as a browser source.
- **Live from your game**: Money challenge ("2xing my money"), Live stats, Game alerts, Counters. Log in on the website first, and turn on **Live Stats For Overlays** in the mod (Streaming page).
- **Vertical** layout for TikTok, with safe-zone guides.`],
    ['studio', 'Kyoto Studio', `# Kyoto Studio
Make cosmetics and skins, and watch your builds.
- **Builds**: record with the Build Recorder in game, then watch the timelapse, count materials and export .litematic / .schem.
- **Preview schematics**: open a .litematic, .schem or .nbt to see it in 3D before building.
- **Real textures**: "Use my Minecraft textures" reads them from your own game (never uploaded).`],
    ['hub', 'Kyoto Hub', `# Kyoto Hub
Chat with every Kyoto player in game, on the website and on Discord.
- **Server channels**: when you're on a server, chat opens that server's channel. General is one click away.
- **Voice messages**: on the website, click the mic, talk, click again to send.
- **Report**: every message has a Report button. Mods see it right away.
- DMs, group chats, trades, voice rooms, live rooms, server reviews and LFG.`],
    ['profile', 'Your profile', `# Your profile
Edit it on **/edit**. Extras on **/me**:
- **Custom URL**: kyoto-server.onrender.com/yourname
- **Widgets**: what you're listening to, your server stats, Discord
- **Guestbook**: friends can sign your profile
- **Analytics**: views per day and where people came from`],
    ['api', 'Public API', `# Public API
No key needed. JSON, CORS open, please cache.
- \`GET /api/v1/player/<name>\` level, hours, achievements, followers, online
- \`GET /api/v1/stats\` players, online now
- \`GET /api/v1/leaderboard/<hours|level|followers|sales>\`
- \`GET /api/v1/events\` upcoming events
- \`GET /api/v1/version\` latest mod version + download

Example: \`fetch('https://kyoto-server.onrender.com/api/v1/player/heffm')\``],
    ['faq', 'FAQ', `# FAQ
**Is Kyoto bannable?** No. Kyoto only shows info and changes how things look. Server packs turn off anything a server doesn't allow.
**Does it work with other mods?** Yes, it's a normal Fabric mod. Sodium and Iris work.
**Where are my clips / screenshots?** \`.minecraft/kyoto/clips\` and \`.minecraft/screenshots\` (or Tools > Screenshot Studio).
**Something broke?** Use **Report a bug** with your Crash Doctor report.`]
  ];
  function docs(topic) {
    const d = DOCS.find(x => x[0] === topic) || DOCS[0];
    frame('docs', 'Docs', 'How to use Kyoto Client, the launcher, Studio and the Hub.', `<div class="docs"><aside>${DOCS.map(x => `<a href="/docs/${x[0]}" data-link class="${x === d ? 'on' : ''}">${esc(x[1])}</a>`).join('')}<input id="docQ" placeholder="Search the docs"></aside><article class="bmd" id="docBody">${md(d[2])}</article></div>`);
    $('#docQ').oninput = () => { const q = $('#docQ').value.trim().toLowerCase(); if (!q) { $('#docBody').innerHTML = md(d[2]); return; } const hits = DOCS.filter(x => x[2].toLowerCase().includes(q)); $('#docBody').innerHTML = hits.length ? hits.map(x => `<h3><a href="/docs/${x[0]}" data-link>${esc(x[1])}</a></h3>` + x[2].split('\n').filter(l => l.toLowerCase().includes(q)).slice(0, 4).map(l => `<p>${esc(l.replace(/^[-#>\d.\s]+/, ''))}</p>`).join('')).join('') : '<p class="muted">Nothing found.</p>'; };
  }

  /* ================================================================ Creator program ================================================================ */
  async function program() {
    frame('creator-program', 'Creator program', 'Make Kyoto content, get your own creator code and earn coins.', loading());
    const r = await api('/creator/program', { auth: loggedIn() });
    const m = r.me;
    let mine = '';
    if (m && m.approved) {
      const s = await api('/creator/stats').catch(() => null);
      mine = `<div class="cpcard ok"><h3>${icon('star')} You're a Kyoto creator</h3><div class="cpcode"><span>Your code</span><b id="cpCode">${esc(m.code)}</b><button class="btn xs ghost" id="cpEdit">${icon('edit')} Change</button></div>
        ${s ? `<div class="cpstats">${[['Supporters', s.supporters], ['Coins earned', s.coins], ['Store sales', s.sales], ['Followers', s.followers], ['Friends invited', s.refs], ['Profile views', s.views]].map(([k, v]) => `<div><b>${fmt(v)}</b><span>${k}</span></div>`).join('')}</div>
        <canvas class="cpchart" id="cpChart"></canvas><small class="muted">Last 30 days: code uses (pink) and profile views (grey).</small>` : ''}</div>`;
      setTimeout(() => { if (s) chart($('#cpChart'), s.days.map(d => d.views), s.days.map(d => d.uses)); }, 0);
    } else if (m && !m.denied) mine = `<div class="cpcard"><h3>${icon('clock')} Application sent</h3><p>Staff will look at it soon. You'll get a creator code when you're in.</p></div>`;
    else mine = `<form class="cpcard" id="cpApply"><h3>${icon('rocket')} Apply</h3>${m && m.denied ? '<p class="muted small">Your last application wasn\'t accepted. You can try again.</p>' : ''}
      <label>Where do you post? (links)<input id="cpL" maxlength="300" placeholder="tiktok.com/@you, youtube.com/@you"></label><label>Followers (roughly)<input id="cpF" maxlength="40" placeholder="2.5k on TikTok"></label>
      <label>What do you make with Kyoto?<textarea id="cpW" maxlength="500"></textarea></label><button class="btn glow">${icon('star')} Apply</button></form>`;
    $('.cwrap').innerHTML = `<div class="cpgrid"><div><div class="cpperks">${[['coin', 'Earn coins', '5% of everything your supporters spend in the Store, paid by Kyoto.'], ['star', 'Creator badge', 'A badge on your profile, in the Hub and on leaderboards.'], ['film', 'Get featured', 'Your videos on the Creators page and in Kyoto\'s socials.'], ['gift', 'Early access', 'Try new features before everyone and shape them.']].map(([i, h, p]) => `<div><div class="bic">${icon(i)}</div><b>${h}</b><p>${p}</p></div>`).join('')}</div>${mine}</div>
      <aside><div class="cpcard"><h3>${icon('heart')} Support a creator</h3><p class="muted small">Type a creator's code. They get 5% of what you spend (it doesn't cost you anything extra).</p>
        ${r.supporting ? `<p>You support <b>${esc(r.supporting.name)}</b> (${esc(r.supporting.code)}) <button class="btn xs ghost" id="cpStop">Stop</button></p>` : ''}
        <form id="cpSup" class="inline"><input maxlength="16" placeholder="CODE" style="text-transform:uppercase"><button class="btn sm">Use code</button></form></div>
        <div class="cpcard"><h3>${icon('trophy')} Creators</h3>${r.creators.map(c => `<a class="crow" href="/creator/${encodeURIComponent(c.name)}" data-link><img src="${head(c.name)}" alt=""><div><b>${esc(c.name)}</b><span>Code ${esc(c.code)} · ${fmt(c.supporters)} supporters</span></div></a>`).join('') || '<p class="muted small">Be the first.</p>'}</div></aside></div>`;
    const ap = $('#cpApply'); if (ap) ap.onsubmit = async e => { e.preventDefault(); if (!loggedIn()) return needLogin(); try { await api('/creator/apply', { method: 'POST', body: { links: $('#cpL').value, followers: $('#cpF').value, why: $('#cpW').value } }); toast('Application sent'); program(); } catch (err) { toast('Couldn\'t apply', err.message); } };
    $('#cpSup').onsubmit = async e => { e.preventDefault(); if (!loggedIn()) return needLogin(); try { const x = await api('/creator/support', { method: 'POST', body: { code: $('#cpSup input').value } }); toast('Thanks!', `You support ${x.supporting.name} now.`); program(); } catch (err) { toast('Couldn\'t use that code', err.message); } };
    const st = $('#cpStop'); if (st) st.onclick = async () => { await api('/creator/support', { method: 'POST', body: { code: '' } }); program(); };
    const ce = $('#cpEdit'); if (ce) ce.onclick = async () => { const v = prompt('New code (3-16 letters/numbers)', m.code); if (!v) return; try { const x = await api('/creator/code', { method: 'POST', body: { code: v } }); $('#cpCode').textContent = x.code; toast('Code changed'); } catch (err) { toast('Couldn\'t change it', err.message); } };
  }
  function chart(c, a, b) {
    if (!c) return;
    const d = Math.min(2, devicePixelRatio || 1), W = c.width = c.clientWidth * d, H = c.height = c.clientHeight * d, g = c.getContext('2d');
    const max = Math.max(1, ...a, ...(b || [])), bw = W / a.length;
    a.forEach((v, i) => { const h = v / max * (H - 6 * d); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(i * bw + bw * .15, H - h, bw * .7, h); });
    if (b) b.forEach((v, i) => { const h = v / max * (H - 6 * d); g.fillStyle = '#bdbdbd'; g.fillRect(i * bw + bw * .3, H - h, bw * .4, h); });
  }

  /* ================================================================ Me: custom URL, widgets, analytics ================================================================ */
  async function mePage() {
    if (!loggedIn()) { frame('me', 'Me', '', `<div class="sempty"><h3>${t('Log in first')}</h3><a class="btn" href="/edit" data-link>Log in</a></div>`); return; }
    frame('me', 'Me', 'Your profile link, widgets and who\'s looking.', loading(), `<a class="btn ghost" href="/edit" data-link>${icon('palette')} ${t('Edit profile')}</a><a class="btn ghost" href="/wrapped" data-link>${icon('sparkles')} Wrapped</a>`);
    const a = await api('/me/analytics');
    const nm = me() ? me().name : '';
    const W = [['spotify', 'Music', 'What you\'re listening to (turn on Share Music in the mod)'], ['server', 'Server stats', 'Hours played, your top servers, where you are now'], ['discord', 'Discord', 'Your Discord name (if you linked it)'], ['guestbook', 'Guestbook', 'People can sign your profile'], ['visualizer', 'Music visualizer', 'Bars that move with your profile song']];
    $('.cwrap').innerHTML = `<div class="megrid">
      <div class="cpcard"><h3>${icon('link')} Your profile link</h3><p class="muted small">Pick a short link people can remember.</p>
        <form id="slugF" class="inline slug"><span>${location.host}/</span><input id="slugI" maxlength="16" value="${esc(a.slug || '')}" placeholder="${esc(nm.toLowerCase())}"><button class="btn sm">Save</button></form>
        <p class="small">Works now: <a href="/${encodeURIComponent(a.slug || nm)}" data-link>${location.host}/${esc(a.slug || nm)}</a></p></div>
      <div class="cpcard"><h3>${icon('eye')} Views</h3><div class="cpstats">${[['All time', a.total], ['Last 30 days', a.days.reduce((s, d) => s + d.views, 0)], ['People (30 days)', a.days.reduce((s, d) => s + d.people, 0)], ['Followers', a.followers], ['Guestbook', a.guestbook]].map(([k, v]) => `<div><b>${fmt(v)}</b><span>${k}</span></div>`).join('')}</div>
        <canvas class="cpchart" id="meChart"></canvas><h4>Where they came from</h4>${a.refs.length ? a.refs.map(r => `<div class="refrow"><span>${esc(r.from)}</span><i style="width:${Math.round(r.n / a.refs[0].n * 100)}%"></i><b>${fmt(r.n)}</b></div>`).join('') : '<p class="muted small">No visits yet. Share your link!</p>'}</div>
      <div class="cpcard"><h3>${icon('layout')} Profile widgets</h3>${W.map(([k, n, d]) => `<label class="row"><span><b>${n}</b><small>${d}</small></span><input type="checkbox" data-wd="${k}" ${a.widgets[k] ? 'checked' : ''}><i class="sw"></i></label>`).join('')}</div></div>`;
    chart($('#meChart'), a.days.map(d => d.views), a.days.map(d => d.people));
    $('#slugF').onsubmit = async e => { e.preventDefault(); try { const r = await api('/me/slug', { method: 'POST', body: { slug: $('#slugI').value } }); toast(r.slug ? 'Saved' : 'Removed', r.slug ? location.host + '/' + r.slug : ''); mePage(); } catch (err) { toast('Couldn\'t save', err.message); } };
    $$('[data-wd]').forEach(c => c.onchange = () => api('/me/widgets', { method: 'POST', body: { [c.dataset.wd]: c.checked } }).catch(e => toast('Couldn\'t save', e.message)));
    // staff: creator applications + bug reports
    const st = await api('/mod/me').catch(() => ({}));
    if (!st.staff || !$('.megrid')) return;
    const [apps, bugs] = await Promise.all([api('/creator/apps').catch(() => ({ apps: [] })), api('/bugs').catch(() => ({ bugs: [] }))]);
    $('.megrid').insertAdjacentHTML('beforeend', `<div class="cpcard"><h3>${icon('star')} Creator applications <small>${apps.apps.length}</small></h3>${apps.apps.map(a => `<div class="staffrow"><b>${esc(a.name)}</b><span>${esc(a.links)} · ${esc(a.followers || '')}</span><p>${esc(a.why)}</p><div><button class="btn xs" data-capp="${esc(a.name)}">Accept</button><button class="btn xs ghost" data-cden="${esc(a.name)}">No</button></div></div>`).join('') || '<p class="muted small">None waiting.</p>'}</div>
      <div class="cpcard"><h3>${icon('flag')} Bug reports <small>${bugs.bugs.filter(b => b.status === 'new').length} new</small></h3>${bugs.bugs.slice(0, 30).map(b => `<div class="staffrow"><b>#${b.id} ${esc(b.title)}</b><span>${esc(b.where)} ${esc(b.version || '')} · ${esc(b.by || 'guest')} · ${ago(b.at)}${b.contact ? ' · ' + esc(b.contact) : ''}</span>${b.steps ? `<p>${esc(b.steps.slice(0, 300))}</p>` : ''}<div>${b.hasLog ? `<button class="btn xs ghost" data-blog="${b.id}">Log</button>` : ''}<select data-bst="${b.id}">${['new', 'seen', 'fixed', 'nope'].map(x => `<option ${x === b.status ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>`).join('') || '<p class="muted small">No bugs. Nice.</p>'}</div>`);
    $$('[data-capp]').forEach(b => b.onclick = async () => { const code = prompt('Their creator code', b.dataset.capp.toUpperCase()); if (code === null) return; await api('/creator/decide', { method: 'POST', body: { name: b.dataset.capp, ok: true, code } }); toast('Accepted'); mePage(); });
    $$('[data-cden]').forEach(b => b.onclick = async () => { await api('/creator/decide', { method: 'POST', body: { name: b.dataset.cden, ok: false } }); mePage(); });
    $$('[data-bst]').forEach(sl => sl.onchange = () => api('/bugs/status', { method: 'POST', body: { id: Number(sl.dataset.bst), status: sl.value } }));
    $$('[data-blog]').forEach(b => b.onclick = async () => { const r = await fetch(CONFIG.api + '/bugs/log?id=' + b.dataset.blog, { headers: { Authorization: 'Bearer ' + localStorage.getItem('kyoto.token') } }); const txt = await r.text(); const m = modal(`<h3>Bug #${b.dataset.blog} log</h3><textarea class="tall" readonly></textarea>`, 'wide'); $('textarea', m).value = txt; });
  }

  /* ================================================================ profile widgets + guestbook + visualizer (on /u/name) ================================================================ */
  window.KY_PROFILE_EXTRAS = async function (root, name) {
    let x; try { x = await api('/profile-extras?name=' + encodeURIComponent(name), { auth: loggedIn() }); } catch (e) { return; }
    if (!root.isConnected) return;
    const w = x.widgets, parts = [];
    if (x.music) parts.push(`<div class="pw music"><div class="pwh">${icon('spotify')} ${t('Listening to')}</div><b>${esc(x.music.title)}</b><span>${esc(x.music.artist)}</span><div class="pwbars"><i></i><i></i><i></i><i></i><i></i></div></div>`);
    if (x.server) parts.push(`<div class="pw"><div class="pwh">${icon('gamepad')} ${x.server.online ? (x.server.playing ? t('Playing on') + ' <b>' + esc(x.server.playing) + '</b>' : 'Online') : t('Offline')}</div><div class="pwstats"><div><b>${fmt(x.server.hours)}</b><span>${t('Hours played')}</span></div><div><b>${fmt(x.server.days)}</b><span>${t('Days played')}</span></div><div><b>${x.server.level}</b><span>${t('Level')}</span></div></div>${x.server.top.length ? `<small>${t('Top servers')}: ${x.server.top.map(s => esc(s.host)).join(' · ')}</small>` : ''}</div>`);
    if (x.discord) parts.push(`<div class="pw"><div class="pwh">${icon('discord')} Discord</div><b>${esc(x.discord.name)}</b></div>`);
    const box = document.createElement('div'); box.className = 'pr-widgets';
    box.innerHTML = parts.join('') + (w.guestbook ? `<div class="pw gb"><div class="pwh">${icon('edit')} ${t('Guestbook')} <small>${(x.guestbook || []).length}</small></div>
      ${loggedIn() && !x.mine ? `<form id="gbF"><input maxlength="200" placeholder="${esc(t('Sign the guestbook'))}"><button class="btn xs">${t('Send')}</button></form>` : ''}
      <div class="gblist">${(x.guestbook || []).map(g => `<div class="gbi"><img src="${head(g.name, 20)}" alt=""><div><b>${esc(g.name)}</b><span>${esc(g.text)}</span></div><small>${ago(g.at)}</small>${g.mine || x.mine ? `<button data-gbd="${g.id}" title="Delete">${icon('x')}</button>` : ''}</div>`).join('') || '<p class="muted small">No one yet. Be the first!</p>'}</div></div>` : '');
    if (!box.innerHTML.trim()) return;
    root.appendChild(box);
    const f = $('#gbF', box); if (f) f.onsubmit = async e => { e.preventDefault(); const v = $('input', f).value.trim(); if (!v) return; try { await api('/guestbook', { method: 'POST', body: { name, text: v } }); box.remove(); window.KY_PROFILE_EXTRAS(root, name); } catch (err) { toast('Couldn\'t sign', err.message); } };
    $$('[data-gbd]', box).forEach(b => b.onclick = async () => { await api('/guestbook/delete', { method: 'POST', body: { name, id: Number(b.dataset.gbd) } }); box.remove(); window.KY_PROFILE_EXTRAS(root, name); });
    if (w.visualizer && root._audio) visualizer(root, root._audio);
  };
  function visualizer(root, audio) {
    const c = document.createElement('canvas'); c.className = 'pr-viz'; root.appendChild(c);
    let an = null, data = null, ctx = null;
    const start = () => { if (an) return; try { ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = ctx.createMediaElementSource(audio); an = ctx.createAnalyser(); an.fftSize = 128; src.connect(an); an.connect(ctx.destination); data = new Uint8Array(an.frequencyBinCount); } catch (e) { an = null; } };
    audio.addEventListener('play', () => { start(); if (ctx && ctx.state === 'suspended') ctx.resume(); });
    const g = c.getContext('2d'), col = getComputedStyle(root).getPropertyValue('--pa') || '#bdbdbd';
    (function draw() {
      if (!c.isConnected) return;
      const d = Math.min(2, devicePixelRatio || 1), W = c.width = c.clientWidth * d, H = c.height = c.clientHeight * d;
      g.clearRect(0, 0, W, H);
      if (an && !audio.paused) {
        an.getByteFrequencyData(data);
        const n = 48, bw = W / n;
        for (let i = 0; i < n; i++) { const v = data[Math.floor(i * data.length / n * .8)] / 255, h = Math.max(2 * d, v * H); g.fillStyle = col.trim() || '#bdbdbd'; g.globalAlpha = .35 + .65 * v; g.fillRect(i * bw + bw * .2, H - h, bw * .6, h); }
        g.globalAlpha = 1;
      }
      requestAnimationFrame(draw);
    })();
  }
})();

if (window.KY_MORE_PATHS && window.KY_MORE_PATHS.test(location.pathname) && typeof route === 'function') route();
