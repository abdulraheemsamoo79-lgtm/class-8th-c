import { sb } from './db.js';
import { state } from './state.js';
import { safeName } from './utils.js';

/* ---------- Load ---------- */
export async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  if (error) throw error;
  state.profile = data;
  return data;
}

export async function loadPages() {
  let all = [], from = 0; const size = 1000;
  for (;;) {
    const { data, error } = await sb.from('pages').select('*')
      .order('created_at', { ascending: false }).order('id').range(from, from + size - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < size) break;
    from += size;
  }
  state.pages = all;
  return all;
}

export async function loadFavs() {
  const { data, error } = await sb.from('favourites').select('page_id');
  if (error) throw error;
  state.favs = new Set((data || []).map(r => r.page_id));
}

export async function loadHomework() {
  const { data, error } = await sb.from('homework').select('*').order('due_date', { ascending: true });
  if (error) throw error;
  state.homework = data || [];
}

export async function loadProfilesMap() {
  const { data, error } = await sb.from('profiles').select('id, full_name');
  if (error) throw error;
  state.profiles = Object.fromEntries((data || []).map(p => [p.id, p.full_name]));
  return state.profiles;
}

/* ---------- Favourites ---------- */
export async function toggleFav(pageId) {
  if (state.favs.has(pageId)) {
    const { error } = await sb.from('favourites').delete().eq('page_id', pageId);
    if (error) throw error;
    state.favs.delete(pageId); return false;
  }
  const { error } = await sb.from('favourites').insert({ page_id: pageId });
  if (error && error.code !== '23505') throw error;
  state.favs.add(pageId); return true;
}

/* ---------- Pages ---------- */
export async function deletePage(p) {
  const { error } = await sb.from('pages').delete().eq('id', p.id);
  if (error) throw error;
  await sb.storage.from('notes').remove([p.file_path]).catch(() => {});
  state.pages = state.pages.filter(x => x.id !== p.id);
  state.favs.delete(p.id);
}

export async function deletePagesBulk(list) {
  if (!list.length) return;
  const ids = list.map(p => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await sb.from('pages').delete().in('id', ids.slice(i, i + 100));
    if (error) throw error;
  }
  const paths = list.map(p => p.file_path);
  for (let i = 0; i < paths.length; i += 100) {
    await sb.storage.from('notes').remove(paths.slice(i, i + 100)).catch(() => {});
  }
  const gone = new Set(ids);
  state.pages = state.pages.filter(x => !gone.has(x.id));
}

export async function reportPage(pageId, reason) {
  const { error } = await sb.from('reports').insert({ page_id: pageId, reason });
  if (error) throw error;
}

/* ---------- Upload ---------- */
export function compressImage(file, max = 1800, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      const r = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * r); h = Math.round(h * r);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(u);
      c.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('bad image')); };
    img.src = u;
  });
}

export async function uploadOne(file, { subject, chapter, date }, idx = 0) {
  const blob = await compressImage(file);
  const path = `${state.user.id}/${safeName(subject)}/${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}.jpg`;
  const up = await sb.storage.from('notes').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (up.error) throw up.error;
  const url = sb.storage.from('notes').getPublicUrl(path).data.publicUrl;
  const { data, error } = await sb.from('pages').insert({
    subject, chapter, note_date: date, uploader: state.profile.full_name, file_path: path, url
  }).select().single();
  if (error) { await sb.storage.from('notes').remove([path]).catch(() => {}); throw error; }
  return data;
}

/* ---------- Homework ---------- */
export async function addHomework(h) {
  const { data, error } = await sb.from('homework')
    .insert({ ...h, created_by_name: state.profile.full_name }).select().single();
  if (error) throw error;
  state.homework.push(data);
  state.homework.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export async function deleteHomework(id) {
  const { error } = await sb.from('homework').delete().eq('id', id);
  if (error) throw error;
  state.homework = state.homework.filter(h => h.id !== id);
}
