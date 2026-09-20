import { CONFIG } from './config.js';
import { state } from './state.js';
import { esc, initials } from './utils.js';

export function renderTop(view) {
  const map = new Map();
  state.pages.forEach(p => {
    const k = p.user_id || 'x:' + p.uploader;
    const e = map.get(k) || { name: p.uploader, n: 0, me: p.user_id === state.user.id };
    e.n++; map.set(k, e);
  });
  const rank = [...map.values()].sort((a, b) => b.n - a.n).slice(0, 10);
  const medal = i => ['🥇', '🥈', '🥉'][i] || (i + 1);

  const sc = {}; state.pages.forEach(p => sc[p.subject] = (sc[p.subject] || 0) + 1);
  const max = Math.max(1, ...Object.values(sc));

  view.innerHTML = `
    <h2 class="page-title">🏆 Top Contributors</h2>
    <p class="page-sub">Jinhon ne sabse zyada pages upload kiye.</p>
    <div class="stats">
      <div class="stat"><b>${state.pages.length}</b><small>Total pages</small></div>
      <div class="stat"><b>${map.size}</b><small>Contributors</small></div>
      <div class="stat"><b>${state.pages.filter(p => p.user_id === state.user.id).length}</b><small>Aapke pages</small></div>
      <div class="stat"><b>${state.favs.size}</b><small>Aapki favourites</small></div>
    </div>
    <div class="list">${rank.length ? rank.map((r, i) => `
      <div class="item ${i === 0 ? 'first' : ''}">
        <div class="rank">${medal(i)}</div>
        <div class="avatar">${esc(initials(r.name))}</div>
        <div class="grow"><b>${esc(r.name)}${r.me ? '<span class="badge ok">Aap</span>' : ''}${i === 0 ? '<span class="badge admin">Top Contributor</span>' : ''}</b>
        <small>${r.n} page${r.n > 1 ? 's' : ''} upload kiye</small></div>
      </div>`).join('') : `<div class="empty"><h3>Abhi koi upload nahi</h3><p>Pehle contributor aap ban sakte ho!</p><a class="btn" href="#/">Upload karo</a></div>`}</div>
    <h3 class="section-title">Subject-wise pages</h3>
    <div class="bars">${CONFIG.SUBJECTS.map(s => `
      <div class="bar-row"><span>${esc(s.name)}</span><div class="bar-track"><div class="bar-fill" style="--c:${s.color};width:${((sc[s.name] || 0) / max) * 100}%"></div></div><span>${sc[s.name] || 0}</span></div>`).join('')}</div>`;
}
