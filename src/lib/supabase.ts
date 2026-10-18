import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './env';

export const supabase = createClient(isConfigured ? SUPABASE_URL : 'http://localhost:54321', isConfigured ? SUPABASE_ANON_KEY : 'not-configured-placeholder-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'german-duo-auth' },
  realtime: { params: { eventsPerSecond: 10 } },
});
