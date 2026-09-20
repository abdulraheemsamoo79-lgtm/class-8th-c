import { CONFIG } from './config.js';
import { state, isAdmin, emitChange } from './state.js';
import { esc, fmtDate, todayStr, addDays, toast, sheet, ask, friendlyError } from './utils.js';
import { addHomework, deleteHomework } from './data.js';
import { colorOf } from './gallery.js';

const key = () => `hw_done_${state.user.id}`;
const getDone = () => { try { return new Set(JSON.parse(localStorage.getItem(key()) || '[]')); } catch { return new Set(); } };
const setDone = s => { try { localStorage.setItem(key(), JSON.stringify([...s])); } catch { /* ignore */ } };

function dueBadge(d) {
  const t = todayStr();
  if (d < t) return `<span class="due late">Overdue</span>`;
  if (d === t) return `<span class="due soon">Today</span>`;
  if (d === addDays(t, 1)) return `<span class="due soon">Tomorrow</span>`;
  return `<span class="due">${fmtDate(d)}</span>`;
}

function itemHTML(h, done) {
  const canDel = h.created_by === state.user.id || isAdmin();
  return `<div class="item hw ${done.has(h.id) ? 'done' : ''}" style="--c:${colorOf(h.subject)}">
    <input type="checkbox" data-done="${h.id}" ${done.has(h.id) ? 'checked' : ''} aria-label="Done">
    <div class="grow">
      <b class="hw-title">${esc(h.title)}</b>
      <small>${esc(h.subject)} · ${dueBadge(h.due_date)} · By ${esc(h.created_by_name)}</small>
      ${h.details ? `<small style="margin-top:4px">${esc(h.details)}</small>` : ''}
    </div>
    ${canDel ? `<button class="btn danger sm" data-del="${h.id}" aria-label="Delete">🗑</button>` : ''}
  </div>`;
}

export function renderHomework(view) {
  const t = todayStr(), done = getDone();
  const up = state.homework.filter(h => h.due_date >= t);
  const old = state.homework.filter(h => h.due_date < t).reverse();
  view.innerHTML = `
    <div class="toolbar"><div><h2 class="page-title">📝 Homework</h2><p class="page-sub" style="margin:0">Upcoming work is listed here.</p></div>
      <button class="btn" id="hwAdd">＋ Add homework</button></div>
    <h3 class="section-title">Upcoming</h3>
    <div class="list" id="hwUp">${up.length ? up.map(h => itemHTML(h, done)).join('') : `<div class="empty"><h3>No homework</h3><p>When a teacher gives homework, add it here.</p></div>`}</div>
    ${old.length ? `<h3 class="section-title">Past</h3><div class="list" id="hwOld">${old.slice(0, 15).map(h => itemHTML(h, done)).join('')}</div>` : ''}`;

  view.querySelector('#hwAdd').onclick = openAdd;
  view.onchange = e => {
    const c = e.target.closest('[data-done]'); if (!c) return;
    const s = getDone(); c.checked ? s.add(c.dataset.done) : s.delete(c.dataset.done); setDone(s);
    c.closest('.item').classList.toggle('done', c.checked);
  };
  view.onclick = async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!await ask({ title: 'Delete this homework?', ok: 'Delete', danger: true })) return;
    try { await deleteHomework(b.dataset.del); toast('Deleted'); emitChange(); }
    catch (ex) { toast(friendlyError(ex), 'err'); }
  };
}

function openAdd() {
  const t = todayStr();
  const s = sheet(`<h2>Add homework</h2>
    <div class="row"><label for="hS">Subject</label><select class="select" id="hS">${CONFIG.SUBJECTS.map(x => `<option>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="row"><label for="hT">What needs to be done?</label><input class="field" id="hT" maxlength="100" placeholder="e.g. Ex 5.2 questions 1 to 8"></div>
    <div class="row"><label for="hD">Details (optional)</label><textarea class="field" id="hD" maxlength="300"></textarea></div>
    <div class="row"><label for="hDue">Due date</label><input class="field" id="hDue" type="date" value="${addDays(t, 1)}" min="${t}"></div>
    <div class="err" id="hE" role="alert"></div>
    <div class="sheet-actions"><button class="btn ghost" id="hNo">Close</button><button class="btn" id="hGo">Save</button></div>`);
  const q = x => s.el.querySelector(x);
  q('#hNo').onclick = () => s.close();
  q('#hGo').onclick = async () => {
    const title = q('#hT').value.trim(), due = q('#hDue').value;
    if (!title) return q('#hE').textContent = 'Enter the homework.';
    if (!due) return q('#hE').textContent = 'Choose a date.';
    q('#hGo').disabled = true;
    try {
      await addHomework({ subject: q('#hS').value, title, details: q('#hD').value.trim() || null, due_date: due });
      s.close(); toast('Homework added ✓'); emitChange();
    } catch (e) { q('#hE').textContent = friendlyError(e); q('#hGo').disabled = false; }
  };
}
