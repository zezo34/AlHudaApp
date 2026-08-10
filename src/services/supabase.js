import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client configuration.
 *
 * Best practice: put these two values in a `.env` file at the project root
 * (D:\AlHudaApp\.env) — Expo SDK 54 loads `EXPO_PUBLIC_*` variables
 * automatically and inlines them at build time:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxx
 *
 * If the `.env` file is missing, the app falls back to the values below so
 * nothing breaks during development. See SUPABASE_SETUP.md for full steps.
 */

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://ctvgzbcrkvswrhkaqstu.supabase.co';

// Public (anon / publishable) key only — never put the service role key here.
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_3FJWwYR5mXjCDyaG4KspEg__4vsIeJI';

// True when we have a usable pair of credentials. The offline data layer uses
// this to skip network calls entirely when Supabase is not configured yet,
// so the app still boots and works from its local cache.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage, // persist auth session across restarts (works offline)
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
