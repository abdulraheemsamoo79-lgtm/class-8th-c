import { CONFIG } from './config.js';

export const configured = !String(CONFIG.SUPABASE_URL).includes('YOUR_') && !String(CONFIG.SUPABASE_ANON_KEY).includes('YOUR_');
export const libLoaded = typeof window !== 'undefined' && !!window.supabase;

export const sb = (configured && libLoaded)
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  : null;
