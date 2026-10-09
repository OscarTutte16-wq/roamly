/* Roamly – local accounts. Passwords are salted + hashed with PBKDF2-SHA256 (WebCrypto); data is namespaced per user. */
(() => {
const R = window.roamly, {$, $$, esc, toast} = R;
const ITER = 150000;
const accounts = () => R.store.global.get('accounts', {});
const saveAccounts = a => R.store.global.set('accounts', a);
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function hash(pw, salt, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter}, key, 256));
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const current = () => { const id = R.user(); return Object.values(accounts()).find(a => a.id === id) || null; };
const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

async function signUp(name, email, pw) {
  const all = accounts(); email = email.trim().toLowerCase();
  if (!name.trim()) throw ['name', 'Please enter your name'];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw ['email', 'Enter a valid email'];
  if (pw.length < 8) throw ['password', 'Use at least 8 characters'];
  if (all[email]) throw ['email', 'An account with this email already exists'];
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const acc = {id: 'u' + R.uid(), name: name.trim(), email, salt: b64(salt), hash: await hash(pw, salt), iter: ITER, created: Date.now()};
  all[email] = acc; saveAccounts(all); return acc;
}
async function signIn(email, pw) {
  const acc = accounts()[email.trim().toLowerCase()];
  // Same work whether or not the account exists, so timing doesn't reveal which emails are registered
  const h = await hash(pw, acc ? unb64(acc.salt) : new Uint8Array(16), acc?.iter || ITER);
  if (!acc || !safeEq(h, acc.hash)) throw ['password', 'Email or password is incorrect'];
  return acc;
}
function startSession(acc) {
  const guestTrips = JSON.parse(localStorage.getItem('roamly.u.guest.trips') || '[]');
  localStorage.setItem('roamly.session', acc.id);
  const mine = localStorage.getItem(`roamly.u.${acc.id}.trips`);
  if (!mine && guestTrips.length && confirm(`Move your ${guestTrips.length} trip${guestTrips.length > 1 ? 's' : ''} from this device into your account?`)) {
    for (const k of ['trips', 'rates', 'lastCur']) { const v = localStorage.getItem('roamly.u.guest.' + k); if (v != null) localStorage.setItem(`roamly.u.${acc.id}.${k}`, v); }
    localStorage.removeItem('roamly.u.guest.trips');
  }
  R.reloadUserData(acc.id); paintAvatar(); hideAuth(); toast(`Welcome${acc.created > Date.now() - 5000 ? '' : ' back'}, ${acc.name.split(' ')[0]}`);
}
function signOut() { localStorage.removeItem('roamly.session'); R.reloadUserData('guest'); paintAvatar(); showAuth('signin'); }

/* ---------- UI ---------- */
const screen = document.createElement('div');
screen.id = 'authScreen'; screen.className = 'auth hidden';
screen.innerHTML = `<div class="auth-card">
  <div class="auth-logo"><img src="icons/icon.svg" alt=""><span>Roamly</span></div>
  <p class="auth-sub">Plan trips with maps that work anywhere.</p>
  <div class="auth-tabs"><button data-m="signin" class="active">Sign in</button><button data-m="signup">Create account</button><span class="ind"></span></div>
  <form id="authForm" novalidate>
    <label class="afield" data-f="name"><span>Name</span><input id="aName" autocomplete="name"></label>
    <label class="afield" data-f="email"><span>Email</span><input id="aEmail" type="email" autocomplete="email" inputmode="email"></label>
    <label class="afield" data-f="password"><span>Password</span><div class="pw"><input id="aPw" type="password" autocomplete="current-password"><button type="button" id="aShow" aria-label="Show password">Show</button></div></label>
    <div class="aerr" id="aErr" role="alert"></div>
    <button class="btn primary auth-go" id="aGo">Sign in</button>
  </form>
  <button class="link-btn" id="authGuest">Continue without an account</button>
  <p class="auth-note">Accounts are stored only on this device.</p>
</div>`;
document.body.appendChild(screen);
let mode = 'signin';
function setMode(m) {
  mode = m; $$('.auth-tabs button', screen).forEach(b => b.classList.toggle('active', b.dataset.m === m)); R.moveIndicator($('.auth-tabs', screen));
  screen.classList.toggle('signup', m === 'signup'); $('#aGo').textContent = m === 'signup' ? 'Create account' : 'Sign in';
  $('#aPw').autocomplete = m === 'signup' ? 'new-password' : 'current-password'; $('#aErr').textContent = ''; $$('.afield', screen).forEach(f => f.classList.remove('bad'));
}
function showAuth(m = 'signin') { screen.classList.remove('hidden', 'leaving'); setMode(m); setTimeout(() => (m === 'signup' ? $('#aName') : $('#aEmail')).focus(), 350); }
function hideAuth() { screen.classList.add('leaving'); setTimeout(() => screen.classList.add('hidden'), R.reduceMotion ? 0 : 320); localStorage.setItem('roamly.authSeen', '1'); }
$$('.auth-tabs button', screen).forEach(b => b.onclick = () => setMode(b.dataset.m));
$$('.afield input', screen).forEach(i => i.addEventListener('input', () => { $('#aErr').textContent = ''; i.closest('.afield').classList.remove('bad'); }));
$('#aShow').onclick = () => { const i = $('#aPw'); i.type = i.type === 'password' ? 'text' : 'password'; $('#aShow').textContent = i.type === 'password' ? 'Show' : 'Hide'; };
$('#authGuest').onclick = () => { hideAuth(); if (R.user() !== 'guest') R.reloadUserData('guest'); paintAvatar(); };
$('#authForm').onsubmit = async e => {
  e.preventDefault(); const go = $('#aGo'); go.disabled = true; go.classList.add('busy'); $('#aErr').textContent = ''; $$('.afield', screen).forEach(f => f.classList.remove('bad'));
  try { const acc = mode === 'signup' ? await signUp($('#aName').value, $('#aEmail').value, $('#aPw').value) : await signIn($('#aEmail').value, $('#aPw').value); $('#aPw').value = ''; startSession(acc); }
  catch (err) { const [f, msg] = Array.isArray(err) ? err : ['', err.message || String(err)]; $('#aErr').textContent = msg; const fe = $(`.afield[data-f="${f}"]`, screen); if (fe) { fe.classList.remove('bad'); void fe.offsetWidth; fe.classList.add('bad'); } }
  finally { go.disabled = false; go.classList.remove('busy'); }
};

// Avatar on Home opens Profile; Profile renders the account card
function paintAvatar() {
  const acc = current(), btn = $('#homeAvatar'); if (!btn) return;
  btn.classList.toggle('guest', !acc);
  btn.innerHTML = acc ? esc(initials(acc.name)) : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
  R.profile?.render?.(); R.home?.render?.();
}
$('#homeAvatar').onclick = () => R.setMainTab('profile');
paintAvatar();
if (!localStorage.getItem('roamly.session') && !localStorage.getItem('roamly.authSeen')) showAuth('signin');
R.auth = {current, signOut, showAuth, initials, paintAvatar};
})();
