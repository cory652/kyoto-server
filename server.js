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
      const raw = Buffer.concat(chunks).toString('utf8');
      if (/application\/x-www-form-urlencoded/i.test(req.headers['content-type'] || '')) return resolve(Object.fromEntries(new URLSearchParams(raw)));
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('bad json')); }
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
  // <img> tags can't send headers: the staff panel passes ?auth=<token> for Hub images only
  const qa = !m && req.method === 'GET' && req.url.startsWith('/hub/image') ? new URL(req.url, 'http://x').searchParams.get('auth') : null;
  if (!m && !qa) return null;
  const t = db.tokens[m ? m[1] : qa];
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
    for (const [t, v] of Object.entries(db.tokens)) if (v.uuid === uuid && !v.web) delete db.tokens[t];
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
    const kycos = {};
    for (const u of kyoto) if (db.kycos && db.kycos[u] && Object.keys(db.kycos[u].slots || {}).length) kycos[u] = db.kycos[u].version;
    send(res, 200, { players, kyoto, plus: kyoto.filter(isPlus), kycos });
  },
};

// ---------------- profiles ----------------
const MEDIA_TYPES = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const MEDIA_KINDS = { // kind -> allowed extensions, max bytes
  video: [['mp4', 'gif', 'webm'], 15000000], audio: [['mp3', 'wav', 'ogg'], 10000000],
  avatar: [['png', 'jpg', 'jpeg', 'gif'], 3000000], image: [['png', 'jpg', 'jpeg'], 6000000] };
function cleanStr(v, max) { return String(v || '').replace(/[\u0000-\u001f]/g, '').slice(0, max); }
function mediaFile(uuid, kind) { return path.join(MEDIA, `${uuid.replace(/[^a-f0-9-]/g, '')}_${kind}`); }
const int = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const hex = (v, d) => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d;
function hubBlocked(t) { return blocked(t); }
function linkSafe(l) {
  const u = String(l).toLowerCase();
  if (u.includes('.onion') || /^(https?:\/\/)?\d{1,3}(\.\d{1,3}){3}/.test(u)) return false;
  if (['bit.ly', 'tinyurl', 't.co/', 'cutt.ly', 'is.gd', 'rb.gy', 'shorturl', 'grabify', 'iplogger', '2no.co'].some(x => u.includes(x))) return false;
  return !blocked(u);
}
const LINK_RX = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;

// Profile text + look. Fields that aren't sent keep their old value, so the mod and the website can both edit.
routes['PUT /profile'] = async (req, res, body, me) => {
  if (isBanned(me)) return fail(res, 403, 'Banned');
  const old = db.profiles[me] || {};
  const p = Object.assign({}, old);
  const has = k => Object.prototype.hasOwnProperty.call(body, k);
  const textOk = t => !hubBlocked(t);
  if (has('displayName')) { const v = cleanStr(body.displayName, 24); if (!textOk(v)) return fail(res, 400, 'That name isn\'t allowed'); p.displayName = v; }
  if (has('bio')) { const v = cleanStr(body.bio, 300); if (!textOk(v)) return fail(res, 400, 'Your bio has a word that isn\'t allowed'); p.bio = v; }
  if (has('location')) { const v = cleanStr(body.location, 40); if (!textOk(v)) return fail(res, 400, 'That location isn\'t allowed'); p.location = v; }
  if (has('tags')) p.tags = (Array.isArray(body.tags) ? body.tags : []).slice(0, 8).map(t => cleanStr(t, 18)).filter(t => t && textOk(t));
  if (has('links')) p.links = (Array.isArray(body.links) ? body.links : []).slice(0, 8).map(l => cleanStr(l, 160)).filter(l => LINK_RX.test(l) && linkSafe(l));
  if (has('hue')) p.hue = int(body.hue, 0, 360, 262);
  if (has('nameEffect')) p.nameEffect = int(body.nameEffect, 0, 4, 1);
  if (has('bgEffect')) p.bgEffect = int(body.bgEffect, 0, 6, 1);
  if (has('accent')) p.accent = hex(body.accent, null);
  if (has('textColor')) p.textColor = hex(body.textColor, '#ffffff');
  if (has('layout')) p.layout = int(body.layout, 0, 2, 0);
  if (has('cardStyle')) p.cardStyle = int(body.cardStyle, 0, 3, 0);
  if (has('cardOpacity')) p.cardOpacity = int(body.cardOpacity, 0, 100, 62);
  if (has('bgDim')) p.bgDim = int(body.bgDim, 0, 90, 45);
  if (has('font')) p.font = ['poppins', 'inter', 'mono', 'serif', 'pixel'].includes(body.font) ? body.font : 'poppins';
  if (has('showViews')) p.showViews = !!body.showViews;
  if (has('avatarGlow')) p.avatarGlow = !!body.avatarGlow;
  if (has('cursorTrail')) p.cursorTrail = !!body.cursorTrail;
  if (has('typewriterBio')) p.typewriterBio = !!body.typewriterBio;
  if (has('showLinks')) p.showLinks = !!body.showLinks;
  if (has('showDiscord')) p.showDiscord = !!body.showDiscord;
  if (has('unlinkDiscord') && body.unlinkDiscord) delete p.discord;
  p.views = old.views || 0;
  p.updated = Date.now();
  db.profiles[me] = p;
  save(); send(res, 200, { ok: true });
};
routes['PUT /profile/media'] = async (req, res, body, me) => {
  const kind = Object.prototype.hasOwnProperty.call(MEDIA_KINDS, body.kind) ? body.kind : null;
  if (!kind) return fail(res, 400, 'kind must be video, audio, avatar or image');
  if (isBanned(me)) return fail(res, 403, 'Banned');
  const p = db.profiles[me] || (db.profiles[me] = { views: 0 });
  const file = mediaFile(me, kind);
  if (body.remove) {
    try { fs.unlinkSync(file); } catch (e) { /* none */ }
    p[kind + 'Ext'] = null; save(); return send(res, 200, { ok: true });
  }
  const ext = String(body.ext || '').toLowerCase();
  const [allowed, max] = MEDIA_KINDS[kind];
  if (!allowed.includes(ext)) return fail(res, 400, `${kind} must be ${allowed.join(', ')}`);
  const buf = Buffer.from(String(body.data || ''), 'base64');
  if (!buf.length || buf.length > max) return fail(res, 400, `File too big (max ${max / 1000000} MB)`);
  fs.writeFileSync(file, buf);
  p[kind + 'Ext'] = ext === 'jpeg' ? 'jpg' : ext;
  if (kind === 'audio') p.audioName = cleanStr(body.fileName, 60);
  if (kind === 'video' && p.imageExt) { try { fs.unlinkSync(mediaFile(me, 'image')); } catch (e) { /* none */ } p.imageExt = null; }
  if (kind === 'image' && p.videoExt) { try { fs.unlinkSync(mediaFile(me, 'video')); } catch (e) { /* none */ } p.videoExt = null; }
  p.updated = Date.now();
  save(); send(res, 200, { ok: true });
};

// ---------------- website login: one-time code from the game (/kyoto link) ----------------
const linkCodes = new Map(); // code -> { uuid, exp }
routes['POST /link/code'] = async (req, res, body, me) => {
  for (const [c, v] of linkCodes) if (v.uuid === me || v.exp < Date.now()) linkCodes.delete(c);
  let code; do { code = String(crypto.randomInt(100000, 1000000)); } while (linkCodes.has(code));
  linkCodes.set(code, { uuid: me, exp: Date.now() + 10 * 60000, tries: 0 });
  send(res, 200, { code, expiresIn: 600 });
};
const webFails = new Map();
routes['POST /web/login'] = async (req, res, body) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const f = webFails.get(ip) || { n: 0, at: 0 };
  if (f.n >= 10 && Date.now() - f.at < 10 * 60000) return fail(res, 429, 'Too many wrong codes, wait 10 minutes');
  const code = String(body.code || '').replace(/\D/g, '');
  const name = String(body.name || '').trim().toLowerCase();
  const v = linkCodes.get(code);
  const uuid = v && v.exp > Date.now() ? v.uuid : null;
  if (!uuid || (name && db.users[uuid].name.toLowerCase() !== name)) {
    webFails.set(ip, { n: f.n + 1, at: Date.now() });
    return fail(res, 401, 'That code is wrong or expired. Type /kyoto link in Minecraft for a new one.');
  }
  linkCodes.delete(code); webFails.delete(ip);
  for (const [t, tv] of Object.entries(db.tokens)) if (tv.uuid === uuid && tv.web && Date.now() - tv.created > 30 * 86400000) delete db.tokens[t];
  const token = crypto.randomBytes(32).toString('hex');
  db.tokens[token] = { uuid, created: Date.now(), web: true };
  save();
  send(res, 200, { token, uuid, name: db.users[uuid].name });
};
routes['POST /web/logout'] = async (req, res, body, me) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (m && db.tokens[m[1]] && db.tokens[m[1]].web) delete db.tokens[m[1]];
  save(); send(res, 200, { ok: true });
};
routes['GET /me'] = async (req, res, body, me) => {
  const u = db.users[me] || {};
  send(res, 200, { uuid: me, name: u.name, owner: OWNERS.includes(String(u.name || '').toLowerCase()), staff: isStaff(me), plus: isPlus(me), plusUntil: (db.plus[me] || {}).until || 0, profile: db.profiles[me] || {} });
};

// ---------------- Kyoto jars for the launcher (put files in ./jars as kyoto-<mc version>.jar) ----------------
const JARS = path.join(__dirname, 'jars');
// Jars too big for GitHub's web upload (25 MB) go in a GitHub Release instead; list their links in jars/links.json:
//   { "26.3": { "url": "https://github.com/you/kyoto-server/releases/download/v6.3.0/kyoto-26.3.jar", "version": "6.3.0" } }
function jarLinks() {
  try { return JSON.parse(fs.readFileSync(path.join(JARS, 'links.json'), 'utf8')); } catch (e) { return {}; }
}
function jarList() {
  let local = [];
  try { local = fs.readdirSync(JARS).map(f => /^kyoto-(.+)\.jar$/.exec(f)).filter(Boolean).map(m => m[1]); } catch (e) { /* none */ }
  return [...new Set([...Object.keys(jarLinks()), ...local])];
}
const jarHash = new Map(); // file -> { mtime, sha1, size }
routes['GET /mods/list'] = async (req, res) => {
  const files = {}, links = jarLinks();
  for (const v of jarList()) {
    const l = links[v];
    if (l && /^https:\/\//.test(l.url || '') && !/YOUR_GITHUB_NAME/.test(l.url)) { files[v] = { url: l.url, version: String(l.version || l.url) }; continue; }
    const f = path.join(JARS, `kyoto-${v}.jar`); if (!fs.existsSync(f)) continue;
    const st = fs.statSync(f);
    let h = jarHash.get(f);
    if (!h || h.mtime !== st.mtimeMs) { h = { mtime: st.mtimeMs, sha1: crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'), size: st.size }; jarHash.set(f, h); }
    files[v] = { sha1: h.sha1, size: h.size };
  }
  send(res, 200, { versions: Object.keys(files), files, release: db.release });
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
H.staff = H.staff || []; H.banInfo = H.banInfo || {}; H.mutes = H.mutes || {}; H.audit = H.audit || [];
const isStaff = u => isOwnerUuid(u) || H.staff.includes(u);
function isBanned(u) {
  if (!H.bans.includes(u)) return false;
  const b = H.banInfo[u];
  if (b && b.until && b.until < Date.now()) { H.bans = H.bans.filter(x => x !== u); delete H.banInfo[u]; save(); return false; }
  return true;
}
function isMuted(u) { const t = H.mutes[u]; if (!t) return false; if (t < Date.now()) { delete H.mutes[u]; return false; } return true; }
const lastAct = new Map();
function slowmode(u, ms) { const t = lastAct.get(u) || 0; if (Date.now() - t < ms) return true; lastAct.set(u, Date.now()); return false; }
function checkText(res, me, text) {
  if (isBanned(me)) { fail(res, 403, 'You are banned from the Kyoto Hub'); return false; }
  if (isMuted(me)) { fail(res, 403, 'You are muted until ' + new Date(H.mutes[me]).toUTCString()); return false; }
  if (blocked(text)) { fail(res, 400, 'Blocked by the filter (bad words or unsafe content)'); return false; }
  return true;
}
const pub = (p, me) => ({ id: p.id, type: p.type, slot: p.slot, uuid: p.uuid, name: nameOf(p.uuid), title: p.title, text: p.text, at: p.at,
  likes: p.likes.length, liked: p.likes.includes(me), hasImage: !!p.image, pending: !!p.pending, owner: isOwnerUuid(p.uuid) });
const q = req => new URL(req.url, 'http://x').searchParams;

routes['GET /hub/posts'] = async (req, res, body, me) => {
  const type = q(req).get('type') || 'post';
  const mod = isStaff(me);
  const list = H.posts.filter(p => p.type === type && (!p.pending || mod || p.uuid === me));
  const sort = q(req).get('sort') === 'top' ? (a, b) => b.likes.length - a.likes.length : (a, b) => b.at - a.at;
  send(res, 200, { posts: list.sort(sort).slice(0, 60).map(p => pub(p, me)), mod });
};
routes['POST /hub/post'] = async (req, res, body, me) => {
  const type = ['post', 'preset', 'cape', 'kycos'].includes(body.type) ? body.type : 'post';
  const title = clean(body.title, 40), text = clean(body.text, 300);
  if (!checkText(res, me, title + ' ' + text)) return;
  if (slowmode(me + 'post', 30000)) return fail(res, 429, 'Wait 30 seconds between posts');
  if (!title && !text) return fail(res, 400, 'Write something first');
  const post = { id: H.seq++, type, uuid: me, title, text, at: Date.now(), likes: [] };
  if (type === 'preset') {
    try { const d = JSON.parse(String(body.data || '')); if (String(body.data).length > 40000) throw 0; post.data = JSON.stringify({ modules: d.modules || {}, choices: d.choices || {}, crosshair: d.crosshair || null, vfx: d.vfx || null }); }
    catch (e) { return fail(res, 400, 'Bad preset'); }
  }
  if (type === 'kycos') {
    const k = checkKycos(body.data);
    if (k.error) return fail(res, 400, k.error);
    post.data = k.json;
    post.slot = k.slot;
    post.pending = REQUIRE_APPROVAL && !isStaff(me);
  }
  if (type === 'cape') {
    const buf = Buffer.from(String(body.image || ''), 'base64');
    const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), isGif = buf.slice(0, 3).toString() === 'GIF';
    if ((!isPng && !isGif) || buf.length > 1500000) return fail(res, 400, 'Cape must be a PNG or GIF under 1.5 MB');
    post.image = isGif ? 'gif' : 'png';
    fs.writeFileSync(path.join(HUB_IMG, String(post.id)), buf);
    post.pending = REQUIRE_APPROVAL && !isStaff(me);
  }
  H.posts.push(post); if (H.posts.length > 2000) H.posts.shift();
  save(); send(res, 200, { ok: true, pending: !!post.pending });
};
routes['GET /hub/image'] = async (req, res, body, me) => {
  const id = Number(q(req).get('id')); const p = H.posts.find(x => x.id === id);
  if (!p || !p.image || (p.pending && !isStaff(me) && p.uuid !== me)) return fail(res, 404, 'no image');
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
  if (p.uuid !== me && !isStaff(me)) return fail(res, 403, 'Not yours');
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
const YT = /^https:\/\/(www\.|m\.|music\.|clips\.|player\.)?(youtube\.com|youtu\.be|twitch\.tv|kick\.com|vimeo\.com|dailymotion\.com|dai\.ly|streamable\.com)\//i;
function screenOut(s) { return Object.assign({}, s, { owner: nameOf(s.ownerUuid) }); }
routes['GET /screens'] = async (req, res, body, me) => {
  const key = String(q(req).get('server') || '').toLowerCase().slice(0, 80);
  send(res, 200, { now: Date.now(), screens: (db.screens[key] || []).map(screenOut) });
};
routes['POST /screens/save'] = async (req, res, body, me) => {
  const key = String(body.server || '').toLowerCase().slice(0, 80); if (!key) return fail(res, 400, 'No server');
  if (isBanned(me)) return fail(res, 403, 'Banned');
  const url = String(body.url || '').slice(0, 300);
  if (url && !YT.test(url)) return fail(res, 400, 'Only YouTube, Twitch, Kick, Vimeo, Dailymotion or Streamable links can go on screens');
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

// ---------------- launcher: news + latest version (post them at /admin) ----------------
// Set ADMIN_KEY on Render (Environment) to a long secret. Without it, posting is disabled.
const ADMIN_KEY = process.env.ADMIN_KEY || '';
if (!db.news) db.news = [];
if (!db.release) db.release = { version: process.env.MOD_VERSION || '6.2.0', url: process.env.KYOTO_JAR_URL || '', notes: '' };
const adminFails = new Map();
function isAdmin(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const f = adminFails.get(ip) || { n: 0, at: 0 };
  if (f.n >= 8 && Date.now() - f.at < 15 * 60000) { fail(res, 429, 'Too many wrong keys, wait 15 minutes'); return false; }
  const key = String(req.headers['x-admin-key'] || '');
  const a = Buffer.from(key), b = Buffer.from(ADMIN_KEY);
  if (!ADMIN_KEY || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    adminFails.set(ip, { n: f.n + 1, at: Date.now() }); fail(res, 403, 'Wrong admin key'); return false;
  }
  adminFails.delete(ip); return true;
}
const NEWS_TAGS = ['Update', 'News', 'Event', 'Cosmetics', 'Fix', 'Sneak peek'];
routes['GET /news'] = async (req, res) => {
  const list = db.news.slice().sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at)).slice(0, 30);
  send(res, 200, { news: list, release: db.release });
};
routes['GET /version'] = async (req, res) => send(res, 200, db.release);
routes['POST /news'] = async (req, res, body) => {
  if (!isAdmin(req, res)) return;
  const title = cleanStr(body.title, 90).trim(); const text = String(body.body || '').replace(/\r/g, '').slice(0, 4000).trim();
  if (!title || !text) return fail(res, 400, 'Title and text are needed');
  const image = String(body.image || '').trim();
  if (image && !/^https:\/\/[^\s"'<>]+$/i.test(image)) return fail(res, 400, 'Image must be an https:// link');
  const item = { id: crypto.randomBytes(5).toString('hex'), title, body: text, tag: NEWS_TAGS.includes(body.tag) ? body.tag : 'News',
    image, pinned: !!body.pinned, at: Date.now() };
  if (body.id) { const old = db.news.find(n => n.id === body.id); if (old) { Object.assign(old, item, { id: old.id, at: old.at, edited: Date.now() }); save(); return send(res, 200, { ok: true, id: old.id }); } }
  db.news.push(item); if (db.news.length > 200) db.news.shift(); save(); send(res, 200, { ok: true, id: item.id });
};
routes['POST /news/delete'] = async (req, res, body) => {
  if (!isAdmin(req, res)) return;
  db.news = db.news.filter(n => n.id !== body.id); save(); send(res, 200, { ok: true });
};
routes['POST /version'] = async (req, res, body) => {
  if (!isAdmin(req, res)) return;
  const url = String(body.url || '').trim();
  if (url && !/^https:\/\/[^\s"'<>]+\.jar(\?[^\s"'<>]*)?$/i.test(url)) return fail(res, 400, 'Download link must be an https:// link to a .jar');
  db.release = { version: cleanStr(body.version, 20).trim() || db.release.version, url, notes: String(body.notes || '').slice(0, 2000), at: Date.now() };
  save(); send(res, 200, { ok: true });
};
routes['GET /admin'] = async (req, res) => send(res, 200, Buffer.from(ADMIN_PAGE), 'text/html; charset=utf-8');
const ADMIN_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kyoto · News admin</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,system-ui,sans-serif;background:radial-gradient(1200px 600px at 20% -10%,#1d2030,#08080b 60%);color:#e8eaee;min-height:100vh}
.wrap{max-width:980px;margin:0 auto;padding:40px 20px}h1{font-size:28px;margin:0 0 4px;letter-spacing:.5px}p.sub{color:#8d929c;margin:0 0 28px}
.card{background:rgba(20,21,27,.75);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px;margin-bottom:18px;backdrop-filter:blur(12px)}
label{display:block;font-size:12px;color:#9aa0aa;margin:12px 0 6px;text-transform:uppercase;letter-spacing:1.2px}
input,textarea,select{width:100%;background:#0e0f14;border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:12px;padding:12px 14px;font:inherit;outline:none}
input:focus,textarea:focus,select:focus{border-color:#cfd3dc}textarea{min-height:160px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}button{background:linear-gradient(180deg,#fff,#cfd3dc);color:#0b0b0e;border:0;border-radius:999px;padding:12px 22px;font-weight:700;cursor:pointer;margin-top:16px}
button.ghost{background:transparent;color:#e8eaee;border:1px solid rgba(255,255,255,.15)}.item{display:flex;gap:14px;align-items:center;padding:12px 0;border-top:1px solid rgba(255,255,255,.06)}
.tag{font-size:11px;padding:3px 9px;border-radius:999px;background:#e8eaee;color:#0b0b0e;font-weight:700}.muted{color:#8d929c;font-size:13px}.grow{flex:1}#msg{margin-top:12px;color:#a7f3d0}
</style></head><body><div class="wrap"><h1>Kyoto news</h1><p class="sub">Posts show up in the Kyoto launcher (and anywhere else that reads /news).</p>
<div class="card"><label>Admin key</label><input id="key" type="password" placeholder="The ADMIN_KEY you set on Render"></div>
<div class="card"><h3 style="margin:0">New post</h3><input type="hidden" id="id">
<div class="row"><div><label>Title</label><input id="title" maxlength="90"></div><div><label>Tag</label><select id="tag">${NEWS_TAGS.map(t => `<option>${t}</option>`).join('')}</select></div></div>
<label>Image link (optional, https://...)</label><input id="image" placeholder="https://i.imgur.com/....png">
<label>Text (blank line = new paragraph, - at the start = bullet)</label><textarea id="body"></textarea>
<label><input type="checkbox" id="pinned" style="width:auto"> Pin to the top</label>
<button onclick="post()">Publish</button> <button class="ghost" onclick="clearForm()">Clear</button><div id="msg"></div></div>
<div class="card"><h3 style="margin:0 0 6px">Latest version</h3><p class="muted">The launcher downloads this .jar when it changes.</p>
<div class="row"><div><label>Version</label><input id="ver"></div><div><label>Download link (.jar, https)</label><input id="url" placeholder="https://github.com/you/kyoto/releases/download/v6.2.0/kyoto-client-6.2.0.jar"></div></div>
<label>What's new</label><textarea id="notes" style="min-height:90px"></textarea><button onclick="saveVer()">Save version</button></div>
<div class="card"><h3 style="margin:0">Posts</h3><div id="list" class="muted">Loading...</div></div></div>
<script>
const $=id=>document.getElementById(id);$('key').value=localStorage.k||'';$('key').oninput=e=>localStorage.k=e.target.value;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Admin-Key':$('key').value},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j}
let NEWS=[];async function load(){const j=await api('/news');NEWS=j.news;$('ver').value=j.release.version||'';$('url').value=j.release.url||'';$('notes').value=j.release.notes||'';
$('list').innerHTML=NEWS.length?NEWS.map(n=>'<div class="item"><span class="tag">'+esc(n.tag)+'</span><div class="grow"><b>'+(n.pinned?'📌 ':'')+esc(n.title)+'</b><div class="muted">'+new Date(n.at).toLocaleString()+'</div></div><button class="ghost" onclick="edit(\\''+n.id+'\\')">Edit</button><button class="ghost" onclick="del(\\''+n.id+'\\')">Delete</button></div>').join(''):'No posts yet.'}
function clearForm(){['id','title','image','body'].forEach(k=>$(k).value='');$('pinned').checked=false}
function edit(id){const n=NEWS.find(x=>x.id===id);$('id').value=n.id;$('title').value=n.title;$('tag').value=n.tag;$('image').value=n.image||'';$('body').value=n.body;$('pinned').checked=!!n.pinned;scrollTo(0,0)}
async function post(){try{await api('/news',{id:$('id').value,title:$('title').value,tag:$('tag').value,image:$('image').value,body:$('body').value,pinned:$('pinned').checked});$('msg').textContent='Published ✓';clearForm();load()}catch(e){$('msg').textContent=e.message}}
async function del(id){if(!confirm('Delete this post?'))return;try{await api('/news/delete',{id});load()}catch(e){alert(e.message)}}
async function saveVer(){try{await api('/version',{version:$('ver').value,url:$('url').value,notes:$('notes').value});alert('Saved ✓')}catch(e){alert(e.message)}}
load();
</script></body></html>`;
// ---------------- Kyoto Blox now-playing relay (memory only) ----------------
const BLOX_NP = new Map();   // robloxUserId -> { key, title, artist, playing, pos, dur, song, lines, seen }
const BLOX_KEYS = new Map(); // robloxUserId -> the Kyoto Blox install that claimed it first (stops others overwriting it)
setInterval(() => { for (const [k, v] of BLOX_NP) if (Date.now() - v.seen > 120000) BLOX_NP.delete(k); }, 60000).unref();
routes['POST /blox/np'] = async (req, res, body) => {
  const id = String(body.userId || ''); const key = String(body.key || '');
  if (!/^\d{1,20}$/.test(id) || !/^[a-f0-9]{32}$/.test(key)) return fail(res, 400, 'bad request');
  const owner = BLOX_KEYS.get(id);
  if (owner && owner !== key) return send(res, 200, { ok: false, error: 'This Roblox account is linked to another Kyoto Blox' });
  BLOX_KEYS.set(id, key);
  const prev = BLOX_NP.get(id) || {};
  const e = { key, title: cleanStr(body.title, 120), artist: cleanStr(body.artist, 120), playing: !!body.playing, pos: Math.max(0, Number(body.pos) || 0),
    dur: Math.max(0, Number(body.dur) || 0), song: cleanStr(body.song, 16), seen: Date.now(), lines: prev.song === cleanStr(body.song, 16) ? prev.lines : [] };
  if (Array.isArray(body.lines)) e.lines = body.lines.slice(0, 400).filter(l => Array.isArray(l)).map(l => [Math.max(0, Number(l[0]) || 0), hubBlocked(String(l[1] || '')) ? '***' : cleanStr(l[1], 140)]);
  BLOX_NP.set(id, e);
  send(res, 200, { ok: true, needLines: !!e.song && !e.lines.length });
};

// ---------------- Kyoto+ (optional supporter badge, paid through Ko-fi) ----------------
// Ko-fi > Settings > API > Webhook URL = https://<your server>/kofi, and copy the Verification Token into the
// KOFI_TOKEN environment variable on Render. Buyers type their Minecraft name in the Ko-fi message box.
db.plus = db.plus || {};
const KOFI_TOKEN = process.env.KOFI_TOKEN || '';
const KOFI_URL = process.env.KOFI_URL || '';
function isPlus(u) { const p = db.plus[u]; return !!p && (p.until === 0 || p.until > Date.now()) || isOwnerUuid(u); }
function grantPlus(u, days, source) {
  const now = Date.now(); const cur = db.plus[u];
  const base = cur && cur.until > now ? cur.until : now;
  db.plus[u] = { since: cur ? cur.since : now, until: days ? base + days * 86400000 : 0, source };
}
routes['POST /kofi'] = async (req, res, body) => {
  let d = {}; try { d = JSON.parse(body.data || '{}'); } catch (e) { return fail(res, 400, 'bad data'); }
  if (!KOFI_TOKEN || d.verification_token !== KOFI_TOKEN) return fail(res, 403, 'bad token');
  const text = `${d.message || ''} ${d.from_name || ''}`;
  let who = null;
  for (const m of text.matchAll(/[A-Za-z0-9_]{3,16}/g)) { const u = byName(m[0]); if (u) { who = u; break; } }
  db.kofiLog = (db.kofiLog || []).slice(-200);
  db.kofiLog.push({ at: Date.now(), name: d.from_name || '', amount: d.amount || '', type: d.type || '', tier: d.tier_name || '', matched: who ? nameOf(who) : '' });
  if (who) { grantPlus(who, 32, 'kofi'); audit(who, 'kyoto+ (ko-fi)', nameOf(who), `${d.type || ''} ${d.amount || ''}`); }
  save();
  send(res, 200, { ok: true, matched: !!who });
};
routes['POST /mod/plus'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; const u = byName(body.name); if (!u) return fail(res, 404, 'Unknown player');
  const days = Math.max(0, Math.min(3650, Number(body.days) || 0));
  if (body.remove) { delete db.plus[u]; audit(me, 'remove kyoto+', nameOf(u)); }
  else { grantPlus(u, days, 'staff'); audit(me, 'give kyoto+', nameOf(u), days ? days + ' days' : 'forever'); }
  save(); send(res, 200, { ok: true });
};
routes['GET /mod/kofi'] = async (req, res, body, me) => { if (!staffOnly(res, me)) return; send(res, 200, { log: (db.kofiLog || []).slice().reverse() }); };

// ---------------- shared client config (so nobody sets things up by hand) ----------------
// DISCORD_APP_ID on Render = one Discord application for everyone's "Playing Kyoto Client" status.
routes['GET /config'] = async (req, res) => send(res, 200, { discordAppId: process.env.DISCORD_APP_ID || '', kofiUrl: KOFI_URL, site: process.env.SITE_URL || '' });

// ---------------- TikTok LIVE gifts (unofficial: TikTok has no public LIVE API) ----------------
// The mod asks the server to watch a username; the server keeps one connection per Kyoto player and the mod
// polls for new events every second. Needs the "tiktok-live-connector" package (npm install on Render).
const TT = new Map(); // uuid -> { username, conn, events: [], seq, lastPoll, state }
let TTLib = null;
async function ttLib() { if (!TTLib) TTLib = await import('tiktok-live-connector'); return TTLib; }
function ttPush(t, ev) { ev.seq = ++t.seq; ev.at = Date.now(); t.events.push(ev); if (t.events.length > 200) t.events.shift(); }
function ttUser(u) { u = u || {}; return { id: u.uniqueId || '', name: cleanStr(u.nickname || u.uniqueId || 'Someone', 40), avatar: (u.profilePicture && (u.profilePicture.url || u.profilePicture.urls || [])[0]) || u.profilePictureUrl || '' }; }
function ttStop(uuid) { const t = TT.get(uuid); if (!t) return; try { t.conn && t.conn.disconnect(); } catch (e) { /* */ } TT.delete(uuid); }
setInterval(() => { for (const [u, t] of TT) if (Date.now() - t.lastPoll > 90000) ttStop(u); }, 30000).unref();
routes['POST /tiktok/connect'] = async (req, res, body, me) => {
  const username = String(body.username || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_.]{2,24}$/.test(username)) return fail(res, 400, 'That isn\'t a TikTok username');
  if (TT.size >= 60 && !TT.has(me)) return fail(res, 503, 'Too many people connected right now, try again soon');
  ttStop(me);
  const t = { username, conn: null, events: [], seq: 0, lastPoll: Date.now(), state: 'connecting' };
  TT.set(me, t);
  try {
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await ttLib();
    const conn = new TikTokLiveConnection(username, { enableExtendedGiftInfo: true, processInitialData: false, signApiKey: process.env.EULER_API_KEY || undefined });
    t.conn = conn;
    conn.on(WebcastEvent.GIFT, d => {
      const g = d.giftDetails || {}; const ex = d.extendedGiftInfo || {};
      const streaky = (g.giftType === 1);
      ttPush(t, { type: 'gift', user: ttUser(d.user), gift: cleanStr(g.giftName || ex.name || d.giftName || 'Gift', 40), giftId: d.giftId || 0,
        count: d.repeatCount || 1, done: !streaky || !!d.repeatEnd, coins: g.diamondCount || ex.diamond_count || d.diamondCount || 0,
        image: ((ex.image || {}).url_list || [])[0] || '' });
    });
    if (WebcastEvent.FOLLOW) conn.on(WebcastEvent.FOLLOW, d => ttPush(t, { type: 'follow', user: ttUser(d.user) }));
    if (WebcastEvent.SHARE) conn.on(WebcastEvent.SHARE, d => ttPush(t, { type: 'share', user: ttUser(d.user) }));
    if (WebcastEvent.SUPER_FAN) conn.on(WebcastEvent.SUPER_FAN, d => ttPush(t, { type: 'superfan', user: ttUser(d.user) }));
    if (WebcastEvent.LIKE) conn.on(WebcastEvent.LIKE, d => { t.likes = (d.totalLikeCount || ((t.likes || 0) + (d.likeCount || 0))); const step = 1000 * Math.floor(t.likes / 1000); if (step > (t.likeStep || 0)) { t.likeStep = step; ttPush(t, { type: 'likes', user: ttUser(d.user), count: step }); } });
    if (WebcastEvent.STREAM_END) conn.on(WebcastEvent.STREAM_END, () => { t.state = 'ended'; ttPush(t, { type: 'state', state: 'ended' }); });
    if (ControlEvent && ControlEvent.DISCONNECTED) conn.on(ControlEvent.DISCONNECTED, () => { if (t.state !== 'ended') t.state = 'disconnected'; });
    await conn.connect();
    t.state = 'live';
    send(res, 200, { ok: true, state: 'live' });
  } catch (e) {
    ttStop(me);
    const msg = String(e && e.message || e);
    send(res, 200, { ok: false, error: /Cannot find (module|package)|ERR_MODULE_NOT_FOUND/.test(msg) ? 'TikTok support isn\'t installed on the server yet' : /offline|not (currently )?live|LIVE has ended|isn't online|UserOfflineError/i.test(msg) ? `@${username} isn't live right now` : 'Couldn\'t connect to TikTok: ' + msg.slice(0, 120) });
  }
};
routes['POST /tiktok/disconnect'] = async (req, res, body, me) => { ttStop(me); send(res, 200, { ok: true }); };
routes['GET /tiktok/events'] = async (req, res, body, me) => {
  const t = TT.get(me);
  if (!t) return send(res, 200, { state: 'off', events: [] });
  t.lastPoll = Date.now();
  const since = Number(q(req).get('since')) || 0;
  send(res, 200, { state: t.state, username: t.username, seq: t.seq, events: t.events.filter(e => e.seq > since) });
};

// ---------------- CurseForge (the launcher's mod browser) ----------------
// CurseForge needs an API key (free: console.curseforge.com). It stays here on the server, never in the launcher.
const CF_KEY = process.env.CF_API_KEY || '';
const cfCache = new Map(); // url -> { at, body }
async function cf(pathAndQuery) {
  if (!CF_KEY) { const e = new Error('CurseForge isn\'t set up on the Kyoto server yet (CF_API_KEY)'); e.code = 503; throw e; }
  const hit = cfCache.get(pathAndQuery);
  if (hit && Date.now() - hit.at < 5 * 60000) return hit.body;
  const r = await fetch('https://api.curseforge.com' + pathAndQuery, { headers: { 'x-api-key': CF_KEY, Accept: 'application/json', 'User-Agent': 'KyotoServer/1.0' } });
  if (!r.ok) { const e = new Error('CurseForge said ' + r.status); e.code = 502; throw e; }
  const body = await r.json();
  cfCache.set(pathAndQuery, { at: Date.now(), body });
  if (cfCache.size > 400) cfCache.delete(cfCache.keys().next().value);
  return body;
}
const CF_LOADER = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const cfRoute = fn => async (req, res) => { try { send(res, 200, await fn(q(req))); } catch (e) { fail(res, e.code || 500, e.message); } };
routes['GET /cf/search'] = cfRoute(p => {
  const s = new URLSearchParams({ gameId: '432', classId: String(int(p.get('classId'), 1, 99999, 6)), searchFilter: String(p.get('q') || '').slice(0, 80),
    sortField: String(int(p.get('sort'), 1, 12, 2)), sortOrder: 'desc', index: String(int(p.get('index'), 0, 9980, 0)), pageSize: String(int(p.get('pageSize'), 1, 50, 20)) });
  if (/^[\w.-]{1,20}$/.test(p.get('gameVersion') || '')) s.set('gameVersion', p.get('gameVersion'));
  if (CF_LOADER[p.get('loader')]) s.set('modLoaderType', String(CF_LOADER[p.get('loader')]));
  if (/^\d{1,8}$/.test(p.get('categoryId') || '')) s.set('categoryId', p.get('categoryId'));
  return cf('/v1/mods/search?' + s);
});
routes['GET /cf/categories'] = cfRoute(p => cf(`/v1/categories?gameId=432&classId=${int(p.get('classId'), 1, 99999, 6)}`));
routes['GET /cf/mod'] = cfRoute(async p => {
  const id = int(p.get('id'), 1, 1e9, 0);
  const [m, d] = await Promise.all([cf(`/v1/mods/${id}`), cf(`/v1/mods/${id}/description`).catch(() => ({ data: '' }))]);
  return { data: m.data, description: d.data || '' };
});
routes['GET /cf/files'] = cfRoute(p => {
  const id = int(p.get('id'), 1, 1e9, 0);
  const s = new URLSearchParams({ pageSize: '20' });
  if (/^[\w.-]{1,20}$/.test(p.get('gameVersion') || '')) s.set('gameVersion', p.get('gameVersion'));
  if (CF_LOADER[p.get('loader')]) s.set('modLoaderType', String(CF_LOADER[p.get('loader')]));
  return cf(`/v1/mods/${id}/files?` + s);
});

// ---------------- connect Discord to your Kyoto profile (OAuth, from the launcher or website) ----------------
// Render env: DISCORD_APP_ID (same app as the status), DISCORD_CLIENT_SECRET, and in the Discord app > OAuth2 > Redirects add
//   https://kyoto-server.onrender.com/link/discord/callback   (or PUBLIC_URL + /link/discord/callback)
const DISCORD_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://kyoto-server.onrender.com').replace(/\/$/, '');
const discordStates = new Map(); // state -> { uuid, exp }
routes['POST /link/discord'] = async (req, res, body, me) => {
  if (!process.env.DISCORD_APP_ID || !DISCORD_SECRET) return fail(res, 503, 'Discord linking isn\'t set up on the server yet');
  for (const [k, v] of discordStates) if (v.exp < Date.now()) discordStates.delete(k);
  const state = crypto.randomBytes(16).toString('hex');
  discordStates.set(state, { uuid: me, exp: Date.now() + 10 * 60000 });
  const u = new URL('https://discord.com/oauth2/authorize');
  u.search = new URLSearchParams({ client_id: process.env.DISCORD_APP_ID, response_type: 'code', scope: 'identify', state, prompt: 'none',
    redirect_uri: PUBLIC_URL + '/link/discord/callback' }).toString();
  send(res, 200, { url: u.toString() });
};
const donePage = (ok, msg) => Buffer.from(`<!doctype html><meta charset=utf-8><title>Kyoto</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#07070a;color:#fff;font-family:system-ui">
<div style="text-align:center"><div style="font-size:42px">${ok ? '&#10003;' : '&#10007;'}</div><h2>${msg}</h2><p style="color:#9aa0aa">You can close this tab and go back to Kyoto.</p></div>`);
routes['GET /link/discord/callback'] = async (req, res) => {
  const p = q(req); const st = discordStates.get(p.get('state') || '');
  discordStates.delete(p.get('state') || '');
  if (!st || st.exp < Date.now() || !p.get('code')) return send(res, 400, donePage(false, 'That link expired, try again'), 'text/html');
  try {
    const tr = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.DISCORD_APP_ID, client_secret: DISCORD_SECRET, grant_type: 'authorization_code', code: p.get('code'), redirect_uri: PUBLIC_URL + '/link/discord/callback' }) });
    const tok = await tr.json();
    if (!tok.access_token) throw new Error('no token');
    const ur = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + tok.access_token } });
    const du = await ur.json();
    if (!du.id) throw new Error('no user');
    const prof = db.profiles[st.uuid] || (db.profiles[st.uuid] = {});
    prof.discord = { id: String(du.id), username: cleanStr(du.global_name || du.username, 40), at: Date.now() };
    save();
    send(res, 200, donePage(true, 'Discord connected as ' + prof.discord.username.replace(/[<>&"]/g, '')), 'text/html');
  } catch (e) { send(res, 500, donePage(false, 'Couldn\'t connect Discord'), 'text/html'); }
};

// ---------------- .kycos custom cosmetics (made in the Cosmetic Builder) ----------------
// One cosmetic per slot (head, back, arm, leg). Everyone with Kyoto downloads the ones you wear.
db.kycos = db.kycos || {};
const KYCOS_SLOTS = ['head', 'back', 'arm', 'leg'];
function checkKycos(raw) {
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
  if (str.length > 450000) return { error: 'That cosmetic is too big (max 450 KB)' };
  let d; try { d = JSON.parse(str); } catch (e) { return { error: 'Not a .kycos file' }; }
  if (d.format !== 'kycos') return { error: 'Not a .kycos file' };
  if (!KYCOS_SLOTS.includes(d.slot)) return { error: 'Capes are uploaded as capes. Pick head, back, arm or leg.' };
  if (blocked(String(d.name || ''))) return { error: 'That name isn\'t allowed' };
  const out = { format: 'kycos', version: 1, name: cleanStr(d.name || 'Cosmetic', 32), author: cleanStr(d.author || '', 16), slot: d.slot, kind: d.kind === 'texture' ? 'texture' : 'voxel', mirror: !!d.mirror };
  const nums = (a, n, lo, hi) => Array.isArray(a) && a.length === n && a.every(v => Number.isFinite(v) && v >= lo && v <= hi);
  if (out.kind === 'voxel') {
    const g = d.grid || {};
    if (!nums(g.n, 3, 1, 48) || !Number.isFinite(g.vs) || g.vs < 0.25 || g.vs > 4 || !nums(g.center, 3, -64, 64)) return { error: 'Bad voxel grid' };
    const pal = (Array.isArray(d.palette) ? d.palette : []).slice(0, 256).map(c => hex(c, '#ffffff'));
    const vox = Array.isArray(d.voxels) ? d.voxels : [];
    if (!pal.length || !vox.length || vox.length > 12000) return { error: 'A cosmetic needs 1 to 12000 voxels' };
    for (const v of vox) if (!Array.isArray(v) || v.length !== 4 || v[0] < 0 || v[1] < 0 || v[2] < 0 || v[0] >= g.n[0] || v[1] >= g.n[1] || v[2] >= g.n[2] || !(v[3] >= 0 && v[3] < pal.length)) return { error: 'Bad voxel' };
    out.grid = { n: g.n.map(Math.round), vs: g.vs, center: g.center }; out.palette = pal; out.voxels = vox.map(v => v.map(Math.round));
  } else {
    const t = d.texture || {};
    const png = Buffer.from(String(t.png || ''), 'base64');
    if (!png.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || png.length > 300000) return { error: 'The picture must be a PNG under 300 KB' };
    if (!nums(t.size, 2, 0.5, 64) || !nums(t.offset, 3, -64, 64) || !nums(t.rot, 3, -360, 360)) return { error: 'Bad picture placement' };
    out.texture = { png: png.toString('base64'), size: t.size, offset: t.offset, rot: t.rot };
  }
  return { json: JSON.stringify(out), slot: out.slot };
}
routes['GET /kycos'] = async (req, res) => {
  const u = String(q(req).get('uuid') || ''); const k = db.kycos[u];
  if (!k || isBanned(u)) return send(res, 200, { slots: {}, version: 0 });
  send(res, 200, { slots: k.slots, version: k.version });
};
routes['PUT /kycos'] = async (req, res, body, me) => {
  if (isBanned(me)) return fail(res, 403, 'Banned');
  const k = db.kycos[me] || (db.kycos[me] = { slots: {}, version: 0 });
  if (body.remove) { if (KYCOS_SLOTS.includes(body.slot)) delete k.slots[body.slot]; else k.slots = {}; }
  else {
    const c = checkKycos(body.data);
    if (c.error) return fail(res, 400, c.error);
    k.slots[c.slot] = JSON.parse(c.json);
  }
  k.version = Date.now(); save();
  send(res, 200, { ok: true, slots: Object.keys(k.slots) });
};
routes['POST /kycos/equip'] = async (req, res, body, me) => {
  const p = H.posts.find(x => x.id === Number(body.id) && x.type === 'kycos' && !x.pending);
  if (!p) return fail(res, 404, 'That cosmetic is gone');
  const k = db.kycos[me] || (db.kycos[me] = { slots: {}, version: 0 });
  const d = JSON.parse(p.data); k.slots[d.slot] = d; k.version = Date.now(); save();
  send(res, 200, { ok: true, slot: d.slot });
};
routes['GET /hub/kycos'] = async (req, res, body, me) => {
  const p = H.posts.find(x => x.id === Number(q(req).get('id')) && x.type === 'kycos');
  if (!p || (p.pending && !isStaff(me) && p.uuid !== me)) return fail(res, 404, 'gone');
  send(res, 200, { data: p.data });
};
// Skins for the builder (Mojang doesn't allow browsers to load them directly).
const skinCache = new Map();
routes['GET /mcskin'] = async (req, res) => {
  const name = String(q(req).get('name') || '');
  if (!/^[A-Za-z0-9_]{2,16}$/.test(name)) return fail(res, 400, 'Bad name');
  const hit = skinCache.get(name.toLowerCase());
  if (hit && Date.now() - hit.at < 10 * 60000) { res.setHeader('X-Skin-Slim', hit.slim ? '1' : '0'); return send(res, 200, hit.buf, 'image/png'); }
  try {
    const pr = await fetch('https://api.mojang.com/users/profiles/minecraft/' + name); if (!pr.ok) return fail(res, 404, 'No player with that name');
    const { id } = await pr.json();
    const sr = await fetch('https://sessionserver.mojang.com/session/minecraft/profile/' + id); const sp = await sr.json();
    const tex = JSON.parse(Buffer.from(sp.properties.find(x => x.name === 'textures').value, 'base64').toString()).textures.SKIN;
    const ir = await fetch(tex.url.replace('http://', 'https://')); const buf = Buffer.from(await ir.arrayBuffer());
    const slim = !!(tex.metadata && tex.metadata.model === 'slim');
    skinCache.set(name.toLowerCase(), { at: Date.now(), buf, slim }); if (skinCache.size > 300) skinCache.delete(skinCache.keys().next().value);
    res.setHeader('X-Skin-Slim', slim ? '1' : '0');
    send(res, 200, buf, 'image/png');
  } catch (e) { fail(res, 502, 'Couldn\'t get that skin'); }
};

// ---------------- staff panel (website: /mod) ----------------
// Owners (OWNERS env var) are always staff. Owners can add moderators from the panel.
// Moderators can: approve/reject capes, delete posts + chat, handle reports, mute, ban (not other staff), reset profiles.
const ownerOnly = (res, me) => { if (!isOwnerUuid(me)) { fail(res, 403, 'Owners only'); return false; } return true; };
const staffOnly = (res, me) => { if (!isStaff(me)) { fail(res, 403, 'Staff only'); return false; } return true; };
function audit(me, action, target, detail) {
  H.audit.push({ at: Date.now(), by: me, action, target: target || '', detail: String(detail || '').slice(0, 160) });
  if (H.audit.length > 1000) H.audit.shift();
}
const banOf = u => Object.assign({ name: nameOf(u), uuid: u }, H.banInfo[u] || {}, { byName: H.banInfo[u] ? nameOf(H.banInfo[u].by) : '' });
function canPunish(res, me, u) {
  if (!u) { fail(res, 404, 'No Kyoto player with that name'); return false; }
  if (u === me) { fail(res, 400, "You can't do that to yourself"); return false; }
  if (isOwnerUuid(u)) { fail(res, 403, "Owners can't be punished"); return false; }
  if (isStaff(u) && !isOwnerUuid(me)) { fail(res, 403, 'Only an owner can punish staff'); return false; }
  return true;
}
function reportTarget(r) {
  if (r.kind === 'chat') { const m = H.chat.find(x => String(x.id) === String(r.id)); return m ? { name: nameOf(m.uuid), text: m.text, gone: false } : { gone: true }; }
  if (r.kind === 'user' || r.kind === 'profile') { const u = byName(r.id); return { name: u ? nameOf(u) : r.id, text: u && db.profiles[u] ? (db.profiles[u].bio || '') : '', gone: !u }; }
  const p = H.posts.find(x => String(x.id) === String(r.id));
  return p ? { name: nameOf(p.uuid), text: [p.title, p.text].filter(Boolean).join(' - '), image: p.image ? p.id : null, type: p.type, gone: false } : { gone: true };
}
routes['GET /mod/me'] = async (req, res, body, me) => send(res, 200, { name: nameOf(me), staff: isStaff(me), owner: isOwnerUuid(me) });
routes['GET /mod/overview'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return;
  const day = Date.now() - 86400000;
  send(res, 200, {
    users: Object.keys(db.users).length, online: onlineCount(), profiles: Object.keys(db.profiles).length,
    newToday: Object.values(db.users).filter(u => (u.joined || 0) > day).length,
    chatToday: H.chat.filter(m => m.at > day).length, posts: H.posts.length,
    pending: H.posts.filter(p => p.pending).length, reports: H.reports.length, bans: H.bans.filter(u => isBanned(u)).length,
    mutes: Object.keys(H.mutes).filter(u => isMuted(u)).length,
    staff: OWNERS.map(n => ({ name: n, role: 'owner' })).concat(H.staff.map(u => ({ name: nameOf(u), role: 'mod' }))),
    recent: H.audit.slice(-8).reverse().map(x => Object.assign({ byName: nameOf(x.by) }, x))
  });
};
routes['GET /mod/queue'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return;
  H.bans.forEach(isBanned); // drops expired bans
  send(res, 200, {
    pending: H.posts.filter(p => p.pending).map(p => pub(p, me)),
    reports: H.reports.slice(-100).reverse().map(r => Object.assign({ byName: nameOf(r.by), target: reportTarget(r) }, r)),
    bans: H.bans.map(nameOf), banList: H.bans.map(banOf)
  });
};
routes['POST /mod/approve'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; const p = H.posts.find(x => x.id === Number(body.id)); if (!p) return fail(res, 404, 'Already gone');
  p.pending = false; audit(me, 'approve', nameOf(p.uuid), p.title); save(); send(res, 200, { ok: true });
};
routes['POST /mod/delete'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return;
  if (body.kind === 'chat') {
    const m = H.chat.find(x => String(x.id) === String(body.id)); if (!m) return fail(res, 404, 'Already gone');
    H.chat = H.chat.filter(x => x !== m); audit(me, 'delete chat', nameOf(m.uuid), m.text);
  } else {
    const p = H.posts.find(x => String(x.id) === String(body.id)); if (!p) return fail(res, 404, 'Already gone');
    H.posts = H.posts.filter(x => x !== p); try { fs.unlinkSync(path.join(HUB_IMG, String(p.id))); } catch (e) { /* none */ }
    audit(me, p.pending ? 'reject' : 'delete post', nameOf(p.uuid), p.title || p.text);
  }
  H.reports = H.reports.filter(r => !(String(r.id) === String(body.id) && (r.kind === 'chat') === (body.kind === 'chat')));
  save(); send(res, 200, { ok: true });
};
routes['POST /mod/report/dismiss'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return;
  H.reports = H.reports.filter(r => !(r.at === Number(body.at) && r.by === body.by)); audit(me, 'dismiss report', '', ''); save(); send(res, 200, { ok: true });
};
routes['POST /mod/clearreports'] = async (req, res, body, me) => { if (!staffOnly(res, me)) return; H.reports = []; audit(me, 'clear reports'); save(); send(res, 200, { ok: true }); };
routes['POST /mod/ban'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; const u = byName(body.name); if (!canPunish(res, me, u)) return;
  const hours = Math.max(0, Math.min(24 * 365, Number(body.hours) || 0));
  if (!H.bans.includes(u)) H.bans.push(u);
  H.banInfo[u] = { reason: cleanStr(body.reason, 160) || 'No reason given', by: me, at: Date.now(), until: hours ? Date.now() + hours * 3600000 : 0 };
  if (body.wipe !== false) { H.posts = H.posts.filter(p => p.uuid !== u); H.chat = H.chat.filter(m => m.uuid !== u); }
  audit(me, 'ban', nameOf(u), (hours ? hours + 'h: ' : 'permanent: ') + H.banInfo[u].reason);
  save(); send(res, 200, { ok: true });
};
routes['POST /mod/unban'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; const u = byName(body.name); if (!u) return fail(res, 404, 'Unknown player');
  H.bans = H.bans.filter(x => x !== u); delete H.banInfo[u]; audit(me, 'unban', nameOf(u)); save(); send(res, 200, { ok: true });
};
routes['POST /mod/mute'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; const u = byName(body.name); if (!canPunish(res, me, u)) return;
  const mins = Math.max(1, Math.min(60 * 24 * 30, Number(body.minutes) || 60));
  H.mutes[u] = Date.now() + mins * 60000; audit(me, 'mute', nameOf(u), mins + ' min'); save(); send(res, 200, { ok: true });
};
routes['POST /mod/unmute'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; const u = byName(body.name); if (!u) return fail(res, 404, 'Unknown player');
  delete H.mutes[u]; audit(me, 'unmute', nameOf(u)); save(); send(res, 200, { ok: true });
};
routes['POST /mod/profile/reset'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; const u = byName(body.name); if (!canPunish(res, me, u)) return;
  for (const k of Object.keys(MEDIA_KINDS)) { try { fs.unlinkSync(mediaFile(u, k)); } catch (e) { /* none */ } }
  const views = (db.profiles[u] || {}).views || 0; db.profiles[u] = { views };
  audit(me, 'reset profile', nameOf(u)); save(); send(res, 200, { ok: true });
};
routes['GET /mod/player'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return;
  const u = byName(q(req).get('name')); if (!u) return fail(res, 404, 'No Kyoto player with that name');
  const pr = presence.get(u) || {}; const prof = db.profiles[u] || {};
  send(res, 200, {
    name: nameOf(u), uuid: u, joined: (db.users[u] || {}).joined || 0, online: isOnline(u), lastSeen: pr.lastSeen || 0, server: pr.server || '',
    owner: isOwnerUuid(u), staff: isStaff(u), plus: isPlus(u), plusUntil: (db.plus[u] || {}).until || 0, banned: isBanned(u), ban: isBanned(u) ? banOf(u) : null, muted: isMuted(u), mutedUntil: H.mutes[u] || 0,
    friends: list(db.friends, u).length, posts: H.posts.filter(p => p.uuid === u).length,
    profile: { displayName: prof.displayName || '', bio: prof.bio || '', location: prof.location || '', links: prof.links || [], views: prof.views || 0,
      media: Object.keys(MEDIA_KINDS).filter(k => prof[k + 'Ext']) },
    chat: H.chat.filter(m => m.uuid === u).slice(-20).reverse(),
    reports: H.reports.filter(r => { const t = reportTarget(r); return t.name && t.name.toLowerCase() === nameOf(u).toLowerCase(); }).length,
    history: H.audit.filter(x => x.target.toLowerCase() === nameOf(u).toLowerCase()).slice(-15).reverse().map(x => Object.assign({ byName: nameOf(x.by) }, x))
  });
};
routes['GET /mod/players'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return;
  const s = String(q(req).get('q') || '').toLowerCase();
  const out = Object.entries(db.users).filter(([u, v]) => !s || v.name.toLowerCase().includes(s))
    .sort((a, b) => (isOnline(b[0]) - isOnline(a[0])) || ((b[1].joined || 0) - (a[1].joined || 0))).slice(0, 40)
    .map(([u, v]) => ({ name: v.name, online: isOnline(u), banned: isBanned(u), muted: isMuted(u), staff: isStaff(u), owner: isOwnerUuid(u), plus: isPlus(u), joined: v.joined || 0 }));
  send(res, 200, { players: out });
};
routes['GET /mod/chat'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return;
  send(res, 200, { messages: H.chat.slice(-120).reverse().map(m => Object.assign({ name: nameOf(m.uuid), staff: isStaff(m.uuid) }, m)) });
};
routes['GET /mod/audit'] = async (req, res, body, me) => {
  if (!staffOnly(res, me)) return; send(res, 200, { log: H.audit.slice(-200).reverse().map(x => Object.assign({ byName: nameOf(x.by) }, x)) });
};
routes['POST /mod/staff/add'] = async (req, res, body, me) => {
  if (!ownerOnly(res, me)) return; const u = byName(body.name); if (!u) return fail(res, 404, 'That player has to open Kyoto once first');
  if (!H.staff.includes(u) && !isOwnerUuid(u)) H.staff.push(u); audit(me, 'add staff', nameOf(u)); save(); send(res, 200, { ok: true });
};
routes['POST /mod/staff/remove'] = async (req, res, body, me) => {
  if (!ownerOnly(res, me)) return; const u = byName(body.name); H.staff = H.staff.filter(x => x !== u); audit(me, 'remove staff', nameOf(u)); save(); send(res, 200, { ok: true });
};

// ---------------- website (static files in ./site) ----------------
const SITE = path.join(__dirname, 'site');
const SITE_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveSite(req, res, pathname) {
  // pretty URLs: /edit, /u/<name>, /download, /features -> the single page app
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || /^\/(edit|mod|u\/[A-Za-z0-9_]{1,16}|download|features|profile)\/?$/.test(rel)) rel = '/index.html';
  if (/^\/overlay\/?$/.test(rel)) rel = '/overlay.html';
  if (/^\/builder\/?$/.test(rel)) rel = '/builder.html';
  const file = path.normalize(path.join(SITE, rel));
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  const headers = { 'Content-Type': SITE_TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' };
  // videos need range requests so browsers can seek/stream them
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range && (ext === '.mp4' || ext === '.webm')) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    res.writeHead(206, Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 }));
    fs.createReadStream(file, { start, end }).pipe(res); return true;
  }
  res.writeHead(200, Object.assign(headers, { 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' }));
  fs.createReadStream(file).pipe(res); return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // Roblox game servers poll the lyrics relay for every player in them - they get their own, bigger budget
    if (limited(req.url.startsWith('/blox/np') ? 'blox:' + ip : ip) && !(req.url.startsWith('/blox/np') && (hits.get('blox:' + ip) || {}).n <= 1500)) return fail(res, 429, 'slow down');
    // the website may be hosted somewhere else (Netlify, GitHub Pages...) - let it call the API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'X-Skin-Slim');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://x');
    // browsers get the website, the mod/launcher (no text/html Accept) keep getting JSON
    if (req.method === 'GET' && (String(req.headers.accept || '').includes('text/html') || /^\/(assets|img|media|fonts)\//.test(url.pathname) || /\.(css|js|png|jpg|webp|svg|mp4|webm|woff2|ico)$/.test(url.pathname))) {
      if (url.pathname !== '/admin' && serveSite(req, res, url.pathname)) return;
    }
    const jar = /^\/mods\/kyoto-([0-9][0-9a-z.\-]{0,20})\.jar$/i.exec(url.pathname);
    if (req.method === 'GET' && jar) {
      const link = jarLinks()[jar[1]];
      if (link && /^https:\/\//.test(link.url || '') && !/YOUR_GITHUB_NAME/.test(link.url)) { res.writeHead(302, { Location: link.url }); return res.end(); }
      const f = path.join(JARS, `kyoto-${jar[1]}.jar`);
      if (!fs.existsSync(f)) return fail(res, 404, 'No Kyoto build for that Minecraft version yet');
      const st = fs.statSync(f);
      res.writeHead(200, { 'Content-Type': 'application/java-archive', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="kyoto-${jar[1]}.jar"` });
      return fs.createReadStream(f).pipe(res);
    }
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
    const prof = /^\/profile\/([A-Za-z0-9_]{1,16})(?:\/(video|audio|avatar|image))?$/.exec(url.pathname);
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
      if (!uuid || !p || isBanned(uuid)) return fail(res, 404, 'no profile');
      if (!q(req).get('noview')) { p.views = (p.views || 0) + 1; save(); }
      const badges = ['kyoto'];
      if (isPlus(uuid)) badges.unshift('plus');
      if (isOwner) badges.unshift('owner');
      const out = Object.assign({ name: db.users[uuid].name, badges }, p);
      if (p.showLinks === false) out.links = [];
      if (p.discord && p.showDiscord !== false) out.discordName = p.discord.username; delete out.discord;
      return send(res, 200, out);
    }
    // Kyoto Blox -> your Roblox games: what someone is listening to + its synced lyrics (Kyoto Lyrics kit reads this)
    const np = /^\/blox\/np\/(\d{1,20})$/.exec(url.pathname);
    if (np && req.method === 'GET') {
      const e = BLOX_NP.get(np[1]);
      if (!e || Date.now() - e.seen > 20000) return send(res, 200, { playing: false });
      const out = { playing: e.playing, title: e.title, artist: e.artist, song: e.song, pos: e.pos + (e.playing ? Date.now() - e.seen : 0), dur: e.dur };
      if (q(req).get('have') !== e.song) out.lines = e.lines;
      return send(res, 200, out);
    }
    const key = `${req.method} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) return fail(res, 404, 'not found');
    const limit = key === 'PUT /profile/media' ? 22000000 : 2500000;
    const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req, limit) : {};
    const open = key === 'GET /' || key === 'GET /stats' || key.startsWith('POST /auth/') || key === 'POST /cosmetics/bulk'
      || key === 'POST /blox/np' || key === 'POST /kofi' || key === 'GET /config' || key === 'GET /kycos' || key === 'GET /mcskin' || key.startsWith('GET /cf/') || key === 'GET /link/discord/callback' || key === 'GET /news' || key === 'GET /version' || key === 'POST /web/login' || key === 'GET /mods/list' || key === 'GET /admin' || key === 'POST /news' || key === 'POST /news/delete' || key === 'POST /version';
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
