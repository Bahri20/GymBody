import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

// Realistic artwork is bundled locally; live text and controls remain above it.
export default function VipBackdrop() {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, aspectRatio: 1.5 }}>
      <Image source={require('../assets/images/vip-athletes-v2.png')} style={StyleSheet.absoluteFill}
        contentFit="contain" contentPosition="top" transition={0} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,13,18,0.56)' }]} />
      <LinearGradient colors={['rgba(9,11,15,0.05)', 'rgba(9,11,15,0.32)', 'rgba(9,11,15,0.05)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(17,21,26,0.08)', 'rgba(17,21,26,0.35)', '#11151A']}
        locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    </View>
    <LinearGradient colors={['transparent', 'rgba(232,185,107,0.65)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 1 }} />
  </View>;
}
