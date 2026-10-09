/* Roamly – Learn: phrasebook (offline, spoken), translator (MyMemory) and saved phrases. Lessons & flashcards plug in via R.learn.addMode. */
(() => {
const R = window.roamly, {$, $$, esc, toast} = R;
const LANGS = window.ROAMLY_LANGS || {}, TOPICS = window.ROAMLY_TOPICS || {}, CL = window.ROAMLY_COUNTRY_LANG || {};
const NAMES = {en: 'English', ...(window.ROAMLY_LANG_NAMES || {})};
const ENGLISH_CC = ['gb', 'ie', 'us', 'au', 'nz', 'ca', 'mt'];
const st = {mode: null, lang: null, topic: null, q: ''};
const modes = [['phrases', 'Phrasebook'], ['translate', 'Translate'], ['saved', 'Saved']], renderers = {};
const saved = () => R.store.get('phrases.saved', []), setSaved = v => R.store.set('phrases.saved', v);
const recent = () => R.store.get('tr.recent', []), setRecent = v => R.store.set('tr.recent', v.slice(0, 30));
const isSaved = (txt, lang) => saved().some(s => s.t === txt && s.lang === lang);
function toggleSave(item, btn) {
  let v = saved(); const i = v.findIndex(s => s.t === item.t && s.lang === item.lang);
  if (i >= 0) { v.splice(i, 1); toast('Removed from saved'); } else { v.unshift({...item, at: Date.now()}); toast('Saved – available offline'); }
  setSaved(v); if (btn) { btn.classList.toggle('on', i < 0); btn.animate?.([{transform: 'scale(.6)'}, {transform: 'scale(1.15)'}, {transform: 'none'}], {duration: 380, easing: 'cubic-bezier(.2,1.4,.4,1)'}); }
}
function tripCountries() { const now = R.today(); return R.trips().slice().sort((a, b) => ((a.end || '') < now) - ((b.end || '') < now) || (a.start || '9').localeCompare(b.start || '9')).flatMap(t => t.destinations).map(d => d.cc); }
function suggested() { for (const c of tripCountries()) for (const [k, l] of Object.entries(LANGS)) if (l.countries.includes(c)) return k; return null; }
function suggestedAny() { for (const c of tripCountries()) { if (ENGLISH_CC.includes(c)) continue; for (const [k, l] of Object.entries(LANGS)) if (l.countries.includes(c)) return k; if (CL[c]) return CL[c]; } return null; }
const voiceFor = code => LANGS[code]?.voice || {en: 'en-GB', zh: 'zh-CN', pt: 'pt-PT', ar: 'ar-SA', he: 'he-IL', hi: 'hi-IN', ko: 'ko-KR', ja: 'ja-JP', el: 'el-GR', uk: 'uk-UA', cs: 'cs-CZ', da: 'da-DK', sv: 'sv-SE', no: 'nb-NO', vi: 'vi-VN', ms: 'ms-MY', ga: 'ga-IE', cy: 'cy-GB'}[code] || code;
function speak(text, lang, btn) {
  if (!('speechSynthesis' in window)) return toast('Speech is not supported on this device');
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text), vc = voiceFor(lang); u.lang = vc; u.rate = .9;
  const v = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').toLowerCase().startsWith(vc.slice(0, 2).toLowerCase())); if (v) u.voice = v;
  $$('.speak.on').forEach(b => b.classList.remove('on')); btn?.classList.add('on'); u.onend = u.onerror = () => btn?.classList.remove('on'); speechSynthesis.speak(u);
}
const SPK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const SHOW = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const SWAP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>';
const phraseRow = (tgt, en, pr, lang, i) => `<div class="phrase" data-i="${i}"><div class="grow"><div class="tgt">${esc(tgt)}</div><div class="en">${esc(en)}</div>${pr ? `<div class="pr">${esc(pr)}</div>` : ''}</div>
  <div class="p-acts"><button class="icon-btn star ${isSaved(tgt, lang) ? 'on' : ''}" aria-label="Save phrase">${STAR}</button><button class="icon-btn show" aria-label="Show full screen">${SHOW}</button><button class="speak" aria-label="Play">${SPK}</button></div></div>`;
/* Full-screen card to show a local person */
function showBig(tgt, en, lang) {
  R.modal(`<div class="big-phrase"><div class="meta">${esc(NAMES[lang] || lang)}</div><div class="bp-t">${esc(tgt)}</div><div class="bp-en">${esc(en)}</div><div class="row" style="justify-content:center;gap:12px"><button class="speak lg" id="bpSpk" aria-label="Play">${SPK}</button><button class="btn" data-close>Close</button></div></div>`, c => { $('#bpSpk', c).onclick = e => speak(tgt, lang, e.currentTarget); });
}
function wirePhrases(root, items) {
  $$('.phrase', root).forEach(row => { const it = items[+row.dataset.i];
    $('.speak', row).onclick = e => speak(it.t, it.lang, e.currentTarget);
    $('.star', row).onclick = e => toggleSave(it, e.currentTarget);
    $('.show', row).onclick = () => showBig(it.t, it.en, it.lang);
  });
}

/* ---------- Phrasebook ---------- */
renderers.phrases = body => {
  if (!st.lang) {
    const sug = suggested();
    body.innerHTML = `${sug ? `<p class="meta l-sub">Suggested for your trip: <b style="color:var(--text)">${LANGS[sug].name}</b></p>` : '<p class="meta l-sub">Pick a language – phrases work offline.</p>'}
      <div class="lang-list">${Object.entries(LANGS).sort(([a], [b]) => (b === sug) - (a === sug)).map(([k, l]) => `<button class="lang press ${k === sug ? 'sugg' : ''}" data-k="${k}"><span class="fl">${l.flag}</span><b>${l.name}</b><span class="meta">${Object.values(l.topics).flat().length} phrases</span></button>`).join('')}</div>`;
    R.stagger($('.lang-list', body)); $$('.lang', body).forEach(b => b.onclick = () => { st.lang = b.dataset.k; st.topic = null; st.q = ''; render(); });
    return;
  }
  const Lg = LANGS[st.lang]; st.topic ||= Object.keys(Lg.topics)[0];
  body.innerHTML = `<div class="row between"><button class="back-btn" id="lBack">‹ Languages</button><button class="link-btn" id="lTr">Translate to ${Lg.name} ›</button></div><h2 class="l-h">${Lg.flag} ${Lg.name}</h2>
    <div class="l-search"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="lQ" type="search" placeholder="Search phrases" value="${esc(st.q)}"></div>
    <div class="chips" id="lTopics">${Object.keys(Lg.topics).map(k => `<button class="chip ${k === st.topic && !st.q ? 'on' : ''}" data-k="${k}">${TOPICS[k] || k}</button>`).join('')}</div><div id="lPhrases"></div>`;
  const list = () => {
    const q = st.q.trim().toLowerCase();
    const items = (q ? Object.values(Lg.topics).flat().filter(p => p.some(x => x && x.toLowerCase().includes(q))) : Lg.topics[st.topic]).map(([en, t, pr]) => ({en, t, pr, lang: st.lang}));
    const el = $('#lPhrases'); el.innerHTML = items.length ? items.map((p, i) => phraseRow(p.t, p.en, p.pr, p.lang, i)).join('') : `<div class="empty-soft">No phrase matches “${esc(st.q)}”. <button class="link-btn" id="lTrQ">Translate it ›</button></div>`;
    R.stagger(el); wirePhrases(el, items);
    $('#lTrQ') && ($('#lTrQ').onclick = () => { st.mode = 'translate'; tr.from = 'en'; tr.to = st.lang; tr.text = st.q; tr.out = null; render(); });
    $$('#lTopics .chip').forEach(c => c.classList.toggle('on', !q && c.dataset.k === st.topic));
  };
  list();
  $('#lBack').onclick = () => { st.lang = null; st.topic = null; st.q = ''; render(); };
  $('#lTr').onclick = () => { st.mode = 'translate'; tr.from = 'en'; tr.to = st.lang; tr.out = null; render(); };
  $('#lQ').oninput = e => { st.q = e.target.value; list(); };
  $$('#lTopics .chip').forEach(c => c.onclick = () => { st.topic = c.dataset.k; st.q = ''; $('#lQ').value = ''; list(); });
};

/* ---------- Translator ---------- */
const tr = {from: 'en', to: null, text: '', out: null, busy: false};
const langOpts = (sel, auto) => `${auto ? `<option value="auto" ${sel === 'auto' ? 'selected' : ''}>Detect language</option>` : ''}${Object.entries(NAMES).sort((a, b) => (b[0] === 'en') - (a[0] === 'en') || a[1].localeCompare(b[1])).map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n}</option>`).join('')}`;
async function translate(text, from, to) {
  const key = `${from}|${to}|${text}`, hit = recent().find(r => r.key === key); if (hit) return {...hit, cached: true};
  if (!navigator.onLine) throw new Error('offline');
  const j = await R.fetchJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from === 'auto' ? 'autodetect' : from}|${to}`, {}, 12000);
  if (j.quotaFinished || j.responseStatus === 429) throw new Error('quota');
  if (j.responseStatus != 200 || !j.responseData?.translatedText) throw new Error(j.responseDetails || 'failed');
  let out = j.responseData.translatedText; if (/^(MYMEMORY WARNING|PLEASE SELECT)/i.test(out)) throw new Error('quota');
  // The top hit can be an unreviewed crowd entry (quality 0). Prefer a reviewed or machine match for the same sentence.
  const norm = x => (x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), want = norm(text);
  const good = (j.matches || []).filter(m => m.translation && +m.quality >= 50 && norm(m.segment) === want).sort((a, b) => b.match - a.match || +b.quality - +a.quality)[0];
  const topBad = (j.matches || []).some(m => m.translation === out && +m.quality === 0);
  if (good && (topBad || good.match >= j.responseData.match)) out = good.translation;
  if (!/[()]/.test(text)) out = out.replace(/[()]/g, '');
  const ta = document.createElement('textarea'); ta.innerHTML = out; out = ta.value; // decode HTML entities
  const det = (j.responseData.detectedLanguage || '').slice(0, 2).toLowerCase();
  const r = {key, src: text, from: from === 'auto' ? (det || 'auto') : from, to, t: out, at: Date.now()};
  setRecent([r, ...recent().filter(x => x.key !== key)]); return r;
}
renderers.translate = body => {
  tr.to ||= suggestedAny() || R.store.get('tr.to', 'es');
  body.innerHTML = `<div class="tr-card"><div class="tr-langs"><select id="trFrom" aria-label="From">${langOpts(tr.from, true)}</select><button class="icon-btn" id="trSwap" aria-label="Swap languages">${SWAP}</button><select id="trTo" aria-label="To">${langOpts(tr.to)}</select></div>
      <textarea id="trIn" rows="3" maxlength="500" placeholder="Type or paste text">${esc(tr.text)}</textarea>
      <div class="row between tr-bar"><span class="meta" id="trCount">${tr.text.length}/500</span><div class="row">${tr.text ? '<button class="icon-btn" id="trClear" aria-label="Clear">✕</button>' : ''}<button class="btn primary sm" id="trGo">Translate</button></div></div></div>
    <div id="trOut"></div>
    <div class="section-h"><h2>Recent</h2>${recent().length ? '<button class="link-btn" id="trClr">Clear</button>' : ''}</div><div id="trRecent"></div>
    <p class="meta tr-note">Translations by MyMemory (free, about 5,000 characters a day). Recent and saved ones work offline.</p>`;
  const paintOut = () => {
    const el = $('#trOut'); if (!el) return;
    if (tr.busy) { el.innerHTML = `<div class="tr-res">${R.skeleton(1, 44)}</div>`; return; }
    if (!tr.out) { el.innerHTML = ''; return; }
    if (tr.out.err) { el.innerHTML = `<div class="tr-res err pop-in">${tr.out.err === 'offline' ? 'You\'re offline. Translations you\'ve done before and saved phrases still work.' : tr.out.err === 'quota' ? 'Today\'s free translation limit is used up – try again tomorrow.' : 'Couldn\'t translate right now. Try again.'}</div>`; return; }
    const o = tr.out;
    el.innerHTML = `<div class="tr-res pop-in"><div class="meta">${esc(NAMES[o.to] || o.to)}${o.cached ? ' · saved' : ''}${tr.from === 'auto' && NAMES[o.from] ? ` · detected ${esc(NAMES[o.from])}` : ''}</div><div class="tr-t" lang="${o.to}">${esc(o.t)}</div>
      <div class="row tr-acts"><button class="speak" id="trSpk" aria-label="Play">${SPK}</button><button class="icon-btn star ${isSaved(o.t, o.to) ? 'on' : ''}" id="trStar" aria-label="Save">${STAR}</button><button class="icon-btn" id="trShow" aria-label="Show full screen">${SHOW}</button><button class="icon-btn" id="trCopy" aria-label="Copy">⧉</button></div></div>`;
    $('#trSpk').onclick = e => speak(o.t, o.to, e.currentTarget);
    $('#trStar').onclick = e => toggleSave({t: o.t, en: o.src, lang: o.to}, e.currentTarget);
    $('#trShow').onclick = () => showBig(o.t, o.src, o.to);
    $('#trCopy').onclick = async () => { try { await navigator.clipboard.writeText(o.t); toast('Copied'); } catch { toast('Copy not available'); } };
  };
  const paintRecent = () => { const el = $('#trRecent'), rs = recent().slice(0, 8);
    el.innerHTML = rs.length ? rs.map((r, i) => `<button class="tr-rec press" data-i="${i}"><span class="tgt">${esc(r.t)}</span><span class="meta">${esc(r.src)} · ${esc(NAMES[r.to] || r.to)}</span></button>`).join('') : '<div class="empty-soft">Your translations will appear here.</div>';
    $$('.tr-rec', el).forEach(b => b.onclick = () => { const r = rs[+b.dataset.i]; tr.text = r.src; tr.from = r.from in NAMES ? r.from : 'auto'; tr.to = r.to; tr.out = {...r, cached: true}; render(); });
  };
  const go = async () => {
    const text = $('#trIn').value.trim(); if (!text) return $('#trIn').focus();
    if (tr.from === tr.to) { tr.out = {key: '', src: text, from: tr.from, to: tr.to, t: text}; return paintOut(); }
    tr.text = text; tr.busy = true; paintOut(); $('#trIn').blur();
    try { tr.out = await translate(text, tr.from, tr.to); } catch (e) { tr.out = {err: e.message}; }
    tr.busy = false; paintOut(); paintRecent(); const c = $('#trClr'); if (!c && recent().length) render();
  };
  $('#trIn').oninput = e => { tr.text = e.target.value; $('#trCount').textContent = `${tr.text.length}/500`; };
  $('#trIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
  $('#trGo').onclick = go;
  $('#trClear') && ($('#trClear').onclick = () => { tr.text = ''; tr.out = null; render(); setTimeout(() => $('#trIn')?.focus(), 50); });
  $('#trFrom').onchange = e => { tr.from = e.target.value; tr.out = null; paintOut(); };
  $('#trTo').onchange = e => { tr.to = e.target.value; R.store.set('tr.to', tr.to); tr.out = null; paintOut(); };
  $('#trSwap').onclick = e => { const a = tr.from === 'auto' ? (tr.out?.from in NAMES ? tr.out.from : 'en') : tr.from; tr.from = tr.to; tr.to = a; if (tr.out && !tr.out.err) { tr.text = tr.out.t; } tr.out = null; e.currentTarget.animate?.([{transform: 'rotate(0)'}, {transform: 'rotate(180deg)'}], {duration: 320, easing: 'cubic-bezier(.2,1,.3,1)'}); setTimeout(render, R.reduceMotion ? 0 : 200); };
  $('#trClr') && ($('#trClr').onclick = () => { setRecent([]); render(); });
  paintOut(); paintRecent();
};

/* ---------- Saved ---------- */
renderers.saved = body => {
  const v = saved();
  if (!v.length) { body.innerHTML = `<div class="empty"><div class="big">⭐</div>Tap the star on any phrase or translation to keep it here – it works offline.</div>`; return; }
  const groups = {}; v.forEach(s => (groups[s.lang] ||= []).push(s));
  let i = 0; const items = [];
  body.innerHTML = Object.entries(groups).map(([lang, arr]) => `<div class="section-h"><h2>${LANGS[lang]?.flag || ''} ${esc(NAMES[lang] || lang)}</h2><span class="meta">${arr.length}</span></div><div class="saved-list">${arr.map(s => { items.push(s); return phraseRow(s.t, s.en, s.pr, s.lang, i++); }).join('')}</div>`).join('');
  R.stagger(body); wirePhrases(body, items);
  $$('.star', body).forEach(b => b.addEventListener('click', () => setTimeout(() => { if (!b.classList.contains('on')) { const row = b.closest('.phrase'); row.classList.add('leaving-row'); setTimeout(render, R.reduceMotion ? 0 : 260); } }, 0)));
};

function render() {
  const body = $('#learnBody'); if (!body) return;
  if (!renderers[st.mode]) st.mode = modes[0][0];
  body.innerHTML = `<div class="seg l-seg" id="lModes">${modes.map(([k, l]) => `<button class="${k === st.mode ? 'on' : ''}" data-m="${k}">${l}</button>`).join('')}<span class="seg-ind"></span></div><div id="lBody" class="fade-in"></div>`;
  const s = $('#lModes'), move = (anim) => { const b = $('button.on', s), ind = $('.seg-ind', s); if (!b) return; if (!anim) ind.style.transition = 'none'; ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft - 4}px)`; if (!anim) requestAnimationFrame(() => ind.style.transition = ''); };
  requestAnimationFrame(() => move(false));
  $$('button', s).forEach(b => b.onclick = () => { if (b.dataset.m === st.mode) return; st.mode = b.dataset.m; $$('button', s).forEach(x => x.classList.toggle('on', x === b)); move(true); const lb = $('#lBody'); lb.classList.remove('fade-in'); void lb.offsetWidth; lb.classList.add('fade-in'); renderers[st.mode](lb); });
  renderers[st.mode]($('#lBody'));
}
R.learn = {render, speak, translate, open(mode, lang) { st.mode = mode || 'phrases'; if (lang) { st.lang = LANGS[lang] ? lang : st.lang; tr.to = lang; } R.setMainTab('learn'); render(); },
  addMode(key, label, fn, first) { renderers[key] = fn; first ? modes.unshift([key, label]) : modes.push([key, label]); }};
R.onBoot({init: () => { R.nav.onScreen('learn', render); render(); }, userChanged: () => { st.lang = null; tr.to = null; tr.out = null; render(); }});
})();
