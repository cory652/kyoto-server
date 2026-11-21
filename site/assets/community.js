/* Kyoto website: Community pages - Creators, Leaderboards, Achievements, Skins, Wishlist, Invite, Status and Player cards. */
'use strict';
(() => {
  const root = $('#commRoot');
  const me = () => { try { return JSON.parse(localStorage.getItem('kyoto.me') || 'null'); } catch (e) { return null; } };
  const loggedIn = () => !!localStorage.getItem('kyoto.token');
  const needLogin = () => toast('Log in first', 'Type /kyoto link in game, then log in on the Edit profile page.');
  const head = (n, s = 32) => `https://mc-heads.net/avatar/${encodeURIComponent(n)}/${s}`;
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : s < 2592000 ? Math.floor(s / 86400) + 'd ago' : new Date(t).toLocaleDateString(); };
  const fmt = n => Number(n || 0).toLocaleString();
  const TABS = [['creators', 'Creators', 'sparkles'], ['leaderboards', 'Leaderboards', 'bars'], ['achievements', 'Achievements', 'trophy'], ['skins', 'Skin gallery', 'shirt'], ['wishlist', 'Wishlist', 'heart'], ['invite', 'Invite friends', 'userplus'], ['status', 'Status', 'activity']];
  const HERO = {
    creators: ['Creators', 'The people making Kyoto cosmetics. Follow them, shop their stuff, watch their videos.'],
    leaderboards: ['Leaderboards', 'Who plays the most, sells the most and has the longest streaks.'],
    achievements: ['Achievements', 'Unlock them by playing, chatting, creating and trading. Rarer ones are worth more.'],
    skins: ['Skin gallery', 'Skins made by Kyoto players. Wear one in a click, or post your own from Kyoto Studio.'],
    wishlist: ['Wishlist', 'Heart things in the Store. Friends see your list and can gift you anything on it.'],
    invite: ['Invite friends', 'Bring your friends to Kyoto. When they\'ve played an hour, you both get coins.'],
    status: ['Status', 'Is Kyoto working right now? Live health of every part of Kyoto.'],
    card: ['Player card', 'Your Kyoto stats on one card. Download it and post it anywhere.'],
    creator: ['Creator', '']
  };
  let token = 0;

  function frame(tab, inner, heroExtra = '') {
    const h = HERO[tab] || HERO.creators;
    root.innerHTML = `<header class="phero comm-hero"><span class="eyebrow">Community</span><h1>${esc(h[0])}</h1>${h[1] ? `<p>${esc(h[1])}</p>` : ''}${heroExtra}</header>
      <nav class="ctabs">${TABS.map(([k, n, ic]) => `<a href="/${k}" data-link class="${tab === k || (tab === 'creator' && k === 'creators') || (tab === 'card' && k === 'leaderboards') ? 'on' : ''}">${icon(ic)}${n}</a>`).join('')}</nav>
      <section class="cwrap">${inner}</section>`;
  }
  const loading = () => '<div class="cload"><i></i><i></i><i></i></div>';
  const errBox = e => `<div class="sempty"><h3>Couldn't load this</h3><p>${esc(e.message)}</p></div>`;

  /* ============================ Creators ============================ */
  let cFeed = 'all', cSort = 'followers', cOnly = 'all';
  async function creators() {
    const t = ++token;
    frame('creators', `<div class="sbar in"><div class="ntabs big" id="cfeed">${[['all', 'Everything'], ['shop', 'Shop posts'], ['content', 'Videos']].map(([k, n]) => `<button data-f="${k}" class="${cFeed === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="sbar-r"><div class="ntabs" id="conly"><button data-o="all" class="${cOnly === 'all' ? 'on' : ''}">All creators</button><button data-o="following" class="${cOnly === 'following' ? 'on' : ''}">Following</button></div></div></div>
      <div class="cgrid2"><div><h3 class="csub">${icon('zap')} Latest</h3><div id="cfeedList" class="feed">${loading()}</div></div>
      <aside><div class="csidehead"><h3 class="csub">${icon('star')} Creators</h3><div class="ntabs" id="csort">${[['followers', 'Top'], ['sales', 'Sales'], ['new', 'Active']].map(([k, n]) => `<button data-s="${k}" class="${cSort === k ? 'on' : ''}">${n}</button>`).join('')}</div></div><input class="csearch" id="cq" placeholder="Find a creator"><div id="clist" class="clist">${loading()}</div></aside></div>`,
      `<div class="phero-acts"><button class="btn glow" id="postVid">${icon('film')} Post a video</button><a class="btn ghost" href="/store?sell=1" data-link>${icon('plus')} Post to your shop</a>${loggedIn() && me() ? `<a class="btn ghost" href="/creator/${encodeURIComponent(me().name)}" data-link>${icon('user')} My creator page</a>` : ''}</div>`);
    $$('#cfeed [data-f]').forEach(b => b.onclick = () => { cFeed = b.dataset.f; creators(); });
    $$('#conly [data-o]').forEach(b => b.onclick = () => { if (b.dataset.o === 'following' && !loggedIn()) return needLogin(); cOnly = b.dataset.o; creators(); });
    $$('#csort [data-s]').forEach(b => b.onclick = () => { cSort = b.dataset.s; creators(); });
    $('#postVid').onclick = postVideo;
    let r; try { r = await api(`/creators?sort=${cSort}&feed=${cFeed}&only=${cOnly}`); } catch (e) { if (t === token) $('#cfeedList').innerHTML = errBox(e); return; }
    if (t !== token) return;
    const draw = q => { $('#clist').innerHTML = r.creators.filter(c => !q || c.name.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q)).map(creatorRow).join('') || '<p class="muted small">No creators yet. Post something to the Store and you\'re one.</p>'; wireFollow($('#clist')); };
    draw(''); $('#cq').oninput = () => draw($('#cq').value.trim().toLowerCase());
    renderFeed($('#cfeedList'), r.feed, cOnly === 'following' ? 'Nothing from people you follow yet.' : 'No posts yet.');
  }
  const creatorRow = c => `<a class="crow" href="/creator/${encodeURIComponent(c.name)}" data-link><img src="${head(c.name, 40)}" alt=""><div><b>${esc(c.displayName)}${c.plus ? ` <i class="pluschip">+</i>` : ''}</b><span>${fmt(c.followers)} follower${c.followers === 1 ? "" : "s"} · ${fmt(c.sales)} sale${c.sales === 1 ? "" : "s"}</span></div>${c.me ? '' : `<button class="btn sm ${c.following ? 'ghost' : ''}" data-follow="${esc(c.name)}">${c.following ? 'Following' : 'Follow'}</button>`}</a>`;
  function wireFollow(box) {
    $$('[data-follow]', box).forEach(b => b.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      if (!loggedIn()) return needLogin();
      b.disabled = true;
      try { const r = await api('/creator/follow', { method: 'POST', body: { name: b.dataset.follow } }); $$(`[data-follow="${CSS.escape(b.dataset.follow)}"]`).forEach(x => { x.textContent = r.following ? 'Following' : 'Follow'; x.classList.toggle('ghost', r.following); }); const fc = $('#fcount'); if (fc) fc.textContent = fmt(r.followers); }
      catch (err) { toast('Couldn\'t do that', err.message); }
      b.disabled = false;
    });
  }
  function videoEmbed(v) {
    if (v.kind === 'youtube') return `<iframe src="https://www.youtube-nocookie.com/embed/${v.vid}" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    if (v.kind === 'tiktok') return `<iframe src="https://www.tiktok.com/embed/v2/${v.vid}" allowfullscreen loading="lazy"></iframe>`;
    const parent = location.hostname;
    if (v.kind === 'twitch') return `<iframe src="https://clips.twitch.tv/embed?clip=${encodeURIComponent(v.vid)}&parent=${parent}" allowfullscreen loading="lazy"></iframe>`;
    if (v.kind === 'twitchvod') return `<iframe src="https://player.twitch.tv/?video=${v.vid}&parent=${parent}&autoplay=false" allowfullscreen loading="lazy"></iframe>`;
    return '';
  }
  const thumb = v => v.kind === 'youtube' ? `https://i.ytimg.com/vi/${v.vid}/hqdefault.jpg` : null;
  function renderFeed(box, feed, empty) {
    if (!feed.length) { box.innerHTML = `<div class="sempty"><h3>${esc(empty)}</h3><p>Creators post shop items and videos here.</p></div>`; return; }
    box.innerHTML = feed.map(x => x.type2 === 'content'
      ? `<article class="fpost vid ${v9(x)}" data-vid="${x.id}"><div class="fhead"><a href="/creator/${encodeURIComponent(x.name)}" data-link><img src="${head(x.name)}" alt=""><b>${esc(x.name)}</b></a><span class="muted">posted a video · ${ago(x.at)}</span>${x.mine || (me() && me().staff) ? `<button class="iconbtn" data-delv="${x.id}" title="Delete">${icon('trash')}</button>` : ''}</div>
          <div class="fvid" data-play="${x.id}">${thumb(x) ? `<img src="${thumb(x)}" alt="" loading="lazy"><span class="fplay">${icon('play')}</span>` : videoEmbed(x)}</div>
          <div class="fbody"><b>${esc(x.title)}</b>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}<div class="facts"><button class="lk ${x.liked ? 'on' : ''}" data-likev="${x.id}">${icon('heart')}<span>${x.likes}</span></button><a class="muted small" href="${esc(x.url)}" target="_blank" rel="noopener">${icon(x.kind.startsWith('twitch') ? 'twitch' : x.kind)} Open</a></div></div></article>`
      : `<article class="fpost shop"><div class="fhead"><a href="/creator/${encodeURIComponent(x.creator)}" data-link><img src="${head(x.creator)}" alt=""><b>${esc(x.creator)}</b></a><span class="muted">${x.type === 'pack' ? 'made a pack' : 'posted to their shop'} · ${ago(x.at)}</span></div>${window.KY_ITEMS ? KY_ITEMS.card(x) : ''}</article>`).join('');
    const vids = new Map(feed.filter(x => x.type2 === 'content').map(x => [x.id, x]));
    $$('[data-play]', box).forEach(el => el.onclick = () => { const v = vids.get(Number(el.dataset.play)); if (v && !el.querySelector('iframe')) el.innerHTML = videoEmbed(v).replace('youtube-nocookie.com/embed/' + v.vid, `youtube-nocookie.com/embed/${v.vid}?autoplay=1`); });
    $$('[data-likev]', box).forEach(b => b.onclick = async () => { if (!loggedIn()) return needLogin(); try { const r = await api('/creator/video/like', { method: 'POST', body: { id: Number(b.dataset.likev) } }); b.classList.toggle('on', r.liked); b.querySelector('span').textContent = r.likes; } catch (e) { toast('Couldn\'t like it', e.message); } });
    $$('[data-delv]', box).forEach(b => b.onclick = async () => { if (!confirm('Delete this video post?')) return; try { await api('/creator/video/delete', { method: 'POST', body: { id: Number(b.dataset.delv) } }); b.closest('.fpost').remove(); } catch (e) { toast('Couldn\'t delete it', e.message); } });
    if (window.KY_ITEMS) KY_ITEMS.wire(box);
  }
  const v9 = x => x.short || x.kind === 'tiktok' ? 'tall' : '';
  function postVideo() {
    if (!loggedIn()) return needLogin();
    const box = document.createElement('div'); box.className = 'cmodal';
    box.innerHTML = `<div class="cbox sell"><button class="cx" data-x>${icon('x')}</button><span class="eyebrow">${icon('film')} Creator post</span><h2>Post a video</h2>
      <p class="muted">Shows on your creator page and in the Creators feed. Your followers get a notification.</p>
      <label class="fld"><span>Link (YouTube, Shorts, TikTok or Twitch clip)</span><input id="pvUrl" placeholder="https://youtu.be/..."></label>
      <div class="pvprev" id="pvPrev"></div>
      <label class="fld"><span>Title</span><input id="pvTitle" maxlength="80" placeholder="My new cape showcase"></label>
      <label class="fld"><span>Description (optional)</span><textarea id="pvDesc" maxlength="400" rows="3"></textarea></label>
      <button class="btn glow wide" id="pvGo">${icon('upload')} Post it</button></div>`;
    document.body.appendChild(box);
    box.onclick = e => { if (e.target === box || e.target.closest('[data-x]')) box.remove(); };
    $('#pvUrl', box).oninput = () => {
      const u = $('#pvUrl', box).value; let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(u);
      $('#pvPrev', box).innerHTML = m ? `<img src="https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg" alt="">` : /tiktok\.com\/@[\w.]+\/video\/\d+|twitch\.tv/.test(u) ? `<p class="muted small">${icon('check')} Looks good</p>` : '';
    };
    $('#pvGo', box).onclick = async () => {
      const b = $('#pvGo', box); b.disabled = true;
      try { await api('/creator/video', { method: 'POST', body: { url: $('#pvUrl', box).value.trim(), title: $('#pvTitle', box).value.trim(), desc: $('#pvDesc', box).value.trim() } }); box.remove(); toast('Posted', 'Your video is on your creator page.'); route(); }
      catch (e) { b.disabled = false; toast('Couldn\'t post it', e.message); }
    };
  }

  /* ---------- one creator ---------- */
  let pFilter = 'all';
  async function creator(name) {
    const t = ++token;
    root.innerHTML = `<section class="cwrap">${loading()}</section>`;
    let c; try { c = await api('/creator?name=' + encodeURIComponent(name)); } catch (e) { root.innerHTML = `<section class="cwrap" style="padding-top:140px">${errBox(e)}</section>`; return; }
    if (t !== token) return;
    document.title = `${c.displayName} · Kyoto Creators`;
    const acc = c.accent || '#808080';
    frame('creator', `<div class="chero" style="--ca:${acc}"><img class="cav" src="${head(c.name, 128)}" alt="">
        <div class="cinfo2"><h2>${esc(c.displayName)} ${c.plus ? '<i class="pluschip">Kyoto+</i>' : ''}${c.owner ? `<i class="ownchip">${icon('crown')} Owner</i>` : ''}</h2><span class="muted">@${esc(c.name)} · Level ${c.level} · joined ${c.joined ? new Date(c.joined).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}</span>${c.bio ? `<p>${esc(c.bio)}</p>` : ''}
          <div class="cstats2"><div><b id="fcount">${fmt(c.followers)}</b><span>followers</span></div><div><b>${fmt(c.sales)}</b><span>sales</span></div><div><b>${fmt(c.items)}</b><span>in shop</span></div><div><b>${fmt(c.videos)}</b><span>videos</span></div></div></div>
        <div class="cacts">${c.me ? `<button class="btn glow" id="postVid">${icon('film')} Post a video</button><a class="btn ghost" href="/store?sell=1" data-link>${icon('plus')} Add to shop</a>` : `<button class="btn ${c.following ? 'ghost' : 'glow'}" data-follow="${esc(c.name)}">${c.following ? 'Following' : 'Follow'}</button>`}<a class="btn ghost" href="/u/${encodeURIComponent(c.name)}" data-link>${icon('user')} Profile</a><a class="btn ghost" href="/card/${encodeURIComponent(c.name)}" data-link>${icon('idcard')} Card</a></div></div>
      <div class="sbar in"><div class="ntabs big" id="pfil">${[['all', `Everything (${c.posts.length})`], ['shop', `Shop (${c.items})`], ['content', `Videos (${c.videos})`]].map(([k, n]) => `<button data-p="${k}" class="${pFilter === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div id="cposts" class="cposts"></div>`, '');
    $('.comm-hero').hidden = true;
    const draw = () => {
      const l = c.posts.filter(x => pFilter === 'all' || x.type2 === pFilter);
      const box = $('#cposts');
      const shop = l.filter(x => x.type2 === 'shop'), vids = l.filter(x => x.type2 === 'content');
      box.innerHTML = (shop.length ? `<div class="sgrid in" id="cshop"></div>` : '') + (vids.length ? `<div class="feed vgrid" id="cvids"></div>` : '') + (!l.length ? `<div class="sempty"><h3>Nothing here yet</h3></div>` : '');
      if (shop.length) { $('#cshop').innerHTML = shop.map(x => KY_ITEMS.card(x)).join(''); KY_ITEMS.wire($('#cshop')); }
      if (vids.length) renderFeed($('#cvids'), vids, '');
    };
    draw();
    $$('#pfil [data-p]').forEach(b => b.onclick = () => { pFilter = b.dataset.p; $$('#pfil [data-p]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    wireFollow(root); if ($('#postVid')) $('#postVid').onclick = postVideo;
  }

  /* ============================ Leaderboards ============================ */
  let lb = 'playtime', lbScope = 'all';
  async function leaderboards() {
    const t = ++token;
    frame('leaderboards', `<div class="sbar in"><div class="ntabs big" id="lbTabs"></div><div class="sbar-r"><div class="ntabs" id="lbScope"><button data-sc="all" class="${lbScope === 'all' ? 'on' : ''}">Everyone</button><button data-sc="friends" class="${lbScope === 'friends' ? 'on' : ''}">Friends</button></div></div></div><div id="lbBody">${loading()}</div>`);
    $$('#lbScope [data-sc]').forEach(b => b.onclick = () => { if (b.dataset.sc === 'friends' && !loggedIn()) return needLogin(); lbScope = b.dataset.sc; leaderboards(); });
    let r; try { r = await api(`/leaderboards?board=${lb}&scope=${lbScope}`); } catch (e) { $('#lbBody').innerHTML = errBox(e); return; }
    if (t !== token) return;
    $('#lbTabs').innerHTML = r.boards.map(b => `<button data-b="${b.id}" class="${b.id === r.board ? 'on' : ''}">${esc(b.name)}</button>`).join('');
    $$('#lbTabs [data-b]').forEach(b => b.onclick = () => { lb = b.dataset.b; leaderboards(); });
    const top = r.rows.slice(0, 3), rest = r.rows.slice(3);
    const pod = i => { const x = top[i]; return x ? `<a class="pod p${i + 1}" href="/u/${encodeURIComponent(x.name)}" data-link><span class="prank">${i + 1}</span><img src="https://mc-heads.net/body/${encodeURIComponent(x.name)}/${i ? 90 : 110}" alt=""><b>${esc(x.name)}</b><em>${esc(x.shown)}</em><i></i></a>` : '<div class="pod empty"></div>'; };
    $('#lbBody').innerHTML = !r.rows.length ? `<div class="sempty"><h3>No one here yet</h3><p>${esc(r.desc)}: play with Kyoto to get on the board.</p></div>`
      : `<p class="muted center">Ranked by ${esc(r.desc)} · ${fmt(r.total)} players</p><div class="podium">${pod(1)}${pod(0)}${pod(2)}</div>
      <div class="lbl">${rest.map(x => `<a class="lbrow ${me() && x.name === me().name ? 'me' : ''}" href="/u/${encodeURIComponent(x.name)}" data-link><span class="lrank">${x.rank}</span><img src="${head(x.name)}" alt=""><b>${esc(x.name)}${x.plus ? ' <i class="pluschip">+</i>' : ''}</b><em>${esc(x.shown)}</em></a>`).join('')}</div>
      ${r.me && r.me.rank > 3 ? `<div class="lbme"><span class="lrank">${r.me.rank}</span><img src="${head(r.me.name)}" alt=""><b>You</b><em>${esc(r.me.shown)}</em></div>` : ''}`;
  }

  /* ============================ Achievements ============================ */
  let achF = 'all';
  async function achievements(name) {
    const t = ++token;
    const who = name || (me() && me().name);
    if (!who) { frame('achievements', `<div class="sempty"><h3>Log in to see your achievements</h3><p>Or look someone up:</p><form id="achFind" class="cfind"><input placeholder="Minecraft name" maxlength="16"><button class="btn">Look up</button></form></div>`); $('#achFind').onsubmit = e => { e.preventDefault(); go('/achievements/' + $('#achFind input').value.trim()); }; return; }
    frame('achievements', loading());
    let r; try { r = await api('/achievements?name=' + encodeURIComponent(who)); } catch (e) { $('.cwrap').innerHTML = errBox(e); return; }
    if (t !== token) return;
    const pct = Math.round(r.points / r.max * 100);
    $('.cwrap').innerHTML = `<div class="achtop"><img src="https://mc-heads.net/body/${encodeURIComponent(r.name)}/100" alt=""><div><h2>${esc(r.name)}</h2><span class="muted">${r.unlocked} of ${r.total} unlocked · ${r.points} / ${r.max} points</span>
        <div class="achbar"><i style="width:${pct}%"></i></div>
        <div class="achq"><span>${icon('clock')} ${fmt(r.stats.hours)} h played</span><span>${icon('chat')} ${fmt(r.stats.msgs)} messages</span><span>${icon('users')} ${r.stats.friends} friends</span><span>${icon('flame')} ${r.stats.streakBest} day best streak</span></div></div>
        <form id="achFind" class="cfind"><input placeholder="Look someone up" maxlength="16"><button class="btn sm">${icon('search')}</button></form></div>
      <div class="ntabs big" id="achF">${[['all', 'All'], ['got', 'Unlocked'], ['locked', 'Locked'], ['rare', 'Rarest']].map(([k, n]) => `<button data-a="${k}" class="${achF === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="achgrid" id="achGrid"></div>`;
    const draw = () => {
      let l = r.list.slice();
      if (achF === 'got') l = l.filter(a => a.at); else if (achF === 'locked') l = l.filter(a => !a.at); else if (achF === 'rare') l.sort((a, b) => a.rarity - b.rarity);
      $('#achGrid').innerHTML = l.map(a => { const tier = a.rarity < 5 ? 'leg' : a.rarity < 15 ? 'epic' : a.rarity < 40 ? 'rare' : ''; return `<div class="ach ${a.at ? 'got' : ''} ${tier}"><span class="aic">${icon(a.icon)}</span><div><b>${esc(a.name)}</b><span>${esc(a.how)}</span><em>${a.rarity}% of players${a.at ? ' · ' + new Date(a.at).toLocaleDateString() : ''}</em></div><i class="apts">${a.points}</i></div>`; }).join('');
    };
    draw();
    $$('#achF [data-a]').forEach(b => b.onclick = () => { achF = b.dataset.a; $$('#achF [data-a]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#achFind').onsubmit = e => { e.preventDefault(); const v = $('#achFind input').value.trim(); if (v) go('/achievements/' + v); };
  }

  /* ============================ Skin gallery ============================ */
  let skSort = 'top', skTag = '', skQ = '';
  const SKIN_IMG = new Map();
  function drawSkin(c, url, slim) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const g = c.getContext('2d'); c.width = 16 * 6; c.height = 32 * 6; g.imageSmoothingEnabled = false; g.scale(6, 6);
      const aw = slim ? 3 : 4, old = img.height === 32;
      const part = (sx, sy, w, h, dx, dy, flip) => { if (flip) { g.save(); g.translate(dx + w, dy); g.scale(-1, 1); g.drawImage(img, sx, sy, w, h, 0, 0, w, h); g.restore(); } else g.drawImage(img, sx, sy, w, h, dx, dy, w, h); };
      part(8, 8, 8, 8, 4, 0); part(20, 20, 8, 12, 4, 8); part(44, 20, aw, 12, 4 - aw, 8);
      old ? part(44, 20, aw, 12, 12, 8, true) : part(36, 52, aw, 12, 12, 8);
      part(4, 20, 4, 12, 4, 20); old ? part(4, 20, 4, 12, 8, 20, true) : part(20, 52, 4, 12, 8, 20);
      part(40, 8, 8, 8, 4, 0);
      if (!old) { part(20, 36, 8, 12, 4, 8); part(44, 36, aw, 12, 4 - aw, 8); part(52, 52, aw, 12, 12, 8); part(4, 36, 4, 12, 4, 20); part(4, 52, 4, 12, 8, 20); }
    };
    img.src = url;
  }
  async function skins() {
    const t = ++token;
    frame('skins', `<div class="sbar in"><div class="ntabs big" id="skSort">${[['top', 'Top'], ['new', 'New'], ['worn', 'Most worn']].map(([k, n]) => `<button data-s="${k}" class="${skSort === k ? 'on' : ''}">${n}</button>`).join('')}</div><div class="sbar-r"><input class="csearch" id="skQ" placeholder="Search skins" value="${esc(skQ)}"></div></div><div class="ntabs" id="skTags"></div><div class="skgrid" id="skGrid">${loading()}</div>`,
      `<div class="phero-acts"><button class="btn glow" id="skPost">${icon('upload')} Post a skin</button><a class="btn ghost" href="/builder?skin=1">${icon('palette')} Make one in Kyoto Studio</a></div>`);
    $$('#skSort [data-s]').forEach(b => b.onclick = () => { skSort = b.dataset.s; skins(); });
    let deb; $('#skQ').oninput = () => { clearTimeout(deb); deb = setTimeout(() => { skQ = $('#skQ').value.trim(); load(); }, 300); };
    $('#skPost').onclick = postSkin;
    async function load() {
      let r; try { r = await api(`/skins?sort=${skSort}&tag=${encodeURIComponent(skTag)}&q=${encodeURIComponent(skQ)}`); } catch (e) { $('#skGrid').innerHTML = errBox(e); return; }
      if (t !== token) return;
      $('#skTags').innerHTML = ['', ...r.tags].map(x => `<button data-t="${esc(x)}" class="${skTag === x ? 'on' : ''}">${x || 'All'}</button>`).join('');
      $$('#skTags [data-t]').forEach(b => b.onclick = () => { skTag = b.dataset.t; load(); });
      $('#skGrid').innerHTML = r.skins.length ? r.skins.map(s => `<article class="skcard"><div class="skprev"><canvas data-sk="${s.id}" data-slim="${s.slim ? 1 : ''}"></canvas></div>
        <div class="skbody"><b>${esc(s.title)}</b><a class="muted small" href="/u/${encodeURIComponent(s.name)}" data-link>by ${esc(s.name)}</a><div class="sktags">${s.tags.map(x => `<i>${esc(x)}</i>`).join('')}</div></div>
        <div class="skacts"><button class="lk ${s.liked ? 'on' : ''}" data-lk="${s.id}">${icon('heart')}<span>${s.likes}</span></button><button class="btn sm" data-wear="${s.id}">${icon('shirt')} Wear</button><a class="iconbtn" href="${CONFIG.api}/skins/png?id=${s.id}&dl=1" title="Download">${icon('download')}</a>${s.mine ? `<button class="iconbtn" data-del="${s.id}" title="Delete">${icon('trash')}</button>` : ''}</div>
        <span class="skworn">${fmt(s.wears)} wearing</span></article>`).join('') : `<div class="sempty"><h3>No skins here yet</h3><p>Be the first to post one.</p></div>`;
      $$('#skGrid canvas[data-sk]').forEach(c => drawSkin(c, `${CONFIG.api}/skins/png?id=${c.dataset.sk}`, !!c.dataset.slim));
      $$('[data-lk]').forEach(b => b.onclick = async () => { if (!loggedIn()) return needLogin(); try { const x = await api('/skins/like', { method: 'POST', body: { id: Number(b.dataset.lk) } }); b.classList.toggle('on', x.liked); b.querySelector('span').textContent = x.likes; } catch (e) { toast('Couldn\'t like it', e.message); } });
      $$('#skGrid [data-wear]').forEach(b => b.onclick = async () => { if (!loggedIn()) return needLogin(); b.disabled = true; try { await api('/skins/wear', { method: 'POST', body: { id: Number(b.dataset.wear) } }); toast('Skin on', 'Every Kyoto player sees it in game within a minute.'); } catch (e) { toast('Couldn\'t wear it', e.message); } b.disabled = false; });
      $$('#skGrid [data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this skin from the gallery?')) return; try { await api('/skins/delete', { method: 'POST', body: { id: Number(b.dataset.del) } }); load(); } catch (e) { toast('Couldn\'t delete it', e.message); } });
    }
    load();
  }
  const SKIN_TAGS = ['Cute', 'Cool', 'Anime', 'Gamer', 'Spooky', 'Holiday', 'Fantasy', 'Mob', 'Aesthetic', 'Funny', 'Pixel art', 'Other'];
  function postSkin() {
    if (!loggedIn()) return needLogin();
    const box = document.createElement('div'); box.className = 'cmodal';
    let png = null, tags = [];
    box.innerHTML = `<div class="cbox sell"><button class="cx" data-x>${icon('x')}</button><span class="eyebrow">${icon('shirt')} Skin gallery</span><h2>Post a skin</h2>
      <label class="fld drop"><span>Your skin (64x64 PNG)</span><input type="file" accept="image/png" id="skFile"><b id="skFileName">Choose file</b></label>
      <div class="skup"><canvas id="skPrev"></canvas><div><label class="fld"><span>Name</span><input id="skTitle" maxlength="40" placeholder="Cozy hoodie"></label>
      <label class="sw"><input type="checkbox" id="skSlim"><i></i>Slim arms (Alex)</label></div></div>
      <div class="fld"><span>Tags (up to 3)</span><div class="ntabs" id="skTagPick">${SKIN_TAGS.map(x => `<button type="button" data-tp="${x}">${x}</button>`).join('')}</div></div>
      <button class="btn glow wide" id="skGo" disabled>${icon('upload')} Post it</button></div>`;
    document.body.appendChild(box);
    box.onclick = e => { if (e.target === box || e.target.closest('[data-x]')) box.remove(); };
    $$('[data-tp]', box).forEach(b => b.onclick = () => { const x = b.dataset.tp; if (tags.includes(x)) tags = tags.filter(y => y !== x); else if (tags.length < 3) tags.push(x); $$('[data-tp]', box).forEach(y => y.classList.toggle('on', tags.includes(y.dataset.tp))); });
    const redraw = () => png && drawSkin($('#skPrev', box), png, $('#skSlim', box).checked);
    $('#skSlim', box).onchange = redraw;
    $('#skFile', box).onchange = () => {
      const f = $('#skFile', box).files[0]; if (!f) return;
      if (f.size > 200000) return toast('Too big', 'Skins are tiny PNGs under 200 KB.');
      const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { if (im.width !== 64 || (im.height !== 64 && im.height !== 32)) return toast('Not a skin', 'Skins are 64x64 PNGs.'); png = rd.result; $('#skFileName', box).textContent = f.name; if (!$('#skTitle', box).value) $('#skTitle', box).value = f.name.replace(/\.png$/i, '').slice(0, 40); $('#skGo', box).disabled = false; redraw(); }; im.src = rd.result; }; rd.readAsDataURL(f);
    };
    $('#skGo', box).onclick = async () => {
      const b = $('#skGo', box); b.disabled = true;
      try { await api('/skins/post', { method: 'POST', body: { png, title: $('#skTitle', box).value.trim(), slim: $('#skSlim', box).checked, tags } }); box.remove(); toast('Posted', 'Your skin is in the gallery.'); skSort = 'new'; skins(); }
      catch (e) { b.disabled = false; toast('Couldn\'t post it', e.message); }
    };
  }

  /* ============================ Wishlist ============================ */
  async function wishlist(name) {
    const t = ++token;
    if (!loggedIn()) { frame('wishlist', `<div class="sempty"><h3>Log in to use your wishlist</h3><p>Type <code>/kyoto link</code> in game, then log in.</p><a class="btn glow" href="/edit" data-link>Log in</a></div>`); return; }
    frame('wishlist', loading());
    let r; try { r = await api('/wishlist' + (name ? '?name=' + encodeURIComponent(name) : '')); } catch (e) { $('.cwrap').innerHTML = errBox(e); return; }
    if (t !== token) return;
    const mine = !name || (me() && name.toLowerCase() === me().name.toLowerCase());
    $('.cwrap').innerHTML = `<div class="wl2"><div><h3 class="csub">${icon('heart')} ${mine ? 'Your wishlist' : esc(r.name) + '\'s wishlist'} <span class="muted">(${r.items.length})</span></h3>
        ${mine ? '' : `<a class="btn ghost sm" href="/wishlist" data-link>${icon('arrow')} Back to mine</a>`}
        <div class="sgrid in" id="wlGrid"></div></div>
      ${mine ? `<aside><h3 class="csub">${icon('gift')} Friends' wishlists</h3><div class="clist">${(r.friends || []).length ? r.friends.map(f => `<a class="crow" href="/wishlist/${encodeURIComponent(f.name)}" data-link><img src="${head(f.name, 40)}" alt=""><div><b>${esc(f.name)}</b><span>${f.count} item${f.count === 1 ? '' : 's'}</span></div><span class="btn sm ghost">${icon('gift')} Gift</span></a>`).join('') : '<p class="muted small">None of your friends have a wishlist yet.</p>'}</div></aside>` : ''}</div>`;
    const g = $('#wlGrid');
    if (!r.items.length) { g.outerHTML = `<div class="sempty"><h3>${mine ? 'Nothing here yet' : 'Their wishlist is empty'}</h3><p>${mine ? 'Tap the heart on anything in <a href="/store" data-link>the Store</a>.' : ''}</p></div>`; return; }
    g.innerHTML = r.items.map(i => KY_ITEMS.card(i, mine ? '' : `<button class="btn sm glow" data-giftw="${i.id}">${icon('gift')} Gift</button>`)).join('');
    KY_ITEMS.wire(g);
    $$('[data-giftw]', g).forEach(b => b.onclick = e => { e.stopPropagation(); const it = r.items.find(x => x.id === Number(b.dataset.giftw)); KY_ITEMS.gift(it, 'buy'); });
  }

  /* ============================ Invite / referrals ============================ */
  async function invite() {
    const t = ++token;
    if (!loggedIn()) { frame('invite', `<div class="sempty"><h3>Log in to get your invite link</h3><p>Type <code>/kyoto link</code> in game, then log in.</p><a class="btn glow" href="/edit" data-link>Log in</a></div>`); return; }
    frame('invite', loading());
    let r; try { r = await api('/refer'); } catch (e) { $('.cwrap').innerHTML = errBox(e); return; }
    if (t !== token) return;
    const done = r.refs.filter(x => x.qualified).length, steps = Object.keys(r.rewards.bonus).map(Number);
    const next = steps.find(n => n > done) || steps[steps.length - 1];
    $('.cwrap').innerHTML = `<div class="refgrid">
      <div class="refcard big"><span class="eyebrow">Your invite</span><h2>Share your link</h2><p class="muted">Friends sign up with your name as their invite code in their first 14 days. Once they've played <b>${r.rewards.hours} hour</b> with Kyoto, they get <b>${r.rewards.newPlayer} coins</b> and you get <b>${r.rewards.you}</b>.</p>
        <div class="refcopy"><input readonly value="${esc(r.link)}" id="refLink"><button class="btn glow" id="refCopy">${icon('copy')} Copy</button></div>
        <div class="refcopy"><span class="muted small">Invite code:</span> <code>${esc(r.code)}</code></div></div>
      <div class="refcard"><span class="eyebrow">Earned</span><h2>${icon('coin')} ${fmt(r.earned)}</h2><p class="muted">${done} friend${done === 1 ? '' : 's'} joined and stayed.</p>
        <div class="miles">${steps.map(n => `<div class="mile ${done >= n ? 'on' : ''}"><b>${n}</b><span>+${fmt(r.rewards.bonus[n])}</span></div>`).join('')}</div>
        <div class="achbar"><i style="width:${Math.min(100, done / steps[steps.length - 1] * 100)}%"></i></div><p class="muted small">${done >= steps[steps.length - 1] ? 'All bonuses unlocked. Legend.' : `${next - done} more for the next bonus.`}</p></div>
      ${r.canClaim ? `<div class="refcard"><span class="eyebrow">New here?</span><h2>Got invited?</h2><p class="muted">Enter who invited you. You both get coins after your first hour.</p><form id="refClaim" class="cfind"><input placeholder="Their Minecraft name" maxlength="16" value="${esc(localStorage.getItem('kyoto.ref') || '')}"><button class="btn">${icon('check')} Claim</button></form></div>`
        : r.invitedBy ? `<div class="refcard"><span class="eyebrow">Invited by</span><h2><img src="${head(r.invitedBy, 28)}" alt="" class="inl"> ${esc(r.invitedBy)}</h2><p class="muted">${r.invitedQualified ? 'Reward paid out. Thanks for sticking around!' : `Play ${Math.max(0, 60 - r.myMinutes)} more minutes with Kyoto to unlock your ${r.rewards.newPlayer} coins.`}</p>${r.invitedQualified ? '' : `<div class="achbar"><i style="width:${Math.min(100, r.myMinutes / 60 * 100)}%"></i></div>`}</div>` : ''}
      <div class="refcard wide"><span class="eyebrow">Your invites</span>${r.refs.length ? `<div class="reflist">${r.refs.map(x => `<div class="refrow"><img src="${head(x.name)}" alt=""><b>${esc(x.name)}</b><span class="muted small">joined ${ago(x.at)}</span>${x.qualified ? `<i class="ok">${icon('check')} Paid</i>` : `<span class="refprog"><i style="width:${Math.min(100, x.minutes / 60 * 100)}%"></i></span><span class="muted small">${x.minutes}/60 min</span>`}</div>`).join('')}</div>` : '<p class="muted">No one yet. Send your link to a friend!</p>'}</div></div>`;
    $('#refCopy').onclick = () => { navigator.clipboard.writeText(r.link).then(() => toast('Copied', 'Send it to a friend.')); };
    if ($('#refClaim')) $('#refClaim').onsubmit = async e => { e.preventDefault(); try { const x = await api('/refer/claim', { method: 'POST', body: { code: $('#refClaim input').value.trim() } }); localStorage.removeItem('kyoto.ref'); toast('Invite claimed', `Play an hour and you and ${x.by} both get coins.`); invite(); } catch (err) { toast('Couldn\'t claim it', err.message); } };
  }

  /* ============================ Status ============================ */
  async function status() {
    const t = ++token;
    frame('status', loading());
    let r; try { r = await api('/status/info', { auth: false }); } catch (e) { if (t === token) $('.cwrap').innerHTML = `<div class="stbanner down"><span class="stdot"></span><div><b>Kyoto's server isn't answering</b><span>It might be waking up (free servers sleep). Try again in a minute.</span></div></div>`; return; }
    if (t !== token) return;
    const word = { up: 'All systems working', degraded: 'Some things are slow or partly down', down: 'Kyoto is having problems' }[r.overall];
    const up = ms => { const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
    // 7 days of 5-minute samples -> 84 two-hour bars
    const bars = []; const now = Date.now();
    for (let i = 83; i >= 0; i--) { const a = now - (i + 1) * 72e5, b = now - i * 72e5; const s = r.history.filter(h => h.t >= a && h.t < b); bars.push(s.length ? (s.some(h => h.lag > 300) ? 'degraded' : 'up') : 'none'); }
    const seen = bars.filter(b => b !== 'none').length, upPct = seen ? (bars.filter(b => b === 'up').length / seen * 100).toFixed(2) : '100.00';
    const peak = Math.max(1, ...r.history.map(h => h.on));
    const pts = r.history.map((h, i) => `${(i / Math.max(1, r.history.length - 1) * 100).toFixed(2)},${(40 - h.on / peak * 36).toFixed(2)}`).join(' ');
    $('.cwrap').innerHTML = `<div class="stbanner ${r.overall}"><span class="stdot"></span><div><b>${word}</b><span>Checked ${new Date().toLocaleTimeString()} · up for ${up(r.uptime)}</span></div><button class="btn ghost sm" id="stRe">${icon('refresh')} Refresh</button></div>
      <div class="stnums"><div><b>${fmt(r.online)}</b><span>playing now</span></div><div><b>${fmt(r.users)}</b><span>Kyoto players</span></div><div><b>${r.lag} ms</b><span>response delay</span></div><div><b>${r.latest ? esc(r.latest.version) : '—'}</b><span>latest Kyoto ${r.latest ? 'for ' + esc(r.latest.mc) : ''}</span></div></div>
      <div class="stcard"><div class="sthead"><b>Last 7 days</b><span class="muted small">${upPct}% healthy</span></div><div class="stbars">${bars.map(b => `<i class="${b}"></i>`).join('')}</div><div class="stleg muted small"><span>7 days ago</span><span>now</span></div></div>
      <div class="stcard">${r.components.map(c => `<div class="stcomp"><span class="stdot ${c.state}"></span><b>${esc(c.name)}</b><span class="muted small">${esc(c.detail)}</span><em class="${c.state}">${{ up: 'Working', degraded: 'Degraded', down: 'Down', off: 'Not set up' }[c.state]}</em></div>`).join('')}</div>
      ${r.history.length > 2 ? `<div class="stcard"><div class="sthead"><b>Players online</b><span class="muted small">peak ${peak}</span></div><svg class="stgraph" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="${pts}" /></svg></div>` : ''}
      <div class="stcard"><div class="sthead"><b>Incidents</b>${me() && me().staff ? `<button class="btn sm ghost" id="stNew">${icon('plus')} Report one</button>` : ''}</div>${r.incidents.length ? r.incidents.map(i => `<div class="stinc ${i.resolved ? 'res' : i.level}"><b>${esc(i.title)}</b><span class="muted small">${new Date(i.at).toLocaleString()}${i.resolved ? ' · resolved' : ''}</span>${i.updates.map(u => `<p>${esc(u.text)} <span class="muted small">${ago(u.at)}</span></p>`).join('')}${!i.resolved && me() && me().staff ? `<button class="btn sm" data-res="${i.id}">Mark resolved</button>` : ''}</div>`).join('') : '<p class="muted">No incidents. Smooth sailing.</p>'}</div>`;
    $('#stRe').onclick = status;
    if ($('#stNew')) $('#stNew').onclick = async () => { const title = prompt('What\'s wrong? (short title)'); if (!title) return; const text = prompt('Details for players') || ''; try { await api('/status/incident', { method: 'POST', body: { title, text, level: confirm('Is it a major outage? OK = major, Cancel = minor') ? 'major' : 'minor' } }); status(); } catch (e) { toast('Couldn\'t post it', e.message); } };
    $$('[data-res]').forEach(b => b.onclick = async () => { try { await api('/status/incident', { method: 'POST', body: { resolve: Number(b.dataset.res), text: prompt('Resolution note') || 'Resolved' } }); status(); } catch (e) { toast('Couldn\'t do that', e.message); } });
  }

  /* ============================ Player card ============================ */
  async function card(name) {
    const t = ++token;
    const who = name || (me() && me().name);
    if (!who) { frame('card', `<div class="sempty"><h3>Whose card?</h3><form id="cardFind" class="cfind"><input placeholder="Minecraft name" maxlength="16"><button class="btn">Show</button></form></div>`); $('#cardFind').onsubmit = e => { e.preventDefault(); go('/card/' + $('#cardFind input').value.trim()); }; return; }
    frame('card', loading());
    let c; try { c = await api('/card?name=' + encodeURIComponent(who)); } catch (e) { $('.cwrap').innerHTML = errBox(e); return; }
    if (t !== token) return;
    document.title = `${c.name}'s Kyoto card`;
    $('.cwrap').innerHTML = `<div class="cardwrap"><canvas id="pcard" width="1200" height="675"></canvas>
      <div class="cardacts"><button class="btn glow" id="cardDl">${icon('download')} Download PNG</button><button class="btn ghost" id="cardCopy">${icon('link')} Copy link</button>
      <form id="cardFind" class="cfind"><input placeholder="Someone else's card" maxlength="16"><button class="btn sm">${icon('search')}</button></form></div></div>`;
    await drawCard($('#pcard'), c);
    $('#cardDl').onclick = () => { const a = document.createElement('a'); a.download = `kyoto-card-${c.name}.png`; a.href = $('#pcard').toDataURL('image/png'); a.click(); };
    $('#cardCopy').onclick = () => navigator.clipboard.writeText(location.origin + '/card/' + c.name).then(() => toast('Copied'));
    $('#cardFind').onsubmit = e => { e.preventDefault(); const v = $('#cardFind input').value.trim(); if (v) go('/card/' + v); };
  }
  const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function drawCard(cv, c) {
    const g = cv.getContext('2d'), W = 1200, H = 675;
    const acc = c.accent || '#808080';
    await document.fonts.ready;
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b0b12'); bg.addColorStop(1, '#1b1b1b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * .8, H * .1, 0, W * .8, H * .1, 700); glow.addColorStop(0, acc + '66'); glow.addColorStop(1, 'transparent'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // stars
    let sd = c.name.length * 97; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 120; i++) { g.globalAlpha = .2 + r() * .7; g.fillStyle = '#fff'; const s = r() > .9 ? 2.4 : 1.4; g.fillRect(r() * W, r() * H, s, s); }
    g.globalAlpha = 1;
    // border
    g.strokeStyle = acc + 'aa'; g.lineWidth = 3; roundRect(g, 14, 14, W - 28, H - 28, 34); g.stroke();
    // body render
    const body = await loadImg(`https://mc-heads.net/body/${encodeURIComponent(c.name)}/420`);
    if (body) { g.save(); g.shadowColor = acc; g.shadowBlur = 60; g.drawImage(body, 70, 110, 420 * body.width / body.height * .98, 470); g.restore(); }
    const logo = await loadImg('/img/logos/torii_starry.png'); if (logo) g.drawImage(logo, W - 108, 44, 56, 56);
    g.fillStyle = '#fff'; g.font = '800 22px Poppins, sans-serif'; g.textAlign = 'right'; g.fillText('KYOTO CLIENT', W - 124, 82); g.textAlign = 'left';
    const x0 = 420;
    g.font = '600 20px Inter, sans-serif'; g.fillStyle = acc; g.fillText(c.title.toUpperCase() + (c.owner ? ' · OWNER' : c.plus ? ' · KYOTO+' : c.staff ? ' · STAFF' : ''), x0, 170);
    g.fillStyle = '#fff'; g.font = `800 ${c.displayName.length > 12 ? 58 : 76}px Poppins, sans-serif`; g.fillText(c.displayName, x0, 248);
    g.fillStyle = '#afafaf'; g.font = '500 22px Inter, sans-serif'; g.fillText('@' + c.name + (c.joined ? ' · since ' + new Date(c.joined).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''), x0, 286);
    // level ring
    const lx = W - 150, ly = 230, lr = 70;
    g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.arc(lx, ly, lr, 0, 6.283); g.stroke();
    g.strokeStyle = acc; g.lineCap = 'round'; g.beginPath(); g.arc(lx, ly, lr, -1.571, -1.571 + 6.283 * Math.min(1, c.into / c.need)); g.stroke(); g.lineCap = 'butt';
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 52px Poppins, sans-serif'; g.fillText(c.level, lx, ly + 14); g.font = '600 15px Inter, sans-serif'; g.fillStyle = '#afafaf'; g.fillText('LEVEL', lx, ly + 40); g.textAlign = 'left';
    // stats grid
    const st = [['Hours played', fmt(c.stats.hours)], ['Friends', fmt(c.stats.friends)], ['Best streak', c.stats.streak + (c.stats.streak === 1 ? ' day' : ' days')], ['Followers', fmt(c.stats.followers)], ['Sales', fmt(c.stats.sales)], ['Achievements', `${c.stats.achievements}/${c.stats.total}`]];
    st.forEach(([k, v], i) => {
      const x = x0 + (i % 3) * 245, y = 340 + Math.floor(i / 3) * 112;
      g.fillStyle = 'rgba(255,255,255,.05)'; roundRect(g, x, y, 228, 96, 18); g.fill(); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#fff'; g.font = '800 34px Poppins, sans-serif'; g.fillText(v, x + 20, y + 50); g.fillStyle = '#afafaf'; g.font = '500 17px Inter, sans-serif'; g.fillText(k, x + 20, y + 78);
    });
    if (c.rarest) { g.fillStyle = acc + '22'; roundRect(g, x0, 578, 718, 54, 16); g.fill(); g.fillStyle = '#fff'; g.font = '600 19px Inter, sans-serif'; g.fillText(`Rarest achievement: ${c.rarest.name}`, x0 + 20, 612); g.fillStyle = acc; g.textAlign = 'right'; g.fillText(`${c.rarest.rarity}% of players`, x0 + 698, 612); g.textAlign = 'left'; }
    if (c.online) { g.fillStyle = '#c5c5c5'; g.beginPath(); g.arc(x0 + 8, 318, 7, 0, 6.3); g.fill(); g.fillStyle = '#c5c5c5'; g.font = '600 17px Inter, sans-serif'; g.fillText('Playing now', x0 + 24, 324); }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ============================ routing ============================ */
  function go(p) { history.pushState(null, '', p); scrollTo(0, 0); window.route(); }
  window.openCommunity = p => {
    const m = /^\/([a-z]+)(?:\/([A-Za-z0-9_]{1,16}))?/.exec(p) || [];
    const k = m[1], arg = m[2];
    if (k === 'creators') creators(); else if (k === 'creator') creator(arg);
    else if (k === 'leaderboards') leaderboards(); else if (k === 'achievements') achievements(arg);
    else if (k === 'skins') skins(); else if (k === 'wishlist') wishlist(arg);
    else if (k === 'invite') invite(); else if (k === 'status') status(); else if (k === 'card') card(arg);
  };
  if (/^\/(creators|creator|leaderboards|achievements|skins|wishlist|invite|status|card)(\/|$)/.test(location.pathname)) window.openCommunity(location.pathname);
  // invite links: kyoto.../?ref=name remembers who invited you
  const ref = new URLSearchParams(location.search).get('ref'); if (ref && /^[A-Za-z0-9_]{2,16}$/.test(ref)) localStorage.setItem('kyoto.ref', ref);
  if (ref && loggedIn()) api('/refer/claim', { method: 'POST', body: { code: ref } }).then(x => { localStorage.removeItem('kyoto.ref'); toast('Invite claimed', `Play an hour and you and ${x.by} both get coins.`); }).catch(() => {});
})();
