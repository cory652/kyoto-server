/* Kyoto Hub on the website: Chat (shared with the game + Discord), DMs, and Mods for staff. */
'use strict';
(() => {
  let tab = 'chat', dmWith = null, since = 0, timer = 0, me = null, msgs = [], pending = null, opened = false;
  const feed = () => $('#hubFeed');
  const headUrl = n => `https://mc-heads.net/avatar/${encodeURIComponent(n || 'MHF_Steve')}/40`;
  const loggedIn = () => !!localStorage.getItem('kyoto.token');
  const time = t => { const d = new Date(t), now = new Date(); const hm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return d.toDateString() === now.toDateString() ? 'Today at ' + hm : d.toLocaleDateString() + ' ' + hm; };
  const linkify = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`);

  async function open() {
    opened = true;
    $('#hubLogin').hidden = loggedIn();
    $('#hubCompose').hidden = !loggedIn();
    if (loggedIn() && !me) {
      try { me = await api('/me'); } catch (e) { if (e.status === 401) { localStorage.removeItem('kyoto.token'); $('#hubLogin').hidden = false; $('#hubCompose').hidden = true; } }
    }
    $('#hrMods').hidden = !(me && me.staff);
    $('#hubMe').innerHTML = me ? `<img src="${headUrl(me.name)}" alt=""><div><b>${esc(me.name)}</b><small>${me.staff ? 'Kyoto staff' : 'Online'}</small></div>` : '';
    switchTab(tab, true);
  }

  function switchTab(t, keep) {
    tab = t; if (!keep) dmWith = null;
    $$('.hr').forEach(b => b.classList.toggle('on', b.dataset.ht === t));
    since = 0; msgs = [];
    feed().innerHTML = '<div class="hub-load"></div>';
    $('#hubThreads').hidden = t !== 'dms';
    $('#hubCompose').hidden = !loggedIn() || t === 'mods' || (t === 'dms' && !dmWith);
    if (t === 'chat') { $('#hubTitle').textContent = '# chat'; $('#hubSub').textContent = 'Talk with every Kyoto player, in game, here and on Discord.'; $('#hubInput').placeholder = 'Message #chat'; }
    if (t === 'dms') { $('#hubTitle').textContent = dmWith ? '@ ' + dmWith : 'Direct messages'; $('#hubSub').textContent = dmWith ? 'Private chat. Pictures only go to friends.' : 'Pick a chat on the left, or start one.'; $('#hubInput').placeholder = 'Message @' + (dmWith || ''); }
    if (t === 'mods') { $('#hubTitle').textContent = 'Mods'; $('#hubSub').textContent = 'Approve new cosmetics, handle reports, keep the Hub nice.'; }
    $('#hubTopR').innerHTML = t === 'mods' ? '<a class="btn sm ghost" href="/mod" data-link>Full staff panel</a>' : t === 'dms' ? '<button class="btn sm ghost" id="dmNew">New message</button>' : '';
    const nb = $('#dmNew'); if (nb) nb.onclick = () => { const n = prompt('Who do you want to message? (Minecraft name)'); if (n && n.trim()) { dmWith = n.trim(); switchTab('dms', true); } };
    clearTimeout(timer); poll(true);
  }
  $$('.hr').forEach(b => b.onclick = () => switchTab(b.dataset.ht));

  async function poll(first) {
    clearTimeout(timer);
    if (location.pathname !== '/hub') return;
    try {
      if (tab === 'chat') await pollChat(first);
      else if (tab === 'dms') await pollDms(first);
      else if (tab === 'mods') await pollMods();
    } catch (e) {
      if (first) feed().innerHTML = `<div class="hub-empty"><h3>Can't reach the Hub</h3><p>${esc(e.message)}. The Kyoto server may be waking up, try again in a moment.</p></div>`;
    }
    timer = setTimeout(() => poll(false), tab === 'mods' ? 10000 : 2500);
  }

  /* ---------- chat ---------- */
  async function pollChat(first) {
    const r = await api('/chat?since=' + since, { auth: loggedIn() });
    const got = r.messages || [];
    if (first) msgs = [];
    if (!got.length && !first) return;
    const stick = first || feed().scrollHeight - feed().scrollTop - feed().clientHeight < 80;
    msgs = msgs.concat(got).slice(-200);
    since = Math.max(since, ...got.map(m => m.at), 0);
    renderMsgs(msgs, false);
    if (stick) feed().scrollTop = feed().scrollHeight;
  }
  function renderMsgs(list, dm) {
    if (!list.length) { feed().innerHTML = `<div class="hub-empty"><h3>${dm ? 'Say hi' : 'It\'s quiet in here'}</h3><p>${dm ? 'This is the start of your chat.' : 'Be the first to say something.'}</p></div>`; return; }
    let html = '', prev = null;
    for (const m of list) {
      const grouped = prev && prev.name === m.name && !!prev.discord === !!m.discord && m.at - prev.at < 5 * 60000;
      const img = m.img ? (dm ? `${CONFIG.api}/dm/img?id=${m.img}&auth=${encodeURIComponent(localStorage.getItem('kyoto.token') || '')}` : `${CONFIG.api}/chat/img?id=${m.img}`) : null;
      const body = `${m.text ? `<div class="mt">${linkify(m.text)}</div>` : ''}${img ? `<img class="mimg" src="${img}" alt="picture" loading="lazy">` : ''}`;
      const tools = !dm && m.id ? `<div class="mtools">${me && me.staff ? `<button data-del="${m.id}" title="Delete">${icon('trash')}</button>` : ''}${me && !m.me ? `<button data-rep="${m.id}" title="Report">${icon('flag')}</button>` : ''}</div>` : '';
      if (grouped) html += `<div class="msg cont${m.me ? ' mine' : ''}"><span class="mtime">${new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>${body}${tools}</div>`;
      else html += `<div class="msg${m.me ? ' mine' : ''}"><img class="mav" src="${m.discord ? (m.avatar || '/img/favicon.png') : headUrl(m.name)}" alt="">
        <div class="mb"><div class="mh">${m.discord ? `<b>${esc(m.name)}</b><span class="tag dc">Discord</span>` : `<a href="/u/${encodeURIComponent(m.name)}" data-link><b>${esc(m.name)}</b></a>${m.owner ? '<span class="tag own">Owner</span>' : m.staff ? '<span class="tag mod">Mod</span>' : ''}${m.plus ? '<span class="tag plus">K+</span>' : ''}`}<span class="mtime2">${time(m.at)}</span></div>${body}</div>${tools}</div>`;
      prev = m;
    }
    feed().innerHTML = html;
    $$('.mimg', feed()).forEach(i => i.onclick = () => { const lb = $('#lightbox'); $('img', lb).src = i.src; lb.hidden = false; });
    $$('[data-del]', feed()).forEach(b => b.onclick = async () => { try { await api('/mod/delete', { method: 'POST', body: { kind: 'chat', id: b.dataset.del } }); msgs = msgs.filter(x => String(x.id) !== b.dataset.del); renderMsgs(msgs, dm); } catch (e) { toast('Couldn\'t delete', e.message); } });
    $$('[data-rep]', feed()).forEach(b => b.onclick = async () => { const why = prompt('What\'s wrong with this message?'); if (why === null) return; try { await api('/hub/report', { method: 'POST', body: { kind: 'chat', id: b.dataset.rep, reason: why || 'Reported on the website' } }); toast('Reported', 'Thanks, a mod will look at it.'); } catch (e) { toast('Couldn\'t report', e.message); } });
  }
  $('#lightbox').onclick = () => { $('#lightbox').hidden = true; };

  /* ---------- DMs ---------- */
  async function pollDms(first) {
    const th = await api('/dm/threads');
    $('#hubThreads').innerHTML = (th.threads || []).map(t => `<button class="th${t.name === dmWith ? ' on' : ''}" data-th="${esc(t.name)}"><img src="${headUrl(t.name)}" alt=""><span><b>${esc(t.name)}</b><small>${t.fromMe ? 'You: ' : ''}${esc(t.last)}</small></span></button>`).join('') || '<p class="muted small th-none">No chats yet.</p>';
    $$('[data-th]').forEach(b => b.onclick = () => { dmWith = b.dataset.th; switchTab('dms', true); });
    if (!dmWith) { if (first) feed().innerHTML = '<div class="hub-empty"><h3>Your DMs</h3><p>Pick a chat on the left, or press <b>New message</b>.</p></div>'; return; }
    const r = await api('/dm/with?name=' + encodeURIComponent(dmWith));
    const list = (r.messages || []).map(m => Object.assign({}, m, { me: m.me }));
    const stick = first || feed().scrollHeight - feed().scrollTop - feed().clientHeight < 80;
    if (first || JSON.stringify(list.slice(-1)) !== JSON.stringify(msgs.slice(-1)) || list.length !== msgs.length) { msgs = list; renderMsgs(msgs, true); if (stick) feed().scrollTop = feed().scrollHeight; }
  }

  /* ---------- Mods ---------- */
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
    $$('[data-rdel]').forEach(b => b.onclick = () => act('/mod/delete', { id: b.dataset.rdel, kind: b.dataset.kind === 'chat' ? 'chat' : 'post' }, 'Deleted'));
    $$('[data-dis]').forEach(b => b.onclick = () => act('/mod/report/dismiss', { at: Number(b.dataset.dis), by: b.dataset.by }, 'Dismissed'));
    $$('[data-act]').forEach(b => b.onclick = () => {
      const name = $('#modName').value.trim(); if (!name) return toast('Type a player name first');
      const a = b.dataset.act;
      act(a === 'mute' ? '/mod/mute' : a === 'ban' ? '/mod/ban' : '/mod/unban', a === 'mute' ? { name, minutes: 60 } : { name, reason: 'Hub moderation' }, a === 'unban' ? 'Unbanned ' + name : a === 'ban' ? 'Banned ' + name : 'Muted ' + name);
    });
  }

  /* ---------- sending ---------- */
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
  $('#page-hub').addEventListener('dragover', e => { e.preventDefault(); });
  $('#page-hub').addEventListener('drop', e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f && tab !== 'mods') setPending(f); });
  $('#hubCompose').onsubmit = async e => {
    e.preventDefault();
    const inp = $('#hubInput'), text = inp.value.trim();
    if (!text && !pending) return;
    const b64 = pending ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(pending); }) : null;
    inp.value = ''; const file = pending; setPending(null);
    try {
      if (tab === 'chat') await api(b64 ? '/chat/image' : '/chat/send', { method: 'POST', body: b64 ? { image: b64, text } : { text } });
      else if (tab === 'dms' && dmWith) {
        if (b64) await api('/dm/image', { method: 'POST', body: { to: dmWith, image: b64 } });
        if (text) await api('/dm/send', { method: 'POST', body: { to: dmWith, text } });
      }
      poll(false);
    } catch (err) { inp.value = text; if (file) setPending(file); toast('Couldn\'t send', err.message); }
  };

  window.KY_HUB = { open };
})();
