import React from 'react';
import { Text, View } from 'react-native';
import MuscleBodyMap, { MUSCLE_NAMES } from './MuscleBodyMap';
import MuscleMapEffects from './MuscleMapEffects';
import { getTierTheme } from '../lib/tierTheme';
import { RANKS } from '../lib/rankLogic';
import i18n from '../lib/i18n';

export default function TierPreview({ index, gender, view }: { index: number; gender?: string; view: 'front' | 'back' }) {
  const rank = RANKS[index];
  const theme = getTierTheme(rank?.key);
  if (!rank || !theme) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 16, right: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1019', borderRadius: 22, borderWidth: 1, borderColor: theme.primaryColor + '88', overflow: 'hidden' }}>
    <Text style={{ color: theme.primaryColor, fontWeight: '900', fontSize: 18, letterSpacing: 2 }}>{i18n.t(rank.label).toUpperCase()}</Text>
    <View style={{ width: 240, height: 268, alignItems: 'center', marginTop: 8 }}>
      <MuscleMapEffects width={240} height={268} theme={theme} />
      <MuscleBodyMap width={140} view={view} gender={gender} showLabels={false}
        ranks={Object.fromEntries(Object.keys(MUSCLE_NAMES).map(key => [key, rank.key]))} />
    </View>
    <Text style={{ color: '#A8B1C2', fontSize: 11, marginTop: 8 }}>{i18n.t('Rank önizlemesi')}</Text>
  </View>;
}
