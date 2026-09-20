import { CONFIG } from './config.js';
import { state, isAdmin } from './state.js';
import { esc, fmtDate, toast, ask, safeName, blobOf, saveBlob, friendlyError } from './utils.js';
import { toggleFav, deletePage, reportPage } from './data.js';

export const colorOf = s => (CONFIG.SUBJECTS.find(x => x.name === s) || {}).color || '#64748b';
export const fileNameFor = (p, i) => `${safeName(p.subject)}_${safeName(p.chapter)}_${p.note_date}${i ? '_' + i : ''}.jpg`;

/* ---------- Card ---------- */
export function cardHTML(p, i) {
  const mine = p.user_id === state.user.id;
  const canDel = mine || isAdmin();
  const fav = state.favs.has(p.id);
  return `
  <article class="card">
    <button class="thumb" data-open="${i}" aria-label="Open ${esc(p.chapter)}">
      <img loading="lazy" src="${esc(p.url)}" alt="${esc(p.subject)} - ${esc(p.chapter)}">
      <span class="tag" style="--c:${colorOf(p.subject)}">${esc(p.subject)}</span>
    </button>
    <button class="heart ${fav ? 'on' : ''}" data-fav="${p.id}" aria-label="Favourite">${fav ? '♥' : '♡'}</button>
    <div class="meta"><b>${esc(p.chapter)}</b><span>${fmtDate(p.note_date)}</span><span>By ${esc(p.uploader)}</span></div>
    <div class="card-actions">
      <button class="btn sm" data-dl="${i}">⬇ Download</button>
      ${!mine ? `<button class="btn ghost sm sq" data-rep="${i}" title="Report" aria-label="Report">🚩</button>` : ''}
      ${canDel ? `<button class="btn danger sm sq" data-del="${i}" title="Delete" aria-label="Delete">🗑</button>` : ''}
    </div>
  </article>`;
}

/* ---------- Actions ---------- */
export async function downloadOne(p) {
  try { saveBlob(await blobOf(p.url), fileNameFor(p)); toast('Downloaded ✓'); }
  catch { window.open(p.url, '_blank'); toast('Photo opened in a new tab, save it from there'); }
}

export function syncHearts() {
  document.querySelectorAll('[data-fav]').forEach(b => {
    const on = state.favs.has(b.dataset.fav);
    b.classList.toggle('on', on); b.textContent = on ? '♥' : '♡';
  });
  if (lb && L.list[L.i]) {
    const on = state.favs.has(L.list[L.i].id);
    const f = lb.querySelector('#lbFav'); f.classList.toggle('on', on); f.textContent = on ? '♥ Saved' : '♡ Save';
  }
}

export async function favAction(id) {
  try {
    const on = await toggleFav(id);
    syncHearts();
    toast(on ? 'Saved to favourites ♥' : 'Removed from favourites');
    return true;
  } catch (e) { toast(friendlyError(e), 'err'); return false; }
}

export async function reportAction(p) {
  const reason = await ask({
    title: 'Report this page?',
    message: 'If the photo is blurry, wrong or irrelevant, let the admin know.',
    ok: 'Send report', input: { label: 'Reason', placeholder: 'e.g. The photo is blurry', required: true, multiline: true, max: 200 }
  });
  if (reason === null) return;
  try { await reportPage(p.id, reason); toast('Report sent, thank you ✓'); }
  catch (e) { toast(e?.code === '23505' ? 'You have already reported this page' : friendlyError(e), 'err'); }
}

export async function deleteAction(p) {
  const ok = await ask({ title: 'Delete this page?', message: 'This will be removed permanently.', ok: 'Delete', danger: true });
  if (!ok) return false;
  try { await deletePage(p); toast('Deleted'); return true; }
  catch (e) { toast(friendlyError(e), 'err'); return false; }
}

/* ---------- Grid wiring ---------- */
export function bindGrid(root, list, { onChange, refreshOnFav = false } = {}) {
  root.onclick = async e => {
    const t = e.target.closest('[data-open],[data-fav],[data-dl],[data-rep],[data-del]');
    if (!t || !root.contains(t)) return;
    const d = t.dataset;
    if (d.open !== undefined) return openLightbox(list, +d.open, onChange);
    if (d.fav) { const ok = await favAction(d.fav); if (ok && refreshOnFav && onChange) onChange(); return; }
    if (d.dl !== undefined) return downloadOne(list[+d.dl]);
    if (d.rep !== undefined) return reportAction(list[+d.rep]);
    if (d.del !== undefined) { if (await deleteAction(list[+d.del]) && onChange) onChange(); }
  };
}

/* ---------- Lightbox ---------- */
let lb = null;
const L = { list: [], i: 0, cb: null };

function ensureLb() {
  if (lb) return;
  lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = `
    <div class="lb-top">
      <div><b id="lbTitle"></b><small id="lbSub"></small></div>
      <button class="icon-btn" id="lbClose" aria-label="Close">✕</button>
    </div>
    <div class="lb-stage" id="lbStage"><img id="lbImg" alt="Notebook page"></div>
    <div class="lb-bar">
      <button class="btn" id="lbPrev" aria-label="Previous">‹</button>
      <span id="lbPos"></span>
      <button class="btn" id="lbNext" aria-label="Next">›</button>
      <button class="btn dl" id="lbDl">⬇ Download</button>
      <button class="btn" id="lbFav">♡ Save</button>
      <button class="btn" id="lbRep" title="Report">🚩</button>
      <button class="btn danger" id="lbDel" title="Delete">🗑</button>
    </div>`;
  document.body.appendChild(lb);
  const q = s => lb.querySelector(s);
  q('#lbClose').onclick = closeLightbox;
  q('#lbPrev').onclick = () => step(-1);
  q('#lbNext').onclick = () => step(1);
  q('#lbDl').onclick = () => downloadOne(L.list[L.i]);
  q('#lbFav').onclick = () => favAction(L.list[L.i].id);
  q('#lbRep').onclick = () => reportAction(L.list[L.i]);
  q('#lbDel').onclick = async () => {
    const p = L.list[L.i];
    if (await deleteAction(p)) {
      L.list = L.list.filter(x => x.id !== p.id);
      if (!L.list.length) closeLightbox(); else { L.i = Math.min(L.i, L.list.length - 1); showLb(); }
      if (L.cb) L.cb();
    }
  };
  q('#lbImg').onclick = () => q('#lbStage').classList.toggle('zoom');
  let tx = null;
  const stage = q('#lbStage');
  stage.addEventListener('touchstart', e => { tx = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (tx === null || stage.classList.contains('zoom')) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    tx = null;
  });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('show') || document.querySelector('.overlay')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
}

export function openLightbox(list, i, cb) {
  ensureLb();
  L.list = [...list]; L.i = i; L.cb = cb || null;
  lb.classList.add('show'); document.body.style.overflow = 'hidden';
  showLb();
}

export function isLightboxOpen() { return !!lb && lb.classList.contains('show'); }

function closeLightbox() {
  lb.classList.remove('show'); document.body.style.overflow = '';
  lb.querySelector('#lbStage').classList.remove('zoom');
}

function step(d) {
  if (!L.list.length) return;
  L.i = (L.i + d + L.list.length) % L.list.length; showLb();
}

function showLb() {
  const p = L.list[L.i];
  if (!p) return closeLightbox();
  const q = s => lb.querySelector(s);
  q('#lbStage').classList.remove('zoom');
  q('#lbImg').src = p.url;
  q('#lbTitle').textContent = `${p.subject} – ${p.chapter}`;
  q('#lbSub').textContent = `${fmtDate(p.note_date)} · By ${p.uploader}`;
  q('#lbPos').textContent = `${L.i + 1} / ${L.list.length}`;
  const mine = p.user_id === state.user.id;
  q('#lbDel').style.display = (mine || isAdmin()) ? '' : 'none';
  q('#lbRep').style.display = mine ? 'none' : '';
  syncHearts();
  [1, -1].forEach(d => { const n = L.list[(L.i + d + L.list.length) % L.list.length]; if (n) new Image().src = n.url; });
}
