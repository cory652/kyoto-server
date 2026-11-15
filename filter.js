// Kyoto chat filter: bad words get tagged out with #### (like Roblox), and the usual tricks don't get past it:
//   "F u c k", "f.u.c.k", "f_u_c_k", "fuuuuck", "f*ck", "fvck", "Fück", "ƒuck", "fu ck", leet (sh1t, b!tch, @ss), look-alike letters...
// Words are stored base64 so the file doesn't spell them out.
'use strict';
const b64 = s => Buffer.from(s, 'base64').toString('utf8');

// "strong" = tagged even inside a longer word (motherf..., bulls...). "weak" = only as its own word (+ endings), so
// normal words like "class", "assassin", "cockpit", "document", "grape", "raccoon", "spice" stay untouched.
const STRONG = ['ZnVjaw==', 'ZnVr', 'ZnVx', 'ZmNr', 'cGh1Y2s=', 'c2hpdA==', 'Yml0Y2g=', 'YmlhdGNo', 'YnRjaA==', 'Y3VudA==', 'd2hvcmU=', 'c2x1dA==', 'YmFzdGFyZA==',
  'YXNzaG9sZQ==', 'ZHVtYmFzcw==', 'amFja2Fzcw==', 'bmlnZ2Vy', 'bmlnZ2E=', 'ZmFnZ290', 'cmV0YXJk', 'd2V0YmFjaw==', 'cG9ybg==', 'aGVudGFp',
  'b25seWZhbnM=', 'bnNmdw==', 'ZGlsZG8=', 'Ym9vYnM=', 'cHVzc3k=', 'a2lsbHlvdXJzZWxm', 'bW90aGVyZnVja2Vy', 'ZGlja2hlYWQ=', 'c2hpdGhlYWQ='].map(b64);
const WEAK = ['YXNz', 'YXp6', 'ZGFtbg==', 'Y3JhcA==', 'c2V4', 'c2V4eQ==', 'Y29jaw==', 'ZGljaw==', 'Y3Vt', 'bnVkZQ==', 'bnVkZXM=', 'ZmFn', 'a3lz', 'cmFwZQ==', 'a2lrZQ==',
  'Y29vbg==', 'c3BpYw==', 'Y2hpbms=', 'dHJhbm55', 'eHh4', 'dHdhdA==', 'd2Fuaw==', 'cGVuaXM=', 'dmFnaW5h', 'bWlsZg==', 'aG9ybnk=', 'Zms=', 'c2h0', 'cHJpY2s=', 'Ym9vYg==', 'dGl0cw=='].map(b64);
const EXTRA = (process.env.BLOCKED_WORDS || '').toLowerCase().split(',').map(s => s.trim().replace(/\s+/g, '')).filter(Boolean);

// look-alike characters -> the letter they pretend to be
const LOOK = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '¡': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '9': 'g', '8': 'b', '6': 'g', '2': 'z',
  'ƒ': 'f', 'ß': 's', '¢': 'c', '€': 'e', '£': 'l', '¥': 'y', 'µ': 'u', 'ø': 'o', 'œ': 'o', 'æ': 'a', 'ı': 'i', 'ł': 'l',
  // Cyrillic / Greek look-alikes
  'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ց': 'g', 'ս': 'u',
  'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'n', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ω': 'w'
};
const WILD = new Set(['*', '#', '?', '%', '•']); // f*ck, f#ck: stands for any one letter

/** One character -> a normal letter, '*' (wildcard), or '' (ignore: dots, dashes, emoji, zero-width...). */
function norm(ch) {
  if (WILD.has(ch)) return '*';
  let c = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (c.length !== 1) c = c.charAt(0) || '';
  if (LOOK[c] !== undefined) return LOOK[c];
  if (LOOK[ch] !== undefined) return LOOK[ch];
  return /[a-z]/.test(c) ? c : '';
}

/** "fuck" -> /[f*]+[u*v]+[c*k]+[k*]+/ : every letter may repeat ("fuuuck"), a double letter must stay double ("ass" needs 2+ s). */
const SIMILAR = { u: 'uv', c: 'ck', k: 'kc', i: 'iyl', s: 'sz', z: 'zs', f: 'f', o: 'o0', a: 'a', e: 'e' };
function wordRx(w) {
  let rx = '', i = 0;
  while (i < w.length) {
    let j = i; while (j < w.length && w[j] === w[i]) j++;
    const set = (SIMILAR[w[i]] || w[i]).replace(/[\]\\^-]/g, '\\$&') + '*';
    rx += `[${set}]{${j - i},}`;
    i = j;
  }
  return rx;
}
const ENDINGS = '(?:s|es|z|ed|ing|head|face|hole|bag)?';
const STRONG_RX = STRONG.concat(EXTRA).map(w => new RegExp(wordRx(w), 'g'));
const WEAK_RX = WEAK.map(w => new RegExp('^' + wordRx(w) + ENDINGS + '$'));
// phrases are checked across the whole message with the spaces taken out
const PHRASES = ['a2lsbHlvdXJzZWxm', 'a2lsbHVyc2VsZg==', 'a2lsbCB5byBzZWxm', 'Z29kaWU=', 'aGFuZ3lvdXJzZWxm', 'a3lzbm93'].map(b64).map(w => new RegExp(wordRx(w.replace(/\s+/g, '')), 'g'));

/** Splits text into tokens (runs of non-space) with each kept letter mapped back to its spot in the original. */
function tokens(text) {
  const out = [];
  const re = /\S+/g; let m;
  while ((m = re.exec(text))) {
    let n = '', map = [];
    for (let i = 0; i < m[0].length; i++) {
      const ch = m[0][i];
      // keep emoji / surrogate pairs whole
      if (/[\ud800-\udbff]/.test(ch)) { i++; continue; }
      const c = norm(ch);
      if (c) { n += c; map.push(m.index + i); }
    }
    out.push({ start: m.index, end: m.index + m[0].length, n, map });
  }
  return out;
}

/** Finds every bad span in a group of tokens (one word, or a run of s p a c e d letters joined together). */
function scan(group, hits) {
  const n = group.map(t => t.n).join(''), map = [].concat(...group.map(t => t.map));
  if (!n) return;
  let found = false;
  for (const r of STRONG_RX) {
    r.lastIndex = 0; let m;
    while ((m = r.exec(n))) { if (!m[0].length) { r.lastIndex++; continue; } hits.push([map[m.index], map[m.index + m[0].length - 1] + 1]); found = true; }
  }
  if (!found && WEAK_RX.some(r => r.test(n))) hits.push([group[0].start, group[group.length - 1].end]);
}

/** Replaces every bad word with ####. Returns the cleaned text. */
function tag(text) {
  text = String(text || '');
  const toks = tokens(text), hits = [];
  // 1) each word on its own (handles f.u.c.k, fuuuck, sh1t, f*ck)
  for (const t of toks) scan([t], hits);
  // 2) s p a c e d   o u t   letters: runs of tiny tokens are joined and checked together (F u c k, fu ck)
  for (let i = 0; i < toks.length;) {
    let j = i; while (j < toks.length && toks[j].n.length > 0 && toks[j].n.length <= 3) j++;
    if (j - i >= 2) for (let a = i; a < j; a++) for (let b = a + 2; b <= Math.min(j, a + 12); b++) {
      const sl = toks.slice(a, b);
      // a 3-letter piece only counts next to a single letter ("fuc k"), so normal words like "us hit" stay fine
      if (sl.some(t => t.n.length === 3) && !sl.some(t => t.n.length === 1)) continue;
      scan(sl, hits);
    }
    i = Math.max(j, i + 1);
  }
  // 3) phrases across the whole message
  const all = toks.map(t => t.n).join(''), amap = [].concat(...toks.map(t => t.map));
  for (const r of PHRASES) { r.lastIndex = 0; let m; while ((m = r.exec(all))) { if (!m[0].length) { r.lastIndex++; continue; } hits.push([amap[m.index], amap[m.index + m[0].length - 1] + 1]); } }
  if (!hits.length) return text;
  const chars = [...text.split('')];
  for (const [a, b] of hits) for (let k = a; k < b; k++) if (!/\s/.test(chars[k])) chars[k] = '#';
  return chars.join('');
}

/** True if anything would be tagged. */
const isBad = text => tag(text) !== String(text || '');

module.exports = { tag, isBad };
