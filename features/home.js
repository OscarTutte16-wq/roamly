/* Roamly – Home dashboard: greeting, next trip countdown, quick actions, weather, journal. */
(() => {
const R = window.roamly, {$, esc} = R;
const WMO_ICON = c => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️';
const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
};
function nextTrip() {
  const t0 = R.today(), all = R.trips();
  return all.filter(t => t.end && t.end >= t0).sort((a, b) => a.start.localeCompare(b.start))[0] || all.find(t => !t.start) || null;
}
function countdown(t) {
  if (!t.start) return null;
  const ms = new Date(t.start + 'T09:00:00') - Date.now();
  if (ms <= 0) return null;
  return {d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60};
}
let timer;
function render() {
  const body = $('#homeBody'); if (!body) return;
  const acc = R.auth?.current?.(); const h = new Date().getHours();
  $('#homeGreeting').textContent = `${h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${acc ? ', ' + acc.name.split(' ')[0] : ''}`;
  $('#homeDate').textContent = new Date().toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'});
  const t = nextTrip();
  let hero;
  if (t) {
    const hue = [...t.name].reduce((x, c) => (x * 31 + c.charCodeAt(0)) % 360, 7), cd = countdown(t), live = t.start && t.start <= R.today() && t.end >= R.today();
    const needs = R.tripLow(t).length && !R.isDownloaded(t);
    hero = `<div class="hero press" id="heroTrip" style="--h:${hue}"><span class="flagbig">${t.destinations[0] ? R.flag(t.destinations[0].cc) : '🧭'}</span>
      <div class="eyebrow">${live ? 'Happening now' : 'Next trip'}</div><h2>${esc(t.name)}</h2>
      <div class="sub">${t.start ? `${R.fmtDate(t.start)} – ${R.fmtDate(t.end)}` : `${t.dayCount} days`} · ${t.destinations.map(d => esc(d.name)).slice(0, 3).join(' → ') || 'No stops yet'}</div>
      ${cd ? `<div class="countdown" id="cd"><div><b>${cd.d}</b><span>days</span></div><div><b>${cd.h}</b><span>hours</span></div><div><b>${cd.m}</b><span>min</span></div></div>` : ''}
      ${needs ? `<div class="hero-warn">Low signal expected <button id="heroDl">Download everything</button></div>` : ''}</div>`;
  } else {
    hero = `<div class="hero press" id="heroNew" style="--h:170"><div class="eyebrow">Get started</div><h2>Plan your first trip</h2><div class="sub">Add places, build a day-by-day plan and save it for offline.</div></div>`;
  }
  body.innerHTML = `${hero}
    <div class="quick"><button id="qNew">${'<span class="qi">' + ICON.plus + '</span>'}New trip</button><button id="qSearch"><span class="qi">${ICON.search}</span>Search</button><button id="qDl"><span class="qi">${ICON.down}</span>Offline</button><button id="qLearn"><span class="qi">${ICON.chat}</span>Phrases</button></div>
    ${t && t.destinations[0] ? `<div class="section-h"><h2>Weather</h2><span class="meta">${esc(t.destinations[0].name)}</span></div><div class="card" id="homeWx">${R.skeleton(1, 54)}</div>` : ''}
    <div class="section-h"><h2>Journal</h2></div><div class="card" id="homeJournal"><div class="empty-soft">Notes and photos from your trips will show up here.</div></div>`;
  R.stagger(body);
  const open = () => { R.state.view = 'trip'; R.state.tripId = t.id; R.state.tripTab = 'plan'; R.setMainTab('trips'); };
  $('#heroTrip') && ($('#heroTrip').onclick = e => { if (!e.target.closest('#heroDl')) open(); });
  $('#heroDl') && ($('#heroDl').onclick = e => { e.stopPropagation(); open(); setTimeout(() => R.downloadTrip(t), 400); });
  $('#heroNew') && ($('#heroNew').onclick = () => R.tripForm());
  $('#qNew').onclick = () => R.tripForm();
  $('#qSearch').onclick = () => { R.setMainTab('map'); setTimeout(() => $('#searchInput').focus(), 350); };
  $('#qDl').onclick = () => { if (!t) return R.toast('Create a trip first'); open(); setTimeout(() => R.downloadTrip(t), 400); };
  $('#qLearn').onclick = () => R.setMainTab('learn');
  clearInterval(timer); timer = setInterval(() => { const c = t && countdown(t), el = $('#cd'); if (!c || !el) return; const b = el.querySelectorAll('b'); [c.d, c.h, c.m].forEach((v, i) => { if (b[i].textContent != v) { b[i].textContent = v; b[i].animate?.([{transform: 'translateY(-6px)', opacity: 0}, {transform: 'none', opacity: 1}], {duration: 400, easing: 'cubic-bezier(.2,1,.3,1)'}); } }); }, 20000);
  if (t && t.destinations[0]) weather(t);
  R.home.onJournal?.(t);
}
async function weather(t) {
  const d = t.destinations[0]; let w = t.cache.weather[d.id];
  if ((!w || Date.now() - w.at > 3 * 3600e3) && navigator.onLine) { try { w = await R.fetchWeather(d); t.cache.weather[d.id] = w; R.saveTrips(); } catch {} }
  const el = $('#homeWx'); if (!el) return;
  if (!w) { el.innerHTML = '<div class="empty-soft">Weather unavailable offline.</div>'; return; }
  const D = w.data.daily, c = w.data.current, from = D.time.findIndex(x => x >= R.today());
  el.innerHTML = `<div class="wx-strip"><div class="now"><span style="font-size:30px">${WMO_ICON(c.weather_code)}</span><b>${Math.round(c.temperature_2m)}°</b></div>
    <div class="days">${[1, 2, 3, 4].map(k => from + k).filter(i => D.time[i]).map(i => `<div>${new Date(D.time[i] + 'T12:00').toLocaleDateString(undefined, {weekday: 'short'})}<br>${WMO_ICON(D.weather_code[i])}<b>${Math.round(D.temperature_2m_max[i])}°</b></div>`).join('')}</div></div>`;
}
R.home = {render};
R.onBoot({init: () => { R.nav.onScreen('home', render); render(); }, userChanged: render});
})();
