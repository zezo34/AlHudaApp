// services/pdfReportGenerator.js
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * دالة إنشاء ملف الـ PDF ديناميكياً بناءً على بيانات الجلسة المستلمة
 */
export const generateSessionPDF = async (sessionData) => {
  const {
    studentName = 'الطالب',
    roomName = 'غرفة التسميع الصوتية',
    joinTime = '--',
    leaveTime = '--',
    durationText = '--',
    hasAudioContent = false,
    transcriptionText = '',
    mistakesList = [],
    score = 100,
    aiNotes = '',
  } = sessionData || {};

  // تصميم الهيكل الداخلي للـ PDF بـ HTML & CSS متناسق وديناميكي
  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 25px; color: #1E293B; background-color: #FAFAFA; }
        .header { text-align: center; border-bottom: 3px solid #10B981; padding-bottom: 12px; margin-bottom: 20px; }
        .title { font-size: 22px; color: #0F172A; margin: 0; }
        .subtitle { font-size: 13px; color: #64748B; margin-top: 4px; }
        .section { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 15px; margin-bottom: 15px; }
        .section-title { font-size: 16px; color: #0F172A; font-weight: bold; margin-bottom: 10px; border-right: 4px solid #10B981; padding-right: 8px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
        .label { color: #475569; font-weight: bold; }
        .value { color: #0F172A; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; }
        .badge-success { background: #DCFCE7; color: #15803D; }
        .badge-warning { background: #FEF3C7; color: #B45309; }
        .mistake-box { background: #FEF2F2; border-right: 3px solid #EF4444; padding: 8px 12px; margin-top: 6px; border-radius: 4px; font-size: 13px; color: #991B1B; }
        .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94A3B8; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="title">📜 تقرير ملخص الجلسة والحضور</h1>
        <div class="subtitle">تم التوليد تلقائياً عبر نظام المساعد الذكي</div>
      </div>

      <!-- 1. بيانات الحضور والوقت الفعلية -->
      <div class="section">
        <div class="section-title">⏱️ سجل الحضور والوقت</div>
        <div class="row"><span class="label">اسم الطالب:</span> <span class="value">${studentName}</span></div>
        <div class="row"><span class="label">اسم الغرفة:</span> <span class="value">${roomName}</span></div>
        <div class="row"><span class="label">وقت الدخول:</span> <span class="value">${joinTime}</span></div>
        <div class="row"><span class="label">وقت الخروج:</span> <span class="value">${leaveTime}</span></div>
        <div class="row"><span class="label">مدة المكالمة:</span> <span class="value">${durationText}</span></div>
      </div>

      <!-- 2. تفاصيل التسميع والتحليل (حسب المتوفر) -->
      ${
        hasAudioContent
          ? `
        <div class="section">
          <div class="section-title">🎙️ تحليل التسميع والأخطاء</div>
          <div class="row">
            <span class="label">درجة التقييم:</span> 
            <span class="badge ${score >= 80 ? 'badge-success' : 'badge-warning'}">${score}%</span>
          </div>
          
          <div style="margin-top: 12px;">
            <div class="label">📝 ما تم قراءته خلال الجلسة:</div>
            <p style="background: #F8FAFC; padding: 10px; border-radius: 6px; font-size: 13px; line-height: 1.6; color: #334155;">
              "${transcriptionText || 'تمت المتابعة بنجاح'}"
            </p>
          </div>

          ${
            mistakesList.length > 0
              ? `
            <div style="margin-top: 12px;">
              <div class="label" style="color: #DC2626;">❌ الأخطاء المرصودة:</div>
              ${mistakesList.map((m) => `<div class="mistake-box">• ${m}</div>`).join('')}
            </div>
            `
              : `<div class="badge badge-success" style="margin-top: 8px;">✨ ممتازة! لا توجد أخطاء مسجلة.</div>`
          }
        </div>
        `
          : `
        <div class="section" style="background: #F8FAFC; border-color: #CBD5E1;">
          <div class="section-title" style="border-right-color: #0D9488;">📝 ملاحظات الجلسة</div>
          <p style="font-size: 13px; color: #334155; line-height: 1.6; margin: 0;">
            ${aiNotes || 'تم تسجيل وقت الدخول والخروج والتواجد داخل الاجتماع بنجاح.'}
          </p>
        </div>
        `
      }

      <div class="footer">
        تم إنشاء هذا التقرير بتاريخ ${new Date().toLocaleDateString('ar-EG')} - جميع الحقوق محفوظة
      </div>
    </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    return uri; // بيطلع مسار الـ PDF الحقيقي بناءً على اللي حصل في المكالمة
  } catch (error) {
    console.error('خطأ في توليد PDF:', error);
    return null;
  }
};

/**
 * دالة منفصلة لفتح أو مشاركة ملف الـ PDF بسلاسة من غير تجميد للشاشة
 */
export const openSessionPDF = async (uri) => {
  if (!uri) return;
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    }
  } catch (error) {
    console.error('خطأ في فتح الملف:', error);
  }
};