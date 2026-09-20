export const state = {
  user: null,
  profile: null,
  pages: [],
  favs: new Set(),
  homework: [],
  profiles: null,
  loaded: false,
  lastLoad: 0
};

export const isAdmin = () => state.profile?.role === 'admin';

export function resetState() {
  state.user = null; state.profile = null; state.pages = []; state.favs = new Set();
  state.homework = []; state.profiles = null; state.loaded = false; state.lastLoad = 0;
}

// Data badalne ke baad screen dobara draw karwane ke liye
export const emitChange = () => document.dispatchEvent(new CustomEvent('app:changed'));
