import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const IslamicLogo = ({ size = 'medium' }) => {
  const isSmall = size === 'small';

  return (
    <View style={styles.container}>
      <View style={[styles.outerFrame, isSmall && styles.outerFrameSmall]}>
        {/* نقوش الزوايا */}
        <Text style={styles.cornerTL}>۞</Text>
        <Text style={styles.cornerTR}>۞</Text>
        <Text style={styles.cornerBL}>۞</Text>
        <Text style={styles.cornerBR}>۞</Text>

        <View style={styles.innerContent}>
          <Text style={[styles.topOrnament, isSmall && styles.topOrnamentSmall]}>
            ━━━━ ﴿ ☪ ﴾ ━━━━
          </Text>

          <Text style={[styles.arabicText, isSmall && styles.arabicTextSmall]}>
            أَكَادِيمِيَّةُ الهُدَىٰ
          </Text>

          <Text style={styles.centerDivider}>❖ ─── ✦ ─── ❖</Text>

          <Text style={[styles.subTitle, isSmall && styles.subTitleSmall]}>
            لِلْعُلُومِ الشَّرْعِيَّةِ وَالْقُرْآنِ الْكَرِيمِ
          </Text>

          <Text style={styles.bottomPattern}>❊ ❊ ❊</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  outerFrame: {
    backgroundColor: '#0F382C',
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#D4AF37',
    position: 'relative',
    elevation: 6,
  },
  outerFrameSmall: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 },
  innerContent: { alignItems: 'center' },
  cornerTL: { position: 'absolute', top: 4, left: 6, color: '#D4AF37', fontSize: 12 },
  cornerTR: { position: 'absolute', top: 4, right: 6, color: '#D4AF37', fontSize: 12 },
  cornerBL: { position: 'absolute', bottom: 4, left: 6, color: '#D4AF37', fontSize: 12 },
  cornerBR: { position: 'absolute', bottom: 4, right: 6, color: '#D4AF37', fontSize: 12 },
  topOrnament: { color: '#D4AF37', fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  topOrnamentSmall: { fontSize: 10, marginBottom: 2 },
  arabicText: { color: '#D4AF37', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  arabicTextSmall: { fontSize: 18 },
  centerDivider: { color: '#D4AF37', fontSize: 10, marginVertical: 4 },
  subTitle: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  subTitleSmall: { fontSize: 8 },
  bottomPattern: { color: '#D4AF37', fontSize: 10, marginTop: 4 },
});

export default IslamicLogo;