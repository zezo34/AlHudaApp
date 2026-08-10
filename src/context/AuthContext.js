import React, { createContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Data from '../services/supabaseDataService';
import { onTableChange, debounce } from '../services/realtimeService';
import { scheduleRenewalReminders } from '../services/sessionBackgroundService';

/**
 * AuthContext — now backed by Supabase with an offline-first local cache.
 *
 * What changed:
 *   - Admin login uses real Supabase Auth (email + password). The hardcoded
 *     `adminAccount` is GONE. Create the admin in the Supabase dashboard,
 *     run scripts/seedSupabase.js --admin-email ... to mark the profile admin.
 *   - Students/parents log in with their student code (STU-xxx), which is now
 *     the `student_code` column on profiles — same UX as before.
 *   - All collections (students, leave requests, session reports, payment
 *     requests, parent notifications, subscription settings) are read from
 *     Supabase (cached on device) and every mutation is written through.
 *   - On first launch after this upgrade, the old AsyncStorage "database" is
 *     automatically migrated to Supabase (see runLegacyMigration).
 *
 * The public API is unchanged, so every screen keeps working as before.
 */

export const AuthContext = createContext();

/* Merge server students with the local ones: the server version wins when a
 * student exists on both sides, while purely-local rows (created offline and
 * still queued) are kept. Matching prefers the public student code so a local
 * text-id row is replaced by its server uuid version on the first sync. */
function mergeStudents(serverList, localList) {
  const map = new Map();
  const keyOf = (s) =>
    s && s.studentId
      ? `code:${String(s.studentId).trim().toUpperCase()}`
      : s && s.id
        ? `id:${Data.toCanonicalId(s.id)}`
        : null;
  (localList || []).forEach((s) => {
    const k = keyOf(s);
    if (k) map.set(k, s);
  });
  (serverList || []).forEach((s) => {
    const k = keyOf(s);
    if (k) map.set(k, s); // server wins
  });
  return Array.from(map.values());
}

/* Generic merge keyed on the canonical (server) id so local text ids match
 * their server uuids — no duplicate rows after a realtime refresh. */
function mergeById(serverList, localList) {
  const map = new Map();
  const keyOf = (r) => (r && r.id != null ? Data.toCanonicalId(r.id) : null);
  (localList || []).forEach((r) => {
    const k = keyOf(r);
    if (k) map.set(k, r);
  });
  (serverList || []).forEach((r) => {
    const k = keyOf(r);
    if (k) map.set(k, r); // server wins
  });
  return Array.from(map.values());
}

const DEFAULT_SUBSCRIPTION = {
  isSubActive: true,
  title: 'الاشتراك الشهري الشامل',
  price: '199',
  description: 'احصل على وصول غير محدود لكافة الكورسات والفرق الصوتية باشتراك واحد.',
};

// 🛡️ حساب الأدمن المحلي السريع (admin / admin) — كما كان في النسخة القديمة.
// يعمل بدون إنترنت. للأمان، استبدله بحساب Supabase قبل الإطلاق الفعلي.
const LOCAL_ADMIN_ACCOUNT = {
  id: 'admin-local',
  name: 'المعلم محمود ساطور',
  role: 'admin',
  username: 'admin',
  password: 'admin',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 💳 بيانات الباقة ونظام الاشتراك (app_settings -> 'subscription')
  const [subscriptionData, setSubscriptionData] = useState(DEFAULT_SUBSCRIPTION);

  // ⚙️ كل إعدادات التطبيق العامة (app_settings): الاشتراك، قائمة الإجازات،
  // رابط الاجتماع، رقم المحفظة — تُقرأ من الكاش المحلي أولاً (يعمل بدون إنترنت).
  const [appSettings, setAppSettings] = useState({});

  // 👥 قاعدة البيانات
  const [studentsDatabase, setStudentsDatabase] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [sessionReports, setSessionReports] = useState([]);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [parentNotifications, setParentNotifications] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [courseEnrollments, setCourseEnrollments] = useState([]);

  // Latest-state mirror so deferred persistence always writes the freshest row
  const studentsRef = useRef([]);
  useEffect(() => {
    studentsRef.current = studentsDatabase;
  }, [studentsDatabase]);

  // 🗑️ Tombstone لعمليات حذف الطلاب (نفس نمط CourseContext للكورسات والاختبارات):
  // بينضاف قبل ما الحذف يوصل السيرفر، ويمنع الريلتايم من دمج الطالب المحذوف
  // (أو أي سجل مرتبط بيه) رجّع تاني — ده كان سبب "رجع الطالب تاني" بعد الحذف.
  const deletedStudentIdsRef = useRef(new Set());
  const isDeletedStudent = (id) => id != null && deletedStudentIdsRef.current.has(Data.toCanonicalId(id));
  const isDeletedStudentRef = (ref) =>
    ref != null &&
    (deletedStudentIdsRef.current.has(String(ref).trim().toUpperCase()) ||
      deletedStudentIdsRef.current.has(Data.toCanonicalId(ref)));
  const rowRefsTombstoned = (r) =>
    !!r &&
    [r.studentId, r.student_id, r.profile_id, r.parentId, r.parent_id, r.studentName, r.student_name].some(
      (ref) => isDeletedStudentRef(ref)
    );

  // 📌 Remember-me support
  const [rememberedCredentials, setRememberedCredentials] = useState(null);
  const ADMIN_SECURE_KEY = 'admin_remember';

  /* --------------------------- helpers ---------------------------------- */

  const findStudent = (studentId) =>
    studentsDatabase.find((st) => st.id === studentId || st.studentId === studentId);

  /** Updates a student locally (optimistic) and persists it to Supabase. */
  const patchStudent = (studentId, patchFn) => {
    const st = findStudent(studentId);
    if (!st) return null;
    const updated = patchFn(st);
    setStudentsDatabase((prev) =>
      prev.map((s) => (s.id === updated.id || s.studentId === updated.studentId ? updated : s))
    );
    Data.saveProfile(updated);
    return updated;
  };

  /** 🔁 يدمج بيانات الطالب المحدّثة (من الداتابيز) مع بيانات المستخدم المسجّل
   *  حالياً مع الحفاظ على هوية تسجيل الدخول (الـ role والاسم المعروض).
   *  من غير الحفاظ ده، `role` بتاعة الطالب (student) بتتكتب فوق role ولي
   *  الأمر (parent) في شاشة الـ Home الثيم بيتقلب لثيم الطالب غلط. */
  const mergeUserWithStudentData = (prev, studentData) => {
    if (!prev || !studentData) return prev;
    return {
      ...prev,
      ...studentData,
      role: prev.role, // احتفظ بدور الدخول — ممنوع يتكتب بداله role الطالب
      studentDbId: prev.studentDbId || studentData.id,
      studentName: studentData.name || prev.studentName,
    };
  };

  /* ----------------------- initial load + migration ---------------------- */

  useEffect(() => {
    let cancelled = false;

    const restoreRemembered = async (students) => {
      try {
        const adminSecure = await SecureStore.getItemAsync(ADMIN_SECURE_KEY);
        if (adminSecure) {
          const parsedAdmin = JSON.parse(adminSecure);
          setRememberedCredentials(parsedAdmin);
          if (parsedAdmin && parsedAdmin.role === 'admin') {
            // حساب محلي (admin) → دخول مباشر بدون إنترنت
            if (
              parsedAdmin.username &&
              String(parsedAdmin.username).toLowerCase() === LOCAL_ADMIN_ACCOUNT.username
            ) {
              setUser({ ...LOCAL_ADMIN_ACCOUNT });
              return;
            }
            // حساب Supabase → استعادة الجلسة المحفوظة
            const profile = await Data.getAdminProfile();
            if (profile) {
              const adminUser = {
                ...Data.profileRowToStudent(profile),
                name: profile.full_name || 'المدير',
                role: 'admin',
              };
              setUser(adminUser);
              return;
            }
          }
        }

        const savedRemembered = await AsyncStorage.getItem('@remembered_credentials');
        if (savedRemembered) {
          const parsed = JSON.parse(savedRemembered);
          setRememberedCredentials(parsed);
          if (parsed && (parsed.role === 'student' || parsed.role === 'parent') && parsed.studentId) {
            const targetId = String(parsed.studentId).trim().toUpperCase();
            const found = (students || []).find(
              (s) => String(s.studentId || '').trim().toUpperCase() === targetId
            );
            if (found) {
              const currentRole = parsed.role === 'parent' ? 'parent' : 'student';
              setUser({
                ...found,
                studentDbId: found.id,
                name: currentRole === 'parent' ? `ولي أمر ${found.name}` : found.name,
                studentName: found.name,
                role: currentRole,
                gender: found.gender || 'boy',
                stars: found.stars || 0,
                isSubscribed: Boolean(found.isSubscribed),
                subscriptionExpiry: found.subscriptionExpiry || null,
                purchasedCourseIds: Array.isArray(found.purchasedCourseIds) ? found.purchasedCourseIds : [],
                reports: found.reports || [],
              });
            }
          }
        }
      } catch (e) {
        console.warn('restoreRemembered failed', e);
      }
    };

    let loadedSub = DEFAULT_SUBSCRIPTION;
    const applyState = (state) => {
      const sub = state.appSettings?.subscription || DEFAULT_SUBSCRIPTION;
      loadedSub = sub;
      setSubscriptionData(sub);
      setAppSettings(state.appSettings || {});
      setStudentsDatabase(state.students || []);
      setLeaveRequests(state.leaveRequests || []);
      setParentNotifications(state.notifications || []);
      setSessionReports(state.sessionReports || []);
      setPaymentRequests(state.payments || []);
      setSubscriptions(state.subscriptions || []);
      setCourseEnrollments(state.courseEnrollments || []);
      return state.students || [];
    };

    const init = async () => {
      // 1) cached state (instant, offline)
      let loadedStudents = [];
      let cachedState = null;
      try {
        const cached = await Data.loadCachedState();
        if (!cancelled && cached) {
          cachedState = cached;
          loadedStudents = applyState(cached);
        }
      } catch (e) {
        console.warn('Failed to load cached auth state', e);
      }

      // 2) one-time migration of the legacy AsyncStorage database
      try {
        await Data.runLegacyMigration();
      } catch (e) {
        console.warn('Legacy migration failed (will retry next launch)', e);
      }

      // 3) fresh state from Supabase
      try {
        const fresh = await Data.refreshAllFromServer();
        if (!cancelled && fresh) {
          // Local-first push: rows that exist only on this device (created
          // offline, or stuck from before the v2 migration) get uploaded so
          // they land in Supabase and sync to every device — otherwise admin
          // actions on them (approve/reject leave & payment requests, which
          // DELETE the row) never propagate to other devices. Server wins on
          // conflict, and locally-only rows are kept in the UI while queued.
          const pushUp = async (localList, serverList, saveFn, table) => {
            if (!localList || !localList.length) return null;
            const serverIds = new Set((serverList || []).map((r) => Data.toCanonicalId(r.id)));
            for (const r of localList) {
              if (r && r.id && !serverIds.has(Data.toCanonicalId(r.id))) {
                // لو الصف ناقص من السيرفر ومعندهوش كتابة معلّقة على الجهاز ده،
                // يبقى اتمسح من جهاز تاني (مثلاً الأدمن وافق/رفض طلب دفع فاتحذف
                // الصف) — مترفعوش تاني أبداً عشان الحذف يتزامن على كل الأجهزة.
                if (table && !(await Data.hasPendingWrite(table, r.id))) continue;
                saveFn(r);
              }
            }
            return mergeById(serverList, localList);
          };
          const mergedLeaves = await pushUp(cachedState?.leaveRequests, fresh.leaveRequests, Data.saveLeaveRequest, null);
          const mergedPayments = await pushUp(cachedState?.payments, fresh.payments, Data.savePayment, 'payments');
          const mergedNotifs = await pushUp(cachedState?.notifications, fresh.notifications, Data.saveNotification, null);
          loadedStudents = applyState({
            ...fresh,
            leaveRequests: mergedLeaves || fresh.leaveRequests || [],
            payments: mergedPayments || fresh.payments || [],
            notifications: mergedNotifs || fresh.notifications || [],
          });
        }
      } catch (e) {
        console.warn('Failed to refresh auth state from server', e);
      }

      Data.flushPendingWrites();

      // 4) global subscription kill-switch (mirrors legacy behavior)
      if (loadedSub.isSubActive === false && loadedStudents.length) {
        const deactivated = loadedStudents.map((st) => ({
          ...st,
          isSubscribed: false,
          subscriptionExpiry: null,
          subscriptionStart: null,
        }));
        setStudentsDatabase(deactivated);
        deactivated.forEach((st) => Data.saveProfile(st));
      }

      // 5) restore remembered login
      await restoreRemembered(loadedStudents);

      if (!cancelled) setIsLoaded(true);
    };

    /* 🔴 Realtime sync: reflect database changes instantly, no refresh needed.
     * Each handler re-fetches its table from Supabase and merges the result
     * into the local state (server wins, offline-created rows are kept).
     * DELETE events remove the row right away instead of a full re-fetch. */
    const unsubscribers = [];

    const syncStudents = debounce(async (payload) => {
      if (payload && payload.eventType === 'DELETE' && payload.old && payload.old.id) {
        const removedId = payload.old.id;
        await Data.removeCachedRow(Data.CACHE_NAMES.profiles, removedId);
        setStudentsDatabase((prev) =>
          prev.filter(
            (s) =>
              s.studentId !== removedId &&
              s.studentDbId !== removedId &&
              !(s.id != null && Data.toCanonicalId(s.id) === Data.toCanonicalId(removedId))
          )
        );
        return;
      }
      const server = await Data.refreshTableState('profiles');
      if (server) {
        // ممنوع دمج الطلاب اللي اتمسحوا في نفس الجلسة (الحذف لسه شغال على السيرفر)
        const kept = server.filter((s) => !isDeletedStudent(s.id) && !isDeletedStudent(s.studentId));
        setStudentsDatabase((prev) =>
          mergeStudents(kept, prev).filter((s) => !isDeletedStudent(s.id) && !isDeletedStudent(s.studentId))
        );
      }
    }, 400);

    const syncCollection = (table, cacheName, setter, merge = mergeById) =>
      debounce(async (payload) => {
        if (payload && payload.eventType === 'DELETE' && payload.old && payload.old.id) {
          const removedId = payload.old.id;
          await Data.removeCachedRow(cacheName, removedId);
          // قارن بالـ canonical id (uuid) على الجانبين: الـ payload بيرجع الـ id
          // الخام (نصي مثلاً vac_123) بينما الصف المحلي ممكن يكون اتخزّن بأي
          // شكل — من غير التحويل ده الحذف مش بيوصل للأجهزة التانية أبداً.
          setter((prev) =>
            prev.filter(
              (r) =>
                !(r && r.id != null && Data.toCanonicalId(r.id) === Data.toCanonicalId(removedId))
            )
          );
          return;
        }
        const server = await Data.refreshTableState(table);
        if (server) {
          // ونفس الشيء لسجلات الطالب المحذوف (إجازات، تقارير، إشعارات، مدفوعات،
          // اشتراكات، تسجيلات كورسات) — ما ندمجهاش رجّع تاني أثناء الحذف.
          setter((prev) => merge(server, prev).filter((r) => !rowRefsTombstoned(r)));
        }
      }, 400);

    const syncLeaves = syncCollection('leaveRequests', Data.CACHE_NAMES.leaveRequests, setLeaveRequests);
    const syncNotifications = syncCollection('notifications', Data.CACHE_NAMES.notifications, setParentNotifications);
    const syncReports = syncCollection('sessionReports', Data.CACHE_NAMES.sessionReports, setSessionReports);
    const syncPayments = syncCollection('payments', Data.CACHE_NAMES.payments, setPaymentRequests);
    const syncSubscriptions = syncCollection('subscriptions', Data.CACHE_NAMES.subscriptions, setSubscriptions);
    const syncEnrollments = syncCollection('courseEnrollments', Data.CACHE_NAMES.courseEnrollments, setCourseEnrollments);

    const syncAppSettings = debounce(async () => {
      const settings = await Data.refreshTableState('appSettings');
      if (!settings) return;
      setAppSettings((prev) => ({ ...prev, ...settings }));
      if (settings.subscription && typeof settings.subscription === 'object') {
        setSubscriptionData(settings.subscription);
      }
    }, 400);

    unsubscribers.push(onTableChange('profiles', syncStudents));
    unsubscribers.push(onTableChange('leave_requests', syncLeaves));
    unsubscribers.push(onTableChange('parent_notifications', syncNotifications));
    unsubscribers.push(onTableChange('recitation_reports', syncReports));
    unsubscribers.push(onTableChange('payments', syncPayments));
    unsubscribers.push(onTableChange('subscriptions', syncSubscriptions));
    unsubscribers.push(onTableChange('course_enrollments', syncEnrollments));
    unsubscribers.push(onTableChange('app_settings', syncAppSettings));

    init();
    return () => {
      cancelled = true;
      unsubscribers.forEach((un) => {
        try {
          un && un();
        } catch (e) {
          /* ignore */
        }
      });
    };
  }, []);

  /* 🔄 Live sync: keep the logged-in student user in sync with the database */
  useEffect(() => {
    if (user && (user.role === 'student' || user.role === 'parent')) {
      const latestData = studentsDatabase.find(
        (st) => st.id === user.studentDbId || st.studentId === user.studentId
      );
      if (latestData) {
        setUser((prev) => {
          const latestPurchasedCourseIds = Array.isArray(latestData.purchasedCourseIds)
            ? latestData.purchasedCourseIds
            : [];
          if (
            prev.isSubscribed === latestData.isSubscribed &&
            prev.stars === latestData.stars &&
            prev.subscriptionExpiry === latestData.subscriptionExpiry &&
            JSON.stringify(prev.reports) === JSON.stringify(latestData.reports) &&
            JSON.stringify(prev.purchasedCourseIds) === JSON.stringify(latestPurchasedCourseIds)
          ) {
            return prev;
          }
          const merged = mergeUserWithStudentData(prev, latestData);
          return {
            ...merged,
            name: prev.role === 'parent' ? `ولي أمر ${latestData.name}` : latestData.name,
            isSubscribed: Boolean(latestData.isSubscribed),
            purchasedCourseIds: latestPurchasedCourseIds,
          };
        });
      }
    }
  }, [studentsDatabase]);

  /* 🔔 جدولة تذكيرات تجديد الاشتراك تلقائياً (إشعار محلي قبل الانتهاء بيوم/يومين) */
  useEffect(() => {
    const role = user?.role;
    if (!user || (role !== 'student' && role !== 'parent')) return;
    scheduleRenewalReminders({
      expiry: user?.subscriptionExpiry || null,
      studentId: user?.studentId || user?.id || null,
    }).catch((e) => {
      console.warn('[renewal] failed to schedule reminders', e?.message || e);
    });
    // يُعاد الجدولة تلقائياً عند تجديد الاشتراك أو تغيّر موعد الانتهاء
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.subscriptionExpiry, user?.studentId, user?.id, user?.role]);

  /* ----------------------- remembered credentials ------------------------ */

  const saveRememberedCredentials = async (payload) => {
    try {
      if (payload && payload.role === 'admin') {
        await SecureStore.setItemAsync(ADMIN_SECURE_KEY, JSON.stringify(payload));
      } else {
        await AsyncStorage.setItem('@remembered_credentials', JSON.stringify(payload));
      }
      setRememberedCredentials(payload);
    } catch (e) {
      console.warn('Failed to save remembered credentials', e);
    }
  };

  const clearRememberedCredentials = async () => {
    try {
      await AsyncStorage.removeItem('@remembered_credentials');
      await SecureStore.deleteItemAsync(ADMIN_SECURE_KEY);
      setRememberedCredentials(null);
    } catch (e) {
      console.warn('Failed to clear remembered credentials', e);
    }
  };

  /* ------------------------------ subscription --------------------------- */

  const updateSubscriptionData = (newData) => {
    const merged = { ...subscriptionData, ...newData };
    setSubscriptionData(merged);
    Data.saveAppSetting('subscription', merged);

    if (newData && Object.prototype.hasOwnProperty.call(newData, 'isSubActive') && merged.isSubActive === false) {
      studentsDatabase.forEach((st) => {
        Data.saveProfile({ ...st, isSubscribed: false, subscriptionExpiry: null, subscriptionStart: null });
        Data.deleteSubscriptionForStudent(st.studentId || st.id);
      });
      setStudentsDatabase((prev) =>
        prev.map((st) => ({ ...st, isSubscribed: false, subscriptionExpiry: null, subscriptionStart: null }))
      );
    }
  };

  const setSubscriptionPrice = (newPrice) => {
    // Functional update + persist inside the updater so that when this is
    // called in the same tick as updateSubscriptionData (admin dashboard),
    // the latest merged plan is what reaches Supabase. (No StrictMode here,
    // so the updater runs exactly once per update.)
    setSubscriptionData((prev) => {
      const next = { ...prev, price: String(newPrice) };
      Data.saveAppSetting('subscription', next);
      return next;
    });
  };

  const subscribeUser = (studentId, expiryDate = null, status = true) => {
    if (!studentId) return;

    const isObj = expiryDate && typeof expiryDate === 'object' && (expiryDate.start || expiryDate.expiry);
    const startVal = isObj ? expiryDate.start || null : null;
    const expiryVal = isObj ? expiryDate.expiry || null : expiryDate;

    const updated = patchStudent(studentId, (st) => ({
      ...st,
      isSubscribed: Boolean(status),
      subscriptionStart: startVal || st.subscriptionStart || null,
      subscriptionExpiry: expiryVal,
    }));

    if (updated) {
      setUser((prev) =>
        prev && (prev.id === studentId || prev.studentId === studentId)
          ? mergeUserWithStudentData(prev, updated)
          : prev
      );
      // سجلّ الاشتراك الفعلي في جدول subscriptions (سجل واضح في الداتابيز)
      if (status) {
        Data.saveSubscription({
          studentId: updated.studentId || updated.id,
          plan: 'monthly',
          status: 'active',
          startedAt: updated.subscriptionStart || null,
        });
      } else {
        Data.deleteSubscriptionForStudent(updated.studentId || updated.id);
      }
    }
  };

  const cancelSubscriptionForStudent = (studentId) => {
    if (!studentId) return;
    subscribeUser(studentId, null, false);
  };

  /* ------------------------------ students ------------------------------- */

  const addStudent = (nameOrObject, customId = null, gender = 'boy', initialReport = '') => {
    let name = '';
    let studentCustomId = customId;
    let studentGender = gender;
    let reportText = initialReport;

    if (typeof nameOrObject === 'object' && nameOrObject !== null) {
      name = nameOrObject.name || '';
      studentCustomId = nameOrObject.studentId || customId;
      studentGender = nameOrObject.gender || gender;
      reportText = nameOrObject.initialReport || initialReport;
    } else {
      name = nameOrObject || '';
    }

    if (!name.trim()) {
      return { success: false, message: 'يرجى إدخال اسم الطالب!' };
    }

    const autoGeneratedId = `STU-${100 + studentsDatabase.length + 1}`;
    const newStudentId = (studentCustomId?.trim() || autoGeneratedId).toUpperCase();

    const exists = studentsDatabase.some(
      (s) => s.studentId && s.studentId.toUpperCase() === newStudentId
    );
    if (exists) {
      return { success: false, message: 'كود الطالب (ID) مستخدم بالفعل! اختر كوداً آخر.' };
    }

    const newStudent = {
      id: `stu_${Date.now()}`,
      name: name.trim(),
      role: 'student',
      studentId: newStudentId,
      gender: studentGender,
      stars: 0,
      isSubscribed: false,
      subscriptionExpiry: null,
      purchasedCourseIds: [],
      reports: reportText?.trim()
        ? [
            {
              id: `${Date.now()}-init`,
              text: reportText.trim(),
              date: new Date().toLocaleDateString('ar-EG'),
            },
          ]
        : [],
    };

    setStudentsDatabase((prev) => [...prev, newStudent]);
    Data.saveProfile(newStudent);
    // لو الكود ده كان متومستون (طالب بنفس الكود اتمسح في نفس الجلسة) نمسح
    // الـ tombstone عشان الطالب الجديد يظهر طبيعي — على عكس ids الكورسات،
    // أكواد الطلاب قابلة لإعادة الاستخدام بعد الحذف.
    [Data.toCanonicalId(newStudent.id), Data.toCanonicalId(newStudent.studentId), newStudentId]
      .filter(Boolean)
      .forEach((k) => deletedStudentIdsRef.current.delete(k));
    return { success: true, student: newStudent, message: 'تمت إضافة الطالب بنجاح! 🎉' };
  };

  const addStarsToStudent = (studentId, starsAmount = 10) => {
    if (!studentId) return;
    // Functional updates so repeated calls in the same tick (e.g. bulk leave
    // approval) accumulate instead of overwriting each other.
    let lastUpdated = null;
    setStudentsDatabase((prev) =>
      prev.map((st) => {
        if (st.id === studentId || st.studentId === studentId) {
          lastUpdated = { ...st, stars: Math.max(0, (st.stars || 0) + starsAmount) };
          return lastUpdated;
        }
        return st;
      })
    );
    setUser((prev) =>
      prev && (prev.id === studentId || prev.studentId === studentId)
        ? { ...prev, stars: Math.max(0, (prev.stars || 0) + starsAmount) }
        : prev
    );
    // Persist the final (accumulated) value after the render batch settles.
    setTimeout(() => {
      const toSave = lastUpdated || studentsRef.current.find(
        (s) => s.id === studentId || s.studentId === studentId
      );
      if (toSave) Data.saveProfile(toSave);
    }, 0);
  };

  const grantCourseAccess = (studentId, courseId) => {
    if (!studentId || !courseId) return;
    const updated = patchStudent(studentId, (st) => {
      const existingIds = Array.isArray(st.purchasedCourseIds) ? st.purchasedCourseIds : [];
      if (existingIds.includes(courseId)) return st;
      return { ...st, purchasedCourseIds: [...existingIds, courseId] };
    });
    if (updated) {
      setUser((prev) => {
        if (!prev || !(prev.id === studentId || prev.studentId === studentId)) return prev;
        const existingIds = Array.isArray(prev.purchasedCourseIds) ? prev.purchasedCourseIds : [];
        if (existingIds.includes(courseId)) return prev;
        return { ...prev, purchasedCourseIds: [...existingIds, courseId] };
      });
      // سجلّ شراء الكورس في جدول course_enrollments
      Data.saveCourseEnrollment({ studentId: updated.studentId || updated.id, courseId, status: 'active' });
    }
  };

  const revokeCourseAccess = (studentId, courseId) => {
    if (!studentId || !courseId) return;
    const updated = patchStudent(studentId, (st) => {
      const existingIds = Array.isArray(st.purchasedCourseIds) ? st.purchasedCourseIds : [];
      return { ...st, purchasedCourseIds: existingIds.filter((id) => id !== courseId) };
    });
    if (updated) {
      setUser((prev) => {
        if (!prev || !(prev.id === studentId || prev.studentId === studentId)) return prev;
        const existingIds = Array.isArray(prev.purchasedCourseIds) ? prev.purchasedCourseIds : [];
        return { ...prev, purchasedCourseIds: existingIds.filter((id) => id !== courseId) };
      });
      Data.deleteCourseEnrollment(updated.studentId || updated.id, courseId);
    }
  };

  const clearStudentCourseAccess = (studentId) => {
    if (!studentId) return;
    const updated = patchStudent(studentId, (st) => ({ ...st, purchasedCourseIds: [] }));
    if (updated) {
      setUser((prev) =>
        prev && (prev.id === studentId || prev.studentId === studentId)
          ? { ...prev, purchasedCourseIds: [] }
          : prev
      );
      Data.deleteCourseEnrollmentsForStudent(updated.studentId || updated.id);
    }
  };

  const useStarsForDiscount = (studentId, starsToUse) => {
    if (!studentId || starsToUse <= 0) {
      return { success: false, message: 'بيانات غير صالحة!' };
    }
    const targetStudent = findStudent(studentId);
    const currentStars = targetStudent ? targetStudent.stars || 0 : user?.stars || 0;

    if (currentStars < starsToUse) {
      return {
        success: false,
        message: `رصيد النجوم غير كافٍ! لديك ${currentStars} نجمة والمطلوب ${starsToUse} نجمة.`,
      };
    }

    addStarsToStudent(studentId, -starsToUse);
    return { success: true, message: `تم استخدام ${starsToUse} نجمة بنجاح! 🎁` };
  };

  const addStudentReport = (studentId, reportText) => {
    if (!reportText?.trim()) return;
    const newReport = {
      id: Date.now().toString(),
      text: reportText.trim(),
      date: new Date().toLocaleDateString('ar-EG'),
    };
    patchStudent(studentId, (st) => ({
      ...st,
      reports: [newReport, ...(st.reports || [])],
    }));
  };

  const deleteStudentReport = (studentId, reportId) => {
    patchStudent(studentId, (st) => ({
      ...st,
      reports: (st.reports || []).filter((r) => r.id !== reportId),
    }));
  };

  const setCourseProgress = (studentId, courseId, completedLessonsOrList) => {
    if (!studentId || !courseId) return;
    const isArray = Array.isArray(completedLessonsOrList);
    const list = isArray ? completedLessonsOrList : null;
    const count = isArray ? completedLessonsOrList.length : Number(completedLessonsOrList) || 0;

    patchStudent(studentId, (st) => {
      const prevProgress = st.courseProgress || {};
      const existing = prevProgress[courseId] || {};
      const updatedEntry = {
        completedLessons: count,
        completedList: list || existing.completedList || [],
        updatedAt: new Date().toISOString(),
      };
      return { ...st, courseProgress: { ...prevProgress, [courseId]: updatedEntry } };
    });
  };

  const getCourseProgress = (studentId, courseId) => {
    if (!studentId || !courseId) return null;
    const st = findStudent(studentId);
    if (!st) return null;
    return (st.courseProgress && st.courseProgress[courseId]) || null;
  };

  const deleteStudent = (studentId) => {
    if (!studentId) return { success: false, message: 'معرّف الطالب غير صالح' };

    const lookupId = String(studentId).trim().toUpperCase();
    const targetStudent = studentsDatabase.find(
      (s) =>
        String(s.id || '').trim().toUpperCase() === lookupId ||
        String(s.studentId || '').trim().toUpperCase() === lookupId
    );

    if (!targetStudent) {
      return { success: false, message: 'لم يتم العثور على الطالب.' };
    }

    const targetId = String(targetStudent.id || '').trim().toUpperCase();
    const targetCode = String(targetStudent.studentId || '').trim().toUpperCase();
    const targetName = String(targetStudent.name || '').trim().toLowerCase();

    // 0) tombstone: منع الريلتايم يرجع يدمج الطالب (أو سجلاته) والحذف لسه شغال.
    //    (الاسم بيتومستون كمان عشان يطابق تنظيف السجلات المحلية القديمة بالاسم)
    [Data.toCanonicalId(targetStudent.id), Data.toCanonicalId(targetStudent.studentId), targetId, targetCode, targetName.toUpperCase()]
      .filter(Boolean)
      .forEach((k) => deletedStudentIdsRef.current.add(k));

    // 1) حذف الطالب من قاعدة البيانات (Supabase + cache) وكل سجلاته المرتبطة
    setStudentsDatabase((prev) =>
      prev.filter((s) => {
        const currentId = String(s.id || '').trim().toUpperCase();
        const currentCode = String(s.studentId || '').trim().toUpperCase();
        return currentId !== targetId && currentCode !== targetId && currentId !== targetCode && currentCode !== targetCode;
      })
    );
    Data.deleteProfileRow(targetStudent.id);
    // حذف السجلات المرتبطة (اختبارات، تقارير تسميع، إجازات، مدفوعات، إشعارات)
    Data.deleteRecordsByField(Data.TABLES.examResults, Data.CACHE_NAMES.examResults, 'student_id', [targetStudent.id, targetStudent.studentId]);
    Data.deleteRecordsByField(Data.TABLES.sessionReports, Data.CACHE_NAMES.sessionReports, 'student_id', [targetStudent.id, targetStudent.studentId]);
    Data.deleteRecordsByField(Data.TABLES.leaveRequests, Data.CACHE_NAMES.leaveRequests, 'student_id', [targetStudent.id, targetStudent.studentId]);
    Data.deleteRecordsByField(Data.TABLES.payments, Data.CACHE_NAMES.payments, 'profile_id', [targetStudent.id, targetStudent.studentId]);
    Data.deleteRecordsByField(Data.TABLES.notifications, Data.CACHE_NAMES.notifications, 'parent_id', [targetStudent.id, targetStudent.studentId, targetStudent.name]);
    Data.deleteSubscriptionForStudent(targetStudent.studentId || targetStudent.id);
    Data.deleteCourseEnrollmentsForStudent(targetStudent.studentId || targetStudent.id);
    Data.purgeQueuedStudentWrites([targetStudent.id, targetStudent.studentId]);

    // 2) مسح طلبات الدفع
    setPaymentRequests((prev) =>
      prev.filter((req) => {
        const reqStudentId = String(req.studentId || '').trim().toUpperCase();
        const reqStudentName = String(req.studentName || '').trim().toLowerCase();
        return reqStudentId !== targetId && reqStudentId !== targetCode && reqStudentName !== targetName;
      })
    );

    // 3) مسح طلبات الإجازة
    setLeaveRequests((prev) =>
      prev.filter((leave) => {
        const leaveStudentId = String(leave.studentId || '').trim().toUpperCase();
        const leaveStudentName = String(leave.studentName || '').trim().toLowerCase();
        return leaveStudentId !== targetId && leaveStudentId !== targetCode && leaveStudentName !== targetName;
      })
    );

    // 4) مسح تقارير الجلسات والتسميع
    setSessionReports((prev) =>
      prev.filter((report) => {
        const reportStudentId = String(report.studentId || '').trim().toUpperCase();
        const reportStudentName = String(report.studentName || '').trim().toLowerCase();
        return reportStudentId !== targetId && reportStudentId !== targetCode && reportStudentName !== targetName;
      })
    );

    // 5) مسح إشعارات ولي الأمر
    setParentNotifications((prev) =>
      prev.filter((notif) => {
        const notifStudentId = String(notif.parentId || '').trim().toUpperCase();
        const notifStudentName = String(notif.studentName || '').trim().toLowerCase();
        return notifStudentId !== targetId && notifStudentId !== targetCode && notifStudentName !== targetName;
      })
    );

    // 6) تسجيل الخروج إذا كان الطالب المحدد هو المسجل حالياً
    setUser((prevUser) => {
      if (!prevUser) return prevUser;
      if (prevUser.id === targetStudent.id || prevUser.studentId === targetStudent.studentId) return null;
      return prevUser;
    });

    return { success: true, message: 'تم حذف حساب الطالب وكل البيانات المرتبطة به.' };
  };

  /* ------------------------------ الإجازات -------------------------------- */

  const addLeaveRequest = (newRequest) => {
    if (!newRequest) return { success: false, message: 'بيانات غير صالحة' };

    const targetStudentId = newRequest.studentId || user?.studentId || user?.id;
    const targetStudentName = newRequest.studentName || user?.studentName || user?.name || 'طالب';

    const requestWithDetails = {
      id: `vac_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      title: newRequest.title || 'طلب يوم إجازة (بريك) 🌴',
      reason: newRequest.reason || 'بدون سبب مذكور',
      cost: Number(newRequest.cost) || 30,
      requestedBy: newRequest.requestedBy || user?.role || 'student',
      studentId: targetStudentId,
      studentName: targetStudentName,
      status: 'قيد المراجعة ⏳',
      date: new Date().toLocaleDateString('ar-EG'),
      createdAt: Date.now(),
    };

    setLeaveRequests((prev) => [requestWithDetails, ...prev]);
    Data.saveLeaveRequest(requestWithDetails);

    return {
      success: true,
      message: 'تم إرسال طلب الإجازة بنجاح! 🎉',
      request: requestWithDetails,
    };
  };

  const updateLeaveStatus = (leaveId, newStatus) => {
    if (!leaveId || !newStatus) return;

    const targetRequest = leaveRequests.find((req) => req.id === leaveId);
    if (!targetRequest) return;

    if (newStatus === 'مقبولة ✅' && targetRequest.status !== 'مقبولة ✅') {
      const cost = targetRequest.cost || 30;
      addStarsToStudent(targetRequest.studentId, -cost);
    }

    // نُحدّث حالة الطلب بدل حذفه: التعديل بيتزامن لكل الأجهزة عبر realtime
    // (نفس مسار المزامنة الموثوق للطلبات الجديدة) والقرار النهائي بيظهر
    // في الداتابيز — بدل ما الحذف يضيع لو event الحذف ما وصلهوش.
    const updated = { ...targetRequest, status: newStatus };
    setLeaveRequests((prev) => prev.map((req) => (req.id === leaveId ? updated : req)));
    Data.saveLeaveRequest(updated);
  };

  /* ------------------------------ التقارير -------------------------------- */

  const addSessionReport = (report) => {
    if (!report) return null;
    const normalizedReport = {
      id: report.id || `session_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      studentId: report.studentId || report.userId || null,
      studentName: report.studentName || report.userName || 'الطالب',
      roomName: report.roomName || report.surah || 'جلسة التسميع',
      joinTime: report.joinTime || null,
      leaveTime: report.leaveTime || null,
      durationText: report.durationText || null,
      pdfUri: report.pdfUri || null,
      transcriptionText: report.transcriptionText || '',
      mistakesList: Array.isArray(report.mistakesList)
        ? report.mistakesList
        : report.mistakes
          ? [report.mistakes]
          : [],
      score: Number(report.score) || null,
      aiNotes: report.aiNotes || report.notes || '',
      date: report.date || new Date().toLocaleDateString('ar-EG'),
      hasAudioContent: Boolean(report.hasAudioContent),
      createdAt: report.createdAt || Date.now(),
    };

    setSessionReports((prev) => [normalizedReport, ...prev]);
    Data.saveSessionReport(normalizedReport);
    return normalizedReport;
  };

  const getSessionReports = (studentId) => {
    if (!studentId) return [];
    return sessionReports.filter((report) => report.studentId === studentId);
  };

  /* --------------------------- إشعارات الأولياء ---------------------------- */

  const addParentNotification = (parentId, message, courseTitle, studentName) => {
    const notification = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      parentId,
      message,
      courseTitle,
      studentName,
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    setParentNotifications((prev) => [notification, ...prev]);
    Data.saveNotification(notification);
  };

  const markNotificationAsRead = (notificationId) => {
    const target = parentNotifications.find((n) => n.id === notificationId);
    if (!target) return;
    const updated = { ...target, isRead: true };
    setParentNotifications((prev) => prev.map((n) => (n.id === notificationId ? updated : n)));
    Data.saveNotification(updated);
  };

  const deleteNotification = (notificationId) => {
    setParentNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    Data.deleteNotificationRow(notificationId);
  };

  const getParentNotifications = (parentId) => {
    return parentNotifications.filter((n) => n.parentId === parentId);
  };

  /* --------------------------- المدفوعات اليدوية --------------------------- */

  const submitManualTransfer = ({ studentId, studentName, senderNumber, referenceCode, amount = null, target = 'subscription', courseId = null }) => {
    if (!studentId) return { success: false, message: 'مطلوب معرّف الطالب' };

    const req = {
      id: `pay_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      studentId,
      studentName: studentName || null,
      senderNumber: senderNumber || null,
      referenceCode: referenceCode || null,
      amount: amount || null,
      target,
      courseId: courseId || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setPaymentRequests((prev) => [req, ...prev]);
    Data.savePayment(req);
    return { success: true, request: req };
  };

  const approvePaymentRequest = (requestId) => {
    const found = paymentRequests.find((r) => r.id === requestId);
    if (!found) return { success: false, message: 'لم يتم العثور على طلب الدفع' };

    setPaymentRequests((prev) => prev.filter((r) => r.id !== requestId));
    Data.deletePayment(requestId);

    try {
      if (found.target === 'subscription') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const expiry = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
        subscribeUser(found.studentId, { start: start.toISOString(), expiry: expiry.toISOString() }, true);
      }
      if (found.target === 'course' && found.courseId) {
        grantCourseAccess(found.studentId, found.courseId);
      }
    } catch (e) {
      console.warn('approvePaymentRequest failed', e);
    }

    return { success: true };
  };

  const rejectPaymentRequest = (requestId) => {
    const found = paymentRequests.find((r) => r.id === requestId);
    if (!found) return { success: false, message: 'لم يتم العثور على طلب الدفع' };
    setPaymentRequests((prev) => prev.filter((r) => r.id !== requestId));
    Data.deletePayment(requestId);
    return { success: true };
  };

  /* ----------------------------- Reward wheel ------------------------------ */

  const rewardDefinitions = (() => {
    const values = [5, 10, 15, 20, 25];
    const arr = [];
    for (let i = 0; i < 12; i++) {
      const val = values[i % values.length];
      arr.push({ id: `points_${val}_${i}`, label: `+${val} نقاط`, type: 'points', amount: val, weight: 1 });
    }
    return arr;
  })();

  const chooseWeightedRandom = (items) => {
    const total = (items || []).reduce((s, it) => s + (it.weight || 0), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      r -= it.weight || 0;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  const grantRewardToStudent = (studentId, reward) => {
    if (!studentId || !reward) return null;

    const updated = patchStudent(studentId, (st) => {
      const copy = { ...st };
      copy.badges = Array.isArray(copy.badges) ? copy.badges : copy.badges ? [copy.badges] : [];

      if (reward.type === 'points') {
        copy.stars = Math.max(0, (copy.stars || 0) + (Number(reward.amount) || 0));
      } else if (reward.type === 'badge') {
        const id = reward.badgeId || `badge_${Date.now()}`;
        if (!copy.badges.includes(id)) copy.badges.push(id);
      } else if (reward.type === 'tempProfile') {
        copy.tempProfile = { style: reward.style || {}, expiresAt: Date.now() + (reward.durationHours || 24) * 60 * 60 * 1000 };
      } else if (reward.type === 'doublePoints') {
        copy.doublePointsUntil = Date.now() + (reward.durationMinutes || 120) * 60 * 1000;
      }

      copy.rewardHistory = Array.isArray(copy.rewardHistory) ? copy.rewardHistory : [];
      copy.rewardHistory.unshift({ id: `rw_${Date.now()}`, rewardId: reward.id, label: reward.label, grantedAt: new Date().toISOString() });
      return copy;
    });

    if (updated) {
      setUser((prev) =>
        prev && (prev.id === studentId || prev.studentId === studentId)
          ? mergeUserWithStudentData(prev, updated)
          : prev
      );
    }
    return reward;
  };

  const spinRewardWheel = (studentId) => {
    const picked = chooseWeightedRandom(rewardDefinitions);
    if (!picked) return null;
    grantRewardToStudent(studentId, picked);
    return picked;
  };

  const chooseRewardIndex = () => {
    const items = rewardDefinitions;
    const total = (items || []).reduce((s, it) => s + (it.weight || 0), 0);
    if (total <= 0 || items.length === 0) return { index: -1, picked: null };
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= items[i].weight || 0;
      if (r <= 0) return { index: i, picked: items[i] };
    }
    return { index: items.length - 1, picked: items[items.length - 1] };
  };

  /* -------------------------- شجرة الحفظ (habit tree) ----------------------- */

  const normalizeDateKey = (d) => {
    const dt = d ? new Date(d) : new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const daysBetweenKeys = (aKey, bKey) => {
    if (!aKey || !bKey) return Infinity;
    const a = new Date(`${aKey}T00:00:00`);
    const b = new Date(`${bKey}T00:00:00`);
    const ms = Math.abs(b - a);
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  };

  const recordDailyPractice = (studentId, when = Date.now(), courseId = 'global') => {
    if (!studentId) return null;
    const key = normalizeDateKey(when);
    const st = findStudent(studentId);
    if (!st) return null;

    const copy = { ...st };
    copy.practiceByCourse = copy.practiceByCourse && typeof copy.practiceByCourse === 'object' ? { ...copy.practiceByCourse } : {};
    const bucket = copy.practiceByCourse[courseId] ? { ...copy.practiceByCourse[courseId] } : { practiceDates: [] };

    bucket.practiceDates = Array.isArray(bucket.practiceDates) ? bucket.practiceDates : [];
    if (!bucket.practiceDates.includes(key)) {
      bucket.practiceDates.unshift(key);
      if (bucket.practiceDates.length > 365) bucket.practiceDates = bucket.practiceDates.slice(0, 365);
    }
    bucket.lastPracticeDate = bucket.practiceDates[0] || null;

    const datesSet = new Set(bucket.practiceDates);
    let streak = 0;
    if (bucket.lastPracticeDate) {
      let cur = new Date(`${bucket.lastPracticeDate}T00:00:00`);
      while (true) {
        const curKey = normalizeDateKey(cur);
        if (datesSet.has(curKey)) {
          streak += 1;
          cur = new Date(cur.getTime() - 24 * 60 * 60 * 1000);
        } else break;
      }
    }
    bucket.streak = streak;

    const todayKey = normalizeDateKey(new Date());
    const daysSinceLast = daysBetweenKeys(bucket.lastPracticeDate, todayKey);
    const missedDays = Math.max(0, daysSinceLast);

    let stage = 'seed';
    if (streak >= 14) stage = 'mature';
    else if (streak >= 7) stage = 'young';
    else if (streak >= 3) stage = 'sapling';
    else if (streak >= 1) stage = 'sprout';

    const baseLeavesByStage = { seed: 0, sprout: 3, sapling: 5, young: 7, mature: 9 };
    const baseLeaves = baseLeavesByStage[stage] || 0;
    const leaves = Math.max(0, baseLeaves - missedDays);

    bucket.tree = { stage, leaves, lastUpdated: Date.now(), lastPracticeDate: bucket.lastPracticeDate };
    copy.practiceByCourse[courseId] = bucket;

    setStudentsDatabase((prev) => prev.map((s) => (s.id === studentId || s.studentId === studentId ? copy : s)));
    setUser((prev) =>
      prev && (prev.id === studentId || prev.studentId === studentId)
        ? { ...prev, practiceByCourse: { ...(prev.practiceByCourse || {}), [courseId]: bucket } }
        : prev
    );
    Data.saveProfile(copy);

    return {
      stage: bucket.tree.stage || 'seed',
      leaves: bucket.tree.leaves || 0,
      streak: bucket.streak || 0,
      lastPracticeDate: bucket.lastPracticeDate || null,
    };
  };

  const getTreeState = (studentId, courseId = 'global') => {
    if (!studentId) return null;
    const st = findStudent(studentId);
    if (!st) return { stage: 'seed', leaves: 0, streak: 0, lastPracticeDate: null };
    const bucket = st.practiceByCourse && st.practiceByCourse[courseId];
    if (!bucket) return { stage: 'seed', leaves: 0, streak: 0, lastPracticeDate: null };
    return {
      stage: bucket.tree?.stage || 'seed',
      leaves: bucket.tree?.leaves || 0,
      streak: bucket.streak || 0,
      lastPracticeDate: bucket.lastPracticeDate || null,
    };
  };

  /* ------------------------------ تسجيل الدخول ------------------------------ */

  const login = async (credentials) => {
    if (!credentials) {
      return { success: false, message: 'برجاء إدخال البيانات!' };
    }

    const inputUsername = credentials.username?.trim().toLowerCase();
    const inputPassword = credentials.password?.trim();
    const inputStudentId = credentials.studentId?.trim().toUpperCase();

    if (credentials.role === 'admin' || inputUsername) {
      if (!inputUsername || !inputPassword) {
        return { success: false, message: 'يرجى إدخال اسم المستخدم وكلمة السر!' };
      }

      // 🛡️ تسجيل الدخول المحلي السريع: admin / admin (يعمل بدون إنترنت)
      if (
        inputUsername === LOCAL_ADMIN_ACCOUNT.username &&
        inputPassword === LOCAL_ADMIN_ACCOUNT.password
      ) {
        setUser({ ...LOCAL_ADMIN_ACCOUNT });
        return { success: true };
      }
      if (inputUsername === LOCAL_ADMIN_ACCOUNT.username) {
        return { success: false, message: 'كلمة المرور غير صحيحة!' };
      }

      // وإلا: تسجيل دخول الأدمن عبر Supabase (بريد إلكتروني + كلمة سر)
      try {
        const profile = await Data.adminLogin(inputUsername, inputPassword);
        if (!profile) {
          return {
            success: false,
            message: 'بيانات الدخول غير صحيحة، أو هذا الحساب ليس مسؤولاً!',
          };
        }
        const adminUser = {
          ...Data.profileRowToStudent(profile),
          name: profile.full_name || 'المدير',
          role: 'admin',
        };
        setUser(adminUser);
        return { success: true };
      } catch (e) {
        return { success: false, message: 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.' };
      }
    }

    if (credentials.role === 'student' || credentials.role === 'parent' || inputStudentId) {
      const foundUser = await Data.findStudentByCode(inputStudentId);
      if (foundUser) {
        const currentRole = credentials.role || 'student';
        const displayName = currentRole === 'parent' ? `ولي أمر ${foundUser.name}` : foundUser.name;

        setUser({
          ...foundUser,
          studentDbId: foundUser.id,
          name: displayName,
          studentName: foundUser.name,
          role: currentRole,
          gender: foundUser.gender || 'boy',
          stars: foundUser.stars || 0,
          isSubscribed: Boolean(foundUser.isSubscribed),
          subscriptionExpiry: foundUser.subscriptionExpiry || null,
          purchasedCourseIds: Array.isArray(foundUser.purchasedCourseIds) ? foundUser.purchasedCourseIds : [],
          reports: foundUser.reports || [],
        });

        return { success: true };
      }
      return { success: false, message: 'كود الطالب غير صحيح أو غير مسجل!' };
    }

    return { success: false, message: 'يرجى تحديد نوع الحساب وإدخال البيانات!' };
  };

  const logout = async () => {
    await Data.signOut();
    setUser(null);
    await clearRememberedCredentials();
  };

  /** تغيير كلمة سر الأدمن على Supabase مباشرة (يتطلب الجلسة النشطة). */
  const changePassword = async (newPassword) => {
    return Data.changeAdminPassword(newPassword);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoaded,
        appSettings,
        leaveRequests,
        parentNotifications,
        subscriptionData,
        updateSubscriptionData,
        subscribeUser,
        addLeaveRequest,
        updateLeaveStatus,
        login,
        logout,
        changePassword,
        addStudent,
        addStudentReport,
        deleteStudentReport,
        addStarsToStudent,
        useStarsForDiscount,
        setCourseProgress,
        getCourseProgress,
        addParentNotification,
        markNotificationAsRead,
        deleteNotification,
        getParentNotifications,
        addSessionReport,
        getSessionReports,
        sessionReports,
        subscriptions,
        courseEnrollments,
        cancelSubscriptionForStudent,
        setSubscriptionPrice,
        rewardDefinitions,
        spinRewardWheel,
        chooseRewardIndex,
        grantRewardToStudent,
        recordDailyPractice,
        getTreeState,
        rememberedCredentials,
        saveRememberedCredentials,
        clearRememberedCredentials,
        studentsDatabase,
        paymentRequests,
        submitManualTransfer,
        approvePaymentRequest,
        rejectPaymentRequest,
        grantCourseAccess,
        revokeCourseAccess,
        clearStudentCourseAccess,
        deleteStudent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
