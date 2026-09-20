export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = ''; }, 3000);
}

export function todayStr() { return new Date().toLocaleDateString('en-CA'); }

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}

export function fmtDate(d) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'abhi abhi';
  if (s < 3600) return Math.floor(s / 60) + ' min pehle';
  if (s < 86400) return Math.floor(s / 3600) + ' ghante pehle';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' din pehle';
  return fmtDate(iso.slice(0, 10));
}

export const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
export const safeName = s => String(s).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 40) || 'x';

export async function blobOf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch failed');
  return r.blob();
}

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function friendlyError(e) {
  const m = String(e?.message || e || '').toLowerCase();
  if (m.includes('invalid login')) return 'Email ya password galat hai.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ye email pehle se register hai. Login karo.';
  if (m.includes('email not confirmed')) return 'Pehle apna email verify karo (inbox check karo).';
  if (m.includes('database error saving new user')) return 'Signup nahi hui. Class code galat ho sakta hai.';
  if (m.includes('at least') && m.includes('character')) return 'Password kam az kam 6 characters ka rakho.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Bohat zyada koshish ho gayi. Thodi der baad try karo.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Internet nahi chal raha. Check karke dobara try karo.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'Ye karne ki ijazat nahi hai (account block ho sakta hai).';
  if (e?.code === '23505') return 'Ye pehle hi ho chuka hai.';
  return 'Kuch masla ho gaya. Dobara try karo.';
}

/* ---------- Sheet (popup) ---------- */
let lockCount = 0;
function lock(on) {
  lockCount = Math.max(0, lockCount + (on ? 1 : -1));
  document.body.style.overflow = lockCount ? 'hidden' : '';
}

export function sheet(html) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(ov);
  lock(true);
  let closed = false;
  const api = { el: ov.firstElementChild, close: null, onClose: null };
  const onKey = e => { if (e.key === 'Escape') api.close(); };
  api.close = () => {
    if (closed) return; closed = true;
    ov.remove(); lock(false);
    document.removeEventListener('keydown', onKey);
    if (api.onClose) api.onClose();
  };
  ov.addEventListener('mousedown', e => { if (e.target === ov) api.close(); });
  document.addEventListener('keydown', onKey);
  return api;
}

/* ---------- Confirm / input dialog ---------- */
export function ask({ title, message = '', ok = 'Theek hai', cancel = 'Cancel', danger = false, input = null }) {
  return new Promise(resolve => {
    let field = '';
    if (input) {
      field = `<div class="row"><label for="askIn">${esc(input.label || '')}</label>` +
        (input.multiline
          ? `<textarea class="field" id="askIn" maxlength="${input.max || 300}" placeholder="${esc(input.placeholder || '')}"></textarea>`
          : `<input class="field" id="askIn" maxlength="${input.max || 100}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}">`) +
        `</div>`;
    }
    const s = sheet(`<h2>${esc(title)}</h2>${message ? `<p class="muted">${esc(message)}</p>` : ''}${field}
      <div class="err" id="askErr"></div>
      <div class="sheet-actions">
        <button class="btn ghost" id="askNo">${esc(cancel)}</button>
        <button class="btn ${danger ? 'danger' : ''}" id="askYes">${esc(ok)}</button>
      </div>`);
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); s.close(); };
    s.onClose = () => { if (!done) { done = true; resolve(input ? null : false); } };
    const inp = s.el.querySelector('#askIn');
    if (inp) setTimeout(() => inp.focus(), 50);
    s.el.querySelector('#askNo').onclick = () => finish(input ? null : false);
    s.el.querySelector('#askYes').onclick = () => {
      if (input) {
        const v = inp.value.trim();
        if (input.required && !v) { s.el.querySelector('#askErr').textContent = 'Ye likhna zaroori hai.'; return; }
        finish(v);
      } else finish(true);
    };
  });
}
