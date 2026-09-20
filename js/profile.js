import { state, isAdmin, emitChange } from './state.js';
import { sb } from './db.js';
import { esc, initials, toast, ask, friendlyError } from './utils.js';
import { cardHTML, bindGrid } from './gallery.js';

export function renderProfile(view) {
  const mine = state.pages.filter(p => p.user_id === state.user.id);
  const dark = document.documentElement.dataset.theme === 'dark';
  view.innerHTML = `
    <h2 class="page-title">Mera account</h2>
    <div class="item" style="margin:12px 0">
      <div class="avatar">${esc(initials(state.profile.full_name))}</div>
      <div class="grow"><b>${esc(state.profile.full_name)}${isAdmin() ? '<span class="badge admin">Admin</span>' : ''}</b>
      <small>${esc(state.user.email)}</small></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${mine.length}</b><small>Meri uploads</small></div>
      <div class="stat"><b>${state.favs.size}</b><small>Favourites</small></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn ghost" id="pName">✏️ Naam badlo</button>
      <button class="btn ghost" id="pTheme">${dark ? '☀️ Light mode' : '🌙 Dark mode'}</button>
      <button class="btn danger" id="pOut">Logout</button>
    </div>
    <h3 class="section-title">Meri uploads</h3>
    <section id="grid" class="grid"></section>`;

  const grid = view.querySelector('#grid');
  if (!mine.length) grid.innerHTML = `<div class="empty"><h3>Abhi koi upload nahi</h3><p>Apni copy ke pages upload karo, sab ki madad hogi.</p><a class="btn" href="#/">Upload karo</a></div>`;
  else { grid.innerHTML = mine.map(cardHTML).join(''); bindGrid(grid, mine, { onChange: emitChange }); }

  view.querySelector('#pTheme').onclick = () => document.getElementById('themeBtn').click();
  view.querySelector('#pOut').onclick = () => document.dispatchEvent(new CustomEvent('app:logout'));
  view.querySelector('#pName').onclick = async () => {
    const name = await ask({ title: 'Naam badlo', ok: 'Save karo', input: { label: 'Naya naam', value: state.profile.full_name, required: true, max: 40 } });
    if (!name) return;
    const { error } = await sb.rpc('update_my_name', { p_name: name });
    if (error) return toast(error.message || friendlyError(error), 'err');
    state.profile.full_name = name; toast('Naam badal gaya ✓'); emitChange();
  };
}
