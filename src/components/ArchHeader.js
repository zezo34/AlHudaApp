import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export const ArchHeader = ({ title, subtitle, showBack, onBack }) => {
  return (
    <View style={styles.headerContainer}>
      {showBack && (
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>➔</Text>
        </TouchableOpacity>
      )}
      <View style={styles.archContent}>
        <Text style={styles.topPattern}>⚡ ۞ ⚡</Text>
        <Text style={styles.headerTitle}>{title || 'أَكَادِيمِيَّةُ الهُدَىٰ'}</Text>
        {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
        <Text style={styles.dividerPattern}>❖ ─── ✦ ─── ❖</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#0F382C',
    paddingTop: 45,
    paddingBottom: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    borderBottomWidth: 3,
    borderBottomColor: '#D4AF37',
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    right: 20,
    top: 45,
    padding: 8,
  },
  backText: { color: '#D4AF37', fontSize: 22, fontWeight: 'bold' },
  archContent: { alignItems: 'center' },
  topPattern: { color: '#D4AF37', fontSize: 10, marginBottom: 2 },
  headerTitle: { color: '#D4AF37', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  headerSubtitle: { color: '#FFFFFF', fontSize: 13, marginTop: 4 },
  dividerPattern: { color: '#D4AF37', fontSize: 10, marginTop: 6 },
});

export default ArchHeader;