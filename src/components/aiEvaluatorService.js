// services/aiEvaluatorService.js

/**
 * دالة طلب تحليل التسميع من البوت بعد انتهاء الغرفة الصوتية
 * @param {string} audioUrl - رابط تسجل الصوت المخزن
 * @param {string} expectedSurah - اسم السورة أو آيات التسميع المتوقعة
 */
export const requestRecitationAnalysis = async (audioUrl, expectedSurah) => {
  try {
    // استدعاء الـ API الخاص بـ Backend التطبيق (أو Firebase Cloud Function)
    const response = await fetch('HTTPS_YOUR_BACKEND_API_URL/evaluate-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioUrl,
        expectedSurah,
      }),
    });

    const data = await response.json();
    return data; // برجع التقرير: { rating, mistakesCount, mistakesList, notes }
  } catch (error) {
    console.error('خطأ أثناء التواصل مع بوت تحليل التسميع:', error);
    return null;
  }
};