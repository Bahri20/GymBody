import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, ImageSourcePropType, PanResponder, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SIZE = 56;
const KEY = 'mascot-position-v1';
type Position = { side: 'left' | 'right'; fraction: number };

export default function FloatingMascot({ source, color, onPress, label }: {
  source: ImageSourcePropType; color: string; onPress: () => void; label: string;
}) {
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const offset = useRef(new Animated.ValueXY()).current;
  const saved = useRef<Position>({ side: 'right', fraction: 1 });
  const current = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const moved = useRef(false);
  const touched = useRef(false);
  const latest = useRef({ onPress, minY: 0, maxY: 0, maxX: 0 });
  latest.current = { onPress, minY: insets.top + 8,
    maxY: Math.max(insets.top + 8, layout.height - insets.bottom - 100 - SIZE),
    maxX: Math.max(12, layout.width - SIZE - 12) };

  const place = () => {
    const { minY, maxY, maxX } = latest.current;
    const point = { x: saved.current.side === 'left' ? 12 : maxX,
      y: minY + saved.current.fraction * (maxY - minY) };
    current.current = point;
    offset.setValue(point);
  };
  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(KEY).then(raw => {
      if (!alive || touched.current || !raw) return;
      try {
        const value = JSON.parse(raw);
        if ((value.side === 'left' || value.side === 'right') && Number.isFinite(value.fraction)) {
          saved.current = { side: value.side, fraction: Math.max(0, Math.min(1, value.fraction)) };
          place();
        }
      } catch {}
    }).catch(() => {});
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, []);
  useEffect(() => { place(); }, [layout.width, layout.height, insets.top, insets.bottom]);

  const finish = (cancelled: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    if (active.current) {
      const { minY, maxY, maxX } = latest.current;
      const side = current.current.x < (12 + maxX) / 2 ? 'left' : 'right';
      const y = Math.max(minY, Math.min(maxY, current.current.y));
      saved.current = { side, fraction: maxY > minY ? (y - minY) / (maxY - minY) : 1 };
      current.current = { x: side === 'left' ? 12 : maxX, y };
      Animated.spring(offset, { toValue: current.current, useNativeDriver: false, bounciness: 0 }).start();
      SecureStore.setItemAsync(KEY, JSON.stringify(saved.current)).catch(() => {});
    } else if (!cancelled && !moved.current) latest.current.onPress();
    active.current = false;
    setDragging(false);
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      touched.current = true;
      offset.stopAnimation();
      origin.current = { ...current.current };
      active.current = false;
      moved.current = false;
      timer.current = setTimeout(() => {
        active.current = true;
        setDragging(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }, 300);
    },
    onPanResponderMove: (_, gesture) => {
      if (Math.hypot(gesture.dx, gesture.dy) > 8) {
        moved.current = true;
        if (!active.current && timer.current) clearTimeout(timer.current);
      }
      if (!active.current) return;
      const { minY, maxY, maxX } = latest.current;
      current.current = { x: Math.max(12, Math.min(maxX, origin.current.x + gesture.dx)),
        y: Math.max(minY, Math.min(maxY, origin.current.y + gesture.dy)) };
      offset.setValue(current.current);
    },
    onPanResponderRelease: () => finish(false),
    onPanResponderTerminate: () => finish(true),
  })).current;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0, zIndex: 100 }}
      onLayout={event => setLayout(event.nativeEvent.layout)}>
      {layout.width > 0 && <Animated.View {...responder.panHandlers}
        accessible accessibilityRole="button" accessibilityLabel={label}
        accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => onPress()}
        style={[offset.getLayout(), { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2,
          backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: dragging ? 2 : 0,
          borderColor: '#fff', transform: [{ scale: dragging ? 1.08 : 1 }],
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }]}>
        <Image source={source} style={{ width: 44, height: 44 }} resizeMode="contain" />
      </Animated.View>}
    </View>
  );
}
