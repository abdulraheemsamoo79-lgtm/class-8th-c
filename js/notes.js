import { CONFIG } from './config.js';
import { state } from './state.js';
import { emitChange } from './state.js';
import { esc, debounce, toast, todayStr, addDays, blobOf, saveBlob, safeName, friendlyError, sheet } from './utils.js';
import { cardHTML, bindGrid, colorOf, fileNameFor } from './gallery.js';
import { uploadOne } from './data.js';

const F = { subject: 'All', q: '', chapter: '', sort: 'new', mine: false };
export function setSubjectFilter(s) { F.subject = s; F.chapter = ''; }

function baseList() {
  return state.pages.filter(p => F.subject === 'All' || p.subject === F.subject);
}

function applyFilters() {
  const q = F.q.trim().toLowerCase();
  let r = baseList().filter(p =>
    (!F.chapter || p.chapter === F.chapter) &&
    (!F.mine || p.user_id === state.user.id) &&
    (!q || `${p.chapter} ${p.uploader} ${p.subject}`.toLowerCase().includes(q)));
  if (F.sort === 'old') r = [...r].reverse();
  if (F.sort === 'date') r = [...r].sort((a, b) => b.note_date.localeCompare(a.note_date));
  return r;
}

function hwBanner() {
  const t = todayStr(), end = addDays(t, 7);
  const n = state.homework.filter(h => h.due_date >= t && h.due_date <= end).length;
  if (!n) return '';
  return `<a class="banner" href="#/homework"><span>📝 <b>${n}</b> homework is hafte ka baaki hai</span><span>Dekho ›</span></a>`;
}

export function renderNotes(view) {
  view.innerHTML = `
    ${hwBanner()}
    <nav class="chips" id="chips" aria-label="Subjects"></nav>
    <section class="filters">
      <input class="field" id="search" type="search" placeholder="Search: chapter ya student ka naam" value="${esc(F.q)}">
      <select class="select" id="chSel" aria-label="Chapter"></select>
      <select class="select" id="sortSel" aria-label="Tarteeb">
        <option value="new">Naye pehle</option><option value="old">Purane pehle</option><option value="date">Copy ki date</option>
      </select>
    </section>
    <div class="toolbar">
      <div><h2 id="ttl"></h2><span class="count" id="cnt"></span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost sm" id="mineBtn">Meri uploads</button>
        <button class="btn ghost sm" id="zipBtn">⬇ Sab download (ZIP)</button>
      </div>
    </div>
    <section id="grid" class="grid"></section>`;

  const $ = s => view.querySelector(s);
  $('#sortSel').value = F.sort;
  $('#mineBtn').classList.toggle('warn', F.mine);

  const drawChips = () => {
    const counts = {}; state.pages.forEach(p => counts[p.subject] = (counts[p.subject] || 0) + 1);
    const all = [{ name: 'All', label: 'Sab', color: '#14213d' }, ...CONFIG.SUBJECTS.map(s => ({ ...s, label: s.name }))];
    $('#chips').innerHTML = all.map(s => {
      const n = s.name === 'All' ? state.pages.length : (counts[s.name] || 0);
      return `<button class="chip ${F.subject === s.name ? 'active' : ''}" data-s="${esc(s.name)}" style="--c:${s.color}"><i></i>${esc(s.label)} <small>${n}</small></button>`;
    }).join('');
    $('#chips').querySelectorAll('.chip').forEach(b => b.onclick = () => {
      F.subject = b.dataset.s; F.chapter = ''; drawChips(); drawChapters(); drawGrid();
    });
  };

  const drawChapters = () => {
    const set = [...new Set(baseList().map(p => p.chapter))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (F.chapter && !set.includes(F.chapter)) F.chapter = '';
    $('#chSel').innerHTML = `<option value="">Sab chapters</option>` + set.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('#chSel').value = F.chapter;
  };

  let shown = [];
  const drawGrid = () => {
    shown = applyFilters();
    $('#ttl').textContent = F.subject === 'All' ? 'Sab pages' : F.subject;
    $('#cnt').textContent = `${shown.length} page${shown.length === 1 ? '' : 's'}`;
    $('#zipBtn').hidden = !shown.length;
    if (!shown.length) {
      const none = !state.pages.length;
      $('#grid').innerHTML = `<div class="empty"><h3>${none ? 'Abhi koi page nahi' : 'Kuch nahi mila'}</h3>
        <p>${none ? 'Sabse pehle apni copy ke pages upload karo.' : 'Search ya filter badal ke dekho.'}</p>
        <button class="btn" id="emUp">＋ Pages upload karo</button></div>`;
      $('#emUp').onclick = () => openUpload();
      $('#grid').onclick = null;
      return;
    }
    $('#grid').innerHTML = shown.map(cardHTML).join('');
    bindGrid($('#grid'), shown, { onChange: emitChange });
  };

  $('#search').addEventListener('input', debounce(e => { F.q = e.target.value; drawGrid(); }, 150));
  $('#chSel').onchange = e => { F.chapter = e.target.value; drawGrid(); };
  $('#sortSel').onchange = e => { F.sort = e.target.value; drawGrid(); };
  $('#mineBtn').onclick = e => { F.mine = !F.mine; e.currentTarget.classList.toggle('warn', F.mine); drawGrid(); };
  $('#zipBtn').onclick = () => zipDownload(shown, $('#zipBtn'));

  drawChips(); drawChapters(); drawGrid();
}

/* ---------- ZIP ---------- */
async function zipDownload(list, btn) {
  if (!list.length) return;
  if (!window.JSZip) return toast('ZIP tool load nahi hua, page refresh karo', 'err');
  if (list.length > 60) {
    const { ask } = await import('./utils.js');
    const ok = await ask({ title: `${list.length} photos hain`, message: 'ZIP banne mein thoda time lag sakta hai. Jaari rakhein?', ok: 'Haan, banao' });
    if (!ok) return;
  }
  const label = btn.textContent; btn.disabled = true;
  try {
    const zip = new window.JSZip();
    for (let i = 0; i < list.length; i++) {
      btn.textContent = `Ban raha hai ${i + 1}/${list.length}…`;
      zip.file(fileNameFor(list[i], String(i + 1).padStart(3, '0')), await blobOf(list[i].url));
    }
    btn.textContent = 'ZIP ban rahi hai…';
    const out = await zip.generateAsync({ type: 'blob' });
    saveBlob(out, `${safeName(CONFIG.APP_NAME)}_${F.subject === 'All' ? 'sab' : safeName(F.subject)}.zip`);
    toast('ZIP download ho gayi ✓');
  } catch { toast('ZIP nahi ban saki, dobara try karo', 'err'); }
  btn.disabled = false; btn.textContent = label;
}

/* ---------- Favourites view ---------- */
export function renderFavs(view) {
  const list = state.pages.filter(p => state.favs.has(p.id));
  view.innerHTML = `<h2 class="page-title">♥ Meri favourites</h2>
    <p class="page-sub">Jo pages aapne save kiye hain, wo yahan milenge.</p>
    <section id="grid" class="grid"></section>`;
  const grid = view.querySelector('#grid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty"><h3>Abhi kuch save nahi</h3><p>Kisi bhi page par ♡ dabao, wo yahan aa jayega.</p><a class="btn" href="#/">Notes dekho</a></div>`;
    return;
  }
  grid.innerHTML = list.map(cardHTML).join('');
  bindGrid(grid, list, { onChange: emitChange, refreshOnFav: true });
}

/* ---------- Upload ---------- */
export function openUpload() {
  const today = todayStr();
  const s = sheet(`
    <h2>Copy ke pages upload karo</h2>
    <div class="row"><label for="uSub">Subject</label>
      <select class="select" id="uSub">${CONFIG.SUBJECTS.map(x => `<option>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="row"><label for="uCh">Chapter / Topic</label>
      <input class="field" id="uCh" list="chList" maxlength="80" placeholder="Jaise: Chapter 5 – Cells" autocomplete="off">
      <datalist id="chList"></datalist></div>
    <div class="row"><label for="uDate">Copy ki date</label><input class="field" id="uDate" type="date" value="${today}" max="${today}"></div>
    <div class="row"><label>Photos (ek saath kai chun sakte ho)</label>
      <label class="drop" for="uFiles" id="uDrop">📷 Yahan tap karke photos chuno</label>
      <input id="uFiles" type="file" accept="image/*" multiple hidden>
      <div class="previews" id="uPrev"></div></div>
    <div class="progress" id="uProg"><div id="uBar"></div></div>
    <div class="err" id="uErr" role="alert"></div>
    <div class="sheet-actions"><button class="btn ghost" id="uNo">Band karo</button><button class="btn" id="uGo">Upload karo</button></div>`);
  const q = x => s.el.querySelector(x);
  let files = [];

  const fillChapters = () => {
    const set = [...new Set(state.pages.filter(p => p.subject === q('#uSub').value).map(p => p.chapter))];
    q('#chList').innerHTML = set.map(c => `<option value="${esc(c)}">`).join('');
  };
  q('#uSub').onchange = fillChapters;
  const cur = F.subject !== 'All' ? F.subject : null;
  if (cur) q('#uSub').value = cur;
  fillChapters();

  q('#uFiles').onchange = e => {
    files = [...e.target.files].filter(f => f.type.startsWith('image/'));
    q('#uDrop').textContent = files.length ? `📷 ${files.length} photo chuni gayi (badalne ke liye tap karo)` : '📷 Yahan tap karke photos chuno';
    q('#uPrev').innerHTML = '';
    files.slice(0, 8).forEach(f => {
      const im = document.createElement('img'); im.alt = '';
      im.src = URL.createObjectURL(f); im.onload = () => URL.revokeObjectURL(im.src);
      q('#uPrev').appendChild(im);
    });
  };
  q('#uNo').onclick = () => s.close();

  q('#uGo').onclick = async () => {
    const err = m => q('#uErr').textContent = m; err('');
    const subject = q('#uSub').value, chapter = q('#uCh').value.trim(), date = q('#uDate').value;
    if (!chapter) return err('Chapter ya topic ka naam likho.');
    if (!date) return err('Date chuno.');
    if (!files.length) return err('Kam az kam ek photo chuno.');
    if (files.length > CONFIG.MAX_PHOTOS_PER_UPLOAD) return err(`Ek baar mein ${CONFIG.MAX_PHOTOS_PER_UPLOAD} se zyada photos nahi.`);
    const go = q('#uGo'); go.disabled = true; q('#uNo').disabled = true; q('#uProg').style.display = 'block';
    let ok = 0, fail = 0, lastErr = null;
    for (let i = 0; i < files.length; i++) {
      q('#uBar').style.width = `${(i / files.length) * 100}%`; go.textContent = `Upload ${i + 1}/${files.length}…`;
      try { const row = await uploadOne(files[i], { subject, chapter, date }, i); state.pages.unshift(row); ok++; }
      catch (e) { fail++; lastErr = e; }
    }
    q('#uBar').style.width = '100%';
    if (ok) {
      F.subject = subject; F.chapter = '';
      s.close();
      toast(fail ? `${ok} upload hui, ${fail} nahi hui` : `${ok} page${ok > 1 ? 's' : ''} upload ho gaye ✓`);
      emitChange();
    } else {
      go.disabled = false; q('#uNo').disabled = false; go.textContent = 'Upload karo'; q('#uProg').style.display = 'none';
      err(friendlyError(lastErr));
    }
  };
}
