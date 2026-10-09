/* Roamly – Lessons: bite-size lessons, spaced-repetition flashcards (SM-2), quizzes, pronunciation practice, streak & XP. */
(() => {
const R = window.roamly, {$, $$, esc, toast} = R;
const LANGS = window.ROAMLY_LANGS || {}, TOPICS = window.ROAMLY_TOPICS || {};
const DAY = 864e5, PER = 4;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
/* ---------- progress (per user) ---------- */
const load = () => { const p = R.store.get('learn.v1', null) || {}; p.xp ||= 0; p.days ||= {}; p.cards ||= {}; p.lessons ||= {}; p.goal ||= 30; return p; };
let P = load();
const save = () => R.store.set('learn.v1', P);
const dkey = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function streak() { let n = 0, t = Date.now(); if (!P.days[dkey(t)]) t -= DAY; while (P.days[dkey(t)]) { n++; t -= DAY; } return n; }
const todayXP = () => P.days[dkey()] || 0;
function addXP(n, from) {
  const before = todayXP(); P.xp += n; P.days[dkey()] = before + n; save();
  if (from) { const r = from.getBoundingClientRect(), el = document.createElement('div'); el.className = 'xp-pop'; el.textContent = `+${n} XP`; el.style.left = r.left + r.width / 2 + 'px'; el.style.top = r.top + 'px'; document.body.appendChild(el); setTimeout(() => el.remove(), 1100); }
  if (before < P.goal && before + n >= P.goal) setTimeout(() => toast('🎯 Daily goal reached!'), 500);
}
const curLang = () => { if (P.lang && LANGS[P.lang]) return P.lang; const cc = R.trips().flatMap(t => t.destinations).map(d => d.cc); for (const c of cc) for (const [k, l] of Object.entries(LANGS)) if (l.countries.includes(c)) return k; return Object.keys(LANGS)[0]; };
const items = (lang, topic) => LANGS[lang].topics[topic].map(([en, t, pr], i) => ({key: `${lang}:${topic}:${i}`, en, t, pr, lang, topic}));
const lessonsOf = lang => Object.keys(LANGS[lang].topics).flatMap(topic => { const all = items(lang, topic); return Array.from({length: Math.ceil(all.length / PER)}, (_, k) => ({id: `${lang}:${topic}:${k}`, topic, part: k + 1, items: all.slice(k * PER, k * PER + PER)})); });
const allItems = lang => Object.keys(LANGS[lang].topics).flatMap(t => items(lang, t));
const learned = lang => allItems(lang).filter(i => P.cards[i.key]);
const due = lang => learned(lang).filter(i => P.cards[i.key].d <= Date.now());
/* ---------- SM-2 scheduling ---------- */
function schedule(c, q, now = Date.now()) {
  c = {e: 2.5, i: 0, n: 0, l: 0, ...c};
  if (q < 3) { c.n = 0; c.i = 0; c.l++; c.e = Math.max(1.3, c.e - .2); c.d = now + 10 * 60e3; return c; }
  c.n++;
  c.i = c.n === 1 ? (q === 5 ? 3 : 1) : c.n === 2 ? (q === 3 ? 3 : q === 5 ? 8 : 6) : Math.round(c.i * c.e * (q === 3 ? .75 : q === 5 ? 1.3 : 1));
  c.e = Math.max(1.3, c.e + (.1 - (5 - q) * (.08 + (5 - q) * .02)));
  c.d = now + c.i * DAY; return c;
}
const ivl = c => { if (!c.i) return '10m'; return c.i < 30 ? `${c.i}d` : c.i < 365 ? `${Math.round(c.i / 30)}mo` : `${(c.i / 365).toFixed(1)}y`; };
/* ---------- speech ---------- */
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function lev(a, b) { const m = a.length, n = b.length; if (!m || !n) return m || n; let prev = Array.from({length: n + 1}, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
function scoreSpeech(heard, target) { const T = norm(target.replace(/…/g, '')); return Math.max(0, ...[].concat(heard).map(h => { const H = norm(h); return H ? 1 - lev(H, T) / Math.max(H.length, T.length) : 0; })); }
function listen(lang) {
  return new Promise((res, rej) => {
    if (!SR) return rej(new Error('unsupported'));
    const r = new SR(); r.lang = LANGS[lang]?.voice || lang; r.maxAlternatives = 4; r.interimResults = false;
    let done = false; r.onresult = e => { done = true; res([...e.results[0]].map(a => a.transcript)); };
    r.onerror = e => { done = true; rej(new Error(e.error || 'error')); }; r.onend = () => { if (!done) rej(new Error('no-speech')); };
    try { r.start(); } catch (e) { rej(e); }
    setTimeout(() => { try { r.stop(); } catch {} }, 7000);
  });
}
const SPK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const MIC = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const FLAME = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#fb923c" d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.8 2-5 .2 1.6 1 2.6 2 3 0-3 1-6 1-8z"/><path fill="#fde68a" d="M12 21a3 3 0 0 1-3-3c0-1.6 1.4-2.8 2-4 .4 1 2 1.9 2 3.2.6-.4.9-1 1-1.6.6.8 1 1.6 1 2.4a3 3 0 0 1-3 3z"/></svg>';
const BOLT = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#facc15" d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>';
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr, n, not) => shuffle(arr.filter(x => !not.includes(x))).slice(0, n);
const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

/* ---------- Lessons home (Learn ▸ Lessons) ---------- */
function ring(v, max, size = 54) { const r = size / 2 - 5, c = 2 * Math.PI * r, f = Math.min(1, v / max); return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.1)" stroke-width="5" fill="none"/><circle class="ring-v" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--accent)" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" style="--c:${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`; }
function renderHome(body) {
  P = load(); const lang = curLang(), Lg = LANGS[lang], ls = lessonsOf(lang), dn = due(lang).length, ln = learned(lang).length, st = streak(), tx = todayXP();
  body.innerHTML = `<div class="lp-stats"><div class="lp-stat"><span class="ic ${st ? 'lit' : ''}">${FLAME}</span><b id="lpStreak">${st}</b><span>day streak</span></div><div class="lp-stat"><span class="ic">${BOLT}</span><b id="lpXP">${P.xp}</b><span>total XP</span></div>
      <div class="lp-stat goal">${ring(tx, P.goal)}<div><b>${Math.min(tx, P.goal)}/${P.goal}</b><span>today</span></div></div></div>
    <div class="lp-langs" id="lpLangs">${Object.entries(LANGS).map(([k, l]) => `<button class="lp-lang ${k === lang ? 'on' : ''}" data-k="${k}" aria-label="${l.name}">${l.flag}<span>${l.name}</span></button>`).join('')}</div>
    <div class="lp-actions"><button class="lp-review press ${dn ? 'due' : ''}" id="lpReview"><div class="cards-ic"><i></i><i></i><i></i></div><div class="grow"><b>Flashcards</b><span>${dn ? `${dn} card${dn > 1 ? 's' : ''} due for review` : ln ? `All caught up · ${ln} learned` : 'Finish a lesson to unlock'}</span></div><span class="chev">›</span></button>
      <button class="lp-review press" id="lpQuiz"><div class="cards-ic quiz">?</div><div class="grow"><b>Quick quiz</b><span>10 questions · ${ln ? 'from what you\u2019ve learned' : Lg.name + ' basics'}</span></div><span class="chev">›</span></button></div>
    <div class="section-h"><h2>${Lg.flag} ${Lg.name} lessons</h2><span class="meta">${ls.filter(l => P.lessons[l.id]).length}/${ls.length}</span></div>
    <div class="lp-list">${ls.map((l, i) => { const r = P.lessons[l.id], pct = r ? r.best : 0; return `<button class="lp-item press ${r ? 'done' : ''}" data-i="${i}"><div class="lp-num">${ring(pct, 100, 46)}<span>${r ? '✓' : i + 1}</span></div><div class="grow"><b>${TOPICS[l.topic] || l.topic} <span class="pt">· ${l.part}</span></b><span class="meta">${l.items.map(x => esc(x.t)).slice(0, 2).join(' · ')}…</span></div><span class="meta lp-best">${r ? `${r.best}%` : `${l.items.length} new`}</span></button>`; }).join('')}</div>
    <p class="meta lp-note">${SR ? 'Pronunciation practice uses your browser\u2019s speech recognition.' : 'Pronunciation practice needs Chrome, Edge or Safari – the rest works everywhere, offline too.'}</p>`;
  R.stagger($('.lp-list', body));
  requestAnimationFrame(() => $$('.ring-v', body).forEach(c => c.classList.add('go')));
  $$('.lp-lang', body).forEach(b => b.onclick = () => { P.lang = b.dataset.k; save(); renderHome(body); });
  $('#lpLangs .on', body)?.scrollIntoView({inline: 'center', block: 'nearest'});
  $$('.lp-item', body).forEach(b => b.onclick = () => runLesson(ls[+b.dataset.i], () => renderHome(body)));
  $('#lpReview').onclick = () => { if (!ln) return toast('Finish a lesson first – its phrases become flashcards'); runCards(lang, () => renderHome(body)); };
  $('#lpQuiz').onclick = () => runQuiz(lang, () => renderHome(body));
}

/* ---------- Full-screen session shell ---------- */
function session(title, onClose) {
  const el = document.createElement('div'); el.className = 'lsn'; el.innerHTML = `<div class="lsn-top"><button class="lsn-x" aria-label="Close">✕</button><div class="lsn-bar"><div></div></div><span class="lsn-title">${esc(title)}</span></div><div class="lsn-body"></div><div class="lsn-foot"></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
  const api = {el, body: $('.lsn-body', el), foot: $('.lsn-foot', el), closed: false,
    progress: f => { $('.lsn-bar > div', el).style.transform = `scaleX(${Math.max(.02, f)})`; },
    show(html) { const b = api.body; b.classList.remove('step-in'); void b.offsetWidth; b.innerHTML = html; b.classList.add('step-in'); },
    close() { if (api.closed) return; api.closed = true; window.speechSynthesis?.cancel(); el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), R.reduceMotion ? 0 : 320); onClose?.(); }};
  $('.lsn-x', el).onclick = () => api.close();
  return api;
}
const say = (it, btn) => R.learn.speak(it.t, it.lang, btn);
function speakBlock(it) { return `${SR ? `<button class="mic-btn press" id="mic" aria-label="Say it">${MIC}<span>Tap and say it</span></button><div class="mic-fb" id="micFb"></div>` : ''}`; }
function wireMic(s, it, onScore) {
  const b = $('#mic', s.body); if (!b) return;
  b.onclick = async () => {
    const fb = $('#micFb', s.body); b.classList.add('rec'); $('span', b).textContent = 'Listening…'; fb.textContent = '';
    try { const heard = await listen(it.lang); const sc = scoreSpeech(heard, it.t), pct = Math.round(sc * 100);
      fb.className = 'mic-fb pop-in ' + (sc >= .8 ? 'good' : sc >= .55 ? 'ok' : 'bad');
      fb.innerHTML = `<b>${sc >= .8 ? 'Great pronunciation!' : sc >= .55 ? 'Almost – listen and try again' : 'Not quite – try again'}</b><span>${pct}% · heard “${esc(heard[0])}”</span>`;
      onScore?.(sc); }
    catch (e) { fb.className = 'mic-fb pop-in bad'; fb.innerHTML = `<span>${e.message === 'not-allowed' ? 'Microphone permission denied' : e.message === 'unsupported' ? 'Speech recognition isn\u2019t available here' : 'Didn\u2019t catch that – try again'}</span>`; }
    b.classList.remove('rec'); $('span', b).textContent = 'Tap and say it';
  };
}
function foot(s, label, fn, cls = 'primary') { s.foot.innerHTML = `<button class="btn ${cls} lsn-go">${label}</button>`; $('.lsn-go', s.foot).onclick = fn; }

/* Build exercise steps for a set of items */
function exercise(it, pool, kind) {
  const others = pool.filter(x => x.key !== it.key);
  if (kind === 'build' && it.t.split(/\s+/).length >= 3) { const words = it.t.split(/\s+/); return {kind, it, words, bank: shuffle([...words, ...pick(others.flatMap(o => o.t.split(/\s+/)), 2, words)])}; }
  if (kind === 'speak' && SR) return {kind, it};
  if (kind === 'listen') return {kind, it, opts: shuffle([it, ...pick(others, 3, [])])};
  if (kind === 'e2t') return {kind, it, opts: shuffle([it, ...pick(others, 3, [])])};
  return {kind: 't2e', it, opts: shuffle([it, ...pick(others, 3, [])])};
}
/* Runs a list of exercises; wrong answers come back once at the end */
function runExercises(s, steps, {base = 0, total = steps.length, onDone}) {
  let i = 0, right = 0, answered = 0, xp = 0; const retry = new Set();
  const next = () => { if (s.closed) return; if (i >= steps.length) return onDone({right, answered, xp}); s.progress((base + Math.min(i, total)) / (base + total)); show(steps[i++]); };
  const result = (ok, ex, btn) => {
    answered++; if (ok) { right++; xp += 10; addXP(10, btn); buzz(12); } else { buzz([30, 40, 30]); if (!retry.has(ex.it.key)) { retry.add(ex.it.key); steps.push({...ex}); } }
    s.foot.innerHTML = `<div class="verdict ${ok ? 'good' : 'bad'} pop-in"><b>${ok ? ['Nice!', 'Correct!', 'Great job!', 'Exactly!'][Math.floor(Math.random() * 4)] : 'Correct answer:'}</b>${ok ? '' : `<span>${esc(ex.kind === 't2e' || ex.kind === 'listen' ? ex.it.en : ex.it.t)}</span>`}</div><button class="btn ${ok ? 'primary' : 'danger'} lsn-go">Continue</button>`;
    $('.lsn-go', s.foot).onclick = next; if (!ok || ex.kind !== 'speak') say(ex.it);
  };
  function show(ex) {
    const it = ex.it; s.foot.innerHTML = ''; R.lessons.cur = ex; // exposed for automated tests
    if (ex.kind === 't2e' || ex.kind === 'e2t' || ex.kind === 'listen') {
      const q = ex.kind === 't2e' ? `<div class="q-label">What does this mean?</div><div class="q-big">${esc(it.t)} <button class="speak sm-spk" id="qs" aria-label="Play">${SPK}</button></div>`
        : ex.kind === 'e2t' ? `<div class="q-label">How do you say…</div><div class="q-big">“${esc(it.en)}”</div>`
        : `<div class="q-label">Listen and choose the meaning</div><button class="big-spk press" id="qs" aria-label="Play">${SPK}</button>`;
      s.show(`${q}<div class="opts">${ex.opts.map((o, k) => `<button class="opt press" data-k="${k}">${esc(ex.kind === 'e2t' ? o.t : o.en)}</button>`).join('')}</div>`);
      const qs = $('#qs', s.body); qs && (qs.onclick = () => say(it, qs)); if (ex.kind !== 'e2t') setTimeout(() => !s.closed && say(it, qs), 250);
      $$('.opt', s.body).forEach(b => b.onclick = () => { if (s.body.dataset.locked === '1') return; s.body.dataset.locked = '1'; const ok = ex.opts[+b.dataset.k].key === it.key;
        b.classList.add(ok ? 'right' : 'wrong'); if (!ok) $$('.opt', s.body).find(x => ex.opts[+x.dataset.k].key === it.key)?.classList.add('right'); result(ok, ex, b); });
      s.body.dataset.locked = '0';
    } else if (ex.kind === 'build') {
      s.show(`<div class="q-label">Build the sentence</div><div class="q-big sm">“${esc(it.en)}”</div><div class="build-ans" id="bAns"></div><div class="build-bank" id="bBank">${ex.bank.map((w, k) => `<button class="tile press" data-k="${k}">${esc(w)}</button>`).join('')}</div>`);
      const ans = [], paint = () => { foot(s, 'Check', check, ans.length ? 'primary' : 'primary disabled'); };
      const check = () => { if (!ans.length) return; const ok = norm(ans.map(k => ex.bank[k]).join(' ')) === norm(it.t); $('#bAns', s.body).classList.add(ok ? 'right' : 'wrong'); $$('.tile', s.body).forEach(t => t.disabled = true); result(ok, ex, $('#bAns', s.body)); };
      $$('#bBank .tile', s.body).forEach(t => t.onclick = () => { if (t.classList.contains('used')) return; const k = +t.dataset.k; ans.push(k); t.classList.add('used');
        const c = document.createElement('button'); c.className = 'tile pop-in'; c.textContent = ex.bank[k]; c.onclick = () => { ans.splice(ans.indexOf(k), 1); c.remove(); t.classList.remove('used'); paint(); }; $('#bAns', s.body).appendChild(c); paint(); });
      paint();
    } else if (ex.kind === 'speak') {
      s.show(`<div class="q-label">Say this out loud</div><div class="q-big">${esc(it.t)}</div><div class="q-sub">${esc(it.en)}${it.pr ? ` · <i>${esc(it.pr)}</i>` : ''}</div><div class="row" style="justify-content:center;gap:14px;margin-top:18px"><button class="speak" id="qs" aria-label="Play">${SPK}</button></div>${speakBlock(it)}`);
      $('#qs', s.body).onclick = e => say(it, e.currentTarget);
      let got = false; wireMic(s, it, sc => { if (sc >= .55 && !got) { got = true; result(true, ex, $('#mic', s.body)); } });
      s.foot.innerHTML = `<button class="btn ghost lsn-go">Can\u2019t speak now</button>`; $('.lsn-go', s.foot).onclick = next;
    }
  }
  next();
}
function finish(s, {right, answered, xp}, title, extra = '') {
  const acc = answered ? Math.round(right / answered * 100) : 100;
  s.progress(1);
  s.show(`<div class="done-card"><div class="confetti">${Array.from({length: 18}, (_, k) => `<i style="--x:${Math.round(Math.cos(k / 18 * 6.283) * (80 + (k % 3) * 30))}px;--y:${Math.round(Math.sin(k / 18 * 6.283) * (70 + (k % 4) * 22)) - 40}px;--h:${(k * 47) % 360};--d:${(k % 5) * 40}ms"></i>`).join('')}</div>
    <div class="done-badge">${acc >= 80 ? '🏆' : acc >= 50 ? '⭐' : '💪'}</div><h2>${esc(title)}</h2>
    <div class="done-stats"><div><b>+${xp}</b><span>XP</span></div><div><b>${acc}%</b><span>accuracy</span></div><div><b>${streak()}</b><span>day streak ${FLAME}</span></div></div>${extra}</div>`);
  foot(s, 'Done', () => s.close());
  return acc;
}
function runLesson(l, after) {
  const s = session(`${TOPICS[l.topic] || l.topic} · ${l.part}`, after), its = l.items, pool = items(l.items[0].lang, l.topic);
  const total = its.length + 6; let k = 0;
  const intro = () => {
    if (s.closed) return;
    if (k >= its.length) {
      const kinds = shuffle(['t2e', 'e2t', 'listen', 'build', SR ? 'speak' : 'e2t', 't2e']);
      const steps = kinds.map((kd, j) => exercise(its[j % its.length], pool, kd));
      return runExercises(s, steps, {base: its.length, total: 6, onDone: r => {
        for (const it of its) if (!P.cards[it.key]) P.cards[it.key] = {e: 2.5, i: 0, n: 0, l: 0, d: Date.now()};
        const acc = Math.round(r.right / Math.max(1, r.answered) * 100), prev = P.lessons[l.id];
        P.lessons[l.id] = {best: Math.max(prev?.best || 0, acc), at: Date.now(), n: (prev?.n || 0) + 1}; save(); addXP(20);
        finish(s, {...r, xp: r.xp + 20}, 'Lesson complete!', `<p class="meta">${its.length} phrases added to your flashcards.</p>`);
      }});
    }
    const it = its[k]; s.progress(k / total);
    s.show(`<div class="q-label">New phrase ${k + 1} of ${its.length}</div><div class="intro-card"><div class="q-big">${esc(it.t)}</div>${it.pr ? `<div class="q-pr">${esc(it.pr)}</div>` : ''}<div class="q-sub">${esc(it.en)}</div>
      <button class="big-spk press" id="qs" aria-label="Play">${SPK}</button></div>${speakBlock(it)}`);
    const qs = $('#qs', s.body); qs.onclick = () => say(it, qs); setTimeout(() => !s.closed && say(it, qs), 300);
    wireMic(s, it, sc => { if (sc >= .8) addXP(5, $('#mic', s.body)); });
    k++; foot(s, 'Continue', intro);
  };
  intro();
}
function runQuiz(lang, after) {
  const s = session('Quick quiz', after), base = learned(lang).length >= 4 ? learned(lang) : allItems(lang).slice(0, 16);
  const pool = allItems(lang), kinds = ['t2e', 'e2t', 'listen', 't2e', 'e2t', 'build', 'listen', 't2e', 'e2t', 'listen'];
  let chosen = []; while (chosen.length < 10) chosen = chosen.concat(shuffle(base)); chosen = chosen.slice(0, 10);
  runExercises(s, chosen.map((it, j) => exercise(it, pool, kinds[j])), {total: 10, onDone: r => { const acc = finish(s, r, 'Quiz complete!'); if (acc === 100) addXP(10); }});
}
function runCards(lang, after) {
  const s = session('Flashcards', after); let q = due(lang); const practice = !q.length; if (practice) q = shuffle(learned(lang)).slice(0, 10);
  const total = q.length; let done = 0, again = 0, xp = 0;
  const show = () => {
    if (s.closed) return;
    if (!q.length) return finish(s, {right: total - again, answered: total, xp}, practice ? 'Practice done!' : 'All caught up!', `<p class="meta">${learned(lang).filter(i => P.cards[i.key].d <= Date.now() + DAY).length} cards due in the next 24 h.</p>`);
    const it = q[0], c = P.cards[it.key]; s.progress(done / total);
    s.show(`<div class="q-label">${practice ? 'Practice' : `${q.length} to review`} · tap the card to flip</div>
      <div class="fc" id="fc"><div class="fc-in"><div class="fc-face front"><div class="q-big">${esc(it.t)}</div><button class="speak" id="qs" aria-label="Play">${SPK}</button></div>
      <div class="fc-face back"><div class="q-sub">${esc(it.t)}</div><div class="q-big">${esc(it.en)}</div>${it.pr ? `<div class="q-pr">${esc(it.pr)}</div>` : ''}</div></div></div>`);
    $('#qs', s.body).onclick = e => { e.stopPropagation(); say(it, e.currentTarget); };
    const flip = () => { const f = $('#fc', s.body); if (f.classList.contains('flipped')) return; f.classList.add('flipped'); buzz(8);
      const G = [['Again', 1], ['Hard', 3], ['Good', 4], ['Easy', 5]];
      s.foot.innerHTML = `<div class="grades">${G.map(([n, g]) => `<button class="grade g${g} press" data-g="${g}"><b>${n}</b><span>${ivl(schedule(c, g))}</span></button>`).join('')}</div>`;
      $$('.grade', s.foot).forEach(b => b.onclick = () => { const g = +b.dataset.g; if (!practice) P.cards[it.key] = schedule(c, g); save(); addXP(5, b); xp += 5; done++;
        q.shift(); if (g < 3) { again++; if (!practice) q.push(it); } $('#fc', s.body).classList.add(g < 3 ? 'toss-l' : 'toss-r'); setTimeout(show, R.reduceMotion ? 0 : 260); }); };
    $('#fc', s.body).onclick = flip; s.foot.innerHTML = '<button class="btn primary lsn-go">Show answer</button>'; $('.lsn-go', s.foot).onclick = flip;
  };
  show();
}
R.learn.addMode('lessons', 'Lessons', renderHome, true);
R.onBoot({userChanged: () => { P = load(); }});
R.lessons = {schedule, scoreSpeech, streak, addXP, state: () => P, due, learned, runLesson, runCards, runQuiz, lessonsOf, dkey};
// Home: a small streak chip next to the Learn quick action label
const prev = R.home.onJournal;
R.home.onJournal = t => { prev?.(t); const q = $('#qLearn'); if (q && streak()) q.insertAdjacentHTML('beforeend', `<span class="q-streak">${FLAME}${streak()}</span>`); };
})();
