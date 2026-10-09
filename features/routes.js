/* Roamly – Route planner: real road / footpath / cycle routes between trip stops (OSRM, routing.openstreetmap.de). Cached for offline. */
(() => {
const R = window.roamly, {$, $$, esc, toast} = R;
const OSRM = 'https://routing.openstreetmap.de';
const MODES = {car: {label: 'Drive', profile: 'routed-car', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="13.5" r=".8" fill="currentColor"/><circle cx="16.5" cy="13.5" r=".8" fill="currentColor"/></svg>'},
  foot: {label: 'Walk', profile: 'routed-foot', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 3 3v4M8 12l3-4 3 2 2 3M12 15l-1-5"/></svg>'},
  bike: {label: 'Cycle', profile: 'routed-bike', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7h-3M14 6h2"/></svg>'}};
const imperial = /^en-(US|GB|LR|MM)/i.test(navigator.language || '');
const fmtDist = m => imperial ? (m < 300 ? `${Math.round(m * 3.281 / 10) * 10} ft` : `${(m / 1609.34).toFixed(m < 16000 ? 1 : 0)} mi`) : (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
const fmtDur = s => { const m = Math.round(s / 60); if (m < 60) return `${Math.max(1, m)} min`; const h = Math.floor(m / 60), r = m % 60; return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h${r ? ` ${r} min` : ''}`; };
const stopsKey = t => t.destinations.map(d => `${d.lat.toFixed(4)},${d.lon.toFixed(4)}`).join(';');

/* Turn OSRM maneuvers into short readable instructions */
function instruction(st) {
  const m = st.maneuver || {}, road = st.name || st.ref || '', on = road ? ` onto ${road}` : '', mod = (m.modifier || '').replace('slight ', 'slightly ').replace('sharp ', 'sharp ');
  switch (m.type) {
    case 'depart': return `Head ${m.bearing_after != null ? ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(m.bearing_after / 45) % 8] : 'off'}${road ? ` on ${road}` : ''}`;
    case 'arrive': return 'Arrive at your stop';
    case 'roundabout': case 'rotary': return `At the roundabout take exit ${m.exit || 1}${on}`;
    case 'merge': return `Merge${on}`;
    case 'on ramp': return `Take the ramp${on}`;
    case 'off ramp': return `Take the exit${on}`;
    case 'fork': return `Keep ${mod || 'ahead'}${on}`;
    case 'end of road': return `At the end of the road turn ${mod}${on}`;
    case 'ferry': return `Take the ferry${road ? ` (${road})` : ''}`;
    case 'continue': case 'new name': return `Continue${road ? ` on ${road}` : ''}`;
    default: return mod === 'uturn' ? `Make a U-turn${on}` : mod === 'straight' ? `Go straight${on}` : `Turn ${mod || 'ahead'}${on}`;
  }
}
const ARROW = mod => ({left: '↰', 'slight left': '↖', 'sharp left': '↰', right: '↱', 'slight right': '↗', 'sharp right': '↱', uturn: '↶', straight: '↑'}[mod] || '↑');
function slim(route) {
  const coords = route.geometry.coordinates, step = Math.max(1, Math.ceil(coords.length / 1500));
  return {distance: route.distance, duration: route.duration, geometry: coords.filter((_, i) => i % step === 0 || i === coords.length - 1).map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]),
    legs: route.legs.map(l => ({distance: l.distance, duration: l.duration, steps: (l.steps || []).filter(s => s.distance > 0 || s.maneuver?.type === 'arrive').slice(0, 120).map(s => ({i: instruction(s), a: s.maneuver?.type === 'arrive' ? '◉' : s.maneuver?.type === 'depart' ? '●' : s.maneuver?.type?.includes('round') ? '⟳' : ARROW(s.maneuver?.modifier), d: s.distance}))}))};
}
async function osrm(mode, pts) {
  const url = `${OSRM}/${MODES[mode].profile}/route/v1/driving/${pts.map(p => `${p.lon},${p.lat}`).join(';')}?overview=full&geometries=geojson&steps=true`;
  const r = await fetch(url, {signal: AbortSignal.timeout?.(20000)}); const j = await r.json().catch(() => ({}));
  if (j.code === 'Ok' && j.routes?.[0]) return slim(j.routes[0]);
  const e = new Error(j.code === 'NoRoute' ? 'NoRoute' : j.message || `HTTP ${r.status}`); e.code = j.code; throw e;
}
/* Route the whole trip; if one leg is impossible (sea crossing, island) route the legs one by one */
async function planTrip(t, mode) {
  const pts = t.destinations;
  try { const r = await osrm(mode, pts); return {...r, gaps: []}; }
  catch (e) {
    if (e.code !== 'NoRoute' || pts.length < 3) { if (e.code === 'NoRoute') { const g = pts.map(p => [p.lat, p.lon]); return {distance: 0, duration: 0, geometry: g, segs: [{none: true, c: g}], legs: [{none: true, distance: 0, duration: 0, steps: []}], gaps: [0]}; } throw e; }
    const legs = [], geometry = [], gaps = [], segs = []; let distance = 0, duration = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      try { const r = await osrm(mode, [pts[i], pts[i + 1]]); legs.push(r.legs[0]); geometry.push(...r.geometry); segs.push({c: r.geometry}); distance += r.distance; duration += r.duration; }
      catch (e2) { if (e2.code !== 'NoRoute') throw e2; legs.push({none: true, distance: 0, duration: 0, steps: []}); gaps.push(i); const g = [[pts[i].lat, pts[i].lon], [pts[i + 1].lat, pts[i + 1].lon]]; geometry.push(...g); segs.push({none: true, c: g}); }
    }
    return {distance, duration, geometry, legs, gaps, segs};
  }
}
const cached = (t, mode) => { const c = t.cache.routes?.[mode]; return c && c.key === stopsKey(t) ? c : null; };
async function ensure(t, mode, force) {
  t.cache.routes ||= {};
  if (!force && cached(t, mode)) return cached(t, mode);
  if (!navigator.onLine) throw new Error('offline');
  const r = await planTrip(t, mode); t.cache.routes[mode] = {key: stopsKey(t), at: Date.now(), ...r}; R.saveTrips(); return t.cache.routes[mode];
}

function render(t, body) {
  t.routeMode ||= 'car';
  const mode = t.routeMode;
  const seg = `<div class="seg" id="rModes">${Object.entries(MODES).map(([k, m]) => `<button class="${k === mode ? 'on' : ''}" data-m="${k}">${m.icon}<span>${m.label}</span></button>`).join('')}<span class="seg-ind"></span></div>`;
  if (t.destinations.length < 2) {
    body.innerHTML = `${seg}<div class="empty"><div class="big">🧭</div>Add at least two stops to plan the route between them.<br><span class="meta">For directions to anywhere, search a place on the Map and tap <b>Directions</b>.</span></div>`;
    wireSeg(t, body); return;
  }
  body.innerHTML = `${seg}<div id="rOut">${R.skeleton(3, 64)}</div>`;
  wireSeg(t, body); paint(t, body);
}
function wireSeg(t, body) {
  const s = $('#rModes', body), move = () => { const b = $('button.on', s), ind = $('.seg-ind', s); if (b && ind) { ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft - 4}px)`; } };
  requestAnimationFrame(move);
  $$('button', s).forEach(b => b.onclick = () => { if (b.dataset.m === t.routeMode) return; t.routeMode = b.dataset.m; R.saveTrips(); $$('button', s).forEach(x => x.classList.toggle('on', x === b)); move(); if (t.destinations.length >= 2) { $('#rOut', body).innerHTML = R.skeleton(3, 64); paint(t, body); } });
}
async function paint(t, body, force) {
  const mode = t.routeMode; let r, err;
  try { r = await ensure(t, mode, force); } catch (e) { err = e; }
  const out = $('#rOut', body); if (!out || t.routeMode !== mode || !document.body.contains(out)) return;
  if (!r) {
    out.innerHTML = `<div class="empty"><div class="big">${err?.message === 'offline' ? '📴' : '⚠️'}</div>${err?.message === 'offline' ? `No saved ${MODES[mode].label.toLowerCase()} route for these stops. Connect once (or download the trip) to keep it offline.` : 'The routing service didn\'t answer. Try again in a moment.'}<div style="margin-top:12px"><button class="btn sm" id="rRetry">Try again</button></div></div>`;
    $('#rRetry', out).onclick = () => { out.innerHTML = R.skeleton(3, 64); paint(t, body, true); }; return;
  }
  const S = t.destinations;
  out.innerHTML = `<div class="r-sum pop-in"><div><b class="r-big">${r.duration ? fmtDur(r.duration) : 'No route'}</b><span class="meta">${r.distance ? fmtDist(r.distance) : ''}${r.gaps.length ? ` · ${r.gaps.length} leg${r.gaps.length > 1 ? 's' : ''} without a ${mode === 'car' ? 'road' : 'path'} route` : ''}</span></div>
      <button class="btn primary sm" id="rMap">Show on map</button></div>
    <div class="r-legs">${r.legs.map((l, i) => `<details class="r-leg ${l.none ? 'none' : ''}"><summary><span class="r-dot">${i + 1}</span><div class="grow"><b>${esc(S[i]?.name || '')} → ${esc(S[i + 1]?.name || '')}</b><span class="meta">${l.none ? (t.routeMode === 'car' ? 'No road route – likely a ferry or sea crossing' : `No ${t.routeMode === 'foot' ? 'walking' : 'cycling'} route – too far for the free router, or a sea crossing`) : `${fmtDur(l.duration)} · ${fmtDist(l.distance)}`}</span></div>${l.none ? '' : '<span class="chev">›</span>'}</summary>
      ${l.none ? '' : `<ol class="r-steps">${l.steps.map(s => `<li><span class="ar">${s.a}</span><span class="grow">${esc(s.i)}</span>${s.d ? `<span class="meta">${fmtDist(s.d)}</span>` : ''}</li>`).join('')}</ol>`}</details>`).join('')}</div>
    <p class="meta r-foot">${navigator.onLine ? '' : 'Offline · '}Saved ${new Date(r.at).toLocaleDateString(undefined, {day: 'numeric', month: 'short'})} · Routing © OSRM / OpenStreetMap · <button class="link-btn" id="rRefresh">Refresh</button></p>`;
  R.stagger($('.r-legs', out));
  $('#rMap', out).onclick = () => { R.setMainTab('map'); R.collapseSheetOnMobile(); R.drawTrip(t, false); fit(r); };
  $('#rRefresh', out).onclick = () => { if (!navigator.onLine) return toast('You are offline'); out.innerHTML = R.skeleton(3, 64); paint(t, body, true); };
  R.drawTrip(t, false);
}
function fit(r) { if (r.geometry.length) R.reduceMotion ? R.map.fitBounds(r.geometry, R.fitPad({})) : R.map.flyToBounds(r.geometry, R.fitPad({duration: 1.2})); }
function line(coords, layer) {
  L.polyline(coords, {color: '#2dd4bf', weight: 9, opacity: .16, className: 'route-glow'}).addTo(layer);
  L.polyline(coords, {color: '#2dd4bf', weight: 4, opacity: .95, className: 'route-line', lineJoin: 'round'}).addTo(layer);
}
/* Draw the real route on the trip layer instead of the straight dashed line */
R.onDrawTrip((t, layer) => {
  const r = t.destinations.length > 1 && cached(t, t.routeMode || 'car'); if (!r || !r.geometry.length) return false;
  if (!r.segs) { line(r.geometry, layer); return true; }
  r.segs.forEach(g => g.none ? L.polyline(g.c, {color: '#2dd4bf', weight: 3, opacity: .6, dashArray: '6 8'}).addTo(layer) : line(g.c, layer)); // impossible legs stay dashed
  return true;
});
/* Offline download: save all three modes so any route works without signal */
R.addDownloadStep({at: .93, label: 'Saving routes…', run: async t => { if (t.destinations.length < 2) return; for (const m of Object.keys(MODES)) { try { await ensure(t, m, true); } catch {} } }, done: t => t.destinations.length > 1 ? `routes (${Object.keys(MODES).filter(m => cached(t, m)).length}/3)` : ''});

/* "Directions" from the map popup: from your location to the place */
const dirLayer = L.layerGroup().addTo(R.map);
function here() { return new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => res({lat: p.coords.latitude, lon: p.coords.longitude}), rej, {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000}) : rej(new Error('no gps'))); }
async function directions(p) {
  if (!navigator.onLine) return toast('Directions need a connection – downloaded trip routes still work offline');
  R.map.closePopup();
  R.modal(`<h3>Directions to ${esc(p.name)}</h3><p class="meta" style="margin:-6px 0 12px">From your current location</p><div id="dOut">${R.skeleton(3, 52)}</div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-close>Close</button></div>`, async (c, close) => {
    let from; try { from = await here(); } catch (e) { $('#dOut', c).innerHTML = `<div class="empty">${e?.code === 1 ? 'Location permission denied – allow it to get directions.' : 'Could not get your location.'}</div>`; return; }
    const res = await Promise.all(Object.keys(MODES).map(m => osrm(m, [from, p]).then(r => [m, r]).catch(() => [m, null])));
    const out = $('#dOut', c); if (!out) return;
    out.innerHTML = `<div class="d-modes">${res.map(([m, r]) => `<button class="d-mode press" data-m="${m}" ${r ? '' : 'disabled'}>${MODES[m].icon}<b>${r ? fmtDur(r.duration) : '—'}</b><span class="meta">${r ? fmtDist(r.distance) : 'no route'}</span></button>`).join('')}</div>`;
    R.stagger($('.d-modes', out));
    $$('.d-mode', out).forEach(b => b.onclick = () => { const r = res.find(x => x[0] === b.dataset.m)[1]; dirLayer.clearLayers(); line(r.geometry, dirLayer);
      L.circleMarker([from.lat, from.lon], {radius: 7, color: '#000', weight: 3, fillColor: '#2dd4bf', fillOpacity: 1}).addTo(dirLayer); close(); R.collapseSheetOnMobile(); fit(r);
      toast(`${MODES[b.dataset.m].label}: ${fmtDur(r.duration)} · ${fmtDist(r.distance)}`, 4000); });
  });
}
R.addPopupAction({html: () => '<button class="btn sm" id="popDir">Directions</button>', wire: p => { const b = $('#popDir'); b && (b.onclick = () => directions(p)); }});
R.addTripTab('route', 'Route', render, 'plan');
R.routes = {ensure, planTrip, fmtDur, fmtDist, directions, clear: () => dirLayer.clearLayers()};
})();
