import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Realtime sync layer (Supabase Realtime / Postgres Changes).
 *
 * A single shared channel listens to every change in the `public` schema and
 * fans the payloads out to per-table listeners. The contexts subscribe via
 * `onTableChange(table, cb)` and re-fetch that table when an event arrives,
 * so the UI reflects database changes instantly — no manual refresh needed.
 *
 * IMPORTANT: for events to be delivered, the tables must be added to the
 * `supabase_realtime` publication. Run `supabase/enable_realtime.sql` once in
 * the Supabase SQL Editor (or use Database → Replication in the dashboard).
 * If a table is not enabled yet, the app simply keeps working as before —
 * changes for it just don't arrive in real time.
 */

const listeners = new Map(); // table name -> Set<callback(payload)>
let channel = null;

function ensureChannel() {
  if (!isSupabaseConfigured || channel) return;

  channel = supabase
    .channel('app-realtime-sync')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      const table = payload && payload.table;
      if (!table) return;
      const cbs = listeners.get(table);
      if (!cbs || cbs.size === 0) return;
      cbs.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.warn(`[realtime] handler for "${table}" failed`, e);
        }
      });
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[realtime] ✅ connected — database changes will sync instantly');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime] subscription status:', status);
      }
    });
}

/**
 * Registers a callback for changes on `table` (e.g. 'profiles').
 * The channel is created lazily on the first subscription.
 * Returns an unsubscribe function.
 */
export function onTableChange(table, cb) {
  if (!listeners.has(table)) listeners.set(table, new Set());
  listeners.get(table).add(cb);
  ensureChannel();

  return () => {
    const set = listeners.get(table);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) listeners.delete(table);
  };
}

/** Small debounce helper so the contexts can coalesce rapid events. */
export function debounce(fn, ms = 400) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}
