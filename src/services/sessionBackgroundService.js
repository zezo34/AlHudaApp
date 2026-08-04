// services/sessionBackgroundService.js
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// فحص هل التطبيق شغال جوه Expo Go ولا Build حقيقي
const isExpoGo = Constants.appOwnership === 'expo';

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