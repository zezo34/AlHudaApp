// screens/AdminDashboardScreen.js
import React, { useState, useContext, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  SafeAreaView, 
  Alert, 
  FlatList, 
  ScrollView, 
  ImageBackground, 
  Switch 
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { CourseContext } from '../context/CourseContext';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import InternalPdfViewerModal from '../components/InternalPdfViewerModal';
import * as Clipboard from 'expo-clipboard';

const COURSE_CATEGORIES = ['القرآن الكريم', 'اللغة العربية', 'الدراسات الإسلامية'];

// ==========================================
// 🟢 مكون كارت الطالب (إدارة النجوم والتقارير)
// ==========================================
const StudentCardItem = ({ st, isGirl, onDeleteReport, onAddReport, onAddStars, onCancelSubscription, onDeleteStudent }) => {
  const [isAddingReport, setIsAddingReport] = useState(false);
  const [reportText, setReportText] = useState('');

  const studentEmoji = isGirl ? '👧' : '👦';
  const reportsList = st?.reports || [];
  const studentStars = st?.stars || 0;

  const handleSave = () => {
    if (!reportText.trim()) {
      Alert.alert("تنبيه 💡", "يرجى كتابة التقرير أولاً!");
      return;
    }
    onAddReport(st.id || st.studentId, reportText);
    setReportText('');
    setIsAddingReport(false);
  };

  return (
    <View style={[styles.cardForm, isGirl && styles.girlStudentCard]}>
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.studentNameText, isGirl && styles.girlStudentName]}>
          {studentEmoji} {st.name}
        </Text>
        <View style={[styles.idBadge, isGirl && styles.girlIdBadge]}>
          <Text style={[styles.idBadgeText, isGirl && styles.girlIdBadgeText]}>🔑 {st.studentId || st.id}</Text>
        </View>
      </View>

      {/* ⭐ شريط عرض وإدارة النجوم */}
      <View style={styles.starsAdminBox}>
        <Text style={styles.starsCountText}>⭐ رصيد النجوم: {studentStars}</Text>
        <View style={styles.starsActionBtns}>
          <TouchableOpacity 
            style={styles.addStarBtn} 
            onPress={() => onAddStars(st.id || st.studentId, 5)}
          >
            <Text style={styles.starBtnText}>+5 ⭐</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.removeStarBtn} 
            onPress={() => onAddStars(st.id || st.studentId, -5)}
          >
            <Text style={styles.removeStarBtnText}>-5 ⭐</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* اشتراك وإعدادات تجديد */}
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontWeight: '900', color: '#1E293B', fontSize: 12 }}>
            حالة الاشتراك: {st.isSubscribed ? 'مشترك ✅' : 'غير مشترك ❌'}
          </Text>
          <Text style={{ color: '#64748B', fontSize: 11 }}>
            انتهاء: {st.subscriptionExpiry ? new Date(st.subscriptionExpiry).toLocaleDateString('ar-EG') : '—'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
          <TouchableOpacity style={styles.cancelSubBtn} onPress={() => onCancelSubscription?.(st.id || st.studentId)}>
            <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 12 }}>إلغاء الاشتراك</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.deleteStudentBtn]} onPress={() => {
            Alert.alert('حذف حساب الطالب 🗑️', 'هل أنت متأكد من حذف حساب هذا الطالب نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.', [
              { text: 'إلغاء', style: 'cancel' },
              { text: 'نعم، احذف', style: 'destructive', onPress: () => {
                try {
                  const res = onDeleteStudent ? onDeleteStudent(st.id || st.studentId) : null;
                  Alert.alert('تم', (res && res.message) ? res.message : 'تم حذف الحساب.');
                } catch (e) {
                  console.warn('delete student failed', e);
                  Alert.alert('خطأ', 'تعذر حذف الحساب.');
                }
              } }
            ]);
          }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>حذف الطالب 🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.reportsSectionTitle}>📋 التقارير والنشاطات:</Text>

      {reportsList.length === 0 ? (
        <Text style={styles.noReportsText}>لا توجد تقارير حالياً 📝</Text>
      ) : (
        reportsList.map((rep, index) => (
          <View key={rep.id || index.toString()} style={styles.reportRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reportText}>• {rep.text}</Text>
              {rep.date && <Text style={styles.reportDate}>{rep.date}</Text>}
            </View>
            <TouchableOpacity onPress={() => onDeleteReport(st.id || st.studentId, rep.id)}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))
      )}

      {isAddingReport ? (
        <View style={{ marginTop: 8 }}>
          <TextInput
            style={styles.input}
            placeholder="اكتب التقرير الجديد هنا..."
            placeholderTextColor="#64748B"
            value={reportText}
            onChangeText={setReportText}
          />
          <View style={styles.bulkActionRow}>
            <TouchableOpacity style={styles.addBtn} onPress={handleSave}>
              <Text style={styles.addBtnText}>إضافة التقرير ✨</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setIsAddingReport(false); setReportText(''); }}>
              <Text style={styles.cancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.openAddReportBtn} onPress={() => setIsAddingReport(true)}>
          <Ionicons name="add-circle-outline" size={18} color={isGirl ? "#DB2777" : "#0F382C"} />
          <Text style={[styles.openAddReportText, isGirl && { color: '#DB2777' }]}>إضافة تقرير جديد</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ==========================================
// 🟢 المكون الرئيسي: لوحة المعلم / الأدمن
// ==========================================
export default function AdminDashboardScreen({ onBack }) {
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [pdfViewerUri, setPdfViewerUri] = useState(null);
  const [pdfViewerHtml, setPdfViewerHtml] = useState(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState(null);

  const openPdfInViewer = (item) => {
    if (!item) return;
    setPdfViewerTitle(item.title || item.pdfName || 'ملف PDF');
    setPdfViewerUri(item.pdfUri || null);
    setPdfViewerHtml(item.htmlContent || null);
    setPdfViewerVisible(true);
  };

  const closePdfViewer = () => {
    setPdfViewerVisible(false);
    setPdfViewerUri(null);
    setPdfViewerHtml(null);
    setPdfViewerTitle(null);
  };

  const { 
    courses = [], 
    addCourse, 
    deleteCourse, 
    addCourseModule,
    deleteCourseModule,
    addCourseLesson,
    deleteCourseLesson,
    addExam, 
    weeklyQuestion: activeWeeklyQuestion = null, 
    createWeeklyQuestion: addWeeklyQuestion,    
    deleteWeeklyQuestion: removeWeeklyQuestion, 
    examResults = [],
    gradeExamAnswer,
    setCourses,
    enrollCourse,
  } = useContext(CourseContext) || {};
  
  const { 
    logout, 
    studentsDatabase = [], 
    addStudent, 
    addStudentReport, 
    deleteStudentReport,
    addStarsToStudent,
    leaveRequests = [], 
    updateLeaveStatus,
    setSubscriptionPrice,
    cancelSubscriptionForStudent,
    subscriptionData,
    updateSubscriptionData,
    // new APIs
    deleteStudent,
    paymentRequests = [],
    approvePaymentRequest,
    rejectPaymentRequest
  } = useContext(AuthContext) || {};

  const [activeTab, setActiveTab] = useState('courses'); 
  const [gradingFeedbacks, setGradingFeedbacks] = useState({});
  const [hiddenLeaveIds, setHiddenLeaveIds] = useState([]);
  const [hiddenExamResultIds, setHiddenExamResultIds] = useState([]);

  // حالات الاشتراك
  const [subTitle, setSubTitle] = useState('الاشتراك الشهري الشامل');
  const [subPrice, setSubPrice] = useState('199');
  const [subDesc, setSubDesc] = useState('احصل على وصول غير محدود لكافة الكورسات والغرف الصوتية باشتراك واحد.');
  const [isSubActive, setIsSubActive] = useState(true);

  useEffect(() => {
    const s = subscriptionData || {};
    if (s) {
      if (s.title !== undefined) setSubTitle(s.title);
      if (s.price !== undefined) setSubPrice(s.price.toString());
      if (s.description !== undefined) setSubDesc(s.description || s.desc || '');
      if (s.isSubActive !== undefined) setIsSubActive(Boolean(s.isSubActive));
      else if (s.active !== undefined) setIsSubActive(Boolean(s.active));
    }
  }, [subscriptionData]);

  // حالات الكورسات والاختبارات والطلاب
  const [newTitle, setNewTitle] = useState('');
  const [newInstructor, setNewInstructor] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCourseCategory, setNewCourseCategory] = useState(COURSE_CATEGORIES[0]);

  const [examTitle, setExamTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [examStars, setExamStars] = useState('15'); 
  const [questionType, setQuestionType] = useState('essay');
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [isWeeklyQuestion, setIsWeeklyQuestion] = useState(false); 

  const [studentName, setStudentName] = useState('');
  const [customStudentId, setCustomStudentId] = useState('');
  const [gender, setGender] = useState('boy');
  const [initialReport, setInitialReport] = useState('');

  const [expandedCourseId, setExpandedCourseId] = useState(null);
  const [newModuleTitleByCourse, setNewModuleTitleByCourse] = useState({});
  const [newModuleLessonsByCourse, setNewModuleLessonsByCourse] = useState({});
  const [newLessonTextByCourse, setNewLessonTextByCourse] = useState({});
  const [newLessonPdfByCourseModule, setNewLessonPdfByCourseModule] = useState({});

  const isGirlStudent = (student) => {
    if (student?.gender === 'girl') return true;
    if (student?.gender === 'boy') return false;
    const name = (student?.name || '').trim().toLowerCase();
    const girlKeywords = ['بنت', 'مريم', 'فاطمة', 'عائشة', 'فريدة', 'هنا', 'سارة', 'نور', 'منة', 'آية', 'سلمى'];
    return girlKeywords.some(keyword => name.includes(keyword));
  };

  const handleSaveSubscription = () => {
    if (!subTitle.trim() || !subPrice.trim()) {
      Alert.alert("تنبيه 💡", "يرجى كتابة اسم الاشتراك والسعر بشكل صحيح!");
      return;
    }

    if (typeof updateSubscriptionData === 'function') {
      updateSubscriptionData({
        title: subTitle.trim(),
        price: String(subPrice).trim(),
        description: subDesc.trim(),
        isSubActive: isSubActive
      });
    }

    if (typeof setSubscriptionPrice === 'function') {
      setSubscriptionPrice(subPrice.trim());
    }

    Alert.alert("تم الحفظ بنجاح 🎉", `تم تحديث الاشتراك بنجاح! (${isSubActive ? 'مُفعل 🟢' : 'مغلق 🔴'})`);
  };

  const handleToggleSubSwitch = (value) => {
    setIsSubActive(value);
    if (typeof updateSubscriptionData === 'function') {
      updateSubscriptionData({
        isSubActive: Boolean(value),
        title: subTitle,
        price: subPrice,
        description: subDesc
      });
    }
  };

  const handleAddCourse = () => {
    if (!newTitle.trim() || !newInstructor.trim() || !newPrice.trim()) {
      Alert.alert("تنبيه 💡", "يرجى ملء جميع الحقول الخاصة بالدورة!");
      return;
    }
    if (addCourse) {
      addCourse({ title: newTitle, instructor: newInstructor, price: newPrice, category: newCourseCategory || 'عام' });
      setNewTitle('');
      setNewInstructor('');
      setNewPrice('');
      setNewCourseCategory(COURSE_CATEGORIES[0]);
      Alert.alert("نجاح ✨", "تمت إضافة الدورة التدريبية بنجاح!");
    }
  };

  const handleDeleteCourse = (id) => {
    Alert.alert("حذف الدورة 🗑️", "هل أنت تأكد من رغبتك في حذف هذه الدورة؟", [
      { text: "إلغاء ❌", style: "cancel" },
      { text: "تأكيد الحذف 🗑️", style: "destructive", onPress: () => deleteCourse && deleteCourse(id) }
    ]);
  };

  const handleAddStudent = () => {
    if (!studentName.trim()) {
      Alert.alert("تنبيه 💡", "يرجى إدخال اسم الطالب!");
      return;
    }
    if (addStudent) {
      addStudent({
        name: studentName,
        studentId: customStudentId.trim() || `STU-${Math.floor(100 + Math.random() * 900)}`,
        gender,
        initialReport: initialReport.trim() ? initialReport : null
      });
      setStudentName('');
      setCustomStudentId('');
      setInitialReport('');
      Alert.alert("تم الإضافة 🔑", "تم إنشاء حساب الطالب بنجاح!");
    }
  };

  const handleAddModule = (courseId) => {
    const title = newModuleTitleByCourse[courseId]?.trim();
    const lessonsRaw = newModuleLessonsByCourse[courseId] || '';
    if (!title) {
      Alert.alert('تنبيه 💡', 'يرجى كتابة عنوان الوحدة أولاً!');
      return;
    }
    const lessons = lessonsRaw.split('\n').map(line => line.trim()).filter(Boolean);
    if (lessons.length === 0) {
      Alert.alert('تنبيه 💡', 'يرجى كتابة درس واحد على الأقل في الوحدة.');
      return;
    }
    if (typeof addCourseModule === 'function') {
      addCourseModule(courseId, title, lessons);
      setNewModuleTitleByCourse(prev => ({ ...prev, [courseId]: '' }));
      setNewModuleLessonsByCourse(prev => ({ ...prev, [courseId]: '' }));
      Alert.alert('تمت الإضافة ✅', 'تمت إضافة وحدة جديدة إلى الدورة بنجاح.');
    }
  };

  const handleDeleteModule = (courseId, moduleId) => {
    Alert.alert('حذف الوحدة 🗑️', 'هل أنت متأكد من حذف هذه الوحدة وكل دروسها؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: 'destructive', onPress: () => deleteCourseModule?.(courseId, moduleId) }
    ]);
  };

  const handlePickPdf = async (courseId, moduleId) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const key = `${courseId}_${moduleId}`;
        setNewLessonPdfByCourseModule(prev => ({ ...prev, [key]: { uri: file.uri, name: file.name } }));
      }
    } catch (error) {
      console.warn('DocumentPicker error', error);
      Alert.alert('خطأ', 'تعذّر اختيار ملف PDF. حاول مرة أخرى.');
    }
  };

  const handleAttachPdf = async (courseId, moduleId, lessonIndex) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        if (typeof setCourses === 'function') {
          setCourses(prev => prev.map(c => {
            if (c.id !== courseId) return c;
            return {
              ...c,
              curriculum: (c.curriculum || []).map(unit => {
                if (unit.id !== moduleId) return unit;
                const updatedLessons = (unit.lessons || []).map((lesson, idx) => {
                  if (idx !== lessonIndex) return lesson;
                  const oldTitle = typeof lesson === 'string' ? lesson : (lesson.title || lesson.pdfName || 'درس بدون عنوان');
                  const newLesson = typeof lesson === 'string' ? { title: oldTitle } : { ...lesson };
                  newLesson.pdfUri = file.uri;
                  newLesson.pdfName = file.name;
                  return newLesson;
                });
                return { ...unit, lessons: updatedLessons };
              })
            };
          }));

          Alert.alert('تم الإرفاق ✅', `تم إرفاق الملف: ${file.name} بالدرس.`);
        }
      }
    } catch (error) {
      console.warn('Attach PDF error', error);
      Alert.alert('خطأ', 'تعذّر إرفاق ملف PDF.');
    }
  };

  const handleRemovePdf = (courseId, moduleId, lessonIndex) => {
    Alert.alert('حذف ملف PDF', 'هل أنت متأكد من إزالة ملف الـ PDF من هذا الدرس؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => {
        if (typeof setCourses === 'function') {
          setCourses(prev => prev.map(c => {
            if (c.id !== courseId) return c;
            return {
              ...c,
              curriculum: (c.curriculum || []).map(unit => {
                if (unit.id !== moduleId) return unit;
                const updatedLessons = (unit.lessons || []).map((lesson, idx) => {
                  if (idx !== lessonIndex) return lesson;
                  if (typeof lesson === 'string') return lesson;
                  const newLesson = { ...lesson };
                  delete newLesson.pdfUri;
                  delete newLesson.pdfName;
                  return newLesson;
                });
                return { ...unit, lessons: updatedLessons };
              })
            };
          }));
          Alert.alert('تم الحذف ✅', 'تمت إزالة ملف الـ PDF من الدرس.');
        }
      } }
    ]);
  };

  const handleAddLesson = (courseId, moduleId) => {
    const key = `${courseId}_${moduleId}`;
    const lessonText = newLessonTextByCourse[key]?.trim();
    const selectedPdf = newLessonPdfByCourseModule[key];

    if (!lessonText && !selectedPdf) {
      Alert.alert('تنبيه 💡', 'يرجى كتابة نص الدرس أو اختيار ملف PDF أولاً!');
      return;
    }

    const lessonPayload = selectedPdf
      ? {
          id: `lesson_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          title: lessonText || selectedPdf.name,
          pdfUri: selectedPdf.uri,
          pdfName: selectedPdf.name
        }
      : lessonText;

    if (typeof addCourseLesson === 'function') {
      addCourseLesson(courseId, moduleId, lessonPayload);
      setNewLessonTextByCourse(prev => ({ ...prev, [key]: '' }));
      setNewLessonPdfByCourseModule(prev => ({ ...prev, [key]: null }));
      Alert.alert('نجاح ✅', 'تمت إضافة الدرس بنجاح إلى الوحدة.');
    }
  };

  const handleDeleteLesson = (courseId, moduleId, lessonIndex) => {
    Alert.alert('حذف الدرس 🗑️', 'هل أنت متأكد من حذف هذا الدرس؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: 'destructive', onPress: () => deleteCourseLesson?.(courseId, moduleId, lessonIndex) }
    ]);
  };

  const getPaymentStatusLabel = (status) => {
    if (!status) return 'قيد المراجعة ⏳';
    if (status === 'pending' || status === 'قيد المراجعة ⏳') return 'قيد المراجعة ⏳';
    if (status === 'accepted' || status === 'مقبولة ✅') return 'مقبولة ✅';
    if (status === 'rejected' || (typeof status === 'string' && status.startsWith('مرفوضة'))) return 'مرفوضة ❌';
    return status;
  };

  const handleAddStars = (studentId, amount) => {
    addStarsToStudent?.(studentId, amount);
  };

  const handleAddReport = (studentId, text) => {
    addStudentReport?.(studentId, text);
  };

  const handleDeleteReport = (studentId, reportId) => {
    deleteStudentReport?.(studentId, reportId);
  };

  const handleAddExam = () => {
    if (!examTitle.trim() || !question.trim()) {
      Alert.alert("تنبيه 💡", "يرجى كتابة العنوان والسؤال بشكل كامل!");
      return;
    }
    const stars = Number(examStars) || 15;
    if (questionType === 'mcq') {
      const optionValues = mcqOptions.map(opt => opt.trim());
      const filledOptions = optionValues.filter(Boolean);
      if (filledOptions.length < 2) {
        Alert.alert("تنبيه 💡", "يرجى كتابة خيارين على الأقل للسؤال متعدد الاختيارات.");
        return;
      }
      if (!optionValues[correctOptionIndex]) {
        Alert.alert("تنبيه 💡", "يرجى تحديد الخيار الصحيح من بين خيارات الاختيار المتعدد.");
        return;
      }
    }

    const payload = {
      title: examTitle,
      question,
      stars,
      type: questionType,
      options: questionType === 'mcq' ? mcqOptions.map(opt => opt.trim()) : null,
      correctOptionIndex: questionType === 'mcq' ? correctOptionIndex : null
    };

    if (isWeeklyQuestion) {
      if (addWeeklyQuestion) {
        addWeeklyQuestion({ ...payload, rewardStars: stars });
        Alert.alert("تم نشر التحدي 📅⭐", "تم نشر السؤال الأسبوعي بنجاح!");
      }
    } else {
      if (addExam) {
        addExam(payload);
        Alert.alert("تم نشر الاختبار 📝⭐", "تم نشر الاختبار بنجاح!");
      }
    }

    setExamTitle('');
    setQuestion('');
    setQuestionType('essay');
    setMcqOptions(['', '', '', '']);
    setCorrectOptionIndex(0);
  };

  const handleDeleteWeeklyQuestion = () => {
    Alert.alert("مسح السؤال الأسبوعي 🗑️", "هل أنت متاكد من حذف سؤال الأسبوع النشط؟", [
      { text: "تراجع ❌", style: "cancel" },
      { text: "مسح النهائي 🗑️", style: "destructive", onPress: () => removeWeeklyQuestion?.() }
    ]);
  };

  const handleGradeAnswer = (res, gradeStatus) => {
    try {
      const resId = res?.id || res?.submissionId;
      if (!resId) {
        Alert.alert("تنبيه ⚠️", "لم يتم العثور على معرف الإجابة!");
        return;
      }

      const currentStatus = res?.status || '';
      if (currentStatus && !currentStatus.includes('قيد المراجعة')) {
        Alert.alert('تنبيه ⚠️', 'تمت مراجعة هذه الإجابة مسبقاً ولا يمكن تعديلها مرة أخرى.');
        return;
      }

      const studentName = res?.studentName || '';
      const targetStudentId = res?.studentId || res?.userId || res?.id;
      const starsAmount = Number(res?.stars || res?.rewardStars) || 15;
      const feedbackMsg = gradingFeedbacks[resId] || '';

      if (gradeStatus === 'correct') {
        let targetStudent = Array.isArray(studentsDatabase) ? studentsDatabase.find(
          (s) => (s?.id && targetStudentId && s.id.toString() === targetStudentId.toString()) ||
                 (s?.studentId && targetStudentId && s.studentId.toString() === targetStudentId.toString())
        ) : null;

        if (!targetStudent && studentName) {
          const cleanTargetName = studentName.trim().toLowerCase();
          targetStudent = studentsDatabase.find(
            (s) => s?.name && s.name.trim().toLowerCase().includes(cleanTargetName)
          );
        }

        if (typeof addStarsToStudent === 'function') {
          const finalIdToUse = targetStudent?.id || targetStudent?.studentId || targetStudentId;
          addStarsToStudent(finalIdToUse, starsAmount);
        }

        if (typeof gradeExamAnswer === 'function') {
          gradeExamAnswer(resId, 'صحيحة ✅', 'أحسنت إجابة ممتازة! ⭐');
        }

        setHiddenExamResultIds(prev => [...prev, resId]);
        Alert.alert("تم التقييم بنجاح! ⭐🎉", `تم قبول الإجابة ومنح الطالب +${starsAmount} نجوم.`);
      } 
      else if (gradeStatus === 'wrong') {
        if (!feedbackMsg.trim()) {
          Alert.alert("تنبيه 💡", "يرجى كتابة سبب الخطأ في الخانة المخصصة قبل اعتماد التقييم!");
          return;
        }
        if (typeof gradeExamAnswer === 'function') {
          gradeExamAnswer(resId, 'مخالفة / خاطئة ❌', feedbackMsg);
        }

        setHiddenExamResultIds(prev => [...prev, resId]);
        Alert.alert("تم تسجيل الملاحظة 📝", `تم إرسال توجيه المعلم: "${feedbackMsg}"`);
      }
    } catch (error) {
      console.error("Grade Answer Error:", error);
      Alert.alert("تنبيه ⚠️", "حدث خطأ غير متوقع أثناء تقييم الإجابة.");
    }
  };

  const handleUpdateLeave = (leave, status) => {
    if (updateLeaveStatus) {
      updateLeaveStatus(leave.id, status);
      Alert.alert("تم التحديث 🌴", `تم تغيير حالة طلب الإجازة إلى: ${status}`);
    }
  };

  const handleApproveAllPending = () => {
    const pending = leaveRequests.filter(l => !l.status || l.status.includes('قيد المراجعة'));
    if (pending.length === 0) return Alert.alert("تنبيه 💡", "لا توجد طلبات إجازة معلقة لقبولها!");
    pending.forEach(l => updateLeaveStatus?.(l.id, 'مقبولة ✅'));
    Alert.alert("تم القبول الجماعي 🌴", `تم قبول ${pending.length} طلب إجازة بنجاح!`);
  };

  const handleRejectAllPending = () => {
    const pending = leaveRequests.filter(l => !l.status || l.status.includes('قيد المراجعة'));
    if (pending.length === 0) return Alert.alert("تنبيه 💡", "لا توجد طلبات إجازة معلقة لرفضها!");
    pending.forEach(l => updateLeaveStatus?.(l.id, 'مرفوضة ❌'));
    Alert.alert("تم الرفض الجماعي ❌", `تم رفض ${pending.length} طلب إجازة معلق.`);
  };

  const filteredLeaveRequests = useMemo(() => {
    return leaveRequests.filter(l => !hiddenLeaveIds.includes(l.id));
  }, [leaveRequests, hiddenLeaveIds]);

  const filteredExamResults = useMemo(() => {
    return examResults.filter(res => {
      const resId = res?.id || res?.submissionId;
      if (hiddenExamResultIds.includes(resId)) return false;
      const status = (res?.status || '').toString();
      return status.includes('قيد المراجعة') || status === '' || !status;
    });
  }, [examResults, hiddenExamResultIds]);

  const pendingCount = useMemo(() => {
    return filteredLeaveRequests.filter(l => !l.status || l.status.includes('قيد المراجعة')).length;
  }, [filteredLeaveRequests]);

  const activeData = useMemo(() => {
    if (activeTab === 'courses') return courses;
    if (activeTab === 'students') return studentsDatabase;
    if (activeTab === 'exams') return filteredExamResults;
    if (activeTab === 'leaves') return filteredLeaveRequests;
    return [];
  }, [activeTab, courses, studentsDatabase, filteredExamResults, filteredLeaveRequests]);

  const renderHeaderComponent = () => (
    <View style={styles.formContainer}>
      {activeTab === 'courses' && (
        <View style={styles.cardForm}>
          <View style={styles.cardFormHeader}>
            <Ionicons name="add-circle-outline" size={24} color="#0F382C" />
            <Text style={styles.cardFormTitle}>أضف دورة جديدة!</Text>
          </View>
          <TextInput style={styles.input} placeholder="عنوان الدورة (مثال: حفظ سورة البقرة 🕊️)" placeholderTextColor="#475569" value={newTitle} onChangeText={setNewTitle} />
          <TextInput style={styles.input} placeholder="اسم المعلم ✨" placeholderTextColor="#475569" value={newInstructor} onChangeText={setNewInstructor} />
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {COURSE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  newCourseCategory === cat && styles.categoryChipActive
                ]}
                onPress={() => setNewCourseCategory(cat)}
              >
                <Text style={[styles.categoryChipText, newCourseCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.input} placeholder="السعر 💰 (بالجنيه)" placeholderTextColor="#475569" keyboardType="numeric" value={newPrice} onChangeText={setNewPrice} />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddCourse}>
            <Ionicons name="cloud-upload-outline" size={20} color="#D4AF37" />
            <Text style={styles.addBtnText}> حفظ وإضافة! 🚀</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'students' && (
        <View style={styles.cardForm}>
          <View style={styles.cardFormHeader}>
            <Ionicons name="person-add-outline" size={24} color="#0F382C" />
            <Text style={styles.cardFormTitle}>إضافة طالب / طالبة جديد</Text>
          </View>
          <TextInput style={styles.input} placeholder="الاسم (مثال: زياد أحمد / مريم علي)" placeholderTextColor="#475569" value={studentName} onChangeText={setStudentName} />
          <View style={styles.genderContainer}>
            <TouchableOpacity style={[styles.genderBtn, gender === 'boy' && styles.genderBtnBoyActive]} onPress={() => setGender('boy')}>
              <Text style={[styles.genderText, gender === 'boy' && styles.genderTextActive]}>👦 طالب (ولد)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.genderBtn, gender === 'girl' && styles.genderBtnGirlActive]} onPress={() => setGender('girl')}>
              <Text style={[styles.genderText, gender === 'girl' && styles.genderTextActive]}>👧 طالبة (بنت)</Text>
            </TouchableOpacity>
          </View>
          <TextInput style={styles.input} placeholder="كود الحساب اختياري (تلقائي: STU-103)" placeholderTextColor="#475569" autoCapitalize="characters" value={customStudentId} onChangeText={setCustomStudentId} />
          <TextInput style={styles.input} placeholder="تقرير أولي أو نشاط (اختياري)" placeholderTextColor="#475569" value={initialReport} onChangeText={setInitialReport} />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddStudent}>
            <Ionicons name="key-outline" size={20} color="#D4AF37" />
            <Text style={styles.addBtnText}> إضافة الحساب 🔑</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'exams' && (
        <View>
          {activeWeeklyQuestion && (
            <View style={styles.weeklyQuestionCard}>
              <View style={styles.weeklyCardHeader}>
                <Text style={styles.weeklyCardBadgeText}>السؤال الأسبوعي النشط 📅</Text>
                <Text style={styles.weeklyCardStars}>⭐ {activeWeeklyQuestion.rewardStars || activeWeeklyQuestion.stars || 15} نجمة</Text>
              </View>
              <Text style={styles.weeklyCardTitle}>{activeWeeklyQuestion.title || 'تحدي الأسبوع'}</Text>
              <Text style={styles.weeklyCardQuestion}>❓ {activeWeeklyQuestion.question}</Text>
              <TouchableOpacity style={styles.deleteWeeklyBtn} onPress={handleDeleteWeeklyQuestion}>
                <Ionicons name="trash-outline" size={16} color="#FFF" />
                <Text style={styles.deleteWeeklyBtnText}> مسح السؤال الأسبوعي</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.cardForm}>
            <View style={styles.cardFormHeader}>
              <Ionicons name="school-outline" size={24} color="#0F382C" />
              <Text style={styles.cardFormTitle}>أضف اختباراً أو سؤالاً أسبوعياً!</Text>
            </View>
            <View style={styles.genderContainer}>
              <TouchableOpacity style={[styles.genderBtn, !isWeeklyQuestion && styles.genderBtnBoyActive]} onPress={() => setIsWeeklyQuestion(false)}>
                <Text style={[styles.genderText, !isWeeklyQuestion && styles.genderTextActive]}>📝 اختبار عادي</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.genderBtn, isWeeklyQuestion && styles.weeklyBtnActive]} onPress={() => setIsWeeklyQuestion(true)}>
                <Text style={[styles.genderText, isWeeklyQuestion && styles.weeklyTextActive]}>📅 سؤال أسبوعي ✨</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.questionTypeRow}>
              <TouchableOpacity style={[styles.questionTypeBtn, questionType === 'essay' && styles.questionTypeBtnActive]} onPress={() => setQuestionType('essay')}>
                <Text style={[styles.questionTypeText, questionType === 'essay' && styles.questionTypeTextActive]}>مقالي</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.questionTypeBtn, styles.questionTypeBtnLeftMargin, questionType === 'mcq' && styles.questionTypeBtnActive]} onPress={() => setQuestionType('mcq')}>
                <Text style={[styles.questionTypeText, questionType === 'mcq' && styles.questionTypeTextActive]}>اختر من متعدد</Text>
              </TouchableOpacity>
            </View>

            <TextInput style={styles.input} placeholder={isWeeklyQuestion ? "عنوان سؤال الأسبوع" : "عنوان الاختبار"} placeholderTextColor="#475569" value={examTitle} onChangeText={setExamTitle} />
            <TextInput style={[styles.input, { height: 70 }]} placeholder="اكتب السؤال هنا..." placeholderTextColor="#475569" multiline value={question} onChangeText={setQuestion} />
            {questionType === 'mcq' && (
              <View style={styles.mcqOptionsContainer}>
                {['أ', 'ب', 'ج', 'د'].map((label, idx) => (
                  <View key={idx} style={styles.mcqOptionRow}>
                    <TextInput
                      style={[styles.input, styles.mcqOptionInput]}
                      placeholder={`الخيار ${label}`}
                      placeholderTextColor="#475569"
                      value={mcqOptions[idx]}
                      onChangeText={(text) => setMcqOptions(prev => prev.map((opt, index) => index === idx ? text : opt))}
                    />
                    <TouchableOpacity
                      style={[styles.optionSelectBtn, correctOptionIndex === idx && styles.optionSelectBtnActive]}
                      onPress={() => setCorrectOptionIndex(idx)}
                    >
                      <Text style={[styles.optionSelectText, correctOptionIndex === idx && styles.optionSelectTextActive]}>{correctOptionIndex === idx ? '✔ صحيح' : 'ضع صحيح'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={styles.mcqHint}>اختر السؤال متعدد الاختيارات ثم اضغط على الخيار الصحيح. يجب أن يكون هناك خياران على الأقل.</Text>
              </View>
            )}
            <TextInput style={styles.input} placeholder="رصيد النجوم ⭐" placeholderTextColor="#475569" keyboardType="numeric" value={examStars} onChangeText={setExamStars} />
            <TouchableOpacity style={styles.addBtn} onPress={handleAddExam}>
              <Ionicons name="paper-plane-outline" size={20} color="#D4AF37" />
              <Text style={styles.addBtnText}> {isWeeklyQuestion ? ' انشر سؤال الأسبوع 📅⭐' : ' انشر الاختبار ⭐ 📤'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeTab === 'leaves' && (
        <View style={styles.cardForm}>
          <Text style={styles.cardFormTitle}>إدارة الطلبات المعلقة ({pendingCount})</Text>
          <View style={styles.bulkActionRow}>
            <TouchableOpacity style={styles.bulkApproveBtn} onPress={handleApproveAllPending}>
              <Text style={styles.bulkActionText}>قبول الكل المعلق ✅</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkRejectBtn} onPress={handleRejectAllPending}>
              <Text style={styles.bulkActionText}>رفض الكل المعلق ❌</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionHeader}>
        {activeTab === 'courses' && '📋 الدورات الحالية'}
        {activeTab === 'students' && '📊 قائمة الطلاب وتقارير الأداء'}
        {activeTab === 'exams' && '📥 الإجابات الواردة'}
        {activeTab === 'leaves' && '🌴 قائمة الإجازات'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ImageBackground source={require('../../assets/image/3.jpeg')} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.overlay}>
          <InternalPdfViewerModal
            visible={pdfViewerVisible}
            onClose={closePdfViewer}
            pdfUri={pdfViewerUri}
            pdfHtmlContent={pdfViewerHtml}
            pdfTitle={pdfViewerTitle}
          />
          <View style={styles.header}>
            <TouchableOpacity style={styles.logoutBtn} onPress={onBack}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>⚙️ لوحة المعلم / الأدمن</Text>
            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={24} color="#FFF8E1" />
            </TouchableOpacity>
          </View>

          <View style={styles.navTabs}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse' }}>
              {[
                { key: 'courses', label: '📚 الدورات', style: styles.activeTabCourses },
                { key: 'students', label: '👥 الطلاب والتقارير', style: styles.activeTabStudents },
                { key: 'exams', label: `📝 الاختبارات (${filteredExamResults.length})`, style: styles.activeTabExams },
                { key: 'leaves', label: `🌴 الإجازات (${pendingCount})`, style: styles.activeTabLeaves },
                { key: 'subscription', label: '💳 الاشتراك', style: styles.activeTabCourses },
              ].map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeTab === tab.key && tab.style]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {activeTab === 'subscription' ? (
            <ScrollView contentContainerStyle={styles.listContainer}>
              <View style={styles.cardForm}>
                <Text style={styles.cardFormTitle}>إدارة وتعديل باقة الاشتراك الشهري 💳</Text>
                
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>
                    تفعيل نظام الاشتراك للطلاب: <Text style={{ color: isSubActive ? '#16A34A' : '#DC2626', fontWeight: 'bold' }}>{isSubActive ? 'مُفعل 🟢' : 'مغلق 🔴'}</Text>
                  </Text>
                  <Switch
                    trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                    thumbColor={isSubActive ? '#0F382C' : '#F1F5F9'}
                    onValueChange={handleToggleSubSwitch}
                    value={isSubActive}
                  />
                </View>

                <TextInput style={styles.input} placeholder="اسم الباقة" value={subTitle} onChangeText={setSubTitle} />
                <TextInput style={styles.input} placeholder="السعر" keyboardType="numeric" value={subPrice} onChangeText={setSubPrice} />
                <TextInput style={[styles.input, { height: 70 }]} placeholder="التفاصيل" multiline value={subDesc} onChangeText={setSubDesc} />
                
                <TouchableOpacity style={styles.addBtn} onPress={handleSaveSubscription}>
                  <Text style={styles.addBtnText}>حفظ التغييرات 💾</Text>
                </TouchableOpacity>

                {/* قائمة طلبات التحويل اليدوي للتحقق */}
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontWeight: '900', color: '#0F382C', marginBottom: 8 }}>طلبات الدفع اليدوية المعلقة</Text>
                  {paymentRequests && paymentRequests.length === 0 ? (
                    <Text style={{ color: '#64748B' }}>لا توجد طلبات دفع حالياً.</Text>
                  ) : (
                    (paymentRequests || []).map((req) => (
                      <View key={req.id} style={{ backgroundColor: '#FFF', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
                        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                          <View>
                            <Text style={{ fontWeight: '900' }}>{req.studentName || req.studentId}</Text>
                            <Text style={{ color: '#475569', fontSize: 12 }}>{req.target === 'subscription' ? 'تفعيل اشتراك شهري' : `شراء كورس (${req.courseId || '-'})`}</Text>
                            <Text style={{ color: '#64748B', fontSize: 12 }}>المُرسل: {req.senderNumber || '—'} • مرجع: {req.referenceCode || '—'}</Text>
                              <Text style={{ color: '#94A3B8', fontSize: 11 }}>الحالة: {getPaymentStatusLabel(req.status)}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-start' }}>
                            <TouchableOpacity style={[styles.smallAddBtn, { backgroundColor: '#0F382C', marginBottom: 6 }]} onPress={async () => { await Clipboard.setStringAsync('01093684797'); Alert.alert('نُسِخ', 'تم نسخ رقم المحفظة 01093684797 إلى الحافظة.'); }}>
                              <Text style={styles.smallAddBtnText}>نسخ رقم المحفظة</Text>
                            </TouchableOpacity>
                              {(req.status === 'pending' || req.status === 'قيد المراجعة ⏳') && (
                                <>
                                  <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#16A34A', marginTop: 4 }]} onPress={() => {
                                    approvePaymentRequest?.(req.id);
                                    if (req.target === 'course' && req.courseId) {
                                      enrollCourse?.(req.courseId);
                                    }
                                    Alert.alert('تم', 'تم قبول الدفعة ومنح الوصول.');
                                  }}>
                                    <Text style={styles.addBtnText}>قبول الدفع ✅</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity style={[styles.cancelBtn, { marginTop: 6 }]} onPress={() => { rejectPaymentRequest?.(req.id); Alert.alert('تم', 'تم رفض الطلب.'); }}>
                                    <Text style={styles.cancelBtnText}>رفض</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>

              </View>
            </ScrollView>
          ) : (
            <FlatList
              data={activeData}
              keyExtractor={(item, index) => (item?.id || item?.studentId || item?.submissionId || index).toString()}
              ListHeaderComponent={renderHeaderComponent}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                if (activeTab === 'courses') {
                  const isExpanded = expandedCourseId === item.id;
                  return (
                    <View style={styles.courseItem}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.courseDetails}>
                          <Text style={styles.courseTitle}>{item.title}</Text>
                          <Text style={styles.courseSub}>المعلم: {item.instructor} | السعر: {item.price} ج.م</Text>
                        </View>
                        <TouchableOpacity style={styles.expandBtn} onPress={() => setExpandedCourseId(isExpanded ? null : item.id)}>
                          <Text style={styles.expandBtnText}>{isExpanded ? 'إخفاء إدارة المحتوى ▲' : 'إدارة محتوى الدورة ▼'}</Text>
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.courseContentAdmin}>
                            <Text style={styles.sectionSubTitle}>المحتوى الحالي للدورة</Text>
                            {(item.curriculum || []).length === 0 ? (
                              <Text style={styles.emptyText}>لا توجد وحدات بعد. أضف وحدة جديدة هنا.</Text>
                            ) : (
                              (item.curriculum || []).map((unit, uIndex) => (
                                <View key={unit.id || uIndex} style={styles.courseUnitCard}>
                                  <View style={styles.unitHeader}>
                                    <Text style={styles.unitTitle}>{unit.title || `وحدة ${uIndex + 1}`}</Text>
                                    <TouchableOpacity onPress={() => handleDeleteModule(item.id, unit.id)}>
                                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                  </View>
                                  {(unit.lessons || []).map((lesson, lIndex) => {
                                    const lessonTitle = typeof lesson === 'string' ? lesson : (lesson.title || lesson.pdfName || 'درس بدون عنوان');
                                    const hasPdf = lesson && typeof lesson === 'object' && lesson.pdfUri;
                                    return (
                                      <View key={`${unit.id}-${lIndex}`} style={{ marginBottom: 6 }}>
                                        <View style={styles.lessonRowAdmin}>
                                          <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Text style={styles.lessonTextAdmin}>• {lessonTitle}</Text>
                                            {hasPdf ? <Text style={styles.pdfBadge}>PDF</Text> : null}
                                          </View>
                                          <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                            <TouchableOpacity onPress={() => handleAttachPdf(item.id, unit.id, lIndex)} style={[styles.smallAddBtn, { paddingHorizontal: 10, marginLeft: 8 }]}>
                                              <Text style={styles.smallAddBtnText}>{hasPdf ? 'تغيير PDF' : 'إضافة PDF'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => handleDeleteLesson(item.id, unit.id, lIndex)}>
                                              <Ionicons name="close-circle" size={18} color="#EF4444" />
                                            </TouchableOpacity>
                                          </View>
                                        </View>
                                        {hasPdf && (
                                          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                                              <Text style={styles.selectedFileText}>📎 {lesson.pdfName || 'ملف PDF'}</Text>
                                              <TouchableOpacity onPress={() => openPdfInViewer({ title: lesson.title || lesson.pdfName, pdfUri: lesson.pdfUri })} style={[styles.smallAddBtn, { paddingHorizontal: 12, marginLeft: 8 }]}>
                                                <Text style={styles.smallAddBtnText}>عرض</Text>
                                              </TouchableOpacity>
                                            </View>
                                            <TouchableOpacity onPress={() => handleRemovePdf(item.id, unit.id, lIndex)} style={{ marginLeft: 8 }}>
                                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                            </TouchableOpacity>
                                          </View>
                                        )}
                                      </View>
                                    );
                                  })}
                                  <View style={styles.addLessonRow}>
                                    <TextInput
                                      style={[styles.input, { backgroundColor: '#F3F4F6', minHeight: 38, flex: 1 }]}
                                      placeholder="اضف درس جديد إلى هذه الوحدة"
                                      placeholderTextColor="#64748B"
                                      value={newLessonTextByCourse[`${item.id}_${unit.id}`] || ''}
                                      onChangeText={(txt) => setNewLessonTextByCourse(prev => ({ ...prev, [`${item.id}_${unit.id}`]: txt }))}
                                    />
                                    <TouchableOpacity style={[styles.smallAddBtn, { paddingHorizontal: 10 }]} onPress={() => handlePickPdf(item.id, unit.id)}>
                                      <Text style={styles.smallAddBtnText}>{newLessonPdfByCourseModule[`${item.id}_${unit.id}`]?.name ? 'تغيير PDF' : 'اختر PDF'}</Text>
                                    </TouchableOpacity>
                                  </View>
                                  {newLessonPdfByCourseModule[`${item.id}_${unit.id}`]?.name ? (
                                    <Text style={styles.selectedFileText}>
                                      📎 تم اختيار: {newLessonPdfByCourseModule[`${item.id}_${unit.id}`].name}
                                    </Text>
                                  ) : null}
                                  <TouchableOpacity style={[styles.smallAddBtn, { alignSelf: 'flex-start', marginTop: 8 }]} onPress={() => handleAddLesson(item.id, unit.id)}>
                                    <Text style={styles.smallAddBtnText}>أضف درس</Text>
                                  </TouchableOpacity>
                                </View>
                              ))
                            )}

                            <View style={styles.courseContentForm}>
                              <Text style={styles.sectionSubTitle}>أضف وحدة جديدة</Text>
                              <TextInput
                                style={styles.input}
                                placeholder="عنوان الوحدة"
                                placeholderTextColor="#64748B"
                                value={newModuleTitleByCourse[item.id] || ''}
                                onChangeText={(txt) => setNewModuleTitleByCourse(prev => ({ ...prev, [item.id]: txt }))}
                              />
                              <TextInput
                                style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
                                placeholder="اكتب الدروس هنا سطرًا بسطر"
                                placeholderTextColor="#64748B"
                                value={newModuleLessonsByCourse[item.id] || ''}
                                onChangeText={(txt) => setNewModuleLessonsByCourse(prev => ({ ...prev, [item.id]: txt }))}
                                multiline
                              />
                              <TouchableOpacity style={styles.addBtn} onPress={() => handleAddModule(item.id)}>
                                <Ionicons name="add-circle-outline" size={20} color="#D4AF37" />
                                <Text style={styles.addBtnText}>إضافة الوحدة للمحتوى</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteCourse(item.id)}>
                        <Ionicons name="trash-outline" size={22} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (activeTab === 'students') {
                  const isGirl = isGirlStudent(item);
                  return (
                    <StudentCardItem 
                      st={item} 
                      isGirl={isGirl} 
                      onDeleteReport={handleDeleteReport} 
                      onAddReport={handleAddReport} 
                      onAddStars={handleAddStars}
                      onDeleteStudent={(id) => {
                        if (!deleteStudent) return Alert.alert('خطأ', 'دالة الحذف غير متاحة');
                        const res = deleteStudent(id);
                        Alert.alert('تم', (res && res.message) ? res.message : 'تم حذف الحساب.');
                      }}
                      onCancelSubscription={(id) => {
                        Alert.alert('إلغاء الاشتراك', 'هل تريد إلغاء اشتراك هذا الطالب؟', [
                          { text: 'إلغاء', style: 'cancel' },
                          { text: 'نعم، إلغاء', onPress: () => { cancelSubscriptionForStudent?.(id); Alert.alert('تم الإلغاء', 'تم إلغاء اشتراك الطالب.'); } }
                        ]);
                      }}
                    />
                  );
                }

                if (activeTab === 'exams') {
                  const resId = item?.id || item?.submissionId;
                  return (
                    <View style={styles.resultItemCard}>
                      <Text style={styles.resultStudentName}>👤 {item.studentName || 'طالب'}</Text>
                      <Text style={styles.resultQuestionText}>❓ {item.question || item.examTitle}</Text>
                      <View style={styles.resultAnswerBox}>
                        <Text style={styles.resultAnswerText}>📝 الإجابة: {item.answer || item.studentAnswer}</Text>
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="سبب التوجيه أو الرفض..."
                        placeholderTextColor="#64748B"
                        value={gradingFeedbacks[resId] || ''}
                        onChangeText={(txt) => setGradingFeedbacks(prev => ({ ...prev, [resId]: txt }))}
                      />
                      <View style={styles.teacherGradingButtonsRow}>
                        <TouchableOpacity style={styles.correctGradeBtn} onPress={() => handleGradeAnswer(item, 'correct')}>
                          <Text style={styles.gradeBtnText}>قبول ✅</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.wrongGradeBtn} onPress={() => handleGradeAnswer(item, 'wrong')}>
                          <Text style={styles.gradeBtnText}>رفض ❌</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                if (activeTab === 'leaves') {
                  return (
                    <View style={styles.resultItemCard}>
                      <View style={styles.resultHeader}>
                        <Text style={styles.resultStudentName}>👤 {item.studentName || 'طالب'}</Text>
                        <Text style={{ fontWeight: 'bold', color: item.status?.includes('مقبولة') ? '#16A34A' : '#DC2626' }}>
                          {item.status || 'قيد المراجعة ⏳'}
                        </Text>
                      </View>
                      <Text style={styles.resultQuestionText}>💬 السبب: {item.reason || 'طلب إجازة'}</Text>
                      {(!item.status || item.status.includes('قيد المراجعة')) && (
                        <View style={styles.leaveActionRow}>
                          <TouchableOpacity style={styles.approveLeaveBtn} onPress={() => handleUpdateLeave(item, 'مقبولة ✅')}>
                            <Text style={styles.approveLeaveText}>قبول ✅</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.rejectLeaveBtn} onPress={() => handleUpdateLeave(item, 'مرفوضة ❌')}>
                            <Text style={styles.rejectLeaveText}>رفض ❌</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                }

                return null;
              }}
            />
          )}
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F382C' },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(15, 56, 44, 0.35)' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: 'rgba(15, 56, 44, 0.75)' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#FFF8E1' },
  logoutBtn: { padding: 4 },
  navTabs: { backgroundColor: 'rgba(15, 56, 44, 0.8)', paddingVertical: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 4, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  tabText: { color: '#FFF8E1', fontWeight: 'bold', fontSize: 13 },
  activeTabCourses: { backgroundColor: '#D4AF37' },
  activeTabStudents: { backgroundColor: '#2563EB' },
  activeTabExams: { backgroundColor: '#D97706' },
  activeTabLeaves: { backgroundColor: '#059669' },
  activeTabText: { color: '#FFF' },
  listContainer: { padding: 16 },
  formContainer: { marginBottom: 10 },
  sectionHeader: { fontSize: 15, fontWeight: 'bold', color: '#FFF8E1', textAlign: 'right', marginVertical: 10, textShadowColor: '#000', textShadowRadius: 3 },
  cardForm: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 10, padding: 14, marginBottom: 12 },
  cardFormHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  cardFormTitle: { fontSize: 15, fontWeight: 'bold', color: '#0F382C', marginRight: 6 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 8, fontSize: 13, textAlign: 'right', marginBottom: 8 },
  genderContainer: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 },
  genderBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', marginHorizontal: 2 },
  genderBtnBoyActive: { backgroundColor: '#DBEAFE', borderColor: '#2563EB' },
  genderBtnGirlActive: { backgroundColor: '#FCE7F3', borderColor: '#DB2777' },
  weeklyBtnActive: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  genderText: { fontSize: 12, fontWeight: 'bold' },
  genderTextActive: { color: '#0F172A' },
  weeklyTextActive: { color: '#92400E' },
  addBtn: { backgroundColor: '#0F382C', flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 8, flex: 1 },
  addBtnText: { color: '#D4AF37', fontWeight: 'bold', fontSize: 13 },
  cancelBtn: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginLeft: 6 },
  cancelBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 12 },
  deleteStudentBtn: { backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 8 },
  courseItem: { backgroundColor: 'rgba(255, 255, 255, 0.95)', padding: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseDetails: { alignItems: 'flex-end', flex: 1 },
  courseTitle: { fontSize: 14, fontWeight: 'bold', color: '#0F382C' },
  courseSub: { fontSize: 11, color: '#64748B', marginTop: 4 },
  deleteBtn: { padding: 6, marginLeft: 8 },
  expandBtn: { marginTop: 10, alignSelf: 'flex-end' },
  expandBtnText: { color: '#0F382C', fontSize: 12, fontWeight: '900' },
  courseContentAdmin: { marginTop: 12, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#D1D5DB' },
  sectionSubTitle: { fontSize: 13, fontWeight: '900', color: '#0F382C', marginBottom: 8, textAlign: 'right' },
  courseUnitCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  unitHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  unitTitle: { fontSize: 13, fontWeight: '900', color: '#0F382C' },
  lessonRowAdmin: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lessonTextAdmin: { color: '#475569', flex: 1, marginRight: 8, fontSize: 12 },
  selectedFileText: { fontSize: 12, color: '#475569', marginTop: 6, textAlign: 'right' },
  pdfBadge: { backgroundColor: '#0F382C', color: '#FFF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, fontSize: 11, fontWeight: '900', overflow: 'hidden' },
  addLessonRow: { marginTop: 8 },
  smallAddBtn: { marginTop: 6, backgroundColor: '#0F382C', paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  smallAddBtnText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  questionTypeRow: { flexDirection: 'row-reverse', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 10 },
  questionTypeBtn: { flex: 1, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: '#F8FAFC' },
  questionTypeBtnActive: { backgroundColor: '#0F382C', borderColor: '#0F382C' },
  questionTypeText: { color: '#0F172A', fontWeight: '800', fontSize: 12 },
  questionTypeTextActive: { color: '#FFF' },
  questionTypeBtnLeftMargin: { marginLeft: 8 },
  mcqOptionsContainer: { marginBottom: 10 },
  mcqOptionRow: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  mcqOptionInput: { flex: 1, minWidth: 0, paddingVertical: 10 },
  optionSelectBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  optionSelectBtnActive: { backgroundColor: '#0F382C', borderColor: '#0F382C' },
  optionSelectText: { color: '#0F172A', fontWeight: '800', fontSize: 12 },
  optionSelectTextActive: { color: '#FFF' },
  mcqHint: { fontSize: 11, color: '#475569', marginTop: 4, textAlign: 'right' },
  courseContentForm: { marginTop: 10 },
  resultItemCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 8, padding: 12, marginBottom: 10 },
  resultHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  resultStudentName: { fontSize: 14, fontWeight: 'bold', color: '#0F382C', textAlign: 'right' },
  resultQuestionText: { fontSize: 12, color: '#334155', textAlign: 'right', marginVertical: 4 },
  resultAnswerBox: { backgroundColor: '#F8FAFC', padding: 8, borderRadius: 6, marginBottom: 8 },
  resultAnswerText: { fontSize: 12, color: '#0F172A', textAlign: 'right' },
  teacherGradingButtonsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  correctGradeBtn: { flex: 1, backgroundColor: '#16A34A', paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginLeft: 4 },
  wrongGradeBtn: { flex: 1, backgroundColor: '#DC2626', paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginRight: 4 },
  gradeBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  leaveActionRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 },
  approveLeaveBtn: { flex: 1, backgroundColor: '#16A34A', paddingVertical: 6, borderRadius: 6, alignItems: 'center', marginLeft: 4 },
  rejectLeaveBtn: { flex: 1, backgroundColor: '#DC2626', paddingVertical: 6, borderRadius: 6, alignItems: 'center', marginRight: 4 },
  approveLeaveText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  rejectLeaveText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  bulkActionRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 },
  bulkApproveBtn: { flex: 1, backgroundColor: '#16A34A', paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginLeft: 4 },
  bulkRejectBtn: { flex: 1, backgroundColor: '#DC2626', paddingVertical: 8, borderRadius: 6, alignItems: 'center', marginRight: 4 },
  bulkActionText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  weeklyQuestionCard: { backgroundColor: 'rgba(254, 243, 199, 0.95)', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 8, padding: 10, marginBottom: 10 },
  weeklyCardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  weeklyCardBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#B45309' },
  weeklyCardStars: { fontSize: 12, fontWeight: 'bold', color: '#B45309' },
  weeklyCardTitle: { fontSize: 13, fontWeight: 'bold', color: '#78350F', textAlign: 'right', marginTop: 2 },
  weeklyCardQuestion: { fontSize: 12, color: '#92400E', textAlign: 'right', marginVertical: 2 },
  deleteWeeklyBtn: { backgroundColor: '#DC2626', flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', paddingVertical: 4, borderRadius: 4, marginTop: 4 },
  deleteWeeklyBtnText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  switchRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#CBD5E1' },
  switchLabel: { fontSize: 13, color: '#0F382C', fontWeight: 'bold' },
  girlStudentCard: { borderRightWidth: 4, borderRightColor: '#DB2777' },
  cardHeaderRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  studentNameText: { fontSize: 15, fontWeight: 'bold', color: '#0F382C' },
  girlStudentName: { color: '#DB2777' },
  idBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  girlIdBadge: { backgroundColor: '#FCE7F3' },
  idBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#475569' },
  girlIdBadgeText: { color: '#DB2777' },
  starsAdminBox: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 8, borderRadius: 6, marginBottom: 8 },
  starsCountText: { fontSize: 12, fontWeight: 'bold', color: '#B45309' },
  starsActionBtns: { flexDirection: 'row-reverse' },
  addStarBtn: { backgroundColor: '#16A34A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginLeft: 4 },
  starBtnText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  removeStarBtn: { backgroundColor: '#DC2626', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  cancelSubBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FFF1F2', marginBottom: 4 },
  reportsSectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#334155', textAlign: 'right', marginBottom: 4 },
  noReportsText: { fontSize: 11, color: '#94A3B8', textAlign: 'right', marginBottom: 6 },
  reportRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 6, borderRadius: 6, marginBottom: 4 },
  reportText: { fontSize: 12, color: '#1E293B', textAlign: 'right' },
  reportDate: { fontSize: 10, color: '#64748B', textAlign: 'right' },
  openAddReportBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  openAddReportText: { fontSize: 12, fontWeight: 'bold', color: '#0F382C', marginRight: 4 },
  categoryChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', marginBottom: 8 },
  categoryChipActive: { backgroundColor: '#0F382C', borderColor: '#0F382C' },
  categoryChipText: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
  categoryChipTextActive: { color: '#FFF' },
  emptyText: { color: '#64748B', fontSize: 12, textAlign: 'right', marginBottom: 8 },
});