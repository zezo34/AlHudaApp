// screens/StudentContentScreen.js
import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, Animated, Easing } from 'react-native';
import { AuthContext } from '../context/AuthContext';

export default function StudentContentScreen({ course, onBack }) {
  const { user, getCourseProgress, setCourseProgress, studentsDatabase, spinRewardWheel, recordDailyPractice, getTreeState, chooseRewardIndex, grantRewardToStudent, rewardDefinitions } = useContext(AuthContext);
  const studentId = user?.studentId || user?.id;

  const [progress, setProgress] = useState(() => getCourseProgress(studentId, course?.id) || { completedLessons: 0, completedList: [] });

  // reward wheel modal states
  const [wheelVisible, setWheelVisible] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState(null);

  // animated rotation value (degrees)
  const rotation = useRef(new Animated.Value(0)).current;

  // tree state
  const [treeState, setTreeState] = useState(() => getTreeState ? getTreeState(studentId) : { stage: 'seed', leaves: 0, streak: 0 });

  useEffect(() => {
    setProgress(getCourseProgress(studentId, course?.id) || { completedLessons: 0, completedList: [] });
  }, [course, studentId, getCourseProgress]);

  useEffect(() => {
    if (getTreeState && studentId) {
      setTreeState(getTreeState(studentId));
    }
  }, [studentsDatabase, studentId, getTreeState, user]);

  if (!course) return null;

  const handleMarkComplete = (lessonId, lessonTitle) => {
    const existingList = progress?.completedList || [];
    if (existingList.includes(lessonId)) {
      Alert.alert('تنبيه', 'هذا الدرس مُحدد كمكتمل بالفعل.');
      return;
    }

    const updatedList = [lessonId, ...existingList];
    setCourseProgress(studentId, course.id, updatedList);
    setProgress({ completedLessons: updatedList.length, completedList: updatedList, updatedAt: new Date().toISOString() });
    
    try {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const currentTree = getTreeState ? getTreeState(studentId) : null;
      const practicedToday = currentTree && currentTree.lastPracticeDate === todayKey;
      if (!practicedToday && typeof recordDailyPractice === 'function') {
        recordDailyPractice(studentId, Date.now());
        if (getTreeState) setTreeState(getTreeState(studentId));
      }
    } catch (e) { /* ignore */ }
    
    setWheelVisible(true);
  };

  const doSpin = async () => {
    if (!studentId) return;
    setIsSpinning(true);
    setSpinResult(null);

    const { index, picked } = typeof chooseRewardIndex === 'function' ? chooseRewardIndex() : { index: -1, picked: null };
    const segments = 12; 
    const segCount = (typeof index === 'number' && index >= 0) ? Math.max(1, rewardDefinitions?.length || segments) : (rewardDefinitions?.length || segments);
    const segmentAngle = 360 / segCount;

    const targetIndex = (typeof index === 'number' && index >= 0) ? index : Math.floor(Math.random() * segCount);

    const spins = 6 + Math.floor(Math.random() * 4); 
    const targetAngle = spins * 360 + (segCount - targetIndex - 1) * segmentAngle + (segmentAngle / 2);

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

      if (picked) {
        if (typeof grantRewardToStudent === 'function') {
          grantRewardToStudent(studentId, picked);
        }
        setSpinResult(picked);
      } else {
        const fallback = spinRewardWheel(studentId);
        setSpinResult(fallback);
      }
    } catch (e) {
      console.warn('Spin failed', e);
    } finally {
      setIsSpinning(false);
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

  // بناء بيانات العجلة من تعريف الجوائز ليعرض قيم النقاط مباشرة
  const wheelColors = ['#FDE047','#FB923C','#F87171','#60A5FA','#34D399','#818CF8','#FACC15','#FB7185','#38BDF8','#4ADE80','#A78BFA','#2DD4BF'];
  const wheelData = (rewardDefinitions && rewardDefinitions.length > 0) ? rewardDefinitions.map((r, i) => {
    const isPoints = r.type === 'points';
    const amount = Number(r.amount || 0);
    const text = isPoints && amount > 0 ? `${amount}نقط` : (r.label || (r.type === 'badge' ? 'وسام' : r.label || r.id));
    // pick a color from palette
    const color = wheelColors[i % wheelColors.length];
    // choose text color for contrast (dark on light colors)
    const textColor = '#111827';
    return { color, text, textColor, reward: r };
  }) : [
    { color: '#FDE047', text: '5نقط', textColor: '#111827' },
    { color: '#FB923C', text: '10نقط', textColor: '#111827' },
    { color: '#F87171', text: '15نقط', textColor: '#111827' },
    { color: '#60A5FA', text: '20نقط', textColor: '#0F172A' },
    { color: '#34D399', text: '25نقط', textColor: '#0F172A' },
    { color: '#818CF8', text: '50نقط', textColor: '#0F172A' }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>✖ إغلاق</Text></TouchableOpacity>
        <Text style={styles.title}>محتوى الكورس: {course.title}</Text>
      </View>

      <View style={{ padding: 12, alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E6E6E6' }}>
        <Text style={{ fontWeight: '900', color: '#0F382C' }}>شجرة الحفظ 🌳</Text>
        {treeState ? (
          (() => {
            const mapping = { seed: '🌱', sprout: '🌿', sapling: '🌳', young: '🌲', mature: '🌳' };
            const emoji = mapping[treeState.stage] || '🌱';
            return (
              <Text style={{ color: '#475569', marginTop: 6 }}>
                {emoji} حالة: {treeState.stage} — أوراق: {treeState.leaves} — متتالية: {treeState.streak} يوم
              </Text>
            );
          })()
        ) : (
          <Text style={{ color: '#94A3B8', marginTop: 6 }}>لم يبدأ حفظك بعد — لننطلق اليوم!</Text>
        )}
      </View>

      <ScrollView style={styles.body}>
        {course.curriculum && course.curriculum.length > 0 ? (
          course.curriculum.map((unit, idx) => (
            <View key={unit.id || idx} style={styles.unitBox}>
              <Text style={styles.unitTitle}>{unit.title}</Text>
              {(unit.lessons || []).map((lesson, j) => {
                 const lessonId = `${course.id}::${unit.id || idx}::${j}`;
                 return (
                   <View key={j} style={styles.lessonRow}>
                     <Text style={styles.lessonText}>• {lesson}</Text>
                     {isCompleted(lessonId) ? (
                       <View style={[styles.openBtn, { backgroundColor: '#6EE7B7' }]}>
                         <Text style={[styles.openBtnText, { color: '#0F382C' }]}>مكتمل</Text>
                       </View>
                     ) : (
                       <TouchableOpacity style={styles.openBtn} onPress={() => handleMarkComplete(lessonId, lesson)}>
                         <Text style={styles.openBtnText}>أكمل الدرس</Text>
                       </TouchableOpacity>
                     )}
                   </View>
                 );
               })}
            </View>
          ))
        ) : (
          <View style={{ padding: 16 }}>
            <Text style={{ color: '#64748B' }}>لا يوجد محتوى منشور بعد لهذا الكورس.</Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* مودال عجلة المكافآت */}
      <Modal visible={wheelVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '92%', backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', elevation: 6 }}>
            <Text style={{ fontWeight: '900', fontSize: 20, marginBottom: 4, color: '#0F382C' }}>عجلة المكافآت 🎡</Text>
            <Text style={{ color: '#334155', marginBottom: 16, textAlign: 'center', fontSize: 13 }}>أتممت الدرس بنجاح! دوّر العجلة لاختيار نقاطك.</Text>

            <View style={{ height: 280, width: 280, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              {/* المؤشر العلوي */}
              <View style={{ position: 'absolute', top: -14, zIndex: 30, alignItems: 'center' }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EF4444', borderWidth: 3, borderColor: '#fff', elevation: 8 }} />
                <View style={{ width: 6, height: 24, backgroundColor: '#EF4444', borderRadius: 3, marginTop: -4 }} />
              </View>

              {/* العجلة والقطاعات والنقاط */}
              <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg','360deg'] }) }] }}>
                <View style={{ width: 260, height: 260, borderRadius: 130, borderWidth: 6, borderColor: '#1E293B', backgroundColor: '#FFF', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                  
                  {/* القطاعات الملونة والنقاط الموزعة */}
                  {wheelData.map((item, index) => {
                    const angle = index * (360 / (wheelData.length || 12)); 
                    return (
                      <View 
                        key={index} 
                        style={{
                          position: 'absolute',
                          width: 260,
                          height: 260,
                          borderRadius: 130,
                          backgroundColor: 'transparent',
                          borderTopColor: item.color,
                          borderTopWidth: 130,
                          borderRightColor: 'transparent',
                          borderRightWidth: 130,
                          transform: [{ rotate: `${angle}deg` }],
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ 
                          position: 'absolute', 
                          top: -72, 
                          // counter-rotate so text remains horizontal on the face
                          transform: [{ rotate: `${-angle}deg` }],
                          fontWeight: '900', 
                          fontSize: 15, 
                          color: '#000',
                          textAlign: 'center',
                        }}>
                          {item.text}
                        </Text>
                      </View>
                    );
                  })}

                  {/* أرقام على كل قطاع */}
                  {/* الأرقام القديمة أزيلت، الآن نعرض نص الجائزة مباشرة على كل قطاع */}

                  {/* الأوتاد الصفراء */}
                  {wheelData.map((_, index) => {
                    const angle = index * 30 + 15;
                    return (
                      <View 
                        key={`peg-${index}`} 
                        style={{
                          position: 'absolute',
                          width: 260,
                          height: 260,
                          transform: [{ rotate: `${angle}deg` }],
                          alignItems: 'center',
                        }}
                      >
                        <View style={{ width: 8, height: 14, backgroundColor: '#FACC15', borderRadius: 3, borderWidth: 1, borderColor: '#CA8A04', position: 'absolute', top: 2, elevation: 3 }} />
                      </View>
                    );
                  })}

                  {/* الدائرة المركزية */}
                  <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#EF4444', borderWidth: 3, borderColor: '#FFFFFF', zIndex: 10, justifyContent: 'center', alignItems: 'center', elevation: 5 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#EF4444' }} />
                  </View>

                </View>
              </Animated.View>
            </View>

            {spinResult ? (
              <View style={{ alignItems: 'center', marginBottom: 14, backgroundColor: '#F0FDF4', padding: 12, borderRadius: 10, width: '100%', borderWidth: 1, borderColor: '#86EFAC' }}>
                <Text style={{ fontWeight: '900', fontSize: 18, color: '#166534' }}>🎉 {spinResult.label || spinResult}</Text>
                <Text style={{ color: '#15803D', marginTop: 4, fontSize: 13 }}>تمت إضافة النقاط لحسابك بنجاح!</Text>
              </View>
            ) : null}

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
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 2, borderBottomColor: '#0F382C', backgroundColor: '#0F382C' },
  back: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  title: { fontWeight: '900', color: '#FFFFFF', fontSize: 16 },
  body: { padding: 16 },
  unitBox: { backgroundColor: '#FFFFFF', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 2, borderColor: '#0F382C' },
  unitTitle: { fontWeight: '900', marginBottom: 10, color: '#0F382C', fontSize: 15 },
  lessonRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lessonText: { color: '#0F382C', flex: 1, marginRight: 8, fontSize: 14 },
  openBtn: { backgroundColor: '#0F382C', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  openBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  actionBtn: { width: '100%', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  actionBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 }
});