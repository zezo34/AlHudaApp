import React, { useContext, useState, useEffect, memo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  ImageBackground,
  BackHandler,
  Alert
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { CourseContext } from '../context/CourseContext';
import ArchHeader from '../components/ArchHeader';
import StudentExamScreen from './StudentExamScreen';

// 🎨 ثوابت الألوان والخلفيات
const CATEGORIES = ['الكل', 'القرآن الكريم', 'اللغة العربية', 'الدراسات الإسلامية'];

const KID_CARD_COLORS = [
  { bg: '#FFFAF0', border: '#FF9F1C', badgeBg: '#FFBF69', icon: '📖✨', dark: '#C27800' },
  { bg: '#F0F9FF', border: '#38BDF8', badgeBg: '#7DD3FC', icon: '🎨💬', dark: '#0388C1' },
  { bg: '#F0FDF4', border: '#34D399', badgeBg: '#6EE7B7', icon: '🕌🌟', dark: '#15966B' },
  { bg: '#FFF0F5', border: '#F472B6', badgeBg: '#F472B6', icon: '⭐🎈', dark: '#B91C61' },
];

const BACKGROUND_IMAGES = {
  student: { uri: 'https://img.freepik.com/free-vector/hand-drawn-ramadan-kareem-background_23-2149306041.jpg' },
  parent: { uri: 'https://img.freepik.com/free-vector/arabic-pattern-background-gold-style_23-2148810217.jpg' },
};

// 🔹 مكون فرعي لكارت نتيجة الاختبار (ولي الأمر)
const ExamResultCard = memo(({ result }) => (
  <View style={styles.parentResultCard}>
    <View style={styles.resCardHeader}>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={styles.resExamTitle}>📖 {result.examTitle}</Text>
        <View style={[styles.resTypeBadge, result.isWeekly ? styles.resTypeBadgeWeekly : styles.resTypeBadgeRegular]}>
          <Text style={[styles.resTypeBadgeText, result.isWeekly ? styles.resTypeBadgeWeeklyText : styles.resTypeBadgeRegularText]}>
            {result.isWeekly ? '📅 سؤال الأسبوع' : '📝 اختبار عادي'}
          </Text>
        </View>
      </View>
      <Text style={styles.resBadge}>{result.status || 'تم الحل 🟢'}</Text>
    </View>
    <Text style={styles.resQuestion}>❓ السؤال: {result.question}</Text>
    <View style={styles.resAnswerBox}>
      <Text style={styles.resAnswerText}>💬 الإجابة: {result.answer}</Text>
    </View>
    {result.teacherFeedback ? (
      <View style={{ backgroundColor: '#ECFDF5', borderRightWidth: 3, borderRightColor: '#10B981', borderRadius: 8, padding: 8, marginVertical: 4 }}>
        <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '800', textAlign: 'right' }}>
          💬 ملاحظة المعلم: {result.teacherFeedback}
        </Text>
      </View>
    ) : null}
    <Text style={styles.resDate}>📅 {result.date}</Text>
  </View>
));

// 🔹 مكون فرعي لكارت التقارير والملاحظات (ولي الأمر)
const ReportCard = memo(({ report, studentEmoji, isGirl }) => (
  <View style={[styles.parentReportCard, isGirl && styles.girlReportCard]}>
    <View style={styles.reportBadge}>
      <Text style={styles.reportBadgeText}>{studentEmoji} تقرير المعلم</Text>
    </View>
    <Text style={styles.reportText}>{report.text}</Text>
    {report.date && <Text style={styles.reportDate}>📅 {report.date}</Text>}
  </View>
));

// 🔹 مكون فرعي لكارت الدورة
const CourseCard = memo(({ course, isParent, colorScheme, onSelect, userStars, onViewDetails, hasCourseAccess }) => {
  const isEnrolled = Boolean(hasCourseAccess);

  // 🌟 حاسبة الخصم المتاح بناءً على رصيد النجوم الحالي
  const discountAmount = Math.floor((userStars || 0) / 10) * 5;
  const starsNeeded = (discountAmount / 5) * 10;
  const finalPrice = Math.max(0, course.price - discountAmount);
  const canDiscount = discountAmount > 0 && !isEnrolled;

  const getActionBtnStyle = () => {
    if (isParent) {
      return isEnrolled ? styles.parentProgressBtn : styles.parentPayBtn;
    }
    return { backgroundColor: colorScheme.border };
  };

  const getActionText = () => {
    if (isParent) {
      return isEnrolled ? 'متابعة التقدم 📊' : 'ادفع الآن 💰';
    }
    return isEnrolled ? '✔ مشترك' : 'انطلق الآن 🚀';
  };

  return (
    <View
      style={[
        styles.courseCard, 
        isParent 
          ? styles.parentCourseCard 
          : { backgroundColor: colorScheme.bg, borderColor: colorScheme.border }
      ]}
    >
      {/* هيدر الكارت */}
      <View style={styles.cardHeader}>
        <View 
          style={[
            styles.badge, 
            isParent ? styles.parentBadge : { backgroundColor: colorScheme.badgeBg }
          ]}
        >
          <Text style={[styles.badgeText, !isParent && styles.kidBadgeText]}>
            {!isParent && `${colorScheme.icon} `}{course.category}
          </Text>
        </View>
        <Text style={styles.rating}>⭐ {course.rating}</Text>
      </View>

      {/* محتوى الكارت الرئيسي */}
      <View style={styles.cardBody}>
        <Text style={[styles.courseTitle, isParent && styles.parentCourseTitle]}>
          {course.title}
        </Text>
        
        <Text style={[styles.instructor, !isParent && styles.kidInstructor]}>
          👨‍🏫 المعلم: {course.instructor}
        </Text>

        {/* 🌟 شريط النجوم الإضافية (يظهر عند عدم الاشتراك) */}
        {!isEnrolled && (
          <View style={styles.starsInfoRow}>
            <View style={styles.starBadge}>
              <Text style={styles.starText}>⭐ 50</Text>
            </View>
            <Text style={[styles.topicText, !isParent && { color: colorScheme.dark }]}>
              احصل على نجوم إضافية
            </Text>
          </View>
        )}
      </View>

      {/* 🌟 فوتر الكارت كامل */}
      <View style={[styles.cardFooter, isParent && styles.parentCardFooter]}>
        
        {/* 🎉 صندوق الخصم */}
        {canDiscount && (
          <View style={styles.starsDiscountBoxCentered}>
            <Text style={styles.starsDiscountText}>
              🎉 معاك {userStars} نجمة تديك خصم <Text style={styles.boldPrice}>-{discountAmount} ج.م</Text>!
            </Text>
            <Text style={styles.starsDiscountSub}>
              (سيتم خصم {starsNeeded} نجمة تلقائياً عند الدفع/الاشتراك)
            </Text>
          </View>
        )}

        <View style={styles.footerActionRow}>
          {/* 💰 عرض السعر */}
          <View style={styles.priceContainer}>
            {canDiscount ? (
              <View style={styles.priceColumn}>
                <Text style={styles.oldPrice}>{course.price} ج.م</Text>
                <Text style={[styles.price, isParent && styles.parentPrice]}>
                  💰 {finalPrice} ج.م
                </Text>
              </View>
            ) : (
              <Text style={[styles.price, isParent && styles.parentPrice]}>
                💰 {course.price} ج.م
              </Text>
            )}
          </View>
          
          {/* 🌟 الأزرار */}
          <View style={styles.actionButtonsRow}>
            {/* زر التفاصيل المباشر لشاشة التفاصيل */}
            {!isEnrolled && (
              <TouchableOpacity 
                style={[styles.actionBtn, styles.detailsBtn, { borderColor: colorScheme.border }]}
                onPress={() => onViewDetails?.(course)}
                activeOpacity={0.7}
              >
                <Text style={[styles.statusText, styles.kidDetailsBtnText, { color: colorScheme.dark }]}>
                  📖 التفاصيل
                </Text>
              </TouchableOpacity>
            )}

            {/* زر الأكشن الرئيسي */}
            <TouchableOpacity 
              style={[styles.actionBtn, getActionBtnStyle()]}
              onPress={() => onSelect(course, finalPrice, starsNeeded)}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusText, isParent ? styles.parentActionBtnText : styles.kidActionBtnText]}>
                {getActionText()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </View>
  );
});

export default function CourseDetailsScreen({ course: propCourse, onBack, navigation, onSelectCourse, onViewProgress, onViewDetailsProp, route }) {
  const { user, studentsDatabase = [], logout, useStarsForDiscount, subscribeUser } = useContext(AuthContext);
  const { courses, examResults, enrollCourse, getStudentExamResults } = useContext(CourseContext);

  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [currentView, setCurrentView] = useState('home'); 

  const isParent = user?.role === 'parent';
  const currentBg = isParent ? BACKGROUND_IMAGES.parent : BACKGROUND_IMAGES.student;
 
  // 1. البحث في قاعدة بيانات الطلاب
  const studentFromDb = studentsDatabase.find(
    (st) => st.id === user?.studentDbId || 
            st.studentId === user?.studentId || 
            st.studentId === user?.username || 
            st.name === user?.name
  );

  const currentStudent = studentFromDb || {
    name: user?.name || 'الطالب',
    studentId: user?.studentId || user?.username || '',
    gender: user?.gender || 'boy',
    stars: user?.stars || 0,
    reports: user?.reports || [],
    purchasedCourseIds: Array.isArray(user?.purchasedCourseIds) ? user.purchasedCourseIds : []
  };

  const isSubscribed = Boolean(currentStudent?.isSubscribed);
  const studentPurchasedCourseIds = Array.isArray(currentStudent?.purchasedCourseIds) ? currentStudent.purchasedCourseIds : [];
  const hasCourseAccess = Boolean(isSubscribed || studentPurchasedCourseIds.includes(propCourse?.id));

  const isGirl = currentStudent.gender === 'girl';
  const studentEmoji = isGirl ? '👧' : '👦';
  const reportsList = currentStudent.reports || [];
  const userStars = currentStudent.stars || 0;

  // 📌 نتائج الطالب المسجل فقط — منع تسريب إجابات الطلاب الآخرين إلى ولي الأمر
  const studentExamResults = (typeof getStudentExamResults === 'function')
    ? getStudentExamResults({
        studentId: currentStudent?.studentId || user?.studentId,
        id: currentStudent?.id || user?.studentDbId || user?.id,
        name: user?.studentName || currentStudent?.name,
      })
    : (examResults || []);


  useEffect(() => {
    const onBackPress = () => {
      if (currentView !== 'home') {
        setCurrentView('home');
        return true; 
      }
      return false; 
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [currentView]);

  const filteredCourses = selectedCategory === 'الكل'
    ? courses
    : courses?.filter(c => c.category === selectedCategory);

  // 🌟 دالة معالجة الاشتراك أو متابعة الكورس
  const handleCourseClick = useCallback((course, finalPrice, starsNeeded) => {
    const courseWithDiscount = { ...course, price: finalPrice, finalPrice };

    if (hasCourseAccess) {
      if (isParent) {
        onViewProgress?.(courseWithDiscount);
      } else {
        // For enrolled student, open the course content if handler provided
        if (typeof onOpenContent === 'function') {
          onOpenContent(course);
          return;
        }
        if (navigation && navigation.navigate) {
          // try to navigate to StudentContent screen if exists
          try { navigation.navigate('StudentContent', { course }); return; } catch (e) { /* ignore */ }
        }
      }
      return;
    }

    const confirmAndPurchase = () => {
      // In normal runtime, if onSelectCourse exists we defer to it (payment flow or external handler).
      // During development/testing (__DEV__ === true) we prefer to directly activate the subscription
      // so testers can see the subscribed state without a payment integration.
      if (onSelectCourse && !__DEV__) {
        return onSelectCourse?.(courseWithDiscount);
      }

      // If no onSelectCourse provided (CourseDetails opened standalone), or in dev mode, try subscribeUser from context
      if (subscribeUser) {
        const start = new Date();
        start.setHours(0,0,0,0);
        const expiryOn = new Date(start);
        expiryOn.setDate(start.getDate() + 30);
        const startIso = start.toISOString();
        const expiryIso = expiryOn.toISOString();

        // identify student id to subscribe
        const targetId = currentStudent?.studentId || currentStudent?.id || user?.id || user?.studentId;
        try {
          subscribeUser?.(targetId, { start: startIso, expiry: expiryIso });
          // Mark the course as enrolled in CourseContext so Home shows it under subscribed courses immediately
          try { enrollCourse?.(course.id); } catch (e) { console.warn('enrollCourse failed', e); }
        } catch (err) {
          console.warn('subscribeUser failed', err);
        }

        Alert.alert('تم الشراء 🎉', `تم شراء الكورس بنجاح! يمكنك البدء في المحتوى الآن.`);
        onBack?.();
        return;
      }

      // fallback: call onSelectCourse if present
      if (onSelectCourse) onSelectCourse?.(courseWithDiscount);
    };

    // If there is a stars discount path
    if (starsNeeded > 0) {
      // In dev mode, consume stars (if hook available) and subscribe immediately without showing dialogs
      if (__DEV__) {
        if (useStarsForDiscount) {
          try { useStarsForDiscount(currentStudent.studentId || currentStudent.id, starsNeeded); } catch (e) { console.warn(e); }
        }
        confirmAndPurchase();
        return;
      }

      Alert.alert(
        "تطبيق خصم النجوم 🌟",
        `سيتم استهلاك ${starsNeeded} نجمة للحصول على الكورس بسعر ${finalPrice} ج.م بدلاً من ${course.price} ج.م. هل تريد المتابعة؟`,
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "موافق واشترك ✨",
            onPress: () => {
              if (useStarsForDiscount) {
                useStarsForDiscount(currentStudent.studentId || currentStudent.id, starsNeeded);
              }
              confirmAndPurchase();
            }
          }
        ]
      );
      return;
    }

    // Normal payment confirmation flow.
    // In development, skip the confirmation and subscribe immediately for testing convenience.
    if (__DEV__) {
      confirmAndPurchase();
      return;
    }

    Alert.alert('تأكيد الدفع 💳', `هل تريد دفع ${finalPrice} ج.م للحصول على هذا الكورس؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'ادفع الآن', onPress: confirmAndPurchase }
    ]);
  }, [isParent, onViewProgress, useStarsForDiscount, currentStudent, onSelectCourse, subscribeUser, user, onBack]);

  // إذا تم تمرير كورس مفرد عبر props (عرض التفاصيل)، عرض شاشة التفاصيل كنافذة عائمة
  // (هنا بعد تعريف handleCourseClick لتجنب استخدام متغير قبل تعريفه)
  const renderSingleCourseProp = (courseProp) => {
    const course = courseProp;
    const discountAmount = Math.floor((userStars || 0) / 10) * 5;
    const starsNeeded = (discountAmount / 5) * 10;
    const finalPrice = Math.max(0, course.price - discountAmount);

    return (
      <ImageBackground source={currentBg} resizeMode="cover" style={styles.backgroundImage}>
        <SafeAreaView style={[styles.overlay, isParent && styles.parentOverlay]}>
          <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
            <TouchableOpacity onPress={() => onBack?.()} style={{ padding: 8, alignSelf: 'flex-start' }}>
              <Text style={{ color: isParent ? '#FFD700' : '#0F382C', fontWeight: '900' }}>✖ إغلاق</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={[styles.courseCard, isParent ? styles.parentCourseCard : { backgroundColor: '#FFFFFF', borderColor: '#E6EEF9' }, { padding: 18 }]}> 
              <Text style={[styles.courseTitle, isParent && styles.parentCourseTitle]}>{course.title}</Text>
              <Text style={[styles.instructor, !isParent && styles.kidInstructor]}>👨‍🏫 المعلم: {course.instructor}</Text>
              <Text style={{ marginTop: 8, color: '#475569' }}>{course.description || 'تفاصيل الكورس غير متاحة.'}</Text>

              <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  {discountAmount > 0 && <Text style={styles.oldPrice}>{course.price} ج.م</Text>}
                  <Text style={[styles.price, isParent && styles.parentPrice]}>💰 {finalPrice} ج.م</Text>
                </View>

              </View>

              {/* زر أسفل الكارت بعرض كامل ليتطابق مع "اشترك الآن" في الصفحة الرئيسية */}
              <View style={{ marginTop: 18 }}>
                <TouchableOpacity style={[styles.mainBtnFull, isParent && { backgroundColor: hasCourseAccess ? '#0F382C' : '#D4AF37' }]} onPress={() => handleCourseClick(course, finalPrice, starsNeeded)}>
                  <Text style={styles.mainBtnText}>{hasCourseAccess ? (isParent ? 'متابعة 📊' : '✔ مشترك') : (isParent ? 'اشترك الآن 💰' : 'انطلق 🚀')}</Text>
                </TouchableOpacity>
              </View>

              {/* مزيد من التفاصيل */}
              <View style={{ marginTop: 18 }}>
                <Text style={{ fontWeight: '900', marginBottom: 6 }}>محتوى الكورس:</Text>
                {(course.curriculum || []).map((unit, idx) => (
                  <View key={idx} style={{ marginBottom: 8 }}>
                    <Text style={{ fontWeight: '800' }}>{unit.title}</Text>
                    <Text style={{ color: '#64748B' }}>{(unit.lessons || []).length} درس</Text>
                  </View>
                ))}
              </View>

              {/* وصف أطول */}
              {course.longDescription && (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ fontWeight: '900', marginBottom: 6 }}>وصف الكورس التفصيلي:</Text>
                  <Text style={{ color: '#475569', lineHeight: 20 }}>{course.longDescription}</Text>
                </View>
              )}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </ImageBackground>
    );
  };

  // 🚀 دالة فتح شاشة تفاصيل الكورس (تنقل مباشر عبر React Navigation)
  const handleViewDetails = useCallback((course) => {
    if (onViewDetailsProp) {
      onViewDetailsProp(course);
      return;
    }

    if (navigation && navigation.navigate) {
      navigation.navigate('CourseDetails', { course });
    }
  }, [onViewDetailsProp, navigation]);

  // إذا كانت هذه الشاشة مفعّلة لعرض كورس مفرد عبر prop، اعرضها الآن
  const routeCourse = route?.params?.course;
  if (propCourse || routeCourse) return renderSingleCourseProp(propCourse || routeCourse);

  if (currentView === 'studentExam') {
    return <StudentExamScreen onBack={() => setCurrentView('home')} user={user} />;
  }

  return (
    <ImageBackground source={currentBg} resizeMode="cover" style={styles.backgroundImage}>
      <SafeAreaView style={[styles.overlay, isParent && styles.parentOverlay]}>
        
        {/* 🌟 الهيدر */}
        <ArchHeader 
          title={isParent ? "بوابة ولي الأمر" : "أَكَادِيمِيَّةُ الهُدَىٰ"} 
          subtitle={isParent 
            ? `مرحباً بك، ${user?.name || 'ولي الأمر'}` 
            : `أهلاً بك يا ${user?.name || 'بطل'}! 🌟`
          } 
        />

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          
          {/* 👤 شريط بيانات المستخدم + رصيد النجوم 🌟 */}
          <View style={[styles.userRow, isParent && styles.parentUserRow]}>
            <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.7}>
              <Text style={styles.logoutText}>تسجيل الخروج ➔</Text>
            </TouchableOpacity>

            <View style={styles.userInfoBox}>
              <View style={styles.starsHeaderBadge}>
                <Text style={styles.starsHeaderBadgeText}>⭐ {userStars}</Text>
              </View>

              <Text style={[styles.roleBadge, isParent && styles.parentRoleBadge]}>
                {isParent ? `👨‍👩‍👧‍👦 ${studentEmoji} ${currentStudent.name}` : '🎈 حساب الطالب'}
              </Text>
            </View>
          </View>

          {!isParent ? (
            <View style={styles.examQuickRow}>
              <TouchableOpacity 
                style={styles.quickExamBtn}
                onPress={() => setCurrentView('studentExam')}
                activeOpacity={0.85}
              >
                <Text style={styles.quickExamBtnText}>📝 الاختبارات والواجبات المتاحة 🚀</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* 📋 قسم تقارير المعلم */}
              <View style={styles.parentResultsContainer}>
                <Text style={styles.parentResultsHeader}>📑 تقارير وملاحظات المعلم ({reportsList.length})</Text>
                
                {reportsList.length === 0 ? (
                  <View style={styles.parentEmptyCard}>
                    <Text style={styles.parentEmptyText}>لا توجد تقارير أو ملاحظات مضافة حتى الآن 📝</Text>
                  </View>
                ) : (
                  reportsList.map((rep, index) => (
                    <ReportCard key={rep.id || index.toString()} report={rep} studentEmoji={studentEmoji} isGirl={isGirl} />
                  ))
                )}
              </View>

              {/* 📊 قسم امتحانات واختبارات الطالب */}
              <View style={styles.parentResultsContainer}>
                <Text style={styles.parentResultsHeader}>📊 متابعة امتحانات واختبارات الطالب 📑</Text>
                
                {(!studentExamResults || studentExamResults.length === 0) ? (
                  <View style={styles.parentEmptyCard}>
                    <Text style={styles.parentEmptyText}>لم يقم الطالب بحل أي اختبارات بعد. ⏳</Text>
                  </View>
                ) : (
                  studentExamResults.map((res, index) => (
                    <ExamResultCard key={res.id || index.toString()} result={res} />
                  ))
                )}
              </View>
            </>
          )}

          <Text style={[styles.sectionTitle, isParent && styles.parentSectionTitle]}>
            {isParent ? '۞ الأقسام التعليمية المتاحة' : '🎈 اختر القسم المفضل لك'}
          </Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
            {CATEGORIES.map((cat, idx) => {
              const isSelected = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.catChip, 
                    isParent && styles.parentCatChip,
                    isSelected && (isParent ? styles.activeParentCatChip : styles.activeStudentCatChip)
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.catText, 
                    isParent && styles.parentCatText,
                    isSelected && styles.activeCatText
                  ]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.sectionTitle, isParent && styles.parentSectionTitle]}>
            {isParent ? '❖ الدورات المقررة' : '🚀 رحلاتنا الإيمانية الممتعة'}
          </Text>

          {filteredCourses?.map((course, index) => (
            <CourseCard
              key={course.id || index.toString()}
              course={course}
              isParent={isParent}
              colorScheme={KID_CARD_COLORS[index % KID_CARD_COLORS.length]}
              onSelect={handleCourseClick}
              onViewDetails={handleViewDetails}
              userStars={userStars}
            />
          ))}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(255, 248, 225, 0.82)' },
  parentOverlay: { backgroundColor: 'rgba(15, 56, 44, 0.92)' },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  bottomSpacer: { height: 30 },
  
  userRow: { 
    flexDirection: 'row-reverse', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  parentUserRow: { borderColor: '#D4AF37', backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  userInfoBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  roleBadge: { color: '#0284C7', fontSize: 13, fontWeight: '800' },
  parentRoleBadge: { color: '#D4AF37' },
  logoutBtn: { padding: 4 },
  logoutText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },

  starsHeaderBadge: {
    backgroundColor: '#FEF08A',
    borderColor: '#EAB308',
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  starsHeaderBadgeText: { color: '#854D0E', fontWeight: '900', fontSize: 12 },

  examQuickRow: { marginVertical: 6 },
  quickExamBtn: {
    backgroundColor: '#FFD700',
    borderColor: '#D4AF37',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  quickExamBtnText: { color: '#0F382C', fontSize: 15, fontWeight: '900' },

  parentResultsContainer: {
    marginVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  parentResultsHeader: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F382C',
    textAlign: 'right',
    marginBottom: 10,
  },
  parentEmptyCard: { padding: 16, alignItems: 'center' },
  parentEmptyText: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  
  parentReportCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderRightWidth: 4,
    borderRightColor: '#16A34A',
  },
  girlReportCard: {
    backgroundColor: '#FFF0F5',
    borderRightColor: '#DB2777',
  },
  reportBadge: {
    backgroundColor: '#DCFCE7',
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  reportBadgeText: { fontSize: 11, fontWeight: '800', color: '#15803D' },
  reportText: { fontSize: 13, color: '#1E293B', fontWeight: '700', textAlign: 'right', lineHeight: 20 },
  reportDate: { fontSize: 10, color: '#64748B', textAlign: 'right', marginTop: 6 },

  parentResultCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderRightWidth: 4,
    borderRightColor: '#0284C7',
  },
  resCardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 },
  resExamTitle: { fontSize: 14, fontWeight: '800', color: '#0F382C' },
  resTypeBadge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  resTypeBadgeRegular: { backgroundColor: '#E0F2FE', borderColor: '#0284C7' },
  resTypeBadgeWeekly: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  resTypeBadgeText: { fontSize: 10, fontWeight: '900' },
  resTypeBadgeRegularText: { color: '#0369A1' },
  resTypeBadgeWeeklyText: { color: '#B45309' },
  resBadge: { fontSize: 11, color: '#166534', fontWeight: 'bold' },
  resQuestion: { fontSize: 12, color: '#334155', textAlign: 'right', marginVertical: 2 },
  resAnswerBox: { backgroundColor: '#FFF', padding: 8, borderRadius: 8, marginVertical: 4 },
  resAnswerText: { fontSize: 13, color: '#0F382C', fontWeight: 'bold', textAlign: 'right' },
  resDate: { fontSize: 10, color: '#94A3B8', textAlign: 'right' },

  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#0284C7', marginVertical: 10, textAlign: 'right' },
  parentSectionTitle: { color: '#FFF8E1' },
  catRow: { flexDirection: 'row-reverse', marginBottom: 14 },
  catChip: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#38BDF8', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginLeft: 8 },
  parentCatChip: { backgroundColor: '#FFF8E1', borderColor: '#D4AF37' },
  activeStudentCatChip: { backgroundColor: '#0284C7', borderColor: '#0284C7' },
  activeParentCatChip: { backgroundColor: '#C5A028', borderColor: '#D4AF37' },
  catText: { color: '#475569', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  parentCatText: { color: '#0F382C' },
  activeCatText: { color: '#FFFFFF' },
  
  courseCard: { borderRadius: 24, padding: 0, marginBottom: 16, borderWidth: 3, elevation: 5, overflow: 'hidden' },
  parentCourseCard: { borderColor: '#D4AF37', backgroundColor: '#FFFFFF' },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  parentBadge: { backgroundColor: '#E6F4EA' },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#0F382C' },
  kidBadgeText: { color: '#1E293B' },
  rating: { color: '#D4AF37', fontWeight: '900', fontSize: 14 },
  
  cardBody: { paddingHorizontal: 16, paddingBottom: 8 },
  courseTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B', textAlign: 'right', marginBottom: 6 },
  parentCourseTitle: { color: '#0F382C' },
  mainBtnFull: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D9488', width: '100%' },
  instructor: { fontSize: 13, color: '#475569', textAlign: 'right', marginBottom: 10 },
  kidInstructor: { color: '#334155', fontWeight: '700' },
  
  starsInfoRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginVertical: 4 },
  starBadge: { backgroundColor: '#FEF08A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#EAB308' },
  starText: { color: '#854D0E', fontWeight: '800', fontSize: 11 },
  topicText: { fontSize: 12, fontWeight: '700' },

  cardFooter: { 
    borderTopWidth: 1.5, 
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
    paddingVertical: 12, 
    paddingHorizontal: 16,
    alignItems: 'center',
    width: '100%'
  },
  parentCardFooter: { borderTopColor: '#E2E8F0' },

  starsDiscountBoxCentered: {
    backgroundColor: '#FEFCE8',
    borderColor: '#EAB308',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  starsDiscountText: { fontSize: 12, fontWeight: '800', color: '#854D0E', textAlign: 'center' },
  boldPrice: { color: '#16A34A', fontWeight: '900' },
  starsDiscountSub: { fontSize: 10, color: '#A16207', textAlign: 'center', marginTop: 2 },

  footerActionRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },

  priceContainer: { 
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  priceColumn: { 
    flexDirection: 'column', 
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  oldPrice: { 
    fontSize: 12, 
    color: '#94A3B8', 
    textDecorationLine: 'line-through', 
    fontWeight: '700',
    marginBottom: 2,
    textAlign: 'right',
  },
  price: { 
    fontSize: 16, 
    fontWeight: '900', 
    color: '#10B981',
    textAlign: 'right',
  },
  parentPrice: { color: '#0F382C' },
  
  actionButtonsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  parentPayBtn: { backgroundColor: '#EAB308' },
  parentProgressBtn: { backgroundColor: '#0F382C' },
  
  detailsBtn: { backgroundColor: '#FFFFFF', borderWidth: 1.5 },
  kidDetailsBtnText: { fontWeight: '900', fontSize: 12 },

  statusText: { fontSize: 12, fontWeight: '800' },
  parentActionBtnText: { color: '#FFFFFF', fontWeight: '900' },
  kidActionBtnText: { color: '#0F382C', fontWeight: '900' },
});