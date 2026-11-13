// Kyoto Client server - online count, friends, shared waypoints, cosmetics.
// No dependencies. Needs Node.js 18+.  Run:  node server.js   (PORT env var optional)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const CAPES = path.join(DATA, 'capes');
const MEDIA = path.join(DATA, 'profile_media');
const SKINS = path.join(DATA, 'skins');
const HUB_IMG = path.join(DATA, 'hub_images');
const DM_IMG = path.join(DATA, 'dm_images');
fs.mkdirSync(DM_IMG, { recursive: true });
fs.mkdirSync(CAPES, { recursive: true });
fs.mkdirSync(SKINS, { recursive: true });
fs.mkdirSync(HUB_IMG, { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });
// Kyoto staff (crown + "Owner of Kyoto Client"). Change with the OWNERS env var: "name1,name2"
const OWNERS = (process.env.OWNERS || 'heffm').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// ---------------- storage ----------------
const DB_FILE = path.join(DATA, 'db.json');
let db = { users: {}, tokens: {}, friends: {}, requests: {}, inbox: {}, cosmetics: {}, profiles: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) { /* first run */ }
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fs.writeFile(DB_FILE + '.tmp', JSON.stringify(db), err => { if (!err) fs.rename(DB_FILE + '.tmp', DB_FILE, () => {}); });
}, 10000);
const save = () => { dirty = true; };

const challenges = new Map(); // serverId -> expiry
const presence = new Map();   // uuid -> { lastSeen, server }
const ONLINE_MS = 60000;

// ---------------- helpers ----------------
function dashed(id) {
  const h = id.replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function isOnline(uuid) { const p = presence.get(uuid); return !!p && Date.now() - p.lastSeen < ONLINE_MS; }
function onlineCount() { let n = 0; for (const [u] of presence) if (isOnline(u)) n++; return n; }
function byName(name) {
  const lower = String(name || '').toLowerCase();
  for (const [uuid, u] of Object.entries(db.users)) if (u.name.toLowerCase() === lower) return uuid;
  return null;
}
function list(obj, key) { if (!obj[key]) obj[key] = []; return obj[key]; }
function areFriends(a, b) { return list(db.friends, a).includes(b); }

function send(res, code, body, type) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': type || 'application/json', 'Content-Length': data.length });
  res.end(data);
}
const fail = (res, code, msg) => send(res, code, { error: msg });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

// simple rate limit: 240 requests / minute / IP
const hits = new Map();
function limited(ip) {
  const now = Date.now(); const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60000) { h.n = 0; h.t = now; }
  h.n++; hits.set(ip, h); return h.n > 240;
}

function auth(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const t = db.tokens[m[1]];
  return t ? t.uuid : null;
}

// ---------------- routes ----------------
const routes = {
  'GET /': async (req, res) => send(res, 200, { name: 'Kyoto Client server', online: onlineCount() }),
  'GET /stats': async (req, res) => send(res, 200, { online: onlineCount(), users: Object.keys(db.users).length }),

  // Login: the client tells Mojang "I'm joining <serverId>", we ask Mojang if that's true.
  'POST /auth/challenge': async (req, res) => {
    const serverId = crypto.randomBytes(16).toString('hex');
    challenges.set(serverId, Date.now() + 120000);
    send(res, 200, { serverId });
  },
  'POST /auth/verify': async (req, res, body) => {
    const { name, serverId } = body;
    const exp = challenges.get(serverId);
    if (!exp || exp < Date.now()) return fail(res, 400, 'challenge expired');
    challenges.delete(serverId);
    const r = await fetch(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${serverId}`);
    if (r.status !== 200) return fail(res, 401, 'Mojang could not verify you (are you using a real Minecraft account?)');
    const prof = await r.json();
    const uuid = dashed(prof.id);
    db.users[uuid] = { name: prof.name, joined: (db.users[uuid] && db.users[uuid].joined) || Date.now() };
    for (const [t, v] of Object.entries(db.tokens)) if (v.uuid === uuid) delete db.tokens[t];
    const token = crypto.randomBytes(32).toString('hex');
    db.tokens[token] = { uuid, created: Date.now() };
    save();
    send(res, 200, { token, uuid, name: prof.name });
  },

  'POST /presence': async (req, res, body, me) => {
    presence.set(me, { lastSeen: Date.now(), server: String(body.server || '').slice(0, 80), join: String(body.join || '').slice(0, 80), calls: !!body.calls });
    send(res, 200, { online: onlineCount() });
  },

  'GET /friends': async (req, res, body, me) => {
    const friends = list(db.friends, me).map(u => ({
      uuid: u, name: (db.users[u] || {}).name || '?', online: isOnline(u),
      server: isOnline(u) ? (presence.get(u) || {}).server || '' : '',
      join: isOnline(u) ? (presence.get(u) || {}).join || '' : '',
      calls: isOnline(u) ? !!(presence.get(u) || {}).calls : false
    }));
    const incoming = Object.entries(db.requests).filter(([from, tos]) => tos.includes(me)).map(([from]) => (db.users[from] || {}).name).filter(Boolean);
    const outgoing = list(db.requests, me).map(u => (db.users[u] || {}).name).filter(Boolean);
    send(res, 200, { friends, incoming, outgoing });
  },
  'POST /friends/request': async (req, res, body, me) => {
    const them = byName(body.name);
    if (!them) return fail(res, 404, `${body.name} hasn't used Kyoto Client on this server yet`);
    if (them === me) return fail(res, 400, "That's you!");
    if (areFriends(me, them)) return fail(res, 400, 'Already friends');
    if (list(db.requests, them).includes(me)) { // they already asked you -> accept
      db.requests[them] = db.requests[them].filter(u => u !== me);
      list(db.friends, me).push(them); list(db.friends, them).push(me);
    } else if (!list(db.requests, me).includes(them)) {
      db.requests[me].push(them);
    }
    save(); send(res, 200, { ok: true });
  },
  'POST /friends/accept': async (req, res, body, me) => {
    const them = byName(body.name);
    if (!them || !list(db.requests, them).includes(me)) return fail(res, 404, 'No request from that player');
    db.requests[them] = db.requests[them].filter(u => u !== me);
    if (!areFriends(me, them)) { list(db.friends, me).push(them); list(db.friends, them).push(me); }
    save(); send(res, 200, { ok: true });
  },
  'POST /friends/remove': async (req, res, body, me) => {
    const them = byName(body.name);
    if (!them) return fail(res, 404, 'Unknown player');
    db.friends[me] = list(db.friends, me).filter(u => u !== them);
    db.friends[them] = list(db.friends, them).filter(u => u !== me);
    db.requests[me] = list(db.requests, me).filter(u => u !== them);
    db.requests[them] = list(db.requests, them).filter(u => u !== me);
    save(); send(res, 200, { ok: true });
  },

  'POST /waypoints/send': async (req, res, body, me) => {
    const them = byName(body.to);
    if (!them) return fail(res, 404, `${body.to} hasn't used Kyoto yet - add them as a friend first`);
    if (!areFriends(me, them)) return fail(res, 403, 'You can only send waypoints to friends');
    const box = list(db.inbox, them);
    if (box.length > 50) box.shift();
    box.push({ from: db.users[me].name, name: String(body.name).slice(0, 32), x: body.x | 0, y: body.y | 0, z: body.z | 0, dim: String(body.dim || '').slice(0, 64) });
    save(); send(res, 200, { ok: true });
  },
  'GET /waypoints/inbox': async (req, res, body, me) => {
    const box = list(db.inbox, me); db.inbox[me] = []; if (box.length) save();
    send(res, 200, { waypoints: box });
  },

  'PUT /skin': async (req, res, body, me) => {
    const c = db.cosmetics[me] || (db.cosmetics[me] = { hasCape: false, capeType: 'png', accessory: 0 });
    if (body.remove) { c.hasSkin = false; }
    else {
      const buf = Buffer.from(String(body.skin || ''), 'base64');
      const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (!isPng || buf.length > 200000) return fail(res, 400, 'Skin must be a PNG under 200 KB');
      // PNG width/height live at bytes 16-23
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (w !== 64 || (h !== 64 && h !== 32)) return fail(res, 400, 'Skin must be 64x64');
      fs.writeFileSync(path.join(SKINS, me.replace(/[^a-f0-9-]/g, '')), buf);
      c.hasSkin = true;
    }
    c.slim = !!body.slim; c.skinVersion = Date.now();
    save(); send(res, 200, { ok: true });
  },

  'PUT /cosmetics': async (req, res, body, me) => {
    const c = db.cosmetics[me] || { hasCape: false, capeType: 'png', accessory: 0 };
    if (body.removeCape) {
      c.hasCape = false;
    } else if (body.cape) {
      const buf = Buffer.from(String(body.cape), 'base64');
      const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isGif = buf.slice(0, 3).toString() === 'GIF';
      if (!isPng && !isGif) return fail(res, 400, 'Cape must be a PNG or GIF');
      if (buf.length > 1500000) return fail(res, 400, 'Cape file is too big (max 1.5 MB)');
      fs.writeFileSync(path.join(CAPES, me.replace(/[^a-f0-9-]/g, '')), buf);
      c.hasCape = true; c.capeType = isGif ? 'gif' : 'png';
    }
    c.accessory = Math.max(0, Math.min(40, body.accessory | 0));
    c.model = Math.max(0, Math.min(40, body.model | 0));
    c.version = Date.now();
    db.cosmetics[me] = c; save();
    send(res, 200, { ok: true });
  },
  'POST /cosmetics/bulk': async (req, res, body) => {
    const players = {};
    const kyoto = [];
    for (const u of (body.uuids || []).slice(0, 100)) {
      if (db.users[u]) kyoto.push(u);
      const c = db.cosmetics[u];
      if (c && (c.hasCape || c.accessory || c.model || c.hasSkin)) players[u] = c;
    }
    send(res, 200, { players, kyoto });
  },
};

// ---------------- profiles ----------------
const MEDIA_TYPES = { mp4: 'video/mp4', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav' };
function cleanStr(v, max) { return String(v || '').replace(/[\u0000-\u001f]/g, '').slice(0, max); }
function mediaFile(uuid, kind) { return path.join(MEDIA, `${uuid.replace(/[^a-f0-9-]/g, '')}_${kind}`); }

routes['PUT /profile'] = async (req, res, body, me) => {
  const old = db.profiles[me] || {};
  db.profiles[me] = Object.assign(old, {
    displayName: cleanStr(body.displayName, 24),
    bio: cleanStr(body.bio, 160),
    tags: (Array.isArray(body.tags) ? body.tags : []).slice(0, 5).map(t => cleanStr(t, 16)).filter(Boolean),
    links: (Array.isArray(body.links) ? body.links : []).slice(0, 4).map(l => cleanStr(l, 120)).filter(l => /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(l)),
    hue: Math.max(0, Math.min(360, Number(body.hue) || 0)),
    nameEffect: Math.max(0, Math.min(4, body.nameEffect | 0)),
    bgEffect: Math.max(0, Math.min(5, body.bgEffect | 0)),
    views: old.views || 0,
  });
  save(); send(res, 200, { ok: true });
};
routes['PUT /profile/media'] = async (req, res, body, me) => {
  const kind = body.kind === 'video' ? 'video' : body.kind === 'audio' ? 'audio' : null;
  if (!kind) return fail(res, 400, 'kind must be video or audio');
  const p = db.profiles[me] || (db.profiles[me] = { views: 0 });
  const file = mediaFile(me, kind);
  if (body.remove) {
    try { fs.unlinkSync(file); } catch (e) { /* none */ }
    p[kind + 'Ext'] = null; save(); return send(res, 200, { ok: true });
  }
  const ext = String(body.ext || '').toLowerCase();
  const allowed = kind === 'video' ? ['mp4', 'gif'] : ['mp3', 'wav'];
  if (!allowed.includes(ext)) return fail(res, 400, `${kind} must be ${allowed.join(' or ')}`);
  const buf = Buffer.from(String(body.data || ''), 'base64');
  const max = kind === 'video' ? 15000000 : 10000000;
  if (!buf.length || buf.length > max) return fail(res, 400, `File too big (max ${max / 1000000} MB)`);
  fs.writeFileSync(file, buf);
  p[kind + 'Ext'] = ext;
  if (kind === 'audio') p.audioName = cleanStr(body.fileName, 60);
  save(); send(res, 200, { ok: true });
};

// ---------------- Kyoto Hub: posts, setting presets, capes, public chat, DMs ----------------
db.hub = Object.assign({ posts: [], chat: [], dms: {}, reports: [], bans: [], blocks: {}, seq: 1 }, db.hub || {});
const H = db.hub;
const REQUIRE_APPROVAL = process.env.REQUIRE_APPROVAL !== '0'; // image posts wait for an owner to approve them
const EXTRA_BLOCKED = (process.env.BLOCKED_WORDS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
const b64 = s => Buffer.from(s, 'base64').toString('utf8');
// adult / hateful words (base64 so the file doesn't spell them out) - any of these = message refused
const BLOCK = ['cG9ybg==', 'bnNmdw==', 'aGVudGFp', 'eHh4', 'b25seWZhbnM=', 'bnVkZXM=', 'bnVkZQ==', 'c2V4', 'Y29jaw==', 'cHVzc3k=', 'ZGljaw==',
  'Y3Vt', 'Ym9vYnM=', 'bmlnZ2Vy', 'bmlnZ2E=', 'ZmFnZ290', 'ZmFn', 'cmV0YXJk', 'a3lz', 'a2lsbCB5b3Vyc2VsZg==', 'dHJhbm55', 'Y2hpbms=',
  'c3BpYw==', 'a2lrZQ==', 'd2V0YmFjaw==', 'Y29vbg==', 'cmFwZQ=='].map(b64).concat(EXTRA_BLOCKED);
const MASK = ['ZnVjaw==', 'c2hpdA==', 'Yml0Y2g=', 'YXNz', 'ZGFtbg==', 'Y3JhcA==', 'YmFzdGFyZA==', 'd2hvcmU=', 'c2x1dA=='].map(b64);
const LEET = { a: '4@', e: '3', i: '1!|', o: '0', s: '5$', t: '7', g: '9' };
const wordRx = w => new RegExp('(?<![a-z])' + [...w].map(c => c === ' ' ? '\\s+' : '[' + c.replace(/[\]\\^-]/g, '\\$&') + (LEET[c] || '').replace(/[\]\\^-]/g, '\\$&') + ']+').join('') + '(?![a-z])', 'i');
const BLOCK_RX = BLOCK.map(wordRx), MASK_RX = MASK.map(w => new RegExp(wordRx(w).source, 'gi'));
const SAFE_SITES = ['youtube.com', 'youtu.be', 'twitch.tv', 'modrinth.com', 'github.com', 'minecraftcapes.net', 'namemc.com', 'minecraftskins.com',
  'curseforge.com', 'minecraft.net', 'kick.com', 'x.com', 'twitter.com', 'tiktok.com', 'instagram.com', 'guns.lol', 'pastebin.com'];
const URL_RX = /\b((?:https?:\/\/|www\.)\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|gg|tv|io|me|co|xyz|ru|onion|link|ly|to|cc|lol|app|dev|site|online|live|club|info|biz|us|uk|de|fr)(?:\/\S*)?)/gi;
function safeLink(u) {
  u = u.toLowerCase();
  if (u.includes('.onion') || /^(https?:\/\/)?\d{1,3}(\.\d{1,3}){3}/.test(u)) return false;
  if (['bit.ly', 'tinyurl', 't.co/', 'cutt.ly', 'is.gd', 'rb.gy', 'shorturl', 'grabify', 'iplogger', '2no.co'].some(x => u.includes(x))) return false;
  const host = u.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return SAFE_SITES.some(s => host === s || host.endsWith('.' + s));
}
function blocked(t) {
  const low = String(t || '').toLowerCase();
  return BLOCK_RX.some(r => r.test(low)) || low.includes('.onion') || low.includes('porn') || low.includes('hentai');
}
function clean(t, max) {
  let s = String(t || '').replace(/[\u0000-\u001f‮​]/g, ' ').slice(0, max).trim();
  s = s.replace(URL_RX, m => safeLink(m) ? m : '[link removed]');
  for (const r of MASK_RX) s = s.replace(r, '***');
  return s;
}
const nameOf = u => (db.users[u] || {}).name || '?';
const isOwnerUuid = u => OWNERS.includes(nameOf(u).toLowerCase());
const isBanned = u => H.bans.includes(u);
const lastAct = new Map();
function slowmode(u, ms) { const t = lastAct.get(u) || 0; if (Date.now() - t < ms) return true; lastAct.set(u, Date.now()); return false; }
function checkText(res, me, text) {
  if (isBanned(me)) { fail(res, 403, 'You are banned from the Kyoto Hub'); return false; }
  if (blocked(text)) { fail(res, 400, 'Blocked by the filter (bad words or unsafe content)'); return false; }
  return true;
}
const pub = (p, me) => ({ id: p.id, type: p.type, uuid: p.uuid, name: nameOf(p.uuid), title: p.title, text: p.text, at: p.at,
  likes: p.likes.length, liked: p.likes.includes(me), hasImage: !!p.image, pending: !!p.pending, owner: isOwnerUuid(p.uuid) });
const q = req => new URL(req.url, 'http://x').searchParams;

routes['GET /hub/posts'] = async (req, res, body, me) => {
  const type = q(req).get('type') || 'post';
  const mod = isOwnerUuid(me);
  const list = H.posts.filter(p => p.type === type && (!p.pending || mod || p.uuid === me));
  const sort = q(req).get('sort') === 'top' ? (a, b) => b.likes.length - a.likes.length : (a, b) => b.at - a.at;
  send(res, 200, { posts: list.sort(sort).slice(0, 60).map(p => pub(p, me)), mod });
};
routes['POST /hub/post'] = async (req, res, body, me) => {
  const type = ['post', 'preset', 'cape'].includes(body.type) ? body.type : 'post';
  const title = clean(body.title, 40), text = clean(body.text, 300);
  if (!checkText(res, me, title + ' ' + text)) return;
  if (slowmode(me + 'post', 30000)) return fail(res, 429, 'Wait 30 seconds between posts');
  if (!title && !text) return fail(res, 400, 'Write something first');
  const post = { id: H.seq++, type, uuid: me, title, text, at: Date.now(), likes: [] };
  if (type === 'preset') {
    try { const d = JSON.parse(String(body.data || '')); if (String(body.data).length > 40000) throw 0; post.data = JSON.stringify({ modules: d.modules || {}, choices: d.choices || {}, crosshair: d.crosshair || null, vfx: d.vfx || null }); }
    catch (e) { return fail(res, 400, 'Bad preset'); }
  }
  if (type === 'cape') {
    const buf = Buffer.from(String(body.image || ''), 'base64');
    const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), isGif = buf.slice(0, 3).toString() === 'GIF';
    if ((!isPng && !isGif) || buf.length > 1500000) return fail(res, 400, 'Cape must be a PNG or GIF under 1.5 MB');
    post.image = isGif ? 'gif' : 'png';
    fs.writeFileSync(path.join(HUB_IMG, String(post.id)), buf);
    post.pending = REQUIRE_APPROVAL && !isOwnerUuid(me);
  }
  H.posts.push(post); if (H.posts.length > 2000) H.posts.shift();
  save(); send(res, 200, { ok: true, pending: !!post.pending });
};
routes['GET /hub/image'] = async (req, res, body, me) => {
  const id = Number(q(req).get('id')); const p = H.posts.find(x => x.id === id);
  if (!p || !p.image || (p.pending && !isOwnerUuid(me) && p.uuid !== me)) return fail(res, 404, 'no image');
  send(res, 200, fs.readFileSync(path.join(HUB_IMG, String(id))), p.image === 'gif' ? 'image/gif' : 'image/png');
};
routes['GET /hub/preset'] = async (req, res, body, me) => {
  const id = Number(q(req).get('id')); const p = H.posts.find(x => x.id === id && x.type === 'preset');
  if (!p) return fail(res, 404, 'no preset');
  send(res, 200, { data: p.data });
};
routes['POST /hub/like'] = async (req, res, body, me) => {
  const p = H.posts.find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'gone');
  p.likes = p.likes.includes(me) ? p.likes.filter(u => u !== me) : p.likes.concat(me); save(); send(res, 200, { likes: p.likes.length });
};
routes['POST /hub/delete'] = async (req, res, body, me) => {
  const p = H.posts.find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'gone');
  if (p.uuid !== me && !isOwnerUuid(me)) return fail(res, 403, 'Not yours');
  H.posts = H.posts.filter(x => x !== p); try { fs.unlinkSync(path.join(HUB_IMG, String(p.id))); } catch (e) { /* none */ }
  save(); send(res, 200, { ok: true });
};
routes['POST /hub/report'] = async (req, res, body, me) => {
  if (slowmode(me + 'report', 5000)) return fail(res, 429, 'Slow down');
  H.reports.push({ kind: String(body.kind || 'post').slice(0, 8), id: String(body.id).slice(0, 20), by: me, reason: clean(body.reason, 100), at: Date.now() });
  if (H.reports.length > 500) H.reports.shift();
  save(); send(res, 200, { ok: true });
};
routes['GET /chat'] = async (req, res, body, me) => {
  const since = Number(q(req).get('since')) || 0;
  send(res, 200, { messages: H.chat.filter(m => m.at > since).slice(-80).map(m => Object.assign({ name: nameOf(m.uuid), owner: isOwnerUuid(m.uuid) }, m)) });
};
routes['POST /chat/send'] = async (req, res, body, me) => {
  const text = clean(body.text, 200);
  if (!text || !checkText(res, me, text)) return text ? undefined : fail(res, 400, 'Empty');
  if (slowmode(me + 'chat', 1500)) return fail(res, 429, 'Slow down');
  H.chat.push({ id: H.seq++, uuid: me, text, at: Date.now() }); if (H.chat.length > 300) H.chat.shift();
  save(); send(res, 200, { ok: true });
};
const dmKey = (a, b) => [a, b].sort().join(':');
routes['GET /dm/threads'] = async (req, res, body, me) => {
  const threads = [];
  for (const [k, msgs] of Object.entries(H.dms)) {
    if (!k.includes(me) || !msgs.length) continue;
    const other = k.split(':').find(u => u !== me) || me; const last = msgs[msgs.length - 1];
    threads.push({ name: nameOf(other), last: last.img ? '[picture]' : last.text, at: last.at, fromMe: last.uuid === me });
  }
  send(res, 200, { threads: threads.sort((a, b) => b.at - a.at).slice(0, 40) });
};
routes['GET /dm/with'] = async (req, res, body, me) => {
  const other = byName(q(req).get('name')); if (!other) return fail(res, 404, 'No Kyoto player with that name');
  send(res, 200, { messages: (H.dms[dmKey(me, other)] || []).slice(-80).map(m => ({ name: nameOf(m.uuid), text: m.text || '', img: m.img || null, at: m.at, me: m.uuid === me })) });
};
routes['POST /dm/send'] = async (req, res, body, me) => {
  const other = byName(body.to); if (!other) return fail(res, 404, `${body.to} hasn't used Kyoto yet`);
  if (other === me) return fail(res, 400, "That's you!");
  if (list(H.blocks, other).includes(me)) return fail(res, 403, "You can't message this player");
  const text = clean(body.text, 300);
  if (!text || !checkText(res, me, text)) return text ? undefined : fail(res, 400, 'Empty');
  if (slowmode(me + 'dm', 800)) return fail(res, 429, 'Slow down');
  const box = H.dms[dmKey(me, other)] || (H.dms[dmKey(me, other)] = []);
  box.push({ uuid: me, text, at: Date.now() }); if (box.length > 200) box.shift();
  save(); send(res, 200, { ok: true });
};
routes['POST /dm/block'] = async (req, res, body, me) => {
  const other = byName(body.name); if (!other) return fail(res, 404, 'Unknown player');
  const l = list(H.blocks, me); if (!l.includes(other)) l.push(other); save(); send(res, 200, { ok: true });
};

// ---------------- DM pictures (friends only, PNG/JPG, max 2 MB) ----------------
routes['POST /dm/image'] = async (req, res, body, me) => {
  const other = byName(body.to); if (!other) return fail(res, 404, `${body.to} hasn't used Kyoto yet`);
  if (!areFriends(me, other)) return fail(res, 403, 'You can only send pictures to friends');
  if (list(H.blocks, other).includes(me)) return fail(res, 403, "You can't message this player");
  if (isBanned(me)) return fail(res, 403, 'Banned');
  if (slowmode(me + 'dmimg', 4000)) return fail(res, 429, 'Slow down');
  let buf; try { buf = Buffer.from(String(body.image || ''), 'base64'); } catch (e) { return fail(res, 400, 'Bad picture'); }
  const png = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50; const jpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  if (!png && !jpg) return fail(res, 400, 'PNG or JPG only');
  if (buf.length > 2 * 1024 * 1024) return fail(res, 413, 'Max 2 MB');
  const id = crypto.randomBytes(9).toString('hex');
  fs.writeFileSync(path.join(DM_IMG, id), buf);
  const box = H.dms[dmKey(me, other)] || (H.dms[dmKey(me, other)] = []);
  box.push({ uuid: me, img: id, imgOwners: [me, other], at: Date.now() });
  while (box.length > 200) { const old = box.shift(); if (old.img) try { fs.unlinkSync(path.join(DM_IMG, old.img)); } catch (e) { /* gone */ } }
  save(); send(res, 200, { ok: true, id });
};
routes['GET /dm/img'] = async (req, res, body, me) => {
  const id = String(q(req).get('id') || ''); if (!/^[a-f0-9]{18}$/.test(id)) return fail(res, 400, 'bad id');
  // only the two people in that conversation can load it
  let ok = false;
  for (const [k, msgs] of Object.entries(H.dms)) { if (!k.includes(me)) continue; if (msgs.some(m => m.img === id)) { ok = true; break; } }
  if (!ok) return fail(res, 404, 'not found');
  const f = path.join(DM_IMG, id); if (!fs.existsSync(f)) return fail(res, 404, 'not found');
  const buf = fs.readFileSync(f); send(res, 200, buf, buf[0] === 0x89 ? 'image/png' : 'image/jpeg');
};

// ---------------- shared video screens (per server address) ----------------
if (!db.screens) db.screens = {};
const YT = /^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;
function screenOut(s) { return Object.assign({}, s, { owner: nameOf(s.ownerUuid) }); }
routes['GET /screens'] = async (req, res, body, me) => {
  const key = String(q(req).get('server') || '').toLowerCase().slice(0, 80);
  send(res, 200, { now: Date.now(), screens: (db.screens[key] || []).map(screenOut) });
};
routes['POST /screens/save'] = async (req, res, body, me) => {
  const key = String(body.server || '').toLowerCase().slice(0, 80); if (!key) return fail(res, 400, 'No server');
  if (isBanned(me)) return fail(res, 403, 'Banned');
  const url = String(body.url || '').slice(0, 300);
  if (url && !YT.test(url)) return fail(res, 400, 'Only YouTube links can go on screens');
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const arr = db.screens[key] || (db.screens[key] = []);
  let s = body.id ? arr.find(x => x.id === body.id) : null;
  if (s && s.ownerUuid !== me) return fail(res, 403, "That's someone else's screen");
  if (!s) {
    if (arr.filter(x => x.ownerUuid === me).length >= 3) return fail(res, 400, 'Max 3 screens per server');
    if (arr.length >= 40) return fail(res, 400, 'This server has too many screens');
    s = { id: crypto.randomBytes(4).toString('hex'), ownerUuid: me }; arr.push(s);
  }
  Object.assign(s, {
    dim: String(body.dim || '').slice(0, 60), x: num(body.x, -3e7, 3e7, 0), y: num(body.y, -2048, 4096, 0), z: num(body.z, -3e7, 3e7, 0),
    yaw: num(body.yaw, -720, 720, 0), w: num(body.w, 1, 16, 4), h: num(body.h, 0.5, 9, 2.25), url,
    paused: !!body.paused, pausedPos: num(body.pausedPos, 0, 86400, 0),
    startedAt: body.paused ? 0 : Date.now() - num(body.pos, 0, 86400, 0) * 1000, updated: Date.now()
  });
  save(); send(res, 200, { ok: true, id: s.id });
};
routes['POST /screens/delete'] = async (req, res, body, me) => {
  for (const k of Object.keys(db.screens)) {
    const s = db.screens[k].find(x => x.id === body.id);
    if (s && (s.ownerUuid === me || isOwnerUuid(me))) db.screens[k] = db.screens[k].filter(x => x !== s);
  }
  save(); send(res, 200, { ok: true });
};
// owner tools
function ownerOnly(res, me) { if (!isOwnerUuid(me)) { fail(res, 403, 'Owners only'); return false; } return true; }
routes['GET /mod/queue'] = async (req, res, body, me) => {
  if (!ownerOnly(res, me)) return;
  send(res, 200, { pending: H.posts.filter(p => p.pending).map(p => pub(p, me)), reports: H.reports.slice(-50).map(r => Object.assign({ byName: nameOf(r.by) }, r)), bans: H.bans.map(nameOf) });
};
routes['POST /mod/approve'] = async (req, res, body, me) => {
  if (!ownerOnly(res, me)) return; const p = H.posts.find(x => x.id === Number(body.id)); if (p) p.pending = false; save(); send(res, 200, { ok: true });
};
routes['POST /mod/ban'] = async (req, res, body, me) => {
  if (!ownerOnly(res, me)) return; const u = byName(body.name); if (!u) return fail(res, 404, 'Unknown player');
  if (!H.bans.includes(u)) H.bans.push(u);
  H.posts = H.posts.filter(p => p.uuid !== u); H.chat = H.chat.filter(m => m.uuid !== u);
  save(); send(res, 200, { ok: true });
};
routes['POST /mod/unban'] = async (req, res, body, me) => {
  if (!ownerOnly(res, me)) return; const u = byName(body.name); H.bans = H.bans.filter(x => x !== u); save(); send(res, 200, { ok: true });
};
routes['POST /mod/clearreports'] = async (req, res, body, me) => { if (!ownerOnly(res, me)) return; H.reports = []; save(); send(res, 200, { ok: true }); };

const server = http.createServer(async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (limited(ip)) return fail(res, 429, 'slow down');
    const url = new URL(req.url, 'http://x');
    const capeMatch = /^\/cape\/([a-f0-9-]{36})$/.exec(url.pathname);
    if (req.method === 'GET' && capeMatch) {
      const file = path.join(CAPES, capeMatch[1]);
      if (!fs.existsSync(file)) return fail(res, 404, 'no cape');
      const c = db.cosmetics[capeMatch[1]] || {};
      return send(res, 200, fs.readFileSync(file), c.capeType === 'gif' ? 'image/gif' : 'image/png');
    }
    const skinMatch = /^\/skin\/([a-f0-9-]{36})$/.exec(url.pathname);
    if (req.method === 'GET' && skinMatch) {
      const file = path.join(SKINS, skinMatch[1]);
      if (!fs.existsSync(file)) return fail(res, 404, 'no skin');
      return send(res, 200, fs.readFileSync(file), 'image/png');
    }
    const prof = /^\/profile\/([A-Za-z0-9_]{1,16})(?:\/(video|audio))?$/.exec(url.pathname);
    if (req.method === 'GET' && prof) {
      const uuid = byName(prof[1]);
      const isOwner = OWNERS.includes(prof[1].toLowerCase());
      const p = uuid ? db.profiles[uuid] : null;
      if (prof[2]) {
        if (!uuid || !p || !p[prof[2] + 'Ext']) return fail(res, 404, 'no media');
        const file = mediaFile(uuid, prof[2]);
        if (!fs.existsSync(file)) return fail(res, 404, 'no media');
        return send(res, 200, fs.readFileSync(file), MEDIA_TYPES[p[prof[2] + 'Ext']] || 'application/octet-stream');
      }
      if (!uuid || !p) return fail(res, 404, 'no profile');
      p.views = (p.views || 0) + 1; save();
      const badges = ['kyoto'];
      if (isOwner) badges.unshift('owner');
      return send(res, 200, Object.assign({ name: db.users[uuid].name, badges }, p));
    }
    const key = `${req.method} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) return fail(res, 404, 'not found');
    const limit = key === 'PUT /profile/media' ? 22000000 : 2500000;
    const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req, limit) : {};
    const open = key === 'GET /' || key === 'GET /stats' || key.startsWith('POST /auth/') || key === 'POST /cosmetics/bulk';
    let me = null;
    if (!open) { me = auth(req); if (!me) return fail(res, 401, 'not logged in'); }
    await handler(req, res, body, me);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, e.message);
  }
});

// ---------------- friend calls: tiny WebSocket relay (no packages needed) ----------------
// Text frames: {t:"call"|"accept"|"hangup", name}. Binary frames: Opus audio, forwarded to your call partner.
const sockets = new Map(); // uuid -> socket
const callOf = new Map();  // uuid -> partner uuid (active)
const ringing = new Map(); // callee uuid -> caller uuid
function wsSend(sock, data, binary) {
  if (!sock || sock.destroyed) return;
  const payload = binary ? data : Buffer.from(data);
  let header;
  if (payload.length < 126) header = Buffer.from([binary ? 0x82 : 0x81, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = binary ? 0x82 : 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = binary ? 0x82 : 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  sock.write(Buffer.concat([header, payload]));
}
const wsJson = (uuid, o) => wsSend(sockets.get(uuid), JSON.stringify(o), false);
function endCall(uuid) {
  const p = callOf.get(uuid); callOf.delete(uuid);
  if (p) { callOf.delete(p); wsJson(p, { t: 'end' }); }
  for (const [callee, caller] of ringing) if (callee === uuid || caller === uuid) { ringing.delete(callee); wsJson(callee === uuid ? caller : callee, { t: 'end' }); }
}
function onWsMessage(me, op, data) {
  if (op === 0x2) { const p = callOf.get(me); if (p && data.length <= 4000) wsSend(sockets.get(p), data, true); return; }
  if (op !== 0x1) return;
  let m; try { m = JSON.parse(data.toString('utf8')); } catch (e) { return; }
  const them = m.name ? byName(m.name) : null;
  if (m.t === 'call') {
    if (!them || !areFriends(me, them)) return wsJson(me, { t: 'error', msg: 'You can only call friends' });
    if (!sockets.has(them)) return wsJson(me, { t: 'error', msg: `${nameOf(them)} isn't online with calls on` });
    if (list(H.blocks, them).includes(me)) return wsJson(me, { t: 'error', msg: "Can't call this player" });
    if (callOf.has(them) || ringing.has(them)) return wsJson(me, { t: 'error', msg: `${nameOf(them)} is busy` });
    endCall(me); ringing.set(them, me); wsJson(them, { t: 'ring', name: nameOf(me) });
    setTimeout(() => { if (ringing.get(them) === me) { ringing.delete(them); wsJson(me, { t: 'error', msg: 'No answer' }); wsJson(them, { t: 'end' }); } }, 30000);
  } else if (m.t === 'accept') {
    const caller = ringing.get(me); if (!caller || caller !== them) return;
    ringing.delete(me); callOf.set(me, caller); callOf.set(caller, me);
    wsJson(me, { t: 'start', name: nameOf(caller) }); wsJson(caller, { t: 'start', name: nameOf(me) });
  } else if (m.t === 'hangup') endCall(me);
}
server.on('upgrade', (req, sock) => {
  try {
    const url = new URL(req.url, 'http://x');
    const t = db.tokens[url.searchParams.get('token') || ''];
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== '/ws' || !t || !key) { sock.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
    const me = t.uuid;
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const old = sockets.get(me); if (old && old !== sock) old.destroy();
    sockets.set(me, sock); sock.setNoDelay(true);
    let buf = Buffer.alloc(0); let frag = null, fragOp = 0;
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
        if (op === 0x9) { const h = Buffer.from([0x8a, payload.length]); sock.write(Buffer.concat([h, payload])); continue; }
        if (op === 0xA) continue;
        if (op === 0x0) { if (!frag) continue; frag = Buffer.concat([frag, payload]); if (fin) { onWsMessage(me, fragOp, frag); frag = null; } continue; }
        if (!fin) { frag = payload; fragOp = op; continue; }
        onWsMessage(me, op, payload);
      }
    });
    const bye = () => { if (sockets.get(me) === sock) { sockets.delete(me); endCall(me); } };
    sock.on('close', bye); sock.on('error', bye);
  } catch (e) { try { sock.destroy(); } catch (e2) { /* ignore */ } }
});
server.listen(PORT, () => console.log(`Kyoto server running on port ${PORT}`));
