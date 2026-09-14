import React, { memo, useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import type { TierTheme } from '../lib/tierTheme';


// All layers are decorative. Native opacity/transform animation avoids React frame updates.
export default memo(function MuscleMapEffects({ width, height, theme, animate = true }: {
  width: number; height: number; theme: TierTheme; animate?: boolean;
}) {
  const prefix = 'energy' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const pulse = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(0)).current;
  const [reducedMotion, setReducedMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const state = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { mounted = false; motion.remove(); state.remove(); };
  }, []);
  useEffect(() => {
    pulse.setValue(0); turn.setValue(0);
    if (!animate || reducedMotion || !foreground) return;
    const breathing = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 3200 / theme.animationSpeed, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 3200 / theme.animationSpeed, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const rotation = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 65000 / theme.animationSpeed, easing: Easing.linear, useNativeDriver: true }));
    breathing.start(); rotation.start();
    return () => { breathing.stop(); rotation.stop(); };
  }, [animate, foreground, reducedMotion, theme.animationSpeed, pulse, turn]);
  const size = width * 0.86;
  const ringTop = Math.max(0, height * 0.37 - size / 2);
  const rotation = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const reverse = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.root, { width, height }]}>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) }]}>
      <Svg width={width} height={height} viewBox="0 0 540 610" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={prefix + 'aura'}>
            <Stop stopColor={theme.auraColor} stopOpacity={theme.glowIntensity} />
            <Stop offset="0.5" stopColor={theme.secondaryColor} stopOpacity={theme.glowIntensity * .55} />
            <Stop offset="1" stopColor={theme.auraColor} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={prefix + 'floor'}>
            <Stop stopColor={theme.ringColor} stopOpacity={theme.ringIntensity * .7} />
            <Stop offset="0.55" stopColor={theme.secondaryColor} stopOpacity={theme.ringIntensity * .2} />
            <Stop offset="1" stopColor={theme.ringColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="270" cy="280" rx="265" ry="280" fill={`url(#${prefix}aura)`} />
        <Ellipse cx="270" cy="300" rx="135" ry="230" opacity={.5 + theme.flareIntensity * .5} fill={`url(#${prefix}floor)`} />
        <Ellipse cx="270" cy="345" rx="175" ry="240" opacity={theme.flareIntensity} fill={`url(#${prefix}aura)`} />
        {theme.ringCount >= 4 && <G stroke={theme.secondaryColor} strokeWidth="0.5" opacity="0.13">
          {Array.from({ length: 11 }, (_, i) => <Line key={i} x1={85 + i * 36} y1="110" x2={85 + i * 36} y2="425" />)}
          {Array.from({ length: 11 }, (_, i) => <Line key={i} x1="85" y1={110 + i * 28} x2="445" y2={110 + i * 28} />)}
        </G>}
        <G opacity={theme.flareIntensity}>
          <Ellipse cx="270" cy="540" rx="270" ry="30" fill={`url(#${prefix}floor)`} />
        </G>
        <Ellipse cx="270" cy="576" rx="260" ry="46" fill={`url(#${prefix}floor)`} />
        <G fill="none" stroke={theme.ringColor} opacity={theme.ringIntensity}>
          {Array.from({ length: Math.min(3, theme.ringCount) }, (_, i) => <G key={i}>
            <Ellipse cx="270" cy="576" rx={145 + i * 35} ry={15 + i * 7} strokeWidth="15" opacity={.06 + theme.flareIntensity * .1} />
            <Ellipse cx="270" cy="576" rx={145 + i * 35} ry={15 + i * 7} strokeWidth="5" opacity="0.35" />
            <Ellipse cx="270" cy="576" rx={145 + i * 35} ry={15 + i * 7} strokeWidth="1.2" />
            <Ellipse cx="270" cy="576" rx={145 + i * 35} ry={15 + i * 7} stroke="#FFFFFF" strokeWidth="0.55" opacity={theme.flareIntensity * .75} />
          </G>)}
        </G>
      </Svg>
    </Animated.View>
    {[false, true].map((opposite, layer) => <Animated.View key={layer} style={{ position: 'absolute', width: size, height: size, left: (width - size) / 2, top: ringTop, opacity: theme.ringIntensity, transform: [{ rotate: opposite ? reverse : rotation }] }}>
      <Svg width={size} height={size} viewBox="0 0 400 400">
        <G fill="none" stroke={opposite ? theme.secondaryColor : theme.ringColor}>
          {Array.from({ length: theme.ringCount }, (_, i) => i % 2 === layer && <G key={i}>
            <Circle cx="200" cy="200" r={125 + i * 22} strokeWidth="10" opacity={.04 + theme.flareIntensity * .09} />
            <Circle cx="200" cy="200" r={125 + i * 22} strokeWidth="0.8" opacity="0.38" />
            <Circle cx="200" cy="200" r={125 + i * 22} strokeWidth="1.6" strokeDasharray={`${50 + i * 14} 90 8 65`} opacity="0.65" />
            <Circle cx="200" cy="200" r={125 + i * 22} stroke="#FFFFFF" strokeWidth="0.6" strokeDasharray="12 160 3 85" opacity={theme.flareIntensity} />
          </G>)}
        </G>
      </Svg>
    </Animated.View>)}
    <Animated.View style={[StyleSheet.absoluteFill, {
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [theme.ringIntensity * .32, theme.ringIntensity * .78] }),
    }]}>
      <Svg width={width} height={height} viewBox="0 0 540 610" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={prefix + 'floorBreath'}>
            <Stop stopColor={theme.ringColor} stopOpacity="0.7" />
            <Stop offset="0.65" stopColor={theme.ringColor} stopOpacity="0.22" />
            <Stop offset="1" stopColor={theme.ringColor} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={prefix + 'ringFill'}>
            <Stop stopColor={theme.ringColor} stopOpacity="0" />
            <Stop offset="0.55" stopColor={theme.ringColor} stopOpacity="0" />
            <Stop offset="0.68" stopColor={theme.ringColor} stopOpacity="0.32" />
            <Stop offset="0.82" stopColor={theme.particleColor} stopOpacity="0.65" />
            <Stop offset="0.94" stopColor={theme.ringColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={theme.ringColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="270" cy="576" rx="250" ry="34" fill={`url(#${prefix}floorBreath)`} />
        {theme.ringCount > 1 && <Ellipse cx="270" cy="576" rx={theme.ringCount === 2 ? 195 : 230} ry={theme.ringCount === 2 ? 27 : 34} fill={`url(#${prefix}ringFill)`} />}
        {Array.from({ length: Math.min(3, theme.ringCount) }, (_, i) => (
          <G key={i} fill="none">
            <Ellipse cx="270" cy="576" rx={145 + i * 35} ry={15 + i * 7} stroke={theme.ringColor} strokeWidth="12" opacity="0.16" />
            <Ellipse cx="270" cy="576" rx={145 + i * 35} ry={15 + i * 7} stroke={theme.ringColor} strokeWidth="4" opacity="0.7" />
            <Ellipse cx="270" cy="576" rx={145 + i * 35} ry={15 + i * 7} stroke="#FFFFFF" strokeWidth="0.9" opacity="0.85" />
          </G>
        ))}
      </Svg>
    </Animated.View>
    <View style={{ position: 'absolute', width: size, height: size, left: (width - size) / 2, top: height * (576 / 610) - size / 2, transform: [{ scaleY: .12 }] }}>
      <Animated.View style={{ opacity: theme.ringIntensity, transform: [{ rotate: reverse }] }}>
        <Svg width={size} height={size} viewBox="0 0 400 400">
          <Circle cx="200" cy="200" r="174" fill="none" stroke={theme.particleColor} strokeWidth="12" strokeDasharray="95 1000" strokeLinecap="round" opacity="0.13" />
          <Circle cx="200" cy="200" r="174" fill="none" stroke={theme.particleColor} strokeWidth="4" strokeDasharray="95 1000" strokeLinecap="round" opacity="0.8" />
          <Circle cx="200" cy="200" r="174" fill="none" stroke="#FFFFFF" strokeWidth="1.2" strokeDasharray="24 1071" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [.45, .9] }), transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [3, -5] }) }] }]}>
      <Svg width={width} height={height} viewBox="0 0 540 610" preserveAspectRatio="none">
        {Array.from({ length: theme.particleIntensity }, (_, i) => {
          const x = 40 + (i * 137 % 460), y = 85 + (i * 83 % 460);
          return <G key={i} fill={theme.particleColor}>
            <Circle cx={x} cy={y} r="5" opacity="0.08" />
            {theme.ringCount === 4 && i % 3 === 0
              ? <Path d={`M${x} ${y - 3}l2 3 -2 3 -2 -3Z`} opacity="0.7" />
              : <Circle cx={x} cy={y} r={i % 3 === 0 ? 1.5 : .8} opacity="0.7" />}
          </G>;
        })}
      </Svg>
    </Animated.View>
    {Array.from({ length: theme.risingParticleCount }, (_, i) => {
      const ring = i % Math.min(3, theme.ringCount);
      const angle = i * 2.399963;
      // Start exactly on the same ellipses used to draw the floor rings.
      const x = 270 + Math.cos(angle) * (145 + ring * 35);
      const y = 576 + Math.sin(angle) * (15 + ring * 7);
      return <RisingSpark key={i} index={i} x={x * width / 540} y={y * height / 610}
        height={height} theme={theme} active={animate && !reducedMotion && foreground} />;
    })}
  </View>;
});
const styles = StyleSheet.create({ root: { position: 'absolute', alignSelf: 'center', overflow: 'hidden' } });

function RisingSpark({ index, x, y, height, theme, active }: {
  index: number; x: number; y: number; height: number; theme: TierTheme; active: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    if (!active) return;
    const flight = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 1, duration: 4600 + (index % 4) * 500,
        easing: Easing.linear, useNativeDriver: true }),
    ]));
    // Stagger only the first launch; subsequent flights restart without a pause.
    const launch = setTimeout(() => flight.start(), (index * 347) % 4600);
    return () => { clearTimeout(launch); flight.stop(); };
  }, [active, index, progress]);
  return <Animated.View style={{ position: 'absolute', left: x - 5, top: y - 10,
    width: 10, height: 20,
    opacity: progress.interpolate({ inputRange: [0, .025, .75, 1], outputRange: [0, theme.flareIntensity, theme.flareIntensity * .8, 0] }),
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -height * (.16 + (index % 3) * .035)] }) }],
  }}>
    <Svg width={10} height={20} viewBox="0 0 10 20">
      <Ellipse cx={5} cy={10} rx={4} ry={8} fill={theme.particleColor} opacity={.12} />
      <Line x1={5} y1={14} x2={5} y2={10} stroke={theme.particleColor} strokeWidth={1.2} opacity={.75} />
      <Circle cx={5} cy={10} r={.8} fill="#FFFFFF" />
    </Svg>
  </Animated.View>;
}
