import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import MuscleBodyMap from './MuscleBodyMap';
import LibraryMuscleArt from './LibraryMuscleArt';

const MUSCLE_KEYS: Record<string, string> = {
  abdominals: 'karin', abductors: 'kalca', adductors: 'kuad', biceps: 'biceps',
  calves: 'kalf', chest: 'gogus', forearms: 'onkol', glutes: 'kalca',
  hamstrings: 'arkabacak', lats: 'sirt', 'lower back': 'bel', 'middle back': 'sirt',
  neck: 'trapez', quadriceps: 'kuad', shoulders: 'omuz', traps: 'trapez', triceps: 'triceps',
};
const LABELS: Record<string, string> = {
  abdominals: 'Karın', abductors: 'Dış bacak', adductors: 'İç bacak', biceps: 'Biceps',
  calves: 'Baldır', chest: 'Göğüs', forearms: 'Ön kol', glutes: 'Kalça',
  hamstrings: 'Arka bacak', lats: 'Kanat', 'lower back': 'Bel', 'middle back': 'Orta sırt',
  neck: 'Boyun', quadriceps: 'Ön bacak', shoulders: 'Omuz', traps: 'Trapez', triceps: 'Triceps',
};
// Only highlight regions that the existing anatomy can represent accurately.
const EXACT = new Set(Object.keys(MUSCLE_KEYS).filter(key => !['abductors', 'adductors', 'neck'].includes(key)));
type Props = {
  primary: string[]; secondary: string[]; group?: string; gender?: string;
  colors: { text: string; textMuted: string; lime: string; border: string };
};
export default function ExerciseMuscles({ primary, secondary, group, gender, colors: C }: Props) {
  const { t } = useTranslation();
  const ranks: Record<string, string> = {};
  secondary.forEach(name => { if (EXACT.has(name)) ranks[MUSCLE_KEYS[name]] = 'secondary'; });
  primary.forEach(name => { if (EXACT.has(name)) ranks[MUSCLE_KEYS[name]] = 'primary'; });
  const hasMuscles = primary.length + secondary.length > 0;
  return <View style={{ paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: C.border }}>
    <Text style={{ color: C.text, fontSize: 21, fontWeight: '700', marginBottom: 18 }}>{t(hasMuscles ? 'Çalışan kaslar' : 'Kas grubu')}</Text>
    {Object.keys(ranks).length > 0 && <View style={{ alignItems: 'center', marginBottom: 18 }}>
      <MuscleBodyMap gender={gender} width={250} view="both" showLabels={false}
        ranks={ranks} rankColors={{ primary: C.lime, secondary: '#90A9BA' }}
        defaultColor="#39434B" baseColor="#303A42" outlineColor="#677580" />
    </View>}
    {!hasMuscles && group && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
      <LibraryMuscleArt group={group} gender={gender} accent={C.lime} />
      <Text style={{ color: C.text, fontSize: 17 }}>{t(group)}</Text>
    </View>}
    {([{ names: primary, title: 'Ana kaslar', color: C.lime }, { names: secondary, title: 'Yardımcı kaslar', color: '#90A9BA' }]).filter(section => section.names.length).map(section =>
      <View key={section.title} style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: section.color, marginTop: 6 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '600' }}>{t(section.title)}</Text>
          <Text style={{ color: C.text, fontSize: 14, lineHeight: 21 }}>{section.names.map(name => t(LABELS[name] || name)).join(' · ')}</Text>
        </View>
      </View>)}
  </View>;
}
