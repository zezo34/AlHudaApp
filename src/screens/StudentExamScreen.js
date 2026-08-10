import React, { useState, useContext } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Alert, 
  SafeAreaView, 
  StatusBar, 
  Platform 
} from 'react-native';
import { CourseContext } from '../context/CourseContext';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function StudentExamScreen({ onBack, user }) {
  const { exams = [], submitExamResult } = useContext(CourseContext);
  // لو الواجهة اتنفتحت من غير user prop (زي ما بيحصل في شاشة تفاصيل الكورس)،
  // ناخد الطالب من AuthContext عشان الإجابة توصل الأدمن باسم الطالب وكوده
  const { user: contextUser } = useContext(AuthContext) || {};
  const activeUser = user || contextUser;
  const [answers, setAnswers] = useState({});

  const handleSendAnswer = (exam) => {
    const studentAnswer = answers[exam.id];
    if (!studentAnswer || !studentAnswer.trim()) {
      Alert.alert("تنبيه 💡", "يرجى كتابة الإجابة قبل الإرسال!");
      return;
    }

    if (submitExamResult) {
      submitExamResult({
        examTitle: exam.title,
        question: exam.question,
        examId: exam.id,
        questionId: exam.id,
        studentId: activeUser?.studentId || activeUser?.id || null,
        studentName: activeUser?.studentName || activeUser?.name || 'الطالب',
        answer: studentAnswer,
        date: new Date().toLocaleDateString('ar-EG'),
        status: 'تم التسليم 🟢',
        isWeekly: Boolean(exam.isWeekly)
      });
    }

    Alert.alert("عاش يا بطل! 🎉", "تم إرسال إجابتك بنجاح ووصلت لولي أمرك!");
    setAnswers({ ...answers, [exam.id]: '' });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* هيدر مظبوط تحسباً للنوتش والشريط العلوي */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📝 الاختبارات والواجبات المتاحة</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#FFF8E1" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {exams.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="school-outline" size={60} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>لا توجد اختبارات حالياً</Text>
            <Text style={styles.emptySubText}>
              أنت متفوق جداً! لم ينشر المعلم أي اختبار جديد بعد 🎈
            </Text>
          </View>
        ) : (
          exams.map((exam) => (
            <View key={exam.id} style={styles.examCard}>
              <View style={styles.examCardHeader}>
                <Ionicons name="book-outline" size={20} color="#0F382C" />
                <Text style={styles.examTitle}>{exam.title}</Text>
                <View style={[styles.examTypeBadge, exam.isWeekly ? styles.examTypeBadgeWeekly : styles.examTypeBadgeRegular]}>
                  <Text style={[styles.examTypeBadgeText, exam.isWeekly ? styles.examTypeBadgeWeeklyText : styles.examTypeBadgeRegularText]}>
                    {exam.isWeekly ? '📅 سؤال الأسبوع' : '📝 اختبار عادي'}
                  </Text>
                </View>
              </View>

              <Text style={styles.questionText}>❓ السؤال: {exam.question}</Text>

              <TextInput
                style={styles.input}
                placeholder="اكتب إجابتك الرائعة هنا..."
                multiline
                value={answers[exam.id] || ''}
                onChangeText={(text) => setAnswers({ ...answers, [exam.id]: text })}
              />

              <TouchableOpacity 
                style={styles.sendBtn} 
                onPress={() => handleSendAnswer(exam)}
              >
                <Ionicons name="paper-plane-outline" size={18} color="#D4AF37" />
                <Text style={styles.sendBtnText}> إرسال الإجابة الآن 🚀</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F8FF' },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 20) + 12 : 15,
    backgroundColor: '#0F382C',
    borderBottomWidth: 2,
    borderBottomColor: '#D4AF37',
  },
  headerTitle: { color: '#FFF8E1', fontSize: 18, fontWeight: '900' },
  backBtn: { padding: 4 },
  content: { padding: 16 },
  emptyBox: { 
    backgroundColor: '#FFFFFF',
    padding: 30, 
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 40,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#0F382C', marginTop: 12 },
  emptySubText: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  examCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
    elevation: 3,
  },
  examCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8 },
  examTitle: { fontSize: 16, fontWeight: '900', color: '#0F382C', marginRight: 8, flex: 1, textAlign: 'right' },
  examTypeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 1.5, marginRight: 6 },
  examTypeBadgeRegular: { backgroundColor: '#E0F2FE', borderColor: '#0284C7' },
  examTypeBadgeRegularText: { color: '#0369A1', fontSize: 11, fontWeight: '900' },
  examTypeBadgeWeekly: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  examTypeBadgeWeeklyText: { color: '#B45309', fontSize: 11, fontWeight: '900' },
  questionText: { fontSize: 14, color: '#334155', marginVertical: 8, textAlign: 'right', fontWeight: '700' },
  input: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    backgroundColor: '#F8FAFC',
    textAlign: 'right',
    minHeight: 80,
    marginBottom: 12,
  },
  sendBtn: {
    backgroundColor: '#0F382C',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: { color: '#D4AF37', fontWeight: '900', fontSize: 14 },
});