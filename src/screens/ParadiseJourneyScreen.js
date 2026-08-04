import React from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

// المحطات الافتراضية للرحلة
const stations = ['سورة الفاتحة', 'سورة الكهف', 'سورة الرحمن', 'سورة الفجر', 'سورة يس', 'سورة الناس', 'الختام'];

export default function ParadiseJourneyScreen({ onBack, enrolledCourses = [], currentStudent = {}, getCourseProgress, totalLessonsFor }) {
  // حساب الإحصائيات (الدروس الكلية والمكتملة) بناءً على الكورسات المشترك فيها الطالب
  const totalLessons = enrolledCourses.reduce((sum, course) => sum + (typeof totalLessonsFor === 'function' ? totalLessonsFor(course) : 0), 0);
  
  const completedLessons = enrolledCourses.reduce((sum, course) => {
    // جلب تقدم الطالب في كل كورس من الـ Context أو الـ Props
    const progress = getCourseProgress?.(currentStudent.studentId || currentStudent.id, course.id);
    // حساب عدد الدروس المكتملة (سواء كرقم مباشر أو طول القائمة)
    const completedCount = progress?.completedLessons ?? (Array.isArray(progress?.completedList) ? progress.completedList.length : 0) ?? 0;
    return sum + completedCount;
  }, 0);

  // حساب النسبة المئوية الإجمالية وتحديد المحطة الحالية على الخريطة
  const overallPct = totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;
  // تقسيم النسبة على عدد المحطات لمعرفة أين يقف الطالب
  const currentStation = totalLessons > 0 ? Math.min(stations.length - 1, Math.floor((overallPct / 100) * stations.length)) : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* الأشكال الديكورية في الخلفية */}
      <View style={styles.backgroundDecor} pointerEvents="none">
        <View style={styles.decorCircleLight} />
        <View style={styles.decorCloudOne} />
        <View style={styles.decorCloudTwo} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>
          {/* كارت المقدمة والتقدم - تم إضافة مارجن علوي لإنزاله للأسفل */}
          <View style={styles.headerCard}>
            <Text style={styles.title}>رحلة إلى الجنة 🌙⭐</Text>
            <Text style={styles.paragraph}>خريطة مليئة بمحطات، وكل محطة تمثل سورة أو جزءًا. كلما حفظ الطالب تقدم على الخريطة حتى يصل إلى نهاية الرحلة.</Text>

            {/* شريط التقدم البصري */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${overallPct}%` }]} />
            </View>
            <Text style={styles.progressText}>التقدم الحالي: {overallPct}%</Text>
          </View>

          {/* قسم المحطات (الخريطة) */}
          <Text style={styles.sectionTitle}>المحطات</Text>
          <View style={styles.stationsGrid}>
            {stations.map((station, index) => {
              // تحديد ما إذا كان الطالب قد وصل للمحطة أو تجاوزها
              const reached = index <= currentStation;
              return (
                <View key={station} style={[styles.stationBadge, reached ? styles.stationReached : styles.stationPending]}>
                  <Text style={[styles.stationText, reached && styles.stationReachedText]}>{station}</Text>
                </View>
              );
            })}
          </View>

          {/* صندوق الملخص الرقمي */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>التقدم الحالي: {completedLessons}/{totalLessons} درس مكتمل ({overallPct}%)</Text>
            <Text style={styles.summaryHint}>كل درس مكتمل يقودك خطوة أقرب نحو المحطة التالية في رحلة الجنة.</Text>
          </View>
        </View>

        {/* زر العودة في الأسفل */}
        <View style={styles.footer}>
          <TouchableOpacity onPress={onBack} style={styles.bottomBackButton}>
            <Text style={styles.bottomBackText}>العودة إلى الصفحة الرئيسية</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EBF8FF' }, // خلفية زرقاء فاتحة جداً مريحة للعين
  content: { padding: 16, flexGrow: 1, justifyContent: 'space-between' },
  inner: { flex: 1 },
  
  // كارت البداية - تم تظبيطه ليكون تحت شوية
  headerCard: { 
    backgroundColor: '#E0F2FE', 
    borderRadius: 26, 
    padding: 22, 
    borderWidth: 1, 
    borderColor: '#93C5FD', 
    shadowColor: '#60A5FA', 
    shadowOpacity: 0.18, 
    shadowRadius: 12, 
    elevation: 4,
    marginTop: 40, // 👈 القيمة دي هي اللي نزلته تحت
  },
  
  title: { fontSize: 23, fontWeight: '900', color: '#0C4A6E', marginBottom: 14, textAlign: 'right' },
  paragraph: { color: '#334155', lineHeight: 24, marginBottom: 18, textAlign: 'right', fontSize: 14 },
  
  // شريط التقدم
  progressTrack: { height: 14, borderRadius: 99, backgroundColor: '#E2E8F0', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', backgroundColor: '#38BDF8' }, // لون أزرق سماوي للتقدم
  progressText: { fontSize: 13, fontWeight: '900', color: '#0F172A', marginTop: 10, textAlign: 'right' },
  
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginTop: 22, marginBottom: 12, textAlign: 'right' },
  stationsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between' },
  
  // ستايل المحطات (الغير مكتملة)
  stationBadge: { width: '48%', marginBottom: 12, borderRadius: 20, paddingVertical: 18, alignItems: 'center', borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', shadowColor: '#93C5FD', shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 },
  // ستايل المحطات (التي تم الوصول إليها)
  stationReached: { backgroundColor: '#DCFCE7', borderColor: '#10B981' }, // لون أخضر فاتح
  // ستايل المحطات المنتظرة
  stationPending: { backgroundColor: '#E2E8F0', borderColor: '#94A3B8' },
  
  stationText: { color: '#475569', fontWeight: '900', textAlign: 'center', fontSize: 14 },
  stationReachedText: { color: '#134E4A' }, // لون نص أخضر غامق
  
  summaryBox: { marginTop: 18, marginBottom: 20, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#CBD5E1', shadowOpacity: 0.12, shadowRadius: 10, elevation: 2 },
  summaryText: { fontSize: 16, fontWeight: '900', color: '#0F172A', marginBottom: 8, textAlign: 'right' },
  summaryHint: { color: '#475569', lineHeight: 20, textAlign: 'right', fontSize: 13 },
  
  footer: { marginTop: 16, paddingBottom: 32, alignItems: 'center' },
  bottomBackButton: { backgroundColor: '#0F766E', paddingVertical: 16, paddingHorizontal: 22, borderRadius: 18, width: '100%', alignItems: 'center', shadowColor: '#0F766E', shadowOpacity: 0.18, shadowRadius: 12, elevation: 3 },
  bottomBackText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  
  // الديكورات الخلفية - تم تعديل أماكنها لتناسب التصميم الجديد
  backgroundDecor: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  decorCircleLight: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(56, 189, 248, 0.12)', top: -60, right: -60 }, // قللت الشفافية شوية
  decorCloudOne: { position: 'absolute', width: 200, height: 120, borderRadius: 100, backgroundColor: 'rgba(255, 255, 255, 0.7)', top: 10, left: -20 }, // حركتها فوق شوية
  decorCloudTwo: { position: 'absolute', width: 140, height: 90, borderRadius: 70, backgroundColor: 'rgba(255, 255, 255, 0.8)', top: 100, right: 20 }
});