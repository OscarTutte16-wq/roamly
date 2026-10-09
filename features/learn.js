/* Roamly – Learn (phrase lessons with spoken pronunciation). Flashcards, quizzes and streaks build on this. */
(() => {
const R = window.roamly, {$, $$, esc} = R;
const LANGS = window.ROAMLY_LANGS || {}, TOPICS = window.ROAMLY_TOPICS || {};
const st = {lang: null, topic: null};
function suggested() { const cc = R.trips().flatMap(t => t.destinations).map(d => d.cc); for (const c of cc) for (const [k, l] of Object.entries(LANGS)) if (l.countries.includes(c)) return k; return null; }
function speak(text, lang, btn) {
  if (!('speechSynthesis' in window)) return R.toast('Speech is not supported on this device');
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = LANGS[lang].voice; u.rate = .9;
  const v = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith(LANGS[lang].voice.slice(0, 2))); if (v) u.voice = v;
  btn?.classList.add('on'); u.onend = u.onerror = () => btn?.classList.remove('on'); speechSynthesis.speak(u);
}
const SPK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
function render() {
  const body = $('#learnBody'); if (!body) return;
  if (!st.lang) {
    const sug = suggested();
    body.innerHTML = `${sug ? `<p class="meta" style="margin:-8px 0 16px">Suggested for your trip: <b style="color:var(--text)">${LANGS[sug].name}</b></p>` : '<p class="meta" style="margin:-8px 0 16px">Pick a language to start.</p>'}
      <div class="lang-list">${Object.entries(LANGS).sort(([a], [b]) => (b === sug) - (a === sug)).map(([k, l]) => `<button class="lang press ${k === sug ? 'sugg' : ''}" data-k="${k}"><span class="fl">${l.flag}</span><b>${l.name}</b><span class="meta">${Object.values(l.topics).flat().length} phrases</span></button>`).join('')}</div>`;
    R.stagger($('.lang-list', body)); $$('.lang', body).forEach(b => b.onclick = () => { st.lang = b.dataset.k; render(); });
    return;
  }
  const L = LANGS[st.lang]; st.topic ||= Object.keys(L.topics)[0];
  body.innerHTML = `<button class="back-btn" id="lBack" style="margin:-10px 0 6px -6px">‹ Languages</button><h2 style="font-size:24px;margin:0 0 14px;letter-spacing:-.02em">${L.flag} ${L.name}</h2>
    <div class="chips" id="lTopics">${Object.keys(L.topics).map(k => `<button class="chip ${k === st.topic ? 'on' : ''}" data-k="${k}">${TOPICS[k] || k}</button>`).join('')}</div>
    <div id="lPhrases">${L.topics[st.topic].map(([en, tgt, pr], i) => `<div class="phrase"><div class="grow"><div class="tgt">${esc(tgt)}</div><div class="en">${esc(en)}</div>${pr ? `<div class="pr">${esc(pr)}</div>` : ''}</div><button class="speak" data-i="${i}" aria-label="Play">${SPK}</button></div>`).join('')}</div>`;
  R.stagger($('#lPhrases'));
  $('#lBack').onclick = () => { st.lang = null; st.topic = null; render(); };
  $$('#lTopics .chip').forEach(c => c.onclick = () => { st.topic = c.dataset.k; render(); });
  $$('#lPhrases .speak').forEach(b => b.onclick = () => speak(L.topics[st.topic][+b.dataset.i][1], st.lang, b));
}
R.learn = {render, speak};
R.onBoot({init: () => { R.nav.onScreen('learn', render); render(); }, userChanged: render});
})();
