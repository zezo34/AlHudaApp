import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { AuthContext } from '../context/AuthContext';

export default function ParentProgressScreen({ course, onBack, onOpenContent, student }) {
  const { getCourseProgress } = useContext(AuthContext);
  const studentId = student?.studentId || student?.id;
  const totalLessons = course?.curriculum ? course.curriculum.reduce((acc, u) => acc + (u.lessons ? u.lessons.length : 0), 0) : 0;

  const progress = getCourseProgress(studentId, course.id) || { completedLessons: 0, completedList: [] };
  const completedLessons = progress.completedLessons || 0;

  const percent = totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;

  // Build human-readable list of completed lesson titles
  const completedTitles = [];
  (course.curriculum || []).forEach((unit, ui) => {
    (unit.lessons || []).forEach((lesson, li) => {
      const lessonId = `${course.id}::${unit.id || ui}::${li}`;
      if ((progress.completedList || []).includes(lessonId)) {
        completedTitles.push(`${unit.title} › ${lesson}`);
      }
    });
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>✖ إغلاق</Text></TouchableOpacity>
        <Text style={styles.title}>متابعة تقدم: {course.title}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>إجمالي الدروس: {totalLessons}</Text>
        <Text style={styles.label}>دروس مكتملة الآن: {completedLessons}</Text>

        <View style={{ marginTop: 18 }}>
          <Text style={styles.percent}>النسبة المكتملة: {percent}%</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ fontWeight: '900', marginBottom: 8 }}>الدروس المكتملة</Text>
          {completedTitles.length === 0 ? (
            <Text style={{ color: '#64748B' }}>لم يتم إنهاء أي درس بعد.</Text>
          ) : (
            completedTitles.map((t, i) => (
              <Text key={i} style={{ color: '#374151', marginBottom: 4 }}>• {t}</Text>
            ))
          )}
        </View>

        <View style={{ marginTop: 26 }}>
          <Text style={{ fontWeight: '900', marginBottom: 8 }}>أدوات للطالب</Text>
          <TouchableOpacity style={styles.pinBtn} onPress={() => onOpenContent?.(course)}>
            <Text style={styles.pinText}>📌 فتح المحتوى للطالب</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#E6EEF9' },
  back: { color: '#0F382C', fontWeight: '900' },
  title: { fontWeight: '900', color: '#0F382C' },
  body: { padding: 16 },
  label: { color: '#475569', fontWeight: '800', marginBottom: 6 },
  input: { backgroundColor: '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', width: 120, textAlign: 'center' },
  saveBtn: { backgroundColor: '#0D9488', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, marginLeft: 8 },
  saveText: { color: '#fff', fontWeight: '900' },
  percent: { fontWeight: '900', marginBottom: 8 },
  progressTrack: { height: 12, backgroundColor: '#E6EEF9', borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: 12, backgroundColor: '#10B981' },
  pinBtn: { marginTop: 8, backgroundColor: '#FDE68A', padding: 12, borderRadius: 10, alignItems: 'center' },
  pinText: { fontWeight: '900', color: '#92400E' }
});