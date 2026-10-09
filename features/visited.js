/* Roamly – Visited places: a world map of where you've been (past trips, journal places and countries you tick), with stats. Works offline. */
(() => {
const R = window.roamly, {$, $$, esc, toast} = R;
const CONT = {Africa: 'dz ao bj bw bf bi cm cv cf td km cg cd ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu ma mz na ne ng rw st sn sc sl so za ss sd tz tg tn ug zm zw eh',
  Asia: 'af am az bh bd bt bn kh cn cy ge in id ir iq il jp jo kz kw kg la lb my mv mn mm np kp om pk ps ph qa sa sg kr lk sy tw tj th tl tr tm ae uz vn ye hk mo',
  Europe: 'al ad at by be ba bg hr cz dk ee fi fr de gr hu is ie it xk lv li lt lu mt md mc me nl mk no pl pt ro ru sm rs sk si es se ch ua gb va fo gi',
  'North America': 'ag bs bb bz ca cr cu dm do sv gd gt ht hn jm mx ni pa kn lc vc tt us pr gl', 'South America': 'ar bo br cl co ec gy py pe sr uy ve fk gf',
  Oceania: 'au fj ki mh fm nr nz pw pg ws sb to tv vu nc', Antarctica: 'aq tf'};
const contOf = {}; for (const [k, v] of Object.entries(CONT)) v.split(' ').forEach(c => { contOf[c] = k; });
const FIX = {'Turkish Republic of Northern Cyprus': 'cy', Somaliland: 'so'};
let geo = null, names = {};
async function loadGeo() { if (geo) return geo; const r = await fetch('data/countries.geojson'); geo = await r.json(); geo.features.forEach(f => { f.properties.iso = FIX[f.properties.n] || f.properties.iso; names[f.properties.iso] ||= f.properties.n; }); return geo; }
const manual = () => R.store.get('visited.manual', {}), setManual = v => R.store.set('visited.manual', v);
const km = (a, b) => { const r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); return 12742 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2)); };
/* Work out what's visited vs planned */
function data() {
  const today = R.today(), visited = {}, planned = {}, places = [], plannedPlaces = []; let dist = 0;
  for (const t of R.trips()) {
    const past = t.start && t.start <= today, ds = t.destinations;
    for (const d of ds) if (d.cc) { if (past) { (visited[d.cc] ||= {src: []}).src.push(t.name); places.push({...d, trip: t.name}); } else { planned[d.cc] ||= t.name; plannedPlaces.push({...d, trip: t.name}); } }
    if (past) { const r = t.cache?.routes?.car; dist += r && r.distance && r.key ? r.distance / 1000 : ds.slice(1).reduce((s, d, i) => s + km(ds[i], d), 0); }
    for (const e of t.journal || []) if (e.place && e.date <= today) places.push({name: e.place.name, lat: e.place.lat, lon: e.place.lon, trip: t.name, journal: true});
  }
  for (const [cc, on] of Object.entries(manual())) if (on) (visited[cc] ||= {src: []}).manual = true;
  for (const cc of Object.keys(visited)) delete planned[cc];
  const conts = new Set(Object.keys(visited).map(c => contOf[c]).filter(c => c && c !== 'Antarctica'));
  const uniq = [...new Map(places.map(p => [`${p.name}|${p.lat.toFixed(2)}`, p])).values()];
  return {visited, planned, places: uniq, plannedPlaces, conts, dist, pct: Math.round(Object.keys(visited).length / 195 * 1000) / 10};
}
const fmtKm = k => k >= 10000 ? `${(k / 1000).toFixed(1)}k` : Math.round(k).toLocaleString();
const styleFor = D => f => { const c = f.properties.iso; return D.visited[c] ? {fillColor: '#2dd4bf', fillOpacity: .85, color: '#0b0f14', weight: .6} : D.planned[c] ? {fillColor: '#f5b84a', fillOpacity: .55, color: '#0b0f14', weight: .6} : {fillColor: '#1c2027', fillOpacity: 1, color: '#2b3038', weight: .5}; };
function worldMap(el, D, interactive) {
  const m = L.map(el, {zoomControl: false, attributionControl: false, dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, touchZoom: interactive, boxZoom: false, keyboard: interactive, worldCopyJump: false, minZoom: 1, maxZoom: 7, zoomSnap: .25, maxBounds: [[-75, -200], [85, 200]]});
  el.style.background = '#06080b';
  m.fitBounds([[-52, -150], [74, 170]]);
  return m;
}
/* Profile card */
let mini = null;
function sectionHtml() {
  const D = data(), n = Object.keys(D.visited).length;
  return `<div class="section-h"><h2>Your world</h2><button class="link-btn" id="visOpen">Open map ›</button></div>
    <div class="vis-card press" id="visCard"><div class="vis-mini" id="visMini"></div>
      <div class="vis-stats"><div><b>${n}</b><span>countries</span></div><div><b>${D.pct}%</b><span>of the world</span></div><div><b>${D.conts.size}</b><span>of 6 continents</span></div><div><b>${fmtKm(D.dist)}</b><span>km travelled</span></div></div></div>`;
}
async function wireSection(body) {
  const el = $('#visMini', body); if (!el) return;
  $('#visCard', body).onclick = $('#visOpen', body).onclick = () => openFull();
  const D = data(); await loadGeo(); if (!document.body.contains(el)) return;
  try { mini?.remove(); } catch {} mini = worldMap(el, D, false);
  L.geoJSON(geo, {style: styleFor(D), interactive: false}).addTo(mini);
  requestAnimationFrame(() => { mini.invalidateSize(); mini.fitBounds([[-50, -140], [72, 160]]); el.classList.add('in'); });
}
/* Full-screen visited map */
function openFull() {
  const s = document.createElement('div'); s.className = 'vis-screen';
  s.innerHTML = `<div class="vis-top"><button class="back-btn" id="visBack">‹ Profile</button><b>Your world</b><span></span></div><div class="vis-map" id="visMap"></div>
    <div class="vis-sheet"><div class="vis-legend"><span><i class="lg v"></i>Visited</span><span><i class="lg p"></i>Planned</span><span><i class="lg d"></i>Places</span></div><div id="visBody"></div></div>`;
  document.body.appendChild(s); requestAnimationFrame(() => s.classList.add('in'));
  let m, layer, dots;
  const close = () => { s.classList.remove('in'); s.classList.add('out'); setTimeout(() => { try { m?.remove(); } catch {} s.remove(); }, R.reduceMotion ? 0 : 320); R.profile.render(); };
  $('#visBack', s).onclick = close;
  const paint = async () => {
    const D = data(), V = Object.entries(D.visited).sort((a, b) => (names[a[0]] || a[0]).localeCompare(names[b[0]] || b[0]));
    await loadGeo();
    if (!m) { m = worldMap($('#visMap', s), D, true); dots = L.layerGroup(); }
    layer?.remove(); layer = L.geoJSON(geo, {style: styleFor(D), onEachFeature: (f, l) => l.on('click', ev => {
      const c = f.properties.iso, v = D.visited[c], fromTrips = v?.src?.length;
      L.popup({className: 'vis-pop'}).setLatLng(ev.latlng).setContent(`<div class="t">${R.flag(c)} ${esc(f.properties.n)}</div><div class="s">${v ? (fromTrips ? `Visited · ${esc(v.src[0])}` : 'Visited') : D.planned[c] ? `Planned · ${esc(D.planned[c])}` : 'Not visited yet'}</div>${fromTrips ? '' : `<button class="btn sm ${v ? '' : 'primary'}" id="visTog">${v ? 'Remove' : 'I\u2019ve been here'}</button>`}`).openOn(m);
      setTimeout(() => { const b = $('#visTog'); b && (b.onclick = () => { toggle(c); m.closePopup(); }); }, 0);
    })}).addTo(m);
    dots.clearLayers(); D.places.forEach(p => L.circleMarker([p.lat, p.lon], {radius: 4.5, color: '#06080b', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1}).bindTooltip(`${esc(p.name)} · ${esc(p.trip)}`).addTo(dots));
    D.plannedPlaces.forEach(p => L.circleMarker([p.lat, p.lon], {radius: 4, color: '#06080b', weight: 1.5, fillColor: '#f5b84a', fillOpacity: 1}).bindTooltip(`${esc(p.name)} · planned`).addTo(dots));
    dots.addTo(m);
    const all = Object.keys(names).filter(c => c !== 'aq' && c !== 'tf').sort((a, b) => names[a].localeCompare(names[b]));
    $('#visBody', s).innerHTML = `<div class="vis-stats big"><div><b>${V.length}</b><span>countries</span></div><div><b>${D.pct}%</b><span>of the world</span></div><div><b>${D.conts.size}/6</b><span>continents</span></div><div><b>${D.places.length}</b><span>places</span></div><div><b>${fmtKm(D.dist)}</b><span>km travelled</span></div><div><b>${Object.keys(D.planned).length}</b><span>planned</span></div></div>
      <div class="vis-conts">${['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'].map(k => { const tot = CONT[k].split(' ').filter(c => names[c]).length, n = V.filter(([c]) => contOf[c] === k).length; return `<div class="vc"><span>${k}</span><div class="bar"><i style="--w:${tot ? n / tot : 0}"></i></div><b>${n}</b></div>`; }).join('')}</div>
      <div class="section-h"><h2>Countries</h2><span class="meta">${V.length}</span></div>
      ${V.length ? `<div class="group">${V.map(([c, v]) => `<div class="li"><span class="fl">${R.flag(c)}</span><span class="grow"><b>${esc(names[c] || c.toUpperCase())}</b><span class="meta">${v.src.length ? esc([...new Set(v.src)].join(', ')) : 'Ticked by you'}</span></span>${v.src.length ? '' : `<button class="x" data-c="${c}" aria-label="Remove">✕</button>`}</div>`).join('')}</div>` : '<p class="meta">Countries from past trips appear here automatically. You can also tick places you visited before Roamly.</p>'}
      <div class="section-h"><h2>Add a country</h2></div>
      <div class="l-search"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="visQ" type="search" placeholder="Search countries"></div><div id="visRes" class="group"></div>`;
    requestAnimationFrame(() => $$('.vis-conts .bar i', s).forEach(i => i.classList.add('go')));
    $$('.x[data-c]', s).forEach(b => b.onclick = () => toggle(b.dataset.c));
    const q = $('#visQ', s); q.oninput = () => { const v = q.value.trim().toLowerCase(), res = $('#visRes', s); if (!v) { res.innerHTML = ''; return; }
      const hits = all.filter(c => names[c].toLowerCase().includes(v)).slice(0, 8);
      res.innerHTML = hits.map(c => `<button class="li" data-c="${c}"><span class="fl">${R.flag(c)}</span><span class="grow">${esc(names[c])}</span><span class="${D.visited[c] ? 'ok' : 'meta'}">${D.visited[c] ? '✓ Visited' : 'Add'}</span></button>`).join('') || '<div class="li meta">No match</div>';
      $$('button.li', res).forEach(b => b.onclick = () => { if (D.visited[b.dataset.c]?.src?.length) return toast('Already visited on a trip'); toggle(b.dataset.c); }); };
  };
  const toggle = c => { const v = manual(); if (v[c]) { delete v[c]; toast(`Removed ${names[c] || c}`); } else { v[c] = true; toast(`${R.flag(c)} ${names[c] || c} added`); } setManual(v); paint(); };
  paint().then(() => setTimeout(() => m.invalidateSize(), 350));
}
R.profile.addSection({html: sectionHtml, wire: body => wireSection(body)});
R.visited = {data, openFull, loadGeo};
})();
