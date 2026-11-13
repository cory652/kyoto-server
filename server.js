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
fs.mkdirSync(CAPES, { recursive: true });
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
    presence.set(me, { lastSeen: Date.now(), server: String(body.server || '').slice(0, 80) });
    send(res, 200, { online: onlineCount() });
  },

  'GET /friends': async (req, res, body, me) => {
    const friends = list(db.friends, me).map(u => ({
      uuid: u, name: (db.users[u] || {}).name || '?', online: isOnline(u),
      server: isOnline(u) ? (presence.get(u) || {}).server || '' : ''
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
    c.accessory = Math.max(0, Math.min(20, body.accessory | 0));
    c.version = Date.now();
    db.cosmetics[me] = c; save();
    send(res, 200, { ok: true });
  },
  'POST /cosmetics/bulk': async (req, res, body) => {
    const players = {};
    for (const u of (body.uuids || []).slice(0, 100)) {
      const c = db.cosmetics[u];
      if (c && (c.hasCape || c.accessory)) players[u] = c;
    }
    send(res, 200, { players });
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
server.listen(PORT, () => console.log(`Kyoto server running on port ${PORT}`));
