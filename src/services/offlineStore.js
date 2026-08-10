/**
 * services/offlineStore.js
 * ------------------------
 * Thin AsyncStorage helpers used by the offline-first data layer.
 *
 *  - CACHE_PREFIX: every cached collection is stored under a namespaced key.
 *  - Pending-write queue: when a write fails (no internet), the operation is
 *    queued here and replayed later automatically (on app start and after any
 *    successful network call).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@alhuda_cache:';
const QUEUE_KEY = '@alhuda_pending_writes';
export const MIGRATION_FLAG_KEY = '@alhuda_migrated_v1';

export const cacheKey = (name) => `${CACHE_PREFIX}${name}`;

export const cacheGet = async (name, fallback = null) => {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(name));
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[offlineStore] cacheGet failed for ${name}`, e);
    return fallback;
  }
};

export const cacheSet = async (name, value) => {
  try {
    await AsyncStorage.setItem(cacheKey(name), JSON.stringify(value));
  } catch (e) {
    console.warn(`[offlineStore] cacheSet failed for ${name}`, e);
  }
};

export const cacheRemove = async (name) => {
  try {
    await AsyncStorage.removeItem(cacheKey(name));
  } catch (e) {
    console.warn(`[offlineStore] cacheRemove failed for ${name}`, e);
  }
};

/* ---------------------------- write queue ---------------------------- */

export const getPendingWrites = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const setPendingWrites = async (writes) => {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(writes));
  } catch (e) {
    console.warn('[offlineStore] setPendingWrites failed', e);
  }
};

/** Queue a write that failed while offline. op: { op, table, row?|id? } */
export const enqueueWrite = async (op) => {
  const queue = await getPendingWrites();
  // De-duplicate: one pending op per (table,id) — the newest wins.
  const filtered = queue.filter(
    (w) => !(w && w.table === op.table && (w.row && op.row) && w.row.id === op.row.id)
  );
  filtered.push(op);
  if (filtered.length > 200) filtered.splice(0, filtered.length - 200); // safety cap
  await setPendingWrites(filtered);
};

export const removePendingWrites = async (opsToRemove) => {
  const keys = opsToRemove.map((o) => `${o.table}:${o.op === 'delete' ? o.id : o.row?.id}`);
  const queue = await getPendingWrites();
  const next = queue.filter((w) => {
    const k = `${w.table}:${w.op === 'delete' ? w.id : w.row?.id}`;
    return !keys.includes(k);
  });
  await setPendingWrites(next);
};

/* ------------------------- legacy (v1) keys ------------------------- */
// Keys used by the old AsyncStorage-as-database version. On first launch of
// the Supabase-backed version, this data is pushed to Supabase once, then the
// keys are removed. See supabaseDataService.runLegacyMigration().

export const LEGACY_KEYS = {
  students: '@students_database',
  courses: '@course_content',
  subscription: '@subscription_data',
  leaveRequests: '@leave_requests',
  parentNotifications: '@parent_notifications',
  sessionReports: '@session_reports',
  paymentRequests: '@payment_requests',
  weeklyQuestion: '@weekly_question',
};
