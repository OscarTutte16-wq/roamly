/* Roamly – share a trip as a self-contained link (compressed JSON in the URL hash) and import it on open. */
(() => {
const R = window.roamly, {$, esc, toast} = R;
const toB64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

function snapshot(t) {
  const {cache, offline, id, journal, reminders, ...rest} = t; // the journal is private and its photos are device-only
  return {v: 1, ...rest, tickets: (t.tickets || []).map(({files, ...k}) => k)}; // attachments stay on the device
}
async function encode(t) { const json = new TextEncoder().encode(JSON.stringify(snapshot(t))); return 'z' + toB64u(await pipe(json, new CompressionStream('deflate-raw'))); }
async function decode(s) { const bytes = fromB64u(s.slice(1)); const out = s[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes; return JSON.parse(new TextDecoder().decode(out)); }
async function share(t) {
  const url = `${location.origin}${location.pathname}#share=${await encode(t)}`;
  R.modal(`<h3>Share “${esc(t.name)}”</h3>
    <p class="meta" style="margin:-6px 0 12px">Anyone with this link can add a copy of the trip – stops, itinerary, packing, budget and booking details. Attached files aren't included.</p>
    <div class="share-link"><input id="shUrl" readonly value="${esc(url)}"><button class="icon-btn accent" id="shCopy" aria-label="Copy link">⧉</button></div>
    <p class="meta" style="font-size:12px;margin:10px 0 14px">This is a snapshot. Editing together in real time would need a sync server.</p>
    <div class="row" style="justify-content:flex-end">${navigator.share ? '<button class="btn" id="shNative">Share…</button>' : ''}<button class="btn primary" data-close>Done</button></div>`, c => {
    const copy = async () => { try { await navigator.clipboard.writeText(url); } catch { $('#shUrl', c).select(); document.execCommand('copy'); } toast('Link copied'); };
    $('#shCopy', c).onclick = copy; $('#shUrl', c).onclick = e => e.target.select();
    const n = $('#shNative', c); n && (n.onclick = () => navigator.share({title: `Roamly trip: ${t.name}`, url}).catch(() => {}));
  });
  return url;
}
R.addTripMenuItem({label: () => 'Share trip', run: share});

async function checkHash() {
  const m = location.hash.match(/^#share=([\w-]+)$/); if (!m) return;
  if (!$('#authScreen')?.classList.contains('hidden')) return setTimeout(checkHash, 500); // wait until signed in / guest
  let t; try { t = await decode(m[1]); } catch { history.replaceState(null, '', location.pathname); return toast('That share link is damaged or incomplete'); }
  history.replaceState(null, '', location.pathname);
  R.modal(`<h3>Add shared trip?</h3><div class="import-prev"><b>${esc(t.name)}</b><div class="meta">${t.start ? `${R.fmtDate(t.start)} – ${R.fmtDate(t.end)} · ` : ''}${(t.destinations || []).length} stops</div>
    <div class="meta" style="margin-top:8px">${(t.destinations || []).map(d => `${R.flag(d.cc)} ${esc(d.name)}`).join(' · ')}</div></div>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-close>Not now</button><button class="btn primary" id="impGo">Add to my trips</button></div>`, (c, close) => {
    $('#impGo', c).onclick = () => {
      delete t.v; const nt = R.normTrip({...t, id: R.uid(), imported: Date.now()});
      R.trips().unshift(nt); R.saveTrips(); close(); R.state.view = 'trip'; R.state.tripId = nt.id; R.state.tripTab = 'plan'; R.setMainTab('trips'); toast('Trip added');
    };
  });
}
R.onBoot({init: () => setTimeout(checkHash, 300)});
addEventListener('hashchange', checkHash);
R.share = {encode, decode, share};
})();
