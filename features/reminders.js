/* Roamly – Countdown & reminders. Local notifications (no server): fired by the app while open, by the service worker on
   periodic background sync where the browser supports it, and caught up on next launch. */
(() => {
const R = window.roamly, {$, $$, esc, toast} = R;
const H = 36e5, DAY = 864e5;
const BELL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
const perm = () => ('Notification' in window) ? Notification.permission : 'unsupported';
const at = (date, hm = '09:00') => new Date(`${date}T${hm}`).getTime();
const startTs = t => t.start ? at(t.start, '00:00') : null;
const fmtWhen = ts => new Date(ts).toLocaleString(undefined, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
function parts(ms) { ms = Math.max(0, ms); return {d: Math.floor(ms / DAY), h: Math.floor(ms % DAY / H), m: Math.floor(ms % H / 6e4), s: Math.floor(ms % 6e4 / 1e3)}; }
function cdText(t) { const s = startTs(t); if (!s) return ''; const e = at(t.end || t.start, '23:59'), now = Date.now();
  if (now > e) return 'Trip finished'; if (now >= s) return 'Happening now'; const p = parts(s - now); return p.d ? `Starts in ${p.d} day${p.d > 1 ? 's' : ''}` : p.h ? `Starts in ${p.h} h ${p.m} min` : `Starts in ${p.m} min`; }
/* Smart suggestions from the trip itself */
function suggestions(t) {
  const out = [], s = t.start; if (!s) return out;
  const add = (key, ts, text, why) => { if (ts > Date.now()) out.push({key, at: ts, text, why}); };
  add('week', at(s) - 7 * DAY, `${t.name} starts in a week`, '1 week before · 9:00');
  if (R.tripLow(t).length) add('offline', at(s, '19:00') - 2 * DAY, `Download ${t.name} for offline – signal may be patchy`, '2 days before · 19:00');
  add('pack', at(s, '18:00') - DAY, `Pack for ${t.name} – ${t.packing.filter(p => !p.done).length || 'check your'} items to go`, 'Day before · 18:00');
  add('go', at(s, '08:00'), `Today's the day – have a great ${t.name}!`, 'Morning of · 8:00');
  for (const k of t.tickets || []) if (k.date) {
    const ts = at(k.date, k.time || '09:00');
    if (k.type === 'flight') add('tk-ci-' + k.id, ts - 24 * H, `Check in for ${k.title}`, '24 h before departure');
    add('tk-' + k.id, ts - (k.time ? 3 * H : 0) - (k.time ? 0 : H), `${k.title}${k.time ? ` at ${k.time}` : ' today'}${k.ref ? ` · ref ${k.ref}` : ''}`, k.time ? '3 h before' : 'Morning of · 8:00');
  }
  return out.sort((a, b) => a.at - b.at);
}
const list = t => (t.reminders ||= []);
const upcoming = () => R.trips().flatMap(t => list(t).filter(r => !r.fired).map(r => ({t, r}))).sort((a, b) => a.r.at - b.r.at);

/* ---------- delivery ---------- */
async function notify(title, body, tag) {
  if (perm() === 'granted') {
    try { const reg = await navigator.serviceWorker?.getRegistration(); const opt = {body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: {url: './#trips'}, renotify: true};
      if (reg) { await reg.showNotification(title, opt); return 'system'; } new Notification(title, opt); return 'system'; } catch {}
  }
  toast(`🔔 ${body}`, 6000); return 'toast';
}
let timer = null;
async function tick() {
  clearTimeout(timer); const now = Date.now(); let changed = false;
  const shown = await swShown();
  for (const {t, r} of upcoming()) {
    if (r.at > now) break;
    r.fired = true; changed = true;
    if (shown.includes(r.id)) continue; // the service worker already showed it in the background
    if (now - r.at < 3 * DAY) { const how = await notify(t.name, r.text + (now - r.at > 30 * 6e4 ? ` (${fmtWhen(r.at)})` : ''), r.id); r.via = how; }
  }
  if (changed) { R.saveTrips(); rerender(); }
  const nx = upcoming()[0]; if (nx) timer = setTimeout(tick, Math.min(Math.max(1000, nx.r.at - Date.now() + 50), 60e3));
  sync();
}
/* Hand the schedule to the service worker (periodic background sync + Notification Triggers where supported) */
async function sync() {
  try {
    const c = await caches.open('roamly-meta'); const due = upcoming().slice(0, 50).map(({t, r}) => ({id: r.id, at: r.at, title: t.name, body: r.text}));
    await c.put('reminders.json', new Response(JSON.stringify(due), {headers: {'content-type': 'application/json'}}));
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.periodicSync && due.length) { try { const st = await navigator.permissions.query({name: 'periodic-background-sync'}); if (st.state === 'granted') await reg.periodicSync.register('roamly-reminders', {minInterval: 15 * 6e4}); } catch {} }
  } catch {}
}
async function swShown() { try { const c = await caches.open('roamly-meta'), r = await c.match('shown.json'); return r ? await r.json() : []; } catch { return []; } }
async function trigger(r, t) { // exact-time OS notification where the Notification Triggers API exists (some Chromium builds)
  try { if (perm() !== 'granted' || !('showTrigger' in Notification.prototype) || !window.TimestampTrigger) return; const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(t.name, {body: r.text, tag: r.id, icon: 'icons/icon-192.png', showTrigger: new TimestampTrigger(r.at)}); r.trig = true; } catch {}
}
async function askPermission() {
  if (perm() === 'unsupported') { toast('This browser can\u2019t show notifications – reminders will appear inside Roamly'); return 'unsupported'; }
  if (perm() === 'denied') { toast('Notifications are blocked – allow them in your browser settings'); return 'denied'; }
  const p = await Notification.requestPermission(); if (p === 'granted') { notify('Roamly', 'Notifications are on – we\u2019ll remind you before your trips.', 'roamly-on'); upcoming().forEach(({t, r}) => trigger(r, t)); }
  rerender(); return p;
}
function addReminder(t, r) { const x = {id: R.uid(), fired: false, ...r}; list(t).push(x); R.saveTrips(); trigger(x, t); tick(); return x; }

/* ---------- UI: reminders sheet ---------- */
let cdTimer;
function sheet(t) {
  R.modal(`<div class="rm-head"><div class="eyebrow">${esc(t.name)}</div><div class="rm-cd" id="rmCd"></div></div><div id="rmBody"></div>`, (c, close) => {
    const paintCd = () => { const el = $('#rmCd', c); if (!el) return clearInterval(cdTimer); const s = startTs(t); if (!s || Date.now() >= s) { el.innerHTML = `<span class="rm-txt">${esc(cdText(t) || 'Add dates to see a countdown')}</span>`; return; }
      const p = parts(s - Date.now()); const prev = el.dataset.v; el.dataset.v = JSON.stringify(p);
      el.innerHTML = [['d', 'days'], ['h', 'hrs'], ['m', 'min'], ['s', 'sec']].map(([k, n]) => `<div><b class="${prev && JSON.parse(prev)[k] !== p[k] ? 'tickin' : ''}">${String(p[k]).padStart(2, '0')}</b><span>${n}</span></div>`).join(''); };
    clearInterval(cdTimer); paintCd(); cdTimer = setInterval(paintCd, 1000);
    const paint = () => {
      const pm = perm(), sug = suggestions(t), mine = list(t).filter(r => !r.fired).sort((a, b) => a.at - b.at), past = list(t).filter(r => r.fired);
      $('#rmBody', c).innerHTML = `${pm === 'granted' ? '' : `<div class="rm-perm"><span class="rm-bell">${BELL}</span><div class="grow"><b>${pm === 'denied' ? 'Notifications are blocked' : pm === 'unsupported' ? 'In-app reminders' : 'Get notified'}</b><span>${pm === 'denied' ? 'Allow them for this site in your browser settings.' : pm === 'unsupported' ? 'This browser can\u2019t show system notifications; reminders appear when you open Roamly.' : 'Allow notifications so reminders reach you outside the app.'}</span></div>${pm === 'default' ? '<button class="btn primary sm" id="rmAllow">Allow</button>' : ''}</div>`}
        ${sug.length ? `<div class="section-h"><h2>Suggested</h2></div><div class="group">${sug.map((s, i) => { const on = list(t).some(r => r.key === s.key && !r.fired); return `<label class="li"><span class="grow"><b class="rm-t">${esc(s.text)}</b><span class="meta">${esc(s.why)} · ${fmtWhen(s.at)}</span></span><span class="switch"><input type="checkbox" data-i="${i}" ${on ? 'checked' : ''}><span></span></span></label>`; }).join('')}</div>` : `<p class="meta">${t.start ? '' : 'Add trip dates to get smart suggestions.'}</p>`}
        <div class="section-h"><h2>Custom</h2></div>
        <div class="rm-add"><input id="rmText" placeholder="Remind me to…" maxlength="120"><input id="rmAt" type="datetime-local"><button class="btn primary sm" id="rmGo">Add</button></div>
        ${mine.filter(r => !r.key).length ? `<div class="group">${mine.filter(r => !r.key).map(r => `<div class="li"><span class="grow"><b class="rm-t">${esc(r.text)}</b><span class="meta">${fmtWhen(r.at)}</span></span><button class="x" data-id="${r.id}" aria-label="Delete reminder">✕</button></div>`).join('')}</div>` : ''}
        ${past.length ? `<p class="meta rm-past">${past.length} reminder${past.length > 1 ? 's' : ''} already sent</p>` : ''}
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Done</button></div>`;
      $('#rmAllow', c) && ($('#rmAllow', c).onclick = async () => { await askPermission(); paint(); });
      $$('input[type=checkbox][data-i]', c).forEach(cb => cb.onchange = () => { const s = sug[+cb.dataset.i];
        if (cb.checked) { addReminder(t, {key: s.key, at: s.at, text: s.text}); toast(`Reminder set for ${fmtWhen(s.at)}`); if (perm() === 'default') askPermission().then(paint); }
        else { t.reminders = list(t).filter(r => !(r.key === s.key && !r.fired)); R.saveTrips(); tick(); } rerender(); });
      const d = new Date(Date.now() + H); d.setMinutes(0, 0, 0); $('#rmAt', c).value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
      $('#rmGo', c).onclick = () => { const text = $('#rmText', c).value.trim(), ts = new Date($('#rmAt', c).value).getTime();
        if (!text) { const a = $('#rmText', c); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); return a.focus(); }
        if (!(ts > Date.now())) return toast('Pick a time in the future');
        addReminder(t, {at: ts, text}); toast(`Reminder set for ${fmtWhen(ts)}`); if (perm() === 'default') askPermission().then(paint); paint(); rerender(); };
      $$('.x[data-id]', c).forEach(b => b.onclick = () => { t.reminders = list(t).filter(r => r.id !== b.dataset.id); R.saveTrips(); tick(); paint(); rerender(); });
    };
    paint();
  });
}
function rerender() { // keep badges in sync
  $$('.cd-chip').forEach(ch => { const t = R.getTrip(ch.dataset.t); if (t) ch.outerHTML = chip(t); }); wireChips();
  const hb = $('#heroBell'); if (hb) { const n = upcoming().filter(x => x.t.id === hb.dataset.t).length; hb.querySelector('i').textContent = n || ''; hb.classList.toggle('has', !!n); }
}
const chip = t => { const n = list(t).filter(r => !r.fired).length, txt = cdText(t); return `<button class="cd-chip press" data-t="${t.id}">${BELL}<span>${esc(txt || 'Reminders')}${n ? ` · ${n} reminder${n > 1 ? 's' : ''}` : ''}</span></button>`; };
const wireChips = () => $$('.cd-chip').forEach(ch => ch.onclick = () => sheet(R.getTrip(ch.dataset.t)));
/* Trip detail: countdown chip under the dates */
R.onDrawTrip(t => { requestAnimationFrame(() => { const h = $('#tripDetail .trip-head .grow'); if (h && !$('.cd-chip', h) && R.state.tripId === t.id) { h.insertAdjacentHTML('beforeend', chip(t)); wireChips(); } }); return false; });
R.addTripMenuItem({label: () => 'Reminders', run: sheet});
/* Home: bell on the next-trip card */
const prev = R.home.onJournal;
R.home.onJournal = t => { prev?.(t); const hero = $('#heroTrip'); if (!hero || !t) return; const n = list(t).filter(r => !r.fired).length;
  hero.insertAdjacentHTML('beforeend', `<button class="hero-bell press ${n ? 'has' : ''}" id="heroBell" data-t="${t.id}" aria-label="Reminders">${BELL}<i>${n || ''}</i></button>`);
  $('#heroBell').onclick = e => { e.stopPropagation(); sheet(t); }; };
/* Profile: notifications setting */
R.profile.addSetting({html: () => `<button class="li" id="pNotif"><span class="grow">Trip reminders</span><span class="val">${{granted: 'On', denied: 'Blocked', default: 'Off', unsupported: 'In-app'}[perm()]} · ${upcoming().length} upcoming</span><span class="chev">›</span></button>`,
  wire: () => { $('#pNotif').onclick = async () => { if (perm() === 'default') { await askPermission(); R.profile.render(); } else { const n = upcoming(); R.modal(`<h3>Upcoming reminders</h3>${n.length ? `<div class="group">${n.map(({t, r}) => `<div class="li"><span class="grow"><b class="rm-t">${esc(r.text)}</b><span class="meta">${esc(t.name)} · ${fmtWhen(r.at)}</span></span></div>`).join('')}</div>` : '<p class="meta">No reminders yet – open a trip and tap the bell.</p>'}<p class="meta" style="font-size:12px;margin-top:12px">Reminders are delivered by this device. On iPhone they show when Roamly is open or added to your Home Screen; some Android/desktop browsers can also deliver them in the background.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Close</button></div>`); } }; }});
R.onTripDelete(async () => { setTimeout(tick, 100); });
R.onBoot({init: () => { tick(); document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); }); }, userChanged: () => tick()});
R.reminders = {suggestions, addReminder, tick, upcoming, sheet, askPermission, cdText, notify};
})();
