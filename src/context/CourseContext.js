import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CourseContext = createContext();

export const INITIAL_COURSES = [
  {
    id: 'c1',
    title: 'المقدمة في أحكام التجويد',
    category: 'القرآن الكريم',
    rating: 4.9,
    price: 350,
    enrolled: false,
    instructor: 'الشيخ أحمد السيد',
    description: 'دورة شاملة لإتقان القواعد الأساسية لتلاوة القرآن الكريم ومخارج الحروف والصفات وتطبيق أحكام النون الساكنة والتنوين.',
    curriculum: [
      { id: 'm1', title: 'الوحدة الأولى: مخارج الحروف', lessons: ['١. مقدمة في المخارج', '٢. حروف الحلق', '٣. حروف اللسان'] },
      { id: 'm2', title: 'الوحدة الثانية: أحكام النون الساكنة', lessons: ['١. الإظهار', '٢. الإدغام', '٣. الإقلاب والإخفاء'] },
    ]
  },
  {
    id: 'c2',
    title: 'اللغة العربية وفهم القرآن',
    category: 'اللغة العربية',
    rating: 4.8,
    price: 450,
    enrolled: false,
    instructor: 'د. طارق الهاشمي',
    description: 'تعلم قواعد النحو والصرف الأساسية والمفردات المباشرة لتذوق وفهم آيات كتاب الله عز وجل.',
    curriculum: [
      { id: 'm1', title: 'الوحدة الأولى: الأسماء والأفعال في القرآن', lessons: ['١. الفرق بين الاسم والفعل', '٢. أوزان الأفعال'] },
    ]
  },
  {
    id: 'c3',
    title: 'السيرة النبوية الشريفة',
    category: 'الدراسات الإسلامية',
    rating: 5.0,
    price: 280,
    enrolled: false,
    instructor: 'الشيخ عمر فاروق',
    description: 'دراسة مستفيضة للعهدين المكي والمدني مع استخلاص العبر والدروس التربوية لحياتنا اليومية.',
    curriculum: [
      { id: 'm1', title: 'الوحدة الأولى: المولد والنشأة', lessons: ['١. عام الفيل', '٢. نشأته وبعثته ﷺ'] },
    ]
  }
];

export const CourseProvider = ({ children }) => {
  const [courses, setCourses] = useState(INITIAL_COURSES);
  const [exams, setExams] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [weeklyQuestion, setWeeklyQuestion] = useState(null);

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const saved = await AsyncStorage.getItem('@course_content');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // نضمن إن الكورسات تنزل دايماً بـ enrolled: false عامة
            const cleaned = parsed.map(c => ({ ...c, enrolled: false }));
            setCourses(cleaned);
          }
        }
      } catch (error) {
        console.warn('Failed to load saved course content', error);
      }
    };
    loadCourses();
  }, []);

  useEffect(() => {
    const saveCourses = async () => {
      try {
        // بنسيف الكورسات من غير ما نسيف حالة الـ enrolled في الـ Storage العام
        const toSave = courses.map(c => ({ ...c, enrolled: false }));
        await AsyncStorage.setItem('@course_content', JSON.stringify(toSave));
      } catch (error) {
        console.warn('Failed to save course content', error);
      }
    };
    saveCourses();
  }, [courses]);

  useEffect(() => {
    const loadWeeklyQuestion = async () => {
      try {
        const savedWeekly = await AsyncStorage.getItem('@weekly_question');
        if (savedWeekly) {
          const parsedWeekly = JSON.parse(savedWeekly);
          if (parsedWeekly && typeof parsedWeekly === 'object') {
            setWeeklyQuestion(parsedWeekly);
          }
        }
      } catch (error) {
        console.warn('Failed to load saved weekly question', error);
      }
    };
    loadWeeklyQuestion();
  }, []);

  useEffect(() => {
    const saveWeeklyQuestion = async () => {
      try {
        await AsyncStorage.setItem('@weekly_question', JSON.stringify(weeklyQuestion));
      } catch (error) {
        console.warn('Failed to save weekly question', error);
      }
    };
    saveWeeklyQuestion();
  }, [weeklyQuestion]);

  const addCourse = (newCourse) => {
    setCourses(prev => [...prev, {
      ...newCourse,
      id: Date.now().toString(),
      enrolled: false,
      category: newCourse.category || 'عام',
      curriculum: newCourse.curriculum || []
    }]);
  };

  const deleteCourse = (courseId) => {
    setCourses(prev => prev.filter(c => c.id !== courseId));
  };

  // الدالة دي ملهاش تأثير عام دلوقتي علشان متبوظش باقي اليوزرات
  const enrollCourse = (courseId) => {
    // تم إيقاف تعديل enrolled على مستوى الكورس العام
  };

  const clearGlobalCourseEnrollments = () => {
    setCourses(prev => prev.map(c => ({ ...c, enrolled: false })));
  };

  // التعديل الرئيسي: الاعتماد الحصري على قائمة مقتنيات الطالب المحددة
  const hasCourseAccess = (course, student = null) => {
    if (!course) return false;
    if (student && Array.isArray(student.purchasedCourseIds)) {
      return student.purchasedCourseIds.includes(course.id);
    }
    return false;
  };

  const addCourseModule = (courseId, moduleTitle, lessons = []) => {
    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      const newUnit = {
        id: `unit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: moduleTitle || `وحدة جديدة ${c.curriculum?.length + 1 || 1}`,
        lessons: Array.isArray(lessons) ? lessons : [lessons]
      };
      return { ...c, curriculum: [...(c.curriculum || []), newUnit] };
    }));
  };

  const deleteCourseModule = (courseId, moduleId) => {
    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      return { ...c, curriculum: (c.curriculum || []).filter(u => u.id !== moduleId) };
    }));
  };

  const addCourseLesson = (courseId, moduleId, lessonText) => {
    const isObjectLesson = lessonText && typeof lessonText === 'object' && !Array.isArray(lessonText);
    const title = isObjectLesson ? (lessonText.title || '').trim() : (typeof lessonText === 'string' ? lessonText.trim() : '');
    if (!isObjectLesson && !title) return;
    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      return {
        ...c,
        curriculum: (c.curriculum || []).map(unit => {
          if (unit.id !== moduleId) return unit;
          const lessonItem = isObjectLesson ? { ...lessonText, title: title || lessonText.pdfName || 'درس جديد' } : title;
          return { ...unit, lessons: [...(unit.lessons || []), lessonItem] };
        })
      };
    }));
  };

  const deleteCourseLesson = (courseId, moduleId, lessonIndex) => {
    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      return {
        ...c,
        curriculum: (c.curriculum || []).map(unit => {
          if (unit.id !== moduleId) return unit;
          return { ...unit, lessons: (unit.lessons || []).filter((_, index) => index !== lessonIndex) };
        })
      };
    }));
  };

  const addExam = (newExam) => {
    setExams(prev => [
      ...prev,
      {
        ...newExam,
        id: Date.now().toString(),
        type: newExam.type || 'essay',
        options: newExam.type === 'mcq' ? (Array.isArray(newExam.options) ? newExam.options : []) : null,
        correctOptionIndex: newExam.type === 'mcq' ? Number(newExam.correctOptionIndex || 0) : null
      }
    ]);
  };

  const deleteExam = (examId) => {
    setExams(prev => prev.filter(e => e.id !== examId));
  };

  const submitExamResult = (result) => {
    const submissionId = Date.now().toString();
    const newResult = {
      ...result,
      id: submissionId,
      submissionId: submissionId,
      type: result.type || 'essay',
      options: result.options || null,
      correctOptionIndex: result.correctOptionIndex != null ? result.correctOptionIndex : null,
      status: result.status || 'قيد المراجعة ⏳',
      submittedAt: new Date().toISOString(),
      date: result.date || new Date().toLocaleDateString('ar-EG')
    };

    setExamResults(prev => [newResult, ...prev]);

    if (result.isWeekly || (weeklyQuestion && result.questionId === weeklyQuestion.id)) {
      setWeeklyQuestion(prev => {
        if (!prev) return null;
        const alreadyAnswered = prev.answers?.some(a => a.studentId === result.studentId);
        if (alreadyAnswered) return prev;

        return {
          ...prev,
          answers: [
            ...(prev.answers || []),
            {
              studentId: result.studentId,
              studentName: result.studentName,
              answer: result.answer || result.studentAnswer,
              date: new Date().toLocaleDateString('ar-EG')
            }
          ]
        };
      });
    }
  };

  const gradeExamAnswer = (submissionId, newStatus, feedbackText) => {
    const targetResult = examResults.find(item => {
      const itemId = item.id || item.submissionId;
      return itemId === submissionId;
    });

    setExamResults(prev =>
      prev.map(item => {
        const itemId = item.id || item.submissionId;
        if (itemId === submissionId) {
          return {
            ...item,
            status: newStatus,
            teacherFeedback: feedbackText
          };
        }
        return item;
      })
    );

    if (!targetResult) return;

    const isWeeklyAnswer = targetResult.isWeekly || (weeklyQuestion && (targetResult.questionId === weeklyQuestion.id || targetResult.examTitle === weeklyQuestion.title));
    if (!isWeeklyAnswer || !weeklyQuestion) return;

    const reviewedAnswerStatus = newStatus || '';
    const answeredStudentId = targetResult.studentId;
    setWeeklyQuestion(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: (prev.answers || []).map(answer => {
          if (answer.studentId === answeredStudentId) {
            return {
              ...answer,
              reviewed: true,
              isReviewed: true,
              status: reviewedAnswerStatus,
              isCorrect: reviewedAnswerStatus.includes('صحيحة') || reviewedAnswerStatus.includes('مقبولة'),
              score: reviewedAnswerStatus.includes('صحيحة') ? (targetResult.rewardStars || targetResult.stars || 15) : 0
            };
          }
          return answer;
        })
      };
    });
  };

  const createWeeklyQuestion = (newQ) => {
    const weeklyObj = {
      id: Date.now().toString(),
      title: newQ.title || newQ.question,
      question: newQ.question || newQ.title,
      rewardStars: Number(newQ.rewardStars || newQ.stars) || 15,
      stars: Number(newQ.rewardStars || newQ.stars) || 15,
      type: newQ.type || 'essay',
      options: newQ.type === 'mcq' ? (Array.isArray(newQ.options) ? newQ.options : []) : null,
      correctOptionIndex: newQ.type === 'mcq' ? Number(newQ.correctOptionIndex || 0) : null,
      answers: [],
      isWeekly: true,
      date: new Date().toLocaleDateString('ar-EG')
    };

    setWeeklyQuestion(weeklyObj);
    setExams(prev => [weeklyObj, ...prev]);
  };

  const deleteWeeklyQuestion = () => {
    setWeeklyQuestion(null);
  };

  const answerWeeklyQuestion = ({ questionId, studentId, studentName, answer }) => {
    if (!weeklyQuestion || weeklyQuestion.id !== questionId) return false;

    const alreadyAnswered = weeklyQuestion.answers?.some(a => a.studentId === studentId);
    if (alreadyAnswered) return false;

    const isMcq = weeklyQuestion.type === 'mcq' && Array.isArray(weeklyQuestion.options) && weeklyQuestion.options.length > 0;
    const selectedOptionIndex = isMcq ? weeklyQuestion.options.findIndex(opt => opt === answer) : null;
    const isCorrect = isMcq && selectedOptionIndex === weeklyQuestion.correctOptionIndex;
    const answerPayload = {
      examTitle: weeklyQuestion.title || 'سؤال الأسبوع',
      question: weeklyQuestion.question || weeklyQuestion.title,
      studentId,
      studentName,
      answer,
      stars: weeklyQuestion.rewardStars || weeklyQuestion.stars || 15,
      rewardStars: weeklyQuestion.rewardStars || weeklyQuestion.stars || 15,
      isWeekly: true,
      type: weeklyQuestion.type || 'essay',
      options: weeklyQuestion.type === 'mcq' ? weeklyQuestion.options : null,
      correctOptionIndex: weeklyQuestion.type === 'mcq' ? weeklyQuestion.correctOptionIndex : null,
      selectedOptionIndex: selectedOptionIndex,
      status: isMcq ? (isCorrect ? 'مقبولة تلقائياً ✅' : 'غير صحيحة تلقائياً ❌') : 'قيد المراجعة ⏳',
      isCorrect: isMcq ? isCorrect : undefined,
      score: isMcq ? (isCorrect ? (weeklyQuestion.rewardStars || weeklyQuestion.stars || 15) : 0) : undefined,
      date: new Date().toLocaleDateString('ar-EG')
    };

    submitExamResult(answerPayload);

    setWeeklyQuestion(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: [
          ...(prev.answers || []),
          {
            studentId,
            studentName,
            answer,
            date: new Date().toLocaleDateString('ar-EG'),
            reviewed: isMcq,
            isReviewed: isMcq,
            status: answerPayload.status,
            isCorrect: answerPayload.isCorrect,
            score: answerPayload.score,
            selectedOptionIndex,
            type: answerPayload.type
          }
        ]
      };
    });

    return true;
  };

  const removeStudentCourseData = (studentId) => {
    if (!studentId) return;

    setExamResults(prev => prev.filter(res => res.studentId !== studentId));
    setWeeklyQuestion(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: (prev.answers || []).filter(answer => answer.studentId !== studentId)
      };
    });
  };

  const hasAnsweredWeeklyQuestion = (studentId) => {
    if (!weeklyQuestion) return false;
    const answeredInWeekly = weeklyQuestion.answers?.some(a => a.studentId === studentId);
    const answeredInResults = examResults.some(r => r.studentId === studentId && (r.isWeekly || r.examTitle === weeklyQuestion.title));
    return Boolean(answeredInWeekly || answeredInResults);
  };

  const getStudentExamResults = (studentId) => {
    return examResults.filter(r => r.studentId === studentId);
  };

  return (
    <CourseContext.Provider
      value={{
        courses,
        setCourses,
        enrollCourse,
        addCourse,
        deleteCourse,
        addCourseModule,
        deleteCourseModule,
        addCourseLesson,
        deleteCourseLesson,
        exams,
        addExam,
        deleteExam,
        examResults,
        submitExamResult,
        gradeExamAnswer,
        removeStudentCourseData,
        clearGlobalCourseEnrollments,
        hasCourseAccess,
        weeklyQuestion,
        createWeeklyQuestion,
        deleteWeeklyQuestion,
        answerWeeklyQuestion,
        hasAnsweredWeeklyQuestion,
        getStudentExamResults
      }}
    >
      {children}
    </CourseContext.Provider>
  );
};

export const useCourses = () => {
  const context = useContext(CourseContext);
  if (!context) {
    throw new Error('useCourses must be used within a CourseProvider');
  }
  return context;
};