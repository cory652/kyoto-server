/* Kyoto Hub on the website: Chat (shared with the game + Discord), DMs + group chats, Live Rooms, Voice Rooms,
   Looking For Group, Server Reviews, Trades, and Mods for staff. Messages have stickers, reactions, replies, polls and pins. */
'use strict';
(() => {
  let tab = 'chat', dmWith = null, group = null, since = 0, timer = 0, me = null, msgs = [], pins = [], pending = null, opened = false, reply = null, convo = null;
  let STK = [], REA = ['heart', 'fire', 'lol', 'wow', 'sad', 'up', 'gg', 'skull'];
  const feed = () => $('#hubFeed'), view = () => $('#hubView');
  const headUrl = n => `https://mc-heads.net/avatar/${encodeURIComponent(n || 'MHF_Steve')}/40`;
  const loggedIn = () => !!localStorage.getItem('kyoto.token');
  const time = t => { const d = new Date(t), now = new Date(); const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return d.toDateString() === now.toDateString() ? 'Today at ' + hm : d.toLocaleDateString() + ' ' + hm; };
  const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
  const left = t => { const s = Math.max(0, (t - Date.now()) / 1000); return s < 3600 ? Math.ceil(s / 60) + ' min left' : s < 86400 ? Math.round(s / 3600) + ' h left' : Math.round(s / 86400) + ' days left'; };
  const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`).replace(/(^|\s)@([A-Za-z0-9_]{3,16})/g, (m, a, n) => `${a}<a class="ment${me && n.toLowerCase() === me.name.toLowerCase() ? ' me' : ''}" href="/u/${n}" data-link>@${n}</a>`);
  const stkUrl = id => `/img/stickers/${id}.png`, reaUrl = r => REA.includes(r) ? `/img/reactions/${r}.png` : stkUrl(r);
  const where = () => tab === 'chat' ? 'chat' : group ? 'g:' + group : dmWith ? 'dm:' + dmWith : null;
  const modeCol = m => ({ online: '#3ddc84', away: '#ffd166', busy: '#ff5d7a', invisible: '#8d919c', offline: '#5b5f6b' }[m] || '#5b5f6b');
  const modeName = m => ({ online: 'Online', away: 'Away', busy: 'Do not disturb', invisible: 'Invisible', offline: 'Offline' }[m] || 'Offline');
  const streakPill = s => s && s.n > 0 ? `<span class="streak${s.risk ? ' risk' : ''}${s.today ? ' done' : ''}" title="${s.n} day streak${s.today ? ', done today' : s.risk ? ` (ends in ${s.hoursLeft} h: say hi!)` : ''}">${icon('flame')}${s.n}</span>` : '';
  function modal(html, cls = '') {
    const box = document.createElement('div'); box.className = 'cmodal';
    box.innerHTML = `<div class="cbox sell ${cls}"><button class="cx" data-x>${icon('x')}</button>${html}</div>`;
    document.body.appendChild(box);
    box.onclick = e => { if (e.target === box || e.target.closest('[data-x]')) box.remove(); };
    return box;
  }
  const call = async (path, body, ok) => { try { const r = await api(path, { method: 'POST', body }); if (ok) toast(ok); return r; } catch (e) { toast('Couldn\'t do that', e.message); throw e; } };

  async function open() {
    opened = true;
    $('#hubLogin').hidden = loggedIn();
    if (loggedIn() && !me) {
      try { me = await api('/me'); try { localStorage.setItem('kyoto.me', JSON.stringify({ name: me.name, uuid: me.uuid })); } catch (e) { /* */ } }
      catch (e) { if (e.status === 401) { localStorage.removeItem('kyoto.token'); $('#hubLogin').hidden = false; } }
    }
    if (!STK.length) api('/stickers', { auth: false }).then(r => { STK = r.stickers; REA = r.reactions; }).catch(() => {});
    $('#hrMods').hidden = !(me && me.staff);
    renderMe();
    const m = /^\/hub\/(chat|dms|voice|lfg|servers|trades|mods)/.exec(location.pathname);
    if (location.pathname.startsWith('/rooms')) tab = 'rooms'; else if (m) tab = m[1];
    switchTab(tab, true);
    if (me) notesLoop();
  }

  function switchTab(t, keep) {
    tab = t; if (!keep) { dmWith = null; group = null; }
    reply = null; renderReply(); stkClose();
    $$('.hr').forEach(b => b.classList.toggle('on', b.dataset.ht === t));
    since = 0; msgs = []; pins = []; convo = null;
    const isFeed = t === 'chat' || t === 'dms' || t === 'mods';
    feed().innerHTML = '<div class="hub-load"></div>';
    $('#hubThreads').hidden = t !== 'dms';
    $('#hubFeed').hidden = !isFeed;
    $('#roomsView').hidden = t !== 'rooms';
    view().hidden = isFeed || t === 'rooms';
    $('#pinBar').hidden = true;
    const chatty = t === 'chat' || (t === 'dms' && (dmWith || group));
    $('#hubCompose').hidden = !loggedIn() || !chatty;
    $('#hubPoll').hidden = !(t === 'chat' || group);
    if (t !== 'rooms' && R.id) R.leave(false);
    const T = (title, sub, right) => { $('#hubTitle').innerHTML = title; $('#hubSub').innerHTML = sub; $('#hubTopR').innerHTML = right || ''; };
    if (t === 'chat') { T('# chat', 'Talk with every Kyoto player, in game, here and on Discord.'); $('#hubInput').placeholder = 'Message #chat'; }
    if (t === 'dms') {
      if (group) T('<span class="gdot"></span>Group', 'Loading…');
      else if (dmWith) T('@ ' + esc(dmWith), 'Private chat. Pictures only go to friends.');
      else T('Direct messages', 'Pick a chat on the left, or start one.', `<button class="btn sm ghost" id="dmNew">${icon('plus')} New message</button><button class="btn sm ghost" id="gNew">${icon('team')} New group</button>`);
      $('#hubInput').placeholder = group ? 'Message the group' : 'Message @' + (dmWith || '');
    }
    if (t === 'mods') T('Mods', 'Approve new cosmetics, handle reports, keep the Hub nice.', '<a class="btn sm ghost" href="/mod" data-link>Full staff panel</a>');
    if (t === 'rooms') T('Live Rooms', 'Watch YouTube together, in sync, with Kyoto players in game and here.', '<button class="btn sm glow" id="rNew">Make a room</button>');
    if (t === 'voice') T('Voice Rooms', 'Talk with Kyoto players, in game and here. Up to 16 people a room.', `<button class="btn sm glow" id="vNew">${icon('plus')} Make a room</button>`);
    if (t === 'lfg') T('Looking For Group', 'Find people to play with right now. Join a group and you get a group chat (and voice if they want).', `<button class="btn sm glow" id="lNew">${icon('plus')} Post</button>`);
    if (t === 'servers') T('Server Reviews', 'Real reviews from Kyoto players who actually played there.', '');
    if (t === 'trades') T('Trades', 'Swap cosmetics with friends. Nothing happens until you <b>both</b> confirm.', `<button class="btn sm glow" id="tNew">${icon('swap')} New trade</button>`);
    wireTop();
    clearTimeout(timer); poll(true);
  }
  function wireTop() {
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('#rNew', () => R.createDialog());
    on('#dmNew', () => { const n = prompt('Who do you want to message? (Minecraft name)'); if (n && n.trim()) { dmWith = n.trim(); group = null; switchTab('dms', true); } });
    on('#gNew', () => newGroup());
    on('#vNew', () => V.createDialog());
    on('#lNew', () => L.postDialog());
    on('#tNew', () => TR.editor(null));
  }
  $$('.hr').forEach(b => b.onclick = () => { switchTab(b.dataset.ht); history.replaceState(null, '', b.dataset.ht === 'rooms' ? '/rooms' : b.dataset.ht === 'chat' ? '/hub' : '/hub/' + b.dataset.ht); });

  async function poll(first) {
    clearTimeout(timer);
    if (!/^\/(hub|rooms)/.test(location.pathname)) return;
    try {
      if (tab === 'chat') await pollChat(first);
      else if (tab === 'dms') await pollDms(first);
      else if (tab === 'mods') await pollMods();
      else if (tab === 'rooms') await R.poll(first);
      else if (tab === 'voice') await V.poll(first);
      else if (tab === 'lfg') await L.poll(first);
      else if (tab === 'servers') await SV.poll(first);
      else if (tab === 'trades') await TR.poll(first);
    } catch (e) {
      const box = tab === 'chat' || tab === 'dms' || tab === 'mods' ? feed() : view();
      if (first) box.innerHTML = `<div class="hub-empty"><h3>Can't reach the Hub</h3><p>${esc(e.message)}. The Kyoto server may be waking up, try again in a moment.</p></div>`;
    }
    const every = { mods: 10000, rooms: 2000, voice: 3000, lfg: 8000, servers: 30000, trades: 4000 }[tab] || 2500;
    timer = setTimeout(() => poll(false), every);
  }

  /* ================================================================ me + status ================================================================ */
  function renderMe() {
    const el = $('#hubMe'); if (!me) { el.innerHTML = ''; return; }
    const st = me.status || { mode: 'online', text: '' };
    el.innerHTML = `<button class="meb" id="meBtn" title="Set your status"><span class="av"><img src="${headUrl(me.name)}" alt=""><i style="background:${modeCol(st.mode)}"></i></span>
      <div><b>${esc(me.name)}</b><small>${st.text ? esc(st.text) : me.staff ? 'Kyoto staff' : modeName(st.mode)}</small></div>${icon('edit')}</button>`;
    $('#meBtn').onclick = statusDialog;
  }
  function statusDialog() {
    const st = me.status || { mode: 'online', text: '' }; let mode = st.mode === 'offline' ? 'online' : st.mode;
    const box = modal(`<span class="eyebrow">Your status</span><h2>What are you up to?</h2>
      <div class="smodes">${['online', 'away', 'busy', 'invisible'].map(m => `<button type="button" data-sm="${m}" class="${m === mode ? 'on' : ''}"><i style="background:${modeCol(m)}"></i><b>${modeName(m)}</b><small>${{ online: 'Friends see you\'re around', away: 'You\'re AFK for a bit', busy: 'No pop-ups in game', invisible: 'Look offline to everyone' }[m]}</small></button>`).join('')}</div>
      <label class="fld"><span>Status message</span><input id="stText" maxlength="80" value="${esc(st.text || '')}" placeholder="Grinding Bedwars, come join"></label>
      <div class="fld"><span>Clear it after</span><div class="seg" id="stFor"><button type="button" class="on" data-h="0">Never</button><button type="button" data-h="1">1 hour</button><button type="button" data-h="4">4 hours</button><button type="button" data-h="24">Today</button></div></div>
      <button class="btn glow wide" id="stSave">Save</button>`);
    let hours = 0;
    $$('[data-sm]', box).forEach(b => b.onclick = () => { mode = b.dataset.sm; $$('[data-sm]', box).forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-h]', box).forEach(b => b.onclick = () => { hours = Number(b.dataset.h); $$('[data-h]', box).forEach(x => x.classList.toggle('on', x === b)); });
    $('#stSave', box).onclick = async () => { try { const r = await api('/status', { method: 'PUT', body: { mode, text: $('#stText', box).value.trim(), hours } }); me.status = r.status; renderMe(); box.remove(); toast('Status set', r.status.text || modeName(r.status.mode)); } catch (e) { toast('Couldn\'t set it', e.message); } };
  }

  /* ================================================================ notifications ================================================================ */
  let noteSince = Number(localStorage.getItem('kyoto.hub.notes') || 0), noteT = 0;
  async function notesLoop() {
    clearTimeout(noteT);
    try {
      const first = !noteSince;
      const r = await api('/notify?since=' + (noteSince || 0));
      if (first) noteSince = r.last; else for (const n of r.notes) {
        noteSince = Math.max(noteSince, n.id);
        if (n.kind.startsWith('trade')) $('#tradeDot').hidden = tab === 'trades';
        if ((n.kind === 'gift' || n.kind === 'group' || n.kind === 'reply' || n.kind === 'lfg') && tab !== 'dms') $('#dmDot').hidden = false;
        const go = n.data && n.data.where ? () => openWhere(n.data.where) : n.kind.startsWith('trade') ? () => switchTab('trades') : null;
        toast({ gift: 'Gift!', trade: 'Trade', trade_done: 'Trade done', mention: 'Mention', reply: 'Reply', streak: 'Streak', streak_risk: 'Streak ending', lfg: 'Looking For Group', group: 'Group chat' }[n.kind] || 'Kyoto', n.text, go);
      }
      localStorage.setItem('kyoto.hub.notes', String(noteSince));
    } catch (e) { /* offline */ }
    noteT = setTimeout(notesLoop, 12000);
  }
  function openWhere(w) {
    if (w === 'chat') return switchTab('chat');
    if (w.startsWith('dm:')) { dmWith = w.slice(3); group = null; return switchTab('dms', true); }
    if (w.startsWith('g:')) { group = w.slice(2); dmWith = null; return switchTab('dms', true); }
  }

  /* ================================================================ messages ================================================================ */
  async function pollChat(first) {
    const r = await api('/chat?since=' + since, { auth: loggedIn() });
    const got = r.messages || [];
    since = Math.max(0, (r.now || Date.now()) - 3000);
    const before = JSON.stringify(msgs.slice(-3)), pinBefore = JSON.stringify(pins.map(p => p.id));
    for (const m of got) { const i = msgs.findIndex(x => x.id === m.id); if (i >= 0) msgs[i] = m; else msgs.push(m); }
    msgs.sort((a, b) => a.at - b.at); msgs = msgs.slice(-200);
    pins = r.pins || [];
    if (!first && !got.length && pinBefore === JSON.stringify(pins.map(p => p.id))) return;
    if (!first && before === JSON.stringify(msgs.slice(-3)) && !got.length) return;
    paint(first);
  }
  function paint(first) {
    const stick = first || feed().scrollHeight - feed().scrollTop - feed().clientHeight < 90;
    renderMsgs(msgs, tab === 'chat' ? 'chat' : 'dm'); renderPins();
    if (stick) feed().scrollTop = feed().scrollHeight;
  }
  function msgHtml(m, kind, prev) {
    if (m.sys) return `<div class="msys${m.streak ? ' st' : ''}" data-mid="${m.id}">${m.streak ? icon('flame') : m.trade ? icon('swap') : icon('sparkles')}<span>${esc(m.text)}</span>${m.trade ? `<button class="btn xs ghost" data-optrade="${m.trade}">Open trade</button>` : ''}<small>${time(m.at)}</small></div>`;
    const grouped = prev && !prev.sys && prev.name === m.name && !!prev.discord === !!m.discord && m.at - prev.at < 5 * 60000 && !m.reply && !m.poll && !m.gift;
    const img = m.img ? (kind !== 'chat' ? `${CONFIG.api}/dm/img?id=${m.img}&auth=${encodeURIComponent(localStorage.getItem('kyoto.token') || '')}` : `${CONFIG.api}/chat/img?id=${m.img}`) : null;
    const rq = m.reply ? `<button class="mreply" data-jump="${m.reply.id}"><img src="${headUrl(m.reply.name)}" alt=""><b>${esc(m.reply.name)}</b><span>${m.reply.sticker ? '[sticker]' : m.reply.img && !m.reply.text ? '[picture]' : esc(m.reply.text)}</span></button>` : '';
    let body = `${m.text ? `<div class="mt">${linkify(m.text)}</div>` : ''}${img ? `<img class="mimg" src="${img}" alt="picture" loading="lazy">` : ''}${m.sticker ? `<img class="mstk" src="${stkUrl(m.sticker)}" alt="${esc(m.sticker)}" title="${esc((STK.find(s => s.id === m.sticker) || {}).name || m.sticker)}">` : ''}`;
    if (m.gift) body = giftHtml(m) + body.replace(/<div class="mt">.*?<\/div>/, '');
    if (m.poll) body += pollHtml(m);
    if (m.re && m.re.length) body += `<div class="mre">${m.re.map(r => `<button class="rchip${r.me ? ' me' : ''}" data-re="${esc(r.r)}" data-mid="${m.id}" title="${esc(r.who.join(', '))}${r.n > r.who.length ? ' and more' : ''}"><img src="${reaUrl(r.r)}" alt="">${r.n}</button>`).join('')}<button class="rchip add" data-addre="${m.id}" title="React">${icon('smile')}</button></div>`;
    const canPin = kind !== 'chat' || (me && me.staff);
    const tools = me && m.id && !m.discord ? `<div class="mtools">
      <button data-qre="${m.id}" title="React">${icon('smile')}</button><button data-rep2="${m.id}" title="Reply">${icon('reply')}</button>
      ${canPin ? `<button data-pin="${m.id}" title="${m.pinned ? 'Unpin' : 'Pin'}" class="${m.pinned ? 'lit' : ''}">${icon('pin')}</button>` : ''}
      ${m.me || (kind === 'chat' && me.staff) ? `<button data-mdel="${m.id}" title="Delete">${icon('trash')}</button>` : ''}
      ${kind === 'chat' && !m.me ? `<button data-rep="${m.id}" title="Report">${icon('flag')}</button>` : ''}</div>` : me && m.discord && m.id ? `<div class="mtools"><button data-rep2="${m.id}" title="Reply">${icon('reply')}</button>${me.staff ? `<button data-mdel="${m.id}" title="Delete">${icon('trash')}</button>` : ''}</div>` : '';
    const pin = m.pinned ? `<span class="mpinned" title="Pinned">${icon('pin')}</span>` : '';
    if (grouped) return `<div class="msg cont${m.me ? ' mine' : ''}" data-mid="${m.id}"><span class="mtime">${new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><div class="mb">${body}</div>${pin}${tools}</div>`;
    return `<div class="msg${m.me ? ' mine' : ''}" data-mid="${m.id}"><img class="mav" src="${m.discord ? (m.avatar || '/img/favicon.png') : headUrl(m.name)}" alt="">
      <div class="mb">${rq}<div class="mh">${m.discord ? `<b>${esc(m.name)}</b><span class="tag dc">Discord</span>` : `<a href="/u/${encodeURIComponent(m.name)}" data-link><b>${esc(m.name)}</b></a>${m.owner ? '<span class="tag own">Owner</span>' : m.staff ? '<span class="tag mod">Mod</span>' : ''}${m.plus ? '<span class="tag plus">K+</span>' : ''}`}<span class="mtime2">${time(m.at)}</span></div>${body}</div>${pin}${tools}</div>`;
  }
  function giftHtml(m) {
    const g = m.gift, thumb = window.KY_ITEMS ? window.KY_ITEMS.thumb(g) : '';
    return `<div class="mgift"><div class="gth">${thumb}</div><div class="gb"><small>${icon('gift')} ${m.me ? `You sent a gift` : `${esc(m.name)} sent you a gift`}</small><b>${esc(g.title)}</b><span>${esc({ head: 'Head', back: 'Back', arm: 'Arm', leg: 'Leg', cape: 'Cape' }[g.slot] || 'Cosmetic')} by ${esc(g.creator)}</span>${g.note ? `<q>${esc(g.note)}</q>` : ''}</div>
      ${m.me ? '' : `<button class="btn sm glow" data-wearg="${g.id}">Wear it</button>`}</div>`;
  }
  function pollHtml(m) {
    const p = m.poll, max = Math.max(1, ...p.opts.map(o => o.n)), voted = p.opts.some(o => o.me), show = voted || p.closed;
    return `<div class="mpoll${p.closed ? ' closed' : ''}"><div class="pq">${icon('poll')}<b>${esc(p.q)}</b></div>
      ${p.opts.map((o, i) => `<button class="popt${o.me ? ' me' : ''}${p.closed && o.n === max && o.n > 0 ? ' win' : ''}" data-vote="${i}" data-mid="${m.id}" ${p.closed ? 'disabled' : ''}>
        <i style="width:${show && p.total ? Math.round(o.n / p.total * 100) : 0}%"></i><span>${esc(o.t)}</span>${show ? `<em>${p.total ? Math.round(o.n / p.total * 100) : 0}%</em>` : ''}${o.me ? icon('check') : ''}</button>`).join('')}
      <small>${p.total} vote${p.total === 1 ? '' : 's'} · ${p.multi ? 'pick any' : 'pick one'} · ${p.closed ? 'ended' : left(p.ends)}</small></div>`;
  }
  function renderMsgs(list, kind) {
    if (!list.length) { feed().innerHTML = `<div class="hub-empty"><h3>${kind !== 'chat' ? 'Say hi' : 'It\'s quiet in here'}</h3><p>${kind !== 'chat' ? 'This is the start of your chat. Send a sticker!' : 'Be the first to say something.'}</p></div>`; return; }
    let html = '', prev = null;
    for (const m of list) { html += msgHtml(m, kind, prev); prev = m; }
    feed().innerHTML = html;
    wireMsgs(feed(), kind);
  }
  function wireMsgs(root, kind) {
    if (window.KY_ITEMS) window.KY_ITEMS.draw(root);
    $$('.mimg', root).forEach(i => i.onclick = () => { const lb = $('#lightbox'); $('img', lb).src = i.src; lb.hidden = false; });
    $$('[data-rep]', root).forEach(b => b.onclick = async () => { const why = prompt('What\'s wrong with this message?'); if (why === null) return; try { await api('/hub/report', { method: 'POST', body: { kind: 'chat', id: b.dataset.rep, reason: why || 'Reported on the website' } }); toast('Reported', 'Thanks, a mod will look at it.'); } catch (e) { toast('Couldn\'t report', e.message); } });
    $$('[data-mdel]', root).forEach(b => b.onclick = async () => { if (!confirm('Delete this message?')) return; await call('/msg/delete', { where: where(), id: Number(b.dataset.mdel) }); msgs = msgs.filter(x => String(x.id) !== b.dataset.mdel); paint(); });
    $$('[data-re]', root).forEach(b => b.onclick = () => react(Number(b.dataset.mid), b.dataset.re));
    $$('[data-qre], [data-addre]', root).forEach(b => b.onclick = e => { e.stopPropagation(); reactPicker(b, Number(b.dataset.qre || b.dataset.addre)); });
    $$('[data-rep2]', root).forEach(b => b.onclick = () => { const m = msgs.find(x => String(x.id) === b.dataset.rep2) || pins.find(x => String(x.id) === b.dataset.rep2); if (m) { reply = m; renderReply(); $('#hubInput').focus(); } });
    $$('[data-pin]', root).forEach(b => b.onclick = async () => { const r = await call('/msg/pin', { where: where(), id: Number(b.dataset.pin) }, null); toast(r.pinned ? 'Pinned' : 'Unpinned', ''); poll(false); });
    $$('[data-vote]', root).forEach(b => b.onclick = async () => { try { const r = await api('/msg/vote', { method: 'POST', body: { where: where(), id: Number(b.dataset.mid), opt: Number(b.dataset.vote) } }); const m = msgs.find(x => x.id === Number(b.dataset.mid)); if (m) { m.poll = r.poll; paint(); } } catch (e) { toast('Couldn\'t vote', e.message); } });
    $$('[data-jump]', root).forEach(b => b.onclick = () => jump(b.dataset.jump));
    $$('[data-optrade]', root).forEach(b => b.onclick = () => { switchTab('trades'); history.replaceState(null, '', '/hub/trades'); setTimeout(() => TR.open(Number(b.dataset.optrade)), 300); });
    $$('[data-wearg]', root).forEach(b => b.onclick = async () => { await call('/library/wear', { id: Number(b.dataset.wearg) }, 'Wearing it! It shows in game within a minute.'); });
  }
  function jump(id) {
    const el = feed().querySelector(`[data-mid="${id}"]`);
    if (!el) return toast('Too old', 'That message isn\'t loaded any more.');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  async function react(id, r) {
    try {
      const res = await api('/msg/react', { method: 'POST', body: { where: where(), id, r } });
      const m = msgs.find(x => x.id === id); if (m) { m.re = res.re; paint(); }
    } catch (e) { toast('Couldn\'t react', e.message); }
  }
  function reactPicker(anchor, id) {
    $$('.rpick').forEach(x => x.remove());
    const p = document.createElement('div'); p.className = 'rpick';
    p.innerHTML = REA.map(r => `<button data-r="${r}" title="${r}"><img src="${reaUrl(r)}" alt=""></button>`).join('') + `<span class="rsep"></span>` + STK.slice(0, 8).map(s => `<button data-r="${s.id}" title="${esc(s.name)}"><img src="${stkUrl(s.id)}" alt=""></button>`).join('');
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth)) + 'px'; p.style.top = Math.max(8, r.top - p.offsetHeight - 6) + 'px';
    $$('[data-r]', p).forEach(b => b.onclick = () => { p.remove(); react(id, b.dataset.r); });
    setTimeout(() => addEventListener('click', function off(e) { if (!p.contains(e.target)) { p.remove(); removeEventListener('click', off); } }), 0);
  }
  function renderPins() {
    const bar = $('#pinBar'); if (!pins.length || !(tab === 'chat' || tab === 'dms')) { bar.hidden = true; return; }
    const last = pins[pins.length - 1];
    bar.hidden = false;
    bar.innerHTML = `<button class="pinmain" id="pinOpen">${icon('pin')}<b>${pins.length} pinned</b><span>${esc(last.name)}: ${esc(last.text || (last.sticker ? '[sticker]' : last.poll ? 'Poll: ' + last.poll.q : last.img ? '[picture]' : ''))}</span>${icon('chevron')}</button><div class="pinlist" id="pinList" hidden></div>`;
    $('#pinOpen').onclick = () => {
      const l = $('#pinList'); l.hidden = !l.hidden; if (l.hidden) return;
      l.innerHTML = pins.slice().reverse().map(m => msgHtml(m, tab === 'chat' ? 'chat' : 'dm', null)).join('');
      wireMsgs(l, tab === 'chat' ? 'chat' : 'dm');
      $$('.msg', l).forEach(el => el.addEventListener('click', e => { if (!e.target.closest('button, a')) { l.hidden = true; jump(el.dataset.mid); } }));
    };
  }
  $('#lightbox').onclick = () => { $('#lightbox').hidden = true; };

  /* ================================================================ DMs + group chats ================================================================ */
  let threadsSig = '';
  async function pollDms(first) {
    $('#dmDot').hidden = true;
    const th = await api('/dm/threads');
    const all = [...(th.groups || []).map(g => Object.assign({ kind: 'g' }, g)), ...(th.threads || []).map(t => Object.assign({ kind: 'dm' }, t))].sort((a, b) => b.at - a.at);
    const sig = JSON.stringify(all) + dmWith + group;
    if (sig !== threadsSig) {
      threadsSig = sig;
      $('#hubThreads').innerHTML = all.map(t => t.kind === 'g'
        ? `<button class="th${String(t.id) === String(group) ? ' on' : ''}" data-tg="${esc(t.id)}"><span class="gav" style="--c:${t.color}">${t.members.slice(0, 3).map(n => `<img src="${headUrl(n)}" alt="">`).join('')}</span><span><b>${esc(t.name)}${t.lfg ? ' <i class="lfgtag">LFG</i>' : ''}</b><small>${esc(t.last)}</small></span></button>`
        : `<button class="th${t.name === dmWith ? ' on' : ''}" data-th="${esc(t.name)}"><span class="av"><img src="${headUrl(t.name)}" alt=""><i style="background:${modeCol(t.status && t.status.mode)}"></i></span><span><b>${esc(t.name)}${streakPill(t.streak)}</b><small>${t.status && t.status.text ? esc(t.status.text) : (t.fromMe ? 'You: ' : '') + esc(t.last)}</small></span></button>`).join('') || '<p class="muted small th-none">No chats yet.</p>';
      $$('[data-th]').forEach(b => b.onclick = () => { dmWith = b.dataset.th; group = null; switchTab('dms', true); });
      $$('[data-tg]').forEach(b => b.onclick = () => { group = b.dataset.tg; dmWith = null; switchTab('dms', true); });
    }
    if (!dmWith && !group) { if (first) feed().innerHTML = `<div class="hub-empty"><h3>Your DMs</h3><p>Pick a chat on the left, press <b>New message</b>, or make a <b>group chat</b> with friends.</p></div>`; return; }
    const r = group ? await api('/groups/msgs?id=' + encodeURIComponent(group)) : await api('/dm/with?name=' + encodeURIComponent(dmWith));
    convo = r;
    header(r);
    const list = r.messages || [], sig2 = JSON.stringify(list) + JSON.stringify(r.pins);
    if (first || sig2 !== pollDms.sig) { pollDms.sig = sig2; msgs = list; pins = r.pins || []; paint(first); }
  }
  function header(r) {
    if (group && r.group) {
      const g = r.group;
      $('#hubTitle').innerHTML = `<span class="gdot" style="background:${g.color}"></span>${esc(g.name)}`;
      $('#hubSub').innerHTML = g.members.map(m => `<span class="gm" title="${esc(modeName(m.status.mode))}${m.status.text ? ': ' + esc(m.status.text) : ''}"><i style="background:${modeCol(m.status.mode)}"></i>${esc(m.name)}${m.owner ? ' (owner)' : ''}</span>`).join('');
      if (!$('#gMore')) $('#hubTopR').innerHTML = `<button class="btn sm ghost" id="gVoice">${icon('mic')} Voice</button><button class="btn sm ghost" id="gMore">${icon('dots')}</button>`;
      $('#gVoice').onclick = () => groupVoice(g); $('#gMore').onclick = e => groupMenu(e.currentTarget, g);
    } else if (dmWith && r.name) {
      const s = r.status || {};
      $('#hubTitle').innerHTML = `<span class="av sm"><img src="${headUrl(r.name)}" alt=""><i style="background:${modeCol(s.mode)}"></i></span>${esc(r.name)} ${streakPill(r.streak)}`;
      const st = r.streak || {};
      $('#hubSub').innerHTML = `${s.text ? `<b class="stt">${esc(s.text)}</b> · ` : ''}${modeName(s.mode)}${st.n ? ` · ${st.n} day streak${st.today ? ' (done today)' : st.mine ? `, waiting for ${esc(r.name)}` : ', message them to keep it going'}` : r.friends ? ' · Message each other every day for a streak' : ''}`;
      if (!$('#dMore')) $('#hubTopR').innerHTML = `${r.friends ? `<button class="btn sm ghost" id="dGift">${icon('gift')} Gift</button><button class="btn sm ghost" id="dTrade">${icon('swap')} Trade</button>` : ''}<button class="btn sm ghost" id="dMore">${icon('dots')}</button>`;
      const g1 = $('#dGift'); if (g1) g1.onclick = () => giftFromLocker(r.name);
      const t1 = $('#dTrade'); if (t1) t1.onclick = () => { switchTab('trades'); TR.editor(null, r.name); };
      $('#dMore').onclick = e => menu(e.currentTarget, [['Profile', () => { history.pushState(null, '', '/u/' + r.name); window.dispatchEvent(new Event('popstate')); }], ['Block', async () => { if (confirm(`Block ${r.name}? They can't message you.`)) await call('/dm/block', { name: r.name }, 'Blocked ' + r.name); }]]);
    }
  }
  function menu(anchor, items) {
    $$('.rpick').forEach(x => x.remove());
    const p = document.createElement('div'); p.className = 'rpick menu';
    p.innerHTML = items.map(([t], i) => `<button data-i="${i}">${esc(t)}</button>`).join('');
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(); p.style.left = Math.max(8, r.right - p.offsetWidth) + 'px'; p.style.top = r.bottom + 6 + 'px';
    $$('[data-i]', p).forEach(b => b.onclick = () => { p.remove(); items[Number(b.dataset.i)][1](); });
    setTimeout(() => addEventListener('click', function off(e) { if (!p.contains(e.target)) { p.remove(); removeEventListener('click', off); } }), 0);
  }
  function groupMenu(anchor, g) {
    const items = [['Add a friend', async () => { const n = prompt('Friend\'s Minecraft name'); if (n) { await call('/groups/add', { id: g.id, name: n.trim() }, 'Added ' + n); poll(false); } }],
      ['Rename', async () => { const n = prompt('New name', g.name); if (n) { await call('/groups/rename', { id: g.id, name: n.trim() }); poll(false); } }]];
    if (g.isOwner) items.push(['Remove someone', async () => { const n = prompt('Who? (' + g.members.filter(m => !m.owner).map(m => m.name).join(', ') + ')'); if (n) { await call('/groups/kick', { id: g.id, name: n.trim() }, 'Removed'); poll(false); } }]);
    items.push(['Leave group', async () => { if (!confirm('Leave "' + g.name + '"?')) return; await call('/groups/leave', { id: g.id }, 'Left the group'); group = null; switchTab('dms', true); }]);
    menu(anchor, items);
  }
  async function groupVoice(g) {
    if (g.voice) { switchTab('voice'); history.replaceState(null, '', '/hub/voice'); return V.join(g.voice); }
    try { const r = await api('/voice/create', { method: 'POST', body: { name: g.name, group: g.id } }); switchTab('voice'); history.replaceState(null, '', '/hub/voice'); V.join(r.id); } catch (e) { toast('Couldn\'t start voice', e.message); }
  }
  async function newGroup() {
    let friends = []; try { friends = (await api('/friends')).friends || []; } catch (e) { return toast('Couldn\'t load friends', e.message); }
    if (!friends.length) return toast('No friends yet', 'Add friends in game with /kyoto friends.');
    const picked = new Set();
    const box = modal(`<span class="eyebrow">${icon('team')} Group chat</span><h2>New group</h2>
      <label class="fld"><span>Name</span><input id="gName" maxlength="32" placeholder="The squad"></label>
      <div class="fld"><span>Friends (up to 9)</span><div class="gfriends">${friends.map(f => `<button type="button" class="gf" data-gf="${esc(f.name)}"><img src="https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/32" alt=""><span>${esc(f.name)}</span>${f.online ? '<i class="on"></i>' : ''}</button>`).join('')}</div></div>
      <button class="btn glow wide" id="gGo">Make the group</button>`);
    $$('[data-gf]', box).forEach(b => b.onclick = () => { const n = b.dataset.gf; if (picked.has(n)) picked.delete(n); else if (picked.size < 9) picked.add(n); b.classList.toggle('on', picked.has(n)); });
    $('#gGo', box).onclick = async () => { try { const r = await api('/groups/create', { method: 'POST', body: { name: $('#gName', box).value.trim(), members: [...picked] } }); box.remove(); group = r.id; dmWith = null; switchTab('dms', true); } catch (e) { toast('Couldn\'t make it', e.message); } };
  }
  async function giftFromLocker(name) {
    let items = []; try { items = (await api('/trade/locker')).items || []; } catch (e) { /* */ }
    const box = modal(`<span class="eyebrow">${icon('gift')} Gift to ${esc(name)}</span><h2>Send a gift</h2><p class="muted">Give away something from your Locker, or pick anything in the <a href="/store" data-link>Store</a> and press <b>Gift to a friend</b>.</p>
      <div class="ipick">${items.map(x => `<button type="button" class="icard" data-gi="${x.id}"><div class="ith">${window.KY_ITEMS ? window.KY_ITEMS.thumb(x) : ''}</div><b>${esc(x.title)}</b><small>${esc(x.slot)}</small></button>`).join('') || '<p class="muted small">Nothing to give yet (things you made can be gifted from the Store).</p>'}</div>
      <label class="fld"><span>Note</span><input id="gNote2" maxlength="140" placeholder="Thought you'd like this"></label>`);
    if (window.KY_ITEMS) window.KY_ITEMS.draw(box);
    $$('[data-gi]', box).forEach(b => b.onclick = async () => { if (!confirm('Give it away? It leaves your Locker.')) return; try { await api('/gift', { method: 'POST', body: { to: name, id: Number(b.dataset.gi), mode: 'give', note: $('#gNote2', box).value.trim() } }); box.remove(); toast('Gift sent', ''); poll(false); } catch (e) { toast('Couldn\'t send it', e.message); } });
  }

  /* ================================================================ Mods ================================================================ */
  async function pollMods() {
    const r = await api('/mod/queue');
    let dc = null; try { dc = await api('/discord/status'); } catch (e) { /* older server */ }
    const dcLine = !dc ? '' : `<div class="dcstat ${dc.lastError || dc.missing.length ? 'bad' : 'ok'}"><b>Discord bridge</b>
      <span>Hub → Discord: ${dc.hubToDiscord ? 'on' : 'off'} · Discord → Hub: ${dc.discordToHub ? 'on' : 'off'}${dc.received ? ' · ' + dc.received + ' messages in' : ''}</span>
      ${dc.missing.length ? `<small>Missing on Render: ${dc.missing.map(esc).join(', ')}</small>` : ''}${dc.lastError ? `<small>${esc(dc.lastError)}</small>` : ''}</div>`;
    $('#modDot').hidden = !(r.pending || []).length;
    const pend = (r.pending || []).map(p => `<article class="mq">
      <div class="mq-img">${p.photos ? `<img src="${CONFIG.api}/store/photo?id=${p.id}&n=0&auth=${encodeURIComponent(localStorage.getItem('kyoto.token'))}" alt="">` : p.hasImage ? `<img class="pix" src="${CONFIG.api}/hub/image?id=${p.id}&auth=${encodeURIComponent(localStorage.getItem('kyoto.token'))}" alt="">` : `<span>${esc(p.type)}</span>`}</div>
      <div class="mq-b"><b>${esc(p.title || 'Untitled')}</b><small>${esc(p.type === 'kycos' ? 'Cosmetic' : p.type)} by ${esc(p.name)} · ${p.price ? p.price + ' coins' : 'Free'}${p.photos ? ' · ' + p.photos + ' photos' : ''}</small><p>${esc(p.desc || p.text || '')}</p></div>
      <div class="mq-a"><button class="btn sm glow" data-ok="${p.id}">Approve</button><button class="btn sm ghost" data-no="${p.id}">Reject</button></div></article>`).join('');
    const reps = (r.reports || []).map(x => `<article class="mq rep">
      <div class="mq-img">${x.target && x.target.chatImg ? `<img src="${CONFIG.api}/chat/img?id=${x.target.chatImg}" alt="">` : icon('flag')}</div>
      <div class="mq-b"><b>${esc(x.kind)} by ${esc((x.target || {}).name || '?')}</b><small>Reported by ${esc(x.byName)}: ${esc(x.reason || '')}</small><p>${esc((x.target || {}).text || (x.target && x.target.gone ? '(already deleted)' : ''))}</p></div>
      <div class="mq-a">${x.target && !x.target.gone ? `<button class="btn sm" data-rdel="${esc(x.id)}" data-kind="${esc(x.kind)}">Delete it</button>` : ''}<button class="btn sm ghost" data-dis="${x.at}" data-by="${esc(x.by)}">Dismiss</button></div></article>`).join('');
    feed().innerHTML = `<div class="mods">${dcLine}
      <div class="mtool"><input id="modName" placeholder="Player name"><button class="btn sm" data-act="mute">Mute 1h</button><button class="btn sm" data-act="ban">Ban</button><button class="btn sm ghost" data-act="unban">Unban</button></div>
      <h3>Waiting for approval <span>${(r.pending || []).length}</span></h3>${pend || '<p class="muted small">Nothing to approve.</p>'}
      <h3>Reports <span>${(r.reports || []).length}</span></h3>${reps || '<p class="muted small">No reports. Nice.</p>'}</div>`;
    const act = async (path, body, ok) => { try { await api(path, { method: 'POST', body }); toast(ok); poll(false); } catch (e) { toast('Failed', e.message); } };
    $$('[data-ok]').forEach(b => b.onclick = () => act('/mod/approve', { id: Number(b.dataset.ok) }, 'Approved'));
    $$('[data-no]').forEach(b => b.onclick = () => act('/mod/delete', { id: Number(b.dataset.no) }, 'Rejected'));
    $$('[data-rdel]').forEach(b => b.onclick = () => act('/mod/delete', { id: b.dataset.rdel, kind: ['chat', 'review'].includes(b.dataset.kind) ? b.dataset.kind : 'post' }, 'Deleted'));
    $$('[data-dis]').forEach(b => b.onclick = () => act('/mod/report/dismiss', { at: Number(b.dataset.dis), by: b.dataset.by }, 'Dismissed'));
    $$('[data-act]').forEach(b => b.onclick = () => {
      const name = $('#modName').value.trim(); if (!name) return toast('Type a player name first');
      const a = b.dataset.act;
      act(a === 'mute' ? '/mod/mute' : a === 'ban' ? '/mod/ban' : '/mod/unban', a === 'mute' ? { name, minutes: 60 } : { name, reason: 'Hub moderation' }, a === 'unban' ? 'Unbanned ' + name : a === 'ban' ? 'Banned ' + name : 'Muted ' + name);
    });
  }

  /* ================================================================ composing ================================================================ */
  function renderReply() {
    const b = $('#hubReply'); if (!b) return;
    if (!reply) { b.hidden = true; b.innerHTML = ''; return; }
    b.hidden = false;
    b.innerHTML = `${icon('reply')}<span>Replying to <b>${esc(reply.name)}</b>: ${esc(reply.text || (reply.sticker ? '[sticker]' : reply.poll ? 'Poll' : '[picture]'))}</span><button type="button" title="Cancel">${icon('x')}</button>`;
    $('button', b).onclick = () => { reply = null; renderReply(); };
  }
  function setPending(file) {
    pending = file;
    const pv = $('#hubPreview');
    if (!file) { pv.hidden = true; pv.innerHTML = ''; return; }
    if (file.size > 3e6) { toast('Too big', 'Pictures can be up to 3 MB.'); pending = null; return; }
    pv.hidden = false; pv.innerHTML = `<img src="${URL.createObjectURL(file)}" alt=""><button type="button" title="Remove">${icon('x')}</button>`;
    $('button', pv).onclick = () => setPending(null);
  }
  $('#hubFile').onchange = e => { setPending(e.target.files[0] || null); e.target.value = ''; };
  $('#hubInput').addEventListener('paste', e => { const f = [...(e.clipboardData || {}).files || []].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); setPending(f); } });
  $('#hubInput').addEventListener('keydown', e => { if (e.key === 'Escape' && reply) { reply = null; renderReply(); } });
  $('#page-hub').addEventListener('dragover', e => { e.preventDefault(); });
  $('#page-hub').addEventListener('drop', e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f && !$('#hubCompose').hidden) setPending(f); });
  async function sendMsg(extra) {
    const inp = $('#hubInput'), text = extra && extra.sticker ? '' : inp.value.trim();
    if (!text && !pending && !(extra && extra.sticker)) return;
    const b64 = pending ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(pending); }) : null;
    if (!(extra && extra.sticker)) inp.value = '';
    const file = pending; setPending(null);
    const rp = reply ? reply.id : undefined; reply = null; renderReply();
    const body = Object.assign({ text, reply: rp }, extra || {});
    try {
      if (tab === 'chat') { if (b64) await api('/chat/image', { method: 'POST', body: { image: b64, text } }); else await api('/chat/send', { method: 'POST', body }); }
      else if (group) { if (b64) await api('/groups/image', { method: 'POST', body: { id: group, image: b64, text } }); else await api('/groups/send', { method: 'POST', body: Object.assign({ id: group }, body) }); }
      else if (dmWith) {
        if (b64) await api('/dm/image', { method: 'POST', body: { to: dmWith, image: b64 } });
        if (text || body.sticker) await api('/dm/send', { method: 'POST', body: Object.assign({ to: dmWith }, body) });
      }
      poll(false);
    } catch (err) { if (!(extra && extra.sticker)) inp.value = text; if (file) setPending(file); toast('Couldn\'t send', err.message); }
  }
  $('#hubCompose').onsubmit = e => { e.preventDefault(); sendMsg(); };
  // stickers
  function stkClose() { const p = $('#stkPop'); if (p) p.hidden = true; }
  $('#hubStk').onclick = async e => {
    e.stopPropagation(); const p = $('#stkPop');
    if (!p.hidden) return stkClose();
    if (!STK.length) try { const r = await api('/stickers', { auth: false }); STK = r.stickers; REA = r.reactions; } catch (err) { return toast('Couldn\'t load stickers', err.message); }
    p.innerHTML = `<div class="stkhead"><b>Stickers</b><small>Kyo says hi</small></div><div class="stkgrid">${STK.map(s => `<button type="button" data-stk="${s.id}" title="${esc(s.name)}"><img src="${stkUrl(s.id)}" alt="" loading="lazy"><span>${esc(s.name)}</span></button>`).join('')}</div>`;
    p.hidden = false;
    $$('[data-stk]', p).forEach(b => b.onclick = () => { stkClose(); sendMsg({ sticker: b.dataset.stk }); });
    setTimeout(() => addEventListener('click', function off(ev) { if (!p.contains(ev.target)) { stkClose(); removeEventListener('click', off); } }), 0);
  };
  // polls
  $('#hubPoll').onclick = () => {
    const box = modal(`<span class="eyebrow">${icon('poll')} Poll</span><h2>Ask everyone</h2>
      <label class="fld"><span>Question</span><input id="pQ" maxlength="120" placeholder="Best Bedwars map?"></label>
      <div class="fld"><span>Answers</span><div id="pOpts"></div><button type="button" class="btn xs ghost" id="pAdd">${icon('plus')} Add answer</button></div>
      <div class="fld"><span>Open for</span><div class="seg" id="pFor"><button type="button" data-m="15">15 min</button><button type="button" class="on" data-m="60">1 hour</button><button type="button" data-m="1440">1 day</button><button type="button" data-m="10080">1 week</button></div></div>
      <label class="chkrow"><input type="checkbox" id="pMulti"><span>People can pick more than one</span></label>
      <button class="btn glow wide" id="pGo">Post poll</button>`);
    let minutes = 60;
    const add = v => { if ($$('#pOpts input', box).length >= 6) return; const r = document.createElement('div'); r.className = 'popt-in'; r.innerHTML = `<input maxlength="50" placeholder="Answer" value="${esc(v || '')}"><button type="button">${icon('x')}</button>`; $('#pOpts', box).appendChild(r); $('button', r).onclick = () => { if ($$('#pOpts input', box).length > 2) r.remove(); }; };
    add(); add(); $('#pAdd', box).onclick = () => add();
    $$('[data-m]', box).forEach(b => b.onclick = () => { minutes = Number(b.dataset.m); $$('[data-m]', box).forEach(x => x.classList.toggle('on', x === b)); });
    $('#pGo', box).onclick = async () => {
      try { await api('/msg/poll', { method: 'POST', body: { where: where(), q: $('#pQ', box).value.trim(), options: $$('#pOpts input', box).map(i => i.value.trim()).filter(Boolean), minutes, multi: $('#pMulti', box).checked } }); box.remove(); poll(false); }
      catch (e) { toast('Couldn\'t post it', e.message); }
    };
  };

  /* ================================================================ Voice Rooms ================================================================ */
  const V = {
    rooms: [], room: null, id: null, ws: null, ac: null, stream: null, node: null, enc: null, decs: new Map(), muted: false, deaf: false, gate: false, gateAt: 0, level: 0, vols: JSON.parse(localStorage.getItem('kyoto.voice.vols') || '{}'), you: 0, sensitivity: Number(localStorage.getItem('kyoto.voice.sens') || 0.012), ptt: localStorage.getItem('kyoto.voice.ptt') === '1', pttDown: false,
    supported: () => 'AudioEncoder' in window && 'AudioDecoder' in window && 'AudioWorkletNode' in window,
    async poll(first) {
      if (V.id) { V.render(); return; }
      const r = await api('/voice', { auth: loggedIn() }); V.rooms = r.rooms || [];
      $('#voiceDot').hidden = !V.rooms.some(x => x.size);
      const sig = JSON.stringify(V.rooms); if (!first && sig === V.sig) return; V.sig = sig;
      view().innerHTML = `${V.supported() ? '' : '<div class="warnbar">Voice needs Chrome, Edge or Opera on a computer. You can still see who\'s talking.</div>'}
        ${V.rooms.length ? `<div class="vgrid">${V.rooms.map(x => `<button class="vcard${x.size ? ' live' : ''}" data-vj="${x.id}">
          <div class="vct"><b>${esc(x.name)}</b>${x.privacy !== 'public' ? `<span class="vpriv">${x.privacy === 'friends' ? 'Friends' : 'Invite'}</span>` : ''}</div>
          <small>${x.topic ? esc(x.topic) + ' · ' : ''}host ${esc(x.host)}</small>
          <div class="vfaces">${x.members.slice(0, 8).map(m => `<span class="${m.speaking ? 'spk' : ''}" title="${esc(m.name)}"><img src="${headUrl(m.name)}" alt="">${m.client === 'game' ? '<i>MC</i>' : ''}</span>`).join('') || '<em>Empty: be the first</em>'}</div>
          <span class="vjoin">${icon('mic')} ${x.size}/${x.max}</span></button>`).join('')}</div>`
        : `<div class="hub-empty"><h3>No voice rooms yet</h3><p>Make one and your friends can join from here or in game (Kyoto Hub > Voice).</p><button class="btn glow" id="vNew2">${icon('plus')} Make a room</button></div>`}`;
      $$('[data-vj]').forEach(b => b.onclick = () => V.join(b.dataset.vj));
      const n2 = $('#vNew2'); if (n2) n2.onclick = () => V.createDialog();
    },
    createDialog() {
      if (!loggedIn()) return toast('Log in first', 'Type /kyoto link in game for a code.');
      const box = modal(`<span class="eyebrow">${icon('mic')} Voice</span><h2>Make a voice room</h2>
        <label class="fld"><span>Name</span><input id="vName" maxlength="40" placeholder="${esc((me && me.name) || 'My')}'s room"></label>
        <label class="fld"><span>Topic (optional)</span><input id="vTopic" maxlength="80" placeholder="Bedwars grind, chill music, etc."></label>
        <div class="fld"><span>Who can join</span><div class="seg" id="vPriv"><button type="button" class="on" data-v="public">Anyone</button><button type="button" data-v="friends">Friends</button></div></div>
        <button class="btn glow wide" id="vGo">Make it and join</button>`);
      let priv = 'public';
      $$('#vPriv [data-v]', box).forEach(b => b.onclick = () => { priv = b.dataset.v; $$('#vPriv [data-v]', box).forEach(x => x.classList.toggle('on', x === b)); });
      $('#vGo', box).onclick = async () => { try { const r = await api('/voice/create', { method: 'POST', body: { name: $('#vName', box).value.trim(), topic: $('#vTopic', box).value.trim(), privacy: priv } }); box.remove(); V.join(r.id); } catch (e) { toast('Couldn\'t make it', e.message); } };
    },
    async join(id) {
      if (!loggedIn()) return toast('Log in first', '');
      if (V.id) V.leave(true);
      V.id = id; V.room = null; V.muted = false; V.deaf = false;
      view().innerHTML = '<div class="hub-load"></div>';
      if (V.supported()) {
        try { await V.startMic(); } catch (e) { toast('No microphone', 'You can still listen. ' + e.message); V.muted = true; }
      }
      const base = (CONFIG.api || location.origin).replace(/^http/, 'ws');
      const ws = V.ws = new WebSocket(`${base}/voice?token=${encodeURIComponent(localStorage.getItem('kyoto.token'))}&room=${encodeURIComponent(id)}&client=web`);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { if (V.muted) ws.send(JSON.stringify({ t: 'mute', on: true })); };
      ws.onmessage = e => {
        if (typeof e.data === 'string') { const m = JSON.parse(e.data); if (m.t === 'state') { V.room = m.room; V.you = m.you; V.render(); V.bar(); } else if (m.t === 'kicked') { toast('Removed', 'The host removed you from the room.'); V.leave(); } return; }
        V.hear(new Uint8Array(e.data));
      };
      ws.onclose = () => { if (V.ws === ws) { if (V.id) toast('Voice disconnected', 'The room closed or your connection dropped.'); V.leave(true); if (tab === 'voice') poll(true); } };
    },
    async startMic() {
      V.ac = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const src = V.ac.createMediaStreamSource(V.stream);
      const code = `class Cap extends AudioWorkletProcessor { constructor(){ super(); this.b = new Float32Array(960); this.n = 0; } process(i){ const ch = i[0] && i[0][0]; if (ch) for (let k = 0; k < ch.length; k++) { this.b[this.n++] = ch[k]; if (this.n === 960) { this.port.postMessage(this.b.slice(0)); this.n = 0; } } return true; } } registerProcessor('kcap', Cap);`;
      await V.ac.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
      V.node = new AudioWorkletNode(V.ac, 'kcap'); src.connect(V.node);
      let ts = 0;
      V.enc = new AudioEncoder({ output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); if (V.ws && V.ws.readyState === 1 && V.sending) V.ws.send(b); }, error: e => console.warn('encoder', e) });
      V.enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000, opus: { frameDuration: 20000, application: 'voip' } });
      V.node.port.onmessage = ev => {
        const f = ev.data; let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
        const rms = Math.sqrt(sum / f.length); V.level = V.level * .7 + rms * .3;
        const talk = V.ptt ? V.pttDown : rms > V.sensitivity;
        if (talk) V.gateAt = performance.now();
        const open = !V.muted && (talk || performance.now() - V.gateAt < 350);
        if (V.sending && !open && V.ws && V.ws.readyState === 1) V.ws.send(JSON.stringify({ t: 'quiet' }));
        V.sending = open;
        if (V.enc.state === 'configured') { const d = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: 960, numberOfChannels: 1, timestamp: ts, data: f }); ts += 20000; V.enc.encode(d); d.close(); }
      };
    },
    hear(u8) {
      if (!V.ac || u8.length < 2 || V.deaf) return;
      const slot = u8[0]; let st = V.decs.get(slot);
      if (!st) {
        st = { next: 0, gain: V.ac.createGain(), ts: 0 }; st.gain.connect(V.ac.destination);
        st.dec = new AudioDecoder({ output: ad => V.play(st, ad), error: () => { V.decs.delete(slot); } });
        st.dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 });
        V.decs.set(slot, st);
      }
      const m = V.room && V.room.members.find(x => x.slot === slot); st.gain.gain.value = m ? (V.vols[m.name] ?? 1) : 1;
      try { st.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: st.ts, data: u8.subarray(1) })); st.ts += 20000; } catch (e) { /* bad packet */ }
    },
    play(st, ad) {
      const n = ad.numberOfFrames, buf = V.ac.createBuffer(1, n, ad.sampleRate), ch = new Float32Array(n);
      ad.copyTo(ch, { planeIndex: 0, format: 'f32-planar' }); ad.close(); buf.copyToChannel(ch, 0);
      const now = V.ac.currentTime;
      if (st.next < now + .03 || st.next > now + .35) st.next = now + .07; // small jitter buffer, never let delay build up
      const s = V.ac.createBufferSource(); s.buffer = buf; s.connect(st.gain); s.start(st.next); st.next += buf.duration;
    },
    setMute(on) { V.muted = on; if (V.ws && V.ws.readyState === 1) V.ws.send(JSON.stringify({ t: 'mute', on })); V.render(); V.bar(); },
    setDeaf(on) { V.deaf = on; if (on) V.setMute(true); if (V.ws && V.ws.readyState === 1) V.ws.send(JSON.stringify({ t: 'deaf', on })); V.render(); V.bar(); },
    leave(silent) {
      const ws = V.ws; V.ws = null; V.id = null; V.room = null;
      try { ws && ws.close(); } catch (e) { /* */ }
      try { V.stream && V.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* */ }
      try { V.enc && V.enc.state !== 'closed' && V.enc.close(); } catch (e) { /* */ }
      for (const st of V.decs.values()) try { st.dec.close(); } catch (e) { /* */ }
      V.decs.clear(); try { V.ac && V.ac.close(); } catch (e) { /* */ } V.ac = null; V.stream = null; V.enc = null;
      V.bar(); if (!silent && tab === 'voice') { V.sig = ''; poll(true); }
    },
    render() {
      if (tab !== 'voice' || !V.id) return;
      const r = V.room; if (!r) return;
      const host = r.members.find(m => m.slot === V.you) && r.members.find(m => m.slot === V.you).host;
      const sig = JSON.stringify(r) + V.muted + V.deaf;
      if (sig === V.rsig && $('#vstage')) return; V.rsig = sig;
      view().innerHTML = `<div class="vroom" id="vstage"><div class="vhead"><div><b>${esc(r.name)}</b><small>${r.topic ? esc(r.topic) + ' · ' : ''}${r.size} in the room · host ${esc(r.host)}</small></div>
          ${r.mine ? `<button class="btn sm ghost" id="vInvite">${icon('link')} Copy link</button>` : ''}</div>
        <div class="vtiles">${r.members.map(m => `<div class="vtile${m.speaking ? ' spk' : ''}${m.muted ? ' muted' : ''}${m.slot === V.you ? ' you' : ''}" data-slot="${m.slot}">
          <div class="vface"><img src="https://mc-heads.net/avatar/${encodeURIComponent(m.name)}/96" alt=""></div><b>${esc(m.name)}${m.host ? ' ' + icon('crown') : ''}</b>
          <small>${m.client === 'game' ? 'In game' : 'On the website'}${m.muted ? ' · muted' : ''}${m.deaf ? ' · deafened' : ''}</small>
          ${m.slot !== V.you ? `<input type="range" min="0" max="200" value="${Math.round((V.vols[m.name] ?? 1) * 100)}" data-vol="${esc(m.name)}" title="Volume">${host ? `<button class="vkick" data-kick="${m.slot}" title="Remove">${icon('x')}</button>` : ''}` : `<div class="vmeter"><i id="vLvl"></i></div>`}</div>`).join('')}</div>
        <div class="vctl"><button class="vbtn${V.muted ? ' off' : ''}" id="vMute" title="Mute (M)">${icon(V.muted ? 'micoff' : 'mic')}</button><button class="vbtn${V.deaf ? ' off' : ''}" id="vDeaf" title="Deafen">${icon(V.deaf ? 'headoff' : 'headphones')}</button>
          <div class="vset"><label class="chkrow"><input type="checkbox" id="vPtt" ${V.ptt ? 'checked' : ''}><span>Push to talk (hold V)</span></label><label class="vsens">Mic sensitivity<input type="range" id="vSens" min="2" max="60" value="${Math.round(V.sensitivity * 1000)}"></label></div>
          <button class="vbtn leave" id="vLeave" title="Leave">${icon('leave')}</button></div></div>`;
      $('#vMute').onclick = () => V.setMute(!V.muted); $('#vDeaf').onclick = () => V.setDeaf(!V.deaf); $('#vLeave').onclick = () => V.leave();
      $('#vPtt').onchange = e => { V.ptt = e.target.checked; localStorage.setItem('kyoto.voice.ptt', V.ptt ? '1' : '0'); };
      $('#vSens').oninput = e => { V.sensitivity = e.target.value / 1000; localStorage.setItem('kyoto.voice.sens', String(V.sensitivity)); };
      $$('[data-vol]').forEach(i => i.oninput = () => { V.vols[i.dataset.vol] = i.value / 100; localStorage.setItem('kyoto.voice.vols', JSON.stringify(V.vols)); });
      $$('[data-kick]').forEach(b => b.onclick = () => V.ws && V.ws.send(JSON.stringify({ t: 'kick', slot: Number(b.dataset.kick) })));
      const inv = $('#vInvite'); if (inv) inv.onclick = () => navigator.clipboard.writeText(location.origin + '/hub/voice?join=' + r.id).then(() => toast('Link copied', 'Send it to your friends.'));
    },
    bar() {
      const b = $('#vcbar'); if (!V.id || !V.room) { b.hidden = true; return; }
      b.hidden = false;
      b.innerHTML = `<div><b>${icon('mic')} ${esc(V.room.name)}</b><small>${V.room.size} connected</small></div><button id="vbM" class="${V.muted ? 'off' : ''}" title="Mute">${icon(V.muted ? 'micoff' : 'mic')}</button><button id="vbL" class="leave" title="Leave">${icon('leave')}</button>`;
      $('#vbM').onclick = () => V.setMute(!V.muted); $('#vbL').onclick = () => V.leave();
      b.querySelector('div').onclick = () => { switchTab('voice'); history.replaceState(null, '', '/hub/voice'); };
    }
  };
  setInterval(() => { const l = $('#vLvl'); if (l) l.style.width = Math.min(100, V.level * 900) + '%'; }, 80);
  addEventListener('keydown', e => { if (!V.id || e.target.matches('input, textarea')) return; if (e.key.toLowerCase() === 'v') V.pttDown = true; if (e.key.toLowerCase() === 'm' && tab === 'voice') V.setMute(!V.muted); });
  addEventListener('keyup', e => { if (e.key.toLowerCase() === 'v') V.pttDown = false; });
  const vq = new URLSearchParams(location.search).get('join'); if (vq) setTimeout(() => { if (loggedIn()) { tab = 'voice'; V.join(vq); } }, 1200);

  /* ================================================================ Looking For Group ================================================================ */
  const L = {
    game: '', posts: [], games: [],
    async poll(first) {
      const r = await api('/lfg' + (L.game ? '?game=' + encodeURIComponent(L.game) : ''), { auth: loggedIn() });
      L.posts = r.posts; L.games = r.games;
      const sig = JSON.stringify(r); if (!first && sig === L.sig) return; L.sig = sig;
      view().innerHTML = `<div class="lchips"><button class="${!L.game ? 'on' : ''}" data-lg="">All</button>${L.games.map(g => `<button class="${L.game === g ? 'on' : ''}" data-lg="${esc(g)}">${esc(g)}</button>`).join('')}</div>
        ${L.posts.length ? `<div class="lgrid">${L.posts.map(p => L.card(p)).join('')}</div>` : `<div class="hub-empty"><h3>Nobody's looking right now</h3><p>Post what you want to play: people join, and you all get a group chat${'AudioEncoder' in window ? ' (and a voice room if you want)' : ''}.</p><button class="btn glow" id="lNew2">${icon('plus')} Post</button></div>`}`;
      $$('[data-lg]').forEach(b => b.onclick = () => { L.game = b.dataset.lg; L.sig = ''; poll(true); });
      const n2 = $('#lNew2'); if (n2) n2.onclick = () => L.postDialog();
      $$('[data-lj]').forEach(b => b.onclick = async () => { if (!loggedIn()) return toast('Log in first', ''); try { const r2 = await api('/lfg/join', { method: 'POST', body: { id: Number(b.dataset.lj) } }); toast('You\'re in!', r2.server ? 'Server: ' + r2.server : 'Say hi in the group chat.', () => openWhere('g:' + r2.group)); L.sig = ''; poll(false); } catch (e) { toast('Couldn\'t join', e.message); } });
      $$('[data-ll]').forEach(b => b.onclick = async () => { await call('/lfg/leave', { id: Number(b.dataset.ll) }, 'Left the group'); L.sig = ''; poll(false); });
      $$('[data-lc]').forEach(b => b.onclick = async () => { if (!confirm('Close your post?')) return; await call('/lfg/close', { id: Number(b.dataset.lc) }, 'Closed'); L.sig = ''; poll(false); });
      $$('[data-lgc]').forEach(b => b.onclick = () => openWhere('g:' + b.dataset.lgc));
      $$('[data-lv]').forEach(b => b.onclick = () => { switchTab('voice'); history.replaceState(null, '', '/hub/voice'); V.join(b.dataset.lv); });
      $$('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copied', b.dataset.copy)));
    },
    card(p) {
      const spots = Array.from({ length: p.slots }, (_, i) => i === 0 ? `<img src="${headUrl(p.host)}" title="${esc(p.host)} (host)" alt="">` : p.members[i - 1] ? `<img src="${headUrl(p.members[i - 1])}" title="${esc(p.members[i - 1])}" alt="">` : '<i></i>').join('');
      return `<article class="lcard${p.mine ? ' mine' : ''}${p.full ? ' full' : ''}">
        <div class="ltop"><span class="lgame">${esc(p.game)}</span>${p.mode ? `<span class="lmode">${esc(p.mode)}</span>` : ''}${p.mic ? `<span class="lmic" title="Voice chat">${icon('mic')}</span>` : ''}${p.friend ? '<span class="lfr">Friend</span>' : ''}<span class="lago">${ago(p.at)}</span></div>
        <div class="lhost"><img src="${headUrl(p.host)}" alt=""><div><b>${esc(p.host)}</b><small>${p.hostOnline ? 'Online now' : 'Offline'} · ${left(p.exp)}</small></div></div>
        ${p.text ? `<p>${esc(p.text)}</p>` : ''}
        ${p.server ? `<button class="lsrv" data-copy="${esc(p.server)}" title="Copy">${icon('server')} ${esc(p.server)} ${icon('copy')}</button>` : ''}
        <div class="lspots">${spots}<span>${p.members.length + 1}/${p.slots}</span></div>
        <div class="lacts">${p.mine ? `${p.group ? `<button class="btn sm" data-lgc="${p.group}">${icon('chat')} Group chat</button>` : '<span class="muted small">Waiting for people…</span>'}${p.voice ? `<button class="btn sm ghost" data-lv="${p.voice}">${icon('mic')}</button>` : ''}<button class="btn sm ghost" data-lc="${p.id}">Close</button>`
          : p.joined ? `<button class="btn sm" data-lgc="${p.group}">${icon('chat')} Group chat</button>${p.voice ? `<button class="btn sm ghost" data-lv="${p.voice}">${icon('mic')} Voice</button>` : ''}<button class="btn sm ghost" data-ll="${p.id}">Leave</button>`
          : `<button class="btn sm glow" data-lj="${p.id}" ${p.full ? 'disabled' : ''}>${p.full ? 'Full' : 'Join'}</button>`}</div></article>`;
    },
    postDialog() {
      if (!loggedIn()) return toast('Log in first', '');
      let game = L.game || 'Bedwars', mic = false, slots = 4, minutes = 60;
      const box = modal(`<span class="eyebrow">${icon('team')} Looking For Group</span><h2>What do you want to play?</h2>
        <div class="lchips in">${(L.games.length ? L.games : ['Bedwars', 'Skywars', 'SMP']).map(g => `<button type="button" class="${g === game ? 'on' : ''}" data-pg="${esc(g)}">${esc(g)}</button>`).join('')}</div>
        <div class="row2"><label class="fld"><span>Mode (optional)</span><input id="lMode" maxlength="30" placeholder="Doubles, Ranked, Hardcore…"></label><label class="fld"><span>Server (optional)</span><input id="lSrv" maxlength="60" placeholder="mc.hypixel.net"></label></div>
        <label class="fld"><span>Message</span><input id="lText" maxlength="160" placeholder="Need 2 more, chill vibes, no sweats"></label>
        <div class="row2"><div class="fld"><span>Group size</span><div class="stepper"><button type="button" id="lMinus">-</button><b id="lSlots">4</b><button type="button" id="lPlus">+</button></div></div>
          <div class="fld"><span>For</span><div class="seg" id="lFor"><button type="button" data-m="30">30 min</button><button type="button" class="on" data-m="60">1 h</button><button type="button" data-m="120">2 h</button><button type="button" data-m="240">4 h</button></div></div></div>
        <label class="chkrow"><input type="checkbox" id="lMic"><span>Make a voice room for the group</span></label>
        <button class="btn glow wide" id="lGo">Post</button>`);
      $$('[data-pg]', box).forEach(b => b.onclick = () => { game = b.dataset.pg; $$('[data-pg]', box).forEach(x => x.classList.toggle('on', x === b)); });
      $$('[data-m]', box).forEach(b => b.onclick = () => { minutes = Number(b.dataset.m); $$('[data-m]', box).forEach(x => x.classList.toggle('on', x === b)); });
      const setS = d => { slots = Math.max(2, Math.min(16, slots + d)); $('#lSlots', box).textContent = slots; };
      $('#lMinus', box).onclick = () => setS(-1); $('#lPlus', box).onclick = () => setS(1);
      $('#lMic', box).onchange = e => { mic = e.target.checked; };
      $('#lGo', box).onclick = async () => { try { await api('/lfg/post', { method: 'POST', body: { game, mode: $('#lMode', box).value.trim(), server: $('#lSrv', box).value.trim(), text: $('#lText', box).value.trim(), slots, minutes, mic } }); box.remove(); toast('Posted', 'People can join now. You get a ping when they do.'); L.sig = ''; poll(false); } catch (e) { toast('Couldn\'t post', e.message); } };
    }
  };

  /* ================================================================ Server Reviews ================================================================ */
  const SV = {
    sort: 'top', q: '', ip: null,
    icon: ip => `<img class="sicon" src="https://api.mcsrvstat.us/icon/${encodeURIComponent(ip)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`,
    stars: (n, cls = '') => `<span class="stars ${cls}">${[1, 2, 3, 4, 5].map(i => `<i class="${n >= i ? 'f' : n >= i - .5 ? 'h' : ''}">${icon('star')}</i>`).join('')}</span>`,
    async poll(first) {
      if (SV.ip) return first ? SV.detail(SV.ip) : undefined;
      if (!first) return;
      const r = await api('/servers?sort=' + SV.sort + '&q=' + encodeURIComponent(SV.q), { auth: loggedIn() });
      view().innerHTML = `<div class="sbar2"><div class="ssearch">${icon('search')}<input id="svQ" placeholder="Find a server" value="${esc(SV.q)}"></div>
        <div class="seg" id="svSort"><button data-s="top" class="${SV.sort === 'top' ? 'on' : ''}">Top rated</button><button data-s="online" class="${SV.sort === 'online' ? 'on' : ''}">Kyoto players on now</button><button data-s="new" class="${SV.sort === 'new' ? 'on' : ''}">New reviews</button></div></div>
        ${r.played && r.played.length ? `<div class="splayed"><small>You played</small>${r.played.map(ip => `<button data-sv="${esc(ip)}">${esc(ip)}</button>`).join('')}</div>` : ''}
        <div class="slist">${r.servers.map(s => `<button class="scard2" data-sv="${esc(s.ip)}">${SV.icon(s.ip)}<div class="sm2"><b>${esc(s.ip)}</b><span>${s.count ? SV.stars(s.avg) + `<em>${s.avg.toFixed(1)}</em><small>${s.count} review${s.count === 1 ? '' : 's'}</small>` : '<small>No reviews yet</small>'}</span>
          <div class="stags">${s.tags.map(t => `<i class="${/Pay|Laggy|Cheat|Toxic|Empty/.test(t) ? 'bad' : ''}">${esc(t)}</i>`).join('')}</div></div>${s.online ? `<span class="son">${s.online} Kyoto player${s.online === 1 ? '' : 's'} on</span>` : ''}${s.mine ? `<span class="smine">You: ${s.mine}/5</span>` : ''}</button>`).join('') || '<div class="hub-empty"><h3>No servers yet</h3><p>Play on a server with Kyoto and it shows up here. Then leave a review.</p></div>'}</div>`;
      $('#svQ').onkeydown = e => { if (e.key === 'Enter') { SV.q = e.target.value.trim(); poll(true); } };
      $$('[data-s]').forEach(b => b.onclick = () => { SV.sort = b.dataset.s; poll(true); });
      $$('[data-sv]').forEach(b => b.onclick = () => { SV.ip = b.dataset.sv; poll(true); });
    },
    async detail(ip) {
      const r = await api('/servers/one?ip=' + encodeURIComponent(ip) + '&sort=' + (SV.rsort || 'helpful'), { auth: loggedIn() });
      const mine = r.reviews.find(x => x.me);
      view().innerHTML = `<button class="btn xs ghost sback" id="svBack">${icon('chevron')} All servers</button>
        <div class="shero">${SV.icon(r.ip)}<div><h3>${esc(r.ip)}</h3><button class="btn xs ghost" data-copy="${esc(r.ip)}">${icon('copy')} Copy address</button>
          <small>${r.online ? `${r.online} Kyoto player${r.online === 1 ? '' : 's'} on right now` : 'No Kyoto players on right now'}${r.friendsHere.length ? ` · friends here: <b>${r.friendsHere.map(esc).join(', ')}</b>` : ''}</small></div>
          <div class="sscore"><b>${r.count ? r.avg.toFixed(1) : '-'}</b>${SV.stars(r.avg, 'big')}<small>${r.count} review${r.count === 1 ? '' : 's'}</small></div>
          <div class="sdist">${[5, 4, 3, 2, 1].map(n => `<div><span>${n}</span><i><b style="width:${r.count ? r.dist[n - 1] / r.count * 100 : 0}%"></b></i><em>${r.dist[n - 1]}</em></div>`).join('')}</div></div>
        ${r.tags.length ? `<div class="stags big">${r.tags.map(t => `<i class="${/Pay|Laggy|Cheat|Toxic|Empty/.test(t) ? 'bad' : ''}">${esc(t)}</i>`).join('')}</div>` : ''}
        ${r.canReview ? `<div class="swrite"><b>${mine ? 'Your review' : 'Leave a review'}</b><div class="spick" id="svStars">${[1, 2, 3, 4, 5].map(i => `<button data-st="${i}" class="${mine && mine.stars >= i ? 'f' : ''}">${icon('star')}</button>`).join('')}</div>
          <div class="stagpick">${r.tagsAll.map(t => `<button data-tg2="${esc(t)}" class="${mine && mine.tags.includes(t) ? 'on' : ''}${/Pay|Laggy|Cheat|Toxic|Empty/.test(t) ? ' bad' : ''}">${esc(t)}</button>`).join('')}</div>
          <textarea id="svText" maxlength="500" rows="3" placeholder="What's it like? Staff, lag, players, what there is to do…">${mine ? esc(mine.text) : ''}</textarea>
          <div class="sacts2"><button class="btn sm glow" id="svGo">${mine ? 'Update' : 'Post review'}</button>${mine ? '<button class="btn sm ghost" id="svDel">Delete</button>' : ''}</div></div>`
          : `<p class="muted small snote">${loggedIn() ? 'Play on this server with Kyoto first, then you can review it. That keeps reviews real.' : 'Log in to leave a review.'}</p>`}
        <div class="srhead"><b>Reviews</b><div class="seg sm" id="svRs">${[['helpful', 'Most helpful'], ['new', 'Newest'], ['high', 'Highest'], ['low', 'Lowest']].map(([k, n]) => `<button data-rs="${k}" class="${(SV.rsort || 'helpful') === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        <div class="srevs">${r.reviews.map(v => `<article class="srev${v.me ? ' me' : ''}"><img src="${headUrl(v.name)}" alt=""><div><div class="srh"><b>${esc(v.name)}</b>${SV.stars(v.stars)}<small>${ago(v.at)}</small></div>
          ${v.tags.length ? `<div class="stags">${v.tags.map(t => `<i class="${/Pay|Laggy|Cheat|Toxic|Empty/.test(t) ? 'bad' : ''}">${esc(t)}</i>`).join('')}</div>` : ''}${v.text ? `<p>${esc(v.text)}</p>` : ''}
          <div class="sra">${v.me ? '' : `<button class="${v.helpedByMe ? 'on' : ''}" data-help="${esc(v.name)}">${icon('check')} Helpful${v.helpful ? ' · ' + v.helpful : ''}</button><button data-srep="${esc(v.name)}">${icon('flag')} Report</button>`}${me && me.staff && !v.me ? `<button data-sdel="${esc(v.name)}">${icon('trash')}</button>` : ''}</div></div></article>`).join('') || '<p class="muted small">No reviews yet. Be the first!</p>'}</div>`;
      $('#svBack').onclick = () => { SV.ip = null; poll(true); };
      $$('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copied', b.dataset.copy)));
      $$('[data-rs]').forEach(b => b.onclick = () => { SV.rsort = b.dataset.rs; SV.detail(ip); });
      let stars = mine ? mine.stars : 0; const tags = new Set(mine ? mine.tags : []);
      $$('[data-st]').forEach(b => { b.onclick = () => { stars = Number(b.dataset.st); $$('[data-st]').forEach(x => x.classList.toggle('f', Number(x.dataset.st) <= stars)); }; b.onmouseenter = () => $$('[data-st]').forEach(x => x.classList.toggle('hv', Number(x.dataset.st) <= Number(b.dataset.st))); b.onmouseleave = () => $$('[data-st]').forEach(x => x.classList.remove('hv')); });
      $$('[data-tg2]').forEach(b => b.onclick = () => { const t = b.dataset.tg2; if (tags.has(t)) tags.delete(t); else if (tags.size < 3) tags.add(t); else return toast('3 tags max', ''); b.classList.toggle('on', tags.has(t)); });
      const go = $('#svGo'); if (go) go.onclick = async () => { if (!stars) return toast('Pick some stars', ''); await call('/servers/review', { ip, stars, text: $('#svText').value.trim(), tags: [...tags] }, 'Thanks for the review!'); SV.detail(ip); };
      const del = $('#svDel'); if (del) del.onclick = async () => { if (!confirm('Delete your review?')) return; await call('/servers/review/delete', { ip }, 'Deleted'); SV.detail(ip); };
      $$('[data-help]').forEach(b => b.onclick = async () => { if (!loggedIn()) return toast('Log in first', ''); await call('/servers/helpful', { ip, name: b.dataset.help }); SV.detail(ip); });
      $$('[data-srep]').forEach(b => b.onclick = async () => { const why = prompt('What\'s wrong with this review?'); if (why === null) return; await call('/servers/report', { ip, name: b.dataset.srep, reason: why }, 'Reported'); });
      $$('[data-sdel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this review?')) return; await call('/servers/review/delete', { ip, name: b.dataset.sdel }, 'Deleted'); SV.detail(ip); });
    }
  };

  /* ================================================================ Trades ================================================================ */
  const TR = {
    list: [], openId: null, coins: 0,
    thumb: x => `<div class="ith">${window.KY_ITEMS ? window.KY_ITEMS.thumb(x) : ''}</div>`,
    async poll(first) {
      $('#tradeDot').hidden = true;
      if (!loggedIn()) { view().innerHTML = '<div class="hub-empty"><h3>Log in to trade</h3><p>Type <code>/kyoto link</code> in game to get your login code.</p></div>'; return; }
      if (TR.editing) return;
      const r = await api('/trades'); TR.list = r.trades; TR.coins = r.coins;
      const sig = JSON.stringify(r) + TR.openId; if (!first && sig === TR.sig) return; TR.sig = sig;
      if (TR.openId) return TR.renderOne(TR.list.find(t => t.id === TR.openId));
      const openL = TR.list.filter(t => t.state === 'open'), done = TR.list.filter(t => t.state !== 'open');
      const row = t => `<button class="trow ${t.state}" data-to="${t.id}"><img src="${headUrl(t.with)}" alt=""><div><b>${t.mine ? 'To' : 'From'} ${esc(t.with)}</b>
        <small>${t.give.length} for ${t.get.length}${t.coinsGive ? ` + you pay ${t.coinsGive}` : ''}${t.coinsGet ? ` + you get ${t.coinsGet}` : ''} coins · ${ago(t.upd)}</small></div>
        <span class="tstate">${t.state === 'open' ? (t.iConfirmed ? 'Waiting for them' : t.theyConfirmed ? 'Your turn: confirm' : 'Open') : t.state === 'done' ? 'Done' : t.state[0].toUpperCase() + t.state.slice(1)}</span></button>`;
      view().innerHTML = `<div class="tcoins">${icon('coin')} <b>${TR.coins.toLocaleString()}</b> coins</div>
        ${openL.length ? `<h4 class="th4">Open</h4>${openL.map(row).join('')}` : `<div class="hub-empty sm"><h3>No open trades</h3><p>Pick a friend, choose what you give and what you want, and both of you confirm.</p><button class="btn glow" id="tNew2">${icon('swap')} New trade</button></div>`}
        ${done.length ? `<h4 class="th4">History</h4>${done.map(row).join('')}` : ''}`;
      $$('[data-to]').forEach(b => b.onclick = () => TR.open(Number(b.dataset.to)));
      const n2 = $('#tNew2'); if (n2) n2.onclick = () => TR.editor(null);
    },
    open(id) { TR.openId = id; TR.sig = ''; poll(true); },
    renderOne(t) {
      if (!t) { TR.openId = null; return poll(true); }
      const side = (title, items, coins) => `<div class="tside"><h4>${title}</h4><div class="titems">${items.map(x => `<div class="icard static">${TR.thumb(x)}<b>${esc(x.title)}</b><small>${esc(x.slot)} · ${x.price ? x.price + ' coins' : 'free'}</small></div>`).join('') || '<p class="muted small">Nothing</p>'}</div>${coins ? `<div class="tcoin">${icon('coin')} ${coins.toLocaleString()} coins</div>` : ''}</div>`;
      const open = t.state === 'open';
      view().innerHTML = `<button class="btn xs ghost sback" id="tBack">${icon('chevron')} All trades</button>
        <div class="tdetail"><div class="thead"><img src="${headUrl(t.with)}" alt=""><div><b>Trade with ${esc(t.with)}</b><small>${t.mine ? 'You started it' : esc(t.with) + ' started it'} · ${ago(t.at)}${t.lastBy ? ' · last change by ' + esc(t.lastBy) : ''}</small>${t.note ? `<q>${esc(t.note)}</q>` : ''}</div>
          <span class="tstate big ${t.state}">${open ? 'Open' : t.state}</span></div>
          <div class="tsides">${side('You give', t.give, t.coinsGive)}<div class="tarrow">${icon('swap')}</div>${side('You get', t.get, t.coinsGet)}</div>
          ${t.why ? `<p class="warnbar">${esc(t.why)}</p>` : ''}
          ${open ? `<div class="tconf"><div class="tc ${t.iConfirmed ? 'ok' : ''}">${icon('check')} You ${t.iConfirmed ? 'confirmed' : 'haven\'t confirmed'}</div><div class="tc ${t.theyConfirmed ? 'ok' : ''}">${icon('check')} ${esc(t.with)} ${t.theyConfirmed ? 'confirmed' : 'hasn\'t confirmed'}</div></div>
          <div class="tacts">${t.iConfirmed ? '<button class="btn ghost" id="tUn">Undo confirm</button>' : `<button class="btn glow" id="tOk" disabled>Confirm (3)</button>`}<button class="btn ghost" id="tCounter">${icon('edit')} Change it</button><button class="btn ghost danger" id="tNo">${t.mine ? 'Cancel trade' : 'Decline'}</button></div>
          <p class="muted small">Look it over: confirming means you agree to exactly this. If anyone changes anything, both of you have to confirm again.</p>` : ''}</div>`;
      $('#tBack').onclick = () => { TR.openId = null; TR.sig = ''; poll(true); };
      const ok = $('#tOk');
      if (ok) { let n = 3; const tick = setInterval(() => { n--; if (!document.body.contains(ok)) return clearInterval(tick); if (n <= 0) { clearInterval(tick); ok.disabled = false; ok.textContent = 'Confirm trade'; } else ok.textContent = `Confirm (${n})`; }, 1000);
        ok.onclick = async () => { ok.disabled = true; try { const r = await api('/trades/confirm', { method: 'POST', body: { id: t.id, rev: t.rev } }); toast(r.done ? 'Trade done!' : 'Confirmed', r.done ? 'Everything is in your Locker.' : `Waiting for ${t.with}.`); } catch (e) { toast('Couldn\'t confirm', e.message); } TR.sig = ''; poll(false); }; }
      const un = $('#tUn'); if (un) un.onclick = async () => { await call('/trades/unconfirm', { id: t.id }); TR.sig = ''; poll(false); };
      const no = $('#tNo'); if (no) no.onclick = async () => { if (!confirm(t.mine ? 'Cancel this trade?' : 'Decline this trade?')) return; await call('/trades/decline', { id: t.id }, 'Closed'); TR.sig = ''; poll(false); };
      const ct = $('#tCounter'); if (ct) ct.onclick = () => TR.editor(t);
      if (window.KY_ITEMS) window.KY_ITEMS.draw(view());
    },
    async editor(t, withName) {
      if (!loggedIn()) return toast('Log in first', '');
      let friends = []; try { friends = (await api('/friends')).friends || []; } catch (e) { /* */ }
      TR.editing = true;
      let other = t ? t.with : withName || null;
      const give = new Set(t ? t.give.map(x => x.id) : []), want = new Set(t ? t.get.map(x => x.id) : []);
      let coinsGive = t ? t.coinsGive : 0, coinsWant = t ? t.coinsGet : 0;
      const mine = (await api('/trade/locker')).items;
      const draw = async () => {
        let theirs = [], owned = [];
        if (other) { try { const r = await api('/trade/locker?name=' + encodeURIComponent(other)); theirs = r.items; owned = r.owned || []; } catch (e) { toast('Couldn\'t load their Locker', e.message); } }
        const grid = (items, set, key, blocked) => `<div class="ipick">${items.map(x => `<button type="button" class="icard${set.has(x.id) ? ' on' : ''}${blocked && blocked.includes(x.id) ? ' dim' : ''}" data-${key}="${x.id}" ${blocked && blocked.includes(x.id) ? 'disabled title="You already own this"' : ''}>${TR.thumb(x)}<b>${esc(x.title)}</b><small>${esc(x.slot)} · ${x.price ? x.price + ' coins' : 'free'}</small></button>`).join('') || '<p class="muted small">Nothing tradable</p>'}</div>`;
        view().innerHTML = `<button class="btn xs ghost sback" id="teBack">${icon('chevron')} Back</button>
          <div class="tedit"><h3>${t ? 'Change the trade' : 'New trade'}</h3>
          ${t ? '' : `<div class="fld"><span>Trade with</span><div class="gfriends">${friends.map(f => `<button type="button" class="gf${f.name === other ? ' on' : ''}" data-tf="${esc(f.name)}"><img src="https://mc-heads.net/avatar/${encodeURIComponent(f.name)}/32" alt=""><span>${esc(f.name)}</span>${f.online ? '<i class="on"></i>' : ''}</button>`).join('') || '<p class="muted small">Add friends in game first (/kyoto friends).</p>'}</div></div>`}
          ${other ? `<div class="tsides"><div class="tside"><h4>You give</h4>${grid(mine, give, 'tg')}<label class="tcin">${icon('coin')}<input type="number" min="0" max="100000" id="tCg" value="${coinsGive || ''}" placeholder="0"> coins <small>(you have ${TR.coins.toLocaleString()})</small></label></div>
            <div class="tarrow">${icon('swap')}</div>
            <div class="tside"><h4>You want from ${esc(other)}</h4>${grid(theirs, want, 'tw', owned)}<label class="tcin">${icon('coin')}<input type="number" min="0" max="100000" id="tCw" value="${coinsWant || ''}" placeholder="0"> coins</label></div></div>
            ${t ? '' : '<label class="fld"><span>Note (optional)</span><input id="tNote" maxlength="140" placeholder="Fair deal?"></label>'}
            <button class="btn glow wide" id="teGo">${t ? 'Send changes' : 'Send trade offer'}</button>
            <p class="muted small">Only things you got from others can be traded (things you made stay yours: sell them in the Store). Only one side can add coins.</p>` : ''}</div>`;
        if (window.KY_ITEMS) window.KY_ITEMS.draw(view());
        $('#teBack').onclick = () => { TR.editing = false; TR.sig = ''; poll(true); };
        $$('[data-tf]').forEach(b => b.onclick = () => { other = b.dataset.tf; want.clear(); draw(); });
        $$('[data-tg]').forEach(b => b.onclick = () => { const id = Number(b.dataset.tg); give.has(id) ? give.delete(id) : give.add(id); b.classList.toggle('on', give.has(id)); });
        $$('[data-tw]').forEach(b => b.onclick = () => { const id = Number(b.dataset.tw); want.has(id) ? want.delete(id) : want.add(id); b.classList.toggle('on', want.has(id)); });
        const go = $('#teGo'); if (go) go.onclick = async () => {
          coinsGive = Number($('#tCg').value) || 0; coinsWant = Number($('#tCw').value) || 0;
          try {
            if (t) await api('/trades/edit', { method: 'POST', body: { id: t.id, give: [...give], want: [...want], coinsGive, coinsWant } });
            else { const r = await api('/trades/new', { method: 'POST', body: { to: other, give: [...give], want: [...want], coinsGive, coinsWant, note: $('#tNote').value.trim() } }); TR.openId = r.id; }
            toast(t ? 'Changes sent' : 'Trade offer sent', `${other} has to confirm, then you do.`);
            TR.editing = false; TR.sig = ''; poll(true);
          } catch (e) { toast('Couldn\'t send it', e.message); }
        };
      };
      draw();
    }
  };

  /* ================================================================ Live Rooms (watch YouTube together) ================================================================ */
  const R = {
    id: null, room: null, since: 0, receivedAt: 0, player: null, ytReady: false, started: false, chat: [], lastDur: 0,
    async poll(first) {
      if (!R.id) return R.list();
      const r = await api('/rooms/state?id=' + encodeURIComponent(R.id) + '&since=' + R.since);
      R.room = r.room; R.receivedAt = Date.now();
      for (const m of r.messages) { R.chat.push(m); R.since = Math.max(R.since, m.at); }
      R.chat = R.chat.slice(-150);
      R.render(); R.sync();
    },
    async list() {
      if (!loggedIn()) { $('#rList').innerHTML = '<div class="hub-empty"><h3>Log in to join a room</h3><p>Rooms are for Kyoto players. Type <code>/kyoto link</code> in game to get your login code.</p></div>'; return; }
      const r = await api('/rooms');
      $('#rRoom').hidden = true; $('#rList').hidden = false;
      $('#rList').innerHTML = r.rooms.length ? `<div class="rgrid">${r.rooms.map(x => `<button class="rcard2" data-room="${esc(x.id)}">
        <div class="rthumb" style="${x.yt ? `background-image:url(https://i.ytimg.com/vi/${x.yt}/hqdefault.jpg)` : ''}"><span class="rlive">LIVE · ${x.viewers}</span>${x.privacy === 'friends' ? '<span class="rpriv">Friends</span>' : ''}</div>
        <b>${esc(x.name)}</b><small>${x.now ? esc(x.now) : 'Nothing playing yet'} · host ${esc(x.host)}</small></button>`).join('')}</div>`
        : `<div class="hub-empty"><h3>No rooms open right now</h3><p>Make one, paste a YouTube link, and invite your friends. Kyoto players in game can join too.</p><button class="btn glow" id="rNew2">Make a room</button></div>`;
      $$('[data-room]').forEach(b => b.onclick = () => R.join(b.dataset.room));
      const n2 = $('#rNew2'); if (n2) n2.onclick = () => R.createDialog();
    },
    createDialog() {
      if (!loggedIn()) return toast('Log in first', 'Type /kyoto link in game for a code.');
      const box = modal(`<form id="rMake"><span class="eyebrow">Live Rooms</span><h2>Make a room</h2>
        <label class="fld"><span>Name</span><input name="name" maxlength="40" placeholder="Movie night"></label>
        <label class="fld"><span>First video (optional)</span><input name="url" placeholder="https://youtube.com/watch?v=..."></label>
        <div class="fld"><span>Who can join</span><div class="seg" id="rPriv"><button type="button" class="on" data-v="public">Anyone</button><button type="button" data-v="friends">Friends only</button></div></div>
        <div class="fld"><span>Who controls the video</span><div class="seg" id="rCtl"><button type="button" class="on" data-v="host">Only me</button><button type="button" data-v="everyone">Everyone</button></div></div>
        <button class="btn glow wide">Make the room</button></form>`);
      let priv = 'public', ctl = 'host';
      $$('#rPriv [data-v]', box).forEach(b => b.onclick = () => { priv = b.dataset.v; $$('#rPriv [data-v]', box).forEach(x => x.classList.toggle('on', x === b)); });
      $$('#rCtl [data-v]', box).forEach(b => b.onclick = () => { ctl = b.dataset.v; $$('#rCtl [data-v]', box).forEach(x => x.classList.toggle('on', x === b)); });
      $('#rMake', box).onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        try { const r = await api('/rooms/create', { method: 'POST', body: { name: f.name.value.trim(), url: f.url.value.trim(), privacy: priv, control: ctl } }); box.remove(); R.join(r.id); }
        catch (err) { toast('Couldn\'t make the room', err.message); }
      };
    },
    join(id) {
      R.id = id; R.room = null; R.chat = []; R.since = 0; R.started = false; R.lastDur = 0;
      $('#rList').hidden = true; $('#rRoom').hidden = false; $('#rChat').innerHTML = ''; $('#rCover').hidden = false;
      history.replaceState(null, '', '/rooms');
      R.loadYT(); clearTimeout(timer); poll(true);
    },
    leave(toList = true) {
      if (R.id) api('/rooms/leave', { method: 'POST', body: { id: R.id } }).catch(() => {});
      R.id = null; R.room = null;
      if (R.player && R.player.stopVideo) try { R.player.stopVideo(); } catch (e) { /* */ }
      if (toList) { clearTimeout(timer); poll(true); }
    },
    loadYT() {
      if (window.YT && window.YT.Player) { R.ytReady = true; return; }
      if (document.getElementById('ytApi')) return;
      window.onYouTubeIframeAPIReady = () => { R.ytReady = true; R.sync(); };
      const sc = document.createElement('script'); sc.id = 'ytApi'; sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc);
    },
    expected() { const v = R.room && R.room.video; if (!v) return 0; return v.playing ? v.pos + (Date.now() - R.receivedAt) / 1000 : v.pos; },
    sync() {
      const v = R.room && R.room.video;
      $('#rEmpty').hidden = !!(v && v.yt);
      if (!v) { $('#rEmpty').innerHTML = `<b>Nothing playing</b><span>${R.room && R.room.canControl ? 'Paste a YouTube link below.' : 'Waiting for the host to pick something.'}</span>`; if (R.player && R.player.stopVideo) try { R.player.stopVideo(); } catch (e) { /* */ } return; }
      if (!v.yt) { $('#rEmpty').innerHTML = '<b>This video only plays in game</b><span>It isn\'t a YouTube link.</span>'; return; }
      if (!R.ytReady || !R.started) return;
      const want = R.expected();
      if (!R.player) {
        R.player = new YT.Player('ytPlayer', { videoId: v.yt, playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, start: Math.floor(want), autoplay: 1 },
          events: { onReady: () => { R.player.setVolume(Number($('#rVol').value)); R.sync(); } } });
        R.vid = v.yt; return;
      }
      if (!R.player.getPlayerState) return;
      if (R.vid !== v.yt) { R.vid = v.yt; R.lastDur = 0; R.player.loadVideoById({ videoId: v.yt, startSeconds: want }); if (!v.playing) setTimeout(() => R.player.pauseVideo(), 600); return; }
      const st = R.player.getPlayerState();
      if (v.playing && st !== 1 && st !== 3) R.player.playVideo();
      if (!v.playing && st === 1) R.player.pauseVideo();
      const now = R.player.getCurrentTime ? R.player.getCurrentTime() : 0;
      if (Math.abs(now - want) > (v.playing ? 1.6 : .6)) R.player.seekTo(want, true);
      const dur = R.player.getDuration ? R.player.getDuration() : 0;
      if (dur > 0 && !R.lastDur) { R.lastDur = dur; api('/rooms/control', { method: 'POST', body: { id: R.id, action: 'duration', dur } }).catch(() => {}); }
    },
    control(action, extra) { return api('/rooms/control', { method: 'POST', body: Object.assign({ id: R.id, action }, extra || {}) }).then(() => poll(false)).catch(e => toast('Couldn\'t do that', e.message)); },
    render() {
      const r = R.room; if (!r) return;
      $('#rName').textContent = r.name;
      $('#rMeta').textContent = `${r.viewers} watching · host ${r.host}${r.control === 'everyone' ? ' · everyone controls' : ''}${r.privacy === 'friends' ? ' · friends only' : ''}`;
      $('#rMembers').innerHTML = r.members.map(m => `<img src="${headUrl(m.name)}" title="${esc(m.name)}${m.host ? ' (host)' : ''}" class="${m.host ? 'host' : ''}" alt="">`).join('');
      const v = r.video;
      $('#rTitle').textContent = v ? v.title : 'Nothing playing';
      $('#rBy').textContent = v ? 'Picked by ' + v.by : '';
      for (const id of ['#rPlay', '#rBack', '#rFwd', '#rSkip']) $(id).disabled = !r.canControl || (!v && id !== '#rSkip');
      $('#rRoom').classList.toggle('noctl', !r.canControl);
      $('#rPlay').innerHTML = v && v.playing ? icon('pause') : icon('play');
      $('[data-ra="load"]').hidden = !r.canControl;
      $('#rQueue').innerHTML = r.queue.length ? '<h4>Up next</h4>' + r.queue.map((q, i) => `<div class="rq"><span>${i + 1}</span><b>${esc(q.title)}</b><small>${esc(q.by)}</small>${r.canControl ? `<button data-rq="${i}" title="Remove">${icon('x')}</button>` : ''}</div>`).join('') : '';
      $$('[data-rq]').forEach(b => b.onclick = () => R.control('remove', { index: Number(b.dataset.rq) }));
      const box = $('#rChat'), stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      box.innerHTML = R.chat.map(m => m.sys ? `<p class="sys">${esc(m.text)}</p>` : `<p><img src="${headUrl(m.name)}" alt=""><b class="${m.me ? 'me' : ''}">${esc(m.name)}</b> ${esc(m.text)}</p>`).join('') || '<p class="sys">Say hi!</p>';
      if (stick) box.scrollTop = box.scrollHeight;
    }
  };
  setInterval(() => {
    if (!R.id || !R.room || !R.room.video) return;
    const dur = R.lastDur || (R.player && R.player.getDuration ? R.player.getDuration() : 0), t = R.expected();
    $('#rProg').style.width = dur ? Math.min(100, t / dur * 100) + '%' : '0%';
    const f = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    $('#rTime').textContent = f(t) + (dur ? ' / ' + f(dur) : '');
  }, 250);
  $('#rStart').onclick = () => { R.started = true; $('#rCover').hidden = true; R.sync(); };
  $('#rPlay').onclick = () => R.room && R.room.video && R.control(R.room.video.playing ? 'pause' : 'play');
  $('#rBack').onclick = () => R.control('seek', { pos: Math.max(0, R.expected() - 10) });
  $('#rFwd').onclick = () => R.control('seek', { pos: R.expected() + 10 });
  $('#rSkip').onclick = () => R.control('skip');
  $('#rSeek').onclick = e => { if (!R.room || !R.room.canControl || !R.lastDur) return; const r = e.currentTarget.getBoundingClientRect(); R.control('seek', { pos: (e.clientX - r.left) / r.width * R.lastDur }); };
  $('#rVol').oninput = e => { if (R.player && R.player.setVolume) R.player.setVolume(Number(e.target.value)); };
  $('#rLeave').onclick = () => R.leave(true);
  $('#rAdd').onsubmit = e => { e.preventDefault(); const u = $('#rUrl').value.trim(); if (!u) return; $('#rUrl').value = ''; R.control(R.room && R.room.canControl ? 'load' : 'queue', { url: u }); };
  $('[data-ra="queue"]').onclick = () => { const u = $('#rUrl').value.trim(); if (!u) return; $('#rUrl').value = ''; R.control('queue', { url: u }); };
  $('#rSay').onsubmit = async e => { e.preventDefault(); const t = $('#rMsg').value.trim(); if (!t || !R.id) return; $('#rMsg').value = ''; try { await api('/rooms/chat', { method: 'POST', body: { id: R.id, text: t } }); poll(false); } catch (err) { toast('Couldn\'t send', err.message); } };

  window.KY_HUB = { open, voice: V };
})();
