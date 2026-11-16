// Kyoto website community features: Creators (followers, shop, video posts), profile themes + rooms, player cards,
// leaderboards, achievements, skin gallery, wishlists, referral rewards and the status page.
// Loaded by server.js after social.js.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = function community(ctx) {
  const { routes, db, H, send, fail, clean, nameOf, byName, list, areFriends, isStaff, isBanned, checkText, slowmode, save, q,
    presence, isOnline, isOwnerUuid, isPlus, isListing, storeOut, SOCIAL, DATA, SKINS, PUBLIC_URL, discordInfo, onlineCount, OWNERS } = ctx;
  const now = () => Date.now();
  const wrap = (key, after) => { const old = routes[key]; routes[key] = async (req, res, body, me) => { await old(req, res, body, me); if (res.statusCode === 200) try { after(body, me, req); } catch (e) { console.warn('community hook', key, e.message); } }; };
  const user = n => { const u = byName(n); return u && !isBanned(u) ? u : null; };

  /* ================================================================ stats (counters + things we can work out) ================================================================ */
  db.stats = db.stats || {};
  const st = u => db.stats[u] = db.stats[u] || { play: 0, msgs: 0, gifts: 0, lfg: 0, polls: 0, voice: 0, rooms: 0, nights: 0, days: [] };
  const inc = (u, k, n = 1) => { if (!u) return; const s = st(u); s[k] = (s[k] || 0) + n; save(); };
  // playtime: every presence ping while online adds the time since the last one (max 3 min, so being away doesn't count)
  const lastPing = new Map();
  wrap('POST /presence', (body, me) => {
    const t = now(), last = lastPing.get(me) || 0; lastPing.set(me, t);
    if (last && t - last < 3 * 60000) {
      const s = st(me); s.play = (s.play || 0) + (t - last) / 60000;
      const day = new Date(t).toISOString().slice(0, 10); if (!s.days.includes(day)) { s.days.push(day); if (s.days.length > 400) s.days.shift(); }
      const hr = new Date(t).getUTCHours(); if (hr >= 4 && hr < 6) s.nights = (s.nights || 0) + 1;
      checkReferral(me);
    }
  });
  for (const k of ['POST /chat/send', 'POST /chat/image', 'POST /dm/send', 'POST /groups/send']) wrap(k, (b, me) => inc(me, 'msgs'));
  wrap('POST /gift', (b, me) => { inc(me, 'gifts'); const to = byName(b.to); if (to) unwish(to, Number(b.id)); });
  wrap('POST /lfg/post', (b, me) => inc(me, 'lfg'));
  wrap('POST /lfg/join', (b, me) => inc(me, 'lfg'));
  wrap('POST /msg/poll', (b, me) => inc(me, 'polls'));
  wrap('POST /voice/create', (b, me) => inc(me, 'voice'));
  wrap('POST /rooms/create', (b, me) => inc(me, 'rooms'));
  wrap('POST /store/get', (b, me) => unwish(me, Number(b.id)));
  wrap('POST /store/listing', (b, me) => { // tell followers about new shop items
    const p = [...H.posts].reverse().find(x => x.uuid === me && isListing(x)); if (!p || p.pending) return;
    for (const f of followersOf(me).slice(0, 300)) SOCIAL.note(f, 'creator', `${nameOf(me)} posted "${p.title}" in their shop`, { item: p.id });
  });

  function statsOf(u) {
    const s = st(u), mine = H.posts.filter(p => p.uuid === u && isListing(p) && !p.pending);
    let streakBest = 0; for (const [k, v] of Object.entries(H.streaks || {})) if (k.includes(u)) streakBest = Math.max(streakBest, v.best || 0, v.n || 0);
    let reviews = 0; for (const sv of Object.values(H.servers || {})) if (sv.reviews[u]) reviews++;
    const trades = (H.trades || []).filter(t => t.state === 'done' && (t.a === u || t.b === u)).length;
    const groups = Object.values(H.groups || {}).filter(g => g.owner === u).length;
    return { play: Math.round(s.play || 0), hours: Math.floor((s.play || 0) / 60), msgs: s.msgs || 0, gifts: s.gifts || 0, lfg: s.lfg || 0, polls: s.polls || 0, voice: s.voice || 0, rooms: s.rooms || 0,
      days: (s.days || []).length, nights: s.nights || 0, friends: list(db.friends, u).length, listings: mine.length, sales: mine.reduce((a, p) => a + (p.owners || 0), 0),
      followers: followersOf(u).length, following: (db.follows[u] || []).length, streakBest, reviews, trades, groups, owned: new Set(db.lib[u] || []).size,
      wearing: !!(db.kycos && db.kycos[u] && Object.keys(db.kycos[u].slots || {}).length), skins: (H.skins || []).filter(x => x.uuid === u).length,
      videos: (H.videos || []).filter(v => v.uuid === u).length, refs: Object.values(db.refs || {}).filter(r => r.by === u && r.qualified).length,
      plus: isPlus(u), joined: (db.users[u] || {}).joined || 0, profile: !!db.profiles[u], room: !!(db.profiles[u] && db.profiles[u].room && db.profiles[u].room.scene) };
  }

  /* ================================================================ achievements ================================================================ */
  // [id, name, how, points, icon, test]
  const ACH = [
    ['hello', 'Hello world', 'Send your first message', 5, 'chat', s => s.msgs >= 1],
    ['chatter', 'Chatterbox', 'Send 500 messages', 20, 'chat', s => s.msgs >= 500],
    ['friend1', 'Not alone', 'Make a Kyoto friend', 5, 'users', s => s.friends >= 1],
    ['friend10', 'Social butterfly', 'Have 10 Kyoto friends', 20, 'users', s => s.friends >= 10],
    ['streak7', 'On fire', 'Reach a 7 day friend streak', 20, 'flame', s => s.streakBest >= 7],
    ['streak30', 'Unbreakable', 'Reach a 30 day friend streak', 50, 'flame', s => s.streakBest >= 30],
    ['play10', 'Getting comfy', 'Play 10 hours with Kyoto', 10, 'clock', s => s.hours >= 10],
    ['play100', 'Veteran', 'Play 100 hours with Kyoto', 40, 'clock', s => s.hours >= 100],
    ['days30', 'Regular', 'Play on 30 different days', 25, 'history', s => s.days >= 30],
    ['night', 'Night owl', 'Play between 4 and 6 AM (UTC)', 10, 'moon', s => s.nights >= 1],
    ['creator', 'Creator', 'Get a cosmetic into the Store', 15, 'sparkles', s => s.listings >= 1],
    ['seller', 'Best seller', 'Your items were picked up 25 times', 40, 'crown', s => s.sales >= 25],
    ['fans', 'Fan club', 'Get 25 followers', 40, 'star', s => s.followers >= 25],
    ['video', 'On camera', 'Post a video on your creator page', 10, 'film', s => s.videos >= 1],
    ['collector', 'Collector', 'Own 10 cosmetics', 15, 'box', s => s.owned >= 10],
    ['drip', 'Drip', 'Wear a custom cosmetic', 5, 'cape', s => s.wearing],
    ['trader', 'Trader', 'Finish a trade', 15, 'swap', s => s.trades >= 1],
    ['gift', 'Generous', 'Send a gift', 15, 'gift', s => s.gifts >= 1],
    ['critic', 'Critic', 'Review 3 servers', 15, 'server', s => s.reviews >= 3],
    ['team', 'Team player', 'Use Looking For Group', 10, 'team', s => s.lfg >= 1],
    ['voice', 'On the mic', 'Start a voice room', 10, 'mic', s => s.voice >= 1],
    ['poll', 'Pollster', 'Make a poll', 5, 'poll', s => s.polls >= 1],
    ['squad', 'Squad up', 'Make a group chat', 5, 'team', s => s.groups >= 1],
    ['artist', 'Skin artist', 'Post a skin to the gallery', 10, 'palette', s => s.skins >= 1],
    ['decor', 'Interior designer', 'Set up your profile room', 10, 'home', s => s.room],
    ['recruit', 'Recruiter', 'Invite 3 players who stay', 40, 'userplus', s => s.refs >= 3],
    ['plus', 'Supporter', 'Get Kyoto+', 25, 'heart', s => s.plus]
  ];
  db.ach = db.ach || {};
  function achievementsOf(u) {
    const first = !db.ach[u], s = statsOf(u), got = db.ach[u] = db.ach[u] || {}; let ch = first;
    // the first check unlocks what you already earned quietly; after that each new one gets a notification
    for (const a of ACH) if (!got[a[0]] && a[5](s)) { got[a[0]] = now(); ch = true; if (!first) SOCIAL.note(u, 'achievement', `Achievement unlocked: ${a[1]} (+${a[3]})`, { id: a[0] }); }
    if (ch) save();
    return { s, got };
  }
  const rarity = () => { const c = {}; let n = 0; for (const g of Object.values(db.ach)) { n++; for (const k of Object.keys(g)) c[k] = (c[k] || 0) + 1; } return { c, n: Math.max(1, n) }; };
  const pointsOf = got => ACH.reduce((a, x) => a + (got[x[0]] ? x[3] : 0), 0);
  const MAXPTS = ACH.reduce((a, x) => a + x[3], 0);
  routes['GET /achievements'] = async (req, res, body, me) => {
    const u = q(req).get('name') ? user(q(req).get('name')) : me; if (!u) return fail(res, 404, 'No Kyoto player with that name');
    const { s, got } = achievementsOf(u), R = rarity();
    send(res, 200, { name: nameOf(u), points: pointsOf(got), max: MAXPTS, unlocked: Object.keys(got).length, total: ACH.length, stats: s,
      list: ACH.map(a => ({ id: a[0], name: a[1], how: a[2], points: a[3], icon: a[4], at: got[a[0]] || 0, rarity: Math.round((R.c[a[0]] || 0) / R.n * 1000) / 10 })) });
  };

  /* ================================================================ levels + player cards ================================================================ */
  function levelOf(u) {
    const { s, got } = achievementsOf(u);
    const xp = pointsOf(got) * 10 + s.hours * 6 + Math.min(s.msgs, 3000) + s.sales * 8 + s.followers * 5;
    const lvl = Math.floor(Math.sqrt(xp / 40)) + 1, base = (lvl - 1) ** 2 * 40, next = lvl ** 2 * 40;
    return { lvl, xp, into: xp - base, need: next - base, s, got };
  }
  const TITLES = [[1, 'Newcomer'], [5, 'Regular'], [10, 'Adventurer'], [15, 'Veteran'], [20, 'Elite'], [30, 'Legend'], [45, 'Mythic']];
  routes['GET /card'] = async (req, res, body, me) => {
    const u = user(q(req).get('name')); if (!u) return fail(res, 404, 'No Kyoto player with that name');
    const L = levelOf(u), p = db.profiles[u] || {}, R = rarity();
    const rarest = ACH.filter(a => L.got[a[0]]).sort((a, b) => (R.c[a[0]] || 0) - (R.c[b[0]] || 0))[0];
    send(res, 200, { name: nameOf(u), displayName: p.displayName || nameOf(u), accent: p.accent || null, theme: p.theme || null, level: L.lvl, xp: L.xp, into: L.into, need: L.need,
      title: [...TITLES].reverse().find(t => L.lvl >= t[0])[1], owner: isOwnerUuid(u), plus: isPlus(u), staff: isStaff(u), online: isOnline(u),
      stats: { hours: L.s.hours, friends: L.s.friends, followers: L.s.followers, sales: L.s.sales, streak: L.s.streakBest, achievements: Object.keys(L.got).length, total: ACH.length, points: pointsOf(L.got) },
      rarest: rarest ? { name: rarest[1], icon: rarest[4], rarity: Math.round((R.c[rarest[0]] || 0) / R.n * 1000) / 10 } : null, joined: L.s.joined, bio: (p.bio || '').slice(0, 120) });
  };

  /* ================================================================ leaderboards ================================================================ */
  const BOARDS = {
    playtime: ['Playtime', 'hours played with Kyoto', s => s.hours, v => v + ' h'],
    level: ['Level', 'from achievements and activity', null, v => 'Lv ' + v],
    achievements: ['Achievements', 'achievement points', null, v => v + ' pts'],
    creators: ['Top creators', 'times their items were picked up', s => s.sales, v => v.toLocaleString() + ' sales'],
    followers: ['Most followed', 'followers', s => s.followers, v => v.toLocaleString()],
    chatter: ['Chattiest', 'messages sent', s => s.msgs, v => v.toLocaleString()],
    streaks: ['Longest streak', 'best friend streak', s => s.streakBest, v => v + ' days'],
    recruiters: ['Recruiters', 'friends who joined and stayed', s => s.refs, v => String(v)]
  };
  let boardCache = { at: 0, data: {} };
  function buildBoards() {
    if (now() - boardCache.at < 60000) return boardCache.data;
    const out = {};
    const users = Object.keys(db.users).filter(u => !isBanned(u));
    const rows = users.map(u => { const L = levelOf(u); return { u, s: L.s, lvl: L.lvl, pts: pointsOf(L.got) }; });
    for (const [k, [name, desc, f, fmt]] of Object.entries(BOARDS)) {
      const val = r => k === 'level' ? r.lvl : k === 'achievements' ? r.pts : f(r.s);
      const l = rows.map(r => ({ u: r.u, v: val(r) })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
      out[k] = { name, desc, rows: l.map((r, i) => ({ rank: i + 1, u: r.u, name: nameOf(r.u), value: r.v, shown: fmt(r.v), plus: isPlus(r.u), owner: isOwnerUuid(r.u) })) };
    }
    boardCache = { at: now(), data: out };
    return out;
  }
  routes['GET /leaderboards'] = async (req, res, body, me) => {
    const b = buildBoards(), k = BOARDS[q(req).get('board')] ? q(req).get('board') : 'playtime', B = b[k];
    const scope = q(req).get('scope') === 'friends' && me ? new Set([me, ...list(db.friends, me)]) : null;
    let rows = scope ? B.rows.filter(r => scope.has(r.u)).map((r, i) => Object.assign({}, r, { rank: i + 1 })) : B.rows;
    const mine = me ? rows.find(r => r.u === me) : null;
    send(res, 200, { board: k, name: B.name, desc: B.desc, boards: Object.entries(BOARDS).map(([id, x]) => ({ id, name: x[0] })), rows: rows.slice(0, 100).map(({ u, ...r }) => r), me: mine ? (({ u, ...r }) => r)(mine) : null, total: rows.length });
  };

  /* ================================================================ creators ================================================================ */
  db.follows = db.follows || {}; // follower -> [creators]
  H.videos = H.videos || [];
  function followersOf(u) { const out = []; for (const [f, l] of Object.entries(db.follows)) if (l.includes(u)) out.push(f); return out; }
  function videoInfo(url) {
    url = String(url || '').trim();
    let m;
    if ((m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url))) return { kind: 'youtube', vid: m[1], short: /shorts\//.test(url) };
    if ((m = /tiktok\.com\/@[\w.]+\/video\/(\d{8,25})/.exec(url))) return { kind: 'tiktok', vid: m[1] };
    if ((m = /(?:clips\.twitch\.tv\/|twitch\.tv\/\w+\/clip\/)([\w-]{4,100})/.exec(url))) return { kind: 'twitch', vid: m[1] };
    if ((m = /twitch\.tv\/videos\/(\d{4,15})/.exec(url))) return { kind: 'twitchvod', vid: m[1] };
    return null;
  }
  const videoOut = (v, me) => ({ id: v.id, kind: v.kind, vid: v.vid, short: !!v.short, url: v.url, title: v.title, desc: v.desc, at: v.at, likes: v.likes.length, liked: !!me && v.likes.includes(me), name: nameOf(v.uuid), mine: v.uuid === me, type: 'video' });
  function creatorSum(u, me) {
    const items = H.posts.filter(p => p.uuid === u && isListing(p) && !p.pending), vids = H.videos.filter(v => v.uuid === u);
    const p = db.profiles[u] || {};
    return { name: nameOf(u), displayName: p.displayName || nameOf(u), accent: p.accent || null, bio: (p.bio || '').slice(0, 160), followers: followersOf(u).length, sales: items.reduce((a, x) => a + (x.owners || 0), 0),
      items: items.length, videos: vids.length, following: !!me && (db.follows[me] || []).includes(u), last: Math.max(0, ...items.map(x => x.at), ...vids.map(v => v.at)),
      top: items.sort((a, b) => (b.owners || 0) - (a.owners || 0)).slice(0, 3).map(x => ({ id: x.id, type: x.type, photos: (x.photos || []).length, title: x.title, slot: x.slot || 'cape' })),
      plus: isPlus(u), owner: isOwnerUuid(u), online: isOnline(u), me: u === me };
  }
  routes['GET /creators'] = async (req, res, body, me) => {
    const sort = q(req).get('sort') || 'followers', qs = String(q(req).get('q') || '').toLowerCase();
    const ids = new Set([...H.posts.filter(p => isListing(p) && !p.pending).map(p => p.uuid), ...H.videos.map(v => v.uuid)]);
    let l = [...ids].filter(u => db.users[u] && !isBanned(u)).map(u => creatorSum(u, me)).filter(c => !qs || c.name.toLowerCase().includes(qs) || c.displayName.toLowerCase().includes(qs));
    l.sort(sort === 'sales' ? (a, b) => b.sales - a.sales : sort === 'new' ? (a, b) => b.last - a.last : (a, b) => b.followers - a.followers || b.sales - a.sales);
    // a mixed feed of the newest shop items + videos from everyone (or who you follow)
    const following = me ? new Set(db.follows[me] || []) : new Set();
    const feedFilter = q(req).get('feed') || 'all';
    let feed = [...H.posts.filter(p => isListing(p) && !p.pending).map(p => Object.assign(storeOut(p, me), { type2: 'shop' })), ...H.videos.map(v => Object.assign(videoOut(v, me), { type2: 'content' }))];
    if (q(req).get('only') === 'following') feed = feed.filter(x => following.has(byName(x.creator || x.name)));
    if (feedFilter !== 'all') feed = feed.filter(x => x.type2 === feedFilter);
    feed.sort((a, b) => b.at - a.at);
    send(res, 200, { creators: l.slice(0, 60), feed: feed.slice(0, 60), following: [...following].map(nameOf) });
  };
  routes['GET /creator'] = async (req, res, body, me) => {
    const u = user(q(req).get('name')); if (!u) return fail(res, 404, 'No Kyoto player with that name');
    const sum = creatorSum(u, me);
    const items = H.posts.filter(p => p.uuid === u && isListing(p) && (!p.pending || u === me)).map(p => Object.assign(storeOut(p, me), { type2: 'shop' }));
    const vids = H.videos.filter(v => v.uuid === u).map(v => Object.assign(videoOut(v, me), { type2: 'content' }));
    const L = levelOf(u);
    send(res, 200, Object.assign(sum, { level: L.lvl, posts: [...items, ...vids].sort((a, b) => b.at - a.at), joined: (db.users[u] || {}).joined || 0 }));
  };
  routes['POST /creator/follow'] = async (req, res, body, me) => {
    const u = user(body.name); if (!u || u === me) return fail(res, 400, 'Pick someone else');
    if (slowmode(me + 'follow' + u, 1500)) return fail(res, 429, 'Slow down');
    const l = db.follows[me] = db.follows[me] || [];
    const i = l.indexOf(u);
    if (i >= 0) l.splice(i, 1); else { if (l.length >= 1000) return fail(res, 400, 'You follow 1000 people already'); l.push(u); SOCIAL.note(u, 'follow', `${nameOf(me)} followed you`, { name: nameOf(me) }); }
    save(); send(res, 200, { ok: true, following: i < 0, followers: followersOf(u).length });
  };
  routes['POST /creator/video'] = async (req, res, body, me) => {
    if (isBanned(me)) return fail(res, 403, 'Banned');
    const info = videoInfo(body.url); if (!info) return fail(res, 400, 'Paste a YouTube, TikTok or Twitch clip link');
    const title = clean(body.title, 80), desc = clean(body.desc, 400);
    if (!title) return fail(res, 400, 'Give it a title');
    if (!checkText(res, me, title + ' ' + desc)) return;
    if (!isStaff(me) && slowmode(me + 'video', 30000)) return fail(res, 429, 'One video every 30 seconds');
    if (H.videos.some(v => v.uuid === me && v.vid === info.vid)) return fail(res, 400, 'You already posted that one');
    const v = Object.assign({ id: H.seq++, uuid: me, url: String(body.url).slice(0, 300), title, desc, at: now(), likes: [] }, info);
    H.videos.push(v); if (H.videos.length > 5000) H.videos.shift();
    for (const f of followersOf(me).slice(0, 300)) SOCIAL.note(f, 'creator', `${nameOf(me)} posted a video: ${title}`, { video: v.id, name: nameOf(me) });
    save(); send(res, 200, { ok: true, id: v.id });
  };
  routes['POST /creator/video/delete'] = async (req, res, body, me) => {
    const v = H.videos.find(x => x.id === Number(body.id)); if (!v) return fail(res, 404, 'Gone');
    if (v.uuid !== me && !isStaff(me)) return fail(res, 403, 'Not yours');
    H.videos = H.videos.filter(x => x !== v); save(); send(res, 200, { ok: true });
  };
  routes['POST /creator/video/like'] = async (req, res, body, me) => {
    const v = H.videos.find(x => x.id === Number(body.id)); if (!v) return fail(res, 404, 'Gone');
    v.likes = v.likes.includes(me) ? v.likes.filter(x => x !== me) : v.likes.concat(me); save(); send(res, 200, { ok: true, likes: v.likes.length, liked: v.likes.includes(me) });
  };

  /* ================================================================ profile themes + rooms ================================================================ */
  const THEMES = ['sakura', 'midnight', 'neon', 'ocean', 'forest', 'sunset', 'mono', 'candy', 'aurora', 'ember', 'retro', 'frost'];
  const SCENES = ['christmas', 'bedroom', 'garden', 'beach', 'space', 'halloween', 'gamer', 'cafe'];
  const oldPut = routes['PUT /profile'];
  routes['PUT /profile'] = async (req, res, body, me) => {
    await oldPut(req, res, body, me);
    if (res.statusCode !== 200) return;
    const p = db.profiles[me]; if (!p) return;
    if (Object.prototype.hasOwnProperty.call(body, 'theme')) p.theme = THEMES.includes(body.theme) ? body.theme : null;
    if (Object.prototype.hasOwnProperty.call(body, 'room')) {
      const r = body.room || {};
      p.room = SCENES.includes(r.scene) ? { scene: r.scene, on: r.on !== false, pose: ['stand', 'wave', 'sit'].includes(r.pose) ? r.pose : 'wave', time: ['day', 'night'].includes(r.time) ? r.time : 'night' } : null;
    }
    save();
  };

  /* ================================================================ skin gallery ================================================================ */
  H.skins = H.skins || [];
  const GALLERY = path.join(DATA, 'skin_gallery'); fs.mkdirSync(GALLERY, { recursive: true });
  const SKIN_TAGS = ['Cute', 'Cool', 'Anime', 'Gamer', 'Spooky', 'Holiday', 'Fantasy', 'Mob', 'Aesthetic', 'Funny', 'Pixel art', 'Other'];
  const skinOut = (s, me) => ({ id: s.id, title: s.title, tags: s.tags, slim: s.slim, at: s.at, name: nameOf(s.uuid), likes: s.likes.length, liked: !!me && s.likes.includes(me), wears: s.wears || 0, downloads: s.downloads || 0, mine: s.uuid === me });
  routes['GET /skins'] = async (req, res, body, me) => {
    const sort = q(req).get('sort') || 'top', tag = q(req).get('tag'), qs = String(q(req).get('q') || '').toLowerCase(), by = q(req).get('by');
    let l = H.skins.filter(s => (!tag || s.tags.includes(tag)) && (!qs || s.title.toLowerCase().includes(qs) || nameOf(s.uuid).toLowerCase().includes(qs)) && (!by || nameOf(s.uuid).toLowerCase() === by.toLowerCase()));
    l.sort(sort === 'new' ? (a, b) => b.at - a.at : sort === 'worn' ? (a, b) => (b.wears || 0) - (a.wears || 0) : (a, b) => b.likes.length - a.likes.length || b.at - a.at);
    send(res, 200, { skins: l.slice(0, 120).map(s => skinOut(s, me)), tags: SKIN_TAGS, total: H.skins.length });
  };
  routes['GET /skins/png'] = async (req, res) => {
    const s = H.skins.find(x => x.id === Number(q(req).get('id'))); if (!s) return fail(res, 404, 'Gone');
    const f = path.join(GALLERY, String(s.id) + '.png'); if (!fs.existsSync(f)) return fail(res, 404, 'Gone');
    if (q(req).get('dl')) { s.downloads = (s.downloads || 0) + 1; save(); res.setHeader('Content-Disposition', `attachment; filename="${s.title.replace(/[^\w-]+/g, '_') || 'skin'}.png"`); }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    send(res, 200, fs.readFileSync(f), 'image/png');
  };
  routes['POST /skins/post'] = async (req, res, body, me) => {
    if (isBanned(me)) return fail(res, 403, 'Banned');
    const buf = Buffer.from(String(body.png || '').replace(/^data:image\/png;base64,/, ''), 'base64');
    if (!buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || buf.length > 200000) return fail(res, 400, 'Skins must be a PNG under 200 KB');
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (w !== 64 || (h !== 64 && h !== 32)) return fail(res, 400, 'Skins must be 64x64');
    const title = clean(body.title, 40); if (!title) return fail(res, 400, 'Give your skin a name');
    if (!checkText(res, me, title)) return;
    if (!isStaff(me) && slowmode(me + 'skinpost', 20000)) return fail(res, 429, 'One skin every 20 seconds');
    if (H.skins.filter(s => s.uuid === me).length >= 100) return fail(res, 400, '100 skins max: delete an old one');
    const s = { id: H.seq++, uuid: me, title, tags: (Array.isArray(body.tags) ? body.tags : []).filter(t => SKIN_TAGS.includes(t)).slice(0, 3), slim: !!body.slim, at: now(), likes: [], wears: 0, downloads: 0 };
    fs.writeFileSync(path.join(GALLERY, s.id + '.png'), buf);
    H.skins.push(s); save(); send(res, 200, { ok: true, id: s.id });
  };
  routes['POST /skins/like'] = async (req, res, body, me) => {
    const s = H.skins.find(x => x.id === Number(body.id)); if (!s) return fail(res, 404, 'Gone');
    s.likes = s.likes.includes(me) ? s.likes.filter(x => x !== me) : s.likes.concat(me); save(); send(res, 200, { ok: true, likes: s.likes.length, liked: s.likes.includes(me) });
  };
  routes['POST /skins/wear'] = async (req, res, body, me) => {
    const s = H.skins.find(x => x.id === Number(body.id)); if (!s) return fail(res, 404, 'Gone');
    fs.copyFileSync(path.join(GALLERY, s.id + '.png'), path.join(SKINS, me.replace(/[^a-f0-9-]/g, '')));
    const c = db.cosmetics[me] || (db.cosmetics[me] = { hasCape: false, capeType: 'png', accessory: 0 });
    c.hasSkin = true; c.slim = !!s.slim; c.skinVersion = now();
    if (s.uuid !== me) s.wears = (s.wears || 0) + 1;
    save(); send(res, 200, { ok: true });
  };
  routes['POST /skins/delete'] = async (req, res, body, me) => {
    const s = H.skins.find(x => x.id === Number(body.id)); if (!s) return fail(res, 404, 'Gone');
    if (s.uuid !== me && !isStaff(me)) return fail(res, 403, 'Not yours');
    H.skins = H.skins.filter(x => x !== s); try { fs.unlinkSync(path.join(GALLERY, s.id + '.png')); } catch (e) { /* gone */ }
    save(); send(res, 200, { ok: true });
  };

  /* ================================================================ wishlist ================================================================ */
  db.wish = db.wish || {};
  function unwish(u, id) { const l = db.wish[u]; if (l && l.includes(id)) { db.wish[u] = l.filter(x => x !== id); save(); } }
  routes['GET /wishlist'] = async (req, res, body, me) => {
    const u = q(req).get('name') ? user(q(req).get('name')) : me; if (!u) return fail(res, 404, 'No Kyoto player with that name');
    if (u !== me && !areFriends(me, u)) return fail(res, 403, 'Only friends can see someone\'s wishlist');
    const items = (db.wish[u] || []).map(id => H.posts.find(p => p.id === id && isListing(p) && !p.pending)).filter(Boolean).map(p => storeOut(p, me));
    const friends = u === me ? list(db.friends, me).map(f => ({ name: nameOf(f), count: (db.wish[f] || []).length, online: isOnline(f) })).filter(f => f.count).sort((a, b) => b.count - a.count) : undefined;
    send(res, 200, { name: nameOf(u), items, friends, ids: u === me ? db.wish[me] || [] : undefined });
  };
  routes['POST /wishlist/toggle'] = async (req, res, body, me) => {
    const p = H.posts.find(x => x.id === Number(body.id) && isListing(x)); if (!p) return fail(res, 404, 'That item is gone');
    const l = db.wish[me] = db.wish[me] || [];
    const i = l.indexOf(p.id);
    if (i >= 0) l.splice(i, 1); else { if (l.length >= 100) return fail(res, 400, '100 items max'); l.push(p.id); }
    save(); send(res, 200, { ok: true, on: i < 0, count: l.length });
  };

  /* ================================================================ referral rewards ================================================================ */
  db.refs = db.refs || {}; // new player -> { by, at, qualified, paid }
  const REF_NEW = 75, REF_BY = 150, REF_HOURS = 1, REF_BONUS = { 3: 300, 5: 500, 10: 1500 };
  function checkReferral(u) {
    const r = db.refs[u]; if (!r || r.qualified) return;
    if ((st(u).play || 0) >= REF_HOURS * 60) {
      r.qualified = true; r.qat = now();
      db.coins[u] = (db.coins[u] || 0) + REF_NEW; db.coins[r.by] = (db.coins[r.by] || 0) + REF_BY;
      SOCIAL.note(u, 'referral', `You played an hour with Kyoto: +${REF_NEW} coins for joining with ${nameOf(r.by)}'s invite!`);
      SOCIAL.note(r.by, 'referral', `${nameOf(u)} stuck around: +${REF_BY} coins!`);
      const n = Object.values(db.refs).filter(x => x.by === r.by && x.qualified).length;
      if (REF_BONUS[n]) { db.coins[r.by] += REF_BONUS[n]; SOCIAL.note(r.by, 'referral', `${n} friends joined with your invite: bonus +${REF_BONUS[n]} coins!`); }
      save();
    }
  }
  routes['GET /refer'] = async (req, res, body, me) => {
    const mine = Object.entries(db.refs).filter(([, r]) => r.by === me).map(([u, r]) => ({ name: nameOf(u), at: r.at, qualified: !!r.qualified, hours: Math.floor((st(u).play || 0) / 60), minutes: Math.round(st(u).play || 0) }));
    const joined = (db.users[me] || {}).joined || 0, inv = db.refs[me];
    const earned = mine.filter(r => r.qualified).length * REF_BY + Object.entries(REF_BONUS).filter(([n]) => mine.filter(r => r.qualified).length >= Number(n)).reduce((a, [, c]) => a + c, 0);
    send(res, 200, { code: nameOf(me), link: `${PUBLIC_URL}/?ref=${encodeURIComponent(nameOf(me))}`, refs: mine.sort((a, b) => b.at - a.at), earned,
      invitedBy: inv ? nameOf(inv.by) : null, invitedQualified: !!(inv && inv.qualified), canClaim: !inv && now() - joined < 14 * 864e5,
      rewards: { newPlayer: REF_NEW, you: REF_BY, hours: REF_HOURS, bonus: REF_BONUS }, myMinutes: Math.round(st(me).play || 0) });
  };
  routes['POST /refer/claim'] = async (req, res, body, me) => {
    if (db.refs[me]) return fail(res, 400, 'You already used an invite');
    if (now() - ((db.users[me] || {}).joined || 0) > 14 * 864e5) return fail(res, 400, 'Invites only work in your first 14 days');
    const by = user(body.code); if (!by || by === me) return fail(res, 404, 'No Kyoto player with that name');
    if (db.refs[by] && db.refs[by].by === me) return fail(res, 400, 'You invited them!');
    db.refs[me] = { by, at: now(), qualified: false };
    SOCIAL.note(by, 'referral', `${nameOf(me)} joined with your invite! You both get coins once they've played an hour.`);
    checkReferral(me); save(); send(res, 200, { ok: true, by: nameOf(by) });
  };

  /* ================================================================ status page ================================================================ */
  const started = now();
  db.statusHist = db.statusHist || [];
  db.incidents = db.incidents || [];
  let lag = 0;
  (function measure() { const t = process.hrtime.bigint(); setImmediate(() => { lag = lag * .8 + Number(process.hrtime.bigint() - t) / 1e6 * .2; setTimeout(measure, 2000).unref(); }); })();
  setInterval(() => { db.statusHist.push({ t: now(), on: onlineCount(), lag: Math.round(lag * 10) / 10, mem: Math.round(process.memoryUsage().rss / 1048576) }); if (db.statusHist.length > 2016) db.statusHist.shift(); save(); }, 5 * 60000).unref();
  routes['GET /status/info'] = async (req, res) => {
    const d = discordInfo(), mem = Math.round(process.memoryUsage().rss / 1048576);
    let links = null; try { links = JSON.parse(fs.readFileSync(path.join(__dirname, 'jars', 'links.json'), 'utf8')); } catch (e) { /* none */ }
    const latest = links ? Object.entries(links).map(([mc, x]) => ({ mc, version: x.version }))[0] : null;
    const comps = [
      { id: 'api', name: 'Kyoto API', state: lag < 200 ? 'up' : 'degraded', detail: `${Math.round(lag)} ms event loop delay` },
      { id: 'hub', name: 'Hub chat + DMs', state: 'up', detail: `${H.chat.length} recent messages` },
      { id: 'voice', name: 'Voice + Live Rooms', state: 'up', detail: `${SOCIAL.voiceCount ? SOCIAL.voiceCount() : 0} voice rooms open` },
      { id: 'store', name: 'Store + Locker', state: 'up', detail: `${H.posts.filter(p => isListing(p) && !p.pending).length} items` },
      { id: 'discord', name: 'Discord bridge', state: !d.configured ? 'off' : d.lastError ? 'degraded' : 'up', detail: !d.configured ? 'Not set up' : d.lastError || 'Messages flowing both ways' },
      { id: 'downloads', name: 'Mod downloads', state: latest ? 'up' : 'degraded', detail: latest ? `Kyoto ${latest.version} for ${latest.mc}` : 'No release listed' },
      { id: 'storage', name: 'Data storage', state: 'up', detail: process.env.DATABASE_URL ? 'Database' : 'Render disk (wiped on redeploy)' }
    ];
    const worst = comps.some(c => c.state === 'down') ? 'down' : comps.some(c => c.state === 'degraded') ? 'degraded' : 'up';
    const open = db.incidents.filter(i => !i.resolved);
    send(res, 200, { overall: open.some(i => i.level === 'major') ? 'down' : open.length ? 'degraded' : worst, started, uptime: now() - started, online: onlineCount(), users: Object.keys(db.users).length, mem, lag: Math.round(lag),
      components: comps, history: db.statusHist.filter(h => h.t > now() - 7 * 864e5), incidents: db.incidents.slice(-20).reverse(), latest, owner: false });
  };
  routes['POST /status/incident'] = async (req, res, body, me) => {
    if (!isOwnerUuid(me) && !isStaff(me)) return fail(res, 403, 'Staff only');
    if (body.resolve) { const i = db.incidents.find(x => x.id === Number(body.resolve)); if (i) { i.resolved = now(); i.updates.push({ at: now(), text: clean(body.text, 300) || 'Resolved' }); } }
    else { const title = clean(body.title, 80); if (!title) return fail(res, 400, 'Title?'); db.incidents.push({ id: H.seq++, title, level: body.level === 'major' ? 'major' : 'minor', at: now(), resolved: 0, updates: [{ at: now(), text: clean(body.text, 300) }] }); }
    save(); send(res, 200, { ok: true });
  };

  return { statsOf, levelOf, ACH };
};
