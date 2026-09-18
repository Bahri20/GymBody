import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { currentLang } from '../lib/i18n';
export default function NutritionReview({ apiUrl, token, revision, onMeal }: { apiUrl: string; token: string; revision: string; onMeal: (id: string) => void }) {
  const { t } = useTranslation();
  const [review, setReview] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    axios.get(`${apiUrl}/nutrition/review?offset=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, timeout: 15000 })
      .then(({ data }) => setReview(data))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [apiUrl, token, revision, retry]);
  return <View style={s.card}>
    <TouchableOpacity onPress={() => setExpanded(v => !v)} style={s.row} accessibilityRole="button" accessibilityState={{ expanded }}>
      <Image source={require('../assets/images/mascots/gymbo-cheer.png')} style={s.mascot} resizeMode="contain" />
      <View style={{ flex: 1 }}><Text style={s.title}>{t('Gymbo ile haftana bak')}</Text><Text style={s.body}>{review ? t('Son 7 günde {{count}} gün kayıt tuttun.', { count: review.loggedDays }) : t('Küçük adımlar, kalıcı alışkanlıklar.')}</Text></View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#BEF65A" />
    </TouchableOpacity>
    {error ? <TouchableOpacity onPress={() => setRetry(v => v + 1)} style={{ paddingTop: 12 }}><Text style={s.body}>{t('Özet yüklenemedi. Tekrar dene.')}</Text></TouchableOpacity> : !review ? <ActivityIndicator color="#BEF65A" style={{ marginTop: 10 }} /> : <>
      <View style={[s.row, { justifyContent: 'space-between', marginTop: 15 }]}>
        {review.days.map((day: any) => <View key={day.date} style={{ alignItems: 'center', gap: 6 }}>
          <View style={[s.day, day.count > 0 && { backgroundColor: '#BEF65A' }]}><Ionicons name={day.count > 0 ? 'checkmark' : 'ellipse-outline'} size={17} color={day.count > 0 ? '#0B0D12' : '#80909F'} /></View>
          <Text style={s.small}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(currentLang(), { weekday: 'narrow' })}</Text>
        </View>)}
      </View>
      {expanded && <View style={{ gap: 12, marginTop: 16 }}>
        <Text style={s.body}>{t('Bu hafta {{meals}} öğün kaydı · Önceki 7 gün {{days}} kayıt günü', { meals: review.mealCount, days: review.previousLoggedDays })}</Text>
        <Text style={s.small}>{t('Kayıt olmayan günler boş bırakılır; daha az yediğin anlamına gelmez.')}</Text>
        {review.topMeal && <TouchableOpacity style={s.tip} onPress={() => onMeal(review.topMeal.mealId)}>
          <Text style={s.label}>{t('EN SIK KAYDETTİĞİN')}</Text><Text style={s.title}>{review.topMeal.name}</Text>
          <Text style={s.body}>{t('{{count}} kez kaydettin. Detayını açıp tekrar ekleyebilir veya favorileyebilirsin.', { count: review.topMeal.count })}</Text>
        </TouchableOpacity>}
        <View style={s.tip}>
          <Text style={s.label}>{t('BİR SONRAKİ KÜÇÜK ADIM')}</Text>
          <Text style={s.body}>{t(review.loggedDays === 0 ? 'Bir öğünle başla. Her şeyi bir günde değiştirmene gerek yok.' : review.topMeal && !review.topMeal.favorite ? 'Sık yediğin bir öğünü favorile. Bir sonraki kaydın daha kolay olsun.' : 'Mutfağındaki malzemeleri güncelle ve yarın için pratik bir seçenek seç.')}</Text>
        </View>
        <Text style={s.label}>{t('KAYIT ALIŞKANLIĞIN')}</Text>
        <Text style={s.body}>{t('Toplam {{count}} farklı günde kayıt tuttun.', { count: review.totalDays })}</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>{[7, 20, 50].map((n, i) => {
          const earned = review.earnedBadges.includes(n);
          return <View key={n} style={[s.badge, earned && { borderColor: '#BEF65A' }]}><Ionicons name={earned ? 'ribbon' : 'ribbon-outline'} size={22} color={earned ? '#BEF65A' : '#80909F'} /><Text style={s.small}>{t(['İlk adımlar', 'Rutin oluşuyor', 'Kalıcı alışkanlık'][i])}</Text><Text style={s.small}>{t('{{count}} kayıt günü', { count: n })}</Text></View>;
        })}</View>
        <Text style={s.small}>{t('Ara vermek kazandığın rozetleri silmez. İstediğin zaman devam edebilirsin.')}</Text>
      </View>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 16, backgroundColor: '#1B2030', borderColor: '#313A51', borderWidth: 1, borderRadius: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mascot: { width: 50, height: 58 }, title: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  body: { color: '#B8C3D1', fontSize: 12, lineHeight: 19 }, small: { color: '#A3B1C3', fontSize: 10, lineHeight: 16 },
  label: { color: '#BEF65A', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 5 },
  day: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#2A3242', alignItems: 'center', justifyContent: 'center' },
  tip: { padding: 12, backgroundColor: '#111724', borderRadius: 13 },
  badge: { flex: 1, minWidth: 75, borderWidth: 1, borderColor: '#384052', padding: 9, borderRadius: 13, alignItems: 'center', gap: 4 },
});
