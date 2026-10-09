/* Roamly – travel planner. Free data sources: OSM/CARTO tiles, Nominatim, Photon, Overpass, Open-Meteo, open.er-api / Frankfurter. */
'use strict';
(() => {
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const flag = cc => cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 127397 + c.charCodeAt(0))) : '📍';
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, {weekday:'short', day:'numeric', month:'short'}) : '';
const today = () => new Date().toISOString().slice(0, 10);
const stagger = el => { if (!el) return el; [...el.children].forEach((c, i) => { c.style.setProperty('--i', Math.min(i, 14)); c.classList.add('st'); }); return el; };

/* ---------------- Config ---------------- */
// Vector basemap: OpenFreeMap (free, no key) rendered by MapLibre GL inside Leaflet – crisp on retina.
const OFM = 'https://tiles.openfreemap.org';
const OFM_STYLE = OFM + '/styles/dark';
const ATTRIB = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
// Vector tiles stop at z14 and are over-zoomed beyond, so z14 gives full street detail offline
const ZOOM_RADII_KM = {6: 80, 8: 40, 10: 20, 11: 12, 12: 8, 13: 5, 14: 3};
const MAX_TILES_PER_DEST = 250, MAX_TILES_PER_TRIP = 1200;
const CURRENCIES = ['GBP','EUR','USD','AUD','CAD','NZD','CHF','NOK','SEK','DKK','ISK','PLN','CZK','HUF','JPY','CNY','HKD','SGD','THB','INR','AED','TRY','ZAR','MXN','BRL','KRW','IDR','MYR','PHP','VND','EGP','MAD'];
const EXP_CATS = {food:'🍽️ Food', transport:'🚆 Transport', stay:'🛏️ Stay', activities:'🎟️ Activities', shopping:'🛍️ Shopping', other:'📦 Other'};
// Curated regions known for patchy mobile coverage [name, south, west, north, east]
const LOW_SIGNAL_REGIONS = [
  ['the Scottish Highlands', 56.3, -7.8, 58.75, -4.0],
  ['the Scottish Islands', 56.4, -8.7, 60.9, -0.7],
  ['Galloway Forest', 54.9, -4.8, 55.3, -4.2],
  ['Eryri / Snowdonia', 52.75, -4.2, 53.2, -3.65],
  ['the Mid-Wales uplands', 52.0, -4.0, 52.6, -3.3],
  ['Dartmoor', 50.45, -4.1, 50.75, -3.75],
  ['Northumberland & Kielder', 55.0, -2.7, 55.45, -2.0],
  ['Connemara & the West of Ireland', 53.2, -10.3, 54.4, -9.2],
  ['Lofoten & Vesterålen', 67.8, 12.0, 69.4, 16.6],
  ['the Norwegian Fjords', 60.3, 5.3, 62.6, 8.0],
  ['rural Iceland', 63.2, -24.6, 66.6, -13.4],
  ['the Faroe Islands', 61.3, -7.8, 62.45, -6.2],
  ['Lapland', 66.0, 17.0, 70.1, 29.5],
  ['Patagonia', -55.2, -75.8, -40.0, -64.0],
  ['the Australian Outback', -32.0, 118.0, -18.0, 145.0],
  ['interior Alaska', 61.0, -165.0, 70.0, -141.0],
  ['Northern Canada', 60.0, -141.0, 75.0, -60.0],
];
const SMALL_TYPES = new Set(['village','hamlet','isolated_dwelling','farm','locality','island','islet','peninsula','mountain','peak','valley','nature_reserve','national_park','croft']);
const WMO = {0:['☀️','Clear'],1:['🌤️','Mostly clear'],2:['⛅','Partly cloudy'],3:['☁️','Overcast'],45:['🌫️','Fog'],48:['🌫️','Rime fog'],51:['🌦️','Light drizzle'],53:['🌦️','Drizzle'],55:['🌧️','Heavy drizzle'],56:['🌧️','Freezing drizzle'],57:['🌧️','Freezing drizzle'],61:['🌦️','Light rain'],63:['🌧️','Rain'],65:['🌧️','Heavy rain'],66:['🌧️','Freezing rain'],67:['🌧️','Freezing rain'],71:['🌨️','Light snow'],73:['🌨️','Snow'],75:['❄️','Heavy snow'],77:['🌨️','Snow grains'],80:['🌦️','Showers'],81:['🌧️','Showers'],82:['⛈️','Violent showers'],85:['🌨️','Snow showers'],86:['🌨️','Snow showers'],95:['⛈️','Thunderstorm'],96:['⛈️','Thunder & hail'],99:['⛈️','Thunder & hail']};

/* ---------------- Storage ---------------- */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('roamly.' + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem('roamly.' + k, JSON.stringify(v)); },
};
let trips = store.get('trips', []);
const saveTrips = () => store.set('trips', trips);
const getTrip = id => trips.find(t => t.id === id);
function normTrip(t) {
  t.destinations ||= []; t.days ||= []; t.packing ||= []; t.expenses ||= []; t.tickets ||= [];
  t.cache ||= {weather: {}, nearby: {}}; t.cache.weather ||= {}; t.cache.nearby ||= {};
  t.currency ||= 'GBP'; t.budget ||= 0; t.dayCount ||= 3;
  return t;
}
trips.forEach(normTrip);

// IndexedDB for ticket attachments (images / PDFs)
const idb = (() => {
  let dbp;
  const open = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('roamly', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files', {keyPath: 'id'});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('files', mode); const r = fn(t.objectStore('files')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return { put: f => tx('readwrite', s => s.put(f)), get: id => tx('readonly', s => s.get(id)), del: id => tx('readwrite', s => s.delete(id)) };
})();

/* ---------------- UI helpers ---------------- */
let toastT;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden', 'out'); clearTimeout(toastT); toastT = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.classList.add('hidden'), 250); }, ms); }
function modal(html, onMount) {
  const m = $('#modal'), c = $('#modalCard'); c.innerHTML = html; m.classList.remove('hidden', 'closing');
  const close = () => { m.classList.add('closing'); setTimeout(() => m.classList.add('hidden'), reduceMotion ? 0 : 200); };
  m.onclick = e => { if (e.target === m) close(); };
  $$('[data-close]', c).forEach(b => b.onclick = close);
  onMount && onMount(c, close);
  const f = $('input,select,textarea', c); f && setTimeout(() => f.focus(), 60);
  return close;
}
const skeleton = (n = 3, h = 64) => `<div class="skel-list">${Array.from({length: n}, () => `<div class="skel" style="height:${h}px"></div>`).join('')}</div>`;
function moveIndicator(bar) {
  if (!bar) return; const act = $('.active', bar), ind = $('.ind', bar); if (!act || !ind) return;
  ind.style.width = act.offsetWidth + 'px'; ind.style.transform = `translateX(${act.offsetLeft - bar.scrollLeft * 0}px)`;
}
async function fetchJSON(url, opts = {}, timeout = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try { const r = await fetch(url, {...opts, signal: ac.signal}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/* ---------------- Map ---------------- */
const map = L.map('map', {zoomControl: false, worldCopyJump: true, maxZoom: 19}).setView([54.5, -3], 5);
if (!matchMedia('(max-width: 760px)').matches) L.control.zoom({position: 'topright'}).addTo(map);
map.attributionControl.setPrefix(false);
const glLayer = L.maplibreGL({style: OFM_STYLE, attribution: ATTRIB, interactive: false}).addTo(map);
// Tune OpenFreeMap's dark style to Roamly's palette (one teal accent, deep slate land, muted labels)
(function tuneStyle() {
  const m = glLayer.getMaplibreMap(); if (!m) return setTimeout(tuneStyle, 50);
  const tune = () => {
    const set = (id, prop, val) => { try { m.setPaintProperty(id, prop, val); } catch {} };
    for (const l of m.getStyle().layers) {
      const id = l.id;
      if (l.type === 'background') set(id, 'background-color', '#0b0f14');
      else if (l.type === 'raster') set(id, 'raster-opacity', 0.25);
      else if (/water/.test(id) && l.type === 'fill') set(id, 'fill-color', '#0c1a24');
      else if (/water/.test(id) && l.type === 'line') set(id, 'line-color', '#0c1a24');
      else if (/park|wood|grass|landcover|landuse/.test(id) && l.type === 'fill') { set(id, 'fill-color', '#0f1a17'); set(id, 'fill-opacity', 0.7); }
      else if (/building/.test(id) && l.type === 'fill') set(id, 'fill-color', '#161d26');
      else if (/motorway|trunk|primary/.test(id) && l.type === 'line' && !/casing/.test(id)) set(id, 'line-color', '#33404e');
      else if (/highway|road|street|minor|secondary|tertiary/.test(id) && l.type === 'line' && !/casing/.test(id)) set(id, 'line-color', '#222b36');
      else if (/boundary/.test(id) && l.type === 'line') set(id, 'line-color', '#3a4756');
      else if (l.type === 'symbol') { set(id, 'text-color', /place|city|town|village/.test(id) ? '#d5dde6' : '#7f8c9b'); set(id, 'text-halo-color', '#0b0f14'); set(id, 'text-halo-width', 1.2); }
    }
  };
  m.once('styledata', tune); if (m.isStyleLoaded()) tune();
})();
const layers = { search: L.layerGroup().addTo(map), trip: L.layerGroup().addTo(map), nearby: L.layerGroup().addTo(map), me: L.layerGroup().addTo(map) };
const pinIcon = (label = '', cls = '') => L.divIcon({className: 'pin-wrap', html: `<div class="pin-drop"><div class="pin ${cls}"><span>${esc(label)}</span></div></div><div class="pin-shadow"></div>`, iconSize: [30, 42], iconAnchor: [15, 40], popupAnchor: [0, -38]});
const poiIcon = emoji => L.divIcon({className: 'poi-wrap', html: `<div class="poi">${emoji}</div>`, iconSize: [28, 28], iconAnchor: [14, 14]});
// Keep targets centred in the visible part of the map (not hidden behind the glass panel / bottom sheet)
function viewOffset() { const pn = document.getElementById('panel'); if (matchMedia('(max-width: 760px)').matches) return L.point(0, pn.classList.contains('collapsed') ? 66 : pn.offsetHeight / 2); return L.point(-(pn.offsetWidth + 12) / 2, 0); }
function fitPad(extra = {}) { const pn = document.getElementById('panel'); const mob = matchMedia('(max-width: 760px)').matches; return {paddingTopLeft: mob ? [30, 60] : [pn.offsetWidth + 40, 40], paddingBottomRight: mob ? [30, (pn.classList.contains('collapsed') ? 132 : pn.offsetHeight) + 20] : [50, 40], ...extra}; }
function flyTo(lat, lon, zoom) { const c = map.unproject(map.project([lat, lon], zoom).add(viewOffset()), zoom); reduceMotion ? map.setView(c, zoom) : map.flyTo(c, zoom, {duration: 1.3, easeLinearity: 0.2}); }
function zoomForPlace(p) { const r = p.rank || 16; return r >= 26 ? 18 : r >= 20 ? 16 : r >= 18 ? 15 : r >= 16 ? 13 : r >= 12 ? 10 : 6; }
function wirePopAdd(p) { const b = $('#popAdd'); b && (b.onclick = () => addToTripPicker(p)); }
function showPlace(p) {
  collapseSheetOnMobile();
  layers.search.clearLayers();
  const m = L.marker([p.lat, p.lon], {icon: pinIcon('★', 'search')}).addTo(layers.search);
  m.bindPopup(`<div class="t">${flag(p.cc)} ${esc(p.name)}</div><div class="s">${esc(p.sub)}</div><button class="btn primary sm" id="popAdd">＋ Add to trip</button>`);
  m.on('popupopen', () => wirePopAdd(p));
  if (p.bbox) reduceMotion ? map.fitBounds(p.bbox, fitPad({maxZoom: 16})) : map.flyToBounds(p.bbox, fitPad({maxZoom: 16, duration: 1.3}));
  else flyTo(p.lat, p.lon, zoomForPlace(p));
  setTimeout(() => m.openPopup(), reduceMotion ? 50 : 1350);
}

// Locate me (browser GPS)
let watchId = null;
$('#locateBtn').onclick = () => {
  if (!navigator.geolocation) return toast('Location not supported on this device');
  toast('Finding your location…');
  let first = true;
  const onPos = pos => {
    const {latitude: lat, longitude: lon, accuracy} = pos.coords;
    layers.me.clearLayers();
    L.circle([lat, lon], {radius: accuracy, color: '#60a5fa', weight: 1, fillOpacity: .12}).addTo(layers.me);
    L.marker([lat, lon], {icon: L.divIcon({className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9]})}).addTo(layers.me).bindPopup(`You are here (±${Math.round(accuracy)} m)`);
    if (first) { first = false; collapseSheetOnMobile(); flyTo(lat, lon, accuracy < 100 ? 17 : 15); }
  };
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, e => toast(e.code === 1 ? 'Location permission denied – allow it in your browser settings' : 'Could not get your location'), {enableHighAccuracy: true, maximumAge: 5000, timeout: 20000});
};

/* ---------------- Geocoding ---------------- */
// Nominatim (usage policy: max 1 req/s, no autocomplete) is used only for explicit searches.
// Photon (komoot) powers the debounced type-ahead suggestions.
let lastNominatim = 0; const geoCache = new Map();
async function nominatim(q) {
  const key = 'n:' + q.toLowerCase(); if (geoCache.has(key)) return geoCache.get(key);
  const wait = 1100 - (Date.now() - lastNominatim); if (wait > 0) await sleep(wait); lastNominatim = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=10&dedupe=1&accept-language=en&q=${encodeURIComponent(q)}`;
  const data = await fetchJSON(url, {referrerPolicy: 'strict-origin-when-cross-origin'});
  const out = data.map(r => {
    const a = r.address || {};
    const region = [a.county || a.state_district, a.state || a.region, a.country].filter(Boolean);
    const type = r.addresstype || r.type;
    const bb = r.boundingbox ? r.boundingbox.map(Number) : null;
    const bigArea = bb && (bb[1] - bb[0] > 0.03 || bb[3] - bb[2] > 0.03) && r.place_rank <= 16 && !['village','town','hamlet','suburb','neighbourhood','isolated_dwelling'].includes(type);
    return { id: r.osm_type + r.osm_id, name: r.name || r.display_name.split(',')[0], sub: [...new Set(region)].join(', ') || r.display_name, full: r.display_name,
      lat: +r.lat, lon: +r.lon, type, cls: r.category, rank: r.place_rank, cc: a.country_code, country: a.country,
      population: r.extratags?.population ? parseInt(String(r.extratags.population).replace(/\D/g, '')) || null : null,
      bbox: bigArea ? [[bb[0], bb[2]], [bb[1], bb[3]]] : null };
  });
  const dedup = [];
  for (const r of out) { const dup = dedup.find(x => x.name === r.name && x.sub === r.sub && (x.type === r.type || x.cls === "boundary" || r.cls === "boundary") && Math.abs(x.lat - r.lat) < 0.15 && Math.abs(x.lon - r.lon) < 0.25); if (dup) { if (!dup.population && r.population) dup.population = r.population; continue; } dedup.push(r); }
  geoCache.set(key, dedup); return dedup;
}
async function photon(q) {
  const key = 'p:' + q.toLowerCase(); if (geoCache.has(key)) return geoCache.get(key);
  const data = await fetchJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`, {}, 8000);
  const out = data.features.map(f => { const p = f.properties; const [lon, lat] = f.geometry.coordinates;
    return { id: p.osm_type + p.osm_id, name: p.name || p.street || p.city, sub: [p.county, p.state, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '),
      lat, lon, type: p.osm_value, cls: p.osm_key, cc: (p.countrycode || '').toLowerCase(), country: p.country, rank: p.osm_key === 'place' ? ({city: 16, town: 18, village: 19, hamlet: 20}[p.osm_value] || 18) : 26,
      bbox: p.extent && p.osm_key === 'place' && ['city','town','county','state','region'].includes(p.osm_value) ? [[p.extent[3], p.extent[0]], [p.extent[1], p.extent[2]]] : null };
  });
  geoCache.set(key, out); return out;
}
const typeLabel = t => String(t || 'place').replace(/_/g, ' ');
function resultHTML(r, i) {
  const small = SMALL_TYPES.has(r.type);
  return `<div class="result press" data-i="${i}"><div class="flag">${flag(r.cc)}</div><div class="grow"><div class="t">${esc(r.name)}</div><div class="s"><span class="kind">${esc(typeLabel(r.type))}</span> · ${esc(r.sub)}</div></div>
  <button class="icon-btn add" title="Add to trip" aria-label="Add to trip">＋</button></div>`;
}
function paintResults(res, head = '') {
  const box = $('#results');
  box.innerHTML = head + `<div class="stack">${res.map(resultHTML).join('')}</div>`;
  stagger($('.stack', box));
  $$('.result', box).forEach(el => { const r = res[+el.dataset.i];
    el.onclick = e => { if (e.target.closest('.add')) return; $$('.result', box).forEach(x => x.classList.remove('sel')); el.classList.add('sel'); showPlace(r); };
    $('.add', el).onclick = () => addToTripPicker(r);
  });
}
async function runSearch(q) {
  q = q.trim(); if (!q) return;
  hideSuggest();
  const box = $('#results'); box.innerHTML = skeleton(4, 78); $('#searchHint').classList.add('hidden');
  try {
    let res = await nominatim(q);
    if (!res.length) res = await photon(q);
    if (!res.length) { box.innerHTML = `<div class="empty"><div class="big">🧭</div>No places found for “${esc(q)}”. Check the spelling or add the country, e.g. “Perth, Scotland”.</div>`; return; }
    paintResults(res, res.length > 1 ? `<div class="meta" style="margin:2px 2px 6px">${res.length} matches – pick the right one:</div>` : '');
    if (res.length === 1) showPlace(res[0]);
    return res;
  } catch (e) {
    box.innerHTML = `<div class="empty"><div class="big">📡</div>${navigator.onLine ? 'Search service is busy – please try again in a moment.' : 'You are offline – search needs a connection. Your saved trips and downloaded maps still work.'}</div>`;
  }
}
let sugT, sugSeq = 0, sugItems = [], sugIdx = -1;
const hideSuggest = () => { $('#suggestions').classList.add('hidden'); sugItems = []; sugIdx = -1; };
$('#searchInput').addEventListener('input', e => {
  clearTimeout(sugT); const q = e.target.value.trim();
  if (q.length < 3 || !navigator.onLine) return hideSuggest();
  sugT = setTimeout(async () => {
    const seq = ++sugSeq;
    try { const res = await photon(q); if (seq !== sugSeq || $('#searchInput').value.trim() !== q) return;
      sugItems = res; sugIdx = -1; const ul = $('#suggestions');
      if (!res.length) return hideSuggest();
      ul.innerHTML = res.map((r, i) => `<li data-i="${i}">${flag(r.cc)} <b>${esc(r.name)}</b> <span class="badge">${esc(typeLabel(r.type))}</span><small>${esc(r.sub)}</small></li>`).join('');
      ul.classList.remove('hidden'); stagger(ul);
      $$('li', ul).forEach(li => li.onmousedown = ev => { ev.preventDefault(); pickSuggestion(+li.dataset.i); });
    } catch {}
  }, 400);
});
function pickSuggestion(i) { const r = sugItems[i]; if (!r) return; hideSuggest(); $('#searchInput').value = r.name; $('#searchHint').classList.add('hidden'); paintResults([r]); showPlace(r); }
$('#searchInput').addEventListener('keydown', e => {
  const ul = $('#suggestions'); if (ul.classList.contains('hidden')) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length; $$('li', ul).forEach((li, i) => li.classList.toggle('active', i === sugIdx)); }
  else if (e.key === 'Enter' && sugIdx >= 0) { e.preventDefault(); pickSuggestion(sugIdx); }
  else if (e.key === 'Escape') hideSuggest();
});
$('#searchInput').addEventListener('blur', () => setTimeout(hideSuggest, 150));
$('#searchForm').onsubmit = e => { e.preventDefault(); clearTimeout(sugT); sugSeq++; $('#searchInput').blur(); runSearch($('#searchInput').value); };
$$('#searchHint [data-q]').forEach(a => a.onclick = e => { e.preventDefault(); $('#searchInput').value = a.dataset.q; runSearch(a.dataset.q); });

/* ---------------- Low-signal heuristic ---------------- */
async function overpass(query, timeout = 20000) {
  let err;
  for (const ep of OVERPASS) { try { return await fetchJSON(ep, {method: 'POST', body: 'data=' + encodeURIComponent(query), headers: {'Content-Type': 'application/x-www-form-urlencoded'}}, timeout); } catch (e) { err = e; } }
  throw err;
}
async function assessConnectivity(d) {
  const reasons = []; let score = 0;
  const big = d.type === 'city' || (d.population && d.population > 50000);
  const region = LOW_SIGNAL_REGIONS.find(([, s, w, n, e]) => d.lat >= s && d.lat <= n && d.lon >= w && d.lon <= e);
  if (region && !big) { score += 2; reasons.push(`It's in ${region[0]}, known for patchy mobile coverage`); }
  if (SMALL_TYPES.has(d.type)) { score += 1; reasons.push(`It's a ${typeLabel(d.type)} – small places often have weak signal`); }
  if (d.population && d.population < 1500) { score += 1; reasons.push(`Small population (${d.population.toLocaleString()})`); }
  try {
    const res = await overpass(`[out:json][timeout:15];node[place~"^(city|town)$"](around:25000,${d.lat},${d.lon});out tags 40;`, 18000);
    const towns = res.elements.filter(e => e.tags?.place === 'town').length, cities = res.elements.filter(e => e.tags?.place === 'city').length;
    if (!towns && !cities) { score += 2; reasons.push('No town or city within 25 km'); }
    else if (!cities && towns <= 1 && SMALL_TYPES.has(d.type)) { score += 1; reasons.push('Only one small town within 25 km'); }
    d.nearbyTowns = {towns, cities};
  } catch { /* Overpass unavailable – rely on the other signals */ }
  if (big) score = Math.min(score, 1);
  d.connectivity = {low: score >= 2, score, reasons, checked: Date.now()};
  return d.connectivity;
}

/* ---------------- Trips: list & editor ---------------- */
const state = {tab: 'explore', view: 'list', tripId: null, tripTab: 'plan', nearbyFilter: 'all', nearbyDest: null};
function tripDays(t) {
  if (t.start && t.end) { const out = []; const d = new Date(t.start + 'T12:00:00'); const e = new Date(t.end + 'T12:00:00'); while (d <= e && out.length < 60) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return out; }
  return Array.from({length: t.dayCount}, () => null);
}
const tripLow = t => t.destinations.filter(d => d.connectivity?.low);
const isDownloaded = t => !!(t.offline && t.offline.ok && t.offline.destKey === t.destinations.map(d => d.id).join(','));
function setMainTab(tab) {
  state.tab = tab;
  $$('.tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  moveIndicator($('.tabs'));
  ['explore', 'trips'].forEach(n => { const el = $('#tab-' + n); el.classList.toggle('hidden', n !== tab); if (n === tab) { el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in'); } });
  if (tab === 'trips') renderTrips(true); else { layers.trip.clearLayers(); layers.nearby.clearLayers(); }
  expandSheet();
}
$$('.tabs .tab').forEach(b => b.onclick = () => setMainTab(b.dataset.tab));

function renderTrips(fit) {
  if (state.view === 'trip' && getTrip(state.tripId)) return renderTrip(fit);
  state.view = 'list'; $('#tripDetail').classList.add('hidden'); const L_ = $('#tripList'); L_.classList.remove('hidden');
  layers.nearby.clearLayers(); drawTripsOverview(fit);
  const warn = trips.filter(t => tripLow(t).length && !isDownloaded(t));
  L_.innerHTML = `<div class="row between" style="margin:4px 0 10px"><h2 class="screen-title">Trips</h2><button class="icon-btn accent" id="newTrip" title="New trip" aria-label="New trip">＋</button></div>
  
  <div class="stack" id="tripCards">${trips.length ? trips.map(t => {
    const low = tripLow(t).length, dl = isDownloaded(t);
    return `<div class="card trip-card press" data-id="${t.id}"><div class="row between"><h3>${esc(t.name)}</h3><span class="chev">›</span></div>
      <div class="meta">${t.start ? `${fmtDate(t.start)} – ${fmtDate(t.end)}` : `${t.dayCount} days`} · ${t.destinations.length} stop${t.destinations.length === 1 ? '' : 's'}${low && !dl ? ' · <span class="warn-t">needs download</span>' : dl ? ' · offline ✓' : ''}</div></div>`;
  }).join('') : `<div class="empty"><div class="big">🗺️</div>No trips yet</div>`}</div>`;
  stagger($('#tripCards'));
  $('#newTrip').onclick = () => tripForm();
  $$('.trip-card', L_).forEach(c => c.onclick = () => openTrip(c.dataset.id));
}
function drawTripsOverview(fit) {
  layers.trip.clearLayers(); const pts = [];
  trips.forEach(t => t.destinations.forEach(d => { pts.push([d.lat, d.lon]); L.marker([d.lat, d.lon], {icon: pinIcon('', d.connectivity?.low ? 'warn' : '')}).addTo(layers.trip).bindPopup(`<div class="t">${esc(d.name)}</div><div class="s">${esc(t.name)}</div>`); }));
  if (fit && pts.length) reduceMotion ? map.fitBounds(pts, fitPad({maxZoom: 12})) : map.flyToBounds(pts, fitPad({maxZoom: 12, duration: 1.1}));
}
function openTrip(id) { state.view = 'trip'; state.tripId = id; state.tripTab = 'plan'; renderTrip(true); }
function tripForm(t) {
  const isNew = !t; t = t || {name: '', start: '', end: '', currency: 'GBP', budget: 0, dayCount: 3};
  modal(`<h3>${isNew ? 'New trip' : 'Edit trip'}</h3>
    <label class="field">Trip name<input id="fName" value="${esc(t.name)}" placeholder="e.g. Highlands road trip"></label>
    <div class="row"><label class="field" style="flex:1">Start<input id="fStart" type="date" value="${esc(t.start)}"></label><label class="field" style="flex:1">End<input id="fEnd" type="date" value="${esc(t.end)}"></label></div>
    <label class="field">Days (if no dates yet)<input id="fDays" type="number" min="1" max="60" value="${t.dayCount}"></label>
    <div class="row"><label class="field" style="flex:1">Currency<select id="fCur">${CURRENCIES.map(c => `<option ${c === t.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="field" style="flex:1">Budget<input id="fBudget" type="number" min="0" step="1" value="${t.budget || ''}" placeholder="0"></label></div>
    <div class="row between" style="margin-top:6px">${isNew ? '<span></span>' : '<button class="btn danger ghost" id="fDel">Delete trip</button>'}<div class="row"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="fSave">${isNew ? 'Create trip' : 'Save'}</button></div></div>`,
  (c, close) => {
    $('#fSave', c).onclick = () => {
      const nameEl = $('#fName', c), name = nameEl.value.trim();
      if (!name) { nameEl.classList.remove('shake'); void nameEl.offsetWidth; nameEl.classList.add('shake'); nameEl.focus(); return; }
      let start = $('#fStart', c).value, end = $('#fEnd', c).value; if (start && !end) end = start; if (end && !start) start = end; if (start && end < start) [start, end] = [end, start];
      const upd = {name, start, end, dayCount: Math.max(1, Math.min(60, +$('#fDays', c).value || 3)), currency: $('#fCur', c).value, budget: +$('#fBudget', c).value || 0};
      if (isNew) {
        const nt = normTrip({id: uid(), created: Date.now(), ...upd}); trips.unshift(nt); saveTrips(); close();
        state.view = 'trip'; state.tripId = nt.id; state.tripTab = 'plan';
        if (state.tab !== 'trips') setMainTab('trips'); else renderTrip(true);
        if (pendingAdd) { const p = pendingAdd; pendingAdd = null; addDestination(nt, p); } else toast('Trip created');
      } else { Object.assign(t, upd); saveTrips(); close(); renderTrip(); toast('Trip saved'); }
    };
    const del = $('#fDel', c); del && (del.onclick = async () => { if (!confirm(`Delete “${t.name}”? This can't be undone.`)) return; for (const tk of t.tickets) for (const f of tk.files || []) await idb.del(f.id).catch(() => {}); trips = trips.filter(x => x.id !== t.id); saveTrips(); close(); state.view = 'list'; renderTrips(); toast('Trip deleted'); });
  });
}
let pendingAdd = null;
function addToTripPicker(p) {
  if (!trips.length) { pendingAdd = p; return tripForm(); }
  modal(`<h3>Add ${esc(p.name)} to…</h3><div class="stack" id="pick">${trips.map(t => `<button class="card trip-card press pick" data-id="${t.id}" style="width:100%;text-align:left"><b>${esc(t.name)}</b><div class="meta">${t.destinations.length} stops</div></button>`).join('')}</div>
    <div class="row between"><button class="btn" id="pickNew">＋ New trip</button><button class="btn ghost" data-close>Cancel</button></div>`, (c, close) => {
    stagger($('#pick', c));
    $$('.pick', c).forEach(b => b.onclick = () => { close(); addDestination(getTrip(b.dataset.id), p); });
    $('#pickNew', c).onclick = () => { pendingAdd = p; close(); setTimeout(() => tripForm(), 220); };
  });
}
async function addDestination(t, p) {
  if (t.destinations.some(d => Math.abs(d.lat - p.lat) < 1e-5 && Math.abs(d.lon - p.lon) < 1e-5)) return toast('Already in this trip');
  const d = {id: uid(), name: p.name, sub: p.sub, lat: p.lat, lon: p.lon, type: p.type, cc: p.cc, country: p.country, population: p.population || null};
  t.destinations.push(d); saveTrips(); toast(`Added ${p.name} to ${t.name} – checking signal…`);
  state.view = 'trip'; state.tripId = t.id; state.tripTab = 'plan';
  if (state.tab !== 'trips') setMainTab('trips'); else renderTrip(true);
  await assessConnectivity(d); saveTrips();
  if (state.view === 'trip' && state.tripId === t.id) renderTrip();
  if (d.connectivity.low) toast(`📶 ${d.name} may have poor signal – download the trip for offline use`, 4500);
}

/* ---------------- Trip detail ---------------- */
const TRIP_TABS = [['plan', 'Plan'], ['packing', 'Packing'], ['budget', 'Budget'], ['weather', 'Weather'], ['nearby', 'Nearby'], ['tickets', 'Tickets']];
function renderTrip(animate) {
  const t = getTrip(state.tripId); if (!t) { state.view = 'list'; return renderTrips(); }
  $('#tripList').classList.add('hidden'); const el = $('#tripDetail'); el.classList.remove('hidden');
  const low = tripLow(t), dl = isDownloaded(t);
  el.innerHTML = `<div class="trip-head"><button class="icon-btn" id="back" aria-label="Back to trips">‹</button><div class="grow"><h2 class="trip-title">${esc(t.name)}</h2><div class="meta">${t.start ? `${fmtDate(t.start)} – ${fmtDate(t.end)}` : `${t.dayCount} days`}${dl ? ' · offline ✓' : ''}</div></div>
      <div class="menu-wrap"><button class="icon-btn" id="tripMenu" aria-label="Trip options">⋯</button><div class="menu hidden" id="tripMenuList"><button id="dlTrip">${dl ? 'Update offline copy' : 'Download for offline'}</button><button id="editTrip">Edit trip</button><button id="delTrip" class="danger-t">Delete trip</button></div></div></div>
    <div id="dlProgress" class="hidden"><div class="progress"><div></div></div><div class="meta" id="dlText" style="margin-top:4px"></div></div>
    ${low.length && !dl ? `<div class="lowsig pop-in" id="lowSig"><h4>Low signal expected</h4><p>${low.map(d => esc(d.name)).join(', ')} ${low.length === 1 ? 'looks' : 'look'} remote. Save the trip so it works without signal.</p>
      <div class="row"><button class="btn primary sm" id="dlAll">Download everything</button><details><summary>Why?</summary><ul>${[...new Set(low.flatMap(d => d.connectivity.reasons))].slice(0, 4).map(r => `<li>${esc(r)}</li>`).join('')}</ul></details></div></div>` : ''}
    <div class="subtabs" id="subtabs">${TRIP_TABS.map(([k, l]) => `<button class="subtab ${k === state.tripTab ? 'active' : ''}" data-k="${k}">${l}</button>`).join('')}<span class="ind"></span></div>
    <div id="tripBody"></div>`;
  if (animate) { el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in'); }
  $('#back').onclick = () => { state.view = 'list'; renderTrips(true); const L_ = $('#tripList'); L_.classList.remove('view-back'); void L_.offsetWidth; L_.classList.add('view-back'); };
  const menu = $('#tripMenuList'), closeMenu = () => menu.classList.add('hidden');
  $('#tripMenu').onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); if (!menu.classList.contains('hidden')) setTimeout(() => document.addEventListener('click', closeMenu, {once: true}), 0); };
  $('#editTrip').onclick = () => { closeMenu(); tripForm(t); };
  $('#dlTrip').onclick = () => { closeMenu(); downloadTrip(t); };
  $('#delTrip').onclick = async () => { closeMenu(); if (!confirm(`Delete “${t.name}”? This can't be undone.`)) return; for (const tk of t.tickets) for (const f of tk.files || []) await idb.del(f.id).catch(() => {}); trips = trips.filter(x => x.id !== t.id); saveTrips(); state.view = 'list'; renderTrips(true); toast('Trip deleted'); };
  const da = $('#dlAll'); da && (da.onclick = () => downloadTrip(t));
  $$('#subtabs .subtab').forEach(b => b.onclick = () => { state.tripTab = b.dataset.k; $$('#subtabs .subtab').forEach(x => x.classList.toggle('active', x === b)); moveIndicator($('#subtabs')); b.scrollIntoView({inline: 'center', block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth'}); renderTripBody(t); });
  requestAnimationFrame(() => moveIndicator($('#subtabs')));
  drawTrip(t, animate); renderTripBody(t);
}
function drawTrip(t, fit) {
  layers.trip.clearLayers(); if (state.tripTab !== 'nearby') layers.nearby.clearLayers();
  const pts = t.destinations.map(d => [d.lat, d.lon]);
  if (pts.length > 1) L.polyline(pts, {color: '#2dd4bf', weight: 3, opacity: .7, dashArray: '6 8', className: 'route'}).addTo(layers.trip);
  t.destinations.forEach((d, i) => L.marker([d.lat, d.lon], {icon: pinIcon(i + 1, d.connectivity?.low ? 'warn' : '')}).addTo(layers.trip).bindPopup(`<div class="t">${flag(d.cc)} ${esc(d.name)}</div><div class="s">${esc(d.sub || '')}</div>${d.connectivity?.low ? '<div class="s" style="color:#f5b84a">📶 Low signal likely</div>' : ''}`));
  if (fit && pts.length) { pts.length === 1 ? flyTo(pts[0][0], pts[0][1], 12) : (reduceMotion ? map.fitBounds(pts, fitPad({})) : map.flyToBounds(pts, fitPad({duration: 1.2}))); }
}
function renderTripBody(t) {
  const body = $('#tripBody'); body.classList.remove('fade-in'); void body.offsetWidth; body.classList.add('fade-in');
  if (state.tripTab !== 'nearby') layers.nearby.clearLayers();
  ({plan: renderPlan, packing: renderPacking, budget: renderBudget, weather: renderWeather, nearby: renderNearby, tickets: renderTickets})[state.tripTab](t, body);
}

/* Plan: destinations + day-by-day itinerary */
function renderPlan(t, body) {
  const days = tripDays(t);
  while (t.days.length < days.length) t.days.push([]);
  body.innerHTML = `<div class="section-title">Destinations</div>
  <div class="stack" id="destList">${t.destinations.length ? t.destinations.map((d, i) => `<div class="dest press" data-id="${d.id}"><div class="num">${i + 1}</div><div class="grow"><div class="name">${flag(d.cc)} ${esc(d.name)}</div><div class="meta">${esc(typeLabel(d.type))}${d.connectivity?.low ? ' · <span class="warn-t">weak signal likely</span>' : ''}</div></div>
    <button class="x rm" title="Remove" aria-label="Remove">✕</button></div>`).join('') : `<div class="empty" style="padding:16px">No stops yet · <a href="#" id="goExplore">add a place</a></div>`}</div>
  ${t.destinations.length ? '<button class="link-btn" id="addMore">＋ Add a place</button>' : ''}
  <div class="section-title">Itinerary</div><div class="stack" id="days">${days.map((date, di) => `<div class="day" data-d="${di}"><h5><span>Day ${di + 1}${date ? ` · <span class="meta">${fmtDate(date)}</span>` : ''}</span></h5>
    ${(t.days[di] || []).slice().sort((a, b) => (a.time || '99').localeCompare(b.time || '99')).map(it => `<div class="item" data-id="${it.id}"><span class="time">${esc(it.time || '—')}</span><span class="txt">${esc(it.text)}</span><button class="x" title="Delete">✕</button></div>`).join('')}
    <form class="add-item"><input type="time" aria-label="Time"><input type="text" placeholder="Add plan, e.g. Ferry to Mull" aria-label="Plan"><button class="btn sm primary">＋</button></form></div>`).join('')}</div>`;
  stagger($('#destList')); stagger($('#days'));
  const goEx = () => { setMainTab('explore'); setTimeout(() => $('#searchInput').focus(), 50); };
  const ge = $('#goExplore', body); ge && (ge.onclick = e => { e.preventDefault(); goEx(); });
  const am = $('#addMore', body); am && (am.onclick = goEx);
  $$('.dest', body).forEach(el => { const id = el.dataset.id, i = t.destinations.findIndex(d => d.id === id), d = t.destinations[i];
    el.onclick = e => { if (e.target.closest('button')) return; collapseSheetOnMobile(); flyTo(d.lat, d.lon, 14); };
    $('.rm', el).onclick = () => { el.classList.add('leave'); setTimeout(() => { t.destinations.splice(i, 1); delete t.cache.weather[id]; delete t.cache.nearby[id]; saveTrips(); renderTrip(); }, reduceMotion ? 0 : 220); };
  });
  $$('.day', body).forEach(dEl => { const di = +dEl.dataset.d;
    $('form', dEl).onsubmit = e => { e.preventDefault(); const [tm, tx] = $$('input', e.target); if (!tx.value.trim()) return; (t.days[di] ||= []).push({id: uid(), time: tm.value, text: tx.value.trim()}); saveTrips(); renderTripBody(t); setTimeout(() => $(`.day[data-d="${di}"] input[type=text]`)?.focus(), 0); };
    $$('.item', dEl).forEach(it => $('.x', it).onclick = () => { it.classList.add('leave'); setTimeout(() => { t.days[di] = t.days[di].filter(x => x.id !== it.dataset.id); saveTrips(); renderTripBody(t); }, reduceMotion ? 0 : 200); });
  });
}

/* Packing list */
const PACK_SUGGEST = ['Passport / ID', 'Phone charger', 'Power bank', 'Travel adapter', 'Toothbrush', 'Medication', 'Rain jacket', 'Walking shoes', 'Sunglasses', 'Snacks & water'];
function renderPacking(t, body) {
  const counts = () => { const done = t.packing.filter(p => p.done).length, tot = t.packing.length; return {done, tot, f: tot ? done / tot : 0}; };
  const c0 = counts();
  body.innerHTML = `<div class="card"><div class="row between"><b id="pkCount">${c0.done}/${c0.tot} packed</b><span class="meta" id="pkPct">${Math.round(c0.f * 100)}%</span></div><div class="bar"><div id="pkBar"></div></div></div>
  <form class="add-item" id="packForm"><input type="text" id="packIn" placeholder="Add item, e.g. Hiking boots" aria-label="Packing item"><button class="btn sm primary">＋ Add</button></form>
  <div class="stack" id="packList" style="margin-top:10px">${t.packing.map(p => `<label class="check-row ${p.done ? 'done' : ''}" data-id="${p.id}"><input type="checkbox" ${p.done ? 'checked' : ''}><span class="cb"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="txt">${esc(p.text)}</span><button class="x" title="Remove" type="button">✕</button></label>`).join('')}</div>
  ${c0.tot < 6 ? `<div class="section-title">Quick add</div><div class="chips" id="packSug">${PACK_SUGGEST.filter(s => !t.packing.some(p => p.text === s)).map(s => `<button class="chip press">${esc(s)}</button>`).join('')}</div>` : ''}
  ${c0.tot ? '<div class="row" style="margin-top:12px"><button class="btn sm ghost" id="packReset">Untick all</button></div>' : ''}`;
  stagger($('#packList'));
  const bar = $('#pkBar'); bar.style.transform = `scaleX(${renderPacking.prev ?? 0})`;
  const upd = () => { const c = counts(); $('#pkCount').textContent = `${c.done}/${c.tot} packed`; $('#pkPct').textContent = `${Math.round(c.f * 100)}%`; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = `scaleX(${c.f})`; })); renderPacking.prev = c.f; bar.parentElement.classList.toggle('complete', c.tot > 0 && c.f === 1); };
  upd();
  const add = txt => { t.packing.push({id: uid(), text: txt, done: false}); saveTrips(); renderPacking(t, body); };
  $('#packForm').onsubmit = e => { e.preventDefault(); const v = $('#packIn').value.trim(); if (v) { add(v); setTimeout(() => $('#packIn')?.focus(), 0); } };
  $$('#packSug .chip').forEach(c => c.onclick = () => add(c.textContent));
  $$('.check-row', body).forEach(r => { const p = t.packing.find(x => x.id === r.dataset.id);
    $('input', r).onchange = e => { p.done = e.target.checked; r.classList.toggle('done', p.done); saveTrips(); upd(); };
    $('.x', r).onclick = e => { e.preventDefault(); r.classList.add('leave'); setTimeout(() => { t.packing = t.packing.filter(x => x.id !== p.id); saveTrips(); renderPacking(t, body); }, reduceMotion ? 0 : 200); };
  });
  const rs = $('#packReset'); rs && (rs.onclick = () => { t.packing.forEach(p => p.done = false); saveTrips(); renderPacking(t, body); });
}

/* Currency rates (cached for offline) */
async function getRates(force) {
  let r = store.get('rates', null);
  if (r && !force && Date.now() - r.fetchedAt < 6 * 3600e3) return r;
  if (!navigator.onLine) return r;
  try {
    const d = await fetchJSON('https://open.er-api.com/v6/latest/EUR', {}, 10000);
    if (d.result !== 'success') throw 0;
    r = {base: 'EUR', rates: d.rates, date: (d.time_last_update_utc || '').slice(5, 16), source: 'open.er-api.com', fetchedAt: Date.now()};
  } catch {
    try { const d = await fetchJSON('https://api.frankfurter.dev/v1/latest?base=EUR', {}, 10000); r = {base: 'EUR', rates: {...d.rates, EUR: 1}, date: d.date, source: 'Frankfurter (ECB)', fetchedAt: Date.now()}; }
    catch { return r; }
  }
  store.set('rates', r); return r;
}
const convert = (amt, from, to, r) => from === to ? amt : (!r || !r.rates[from] || !r.rates[to]) ? null : amt / r.rates[from] * r.rates[to];
const money = (v, cur) => { try { return new Intl.NumberFormat(undefined, {style: 'currency', currency: cur, maximumFractionDigits: 2}).format(v); } catch { return `${v.toFixed(2)} ${cur}`; } };

/* Budget & expenses + converter */
async function renderBudget(t, body) {
  body.innerHTML = skeleton(3, 70);
  const rates = await getRates();
  if (state.tripTab !== 'budget' || state.tripId !== t.id) return;
  const inTrip = e => convert(e.amount, e.currency, t.currency, rates);
  let total = 0; const byCat = {};
  t.expenses.forEach(e => { const v = inTrip(e) ?? 0; total += v; byCat[e.category] = (byCat[e.category] || 0) + v; });
  const pct = t.budget ? total / t.budget : 0, over = t.budget && total > t.budget;
  const maxCat = Math.max(1e-9, ...Object.values(byCat));
  const lastCur = store.get('lastCur', t.currency);
  body.innerHTML = `<div class="card budget-card"><div class="row between"><div><div class="meta">Spent</div><div class="big-num">${money(total, t.currency)}</div></div>
    <div style="text-align:right"><div class="meta">Budget (${t.currency})</div><input id="budgetIn" class="mini-in" type="number" min="0" value="${t.budget || ''}" placeholder="Set budget"></div></div>
    <div class="bar ${over ? 'over' : ''}"><div data-to="${Math.min(1, pct)}"></div></div>
    <div class="meta" style="margin-top:6px">${t.budget ? (over ? `<span style="color:var(--danger)">Over budget by ${money(total - t.budget, t.currency)}</span>` : `${money(t.budget - total, t.currency)} left · ${Math.round(pct * 100)}% used`) : 'Set a budget to track what’s left'}</div></div>
  ${Object.keys(byCat).length ? `<div class="section-title">By category</div><div class="card stack" id="cats">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><div class="row between"><span>${EXP_CATS[k] || k}</span><b>${money(v, t.currency)}</b></div><div class="bar thin"><div data-to="${v / maxCat}"></div></div></div>`).join('')}</div>` : ''}
  <div class="section-title">Log expense</div>
  <form class="card exp-form" id="expForm"><div class="row"><input id="eAmt" type="number" step="0.01" min="0" placeholder="Amount" style="flex:1" aria-label="Amount"><select id="eCur" aria-label="Currency">${CURRENCIES.map(c => `<option ${c === lastCur ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="row"><select id="eCat" style="flex:1" aria-label="Category">${Object.entries(EXP_CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input id="eDate" type="date" value="${today()}" style="flex:1" aria-label="Date"></div>
    <div class="row"><input id="eNote" placeholder="Note (optional)" style="flex:1" aria-label="Note"><button class="btn primary">＋ Add</button></div></form>
  <div class="stack" id="expList">${t.expenses.slice().reverse().map(e => { const c = inTrip(e); return `<div class="exp-row" data-id="${e.id}"><span class="cat">${(EXP_CATS[e.category] || '📦').split(' ')[0]}</span><div class="grow"><b>${esc(e.note || (EXP_CATS[e.category] || 'Other').split(' ').slice(1).join(' '))}</b><div class="meta">${fmtDate(e.date)}${e.currency !== t.currency ? ` · ${money(e.amount, e.currency)}` : ''}</div></div><b>${money(c ?? e.amount, c != null ? t.currency : e.currency)}</b><button class="x" title="Delete">✕</button></div>`; }).join('')}</div>
  <div class="section-title">Currency converter</div>
  <div class="card conv"><div class="row"><input id="cAmt" type="number" value="100" min="0" step="any" style="flex:1;min-width:70px" aria-label="Amount to convert"><select id="cFrom" aria-label="From">${CURRENCIES.map(c => `<option ${c === t.currency ? 'selected' : ''}>${c}</option>`).join('')}</select><button class="icon-btn" id="cSwap" title="Swap">⇄</button><select id="cTo" aria-label="To">${CURRENCIES.map(c => `<option ${c === (t.currency === 'EUR' ? 'GBP' : 'EUR') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="conv-out" id="cOut">–</div><div class="meta">${rates ? `Rates ${esc(rates.date || '')} · ${esc(rates.source)}${Date.now() - rates.fetchedAt > 864e5 ? ' · offline copy' : ''}` : 'Rates unavailable offline – connect once to save them.'} · <a href="#" id="cRefresh">Refresh</a></div></div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.bar > div[data-to]', body).forEach(b => b.style.transform = `scaleX(${b.dataset.to})`)));
  stagger($('#expList'));
  $('#budgetIn').onchange = e => { t.budget = +e.target.value || 0; saveTrips(); renderBudget(t, body); };
  $('#expForm').onsubmit = e => { e.preventDefault(); const amount = +$('#eAmt').value; if (!(amount > 0)) { const a = $('#eAmt'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); return; } const cur = $('#eCur').value; store.set('lastCur', cur);
    t.expenses.push({id: uid(), amount, currency: cur, category: $('#eCat').value, date: $('#eDate').value, note: $('#eNote').value.trim()}); saveTrips(); renderBudget(t, body); toast('Expense added'); };
  $$('.exp-row', body).forEach(r => $('.x', r).onclick = () => { r.classList.add('leave'); setTimeout(() => { t.expenses = t.expenses.filter(x => x.id !== r.dataset.id); saveTrips(); renderBudget(t, body); }, reduceMotion ? 0 : 200); });
  const conv = () => { const a = +$('#cAmt').value || 0, v = convert(a, $('#cFrom').value, $('#cTo').value, rates); const o = $('#cOut'); o.textContent = v == null ? 'No rate available' : `${money(a, $('#cFrom').value)} = ${money(v, $('#cTo').value)}`; o.classList.remove('pulse'); void o.offsetWidth; o.classList.add('pulse'); };
  ['cAmt', 'cFrom', 'cTo'].forEach(id => $('#' + id).addEventListener('input', conv));
  $('#cSwap').onclick = () => { const a = $('#cFrom').value; $('#cFrom').value = $('#cTo').value; $('#cTo').value = a; conv(); };
  $('#cRefresh').onclick = async e => { e.preventDefault(); const r = await getRates(true); toast(r && Date.now() - r.fetchedAt < 6e4 ? 'Rates updated' : 'Could not refresh – using saved rates'); renderBudget(t, body); };
  conv();
}

/* Weather (Open-Meteo, no key) */
async function fetchWeather(d) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${d.lat.toFixed(4)}&longitude=${d.lon.toFixed(4)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto&forecast_days=16`;
  return {at: Date.now(), data: await fetchJSON(url, {}, 12000)};
}
async function renderWeather(t, body) {
  if (!t.destinations.length) { body.innerHTML = `<div class="empty"><div class="big">🌦️</div>Add a destination to see its forecast.</div>`; return; }
  body.innerHTML = `<div class="stack" id="wxList">${t.destinations.map(d => `<div class="card wx" data-id="${d.id}"><div class="row between"><b>${flag(d.cc)} ${esc(d.name)}</b><span class="meta wx-age"></span></div><div class="wx-body">${skeleton(1, 96)}</div></div>`).join('')}</div><div class="meta" style="margin-top:4px">Forecasts by Open-Meteo.com</div>`;
  stagger($('#wxList'));
  await Promise.all(t.destinations.map(async d => {
    let w = t.cache.weather[d.id];
    if ((!w || Date.now() - w.at > 3 * 3600e3) && navigator.onLine) { try { w = await fetchWeather(d); t.cache.weather[d.id] = w; saveTrips(); } catch {} }
    const card = $(`.wx[data-id="${d.id}"]`, body); if (!card) return;
    if (!w) { $('.wx-body', card).innerHTML = '<div class="meta">Forecast unavailable offline. Download the trip while online to save it.</div>'; return; }
    const D = w.data.daily, cur = w.data.current;
    const all = D.time.map((x, i) => i), idx = t.start ? all.filter(i => D.time[i] >= t.start && D.time[i] <= t.end) : [];
    const show = idx.length ? idx : all.filter(i => D.time[i] >= today()).slice(0, 7);
    $('.wx-age', card).textContent = Date.now() - w.at > 6 * 3600e3 ? `saved ${new Date(w.at).toLocaleDateString()}` : 'live';
    $('.wx-body', card).innerHTML = `${cur ? `<div class="wx-now"><span class="wx-ico">${(WMO[cur.weather_code] || ['🌡️'])[0]}</span><span class="big-num">${Math.round(cur.temperature_2m)}°</span><span class="meta">${(WMO[cur.weather_code] || ['', ''])[1]} · wind ${Math.round(cur.wind_speed_10m)} km/h</span></div>` : ''}
      ${!idx.length && t.start ? `<div class="meta" style="margin:6px 0">Trip dates are outside the 16-day forecast – showing the next 7 days.</div>` : ''}
      <div class="wx-days">${show.map(i => `<div class="wx-day"><div class="meta">${new Date(D.time[i] + 'T12:00').toLocaleDateString(undefined, {weekday: 'short', day: 'numeric'})}</div><div class="wx-ico">${(WMO[D.weather_code[i]] || ['🌡️'])[0]}</div><div><b>${Math.round(D.temperature_2m_max[i])}°</b> <span class="meta">${Math.round(D.temperature_2m_min[i])}°</span></div><div class="meta">💧${D.precipitation_probability_max[i] ?? '–'}%</div></div>`).join('')}</div>`;
    stagger($('.wx-days', card));
  }));
}

/* Nearby things to do & food (Overpass) */
const POI = { attraction: '⭐', museum: '🏛️', viewpoint: '🔭', gallery: '🖼️', zoo: '🦁', theme_park: '🎢', castle: '🏰', monument: '🗿', ruins: '🏚️',
  restaurant: '🍽️', cafe: '☕', pub: '🍺', bar: '🍸', fast_food: '🍔', ice_cream: '🍦' };
const FOOD = new Set(['restaurant', 'cafe', 'pub', 'bar', 'fast_food', 'ice_cream']);
const haversine = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
async function fetchNearby(d) {
  const r = SMALL_TYPES.has(d.type) ? 6000 : 2500, A = `(around:${r},${d.lat},${d.lon})`;
  const q = `[out:json][timeout:25];(nwr["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park)$"]["name"]${A};nwr["historic"~"^(castle|monument|ruins)$"]["name"]${A};nwr["amenity"~"^(restaurant|cafe|pub|bar|fast_food|ice_cream)$"]["name"]${A};);out center tags 200;`;
  const res = await overpass(q, 28000);
  const items = res.elements.map(e => { const tg = e.tags || {}; const kind = FOOD.has(tg.amenity) ? tg.amenity : (tg.tourism || tg.historic || tg.amenity); const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon; if (lat == null) return null;
    return {id: e.type + e.id, name: tg.name, kind, food: FOOD.has(kind), lat, lon, dist: haversine(d.lat, d.lon, lat, lon), cuisine: tg.cuisine, hours: tg.opening_hours, web: tg.website || tg['contact:website'], phone: tg.phone || tg['contact:phone']}; })
    .filter(Boolean).sort((a, b) => a.dist - b.dist).slice(0, 80);
  return {at: Date.now(), items};
}
async function renderNearby(t, body) {
  if (!t.destinations.length) { body.innerHTML = `<div class="empty"><div class="big">🍴</div>Add a destination to find things to do and places to eat.</div>`; return; }
  state.nearbyDest = t.destinations.find(d => d.id === state.nearbyDest)?.id || t.destinations[0].id;
  const d = t.destinations.find(x => x.id === state.nearbyDest);
  body.innerHTML = `<div class="row" style="margin-bottom:8px"><select id="nbDest" style="flex:1" aria-label="Destination">${t.destinations.map(x => `<option value="${x.id}" ${x.id === d.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="chips" id="nbFilter">${[['all', 'All'], ['do', '⭐ Things to do'], ['eat', '🍽️ Food & drink']].map(([k, l]) => `<button class="chip ${state.nearbyFilter === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <div id="nbList">${skeleton(5, 58)}</div>`;
  $('#nbDest').onchange = e => { state.nearbyDest = e.target.value; renderNearby(t, body); };
  $$('#nbFilter .chip').forEach(c => c.onclick = () => { state.nearbyFilter = c.dataset.k; $$('#nbFilter .chip').forEach(x => x.classList.toggle('on', x === c)); paint(); });
  let nb = t.cache.nearby[d.id];
  if ((!nb || Date.now() - nb.at > 7 * 864e5) && navigator.onLine) { try { nb = await fetchNearby(d); t.cache.nearby[d.id] = nb; saveTrips(); } catch {} }
  if (state.tripTab !== 'nearby' || state.nearbyDest !== d.id) return;
  function paint() {
    const list = $('#nbList'); if (!list) return; layers.nearby.clearLayers();
    if (!nb) { list.innerHTML = `<div class="empty"><div class="big">📡</div>${navigator.onLine ? 'The free OpenStreetMap places service is busy right now.<br><button class="btn sm primary" id="nbRetry" style="margin-top:10px">Try again</button>' : 'Offline and not saved yet. Download the trip while online.'}</div>`; const rb = $('#nbRetry'); rb && (rb.onclick = () => renderNearby(t, body)); return; }
    const items = nb.items.filter(i => state.nearbyFilter === 'all' || (state.nearbyFilter === 'eat') === i.food);
    if (!items.length) { list.innerHTML = `<div class="empty">Nothing like that found nearby in OpenStreetMap.</div>`; return; }
    list.innerHTML = `<div class="meta" style="margin:4px 2px 8px">${items.length} places near ${esc(d.name)}${Date.now() - nb.at > 864e5 ? ` · saved ${new Date(nb.at).toLocaleDateString()}` : ''}</div><div class="stack" id="nbStack">${items.map((i, n) => `<div class="poi-row press" data-n="${n}"><span class="poi-ico">${POI[i.kind] || '📍'}</span><div class="grow"><b>${esc(i.name)}</b><div class="meta">${esc(typeLabel(i.kind))}${i.cuisine ? ' · ' + esc(i.cuisine.replace(/;/g, ', ').replace(/_/g, ' ')) : ''}${i.hours ? ' · ' + esc(i.hours) : ''}</div></div><span class="meta">${i.dist < 1 ? Math.round(i.dist * 1000) + ' m' : i.dist.toFixed(1) + ' km'}</span></div>`).join('')}</div>`;
    stagger($('#nbStack'));
    const markers = items.map(i => L.marker([i.lat, i.lon], {icon: poiIcon(POI[i.kind] || '📍')}).addTo(layers.nearby).bindPopup(`<div class="t">${esc(i.name)}</div><div class="s">${esc(typeLabel(i.kind))}${i.hours ? '<br>🕒 ' + esc(i.hours) : ''}${i.phone ? '<br>📞 ' + esc(i.phone) : ''}</div>${i.web && /^https?:/.test(i.web) ? `<a href="${esc(i.web)}" target="_blank" rel="noopener">Website ↗</a>` : ''}`));
    $$('.poi-row', list).forEach(r => r.onclick = () => { const n = +r.dataset.n, i = items[n]; collapseSheetOnMobile(); flyTo(i.lat, i.lon, 17); setTimeout(() => markers[n].openPopup(), reduceMotion ? 0 : 1350); });
    const pts = items.slice(0, 40).map(i => [i.lat, i.lon]).concat([[d.lat, d.lon]]);
    reduceMotion ? map.fitBounds(pts, fitPad({maxZoom: 16})) : map.flyToBounds(pts, fitPad({maxZoom: 16, duration: 1}));
  }
  paint();
}

/* Tickets & bookings (files in IndexedDB) */
const TICKET_TYPES = {flight: '✈️ Flight', train: '🚆 Train', bus: '🚌 Bus / coach', ferry: '⛴️ Ferry', hotel: '🛏️ Accommodation', car: '🚗 Car hire', event: '🎟️ Event', other: '📄 Other'};
function renderTickets(t, body) {
  body.innerHTML = `<div class="row between" style="margin-bottom:8px"><span class="meta">Stored on this device · works offline</span><button class="btn primary sm" id="addTicket">＋ Add booking</button></div>
  <div class="stack" id="tkList">${t.tickets.length ? t.tickets.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(k => `<div class="card ticket" data-id="${k.id}"><div class="row between"><b>${(TICKET_TYPES[k.type] || '📄').split(' ')[0]} ${esc(k.title)}</b><div class="row"><button class="icon-btn edit" title="Edit">✎</button><button class="icon-btn rm" title="Delete">✕</button></div></div>
    <div class="meta">${k.date ? fmtDate(k.date) + (k.time ? ' · ' + esc(k.time) : '') : ''}${k.ref ? ` · Ref <b class="mono" style="color:var(--text)">${esc(k.ref)}</b>` : ''}</div>${k.notes ? `<div class="notes">${esc(k.notes)}</div>` : ''}
    <div class="files">${(k.files || []).map(f => `<button class="file press" data-f="${f.id}">${f.type.startsWith('image/') ? `<img data-thumb="${f.id}" alt="">` : '<span class="pdf">PDF</span>'}<span>${esc(f.name)}</span></button>`).join('')}</div></div>`).join('') : `<div class="empty"><div class="big">🎫</div>No bookings yet. Save flight, train, hotel and event details – with photos or PDFs of your tickets.</div>`}</div>`;
  stagger($('#tkList'));
  $('#addTicket').onclick = () => ticketForm(t);
  $$('.ticket', body).forEach(c => { const k = t.tickets.find(x => x.id === c.dataset.id);
    $('.edit', c).onclick = () => ticketForm(t, k);
    $('.rm', c).onclick = async () => { if (!confirm(`Delete “${k.title}”?`)) return; for (const f of k.files || []) await idb.del(f.id).catch(() => {}); t.tickets = t.tickets.filter(x => x !== k); saveTrips(); renderTickets(t, body); };
    $$('.file', c).forEach(b => b.onclick = async () => { const f = await idb.get(b.dataset.f); if (!f) return toast('File not found on this device'); const url = URL.createObjectURL(f.blob);
      if (f.type.startsWith('image/')) modal(`<h3>${esc(f.name)}</h3><img src="${url}" style="width:100%;border-radius:12px"><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-close>Close</button></div>`);
      else modal(`<h3>${esc(f.name)}</h3><iframe src="${url}" style="width:100%;height:60dvh;border:0;border-radius:12px;background:#fff"></iframe><div class="row" style="justify-content:flex-end;margin-top:10px"><a class="btn" href="${url}" download="${esc(f.name)}">Save</a><button class="btn" data-close>Close</button></div>`); });
  });
  $$('img[data-thumb]', body).forEach(async img => { const f = await idb.get(img.dataset.thumb); if (f) img.src = URL.createObjectURL(f.blob); });
}
function ticketForm(t, k) {
  const isNew = !k; k = k || {type: 'flight', title: '', date: t.start || '', time: '', ref: '', notes: '', files: []};
  modal(`<h3>${isNew ? 'Add booking' : 'Edit booking'}</h3>
    <div class="row"><label class="field" style="flex:1">Type<select id="kType">${Object.entries(TICKET_TYPES).map(([a, b]) => `<option value="${a}" ${a === k.type ? 'selected' : ''}>${b}</option>`).join('')}</select></label><label class="field" style="flex:2">Title<input id="kTitle" value="${esc(k.title)}" placeholder="e.g. Flight LGW → INV"></label></div>
    <div class="row"><label class="field" style="flex:1">Date<input id="kDate" type="date" value="${esc(k.date)}"></label><label class="field" style="flex:1">Time<input id="kTime" type="time" value="${esc(k.time)}"></label></div>
    <label class="field">Booking reference<input id="kRef" value="${esc(k.ref)}" placeholder="e.g. ABC123"></label>
    <label class="field">Notes<textarea id="kNotes" rows="3" placeholder="Seat, terminal, check-in time, address…">${esc(k.notes)}</textarea></label>
    <label class="field">Attach tickets (photos or PDF)<input id="kFiles" type="file" accept="image/*,application/pdf" multiple></label>
    ${k.files.length ? `<div class="meta" style="margin:-4px 0 10px">${k.files.length} file(s) already attached</div>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="kSave">Save</button></div>`, (c, close) => {
    $('#kSave', c).onclick = async () => {
      const title = $('#kTitle', c).value.trim() || TICKET_TYPES[$('#kType', c).value].split(' ').slice(1).join(' ');
      const files = [...$('#kFiles', c).files];
      const btn = $('#kSave', c); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        for (const f of files) { if (f.size > 25e6) { toast(`${f.name} is over 25 MB – skipped`); continue; } const id = uid(); const type = f.type || 'application/octet-stream'; await idb.put({id, name: f.name, type, blob: f}); k.files.push({id, name: f.name, type, size: f.size}); }
      } catch (e) { toast('Could not save file: ' + e.message); }
      Object.assign(k, {type: $('#kType', c).value, title, date: $('#kDate', c).value, time: $('#kTime', c).value, ref: $('#kRef', c).value.trim(), notes: $('#kNotes', c).value.trim()});
      if (isNew) { k.id = uid(); t.tickets.push(k); }
      saveTrips(); close(); renderTripBody(t); toast('Booking saved on this device');
    };
  });
}

/* ---------------- Offline download ---------------- */
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
let tileTemplate = null;
async function getTileTemplate() { if (!tileTemplate) { const tj = await fetchJSON(OFM + '/planet', {}, 10000); tileTemplate = tj.tiles[0]; } return tileTemplate; }
function tileUrlsFor(d, tpl) {
  const urls = [];
  for (const [zs, km] of Object.entries(ZOOM_RADII_KM)) {
    const z = +zs, dLat = km / 111, dLon = km / (111 * Math.cos(d.lat * Math.PI / 180));
    const x0 = lon2x(d.lon - dLon, z), x1 = lon2x(d.lon + dLon, z), y0 = lat2y(d.lat + dLat, z), y1 = lat2y(d.lat - dLat, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { if (urls.length >= MAX_TILES_PER_DEST) return urls; urls.push(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)); }
  }
  return urls;
}
let downloading = false;
async function downloadTrip(t) {
  if (downloading) return toast('A download is already running');
  if (!t.destinations.length) return toast('Add a destination first');
  if (!navigator.onLine) return toast('You are offline – connect to download');
  if (!('caches' in window)) return toast('Offline storage needs HTTPS and a modern browser');
  downloading = true;
  const ui = () => ({prog: $('#dlProgress'), bar: $('#dlProgress .progress > div'), txt: $('#dlText')});
  const set = (p, m) => { const u = ui(); if (u.prog) u.prog.classList.remove('hidden'); if (u.bar) u.bar.style.transform = `scaleX(${p})`; if (u.txt) u.txt.textContent = m; };
  $$('#dlTrip, #dlAll').forEach(b => b.disabled = true);
  try {
    navigator.storage?.persist?.().catch(() => {});
    const tpl = await getTileTemplate();
    // Style, sprites and fonts so the vector map can render without signal
    const style = await fetchJSON(OFM_STYLE, {}, 10000);
    const fonts = [...new Set(style.layers.map(l => l.layout?.['text-font']).filter(Array.isArray).map(f => f.join(',')))];
    const extras = [OFM_STYLE, OFM + '/planet', ...['', '@2x'].flatMap(r => [`${style.sprite}${r}.json`, `${style.sprite}${r}.png`]),
      ...fonts.flatMap(f => ['0-255', '256-511', '8192-8447'].map(rg => style.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', rg)))];
    const urls = [...new Set([...extras, ...t.destinations.flatMap(d => tileUrlsFor(d, tpl))])].slice(0, MAX_TILES_PER_TRIP + extras.length);
    const cache = await caches.open('roamly-tiles');
    let done = 0, failed = 0, i = 0;
    set(0.01, `Saving map… 0/${urls.length}`);
    const worker = async () => { while (i < urls.length) { const u = urls[i++]; try { const fresh = /\/styles\/|\/planet$/.test(u); if (fresh || !(await cache.match(u))) { const r = await fetch(u, {mode: 'cors', cache: 'no-store'}); if (r.ok) await cache.put(u, r); else failed++; } } catch { failed++; } done++; if (done % 5 === 0 || done === urls.length) set(done / urls.length * 0.8, `Saving map… ${done}/${urls.length}`); } };
    await Promise.all(Array.from({length: 6}, worker));
    set(0.82, 'Saving weather forecasts…');
    for (const d of t.destinations) { try { t.cache.weather[d.id] = await fetchWeather(d); } catch {} }
    set(0.88, 'Saving things to do & places to eat…');
    for (const d of t.destinations) { try { t.cache.nearby[d.id] = await fetchNearby(d); } catch {} }
    set(0.95, 'Saving currency rates…'); await getRates(true);
    set(0.98, 'Saving app & trip details…');
    for (const d of t.destinations) if (!d.connectivity) { try { await assessConnectivity(d); } catch {} }
    const okW = t.destinations.filter(d => t.cache.weather[d.id]).length, okN = t.destinations.filter(d => t.cache.nearby[d.id]).length;
    t.offline = {ok: true, at: Date.now(), tiles: urls.length - failed, failed, destKey: t.destinations.map(d => d.id).join(','), weather: okW, nearby: okN};
    saveTrips(); set(1, `Done – ${urls.length - failed} map tiles, weather (${okW}/${t.destinations.length}), places (${okN}/${t.destinations.length}), rates, tickets & itinerary saved.`);
    toast(failed ? `Saved for offline (${failed} tiles failed – try again later)` : '✓ Everything saved for offline use', 4000);
    updateNet();
    setTimeout(() => { if (state.tripId === t.id && state.view === 'trip') renderTrip(); }, 1600);
  } catch (e) { toast('Download failed: ' + (e.message || e)); }
  finally { downloading = false; $$('#dlTrip, #dlAll').forEach(b => b.disabled = false); }
}

/* ---------------- Connection status ---------------- */
function connQuality() {
  if (!navigator.onLine) return 'off';
  const c = navigator.connection; if (!c) return 'ok';
  if (c.saveData || ['slow-2g', '2g'].includes(c.effectiveType) || (c.downlink && c.downlink < 0.4) || (c.rtt && c.rtt > 1500)) return 'bad';
  return 'ok';
}
function updateNet(forceQ) {
  const q = forceQ || connQuality(), pill = $('#netStatus'), b = $('#netBanner');
  pill.className = 'net-pill ' + (q === 'ok' ? '' : q); pill.textContent = q === 'off' ? '● Offline' : q === 'bad' ? '● Weak signal' : '● Online';
  const ready = trips.filter(isDownloaded).length;
  if (q === 'off') { b.className = 'banner off pop-in'; b.innerHTML = `<b>You're offline.</b> Trips, itineraries and tickets still work${ready ? ', plus maps, weather and places for downloaded trips' : ''}.${ready ? '' : ' Download trips while online to keep maps available.'}`; }
  else if (q === 'bad') { const pend = trips.filter(t => !isDownloaded(t) && t.destinations.length); b.className = 'banner warn pop-in'; b.innerHTML = `<b>Weak connection detected.</b> ${pend.length ? `Download your trips now while you still have some signal.<br><button class="btn primary sm" id="netDl">⬇ Download everything</button>` : 'Your trips are already saved for offline use.'}`; const nd = $('#netDl'); nd && (nd.onclick = async () => { for (const t of pend) await downloadTrip(t); }); }
  else b.className = 'banner hidden';
}
addEventListener('online', () => { updateNet(); toast('Back online'); });
addEventListener('offline', () => { updateNet(); toast('You are offline – showing saved data'); });
navigator.connection?.addEventListener?.('change', () => updateNet());

/* ---------------- Mobile bottom sheet ---------------- */
const panel = $('#panel'); const isMobile = () => matchMedia('(max-width: 760px)').matches;
function collapseSheetOnMobile() { if (isMobile()) panel.classList.add('collapsed'); }
function expandSheet() { panel.classList.remove('collapsed'); }
$('#panelToggle').onclick = () => panel.classList.toggle('collapsed');
(() => { // drag the handle to open/close the sheet (transform only)
  const h = $('#sheetHandle'); if (!h) return; let y0 = null, dy = 0, base = 0;
  h.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; base = panel.classList.contains('collapsed') ? panel.offsetHeight - 132 : 0; panel.classList.add('dragging'); h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointermove', e => { if (y0 == null) return; dy = e.clientY - y0; panel.style.transform = `translateY(${Math.max(0, base + dy)}px)`; });
  const end = () => { if (y0 == null) return; panel.classList.remove('dragging'); panel.style.transform = ''; if (Math.abs(dy) < 6) panel.classList.toggle('collapsed'); else panel.classList.toggle('collapsed', dy > 0); y0 = null; };
  h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
})();

/* ---------------- Boot ---------------- */
addEventListener('resize', () => { moveIndicator($('.tabs')); moveIndicator($('#subtabs')); map.invalidateSize(); });
requestAnimationFrame(() => moveIndicator($('.tabs')));
updateNet();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW registration failed', e)));
setTimeout(async () => { for (const t of trips) for (const d of t.destinations) if (!d.connectivity && navigator.onLine) { try { await assessConnectivity(d); saveTrips(); } catch {} } }, 1500);
if (trips.length) setMainTab('trips');
window.roamly = {trips: () => trips, runSearch, downloadTrip, getTrip, state, updateNet, map, gl: () => glLayer.getMaplibreMap()};
})();
