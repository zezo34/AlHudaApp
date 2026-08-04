// components/RecitationReportCard.jsx
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const RecitationReportCard = memo(({ reportData, isParent }) => {
  if (!reportData) return null;

  const { rating = 0, mistakesCount = 0, mistakesList = [], notes = '' } = reportData;

  // ألوان التقييم
  const getRatingColor = () => {
    if (rating >= 90) return { border: '#10B981', bg: '#DCFCE7', text: '#15803D' }; // أخضر
    if (rating >= 75) return { border: '#F59E0B', bg: '#FEF3C7', text: '#B45309' }; // أصفر
    return { border: '#EF4444', bg: '#FEE2E2', text: '#B91C1C' }; // أحمر
  };

  const theme = getRatingColor();

  return (
    <View style={[styles.cardContainer, { borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.scoreBadge, { backgroundColor: theme.bg }]}>
          <Text style={[styles.scoreText, { color: theme.text }]}>{rating}%</Text>
        </View>
        <Text style={styles.cardTitle}>📊 تقرير التسميع الذكي (AI)</Text>
      </View>

      <Text style={styles.subText}>
        {isParent ? 'تقييم الآلي لمستوى الطالب في الجلسة الأخيرة:' : 'نتيجة تحليل قراءتك وتسميعك بالذكاء الاصطناعي:'}
      </Text>

      {/* عدد الأخطاء */}
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>عدد الأخطاء المكتشفة:</Text>
        <Text style={[styles.infoValue, mistakesCount > 0 && { color: '#EF4444' }]}>
          {mistakesCount === 0 ? '✨ لا يوجد أخطاء (تلاوة ممتازة)' : `${mistakesCount} أخطاء`}
        </Text>
      </View>

      {/* قائمة الأخطاء إن وجدت */}
      {mistakesList.length > 0 && (
        <View style={styles.mistakesBox}>
          <Text style={styles.mistakesTitle}>❌ أبرز الملاحظات/الأخطاء:</Text>
          {mistakesList.map((mistake, index) => (
            <Text key={index} style={styles.mistakeItem}>
              • {mistake}
            </Text>
          ))}
        </View>
      )}

      {/* نصيحة البوت */}
      {notes !== '' && (
        <View style={styles.notesBox}>
          <Text style={styles.notesTitle}>💡 نصيحة المساعد الذكي:</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginVertical: 10,
    borderWidth: 2,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  scoreText: { fontSize: 16, fontWeight: '800' },
  subText: { fontSize: 12, color: '#64748B', textAlign: 'right', marginBottom: 12 },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: { fontSize: 13, color: '#334155', fontWeight: '600' },
  infoValue: { fontSize: 13, color: '#10B981', fontWeight: 'bold' },
  mistakesBox: { marginTop: 10, backgroundColor: '#FEF2F2', padding: 10, borderRadius: 8 },
  mistakesTitle: { fontSize: 12, fontWeight: 'bold', color: '#991B1B', textAlign: 'right', marginBottom: 4 },
  mistakeItem: { fontSize: 12, color: '#7F1D1D', textAlign: 'right', lineHeight: 18 },
  notesBox: { marginTop: 10, backgroundColor: '#F0FDF4', padding: 10, borderRadius: 8 },
  notesTitle: { fontSize: 12, fontWeight: 'bold', color: '#166534', textAlign: 'right', marginBottom: 2 },
  notesText: { fontSize: 12, color: '#15803D', textAlign: 'right', lineHeight: 18 },
});

export default RecitationReportCard;