import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 💳 1. بيانات الباقة ونظام الاشتراك المحفوظة
  const [subscriptionData, setSubscriptionData] = useState({
    isSubActive: true,
    title: 'الاشتراك الشهري الشامل',
    price: '199',
    description: 'احصل على وصول غير محدود لكافة الكورسات والفرق الصوتية باشتراك واحد.'
  });

  // 👥 قاعدة البيانات
  const [studentsDatabase, setStudentsDatabase] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  
  // 📬 نظام الإشعارات للأولياء
  const [parentNotifications, setParentNotifications] = useState([]);

  // 📌 Remember-me support state
  const [rememberedCredentials, setRememberedCredentials] = useState(null);
  const ADMIN_SECURE_KEY = 'admin_remember';

  // 🛡️ حساب الأدمن الأساسي
  const adminAccount = {
    id: '999',
    name: 'المعلم محمود ساطور',
    role: 'admin',
    username: 'admin',
    password: 'admin'
  };

  // 📥 2. تحميل كل البيانات المحفوظة عند فتح الأبلكيشن
  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const savedSub = await AsyncStorage.getItem('@subscription_data');
        const savedStudents = await AsyncStorage.getItem('@students_database');
        const savedLeaves = await AsyncStorage.getItem('@leave_requests');
        const savedParentNotifs = await AsyncStorage.getItem('@parent_notifications');

        if (savedSub) setSubscriptionData(JSON.parse(savedSub));
        let parsedStudentsList = null;
        
        if (savedStudents) {
          const parsed = JSON.parse(savedStudents);
          const cleaned = (Array.isArray(parsed) ? parsed : []).map((s) => {
            const copy = { ...s };
            if (copy.courseProgress) delete copy.courseProgress;
            return copy;
          });
          parsedStudentsList = cleaned;

          try {
            const globalSub = savedSub ? JSON.parse(savedSub) : subscriptionData;
            if (globalSub && globalSub.isSubActive === false) {
              const deactivated = cleaned.map(st => ({ ...st, isSubscribed: false, subscriptionExpiry: null, subscriptionStart: null }));
              parsedStudentsList = deactivated;
              setStudentsDatabase(deactivated);
            } else {
              parsedStudentsList = cleaned;
              setStudentsDatabase(cleaned);
            }
          } catch (e) {
            setStudentsDatabase(cleaned);
          }
        }
        
        if (savedLeaves) setLeaveRequests(JSON.parse(savedLeaves));
        if (savedParentNotifs) setParentNotifications(JSON.parse(savedParentNotifs));

        // Load remembered credentials for auto-login
        try {
          const adminSecure = await SecureStore.getItemAsync(ADMIN_SECURE_KEY);
          if (adminSecure) {
            const parsedAdmin = JSON.parse(adminSecure);
            setRememberedCredentials(parsedAdmin);
            if (parsedAdmin && parsedAdmin.role === 'admin' && parsedAdmin.username && parsedAdmin.username.toLowerCase() === adminAccount.username.toLowerCase()) {
              setUser(adminAccount);
            }
          } else {
            const savedRemembered = await AsyncStorage.getItem('@remembered_credentials');
            if (savedRemembered) {
              try {
                const parsed = JSON.parse(savedRemembered);
                setRememberedCredentials(parsed);

                if (parsed && (parsed.role === 'student' || parsed.role === 'parent') && parsed.studentId && parsedStudentsList) {
                  const targetId = parsed.studentId.trim().toUpperCase();
                  const found = parsedStudentsList.find(s => (s.studentId || '').trim().toUpperCase() === targetId);
                  if (found) {
                    const currentRole = parsed.role === 'parent' ? 'parent' : 'student';
                    setUser({
                      ...found,
                      studentDbId: found.id,
                      name: currentRole === 'parent' ? `ولي أمر ${found.name}` : found.name,
                      studentName: found.name,
                      role: currentRole,
                      gender: found.gender || 'boy',
                      stars: found.stars || 0,
                      isSubscribed: Boolean(found.isSubscribed),
                      subscriptionExpiry: found.subscriptionExpiry || null,
                      reports: found.reports || []
                    });
                  }
                }
              } catch (e) { /* ignore parse errors */ }
            }
          }
        } catch (e) {
          const savedRemembered = await AsyncStorage.getItem('@remembered_credentials');
          if (savedRemembered) {
            try {
              const parsed = JSON.parse(savedRemembered);
              setRememberedCredentials(parsed);
            } catch (err) {/* ignore */}
          }
        }

      } catch (error) {
        console.error('خطأ في تحميل البيانات:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadStoredData();
  }, []);

  // 💾 3. حفظ مستمر وتلقائي لأي تغيير بيحصل
  useEffect(() => {
    if (!isLoaded) return;

    const saveData = async () => {
      try {
        await AsyncStorage.setItem('@subscription_data', JSON.stringify(subscriptionData));
        const studentsToPersist = (studentsDatabase || []).map(s => {
          const copy = { ...s };
          if (copy.courseProgress) delete copy.courseProgress;
          return copy;
        });
        await AsyncStorage.setItem('@students_database', JSON.stringify(studentsToPersist));
        await AsyncStorage.setItem('@leave_requests', JSON.stringify(leaveRequests));
        await AsyncStorage.setItem('@parent_notifications', JSON.stringify(parentNotifications));
      } catch (error) {
        console.error('خطأ في الحفظ:', error);
      }
    };

    saveData();
  }, [subscriptionData, studentsDatabase, leaveRequests, parentNotifications, isLoaded]);

  // Helpers to save/clear remembered credentials
  const saveRememberedCredentials = async (payload) => {
    try {
      if (payload && payload.role === 'admin') {
        await SecureStore.setItemAsync(ADMIN_SECURE_KEY, JSON.stringify(payload));
      } else {
        await AsyncStorage.setItem('@remembered_credentials', JSON.stringify(payload));
      }
      setRememberedCredentials(payload);
    } catch (e) {
      console.warn('Failed to save remembered credentials', e);
    }
  };

  const clearRememberedCredentials = async () => {
    try {
      await AsyncStorage.removeItem('@remembered_credentials');
      await SecureStore.deleteItemAsync(ADMIN_SECURE_KEY);
      setRememberedCredentials(null);
    } catch (e) {
      console.warn('Failed to clear remembered credentials', e);
    }
  };

  // 🛠️ 4. دالة تحديث بيانات الباقة من الأدمن
  const updateSubscriptionData = (newData) => {
    setSubscriptionData((prev) => {
      const merged = { ...prev, ...newData };
      try {
        if (newData && Object.prototype.hasOwnProperty.call(newData, 'isSubActive') && merged.isSubActive === false) {
          setStudentsDatabase(prevStudents => prevStudents.map(st => ({
            ...st,
            isSubscribed: false,
            subscriptionExpiry: null,
            subscriptionStart: null
          })));
        }
      } catch (e) {
        console.warn('Failed to enforce global subscription deactivation', e);
      }
      return merged;
    });
  };

  // 🔄 المزامنة الحية بين الـ Database وحساب الطالب الحالي
  useEffect(() => {
    if (user && (user.role === 'student' || user.role === 'parent')) {
      const latestData = studentsDatabase.find(
        (st) => st.id === user.studentDbId || st.studentId === user.studentId
      );

      if (latestData) {
        setUser((prev) => {
          if (
            prev.isSubscribed === latestData.isSubscribed &&
            prev.stars === latestData.stars &&
            prev.subscriptionExpiry === latestData.subscriptionExpiry &&
            JSON.stringify(prev.reports) === JSON.stringify(latestData.reports)
          ) {
            return prev;
          }

          return {
            ...prev,
            ...latestData,
            name: prev.role === 'parent' ? `ولي أمر ${latestData.name}` : latestData.name,
            studentName: latestData.name,
            isSubscribed: Boolean(latestData.isSubscribed),
          };
        });
      }
    }
  }, [studentsDatabase]);

  // 🚀 تفعيل/إلغاء اشتراك طالب فردي
  const subscribeUser = (studentId, expiryDate = null, status = true) => {
    if (!studentId) return;

    const isObj = expiryDate && typeof expiryDate === 'object' && (expiryDate.start || expiryDate.expiry);
    const startVal = isObj ? expiryDate.start || null : null;
    const expiryVal = isObj ? expiryDate.expiry || null : expiryDate;

    setStudentsDatabase((prevStudents) =>
      prevStudents.map((st) => {
        if (st.id === studentId || st.studentId === studentId) {
          return {
            ...st,
            isSubscribed: Boolean(status),
            subscriptionStart: startVal || st.subscriptionStart || null,
            subscriptionExpiry: expiryVal
          };
        }
        return st;
      })
    );

    setUser((prevUser) => {
      if (prevUser && (prevUser.id === studentId || prevUser.studentId === studentId)) {
        return {
          ...prevUser,
          isSubscribed: Boolean(status),
          subscriptionStart: startVal || prevUser.subscriptionStart || null,
          subscriptionExpiry: expiryVal
        };
      }
      return prevUser;
    });
  };

  // ➕ إضافة طالب جديد
  const addStudent = (nameOrObject, customId = null, gender = 'boy', initialReport = '') => {
    let name = '';
    let studentCustomId = customId;
    let studentGender = gender;
    let reportText = initialReport;

    if (typeof nameOrObject === 'object' && nameOrObject !== null) {
      name = nameOrObject.name || '';
      studentCustomId = nameOrObject.studentId || customId;
      studentGender = nameOrObject.gender || gender;
      reportText = nameOrObject.initialReport || initialReport;
    } else {
      name = nameOrObject || '';
    }

    if (!name.trim()) {
      return { success: false, message: 'يرجى إدخال اسم الطالب!' };
    }

    const autoGeneratedId = `STU-${100 + studentsDatabase.length + 1}`;
    const newStudentId = (studentCustomId?.trim() || autoGeneratedId).toUpperCase();

    const exists = studentsDatabase.some(
      (s) => s.studentId && s.studentId.toUpperCase() === newStudentId
    );

    if (exists) {
      return { success: false, message: 'كود الطالب (ID) مستخدم بالفعل! اختر كوداً آخر.' };
    }

    const newStudent = {
      id: Date.now().toString(),
      name: name.trim(),
      role: 'student',
      studentId: newStudentId,
      gender: studentGender,
      stars: 0,
      isSubscribed: false,
      subscriptionExpiry: null,
      reports: reportText?.trim() ? [
        {
          id: Date.now().toString() + '-init',
          text: reportText.trim(),
          date: new Date().toLocaleDateString('ar-EG')
        }
      ] : []
    };

    setStudentsDatabase((prevStudents) => [...prevStudents, newStudent]);
    return { success: true, student: newStudent, message: 'تمت إضافة الطالب بنجاح! 🎉' };
  };

  // 🌟 النجوم
  const addStarsToStudent = (studentId, starsAmount = 10) => {
    if (!studentId) return;

    setStudentsDatabase((prevStudents) =>
      prevStudents.map((st) => {
        if (st.id === studentId || st.studentId === studentId) {
          const updatedStars = Math.max(0, (st.stars || 0) + starsAmount);
          return { ...st, stars: updatedStars };
        }
        return st;
      })
    );

    setUser((prevUser) => {
      if (prevUser && (prevUser.id === studentId || prevUser.studentId === studentId)) {
        return { ...prevUser, stars: Math.max(0, (prevUser.stars || 0) + starsAmount) };
      }
      return prevUser;
    });
  };

  // 🛍️ خصم النجوم
  const useStarsForDiscount = (studentId, starsToUse) => {
    if (!studentId || starsToUse <= 0) {
      return { success: false, message: 'بيانات غير صالحة!' };
    }

    const targetStudent = studentsDatabase.find(
      (st) => st.id === studentId || st.studentId === studentId
    );

    const currentStars = targetStudent ? (targetStudent.stars || 0) : (user?.stars || 0);

    if (currentStars < starsToUse) {
      return { 
        success: false, 
        message: `رصيد النجوم غير كافٍ! لديك ${currentStars} نجمة والمطلوب ${starsToUse} نجمة.` 
      };
    }

    addStarsToStudent(studentId, -starsToUse);
    return { success: true, message: `تم استخدام ${starsToUse} نجمة بنجاح! 🎁` };
  };

  // ➕ الإجازات
  const addLeaveRequest = (newRequest) => {
    if (!newRequest) return { success: false, message: 'بيانات غير صالحة' };

    const targetStudentId = newRequest.studentId || user?.studentId || user?.id;
    const targetStudentName = newRequest.studentName || user?.studentName || user?.name || 'طالب';

    const requestWithDetails = {
      id: `vac_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      title: newRequest.title || 'طلب يوم إجازة (بريك) 🌴',
      reason: newRequest.reason || 'بدون سبب مذكور',
      cost: Number(newRequest.cost) || 30,
      requestedBy: newRequest.requestedBy || user?.role || 'student',
      studentId: targetStudentId,
      studentName: targetStudentName,
      status: 'قيد المراجعة ⏳',
      date: new Date().toLocaleDateString('ar-EG'),
      createdAt: Date.now()
    };

    setLeaveRequests((prevRequests) => [requestWithDetails, ...prevRequests]);

    return { 
      success: true, 
      message: 'تم إرسال طلب الإجازة بنجاح! 🎉',
      request: requestWithDetails 
    };
  };

  // 🔄 تحديث الإجازات
  const updateLeaveStatus = (leaveId, newStatus) => {
    if (!leaveId || !newStatus) return;

    setLeaveRequests((prevRequests) => {
      const targetRequest = prevRequests.find((req) => req.id === leaveId);
      if (!targetRequest) return prevRequests;

      if (newStatus === 'مقبولة ✅' && targetRequest.status !== 'مقبولة ✅') {
        const cost = targetRequest.cost || 30;
        addStarsToStudent(targetRequest.studentId, -cost);
      }

      return prevRequests.map((req) => {
        if (req.id === leaveId) {
          return {
            ...req,
            status: newStatus,
            updatedAt: new Date().toISOString()
          };
        }
        return req;
      });
    });
  };

  // 📝 التقارير
  const addStudentReport = (studentId, reportText) => {
    if (!reportText?.trim()) return;

    const newReport = {
      id: Date.now().toString(),
      text: reportText.trim(),
      date: new Date().toLocaleDateString('ar-EG'),
    };

    setStudentsDatabase((prevStudents) =>
      prevStudents.map((st) => {
        if (st.id === studentId || st.studentId === studentId) {
          const updatedReports = [newReport, ...(st.reports || [])];
          return { ...st, reports: updatedReports };
        }
        return st;
      })
    );
  };

  // 🗑️ حذف تقرير
  const deleteStudentReport = (studentId, reportId) => {
    setStudentsDatabase((prevStudents) =>
      prevStudents.map((st) => {
        if (st.id === studentId || st.studentId === studentId) {
          return {
            ...st,
            reports: (st.reports || []).filter((r) => r.id !== reportId)
          };
        }
        return st;
      })
    );
  };

  // 📊 إدارة تقدم الطالب في كل كورس
  const setCourseProgress = (studentId, courseId, completedLessonsOrList) => {
    if (!studentId || !courseId) return;

    const isArray = Array.isArray(completedLessonsOrList);
    const list = isArray ? completedLessonsOrList : null;
    const count = isArray ? (completedLessonsOrList || []).length : (Number(completedLessonsOrList) || 0);

    setStudentsDatabase((prevStudents) =>
      prevStudents.map((st) => {
        if (st.id === studentId || st.studentId === studentId) {
          const prevProgress = st.courseProgress || {};
          const existing = prevProgress[courseId] || {};
          const updatedEntry = {
            completedLessons: count,
            completedList: list || existing.completedList || [],
            updatedAt: new Date().toISOString()
          };
          const updated = { ...prevProgress, [courseId]: updatedEntry };
          return { ...st, courseProgress: updated };
        }
        return st;
      })
    );
  };

  const getCourseProgress = (studentId, courseId) => {
    if (!studentId || !courseId) return null;
    const st = studentsDatabase.find(s => s.id === studentId || s.studentId === studentId);
    if (!st) return null;
    return (st.courseProgress && st.courseProgress[courseId]) || null;
  };

  // 🔑 تسجيل الدخول
  const login = (credentials) => {
    if (!credentials) {
      return { success: false, message: 'برجاء إدخال البيانات!' };
    }

    const inputUsername = credentials.username?.trim().toLowerCase();
    const inputPassword = credentials.password?.trim();
    const inputStudentId = credentials.studentId?.trim().toUpperCase();

    if (credentials.role === 'admin' || inputUsername) {
      if (
        adminAccount.username.toLowerCase() === inputUsername &&
        adminAccount.password === inputPassword
      ) {
        setUser(adminAccount);
        return { success: true };
      }
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة!' };
    }

    if (credentials.role === 'student' || credentials.role === 'parent' || inputStudentId) {
      const foundUser = studentsDatabase.find(
        (u) => u.studentId?.trim().toUpperCase() === inputStudentId
      );

      if (foundUser) {
        const currentRole = credentials.role || 'student';
        const displayName = currentRole === 'parent' 
          ? `ولي أمر ${foundUser.name}` 
          : foundUser.name;

        setUser({ 
          ...foundUser, 
          studentDbId: foundUser.id,
          name: displayName,
          studentName: foundUser.name,
          role: currentRole,
          gender: foundUser.gender || 'boy',
          stars: foundUser.stars || 0,
          isSubscribed: Boolean(foundUser.isSubscribed),
          subscriptionExpiry: foundUser.subscriptionExpiry || null,
          reports: foundUser.reports || []
        });

        return { success: true };
      }
      return { success: false, message: 'كود الطالب غير صحيح أو غير مسجل!' };
    }

    return { success: false, message: 'يرجى تحديد نوع الحساب وإدخال البيانات!' };
  };

  const logout = async () => {
    setUser(null);
    await clearRememberedCredentials();
  };

  // 📬 إضافة إشعار عند إكمال الطالب لدرس
  const addParentNotification = (parentId, message, courseTitle, studentName) => {
    const notification = {
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      parentId,
      message,
      courseTitle,
      studentName,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    setParentNotifications((prev) => [notification, ...prev]);
  };

  const markNotificationAsRead = (notificationId) => {
    setParentNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
  };

  const deleteNotification = (notificationId) => {
    setParentNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const getParentNotifications = (parentId) => {
    return parentNotifications.filter((n) => n.parentId === parentId);
  };

  const cancelSubscriptionForStudent = (studentId) => {
    if (!studentId) return;
    setStudentsDatabase(prev => prev.map(st => (st.id === studentId || st.studentId === studentId) ? { ...st, isSubscribed: false, subscriptionExpiry: null, subscriptionStart: null } : st));
  };

  const setSubscriptionPrice = (newPrice) => {
    setSubscriptionData(prev => ({ ...prev, price: String(newPrice) }));
  };

  // -----------------------------
  // Reward wheel: تعريف الجوائز و منطق السحب
  // -----------------------------
  const rewardDefinitions = [
    // each reward has an id, label, type and weight (probability weight)
    { id: 'points_small', label: '+10 نقاط', type: 'points', amount: 10, weight: 40 },
    { id: 'points_medium', label: '+25 نقاط', type: 'points', amount: 25, weight: 25 },
    { id: 'points_big', label: '+50 نقاط', type: 'points', amount: 50, weight: 10 },
    { id: 'badge_new', label: 'وسام جديد ✨', type: 'badge', badgeId: 'starter-badge', weight: 8 },
    { id: 'temp_profile_theme', label: 'تغيير شكل ملف مؤقت 🎭', type: 'tempProfile', style: { borderColor: '#F59E0B' }, durationHours: 24, weight: 10 },
    { id: 'double_points', label: 'فرصة مضاعفة النقاط (ساعتين) ⚡', type: 'doublePoints', durationMinutes: 120, weight: 7 }
  ];

  const chooseWeightedRandom = (items) => {
    const total = (items || []).reduce((s, it) => s + (it.weight || 0), 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      r -= (it.weight || 0);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  // Apply a granted reward to a student and persist it in studentsDatabase
  const grantRewardToStudent = (studentId, reward) => {
    if (!studentId || !reward) return null;

    setStudentsDatabase(prev => {
      return prev.map(st => {
        if (st.id === studentId || st.studentId === studentId) {
          const copy = { ...st };

          // ensure arrays exist
          copy.badges = Array.isArray(copy.badges) ? copy.badges : (copy.badges ? [copy.badges] : []);

          if (reward.type === 'points') {
            const add = Number(reward.amount) || 0;
            copy.stars = Math.max(0, (copy.stars || 0) + add);
          } else if (reward.type === 'badge') {
            const id = reward.badgeId || `badge_${Date.now()}`;
            if (!copy.badges.includes(id)) copy.badges.push(id);
          } else if (reward.type === 'tempProfile') {
            // set a temporary profile style with expiry
            const expiresAt = Date.now() + ((reward.durationHours || 24) * 60 * 60 * 1000);
            copy.tempProfile = { style: reward.style || {}, expiresAt };
          } else if (reward.type === 'doublePoints') {
            const expiresAt = Date.now() + ((reward.durationMinutes || 120) * 60 * 1000);
            copy.doublePointsUntil = expiresAt;
          }

          // record a reward history entry
          copy.rewardHistory = Array.isArray(copy.rewardHistory) ? copy.rewardHistory : [];
          copy.rewardHistory.unshift({ id: `rw_${Date.now()}`, rewardId: reward.id, label: reward.label, grantedAt: new Date().toISOString() });

          return copy;
        }
        return st;
      });
    });

    // update current user object if it refers to the same student
    setUser(prev => {
      if (!prev) return prev;
      if (prev.id === studentId || prev.studentId === studentId) {
        const updated = { ...prev };
        if (reward.type === 'points') {
          updated.stars = Math.max(0, (updated.stars || 0) + (Number(reward.amount) || 0));
        } else if (reward.type === 'badge') {
          updated.badges = Array.isArray(updated.badges) ? updated.badges : (updated.badges ? [updated.badges] : []);
          const id = reward.badgeId || `badge_${Date.now()}`;
          if (!updated.badges.includes(id)) updated.badges.push(id);
        } else if (reward.type === 'tempProfile') {
          const expiresAt = Date.now() + ((reward.durationHours || 24) * 60 * 60 * 1000);
          updated.tempProfile = { style: reward.style || {}, expiresAt };
        } else if (reward.type === 'doublePoints') {
          const expiresAt = Date.now() + ((reward.durationMinutes || 120) * 60 * 1000);
          updated.doublePointsUntil = expiresAt;
        }

        updated.rewardHistory = Array.isArray(updated.rewardHistory) ? updated.rewardHistory : [];
        updated.rewardHistory.unshift({ id: `rw_${Date.now()}`, rewardId: reward.id, label: reward.label, grantedAt: new Date().toISOString() });

        return updated;
      }
      return prev;
    });

    return reward;
  };

  // Public function: run the reward wheel for a student (returns the reward chosen)
  const spinRewardWheel = (studentId) => {
    const picked = chooseWeightedRandom(rewardDefinitions);
    if (!picked) return null;
    // grant and return
    grantRewardToStudent(studentId, picked);
    return picked;
  };

  // Helper: choose an index (and item) according to weights so UI can target a segment
  const chooseRewardIndex = () => {
    const items = rewardDefinitions;
    const total = (items || []).reduce((s, it) => s + (it.weight || 0), 0);
    if (total <= 0 || items.length === 0) return { index: -1, picked: null };
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= (items[i].weight || 0);
      if (r <= 0) return { index: i, picked: items[i] };
    }
    return { index: items.length - 1, picked: items[items.length - 1] };
  };

  // -----------------------------
  // Habit-tree (شجرة الحفظ): تتبع ممارسات الطالب اليومية وبناء الشجرة
  // -----------------------------
  const normalizeDateKey = (d) => {
    const dt = (d ? new Date(d) : new Date());
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`; // YYYY-MM-DD
  };

  // compute days difference between two date keys
  const daysBetweenKeys = (aKey, bKey) => {
    if (!aKey || !bKey) return Infinity;
    const a = new Date(aKey + 'T00:00:00');
    const b = new Date(bKey + 'T00:00:00');
    const ms = Math.abs(b - a);
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  };

  // Record that the student practiced on a given date (defaults to today).
  // Returns the updated tree state for the student.
  const recordDailyPractice = (studentId, when = Date.now()) => {
    if (!studentId) return null;
    const key = normalizeDateKey(when);

    // update studentsDatabase
    setStudentsDatabase(prev => {
      return prev.map(st => {
        if (st.id === studentId || st.studentId === studentId) {
          const copy = { ...st };
          copy.practiceDates = Array.isArray(copy.practiceDates) ? copy.practiceDates : [];
          if (!copy.practiceDates.includes(key)) {
            copy.practiceDates.unshift(key);
            // keep only recent 365 entries to bound size
            if (copy.practiceDates.length > 365) copy.practiceDates = copy.practiceDates.slice(0, 365);
          }
          copy.lastPracticeDate = copy.practiceDates[0] || null;

          // compute streak: consecutive days up to lastPracticeDate
          const datesSet = new Set(copy.practiceDates);
          let streak = 0;
          let cur = new Date(copy.lastPracticeDate + 'T00:00:00');
          while (true) {
            const curKey = normalizeDateKey(cur);
            if (datesSet.has(curKey)) {
              streak += 1;
              // go back one day
              cur = new Date(cur.getTime() - (24 * 60 * 60 * 1000));
            } else {
              break;
            }
          }
          copy.streak = streak;

          // compute missed days since last practice relative to today
          const todayKey = normalizeDateKey(new Date());
          const daysSinceLast = daysBetweenKeys(copy.lastPracticeDate, todayKey);
          const missedDays = Math.max(0, daysSinceLast - 0); // days not including today if lastPractice today -> 0

          // compute tree stage from streak
          // stages: 0 seed, 1-2 sprout, 3-6 sapling, 7-13 young tree, 14+ mature
          let stage = 'seed';
          if (streak >= 14) stage = 'mature';
          else if (streak >= 7) stage = 'young';
          else if (streak >= 3) stage = 'sapling';
          else if (streak >= 1) stage = 'sprout';

          // leaves logic: baseLeaves by stage, subtract missedDays (cap at 0)
          const baseLeavesByStage = { seed: 0, sprout: 3, sapling: 5, young: 7, mature: 9 };
          const baseLeaves = baseLeavesByStage[stage] || 0;
          const leaves = Math.max(0, baseLeaves - Math.max(0, missedDays));

          copy.tree = { stage, leaves, lastUpdated: Date.now(), lastPracticeDate: copy.lastPracticeDate };

          // update current user if matches
          if (user && (user.id === studentId || user.studentId === studentId)) {
            setUser(prevUser => ({ ...prevUser, practiceDates: copy.practiceDates, streak: copy.streak, tree: copy.tree, lastPracticeDate: copy.lastPracticeDate }));
          }

          return copy;
        }
        return st;
      });
    });

    // return computed tree for convenience (fetch from latest studentsDatabase)
    const st = studentsDatabase.find(s => s.id === studentId || s.studentId === studentId);
    return st ? (st.tree || null) : null;
  };

  const getTreeState = (studentId) => {
    if (!studentId) return null;
    const st = studentsDatabase.find(s => s.id === studentId || s.studentId === studentId);
    if (!st) return { stage: 'seed', leaves: 0, streak: 0 };
    return { stage: st.tree?.stage || 'seed', leaves: st.tree?.leaves || 0, streak: st.streak || 0, lastPracticeDate: st.lastPracticeDate || null };
  };

  // -----------------------------
  // Expose the reward and tree APIs via context
  // -----------------------------

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        studentsDatabase, 
        leaveRequests,
        parentNotifications,
        subscriptionData, 
        updateSubscriptionData, 
        subscribeUser,
        addLeaveRequest,
        updateLeaveStatus,
        login, 
        logout, 
        addStudent,
        addStudentReport,
        deleteStudentReport,
        addStarsToStudent,
        useStarsForDiscount,
        setCourseProgress,
        getCourseProgress,
        addParentNotification,
        markNotificationAsRead,
        deleteNotification,
        getParentNotifications,
        cancelSubscriptionForStudent,
        setSubscriptionPrice,
        // reward APIs
        rewardDefinitions,
        spinRewardWheel,
        chooseRewardIndex,
        grantRewardToStudent,
        // tree APIs
        recordDailyPractice,
        getTreeState,
        rememberedCredentials,
        saveRememberedCredentials,
        clearRememberedCredentials
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};