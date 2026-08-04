// screens/StudentContentScreen.js
import React, { useContext, useEffect, useRef, useState, useMemo } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  SafeAreaView, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Alert, 
  Animated, 
  Easing 
} from 'react-native';
import InternalPdfViewerModal from '../components/InternalPdfViewerModal';
import { AuthContext } from '../context/AuthContext';

export default function StudentContentScreen({ course, onBack }) {
  const { 
    user, 
    getCourseProgress, 
    setCourseProgress, 
    spinRewardWheel, 
    recordDailyPractice, 
    getTreeState, 
    grantRewardToStudent, 
    rewardDefinitions, 
    chooseRewardIndex 
  } = useContext(AuthContext) || {};

  const studentId = user?.studentId || user?.id;

  const [progress, setProgress] = useState(() => 
    getCourseProgress?.(studentId, course?.id) || { completedLessons: 0, completedList: [] }
  );

  const [wheelVisible, setWheelVisible] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  
  // حالة المودال وعارض الـ PDF
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [pdfURI, setPdfURI] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('');

  const rotation = useRef(new Animated.Value(0)).current;
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (getCourseProgress && course?.id) {
      setProgress(getCourseProgress(studentId, course.id) || { completedLessons: 0, completedList: [] });
    }
  }, [course, studentId, getCourseProgress]);

  // بناء قطاعات عجلة المكافآت مع الميموايزشن لتحسين الأداء
  const wheelData = useMemo(() => {
    const colorPalette = ['#FDE047','#FB923C','#F87171','#60A5FA','#34D399','#F43F5E','#818CF8','#FACC15','#FB7185','#38BDF8','#4ADE80','#2DD4BF'];
    const defs = Array.isArray(rewardDefinitions) ? rewardDefinitions : [];
    
    if (defs.length > 0) {
      return defs.map((r, i) => {
        const amount = r.amount || r.value || r.points || 0;
        return {
          color: colorPalette[i % colorPalette.length],
          amount,
          text: `${amount} ن`,
          textColor: '#0F172A',
          rewardObj: r
        };
      });
    }

    // Fallback في حالة عدم توفر خيارات المكافآت
    const fallback = [5, 10, 15, 20, 25, 5, 10, 15, 20, 25, 5, 10];
    return fallback.map((val, i) => ({
      color: colorPalette[i % colorPalette.length],
      amount: val,
      text: `${val} ن`,
      textColor: '#0F172A',
      rewardObj: { id: `points_${val}_${i}`, type: 'points', amount: val, label: `+${val} نقاط`, weight: 1 }
    }));
  }, [rewardDefinitions]);

  if (!course) return null;

  const handleMarkComplete = (lessonId, lessonTitle) => {
    const existingList = progress?.completedList || [];
    if (existingList.includes(lessonId)) {
      Alert.alert('تنبيه 💡', 'هذا الدرس مُحدد كمكتمل بالفعل.');
      return;
    }

    const updatedList = [lessonId, ...existingList];
    if (setCourseProgress) {
      setCourseProgress(studentId, course.id, updatedList);
    }
    setProgress({ completedLessons: updatedList.length, completedList: updatedList, updatedAt: new Date().toISOString() });
    
    try {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const currentTree = getTreeState ? getTreeState(studentId, course.id) : null;
      const practicedToday = currentTree && currentTree.lastPracticeDate === todayKey;
      if (!practicedToday && typeof recordDailyPractice === 'function') {
        recordDailyPractice(studentId, Date.now(), course.id);
      }
    } catch (e) {
      console.warn('Error recording practice:', e);
    }
    
    setWheelVisible(true);
  };

  // فتح ملف الـ PDF الداخلي بشكل مرن للتعامل مع مختلف تسميات الخاصية
  const openLessonPdf = (lesson) => {
    const uri = lesson?.pdfUri || lesson?.pdfUrl || lesson?.url || lesson?.fileUri;
    if (!uri) {
      Alert.alert('تنبيه 💡', 'هذا الدرس لا يحتوي على ملف PDF لفتحه.');
      return;
    }
    setPdfURI(uri);
    setPdfTitle(lesson.pdfName || lesson.title || 'درس PDF');
    setPdfModalVisible(true);
  };

  const closePdfModal = () => {
    setPdfModalVisible(false);
    setPdfURI(null);
    setPdfTitle('');
  };

  const doSpin = async () => {
    if (!studentId || isSpinning) return;
    setIsSpinning(true);
    setSpinResult(null);

    const segCount = wheelData.length;
    const segmentAngle = 360 / segCount;

    let chosen = null;
    try {
      if (typeof chooseRewardIndex === 'function') {
        chosen = chooseRewardIndex();
      }
    } catch (e) { 
      chosen = null; 
    }

    let targetIndex = 0;
    let pickedReward = null;

    if (chosen && typeof chosen.index === 'number' && chosen.picked) {
      const matchIndex = wheelData.findIndex(w => w.rewardObj && w.rewardObj.id === chosen.picked.id);
      targetIndex = matchIndex >= 0 ? matchIndex : (chosen.index % segCount);
      pickedReward = chosen.picked;
    } else {
      targetIndex = Math.floor(Math.random() * segCount);
      pickedReward = wheelData[targetIndex]?.rewardObj || null;
    }

    const spins = 6 + Math.floor(Math.random() * 4);
    const targetAngle = spins * 360 + (360 - (targetIndex * segmentAngle));

    try {
      rotation.setValue(0);
      await new Promise((resolve) => {
        Animated.timing(rotation, {
          toValue: targetAngle,
          duration: 3500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }).start(() => resolve());
      });

      if (!isMounted.current) return;

      if (pickedReward && typeof grantRewardToStudent === 'function') {
        grantRewardToStudent(studentId, pickedReward);
      } else if (typeof spinRewardWheel === 'function') {
        const granted = spinRewardWheel(studentId);
        pickedReward = granted || pickedReward;
      }

      const points = (pickedReward && (pickedReward.amount || pickedReward.points || pickedReward.value)) || 0;
      setSpinResult({ points, label: `${points} نقطة` });

    } catch (e) {
      console.warn('Spin failed', e);
    } finally {
      if (isMounted.current) {
        setIsSpinning(false);
      }
    }
  };

  const closeWheel = () => {
    setWheelVisible(false);
    setSpinResult(null);
    setIsSpinning(false);
    if (typeof onBack === 'function') {
      onBack();
    }
  };

  const isCompleted = (lessonId) => (progress?.completedList || []).includes(lessonId);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.back}>✖ إغلاق</Text>
        </TouchableOpacity>
        <Text style={styles.title}>محتوى الكورس: {course.title}</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {course.curriculum && course.curriculum.length > 0 ? (
          course.curriculum.map((unit, idx) => (
            <View key={unit.id || idx} style={styles.unitBox}>
              <Text style={styles.unitTitle}>{unit.title || `الوحدة ${idx + 1}`}</Text>
              {(unit.lessons || []).map((lesson, j) => {
                const lessonId = `${course.id}::${unit.id || idx}::${j}`;
                const lessonTitle = typeof lesson === 'string' ? lesson : (lesson.title || lesson.pdfName || 'درس بدون عنوان');
                
                // تحقق شاممل لوجود PDF
                const hasPdf = lesson && typeof lesson === 'object' && Boolean(lesson.pdfUri || lesson.pdfUrl || lesson.url || lesson.fileUri);
                
                return (
                  <View key={j} style={styles.lessonRow}>
                    <View style={styles.lessonTitleContainer}>
                      <Text style={styles.lessonText}>• {lessonTitle}</Text>
                      {hasPdf && <Text style={styles.pdfBadge}>PDF</Text>}
                    </View>
                    <View style={styles.lessonActions}>
                      {hasPdf && (
                        <TouchableOpacity style={[styles.openBtn, styles.pdfOpenBtn]} onPress={() => openLessonPdf(lesson)}>
                          <Text style={styles.openPdfBtnText}>فتح PDF</Text>
                        </TouchableOpacity>
                      )}
                      {isCompleted(lessonId) ? (
                        <View style={[styles.openBtn, { backgroundColor: '#6EE7B7' }]}>
                          <Text style={[styles.openBtnText, { color: '#0F382C' }]}>مكتمل ✅</Text>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.openBtn} onPress={() => handleMarkComplete(lessonId, lessonTitle)}>
                          <Text style={styles.openBtnText}>أكمل الدرس</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا يوجد محتوى منشور بعد لهذا الكورس.</Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* عارض الـ PDF الداخلي */}
      <InternalPdfViewerModal
        visible={pdfModalVisible}
        onClose={closePdfModal}
        pdfUri={pdfURI}
        pdfTitle={pdfTitle}
      />

      {/* مودال عجلة المكافآت */}
      <Modal visible={wheelVisible} transparent animationType="fade" onRequestClose={closeWheel}>
        <View style={styles.modalOverlay}>
          <View style={styles.wheelModalContainer}>
            <Text style={styles.wheelModalTitle}>عجلة المكافآت 🎡</Text>
            <Text style={styles.wheelModalSubTitle}>أتممت الدرس بنجاح! دوّر العجلة لاختيار نقاطك.</Text>

            <View style={styles.wheelWrapper}>
              {/* المؤشر العلوي الثابت */}
              <View style={styles.wheelPointerContainer}>
                <View style={styles.wheelPointerDot} />
                <View style={styles.wheelPointerLine} />
              </View>

              <Animated.View style={[
                styles.animatedWheel, 
                { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg','360deg'] }) }] }
              ]}>
                <View style={styles.wheelOuterCircle}>
                  {wheelData.map((item, index) => {
                    const angle = index * (360 / wheelData.length);
                    return (
                      <View 
                        key={index} 
                        style={[styles.wheelSegmentWrapper, { transform: [{ rotate: `${angle}deg` }] }]}
                      >
                        <View 
                          style={[styles.wheelTriangle, { borderTopColor: item.color }]} 
                        />
                        <Text style={[styles.wheelSegmentText, { color: item.textColor }]}>
                          {item.text}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* الأوتاد الصفراء (Pegs) */}
                <View style={StyleSheet.absoluteFillObject}>
                  {wheelData.map((_, index) => {
                    const angle = index * (360 / wheelData.length) + (180 / wheelData.length);
                    return (
                      <View 
                        key={`peg-${index}`} 
                        style={[styles.pegWrapper, { transform: [{ rotate: `${angle}deg` }] }]}
                      >
                        <View style={styles.pegItem} />
                      </View>
                    );
                  })}
                </View>

                {/* الدائرة المركزية */}
                <View style={styles.wheelCenterCircle}>
                  <View style={styles.wheelCenterInnerDot} />
                </View>
              </Animated.View>
            </View>

            {spinResult && (
              <View style={styles.spinResultBox}>
                <Text style={styles.spinResultTitle}>🎉 مبروك! حصلت على {spinResult.label}</Text>
                <Text style={styles.spinResultSubText}>تمت إضافة النقاط لحسابك بنجاح!</Text>
              </View>
            )}

            {!spinResult ? (
              <TouchableOpacity onPress={doSpin} style={[styles.actionBtn, { backgroundColor: '#0F382C' }]} disabled={isSpinning}>
                <Text style={styles.actionBtnText}>{isSpinning ? 'جاري الدوران...' : 'دوّر الآن 🎯'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={closeWheel} style={[styles.actionBtn, { backgroundColor: '#10B981' }]}>
                <Text style={styles.actionBtnText}>تم — إغلاق</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F8F5' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#0F382C' },
  back: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  title: { fontWeight: '900', color: '#FFFFFF', fontSize: 16 },
  body: { padding: 16 },
  unitBox: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 2, borderColor: '#0F382C' },
  unitTitle: { fontWeight: '900', marginBottom: 10, color: '#0F382C', fontSize: 15, textAlign: 'right' },
  lessonRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  lessonTitleContainer: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start' },
  lessonText: { color: '#0F382C', fontSize: 14, fontWeight: '700' },
  pdfBadge: { backgroundColor: '#F97316', color: '#ffffff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontSize: 10, fontWeight: '900', marginRight: 6 },
  lessonActions: { flexDirection: 'row', alignItems: 'center' },
  openBtn: { backgroundColor: '#0F382C', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  openBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  pdfOpenBtn: { backgroundColor: '#2563EB', marginLeft: 6 },
  openPdfBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
  emptyContainer: { padding: 16, alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  wheelModalContainer: { width: '92%', backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', elevation: 6 },
  wheelModalTitle: { fontWeight: '900', fontSize: 20, marginBottom: 4, color: '#0F382C' },
  wheelModalSubTitle: { color: '#334155', marginBottom: 16, textAlign: 'center', fontSize: 13 },
  wheelWrapper: { height: 280, width: 280, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  wheelPointerContainer: { position: 'absolute', top: -14, zIndex: 30, alignItems: 'center' },
  wheelPointerDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EF4444', borderWidth: 3, borderColor: '#fff', elevation: 8 },
  wheelPointerLine: { width: 6, height: 24, backgroundColor: '#EF4444', borderRadius: 3, marginTop: -4 },
  animatedWheel: { width: 260, height: 260, justifyContent: 'center', alignItems: 'center' },
  wheelOuterCircle: { width: 260, height: 260, borderRadius: 130, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 4, borderColor: '#1E293B' },
  wheelSegmentWrapper: { position: 'absolute', left: 94.5, top: 0, width: 71, height: 260, alignItems: 'center' },
  wheelTriangle: { width: 0, height: 0, borderTopWidth: 130, borderLeftWidth: 35.5, borderLeftColor: 'transparent', borderRightWidth: 35.5, borderRightColor: 'transparent' },
  wheelSegmentText: { position: 'absolute', top: 25, fontWeight: '900', fontSize: 13, transform: [{ rotate: '-90deg' }] },
  pegWrapper: { position: 'absolute', left: 126, top: 0, width: 8, height: 260, alignItems: 'center', zIndex: 10 },
  pegItem: { width: 8, height: 14, backgroundColor: '#FACC15', borderRadius: 4, borderWidth: 1, borderColor: '#CA8A04', marginTop: -2 },
  wheelCenterCircle: { position: 'absolute', top: 105, left: 105, width: 50, height: 50, borderRadius: 25, backgroundColor: '#EF4444', borderWidth: 3, borderColor: '#FFFFFF', zIndex: 20, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  wheelCenterInnerDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#EF4444' },
  spinResultBox: { alignItems: 'center', marginBottom: 14, backgroundColor: '#F0FDF4', padding: 12, borderRadius: 10, width: '100%', borderWidth: 1, borderColor: '#86EFAC' },
  spinResultTitle: { fontWeight: '900', fontSize: 16, color: '#166534' },
  spinResultSubText: { color: '#15803D', marginTop: 4, fontSize: 12 },
  actionBtn: { width: '100%', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  actionBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});