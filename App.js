import React, { useEffect, useContext, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, BackHandler, Alert } from 'react-native';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { CourseProvider } from './src/context/CourseContext';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import CourseDetailsScreen from './src/screens/CourseDetailsScreen';

function MainNavigator() {
  const { user, logout } = useContext(AuthContext);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // 📱 التحكم في زراير الرجوع
  useEffect(() => {
    const onBackPress = () => {
      if (selectedCourse) {
        setSelectedCourse(null); // الرجوع من شاشة التفاصيل للشاشة الرئيسية
        return true;
      }

      if (!user) {
        Alert.alert(
          "خروج من التطبيق 🚪",
          "هل تريد إغلاق التطبيق بالفعل؟",
          [
            { text: "إلغاء", style: "cancel" },
            { text: "خروج", onPress: () => BackHandler.exitApp() }
          ]
        );
        return true;
      }

      logout();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [user, selectedCourse]);

  if (!user) return <LoginScreen />;
  if (user.role === 'admin') return <AdminDashboardScreen />;

  // 🏠 الشاشة الرئيسية مع دعم عرض تفاصيل كورس كنافذة عائمة (لا تغير تصميم الـ Home بالكامل)
  return (
    <>
      <HomeScreen 
        onViewDetailsProp={(course) => setSelectedCourse(course)}
        onSelectCourse={(course) => setSelectedCourse(course)}
      />

      {/* إذا تم اختيار كورس، اعرض شاشة التفاصيل كنافذة فوقية بدل استبدال الشاشة الرئيسية */}
      {selectedCourse && (
        <CourseDetailsScreen 
          course={selectedCourse} 
          onBack={() => setSelectedCourse(null)} 
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CourseProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#0F382C" />
          <MainNavigator />
        </SafeAreaView>
      </CourseProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
});