/* Roamly – native-style app shell: floating glass tab bar, screen transitions, collapsing large titles, splash. */
(() => {
const R = window.roamly, {$, $$} = R;
const order = ['home', 'trips', 'map', 'learn', 'profile'];
const hooks = {};
let current = 'home';
function moveTabInd() { const bar = $('#tabbar'), act = $('#tabbar button.active'), ind = $('.tb-ind', bar); if (!act) return; ind.style.width = act.offsetWidth + 'px'; ind.style.transform = `translateX(${act.offsetLeft}px)`; }
function go(name, opts = {}) {
  if (!order.includes(name)) return;
  const prev = current; current = name; R.state.tab = name;
  $$('#tabbar button').forEach(b => { const on = b.dataset.s === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  moveTabInd();
  if (prev !== name) {
    const from = $('#screen-' + prev), to = $('#screen-' + name), dir = order.indexOf(name) > order.indexOf(prev) ? 1 : -1;
    from.classList.remove('active', 'enter-l', 'enter-r'); from.classList.add('leaving'); setTimeout(() => from.classList.remove('leaving'), R.reduceMotion ? 0 : 320);
    to.classList.remove('leaving'); to.classList.add('active', dir > 0 ? 'enter-r' : 'enter-l'); setTimeout(() => to.classList.remove('enter-l', 'enter-r'), 450);
    document.body.dataset.screen = name;
  }
  if (name === 'map') setTimeout(() => R.map.invalidateSize(), 50);
  hooks[name]?.forEach(fn => fn(opts));
}
function onScreen(name, fn) { (hooks[name] ||= []).push(fn); }
$$('#tabbar button').forEach(b => b.onclick = () => {
  if (b.dataset.s === current && b.dataset.s === 'trips' && R.state.view === 'trip') { R.state.view = 'list'; R.renderTrips(); return; } // tap again = pop to root
  if (b.dataset.s === current) { const sc = $('#screen-' + current + ' .scroller'); sc && sc.scrollTo({top: 0, behavior: R.reduceMotion ? 'auto' : 'smooth'}); return; }
  R.setMainTab(b.dataset.s);
});
// Collapsing large titles: the small nav title fades in once the large title scrolls under the bar
$$('.screen .scroller').forEach(sc => sc.addEventListener('scroll', () => sc.closest('.screen').classList.toggle('scrolled', sc.scrollTop > 44), {passive: true}));
// Trip detail is a pushed screen inside Trips: mirror its title into the nav bar
new MutationObserver(() => { const t = $('#tripDetail:not(.hidden) .trip-title'); $('#screen-trips .nav-small').textContent = t ? t.textContent : 'Trips'; }).observe($('#tab-trips'), {childList: true, subtree: true});
addEventListener('resize', moveTabInd);
R.nav = {go, onScreen, current: () => current};
R.onBoot({init: () => {
  document.body.dataset.screen = 'home'; requestAnimationFrame(moveTabInd);
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.documentElement.classList.add('standalone');
  const sp = $('#splash'); setTimeout(() => { sp.classList.add('done'); setTimeout(() => sp.remove(), 600); }, R.reduceMotion ? 0 : 650);
  const h = location.hash.slice(1); R.setMainTab(order.includes(h) ? h : 'home');
  $('#searchInput').addEventListener('focus', () => R.expandSheet());
}});
})();
/* The connection banner is a transient heads-up: it slides away after a few seconds (tap to dismiss sooner); the status stays in the Home pill */
(() => {
  const b = document.getElementById('netBanner'); if (!b) return; let t, cur = '', dismissed = '';
  const keyOf = () => b.className.replace(/\b(auto-out|pop-in|hidden)\b/g, '').trim() + '|' + b.textContent.slice(0, 40);
  const hide = () => { dismissed = cur; if (b.classList.contains('hidden')) return; b.classList.add('auto-out'); setTimeout(() => { b.classList.add('hidden'); b.classList.remove('auto-out'); }, 260); };
  new MutationObserver(() => { if (b.classList.contains('hidden')) return; const k = keyOf(); if (k === dismissed) { b.classList.add('hidden'); return; } if (k === cur) return; cur = k; clearTimeout(t); t = setTimeout(hide, 6500); })
    .observe(b, {attributes: true, attributeFilter: ['class'], childList: true});
  b.addEventListener('click', e => { if (!e.target.closest('button')) { clearTimeout(t); hide(); } });
  const reset = () => { dismissed = ''; cur = ''; }; addEventListener('online', reset); addEventListener('offline', reset);
})();
