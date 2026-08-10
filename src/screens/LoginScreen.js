import React, { useState, useContext, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ImageBackground, 
  SafeAreaView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import IslamicLogo from '../components/IslamicLogo';

export default function LoginScreen() {
  const [activeTab, setActiveTab] = useState('student'); // 'student' | 'parent'
  const [studentId, setStudentId] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // States الخاصة بالأدمن
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login, saveRememberedCredentials, clearRememberedCredentials, rememberedCredentials } = useContext(AuthContext);

  // استرجاع البيانات المحفوظة عند فتح الشاشة
  useEffect(() => {
    try {
      if (rememberedCredentials) {
        if (rememberedCredentials.role === 'admin') {
          setIsAdminMode(true);
          setAdminUsername(rememberedCredentials.username || '');
          setRememberMe(true);
        } else if (rememberedCredentials.role === 'student' || rememberedCredentials.role === 'parent') {
          setStudentId(rememberedCredentials.studentId || '');
          setActiveTab(rememberedCredentials.role);
          setRememberMe(true);
        }
      }
    } catch (e) {
      console.warn('Failed to load remembered credentials', e);
    }
  }, [rememberedCredentials]);

  const handleLogin = async () => {
    if (isAdminMode) {
      if (!adminUsername.trim() || !adminPassword.trim()) {
        Alert.alert('تنبيه', 'يرجى إدخال اسم المستخدم وكلمة السر للأدمن');
        return;
      }

      const res = await login({
        role: 'admin',
        username: adminUsername.trim(),
        password: adminPassword
      });

      if (res && !res.success) {
        Alert.alert('خطأ في الدخول', res.message || 'بيانات الأدمن غير صحيحة');
        return;
      }

      if (res && res.success) {
        try {
          if (rememberMe) {
            await saveRememberedCredentials({ role: 'admin', username: adminUsername.trim() });
          } else {
            await clearRememberedCredentials();
          }
        } catch (e) {
          console.warn('Remember me save failed for admin', e);
        }
      }

    } else {
      if (!studentId.trim()) {
        Alert.alert('تنبيه', 'يرجى إدخال كود الطالب (ID)');
        return;
      }

      const res = await login({
        role: activeTab, // 'student' أو 'parent'
        studentId: studentId.trim()
      });

      if (res && !res.success) {
        Alert.alert('خطأ في الدخول', res.message || 'كود الطالب غير صحيح أو غير مسجل');
        return;
      } 
      
      if (res && res.success) {
        try {
          if (rememberMe) {
            await saveRememberedCredentials({ role: activeTab, studentId: studentId.trim() });
          } else {
            await clearRememberedCredentials();
          }
        } catch (e) {
          console.warn('Remember me save failed', e);
        }
      }
    }
  };

  // 🎨 خلفيات الشاشة
  const studentBg = { uri: 'https://img.freepik.com/free-vector/hand-drawn-ramadan-kareem-background_23-2149306041.jpg' };
  const parentBg = { uri: 'https://img.freepik.com/free-vector/arabic-pattern-background-gold-style_23-2148810217.jpg' };
  const currentBg = activeTab === 'student' ? studentBg : parentBg;

  return (
    <ImageBackground source={currentBg} resizeMode="cover" style={styles.backgroundImage}>
      <SafeAreaView style={[styles.overlay, activeTab === 'parent' && styles.parentOverlay]}>
        <View style={styles.centerContainer}>
          
          {/* اللوجو */}
          <View style={styles.logoWrapper}>
            <IslamicLogo size="medium" />
          </View>

          {/* بطاقة تسجيل الدخول */}
          <View style={[styles.card, activeTab === 'parent' && styles.parentCard]}>
            {!isAdminMode ? (
              <>
                <View style={styles.tabBar}>
                  <TouchableOpacity
                    style={[styles.tab, activeTab === 'student' && styles.activeTabStudent]}
                    onPress={() => setActiveTab('student')}
                  >
                    <Text style={[styles.tabText, activeTab === 'student' && styles.activeTabText]}>
                      🎈 حساب البطل
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.tab, activeTab === 'parent' && styles.activeTabParent]}
                    onPress={() => setActiveTab('parent')}
                  >
                    <Text style={[styles.tabText, activeTab === 'parent' && styles.activeTabText]}>
                      👨‍👩‍👧‍👦 ولي الأمر
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>
                  {activeTab === 'student' ? '🌟 أدخل كود الطالب البطل:' : '🔑 أدخل كود طالبك المرتبط:'}
                </Text>
                
                <TextInput
                  style={[styles.input, activeTab === 'parent' && styles.parentInput]}
                  placeholder="مثال: STU-101"
                  placeholderTextColor="#A1A1AA"
                  value={studentId}
                  onChangeText={setStudentId}
                  autoCapitalize="characters"
                />

                {/* زر تذكّرني المُصَحّح */}
                <TouchableOpacity 
                  style={styles.rememberRow} 
                  onPress={() => setRememberMe(prev => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]} />
                  <Text style={styles.rememberText}>
                    {rememberMe ? '✅ محفوظ — تذكرني مفعل' : 'تذكرني (دخول بدون كلمة مرور)'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.loginBtn, activeTab === 'parent' && styles.parentLoginBtn]} 
                  onPress={handleLogin}
                >
                  <Text style={styles.loginBtnText}>
                    {activeTab === 'student' ? '🚀 انطلق للتعلم!' : 'دخول ولي الأمر ➔'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.adminTitle}>🛠️ بوابة الإدارة والتطوير</Text>
                
                <TextInput
                  style={styles.input}
                  placeholder="اسم المستخدم (admin) أو البريد الإلكتروني"
                  placeholderTextColor="#A1A1AA"
                  value={adminUsername}
                  onChangeText={setAdminUsername}
                  autoCapitalize="none"
                />
                
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="كلمة السر"
                    secureTextEntry={!showPassword}
                    placeholderTextColor="#A1A1AA"
                    value={adminPassword}
                    onChangeText={setAdminPassword}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(prev => !prev)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={styles.rememberRow} 
                  onPress={() => setRememberMe(prev => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]} />
                  <Text style={styles.rememberText}>
                    {rememberMe ? '✅ محفوظ — تذكرني مفعل' : 'تذكرني (متاح للأدمن)'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
                  <Text style={styles.loginBtnText}>دخول لوحة التحكم ➔</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.adminToggle}
              onPress={() => setIsAdminMode(!isAdminMode)}
            >
              <Text style={styles.adminToggleText}>
                {isAdminMode ? '← العودة لتسجيل الدخول' : 'الدخول كمسؤول النظام'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.footerCreditText}>App created by Scorpion 🦂</Text>
          </View>

        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(255, 248, 225, 0.82)' },
  parentOverlay: { backgroundColor: 'rgba(15, 56, 44, 0.88)' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  logoWrapper: { alignItems: 'center', marginBottom: 16, width: '100%' },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 3,
    borderColor: '#FFD166',
    elevation: 8,
    shadowColor: '#FFB703',
    shadowOpacity: 0.3,
  },
  parentCard: { borderColor: '#D4AF37' },
  tabBar: { flexDirection: 'row-reverse', marginBottom: 18, borderRadius: 14, backgroundColor: '#F1F5F9', padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  activeTabStudent: { backgroundColor: '#0284C7' },
  activeTabParent: { backgroundColor: '#0F382C' },
  tabText: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  activeTabText: { color: '#FFFFFF' },
  label: { fontSize: 14, color: '#1E293B', fontWeight: '700', marginBottom: 8, textAlign: 'right' },
  input: {
    borderWidth: 2,
    borderColor: '#38BDF8',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
    backgroundColor: '#F0F9FF',
    textAlign: 'right',
  },
  parentInput: { borderColor: '#0F382C', backgroundColor: '#F8FAFC' },
  rememberRow: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: 'transparent',
    marginLeft: 8,
  },
  checkboxChecked: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  rememberText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  passwordInputWrapper: { position: 'relative', marginBottom: 16 },
  passwordInput: { paddingRight: 44 },
  passwordToggle: { position: 'absolute', top: 14, left: 14 },
  loginBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#059669',
  },
  parentLoginBtn: { backgroundColor: '#0F382C', borderColor: '#D4AF37' },
  loginBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  adminTitle: { color: '#0F382C', fontWeight: '700', fontSize: 15, textAlign: 'center', marginBottom: 14 },
  adminToggle: { marginTop: 14, alignItems: 'center' },
  adminToggleText: { color: '#64748B', fontSize: 12, textDecorationLine: 'underline' },
  footerCreditText: { marginTop: 18, color: '#94A3B8', fontSize: 11, textAlign: 'center' },
});