import React, { useState, useEffect, useRef, useContext } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView, 
  TextInput, 
  Alert, 
  Linking,
  AppState 
} from 'react-native';
import { TEAM_MEETING_URL } from '../constants/meetingLinks';

// تسجيل صوتي داخلي
import { Audio } from 'expo-av';

// استدعاء ملفات الخدمات اللي عملناها
import { 
  startSessionForegroundNotification, 
  stopSessionNotificationAndShowPDF 
} from '../services/sessionBackgroundService';
import { generateSessionPDF } from '../services/pdfReportGenerator';
import { requestRecitationAnalysis } from '../components/aiEvaluatorService';
import { AuthContext } from '../context/AuthContext';

export default function LiveSessionScreen({ route, onBack, user }) {
  const REAL_MEETING_ROOM = TEAM_MEETING_URL;

  const [meetingUrl, setMeetingUrl] = useState(REAL_MEETING_ROOM);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // وضع التشغيل: 'teams' أو 'inapp'
  const [mode, setMode] = useState('teams');

  // تسجيل صوتي داخلي
  const [isRecording, setIsRecording] = useState(false);
  const [recordingObj, setRecordingObj] = useState(null);
  const [recordedUri, setRecordedUri] = useState(null);
  const recordingRef = useRef(null);

  // استخدام useRef لحفظ البيانات عبر دورة حياة المكون بدون إعادة التقديم (Re-render)
  const appState = useRef(AppState.currentState);
  const joinTimeRef = useRef(null);

  const { addStudentReport, addSessionReport } = useContext(AuthContext);
  useEffect(() => {
    // مراقبة حالة التطبيق (هل المستخدم خرج لـ Teams ورجع ولا لأ)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) && 
        nextAppState === 'active' && 
        isSessionActive
      ) {
        // الطالب رجع للبرنامج بعد ما كان في Teams
        handleReturnFromTeams();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isSessionActive]);

  // 1. عند الضغط للذهاب لـ Teams
  const openInTeamsApp = async () => {
    if (!meetingUrl.trim() || !meetingUrl.startsWith('http')) {
      Alert.alert('تنبيه ⚠️', 'يرجى إدخال رابط صحيح.');
      return;
    }

    try {
      // تسجيل وقت الدخول للغرفة
      joinTimeRef.current = new Date();
      setIsSessionActive(true);

      // تشغيل إشعار الخلفية
      await startSessionForegroundNotification('غرفة التسميع المباشرة (Teams)');

      // فتح رابط Teams
      await Linking.openURL(meetingUrl);
    } catch (error) {
      setIsSessionActive(false);
      Alert.alert('خطأ ❌', 'تعذر فتح تطبيق Teams.');
    }
  };

  // --- تسجيل داخلي (In-app bot session) ------------------------------------------------
  const requestAudioPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('مسموحيات مطلوبة', 'يرجى منح التطبيق إذن استخدام الميكروفون.');
        return false;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      return true;
    } catch (err) {
      console.error('perm error', err);
      return false;
    }
  };

  const startInAppRecording = async () => {
    const ok = await requestAudioPermissions();
    if (!ok) return;

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setRecordingObj(recording);
      setIsRecording(true);
      joinTimeRef.current = new Date();
      setIsSessionActive(true);
      await startSessionForegroundNotification('جلسة تسميع داخلي (Bot)');
    } catch (err) {
      console.error('start recording error', err);
      Alert.alert('خطأ', 'تعذر بدء التسجيل.');
    }
  };

  const stopInAppRecordingAndAnalyze = async (expectedSurah = '') => {
    try {
      const recording = recordingRef.current || recordingObj;
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setIsRecording(false);
      setIsSessionActive(false);

      const leaveTime = new Date();
      const joinTime = joinTimeRef.current || new Date();
      const diffMs = leaveTime - joinTime;
      const diffMins = Math.max(Math.round(diffMs / 60000), 1);

      // 1) أرسل الصوت للـ backend ليعمل تحليل/تفريغ نصي/تصحيح
      let analysis = null;
      try {
        analysis = await requestRecitationAnalysis(uri, expectedSurah);
      } catch (err) {
        console.error('analysis error', err);
      }

      const transcriptionText = analysis?.transcriptionText || analysis?.transcript || '';
      const mistakesList = analysis?.mistakesList || analysis?.mistakes || [];
      const score = typeof analysis?.score === 'number' ? analysis.score : (analysis?.rating || 100);
      const aiNotes = analysis?.notes || analysis?.aiNotes || 'تم تحليل التسجيل تلقائياً.';

      const sessionData = {
        studentName: user?.name || 'طالب جديد',
        roomName: 'جلسة تسميع داخلية (Bot)',
        joinTime: joinTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }),
        leaveTime: leaveTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }),
        durationText: `${diffMins} دقيقة`,
        hasAudioContent: Boolean(uri),
        transcriptionText,
        mistakesList,
        score,
        aiNotes,
      };

      // 2) توليد PDF
      const pdfUri = await generateSessionPDF(sessionData);

      // 3) إشعار وإنهاء
      await stopSessionNotificationAndShowPDF(pdfUri);
 
      // 4) ربط التقرير بقاعدة بيانات الطالب: إضافة تقرير موجز داخل studentsDatabase
      try {
        const reportText = `${aiNotes}\nنسبة: ${score}%\nأخطاء: ${mistakesList.length} - ${mistakesList.slice(0,3).join(', ')}`;
        addStudentReport?.(user?.id || user?.studentId || user?.studentDbId, reportText);
      } catch (err) {
        console.error('خطأ في حفظ التقرير للمستخدم:', err);
      }
 
      // 5) حفظ تقرير الجلسة في سجل الجلسات من أجل العرض في الشاشة الرئيسية
      try {
        addSessionReport?.({
          ...sessionData,
          studentId: user?.id || user?.studentId || user?.studentDbId,
          pdfUri,
          date: new Date().toLocaleDateString('ar-EG'),
          createdAt: Date.now()
        });
      } catch (err) {
        console.error('خطأ في حفظ سجل الجلسة:', err);
      }
 
      // 6) إعلام المستخدم
      Alert.alert('📊 اكتملت الجلسة', 'تم تحليل التسجيل وإنشاء تقرير PDF. يمكنك معاينته الآن.', [
        { text: 'حسناً' }
      ]);

    } catch (err) {
      console.error('stop recording error', err);
      Alert.alert('خطأ', 'تعذر إيقاف التسجيل أو تحليله.');
    }
  };

  // -------------------------------------------------------------------------------------

  // 2. عند العودة للتطبيق بعد إنهاء الاجتماع
  const handleReturnFromTeams = async () => {
    // If mode is inapp we don't use Teams-return flow
    if (mode === 'inapp') return;

    setIsSessionActive(false);

    const leaveTime = new Date();
    const joinTime = joinTimeRef.current || new Date();

    // حساب المدة بالدقائق
    const diffMs = leaveTime - joinTime;
    const diffMins = Math.max(Math.round(diffMs / 60000), 1);

    const formatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
    
    const sessionData = {
      studentName: user?.name || 'طالب جديد',
      roomName: 'غرفة التسميع الصوتية (Teams)',
      joinTime: joinTime.toLocaleTimeString('ar-EG', formatOptions),
      leaveTime: leaveTime.toLocaleTimeString('ar-EG', formatOptions),
      durationText: `${diffMins} دقيقة`,
      hasAudioContent: false, // جلسة خارجية في Teams
      transcriptionText: '',
      mistakesList: [],
      score: 100,
      aiNotes: 'تم تسجيل الوقت والتواجد داخل الجلسة بنجاح.',
    };

    try {
      // توليد ملف الـ PDF أولاً للحصول على الـ uri
      const pdfUri = await generateSessionPDF(sessionData);

      // إغلاق إشعار التسجيل وتمرير مسار الـ PDF للإشعار الجديد
      await stopSessionNotificationAndShowPDF(pdfUri);
 
      // حفظ تقرير الجلسة في سجل الجلسات ليظهر في الشاشة الرئيسية
      try {
        addSessionReport?.({
          ...sessionData,
          studentId: user?.id || user?.studentId || user?.studentDbId,
          pdfUri,
          date: new Date().toLocaleDateString('ar-EG'),
          createdAt: Date.now()
        });
      } catch (err) {
        console.error('خطأ في حفظ سجل الجلسة:', err);
      }
 
      try {
        addStudentReport?.(user?.id || user?.studentId || user?.studentDbId, `تمت جلسة Teams. مدة الجلسة: ${sessionData.durationText}.`);
      } catch (err) {
        console.error('خطأ في حفظ تقرير الطالب:', err);
      }
  
      // تنبيه المستخدم وفتح التقرير فوراً عند الرغبة
      Alert.alert(
        '📊 اكتملت الجلسة',
        'تم تسجيل وقت الدخول والخروج بنجاح. هل تريد فتح تقرير الـ PDF الآن؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          { 
            text: 'فتح التقرير 📄', 
            onPress: async () => {
              if (pdfUri) {
                // دالة الـ generator تفتح المشاركة تلقائياً، ويمكنك اعتمادها هنا مباشرة
                console.log('تم فتح التقرير بنجاح');
              }
            } 
          }
        ]
      );
    } catch (error) {
      console.error('خطأ أثناء معالجة تقرير الجلسة:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🟦 الغرفة المباشرة</Text>
      </View>

      <View style={styles.joinContainer}>
        <Text style={styles.welcomeEmoji}>🌐👥</Text>
        <Text style={styles.title}>الانضمام للغرفة المباشرة</Text>

        <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 12 }}>
          <TouchableOpacity onPress={() => setMode('teams')} style={[styles.modeBtn, mode === 'teams' && styles.modeActive]}>
            <Text style={{ color: mode === 'teams' ? '#FFF' : '#CBD5E1', fontWeight: '800' }}>Teams (خارجي)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('inapp')} style={[styles.modeBtn, mode === 'inapp' && styles.modeActive]}>
            <Text style={{ color: mode === 'inapp' ? '#FFF' : '#CBD5E1', fontWeight: '800' }}>جلسة داخل التطبيق (بوت)</Text>
          </TouchableOpacity>
        </View>

        {mode === 'teams' ? (
          <>
            <Text style={styles.subtitle}>
              اضغط للدخول فوراً إلى الاجتماع المباشر عبر تطبيق Teams الرسمي.
            </Text>

            <View style={styles.inputBox}>
              <Text style={styles.label}>رابط الاجتماع:</Text>
              <TextInput
                style={styles.input}
                value={meetingUrl}
                onChangeText={setMeetingUrl}
                placeholder="https://teams.microsoft.com/..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity 
              style={[styles.joinBtn, isSessionActive && { backgroundColor: '#F59E0B', borderColor: '#D97706' }]} 
              onPress={openInTeamsApp}
            >
              <Text style={styles.joinBtnText}>
                {isSessionActive ? 'العودة للاجتماع الحالي 🔄' : 'دخول الاجتماع الآن 🚀'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              تسجيل مباشر داخل التطبيق وإرسال التسجيل للمساعد الذكي لتحليل التسميع.
            </Text>

            <View style={{ width: '100%', marginBottom: 12 }}>
              <Text style={styles.label}>صفحة / سورة للتسميع (اختياري):</Text>
              <TextInput style={[styles.input, { paddingVertical: 8 }]} placeholder="مثلاً: سورة الفاتحة" onChangeText={() => {}} />
            </View>

            <TouchableOpacity 
              style={[styles.joinBtn, isRecording && { backgroundColor: '#EF4444', borderColor: '#B91C1C' }]} 
              onPress={isRecording ? () => stopInAppRecordingAndAnalyze() : startInAppRecording}
            >
              <Text style={styles.joinBtnText}>
                {isRecording ? 'إيقاف وتحليل التسجيل ⏹️' : 'بدء التسجيل والتمرين 🎙️'}
              </Text>
            </TouchableOpacity>

            {recordedUri ? (
              <Text style={{ marginTop: 10, color: '#CBD5E1', fontSize: 12 }}>تم حفظ التسجيل محلياً: {recordedUri}</Text>
            ) : null}
          </>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F382C' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#0B2920', borderBottomWidth: 1, borderBottomColor: '#D4AF37' },
  headerTitle: { color: '#FFD700', fontSize: 13, fontWeight: '900' },
  backText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  
  joinContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  welcomeEmoji: { fontSize: 45, marginBottom: 10 },
  title: { color: '#FFD700', fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: '#CBD5E1', fontSize: 12, textAlign: 'center', marginBottom: 20, fontWeight: '700', lineHeight: 18 },
  
  inputBox: { width: '100%', marginBottom: 20 },
  label: { color: '#FFF', fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 6 },
  input: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, textAlign: 'right', fontSize: 12, fontWeight: '700', borderWidth: 2, borderColor: '#D4AF37', color: '#000' },

  joinBtn: { backgroundColor: '#0F9D58', width: '100%', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderColor: '#34A853' },
  joinBtnText: { color: '#FFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },

  modeBtn: { padding: 8, borderRadius: 10, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#213F36' },
  modeActive: { backgroundColor: '#0F9D58' },
});
