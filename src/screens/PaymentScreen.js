import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { CourseContext } from '../context/CourseContext';

export default function PaymentScreen({ route, navigation }) {
  const { courseId } = route.params;
  const { courses, enrollCourse } = useContext(CourseContext);
  const [method, setMethod] = useState('card');
  const [success, setSuccess] = useState(false);

  const course = courses.find(c => c.id === courseId);

  const handlePay = () => {
    enrollCourse(courseId);
    setSuccess(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Secure Payment</Text>

      {/* Order Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>Order Summary</Text>
        <Text style={styles.courseName}>{course?.title}</Text>
        <View style={styles.priceRow}>
          <Text style={{ color: '#64748B' }}>Total Amount:</Text>
          <Text style={styles.totalPrice}>${course?.price.toFixed(2)}</Text>
        </View>
      </View>

      {/* Payment Options */}
      <Text style={styles.sectionTitle}>Select Payment Method</Text>
      <View style={styles.methodRow}>
        {['card', 'apple_pay', 'fawry'].map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.methodBtn, method === m && styles.selectedMethod]}
            onPress={() => setMethod(m)}
          >
            <Text style={styles.methodText}>
              {m === 'card' ? '💳 Card' : m === 'apple_pay' ? ' Pay' : '📱 Fawry/Wallet'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Inputs */}
      {method === 'card' && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Cardholder Name" />
          <TextInput style={styles.input} placeholder="Card Number (4111 ....)" keyboardType="numeric" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="MM/YY" />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="CVC" keyboardType="numeric" />
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.payBtn} onPress={handlePay}>
        <Text style={styles.payBtnText}>Pay Securely ${course?.price.toFixed(2)}</Text>
      </TouchableOpacity>

      {/* Success Modal */}
      <Modal visible={success} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={{ fontSize: 40 }}>✦ ☪ ✦</Text>
            <Text style={styles.modalTitle}>Enrollment Confirmed!</Text>
            <Text style={styles.modalSub}>May Allah grant you beneficial knowledge.</Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => {
                setSuccess(false);
                navigation.navigate('Home');
              }}
            >
              <Text style={styles.modalBtnText}>Start Learning</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA', padding: 20, paddingTop: 50 },
  header: { fontSize: 22, fontWeight: '700', color: '#0F382C', marginBottom: 20 },
  summaryCard: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#D4AF37', borderRadius: 14, padding: 16, marginBottom: 20 },
  cardTitle: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  courseName: { color: '#0F382C', fontSize: 16, fontWeight: '700', marginTop: 4 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  totalPrice: { color: '#D4AF37', fontWeight: '700', fontSize: 18 },
  sectionTitle: { color: '#0F382C', fontWeight: '700', marginBottom: 10 },
  methodRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  methodBtn: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  selectedMethod: { borderColor: '#0F382C', borderWidth: 2, backgroundColor: '#F0FDF4' },
  methodText: { fontWeight: '600', fontSize: 12 },
  form: { marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#0F382C', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#FFFFFF' },
  payBtn: { backgroundColor: '#0F382C', paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#D4AF37' },
  payBtnText: { color: '#D4AF37', fontWeight: '700', fontSize: 16 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, alignItems: 'center', width: '100%', borderWidth: 2, borderColor: '#D4AF37' },
  modalTitle: { color: '#0F382C', fontSize: 20, fontWeight: '700', marginTop: 12 },
  modalSub: { color: '#64748B', textAlign: 'center', marginTop: 6, marginBottom: 20 },
  modalBtn: { backgroundColor: '#0F382C', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 10 },
  modalBtnText: { color: '#D4AF37', fontWeight: '700' },
});