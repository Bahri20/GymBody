import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MuscleBodyMap, { MUSCLE_NAMES } from './MuscleBodyMap';
import { RANKS } from '../lib/rankLogic';
import { ShareView, stickerRatio } from '../lib/strengthShare';

type Props = { width: number; view: ShareView; ranks: Record<string, string>; rankIndex: number; gender?: string; muscle?: string | null };
export default function BodyRankSticker({ width, view, ranks, rankIndex, gender, muscle }: Props) {
  const { t } = useTranslation();
  const rank = rankIndex >= 0 ? RANKS[rankIndex] : null;
  const color = rank?.color || '#B5BCC6';
  const shadow = { textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };
  return <View pointerEvents="none" style={{ width, height: width * stickerRatio(view), alignItems: 'center' }}>
    <MuscleBodyMap width={width} view={view} ranks={ranks} gender={gender} showLabels={false}
      defaultColor="#333942" baseColor="#333942" outlineColor="#737C88" />
    <View style={{ height: width * 0.5, width, alignItems: 'center', justifyContent: 'center', gap: width * 0.025 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...shadow, color, fontSize: width * 0.115, fontWeight: '900', letterSpacing: width * 0.01 }}>{t(rank?.label || 'Henüz Bronz değil').toLocaleUpperCase()}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...shadow, color: '#fff', fontSize: width * 0.073, fontWeight: '700' }}>{t(muscle ? MUSCLE_NAMES[muscle] : 'Tüm vücut')}</Text>
      <Text style={{ ...shadow, color: '#fff', fontSize: width * 0.073, fontWeight: '900', letterSpacing: width * 0.006 }}>GYMBODY<Text style={{ color: '#C6F36B' }}>AI</Text></Text>
    </View>
  </View>;
}
