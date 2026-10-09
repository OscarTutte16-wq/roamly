/* Roamly – Profile: account, travel stats, settings. */
(() => {
const R = window.roamly, {$, $$, esc} = R;
const sections = [], settings = [];
function stats() {
  const ds = R.trips().flatMap(t => t.destinations);
  return {trips: R.trips().length, countries: new Set(ds.map(d => d.cc).filter(Boolean)).size, places: new Set(ds.map(d => d.name)).size};
}
async function storageText() { try { const e = await navigator.storage.estimate(); return `${(e.usage / 1048576).toFixed(1)} MB used`; } catch { return ''; } }
async function render() {
  const body = $('#profileBody'); if (!body) return;
  const acc = R.auth?.current?.(), s = stats(), rm = document.documentElement.classList.contains('rm');
  body.innerHTML = `<div class="card acct"><div class="avatar ${acc ? '' : 'guest'}">${acc ? esc(R.auth.initials(acc.name)) : '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>'}</div>
      <div class="grow"><h2>${acc ? esc(acc.name) : 'Guest'}</h2><div class="meta">${acc ? esc(acc.email) : 'Sign in to keep separate trips per person'}</div></div></div>
    <div class="row" style="margin-top:12px;gap:8px">${acc ? '<button class="btn" id="pOut">Sign out</button>' : '<button class="btn primary" id="pIn">Sign in</button><button class="btn" id="pUp">Create account</button>'}</div>
    <div class="section-h"><h2>Your travels</h2></div>
    <div class="card stats"><div><b>${s.trips}</b><span>Trips</span></div><div><b>${s.places}</b><span>Places</span></div><div><b>${R.trips().reduce((n, t) => n + (t.journal || []).length, 0)}</b><span>Journal</span></div><div><b>${R.lessons?.state().xp || 0}</b><span>XP</span></div></div>
    ${sections.map(x => x.html()).join('')}
    <div class="section-h"><h2>Settings</h2></div>
    <div class="group">
      ${settings.map(x => x.html()).join('')}
      <label class="li"><span class="grow">Reduce motion</span><span class="switch"><input type="checkbox" id="pRm" ${rm ? 'checked' : ''}><span></span></span></label>
      <div class="li"><span class="grow">Offline storage</span><span class="val" id="pStore">…</span></div>
      <button class="li" id="pClear"><span class="grow">Clear saved maps</span><span class="chev">›</span></button>
      ${matchMedia('(display-mode: standalone)').matches ? '' : '<button class="li" id="pInstall"><span class="grow">Add Roamly to your Home Screen</span><span class="chev">›</span></button>'}
      <button class="li" id="pAbout"><span class="grow">About Roamly</span><span class="chev">›</span></button>
    </div>`;
  R.stagger(body);
  [...sections, ...settings].forEach(x => { try { x.wire?.(body); } catch (e) { console.warn(e); } });
  $('#pOut') && ($('#pOut').onclick = () => R.auth.signOut());
  $('#pIn') && ($('#pIn').onclick = () => R.auth.showAuth('signin'));
  $('#pUp') && ($('#pUp').onclick = () => R.auth.showAuth('signup'));
  $('#pRm').onchange = e => { document.documentElement.classList.toggle('rm', e.target.checked); R.store.global.set('reduceMotion', e.target.checked); };
  $('#pStore').textContent = await storageText();
  $('#pClear').onclick = async () => { if (!confirm('Remove all saved offline maps? Trips and tickets are kept.')) return; for (const k of ['roamly-tiles', 'roamly-tiles-runtime']) await caches.delete(k); R.trips().forEach(t => { if (t.offline) t.offline.ok = false; }); R.saveTrips(); $('#pStore').textContent = await storageText(); R.toast('Offline maps cleared'); };
  $('#pInstall') && ($('#pInstall').onclick = () => R.modal(`<h3>Install Roamly</h3><p class="meta" style="line-height:1.6">On iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.<br>On Android: open the browser menu and tap <b>Install app</b>.</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-close>Got it</button></div>`));
  $('#pAbout').onclick = () => R.modal(`<h3>About Roamly</h3><p class="meta" style="line-height:1.6">Free, keyless data: maps © OpenFreeMap, OpenMapTiles &amp; OpenStreetMap contributors · search by Nominatim &amp; Photon · places by Overpass · weather by Open-Meteo · rates by open.er-api.com / Frankfurter.<br><br>Your trips, accounts and files are stored only on this device.</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-close>Close</button></div>`);
}
if (R.store.global.get('reduceMotion', false)) document.documentElement.classList.add('rm');
R.profile = {render, addSection: x => sections.push(x), addSetting: x => settings.push(x)};
R.onBoot({init: () => R.nav.onScreen('profile', render), userChanged: render});
})();
