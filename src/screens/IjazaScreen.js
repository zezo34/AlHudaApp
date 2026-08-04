import React from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
// افترضت أن هذا هو المسار الصحيح بناءً على هيكلية مشروعك
import { TEAM_MEETING_URL } from '../constants/meetingLinks';

const IJAZA_ITEMS = [
  'إجازة حفص عن عاصم',
  'إجازة عاصم براوييه شعبة وحفص',
  'إجازة قالون عن نافع',
  'إجازة ورش عن نافع',
  'إجازة ابن كثير براوييه',
  'إجازة أبو عمرو براوييه',
  'إجازة ابن عامر براوييه',
  'إجازة حمزة براوييه',
  'إجازة الكسائي براوييه',
  'إجازة أبو جعفر براوييه',
  'إجازة يعقوب براوييه',
  'إجازة خلف العاشر براوييه',
  'إجازة أصحاب الصلة قالون وابن كثير وأبو جعفر',
  'إجازة ابن عامر وعاصم',
  'إجازة الكسائي وخلف العاشر',
  'إجازة أصحاب التوسط ابن عامر وعاصم والكسائي وخلف العاشر',
  'إجازة أصحاب المد ورش وحمزة',
  'إجازة القراءات السبع',
  'إجازة القراءات العشر'
];

export default function IjazaScreen({ onBack }) {
  const handleOpenTeams = async () => {
    try {
      const supported = await Linking.canOpenURL(TEAM_MEETING_URL);
      if (supported) {
        await Linking.openURL(TEAM_MEETING_URL);
      } else {
        Alert.alert('تنبيه', 'لا يمكن فتح الرابط في الجهاز حالياً.');
      }
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ أثناء فتح رابط الإجازة. حاول مرة أخرى.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* الديكورات الخلفية بناءً على الاستايل المزود */}
      <View style={styles.backgroundDecor} pointerEvents="none">
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
        <View style={styles.decorCircle3} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>
          {/* الكارت العلوي - تم إضافة marginTop لإنزاله للأسفل */}
          <View style={styles.headerCard}>
            <Text style={styles.title}>منح الإجازات القرآنية</Text>
            <Text style={styles.paragraph}>
              الحمد لله الذي شرَّف أهل القرآن بحمل كتابه، وجعل الإسناد من خصائص هذه الأمة، والصلاة والسلام على سيدنا محمدٍ أفصح من تلا، وأحسن من قرأ، وعلى آله وصحبه ومن اقتفى أثرهم إلى يوم الدين.
            </Text>
            <Text style={styles.paragraph}>
              أما بعد؛ فهذا قسمُ منح الإجازات، خُصِّص لمن أتمَّ التلقي، وأحكم الأداء، واستوفى شروط الإجازة على الوجه المعتبر عند أهل هذا الشأن، ليُؤذن له برواية ما تلقَّاه، متصلًا سنده بأئمة القراءة (٢٩ مجيزاً) وصولًا إلى سيدنا رسول الله ﷺ.
            </Text>
            <Text style={styles.paragraph}>
              ونسأل الله تعالى أن يجعل هذه الإجازة خالصةً لوجهه الكريم، نافعةً لحاملها، وأن يرزقه الإخلاص في تعليم كتابه، وأن يجعله من أهل القرآن الذين هم أهل الله وخاصته.
            </Text>
            {/* الزر الرئيسي باللون الأخضر الداكن */}
            <TouchableOpacity style={styles.primaryButton} onPress={handleOpenTeams}>
              <Text style={styles.primaryButtonText}>افتح غرفة الإجازة مباشرة</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>قائمة الإجازات المتاحة</Text>
          <View style={styles.itemsGrid}>
            {IJAZA_ITEMS.map((item, index) => (
              /* كروت العناصر باللون الأبيض والحدود الداكنة والترتيب معكوس RTL */
              <TouchableOpacity key={index} style={styles.itemCard} onPress={handleOpenTeams} activeOpacity={0.8}>
                <Text style={styles.itemTitle}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          {/* زر العودة السفلي باللون الأخضر الفاتح */}
          <TouchableOpacity onPress={onBack} style={styles.bottomBackButton}>
            <Text style={styles.bottomBackText}>◀ العودة إلى الصفحة الرئيسية</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F8F5' }, // لون الخلفية الأساسي الموحد
  content: { padding: 16, flexGrow: 1, justifyContent: 'space-between' },
  inner: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#0F382C', marginTop: 20, marginBottom: 12, textAlign: 'right' },
  
  headerCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 22, 
    borderWidth: 2, 
    borderColor: '#0F382C', 
    shadowColor: '#0F382C', 
    shadowOpacity: 0.1, 
    shadowRadius: 12, 
    elevation: 4,
    marginTop: 40, // 👈 القيمة دي اللي نزلت الكارت لتحت
  },
  title: { fontSize: 23, fontWeight: '900', color: '#0F382C', marginBottom: 14, textAlign: 'right' },
  paragraph: { color: '#334155', lineHeight: 24, marginBottom: 14, textAlign: 'right', fontWeight: '500' },
  
  primaryButton: { marginTop: 12, backgroundColor: '#0F382C', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  
  itemsGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 14 },
  
  itemCard: { 
    width: '48%', 
    backgroundColor: '#FFFFFF', 
    borderRadius: 18, 
    paddingVertical: 18, 
    paddingHorizontal: 14, 
    marginBottom: 12, 
    borderWidth: 2, 
    borderColor: '#0F382C', 
    shadowColor: '#0F382C', 
    shadowOpacity: 0.1, 
    shadowRadius: 10, 
    elevation: 2 
  },
  itemTitle: { fontSize: 13, fontWeight: '900', color: '#0F382C', textAlign: 'center' },
  
  footer: { marginTop: 16, paddingBottom: 32, alignItems: 'center' },
  bottomBackButton: { 
    backgroundColor: '#10B981', 
    paddingVertical: 16, 
    paddingHorizontal: 22, 
    borderRadius: 18, 
    width: '100%', 
    alignItems: 'center', 
    shadowColor: '#10B981', 
    shadowOpacity: 0.18, 
    shadowRadius: 12, 
    elevation: 3 
  },
  bottomBackText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  
  // تعديل بسيط في أماكن الديكورات لتناسب النزول الجديد
  backgroundDecor: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  decorCircle1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(15, 56, 44, 0.06)', top: -20, right: -40 },
  decorCircle2: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(16, 185, 129, 0.05)', top: 100, left: -70 },
  decorCircle3: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(110, 231, 183, 0.15)', bottom: -30, right: 40 }
});