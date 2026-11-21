// Kyoto Hub social features (game + website):
// trades (both sides confirm), voice rooms, server reviews, looking for group, polls, stickers, status messages,
// friend streaks, group DMs, reactions + replies, pinned messages, gifts, and a small notification feed.
// Loaded by server.js after its own routes: some routes here replace older, simpler versions.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = function social(ctx) {
  const { routes, db, H, send, fail, clean, nameOf, byName, list, areFriends, isStaff, isBanned, checkText, slowmode, save, q, imgKind,
    HUB_IMG, DM_IMG, presence, isOnline, isOwnerUuid, isPlus, OWNERS, toDiscord, pushChat, isListing, PUBLIC_URL } = ctx;
  const dmKey = (a, b) => [a, b].sort().join(':');
  const now = () => Date.now();
  const DAY = (t = now()) => Math.floor(t / 864e5);
  const blockedBy = (a, b) => list(H.blocks, a).includes(b); // a blocked b

  /* ================================================================ stickers + reactions ================================================================ */
  // Pictures live in site/img/stickers/<id>.png (website) and the mod's assets (game).
  const STICKERS = ['hi', 'gg', 'lol', 'love', 'cry', 'mad', 'wow', 'cool', 'sleep', 'think', 'party', 'fire', 'yes', 'no', 'w', 'l', 'clap', 'rip', 'pog', 'brb', 'gn', 'sus', 'flex', 'shy'];
  const REACTIONS = ['heart', 'fire', 'lol', 'wow', 'sad', 'up', 'gg', 'skull'];
  const STICKER_NAMES = { hi: 'Hi!', gg: 'GG', lol: 'LOL', love: 'Love it', cry: 'Crying', mad: 'Mad', wow: 'Wow', cool: 'Cool', sleep: 'Sleepy', think: 'Hmm', party: 'Party', fire: 'Fire', yes: 'Yes', no: 'No', w: 'W', l: 'L', clap: 'Clap', rip: 'RIP', pog: 'Pog', brb: 'BRB', gn: 'Good night', sus: 'Sus', flex: 'Flex', shy: 'Shy' };
  routes['GET /stickers'] = async (req, res) => send(res, 200, { stickers: STICKERS.map(id => ({ id, name: STICKER_NAMES[id] })), reactions: REACTIONS });

  /* ================================================================ notifications ================================================================ */
  db.notes = db.notes || {};
  let noteSeq = Number(db.noteSeq) || 1;
  function note(u, kind, text, data) {
    if (!u || !db.users[u]) return;
    const l = db.notes[u] = db.notes[u] || [];
    l.push({ id: noteSeq++, at: now(), kind, text: String(text).slice(0, 160), data: data || null });
    if (l.length > 60) l.splice(0, l.length - 60);
    db.noteSeq = noteSeq; save();
  }
  routes['GET /notify'] = async (req, res, body, me) => {
    const since = Number(q(req).get('since')) || 0;
    streakWarnings(me);
    const l = (db.notes[me] || []).filter(n => n.id > since);
    send(res, 200, { notes: l, last: (db.notes[me] || []).reduce((m, n) => Math.max(m, n.id), 0) });
  };

  /* ================================================================ status messages ================================================================ */
  db.status = db.status || {};
  const MODES = ['online', 'away', 'busy', 'invisible'];
  function statusOf(u, viewer) {
    const s = db.status[u];
    let mode = s && MODES.includes(s.mode) ? s.mode : 'online', text = s ? s.text || '' : '';
    if (s && s.until && s.until < now()) { text = ''; }
    const on = isOnline(u);
    if (viewer === u) return { mode, text, online: on };
    if (!on || mode === 'invisible') mode = 'offline';
    return { mode, text, online: mode !== 'offline' };
  }
  routes['PUT /status'] = async (req, res, body, me) => {
    const mode = MODES.includes(body.mode) ? body.mode : 'online';
    const text = clean(body.text, 80);
    if (text && !checkText(res, me, text)) return;
    const hours = Number(body.hours) || 0;
    db.status[me] = { mode, text, until: hours > 0 ? now() + Math.min(168, hours) * 3600e3 : 0, at: now() };
    save(); send(res, 200, { ok: true, status: statusOf(me, me) });
  };
  routes['GET /status'] = async (req, res, body, me) => {
    const names = String(q(req).get('names') || '').split(',').slice(0, 50);
    const out = {}; for (const n of names) { const u = byName(n); if (u) out[nameOf(u)] = statusOf(u, me); }
    send(res, 200, { status: out });
  };
  routes['GET /me'] = async (req, res, body, me) => {
    const u = db.users[me] || {};
    send(res, 200, { uuid: me, name: u.name, owner: OWNERS.includes(String(u.name || '').toLowerCase()), staff: isStaff(me), plus: isPlus(me), plusUntil: (db.plus[me] || {}).until || 0,
      coins: (db.coins || {})[me] || 0, profile: db.profiles[me] || {}, status: Object.assign(statusOf(me, me), { raw: db.status[me] || null }), notes: (db.notes[me] || []).reduce((m, n) => Math.max(m, n.id), 0) });
  };

  /* ================================================================ friend streaks ================================================================ */
  // Both of you do something together on the same day (message each other, or play on the same server): +1.
  // Miss a day and it starts over. Milestones get a message in your DMs.
  H.streaks = H.streaks || {};
  const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];
  function touchStreak(me, other) {
    if (!other || me === other || !areFriends(me, other)) return;
    const key = dmKey(me, other), s = H.streaks[key] = H.streaks[key] || { n: 0, last: -9, day: -1, a: false, b: false, warned: -1 };
    const d = DAY();
    if (s.day !== d) { s.day = d; s.a = false; s.b = false; }
    if (key.startsWith(me)) s.a = true; else s.b = true;
    if (s.a && s.b && s.last !== d) {
      s.n = s.last === d - 1 ? s.n + 1 : 1; s.last = d;
      if (MILESTONES.includes(s.n)) {
        const box = H.dms[key] = H.dms[key] || [];
        box.push({ id: H.seq++, sys: true, streak: s.n, text: `${s.n} day streak with ${nameOf(me)} and ${nameOf(other)}!`, at: now() });
        note(me, 'streak', `${s.n} day streak with ${nameOf(other)}!`, { name: nameOf(other), n: s.n });
        note(other, 'streak', `${s.n} day streak with ${nameOf(me)}!`, { name: nameOf(me), n: s.n });
      }
    }
    save();
  }
  function streakOf(me, other) {
    const s = H.streaks[dmKey(me, other)]; if (!s) return { n: 0 };
    const d = DAY(), alive = s.last >= d - 1, done = s.last === d;
    const mine = s.day === d && (dmKey(me, other).startsWith(me) ? s.a : s.b), theirs = s.day === d && (dmKey(me, other).startsWith(me) ? s.b : s.a);
    const hoursLeft = 24 - (now() % 864e5) / 3600e3;
    return { n: alive ? s.n : 0, today: done, mine, theirs, risk: alive && !done && s.n >= 2 && hoursLeft < 6, hoursLeft: Math.floor(hoursLeft) };
  }
  function streakWarnings(me) {
    const d = DAY();
    for (const f of list(db.friends, me)) {
      const st = streakOf(me, f), s = H.streaks[dmKey(me, f)];
      if (st.risk && !st.mine && s && s.warnedMe !== d + ':' + me) { s.warnedMe = d + ':' + me; note(me, 'streak_risk', `Your ${st.n} day streak with ${nameOf(f)} ends in ${st.hoursLeft} h. Say hi!`, { name: nameOf(f), n: st.n }); }
    }
  }

  /* ================================================================ messages: shared shape for chat, DMs and groups ================================================================ */
  H.chatPins = H.chatPins || [];
  H.dmPins = H.dmPins || {};
  H.groups = H.groups || {};
  /** where = 'chat' | 'dm:<name>' | 'g:<id>' */
  function boxOf(me, where) {
    where = String(where || '');
    if (where === 'chat') return { kind: 'chat', get msgs() { return H.chat; }, pins: H.chatPins, canPin: isStaff(me), others: [] };
    if (where.startsWith('dm:')) {
      const other = byName(where.slice(3)); if (!other || other === me) return null;
      const key = dmKey(me, other);
      return { kind: 'dm', other, key, msgs: H.dms[key] = H.dms[key] || [], pins: H.dmPins[key] = H.dmPins[key] || [], canPin: true, others: [other] };
    }
    if (where.startsWith('g:')) {
      const g = H.groups[where.slice(2)]; if (!g || !g.members.includes(me)) return null;
      return { kind: 'g', g, msgs: g.msgs, pins: g.pins, canPin: true, others: g.members.filter(u => u !== me) };
    }
    return null;
  }
  function ensureIds(msgs) { let ch = false; for (const m of msgs) if (!m.id) { m.id = H.seq++; ch = true; } if (ch) save(); }
  const findMsg = (box, id) => box.msgs.find(m => String(m.id) === String(id));
  const who = m => m.src === 'discord' ? m.dname : nameOf(m.uuid);
  function msgOut(m, me, box) {
    const o = m.src === 'discord'
      ? { id: m.id, discord: true, name: m.dname, avatar: m.davatar || '', text: m.text || '', img: m.img || null, at: m.at }
      : { id: m.id, uuid: m.uuid, name: m.uuid ? nameOf(m.uuid) : '', owner: m.uuid ? isOwnerUuid(m.uuid) : false, staff: m.uuid ? isStaff(m.uuid) : false, plus: m.uuid ? isPlus(m.uuid) : false, text: m.text || '', img: m.img || null, at: m.at, me: m.uuid === me };
    if (m.sys) { o.sys = true; if (m.streak) o.streak = m.streak; }
    if (m.sticker) o.sticker = m.sticker;
    if (m.voice) o.voice = m.voice;
    if (m.ch) o.ch = m.ch;
    if (m.gift) o.gift = m.gift;
    if (m.trade) o.trade = m.trade;
    if (m.reply) o.reply = { id: m.reply.id, name: m.reply.dname || nameOf(m.reply.uuid), text: m.reply.text || '', sticker: m.reply.sticker || null, img: !!m.reply.img };
    if (m.re) o.re = Object.entries(m.re).filter(([, v]) => v.length).map(([r, v]) => ({ r, n: v.length, me: v.includes(me), who: v.slice(0, 8).map(nameOf) }));
    if (m.poll) {
      const p = m.poll, total = new Set(p.opts.flatMap(x => x.v)).size;
      o.poll = { q: p.q, multi: !!p.multi, ends: p.ends, closed: p.ends < now(), total, opts: p.opts.map(x => ({ t: x.t, n: x.v.length, me: x.v.includes(me) })) };
    }
    if (box && box.pins.includes(m.id)) o.pinned = true;
    return o;
  }
  function makeReply(box, id) {
    if (id == null) return null;
    const r = findMsg(box, id); if (!r) return null;
    return { id: r.id, uuid: r.uuid || null, dname: r.src === 'discord' ? r.dname : undefined, text: String(r.text || (r.poll ? 'Poll: ' + r.poll.q : '')).slice(0, 90), sticker: r.sticker || null, img: !!r.img };
  }
  /** Builds a message from {text, sticker, reply}; returns null + fails the request if it's not OK. */
  function compose(res, me, box, body, maxText = 300) {
    const sticker = body.sticker ? String(body.sticker) : null;
    if (sticker && !STICKERS.includes(sticker)) { fail(res, 400, 'Unknown sticker'); return null; }
    const text = clean(body.text, maxText);
    if (!text && !sticker) { fail(res, 400, 'Empty'); return null; }
    if (text && !checkText(res, me, text)) return null;
    if (!text && isBanned(me)) { fail(res, 403, 'You are banned from the Kyoto Hub'); return null; }
    const m = { id: H.seq++, uuid: me, text, at: now() };
    if (sticker) m.sticker = sticker;
    const rp = makeReply(box, body.reply); if (rp) m.reply = rp;
    return m;
  }
  function afterSend(me, box, m) {
    // replies + @mentions ping people
    if (m.reply && m.reply.uuid && m.reply.uuid !== me) note(m.reply.uuid, 'reply', `${nameOf(me)} replied: ${m.text || '[sticker]'}`, { where: whereOf(box, m.reply.uuid), id: m.id });
    if (box.kind === 'chat' && m.text) for (const mm of m.text.matchAll(/@([A-Za-z0-9_]{3,16})/g)) {
      const u = byName(mm[1]); if (u && u !== me && !(m.reply && m.reply.uuid === u)) note(u, 'mention', `${nameOf(me)} mentioned you in chat: ${m.text}`, { where: 'chat', id: m.id });
    }
    if (box.kind === 'dm') touchStreak(me, box.other);
    if (box.kind === 'g') { box.g.last = now(); for (const u of box.g.members) if (u !== me && (box.g.seen || {})[u] === undefined) { /* first message seen later */ } }
  }
  const whereOf = (box, viewer) => box.kind === 'chat' ? 'chat' : box.kind === 'g' ? 'g:' + box.g.id : 'dm:' + nameOf(viewer === box.other ? (box.key.split(':').find(u => u !== box.other) || '') : box.other);

  // ---- public chat (replaces the simpler versions) ----
  // Server channels: "" is General (bridged to Discord); any other value is a Minecraft server's own channel ("donutsmp.net").
  const chOf = v => { const c = normIp(String(v || '')).replace(/^(play|mc|join|hub)\./, '').slice(0, 60); return /^[a-z0-9.\-]+(:\d+)?$/.test(c) ? c : ''; };
  routes['GET /chat'] = async (req, res, body, me) => {
    const since = Number(q(req).get('since')) || 0, box = boxOf(me, 'chat'), ch = chOf(q(req).get('ch'));
    ensureIds(H.chat);
    const msgs = H.chat.filter(m => (m.ch || '') === ch && (m.at > since || (m.upd || 0) > since)).slice(-100).map(m => msgOut(m, me, box));
    const pins = ch ? [] : H.chatPins.map(id => H.chat.find(m => m.id === id)).filter(Boolean).map(m => msgOut(m, me, box));
    send(res, 200, { messages: msgs, pins, now: now(), ch });
  };
  routes['POST /chat/send'] = async (req, res, body, me) => {
    if (slowmode(me + 'chat', 1500)) return fail(res, 429, 'Slow down');
    const box = boxOf(me, 'chat'), m = compose(res, me, box, body); if (!m) return;
    const ch = chOf(body.ch); if (ch) m.ch = ch;
    pushChat(m); afterSend(me, box, m);
    if (!ch) toDiscord(m.sticker ? Object.assign({}, m, { text: (m.text ? m.text + '\n' : '') + `${PUBLIC_URL}/img/stickers/${m.sticker}.png` }) : m);
    send(res, 200, { ok: true, id: m.id });
  };
  /** Channels: General + every server people are playing on or chatting about. */
  routes['GET /chat/channels'] = async (req, res, body, me) => {
    const map = new Map();
    for (const [u, p] of presence) { const ip = chOf(p.server); if (ip && isOnline(u)) { const e = map.get(ip) || { ch: ip, online: 0, last: 0 }; e.online++; map.set(ip, e); } }
    const week = now() - 7 * 86400000;
    for (const m of H.chat) if (m.ch && m.at > week) { const e = map.get(m.ch) || { ch: m.ch, online: 0, last: 0 }; e.last = Math.max(e.last, m.at); map.set(m.ch, e); }
    const mine = presence.get(me), here = mine && isOnline(me) ? chOf(mine.server) : '';
    const list = [...map.values()].sort((a, b) => (b.ch === here) - (a.ch === here) || b.online - a.online || b.last - a.last).slice(0, 25);
    send(res, 200, { channels: [{ ch: '', name: 'General', online: 0 }].concat(list.map(e => Object.assign(e, { name: e.ch }))), here });
  };
  /* Voice messages: up to 60 s of audio (webm/ogg/opus from the browser). One every 10 s. */
  routes['POST /chat/voice'] = async (req, res, body, me) => {
    if (!checkText(res, me, 'voice message')) return;
    if (slowmode(me + 'voice', 10000)) return fail(res, 429, 'One voice message every 10 seconds');
    const buf = Buffer.from(String(body.audio || ''), 'base64');
    const isWebm = buf.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), isOgg = buf.slice(0, 4).toString() === 'OggS', isMp4 = buf.slice(4, 8).toString() === 'ftyp';
    if (!isWebm && !isOgg && !isMp4) return fail(res, 400, 'Unknown audio format');
    if (buf.length > 1200000) return fail(res, 413, 'Too long (max about a minute)');
    const id = crypto.randomBytes(9).toString('hex');
    fs.writeFileSync(path.join(HUB_IMG, 'v' + id), buf);
    const dur = Math.max(1, Math.min(60, Math.round(Number(body.dur) || 1)));
    const where = String(body.where || 'chat');
    const box = boxOf(me, where); if (!box) return fail(res, 404, 'Chat not found');
    const m = { id: H.seq++, uuid: me, text: '', at: now(), voice: { id, dur, type: isWebm ? 'webm' : isOgg ? 'ogg' : 'mp4' } };
    if (box.kind === 'chat') { const ch = chOf(body.ch); if (ch) m.ch = ch; pushChat(m); if (!ch) toDiscord(Object.assign({}, m, { text: `[voice message] ${PUBLIC_URL}/chat/voice?id=${id}` })); }
    else { box.msgs.push(m); if (box.msgs.length > 500) box.msgs.shift(); save(); }
    afterSend(me, box, m);
    send(res, 200, { ok: true, id: m.id });
  };
  routes['GET /chat/voice'] = async (req, res) => {
    const id = String(q(req).get('id') || ''); if (!/^[a-f0-9]{18}$/.test(id)) return fail(res, 400, 'bad id');
    const f = path.join(HUB_IMG, 'v' + id); if (!fs.existsSync(f)) return fail(res, 404, 'gone');
    const buf = fs.readFileSync(f);
    const type = buf.slice(0, 4).toString() === 'OggS' ? 'audio/ogg' : buf.slice(4, 8).toString() === 'ftyp' ? 'audio/mp4' : 'audio/webm';
    res.setHeader('Cache-Control', 'public, max-age=86400');
    send(res, 200, buf, type);
  };

  // ---- DMs (replaces the simpler versions) ----
  routes['GET /dm/threads'] = async (req, res, body, me) => {
    const threads = [];
    for (const [k, msgs] of Object.entries(H.dms)) {
      if (!k.includes(me) || !msgs.length) continue;
      const other = k.split(':').find(u => u !== me) || me; const last = [...msgs].reverse().find(m => !m.sys) || msgs[msgs.length - 1];
      threads.push({ name: nameOf(other), last: last.img ? '[picture]' : last.sticker ? '[sticker]' : last.gift ? '[gift]' : last.text || '', at: last.at, fromMe: last.uuid === me, streak: streakOf(me, other), status: statusOf(other, me) });
    }
    const groups = Object.values(H.groups).filter(g => g.members.includes(me)).map(g => groupSummary(g, me));
    send(res, 200, { threads: threads.sort((a, b) => b.at - a.at).slice(0, 40), groups: groups.sort((a, b) => b.at - a.at) });
  };
  routes['GET /dm/with'] = async (req, res, body, me) => {
    const other = byName(q(req).get('name')); if (!other) return fail(res, 404, 'No Kyoto player with that name');
    const box = boxOf(me, 'dm:' + nameOf(other)); ensureIds(box.msgs);
    send(res, 200, { name: nameOf(other), messages: box.msgs.slice(-80).map(m => msgOut(m, me, box)), pins: box.pins.map(id => findMsg(box, id)).filter(Boolean).map(m => msgOut(m, me, box)),
      streak: streakOf(me, other), status: statusOf(other, me), friends: areFriends(me, other) });
  };
  routes['POST /dm/send'] = async (req, res, body, me) => {
    const other = byName(body.to); if (!other) return fail(res, 404, `${body.to} hasn't used Kyoto yet`);
    if (other === me) return fail(res, 400, "That's you!");
    if (blockedBy(other, me)) return fail(res, 403, "You can't message this player");
    if (slowmode(me + 'dm', 700)) return fail(res, 429, 'Slow down');
    const box = boxOf(me, 'dm:' + nameOf(other)), m = compose(res, me, box, body); if (!m) return;
    box.msgs.push(m); if (box.msgs.length > 300) box.msgs.shift();
    afterSend(me, box, m); save(); send(res, 200, { ok: true, id: m.id, streak: streakOf(me, other) });
  };
  const oldDmImage = routes['POST /dm/image'];
  routes['POST /dm/image'] = async (req, res, body, me) => {
    await oldDmImage(req, res, body, me);
    const other = byName(body.to); if (other && res.statusCode === 200) touchStreak(me, other);
  };
  // pictures in DMs and group chats: only people in that conversation can load them
  routes['GET /dm/img'] = async (req, res, body, me) => {
    const id = String(q(req).get('id') || ''); if (!/^[a-f0-9]{18}$/.test(id)) return fail(res, 400, 'bad id');
    let ok = false;
    for (const [k, msgs] of Object.entries(H.dms)) { if (!k.includes(me)) continue; if (msgs.some(m => m.img === id)) { ok = true; break; } }
    if (!ok) for (const g of Object.values(H.groups)) if (g.members.includes(me) && g.msgs.some(m => m.img === id)) { ok = true; break; }
    if (!ok) return fail(res, 404, 'not found');
    const f = path.join(DM_IMG, id); if (!fs.existsSync(f)) return fail(res, 404, 'not found');
    const buf = fs.readFileSync(f), k = imgKind(buf);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    send(res, 200, buf, k === 'png' ? 'image/png' : k === 'gif' ? 'image/gif' : k === 'webp' ? 'image/webp' : 'image/jpeg');
  };

  // ---- reactions, pins, polls, deleting your own message: work the same everywhere ----
  routes['POST /msg/react'] = async (req, res, body, me) => {
    const box = boxOf(me, body.where); if (!box) return fail(res, 404, 'Conversation not found');
    if (isBanned(me)) return fail(res, 403, 'Banned');
    const r = String(body.r || ''); if (!REACTIONS.includes(r) && !STICKERS.includes(r)) return fail(res, 400, 'Unknown reaction');
    const m = findMsg(box, body.id); if (!m) return fail(res, 404, 'That message is gone');
    if (slowmode(me + 'react' + m.id + r, 400)) return fail(res, 429, 'Slow down');
    m.re = m.re || {};
    if (!m.re[r] && Object.keys(m.re).length >= 12) return fail(res, 400, 'Too many different reactions');
    const l = m.re[r] = m.re[r] || [];
    if (l.includes(me)) m.re[r] = l.filter(u => u !== me); else { l.push(me); if (m.uuid && m.uuid !== me && box.kind !== 'chat') { /* DMs: no ping for reactions, it shows up live */ } }
    if (!m.re[r].length) delete m.re[r];
    m.upd = now(); save(); send(res, 200, { ok: true, re: msgOut(m, me, box).re || [] });
  };
  routes['POST /msg/pin'] = async (req, res, body, me) => {
    const box = boxOf(me, body.where); if (!box) return fail(res, 404, 'Conversation not found');
    if (!box.canPin) return fail(res, 403, 'Only Kyoto staff can pin in #chat');
    const m = findMsg(box, body.id); if (!m) return fail(res, 404, 'That message is gone');
    const i = box.pins.indexOf(m.id);
    if (body.on === false || (body.on === undefined && i >= 0)) { if (i >= 0) box.pins.splice(i, 1); }
    else if (i < 0) { box.pins.push(m.id); if (box.pins.length > 25) box.pins.shift(); }
    m.upd = now();
    if (box.kind !== 'chat' && box.pins.includes(m.id)) box.msgs.push({ id: H.seq++, sys: true, text: `${nameOf(me)} pinned a message`, at: now() });
    save(); send(res, 200, { ok: true, pinned: box.pins.includes(m.id) });
  };
  routes['GET /msg/pins'] = async (req, res, body, me) => {
    const box = boxOf(me, q(req).get('where')); if (!box) return fail(res, 404, 'Conversation not found');
    send(res, 200, { pins: box.pins.map(id => findMsg(box, id)).filter(Boolean).map(m => msgOut(m, me, box)) });
  };
  routes['POST /msg/delete'] = async (req, res, body, me) => {
    const box = boxOf(me, body.where); if (!box) return fail(res, 404, 'Conversation not found');
    const m = findMsg(box, body.id); if (!m) return fail(res, 404, 'Already gone');
    if (m.uuid !== me && !(box.kind === 'chat' && isStaff(me))) return fail(res, 403, 'You can only delete your own messages');
    const i = box.msgs.indexOf(m); if (i >= 0) box.msgs.splice(i, 1);
    const pi = box.pins.indexOf(m.id); if (pi >= 0) box.pins.splice(pi, 1);
    if (m.img) try { fs.unlinkSync(box.kind === 'chat' ? path.join(HUB_IMG, 'c' + m.img) : path.join(DM_IMG, m.img)); } catch (e) { /* gone */ }
    save(); send(res, 200, { ok: true });
  };
  routes['POST /msg/poll'] = async (req, res, body, me) => {
    const box = boxOf(me, body.where); if (!box || box.kind === 'dm') return fail(res, 400, 'Polls work in #chat and group chats');
    if (slowmode(me + 'poll', isStaff(me) ? 5000 : 60000)) return fail(res, 429, 'One poll a minute');
    const question = clean(body.q, 120); if (!question) return fail(res, 400, 'Ask a question');
    const opts = (Array.isArray(body.options) ? body.options : []).map(o => clean(o, 50)).filter(Boolean).slice(0, 6);
    if (opts.length < 2) return fail(res, 400, 'A poll needs 2 to 6 answers');
    if (!checkText(res, me, question + ' ' + opts.join(' '))) return;
    const minutes = Math.max(5, Math.min(7 * 1440, Number(body.minutes) || 60));
    const m = { id: H.seq++, uuid: me, text: '', at: now(), poll: { q: question, multi: !!body.multi, ends: now() + minutes * 60000, opts: opts.map(t => ({ t, v: [] })) } };
    if (box.kind === 'chat') { pushChat(m); toDiscord(Object.assign({}, m, { text: `Poll: ${question}\n` + opts.map((o, i) => `${i + 1}. ${o}`).join('\n') + `\nVote in the Kyoto Hub: ${PUBLIC_URL}/hub` })); }
    else { box.msgs.push(m); box.g.last = now(); }
    save(); send(res, 200, { ok: true, id: m.id });
  };
  routes['POST /msg/vote'] = async (req, res, body, me) => {
    const box = boxOf(me, body.where); if (!box) return fail(res, 404, 'Conversation not found');
    const m = findMsg(box, body.id); if (!m || !m.poll) return fail(res, 404, 'That poll is gone');
    if (m.poll.ends < now()) return fail(res, 400, 'This poll has ended');
    const o = m.poll.opts[Number(body.opt)]; if (!o) return fail(res, 400, 'Bad answer');
    const had = o.v.includes(me);
    if (!m.poll.multi) for (const x of m.poll.opts) x.v = x.v.filter(u => u !== me);
    o.v = had ? o.v.filter(u => u !== me) : o.v.concat(me);
    m.upd = now(); save(); send(res, 200, { ok: true, poll: msgOut(m, me, box).poll });
  };

  /* ================================================================ group DMs ================================================================ */
  const GCOL = ['#ff8fc8', '#a98bff', '#6ee7b7', '#7cc4ff', '#ffd166', '#ff9f6e'];
  function groupSummary(g, me) {
    const last = [...g.msgs].reverse().find(m => !m.sys) || g.msgs[g.msgs.length - 1];
    return { id: g.id, group: true, name: g.name, color: g.color, owner: nameOf(g.owner), members: g.members.map(nameOf), size: g.members.length,
      last: last ? (last.sys ? last.text : (last.uuid === me ? 'You: ' : nameOf(last.uuid) + ': ') + (last.img ? '[picture]' : last.sticker ? '[sticker]' : last.poll ? 'Poll: ' + last.poll.q : last.text || '')) : 'New group', at: g.last || g.at, lfg: g.lfg || null };
  }
  function groupSys(g, text) { g.msgs.push({ id: H.seq++, sys: true, text, at: now() }); if (g.msgs.length > 400) g.msgs.shift(); g.last = now(); }
  function makeGroup(owner, name, members, extra) {
    const id = crypto.randomBytes(5).toString('hex');
    const g = Object.assign({ id, name, owner, members: [owner, ...members.filter(u => u !== owner)].slice(0, 10), msgs: [], pins: [], color: GCOL[Math.random() * GCOL.length | 0], at: now(), last: now() }, extra || {});
    H.groups[id] = g; groupSys(g, `${nameOf(owner)} made the group`);
    for (const u of g.members) if (u !== owner) note(u, 'group', `${nameOf(owner)} added you to "${g.name}"`, { where: 'g:' + id });
    save(); return g;
  }
  routes['POST /groups/create'] = async (req, res, body, me) => {
    if (isBanned(me)) return fail(res, 403, 'Banned');
    if (slowmode(me + 'gcreate', 10000)) return fail(res, 429, 'Wait a few seconds');
    if (Object.values(H.groups).filter(g => g.owner === me).length >= 15) return fail(res, 400, 'You own 15 groups already: leave or delete one');
    const name = clean(body.name, 32) || 'Group chat';
    if (!checkText(res, me, name)) return;
    const members = [];
    for (const n of (Array.isArray(body.members) ? body.members : []).slice(0, 9)) {
      const u = byName(n); if (!u) return fail(res, 404, `${n} hasn't used Kyoto yet`);
      if (!areFriends(me, u)) return fail(res, 403, `You can only add friends (${nameOf(u)} isn't your friend yet)`);
      if (blockedBy(u, me)) return fail(res, 403, `You can't add ${nameOf(u)}`);
      if (!members.includes(u)) members.push(u);
    }
    if (!members.length) return fail(res, 400, 'Add at least one friend');
    const g = makeGroup(me, name, members);
    send(res, 200, { ok: true, id: g.id });
  };
  routes['GET /groups'] = async (req, res, body, me) => send(res, 200, { groups: Object.values(H.groups).filter(g => g.members.includes(me)).map(g => groupSummary(g, me)).sort((a, b) => b.at - a.at) });
  routes['GET /groups/msgs'] = async (req, res, body, me) => {
    const box = boxOf(me, 'g:' + q(req).get('id')); if (!box) return fail(res, 404, 'Group not found (or you left it)');
    const g = box.g; ensureIds(g.msgs);
    send(res, 200, { group: { id: g.id, name: g.name, color: g.color, owner: nameOf(g.owner), me: nameOf(me), isOwner: g.owner === me, lfg: g.lfg || null, voice: g.voice || null,
      members: g.members.map(u => ({ name: nameOf(u), status: statusOf(u, me), owner: u === g.owner, friend: areFriends(me, u) })) },
      messages: g.msgs.slice(-100).map(m => msgOut(m, me, box)), pins: g.pins.map(id => findMsg(box, id)).filter(Boolean).map(m => msgOut(m, me, box)) });
  };
  routes['POST /groups/send'] = async (req, res, body, me) => {
    const box = boxOf(me, 'g:' + body.id); if (!box) return fail(res, 404, 'Group not found');
    if (slowmode(me + 'gsend', 600)) return fail(res, 429, 'Slow down');
    const m = compose(res, me, box, body); if (!m) return;
    box.msgs.push(m); if (box.msgs.length > 400) box.msgs.shift(); box.g.last = now();
    afterSend(me, box, m); save(); send(res, 200, { ok: true, id: m.id });
  };
  routes['POST /groups/image'] = async (req, res, body, me) => {
    const box = boxOf(me, 'g:' + body.id); if (!box) return fail(res, 404, 'Group not found');
    if (isBanned(me)) return fail(res, 403, 'Banned');
    if (slowmode(me + 'gimg', 4000)) return fail(res, 429, 'Slow down');
    const buf = Buffer.from(String(body.image || ''), 'base64'), kind = imgKind(buf);
    if (!kind) return fail(res, 400, 'PNG, JPG, GIF or WEBP only');
    if (buf.length > 3e6) return fail(res, 413, 'Max 3 MB');
    const img = crypto.randomBytes(9).toString('hex'); fs.writeFileSync(path.join(DM_IMG, img), buf);
    const text = clean(body.text, 300); if (text && !checkText(res, me, text)) return;
    box.msgs.push({ id: H.seq++, uuid: me, img, text, at: now() }); box.g.last = now();
    save(); send(res, 200, { ok: true });
  };
  routes['POST /groups/add'] = async (req, res, body, me) => {
    const box = boxOf(me, 'g:' + body.id); if (!box) return fail(res, 404, 'Group not found');
    const u = byName(body.name); if (!u) return fail(res, 404, `${body.name} hasn't used Kyoto yet`);
    if (!areFriends(me, u)) return fail(res, 403, 'You can only add your friends');
    if (blockedBy(u, me)) return fail(res, 403, `You can't add ${nameOf(u)}`);
    if (box.g.members.includes(u)) return fail(res, 400, 'Already in the group');
    if (box.g.members.length >= 10) return fail(res, 400, 'Groups can have 10 people');
    box.g.members.push(u); groupSys(box.g, `${nameOf(me)} added ${nameOf(u)}`); note(u, 'group', `${nameOf(me)} added you to "${box.g.name}"`, { where: 'g:' + box.g.id });
    save(); send(res, 200, { ok: true });
  };
  routes['POST /groups/kick'] = async (req, res, body, me) => {
    const box = boxOf(me, 'g:' + body.id); if (!box) return fail(res, 404, 'Group not found');
    if (box.g.owner !== me) return fail(res, 403, 'Only the group owner can remove people');
    const u = byName(body.name); if (!u || u === me || !box.g.members.includes(u)) return fail(res, 400, 'Not in the group');
    box.g.members = box.g.members.filter(x => x !== u); groupSys(box.g, `${nameOf(me)} removed ${nameOf(u)}`);
    save(); send(res, 200, { ok: true });
  };
  routes['POST /groups/leave'] = async (req, res, body, me) => {
    const box = boxOf(me, 'g:' + body.id); if (!box) return fail(res, 404, 'Group not found');
    const g = box.g; g.members = g.members.filter(u => u !== me);
    if (!g.members.length) delete H.groups[g.id];
    else { if (g.owner === me) g.owner = g.members[0]; groupSys(g, `${nameOf(me)} left${g.owner !== me ? '' : ''}`); }
    save(); send(res, 200, { ok: true });
  };
  routes['POST /groups/rename'] = async (req, res, body, me) => {
    const box = boxOf(me, 'g:' + body.id); if (!box) return fail(res, 404, 'Group not found');
    const name = clean(body.name, 32); if (!name || !checkText(res, me, name)) return name ? undefined : fail(res, 400, 'Give it a name');
    box.g.name = name; groupSys(box.g, `${nameOf(me)} renamed the group to "${name}"`);
    save(); send(res, 200, { ok: true });
  };

  /* ================================================================ friends (with status + streaks) ================================================================ */
  // Kyoto Hub tells the server which game you're in (any game, not just Minecraft)
  const hubGames = new Map(); // uuid -> { game, at }
  routes['POST /hub/presence'] = async (req, res, body, me) => {
    const game = clean(body.game, 60);
    if (game) hubGames.set(me, { game, at: Date.now() }); else hubGames.delete(me);
    send(res, 200, { ok: true });
  };
  const hubGame = u => { const h = hubGames.get(u); return h && Date.now() - h.at < 150000 ? h.game : ''; };
  routes['GET /friends'] = async (req, res, body, me) => {
    const friends = list(db.friends, me).map(u => {
      const st = statusOf(u, me), p = presence.get(u) || {}, hg = (db.status[u] || {}).mode === 'invisible' ? '' : hubGame(u);
      return { uuid: u, name: nameOf(u), online: st.online || !!hg, mode: st.online ? st.mode : (hg ? 'online' : st.mode), statusText: st.text, game: hg, server: st.online ? p.server || '' : '', join: st.online ? p.join || '' : '', calls: st.online ? !!p.calls : false, streak: streakOf(me, u) };
    });
    const incoming = Object.entries(db.requests).filter(([, tos]) => tos.includes(me)).map(([from]) => (db.users[from] || {}).name).filter(Boolean);
    const outgoing = list(db.requests, me).map(u => (db.users[u] || {}).name).filter(Boolean);
    send(res, 200, { friends, incoming, outgoing, me: statusOf(me, me) });
  };
  // presence: playing on the same server as a friend counts for your streak; remember servers you played (for reviews)
  db.played = db.played || {};
  const oldPresence = routes['POST /presence'];
  routes['POST /presence'] = async (req, res, body, me) => {
    await oldPresence(req, res, body, me);
    const srv = normIp(String(body.server || ''));
    if (srv) {
      const l = db.played[me] = db.played[me] || [];
      if (!l.includes(srv)) { l.push(srv); if (l.length > 80) l.shift(); save(); }
      for (const f of list(db.friends, me)) { const p = presence.get(f); if (p && isOnline(f) && normIp(p.server) === srv) touchStreak(me, f); }
    }
  };

  /* ================================================================ server reviews ================================================================ */
  H.servers = H.servers || {};
  const TAGS = ['Friendly', 'Good staff', 'Fair', 'Great events', 'Lots to do', 'Pay to win', 'Laggy', 'Cheaters', 'Toxic', 'Empty'];
  function normIp(ip) {
    ip = String(ip || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '').replace(/:25565$/, '');
    if (!ip || ip === 'singleplayer' || /^(localhost|127\.|10\.|192\.168\.|0\.)/.test(ip)) return '';
    return /^[a-z0-9.-]{3,80}(:\d{2,5})?$/.test(ip) && ip.includes('.') ? ip : '';
  }
  function playersOn(ip) { const out = []; for (const [u, p] of presence) if (isOnline(u) && normIp(p.server) === ip && (!db.status[u] || db.status[u].mode !== 'invisible')) out.push(u); return out; }
  function serverSum(s, me) {
    const rv = Object.values(s.reviews), n = rv.length, avg = n ? rv.reduce((a, r) => a + r.stars, 0) / n : 0;
    const tc = {}; for (const r of rv) for (const t of r.tags || []) tc[t] = (tc[t] || 0) + 1;
    return { ip: s.ip, avg: Math.round(avg * 10) / 10, count: n, online: playersOn(s.ip).length, tags: Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]), mine: me && s.reviews[me] ? s.reviews[me].stars : 0, last: Math.max(0, ...rv.map(r => r.at)) };
  }
  routes['GET /servers'] = async (req, res, body, me) => {
    const sort = q(req).get('sort') || 'top', qs = String(q(req).get('q') || '').toLowerCase().trim();
    // servers Kyoto players are on right now count too, even with no reviews yet
    const map = new Map(Object.values(H.servers).map(s => [s.ip, s]));
    for (const [u, p] of presence) { const ip = normIp(p.server); if (ip && isOnline(u) && !map.has(ip)) map.set(ip, { ip, reviews: {} }); }
    let l = [...map.values()].map(s => serverSum(s, me)).filter(s => !qs || s.ip.includes(qs));
    const score = s => s.count ? (s.avg * s.count + 3 * 3) / (s.count + 3) : 0; // fair score: few reviews pull toward 3 stars
    l.sort(sort === 'new' ? (a, b) => b.last - a.last : sort === 'online' ? (a, b) => b.online - a.online || score(b) - score(a) : (a, b) => score(b) - score(a) || b.online - a.online);
    const mine = me ? (db.played[me] || []).slice(-12).reverse() : [];
    send(res, 200, { servers: l.slice(0, 80), tags: TAGS, played: mine });
  };
  routes['GET /servers/one'] = async (req, res, body, me) => {
    const ip = normIp(q(req).get('ip')); if (!ip) return fail(res, 400, 'Not a server address');
    const s = H.servers[ip] || { ip, reviews: {} };
    const rv = Object.entries(s.reviews).map(([u, r]) => ({ name: nameOf(u), stars: r.stars, text: r.text, tags: r.tags || [], at: r.at, helpful: (r.helpful || []).length, helpedByMe: !!me && (r.helpful || []).includes(me), me: u === me, playtime: (db.played[u] || []).includes(ip) }));
    const sort = q(req).get('sort') || 'helpful';
    rv.sort(sort === 'new' ? (a, b) => b.at - a.at : sort === 'low' ? (a, b) => a.stars - b.stars || b.at - a.at : sort === 'high' ? (a, b) => b.stars - a.stars || b.at - a.at : (a, b) => b.helpful - a.helpful || b.at - a.at);
    const dist = [0, 0, 0, 0, 0]; for (const r of rv) dist[r.stars - 1]++;
    const here = playersOn(ip);
    send(res, 200, Object.assign(serverSum(s, me), { dist, reviews: rv.slice(0, 100), canReview: !!me && (db.played[me] || []).includes(ip), friendsHere: me ? here.filter(u => areFriends(me, u)).map(nameOf) : [], tagsAll: TAGS }));
  };
  routes['POST /servers/review'] = async (req, res, body, me) => {
    const ip = normIp(body.ip); if (!ip) return fail(res, 400, 'Not a server address');
    if (isBanned(me)) return fail(res, 403, 'Banned');
    if (!(db.played[me] || []).includes(ip)) return fail(res, 403, 'Play on this server with Kyoto first, then you can review it');
    const stars = Math.round(Number(body.stars)); if (!(stars >= 1 && stars <= 5)) return fail(res, 400, 'Pick 1 to 5 stars');
    const text = clean(body.text, 500); if (text && !checkText(res, me, text)) return;
    if (slowmode(me + 'review', 8000)) return fail(res, 429, 'Wait a few seconds');
    const tags = [...new Set((Array.isArray(body.tags) ? body.tags : []).filter(t => TAGS.includes(t)))].slice(0, 3);
    const s = H.servers[ip] = H.servers[ip] || { ip, reviews: {} };
    const old = s.reviews[me];
    s.reviews[me] = { stars, text, tags, at: now(), helpful: old ? old.helpful || [] : [] };
    save(); send(res, 200, { ok: true });
  };
  routes['POST /servers/review/delete'] = async (req, res, body, me) => {
    const ip = normIp(body.ip), s = H.servers[ip]; if (!s) return fail(res, 404, 'No reviews');
    const u = body.name ? byName(body.name) : me;
    if (u !== me && !isStaff(me)) return fail(res, 403, 'Not yours');
    delete s.reviews[u]; if (!Object.keys(s.reviews).length) delete H.servers[ip];
    save(); send(res, 200, { ok: true });
  };
  routes['POST /servers/helpful'] = async (req, res, body, me) => {
    const s = H.servers[normIp(body.ip)]; const u = byName(body.name); const r = s && u && s.reviews[u];
    if (!r) return fail(res, 404, 'Review gone'); if (u === me) return fail(res, 400, 'That\'s your review');
    r.helpful = r.helpful || []; r.helpful = r.helpful.includes(me) ? r.helpful.filter(x => x !== me) : r.helpful.concat(me);
    save(); send(res, 200, { ok: true, helpful: r.helpful.length });
  };
  routes['POST /servers/report'] = async (req, res, body, me) => {
    if (slowmode(me + 'report', 5000)) return fail(res, 429, 'Slow down');
    H.reports.push({ kind: 'review', id: normIp(body.ip) + '|' + String(body.name || '').slice(0, 16), by: me, reason: clean(body.reason, 100) || 'Review reported', at: now() });
    save(); send(res, 200, { ok: true });
  };

  /* ================================================================ looking for group ================================================================ */
  H.lfg = H.lfg || [];
  const GAMES = ['Bedwars', 'Skywars', 'Duels', 'SMP', 'Survival', 'Skyblock', 'Factions', 'Prison', 'Minigames', 'Parkour', 'Build Battle', 'Hardcore', 'Speedrun', 'Creative', 'Just chill'];
  const lfgOpen = () => { const t = now(); H.lfg = H.lfg.filter(p => p.exp > t && !p.closed); return H.lfg; };
  function lfgOut(p, me) {
    const st = statusOf(p.uuid, me);
    return { id: p.id, host: nameOf(p.uuid), hostOnline: st.online, game: p.game, mode: p.mode, text: p.text, server: p.server, slots: p.slots, mic: p.mic, region: p.region,
      members: p.members.map(nameOf), full: p.members.length + 1 >= p.slots, at: p.at, exp: p.exp, mine: p.uuid === me, joined: p.members.includes(me), group: (p.uuid === me || p.members.includes(me)) ? p.group : null,
      voice: (p.uuid === me || p.members.includes(me)) ? p.voice || null : null, friend: !!me && areFriends(me, p.uuid) };
  }
  routes['GET /lfg'] = async (req, res, body, me) => {
    const g = q(req).get('game') || '';
    const l = lfgOpen().filter(p => (!g || p.game === g) && !(me && blockedBy(p.uuid, me)));
    l.sort((a, b) => (b.uuid === me) - (a.uuid === me) || (me ? areFriends(me, b.uuid) - areFriends(me, a.uuid) : 0) || b.at - a.at);
    send(res, 200, { posts: l.map(p => lfgOut(p, me)), games: GAMES });
  };
  routes['POST /lfg/post'] = async (req, res, body, me) => {
    if (isBanned(me)) return fail(res, 403, 'Banned');
    if (slowmode(me + 'lfg', 20000)) return fail(res, 429, 'Wait a bit between posts');
    const game = clean(body.game, 30) || 'Just chill', mode = clean(body.mode, 30), text = clean(body.text, 160);
    if (!checkText(res, me, [game, mode, text].join(' '))) return;
    const slots = Math.max(2, Math.min(16, Math.round(Number(body.slots) || 4)));
    const minutes = Math.max(15, Math.min(240, Number(body.minutes) || 60));
    for (const p of lfgOpen()) if (p.uuid === me) p.closed = true; // one post at a time
    const p = { id: H.seq++, uuid: me, game, mode, text, server: normIp(body.server) || clean(body.server, 60), slots, mic: !!body.mic, region: clean(body.region, 12), members: [], at: now(), exp: now() + minutes * 60000 };
    if (p.mic) p.voice = makeVoiceRoom(me, `${game}${mode ? ' ' + mode : ''} (LFG)`, 'invite', p.id).id;
    H.lfg.push(p); save(); send(res, 200, { ok: true, id: p.id });
  };
  routes['POST /lfg/join'] = async (req, res, body, me) => {
    const p = lfgOpen().find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'That group is closed');
    if (p.uuid === me) return fail(res, 400, 'That\'s your post');
    if (blockedBy(p.uuid, me)) return fail(res, 403, 'You can\'t join this group');
    if (p.members.includes(me)) return send(res, 200, { ok: true, group: p.group, voice: p.voice || null });
    if (p.members.length + 1 >= p.slots) return fail(res, 400, 'It\'s full');
    p.members.push(me);
    // a group chat for everyone in it
    let g = p.group && H.groups[p.group];
    if (!g) { g = makeGroup(p.uuid, `${p.game}${p.mode ? ' · ' + p.mode : ''}`.slice(0, 32), [], { lfg: p.id, voice: p.voice || null }); p.group = g.id; }
    if (!g.members.includes(me)) { g.members.push(me); groupSys(g, `${nameOf(me)} joined from Looking For Group`); }
    if (p.server) groupSys(g, `Server: ${p.server}`);
    note(p.uuid, 'lfg', `${nameOf(me)} joined your ${p.game} group (${p.members.length + 1}/${p.slots})`, { where: 'g:' + g.id });
    if (p.members.length + 1 >= p.slots) note(p.uuid, 'lfg', `Your ${p.game} group is full!`, { where: 'g:' + g.id });
    save(); send(res, 200, { ok: true, group: g.id, voice: p.voice || null, server: p.server });
  };
  routes['POST /lfg/leave'] = async (req, res, body, me) => {
    const p = H.lfg.find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'Gone');
    p.members = p.members.filter(u => u !== me);
    const g = p.group && H.groups[p.group]; if (g) { g.members = g.members.filter(u => u !== me); groupSys(g, `${nameOf(me)} left`); }
    save(); send(res, 200, { ok: true });
  };
  routes['POST /lfg/close'] = async (req, res, body, me) => {
    const p = H.lfg.find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'Gone');
    if (p.uuid !== me && !isStaff(me)) return fail(res, 403, 'Not yours');
    p.closed = true; save(); send(res, 200, { ok: true });
  };

  /* ================================================================ cosmetics: trades + gifts ================================================================ */
  H.trades = H.trades || [];
  const itemOf = id => H.posts.find(p => p.id === Number(id) && isListing(p) && p.type !== 'pack' && !p.pending);
  const itemInfo = p => ({ id: p.id, type: p.type, title: p.title, slot: p.slot || (p.type === 'cape' ? 'cape' : ''), photos: (p.photos || []).length, gif: p.image === 'gif', price: p.price || 0, creator: nameOf(p.uuid) });
  /** Items you can give away: you got them (bought, traded, gifted), not ones you made. */
  const tradable = u => [...new Set(db.lib[u] || [])].map(itemOf).filter(p => p && p.uuid !== u);
  const ownsItem = (u, id) => (db.lib[u] || []).includes(id) || (itemOf(id) || {}).uuid === u;
  function takeOff(u, p) {
    if (p.type === 'kycos') { const k = db.kycos[u]; if (k && k.items && k.items[p.slot] === p.id) { delete k.slots[p.slot]; delete k.items[p.slot]; k.version = now(); } }
    else { const c = db.cosmetics[u]; if (c && c.capeItem === p.id) { c.hasCape = false; c.capeItem = 0; c.version = now(); } }
  }
  function moveItem(from, to, p) { db.lib[from] = (db.lib[from] || []).filter(x => x !== p.id); takeOff(from, p); (db.lib[to] = db.lib[to] || []).push(p.id); }
  function dmSys(a, b, m) { const box = H.dms[dmKey(a, b)] = H.dms[dmKey(a, b)] || []; box.push(Object.assign({ id: H.seq++, at: now() }, m)); }

  routes['GET /trade/locker'] = async (req, res, body, me) => {
    const n = q(req).get('name'); const u = n ? byName(n) : me; if (!u) return fail(res, 404, 'No Kyoto player with that name');
    send(res, 200, { name: nameOf(u), items: tradable(u).map(itemInfo), coins: u === me ? db.coins[me] || 0 : undefined, owned: u !== me ? [...new Set(db.lib[me] || [])] : undefined });
  };
  function tradeOut(t, me) {
    const side = t.a === me ? 'a' : 'b', other = side === 'a' ? t.b : t.a;
    return { id: t.id, state: t.state, rev: t.rev, at: t.at, upd: t.upd, note: t.note, from: nameOf(t.a), to: nameOf(t.b), with: nameOf(other), mine: side === 'a',
      give: (side === 'a' ? t.ga : t.gb).map(itemOf).filter(Boolean).map(itemInfo), get: (side === 'a' ? t.gb : t.ga).map(itemOf).filter(Boolean).map(itemInfo),
      coinsGive: side === 'a' ? t.ca : t.cb, coinsGet: side === 'a' ? t.cb : t.ca, iConfirmed: !!t.ok[side], theyConfirmed: !!t.ok[side === 'a' ? 'b' : 'a'], lastBy: t.lastBy ? nameOf(t.lastBy) : null, why: t.why || null };
  }
  function checkSide(res, u, ids, coins, other) {
    for (const id of ids) {
      const p = itemOf(id); if (!p) { fail(res, 400, 'One of those items isn\'t in the Store any more'); return false; }
      if (p.uuid === u) { fail(res, 400, `You made "${p.title}", so it can't be traded (sell it in the Store instead)`); return false; }
      if (!(db.lib[u] || []).includes(p.id)) { fail(res, 400, `${nameOf(u)} doesn't own "${p.title}" any more`); return false; }
      if (ownsItem(other, p.id)) { fail(res, 400, `${nameOf(other)} already owns "${p.title}"`); return false; }
    }
    if (coins > (db.coins[u] || 0)) { fail(res, 400, `${nameOf(u)} doesn't have ${coins} coins`); return false; }
    return true;
  }
  const ids = a => [...new Set((Array.isArray(a) ? a : []).map(Number).filter(Number.isFinite))].slice(0, 8);
  const coinsOf = v => Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));
  routes['GET /trades'] = async (req, res, body, me) => {
    const t0 = now();
    for (const t of H.trades) if (t.state === 'open' && t0 - t.upd > 3 * 864e5) { t.state = 'expired'; save(); }
    const l = H.trades.filter(t => t.a === me || t.b === me).sort((a, b) => (a.state === 'open') === (b.state === 'open') ? b.upd - a.upd : a.state === 'open' ? -1 : 1).slice(0, 40);
    send(res, 200, { trades: l.map(t => tradeOut(t, me)), coins: db.coins[me] || 0 });
  };
  routes['POST /trades/new'] = async (req, res, body, me) => {
    if (isBanned(me)) return fail(res, 403, 'Banned');
    const other = byName(body.to); if (!other || other === me) return fail(res, 404, 'Pick a Kyoto friend to trade with');
    if (!areFriends(me, other)) return fail(res, 403, 'You can only trade with friends');
    if (blockedBy(other, me)) return fail(res, 403, 'You can\'t trade with this player');
    if (H.trades.filter(t => t.state === 'open' && t.a === me).length >= 5) return fail(res, 400, 'You have 5 open trades: finish or cancel one first');
    const ga = ids(body.give), gb = ids(body.want), ca = coinsOf(body.coinsGive), cb = coinsOf(body.coinsWant);
    if (!ga.length && !gb.length) return fail(res, 400, 'Add at least one cosmetic');
    if (ca && cb) return fail(res, 400, 'Only one side can add coins');
    if (!checkSide(res, me, ga, ca, other) || !checkSide(res, other, gb, cb, me)) return;
    const note2 = clean(body.note, 140); if (note2 && !checkText(res, me, note2)) return;
    if (slowmode(me + 'trade', 4000)) return fail(res, 429, 'Wait a few seconds');
    const t = { id: H.seq++, a: me, b: other, ga, gb, ca, cb, note: note2, ok: { a: false, b: false }, state: 'open', rev: 1, at: now(), upd: now(), lastBy: me };
    H.trades.push(t); if (H.trades.length > 2000) H.trades.shift();
    note(other, 'trade', `${nameOf(me)} wants to trade with you`, { trade: t.id });
    dmSys(me, other, { sys: true, uuid: me, trade: t.id, text: `${nameOf(me)} sent a trade offer` });
    save(); send(res, 200, { ok: true, id: t.id });
  };
  const myTrade = (me, id) => H.trades.find(t => t.id === Number(id) && (t.a === me || t.b === me));
  routes['POST /trades/edit'] = async (req, res, body, me) => { // counter offer: anything changes, both confirmations reset
    const t = myTrade(me, body.id); if (!t || t.state !== 'open') return fail(res, 404, 'That trade is closed');
    const side = t.a === me ? 'a' : 'b', other = side === 'a' ? t.b : t.a;
    const give = ids(body.give), get = ids(body.want), cg = coinsOf(body.coinsGive), cw = coinsOf(body.coinsWant);
    if (!give.length && !get.length) return fail(res, 400, 'Add at least one cosmetic');
    if (cg && cw) return fail(res, 400, 'Only one side can add coins');
    if (!checkSide(res, me, give, cg, other) || !checkSide(res, other, get, cw, me)) return;
    if (side === 'a') Object.assign(t, { ga: give, gb: get, ca: cg, cb: cw }); else Object.assign(t, { gb: give, ga: get, cb: cg, ca: cw });
    t.ok = { a: false, b: false }; t.rev++; t.upd = now(); t.lastBy = me;
    note(other, 'trade', `${nameOf(me)} changed the trade`, { trade: t.id });
    save(); send(res, 200, { ok: true, rev: t.rev });
  };
  routes['POST /trades/confirm'] = async (req, res, body, me) => {
    const t = myTrade(me, body.id); if (!t || t.state !== 'open') return fail(res, 404, 'That trade is closed');
    if (Number(body.rev) !== t.rev) return fail(res, 409, 'The trade changed: look it over again');
    const side = t.a === me ? 'a' : 'b'; t.ok[side] = true; t.upd = now();
    if (!(t.ok.a && t.ok.b)) { note(side === 'a' ? t.b : t.a, 'trade', `${nameOf(me)} confirmed the trade: your turn`, { trade: t.id }); save(); return send(res, 200, { ok: true, done: false }); }
    // both confirmed: check everything again, then swap in one go
    const r2 = { statusCode: 200, writeHead() {}, end() {} }; let err = null;
    const fake = { writeHead: (c) => { r2.statusCode = c; }, end: d => { try { err = JSON.parse(String(d)).error; } catch (e) { err = 'Trade failed'; } } };
    const ok = checkSide(fake, t.a, t.ga, t.ca, t.b) && checkSide(fake, t.b, t.gb, t.cb, t.a);
    if (!ok) { t.ok = { a: false, b: false }; t.why = err; save(); return fail(res, 409, err || 'Something changed, the trade can\'t happen'); }
    const A = t.ga.map(itemOf), B = t.gb.map(itemOf);
    for (const p of A) moveItem(t.a, t.b, p); for (const p of B) moveItem(t.b, t.a, p);
    if (t.ca) { db.coins[t.a] -= t.ca; db.coins[t.b] = (db.coins[t.b] || 0) + t.ca; }
    if (t.cb) { db.coins[t.b] -= t.cb; db.coins[t.a] = (db.coins[t.a] || 0) + t.cb; }
    t.state = 'done'; t.upd = now();
    for (const u of [t.a, t.b]) note(u, 'trade_done', `Trade with ${nameOf(u === t.a ? t.b : t.a)} done! Check your Locker.`, { trade: t.id });
    dmSys(t.a, t.b, { sys: true, trade: t.id, text: 'Trade complete' });
    save(); send(res, 200, { ok: true, done: true });
  };
  routes['POST /trades/unconfirm'] = async (req, res, body, me) => {
    const t = myTrade(me, body.id); if (!t || t.state !== 'open') return fail(res, 404, 'That trade is closed');
    t.ok[t.a === me ? 'a' : 'b'] = false; t.upd = now(); save(); send(res, 200, { ok: true });
  };
  routes['POST /trades/decline'] = async (req, res, body, me) => {
    const t = myTrade(me, body.id); if (!t || t.state !== 'open') return fail(res, 404, 'That trade is closed');
    t.state = t.a === me ? 'cancelled' : 'declined'; t.upd = now();
    note(t.a === me ? t.b : t.a, 'trade', `${nameOf(me)} ${t.state} the trade`, { trade: t.id });
    save(); send(res, 200, { ok: true });
  };
  // Gifts: buy a Store item for a friend (you pay), or give away one you own.
  db.giftDay = db.giftDay || {};
  routes['POST /gift'] = async (req, res, body, me) => {
    if (isBanned(me)) return fail(res, 403, 'Banned');
    const to = byName(body.to); if (!to || to === me) return fail(res, 404, 'Pick a Kyoto friend');
    if (!areFriends(me, to)) return fail(res, 403, 'You can only send gifts to friends');
    if (blockedBy(to, me)) return fail(res, 403, 'You can\'t send this player gifts');
    const p = itemOf(body.id); if (!p) return fail(res, 404, 'That item isn\'t in the Store');
    if (ownsItem(to, p.id)) return fail(res, 400, `${nameOf(to)} already has "${p.title}"`);
    const msg = clean(body.note, 140); if (msg && !checkText(res, me, msg)) return;
    const dk = DAY() + ':' + me; db.giftDay[dk] = (db.giftDay[dk] || 0) + 1; if (db.giftDay[dk] > 25) return fail(res, 429, '25 gifts a day max');
    let mode = body.mode === 'give' ? 'give' : 'buy';
    if (mode === 'give') {
      if (p.uuid === me) mode = 'creator';
      else if (!(db.lib[me] || []).includes(p.id)) return fail(res, 400, 'You don\'t own that');
    }
    if (mode === 'buy' && p.uuid !== me) {
      const price = p.price || 0;
      if ((db.coins[me] || 0) < price) return fail(res, 402, `You need ${price} coins (you have ${db.coins[me] || 0})`);
      db.coins[me] = (db.coins[me] || 0) - price; db.coins[p.uuid] = (db.coins[p.uuid] || 0) + Math.floor(price * .8);
      (db.lib[to] = db.lib[to] || []).push(p.id); p.owners = (p.owners || 0) + 1;
    } else if (mode === 'give') moveItem(me, to, p);
    else { (db.lib[to] = db.lib[to] || []).push(p.id); p.owners = (p.owners || 0) + 1; } // creators can gift their own item
    const gift = Object.assign(itemInfo(p), { note: msg });
    dmSys(me, to, { uuid: me, gift, text: msg || '' });
    note(to, 'gift', `${nameOf(me)} sent you a gift: ${p.title}`, { where: 'dm:' + nameOf(me), item: p.id });
    touchStreak(me, to);
    save(); send(res, 200, { ok: true, coins: db.coins[me] || 0 });
  };

  /* ================================================================ voice rooms ================================================================ */
  // Opus audio over a WebSocket (/voice?token=..&room=..). The game uses Simple Voice Chat's codec, the website uses WebCodecs.
  // Every packet is sent on to everyone else in the room with 1 byte in front: the sender's slot.
  const VR = new Map();
  function makeVoiceRoom(host, name, privacy, lfg) {
    let id; do id = crypto.randomBytes(4).toString('hex'); while (VR.has(id));
    const r = { id, name: String(name).slice(0, 40), host, privacy: ['public', 'friends', 'invite'].includes(privacy) ? privacy : 'public', lfg: lfg || null, members: new Map(), created: now(), emptySince: now(), topic: '' };
    VR.set(id, r); return r;
  }
  const canSeeRoom = (r, me) => !!r.server || r.privacy === 'public' || r.host === me || areFriends(r.host, me) && r.privacy === 'friends' || [...r.members.values()].some(m => m.uuid === me) || isStaff(me)
    || (r.lfg && H.lfg.some(p => p.id === r.lfg && (p.uuid === me || p.members.includes(me)))) || Object.values(H.groups).some(g => g.voice === r.id && g.members.includes(me));
  const roomOut = (r, me) => ({ id: r.id, name: r.name, topic: r.topic, host: nameOf(r.host), privacy: r.privacy, lfg: r.lfg, mine: r.host === me, size: r.members.size, max: 16,
    members: [...r.members.values()].map(m => ({ slot: m.slot, name: nameOf(m.uuid), muted: m.muted, deaf: m.deaf, speaking: m.speaking && now() - m.spokeAt < 1500, host: m.uuid === r.host, client: m.client })) });
  setInterval(() => { for (const [id, r] of VR) if (!r.members.size && now() - r.emptySince > (r.lfg ? 30 : 3) * 60000) VR.delete(id); }, 30000).unref();
  routes['GET /voice'] = async (req, res, body, me) => {
    const l = [...VR.values()].filter(r => !me ? r.privacy === 'public' : canSeeRoom(r, me)).filter(r => !r.server).filter(r => r.members.size || r.host === me || r.privacy !== 'invite')
      .sort((a, b) => b.members.size - a.members.size || b.created - a.created).map(r => roomOut(r, me));
    send(res, 200, { rooms: l });
  };
  routes['POST /voice/create'] = async (req, res, body, me) => {
    if (isBanned(me)) return fail(res, 403, 'Banned');
    if (slowmode(me + 'vcreate', 8000)) return fail(res, 429, 'Wait a few seconds');
    const name = clean(body.name, 40) || nameOf(me) + '\'s room'; if (!checkText(res, me, name)) return;
    for (const r of VR.values()) if (r.host === me && !r.members.size && !r.lfg) VR.delete(r.id);
    const r = makeVoiceRoom(me, name, body.privacy); r.topic = clean(body.topic, 80);
    if (body.group) { const g = H.groups[String(body.group)]; if (g && g.members.includes(me)) { g.voice = r.id; r.privacy = 'invite'; groupSys(g, `${nameOf(me)} started a voice room`); } }
    send(res, 200, { ok: true, id: r.id });
  };
  routes['POST /voice/edit'] = async (req, res, body, me) => {
    const r = VR.get(String(body.id)); if (!r || (r.host !== me && !isStaff(me))) return fail(res, 403, 'Only the host can do that');
    if (body.name) { const n = clean(body.name, 40); if (n && checkText(res, me, n)) r.name = n; else if (n) return; }
    if (body.topic !== undefined) r.topic = clean(body.topic, 80);
    if (body.privacy) r.privacy = ['public', 'friends', 'invite'].includes(body.privacy) ? body.privacy : r.privacy;
    broadcastRoom(r); send(res, 200, { ok: true });
  };
  function wsFrame(data, binary) {
    const payload = binary ? data : Buffer.from(data); let header;
    if (payload.length < 126) header = Buffer.from([binary ? 0x82 : 0x81, payload.length]);
    else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = binary ? 0x82 : 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
    else { header = Buffer.alloc(10); header[0] = binary ? 0x82 : 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
    return Buffer.concat([header, payload]);
  }
  const wsOut = (sock, data, binary) => { if (sock && !sock.destroyed && sock.writable) { if (sock.writableLength > 256000) return; sock.write(wsFrame(data, binary)); } };
  function broadcastRoom(r) { for (const m of r.members.values()) wsOut(m.sock, JSON.stringify({ t: 'state', room: roomOut(r, m.uuid), you: m.slot })); }
  /** Reads WebSocket frames from a socket. */
  function attachWs(sock, onMsg, onClose) {
    let buf = Buffer.alloc(0), frag = null, fragOp = 0;
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1e6) { sock.destroy(); return; }
      while (buf.length >= 2) {
        const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const need = off + (masked ? 4 : 0) + len; if (buf.length < need) return;
        let payload = buf.slice(off + (masked ? 4 : 0), need);
        if (masked) { const mk = buf.slice(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ mk[i & 3])); }
        buf = buf.slice(need);
        if (op === 0x8) { sock.end(); return; }
        if (op === 0x9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
        if (op === 0xA) continue;
        if (op === 0x0) { if (!frag) continue; frag = Buffer.concat([frag, payload]); if (fin) { onMsg(fragOp, frag); frag = null; } continue; }
        if (!fin) { frag = payload; fragOp = op; continue; }
        onMsg(op, payload);
      }
    });
    sock.on('close', onClose); sock.on('error', onClose);
  }
  function voiceUpgrade(req, sock, url) {
    const tok = url.searchParams.get('token') || '';
    const me = (db.tokens[tok] || {}).uuid || ctx.readSigned(tok);
    const r = VR.get(String(url.searchParams.get('room') || ''));
    const key = req.headers['sec-websocket-key'];
    if (!me || !key || !r || isBanned(me) || !canSeeRoom(r, me)) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    if (r.members.size >= 16) { sock.end('HTTP/1.1 409 Conflict\r\n\r\n'); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    sock.setNoDelay(true);
    // one seat per player per room: a new connection replaces the old one
    for (const [s, m] of r.members) if (m.uuid === me) { r.members.delete(s); try { m.sock.destroy(); } catch (e) { /* */ } }
    const used = new Set([...r.members.values()].map(m => m.slot)); let slot = 1; while (used.has(slot)) slot++;
    const m = { uuid: me, sock, slot, muted: false, deaf: false, speaking: false, spokeAt: 0, client: url.searchParams.get('client') === 'game' ? 'game' : 'web', joined: now() };
    r.members.set(sock, m); r.emptySince = 0; broadcastRoom(r);
    let lastState = 0;
    attachWs(sock, (op, data) => {
      if (op === 0x2) { // audio
        if (m.muted || data.length > 1500 || data.length < 2) return;
        const out = wsFrame(Buffer.concat([Buffer.from([slot]), data]), true);
        if (!m.speaking || now() - m.spokeAt > 400) { m.spokeAt = now(); if (!m.speaking) { m.speaking = true; if (now() - lastState > 300) { lastState = now(); broadcastRoom(r); } } } else m.spokeAt = now();
        for (const o of r.members.values()) if (o !== m && !o.deaf && o.sock.writable && o.sock.writableLength < 128000) o.sock.write(out);
        return;
      }
      if (op !== 0x1) return;
      let msg; try { msg = JSON.parse(data.toString('utf8')); } catch (e) { return; }
      if (msg.t === 'mute') { m.muted = !!msg.on; if (m.muted) m.speaking = false; broadcastRoom(r); }
      else if (msg.t === 'deaf') { m.deaf = !!msg.on; broadcastRoom(r); }
      else if (msg.t === 'quiet') { if (m.speaking) { m.speaking = false; broadcastRoom(r); } }
      else if (msg.t === 'kick' && (r.host === me || isStaff(me))) { for (const [s, o] of r.members) if (o.slot === Number(msg.slot) && o.uuid !== r.host) { wsOut(s, JSON.stringify({ t: 'kicked' })); s.end(); } }
      else if (msg.t === 'ping') wsOut(sock, JSON.stringify({ t: 'pong', at: msg.at }));
    }, () => {
      if (r.members.get(sock) !== m) return;
      r.members.delete(sock); if (!r.members.size) r.emptySince = now();
      else if (r.host === me && !r.lfg) { /* host left: the room stays, next person can still use it */ }
      broadcastRoom(r);
    });
    // stop "speaking" lights when packets stop
    const tk = setInterval(() => { if (sock.destroyed) return clearInterval(tk); if (m.speaking && now() - m.spokeAt > 600) { m.speaking = false; broadcastRoom(r); } }, 300);
  }

  /** Proximity voice: one room per Minecraft server. The game turns people up/down by how far away they are. */
  function serverVoiceRoom(host, me) {
    host = String(host || '').toLowerCase().replace(/[^a-z0-9.\-:]/g, '').slice(0, 60);
    if (!host) return null;
    for (const r of VR.values()) if (r.server === host && r.members.size < 16) return r.id;
    const r = makeVoiceRoom(me, host + ' (nearby voice)', 'public'); r.server = host; r.topic = 'Proximity voice: people near you in game are louder';
    return r.id;
  }
  return { voiceUpgrade, serverVoiceRoom, STICKERS, REACTIONS, statusOf, streakOf, touchStreak, note, voiceCount: () => VR.size };
};
