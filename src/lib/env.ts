// Only PUBLIC values live here. The anon/publishable key is designed to be public; data is protected by Row Level Security.
export const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
export const SUPABASE_ANON_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const isConfigured: boolean = /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_URL.includes('YOUR-PROJECT-REF');
