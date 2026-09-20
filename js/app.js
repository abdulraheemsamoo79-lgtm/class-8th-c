import { CONFIG } from './config.js';
import { sb, configured, libLoaded } from './db.js';
import { state, isAdmin, resetState } from './state.js';
import { $, esc, toast, friendlyError } from './utils.js';
import { loadProfile, loadPages, loadFavs, loadHomework } from './data.js';
import { renderAuth, renderBanned, renderProblem } from './auth.js';
import { renderNotes, renderFavs, openUpload } from './notes.js';
import { renderHomework } from './homework.js';
import { renderTop } from './top.js';
import { renderProfile } from './profile.js';
import { renderAdmin } from './admin.js';
import { isLightboxOpen } from './gallery.js';

const view = $('#view');
document.title = CONFIG.APP_NAME;
$('#appName').textContent = CONFIG.APP_NAME;
$('#appSub').textContent = CONFIG.SCHOOL;

/* ---------- Theme ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('theme', t); } catch { /* ignore */ }
}
let saved = 'light';
try { saved = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); } catch { /* ignore */ }
applyTheme(saved);
$('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- Routes ---------- */
const ROUTES = {
  '/': { icon: '📚', label: 'Notes', fn: renderNotes, fab: true },
  '/homework': { icon: '📝', label: 'Homework', fn: renderHomework },
  '/favourites': { icon: '♥', label: 'Saved', fn: renderFavs },
  '/top': { icon: '🏆', label: 'Top', fn: renderTop },
  '/me': { icon: '👤', label: 'Mera', fn: renderProfile },
  '/admin': { icon: '🛡', label: 'Admin', fn: renderAdmin, admin: true }
};

function drawNav(path) {
  $('#nav').innerHTML = Object.entries(ROUTES)
    .filter(([, r]) => !r.admin || isAdmin())
    .map(([p, r]) => `<a class="nav-item ${p === path ? 'active' : ''}" href="#${p}"><span>${r.icon}</span>${r.label}</a>`).join('');
}

const splash = txt => `<div class="splash"><div><div class="spin"></div>${esc(txt)}</div></div>`;

/* ---------- Data loading ---------- */
async function loadAll() {
  await loadProfile();
  if (!state.profile) throw new Error('NO_PROFILE');
  if (state.profile.banned) return;
  await Promise.all([loadPages(), loadFavs(), loadHomework()]);
}

let loading = null;
function ensureLoaded() {
  if (state.loaded) return Promise.resolve();
  if (!loading) {
    loading = loadAll().then(() => { state.loaded = true; state.lastLoad = Date.now(); }).finally(() => { loading = null; });
  }
  return loading;
}

async function refresh(silent) {
  if (!state.user) return;
  try {
    await loadAll(); state.lastLoad = Date.now(); state.loaded = true;
    if (!silent) toast('Naye pages load ho gaye ✓');
    route();
  } catch (e) { if (!silent) toast(friendlyError(e), 'err'); }
}

/* ---------- Router ---------- */
let token = 0;
async function route() {
  const my = ++token;
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  view.onclick = null; view.onchange = null;

  if (!configured || !libLoaded) {
    document.body.classList.add('auth-mode');
    view.innerHTML = `<div class="auth"><div class="auth-card"><div class="logo">🔧</div><h1>Setup baaki hai</h1>
      <p class="muted sub">${!libLoaded ? 'Internet ya Supabase library load nahi hui. Page refresh karo.' : 'js/config.js mein SUPABASE_URL aur SUPABASE_ANON_KEY daalo, phir dobara deploy karo.'}</p></div></div>`;
    return;
  }

  if (!state.user) {
    if (path === '/signup') renderAuth(view, 'signup'); else renderAuth(view, 'login');
    $('#fab').hidden = true;
    return;
  }

  document.body.classList.remove('auth-mode');
  if (!state.loaded) {
    view.innerHTML = splash('Notes load ho rahe hain…');
    try { await ensureLoaded(); }
    catch (e) {
      if (my !== token) return;
      if (String(e?.message) === 'NO_PROFILE') renderProblem(view, 'Profile nahi mila', 'Aapka account poora nahi bana. Logout karke dobara signup karo ya admin se poochho.');
      else renderProblem(view, 'Load nahi hua', friendlyError(e));
      return;
    }
    if (my !== token) return;
  }

  if (state.profile.banned) { renderBanned(view, state.profile.ban_reason); return; }
  if (path === '/login' || path === '/signup') { location.hash = '#/'; return; }

  let r = ROUTES[path];
  if (!r || (r.admin && !isAdmin())) { location.hash = '#/'; return; }
  drawNav(path);
  $('#fab').hidden = !r.fab;
  r.fn(view);
  window.scrollTo(0, 0);
}

/* Data badalne par sirf dobara draw (scroll wahin rakho) */
async function redraw() {
  const y = window.scrollY;
  await route();
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', route);
document.addEventListener('app:changed', redraw);
document.addEventListener('app:login', async () => {
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user ?? null; state.loaded = false;
  if (location.hash && location.hash !== '#/') location.hash = '#/'; else route();
});
document.addEventListener('app:retry', () => { state.loaded = false; route(); });
document.addEventListener('app:logout', async () => {
  try { await sb.auth.signOut(); } catch { /* ignore */ }
  resetState(); location.hash = '#/login'; route();
});

$('#fab').onclick = () => openUpload();
$('#refreshBtn').onclick = () => refresh(false);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.loaded || !state.user) return;
  if (Date.now() - state.lastLoad < 120000) return;
  if (document.querySelector('.overlay') || isLightboxOpen()) return;
  refresh(true);
});

/* ---------- Start ---------- */
async function start() {
  if (configured && libLoaded) {
    const { data } = await sb.auth.getSession();
    state.user = data.session?.user ?? null;
    sb.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        const uid = session?.user?.id ?? null;
        if (event === 'SIGNED_OUT' && state.user) { resetState(); location.hash = '#/login'; route(); }
        else if (uid && uid !== state.user?.id) { state.user = session.user; state.loaded = false; route(); }
        else if (uid) state.user = session.user;
      }, 0);
    });
  }
  route();
}
start();
