// services/sessionBackgroundService.js
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// فحص هل التطبيق شغال جوه Expo Go ولا Build حقيقي
const isExpoGo = Constants.appOwnership === 'expo';

// 🔔 مفتاح تخزين تذكيرات تجديد الاشتراك المجدولة (لمنع تكرار الجدولة)
const RENEWAL_REMINDERS_KEY = '@alhuda_renewal_reminders';
const RENEWAL_CHANNEL_ID = 'renewal-reminders';

// إعداد شكل الإشعار المستمر (فقط لو مش Expo Go عشان يمنع الكراش)
if (!isExpoGo) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.log('Notifications not fully supported in current environment');
  }
}

// 🟢 1. بدء إشعار الخلفية عند دخول غرفة التسميع
export const startSessionForegroundNotification = async (roomTitle = 'غرفة التسميع') => {
  if (isExpoGo) {
    console.log('⚠️ Expo Go: تم تتطنيش إشعار الخلفية لمنع الكراش.');
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎙️ ${roomTitle} شغال حالياً`,
        body: 'جاري تسجيل التسميع وتحليله في الخلفية...',
        sticky: true, // يخليه ثابت في شريط الإشعارات
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // يظهر فوراً
    });
  } catch (err) {
    console.log('خطأ إشعار الخلفية:', err);
  }
};

// 🔴 2. إنهاء إشعار الخلفية وإظهار إشعار جاهزية الـ PDF
export const stopSessionNotificationAndShowPDF = async (pdfUri) => {
  if (isExpoGo) {
    console.log('⚠️ Expo Go: تم تتطنيش إشعار الـ PDF لمنع الكراش.');
    return;
  }

  try {
    await Notifications.dismissAllNotificationsAsync(); // إخفاء إشعار التسجيل

    // إشعار اكتمال الملف
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📄 تم إصدار تقرير الجلسة (PDF)',
        body: 'اضغط هنا لمعاينة تقرير التسميع والحضور المكتمل.',
        data: { pdfUri },
      },
      trigger: null,
    });
  } catch (err) {
    console.log('خطأ إشعار النهاية:', err);
  }
};

/* ------------------------- 🟡 تذكير تجديد الاشتراك ------------------------- */

async function loadRenewalReminders() {
  try {
    const raw = await AsyncStorage.getItem(RENEWAL_REMINDERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

async function saveRenewalReminders(map) {
  try {
    await AsyncStorage.setItem(RENEWAL_REMINDERS_KEY, JSON.stringify(map));
  } catch (e) {
    /* ignore */
  }
}

/**
 * 🟡 3. تذكير تلقائي بتجديد الاشتراك قبل انتهائه.
 *
 * يجدول إشعارين محليين: قبل يومين ويوم واحد من تاريخ الانتهاء (الساعة ١٠ ص).
 * - يُستدعى عند فتح التطبيق / تغيّر موعد انتهاء الاشتراك.
 * - يلغى ويُعاد الجدولة تلقائياً عند التجديد أو تغيّر الموعد (يُقارن بموعد الانتهاء).
 * - لا يطلب الإذن ولا يجدول شيئاً إلا عندما يكون الانتهاء قريباً (≤ ٤ أيام)،
 *   حتى لا يُزعج المستخدم الجديد بإذن إشعارات قبل شهر من الاستحقاق.
 * - في Expo Go يعتمد التذكير على التنبيه الداخلي للتطبيق فقط (نفس حارس الكراش).
 */
// حارس ضد الجدولة المتزامنة (StrictMode / تشغيل مزدوج للتأثيرات) حتى لا تتكرر الإشعارات
let renewalInFlight = null;

export const scheduleRenewalReminders = async ({ expiry, studentId }) => {
  if (renewalInFlight) return renewalInFlight;
  renewalInFlight = doScheduleRenewalReminders({ expiry, studentId }).finally(() => {
    renewalInFlight = null;
  });
  return renewalInFlight;
};

const doScheduleRenewalReminders = async ({ expiry, studentId }) => {
  const studentKey = String(studentId || 'default');
  const expiryMs = expiry ? new Date(expiry).getTime() : NaN;
  const hasFutureExpiry = Number.isFinite(expiryMs) && expiryMs > Date.now();

  const store = await loadRenewalReminders();
  const prev = store[studentKey];

  // لا يوجد اشتراك فعّال أو موعد انتهاء -> ألغِ أي تذكيرات سابقة لهذا الطالب
  if (!hasFutureExpiry) {
    if (prev && prev.ids && prev.ids.length) {
      await Promise.all(
        prev.ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
      );
    }
    if (prev) {
      const next = { ...store };
      delete next[studentKey];
      await saveRenewalReminders(next);
    }
    return null;
  }

  const expiryKey = new Date(expiryMs).toISOString();

  // نفس موعد الانتهاء -> التذكيرات مجدولة مسبقاً بالفعل
  if (prev && prev.expiryKey === expiryKey) return prev.ids;

  // تغيّر موعد الانتهاء -> ألغِ تذكيرات الموعد القديم فوراً (حتى لو كان الجديد
  // بعيداً: التجديد الشهري العادي = +٣٠ يوم، وبدون هذا الإلغاء ستُرسل تذكيرات
  // "ينتهي بعد يومين" الخاصة بالموعد القديم بعد التجديد!)
  if (prev && prev.ids && prev.ids.length) {
    await Promise.all(
      prev.ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
    );
  }

  // لا نجدول إلا عندما يقترب الانتهاء (حتى لا نطلب إذن الإشعارات قبل الأوان)
  if (expiryMs - Date.now() > 4 * 24 * 60 * 60 * 1000) {
    // سجّل الموعد الجديد (بدون تذكيرات) حتى لا نُعيد إلغاء وفحص في كل فتحة
    const next = { ...store, [studentKey]: { expiryKey, ids: [] } };
    await saveRenewalReminders(next);
    return null;
  }

  // في Expo Go يتم الاعتماد على التنبيه الداخلي فقط (نفس حارس إشعارات الجلسات)
  if (isExpoGo) {
    const next = { ...store, [studentKey]: { expiryKey, ids: [] } };
    await saveRenewalReminders(next);
    return [];
  }

  // الإذن (يُطلب مرة واحدة فقط من نظام التشغيل)
  try {
    const current = await Notifications.getPermissionsAsync();
    const perm = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      // سجّل الموعد حتى لا يُعاد طلب الإذن في كل فتحة تالية
      const next = { ...store, [studentKey]: { expiryKey, ids: [] } };
      await saveRenewalReminders(next);
      return [];
    }
  } catch (e) {
    return null;
  }

  // قناة أندرويد مخصصة (الشرط أندرويد 8+)
  try {
    await Notifications.setNotificationChannelAsync(RENEWAL_CHANNEL_ID, {
      name: 'تذكيرات الاشتراك',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  } catch (e) {
    /* iOS / غير مدعوم */
  }

  // أوقات التذكير: يومين ويوم واحد قبل الانتهاء الساعة ١٠ ص
  const baseDate = new Date(expiryMs);
  const atTime = (daysBefore) => {
    const d = new Date(baseDate.getTime() - daysBefore * 24 * 60 * 60 * 1000);
    d.setHours(10, 0, 0, 0);
    return d;
  };

  const candidates = [
    {
      daysBefore: 2,
      body: 'ينتهي اشتراكك بعد يومين! جدّده الآن لاستمرار وصولك لجميع الكورسات والمميزات.',
    },
    {
      daysBefore: 1,
      body: 'غداً ينتهي اشتراكك ⏰ — جدّده الآن قبل انتهاء الوصول.',
    },
  ];

  const ids = [];
  for (const c of candidates) {
    const t = atTime(c.daysBefore);
    if (t.getTime() <= Date.now()) continue; // الموعد فات -> لا نجدول
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔 تذكير تجديد الاشتراك',
          body: c.body,
          data: { type: 'renewal_reminder', expiry: expiryKey },
        },
        trigger: { date: t, channelId: RENEWAL_CHANNEL_ID },
      });
      ids.push(id);
    } catch (e) {
      console.log('خطأ جدولة تذكير التجديد:', e);
    }
  }

  const next = { ...store, [studentKey]: { expiryKey, ids } };
  await saveRenewalReminders(next);
  return ids;
};