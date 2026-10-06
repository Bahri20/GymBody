import React from 'react';
import { View } from 'react-native';
import MuscleBodyMap from './MuscleBodyMap';

const GROUPS: Record<string, { keys: string[]; back?: boolean; top?: number }> = {
  'Göğüs': { keys: ['gogus'], top: -32 },
  'Sırt': { keys: ['sirt', 'trapez', 'bel'], back: true, top: -32 },
  'Bacak': { keys: ['kuad', 'kalf'], top: -123 },
  'Omuz': { keys: ['omuz'], top: -32 },
  'Biceps': { keys: ['biceps'], top: -40 },
  'Triceps': { keys: ['triceps'], back: true, top: -40 },
  'Karın': { keys: ['karin'], top: -65 },
  'Kalça': { keys: ['kalca'], back: true, top: -105 },
};
export default function LibraryMuscleArt({ group, accent, gender }: { group: string; accent: string; gender?: string }) {
  const config = GROUPS[group];
  return <View pointerEvents="none" style={{ width: 100, height: 104, overflow: 'hidden', alignItems: 'center' }}>
    <View style={{ position: 'absolute', top: config?.top ?? 0 }}>
      <MuscleBodyMap gender={gender} width={config ? 145 : 54} view={config?.back ? 'back' : 'front'} showLabels={false}
        ranks={Object.fromEntries((config?.keys || []).map(key => [key, 'active']))}
        rankColors={{ active: accent }} defaultColor="#59646B" baseColor="#39434B" outlineColor="#76828A" />
    </View>
  </View>;
}
