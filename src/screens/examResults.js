import React, { useContext } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { CourseContext } from '../context/CourseContext';

export default function ParentDashboardScreen() {
  const { examResults } = useContext(CourseContext);

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>👨‍👩‍👦 متابعة امتحانات إبنك</Text>

      {examResults.length === 0 ? (
        <Text style={{ color: '#777' }}>لم يقم الطالب بحل أي اختبارات بعد.</Text>
      ) : (
        examResults.map((res) => (
          <View key={res.id} style={{ backgroundColor: '#E0F2FE', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#0284C7' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0369A1' }}>{res.examTitle}</Text>
            <Text style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>الطالب: {res.studentName}</Text>
            <Text style={{ fontSize: 13, color: '#0F382C', marginTop: 4, fontWeight: 'bold' }}>إجابة الطالب: {res.answer}</Text>
            <Text style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>الحالة: {res.status} ({res.date})</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}