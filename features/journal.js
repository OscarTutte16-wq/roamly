/* Roamly – Journal: dated notes with geotagged photos. Text lives with the trip; photos live in IndexedDB on this device. */
(() => {
const R = window.roamly, {$, $$, esc, toast, idb, uid} = R;
const layer = L.layerGroup().addTo(R.map);
const urls = new Map();
const blobUrl = async id => { if (urls.has(id)) return urls.get(id); const f = await idb.get(id).catch(() => null); if (!f) return ''; const u = URL.createObjectURL(f.blob); urls.set(id, u); return u; };

/* ---- EXIF: read GPS position and capture date straight from the JPEG bytes ---- */
async function readExif(file) {
  try {
    const buf = await file.slice(0, 512 * 1024).arrayBuffer(), v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return {};
    for (let o = 2; o + 10 < v.byteLength;) {
      const m = v.getUint16(o); if ((m & 0xFF00) !== 0xFF00) return {};
      const len = v.getUint16(o + 2);
      if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10);
      if (m === 0xFFDA) return {};
      o += 2 + len;
    }
  } catch {}
  return {};
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949, u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const SZ = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8};
  const ifd = p => { const n = u16(p), e = {}; for (let i = 0; i < n; i++) { const q = p + 2 + i * 12; e[u16(q)] = {type: u16(q + 2), count: u32(q + 4), off: q + 8}; } return e; };
  const at = en => (SZ[en.type] || 1) * en.count > 4 ? t + u32(en.off) : en.off;
  const rat = p => u32(p) / (u32(p + 4) || 1);
  const str = en => { const p = at(en); let s = ''; for (let i = 0; i < en.count && v.getUint8(p + i); i++) s += String.fromCharCode(v.getUint8(p + i)); return s; };
  const out = {}, i0 = ifd(t + u32(t + 4));
  if (i0[0x8769]) { const ex = ifd(t + u32(i0[0x8769].off)); const d = ex[0x9003] && str(ex[0x9003]); if (d && /^\d{4}:\d\d:\d\d/.test(d)) out.date = d.slice(0, 10).replace(/:/g, '-'); }
  if (i0[0x8825]) {
    const g = ifd(t + u32(i0[0x8825].off)), dms = en => { const p = at(en); return rat(p) + rat(p + 8) / 60 + rat(p + 16) / 3600; };
    if (g[2] && g[4]) {
      let lat = dms(g[2]), lon = dms(g[4]);
      if (g[1] && str(g[1]) === 'S') lat = -lat; if (g[3] && str(g[3]) === 'W') lon = -lon;
      if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) { out.lat = +lat.toFixed(6); out.lon = +lon.toFixed(6); }
    }
  }
  return out;
}
/* ---- Downscale on-device so photos stay small (EXIF is read first, re-encoding drops it) ---- */
async function shrink(file, max, q = .82) {
  let src;
  try { src = await createImageBitmap(file, {imageOrientation: 'from-image'}); }
  catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Unsupported image')); i.src = URL.createObjectURL(file); }); }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight, s = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return {blob: await new Promise(r => c.toBlob(r, 'image/jpeg', q)), w: c.width, h: c.height};
}

const km = (a, b) => { const r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon); return 12742 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2)); };
async function nameFor(t, pt) {
  const near = t.destinations.map(d => [d, km(pt, d)]).sort((a, b) => a[1] - b[1])[0];
  if (near && near[1] < 3) return near[0].name;
  if (navigator.onLine) { try { const r = await R.fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${pt.lat}&lon=${pt.lon}`, {}, 8000); const a = r.address || {}; const n = a.village || a.hamlet || a.town || a.city || a.suburb || a.municipality || a.county || r.name; if (n) return n; } catch {} }
  return near && near[1] < 40 ? `Near ${near[0].name}` : `${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)}`;
}
const dayLabel = (t, date) => { const n = t.start ? Math.round((new Date(date) - new Date(t.start)) / 864e5) + 1 : 0; return (n >= 1 && n <= 60 ? `Day ${n} · ` : '') + R.fmtDate(date); };
const ICON_PIN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
const ICON_CAM = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>';

function photoGrid(e) {
  const ph = e.photos || []; if (!ph.length) return '';
  const show = ph.slice(0, ph.length > 4 ? 3 : 4), more = ph.length - show.length;
  return `<div class="j-photos n${Math.min(show.length + (more ? 1 : 0), 4)}">${show.map((p, i) => `<button class="j-ph press" data-e="${e.id}" data-i="${i}"><img data-src="${p.thumb}" alt=""></button>`).join('')}${more ? `<button class="j-ph more press" data-e="${e.id}" data-i="3"><img data-src="${ph[3].thumb}" alt=""><span>+${more}</span></button>` : ''}</div>`;
}
async function hydrate(root) { for (const img of $$('img[data-src]', root)) { const u = await blobUrl(img.dataset.src); if (u) { img.src = u; img.decode?.().then(() => img.classList.add('in')).catch(() => img.classList.add('in')); } } }

function render(t, body) {
  t.journal ||= [];
  const list = t.journal.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.at - a.at);
  const nPh = list.reduce((s, e) => s + (e.photos?.length || 0), 0);
  const groups = []; list.forEach(e => { const g = groups[groups.length - 1]; g && g.date === e.date ? g.items.push(e) : groups.push({date: e.date, items: [e]}); });
  body.innerHTML = `<div class="row between" style="margin-bottom:6px"><span class="meta">${list.length ? `${list.length} ${list.length === 1 ? 'entry' : 'entries'} · ${nPh} photo${nPh === 1 ? '' : 's'}` : 'Private to this device'}</span><button class="btn primary sm" id="jNew">＋ New entry</button></div>
    ${list.length ? `<div class="j-list">${groups.map(g => `<div class="j-day"><div class="j-date">${esc(dayLabel(t, g.date))}</div>${g.items.map(e => `<article class="j-entry press" data-id="${e.id}">${photoGrid(e)}${e.text ? `<p class="j-text">${esc(e.text)}</p>` : ''}${e.place ? `<button class="j-place" data-id="${e.id}">${ICON_PIN}<span>${esc(e.place.name)}</span></button>` : ''}</article>`).join('')}</div>`).join('')}</div>`
      : `<div class="empty j-empty"><div class="j-cam">${ICON_CAM}</div><b>Start your travel journal</b><p>Write a few lines each day and add photos. Pictures with location data are pinned on the map automatically.</p></div>`}`;
  R.stagger($('.j-list', body) || body);
  $('#jNew').onclick = () => form(t);
  $$('.j-entry', body).forEach(a => a.onclick = ev => { if (ev.target.closest('.j-ph, .j-place')) return; form(t, t.journal.find(x => x.id === a.dataset.id)); });
  $$('.j-ph', body).forEach(b => b.onclick = () => viewer(t, t.journal.find(x => x.id === b.dataset.e), +b.dataset.i));
  $$('.j-place', body).forEach(b => b.onclick = () => showOnMap(t, t.journal.find(x => x.id === b.dataset.id)));
  hydrate(body);
}
function showOnMap(t, e) {
  const p = e.place || e.photos?.find(x => x.lat != null); if (!p) return;
  R.setMainTab('map'); R.collapseSheetOnMobile(); R.drawTrip(t, false); R.flyTo(p.lat, p.lon, 15);
  setTimeout(() => layer.eachLayer(m => { if (m.options.entry === e.id) m.openPopup(); }), R.reduceMotion ? 80 : 1400);
}
async function viewer(t, e, i) {
  const ph = e.photos; let k = i;
  R.modal(`<div class="j-view"><img id="jvImg" alt=""><div class="row between j-view-bar"><span class="meta" id="jvMeta"></span><div class="row">${ph.length > 1 ? '<button class="icon-btn" id="jvPrev" aria-label="Previous">‹</button><button class="icon-btn" id="jvNext" aria-label="Next">›</button>' : ''}<button class="icon-btn" id="jvMap" aria-label="Show on map">${ICON_PIN}</button><button class="btn sm" data-close>Done</button></div></div></div>`, c => {
    const show = async () => { const p = ph[k], img = $('#jvImg', c); img.classList.remove('in'); img.src = await blobUrl(p.id) || await blobUrl(p.thumb); img.onload = () => img.classList.add('in');
      $('#jvMeta', c).textContent = `${k + 1} / ${ph.length}${p.lat != null ? ' · geotagged' : ''}`; $('#jvMap', c).style.display = p.lat != null || e.place ? '' : 'none'; };
    $('#jvPrev', c) && ($('#jvPrev', c).onclick = () => { k = (k + ph.length - 1) % ph.length; show(); });
    $('#jvNext', c) && ($('#jvNext', c).onclick = () => { k = (k + 1) % ph.length; show(); });
    let x0 = null; $('#jvImg', c).addEventListener('touchstart', ev => { x0 = ev.touches[0].clientX; }, {passive: true});
    $('#jvImg', c).addEventListener('touchend', ev => { if (x0 == null || ph.length < 2) return; const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { k = (k + (dx < 0 ? 1 : ph.length - 1)) % ph.length; show(); } x0 = null; });
    $('#jvMap', c).onclick = () => { $('[data-close]', c).click(); const p = ph[k]; if (p.lat != null) { R.setMainTab('map'); R.collapseSheetOnMobile(); R.drawTrip(t, false); R.flyTo(p.lat, p.lon, 16); } else showOnMap(t, e); };
    show();
  });
}

function form(t, e) {
  const isNew = !e;
  const d = isNew ? {date: R.today() >= (t.start || '') && R.today() <= (t.end || '9999') ? R.today() : (t.start || R.today()), text: '', place: null, photos: []} : JSON.parse(JSON.stringify(e));
  const pending = []; // {file, exif, preview}
  R.modal(`<h3>${isNew ? 'New entry' : 'Edit entry'}</h3>
    <label class="field">Date<input id="jDate" type="date" value="${esc(d.date)}"></label>
    <label class="field">Notes<textarea id="jText" rows="4" placeholder="What did you see, eat, discover today?">${esc(d.text)}</textarea></label>
    <div class="field">Photos<div class="j-pick" id="jPick">${d.photos.map((p, i) => `<div class="j-thumb" data-k="old${i}"><img data-src="${p.thumb}" alt="">${p.lat != null ? `<span class="geo">${ICON_PIN}</span>` : ''}<button class="x" aria-label="Remove photo">✕</button></div>`).join('')}<label class="j-add press" aria-label="Add photos">${ICON_CAM}<input id="jFiles" type="file" accept="image/*" multiple hidden></label></div></div>
    <div class="field">Location<div class="j-loc"><span id="jLoc" class="${d.place ? '' : 'meta'}">${d.place ? esc(d.place.name) : 'No location'}</span><div class="row"><button class="btn sm" id="jGps">${ICON_PIN} Here</button>${t.destinations.length ? `<select id="jDest" aria-label="Pick a stop"><option value="">Stop…</option>${t.destinations.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>` : ''}${d.place ? '<button class="icon-btn" id="jNoLoc" aria-label="Clear location">✕</button>' : ''}</div></div></div>
    <div class="row between" style="margin-top:6px">${isNew ? '<span></span>' : '<button class="btn ghost danger-t" id="jDel">Delete</button>'}<div class="row"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="jSave">Save</button></div></div>`, (c, close) => {
    hydrate(c);
    const setPlace = (p, src) => { d.place = p ? {...p, src} : null; const el = $('#jLoc', c); el.textContent = p ? p.name : 'No location'; el.className = p ? 'pop-in' : 'meta'; };
    $$('.j-thumb .x', c).forEach(b => b.onclick = () => { const k = b.parentElement.dataset.k; if (k.startsWith('old')) d.photos[+k.slice(3)] = null; else pending[+k.slice(3)] = null; b.parentElement.remove(); });
    $('#jFiles', c).onchange = async ev => {
      for (const f of [...ev.target.files]) {
        if (!f.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic)$/i.test(f.name)) continue;
        const ex = await readExif(f), k = pending.push({file: f, exif: ex}) - 1;
        const th = document.createElement('div'); th.className = 'j-thumb pop-in'; th.dataset.k = 'new' + k;
        th.innerHTML = `<img alt="">${ex.lat != null ? `<span class="geo">${ICON_PIN}</span>` : ''}<button class="x" aria-label="Remove photo">✕</button>`;
        $('.j-add', c).before(th); const img = $('img', th); img.src = URL.createObjectURL(f); img.onload = () => img.classList.add('in');
        $('.x', th).onclick = () => { pending[k] = null; th.remove(); };
        if (ex.lat != null && !d.place) { setPlace({lat: ex.lat, lon: ex.lon, name: 'Locating…'}, 'photo'); nameFor(t, ex).then(n => { if (d.place?.src === 'photo') setPlace({lat: ex.lat, lon: ex.lon, name: n}, 'photo'); }); }
        if (ex.date && isNew && !d.dateTouched) $('#jDate', c).value = ex.date;
      }
      ev.target.value = '';
    };
    $('#jDate', c).oninput = () => { d.dateTouched = true; };
    $('#jGps', c).onclick = () => {
      if (!navigator.geolocation) return toast('Location is not available on this device');
      const b = $('#jGps', c); b.disabled = true; b.classList.add('busy');
      navigator.geolocation.getCurrentPosition(async pos => { const pt = {lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6)}; setPlace({...pt, name: 'Locating…'}, 'gps'); setPlace({...pt, name: await nameFor(t, pt)}, 'gps'); b.disabled = false; b.classList.remove('busy'); },
        err => { b.disabled = false; b.classList.remove('busy'); toast(err.code === 1 ? 'Location permission denied' : 'Could not get your location'); }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000});
    };
    $('#jDest', c) && ($('#jDest', c).onchange = ev => { const x = t.destinations.find(y => y.id === ev.target.value); if (x) setPlace({lat: x.lat, lon: x.lon, name: x.name}, 'stop'); });
    $('#jNoLoc', c) && ($('#jNoLoc', c).onclick = () => setPlace(null));
    $('#jDel', c) && ($('#jDel', c).onclick = async () => { if (!confirm('Delete this entry and its photos?')) return; for (const p of e.photos || []) { await idb.del(p.id).catch(() => {}); await idb.del(p.thumb).catch(() => {}); } t.journal = t.journal.filter(x => x.id !== e.id); R.saveTrips(); close(); R.renderTripBody(t); drawPins(t); toast('Entry deleted'); });
    $('#jSave', c).onclick = async () => {
      const text = $('#jText', c).value.trim(), files = pending.filter(Boolean);
      if (!text && !files.length && !d.photos.filter(Boolean).length) { const a = $('#jText', c); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); return; }
      const btn = $('#jSave', c); btn.disabled = true; btn.textContent = files.length ? 'Saving photos…' : 'Saving…';
      if (!isNew) for (const [i, p] of e.photos.entries()) if (!d.photos[i]) { await idb.del(p.id).catch(() => {}); await idb.del(p.thumb).catch(() => {}); }
      const photos = d.photos.filter(Boolean);
      for (const {file, exif} of files) {
        try {
          const big = await shrink(file, 1600), small = await shrink(file, 420, .78), id = uid();
          await idb.put({id, name: file.name, type: 'image/jpeg', blob: big.blob}); await idb.put({id: id + '_t', name: file.name, type: 'image/jpeg', blob: small.blob});
          photos.push({id, thumb: id + '_t', w: big.w, h: big.h, ...(exif.lat != null ? {lat: exif.lat, lon: exif.lon} : {})});
        } catch (err) { toast(`Couldn't add ${file.name} – ${err.message || 'unsupported image'}`); }
      }
      const entry = {id: isNew ? uid() : e.id, at: isNew ? Date.now() : e.at, date: $('#jDate', c).value || R.today(), text, place: d.place?.name === 'Locating…' ? {...d.place, name: `${d.place.lat.toFixed(4)}, ${d.place.lon.toFixed(4)}`} : d.place, photos};
      if (isNew) t.journal.push(entry); else Object.assign(e, entry);
      R.saveTrips(); close(); R.renderTripBody(t); drawPins(t); toast(isNew ? 'Saved to your journal' : 'Entry updated');
    };
  });
}

/* ---- Map: photo pins for the open trip ---- */
async function drawPins(t) {
  layer.clearLayers(); if (!t) return;
  for (const e of t.journal || []) {
    const p = e.place || e.photos?.find(x => x.lat != null); if (!p) continue;
    const ph = e.photos?.[0], u = ph ? await blobUrl(ph.thumb) : '';
    const icon = L.divIcon({className: 'jpin-wrap', html: `<div class="jpin pin-drop">${u ? `<img src="${u}" alt="">` : ICON_PIN}</div>`, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -17]});
    L.marker([p.lat, p.lon], {icon, entry: e.id, zIndexOffset: -200}).addTo(layer)
      .bindPopup(`<div class="t">${esc(dayLabel(t, e.date))}</div>${e.text ? `<div class="s j-pop">${esc(e.text.slice(0, 140))}${e.text.length > 140 ? '…' : ''}</div>` : ''}<div class="s">${ICON_PIN} ${esc(e.place?.name || 'Photo location')}</div>`);
  }
}
R.onDrawTrip(t => { drawPins(t); return false; });
R.nav.onScreen?.('map', () => { if (R.state.view !== 'trip') layer.clearLayers(); });
R.onTripDelete(async t => { for (const e of t.journal || []) for (const p of e.photos || []) { await idb.del(p.id).catch(() => {}); await idb.del(p.thumb).catch(() => {}); } });
R.addTripTab('journal', 'Journal', render, 'plan');

/* ---- Home: latest entries across trips ---- */
R.home.onJournal = async () => {
  const el = $('#homeJournal'); if (!el) return;
  const all = R.trips().flatMap(t => (t.journal || []).map(e => ({t, e}))).sort((a, b) => (b.e.date || '').localeCompare(a.e.date || '') || b.e.at - a.e.at).slice(0, 6);
  if (!all.length) return;
  el.classList.add('bare');
  el.innerHTML = `<div class="j-rail">${all.map(({t, e}, i) => `<button class="j-card press" data-i="${i}">${e.photos?.[0] ? `<img data-src="${e.photos[0].thumb}" alt="">` : `<div class="j-noimg">${ICON_CAM}</div>`}<div class="j-cap"><b>${esc(e.place?.name || t.name)}</b><span>${esc(e.text ? e.text.slice(0, 60) : R.fmtDate(e.date))}</span></div></button>`).join('')}</div>`;
  $$('.j-card', el).forEach(b => b.onclick = () => { const {t} = all[+b.dataset.i]; R.state.view = 'trip'; R.state.tripId = t.id; R.state.tripTab = 'journal'; R.setMainTab('trips'); });
  hydrate(el);
};
R.journal = {readExif, render, drawPins};
})();
