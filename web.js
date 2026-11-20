// Kyoto website extras: Kyoto Wrapped, profile analytics, custom profile URLs, profile widgets + guestbook, badges,
// events calendar, creator program + creator codes + affiliate stats, dev log (blog), feedback board, bug reports,
// the public API (/api/v1/...) and Discord/Twitter embed cards for shared links.
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function web(ctx) {
  const { routes, db, H, send, fail, clean, nameOf, byName, isStaff, isBanned, isOwnerUuid, isPlus, checkText, slowmode, save, q,
    presence, isOnline, COMMUNITY, PUBLIC_URL, list, notifyStaff } = ctx;
  const now = () => Date.now();
  const day = (t = now()) => new Date(t).toISOString().slice(0, 10);
  let seq = db.webSeq || 1; const nextId = () => { db.webSeq = ++seq; return seq; };
  const hostOf = s => String(s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:25565$/, '').replace(/^(play|mc|join|hub)\./, '');

  /* ================================================================ custom profile URLs (kyoto-server.onrender.com/hef) ================================================================ */
  db.slugs = db.slugs || {}; // slug -> uuid
  const RESERVED = new Set(['edit', 'mod', 'u', 'download', 'features', 'profile', 'news', 'changelog', 'store', 'cosmetics', 'hub', 'rooms', 'studio', 'creators', 'creator', 'leaderboards', 'skins',
    'wishlist', 'invite', 'status', 'card', 'achievements', 'overlay', 'builder', 'build', 'timelapse', 'wrapped', 'badges', 'events', 'blog', 'feedback', 'bug', 'bugs', 'docs', 'api', 'me', 'admin',
    'login', 'logout', 'assets', 'img', 'media', 'o', 'creator-program', 'help', 'support', 'kyoto', 'staff', 'settings', 'terms', 'privacy', 'about']);
  const slugOf = u => { for (const [s, x] of Object.entries(db.slugs)) if (x === u) return s; return ''; };
  const bySlug = s => db.slugs[String(s || '').toLowerCase()] || null;
  routes['POST /me/slug'] = async (req, res, body, me) => {
    const s = String(body.slug || '').toLowerCase().trim();
    for (const [k, v] of Object.entries(db.slugs)) if (v === me) delete db.slugs[k];
    if (!s) { save(); return send(res, 200, { slug: '' }); }
    if (!/^[a-z0-9_]{3,16}$/.test(s)) return fail(res, 400, '3-16 letters, numbers or _');
    if (RESERVED.has(s)) return fail(res, 400, 'That one is taken by a Kyoto page');
    if (db.slugs[s] && db.slugs[s] !== me) return fail(res, 409, 'Someone already has that one');
    const other = byName(s); if (other && other !== me) return fail(res, 409, 'That\'s another player\'s name');
    if (!checkText(res, me, s)) return;
    db.slugs[s] = me; save();
    send(res, 200, { slug: s, url: PUBLIC_URL + '/' + s });
  };
  routes['GET /slug'] = async (req, res) => {
    const u = bySlug(q(req).get('s')) || byName(q(req).get('s'));
    if (!u || !db.profiles[u]) return fail(res, 404, 'No profile');
    send(res, 200, { name: nameOf(u) });
  };

  /* ================================================================ profile analytics ================================================================ */
  db.analytics = db.analytics || {}; // uuid -> { days: {date: n}, refs: {host: n}, uniq: {date: [hashes]} }
  function onView(uuid, req) {
    const a = db.analytics[uuid] = db.analytics[uuid] || { days: {}, refs: {}, uniq: {} };
    const d = day(); a.days[d] = (a.days[d] || 0) + 1;
    let ref = ''; try { ref = new URL(req.headers.referer || '').hostname.replace(/^www\./, ''); } catch (e) { /* none */ }
    const self = (() => { try { return new URL(PUBLIC_URL).hostname; } catch (e) { return ''; } })();
    const key = !ref ? 'Direct / apps' : ref === self ? 'Kyoto website' : /discord/.test(ref) ? 'Discord' : /tiktok/.test(ref) ? 'TikTok' : /youtube|youtu\.be/.test(ref) ? 'YouTube' : /twitter|x\.com|t\.co/.test(ref) ? 'X / Twitter' : /instagram/.test(ref) ? 'Instagram' : /google/.test(ref) ? 'Google' : ref;
    a.refs[key] = (a.refs[key] || 0) + 1;
    // rough unique visitors: hashed ip per day (not stored as ip)
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0];
    const h = require('crypto').createHash('sha1').update(ip + d + uuid).digest('hex').slice(0, 10);
    const uq = a.uniq[d] = a.uniq[d] || []; if (!uq.includes(h) && uq.length < 5000) uq.push(h);
    // keep 60 days
    for (const k of Object.keys(a.days)) if (k < day(now() - 60 * 86400000)) { delete a.days[k]; delete a.uniq[k]; }
  }
  routes['GET /me/analytics'] = async (req, res, body, me) => {
    const a = db.analytics[me] || { days: {}, refs: {}, uniq: {} }, p = db.profiles[me] || {};
    const days = []; for (let i = 29; i >= 0; i--) { const d = day(now() - i * 86400000); days.push({ d, views: a.days[d] || 0, people: (a.uniq[d] || []).length }); }
    const st = COMMUNITY.statsOf(me);
    send(res, 200, { total: p.views || 0, days, refs: Object.entries(a.refs).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => ({ from: k, n })),
      followers: st.followers, guestbook: ((db.guestbook || {})[me] || []).length, slug: slugOf(me), widgets: widgetsOf(me) });
  };

  /* ================================================================ server time (for Wrapped + the server widget) ================================================================ */
  db.serverTime = db.serverTime || {}; // uuid -> { host: minutes }
  setInterval(() => {
    let changed = false;
    for (const [u, p] of presence) {
      if (!isOnline(u)) continue;
      const h = hostOf(p.server); if (!h || !h.includes('.')) continue;
      const m = db.serverTime[u] = db.serverTime[u] || {}; m[h] = (m[h] || 0) + 1; changed = true;
    }
    if (changed) save();
  }, 60000).unref();
  const topServers = u => Object.entries(db.serverTime[u] || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([host, mins]) => ({ host, mins }));

  /* ================================================================ profile widgets + guestbook ================================================================ */
  db.widgets = db.widgets || {}; db.guestbook = db.guestbook || {};
  const widgetsOf = u => Object.assign({ spotify: true, server: true, discord: true, guestbook: true, visualizer: true }, db.widgets[u] || {});
  routes['POST /me/widgets'] = async (req, res, body, me) => {
    const w = widgetsOf(me);
    for (const k of ['spotify', 'server', 'discord', 'guestbook', 'visualizer']) if (k in body) w[k] = !!body[k];
    db.widgets[me] = w; save(); send(res, 200, w);
  };
  routes['GET /profile-extras'] = async (req, res, body, me) => {
    const u = byName(q(req).get('name')) || bySlug(q(req).get('name')); if (!u) return fail(res, 404, 'No profile');
    const w = widgetsOf(u), p = presence.get(u), on = isOnline(u), prof = db.profiles[u] || {};
    const out = { name: nameOf(u), slug: slugOf(u), widgets: w, mine: me === u };
    if (w.spotify && on && p && p.song) out.music = { title: p.song, artist: p.artist || '' };
    if (w.server) {
      const st = COMMUNITY.statsOf(u);
      out.server = { online: on, playing: on && p ? hostOf(p.server) : '', hours: st.hours, days: st.days, top: topServers(u).slice(0, 3), level: COMMUNITY.levelOf(u).lvl };
    }
    if (w.discord && prof.discord && prof.showDiscord !== false) out.discord = { name: prof.discord.username, id: prof.discord.id || '', avatar: prof.discord.avatar || '' };
    if (w.guestbook) out.guestbook = (db.guestbook[u] || []).slice(-40).reverse().map(g => ({ id: g.id, name: nameOf(g.by), text: g.text, at: g.at, mine: g.by === me }));
    send(res, 200, out);
  };
  routes['POST /guestbook'] = async (req, res, body, me) => {
    const u = byName(body.name) || bySlug(body.name); if (!u) return fail(res, 404, 'No profile');
    if (!widgetsOf(u).guestbook) return fail(res, 403, 'This guestbook is closed');
    const text = clean(body.text, 200); if (!text) return fail(res, 400, 'Write something');
    if (!checkText(res, me, text)) return;
    if (slowmode(me + 'gb' + u, 10 * 60000)) return fail(res, 429, 'You can sign each guestbook every 10 minutes');
    const l = db.guestbook[u] = db.guestbook[u] || [];
    l.push({ id: nextId(), by: me, text, at: now() }); if (l.length > 300) l.shift();
    save(); send(res, 200, { ok: true });
  };
  routes['POST /guestbook/delete'] = async (req, res, body, me) => {
    const u = byName(body.name) || bySlug(body.name); const l = db.guestbook[u] || [];
    const g = l.find(x => x.id === Number(body.id)); if (!g) return fail(res, 404, 'Gone');
    if (g.by !== me && u !== me && !isStaff(me)) return fail(res, 403, 'Not yours');
    db.guestbook[u] = l.filter(x => x !== g); save(); send(res, 200, { ok: true });
  };

  /* ================================================================ Kyoto Wrapped ================================================================ */
  routes['GET /wrapped'] = async (req, res, body, me) => {
    const u = byName(q(req).get('name')) || bySlug(q(req).get('name')) || me; if (!u || !db.users[u]) return fail(res, 404, 'No Kyoto player with that name');
    const st = COMMUNITY.statsOf(u), L = COMMUNITY.levelOf(u);
    const all = Object.keys(db.users).filter(x => !isBanned(x)).map(x => COMMUNITY.statsOf(x).play);
    const rankPct = all.length ? Math.max(1, Math.round(all.filter(p => p > st.play).length / all.length * 100)) : 100;
    const ach = Object.keys(L.got || {}).map(id => { const a = COMMUNITY.ACH.find(x => x[0] === id); return a ? { id, name: a[1], points: a[3], icon: a[4] } : null; }).filter(Boolean);
    send(res, 200, { name: nameOf(u), year: new Date().getFullYear(), hours: st.hours, minutes: st.play, days: st.days, nights: st.nights, msgs: st.msgs, friends: st.friends,
      streakBest: st.streakBest, gifts: st.gifts, trades: st.trades, owned: st.owned, sales: st.sales, followers: st.followers, level: L.lvl, topPct: rankPct,
      servers: topServers(u), achievements: ach.slice(-6), achCount: ach.length, coins: (db.coins || {})[u] || 0, joined: st.joined, plus: st.plus,
      daily: ((db.daily || {})[u] || {}).streak || 0, challenges: ((db.weekly || {})[u] || {}).done ? (db.weekly[u].done.length) : 0 });
  };

  /* ================================================================ badges ================================================================ */
  routes['GET /badges'] = async (req, res) => {
    const users = Object.keys(db.users).filter(u => !isBanned(u)), total = Math.max(1, users.length);
    const count = f => users.filter(f).length;
    const special = [
      ['owner', 'Owner', 'Made Kyoto Client', 'crown', count(isOwnerUuid)],
      ['staff', 'Staff', 'Keeps the Hub nice', 'shield', count(u => isStaff(u) && !isOwnerUuid(u))],
      ['plus', 'Kyoto+', 'Supports Kyoto', 'sparkles', count(isPlus)],
      ['creator', 'Creator', 'In the Kyoto Creator Program', 'star', Object.values(db.creatorProgram || {}).filter(c => c.approved).length],
      ['early', 'Early player', 'Joined in Kyoto\'s first months', 'rocket', count(u => (db.users[u].joined || now()) < new Date('2026-12-01').getTime())],
      ['discord', 'Linked Discord', 'Verified their Discord', 'discord', count(u => db.profiles[u] && db.profiles[u].discord)],
    ].map(([id, name, how, icon, n]) => ({ id, name, how, icon, n, pct: Math.round(n / total * 1000) / 10 }));
    const ach = COMMUNITY.ACH.map(a => { const n = count(u => { try { return a[5](COMMUNITY.statsOf(u)); } catch (e) { return false; } }); return { id: a[0], name: a[1], how: a[2], points: a[3], icon: a[4], n, pct: Math.round(n / total * 1000) / 10 }; });
    send(res, 200, { players: total, special, achievements: ach.sort((a, b) => a.pct - b.pct) });
  };

  /* ================================================================ events calendar ================================================================ */
  db.events = db.events || [];
  const canHost = u => isStaff(u) || isPlus(u) || ((db.creatorProgram || {})[u] || {}).approved;
  const eventOut = (e, me) => ({ id: e.id, title: e.title, desc: e.desc, start: e.start, end: e.end, server: e.server, kind: e.kind, host: nameOf(e.host), going: e.rsvp.length, me: e.rsvp.includes(me), mine: e.host === me, official: isStaff(e.host) });
  routes['GET /events'] = async (req, res, body, me) => {
    const from = now() - 6 * 3600000;
    send(res, 200, { events: db.events.filter(e => e.end > from).sort((a, b) => a.start - b.start).slice(0, 80).map(e => eventOut(e, me)), canHost: !!me && canHost(me) });
  };
  routes['POST /events'] = async (req, res, body, me) => {
    if (!canHost(me)) return fail(res, 403, 'Kyoto+ members, creators and staff can post events');
    const title = clean(body.title, 60), desc = clean(body.desc, 400), server = clean(body.server, 60);
    const start = Number(body.start), end = Number(body.end) || start + 3600000;
    if (!title || !start || start < now() - 3600000 || start > now() + 120 * 86400000 || end <= start) return fail(res, 400, 'Check the name and time');
    if (!checkText(res, me, title + ' ' + desc)) return;
    const kind = ['build', 'pvp', 'party', 'contest', 'stream', 'other'].includes(body.kind) ? body.kind : 'other';
    db.events.push({ id: nextId(), title, desc, server, kind, start, end: Math.min(end, start + 24 * 3600000), host: me, rsvp: [me], at: now() });
    if (db.events.length > 400) db.events.shift();
    save(); send(res, 200, { ok: true });
  };
  routes['POST /events/rsvp'] = async (req, res, body, me) => {
    const e = db.events.find(x => x.id === Number(body.id)); if (!e) return fail(res, 404, 'Gone');
    e.rsvp = e.rsvp.includes(me) ? e.rsvp.filter(x => x !== me) : e.rsvp.concat(me); save(); send(res, 200, { going: e.rsvp.length, me: e.rsvp.includes(me) });
  };
  routes['POST /events/delete'] = async (req, res, body, me) => {
    const e = db.events.find(x => x.id === Number(body.id)); if (!e) return fail(res, 404, 'Gone');
    if (e.host !== me && !isStaff(me)) return fail(res, 403, 'Not yours');
    db.events = db.events.filter(x => x !== e); save(); send(res, 200, { ok: true });
  };
  routes['GET /events/ics'] = async (req, res) => {
    const z = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kyoto//Events//EN'];
    for (const e of db.events.filter(x => x.end > now())) lines.push('BEGIN:VEVENT', 'UID:kyoto-' + e.id, 'DTSTAMP:' + z(e.at || now()), 'DTSTART:' + z(e.start), 'DTEND:' + z(e.end), 'SUMMARY:' + e.title.replace(/[,;\n]/g, ' '), 'DESCRIPTION:' + (e.desc + (e.server ? ' · ' + e.server : '')).replace(/[,;\n]/g, ' '), 'END:VEVENT');
    lines.push('END:VCALENDAR');
    send(res, 200, lines.join('\r\n'), 'text/calendar');
  };

  /* ================================================================ creator program + creator codes + affiliate stats ================================================================ */
  db.creatorProgram = db.creatorProgram || {}; // uuid -> { approved, code, links, why, at }
  db.supporting = db.supporting || {}; // uuid -> creator uuid (their creator code)
  db.codeStats = db.codeStats || {}; // creator uuid -> { uses, coins, days: {date: n} }
  const codeOwner = c => { c = String(c || '').toUpperCase(); for (const [u, p] of Object.entries(db.creatorProgram)) if (p.approved && p.code === c) return u; return null; };
  routes['GET /creator/program'] = async (req, res, body, me) => {
    const p = me ? db.creatorProgram[me] : null, sup = me ? db.supporting[me] : null;
    send(res, 200, { me: p ? { approved: !!p.approved, code: p.code || '', at: p.at, denied: !!p.denied } : null, supporting: sup ? { name: nameOf(sup), code: (db.creatorProgram[sup] || {}).code || '' } : null,
      creators: Object.entries(db.creatorProgram).filter(([, p]) => p.approved).map(([u, p]) => ({ name: nameOf(u), code: p.code, supporters: Object.values(db.supporting).filter(x => x === u).length })).sort((a, b) => b.supporters - a.supporters).slice(0, 30) });
  };
  routes['POST /creator/apply'] = async (req, res, body, me) => {
    const links = clean(body.links, 300), why = clean(body.why, 500);
    if (!links || !why) return fail(res, 400, 'Add your links and a few words about what you make');
    if (!checkText(res, me, links + ' ' + why)) return;
    const old = db.creatorProgram[me];
    if (old && old.approved) return fail(res, 400, 'You\'re already a Kyoto creator');
    db.creatorProgram[me] = { approved: false, links, why, followers: clean(body.followers, 40), at: now() };
    save();
    if (notifyStaff) notifyStaff(`New creator application from ${nameOf(me)}: ${links}`);
    send(res, 200, { ok: true });
  };
  routes['GET /creator/apps'] = async (req, res, body, me) => {
    if (!isStaff(me)) return fail(res, 403, 'Staff only');
    send(res, 200, { apps: Object.entries(db.creatorProgram).filter(([, p]) => !p.approved && !p.denied).map(([u, p]) => ({ name: nameOf(u), links: p.links, why: p.why, followers: p.followers, at: p.at })) });
  };
  routes['POST /creator/decide'] = async (req, res, body, me) => {
    if (!isStaff(me)) return fail(res, 403, 'Staff only');
    const u = byName(body.name); const p = u && db.creatorProgram[u]; if (!p) return fail(res, 404, 'No application');
    if (body.ok) { p.approved = true; p.denied = false; let code = String(body.code || nameOf(u)).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 16); while (codeOwner(code) && codeOwner(code) !== u) code += Math.floor(Math.random() * 10); p.code = code; }
    else { p.denied = true; }
    save(); send(res, 200, { ok: true, code: p.code || '' });
  };
  routes['POST /creator/code'] = async (req, res, body, me) => { // change your own code
    const p = db.creatorProgram[me]; if (!p || !p.approved) return fail(res, 403, 'Only Kyoto creators have a code');
    const c = String(body.code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (c.length < 3 || c.length > 16) return fail(res, 400, '3-16 letters or numbers');
    if (codeOwner(c) && codeOwner(c) !== me) return fail(res, 409, 'Someone has that code');
    if (!checkText(res, me, c)) return;
    p.code = c; save(); send(res, 200, { code: c });
  };
  routes['POST /creator/support'] = async (req, res, body, me) => { // "Support a creator": enter their code
    if (!body.code) { delete db.supporting[me]; save(); return send(res, 200, { supporting: null }); }
    const u = codeOwner(body.code); if (!u) return fail(res, 404, 'No creator with that code');
    if (u === me) return fail(res, 400, 'That\'s your own code');
    const first = db.supporting[me] !== u;
    db.supporting[me] = u;
    if (first) { const s = db.codeStats[u] = db.codeStats[u] || { uses: 0, coins: 0, days: {} }; s.uses++; s.days[day()] = (s.days[day()] || 0) + 1; }
    save(); send(res, 200, { supporting: { name: nameOf(u), code: db.creatorProgram[u].code } });
  };
  routes['GET /creator/stats'] = async (req, res, body, me) => { // affiliate stats
    const p = db.creatorProgram[me]; if (!p || !p.approved) return fail(res, 403, 'Only Kyoto creators have stats');
    const s = db.codeStats[me] || { uses: 0, coins: 0, days: {} }, st = COMMUNITY.statsOf(me), a = db.analytics[me] || { days: {} };
    const days = []; for (let i = 29; i >= 0; i--) { const d = day(now() - i * 86400000); days.push({ d, uses: s.days[d] || 0, views: a.days[d] || 0 }); }
    send(res, 200, { code: p.code, supporters: Object.values(db.supporting).filter(x => x === me).length, uses: s.uses, coins: s.coins, sales: st.sales, followers: st.followers, refs: st.refs, views: (db.profiles[me] || {}).views || 0, days });
  };
  // 5% of what supporters spend in the Store goes to their creator (paid by Kyoto, not taken from anyone)
  const oldGet = routes['POST /store/get'];
  if (oldGet) routes['POST /store/get'] = async (req, res, body, me) => {
    const before = (db.coins || {})[me] || 0;
    await oldGet(req, res, body, me);
    const spent = before - ((db.coins || {})[me] || 0), c = db.supporting[me];
    if (spent > 0 && c && db.creatorProgram[c] && db.creatorProgram[c].approved) {
      const bonus = Math.max(1, Math.floor(spent * 0.05));
      db.coins[c] = (db.coins[c] || 0) + bonus;
      const s = db.codeStats[c] = db.codeStats[c] || { uses: 0, coins: 0, days: {} }; s.coins += bonus; save();
    }
  };

  /* ================================================================ blog / dev log ================================================================ */
  db.blog = db.blog || [];
  const postOut = (p, full) => ({ id: p.id, title: p.title, tags: p.tags, at: p.at, by: nameOf(p.by), cover: p.cover || '', excerpt: p.body.replace(/[#*_>`\[\]]/g, '').slice(0, 180), body: full ? p.body : undefined, likes: (p.likes || []).length });
  routes['GET /blog'] = async (req, res) => send(res, 200, { posts: db.blog.slice().sort((a, b) => b.at - a.at).slice(0, 50).map(p => postOut(p)) });
  routes['GET /blog/one'] = async (req, res, body, me) => { const p = db.blog.find(x => x.id === Number(q(req).get('id'))); if (!p) return fail(res, 404, 'No post'); send(res, 200, Object.assign(postOut(p, true), { liked: (p.likes || []).includes(me), canEdit: isStaff(me) })); };
  routes['POST /blog'] = async (req, res, body, me) => {
    if (!isStaff(me)) return fail(res, 403, 'Staff only');
    const title = clean(body.title, 90), text = String(body.body || '').slice(0, 20000);
    if (!title || !text.trim()) return fail(res, 400, 'Title and text please');
    const tags = String(body.tags || '').split(',').map(t => clean(t, 20)).filter(Boolean).slice(0, 5);
    const cover = /^https:\/\/[^\s"'<>]{4,300}$/.test(String(body.cover || '')) ? String(body.cover) : '';
    if (body.id) { const p = db.blog.find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'No post'); Object.assign(p, { title, body: text, tags, cover }); }
    else db.blog.push({ id: nextId(), title, body: text, tags, cover, by: me, at: now(), likes: [] });
    save(); send(res, 200, { ok: true });
  };
  routes['POST /blog/delete'] = async (req, res, body, me) => { if (!isStaff(me)) return fail(res, 403, 'Staff only'); db.blog = db.blog.filter(x => x.id !== Number(body.id)); save(); send(res, 200, { ok: true }); };
  routes['POST /blog/like'] = async (req, res, body, me) => { const p = db.blog.find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'No post'); p.likes = (p.likes || []).includes(me) ? p.likes.filter(x => x !== me) : (p.likes || []).concat(me); save(); send(res, 200, { likes: p.likes.length, liked: p.likes.includes(me) }); };

  /* ================================================================ feedback board ================================================================ */
  db.feedback = db.feedback || [];
  const STATUSES = ['open', 'planned', 'working', 'done', 'no'];
  const fbOut = (f, me) => ({ id: f.id, title: f.title, text: f.text, cat: f.cat, status: f.status, at: f.at, by: nameOf(f.by), votes: f.votes.length, voted: f.votes.includes(me), mine: f.by === me,
    replies: (f.replies || []).map(r => ({ name: nameOf(r.by), staff: isStaff(r.by), text: r.text, at: r.at })) });
  routes['GET /feedback'] = async (req, res, body, me) => {
    const st = q(req).get('status') || '', cat = q(req).get('cat') || '', sort = q(req).get('sort') || 'top';
    let l = db.feedback.filter(f => (!st || f.status === st) && (!cat || f.cat === cat));
    l.sort(sort === 'new' ? (a, b) => b.at - a.at : (a, b) => b.votes.length - a.votes.length || b.at - a.at);
    const counts = {}; for (const s of STATUSES) counts[s] = db.feedback.filter(f => f.status === s).length;
    send(res, 200, { items: l.slice(0, 100).map(f => fbOut(f, me)), counts, staff: !!me && isStaff(me) });
  };
  routes['POST /feedback'] = async (req, res, body, me) => {
    const title = clean(body.title, 80), text = clean(body.text, 600), cat = ['mod', 'website', 'launcher', 'studio', 'hub', 'other'].includes(body.cat) ? body.cat : 'other';
    if (!title) return fail(res, 400, 'Give it a title');
    if (!checkText(res, me, title + ' ' + text)) return;
    if (slowmode(me + 'fb', 60000)) return fail(res, 429, 'One idea a minute');
    db.feedback.push({ id: nextId(), title, text, cat, status: 'open', by: me, votes: [me], at: now(), replies: [] });
    if (db.feedback.length > 2000) db.feedback.shift();
    save(); send(res, 200, { ok: true });
  };
  routes['POST /feedback/vote'] = async (req, res, body, me) => { const f = db.feedback.find(x => x.id === Number(body.id)); if (!f) return fail(res, 404, 'Gone'); f.votes = f.votes.includes(me) ? f.votes.filter(x => x !== me) : f.votes.concat(me); save(); send(res, 200, { votes: f.votes.length, voted: f.votes.includes(me) }); };
  routes['POST /feedback/status'] = async (req, res, body, me) => { if (!isStaff(me)) return fail(res, 403, 'Staff only'); const f = db.feedback.find(x => x.id === Number(body.id)); if (!f || !STATUSES.includes(body.status)) return fail(res, 400, 'Bad'); f.status = body.status; save(); send(res, 200, { ok: true }); };
  routes['POST /feedback/reply'] = async (req, res, body, me) => {
    const f = db.feedback.find(x => x.id === Number(body.id)); if (!f) return fail(res, 404, 'Gone');
    const text = clean(body.text, 400); if (!text || !checkText(res, me, text)) return text ? undefined : fail(res, 400, 'Empty');
    if (slowmode(me + 'fbr', 10000)) return fail(res, 429, 'Slow down');
    (f.replies = f.replies || []).push({ by: me, text, at: now() }); if (f.replies.length > 60) f.replies.shift(); save(); send(res, 200, { ok: true });
  };
  routes['POST /feedback/delete'] = async (req, res, body, me) => { const f = db.feedback.find(x => x.id === Number(body.id)); if (!f) return fail(res, 404, 'Gone'); if (f.by !== me && !isStaff(me)) return fail(res, 403, 'Not yours'); db.feedback = db.feedback.filter(x => x !== f); save(); send(res, 200, { ok: true }); };

  /* ================================================================ bug reports (with the Crash Doctor log) ================================================================ */
  db.bugs = db.bugs || [];
  const bugRate = new Map();
  routes['POST /bugs'] = async (req, res, body, me) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0];
    const t = (bugRate.get(ip) || []).filter(x => now() - x < 3600000); if (t.length >= 6) return fail(res, 429, 'Too many reports from here, try later'); t.push(now()); bugRate.set(ip, t);
    const title = clean(body.title, 100), steps = String(body.steps || '').slice(0, 3000), log = String(body.log || '').slice(0, 200000);
    if (!title) return fail(res, 400, 'Give it a short title');
    const where = ['mod', 'launcher', 'studio', 'website', 'hub', 'other'].includes(body.where) ? body.where : 'other';
    const bug = { id: nextId(), title, steps, where, version: clean(body.version, 40), os: clean(body.os, 60), contact: clean(body.contact, 80), by: me || null, at: now(), status: 'new', hasLog: !!log };
    if (log) { try { const dir = path.join(ctx.DATA, 'bugs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, bug.id + '.txt'), log); } catch (e) { bug.hasLog = false; } }
    db.bugs.push(bug); if (db.bugs.length > 800) db.bugs.shift();
    save();
    if (notifyStaff) notifyStaff(`Bug #${bug.id} (${where}${bug.version ? ' ' + bug.version : ''}): ${title}${bug.hasLog ? ' [log attached]' : ''}`);
    send(res, 200, { ok: true, id: bug.id });
  };
  routes['GET /bugs'] = async (req, res, body, me) => { if (!isStaff(me)) return fail(res, 403, 'Staff only'); send(res, 200, { bugs: db.bugs.slice().reverse().slice(0, 200).map(b => Object.assign({}, b, { by: b.by ? nameOf(b.by) : '' })) }); };
  routes['GET /bugs/log'] = async (req, res, body, me) => { if (!isStaff(me)) return fail(res, 403, 'Staff only'); const f = path.join(ctx.DATA, 'bugs', Number(q(req).get('id')) + '.txt'); if (!fs.existsSync(f)) return fail(res, 404, 'No log'); send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain; charset=utf-8'); };
  routes['POST /bugs/status'] = async (req, res, body, me) => { if (!isStaff(me)) return fail(res, 403, 'Staff only'); const b = db.bugs.find(x => x.id === Number(body.id)); if (!b) return fail(res, 404, 'Gone'); b.status = ['new', 'seen', 'fixed', 'nope'].includes(body.status) ? body.status : b.status; save(); send(res, 200, { ok: true }); };

  /* ================================================================ public API (read-only, no key needed) ================================================================ */
  const pubPlayer = u => {
    const st = COMMUNITY.statsOf(u), L = COMMUNITY.levelOf(u), p = db.profiles[u] || {};
    return { name: nameOf(u), uuid: u, level: L.lvl, achievements: Object.keys(L.got || {}).length, hours: st.hours, friends: st.friends, followers: st.followers,
      online: isOnline(u), plus: isPlus(u), creator: !!((db.creatorProgram[u] || {}).approved), profile: p.bio !== undefined ? { displayName: p.displayName || '', bio: p.bio || '', views: p.views || 0, url: PUBLIC_URL + '/u/' + nameOf(u) } : null,
      joined: st.joined || null };
  };
  routes['GET /api/v1'] = async (req, res) => send(res, 200, { name: 'Kyoto public API', version: 1, docs: PUBLIC_URL + '/docs/api', endpoints: ['/api/v1/player/<name>', '/api/v1/stats', '/api/v1/leaderboard/<hours|level|followers|sales>', '/api/v1/events', '/api/v1/version'] });
  routes['GET /api/v1/stats'] = async (req, res) => { let online = 0; for (const u of presence.keys()) if (isOnline(u)) online++; send(res, 200, { players: Object.keys(db.users).length, online, profiles: Object.keys(db.profiles).length, cosmetics: H.posts.filter(p => p.type === 'kycos' && !p.pending).length }); };
  routes['GET /api/v1/events'] = async (req, res) => send(res, 200, { events: db.events.filter(e => e.end > now()).sort((a, b) => a.start - b.start).map(e => eventOut(e, null)) });
  routes['GET /api/v1/version'] = async (req, res) => { let links = {}; try { links = JSON.parse(fs.readFileSync(path.join(__dirname, 'jars', 'links.json'), 'utf8')); } catch (e) { /* none */ } send(res, 200, { mod: links }); };
  function apiPath(pathname, req, res) {
    let m = /^\/api\/v1\/player\/([A-Za-z0-9_]{1,16})$/.exec(pathname);
    if (m) { const u = byName(m[1]) || bySlug(m[1]); if (!u || isBanned(u)) { fail(res, 404, 'No Kyoto player with that name'); return true; } send(res, 200, pubPlayer(u)); return true; }
    m = /^\/api\/v1\/leaderboard\/(hours|level|followers|sales)$/.exec(pathname);
    if (m) {
      const k = m[1], rows = Object.keys(db.users).filter(u => !isBanned(u)).map(u => { const st = COMMUNITY.statsOf(u); return { name: nameOf(u), v: k === 'level' ? COMMUNITY.levelOf(u).lvl : st[k] }; });
      send(res, 200, { board: k, top: rows.sort((a, b) => b.v - a.v).slice(0, 50) }); return true;
    }
    return false;
  }

  /* ================================================================ embed cards (Discord, X, iMessage) ================================================================ */
  const escA = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function embedFor(pathname) {
    let m = /^\/(?:u\/)?([A-Za-z0-9_]{3,16})\/?$/.exec(pathname);
    if (m && !RESERVED.has(m[1].toLowerCase())) {
      const u = byName(m[1]) || bySlug(m[1]); const p = u && db.profiles[u];
      if (p) { const st = COMMUNITY.statsOf(u), L = COMMUNITY.levelOf(u); return { title: `${p.displayName || nameOf(u)} on Kyoto`, desc: (p.bio || `Level ${L.lvl} · ${st.hours} hours played · ${st.followers} followers`).slice(0, 180), image: `https://mc-heads.net/body/${encodeURIComponent(nameOf(u))}/240`, color: p.accent || '#ff8fd0', small: true }; }
    }
    m = /^\/(card|creator|achievements)\/([A-Za-z0-9_]{1,16})\/?$/.exec(pathname);
    if (m) { const u = byName(m[2]); if (u) { const st = COMMUNITY.statsOf(u), L = COMMUNITY.levelOf(u); return { title: `${nameOf(u)}'s Kyoto ${m[1] === 'card' ? 'card' : m[1] === 'creator' ? 'creator page' : 'achievements'}`, desc: `Level ${L.lvl} · ${Object.keys(L.got || {}).length} achievements · ${st.hours} hours played`, image: `https://mc-heads.net/body/${encodeURIComponent(nameOf(u))}/240`, small: true }; } }
    m = /^\/wrapped(?:\/([A-Za-z0-9_]{1,16}))?\/?$/.exec(pathname);
    if (m) return { title: m[1] ? `${m[1]}'s Kyoto Wrapped` : 'Kyoto Wrapped', desc: 'Your year on Kyoto: hours played, top servers, achievements and more.' };
    m = /^\/blog\/(\d+)\/?$/.exec(pathname);
    if (m) { const p = db.blog.find(x => x.id === Number(m[1])); if (p) return { title: p.title, desc: p.body.replace(/[#*_>`\[\]]/g, '').slice(0, 180), image: p.cover || '' }; }
    const fixed = { '/events': ['Kyoto events', 'Build contests, PvP nights and parties with Kyoto players.'], '/feedback': ['Kyoto feedback board', 'Vote on what Kyoto makes next.'], '/blog': ['Kyoto dev log', 'What\'s new and what\'s next for Kyoto.'],
      '/docs': ['Kyoto docs', 'How to use Kyoto Client, the launcher, Studio and the Hub.'], '/badges': ['Kyoto badges', 'Every badge and how rare it is.'], '/creator-program': ['Kyoto Creator Program', 'Make content, get a creator code, earn coins.'], '/bug': ['Report a bug', 'Something broke? Tell us.'] };
    const f = fixed[pathname.replace(/\/$/, '')]; if (f) return { title: f[0], desc: f[1] };
    return null;
  }
  /** Adds og:/twitter: tags to index.html for shared links. Returns the HTML, or null to serve the file as usual. */
  function htmlWithEmbed(html, pathname) {
    const e = embedFor(pathname); if (!e) return null;
    const img = e.image || PUBLIC_URL + '/img/og.png';
    const tags = `<meta property="og:title" content="${escA(e.title)}"><meta property="og:description" content="${escA(e.desc)}"><meta property="og:image" content="${escA(img)}"><meta property="og:url" content="${escA(PUBLIC_URL + pathname)}"><meta property="og:site_name" content="Kyoto"><meta name="theme-color" content="${escA(e.color || '#ff8fd0')}"><meta name="twitter:card" content="${e.small ? 'summary' : 'summary_large_image'}"><meta name="twitter:title" content="${escA(e.title)}"><meta name="twitter:description" content="${escA(e.desc)}"><meta name="twitter:image" content="${escA(img)}">`;
    return html.replace(/<meta property="og:[^>]*>\s*/g, '').replace(/<meta name="twitter:[^>]*>\s*/g, '').replace('</head>', tags + '\n</head>');
  }

  return { onView, bySlug, slugOf, apiPath, htmlWithEmbed, RESERVED };
};
