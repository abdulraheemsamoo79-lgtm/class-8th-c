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

// Ask the app to redraw the screen after data changes
export const emitChange = () => document.dispatchEvent(new CustomEvent('app:changed'));
