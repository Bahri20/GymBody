import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { currentLang } from '../lib/i18n';
import NutritionReview from './NutritionReview';

type Meal = { _id: string; mealName: string; description?: string; imageUrl?: string; calories: number; protein: number; carbs: number; fat: number; date: string; status?: string; favorite?: boolean; portion?: number; revision?: number };
type Props = { apiUrl: string; token: string; logs: Meal[]; latest: Meal | null; onChanged: () => Promise<void>; onError: (message: string) => void; onNestedTouch: (active: boolean) => void; calorieTarget: number | null; proteinTarget: number | null };
const P = { bg: '#0B0D12', card: '#171C24', border: '#2C333E', text: '#F8FAFC', muted: '#AFB8C5', green: '#BEF65A', orange: '#FFAA29' };
export default function NutritionJourney({ apiUrl, token, logs, latest, onChanged, onError, onNestedTouch, calorieTarget, proteinTarget }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [note, setNote] = useState('');
  const [options, setOptions] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const repeatKeys = useRef<Record<string, string>>({});
  const [avoidOpen, setAvoidOpen] = useState(false);
  const [avoid, setAvoid] = useState('');
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const [preferences, setPreferences] = useState({ pantry: '', excluded: '', context: 'home', minutes: 15 });
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsError, setPrefsError] = useState(false);
  useEffect(() => {
    let active = true;
    axios.get(`${apiUrl}/nutrition/preferences`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
      .then(({ data }) => { if (active) { setPreferences(data); setPrefsLoaded(true); } })
      .catch(() => { if (active) setPrefsError(true); });
    return () => { active = false; };
  }, [apiUrl, token]);
  const today = new Date().toDateString();
  const eaten = logs.filter(m => m.status !== 'planned');
  const todayMeals = eaten.filter(m => new Date(m.date).toDateString() === today);
  const planned = logs.filter(m => m.status === 'planned' && new Date(m.date).toDateString() === today);
  const visible = filter === 'favorite' ? eaten.filter(m => m.favorite) : filter === 'recent' ? logs : todayMeals;
  const selected = logs.find(m => m._id === selectedId) || (latest?._id === selectedId ? latest : null);
  const headers = { Authorization: `Bearer ${token}`, 'x-lang': currentLang() };
  const request = async (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data?: any) => (await axios({ method, url: `${apiUrl}/nutrition${path}`, headers, data, timeout: 90000 })).data;
  useEffect(() => { if (latest?._id) { setSelectedId(latest._id); setDraft(null); setNote(''); setOptions(null); } }, [latest?._id]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await fn(); } catch (e: any) { onError(e.response?.data?.error || t('İşlem tamamlanamadı. Tekrar dene.')); }
    finally { lock.current = false; setBusy(false); }
  };
  const refresh = async () => { setOptions(null); await onChanged(); };
  const openMeal = (meal: Meal) => { setDraft(null); setNote(''); setSelectedId(meal._id); };
  const patch = async (data: any) => { await request('patch', `/meals/${selected!._id}`, { ...data, revision: selected?.revision || 0 }); await refresh(); setDraft(null); };
  const plan = () => run(async () => {
    const data = await request('post', '/finish-day', { offset: new Date().getTimezoneOffset(), avoid });
    setOptions(data); setAvoidOpen(false);
  });
  const button = (label: string, action: () => void, primary = false, icon?: any) => (
    <TouchableOpacity disabled={busy} onPress={action} style={[s.button, primary && s.primary, busy && { opacity: 0.55 }]}>
      {icon && <Ionicons name={icon} size={17} color={primary ? P.bg : P.green} />}
      <Text style={[s.buttonText, primary && { color: P.bg }]}>{t(label)}</Text>
    </TouchableOpacity>
  );
  const macros = (meal: any) => <Text style={s.meta}>{Math.round(Number(meal.calories) || 0)} kcal · {Math.round(Number(meal.protein) || 0)} g {t('Protein')}</Text>;
  return <View style={{ gap: 16, marginVertical: 16 }}>
    <View>
      <View style={s.row}><Text style={s.title}>{t('Tabak günlüğün')}</Text><Text style={s.meta}>{todayMeals.length} {t('öğün')}</Text></View>
      <View style={[s.row, { justifyContent: 'flex-start', marginVertical: 10 }]}>
        {([['today', 'Bugün'], ['favorite', 'Favoriler'], ['recent', 'Geçmiş']] as const).map(([key, label]) => <TouchableOpacity key={key} onPress={() => setFilter(key)} style={[s.chip, filter === key && { backgroundColor: P.green }]}><Text style={{ color: filter === key ? P.bg : P.muted, fontWeight: '700', fontSize: 12 }}>{t(label)}</Text></TouchableOpacity>)}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} onTouchStart={() => onNestedTouch(true)} onTouchEnd={() => onNestedTouch(false)} onTouchCancel={() => onNestedTouch(false)} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
        {visible.map(meal => <TouchableOpacity key={meal._id} onPress={() => openMeal(meal)} style={s.plate} accessibilityLabel={meal.mealName}>
          {meal.imageUrl ? <Image source={{ uri: meal.imageUrl }} style={s.thumb} /> : <View style={[s.thumb, s.placeholder]}><Ionicons name="restaurant-outline" size={27} color={P.orange} /></View>}
          {meal.favorite && <View style={s.star}><Ionicons name="star" color={P.orange} size={13} /></View>}
          <Text numberOfLines={1} style={s.plateName}>{meal.mealName}</Text>
          <Text style={s.meta}>{Math.round(meal.calories)} kcal</Text>
          {meal.status === 'planned' && <Text style={s.small}>{t('Planlandı')}</Text>}
          {filter === 'recent' && <Text style={s.small}>{new Date(meal.date).toLocaleDateString(currentLang())}</Text>}
        </TouchableOpacity>)}
      </ScrollView>
      {!visible.length && <View style={s.empty}><Ionicons name={filter === 'favorite' ? 'star-outline' : 'camera-outline'} size={24} color={P.orange} /><Text style={[s.body, { flex: 1 }]}>{t(filter === 'favorite' ? 'Sık yediğin tabakları favorile, yarın tek dokunuşla ekle.' : 'İlk tabağını tara. Fotoğrafların ve öğünlerin burada biriksin.')}</Text></View>}
    </View>
    <View style={s.card}>
      <Text style={s.eyebrow}>{t('SIRADAKİ ÖĞÜNÜN')}</Text>
      <Text style={[s.title, { marginTop: 5 }]}>{t('Şimdi ne yesem?')}</Text>
      <Text style={[s.body, { marginVertical: 10 }]}>{t('Bugünkü kayıtlarına ve beslenme programına göre bir sonraki öğününü seç.')}</Text>
      <View style={[s.row, { marginBottom: 13 }]}>
        <Text style={s.balance}>{calorieTarget == null ? '—' : Math.max(0, calorieTarget - todayMeals.reduce((a, m) => a + m.calories, 0))} <Text style={s.meta}>{t('kcal kaldı')}</Text></Text>
        <Text style={s.balance}>{proteinTarget == null ? '—' : Math.max(0, proteinTarget - todayMeals.reduce((a, m) => a + m.protein, 0)).toFixed(0)} <Text style={s.meta}>{t('g protein kaldı')}</Text></Text>
      </View>
      <TouchableOpacity onPress={() => setKitchenOpen(v => !v)} style={[s.row, { paddingVertical: 12, borderTopWidth: 1, borderColor: P.border }]}>
        <View style={{ flex: 1 }}><Text style={s.optionTitle}>{t('Mutfağına göre planla')}</Text><Text style={s.meta}>{t(preferences.context === 'outside' ? 'Dışarıdayım' : preferences.context === 'budget' ? 'Ekonomik olsun' : 'Evdeyim')} · {preferences.minutes} {t('dk')}</Text></View>
        <Ionicons name={kitchenOpen ? 'chevron-up' : 'options-outline'} size={21} color={P.orange} />
      </TouchableOpacity>
      {kitchenOpen && <View style={s.option}>
        {!prefsLoaded ? <View><Text style={s.body}>{t(prefsError ? 'Tercihler yüklenemedi.' : 'Yükleniyor...')}</Text>{prefsError && button('Tekrar dene', () => run(async () => { setPreferences(await request('get', '/preferences')); setPrefsLoaded(true); setPrefsError(false); }))}</View> : <>
          <View style={[s.row, { justifyContent: 'flex-start' }]}>{[['home', 'Evdeyim'], ['outside', 'Dışarıdayım'], ['budget', 'Ekonomik olsun']].map(([key, label]) => <TouchableOpacity key={key} onPress={() => setPreferences({ ...preferences, context: key })} style={[s.chip, preferences.context === key && { backgroundColor: P.green }]}><Text style={{ color: preferences.context === key ? P.bg : P.text, fontSize: 12 }}>{t(label)}</Text></TouchableOpacity>)}</View>
          <Text style={[s.eyebrow, { marginTop: 15 }]}>{t('EVDE NE VAR?')}</Text>
          <TextInput multiline value={preferences.pantry} onChangeText={pantry => setPreferences({ ...preferences, pantry })} maxLength={1000} style={s.input} placeholder={t('Örn. yumurta, yoğurt, makarna, domates')} placeholderTextColor={P.muted} />
          <Text style={s.eyebrow}>{t('YEMEDİĞİN MALZEMELER')}</Text>
          <TextInput value={preferences.excluded} onChangeText={excluded => setPreferences({ ...preferences, excluded })} maxLength={600} style={s.input} placeholder={t('Önerilerde olmasın istediklerin')} placeholderTextColor={P.muted} />
          <Text style={[s.eyebrow, { marginBottom: 9 }]}>{t('NE KADAR VAKTİN VAR?')}</Text>
          <View style={s.row}>{[10, 15, 30, 60].map(minutes => <TouchableOpacity key={minutes} onPress={() => setPreferences({ ...preferences, minutes })} style={[s.portion, preferences.minutes === minutes && { backgroundColor: P.green }]}><Text style={{ color: preferences.minutes === minutes ? P.bg : P.text, fontSize: 12 }}>{minutes} {t('dk')}</Text></TouchableOpacity>)}</View>
          {button('Tercihleri kaydet', () => run(async () => { const saved = await request('put', '/preferences', preferences); setPreferences(saved); setKitchenOpen(false); setOptions(null); }), true, 'checkmark')}
          <Text style={s.small}>{t('Bu tercihler sonraki önerilerinde de hatırlanır.')}</Text>
        </>}
      </View>}
      {planned.map(meal => <View key={meal._id} style={s.option}>
        <Text style={s.eyebrow}>{t('PLANLANDI · HENÜZ YENMEDİ')}</Text><Text style={s.optionTitle}>{meal.mealName}</Text>{macros(meal)}
        <View style={[s.row, { marginTop: 10 }]}>{button('Bunu yedim', () => run(async () => { await request('post', `/meals/${meal._id}/eat`); await refresh(); }), true, 'checkmark')}{button('Detay', () => openMeal(meal))}</View>
      </View>)}
      {busy && <ActivityIndicator color={P.green} style={{ margin: 8 }} />}
      {!calorieTarget && <Text style={[s.body, { marginBottom: 10 }]}>{t('Plan için kalori hesabındaki bilgilerini tamamlayıp kaydet.')}</Text>}
      {todayMeals.length ? button(options ? 'Başka seçenekler üret' : 'Günün kalanını planla', plan, true, 'sparkles') : <Text style={s.body}>{t('Plan için önce bir tabağını tara.')}</Text>}
      {options && <View style={{ gap: 10, marginTop: 14 }}>
        <Text style={s.body}>{options.summary}</Text><Text style={s.small}>{t('Üç alternatiften birini seç; hepsi aynı öğünün seçenekleri.')}</Text>
        {options.suggestions.map((item: any) => <View key={item._id} style={s.option}>
          <View style={s.row}><Text style={s.eyebrow}>{item.type}</Text><Text style={s.meta}>{item.prepMinutes} {t('dk')}</Text></View>
          <Text style={s.optionTitle}>{item.mealName}</Text>{macros(item)}<Text style={[s.body, { marginVertical: 8 }]}>{item.description}</Text>
          {button('Bunu seç', () => run(async () => { await request('post', '/select', { optionsId: options._id, suggestionId: item._id }); await refresh(); }), true, 'add')}
        </View>)}
        {button('Malzemem yok', () => setAvoidOpen(v => !v), false, 'swap-horizontal')}
        {avoidOpen && <View><TextInput value={avoid} onChangeText={setAvoid} maxLength={500} style={s.input} placeholder={t('Hangi malzeme yok?')} placeholderTextColor={P.muted} />{button('Alternatif bul', plan, true)}</View>}
      </View>}
    </View>
    <NutritionReview apiUrl={apiUrl} token={token} revision={logs.map(m => `${m._id}:${m.revision || 0}`).join(',')}
      onMeal={id => { const meal = logs.find(m => m._id === id); if (meal) openMeal(meal); }} />
    <Modal visible={!!selected} animationType="slide" onRequestClose={() => { if (!busy) setSelectedId(null); }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: P.bg }}>
        <View style={[s.row, { padding: 18 }]}><Text style={s.title}>{t('Tabak detayı')}</Text><TouchableOpacity disabled={busy} onPress={() => setSelectedId(null)} accessibilityLabel={t('Kapat')} style={{ padding: 8 }}><Ionicons name="close" size={25} color={P.text} /></TouchableOpacity></View>
        {selected && <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 40, gap: 14 }}>
          {selected.imageUrl && <Image source={{ uri: selected.imageUrl }} style={{ width: '100%', height: 190, borderRadius: 20 }} resizeMode="cover" />}
          <Text style={s.title}>{selected.mealName}</Text>{macros(selected)}<Text style={s.body}>{selected.description}</Text>
          <Text style={s.small}>{t('Besin değerleri tahminidir. Porsiyonu ve içeriği düzeltebilirsin.')}</Text>
          {busy && <ActivityIndicator color={P.green} />}
          <View style={s.row}>
            {selected.status === 'planned' && button('Bunu yedim', () => run(async () => { await request('post', `/meals/${selected._id}/eat`); await refresh(); setSelectedId(null); }), true, 'checkmark')}
            {selected.status !== 'planned' && button('Aynısını yedim', () => run(async () => {
              const key = repeatKeys.current[selected._id] ||= Crypto.randomUUID();
              await request('post', `/meals/${selected._id}/repeat`, { requestId: key });
              await refresh(); delete repeatKeys.current[selected._id]; setSelectedId(null);
            }), true, 'add')}
            {button(selected.favorite ? 'Favorilerden çıkar' : 'Favorile', () => run(() => patch({ favorite: !selected.favorite })), false, selected.favorite ? 'star' : 'star-outline')}
          </View>
          <Text style={s.eyebrow}>{t('PORSİYON')}</Text>
          <View style={s.row}>{[0.5, 1, 1.5, 2].map(n => <TouchableOpacity key={n} disabled={busy} onPress={() => run(() => patch({ portion: n }))} style={[s.portion, (selected.portion || 1) === n && { backgroundColor: P.green }]}><Text style={{ color: (selected.portion || 1) === n ? P.bg : P.text, fontWeight: '800' }}>{n === 0.5 ? '½' : n === 1.5 ? '1½' : n}×</Text></TouchableOpacity>)}</View>
          <Text style={s.eyebrow}>{t('ANALİZİ DÜZELT')}</Text>
          <TextInput multiline value={note} onChangeText={setNote} maxLength={600} style={s.input} placeholder={t('Örn. sos yoktu, bir dilim ekmek ekledim')} placeholderTextColor={P.muted} />
          {button('Düzeltmeyi önizle', () => run(async () => { const data = await request('post', `/meals/${selected._id}/correction`, { note }); setDraft(data); }), false, 'sparkles')}
          {button('Değerleri kendim düzenle', () => setDraft({ ...selected }))}
          {draft && <View style={s.option}>
            <Text style={s.optionTitle}>{t('Kaydetmeden önce kontrol et')}</Text>
            <TextInput value={String(draft.mealName)} onChangeText={v => setDraft({ ...draft, mealName: v })} style={s.input} accessibilityLabel={t('Öğün adı')} />
            <Text style={s.body}>{draft.description}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{(['calories', 'protein', 'carbs', 'fat'] as const).map((key, i) => <View key={key} style={{ width: '46%' }}><Text style={s.meta}>{t(['Kalori', 'Protein', 'Karbonhidrat', 'Yağ'][i])}</Text><TextInput keyboardType="decimal-pad" style={s.input} value={String(draft[key])} onChangeText={v => setDraft({ ...draft, [key]: v.replace(',', '.') })} /></View>)}</View>
            {button('Değişiklikleri kaydet', () => run(() => patch({ values: draft })), true, 'checkmark')}
          </View>}
          {button('Öğünü sil', () => Alert.alert(t('Öğünü sil'), t('Bu kayıt günlüğünden kaldırılacak.'), [{ text: t('İptal'), style: 'cancel' }, { text: t('Sil'), style: 'destructive', onPress: () => run(async () => { await request('delete', `/meals/${selected._id}`); setSelectedId(null); await refresh(); }) }]), false, 'trash-outline')}
        </ScrollView>}
      </SafeAreaView>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: P.card, borderWidth: 1, borderColor: P.border, borderRadius: 22, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { color: P.text, fontSize: 20, fontWeight: '800' }, body: { color: P.muted, fontSize: 13, lineHeight: 20 },
  meta: { color: P.muted, fontSize: 12 }, small: { color: P.muted, fontSize: 11, lineHeight: 17 },
  eyebrow: { color: P.orange, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, backgroundColor: P.card },
  plate: { width: 110, borderRadius: 16, padding: 7, backgroundColor: P.card, gap: 4 }, thumb: { width: 96, height: 82, borderRadius: 11 },
  placeholder: { backgroundColor: '#2B271E', alignItems: 'center', justifyContent: 'center' },
  star: { position: 'absolute', top: 10, right: 10, backgroundColor: P.bg, padding: 4, borderRadius: 10 },
  plateName: { color: P.text, fontSize: 12, fontWeight: '700', marginTop: 3 },
  empty: { borderRadius: 16, backgroundColor: P.card, padding: 15, gap: 12, flexDirection: 'row', alignItems: 'center' },
  balance: { fontSize: 22, color: P.green, fontWeight: '800' },
  option: { padding: 13, borderRadius: 15, borderWidth: 1, borderColor: P.border, backgroundColor: P.bg, marginBottom: 8 },
  optionTitle: { color: P.text, fontSize: 16, fontWeight: '700', marginVertical: 7 },
  button: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 13, backgroundColor: '#252D37', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginVertical: 3 },
  primary: { backgroundColor: P.green }, buttonText: { color: P.text, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  input: { backgroundColor: '#242D38', color: P.text, borderRadius: 12, padding: 13, marginVertical: 7, fontSize: 14, minHeight: 46 },
  portion: { flex: 1, alignItems: 'center', backgroundColor: P.card, padding: 14, borderRadius: 12 },
});
