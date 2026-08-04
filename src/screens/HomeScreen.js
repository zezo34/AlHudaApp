import React, { useContext, useState, useEffect, memo, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ImageBackground,
  BackHandler,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AuthContext } from '../context/AuthContext';
import LottieView from 'lottie-react-native';
import { CourseContext } from '../context/CourseContext';
import ArchHeader from '../components/ArchHeader';
import StudentExamScreen from './StudentExamScreen';
import CourseDetailsScreen from './CourseDetailsScreen';
import LiveSessionScreen from './LiveSessionScreen';
import ParentProgressScreen from './ParentProgressScreen';
import StudentContentScreen from './StudentContentScreen';
import IjazaScreen from './IjazaScreen';
import ParadiseJourneyScreen from './ParadiseJourneyScreen';

// 📄 استدعاء المكون الداخلي لعرض الـ PDF من داخل التطبيق بدون تنزيل
import InternalPdfViewerModal from '../components/InternalPdfViewerModal';

const CATEGORIES = ['الكل', 'القرآن الكريم', 'اللغة العربية', 'الدراسات الإسلامية'];

const KID_CARD_COLORS = [
  { bg: 'rgba(255, 250, 240, 0.90)', border: '#FF9F1C', badgeBg: '#FFBF69', icon: '📖✨', dark: '#C27800' },
  { bg: 'rgba(240, 249, 255, 0.90)', border: '#38BDF8', badgeBg: '#7DD3FC', icon: '🎨💬', dark: '#0388C1' },
  { bg: 'rgba(240, 253, 244, 0.90)', border: '#34D399', badgeBg: '#6EE7B7', icon: '🕌🌟', dark: '#15966B' },
  { bg: 'rgba(255, 240, 245, 0.90)', border: '#F472B6', badgeBg: '#F472B6', icon: '⭐🎈', dark: '#B91C61' },
];

const BG_IMAGES = {
  parent: { uri: 'https://img.freepik.com/free-vector/arabic-pattern-background-gold-style_23-2148810217.jpg' },
  student: { uri: 'https://img.freepik.com/free-vector/hand-drawn-ramadan-kareem-background_23-2149306041.jpg' },
};

// ==========================================
// 1. مكون نظام الاشتراك الشهري (عداد تصاعدي للأيام من 30)
// ==========================================
const MonthlySubscriptionCard = memo(({ isSubscribed, onSubscribe, subscriptionExpiry, subscriptionStart, isParent, planData }) => {
  const price = planData?.price ?? 199;
  const title = planData?.title || '📅 الاشتراك الشهري الشامل';
  const description = planData?.description || `✨ احصل على وصول غير محدود لكافة الغرف الصوتية، الاختبارات، والخدمات الممتازة (${price} ج.م/شهرياً)`;

  const [currentDay, setCurrentDay] = useState(1);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const expiryTime = subscriptionExpiry ? new Date(subscriptionExpiry).getTime() : NaN;
    
    if (!isSubscribed || isNaN(expiryTime)) {
      setIsExpired(true);
      return;
    }

    const calculateDays = () => {
      const now = new Date();
      const nowMs = now.getTime();
      const totalRemaining = expiryTime - nowMs;

      // If subscriptionStart is provided, use calendar-day counting from that date (local midnight)
      if (subscriptionStart) {
        const startDate = new Date(subscriptionStart);
        // normalize to local midnight to count full calendar days
        startDate.setHours(0,0,0,0);
        const startMs = startDate.getTime();

        // difference in days between today (local date) and start date
        const diffDays = Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24));
        const dayNum = Math.min(Math.max(diffDays + 1, 1), 30);

        if (totalRemaining <= 0) {
          setIsExpired(true);
          setCurrentDay(30);
          return;
        }

        setIsExpired(false);
        setCurrentDay(dayNum);
        return;
      }

      // Fallback: exact 30*24h window derived from expiry
      const expiryDateObj = new Date(subscriptionExpiry);
      const startDateMs = expiryDateObj.getTime() - (30 * 24 * 60 * 60 * 1000);
      const difference = nowMs - startDateMs;

      if (totalRemaining <= 0) {
        setIsExpired(true);
        setCurrentDay(30);
        return;
      }

      setIsExpired(false);
      const daysPassed = Math.floor(difference / (1000 * 60 * 60 * 24));
      const dayNum = Math.min(Math.max(daysPassed + 1, 1), 30);
      setCurrentDay(dayNum);
    };

    calculateDays();
    const timerInterval = setInterval(calculateDays, 1000 * 60 * 60); // تحديث كل ساعة

    return () => clearInterval(timerInterval);
  }, [isSubscribed, subscriptionExpiry, subscriptionStart]);

  const showPaymentReminder = isSubscribed && !isExpired && (30 - currentDay <= 5);

  const getCardTheme = () => {
    if (!isSubscribed) return { bg: '#FFFFFF', border: '#CBD5E1', badgeBg: '#FEF3C7', badgeText: '#D97706', btnBg: '#10B981' };
    if (isExpired) return { bg: '#FFFFFF', border: '#EF4444', badgeBg: '#FEE2E2', badgeText: '#991B1B', btnBg: '#EF4444' };
    if (showPaymentReminder) return { bg: '#FFFFFF', border: '#F59E0B', badgeBg: '#FEF3C7', badgeText: '#B45309', btnBg: '#F59E0B' };
    return { bg: '#FFFFFF', border: '#10B981', badgeBg: '#DCFCE7', badgeText: '#166534', btnBg: '#10B981' };
  };

  const theme = getCardTheme();
  
  const formattedExpiryDate = useMemo(() => {
    if (!subscriptionExpiry) return 'غير محدد';
    const d = new Date(subscriptionExpiry);
    return isNaN(d.getTime()) ? subscriptionExpiry : d.toLocaleDateString('ar-EG');
  }, [subscriptionExpiry]);

  // Global admin control: if planData.isSubActive === false then the package is disabled by admin
  const globalActive = planData?.isSubActive !== false;
  const disabledByAdmin = !globalActive;

  return (
    <View style={[styles.cardBox, { backgroundColor: theme.bg, borderColor: theme.border, borderWidth: 2 }]}>
      <View style={styles.rowBetween}>
        <View style={[styles.badge, { backgroundColor: disabledByAdmin ? '#FEE2E2' : theme.badgeBg }]}>
          <Text style={[styles.badgeText, { color: disabledByAdmin ? '#991B1B' : theme.badgeText }]}>
            {disabledByAdmin ? '🔒 الباقة موقوفة مؤقتاً من الأدمن' : (
              isSubscribed 
                ? (isExpired ? '❌ انتهى الاشتراك' : (showPaymentReminder ? '⚠️ أوشك على الانتهاء' : '🌟 اشتراك VIP نشط')) 
                : '⚡ عرض محدود'
            )}
          </Text>
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      <Text style={styles.subscriptionDesc}>
        {disabledByAdmin ? 'عذراً، هذه الباقة مُعطلة حالياً من قبل المسؤول. سيتم إظهارها فور تفعيلها.' : (
          isSubscribed 
            ? (isExpired ? '❌ انتهت فترة الاشتراك الخاص بك. يرجى التجديد للاستمرار.' : '✅ اشتراكك مفعّل بنجاح واستمتع بكل المميزات!')
            : description
        )}
      </Text>

      {isSubscribed && !isExpired && !disabledByAdmin && (
        <View style={styles.simpleTimerRow}>
          <View style={[styles.timerBadgeBox, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Text style={[styles.timerNumber, { fontSize: 13 }]}>
              اليوم {currentDay} من 30 يوم 🚀
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: 'flex-end', marginLeft: 10 }}>
            <Text style={styles.expiryDateText}>
              ينتهي في: {formattedExpiryDate}
            </Text>
            {showPaymentReminder && (
              <Text style={styles.reminderAlertText}>
                ⚠️ متبقي أقل من 5 أيام! يرجى التجديد قبل الانتهاء.
              </Text>
            )}
          </View>
        </View>
      )}

      {isExpired && !disabledByAdmin && (
        <View style={{ marginVertical: 10, alignItems: 'center' }}>
          <Text style={styles.expiredAlertText}>
            🚨 انتهى اشتراكك بالكامل، يرجى التجديد لاستعادة الوصول.
          </Text>
        </View>
      )}

      {/* Show subscribe/renew button only if global package is active */}
      {globalActive ? (
        (!isSubscribed || showPaymentReminder || isExpired) && (
          <TouchableOpacity 
            style={[styles.quickBtn, { backgroundColor: theme.btnBg }]} 
            onPress={onSubscribe}
          >
            <Text style={styles.quickBtnText}>
              {isSubscribed ? `تجديد الاشتراك الآن 🔄 (${price} ج.م)` : `تفعيل الاشتراك الشهري الآن 🚀 (${price} ج.م)`}
            </Text>
          </TouchableOpacity>
        )
      ) : (
        <View style={[styles.quickBtn, { backgroundColor: '#EF4444' }]}>
          <Text style={styles.quickBtnText}>الباقة غير متاحة حالياً</Text>
        </View>
      )}
    </View>
  );
});
// ==========================================
// 2. 📜 مكون عرض تقرير الـ PDF داخلياً
// ==========================================

// ==========================================
// 3. 📄 كارت ملفات الـ PDF وتقارير التسميع
// ==========================================
const PdfSectionCard = memo(({ pdfList = [], onOpenPdf, lastBotSession }) => {
  const dynamicCurrentPdf = lastBotSession ? {
    id: lastBotSession.id || 'current-bot-session',
    title: `📄 تقرير جلسة: ${lastBotSession.roomName || lastBotSession.surah || 'تسميع الذكاء الاصطناعي'}`,
    date: lastBotSession.leaveTime ? `اليوم - ${lastBotSession.leaveTime}` : 'اليوم',
    size: '1.2 MB',
    pdfUri: lastBotSession.pdfUri || null,
    htmlContent: lastBotSession.pdfUri ? null : `
      <div style="padding: 20px; font-family: system-ui, sans-serif; direction: rtl; text-align: right; background-color: #f8fafc; color: #1e293b;">
        <h1 style="color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 8px;">🤖 تقرير تحليل الجلسة والتسميع</h1>
        <p style="font-size: 16px;"><b>اسم الطالب:</b> ${lastBotSession.studentName || 'الطالب'}</p>
        <p style="font-size: 16px;"><b>النشاط / السورة:</b> ${lastBotSession.roomName || lastBotSession.surah || 'جلسة مباشرة'}</p>
        ${lastBotSession.joinTime ? `<p style="font-size: 16px;"><b>وقت الدخول:</b> ${lastBotSession.joinTime}</p>` : ''}
        ${lastBotSession.leaveTime ? `<p style="font-size: 16px;"><b>وقت الخروج:</b> ${lastBotSession.leaveTime}</p>` : ''}
        ${lastBotSession.durationText ? `<p style="font-size: 16px;"><b>مدة الجلسة:</b> ${lastBotSession.durationText}</p>` : ''}
        <p style="font-size: 16px;"><b>نسبة الحفظ والضبط:</b> <span style="color: #10b981; font-weight: bold;">${lastBotSession.score || '95'}%</span></p>
        ${Array.isArray(lastBotSession.mistakesList) && lastBotSession.mistakesList.length > 0 ? `<p style="font-size: 16px;"><b>الأخطاء المرصودة:</b> <span style="color: #ef4444; font-weight: bold;">${lastBotSession.mistakesList.join(', ')}</span></p>` : ''}
        <hr style="border: 0.5px solid #cbd5e1; margin: 15px 0;" />
        <h3>📝 تحليل وتقارير المساعد الذكي:</h3>
        <p style="background-color: #fff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
          ${lastBotSession.aiNotes || lastBotSession.notes || 'تم تسجيل وقت الدخول والخروج والتواجد داخل الجلسة بنجاح.'}
        </p>
      </div>
    `
  } : null;

  const filesToDisplay = pdfList?.length > 0 
    ? (dynamicCurrentPdf ? [dynamicCurrentPdf, ...pdfList.filter(p => p.id !== dynamicCurrentPdf.id)] : pdfList)
    : (dynamicCurrentPdf ? [dynamicCurrentPdf] : []);

  return (
    <View style={[styles.cardBox, styles.parentCardBox]}>
      <View style={styles.rowBetween}>
        <View style={[styles.badge, { backgroundColor: '#E0E7FF' }]}>
          <Text style={[styles.badgeText, { color: '#3730A3' }]}>📑 المرفقات والتقارير</Text>
        </View>
        <Text style={styles.cardTitle}>📜 تقارير الـ PDF والمعاينة</Text>
      </View>

      {filesToDisplay.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
            لا توجد تقارير متاحة حالياً. أنجز جلسة جديدة لتظهر هنا!
          </Text>
        </View>
      ) : (
        filesToDisplay.map((item, index) => (
          <View key={item.id || index.toString()} style={styles.pdfItemBox}>
            <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 10 }}>
              <Text style={styles.pdfItemTitle}>{item.title}</Text>
              <Text style={styles.pdfItemSub}>📅 {item.date || 'اليوم'} | 💾 {item.size || 'PDF'}</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.openPdfBtn} 
              onPress={() => onOpenPdf?.(item)}
            >
              <Text style={styles.openPdfBtnText}>عرض 👁️</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
});

// ==========================================
// 4. مكون سؤال الأسبوع التفاعلي
// ==========================================
const WeeklyQuestionCard = memo(({ questions = [], question, onAnswer, studentId, isParent }) => {
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const questionsList = Array.isArray(questions) && questions.length > 0 
    ? questions 
    : (question ? [question] : []);

  const activeParentQuestions = questionsList.filter(q => {
    const studentAns = q?.answers?.find(a => a.studentId === studentId);
    const answerStatus = String(studentAns?.status || '').trim();
    const pendingReview = answerStatus.includes('قيد المراجعة');
    const reviewed = Boolean(
      q?.isReviewedByTeacher ||
      studentAns?.reviewed ||
      (answerStatus && !pendingReview) ||
      studentAns?.isCorrect !== undefined
    );
    return !reviewed;
  });

  const currentQ = isParent ? activeParentQuestions[0] : (question || questionsList[0]);
  const studentAns = currentQ?.answers?.find(a => a.studentId === studentId);
  const answerStatus = String(studentAns?.status || '').trim();
  const isReviewPending = answerStatus.includes('قيد المراجعة');
  const isReviewComplete = Boolean(
    currentQ?.isReviewedByTeacher ||
    studentAns?.reviewed ||
    (answerStatus && !isReviewPending) ||
    studentAns?.isCorrect !== undefined
  );
  const isAnswered = Boolean(studentAns) || isSubmitted;
  const isMcq = currentQ?.type === 'mcq' && Array.isArray(currentQ?.options) && currentQ.options.length > 0;
  const selectedOption = isMcq && selectedOptionIndex != null ? currentQ.options[selectedOptionIndex] : null;

  // If the answer has actually been reviewed by the teacher or auto-graded, hide the weekly question card entirely.
  if (isReviewComplete) return null;

  useEffect(() => {
    setIsSubmitted(Boolean(studentAns));
  }, [studentAns, currentQ]);

  useEffect(() => {
    setSelectedOptionIndex(null);
    setTextAnswer('');
  }, [currentQ?.id]);

  if (isParent && activeParentQuestions.length === 0) return null;

  if (!currentQ) {
    return (
      <View style={[styles.cardBox, isParent && styles.parentCardBox]}>
        <Text style={styles.cardTitle}>❓ سؤال الأسبوع</Text>
        <Text style={styles.emptyText}>لا يوجد سؤال نشط حالياً.. انتظرونا قريباً! ⏳</Text>
      </View>
    );
  }

  const handleSubmit = () => {
    const answer = isMcq ? selectedOption : textAnswer.trim();
    if (!answer) {
      Alert.alert('تنبيه ⚠️', 'برجاء اختيار إجابة أو كتابة الرد أولاً!');
      return;
    }
    onAnswer?.(currentQ.id, answer);
    setIsSubmitted(true);
    Alert.alert('تم الإرسال بنجاح! 🚀', isMcq ? 'تم تقييم إجابتك تلقائياً.' : 'تم إرسال إجابتك للمعلم وهي الآن قيد المراجعة والتصحيح 🟡');
  };

  return (
    <View style={[styles.cardBox, isParent && styles.parentCardBox]}>
      <View style={styles.rowBetween}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>⭐ +{currentQ.rewardStars || 15} نجمة</Text>
        </View>
        <Text style={styles.cardTitle}>❓ سؤال الأسبوع التفاعلي</Text>
      </View>

      <Text style={styles.questionText}>{currentQ.title || currentQ.question}</Text>

      {isAnswered ? (
        <View style={[styles.statusBox, styles.pendingBox]}>
          <Text style={styles.pendingText}>🟡 تم إرسال إجابتك بنجاح! وهي الآن قيد مراجعة المعلم وتصحيحها.</Text>
        </View>
      ) : isParent ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>👨‍👩‍👧‍👦 لم يجب الطالب على هذا السؤال بعد. سيختفي السؤال من هنا فور تصحيح المعلم له.</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {isMcq ? (
            currentQ.options.map((opt, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.optionBtn, selectedOptionIndex === idx && styles.selectedOpt]}
                onPress={() => setSelectedOptionIndex(idx)}
              >
                <Text style={[styles.optionText, selectedOptionIndex === idx && styles.selectedOptText]}>{opt}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <TextInput
              style={styles.textInput}
              placeholder="اكتب إجابتك هنا..."
              placeholderTextColor="#94A3B8"
              value={textAnswer}
              onChangeText={setTextAnswer}
              multiline
            />
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>إرسال الإجابة 🚀</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

// ==========================================
// 5. الرسم البياني الذكي للنجوم 📊
// ==========================================
const WeeklyStarsChart = memo(({ currentStudent }) => {
  const totalStars = currentStudent?.stars || 0;

  const weeklyData = useMemo(() => {
    if (currentStudent?.weeklyHistory && Array.isArray(currentStudent.weeklyHistory) && currentStudent.weeklyHistory.length > 0) {
      return currentStudent.weeklyHistory;
    }
    return [{ week: 'الأسبوع الحالي 🌟', stars: totalStars }];
  }, [currentStudent?.weeklyHistory, totalStars]);

  const maxStars = Math.max(...weeklyData.map(d => d.stars), 1);

  return (
    <View style={[styles.cardBox, styles.parentCardBox]}>
      <View style={styles.rowBetween}>
        <View style={styles.starBadge}>
          <Text style={styles.starBadgeText}>⭐ {totalStars}</Text>
        </View>
        <Text style={styles.cardTitle}>📈 التطور والنجوم المكتسبة</Text>
      </View>

      <Text style={[styles.subCardText, { marginBottom: 16, marginTop: 6 }]}>
        الرسم البياني للتفاعل والتقدم الفعلي للطالب:
      </Text>

      <View style={styles.chartContainer}>
        {weeklyData.map((item, index) => {
          const heightPercent = maxStars > 0 ? Math.max((item.stars / maxStars) * 100, 15) : 15;
          return (
            <View key={index} style={styles.chartColumn}>
              <Text style={styles.chartValue}>⭐{item.stars}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${heightPercent}%` }]} />
              </View>
              <Text style={styles.chartLabel}>{item.week}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

// ==========================================
// Course tree per enrolled course (شجرة الحفظ لكل كورس)
// ==========================================
const CourseTreeCard = memo(({ course, currentStudent }) => {
  const { getTreeState, getCourseProgress } = useContext(AuthContext);
  const studentId = currentStudent?.studentId || currentStudent?.id;

  // tree state (streak/leaves) kept for display, but progress is driven by course lesson completion
  const tree = getTreeState ? getTreeState(studentId, course?.id) : { stage: 'seed', leaves: 0, streak: 0 };
  const mapping = { seed: '🌱', sprout: '🌿', sapling: '🌳', young: '🌲', mature: '🌳' };

  // compute lesson-based progress: completedLessons / totalLessons
  let totalLessons = 0;
  try {
    if (course && Array.isArray(course.curriculum)) {
      totalLessons = course.curriculum.reduce((acc, unit) => acc + (unit.lessons ? unit.lessons.length : 0), 0);
    }
  } catch (e) { totalLessons = 0; }

  let completed = 0;
  try {
    const prog = getCourseProgress ? getCourseProgress(studentId, course?.id) : null;
    if (prog) {
      completed = Number(prog.completedLessons) || (Array.isArray(prog.completedList) ? prog.completedList.length : 0) || 0;
    }
  } catch (e) { completed = 0; }

  const lessonPct = totalLessons > 0 ? Math.min(100, Math.round((completed / totalLessons) * 100)) : null;

  // fallback: if no lessons or totalLessons==0, fall back to leaves-based pct
  const maxLeavesByStage = { seed: 1, sprout: 3, sapling: 5, young: 7, mature: 9 };
  const leavesPct = Math.min(100, Math.round(((tree.leaves || 0) / (maxLeavesByStage[tree.stage] || 1)) * 100));

  const usedPct = (lessonPct !== null) ? lessonPct : leavesPct;

  // Animated progress: play a smooth growth animation when usedPct increases
  const [progressValue, setProgressValue] = useState((usedPct || 0) / 100);
  const prevPctRef = useRef(usedPct || 0);
  useEffect(() => {
    const prev = prevPctRef.current || 0;
    const now = (usedPct || 0) / 100;
    if (now > prev) {
      const startTime = Date.now();
      const duration = 800;
      const step = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        setProgressValue(prev + (now - prev) * t);
        if (t < 1) {
          requestAnimationFrame(step);
        }
      };
      step();
    } else {
      setProgressValue(now);
    }
    prevPctRef.current = now;
  }, [usedPct]);

  return (
    <View style={[styles.cardBox, { backgroundColor: '#FFF8F0' }]}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>🌳 شجرة حفظ: {course?.title}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{mapping[tree.stage] || '🌱'}</Text></View>
      </View>

      <Text style={[styles.subCardText, { marginTop: 8 }]}>المستوى: {tree.stage} · متتالية: {tree.streak} يوم · أوراق: {tree.leaves}</Text>

      <View style={{ marginTop: 10, alignItems: 'center' }}>
        {/* Lottie animation for tree growth — driven by numeric progressValue */}
        <View style={{ width: 180, height: 180 }}>
          <LottieView
            source={require('../../tree growth without background.json')}
            progress={progressValue}
            loop={false}
            style={{ width: '100%', height: '100%' }}
          />
        </View>

        <Text style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
          {totalLessons > 0 ? `تقدم الدروس: ${usedPct}% (${completed}/${totalLessons})` : `نسبة نمو الشجرة: ${usedPct}%`}
        </Text>
      </View>
    </View>
  );
});

// Dedicated screen components have been moved to separate files for better structure.
const LeaderboardCard = memo(({ students = [], currentStudentId }) => {
  const [filter, setFilter] = useState('weekly');

  const sorted = [...students].sort((a, b) => {
    const sA = filter === 'weekly' ? (a.weeklyStars ?? a.stars ?? 0) : (a.monthlyStars ?? ((a.stars || 0) * 2));
    const sB = filter === 'weekly' ? (b.weeklyStars ?? b.stars ?? 0) : (b.monthlyStars ?? ((b.stars || 0) * 2));
    return sB - sA;
  }).slice(0, 5);

  const getRank = (i) => {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return `#${i + 1}`;
  };

  return (
    <View style={[styles.cardBox, styles.parentCardBox]}>
      <View style={styles.rowBetween}>
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tab, filter === 'weekly' && styles.activeTab]}
            onPress={() => setFilter('weekly')}
          >
            <Text style={[styles.tabText, filter === 'weekly' && styles.activeTabText]}>أسبوعية</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, filter === 'monthly' && styles.activeTab]}
            onPress={() => setFilter('monthly')}
          >
            <Text style={[styles.tabText, filter === 'monthly' && styles.activeTabText]}>شهرية</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardTitle}>🏆 لوحة الشرف والمتميزين</Text>
      </View>

      {sorted.length === 0 ? (
        <Text style={styles.emptyText}>لا توجد تفاعلات مسجلة بعد 📝</Text>
      ) : (
        sorted.map((st, i) => {
          const isMe = st.id === currentStudentId || st.studentId === currentStudentId || st.name === currentStudentId;
          const score = filter === 'weekly' ? (st.weeklyStars ?? st.stars ?? 0) : (st.monthlyStars ?? ((st.stars || 0) * 2));
          
          return (
            <View key={i} style={[styles.leaderItem, isMe && styles.highlightMe]}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreNum}>⭐ {score}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.leaderName}>{st.gender === 'girl' ? '👧' : '👦'} {st.name} {isMe && '(ابنك 👑)'}</Text>
                <Text style={styles.leaderSub}>{st.grade || 'مستوى متقدم'}</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900' }}>{getRank(i)}</Text>
            </View>
          );
        })
      )}
    </View>
  );
});

// ==========================================
// 7. نتائج الاختبارات
// ==========================================
const ParentExamResultCard = memo(({ item }) => {
  const isReviewed = item.score !== undefined && item.score !== null && item.score !== '';
  const displayScore = isReviewed ? `الدرجة: ${item.score}` : (item.status || 'قيد مراجعة المعلم 🟡');

  return (
    <View style={styles.subCard}>
      <View style={[styles.subCardHeader, styles.rowBetween]}>
        <View style={styles.subCardTitleWrapper}>
          <Text style={[styles.subCardTitle, styles.flexShrink]} numberOfLines={0}>
            📝 {item.examTitle || item.title || 'اختبار'}
          </Text>
        </View>
        <View style={styles.subCardBadgeWrapper}>
          <View style={[styles.badge, !isReviewed && styles.pendingBadge]}>
            <Text style={[styles.badgeText, !isReviewed && { color: '#B45309' }]} numberOfLines={0}>
              {displayScore}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.subCardBody}>
        <Text style={[styles.subCardText, styles.flexShrink]} numberOfLines={0}>
          ❓ السؤال: {item.question || item.description || 'إجابة'}
        </Text>
        <Text style={[styles.subCardText, styles.flexShrink]} numberOfLines={0}>
          💡 إجابة الطالب: {item.answer || item.studentAnswer || 'تم التسليم'}
        </Text>
      </View>
    </View>
  );
});

// ==========================================
// 8. طلبات الإجازات
// ==========================================
const ParentRequestCard = memo(({ item }) => (
  <View style={styles.subCard}>
    <View style={styles.rowBetween}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.status || 'قيد المراجعة 🟡'}</Text>
      </View>
      <Text style={styles.subCardTitle}>🏖️ {item.title || item.examTitle}</Text>
    </View>
    <Text style={styles.subCardText}>❓ السبب: {item.reason || 'طلب إجازة'}</Text>
    <Text style={styles.subCardText}>💬 التكلفة: {item.costText || '30 نجمة'}</Text>
  </View>
));

// ==========================================
// 9. تقارير المعلم
// ==========================================
const ReportCard = memo(({ report, studentEmoji }) => (
  <View style={styles.reportCard}>
    <View style={styles.rowBetween}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{studentEmoji} تقرير المعلم</Text>
      </View>
    </View>
    <Text style={styles.subCardText}>{report.text}</Text>
  </View>
));

// ==========================================
// 10. الكورسات (مستقلة بالكامل عن الاشتراك)
// ==========================================
const CourseCard = memo(({ course, isParent, colorScheme, onSelect, onOpenContent, userStars, onViewDetails }) => {
  const isEnrolled = course.enrolled;
  const availableBundles = Math.floor((userStars || 0) / 10); // each bundle = 10 stars
  const maxBundlesByPrice = course && course.price ? Math.ceil((Number(course.price) || 0) / 5) : 0; // how many 5-gp bundles cover the price
  const usableBundles = Math.min(availableBundles, maxBundlesByPrice);
  const discount = usableBundles * 5;
  const starsNeeded = usableBundles * 10;
  const finalPrice = Math.max(0, (Number(course.price) || 0) - discount);
  const canDiscount = usableBundles > 0 && !isEnrolled && discount > 0;

  return (
    <View style={[styles.courseCard, { backgroundColor: colorScheme.bg, borderColor: colorScheme.border }]}>
      <View style={styles.rowBetween}>
        <Text style={styles.rating}>⭐ {course.rating || '4.9'}</Text>
        <View style={[styles.badge, { backgroundColor: colorScheme.badgeBg }]}>
          <Text style={styles.badgeText}>{`${colorScheme.icon} `}{course.category || 'عام'}</Text>
        </View>
      </View>

      <View style={{ marginVertical: 10, alignItems: 'flex-end' }}>
        <Text style={styles.courseTitle}>{course.title}</Text>
        <Text style={styles.courseSub}>👨‍🏫 المعلم: {course.instructor}</Text>
      </View>

      {canDiscount && (
        <View style={styles.discountBox}>
          <Text style={styles.discountText}>🎉 خصم <Text style={{ fontWeight: '900' }}>-{discount} ج.م</Text> برصيدك الحالي!</Text>
        </View>
      )}

      <View style={[styles.rowBetween, { borderTopWidth: 1.5, borderTopColor: 'rgba(226, 232, 240, 0.6)', paddingTop: 10 }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!isEnrolled && (
            <TouchableOpacity style={[styles.btnOutline, { borderColor: colorScheme.border }]} onPress={() => onViewDetails(course)}>
              <Text style={[styles.btnText, { color: colorScheme.dark }]}>التفاصيل</Text>
            </TouchableOpacity>
          )}
          {isEnrolled ? (
            // عندما يكون مشترك: عبارة عن زر يفتح محتوى الكورس للطالب أو متابعة التقدم للولي
            <TouchableOpacity style={[styles.mainBtn, isParent && { backgroundColor: '#0F382C' }]} onPress={() => {
              if (isParent) onSelect(course); // فتح شاشة متابعة للولي
              else onOpenContent?.(course); // فتح محتوى الكورس للطالب
            }}>
              <Text style={styles.mainBtnText}>{isParent ? 'متابعة 📊' : 'محتوى الكورس 📚'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.mainBtn, isParent && { backgroundColor: '#D4AF37' }]} onPress={() => onSelect(course, finalPrice, starsNeeded)}>
              <Text style={styles.mainBtnText}>{isParent ? 'اشترك الآن 💰' : 'انطلق 🚀'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          {canDiscount && <Text style={styles.oldPrice}>{course.price} ج.م</Text>}
          <Text style={styles.price}>💰 {finalPrice} ج.م</Text>
        </View>
      </View>
    </View>
  );
});

// ==========================================
// 11. الشاشة الرئيسية (HomeScreen)
// ==========================================
export default function HomeScreen({ navigation, onSelectCourse, onViewProgress, onViewDetailsProp }) {
  const { 
    user, 
    studentsDatabase = [], 
    logout, 
    useStarsForDiscount, 
    addLeaveRequest, 
    leaveRequests = [], 
    subscribeUser, 
    subscriptionData,
    parentNotifications = [],
    markNotificationAsRead,
    deleteNotification,
    getParentNotifications,
    getCourseProgress,
    sessionReports,
    getSessionReports,
    submitManualTransfer
  } = useContext(AuthContext);

  const { courses, examResults, weeklyQuestion, answerWeeklyQuestion, enrollCourse } = useContext(CourseContext);

  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [currentView, setCurrentView] = useState('home'); 
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedProgressCourse, setSelectedProgressCourse] = useState(null);
  const [selectedContentCourse, setSelectedContentCourse] = useState(null);

  // === إعدادات تقدير زمن انتهاء لكل كورس مشترك ===
  // خرائط لتخزين الدروس المكتملة وعدد الجلسات لكل كورس على حدة
  const [lessonsCompletedMap, setLessonsCompletedMap] = useState({});
  const [sessionsPerWeekMap, setSessionsPerWeekMap] = useState({});
  const enrolledCourses = useMemo(() => courses.filter(c => c.enrolled), [courses]);

  // مزامنة تلقائية لعدد الدروس المكتملة من الـ AuthContext so estimates reflect real progress
  useEffect(() => {
    if (!enrolledCourses || enrolledCourses.length === 0) return;
    const map = {};
    enrolledCourses.forEach(ec => {
      try {
        const progress = getCourseProgress?.(currentStudent.studentId || user?.id, ec.id) || {};
        const completed = progress.completedLessons || (progress.completedList ? progress.completedList.length : 0) || 0;
        map[ec.id] = completed;
      } catch (e) {
        map[ec.id] = Number(lessonsCompletedMap[ec.id] || 0);
      }
    });
    setLessonsCompletedMap(prev => ({ ...prev, ...map }));
  }, [enrolledCourses, getCourseProgress, currentStudent, user]);

  const totalLessonsFor = useCallback((course) => {
    if (!course || !course.curriculum) return 0;
    return course.curriculum.reduce((acc, unit) => acc + (unit.lessons ? unit.lessons.length : 0), 0);
  }, []);

  // State للتحكم في فتح الـ PDF
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [selectedPdfUri, setSelectedPdfUri] = useState(null);
  const [selectedPdfHtml, setSelectedPdfHtml] = useState('');
  const [selectedPdfTitle, setSelectedPdfTitle] = useState('');
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState('subscription');
  const [paymentCourse, setPaymentCourse] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(null);
  const [paymentSenderNumber, setPaymentSenderNumber] = useState('');
  const [paymentReferenceCode, setPaymentReferenceCode] = useState('');

  const isParent = user?.role === 'parent';
  const currentBg = isParent ? BG_IMAGES.parent : BG_IMAGES.student;

  const currentStudent = useMemo(() => {
    return studentsDatabase.find(
      st => st.id === user?.studentDbId || st.studentId === user?.studentId || st.name === user?.name
    ) || { name: user?.name || 'الطالب', gender: user?.gender || 'boy', stars: user?.stars || 0, reports: [] };
  }, [studentsDatabase, user]);
 
  const studentSessionReports = useMemo(() => {
    const targetId = currentStudent?.studentId || currentStudent?.id;
    if (!targetId) return [];
    if (typeof getSessionReports === 'function') {
      return getSessionReports(targetId);
    }
    return (sessionReports || []).filter((report) => report.studentId === targetId || report.studentId === currentStudent.id);
  }, [currentStudent, getSessionReports, sessionReports]);
 
  const isSubscribed = Boolean(user?.isSubscribed || currentStudent?.isSubscribed);
  const subscriptionExpiry = user?.subscriptionExpiry || currentStudent?.subscriptionExpiry || null;

  const openPaymentModal = ({ target, course = null, amount = null }) => {
    setPaymentTarget(target);
    setPaymentCourse(course);
    setPaymentAmount(amount);
    setPaymentSenderNumber('');
    setPaymentReferenceCode('');
    setPaymentModalVisible(true);
  };

  const closePaymentModal = () => {
    setPaymentModalVisible(false);
    setPaymentCourse(null);
    setPaymentAmount(null);
    setPaymentSenderNumber('');
    setPaymentReferenceCode('');
  };

  const handleSubmitPaymentRequest = () => {
    if (!paymentSenderNumber.trim() && !paymentReferenceCode.trim()) {
      Alert.alert('تنبيه ⚠️', 'الرجاء إدخال رقم المرسل أو رمز المعاملة.');
      return;
    }

    const studentId = currentStudent?.studentId || currentStudent?.id || user?.id || user?.studentId;
    if (!studentId) {
      Alert.alert('خطأ', 'تعذّر تحديد الطالب لإرسال طلب الدفع.');
      return;
    }

    const result = submitManualTransfer?.({
      studentId,
      studentName: currentStudent?.name || user?.name || 'طالب',
      senderNumber: paymentSenderNumber.trim() || null,
      referenceCode: paymentReferenceCode.trim() || null,
      amount: paymentAmount || null,
      target: paymentTarget,
      courseId: paymentCourse?.id || null
    });

    if (result?.success) {
      Alert.alert('تم الإرسال ✅', 'تم إرسال طلب الدفع بنجاح وهو الآن بانتظار موافقة الأدمن.');
      closePaymentModal();
      return;
    }

    Alert.alert('خطأ', result?.message || 'حدث خطأ أثناء إرسال طلب الدفع.');
  };

  const handleSubscribeMonthly = () => {
    openPaymentModal({ target: 'subscription', amount: Number(subscriptionData?.price) || 199 });
  };

  const isGirl = currentStudent.gender === 'girl';
  const studentEmoji = isGirl ? '👧' : '👦';
  const userStars = currentStudent.stars || 0;

  const studentExams = examResults || [];
  const studentVacations = leaveRequests.filter(req => req.studentId === currentStudent.studentId || req.studentName === currentStudent.name);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pdfModalVisible) { setPdfModalVisible(false); return true; }
      if (selectedCourse) { setSelectedCourse(null); return true; }
      if (currentView !== 'home') { setCurrentView('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [currentView, selectedCourse, pdfModalVisible]);

  const filteredCourses = selectedCategory === 'الكل' ? courses : courses?.filter(c => c.category === selectedCategory);

  const handleCourseClick = useCallback((course, finalPrice, starsNeeded) => {
    // ولي الأمر: فتح شاشة المتابعة إن كان مشترك
    if (isParent && course.enrolled) {
      setSelectedProgressCourse(course);
      return;
    }

    const priceText = finalPrice != null ? `${finalPrice} ج.م` : `${course.price || '---'} ج.م`;
    openPaymentModal({ target: 'course', course, amount: finalPrice });

  }, [isParent, currentStudent, user, useStarsForDiscount, enrollCourse]);

  // When user taps "التفاصيل" نستخدم التنقّل بدلاً من استبدال محتوى الصفحة
  const handleViewDetails = useCallback((course) => {
    if (onViewDetailsProp) {
      onViewDetailsProp(course);
      return;
    }
    if (navigation && navigation.navigate) {
      navigation.navigate('CourseDetails', { course });
    } else {
      setSelectedCourse(course);
    }
  }, [navigation, onViewDetailsProp]);

  const handleRequestVacation = useCallback(() => {
    if (userStars < 30) {
      Alert.alert("عفواً يا بطل! 😅", `رصيدك الحالي (${userStars} نجمة). تحتاج إلى 30 نجمة لطلب إجازة.`);
      return;
    }
    Alert.alert("طلب إجازة 🏖️", "هل تريد إرسال طلب إجازة للمعلم؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "موافق", onPress: () => addLeaveRequest?.({ title: `إجازة (${currentStudent.name})`, cost: 30, studentId: currentStudent.studentId, studentName: currentStudent.name }) }
    ]);
  }, [userStars, currentStudent, addLeaveRequest]);

  const handleOpenPdf = (pdfItem) => {
    setSelectedPdfUri(pdfItem.pdfUri || null);
    setSelectedPdfHtml(pdfItem.htmlContent || '');
    setSelectedPdfTitle(pdfItem.title || 'عرض التقرير');
    setPdfModalVisible(true);
  };

  if (selectedCourse) return <View style={{ flex: 1 }}><CourseDetailsScreen course={selectedCourse} onBack={() => setSelectedCourse(null)} /></View>;
  if (selectedProgressCourse) return <View style={{ flex: 1 }}><ParentProgressScreen course={selectedProgressCourse} onBack={() => setSelectedProgressCourse(null)} onOpenContent={(c) => { setSelectedProgressCourse(null); setSelectedContentCourse(c); }} student={currentStudent} /></View>;
  if (selectedContentCourse) return <View style={{ flex: 1 }}><StudentContentScreen course={selectedContentCourse} onBack={() => setSelectedContentCourse(null)} /></View>;
  if (currentView === 'studentExam') return <View style={{ flex: 1 }}><StudentExamScreen onBack={() => setCurrentView('home')} /></View>;
  if (currentView === 'liveSession') return <View style={{ flex: 1 }}><LiveSessionScreen onBack={() => setCurrentView('home')} user={user} /></View>;
  if (currentView === 'ijaza') return <IjazaScreen onBack={() => setCurrentView('home')} />;
  if (currentView === 'journey') return <ParadiseJourneyScreen onBack={() => setCurrentView('home')} enrolledCourses={enrolledCourses} currentStudent={currentStudent} getCourseProgress={getCourseProgress} totalLessonsFor={totalLessonsFor} />;

  return (
    <ImageBackground source={currentBg} style={styles.bg}>
      <SafeAreaView style={[styles.overlay, isParent && styles.parentOverlay]}>
        <ArchHeader title={isParent ? "لوحة متابعة ولي الأمر" : "أَكَادِيمِيَّةُ الهُدَىٰ"} subtitle={isParent ? `أهلاً بك يا ولي أمر البطل، ${user?.name || ''}` : `أهلاً بك يا ${user?.name || 'بطل'}! 🌟`} />

        <Modal visible={paymentModalVisible} animationType="slide" transparent onRequestClose={closePaymentModal}>
          <View style={styles.paymentModalBackdrop}>
            <View style={styles.paymentModalBox}>
              <Text style={styles.paymentModalTitle}>{paymentTarget === 'subscription' ? 'طلب تفعيل الاشتراك' : 'طلب شراء الكورس'}</Text>
              <Text style={styles.paymentModalText}>{paymentTarget === 'subscription' ? 'لإتمام الطلب، قم بتحويل المبلغ إلى المحفظة التالية ثم أرسل بيانات التحويل.' : `أرسِل بيانات التحويل لطلب شراء كورس ${paymentCourse?.title || ''}.`}</Text>
              <View style={styles.paymentInfoBox}>
                <Text style={styles.paymentInfoLabel}>رقم المحفظة</Text>
                <View style={styles.paymentInfoRow}>
                  <Text style={styles.paymentInfoValue}>01093684797</Text>
                  <TouchableOpacity style={styles.copyBtn} onPress={async () => { await Clipboard.setStringAsync('01093684797'); Alert.alert('نُسِخ', 'تم نسخ رقم المحفظة إلى الحافظة.'); }}>
                    <Text style={styles.copyBtnText}>نسخ</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {paymentAmount != null && (
                <Text style={styles.paymentAmountText}>المبلغ المطلوب: {paymentAmount} ج.م</Text>
              )}
              <Text style={styles.paymentFieldLabel}>رقم المرسل</Text>
              <TextInput
                style={styles.paymentInput}
                placeholder="مثال: 0112xxxxxxx"
                placeholderTextColor="#94A3B8"
                value={paymentSenderNumber}
                onChangeText={setPaymentSenderNumber}
                keyboardType="phone-pad"
              />
              <Text style={styles.paymentFieldLabel}>رمز المعاملة (إذا وُجد)</Text>
              <TextInput
                style={styles.paymentInput}
                placeholder="مثال: REF123456"
                placeholderTextColor="#94A3B8"
                value={paymentReferenceCode}
                onChangeText={setPaymentReferenceCode}
              />
              <Text style={styles.paymentHintText}>بعد الإرسال، سيقوم الأدمن بمراجعة الطلب وتفعيل الوصول.</Text>
              <View style={styles.paymentActionsRow}>
                <TouchableOpacity style={[styles.addBtn, { flex: 1, marginRight: 6 }]} onPress={handleSubmitPaymentRequest}>
                  <Text style={styles.addBtnText}>إرسال الطلب</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1, marginLeft: 6 }]} onPress={closePaymentModal}>
                  <Text style={styles.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* شريط المستخدم والخروج */}
          <View style={[styles.userRow, isParent && styles.parentUserRow]}>
            <TouchableOpacity onPress={logout}><Text style={styles.logoutText}>خروج ➔</Text></TouchableOpacity>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
              <View style={styles.starBadge}><Text style={styles.starBadgeText}>⭐ {userStars}</Text></View>
              {isParent && (() => {
                const unreadCount = (parentNotifications || []).filter(n => !n.isRead && (n.parentId === (user?.id || user?.studentId))).length;
                if (unreadCount > 0) {
                  return (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                    </View>
                  );
                }
                return null;
              })()}
              <Text style={[styles.roleText, isParent && { color: '#FFD700' }]}>{isParent ? `🛡️ ${studentEmoji} ولي الأمر` : '🎈 الطالب'}</Text>
            </View>
          </View>

          {/* أزرار سريعة */}
          <View style={styles.quickActionsCard}>
            {!isParent && (
              <TouchableOpacity style={styles.quickBtn} onPress={() => setCurrentView('studentExam')}>
                <Text style={styles.quickBtnText}>📝 الاختبارات والواجبات المتاحة 🚀</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.quickBtn, styles.actionSolid, { backgroundColor: '#7C3AED', borderColor: '#C084FC' }]} onPress={() => setCurrentView('liveSession')}>
              <Text style={[styles.quickBtnText, styles.quickBtnSolidText]}>🎙️ غرفة التسميع الصوتي والمرئي المباشر</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.quickBtn, styles.actionSolid, { backgroundColor: '#0D9488', borderColor: '#14B8A6' }]} onPress={handleRequestVacation}>
              <Text style={[styles.quickBtnText, styles.quickBtnSolidText]}>🏖️ طلب يوم إجازة (بـ 30 نجمة) ⭐</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.quickBtn, styles.actionSolid, { backgroundColor: '#1D4ED8', borderColor: '#2563EB' }]} onPress={() => setCurrentView('ijaza')}>
              <Text style={[styles.quickBtnText, styles.quickBtnSolidText]}>📜 قسم الإجازات القرآنية</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.quickBtn, styles.actionSolid, { backgroundColor: '#0F766E', borderColor: '#14B8A6' }]} onPress={() => setCurrentView('journey')}>
              <Text style={[styles.quickBtnText, styles.quickBtnSolidText]}>🌙⭐ رحلة إلى الجنة</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.cardBox, { backgroundColor: '#F8FAFC', borderColor: '#BAE6FD' }]}>
            <Text style={styles.cardTitle}>⏳ تقدير موعد انتهاء الدورات المشترك فيها</Text>

            {enrolledCourses.length === 0 ? (
              <Text style={styles.subscriptionDesc}>لا يوجد كورسات مشتركة حالياً. انطلق بكورس لتظهر التقديرات هنا.</Text>
            ) : (
              enrolledCourses.map((ec) => {
                const totalLessons = totalLessonsFor(ec);
                const completed = Math.max(Number(lessonsCompletedMap[ec.id] || 0), 0);
                const perWeek = Math.max(Number(sessionsPerWeekMap[ec.id] || 0), 0) || 2;
                const remaining = Math.max(totalLessons - completed, 0);

                const weeksNeeded = perWeek > 0 ? Math.ceil(remaining / perWeek) : null;
                const estimatedFinish = weeksNeeded ? (() => { const d = new Date(); d.setDate(d.getDate() + (weeksNeeded * 7)); return d; })() : null;

                return (
                  <View key={ec.id} style={{ marginBottom: 12, padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E6EEF9' }}>
                    <Text style={{ fontWeight: '900', marginBottom: 6 }}>{ec.title}</Text>
                    <Text style={styles.subscriptionDesc}>إجمالي الدروس: {totalLessons}</Text>

                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        {remaining === 0 ? (
                          <Text style={{ fontWeight:'900', color:'#0F382C' }}>انتهى هذا الكورس بالفعل — مبروك 🎉</Text>
                        ) : !perWeek ? (
                          <Text style={{ color:'#64748B' }}>حدّد عدد الجلسات في الأسبوع لتقدير مدة الانتهاء.</Text>
                        ) : (
                          <>
                            <Text style={styles.subscriptionDesc}>متبقي {remaining} درس/دروس</Text>
                            <Text style={styles.reminderAlertText}>يتطلب تقريباً {weeksNeeded} أسبوع(أسابيع)</Text>
                            {estimatedFinish && <Text style={styles.expiryDateText}>تقديريًا ينتهي في: {estimatedFinish.toLocaleDateString('ar-EG')}</Text>}
                            <Text style={{ marginTop:6, color:'#475569', fontSize:12 }}>بعد الانتهاء يمكنك تقديم طلب الإجازة أو الانتقال لكورس آخر.</Text>
                          </>
                        )}
                      </View>

                      <View style={{ width: 150, alignItems: 'flex-start' }}>
                        <Text style={{ fontSize:11, color:'#475569', marginBottom:6, textAlign:'right' }}>دروس مكتملة حتى الآن</Text>
                        <View style={styles.estimatorValueBox}>
                          <Text style={styles.estimatorValue}>{String(lessonsCompletedMap[ec.id] || 0)}</Text>
                        </View>

                        <Text style={{ fontSize:11, color:'#475569', marginTop:8, marginBottom:6, textAlign:'right' }}>جلسات في الأسبوع (تقديري)</Text>
                        <View style={styles.estimatorValueBox}>
                          <Text style={styles.estimatorValue}>{String(sessionsPerWeekMap[ec.id] || 2)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

          </View>

          {/* كارت الـ PDF للمعاينات وتقارير التسميع بالبوت */}
          <PdfSectionCard 
            pdfList={studentSessionReports}
            onOpenPdf={handleOpenPdf} 
            lastBotSession={studentSessionReports?.[0] || { studentName: currentStudent.name }} 
          />

          {/* كارت الاشتراك الشهري الشامل الديناميكي */}
          <MonthlySubscriptionCard 
            isSubscribed={isSubscribed} 
            onSubscribe={handleSubscribeMonthly} 
            subscriptionExpiry={subscriptionExpiry}
            subscriptionStart={user?.subscriptionStart || currentStudent?.subscriptionStart || null}
            isParent={isParent}
            planData={subscriptionData}
          />

          {/* Render per-course habit trees on Home */}
          {enrolledCourses && enrolledCourses.length > 0 && (
            enrolledCourses.map(ec => (
              <CourseTreeCard key={ec.id} course={ec} currentStudent={currentStudent} />
            ))
          )}

          {/* سؤال الأسبوع */}
          <WeeklyQuestionCard
            question={weeklyQuestion}
            onAnswer={(id, ans) => answerWeeklyQuestion?.({ questionId: id, studentId: currentStudent.studentId, studentName: currentStudent.name, answer: ans })}
            studentId={currentStudent.studentId}
            isParent={isParent}
          />

          {/* محتوى ولي الأمر */}
          {isParent && (
            <>
              {/* 📬 قسم الإشعارات */}
              <View style={[styles.cardBox, styles.parentCardBox]}>
                <Text style={styles.cardTitle}>📬 الإشعارات ({parentNotifications.length})</Text>
                {parentNotifications.length === 0 ? (
                  <Text style={styles.emptyText}>لا توجد إشعارات جديدة</Text>
                ) : (
                  parentNotifications.map((notif, i) => (
                    <View key={i} style={{ backgroundColor: notif.isRead ? '#F3F4F6' : '#FFF9E6', padding: 12, borderRadius: 8, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: notif.isRead ? '#9CA3AF' : '#FFD700' }}>
                      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={{ fontWeight: '900', color: '#1E293B' }}>{notif.message}</Text>
                          <Text style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>الكورس: {notif.courseTitle}</Text>
                          <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>{new Date(notif.createdAt).toLocaleString('ar-EG')}</Text>
                        </View>
                        <TouchableOpacity onPress={() => deleteNotification(notif.id)} style={{ marginLeft: 8 }}>
                          <Text style={{ fontSize: 16 }}>✖</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <WeeklyStarsChart currentStudent={currentStudent} />

              <LeaderboardCard students={studentsDatabase} currentStudentId={currentStudent.studentId} />

              <View style={[styles.cardBox, styles.parentCardBox]}>
                <Text style={styles.cardTitle}>📊 نتائج اختبارات الطالب ({studentExams.length})</Text>
                {studentExams.length === 0 ? (
                  <Text style={styles.emptyText}>لا توجد نتائج مسجلة</Text>
                ) : (
                  studentExams.map((item, i) => <ParentExamResultCard key={i} item={item} />)
                )}
              </View>

              <View style={[styles.cardBox, styles.parentCardBox]}>
                <Text style={styles.cardTitle}>📑 متابعة طلبات الإجازات ({studentVacations.length})</Text>
                {studentVacations.length === 0 ? <Text style={styles.emptyText}>لا توجد طلبات إجازة</Text> : studentVacations.map((req, i) => <ParentRequestCard key={i} item={req} />)}
              </View>

              <View style={[styles.cardBox, styles.parentCardBox]}>
                <Text style={styles.cardTitle}>📑 تقارير المعلم ({currentStudent.reports?.length || 0})</Text>
                {(!currentStudent.reports || currentStudent.reports.length === 0) ? <Text style={styles.emptyText}>لا توجد تقارير</Text> : currentStudent.reports.map((rep, i) => <ReportCard key={i} report={rep} studentEmoji={studentEmoji} />)}
              </View>
            </>
          )}

          {/* الأقسام */}
          <Text style={[styles.sectionTitle, isParent && { color: '#FFD700', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 }]}>{isParent ? '۞ الأقسام التعليمية' : '🎈 اختر القسم المفضل'}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catScrollContainer}
          >
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.catChip, isParent && styles.parentCatChip, selectedCategory === cat && styles.activeCat]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.catText, isParent && styles.parentCatText, selectedCategory === cat && styles.activeCatText]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* الدورات */}
          <Text style={[styles.sectionTitle, isParent && { color: '#FFD700', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 }]}>{isParent ? '❖ الدورات المقررة' : '🚀 رحلاتنا الإيمانية'}</Text>
          {filteredCourses?.map((course, i) => (
            <CourseCard 
              key={i} 
              course={course} 
              isParent={isParent} 
              colorScheme={KID_CARD_COLORS[i % KID_CARD_COLORS.length]} 
              onSelect={handleCourseClick} 
              onOpenContent={(c)=> setSelectedContentCourse(c)}
              userStars={userStars} 
              onViewDetails={handleViewDetails}
            />
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Modal لعرض ملف الـ PDF داخلياً */}
        <InternalPdfViewerModal 
          visible={pdfModalVisible}
          onClose={() => setPdfModalVisible(false)}
          pdfUri={selectedPdfUri}
          pdfHtmlContent={selectedPdfHtml}
          pdfTitle={selectedPdfTitle}
        />
      </SafeAreaView>
    </ImageBackground>
  );
}

// ==========================================
// 🎨 التنسيقات (StyleSheet الموحدة بالكامل)
// ==========================================
const styles = StyleSheet.create({
  bg: { flex: 1, resizeMode: 'cover', width: '100%', height: '100%' },
  
  overlay: { flex: 1, backgroundColor: 'rgba(255, 248, 225, 0.85)' },
  parentOverlay: { flex: 1, backgroundColor: 'rgba(15, 56, 44, 0.88)' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  
  userRow: { 
    flexDirection: 'row-reverse', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16, 
    backgroundColor: '#FFFFFF', 
    padding: 14, 
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFD166',
    elevation: 4,
    shadowColor: '#FFB703',
    shadowOpacity: 0.2,
  },
  parentUserRow: { 
    backgroundColor: '#FFFFFF', 
    borderColor: '#FFD166',
  },
  logoutText: { color: '#EF4444', fontWeight: '800', fontSize: 13 },
  roleText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  
  quickActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#93C5FD',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 3,
  },
  quickBtn: { 
    backgroundColor: '#E0F2FE', 
    padding: 16, 
    borderRadius: 20, 
    alignItems: 'center', 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    shadowColor: '#60A5FA',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 2,
  },
  actionSolid: {
    borderWidth: 2,
    shadowColor: 'rgba(15, 118, 110, 0.3)',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 3,
  },
  quickBtnText: { color: '#0F172A', fontWeight: '900', fontSize: 14 },
  quickBtnSolidText: { color: '#FFFFFF' },
  backButtonSmall: { alignSelf: 'flex-start', marginBottom: 10 },
  backButtonText: { fontSize: 13, fontWeight: '800', color: '#0F382C' },
  stationBadge: { minWidth: 80, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center' },
  stationReached: { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
  stationPending: { backgroundColor: '#E2E8F0', borderColor: '#94A3B8' },
  stationText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  actionBtn: { backgroundColor: '#0F382C', paddingVertical: 12, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  smallAddBtn: { backgroundColor: '#0F382C', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  smallAddBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
   
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', textAlign: 'right', marginVertical: 10 },
  
  catScrollContainer: { flexDirection: 'row-reverse', gap: 8, marginBottom: 16 },
  catChip: { 
    paddingHorizontal: 16, 
    paddingVertical: 9, 
    borderRadius: 16, 
    backgroundColor: '#FFFFFF', 
    borderWidth: 2, 
    borderColor: '#38BDF8' 
  },
  parentCatChip: { backgroundColor: '#FFFFFF', borderColor: '#38BDF8' },
  activeCat: { backgroundColor: '#0284C7', borderColor: '#0284C7' },
  catText: { fontSize: 12, color: '#0284C7', fontWeight: '700' },
  parentCatText: { color: '#0284C7' },
  activeCatText: { color: '#FFF' },
  
  courseCard: { 
    borderRadius: 20, 
    padding: 16, 
    marginBottom: 14, 
    borderWidth: 2,
    borderColor: '#FFD166',
    backgroundColor: '#FFFFFF',
    elevation: 4,
  },
  courseTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', textAlign: 'right' },
  courseSub: { fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'right' },
  rating: { fontSize: 12, fontWeight: 'bold', color: '#D97706' },
  price: { fontSize: 14, fontWeight: '800', color: '#10B981' },
  oldPrice: { fontSize: 11, color: '#94A3B8', textDecorationLine: 'line-through' },
  
  mainBtn: { backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  mainBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  
  btnOutline: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#38BDF8' },
  btnText: { fontSize: 12, fontWeight: '800', color: '#0284C7' },
  
  discountBox: { backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8, marginBottom: 8 },
  discountText: { fontSize: 11, color: '#B45309', textAlign: 'center', fontWeight: 'bold' },
  
  cardBox: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 18, 
    marginBottom: 16, 
    borderWidth: 3, 
    borderColor: '#FFD166',
    elevation: 6,
    shadowColor: '#FFB703',
    shadowOpacity: 0.25,
  },
  parentCardBox: { 
    backgroundColor: '#FFFFFF', 
    borderColor: '#FFD166', 
  },
  
  rowBetween: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', textAlign: 'right' },
  
  badge: { backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#0369A1' },
  
  subscriptionDesc: { fontSize: 13, color: '#475569', textAlign: 'right', marginVertical: 8, lineHeight: 20 },
  
  simpleTimerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: '#F0F9FF', 
    padding: 10, 
    borderRadius: 12, 
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD'
  },
  timerBadgeBox: { 
    backgroundColor: '#FEF3C7', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 10, 
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#FCD34D'
  },
  timerNumber: { fontSize: 15, fontWeight: '900', color: '#B45309' },
  expiryDateText: { fontSize: 11, color: '#64748B', textAlign: 'right', fontWeight: '600' },
  reminderAlertText: { fontSize: 11, color: '#D97706', fontWeight: 'bold', textAlign: 'right' },
  expiredAlertText: { fontSize: 11, color: '#EF4444', fontWeight: 'bold', textAlign: 'right' },

  questionText: { fontSize: 14, color: '#1E293B', textAlign: 'right', marginVertical: 8, fontWeight: '700' },
  statusBox: { padding: 12, borderRadius: 12, marginVertical: 6 },
  successBox: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC' },
  successTitle: { fontSize: 13, fontWeight: 'bold', color: '#166534', textAlign: 'right' },
  successSub: { fontSize: 11, color: '#15803D', textAlign: 'right' },
  errorBox: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  errorTitle: { fontSize: 13, fontWeight: 'bold', color: '#991B1B', textAlign: 'right' },
  errorSub: { fontSize: 11, color: '#B91C1C', textAlign: 'right' },
  cheerBox: { backgroundColor: '#FFF', padding: 8, borderRadius: 8, marginTop: 4 },
  cheerText: { fontSize: 10, color: '#7F1D1D', textAlign: 'right', fontWeight: 'bold' },
  pendingBox: { backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10 },
  pendingText: { fontSize: 11, color: '#B45309', textAlign: 'right', fontWeight: 'bold' },
  noticeBox: { backgroundColor: '#F1F5F9', padding: 10, borderRadius: 10 },
  noticeText: { fontSize: 11, color: '#475569', textAlign: 'right' },
  
  optionBtn: { 
    backgroundColor: '#F8FAFC', 
    padding: 12, 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: '#CBD5E1', 
    alignItems: 'flex-end', 
    marginBottom: 8 
  },
  selectedOpt: { backgroundColor: '#E0F2FE', borderColor: '#0284C7' },
  optionText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  selectedOptText: { color: '#0369A1', fontWeight: '800' },
  
  textInput: { 
    backgroundColor: '#F0F9FF', 
    borderWidth: 2, 
    borderColor: '#38BDF8', 
    borderRadius: 12, 
    padding: 12, 
    textAlign: 'right', 
    minHeight: 80, 
    color: '#0F172A',
    fontSize: 13
  },
  
  submitBtn: { 
    backgroundColor: '#10B981', 
    padding: 12, 
    borderRadius: 12, 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#059669',
    marginTop: 8
  },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  
  emptyText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginVertical: 12 },
  
  starBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#FCD34D' },
  starBadgeText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  unreadBadge: { backgroundColor: '#EF4444', minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  unreadBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  
  subCardText: { fontSize: 11, color: '#64748B', textAlign: 'right' },
  
  chartContainer: { flexDirection: 'row-reverse', justifyContent: 'space-around', alignItems: 'flex-end', height: 130, paddingTop: 10 },
  chartColumn: { alignItems: 'center', width: 50 },
  chartValue: { fontSize: 10, fontWeight: '800', color: '#D97706', marginBottom: 4 },
  barTrack: { width: 16, height: 85, backgroundColor: '#F1F5F9', borderRadius: 8, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: '#F59E0B', borderRadius: 8 },
  chartLabel: { fontSize: 10, color: '#64748B', marginTop: 6, fontWeight: 'bold' },
  
  tabToggle: { flexDirection: 'row-reverse', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  activeTab: { backgroundColor: '#FFFFFF', elevation: 2 },
  tabText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  activeTabText: { color: '#0F172A', fontWeight: '800' },
  
  leaderItem: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  highlightMe: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 6 },
  scoreBox: { backgroundColor: '#F0F9FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#BAE6FD' },
  scoreNum: { fontSize: 11, fontWeight: '900', color: '#0284C7' },
  leaderName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  leaderSub: { fontSize: 10, color: '#94A3B8' },
  
  subCard: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0', width: '100%', overflow: 'hidden' },
  subCardHeader: { flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 },
  subCardBody: { width: '100%', flexWrap: 'wrap' },
  subCardTitleWrapper: { flex: 1, minWidth: 0 },
  subCardBadgeWrapper: { marginLeft: 8, minWidth: 0 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  pendingBadge: { backgroundColor: '#FEF3C7' },
  subCardTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  reportCard: { backgroundColor: '#F0FDF4', padding: 10, borderRadius: 12, marginBottom: 8, borderWidth: 1.5, borderColor: '#BBF7D0' },
  
  pdfItemBox: { 
    flexDirection: 'row-reverse', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#F8FAFC', 
    padding: 12, 
    borderRadius: 14, 
    borderWidth: 1.5, 
    borderColor: '#E2E8F0', 
    marginTop: 8 
  },
  pdfItemTitle: { fontSize: 13, fontWeight: '800', color: '#1E293B', textAlign: 'right' },
  pdfItemSub: { fontSize: 11, color: '#64748B', marginTop: 3, textAlign: 'right' },
  openPdfBtn: { backgroundColor: '#0284C7', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  openPdfBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  
  pdfContainer: { flex: 1, backgroundColor: '#002d96' },
  pdfHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#1E293B' },
  pdfHeaderTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  closeBtn: { backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  closeBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  
  loadingBox: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)' },
  loadingText: { marginTop: 10, fontSize: 12, color: '#0284C7', fontWeight: '800' },
  estimatorValueBox: { backgroundColor: '#FFFFFF', width: 140, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  estimatorValue: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  paymentModalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  paymentModalBox: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  paymentModalTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 10, textAlign: 'right' },
  paymentModalText: { fontSize: 13, color: '#475569', lineHeight: 20, marginBottom: 14, textAlign: 'right' },
  paymentInfoBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 14, marginBottom: 10, borderWidth:1, borderColor:'#E2E8F0' },
  paymentInfoLabel: { fontSize: 12, color: '#0F172A', fontWeight: '700', marginBottom: 6, textAlign: 'right' },
  paymentInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  paymentInfoValue: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  copyBtn: { backgroundColor: '#0F382C', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  copyBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  paymentAmountText: { fontSize: 13, color: '#1F2937', fontWeight: '700', marginBottom: 12, textAlign: 'right' },
  paymentFieldLabel: { fontSize: 12, color: '#475569', marginBottom: 6, textAlign: 'right' },
  paymentInput: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 10, paddingHorizontal: 12, color: '#0F172A', marginBottom: 10, textAlign: 'right' },
  paymentHintText: { fontSize: 12, color: '#64748B', marginBottom: 12, textAlign: 'right' },
  paymentActionsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between' }
});
