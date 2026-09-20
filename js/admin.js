import { CONFIG } from './config.js';
import { sb } from './db.js';
import { state, emitChange } from './state.js';
import { esc, initials, fmtDate, timeAgo, toast, ask, debounce } from './utils.js';
import { deletePage, deletePagesBulk, loadProfilesMap } from './data.js';
import { openLightbox } from './gallery.js';

let tab = 'users';
let users = [];
let userQ = '';
let upQ = '';
let upLimit = 40;

const skeleton = () => Array(4).fill('<div class="skel row-skel"></div>').join('');
const fail = (e) => toast(e?.message || 'Kuch masla ho gaya', 'err');

export function renderAdmin(view) {
  view.innerHTML = `
    <h2 class="page-title">🛡 Admin panel</h2>
    <p class="page-sub">Students ko ban/unban karo, galat uploads hatao aur reports dekho.</p>
    <div class="tabs" id="tabs">
      <button class="tab" data-t="users">👥 Students</button>
      <button class="tab" data-t="uploads">🖼 Uploads</button>
      <button class="tab" data-t="reports">🚩 Reports <span id="repN"></span></button>
      <button class="tab" data-t="settings">⚙️ Settings</button>
    </div>
    <div id="adBody"></div>`;
  const body = view.querySelector('#adBody');

  const show = async () => {
    view.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.t === tab));
    body.onclick = null;
    body.innerHTML = skeleton();
    try {
      if (tab === 'users') await usersTab(body);
      else if (tab === 'uploads') uploadsTab(body);
      else if (tab === 'reports') await reportsTab(body, view);
      else await settingsTab(body);
    } catch (e) {
      body.innerHTML = `<div class="empty"><h3>Load nahi hua</h3><p>${esc(e?.message || 'Internet check karo')}</p><button class="btn" id="rt">Dobara try karo</button></div>`;
      body.querySelector('#rt').onclick = show;
    }
  };
  view.querySelector('#tabs').onclick = e => {
    const b = e.target.closest('.tab'); if (!b) return; tab = b.dataset.t; show();
  };
  // open reports ka number
  sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open').then(({ count }) => {
    const n = view.querySelector('#repN'); if (n && count) n.textContent = `(${count})`;
  });
  show();
}

/* ---------------- Users ---------------- */
async function usersTab(body) {
  const { data, error } = await sb.rpc('admin_list_users');
  if (error) throw error;
  users = data || [];
  const banned = users.filter(u => u.banned).length;
  body.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${users.length}</b><small>Total students</small></div>
      <div class="stat"><b>${users.filter(u => u.role === 'admin').length}</b><small>Admins</small></div>
      <div class="stat"><b>${banned}</b><small>Blocked</small></div>
      <div class="stat"><b>${state.pages.length}</b><small>Total pages</small></div>
    </div>
    <div class="row"><input class="field" id="uQ" type="search" placeholder="Naam ya email se dhoondo" value="${esc(userQ)}"></div>
    <div class="list" id="uList"></div>`;
  const list = body.querySelector('#uList');
  const draw = () => {
    const q = userQ.trim().toLowerCase();
    const rows = users.filter(u => !q || `${u.full_name} ${u.email}`.toLowerCase().includes(q));
    list.innerHTML = rows.length ? rows.map(userRow).join('') : `<div class="empty"><h3>Koi student nahi mila</h3></div>`;
  };
  body.querySelector('#uQ').addEventListener('input', debounce(e => { userQ = e.target.value; draw(); }, 150));
  draw();

  list.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const u = users.find(x => x.id === b.dataset.id); if (!u) return;
    const act = b.dataset.a;
    try {
      if (act === 'ban') {
        const reason = await ask({ title: `${u.full_name} ko block karein?`, message: 'Block hone ke baad ye student notes dekh ya upload nahi kar sakega.',
          ok: 'Block karo', danger: true, input: { label: 'Wajah (student ko dikhegi)', placeholder: 'Jaise: galat photos upload ki', max: 120 } });
        if (reason === null) return;
        const { error } = await sb.rpc('admin_set_ban', { p_target: u.id, p_ban: true, p_reason: reason || null });
        if (error) throw error; toast('Student block ho gaya');
      } else if (act === 'unban') {
        if (!await ask({ title: `${u.full_name} ko unblock karein?`, ok: 'Unblock karo' })) return;
        const { error } = await sb.rpc('admin_set_ban', { p_target: u.id, p_ban: false, p_reason: null });
        if (error) throw error; toast('Unblock ho gaya ✓');
      } else if (act === 'role') {
        const makeAdmin = u.role !== 'admin';
        if (!await ask({ title: makeAdmin ? `${u.full_name} ko admin banayein?` : `${u.full_name} ko student banayein?`,
          message: makeAdmin ? 'Admin sab kuch delete/ban kar sakta hai.' : '', ok: 'Haan' })) return;
        const { error } = await sb.rpc('admin_set_role', { p_target: u.id, p_role: makeAdmin ? 'admin' : 'student' });
        if (error) throw error; toast('Role badal gaya ✓');
      } else if (act === 'wipe') {
        const mine = state.pages.filter(p => p.user_id === u.id);
        if (!mine.length) return toast('Is student ki koi upload nahi');
        if (!await ask({ title: `${mine.length} uploads delete karein?`, message: `${u.full_name} ke saare pages hamesha ke liye hat jayenge.`, ok: 'Sab delete karo', danger: true })) return;
        await deletePagesBulk(mine); toast('Uploads delete ho gayi');
      } else if (act === 'del') {
        const mine = state.pages.filter(p => p.user_id === u.id);
        if (!await ask({ title: `${u.full_name} ka account delete karein?`, message: 'Account hamesha ke liye hat jayega. Uske pages rehte hain (naam ke saath).', ok: 'Account delete karo', danger: true })) return;
        const wipe = mine.length ? await ask({ title: 'Uske pages bhi delete karein?', message: `${mine.length} pages hain.`, ok: 'Haan, pages bhi', cancel: 'Nahi, rehne do' }) : false;
        if (wipe) await deletePagesBulk(mine);
        const { error } = await sb.rpc('admin_delete_user', { p_target: u.id });
        if (error) throw error; toast('Account delete ho gaya');
      }
      emitChange();
    } catch (ex) { fail(ex); }
  };
}

function userRow(u) {
  const me = u.id === state.user.id;
  return `<div class="item col">
    <div style="display:flex;gap:12px;align-items:center">
      <div class="avatar">${esc(initials(u.full_name))}</div>
      <div class="grow"><b>${esc(u.full_name)}${me ? '<span class="badge ok">Aap</span>' : ''}${u.role === 'admin' ? '<span class="badge admin">Admin</span>' : ''}${u.banned ? '<span class="badge ban">Blocked</span>' : ''}</b>
        <small>${esc(u.email)}</small>
        <small>${u.pages_count} uploads · Join: ${timeAgo(u.created_at)}${u.banned && u.ban_reason ? ' · Wajah: ' + esc(u.ban_reason) : ''}</small></div>
    </div>
    ${me ? '' : `<div class="acts">
      ${u.banned ? `<button class="btn sm" data-a="unban" data-id="${u.id}">✅ Unblock</button>`
                 : (u.role === 'admin' ? '' : `<button class="btn danger sm" data-a="ban" data-id="${u.id}">🚫 Block</button>`)}
      <button class="btn ghost sm" data-a="role" data-id="${u.id}">${u.role === 'admin' ? '⬇ Student banao' : '⭐ Admin banao'}</button>
      ${u.pages_count ? `<button class="btn ghost sm" data-a="wipe" data-id="${u.id}">🧹 Uploads hatao</button>` : ''}
      <button class="btn ghost sm" data-a="del" data-id="${u.id}">🗑 Account delete</button>
    </div>`}
  </div>`;
}

/* ---------------- Uploads ---------------- */
function uploadsTab(body) {
  body.innerHTML = `
    <div class="row"><input class="field" id="upQ" type="search" placeholder="Chapter, subject ya student ka naam" value="${esc(upQ)}"></div>
    <div id="upInfo" class="muted" style="margin-bottom:10px"></div>
    <div class="list" id="upList"></div>
    <div style="text-align:center;margin-top:12px"><button class="btn ghost" id="more">Aur dikhao</button></div>`;
  const list = body.querySelector('#upList');
  let rows = [];
  const draw = () => {
    const q = upQ.trim().toLowerCase();
    rows = state.pages.filter(p => !q || `${p.subject} ${p.chapter} ${p.uploader}`.toLowerCase().includes(q));
    body.querySelector('#upInfo').textContent = `${rows.length} pages`;
    body.querySelector('#more').hidden = rows.length <= upLimit;
    list.innerHTML = rows.length ? rows.slice(0, upLimit).map((p, i) => `
      <div class="item">
        <img class="th" loading="lazy" src="${esc(p.url)}" alt="" data-view="${i}" style="cursor:pointer">
        <div class="grow"><b>${esc(p.subject)} – ${esc(p.chapter)}</b><small>By ${esc(p.uploader)}</small><small>${fmtDate(p.note_date)} · ${timeAgo(p.created_at)}</small></div>
        <button class="btn danger sm" data-del="${i}" aria-label="Delete">🗑</button>
      </div>`).join('') : `<div class="empty"><h3>Koi upload nahi mili</h3></div>`;
  };
  body.querySelector('#upQ').addEventListener('input', debounce(e => { upQ = e.target.value; upLimit = 40; draw(); }, 150));
  body.querySelector('#more').onclick = () => { upLimit += 40; draw(); };
  list.onclick = async e => {
    const v = e.target.closest('[data-view]');
    if (v) return openLightbox(rows, +v.dataset.view, () => draw());
    const d = e.target.closest('[data-del]'); if (!d) return;
    const p = rows[+d.dataset.del];
    if (!await ask({ title: 'Ye page delete karein?', message: `${p.subject} – ${p.chapter} (${p.uploader})`, ok: 'Delete karo', danger: true })) return;
    try { await deletePage(p); toast('Delete ho gaya'); draw(); emitChange(); } catch (ex) { fail(ex); }
  };
  draw();
}

/* ---------------- Reports ---------------- */
async function reportsTab(body, view) {
  const [{ data, error }] = await Promise.all([
    sb.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false }),
    state.profiles ? Promise.resolve() : loadProfilesMap()
  ]);
  if (error) throw error;
  const reps = data || [];
  const n = view.querySelector('#repN'); if (n) n.textContent = reps.length ? `(${reps.length})` : '';
  if (!reps.length) { body.innerHTML = `<div class="empty"><h3>Koi report nahi 🎉</h3><p>Sab kuch theek chal raha hai.</p></div>`; return; }
  body.innerHTML = `<div class="list">${reps.map(r => {
    const p = state.pages.find(x => x.id === r.page_id);
    if (!p) return '';
    return `<div class="item col">
      <div style="display:flex;gap:12px">
        <img class="th" src="${esc(p.url)}" alt="" data-view="${r.id}" style="cursor:pointer">
        <div class="grow"><b>${esc(p.subject)} – ${esc(p.chapter)}</b>
          <small>Upload: ${esc(p.uploader)}</small>
          <small>Report: ${esc(state.profiles?.[r.user_id] || 'Student')} · ${timeAgo(r.created_at)}</small>
          <small style="color:var(--ink);margin-top:4px">“${esc(r.reason)}”</small></div>
      </div>
      <div class="acts">
        <button class="btn ghost sm" data-a="ok" data-id="${r.id}">✅ Theek hai, hatao report</button>
        <button class="btn danger sm" data-a="del" data-id="${r.id}">🗑 Page delete</button>
        ${p.user_id && p.user_id !== state.user.id ? `<button class="btn ghost sm" data-a="ban" data-id="${r.id}">🚫 Uploader block</button>` : ''}
      </div></div>`;
  }).join('')}</div>`;
  body.onclick = async e => {
    const v = e.target.closest('[data-view]');
    if (v) { const r = reps.find(x => x.id === v.dataset.view); const p = state.pages.find(x => x.id === r.page_id); return openLightbox([p], 0); }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = reps.find(x => x.id === b.dataset.id); const p = state.pages.find(x => x.id === r.page_id);
    try {
      if (b.dataset.a === 'ok') {
        const { error } = await sb.from('reports').update({ status: 'resolved' }).eq('id', r.id);
        if (error) throw error; toast('Report band ho gayi');
      } else if (b.dataset.a === 'del') {
        if (!await ask({ title: 'Page delete karein?', ok: 'Delete karo', danger: true })) return;
        await deletePage(p); toast('Page delete ho gaya');
      } else if (b.dataset.a === 'ban') {
        const reason = await ask({ title: `${p.uploader} ko block karein?`, ok: 'Block karo', danger: true, input: { label: 'Wajah', max: 120 } });
        if (reason === null) return;
        const { error } = await sb.rpc('admin_set_ban', { p_target: p.user_id, p_ban: true, p_reason: reason || null });
        if (error) throw error; toast('Student block ho gaya');
      }
      renderAdmin(view);
    } catch (ex) { fail(ex); }
  };
}

/* ---------------- Settings ---------------- */
async function settingsTab(body) {
  const { data, error } = await sb.rpc('admin_get_class_code');
  if (error) throw error;
  body.innerHTML = `
    <div class="item col">
      <b>Class code</b>
      <small>Naye students ko signup ke liye ye code chahiye hota hai. Isay sirf apni class ko batao.</small>
      <div class="row" style="margin:8px 0 0"><input class="field" id="cc" value="${esc(data)}" maxlength="30"></div>
      <div class="err" id="ccE"></div>
      <div class="acts"><button class="btn" id="ccSave">Code save karo</button></div>
    </div>
    <div class="item col" style="margin-top:10px">
      <b>Tips</b>
      <small>• Agar code leak ho jaye to yahan naya code bana do. Purane students par asar nahi hota.</small>
      <small>• Koi galat photo dale to Uploads tab se delete karo, aur zaroorat ho to Students tab se block karo.</small>
      <small>• Storage bhar rahi ho to purani/faltu uploads hata do (Supabase free plan: 1 GB).</small>
    </div>`;
  body.querySelector('#ccSave').onclick = async () => {
    const code = body.querySelector('#cc').value.trim();
    if (code.length < 4) return body.querySelector('#ccE').textContent = 'Code kam az kam 4 characters ka ho.';
    const { error } = await sb.rpc('admin_set_class_code', { p_code: code });
    if (error) return body.querySelector('#ccE').textContent = error.message;
    body.querySelector('#ccE').textContent = ''; toast('Class code badal gaya ✓');
  };
}
