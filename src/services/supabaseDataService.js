/**
 * services/supabaseDataService.js
 * -------------------------------
 * The offline-first data layer for AlHudaApp.
 *
 * Every read is "cache first, network second":
 *   - the app renders instantly from AsyncStorage (works with no internet)
 *   - a background refresh pulls fresh rows from Supabase and updates the cache
 *
 * Every write is optimistic:
 *   - the local cache + UI update immediately
 *   - Supabase is updated in the background
 *   - if the network call fails, the operation is queued and replayed later
 *     (on app start and after any later successful call)
 *
 * Tables are the ones from supabase/schema.sql. The app's original object
 * shapes are preserved 1:1 inside the JSONB columns of each row, so screens
 * keep working unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import {
  cacheGet,
  cacheSet,
  enqueueWrite,
  getPendingWrites,
  setPendingWrites,
  removePendingWrites,
  LEGACY_KEYS,
  MIGRATION_FLAG_KEY,
} from './offlineStore';

export const TABLES = {
  profiles: 'profiles',
  courses: 'courses',
  lessons: 'lessons',
  exams: 'exams',
  examResults: 'exam_results',
  sessionReports: 'recitation_reports',
  leaveRequests: 'leave_requests',
  notifications: 'parent_notifications',
  payments: 'payments',
  appSettings: 'app_settings',
  subscriptions: 'subscriptions',
  courseEnrollments: 'course_enrollments',
};

export const CACHE_NAMES = {
  profiles: 'profiles',
  courses: 'courses',
  lessons: 'lessons',
  exams: 'exams',
  examResults: 'exam_results',
  sessionReports: 'session_reports',
  leaveRequests: 'leave_requests',
  notifications: 'notifications',
  payments: 'payments',
  appSettings: 'app_settings',
  subscriptions: 'subscriptions',
  courseEnrollments: 'course_enrollments',
};

const nowIso = () => new Date().toISOString();

/* =========================================================================
 * Schema adaptation (works on BOTH the old v1 uuid schema and the new v2
 * text-id schema, so admin writes persist no matter which is live)
 * ======================================================================= */

let schemaModeCache = null; // 'new' | 'old' | null (re-probe after failure)

/** Detects which schema the live DB uses (cached per app session).
 *  The new v2 schema has a student_code column; the old v1 schema does not. */
async function detectSchemaMode() {
  if (schemaModeCache) return schemaModeCache;
  if (!isSupabaseConfigured) return 'new';
  try {
    const { error } = await supabase.from('profiles').select('student_code').limit(1);
    if (!error) {
      schemaModeCache = 'new';
    } else if (/column .* does not exist|Could not find/i.test(error.message || '')) {
      // definitive: the student_code column is missing → old v1 schema
      schemaModeCache = 'old';
    } else {
      // network / schema-cache hiccup — do NOT cache a guess, re-probe next call
      return 'new';
    }
  } catch (e) {
    schemaModeCache = null; // offline/unknown — re-probe on next call
    return 'new';
  }
  return schemaModeCache;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID_RE.test(String(v || ''));

/** Deterministic RFC-4122 v5-style UUID derived from any string, so the same
 *  app id always maps to the same uuid (keeps FK references consistent). */
function strToUuid(input) {
  const s = String(input);
  const fnv = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  const hex = (n) => n.toString(16).padStart(8, '0');
  const u =
    hex(fnv(0x811c9dc5)) + hex(fnv(0x01000193)) +
    hex(fnv(0x9e3779b9)) + hex(fnv(0x85ebca6b));
  return (
    u.slice(0, 8) + '-' + u.slice(8, 12) + '-' +
    '5' + u.slice(13, 16) + '-' +
    ((parseInt(u[16], 16) & 0x3) | 0x8).toString(16) + u.slice(17, 20) + '-' +
    u.slice(20, 32)
  );
}

/** Canonical (server) form of an app id: the id itself when it is already a
 *  uuid, otherwise the deterministic uuid derived from it. Used by the realtime
 *  merge logic so local text ids (c1, stu_..., exam_...) always match their
 *  server uuids — prevents duplicate rows after a realtime refresh. */
export function toCanonicalId(id) {
  if (id == null) return null;
  return isUuid(id) ? String(id) : strToUuid(String(id));
}

/** Resolves a student code / app id to the profile's real uuid id (old schema
 *  keeps codes only in metadata, so FK columns must hold the uuid). */
async function resolveStudentUuid(codeOrId) {
  if (!codeOrId) return null;
  const upper = String(codeOrId).toUpperCase();
  const cached = (await cacheGet(CACHE_NAMES.profiles, [])) || [];
  const hit = cached.find(
    (p) =>
      String(p.student_code || '').toUpperCase() === upper ||
      String(p.metadata?.studentId || '').toUpperCase() === upper ||
      (isUuid(codeOrId) && String(p.id || '') === String(codeOrId))
  );
  if (hit) return hit.id;
  if (isUuid(codeOrId)) return codeOrId;
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase
      .from(TABLES.profiles)
      .select('id')
      .ilike('metadata->>studentId', upper)
      .maybeSingle();
    if (data?.id) return data.id;
  } catch (e) {
    /* ignore */
  }
  return null;
}

/** Maps an app id to the id actually used in the DB for the live schema. */
async function adaptId(table, id) {
  const mode = await detectSchemaMode();
  if (mode !== 'old') return id;
  if (!id) return id;
  if (isUuid(id)) return id;
  if (table === 'profiles') {
    const resolved = await resolveStudentUuid(id);
    if (resolved) return resolved;
  }
  return strToUuid(String(id));
}

/** Tables that exist only on the new v2 schema (local-only until migration). */
const OLD_SCHEMA_MISSING = new Set([
  TABLES.leaveRequests,
  TABLES.notifications,
  TABLES.appSettings,
]);

/** Adapts a row to the live schema; returns null when the table does not
 *  exist on the old schema (kept local-only until the v2 migration runs). */
async function adaptRowForSchema(table, row) {
  if (!row) return row;
  const mode = await detectSchemaMode();
  if (mode !== 'old') return row;
  if (OLD_SCHEMA_MISSING.has(table)) return null;
  const out = { ...row };
  out.id = (await adaptId(table, out.id)) || out.id;
  switch (table) {
    case TABLES.profiles:
      // v1 has no student_code column — carry the code in metadata instead
      if (out.student_code) {
        out.metadata = { ...(out.metadata || {}), studentId: out.student_code };
      }
      delete out.student_code;
      break;
    case TABLES.lessons:
      out.course_id = (await adaptId('courses', out.course_id)) || out.course_id;
      break;
    case TABLES.exams:
      if (out.course_id) out.course_id = (await adaptId('courses', out.course_id)) || out.course_id;
      if (out.lesson_id) out.lesson_id = (await adaptId('lessons', out.lesson_id)) || out.lesson_id;
      break;
    case TABLES.examResults:
      delete out.status; // v1 has no status column
      if (out.exam_id) out.exam_id = (await adaptId('exams', out.exam_id)) || out.exam_id;
      if (out.student_id) out.student_id = (await resolveStudentUuid(out.student_id)) || out.student_id;
      break;
    case TABLES.sessionReports:
      if (out.student_id) out.student_id = (await resolveStudentUuid(out.student_id)) || out.student_id;
      break;
    case TABLES.payments:
      if (out.profile_id) out.profile_id = (await resolveStudentUuid(out.profile_id)) || out.profile_id;
      break;
    case TABLES.subscriptions:
      if (out.profile_id) out.profile_id = (await resolveStudentUuid(out.profile_id)) || out.profile_id;
      break;
    case TABLES.courseEnrollments:
      if (out.course_id) out.course_id = (await adaptId('courses', out.course_id)) || out.course_id;
      if (out.student_id) out.student_id = (await resolveStudentUuid(out.student_id)) || out.student_id;
      break;
    default:
      break;
  }
  return out;
}

/* =========================================================================
 * Row <-> app-object mappers
 * ======================================================================= */

/**
 * Generates a human-friendly student code (STU-XXXX) when none is provided.
 * The student code is the PUBLIC id of a student (shown in the UI, used for
 * login) — always separate from the internal `profiles.id` (the user id).
 * 4-digit suffix + a session-scoped Set avoids collisions within the app run.
 */
const generatedCodes = new Set();
function autoStudentCode() {
  let code;
  do {
    code = `STU-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (generatedCodes.has(code));
  generatedCodes.add(code);
  return code;
}

export function studentToProfileRow(s) {
  const payload = { ...s };
  delete payload.id;
  delete payload.name;
  delete payload.studentId;
  delete payload.role;
  delete payload.email;
  return {
    // internal user id (auth.users.id for admins, app-generated for students)
    id: s.id || `stu_${Date.now()}`,
    full_name: s.name || s.full_name || null,
    // public student id — always present, never the internal id
    student_code: s.studentId || s.student_code || autoStudentCode(),
    role: s.role || 'student',
    email: s.email || null,
    metadata: payload,
  };
}

export function profileRowToStudent(r) {
  if (!r) return null;
  return {
    ...(r.metadata || {}),
    id: r.id, // internal user id — NOT shown to users, kept separate
    name: r.full_name || r.metadata?.name || '',
    studentId: r.student_code || r.metadata?.studentId || '', // public code only
    role: r.role || 'student',
    email: r.email || undefined,
  };
}

export function courseToRow(c) {
  const m = { ...c };
  delete m.id;
  delete m.title;
  delete m.description;
  delete m.curriculum;
  return {
    id: c.id,
    title: c.title,
    description: c.description || null,
    published: c.published !== false,
    metadata: m,
  };
}

export function courseToLessonRows(course) {
  const rows = [];
  (course.curriculum || []).forEach((unit, ui) => {
    (unit.lessons || []).forEach((lesson, li) => {
      const isObj = lesson && typeof lesson === 'object';
      rows.push({
        id: isObj && lesson.id ? lesson.id : `${course.id}_${unit.id || `u${ui}`}_${li}`,
        course_id: course.id,
        title: isObj ? lesson.title || lesson.pdfName || 'درس' : String(lesson),
        content: { module: unit.title, moduleId: unit.id || `u${ui}`, lesson },
        position: li,
      });
    });
  });
  return rows;
}

export function lessonsToCurriculum(lessonRows) {
  const grouped = {};
  (lessonRows || [])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .forEach((r) => {
      const mId = r.content?.moduleId || `module_${r.position || 0}`;
      if (!grouped[mId]) grouped[mId] = { id: mId, title: r.content?.module || 'الوحدة', lessons: [] };
      grouped[mId].lessons.push(r.content?.lesson ?? r.title);
    });
  return Object.values(grouped);
}

export function rowToCourse(r, lessonRows) {
  return {
    ...(r.metadata || {}),
    id: r.id,
    title: r.title,
    description: r.description || r.metadata?.description || '',
    curriculum: lessonsToCurriculum(lessonRows),
  };
}

export function examToRow(e) {
  return {
    id: e.id,
    title: e.title || e.question || 'اختبار',
    description: e.question || e.description || null,
    questions: Array.isArray(e.questions) ? e.questions : [],
    settings: { ...e },
    course_id: e.courseId || null,
    published: e.published !== false,
  };
}

export function rowToExam(r) {
  const settings = r.settings && typeof r.settings === 'object' ? r.settings : {};
  return {
    ...settings,
    id: r.id,
    title: r.title || settings.title || 'اختبار',
    question: settings.question || r.description || undefined,
  };
}

export function examResultToRow(res) {
  return {
    id: res.id || res.submissionId,
    exam_id: res.examId || res.questionId || null,
    student_id: res.studentId || null,
    answers: { answer: res.answer || res.studentAnswer || '', ...(res.answers || {}) },
    score: res.score != null ? Number(res.score) : null,
    max_score: res.maxScore != null ? Number(res.maxScore) : null,
    status: res.status || 'قيد المراجعة ⏳',
    evaluation: { ...res },
    teacher_feedback: res.teacherFeedback ? { text: res.teacherFeedback } : {},
    submitted_at: res.submittedAt || (res.createdAt ? new Date(res.createdAt).toISOString() : nowIso()),
  };
}

export function rowToExamResult(r) {
  return {
    ...(r.evaluation || {}),
    id: r.id,
    submissionId: r.id,
    // Keep the exam link across round-trips: the column may be null on old
    // rows (written before the exam synced), but the evaluation payload still
    // carries the app exam/question id — falling back to it keeps grades and
    // weekly answers pointing at their exam.
    examId: r.exam_id || r.evaluation?.examId || r.evaluation?.questionId || null,
    studentId: r.student_id,
    status: r.status || r.evaluation?.status || 'قيد المراجعة ⏳',
    score: r.score != null ? r.score : r.evaluation?.score,
    teacherFeedback: r.teacher_feedback?.text || r.evaluation?.teacherFeedback || '',
  };
}

export function sessionReportToRow(r) {
  return {
    id: r.id,
    student_id: r.studentId || null,
    audio_url: r.pdfUri || null,
    transcript: r.transcriptionText || null,
    score: r.score != null ? Number(r.score) : null,
    notes: { ...r },
    requested_at: r.createdAt ? new Date(r.createdAt).toISOString() : nowIso(),
  };
}

export function rowToSessionReport(r) {
  return { ...(r.notes || {}), id: r.id, studentId: r.student_id };
}

export function leaveToRow(l) {
  return {
    id: l.id,
    student_id: l.studentId || null,
    student_name: l.studentName || null,
    title: l.title || null,
    reason: l.reason || null,
    cost: l.cost != null ? Number(l.cost) : null,
    status: l.status || null,
    data: { ...l },
    created_at: l.createdAt ? new Date(l.createdAt).toISOString() : nowIso(),
  };
}

export function rowToLeave(r) {
  return { ...(r.data || {}), id: r.id, status: r.status || r.data?.status };
}

export function notifToRow(n) {
  return {
    id: n.id,
    parent_id: n.parentId || null,
    student_name: n.studentName || null,
    message: n.message || null,
    course_title: n.courseTitle || null,
    is_read: Boolean(n.isRead),
    data: { ...n },
    created_at: n.createdAt || nowIso(),
  };
}

export function rowToNotif(r) {
  return {
    ...(r.data || {}),
    id: r.id,
    isRead: Boolean(r.is_read ?? r.data?.isRead),
  };
}

export function paymentToRow(p) {
  return {
    id: p.id,
    profile_id: p.studentId || null,
    amount: p.amount != null ? Number(p.amount) : null,
    currency: 'EGP',
    status: p.status || 'pending',
    metadata: { ...p },
    created_at: p.createdAt || nowIso(),
  };
}

export function rowToPayment(r) {
  return { ...(r.metadata || {}), id: r.id, status: r.status || r.metadata?.status };
}

/** Subscription ledger row: one row per student (id derived from the public
 *  student code so renewals overwrite the same row). The `subscriptions` table
 *  on the old v1 schema has a BEFORE UPDATE trigger that writes `updated_at` —
 *  a column that doesn't exist there — so any UPDATE fails. All subscription
 *  writes therefore go through delete-then-insert instead of upsert. */
export function subToRow(s) {
  return {
    id: s.id || `sub_${String(s.studentId || s.profile_id || Date.now())}`,
    profile_id: s.studentId || s.profile_id || s.profileId || null,
    plan: s.plan || 'monthly',
    status: s.status || 'active',
    started_at: s.started_at || s.startedAt || (s.status === 'active' ? new Date().toISOString() : null),
    canceled_at: s.canceled_at || s.canceledAt || null,
  };
}

export function rowToSub(r) {
  return {
    id: r.id,
    studentId: r.profile_id,
    plan: r.plan,
    status: r.status,
    started_at: r.started_at,
    canceled_at: r.canceled_at,
  };
}

/** Course enrollment row: id derived from (student code, course id) so granting
 *  access again overwrites the same row. Same delete-then-insert constraint as
 *  subscriptions (course_enrollments also lacks updated_at on the old schema). */
export function enrollmentToRow(e) {
  return {
    id: e.id || `enroll_${String(e.studentId || '')}_${String(e.courseId || '')}`,
    course_id: e.courseId,
    student_id: e.studentId,
    enrolled_at: e.enrolledAt || e.enrolled_at || new Date().toISOString(),
    status: e.status || 'active',
    progress: e.progress || {},
    notes: e.notes || null,
  };
}

export function rowToEnrollment(r) {
  return {
    id: r.id,
    courseId: r.course_id,
    studentId: r.student_id,
    enrolledAt: r.enrolled_at,
    status: r.status,
    progress: r.progress || {},
    notes: r.notes,
  };
}

/* =========================================================================
 * Generic persistence (optimistic + offline queue)
 * ======================================================================= */

async function persist(table, cacheName, row) {
  if (!row || !row.id) return;
  // adapt to the live schema (uuid vs text ids) BEFORE caching, so the local
  // cache always holds the same ids as the database
  const dbRow = await adaptRowForSchema(table, row);
  if (!dbRow) {
    // table doesn't exist on the old schema → local-only write
    const cached = (await cacheGet(cacheName, [])) || [];
    const idx = cached.findIndex((r) => r && r.id === row.id);
    const next = idx >= 0 ? cached.map((r) => (r && r.id === row.id ? row : r)) : [row, ...cached];
    await cacheSet(cacheName, next);
    return;
  }
  // 1) optimistic local update
  const cached = (await cacheGet(cacheName, [])) || [];
  const idx = cached.findIndex((r) => r && r.id === dbRow.id);
  const next = idx >= 0 ? cached.map((r) => (r && r.id === dbRow.id ? dbRow : r)) : [dbRow, ...cached];
  await cacheSet(cacheName, next);

  // 2) network
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from(table).upsert(dbRow, { onConflict: 'id' });
    if (error) throw error;
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'upsert', table, row: dbRow });
  }
}

async function persistDelete(table, cacheName, id) {
  const dbId = await adaptId(table, id);
  // أي كتابة معلّقة لنفس الصف (مثلاً upsert حصلت والأجهزة أوفلاين) بقت ملغية —
  // امسحها من الطابور عشان الحذف ميتلغييش بعدين بتشغيل replay قديم يعيد
  // إنشاء الصف من جديد (السبب الرئيسي إن الحذف كان "بيرجع" بعد ما ينجح).
  await purgeQueuedWrites(table, [dbId, id]);
  const cached = (await cacheGet(cacheName, [])) || [];
  await cacheSet(
    cacheName,
    cached.filter((r) => r && r.id !== dbId && r.id !== id)
  );
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from(table).delete().eq('id', dbId);
    if (error) throw error;
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'delete', table, id: dbId });
  }
}

/* =========================================================================
 * Collection loaders (cache-first with network refresh)
 * ======================================================================= */

/** Returns the full app state shape, from the local cache (instant, offline). */
export async function loadCachedState() {
  const [
    profiles,
    courses,
    lessons,
    exams,
    examResults,
    sessionReports,
    leaveRequests,
    notifications,
    payments,
    appSettings,
    subscriptions,
    courseEnrollments,
  ] = await Promise.all([
    cacheGet(CACHE_NAMES.profiles, []),
    cacheGet(CACHE_NAMES.courses, []),
    cacheGet(CACHE_NAMES.lessons, []),
    cacheGet(CACHE_NAMES.exams, []),
    cacheGet(CACHE_NAMES.examResults, []),
    cacheGet(CACHE_NAMES.sessionReports, []),
    cacheGet(CACHE_NAMES.leaveRequests, []),
    cacheGet(CACHE_NAMES.notifications, []),
    cacheGet(CACHE_NAMES.payments, []),
    cacheGet(CACHE_NAMES.appSettings, []),
    cacheGet(CACHE_NAMES.subscriptions, []),
    cacheGet(CACHE_NAMES.courseEnrollments, []),
  ]);

  const hasData =
    (profiles && profiles.length) ||
    (courses && courses.length) ||
    (exams && exams.length) ||
    (examResults && examResults.length) ||
    (sessionReports && sessionReports.length) ||
    (leaveRequests && leaveRequests.length) ||
    (notifications && notifications.length) ||
    (payments && payments.length);

  // Upgrade path: first launch of the Supabase version, still offline, before
  // the legacy migration ever ran -> serve the legacy AsyncStorage data.
  if (!hasData) {
    const legacy = await loadLegacyState();
    if (legacy) return legacy;
  }

  return buildState({
    profiles: profiles || [],
    courses: courses || [],
    lessons: lessons || [],
    exams: exams || [],
    examResults: examResults || [],
    sessionReports: sessionReports || [],
    leaveRequests: leaveRequests || [],
    notifications: notifications || [],
    payments: payments || [],
    subscriptions: subscriptions || [],
    courseEnrollments: courseEnrollments || [],
    appSettings: appSettings || [],
  });
}

/** Reads the old AsyncStorage "database" (pre-Supabase version) as app state. */
async function loadLegacyState() {
  const read = async (key) => {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };
  const [students, courses, subscription, leaves, notifications, sessionReports, payments, weekly] =
    await Promise.all([
      read(LEGACY_KEYS.students),
      read(LEGACY_KEYS.courses),
      read(LEGACY_KEYS.subscription),
      read(LEGACY_KEYS.leaveRequests),
      read(LEGACY_KEYS.parentNotifications),
      read(LEGACY_KEYS.sessionReports),
      read(LEGACY_KEYS.paymentRequests),
      read(LEGACY_KEYS.weeklyQuestion),
    ]);

  if (!students && !courses && !weekly && !leaves && !notifications && !sessionReports && !payments) {
    return null;
  }

  const appSettings = {};
  if (subscription && typeof subscription === 'object') appSettings.subscription = subscription;

  return {
    students: Array.isArray(students) ? students : [],
    courses: Array.isArray(courses) ? courses : [],
    exams: weekly && weekly.id ? [weekly] : [],
    examResults: [],
    sessionReports: Array.isArray(sessionReports) ? sessionReports : [],
    leaveRequests: Array.isArray(leaves) ? leaves : [],
    notifications: Array.isArray(notifications) ? notifications : [],
    payments: Array.isArray(payments) ? payments : [],
    appSettings,
  };
}

function buildState(raw) {
  const lessonsByCourse = {};
  (raw.lessons || []).forEach((l) => {
    (lessonsByCourse[l.course_id] = lessonsByCourse[l.course_id] || []).push(l);
  });
  const settings = {};
  (raw.appSettings || []).forEach((s) => {
    settings[s.id] = s.value;
  });
  return {
    students: (raw.profiles || []).map(profileRowToStudent).filter(Boolean),
    courses: (raw.courses || []).map((c) => rowToCourse(c, lessonsByCourse[c.id] || [])),
    exams: (raw.exams || []).map(rowToExam),
    examResults: (raw.examResults || []).map(rowToExamResult),
    sessionReports: (raw.sessionReports || []).map(rowToSessionReport),
    leaveRequests: (raw.leaveRequests || []).map(rowToLeave),
    notifications: (raw.notifications || []).map(rowToNotif),
    payments: (raw.payments || []).map(rowToPayment),
    subscriptions: (raw.subscriptions || []).map(rowToSub),
    courseEnrollments: (raw.courseEnrollments || []).map(rowToEnrollment),
    appSettings: settings,
  };
}

/**
 * Pulls every collection from Supabase and writes it to the local cache.
 * Returns the same shape as loadCachedState, or null if offline / schema not
 * ready (in which case the caller keeps using cached data).
 */
export async function refreshAllFromServer() {
  if (!isSupabaseConfigured) return null;
  const queries = [
    ['profiles', supabase.from(TABLES.profiles).select('*')],
    ['courses', supabase.from(TABLES.courses).select('*')],
    ['lessons', supabase.from(TABLES.lessons).select('*').order('position', { ascending: true })],
    ['exams', supabase.from(TABLES.exams).select('*')],
    ['examResults', supabase.from(TABLES.examResults).select('*')],
    ['sessionReports', supabase.from(TABLES.sessionReports).select('*')],
    ['leaveRequests', supabase.from(TABLES.leaveRequests).select('*')],
    ['notifications', supabase.from(TABLES.notifications).select('*')],
    ['payments', supabase.from(TABLES.payments).select('*')],
    ['appSettings', supabase.from(TABLES.appSettings).select('*')],
    ['subscriptions', supabase.from(TABLES.subscriptions).select('*')],
    ['courseEnrollments', supabase.from(TABLES.courseEnrollments).select('*')],
  ];
  const settled = await Promise.allSettled(queries.map(([, q]) => q));
  const raw = {};
  let anySucceeded = false;

  for (let i = 0; i < queries.length; i++) {
    const name = queries[i][0];
    const res = settled[i];
    const cachedArr = (await cacheGet(CACHE_NAMES[name], [])) || [];
    if (res.status === 'fulfilled' && !res.value.error && Array.isArray(res.value.data)) {
      raw[name] = res.value.data;
      await cacheSet(CACHE_NAMES[name], res.value.data);
      anySucceeded = true;
    } else {
      raw[name] = cachedArr; // offline or table missing -> use cache
    }
  }

  if (!anySucceeded) return null;
  return buildState(raw);
}

/**
 * Refreshes ONE collection from Supabase into the local cache and returns the
 * raw rows (same shape stored in the cache), or null when offline / the table
 * is missing. Used by the realtime sync layer for targeted, instant refreshes
 * instead of pulling every table on each change.
 */
export async function refreshTableFromServer(name) {
  if (!isSupabaseConfigured) return null;
  const table = TABLES[name];
  if (!table) return null;
  try {
    const { data, error } = await supabase.from(table).select('*');
    if (error || !Array.isArray(data)) return null;
    await cacheSet(CACHE_NAMES[name], data);
    return data;
  } catch (e) {
    console.warn(`[sync] refresh "${name}" failed`, e?.message || e);
    return null;
  }
}

/**
 * Refreshes ONE collection and converts it to the app state shape (the same
 * objects buildState would produce for that slice), or null on failure.
 */
export async function refreshTableState(name) {
  const rows = await refreshTableFromServer(name);
  if (!rows) return null;
  switch (name) {
    case 'profiles':
      return rows.map(profileRowToStudent).filter(Boolean);
    case 'courses': {
      const lessonRows = (await cacheGet(CACHE_NAMES.lessons, [])) || [];
      const byCourse = {};
      lessonRows.forEach((l) => {
        (byCourse[l.course_id] = byCourse[l.course_id] || []).push(l);
      });
      return rows.map((c) => rowToCourse(c, byCourse[c.id] || []));
    }
    case 'lessons':
      return rows;
    case 'exams':
      return rows.map(rowToExam);
    case 'examResults':
      return rows.map(rowToExamResult);
    case 'sessionReports':
      return rows.map(rowToSessionReport);
    case 'leaveRequests':
      return rows.map(rowToLeave);
    case 'notifications':
      return rows.map(rowToNotif);
    case 'payments':
      return rows.map(rowToPayment);
    case 'subscriptions':
      return rows.map(rowToSub);
    case 'courseEnrollments':
      return rows.map(rowToEnrollment);
    case 'appSettings': {
      const settings = {};
      rows.forEach((s) => {
        settings[s.id] = s.value;
      });
      return settings;
    }
    default:
      return rows;
  }
}

/** Removes one row from a local cache (used when a remote DELETE event arrives).
 *  Compares by canonical id too, because the realtime DELETE payload carries the
 *  raw server id while cached rows may hold text ids the app generated. */
export async function removeCachedRow(cacheName, id) {
  if (!id) return;
  const cached = (await cacheGet(cacheName, [])) || [];
  const canonicalId = toCanonicalId(id);
  await cacheSet(
    cacheName,
    cached.filter((r) => {
      if (!r || r.id == null) return true;
      if (r.id === id) return false;
      return toCanonicalId(r.id) !== canonicalId;
    })
  );
}

/** True when a row is still queued for an unsynced local write (created or
 *  edited while offline and never replayed). Lets the initial-load "push up
 *  local rows" logic distinguish genuinely-new local rows from rows that were
 *  DELETED on another device but still sit in a stale cache — the latter must
 *  NEVER be re-uploaded, or deletions would be resurrected across devices. */
export async function hasPendingWrite(table, id) {
  if (!id) return false;
  const queue = await getPendingWrites();
  const canon = toCanonicalId(id);
  return queue.some((op) => {
    if (!op) return false;
    if (op.op === 'upsert' && op.table === table && op.row && toCanonicalId(op.row.id) === canon) {
      return true;
    }
    // a course created offline also leaves a pending syncLessons op
    if (op.op === 'syncLessons' && op.courseId && toCanonicalId(op.courseId) === canon) {
      return true;
    }
    return false;
  });
}

/** Drops queued writes (upserts/deletes) for the given table+ids, so a stale
 *  offline upsert can never resurrect a row that is being deleted. */
export async function purgeQueuedWrites(table, ids) {
  if (!table) return;
  const values = [...new Set((ids || []).filter(Boolean).map((i) => toCanonicalId(i)))];
  if (!values.length) return;
  const queue = await getPendingWrites();
  const next = queue.filter((w) => {
    if (!w || w.table !== table) return true;
    const key = w.op === 'delete' ? w.id : w.row?.id;
    if (key == null) return true;
    return !values.includes(toCanonicalId(key));
  });
  if (next.length !== queue.length) await setPendingWrites(next);
}

/** Drops queued UPSERT-style writes whose row references one of the given
 *  student ids/codes (used on account deletion: a leave/report/notification/
 *  payment upsert that got queued offline would otherwise replay on the next
 *  launch and resurrect the deleted student's records). Delete-style ops are
 *  kept — they are cleanup, never resurrection. */
export async function purgeQueuedStudentWrites(studentRefs) {
  const refs = [
    ...new Set((studentRefs || []).filter(Boolean).map((r) => String(r).trim().toUpperCase())),
  ];
  if (!refs.length) return;
  const queue = await getPendingWrites();
  const next = queue.filter((w) => {
    if (!w || !w.row) return true; // keep delete-style ops (no row payload)
    const r = w.row;
    const rowRefs = [r.student_id, r.profile_id, r.parent_id].filter(Boolean);
    const matches = rowRefs.some((ref) => refs.includes(String(ref).trim().toUpperCase()));
    return !matches;
  });
  if (next.length !== queue.length) await setPendingWrites(next);
}

/* =========================================================================
 * Domain actions (used by the contexts)
 * ======================================================================= */

export const saveProfile = (student) =>
  persist(TABLES.profiles, CACHE_NAMES.profiles, studentToProfileRow(student));
export const deleteProfileRow = (id) => persistDelete(TABLES.profiles, CACHE_NAMES.profiles, id);

export const saveCourse = (course) => persist(TABLES.courses, CACHE_NAMES.courses, courseToRow(course));
export const deleteCourseRow = (id) => persistDelete(TABLES.courses, CACHE_NAMES.courses, id);

export async function saveCourseLessons(course) {
  const rows = await Promise.all(courseToLessonRows(course).map((r) => adaptRowForSchema(TABLES.lessons, r)));
  const dbRows = rows.filter(Boolean);
  const dbCourseId = (await adaptId('courses', course.id)) || course.id;
  const cached = (await cacheGet(CACHE_NAMES.lessons, [])) || [];
  await cacheSet(CACHE_NAMES.lessons, [
    ...cached.filter((r) => r.course_id !== course.id && r.course_id !== dbCourseId),
    ...dbRows,
  ]);
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from(TABLES.lessons).delete().eq('course_id', dbCourseId);
    if (dbRows.length) {
      const { error } = await supabase.from(TABLES.lessons).upsert(dbRows, { onConflict: 'id' });
      if (error) throw error;
    }
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'syncLessons', courseId: dbCourseId, rows: dbRows });
  }
}

export async function deleteLessonsForCourse(courseId) {
  const dbCourseId = (await adaptId('courses', courseId)) || courseId;
  const cached = (await cacheGet(CACHE_NAMES.lessons, [])) || [];
  await cacheSet(
    CACHE_NAMES.lessons,
    cached.filter((r) => r.course_id !== courseId && r.course_id !== dbCourseId)
  );
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from(TABLES.lessons).delete().eq('course_id', dbCourseId);
    if (error) throw error;
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'deleteLessons', courseId: dbCourseId });
  }
}

export const saveExam = (exam) => persist(TABLES.exams, CACHE_NAMES.exams, examToRow(exam));
export const deleteExamRow = (id) => persistDelete(TABLES.exams, CACHE_NAMES.exams, id);

/**
 * Normalizes a student reference to its `student_code` when possible, so the
 * `student_id` columns stay consistent (some screens pass the internal id).
 */
async function resolveStudentCode(studentId) {
  if (!studentId) return null;
  const profiles = (await cacheGet(CACHE_NAMES.profiles, [])) || [];
  const byCode = profiles.find(
    (p) => p.student_code && String(p.student_code).toUpperCase() === String(studentId).toUpperCase()
  );
  if (byCode) return byCode.student_code;
  const byId = profiles.find((p) => p.id === studentId);
  if (byId) return byId.student_code || studentId;
  return studentId; // unknown — keep as-is (columns have no FK, so no violation)
}

export const saveExamResult = async (result) => {
  const sid = await resolveStudentCode(result.studentId);
  const r = sid != null ? { ...result, studentId: sid } : result;
  return persist(TABLES.examResults, CACHE_NAMES.examResults, examResultToRow(r));
};

export const deleteExamResultsByStudent = (studentId) =>
  deleteRecordsByField(TABLES.examResults, CACHE_NAMES.examResults, 'student_id', [studentId]);

/** Deletes every submission row of an exam (used when an exam or the weekly
 *  question is deleted, so its answers don't linger as orphans on any device). */
export const deleteExamResultsByExam = (examId) =>
  deleteRecordsByField(TABLES.examResults, CACHE_NAMES.examResults, 'exam_id', [examId], 'exams');

export const saveSessionReport = async (report) => {
  const sid = await resolveStudentCode(report.studentId);
  const r = sid != null ? { ...report, studentId: sid } : report;
  return persist(TABLES.sessionReports, CACHE_NAMES.sessionReports, sessionReportToRow(r));
};

export const saveLeaveRequest = async (req) => {
  const sid = await resolveStudentCode(req.studentId);
  const r = sid != null ? { ...req, studentId: sid } : req;
  return persist(TABLES.leaveRequests, CACHE_NAMES.leaveRequests, leaveToRow(r));
};
export const deleteLeaveRequest = (id) => persistDelete(TABLES.leaveRequests, CACHE_NAMES.leaveRequests, id);

export const saveNotification = (n) => persist(TABLES.notifications, CACHE_NAMES.notifications, notifToRow(n));
export const deleteNotificationRow = (id) => persistDelete(TABLES.notifications, CACHE_NAMES.notifications, id);

export const savePayment = async (p) => {
  const sid = await resolveStudentCode(p.studentId);
  const r = sid != null ? { ...p, studentId: sid } : p;
  return persist(TABLES.payments, CACHE_NAMES.payments, paymentToRow(r));
};
export const deletePayment = (id) => persistDelete(TABLES.payments, CACHE_NAMES.payments, id);

/** Writes one subscription ledger row (delete-then-insert, see subToRow). */
export async function saveSubscription(sub) {
  const row = subToRow(sub);
  if (!row || !row.profile_id) return;
  const dbRow = await adaptRowForSchema(TABLES.subscriptions, row);
  if (!dbRow) return;
  const cached = (await cacheGet(CACHE_NAMES.subscriptions, [])) || [];
  const idx = cached.findIndex((r) => r && r.id === dbRow.id);
  const next = idx >= 0 ? cached.map((r) => (r && r.id === dbRow.id ? dbRow : r)) : [dbRow, ...cached];
  await cacheSet(CACHE_NAMES.subscriptions, next);
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from(TABLES.subscriptions).delete().eq('profile_id', dbRow.profile_id);
    const { error } = await supabase.from(TABLES.subscriptions).insert(dbRow);
    if (error) throw error;
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'syncSubscription', row: dbRow });
  }
}

/** Removes a student's subscription ledger row (cancel / account deletion).
 *  Deletes by BOTH the student code and the profile uuid — the rows store the
 *  code (see subToRow), so filtering on the uuid alone used to miss them and
 *  the subscription silently survived the account deletion. */
export async function deleteSubscriptionForStudent(studentId) {
  if (!studentId) return;
  const dbPid = (await resolveStudentUuid(studentId)) || studentId;
  await deleteRecordsByField(TABLES.subscriptions, CACHE_NAMES.subscriptions, 'profile_id', [studentId, dbPid]);
}

/** Records a course purchase in course_enrollments (delete-then-insert). */
export async function saveCourseEnrollment({ studentId, courseId, status = 'active' }) {
  if (!studentId || !courseId) return;
  const dbRow = await adaptRowForSchema(
    TABLES.courseEnrollments,
    enrollmentToRow({ studentId, courseId, status })
  );
  if (!dbRow) return;
  const cached = (await cacheGet(CACHE_NAMES.courseEnrollments, [])) || [];
  const idx = cached.findIndex((r) => r && r.id === dbRow.id);
  const next = idx >= 0 ? cached.map((r) => (r && r.id === dbRow.id ? dbRow : r)) : [dbRow, ...cached];
  await cacheSet(CACHE_NAMES.courseEnrollments, next);
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from(TABLES.courseEnrollments).delete().eq('id', dbRow.id);
    const { error } = await supabase.from(TABLES.courseEnrollments).insert(dbRow);
    if (error) throw error;
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'syncEnrollment', row: dbRow });
  }
}

/** Removes ONE enrollment (revoking access to a course). */
export async function deleteCourseEnrollment(studentId, courseId) {
  if (!studentId || !courseId) return;
  const dbRow = await adaptRowForSchema(TABLES.courseEnrollments, enrollmentToRow({ studentId, courseId }));
  if (!dbRow || !dbRow.id) return;
  const cached = (await cacheGet(CACHE_NAMES.courseEnrollments, [])) || [];
  await cacheSet(CACHE_NAMES.courseEnrollments, cached.filter((r) => r && r.id !== dbRow.id));
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from(TABLES.courseEnrollments).delete().eq('id', dbRow.id);
    if (error) throw error;
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'deleteEnrollment', id: dbRow.id });
  }
}

/** Removes ALL of a student's enrollments (account deletion / full revoke).
 *  Same dual-match as deleteSubscriptionForStudent: rows store the student
 *  code in student_id, so deleting by the resolved uuid alone missed them. */
export async function deleteCourseEnrollmentsForStudent(studentId) {
  if (!studentId) return;
  const dbPid = (await resolveStudentUuid(studentId)) || studentId;
  await deleteRecordsByField(TABLES.courseEnrollments, CACHE_NAMES.courseEnrollments, 'student_id', [studentId, dbPid]);
}

/**
 * Deletes every row in `table` whose `field` matches one of `values`
 * (used to clean up all of a student's records on account deletion).
 */
export async function deleteRecordsByField(table, cacheName, field, values, idTable = 'profiles') {
  const vals = [...new Set((values || []).filter(Boolean))];
  if (!vals.length) return;
  // adapt each value to its DB id (student codes → profile uuids, exam ids →
  // uuid on v1) keeping the original value as a fallback so nothing is dropped
  const dbVals = [];
  for (const v of vals) {
    const dbId = await adaptId(idTable, v);
    dbVals.push(dbId || v);
  }
  const cached = (await cacheGet(cacheName, [])) || [];
  await cacheSet(
    cacheName,
    cached.filter((r) => !vals.includes(r[field]) && !dbVals.includes(r[field]))
  );
  if (!isSupabaseConfigured) return;
  try {
    const orFilter = dbVals.map((v) => `${field}.eq.${v}`).join(',');
    const { error } = await supabase.from(table).delete().or(orFilter);
    if (error) throw error;
    flushPendingWrites();
  } catch (e) {
    await enqueueWrite({ op: 'deleteManyOr', table, field, values: dbVals, idTable });
  }
}

export const saveAppSetting = (key, value) =>
  persist(TABLES.appSettings, CACHE_NAMES.appSettings, { id: key, value });

export async function getAppSetting(key) {
  const cached = (await cacheGet(CACHE_NAMES.appSettings, [])) || [];
  const hit = cached.find((r) => r.id === key);
  if (hit) return hit.value;
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.from(TABLES.appSettings).select('*').eq('id', key).maybeSingle();
    return data?.value ?? null;
  } catch (e) {
    return null;
  }
}

/* =========================================================================
 * Auth helpers (admin via Supabase auth, students via student_code)
 * ======================================================================= */

export async function adminLogin(email, password) {
  if (!isSupabaseConfigured || !email || !password) return null;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password,
    });
    if (error || !data?.user) return null;
    const { data: profile } = await supabase
      .from(TABLES.profiles)
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'admin') {
      await supabase.auth.signOut().catch(() => {});
      return null;
    }
    return profile;
  } catch (e) {
    return null;
  }
}

/** Restores the admin from the persisted Supabase session (remembered login). */
export async function getAdminProfile() {
  if (!isSupabaseConfigured) return null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data: profile } = await supabase
      .from(TABLES.profiles)
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'admin') return null;
    return profile;
  } catch (e) {
    return null;
  }
}

export async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    /* ignore */
  }
}

/** Changes the signed-in admin's password (no current password needed — the
 *  active Supabase session authorizes the update). */
export async function changeAdminPassword(newPassword) {
  const pw = String(newPassword || '');
  if (!isSupabaseConfigured) return { success: false, message: 'Supabase غير مُهيّأ بعد.' };
  if (!pw.trim() || pw.trim().length < 6) {
    return { success: false, message: 'كلمة السر يجب أن تكون 6 أحرف على الأقل.' };
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return {
        success: false,
        message: 'أنت مسجّل الدخول بحساب محلي (admin/admin). سجّل دخولك بحساب Supabase لتغيير كلمة السر.',
      };
    }
    const { error } = await supabase.auth.updateUser({ password: pw.trim() });
    if (error) {
      return {
        success: false,
        message: error.message
          ? `تعذّر تغيير كلمة السر: ${error.message}`
          : 'تعذّر تغيير كلمة السر. حاول مرة أخرى.',
      };
    }
    return { success: true, message: 'تم تغيير كلمة السر بنجاح 🔒' };
  } catch (e) {
    return { success: false, message: 'تعذّر تغيير كلمة السر. تحقق من اتصالك بالإنترنت.' };
  }
}

export async function findStudentByCode(code) {
  const upper = String(code || '').trim().toUpperCase();
  if (!upper) return null;
  const cached = (await cacheGet(CACHE_NAMES.profiles, [])) || [];

  // 1) Local cache: match the student_code column (new schema) OR the
  //    metadata.studentId fallback (old schema has no student_code column).
  const cachedHit = cached.find(
    (r) =>
      String(r.student_code || '').toUpperCase() === upper ||
      String(r.metadata?.studentId || '').toUpperCase() === upper
  );
  if (cachedHit) return profileRowToStudent(cachedHit);
  if (!isSupabaseConfigured) return null;

  // 2) Network — student_code column (new schema).
  const res1 = await supabase
    .from(TABLES.profiles)
    .select('*')
    .eq('student_code', upper)
    .maybeSingle();
  if (!res1.error && res1.data) return profileRowToStudent(res1.data);
  // (error here usually means the column doesn't exist → old schema → fall through)

  // 3) Network fallback — metadata->>studentId (works on old & new schema).
  //    ilike = case-insensitive, matching the cache-path normalization.
  try {
    const res2 = await supabase
      .from(TABLES.profiles)
      .select('*')
      .ilike('metadata->>studentId', upper)
      .maybeSingle();
    if (res2.data) return profileRowToStudent(res2.data);
  } catch (e) {
    /* ignore */
  }

  return profileRowToStudent(cachedHit || null);
}

/* =========================================================================
 * Offline write queue
 * ======================================================================= */

export async function flushPendingWrites() {
  if (!isSupabaseConfigured) return;
  const queue = await getPendingWrites();
  if (!queue.length) return;
  const done = [];
  for (const op of queue) {
    try {
      if (op.op === 'upsert') {
        // adapt again at replay time (schema may have been probed since queueing)
        const dbRow = await adaptRowForSchema(op.table, op.row);
        if (!dbRow) {
          done.push(op); // table doesn't exist on the live schema — local-only
          continue;
        }
        const { error } = await supabase.from(op.table).upsert(dbRow, { onConflict: 'id' });
        if (error) throw error;
      } else if (op.op === 'delete') {
        const dbId = (await adaptId(op.table, op.id)) || op.id;
        const { error } = await supabase.from(op.table).delete().eq('id', dbId);
        if (error) throw error;
      } else if (op.op === 'syncLessons') {
        const dbCourseId = (await adaptId('courses', op.courseId)) || op.courseId;
        await supabase.from(TABLES.lessons).delete().eq('course_id', dbCourseId);
        const dbRows = [];
        for (const r of op.rows || []) {
          const adapted = await adaptRowForSchema(TABLES.lessons, r);
          if (adapted) dbRows.push(adapted);
        }
        if (dbRows.length) {
          const { error } = await supabase.from(TABLES.lessons).upsert(dbRows, { onConflict: 'id' });
          if (error) throw error;
        }
      } else if (op.op === 'deleteLessons') {
        const dbCourseId = (await adaptId('courses', op.courseId)) || op.courseId;
        const { error } = await supabase.from(TABLES.lessons).delete().eq('course_id', dbCourseId);
        if (error) throw error;
      } else if (op.op === 'deleteMany') {
        const dbId = (await adaptId('profiles', op.value)) || op.value;
        const { error } = await supabase.from(op.table).delete().eq(op.field, dbId);
        if (error) throw error;
      } else if (op.op === 'deleteManyOr') {
        const dbVals = [];
        for (const v of op.values || []) {
          // re-adapt against the SAME table the op was enqueued with (exam ids
          // map through 'exams', student ids through 'profiles') so the replay
          // targets the right uuids on the old schema
          const dbId = await adaptId(op.idTable || 'profiles', v);
          dbVals.push(dbId || v);
        }
        const orFilter = dbVals.map((v) => `${op.field}.eq.${v}`).join(',');
        const { error } = await supabase.from(op.table).delete().or(orFilter);
        if (error) throw error;
      } else if (op.op === 'syncSubscription') {
        const dbRow = await adaptRowForSchema(TABLES.subscriptions, op.row);
        if (dbRow) {
          await supabase.from(TABLES.subscriptions).delete().eq('profile_id', dbRow.profile_id);
          const { error } = await supabase.from(TABLES.subscriptions).insert(dbRow);
          if (error) throw error;
        }
      } else if (op.op === 'deleteSubscription') {
        const { error } = await supabase.from(TABLES.subscriptions).delete().eq('profile_id', op.profileId);
        if (error) throw error;
      } else if (op.op === 'syncEnrollment') {
        const dbRow = await adaptRowForSchema(TABLES.courseEnrollments, op.row);
        if (dbRow) {
          await supabase.from(TABLES.courseEnrollments).delete().eq('id', dbRow.id);
          const { error } = await supabase.from(TABLES.courseEnrollments).insert(dbRow);
          if (error) throw error;
        }
      } else if (op.op === 'deleteEnrollment') {
        const { error } = await supabase.from(TABLES.courseEnrollments).delete().eq('id', op.id);
        if (error) throw error;
      } else if (op.op === 'deleteEnrollments') {
        const { error } = await supabase.from(TABLES.courseEnrollments).delete().eq('student_id', op.studentId);
        if (error) throw error;
      }
      done.push(op);
    } catch (e) {
      break; // still offline — keep the remaining queue for later
    }
  }
  if (done.length) await removePendingWrites(done);
}

/* =========================================================================
 * One-time migration of the legacy AsyncStorage database to Supabase
 * ======================================================================= */

export async function runLegacyMigration() {
  if (!isSupabaseConfigured) return { migrated: false, reason: 'not-configured' };
  const flag = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
  if (flag === 'done') return { migrated: false, reason: 'already-migrated' };

  const read = async (key) => {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const [students, courses, subscription, leaves, notifications, sessionReports, payments, weekly] =
    await Promise.all([
      read(LEGACY_KEYS.students),
      read(LEGACY_KEYS.courses),
      read(LEGACY_KEYS.subscription),
      read(LEGACY_KEYS.leaveRequests),
      read(LEGACY_KEYS.parentNotifications),
      read(LEGACY_KEYS.sessionReports),
      read(LEGACY_KEYS.paymentRequests),
      read(LEGACY_KEYS.weeklyQuestion),
    ]);

  // Keep a safety backup of the legacy keys before removing them.
  for (const [name, key] of Object.entries(LEGACY_KEYS)) {
    const raw = await AsyncStorage.getItem(key);
    if (raw) await AsyncStorage.setItem(`${key}__backup`, raw);
  }

  try {
    const mode = await detectSchemaMode();
    if (mode !== 'old') {
      // ---- new v2 schema: write rows as-is ----
      const studentRows = (Array.isArray(students) ? students : [])
        .filter((s) => s && s.name)
        .map((s) => studentToProfileRow(s));
      if (studentRows.length) {
        await supabase.from(TABLES.profiles).upsert(studentRows, { onConflict: 'id' });
      }

      if (Array.isArray(courses)) {
        for (const c of courses) {
          if (!c || !c.title) continue;
          await supabase.from(TABLES.courses).upsert(courseToRow(c), { onConflict: 'id' });
          const lessonRows = courseToLessonRows(c);
          if (lessonRows.length) {
            await supabase.from(TABLES.lessons).delete().eq('course_id', c.id);
            await supabase.from(TABLES.lessons).upsert(lessonRows, { onConflict: 'id' });
          }
        }
      }

      if (subscription && typeof subscription === 'object') {
        await supabase.from(TABLES.appSettings).upsert({ id: 'subscription', value: subscription }, { onConflict: 'id' });
      }

      if (Array.isArray(leaves)) {
        const rows = leaves.filter((l) => l && l.id).map((l) => leaveToRow(l));
        if (rows.length) await supabase.from(TABLES.leaveRequests).upsert(rows, { onConflict: 'id' });
      }

      if (Array.isArray(notifications)) {
        const rows = notifications.filter((n) => n && n.id).map((n) => notifToRow(n));
        if (rows.length) await supabase.from(TABLES.notifications).upsert(rows, { onConflict: 'id' });
      }

      if (Array.isArray(sessionReports)) {
        const rows = sessionReports.filter((r) => r && r.id).map((r) => sessionReportToRow(r));
        if (rows.length) await supabase.from(TABLES.sessionReports).upsert(rows, { onConflict: 'id' });
      }

      if (Array.isArray(payments)) {
        const rows = payments.filter((p) => p && p.id).map((p) => paymentToRow(p));
        if (rows.length) await supabase.from(TABLES.payments).upsert(rows, { onConflict: 'id' });
      }

      if (weekly && weekly.id) {
        await supabase.from(TABLES.exams).upsert(examToRow(weekly), { onConflict: 'id' });
      }
    } else {
      // ---- old v1 schema (uuid ids): adapt everything ----
      const studentRows = [];
      for (const s of Array.isArray(students) ? students : []) {
        if (!s || !s.name) continue;
        const row = await adaptRowForSchema(TABLES.profiles, studentToProfileRow(s));
        if (row) studentRows.push(row);
      }
      if (studentRows.length) {
        await supabase.from(TABLES.profiles).upsert(studentRows, { onConflict: 'id' });
      }

      if (Array.isArray(courses)) {
        for (const c of courses) {
          if (!c || !c.title) continue;
          const courseRow = await adaptRowForSchema(TABLES.courses, courseToRow(c));
          if (courseRow) {
            await supabase.from(TABLES.courses).upsert(courseRow, { onConflict: 'id' });
          }
          const dbCourseId = (await adaptId('courses', c.id)) || c.id;
          const lessonRows = [];
          for (const r of courseToLessonRows(c)) {
            const adapted = await adaptRowForSchema(TABLES.lessons, r);
            if (adapted) lessonRows.push(adapted);
          }
          if (lessonRows.length) {
            await supabase.from(TABLES.lessons).delete().eq('course_id', dbCourseId);
            await supabase.from(TABLES.lessons).upsert(lessonRows, { onConflict: 'id' });
          }
        }
      }

      if (Array.isArray(sessionReports)) {
        const rows = [];
        for (const r of sessionReports.filter((x) => x && x.id)) {
          const adapted = await adaptRowForSchema(TABLES.sessionReports, sessionReportToRow(r));
          if (adapted) rows.push(adapted);
        }
        if (rows.length) await supabase.from(TABLES.sessionReports).upsert(rows, { onConflict: 'id' });
      }

      if (Array.isArray(payments)) {
        const rows = [];
        for (const p of payments.filter((x) => x && x.id)) {
          const adapted = await adaptRowForSchema(TABLES.payments, paymentToRow(p));
          if (adapted) rows.push(adapted);
        }
        if (rows.length) await supabase.from(TABLES.payments).upsert(rows, { onConflict: 'id' });
      }

      if (weekly && weekly.id) {
        const examRow = await adaptRowForSchema(TABLES.exams, examToRow(weekly));
        if (examRow) await supabase.from(TABLES.exams).upsert(examRow, { onConflict: 'id' });
      }
      // leave_requests / notifications / app_settings don't exist on v1 → skip
    }

    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'done');
    for (const key of Object.values(LEGACY_KEYS)) {
      await AsyncStorage.removeItem(key);
    }
    // Refresh the local caches with the freshly migrated data
    await refreshAllFromServer();
    return { migrated: true };
  } catch (e) {
    console.warn('[migration] failed, will retry on next launch', e);
    return { migrated: false, reason: e.message };
  }
}


