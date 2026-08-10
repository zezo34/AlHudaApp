import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import * as Data from '../services/supabaseDataService';
import { onTableChange, debounce } from '../services/realtimeService';

/**
 * CourseContext — now backed by Supabase with an offline-first local cache.
 *
 * The public API is unchanged (same functions / state), so every screen keeps
 * working as before. There is NO mock data anymore:
 *   - courses / exams / examResults / weeklyQuestion all come from Supabase
 *     (served instantly from the AsyncStorage cache when offline).
 *   - Every mutation is written locally first (optimistic) and synced to
 *     Supabase in the background; failed writes are queued and replayed later.
 */

export const CourseContext = createContext();

/* Server rows win over local ones; rows that exist only locally (created
 * offline, still queued) are kept so they don't disappear from the UI.
 * Keyed on the canonical (server) id so local text ids match their server
 * uuids — no duplicate rows after a realtime refresh. */
function mergeById(serverList, localList) {
  const map = new Map();
  const keyOf = (r) => (r && r.id != null ? Data.toCanonicalId(r.id) : null);
  (localList || []).forEach((r) => {
    const k = keyOf(r);
    if (k) map.set(k, r);
  });
  (serverList || []).forEach((r) => {
    const k = keyOf(r);
    if (k) map.set(k, r); // server wins
  });
  return Array.from(map.values());
}

export const CourseProvider = ({ children }) => {
  const [courses, setCourses] = useState([]);
  const [exams, setExams] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [weeklyQuestion, setWeeklyQuestion] = useState(null);

  // Hydration guard + last-saved snapshot, used by the debounced auto-save below
  const hydratedRef = useRef(false);
  const lastSavedCoursesRef = useRef(null);

  // Tombstones for rows deleted on THIS device during this session. They block
  // realtime refreshes from re-merging the row back while its DELETE is still
  // in flight (and afterwards — course/exam ids are unique per creation, so a
  // deleted id never legitimately reappears). Without this, the optimistic
  // removal "blinks" back because the server still has the row for a moment.
  const deletedCourseIdsRef = useRef(new Set());
  const deletedExamIdsRef = useRef(new Set());
  const isDeletedCourse = (id) => id != null && deletedCourseIdsRef.current.has(Data.toCanonicalId(id));
  const isDeletedExam = (id) => id != null && deletedExamIdsRef.current.has(Data.toCanonicalId(id));

  /* --------------------- initial load (cache -> server) --------------------- */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let finalCourses = [];
      const localCourses = [];
      const localExams = [];
      try {
        const cached = await Data.loadCachedState();
        if (cancelled) return;
        if (cached.courses?.length) {
          finalCourses = cached.courses;
          localCourses.push(...cached.courses);
          setCourses(cached.courses);
        }
        if (cached.exams?.length) {
          localExams.push(...cached.exams);
          setExams(cached.exams);
          const weekly = cached.exams.find((e) => e.isWeekly);
          if (weekly) setWeeklyQuestion(weekly);
        }
        if (cached.examResults?.length) setExamResults(cached.examResults);
      } catch (e) {
        console.warn('Failed to load cached course state', e);
      }

      try {
        const fresh = await Data.refreshAllFromServer();
        if (!cancelled && fresh) {
          const serverCourses = fresh.courses || [];
          const serverCourseIds = new Set(serverCourses.map((c) => Data.toCanonicalId(c.id)));
          // ارفع/احتفظ بس بالكورسات اللي لسه ليها كتابة معلّقة على الجهاز ده
          // (اتعملت أوفرلاين ومتزامنتش). أي كورس ناقص من السيرفر من غير كتابة
          // معلّقة معناه إنه اتمسح على جهاز تاني — ممنوع نرجّعه للداتابيز ولا
          // حتى نسيّبه ظاهر في الواجهة (ده كان بيخلّي الحذف يرجع تاني عبر
          // الأجهزة، والجهاز التاني كان بيحمّل الدورة المحذوفة تاني).
          const keptLocalCourses = [];
          for (const c of localCourses) {
            if (!c || !c.id) continue;
            if (serverCourseIds.has(Data.toCanonicalId(c.id))) {
              keptLocalCourses.push(c);
              continue;
            }
            if (await Data.hasPendingWrite('courses', c.id)) {
              Data.saveCourse(c);
              Data.saveCourseLessons(c);
              keptLocalCourses.push(c);
            }
            // else: محذوفة من على جهاز تاني — نتجاهلها (مش هنرفعها ولا هنعرضها)
          }
          finalCourses = mergeById(serverCourses, keptLocalCourses);
          setCourses(finalCourses);

          // نفس المنطق للاختبارات: أي اختبار محلي ناقص من السيرفر من غير كتابة
          // معلّقة (اتمسح على جهاز تاني) ممنوع يتُرفع تاني للداتابيز عشان
          // الحذف يتزامن فعلًا على كل الأجهزة.
          const serverExams = fresh.exams || [];
          const serverExamIds = new Set(serverExams.map((e) => Data.toCanonicalId(e.id)));
          const serverWeeklyId = serverExams.find((e) => e.isWeekly)
            ? Data.toCanonicalId(serverExams.find((e) => e.isWeekly).id)
            : null;
          const keptLocalExams = [];
          for (const e of localExams) {
            if (!e || !e.id) continue;
            if (serverExamIds.has(Data.toCanonicalId(e.id))) {
              keptLocalExams.push(e);
              continue;
            }
            // سؤال أسبوع قديم اتمسح/اتبدل بسؤال جديد على السيرفر — مش نرجعه
            if (e.isWeekly && serverWeeklyId) continue;
            if (await Data.hasPendingWrite('exams', e.id)) {
              Data.saveExam(e);
              keptLocalExams.push(e);
            }
          }
          const finalExams = mergeById(serverExams, keptLocalExams);
          setExams(finalExams);
          setWeeklyQuestion(finalExams.find((e) => e.isWeekly) || null);
          setExamResults((prev) => mergeById(fresh.examResults || [], prev));
        }
      } catch (e) {
        console.warn('Failed to refresh course state from server', e);
      }

      Data.flushPendingWrites();
      hydratedRef.current = true;
      lastSavedCoursesRef.current = JSON.stringify(finalCourses);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* 🔴 Realtime sync: reflect database changes instantly, no refresh needed.
   * DELETE events remove the row right away (the plain merge below would keep
   * local rows the server no longer has, so a course/exam deleted on another
   * device would stay visible here forever). */
  useEffect(() => {
    const refreshCourses = debounce(async (payload) => {
      if (payload && payload.eventType === 'DELETE' && payload.old && payload.old.id) {
        const removedId = payload.old.id;
        await Data.removeCachedRow(Data.CACHE_NAMES.courses, removedId);
        setCourses((prev) =>
          prev.filter(
            (c) => !(c && c.id != null && Data.toCanonicalId(c.id) === Data.toCanonicalId(removedId))
          )
        );
        return;
      }
      // keep the lessons cache fresh so the curriculum merge below is accurate
      await Data.refreshTableFromServer('lessons');
      const server = await Data.refreshTableState('courses');
      if (!server) return;
      // filter out rows this device deleted in-session (delete still in flight)
      const kept = server.filter((c) => !isDeletedCourse(c.id));
      setCourses((prev) => mergeById(kept, prev).filter((c) => !isDeletedCourse(c.id)));
      // Prevent the debounced auto-save from re-writing unchanged server data
      // (which would otherwise echo back and re-trigger this effect).
      lastSavedCoursesRef.current = JSON.stringify(kept);
    }, 400);

    const refreshExams = debounce(async (payload) => {
      if (payload && payload.eventType === 'DELETE' && payload.old && payload.old.id) {
        const removedId = payload.old.id;
        await Data.removeCachedRow(Data.CACHE_NAMES.exams, removedId);
        setExams((prev) =>
          prev.filter(
            (e) => !(e && e.id != null && Data.toCanonicalId(e.id) === Data.toCanonicalId(removedId))
          )
        );
        setWeeklyQuestion((prev) =>
          prev && Data.toCanonicalId(prev.id) === Data.toCanonicalId(removedId) ? null : prev
        );
        return;
      }
      const server = await Data.refreshTableState('exams');
      if (!server) return;
      const kept = server.filter((e) => !isDeletedExam(e.id));
      setExams((prev) => mergeById(kept, prev).filter((e) => !isDeletedExam(e.id)));
      setWeeklyQuestion(kept.find((e) => e.isWeekly) || null);
    }, 400);

    const refreshResults = debounce(async (payload) => {
      if (payload && payload.eventType === 'DELETE' && payload.old && payload.old.id) {
        const removedId = payload.old.id;
        await Data.removeCachedRow(Data.CACHE_NAMES.examResults, removedId);
        setExamResults((prev) =>
          prev.filter(
            (r) => !(r && r.id != null && Data.toCanonicalId(r.id) === Data.toCanonicalId(removedId))
          )
        );
        return;
      }
      const server = await Data.refreshTableState('examResults');
      if (server) setExamResults((prev) => mergeById(server, prev));
    }, 400);

    const unsubscribers = [
      onTableChange('courses', refreshCourses),
      onTableChange('lessons', refreshCourses),
      onTableChange('exams', refreshExams),
      onTableChange('exam_results', refreshResults),
    ];
    return () => unsubscribers.forEach((un) => un && un());
  }, []);

  /*
   * Debounced auto-save: some screens mutate `courses` directly through the
   * raw `setCourses` (e.g. attaching PDFs to lessons in the admin dashboard).
   * This effect persists only the courses that actually changed, so those
   * edits reach Supabase too. Mutation helpers above already persist
   * immediately; this only catches the direct setCourses path.
   */
  useEffect(() => {
    if (!hydratedRef.current) return;
    const snapshot = JSON.stringify(courses);
    if (snapshot === lastSavedCoursesRef.current) return;

    const timer = setTimeout(() => {
      const prev = lastSavedCoursesRef.current ? JSON.parse(lastSavedCoursesRef.current) : [];
      lastSavedCoursesRef.current = JSON.stringify(courses);
      courses.forEach((c) => {
        const before = prev.find((p) => p && p.id === c.id);
        if (JSON.stringify(before) !== JSON.stringify(c)) {
          Data.saveCourse(c);
          Data.saveCourseLessons(c);
        }
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [courses]);

  /* ----------------------------- course helpers ----------------------------- */

  const mutateCourse = (courseId, transform) => {
    const target = courses.find((c) => c.id === courseId);
    if (!target) return;
    const updated = transform(target);
    setCourses((prev) => prev.map((c) => (c.id === courseId ? updated : c)));
    Data.saveCourse(updated);
    Data.saveCourseLessons(updated);
  };

  const addCourse = (newCourse) => {
    const created = {
      ...newCourse,
      id: newCourse.id || Date.now().toString(),
      enrolled: false,
      category: newCourse.category || 'عام',
      curriculum: newCourse.curriculum || [],
    };
    setCourses((prev) => [...prev, created]);
    Data.saveCourse(created);
    Data.saveCourseLessons(created);
  };

  const deleteCourse = (courseId) => {
    // tombstone the id so realtime refreshes can't merge the row back mid-delete
    if (courseId) deletedCourseIdsRef.current.add(Data.toCanonicalId(courseId));
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    Data.deleteCourseRow(courseId);
    Data.deleteLessonsForCourse(courseId);
  };

  const enrollCourse = () => {
    // Enrollment is decided per student (purchasedCourseIds); no-op kept for API compatibility.
  };

  const clearGlobalCourseEnrollments = () => {
    setCourses((prev) => prev.map((c) => ({ ...c, enrolled: false })));
  };

  const hasCourseAccess = (course, student = null) => {
    if (!course) return false;
    if (student && Array.isArray(student.purchasedCourseIds)) {
      return student.purchasedCourseIds.includes(course.id);
    }
    return false;
  };

  const addCourseModule = (courseId, moduleTitle, lessons = []) => {
    mutateCourse(courseId, (c) => {
      const newUnit = {
        id: `unit_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: moduleTitle || `وحدة جديدة ${(c.curriculum?.length || 0) + 1}`,
        lessons: Array.isArray(lessons) ? lessons : [lessons],
      };
      return { ...c, curriculum: [...(c.curriculum || []), newUnit] };
    });
  };

  const deleteCourseModule = (courseId, moduleId) => {
    mutateCourse(courseId, (c) => ({
      ...c,
      curriculum: (c.curriculum || []).filter((u) => u.id !== moduleId),
    }));
  };

  const addCourseLesson = (courseId, moduleId, lessonText) => {
    const isObjectLesson = lessonText && typeof lessonText === 'object' && !Array.isArray(lessonText);
    const title = isObjectLesson ? (lessonText.title || '').trim() : typeof lessonText === 'string' ? lessonText.trim() : '';
    if (!isObjectLesson && !title) return;

    mutateCourse(courseId, (c) => ({
      ...c,
      curriculum: (c.curriculum || []).map((unit) => {
        if (unit.id !== moduleId) return unit;
        const lessonItem = isObjectLesson ? { ...lessonText, title: title || lessonText.pdfName || 'درس جديد' } : title;
        return { ...unit, lessons: [...(unit.lessons || []), lessonItem] };
      }),
    }));
  };

  const deleteCourseLesson = (courseId, moduleId, lessonIndex) => {
    mutateCourse(courseId, (c) => ({
      ...c,
      curriculum: (c.curriculum || []).map((unit) => {
        if (unit.id !== moduleId) return unit;
        return { ...unit, lessons: (unit.lessons || []).filter((_, index) => index !== lessonIndex) };
      }),
    }));
  };

  /* ------------------------------- exams ------------------------------------ */

  const addExam = (newExam) => {
    const created = {
      ...newExam,
      id: newExam.id || Date.now().toString(),
      type: newExam.type || 'essay',
      options: newExam.type === 'mcq' ? (Array.isArray(newExam.options) ? newExam.options : []) : null,
      correctOptionIndex: newExam.type === 'mcq' ? Number(newExam.correctOptionIndex || 0) : null,
    };
    setExams((prev) => [created, ...prev]);
    Data.saveExam(created);
  };

  const deleteExam = (examId) => {
    // tombstone the id so realtime refreshes can't merge the row back mid-delete
    if (examId) deletedExamIdsRef.current.add(Data.toCanonicalId(examId));
    setExams((prev) => prev.filter((e) => e.id !== examId));
    Data.deleteExamRow(examId);
    // امسح نتائج الاختبار كمان (محلياً + من الداتابيز) عشان ما تفضلش
    // "إجابات يتيمة" بتظهر على كل الأجهزة بعد حذف الاختبار نفسه.
    setExamResults((prev) => prev.filter((r) => (r.examId || r.questionId) !== examId));
    Data.deleteExamResultsByExam(examId);
  };

  /* --------------------------- exam results --------------------------------- */

  const submitExamResult = (result) => {
    const submissionId = result.id || Date.now().toString();
    // نحسب ما إذا كانت الإجابة لسؤال الأسبوع قبل بناء الكائن، عشان نثبّتها في
    // النتيجة نفسها (بتتزامن مع الداتابيز وتظهر كتصنيف "سؤال الأسبوع" للأدمن
    // حتى لو الطالب جاوب عليه من شاشة الاختبارات العادية)
    const isWeeklySubmission =
      result.isWeekly || (weeklyQuestion && result.questionId === weeklyQuestion.id);
    const newResult = {
      ...result,
      id: submissionId,
      submissionId,
      isWeekly: Boolean(isWeeklySubmission),
      type: result.type || 'essay',
      options: result.options || null,
      correctOptionIndex: result.correctOptionIndex != null ? result.correctOptionIndex : null,
      status: result.status || 'قيد المراجعة ⏳',
      submittedAt: result.submittedAt || new Date().toISOString(),
      date: result.date || new Date().toLocaleDateString('ar-EG'),
    };

    setExamResults((prev) => [newResult, ...prev]);
    Data.saveExamResult(newResult);

    if (isWeeklySubmission && weeklyQuestion) {
      const alreadyAnswered = (weeklyQuestion.answers || []).some((a) => a.studentId === result.studentId);
      if (!alreadyAnswered) {
        const nextWeekly = {
          ...weeklyQuestion,
          answers: [
            ...(weeklyQuestion.answers || []),
            {
              studentId: result.studentId,
              studentName: result.studentName,
              answer: result.answer || result.studentAnswer,
              date: new Date().toLocaleDateString('ar-EG'),
              reviewed: result.isCorrect !== undefined,
              isReviewed: result.isCorrect !== undefined,
              status: result.status,
              isCorrect: result.isCorrect,
              score: result.score,
              selectedOptionIndex: result.selectedOptionIndex != null ? result.selectedOptionIndex : null,
              type: result.type,
            },
          ],
        };
        setWeeklyQuestion(nextWeekly);
        setExams((prev) => prev.map((e) => (e.id === nextWeekly.id ? nextWeekly : e)));
        Data.saveExam(nextWeekly);
      }
    }
  };

  const gradeExamAnswer = (submissionId, newStatus, feedbackText) => {
    const targetResult = examResults.find((item) => (item.id || item.submissionId) === submissionId);
    if (!targetResult) return;

    const updated = { ...targetResult, status: newStatus, teacherFeedback: feedbackText };
    setExamResults((prev) =>
      prev.map((item) => ((item.id || item.submissionId) === submissionId ? updated : item))
    );
    Data.saveExamResult(updated);

    const reviewedStatus = newStatus || '';
    // التحديث ده بيتعمل بس لما الإجابة تخص سؤال الأسبوع النشط فعلاً (نفس الـ id)
    // — عشان مراجعة إجابة لسؤال أسبوع قديم متعدلشش إجابات السؤال الجديد.
    const isWeeklyAnswer =
      weeklyQuestion &&
      (targetResult.questionId === weeklyQuestion.id || targetResult.examId === weeklyQuestion.id);

    if (isWeeklyAnswer && weeklyQuestion) {
      const answeredStudentId = targetResult.studentId;
      const nextWeekly = {
        ...weeklyQuestion,
        answers: (weeklyQuestion.answers || []).map((answer) => {
          if (answer.studentId !== answeredStudentId) return answer;
          return {
            ...answer,
            reviewed: true,
            isReviewed: true,
            status: newStatus,
            isCorrect: reviewedStatus.includes('صحيحة') || reviewedStatus.includes('مقبولة'),
            score: reviewedStatus.includes('صحيحة') ? targetResult.rewardStars || targetResult.stars || 15 : 0,
          };
        }),
      };
      setWeeklyQuestion(nextWeekly);
      setExams((prev) => prev.map((e) => (e.id === nextWeekly.id ? nextWeekly : e)));
      Data.saveExam(nextWeekly);
    }
  };

  const removeStudentCourseData = (studentId) => {
    if (!studentId) return;

    setExamResults((prev) => prev.filter((res) => res.studentId !== studentId));
    Data.deleteExamResultsByStudent(studentId);

    if (weeklyQuestion) {
      const nextWeekly = {
        ...weeklyQuestion,
        answers: (weeklyQuestion.answers || []).filter((a) => a.studentId !== studentId),
      };
      setWeeklyQuestion(nextWeekly);
      setExams((prev) => prev.map((e) => (e.id === nextWeekly.id ? nextWeekly : e)));
      Data.saveExam(nextWeekly);
    }
  };

  /* --------------------------- weekly question ------------------------------ */

  const createWeeklyQuestion = (newQ) => {
    // لو فيه سؤال أسبوع قديم لسه موجود في الداتابيز، امسح صفه (مش نتائجه —
    // دي تفضل تاريخ قابل للمراجعة) قبل نشر الجديد. كده يفضل سؤال أسبوع واحد
    // نشط على كل الأجهزة ومفيش جهاز يفضل شايف سؤال قديم (الريلتايم بيلاقي
    // أول isWeekly بس).
    if (weeklyQuestion && weeklyQuestion.id) {
      deletedExamIdsRef.current.add(Data.toCanonicalId(weeklyQuestion.id));
      Data.deleteExamRow(weeklyQuestion.id);
    }
    const weeklyObj = {
      id: newQ.id || Date.now().toString(),
      title: newQ.title || newQ.question,
      question: newQ.question || newQ.title,
      rewardStars: Number(newQ.rewardStars || newQ.stars) || 15,
      stars: Number(newQ.rewardStars || newQ.stars) || 15,
      type: newQ.type || 'essay',
      options: newQ.type === 'mcq' ? (Array.isArray(newQ.options) ? newQ.options : []) : null,
      correctOptionIndex: newQ.type === 'mcq' ? Number(newQ.correctOptionIndex || 0) : null,
      answers: [],
      isWeekly: true,
      date: new Date().toLocaleDateString('ar-EG'),
    };

    setWeeklyQuestion(weeklyObj);
    setExams((prev) => [weeklyObj, ...prev.filter((e) => !e.isWeekly)]);
    Data.saveExam(weeklyObj);
  };

  const deleteWeeklyQuestion = () => {
    if (weeklyQuestion) {
      deletedExamIdsRef.current.add(Data.toCanonicalId(weeklyQuestion.id));
      Data.deleteExamRow(weeklyQuestion.id);
      // إجابات سؤال الأسبوع بتتمسح معاه كمان (الزر بيقول "مسح نهائي") عشان
      // الإجابات الواردة تختفي من كل الأجهزة بنفس اللحظة.
      Data.deleteExamResultsByExam(weeklyQuestion.id);
      setExamResults((prev) => prev.filter((r) => (r.examId || r.questionId) !== weeklyQuestion.id));
    }
    setWeeklyQuestion(null);
    setExams((prev) => prev.filter((e) => !e.isWeekly));
  };

  const answerWeeklyQuestion = ({ questionId, studentId, studentName, answer }) => {
    if (!weeklyQuestion || weeklyQuestion.id !== questionId) return false;

    const alreadyAnswered = (weeklyQuestion.answers || []).some((a) => a.studentId === studentId);
    if (alreadyAnswered) return false;

    const isMcq = weeklyQuestion.type === 'mcq' && Array.isArray(weeklyQuestion.options) && weeklyQuestion.options.length > 0;
    const selectedOptionIndex = isMcq ? weeklyQuestion.options.findIndex((opt) => opt === answer) : null;
    const isCorrect = isMcq && selectedOptionIndex === weeklyQuestion.correctOptionIndex;

    const answerPayload = {
      examTitle: weeklyQuestion.title || 'سؤال الأسبوع',
      question: weeklyQuestion.question || weeklyQuestion.title,
      questionId: weeklyQuestion.id,
      examId: weeklyQuestion.id,
      studentId,
      studentName,
      answer,
      stars: weeklyQuestion.rewardStars || weeklyQuestion.stars || 15,
      rewardStars: weeklyQuestion.rewardStars || weeklyQuestion.stars || 15,
      isWeekly: true,
      type: weeklyQuestion.type || 'essay',
      options: weeklyQuestion.type === 'mcq' ? weeklyQuestion.options : null,
      correctOptionIndex: weeklyQuestion.type === 'mcq' ? weeklyQuestion.correctOptionIndex : null,
      selectedOptionIndex,
      status: isMcq ? (isCorrect ? 'مقبولة تلقائياً ✅' : 'غير صحيحة تلقائياً ❌') : 'قيد المراجعة ⏳',
      isCorrect: isMcq ? isCorrect : undefined,
      score: isMcq ? (isCorrect ? weeklyQuestion.rewardStars || weeklyQuestion.stars || 15 : 0) : undefined,
      date: new Date().toLocaleDateString('ar-EG'),
    };

    submitExamResult(answerPayload);
    return true;
  };

  const hasAnsweredWeeklyQuestion = (studentId) => {
    if (!weeklyQuestion) return false;
    const answeredInWeekly = (weeklyQuestion.answers || []).some((a) => a.studentId === studentId);
    const answeredInResults = examResults.some(
      (r) => r.studentId === studentId && (r.isWeekly || r.examTitle === weeklyQuestion.title)
    );
    return Boolean(answeredInWeekly || answeredInResults);
  };

  /** يعرض بس نتائج الاختبارات اللي بتخص طالب واحد بالظبط — عشان لوحة ولي
   *  الأمر تفضل مقصورة على ابنه/ابنته ومتظهرشش إجابات طلاب تانيين.
   *  بيماتش على كل المعرفات اللي ممكن تحملها النتيجة: الكود العام (STU-xxx)،
   *  الـ id الداخلي للبروفايل، وللنتائج القديمة اللي متسجلة قبل ما يبقى فيه
   *  student_id — بنقع على اسم الطالب كبديل آمن. */
  const getStudentExamResults = (student) => {
    const s = student || {};
    const code = s.studentId ? String(s.studentId).trim().toUpperCase() : null;
    const internalId = s.id ? String(s.id).trim().toUpperCase() : null;
    const name = s.name ? String(s.name).trim().toLowerCase() : null;
    return examResults.filter((r) => {
      const rid = r.studentId ? String(r.studentId).trim().toUpperCase() : null;
      if (rid && code && rid === code) return true;
      if (rid && internalId && rid === internalId) return true;
      // نتائج قديمة بدون student_id: المطابقة بالاسم فقط كبديل (مقيد بطفل ولي الأمر نفسه)
      if (!rid && name && r.studentName && String(r.studentName).trim().toLowerCase() === name) {
        return true;
      }
      return false;
    });
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
        getStudentExamResults,
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
