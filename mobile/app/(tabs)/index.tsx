import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ViewShot from 'react-native-view-shot';
import { View, Text, StyleSheet, Alert, ActivityIndicator, FlatList, TextInput, TouchableOpacity, ScrollView, Dimensions, Modal, Image, KeyboardAvoidingView, Platform, Keyboard, PanResponder, Animated as RNAnimated, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession(); // Google girişi sonrası tarayıcı sekmesini kapat
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import axios from 'axios';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path, Ellipse, G, Circle, Defs, LinearGradient as SvgLinearGradient, RadialGradient, Stop, ClipPath, Rect } from 'react-native-svg';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Grafik için maksimum N etiket göster, aradakileri boşalt
function sparseLabels(items: any[], maxLabels = 5, fn: (item: any) => string): string[] {
  if (items.length <= maxLabels) return items.map(fn);
  return items.map((item, i) => {
    const step = Math.ceil(items.length / maxLabels);
    return i % step === 0 || i === items.length - 1 ? fn(item) : '';
  });
}

// 🎨 TASARIM SİSTEMİ — Koyu + Neon Yeşil
// Koyu tema paleti (aksan: MacFit yeşili)
const DARK = {
  bg: '#0B0D12',
  bgAlt: '#10131A',
  surface: '#12151C',
  surface2: '#171C26',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: '#262C3A',
  text: '#FFFFFF',
  textSec: '#A3ABBA',
  textMuted: '#6B7384',
  lime: '#83C93C',
  limeDark: '#6FB32E',
  blue: '#5B8DEF',
  orange: '#FF9F1C',
  red: '#FF5A52',
  green: '#34D399',
  gold: '#FFD700',
};
// Açık tema paleti (varsayılan)
const LIGHT = {
  bg: '#F7F8F4',
  bgAlt: '#EEF0E8',
  surface: '#FFFFFF',
  surface2: '#F0F2EB',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: '#E4E7DE',
  text: '#1A1D18',
  textSec: '#5F6B5B',
  textMuted: '#8A9182',
  lime: '#5FA82A',
  limeDark: '#4E9A24',
  blue: '#3B82F6',
  orange: '#F08A00',
  red: '#E24B4A',
  green: '#2FA36B',
  gold: '#E0A400',
};
type Palette = typeof DARK;
// Modül seviyesi varsayılan (component dışı referanslar için; component içinde temaya göre override edilir)
const C: Palette = LIGHT;

// Sekme aksanına göre yumuşak üst ambient glow (algılanan parlaklığa göre dengelendi)
const TAB_GLOW: Record<string, string[]> = {
  analiz:  ['rgba(255,159,28,0.16)', 'rgba(255,159,28,0.05)', 'transparent'], // turuncu
  pt:      ['rgba(37,99,235,0.20)', 'rgba(37,99,235,0.06)', 'transparent'], // koyu mavi
  gymBody: ['rgba(37,99,235,0.20)', 'rgba(37,99,235,0.06)', 'transparent'], // koyu mavi
  stats:   ['rgba(91,141,239,0.18)', 'rgba(91,141,239,0.06)', 'transparent'], // mavi
  profile: ['rgba(198,255,61,0.12)', 'rgba(198,255,61,0.04)', 'transparent'], // lime
};

// ======================= AYLIK ROZET (performans, stack'lenir) =======================
const MONTH_TIERS: Record<string,{label:string;emoji:string;color:string}> = {
  legend: { label: 'Efsane', emoji: '🐉', color: '#FFD700' },
  elite:  { label: 'Elit',   emoji: '⚜️', color: '#A06BFF' },
  rising: { label: 'Yıldız', emoji: '🌟', color: '#5BC8E0' },
};
const MONTH_FULL_TR  = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const MONTH_SHORT_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
// Geçici önizleme: gerçek veri yokken seviyelendirme görselini görmek için
const DEV_MONTHLY_PREVIEW = false;
function resolveMonthlyBadges(user: any): {period:string;tier:string;score?:number}[] {
  const real = (user && user.monthlyBadges) || [];
  if (real.length === 0 && DEV_MONTHLY_PREVIEW) {
    return [
      { period:'2026-04', tier:'rising', score:14 }, { period:'2026-05', tier:'elite',  score:38 },
      { period:'2026-06', tier:'legend', score:72 }, { period:'2026-03', tier:'legend', score:64 },
      { period:'2026-02', tier:'elite',  score:33 }, { period:'2026-01', tier:'elite',  score:31 },
    ];
  }
  return real;
}

// ======================= GÜÇ SIRALAMASI (STRENGTH RANK) =======================
// Her hareket için "max ağırlık ÷ vücut ağırlığı" oranına göre rank verilir.
// Eşikler bir rank'a ULAŞMAK için gereken oran (cinsiyete göre ayrı).
// "3x8", "4x10-12", "3 set x 10 tekrar" gibi stringleri parse eder
function parseExSets(raw: string): { sets: number; repsLabel: string } {
  if (!raw) return { sets: 3, repsLabel: '10' };
  const m = raw.match(/(\d+)\s*[xX×]\s*([\d\-]+)/);
  if (m) return { sets: parseInt(m[1]), repsLabel: m[2] };
  const n = raw.match(/(\d+)/);
  return { sets: n ? parseInt(n[1]) : 3, repsLabel: '10' };
}

const LIFTS = [
  { key: 'bench',    label: 'Bench Press',  icon: '🏋️', muscle: 'Göğüs' },
  { key: 'squat',    label: 'Squat',        icon: '🦵', muscle: 'Bacak' },
  { key: 'deadlift', label: 'Deadlift',     icon: '🔩', muscle: 'Sırt' },
  { key: 'ohp',      label: 'Shoulder Press', icon: '💪', muscle: 'Omuz' },
  { key: 'latpull',  label: 'Lat Pull Down',icon: '🦅', muscle: 'Kanat' },
  { key: 'curl',     label: 'Barbell Curl', icon: '💥', muscle: 'Kol' },
  { key: 'lateral',  label: 'Lateral Raise', icon: '🦾', muscle: 'Omuz Yan', hint: 'Tek dumbbell / cable ağırlığı' },
] as const;

const RANKS = [
  { key: 'bronz',  label: 'Bronz',  emoji: '🥉', color: '#CD7F32' },
  { key: 'gumus',  label: 'Gümüş',  emoji: '⚪', color: '#C0C0C0' },
  { key: 'altin',  label: 'Altın',  emoji: '🥇', color: '#FFD700' },
  { key: 'platin', label: 'Platin', emoji: '💠', color: '#5BC8E0' },
  { key: 'elmas',  label: 'Elmas',  emoji: '💎', color: '#9B6BFF' },
  { key: 'efsane', label: 'Efsane', emoji: '🔥', color: '#EF4444' },
] as const;

// oran eşikleri [bronz, gümüş, altın, platin, elmas, efsane]
const STD: Record<string, { erkek: number[]; kadin: number[] }> = {
  bench:    { erkek: [0.50, 0.75, 1.00, 1.25, 1.50, 1.80], kadin: [0.30, 0.45, 0.60, 0.80, 1.00, 1.20] },
  squat:    { erkek: [0.75, 1.00, 1.50, 1.75, 2.25, 2.60], kadin: [0.50, 0.75, 1.00, 1.25, 1.60, 1.90] },
  deadlift: { erkek: [1.00, 1.25, 1.75, 2.25, 2.75, 3.10], kadin: [0.60, 0.90, 1.25, 1.60, 2.00, 2.30] },
  ohp:      { erkek: [0.35, 0.50, 0.65, 0.80, 1.00, 1.15], kadin: [0.20, 0.30, 0.45, 0.55, 0.70, 0.85] },
  latpull:  { erkek: [0.60, 0.80, 1.00, 1.20, 1.40, 1.60], kadin: [0.40, 0.55, 0.70, 0.85, 1.00, 1.15] },
  curl:     { erkek: [0.30, 0.40, 0.55, 0.70, 0.85, 1.00], kadin: [0.20, 0.28, 0.38, 0.50, 0.60, 0.72] },
  // Lateral raise tek dumbbell/cable (tek kol) — izolasyon, vücut ağırlığıyla az ölçeklenir
  lateral:  { erkek: [0.06, 0.09, 0.12, 0.16, 0.20, 0.25], kadin: [0.04, 0.06, 0.09, 0.12, 0.15, 0.18] },
};

// Bir hareketin rank durumunu hesapla. Döner: { rankIndex (-1=henüz bronz değil), ratio, nextWeight, progress }
function computeRank(liftKey: string, best: number, bodyweight: number, gender?: string) {
  const g = String(gender || '').toLowerCase();
  const isFemale = g === 'female' || g === 'kadın' || g === 'kadin';
  const thresholds = STD[liftKey][isFemale ? 'kadin' : 'erkek'];
  const bw = bodyweight && bodyweight > 0 ? bodyweight : 70;
  const ratio = best / bw;
  let rankIndex = -1;
  for (let i = 0; i < thresholds.length; i++) {
    if (ratio >= thresholds[i]) rankIndex = i;
  }
  // sonraki rank için gereken ağırlık ve ilerleme (%)
  const nextIdx = rankIndex + 1;
  let nextWeight: number | null = null;
  let progress = 1;
  if (nextIdx < thresholds.length) {
    nextWeight = Math.ceil(thresholds[nextIdx] * bw);
    const lowRatio = rankIndex >= 0 ? thresholds[rankIndex] : 0;
    const span = thresholds[nextIdx] - lowRatio;
    progress = Math.max(0, Math.min(1, (ratio - lowRatio) / span));
  }
  return { rankIndex, ratio, nextWeight, progress };
}

// Canlı backend (Render). Yerel geliştirme için: 'http://192.168.1.100:3000'
const API_URL = 'https://gymbody.onrender.com';
const RC_API_KEY_ANDROID = 'goog_eftKBcKbeMJVYLeJIRfhpyPHWdW';
const RC_API_KEY_IOS = 'appl_FkkFrtwjKozHMrvNSMEgWOHALgO';

Purchases.setLogLevel(LOG_LEVEL.ERROR);
// Platforma göre doğru anahtarla yapılandır; anahtar yoksa (iOS henüz kurulmadıysa) çökme
const RC_KEY = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
if (RC_KEY) {
  Purchases.configure({ apiKey: RC_KEY });
} else {
  console.warn('RevenueCat: bu platform için API anahtarı tanımlı değil, satın alma devre dışı.');
}

// İstek 45 sn'de cevap gelmezse iptal et — sonsuz yüklenmeyi önler (sunucu uykudan
// uyanırken askıda kalmasın). App Review 2.1 "login indefinitely loading" düzeltmesi.
axios.defaults.timeout = 45000;

// Ağ hatalarını yakala — sunucuya ulaşılamazsa net mesaj
axios.interceptors.response.use(
  res => res,
  err => {
    if (err.code === 'ECONNABORTED') {
      err.userMessage = 'Sunucu yanıt vermedi, tekrar dene. (Sunucu uyanıyor olabilir, birkaç saniye sonra tekrar dene.)';
    } else if (!err.response) {
      err.userMessage = 'İnternet bağlantını kontrol et ve tekrar dene.';
    }
    return Promise.reject(err);
  }
);

// Rank rozet bileşenleri — her rank için özgün SVG tasarım
function RankBadgeSvg({ rankKey, color, size = 44 }: { rankKey: string; color: string; size?: number }) {
  const s = size;
  const c = s / 2;
  // glow + fill renkleri
  const fill   = color + '30';
  const stroke = color;
  const bright = color;

  if (rankKey === 'bronz') {
    // Kalkan şekli — altıgen tabanlı, tek renk düz
    return (
      <Svg width={s} height={s} viewBox="0 0 44 44">
        {/* Altıgen kalkan */}
        <Path d="M22,4 L36,12 L36,28 L22,40 L8,28 L8,12 Z" fill={fill} stroke={stroke} strokeWidth={2} />
        {/* İç küçük kalkan */}
        <Path d="M22,10 L31,16 L31,27 L22,34 L13,27 L13,16 Z" fill={stroke} opacity={0.25} />
        {/* Merkez nokta */}
        <Circle cx={22} cy={22} r={4} fill={bright} opacity={0.9} />
      </Svg>
    );
  }

  if (rankKey === 'gumus') {
    // Kalkan + iki küçük kanat
    return (
      <Svg width={s} height={s} viewBox="0 0 44 44">
        {/* Sol kanat */}
        <Path d="M8,22 Q2,18 4,12 Q8,16 10,22 Z" fill={stroke} opacity={0.7} />
        {/* Sağ kanat */}
        <Path d="M36,22 Q42,18 40,12 Q36,16 34,22 Z" fill={stroke} opacity={0.7} />
        {/* Altıgen */}
        <Path d="M22,5 L35,13 L35,29 L22,39 L9,29 L9,13 Z" fill={fill} stroke={stroke} strokeWidth={2} />
        {/* İç elmas */}
        <Path d="M22,13 L28,22 L22,31 L16,22 Z" fill={stroke} opacity={0.5} />
        <Circle cx={22} cy={22} r={3} fill={bright} opacity={0.95} />
      </Svg>
    );
  }

  if (rankKey === 'altin') {
    // Taç + altıgen
    return (
      <Svg width={s} height={s} viewBox="0 0 44 44">
        {/* Sol kanat geniş */}
        <Path d="M7,24 Q1,19 2,11 Q7,15 9,23 Z" fill={stroke} opacity={0.8} />
        <Path d="M8,20 Q3,14 6,8 Q10,13 11,20 Z" fill={stroke} opacity={0.5} />
        {/* Sağ kanat geniş */}
        <Path d="M37,24 Q43,19 42,11 Q37,15 35,23 Z" fill={stroke} opacity={0.8} />
        <Path d="M36,20 Q41,14 38,8 Q34,13 33,20 Z" fill={stroke} opacity={0.5} />
        {/* Altıgen */}
        <Path d="M22,6 L35,14 L35,30 L22,38 L9,30 L9,14 Z" fill={fill} stroke={stroke} strokeWidth={2} />
        {/* Taç dişleri */}
        <Path d="M14,14 L17,20 L22,14 L27,20 L30,14" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
        {/* Merkez yıldız */}
        <Path d="M22,20 L23.5,25 L22,24 L20.5,25 Z M19,22 L24,22 L23,23.5 L21,23.5 Z" fill={bright} opacity={0.9} />
        <Circle cx={22} cy={23} r={2.5} fill={bright} opacity={0.95} />
      </Svg>
    );
  }

  if (rankKey === 'platin') {
    // Büyük kanatlar + kristal
    return (
      <Svg width={s} height={s} viewBox="0 0 44 44">
        {/* Sol büyük kanat */}
        <Path d="M6,26 Q-2,20 0,10 Q5,15 8,22 Z" fill={stroke} opacity={0.7} />
        <Path d="M7,21 Q0,13 4,6 Q9,12 11,19 Z" fill={stroke} opacity={0.5} />
        <Path d="M9,16 Q4,8 8,3 Q13,9 13,16 Z" fill={stroke} opacity={0.3} />
        {/* Sağ büyük kanat */}
        <Path d="M38,26 Q46,20 44,10 Q39,15 36,22 Z" fill={stroke} opacity={0.7} />
        <Path d="M37,21 Q44,13 40,6 Q35,12 33,19 Z" fill={stroke} opacity={0.5} />
        <Path d="M35,16 Q40,8 36,3 Q31,9 31,16 Z" fill={stroke} opacity={0.3} />
        {/* Kristal altıgen */}
        <Path d="M22,5 L36,13 L36,31 L22,39 L8,31 L8,13 Z" fill={fill} stroke={stroke} strokeWidth={2.2} />
        {/* İç kristal facet */}
        <Path d="M22,9 L31,16 L31,28 L22,35 L13,28 L13,16 Z" fill={stroke} opacity={0.15} />
        <Path d="M22,13 L28,19 L28,27 L22,33 L16,27 L16,19 Z" fill={stroke} opacity={0.2} />
        <Circle cx={22} cy={22} r={4} fill={bright} opacity={0.9} />
        <Circle cx={22} cy={22} r={2} fill="#fff" opacity={0.5} />
      </Svg>
    );
  }

  if (rankKey === 'efsane') {
    // Alevli taç — en üst zirve (Elmas'ın da üstü)
    return (
      <Svg width={s} height={s} viewBox="0 0 44 44">
        {/* Işık huzmesi */}
        <Path d="M22,22 L2,0 L22,7 Z"  fill={stroke} opacity={0.15} />
        <Path d="M22,22 L42,0 L22,7 Z" fill={stroke} opacity={0.15} />
        {/* Çok geniş kanatlar */}
        <Path d="M5,30 Q-5,22 -3,8 Q4,16 8,25 Z"  fill={stroke} opacity={0.8} />
        <Path d="M7,24 Q-3,15 1,3  Q9,12 11,21 Z"  fill={stroke} opacity={0.55} />
        <Path d="M9,18 Q4,9 8,2     Q14,9 13,17 Z"  fill={stroke} opacity={0.35} />
        <Path d="M39,30 Q49,22 47,8 Q40,16 36,25 Z" fill={stroke} opacity={0.8} />
        <Path d="M37,24 Q47,15 43,3 Q35,12 33,21 Z" fill={stroke} opacity={0.55} />
        <Path d="M35,18 Q40,9 36,2  Q30,9 31,17 Z"  fill={stroke} opacity={0.35} />
        {/* Taç gövdesi */}
        <Path d="M11,31 L9,14 L17,21 L22,9 L27,21 L35,14 L33,31 Z" fill={fill} stroke={stroke} strokeWidth={2.3} strokeLinejoin="round" />
        {/* Taç tabanı */}
        <Path d="M11,31 L33,31 L32,36 L12,36 Z" fill={stroke} opacity={0.9} />
        {/* Mücevherler */}
        <Circle cx={22} cy={17} r={2.6} fill="#fff" opacity={0.95} />
        <Circle cx={14} cy={21} r={1.7} fill={bright} opacity={0.85} />
        <Circle cx={30} cy={21} r={1.7} fill={bright} opacity={0.85} />
        {/* Alev ucu */}
        <Path d="M22,3 Q24.5,7 22,10 Q19.5,7 22,3 Z" fill="#fff" opacity={0.9} />
      </Svg>
    );
  }

  // elmas — tam mücevher, geniş kanatlar + ışık huzmesi
  return (
    <Svg width={s} height={s} viewBox="0 0 44 44">
      {/* Işık huzmesi arka plan */}
      <Path d="M22,22 L4,2 L22,8 Z"  fill={stroke} opacity={0.15} />
      <Path d="M22,22 L40,2 L22,8 Z" fill={stroke} opacity={0.15} />
      <Path d="M22,22 L2,22 L8,12 Z" fill={stroke} opacity={0.1} />
      <Path d="M22,22 L42,22 L36,12 Z" fill={stroke} opacity={0.1} />
      {/* Sol kanatlar (3 katman) */}
      <Path d="M5,28 Q-4,22 -2,10 Q4,16 7,24 Z"  fill={stroke} opacity={0.75} />
      <Path d="M6,22 Q-2,14 2,5  Q8,12 10,20 Z"  fill={stroke} opacity={0.55} />
      <Path d="M8,16 Q3,7  7,1   Q13,8 13,16 Z"  fill={stroke} opacity={0.35} />
      {/* Sağ kanatlar */}
      <Path d="M39,28 Q48,22 46,10 Q40,16 37,24 Z" fill={stroke} opacity={0.75} />
      <Path d="M38,22 Q46,14 42,5  Q36,12 34,20 Z" fill={stroke} opacity={0.55} />
      <Path d="M36,16 Q41,7  37,1  Q31,8  31,16 Z" fill={stroke} opacity={0.35} />
      {/* Mücevher altıgen */}
      <Path d="M22,4 L37,12 L37,32 L22,40 L7,32 L7,12 Z" fill={fill} stroke={stroke} strokeWidth={2.5} />
      {/* Facet çizgileri */}
      <Path d="M22,4 L37,12 M22,4 L7,12 M22,40 L37,32 M22,40 L7,32 M7,12 L7,32 M37,12 L37,32" stroke={stroke} strokeWidth={0.7} opacity={0.4} />
      <Path d="M22,4 L22,40 M7,22 L37,22" stroke={stroke} strokeWidth={0.5} opacity={0.25} />
      {/* İç elmas parlaması */}
      <Path d="M22,10 L31,22 L22,34 L13,22 Z" fill={stroke} opacity={0.25} />
      <Circle cx={22} cy={22} r={5} fill={bright} opacity={0.85} />
      <Circle cx={22} cy={22} r={2.5} fill="#fff" opacity={0.6} />
      {/* Yıldız parıltı */}
      <Path d="M22,17 L22.8,21 L26,22 L22.8,23 L22,27 L21.2,23 L18,22 L21.2,21 Z" fill="#fff" opacity={0.7} />
    </Svg>
  );
}

// Kas grubu → egzersiz eşleştirme
const MUSCLE_LIFT_MAP: Record<string, string[]> = {
  chest:     ['bench'],
  shoulders: ['ohp', 'lateral'],
  arms:      ['curl'],
  legs:      ['squat'],
  back:      ['latpull', 'deadlift'],
};

function getMuscleColor(
  muscleKey: string,
  liftsData: Record<string, number>,
  bodyweight: number,
  gender?: string
): string {
  const liftKeys = MUSCLE_LIFT_MAP[muscleKey] || [];
  let best = -1;
  for (const k of liftKeys) {
    const b = liftsData[k] || 0;
    if (b > 0) {
      const { rankIndex } = computeRank(k, b, bodyweight, gender);
      if (rankIndex > best) best = rankIndex;
    }
  }
  if (best < 0) return '#1E2335';
  return RANKS[best].color + 'CC'; // slight transparency
}

function MuscleSilhouette({ liftsData, bodyweight, gender }: {
  liftsData: Record<string, number>;
  bodyweight: number;
  gender?: string;
}) {
  const mc = (key: string) => getMuscleColor(key, liftsData, bodyweight, gender);
  const chest     = mc('chest');
  const shoulders = mc('shoulders');
  const arms      = mc('arms');
  const legs      = mc('legs');
  const back      = mc('back');
  const inactive  = '#1E2335';
  const isOn = (c: string) => c !== inactive + 'CC' && c !== inactive;

  // Sabit koordinat — viewBox 140x290
  return (
    <Svg width={150} height={290} viewBox="0 0 140 290">
      <Defs>
        <SvgLinearGradient id="ms_body" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3C4060" stopOpacity="1"/>
          <Stop offset="1" stopColor="#252838" stopOpacity="1"/>
        </SvgLinearGradient>
        <SvgLinearGradient id="ms_skin" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#454869" stopOpacity="1"/>
          <Stop offset="1" stopColor="#32354E" stopOpacity="1"/>
        </SvgLinearGradient>
        <RadialGradient id="ms_glow" cx="50%" cy="35%" r="55%">
          <Stop offset="0" stopColor="#fff" stopOpacity="0.14"/>
          <Stop offset="1" stopColor="#fff" stopOpacity="0"/>
        </RadialGradient>
      </Defs>

      {/* ── KAS RENK OVERLAY (önce çiz, üstüne silüet gelecek) ── */}

      {/* Omuz */}
      <Ellipse cx={28}  cy={76} rx={16} ry={14} fill={shoulders} opacity={0.9}/>
      <Ellipse cx={112} cy={76} rx={16} ry={14} fill={shoulders} opacity={0.9}/>
      {/* Trapez (boyundan omuzlara) */}
      <Path d="M52,58 Q38,54 28,64 L32,78 Q44,68 70,66 Q96,68 108,78 L112,64 Q102,54 88,58 Z" fill={shoulders} opacity={0.75}/>

      {/* Göğüs */}
      <Path d="M52,68 Q44,70 42,86 Q42,96 54,97 L68,96 L68,68 Z" fill={chest} opacity={0.9}/>
      <Path d="M88,68 Q96,70 98,86 Q98,96 86,97 L72,96 L72,68 Z" fill={chest} opacity={0.9}/>
      <Path d="M68,68 L72,68 L72,97 Q70,98 68,97 Z" fill={chest} opacity={0.7}/>

      {/* Lat (ön görünüm yan) */}
      <Path d="M42,74 Q34,88 36,106 Q38,114 46,112 Q50,100 50,80 Z" fill={back} opacity={0.85}/>
      <Path d="M98,74 Q106,88 104,106 Q102,114 94,112 Q90,100 90,80 Z" fill={back} opacity={0.85}/>

      {/* Kol üst (biseps) */}
      <Path d="M14,72 Q8,84 10,106 Q12,116 22,114 Q28,112 28,100 L28,70 Z" fill={arms} opacity={0.85}/>
      <Path d="M126,72 Q132,84 130,106 Q128,116 118,114 Q112,112 112,100 L112,70 Z" fill={arms} opacity={0.85}/>

      {/* Önkol */}
      <Path d="M10,112 Q6,126 8,148 Q10,158 18,156 Q26,154 26,142 L24,112 Z" fill={arms} opacity={0.7}/>
      <Path d="M130,112 Q134,126 132,148 Q130,158 122,156 Q114,154 114,142 L116,112 Z" fill={arms} opacity={0.7}/>

      {/* Bacak üst (quad) */}
      <Path d="M44,178 Q38,198 40,228 Q42,240 52,240 Q62,240 64,226 L62,178 Z" fill={legs} opacity={0.9}/>
      <Path d="M96,178 Q102,198 100,228 Q98,240 88,240 Q78,240 76,226 L78,178 Z" fill={legs} opacity={0.9}/>

      {/* Baldır */}
      <Path d="M40,238 Q36,254 38,274 Q40,282 50,280 Q60,278 60,266 L58,238 Z" fill={legs} opacity={0.75}/>
      <Path d="M100,238 Q104,254 102,274 Q100,282 90,280 Q80,278 80,266 L82,238 Z" fill={legs} opacity={0.75}/>

      {/* ── VÜCUT SİLÜETİ (renk overlay'in üstünde, şeffaf gövde) ── */}

      {/* Kafa */}
      <Ellipse cx={70} cy={18} rx={18} ry={18} fill="url(#ms_skin)"/>
      {/* Saç */}
      <Path d="M52,14 Q54,4 70,2 Q86,4 88,14 Q80,8 70,8 Q60,8 52,14 Z" fill="#22243A"/>

      {/* Boyun */}
      <Rect x={62} y={34} width={16} height={20} rx={4} fill="url(#ms_skin)"/>

      {/* Gövde (torso) */}
      <Path d="M42,54 Q32,56 32,68 L30,130 Q30,148 36,158 L44,170 L96,170 L104,158 Q110,148 110,130 L108,68 Q108,56 98,54 Z" fill="url(#ms_body)"/>

      {/* Omuz kapağı */}
      <Ellipse cx={28}  cy={76} rx={16} ry={14} fill="url(#ms_skin)" opacity={0.35}/>
      <Ellipse cx={112} cy={76} rx={16} ry={14} fill="url(#ms_skin)" opacity={0.35}/>

      {/* Kol üst */}
      <Path d="M14,72 Q8,84 10,106 Q12,116 22,114 Q28,112 28,100 L28,70 Z" fill="url(#ms_skin)" opacity={0.4}/>
      <Path d="M126,72 Q132,84 130,106 Q128,116 118,114 Q112,112 112,100 L112,70 Z" fill="url(#ms_skin)" opacity={0.4}/>

      {/* Önkol */}
      <Path d="M10,112 Q6,126 8,148 Q10,158 18,156 Q26,154 26,142 L24,112 Z" fill="url(#ms_skin)" opacity={0.5}/>
      <Path d="M130,112 Q134,126 132,148 Q130,158 122,156 Q114,154 114,142 L116,112 Z" fill="url(#ms_skin)" opacity={0.5}/>

      {/* El */}
      <Ellipse cx={17} cy={162} rx={9} ry={7} fill="url(#ms_skin)"/>
      <Ellipse cx={123} cy={162} rx={9} ry={7} fill="url(#ms_skin)"/>

      {/* Kalça */}
      <Path d="M44,166 Q38,172 38,182 L102,182 Q102,172 96,166 Z" fill="url(#ms_body)"/>

      {/* Bacak üst */}
      <Path d="M44,178 Q38,198 40,228 Q42,240 52,240 Q62,240 64,226 L62,178 Z" fill="url(#ms_skin)" opacity={0.4}/>
      <Path d="M96,178 Q102,198 100,228 Q98,240 88,240 Q78,240 76,226 L78,178 Z" fill="url(#ms_skin)" opacity={0.4}/>

      {/* Baldır */}
      <Path d="M40,238 Q36,254 38,274 Q40,282 50,280 Q60,278 60,266 L58,238 Z" fill="url(#ms_skin)" opacity={0.5}/>
      <Path d="M100,238 Q104,254 102,274 Q100,282 90,280 Q80,278 80,266 L82,238 Z" fill="url(#ms_skin)" opacity={0.5}/>

      {/* Ayak */}
      <Ellipse cx={49} cy={283} rx={13} ry={6} fill="url(#ms_skin)"/>
      <Ellipse cx={91} cy={283} rx={13} ry={6} fill="url(#ms_skin)"/>

      {/* ── PARLAMA / GLOW (aktif kaslarda) ── */}
      {isOn(shoulders) && <>
        <Ellipse cx={28} cy={72} rx={8} ry={5} fill="#fff" opacity={0.18}/>
        <Ellipse cx={112} cy={72} rx={8} ry={5} fill="#fff" opacity={0.18}/>
      </>}
      {isOn(chest) && <>
        <Ellipse cx={56} cy={78} rx={9} ry={6} fill="#fff" opacity={0.16}/>
        <Ellipse cx={84} cy={78} rx={9} ry={6} fill="#fff" opacity={0.16}/>
      </>}
      {isOn(arms) && <>
        <Ellipse cx={19} cy={88} rx={5} ry={10} fill="#fff" opacity={0.14}/>
        <Ellipse cx={121} cy={88} rx={5} ry={10} fill="#fff" opacity={0.14}/>
      </>}
      {isOn(legs) && <>
        <Ellipse cx={52} cy={204} rx={9} ry={18} fill="#fff" opacity={0.13}/>
        <Ellipse cx={88} cy={204} rx={9} ry={18} fill="#fff" opacity={0.13}/>
      </>}

      {/* Karın çizgileri (anatomik detay) */}
      <Path d="M58,100 L58,162 M70,98 L70,162 M82,100 L82,162" stroke="#fff" strokeWidth={0.7} opacity={0.07}/>
      <Path d="M44,114 L96,114 M44,128 L96,128 M44,142 L96,142 M44,156 L96,156" stroke="#fff" strokeWidth={0.7} opacity={0.07}/>
      {/* Göğüs orta çizgisi */}
      <Path d="M70,66 L70,98" stroke="#fff" strokeWidth={0.8} opacity={0.1}/>

      {/* Genel parlaklık */}
      <Path d="M42,54 Q32,56 32,68 L30,130 Q30,148 36,158 L44,170 L96,170 L104,158 Q110,148 110,130 L108,68 Q108,56 98,54 Z" fill="url(#ms_glow)"/>
    </Svg>
  );
}

// ⚠️ Google Cloud Console > Credentials'tan al, buraya yapıştır
const GOOGLE_CLIENT_IDS = {
  webClientId: '715798761426-marncqp4mh3jkrd2346h74o1cfikgf92.apps.googleusercontent.com',
  iosClientId: '715798761426-vpka1e4obfhgut4uo1d9ibf1h8qe51qk.apps.googleusercontent.com',
  androidClientId: '715798761426-sg8b01jtn26djnkno3acce1dcmbbl6kj.apps.googleusercontent.com',
};

export default function App() {
  const insets = useSafeAreaInsets();

  // ===== TEMA (açık varsayılan; kullanıcı koyuya geçebilir; SecureStore'da saklanır) =====
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const C = useMemo<Palette>(() => (themeMode === 'dark' ? DARK : LIGHT), [themeMode]);
  const styles = useMemo(() => makeStyles(C), [C]);
  useEffect(() => {
    (async () => {
      const t = await SecureStore.getItemAsync('themeMode');
      if (t === 'dark' || t === 'light') setThemeMode(t);
    })();
  }, []);
  const toggleTheme = async () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    try { await SecureStore.setItemAsync('themeMode', next); } catch {}
  };

  // Logo nabız animasyonu (giriş ekranı)
  const logoScale = useSharedValue(1);
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));
  useEffect(() => {
    logoScale.value = withRepeat(withTiming(1.08, { duration: 900 }), -1, true);
  }, []);

  // Giriş ve Kullanıcı State'leri
  const [user, setUser] = useState<any>(null);
  const [monthlyDetailTier, setMonthlyDetailTier] = useState<string|null>(null);
  const [rankSentIds, setRankSentIds] = useState<string[]>([]);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralBonus, setReferralBonus] = useState<{ coachName: string; discountRate: number } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [privacyModal, setPrivacyModal] = useState<'privacy' | 'terms' | null>(null);
  const [editName, setEditName] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [bodyStats, setBodyStats] = useState<any[]>([]);
  const [statWeight, setStatWeight] = useState('');
  const [statWaist, setStatWaist] = useState('');
  const [statShoulder, setStatShoulder] = useState('');
  const [statNeck, setStatNeck] = useState('');
  const [editingStatId, setEditingStatId] = useState<string | null>(null); // düzenlenen ölçü kaydının id'si (null=yeni kayıt)
  const [statsPage, setStatsPage] = useState(0);
  const [selectedVipPlan, setSelectedVipPlan] = useState('$rc_annual');
  const [macroPage, setMacroPage] = useState(0); // "Bugün ne kadar tamamlandı" kaydırma sayfası
  const [userStats, setUserStats] = useState<any>({ tokens: 0, streak: 0, isVip: false, vipExpiresAt: null });
  const [gymTrainingDays, setGymTrainingDays] = useState(4);
  const [gymAllergy, setGymAllergy] = useState('');
  const [gymFeedback, setGymFeedback] = useState('');
  const [gymGoal, setGymGoal] = useState<'definition' | 'bulk' | 'maintain'>('definition');
  const [weeklyPlan, setWeeklyPlan] = useState<any>(null);
  const [gymLoading, setGymLoading] = useState(false);
  const [gymPlanTab, setGymPlanTab] = useState<'workout' | 'nutrition'>('workout');
  const [mealTab, setMealTab] = useState<'plan' | 'analiz'>('analiz');
  const [analizTab, setAnalizTab] = useState<'gelisim' | 'beslenme'>('gelisim');
  // PT (hoca) durumu
  const [coachData, setCoachData] = useState<any>({ hasCoach: false });
  const [coachChatVisible, setCoachChatVisible] = useState(false);
  const [coachMessages, setCoachMessages] = useState<{ from: string; text: string; at: string }[]>([]);
  const [coachChatInput, setCoachChatInput] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const coachPollRef = useRef<any>(null);
  const [gymTab, setGymTab] = useState<'program' | 'max'>('program');
  const [gifModalUrl, setGifModalUrl] = useState<string | null>(null);
  const [gifFrame, setGifFrame] = useState(0); // 2 kareli statik görseli ard arda oynat (mini animasyon)
  // Egzersiz kütüphanesi
  const [libVisible, setLibVisible] = useState(false);
  const [libData, setLibData] = useState<Record<string, any[]>>({});
  const [libSearch, setLibSearch] = useState('');
  const [libGroup, setLibGroup] = useState('Tümü');
  const [libDetail, setLibDetail] = useState<any>(null);
  const [libLoading, setLibLoading] = useState(false);
  useEffect(() => {
    if (!gifModalUrl && !libDetail) return;
    setGifFrame(0);
    const id = setInterval(() => setGifFrame((f) => (f === 0 ? 1 : 0)), 650);
    return () => clearInterval(id);
  }, [gifModalUrl, libDetail]);
  const openLibrary = async () => {
    setLibVisible(true);
    if (Object.keys(libData).length) return;
    setLibLoading(true);
    try {
      const res = await axios.get(`${API_URL}/exercises`, { headers: { Authorization: `Bearer ${token}` } });
      setLibData(res.data || {});
    } catch { showToast('Kütüphane yüklenemedi.', 'error'); }
    finally { setLibLoading(false); }
  };
  const [dayFeedbackVisible, setDayFeedbackVisible] = useState(false);
  const [dayFeedbackText, setDayFeedbackText] = useState('');
  const [showRestPrompt, setShowRestPrompt] = useState(false);
  const [isRestDay, setIsRestDay] = useState(false);

  // Antrenman modu
  const [workoutActive, setWorkoutActive] = useState(false);
  const [workoutExIdx, setWorkoutExIdx] = useState(0);
  const [workoutSetIdx, setWorkoutSetIdx] = useState(0);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [restDuration, setRestDuration] = useState(60);
  const [workoutWeights, setWorkoutWeights] = useState<Record<number, string>>({});
  const restIntervalRef = useRef<any>(null);

  // Egzersiz adından lift key bul (fuzzy)
  const exToLiftKey = (name: string): string | null => {
    const n = name.toLowerCase();
    if (/bench|göğüs|chest/.test(n)) return 'bench';
    if (/squat|diz|leg press/.test(n)) return 'squat';
    if (/deadlift|deadl|rdl|romanian/.test(n)) return 'deadlift';
    if (/overhead|ohp|shoulder press|omuz press/.test(n)) return 'ohp';
    if (/lateral|yan kaldır/.test(n)) return 'lateral';
    if (/curl|biseps|bicep/.test(n)) return 'curl';
    if (/lat pull|pulldown|lat machine|barbell row|kürek/.test(n)) return 'latpull';
    return null;
  };

  // Güç sıralaması — PR girişi modalı & paylaşım
  const [liftModal, setLiftModal] = useState<string | null>(null); // hangi hareket düzenleniyor
  const [liftInput, setLiftInput] = useState('');
  const [liftSaving, setLiftSaving] = useState(false);
  const [shareLiftKey, setShareLiftKey] = useState<string | null>(null); // paylaşım kartı için
  // Siklet liderlik tablosu
  const [leaderboardLift, setLeaderboardLift] = useState<string | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<any>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [myLiftRanks, setMyLiftRanks] = useState<Record<string, { rank: number; total: number }>>({});

  const [toast, setToast] = useState<{msg: string; type?: 'success'|'error'} | null>(null);
  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // Kg girişi — VIP kontrolü. VIP değilse modalı açmaz, VIP'e yönlendirir.
  const openLiftEntry = (liftKey: string, currentBest: number) => {
    if (!userStats.isVip) {
      Alert.alert(
        'VIP Özelliği 💪',
        'Max ağırlık girişi ve güç sıralaması VIP üyelere özeldir. Profilden VIP olup gücünü kaydetmeye başla!',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'VIP\'e Geç', onPress: () => setCurrentTab('profile') },
        ]
      );
      return;
    }
    setLiftModal(liftKey);
    setLiftInput(currentBest ? String(currentBest) : '');
  };

  // Güç sıralaması — PR kaydet
  const saveLift = async () => {
    const w = parseFloat(liftInput.replace(',', '.'));
    if (!liftModal || !(w > 0)) { showToast('Geçerli bir ağırlık gir.', 'error'); return; }
    setLiftSaving(true);
    try {
      const res = await axios.post(`${API_URL}/update-lift`, { lift: liftModal, weight: w, forceUpdate: true }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const prevBest = user?.lifts?.[liftModal]?.best || 0;
      setUser((prev: any) => ({ ...prev, lifts: res.data.lifts }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (w > prevBest) {
        setLiftModal(null);
        setLiftInput('');
        setPrCelebration({ lift: liftModal!, weight: w, prevBest });
      } else {
        showToast('Kayıt eklendi ✓');
        setLiftModal(null);
        setLiftInput('');
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Kaydedilemedi.', 'error');
    } finally {
      setLiftSaving(false);
    }
  };

  // Siklet liderlik tablosunu aç
  const openLeaderboard = async (liftKey: string) => {
    setLeaderboardLift(liftKey);
    setLeaderboardData(null);
    setLeaderboardLoading(true);
    try {
      const res = await axios.get(`${API_URL}/lift-leaderboard`, {
        params: { lift: liftKey },
        headers: { Authorization: `Bearer ${token}` },
      });
      setLeaderboardData(res.data);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Sıralama getirilemedi.', 'error');
      setLeaderboardLift(null);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // Tüm hareketlerdeki siklet sıramı çek (inline gösterim için)
  const fetchMyLiftRanks = async () => {
    if (!token || !userStats.isVip) return;
    try {
      const res = await axios.get(`${API_URL}/my-lift-ranks`, { headers: { Authorization: `Bearer ${token}` } });
      setMyLiftRanks(res.data.ranks || {});
    } catch {}
  };

  // YENİ ÖZELLİKLER
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string; text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const shareCardRef = useRef<ViewShot>(null);
  const liftShareRef = useRef<ViewShot>(null);
  const rankShareRef = useRef<ViewShot>(null);
  // Siklet sırası paylaşımı
  const [rankShareData, setRankShareData] = useState<any>(null);
  const [rankSharePhoto, setRankSharePhoto] = useState<string | null>(null);

  // Arkadaş meydan okuması
  const challengeShareRef = useRef<ViewShot>(null);
  const [challengeScreen, setChallengeScreen] = useState<null|'create'|'code'|'accept'|'accept-weight'|'waiting'|'result'>(null);
  const [challengeLift, setChallengeLift] = useState('bench');
  const [challengeMyWeight, setChallengeMyWeight] = useState('');
  const [challengeCode, setChallengeCode] = useState('');
  const [challengeCodeInput, setChallengeCodeInput] = useState('');
  const [challengeInfo, setChallengeInfo] = useState<{lift:string;liftLabel:string;challengerName:string;challengerBest:number}|null>(null);
  const [challengeTheirWeight, setChallengeTheirWeight] = useState('');
  const [challengeResult, setChallengeResult] = useState<{challengerName:string;challengerBest:number;respondentName:string;respondentBest:number;liftLabel:string;iWon:boolean}|null>(null);
  const [challengeSharePhoto, setChallengeSharePhoto] = useState<string|null>(null);

  // PR Konfeti
  const [prCelebration, setPrCelebration] = useState<{lift:string;weight:number;prevBest:number}|null>(null);

  // Arkadaşlar + Sohbet
  const [friendsVisible, setFriendsVisible] = useState(false);
  const [friends, setFriends] = useState<{_id:string;name:string;unread:number}[]>([]);
  const [friendRequests, setFriendRequests] = useState<{_id:string;name:string}[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<{_id:string;name:string;friendStatus:string}[]>([]);
  const [chatFriend, setChatFriend] = useState<{_id:string;name:string}|null>(null);
  const [friendMessages, setFriendMessages] = useState<{_id:string;senderId:string;text:string;createdAt:string}[]>([]);
  const [friendChatInput, setFriendChatInput] = useState('');
  const chatPollRef = useRef<any>(null);

  const [weeklySummaryVisible, setWeeklySummaryVisible] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);

  const [newBadgeVisible, setNewBadgeVisible] = useState(false);
  const [newBadges, setNewBadges] = useState<{id: string; label: string}[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true); // açılışta otomatik giriş kontrolü
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false); // ilk giriş karşılama modalı
  const onboardingDoneRef = useRef(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingAnswers, setOnboardingAnswers] = useState<Record<string, string>>({});
  const onboardingAnim = useRef(new RNAnimated.Value(1)).current;

  // Google ile giriş isteği
  const [gRequest, gResponse, gPromptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_IDS.webClientId,
    iosClientId: GOOGLE_CLIENT_IDS.iosClientId,
    androidClientId: GOOGLE_CLIENT_IDS.androidClientId,
  });


  // Uygulama içi Genel State'ler
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gallery, setGallery] = useState<any[]>([]);
  const [note, setNote] = useState('');

  // SEKME YÖNETİMİ: 'gallery' | 'meal' | 'profile'
  const [currentTab, setCurrentTab] = useState('analiz');

  // Yemek Kalori Ölçer State'leri
  const [mealImage, setMealImage] = useState<string | null>(null);
  const [mealResult, setMealResult] = useState<any>(null);
  const [mealLogs, setMealLogs] = useState<any[]>([]); // Günlük öğün kayıtları

  // Hedefler (Goals) state'leri
  const [goalAge, setGoalAge] = useState('');
  const [goalGender, setGoalGender] = useState<'male' | 'female'>('male');
  const [goalTarget, setGoalTarget] = useState('');

 // Açılışta kayıtlı token varsa otomatik giriş yap
 useEffect(() => {
   (async () => {
     try {
       const savedToken = await SecureStore.getItemAsync('userToken');
       if (savedToken) {
         const res = await axios.get(`${API_URL}/me`, {
           headers: { Authorization: `Bearer ${savedToken}` },
         });
         setToken(savedToken);
         setUser(res.data.user);
         registerPushToken(savedToken);
       }
     } catch (err) {
       // token geçersiz/süresi dolmuş → temizle, giriş ekranına düş
       await SecureStore.deleteItemAsync('userToken');
     } finally {
       setRestoring(false);
     }
   })();
 }, []);

 // Apple ile Giriş cihazda destekleniyor mu (iOS 13+) — butonu ona göre göster
 useEffect(() => {
   if (Platform.OS !== 'ios') return;
   AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
 }, []);

 // PT (hoca) durumunu giriş sonrası çek + okunmamış rozet için 30sn'de bir yenile
 useEffect(() => {
   if (!token) return;
   fetchCoach();
   const t = setInterval(fetchCoach, 30000);
   return () => clearInterval(t);
 }, [token]);

 // Google giriş sonucu döndüğünde backend'e gönder
 useEffect(() => {
   if (gResponse?.type === 'success') {
     const idToken = gResponse.authentication?.idToken || (gResponse.params as any)?.id_token;
     const accessToken = gResponse.authentication?.accessToken;
     loginWithGoogle(idToken, accessToken);
   } else if (gResponse?.type === 'error') {
     setGoogleLoading(false);
     Alert.alert('Google Hatası', 'Google ile giriş tamamlanamadı.');
   } else if (gResponse?.type === 'dismiss' || gResponse?.type === 'cancel') {
     setGoogleLoading(false);
   }
 }, [gResponse]);

 const loginWithGoogle = async (idToken?: string, accessToken?: string) => {
   if (!idToken && !accessToken) {
     setGoogleLoading(false);
     Alert.alert('Google Hatası', 'Google kimlik bilgisi alınamadı.');
     return;
   }
   try {
     setGoogleLoading(true);
     const res = await axios.post(`${API_URL}/google-login`, { idToken, accessToken });
     setUser(res.data.user);
     setToken(res.data.token);
     await SecureStore.setItemAsync('userToken', res.data.token);
     registerPushToken(res.data.token);
     // Not: referans kodu, karşılama modalı kapandıktan sonra sorulur (her yeni kullanıcı için)
   } catch (err: any) {
     const msg = err.response?.data?.error || 'Google girişi başarısız.';
     Alert.alert('Google Hatası', msg);
   } finally {
     setGoogleLoading(false);
   }
 };

 // Apple ile Giriş (yalnızca iOS) — App Store 4.8 zorunlu
 const loginWithApple = async () => {
   try {
     setAppleLoading(true);
     const credential = await AppleAuthentication.signInAsync({
       requestedScopes: [
         AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
         AppleAuthentication.AppleAuthenticationScope.EMAIL,
       ],
     });
     if (!credential.identityToken) {
       Alert.alert('Apple Hatası', 'Apple kimlik bilgisi alınamadı.');
       return;
     }
     const res = await axios.post(`${API_URL}/apple-login`, {
       identityToken: credential.identityToken,
       fullName: credential.fullName ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName } : null,
     });
     setUser(res.data.user);
     setToken(res.data.token);
     await SecureStore.setItemAsync('userToken', res.data.token);
     registerPushToken(res.data.token);
   } catch (err: any) {
     if (err?.code === 'ERR_REQUEST_CANCELED') return; // kullanıcı vazgeçti
     const msg = err.response?.data?.error || err.userMessage || 'Apple girişi başarısız.';
     Alert.alert('Apple Hatası', msg);
   } finally {
     setAppleLoading(false);
   }
 };

 useEffect(() => {
  if (user) {
    fetchPhotos();
    fetchBodyStats();
    fetchMealLogs();
    fetchUserStats();
    setGoalAge(user.age ? String(user.age) : '');
    setGoalGender(user.gender === 'female' ? 'female' : 'male');
    setGoalTarget(user.targetWeight ? String(user.targetWeight) : '');
    // İlk giriş → karşılama modalını göster
    if (!user.onboarded) { onboardingDoneRef.current = false; setWelcomeVisible(true); }
  }
}, [user]);

const animateStep = (cb: () => void) => {
  RNAnimated.sequence([
    RNAnimated.timing(onboardingAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    RNAnimated.timing(onboardingAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
  ]).start();
  setTimeout(cb, 150);
};

const completeOnboarding = async () => {
  if (onboardingDoneRef.current) return;
  onboardingDoneRef.current = true;
  setWelcomeVisible(false);
  try {
    await axios.post(`${API_URL}/complete-onboarding`, {
      goal: onboardingAnswers.goal,
      experience: onboardingAnswers.experience,
      daysPerWeek: onboardingAnswers.daysPerWeek,
      location: onboardingAnswers.location,
      restrictions: onboardingAnswers.restrictions,
    }, { headers: { Authorization: `Bearer ${token}` } });
  } catch {}
  setUser((prev: any) => prev ? { ...prev, onboarded: true } : prev);
};

// GymBody sekmesine her geçişte mola durumunu sıfırla (yeni gün = antrenman zamanı)
useEffect(() => {
  if (currentTab === 'gymBody' && isRestDay) {
    const lastCompleted = weeklyPlan?.lastDayCompletedAt;
    if (lastCompleted) {
      const completedDate = new Date(lastCompleted).toDateString();
      const today = new Date().toDateString();
      if (completedDate !== today) setIsRestDay(false);
    }
  }
}, [currentTab]);

// VIP durumu netleşince planı çek
useEffect(() => {
  if (userStats.isVip) {
    fetchWeeklyPlan(true); // silent=true, hata alert'i gösterme
  }
}, [userStats.isVip]);
useEffect(() => {
  if (userStats.isVip && user?.lifts) fetchMyLiftRanks();
}, [userStats.isVip, user?.lifts]);
  const fetchMealLogs = async () => {
    try {
      const response = await axios.get(`${API_URL}/get-meal-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMealLogs(response.data);
    } catch (error) { console.log("Öğün kayıtları çekilemedi"); }
  };
  const fetchUserStats = async () => {
  try {
    const response = await axios.get(`${API_URL}/get-user-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUserStats(response.data);
  } catch (error) { console.log("Kullanıcı istatistikleri çekilemedi"); }
};
  const fetchBodyStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/get-body-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBodyStats(response.data);
    } catch (error) { console.log("İstatistikler çekilemedi"); }
  };
  const fetchPhotos = async () => {
    try {
      const response = await axios.get(`${API_URL}/get-progress-photos/${user._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGallery(response.data);
    } catch (error) { console.log("Fotoğraflar çekilemedi"); }
  };
const fetchWeeklyPlan = async (silent = false) => {
  if (!userStats.isVip) return;
  if (!silent) setGymLoading(true);
  try {
    const res = await axios.post(`${API_URL}/get-weekly-plan`, {
      trainingDaysPerWeek: gymTrainingDays,
      allergy: gymAllergy,
      feedback: gymFeedback,
      goal: gymGoal
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklyPlan(res.data);
    if (res.data.trainingDaysPerWeek) setGymTrainingDays(res.data.trainingDaysPerWeek);
    setGymFeedback('');
  } catch (error: any) {
    const msg = error.userMessage || error.response?.data?.error || 'Plan oluşturulamadı.';
    if (!silent) Alert.alert('Hata', msg);
  } finally {
    if (!silent) setGymLoading(false);
  }
};
// "Programa Başla" → intro'yu kapat, 1. günü aç
const startProgram = async () => {
  try {
    setGymLoading(true);
    const res = await axios.post(`${API_URL}/start-program`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklyPlan(res.data);
  } catch (error: any) {
    showToast(error.userMessage || error.response?.data?.error || 'Program başlatılamadı.', 'error');
  } finally {
    setGymLoading(false);
  }
};
const saveBodyStat = async () => {
  if (!statWeight && !statWaist && !statShoulder && !statNeck) {
    return showToast('En az bir değer girmelisin!', 'error');
  }

  setLoading(true);
  try {
    const payload = {
      weight: statWeight ? parseFloat(statWeight) : null,
      waist: statWaist ? parseFloat(statWaist) : null,
      shoulder: statShoulder ? parseFloat(statShoulder) : null,
      neck: statNeck ? parseFloat(statNeck) : null
    };
    // editingStatId varsa mevcut kaydı DÜZELT (PUT), yoksa yeni kayıt EKLE (POST)
    if (editingStatId) {
      await axios.put(`${API_URL}/body-stat/${editingStatId}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Ölçü güncellendi ✓');
    } else {
      await axios.post(`${API_URL}/add-body-stat`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Ölçülerin kaydedildi ✓');
    }
    setEditingStatId(null);
    setStatWeight(''); setStatWaist(''); setStatShoulder(''); setStatNeck('');
    fetchBodyStats();

    // Eğer kilo girildiyse, user state'ini de güncelle (profil senkron olsun)
    if (statWeight) {
      setUser({ ...user, weight: parseFloat(statWeight) });
    }
  } catch (error: any) {
    const detail = error.response?.data?.error || error.message || 'bilinmeyen';
    console.log("🔥 BODYSTAT HATASI:", error.response?.status, detail);
    showToast(`Hata: ${detail}`, 'error');
  } finally {
    setLoading(false);
  }
};

// Bir ölçü kaydını sil (onaylı). En son ölçü yanlışsa/fazlaysa kaldırmak için.
const deleteBodyStat = (statId: string) => {
  Alert.alert('Ölçüyü Sil', 'Bu ölçü kaydını silmek istediğine emin misin?', [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: async () => {
      try {
        await axios.delete(`${API_URL}/body-stat/${statId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        showToast('Ölçü silindi ✓');
        fetchBodyStats();
      } catch (error: any) {
        showToast(error.response?.data?.error || 'Silinemedi', 'error');
      }
    }},
  ]);
};

// Bir ölçü kaydını düzenleme modunda aç: profil formunu açar ve mevcut değerleri doldurur.
// updateProfile, editingStatId doluysa POST yerine PUT yapar (yeni kayıt eklemez, düzeltir).
const startEditBodyStat = (stat: any) => {
  setEditingStatId(stat._id);
  setEditWeight(stat.weight ? String(stat.weight) : (user?.weight ? String(user.weight) : ''));
  setStatWaist(stat.waist ? String(stat.waist) : '');
  setStatShoulder(stat.shoulder ? String(stat.shoulder) : '');
  setStatNeck(stat.neck ? String(stat.neck) : '');
  setIsEditingProfile(true);
};
// Push token kayıt
const registerPushToken = async (authToken: string) => {
  try {
    if (!Device.isDevice) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
    await axios.post(`${API_URL}/save-push-token`, { pushToken }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
  } catch (err) { /* sessizce geç */ }
};

// Haftalık özet
const fetchWeeklySummary = async () => {
  try {
    const res = await axios.get(`${API_URL}/weekly-summary`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklySummary(res.data);
    setWeeklySummaryVisible(true);
  } catch { showToast('Özet alınamadı.', 'error'); }
};

// AI Chat
const sendChatMessage = async () => {
  if (!chatInput.trim() || chatLoading) return;
  const userMsg = { role: 'user', text: chatInput.trim() };
  const newHistory = [...chatMessages, userMsg];
  setChatMessages(newHistory);
  setChatInput('');
  setChatLoading(true);
  setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  try {
    const res = await axios.post(`${API_URL}/ai-chat`, {
      message: userMsg.text,
      history: chatMessages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }))
    }, { headers: { Authorization: `Bearer ${token}` } });
    setChatMessages(prev => [...prev, { role: 'model', text: res.data.reply }]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  } catch (err: any) {
    const msg = err.response?.data?.error || 'AI yanıt veremedi.';
    setChatMessages(prev => [...prev, { role: 'model', text: `⚠️ ${msg}` }]);
  } finally {
    setChatLoading(false);
  }
};

// Before/After paylaş — ViewShot ile görsel oluştur
const [sharePhotoUrl, setSharePhotoUrl] = useState<string | null>(null);
const [sharePhotoFat, setSharePhotoFat] = useState<number | null>(null);
const [shareCardReady, setShareCardReady] = useState(false);
const [sharePickerVisible, setSharePickerVisible] = useState(false);
const [shareImgLoaded, setShareImgLoaded] = useState(false);
const [shareLoading, setShareLoading] = useState(false);
const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

const shareProgress = async () => {
  const withFat = gallery.filter(p => p.bodyFatPercentage != null);
  if (withFat.length < 1) {
    showToast('Paylaşmak için vücut analizi fotoğrafı gerekiyor.', 'error');
    return;
  }
  if (withFat.length === 1) {
    setShareImgLoaded(false);
    setSharePhotoUrl(withFat[0].url);
    setSharePhotoFat(withFat[0].bodyFatPercentage);
    setShareCardReady(true);
    return;
  }
  setSharePickerVisible(true);
};

// Güç rozeti paylaş
const captureLiftShare = async () => {
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { showToast('Paylaşım bu cihazda desteklenmiyor.', 'error'); return; }
    await new Promise(r => setTimeout(r, 300)); // kartın render olmasını bekle
    const uri = await (liftShareRef.current as any)?.capture();
    if (!uri) { showToast('Görsel oluşturulamadı.', 'error'); return; }
    const dest = FileSystem.documentDirectory + 'gymbodyai_rank.jpg';
    const srcUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    await Sharing.shareAsync(dest, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'GymBodyAI Güç Rozetim' });
  } catch (err: any) {
    showToast(err?.message || 'Paylaşım başarısız.', 'error');
  } finally {
    setShareLiftKey(null);
  }
};

// Siklet sırası paylaşım kartını aç
const openRankShare = (liftKey: string) => {
  const lift = LIFTS.find(l => l.key === liftKey);
  if (!lift || !leaderboardData) return;
  setRankSharePhoto(null);
  setRankShareData({
    liftKey, label: lift.label, icon: lift.icon,
    rank: leaderboardData.myRank, total: leaderboardData.total,
    bracket: String(leaderboardData.bracket).replace(' kg', ''),
    genderLabel: leaderboardData.genderLabel || '',
    best: leaderboardData.myBest,
  });
};

// Paylaşım kartına galeriden foto seç
// ─── ARKADAŞLAR + SOHBET ─────────────────────────────────────────────────────
const fetchFriends = async () => {
  try {
    const { data } = await axios.get(`${API_URL}/friends`, { headers: { Authorization: `Bearer ${token}` } });
    setFriends(data.friends);
    setFriendRequests(data.requests);
  } catch {}
};

const searchFriends = async (q: string) => {
  setFriendSearch(q);
  if (q.trim().length < 2) { setFriendSearchResults([]); return; }
  try {
    const { data } = await axios.get(`${API_URL}/users/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
    setFriendSearchResults(data);
  } catch {}
};

const sendFriendRequest = async (userId: string) => {
  try {
    await axios.post(`${API_URL}/friends/request/${userId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
    showToast('Arkadaşlık isteği gönderildi!');
    searchFriends(friendSearch);
  } catch (e: any) { showToast(e.response?.data?.error || 'Hata', 'error'); }
};

const acceptFriendRequest = async (userId: string) => {
  try {
    await axios.post(`${API_URL}/friends/accept/${userId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
    showToast('Arkadaş eklendi!');
    fetchFriends();
  } catch (e: any) { showToast(e.response?.data?.error || 'Hata', 'error'); }
};

const openChat = async (friend: {_id:string;name:string}) => {
  setChatFriend(friend);
  setFriendMessages([]);
  setFriendChatInput('');
  loadMessages(friend._id);
  // polling her 5 saniyede
  if (chatPollRef.current) clearInterval(chatPollRef.current);
  chatPollRef.current = setInterval(() => loadMessages(friend._id), 5000);
};

const loadMessages = async (friendId: string) => {
  try {
    const { data } = await axios.get(`${API_URL}/messages/${friendId}`, { headers: { Authorization: `Bearer ${token}` } });
    setFriendMessages(data);
    // unread sıfırla
    setFriends(prev => prev.map(f => f._id === friendId ? { ...f, unread: 0 } : f));
  } catch {}
};

const sendMessage = async () => {
  if (!chatFriend || !friendChatInput.trim()) return;
  const text = friendChatInput.trim();
  setFriendChatInput('');
  try {
    const { data } = await axios.post(`${API_URL}/messages/${chatFriend._id}`, { text }, { headers: { Authorization: `Bearer ${token}` } });
    setFriendMessages(prev => [...prev, data]);
  } catch { showToast('Gönderilemedi', 'error'); }
};

const closeChat = () => {
  if (chatPollRef.current) clearInterval(chatPollRef.current);
  setChatFriend(null);
};

// ─── PT (HOCA) ───
const fetchCoach = async () => {
  if (!token) return;
  try {
    const { data } = await axios.get(`${API_URL}/my-coach`, { headers: { Authorization: `Bearer ${token}` } });
    setCoachData(data);
  } catch {}
};
const joinCoach = async () => {
  const code = joinCode.trim();
  if (!code) return;
  try {
    const { data } = await axios.post(`${API_URL}/join-coach`, { code }, { headers: { Authorization: `Bearer ${token}` } });
    showToast(data.message || 'Hocana bağlandın!');
    setJoinCode('');
    fetchCoach();
  } catch (e: any) { showToast(e.response?.data?.error || 'Kod bulunamadı', 'error'); }
};
const loadCoachMessages = async () => {
  try {
    const { data } = await axios.get(`${API_URL}/my-coach/messages`, { headers: { Authorization: `Bearer ${token}` } });
    setCoachMessages(data);
    setCoachData((prev: any) => ({ ...prev, unread: 0 }));
  } catch {}
};
const openCoachChat = () => {
  setCoachChatVisible(true);
  setCoachMessages([]);
  loadCoachMessages();
  if (coachPollRef.current) clearInterval(coachPollRef.current);
  coachPollRef.current = setInterval(loadCoachMessages, 5000);
};
const closeCoachChat = () => {
  if (coachPollRef.current) clearInterval(coachPollRef.current);
  setCoachChatVisible(false);
  fetchCoach();
};
const sendCoachMessage = async () => {
  const text = coachChatInput.trim();
  if (!text) return;
  setCoachChatInput('');
  try {
    const { data } = await axios.post(`${API_URL}/my-coach/messages`, { text }, { headers: { Authorization: `Bearer ${token}` } });
    setCoachMessages(prev => [...prev, data]);
  } catch { showToast('Gönderilemedi', 'error'); }
};

// ─── ENGELLE / ŞİKAYET ET (UGC moderasyon — App Store/Play Store zorunlu) ───
const blockUser = async (target: {_id:string;name:string}) => {
  try {
    await axios.post(`${API_URL}/block/${target._id}`, {}, { headers: { Authorization: `Bearer ${token}` } });
    showToast(`${target.name} engellendi`);
    closeChat();
    fetchFriends();
  } catch { showToast('Engellenemedi', 'error'); }
};

const reportUser = async (target: {_id:string;name:string}) => {
  try {
    await axios.post(`${API_URL}/report/${target._id}`, { context: 'chat' }, { headers: { Authorization: `Bearer ${token}` } });
    showToast('Şikayetin alındı, 24 saat içinde incelenecek');
  } catch { showToast('Şikayet gönderilemedi', 'error'); }
};

// Engelle/şikayet menüsü (sohbet başlığındaki ⋯ butonu)
const openModerationMenu = (target: {_id:string;name:string}) => {
  Alert.alert(target.name, 'Bu kullanıcı için bir işlem seç', [
    { text: 'Şikayet Et', onPress: () => Alert.alert('Şikayet Et', `${target.name} adlı kullanıcıyı uygunsuz davranıştan şikayet etmek istiyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Şikayet Et', style: 'destructive', onPress: () => reportUser(target) },
    ]) },
    { text: 'Engelle', style: 'destructive', onPress: () => Alert.alert('Engelle', `${target.name} engellenecek. Arkadaşlığınız kaldırılır ve birbirinize mesaj gönderemezsiniz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Engelle', style: 'destructive', onPress: () => blockUser(target) },
    ]) },
    { text: 'Vazgeç', style: 'cancel' },
  ]);
};

// ─── HESABI SİL (App Store 5.1.1 + Play zorunlu) — çift onaylı, kalıcı ───
const deleteAccount = async () => {
  try {
    await axios.delete(`${API_URL}/account`, { headers: { Authorization: `Bearer ${token}` } });
    showToast('Hesabın ve tüm verilerin silindi.');
    await SecureStore.deleteItemAsync('userToken');
    setUser(null);
    setToken(null);
  } catch (e: any) {
    showToast(e.response?.data?.error || 'Hesap silinemedi', 'error');
  }
};

const confirmDeleteAccount = () => {
  Alert.alert(
    'Hesabı Sil',
    'Hesabın, antrenman/beslenme verilerin, fotoğrafların, mesajların ve tüm bilgilerin KALICI olarak silinecek. Bu işlem geri alınamaz.\n\nNot: Aktif aboneliğin varsa, hesabı silmek aboneliği iptal ETMEZ. İptal için App Store / Google Play → Abonelikler bölümünü kullan.',
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Devam Et', style: 'destructive', onPress: () => Alert.alert(
        'Emin misin?',
        'Bu son adım. Hesabın kalıcı olarak silinecek ve geri getirilemeyecek.',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Hesabı Kalıcı Sil', style: 'destructive', onPress: deleteAccount },
        ]
      ) },
    ]
  );
};

// ─── ARKADAŞ MEYDAN OKUMASI ───────────────────────────────────────────────────
const LIFT_LABELS_MAP: Record<string,string> = { bench:'Bench Press', squat:'Squat', deadlift:'Deadlift', ohp:'Shoulder Press', latpull:'Lat Pull Down', curl:'Barbell Curl', lateral:'Lateral Raise' };

// 1. Oluştur — sadece hareket, kilo yok
const createChallenge = async () => {
  try {
    setLoading(true);
    const { data } = await axios.post(`${API_URL}/challenge/create`, { lift: challengeLift }, { headers: { Authorization: `Bearer ${token}` } });
    setChallengeCode(data.code);
    setChallengeScreen('code');
  } catch (e: any) { showToast(e.response?.data?.error || 'Hata', 'error'); }
  finally { setLoading(false); }
};

// 2. Rakip kodu girer → katıl
const joinChallenge = async () => {
  const code = challengeCodeInput.trim().toUpperCase();
  if (code.length < 4) { showToast('Kodu gir', 'error'); return; }
  try {
    setLoading(true);
    const { data } = await axios.post(`${API_URL}/challenge/${code}/join`, {}, { headers: { Authorization: `Bearer ${token}` } });
    setChallengeInfo(data);
    setChallengeScreen('accept-weight');
  } catch (e: any) { showToast(e.response?.data?.error || 'Kod bulunamadı', 'error'); }
  finally { setLoading(false); }
};

// 3. Her iki taraf da kendi kilosunu gönderir
const submitChallengeWeight = async (isChallenger: boolean) => {
  const w = parseFloat(isChallenger ? challengeMyWeight : challengeTheirWeight);
  if (!(w > 0)) { showToast('Ağırlık gir', 'error'); return; }
  const code = (isChallenger ? challengeCode : challengeCodeInput.trim().toUpperCase());
  try {
    setLoading(true);
    const { data } = await axios.post(`${API_URL}/challenge/${code}/submit`, { weight: w }, { headers: { Authorization: `Bearer ${token}` } });
    if (data.complete) {
      setChallengeResult(data);
      setChallengeScreen('result');
    } else {
      setChallengeScreen('waiting');
    }
  } catch (e: any) { showToast(e.response?.data?.error || 'Hata', 'error'); }
  finally { setLoading(false); }
};

// 4. Bekleyen taraf sonucu kontrol eder
const checkChallengeResult = async () => {
  const code = challengeCode || challengeCodeInput.trim().toUpperCase();
  try {
    setLoading(true);
    const { data } = await axios.get(`${API_URL}/challenge/${code}`);
    if (data.status === 'complete') {
      // iWon: kim ben olduğumu anlamak için challengerName kontrol et
      const myName = user?.name || '';
      const iAmChallenger = data.challengerName === myName;
      setChallengeResult({
        challengerName: data.challengerName, challengerBest: data.challengerBest,
        respondentName: data.respondentName, respondentBest: data.respondentBest,
        liftLabel: data.liftLabel,
        iWon: iAmChallenger ? data.challengerBest >= data.respondentBest : data.respondentBest >= data.challengerBest,
      });
      setChallengeScreen('result');
    } else {
      showToast('Henüz bitmedi, bekle!');
    }
  } catch { showToast('Hata', 'error'); }
  finally { setLoading(false); }
};

const pickChallengePhoto = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.8 });
  if (!result.canceled && result.assets?.[0]) setChallengeSharePhoto(result.assets[0].uri);
};

const captureChallengeShare = async () => {
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { showToast('Paylaşım desteklenmiyor.', 'error'); return; }
    await new Promise(r => setTimeout(r, 350));
    const uri = await (challengeShareRef.current as any)?.capture();
    if (!uri) { showToast('Görsel oluşturulamadı.', 'error'); return; }
    const dest = FileSystem.documentDirectory + 'gymbodyai_challenge.jpg';
    const srcUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    await Sharing.shareAsync(dest, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'GymBodyAI Kapışma' });
  } catch (err: any) { showToast(err?.message || 'Paylaşım başarısız.', 'error'); }
  finally { setChallengeScreen(null); setChallengeSharePhoto(null); setChallengeResult(null); }
};

const pickRankSharePhoto = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.8,
  });
  if (!result.canceled && result.assets?.[0]) setRankSharePhoto(result.assets[0].uri);
};

// Siklet sırası kartını yakala + paylaş
const captureRankShare = async () => {
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { showToast('Paylaşım bu cihazda desteklenmiyor.', 'error'); return; }
    await new Promise(r => setTimeout(r, 350));
    const uri = await (rankShareRef.current as any)?.capture();
    if (!uri) { showToast('Görsel oluşturulamadı.', 'error'); return; }
    const dest = FileSystem.documentDirectory + 'gymbodyai_siklet.jpg';
    const srcUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    await Sharing.shareAsync(dest, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'GymBodyAI Siklet Sıram' });
  } catch (err: any) {
    showToast(err?.message || 'Paylaşım başarısız.', 'error');
  } finally {
    setRankShareData(null);
    setRankSharePhoto(null);
  }
};

const captureAndShare = async () => {
  try {
    setShareLoading(true);
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { showToast('Paylaşım bu cihazda desteklenmiyor.', 'error'); return; }
    const uri = await (shareCardRef.current as any)?.capture();
    if (!uri) { showToast('Görsel oluşturulamadı.', 'error'); return; }
    // tmp'den kalıcı dizine kopyala — WhatsApp/Instagram tmp'yi okuyamıyor
    const dest = FileSystem.documentDirectory + 'gymbodyai_share.jpg';
    const srcUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    // önceki paylaşımdan kalan dosya varsa sil (copyAsync üzerine yazamıyor)
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    // ÖNEMLİ: modal'ı kapatma — paylaşım menüsü modal'ın üstünde açılmalı,
    // aksi halde iOS kapanma animasyonuyla çakışıp menüyü sessizce iptal ediyor
    await Sharing.shareAsync(dest, {
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
      dialogTitle: 'GymBodyAI Gelişimim',
    });
  } catch (err: any) {
    showToast(err?.message || 'Paylaşım başarısız.', 'error');
  } finally {
    setShareLoading(false);
    setShareCardReady(false); // paylaşım menüsü kapandıktan sonra modal'ı kapat
  }
};

const handleCompleteDay = async (feedback?: string) => {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const res = await axios.post(`${API_URL}/complete-day`, { dailyFeedback: feedback || '' }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklyPlan(res.data.weeklyPlan);
    setDayFeedbackText('');
    setDayFeedbackVisible(false);
    if (!res.data.isLastDay) setShowRestPrompt(true);
    // Yeni rozetler
    if (res.data.newBadges?.length) {
      setNewBadges(res.data.newBadges);
      setNewBadgeVisible(true);
    }
  } catch (error: any) {
    const msg = error.userMessage || error.response?.data?.error || 'Gün tamamlanamadı.';
    setDayFeedbackVisible(false);
    showToast(msg, 'error');
  }
};
  // Auth İşlemleri (Loglu)
  const handleAuth = async () => {
    if (!email || !password) {
      return showToast('E-posta ve şifre alanlarını doldur', 'error');
    }

    setLoading(true);
    try {
      if (isRegister) {
        const payload: any = {
          email: email.trim(),
          password: password,
          name: name.trim() || "İsimsiz Sporcu",
          height: parseFloat(height) || 0,
          weight: parseFloat(weight) || 0
        };
        if (referralCode.trim()) payload.referralCode = referralCode.trim();
        const res = await axios.post(`${API_URL}/register`, payload);
        const bonus = res.data.referralBonus;
        const msg = bonus
          ? `Kayıt başarılı! ${bonus.coachName} referansıyla %${bonus.discountRate} VIP indirimi kazandın! 🎉`
          : "Kayıt başarılı kanka, şimdi giriş yapabilirsin!";
        showToast(msg);
        setIsRegister(false);
        setReferralCode('');
        setReferralBonus(null);
      } else {
        const res = await axios.post(`${API_URL}/login`, {
          email: email.trim(),
          password: password
        });
        setUser(res.data.user);
        setToken(res.data.token);
        await SecureStore.setItemAsync('userToken', res.data.token); // otomatik giriş için sakla
        registerPushToken(res.data.token);
      }
    } catch (err: any) {
      console.log("🔥 AUTH HATASI:", err);
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error || err.userMessage || err.message || "Sunucuya bağlanılamadı kanka";
      // Giriş başarısız (hesap yok / silinmiş / şifre hatalı) → net, görünür uyarı
      if (!isRegister && (status === 400 || status === 401)) {
        Alert.alert('Giriş yapılamadı', 'Böyle bir hesap bulunamadı veya şifre hatalı. Bilgileri kontrol et ya da yeni bir hesap oluştur.');
      } else {
        showToast(errorMsg, 'error');
      }
    } finally {
      setLoading(false);
    }
  };
// ☁️ GELİŞİM FOTOĞRAFINI CLOUDINARY'YE GÖNDEREN FONKSİYON
  const uploadImage = async () => {
    if (!image) return;
    setLoading(true);

    let formData = new FormData();
    let filename = image.split('/').pop();
    formData.append('photo', { uri: image, name: filename, type: 'image/jpeg' } as any);
    formData.append('note', note);
    formData.append('userId', user._id);

    try {
      console.log("📤 Gelişim fotoğrafı backend'e basılıyor...");
      await axios.post(`${API_URL}/upload-progress`, formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
    Authorization: `Bearer ${token}`
  },
});
      showToast('Fotoğraf kaydedildi ✓');
      setImage(null);
      setNote('');
      fetchPhotos(); // Akışı yenilesin kanka
    } catch (error) {
      console.log("🔥 FOTO YÜKLEME HATASI:", error);
      showToast('Fotoğraf yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };
  const updateProfile = async () => {
  setLoading(true);
  try {
    const parsedHeight = editHeight ? parseFloat(editHeight) : null;
    const parsedWeight = editWeight ? parseFloat(editWeight) : null;
    const body: any = { name: editName.trim() || user.name };
    if (parsedHeight && !isNaN(parsedHeight)) body.height = parsedHeight;
    if (parsedWeight && !isNaN(parsedWeight)) body.weight = parsedWeight;
    const res = await axios.put(`${API_URL}/update-profile`, body, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUser(res.data.user);

    // Opsiyonel vücut ölçüleri: editingStatId varsa mevcut kaydı DÜZELT (PUT),
    // yoksa yeni ölçü kaydı EKLE (POST).
    if (statWaist || statShoulder || statNeck || editingStatId) {
      const measurePayload = {
        weight: parseFloat(editWeight) || null,
        waist: statWaist ? parseFloat(statWaist) : null,
        shoulder: statShoulder ? parseFloat(statShoulder) : null,
        neck: statNeck ? parseFloat(statNeck) : null
      };
      if (editingStatId) {
        await axios.put(`${API_URL}/body-stat/${editingStatId}`, measurePayload, { headers: { Authorization: `Bearer ${token}` } });
        setEditingStatId(null);
      } else {
        await axios.post(`${API_URL}/add-body-stat`, measurePayload, { headers: { Authorization: `Bearer ${token}` } });
      }
      setStatWaist(''); setStatShoulder(''); setStatNeck('');
      fetchBodyStats();
    }

    setIsEditingProfile(false);
    showToast('Profil güncellendi ✓');
  } catch (error: any) {
    const detail = error.response?.data?.error || error.message || 'bilinmeyen hata';
    console.log("🔥 PROFİL GÜNCELLEME HATASI:", error.response?.status, detail, error.response?.data);
    showToast(`Hata: ${detail}`, 'error');
  } finally {
    setLoading(false);
  }
};
  const deletePhoto = async (photoId: string) => {
  Alert.alert(
    "Fotoğrafı Sil",
    "Bu fotoğrafı kalıcı olarak silmek istediğine emin misin?",
    [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/delete-progress/${photoId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            fetchPhotos(); // listeyi yenile
          } catch (error) {
            console.log("🔥 SİLME HATASI:", error);
            showToast('Fotoğraf silinemedi.', 'error');
          }
        }
      }
    ]
  );
};
const purchaseVip = async (packageId: string) => {
  try {
    setLoading(true);
    let offerings;
    try {
      offerings = await Purchases.getOfferings();
    } catch {
      Alert.alert('Yakında!', 'Uygulama mağazaya yüklendikten sonra satın alma aktif olacak.');
      return;
    }
    const offering = offerings.all['gymvip'] ?? offerings.current;
    if (!offering || offering.availablePackages.length === 0) {
      Alert.alert('Yakında!', 'Uygulama mağazaya yüklendikten sonra satın alma aktif olacak.');
      return;
    }
    const pkg = offering.availablePackages.find(p => p.identifier === packageId);
    if (!pkg) { showToast('Paket bulunamadı', 'error'); return; }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (customerInfo.entitlements.active['vip']) {
      await axios.post(`${API_URL}/revenuecat-webhook`, {
        userId: user?._id,
        entitlement: 'vip',
        expiresAt: customerInfo.entitlements.active['vip'].expirationDate,
      }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchUserStats();
      showToast('VIP aktif oldu! 🎉');
    }
  } catch (e: any) {
    if (!e.userCancelled) showToast(e.message || 'Satın alma başarısız', 'error');
  } finally {
    setLoading(false);
  }
};

  // --- KAMERA VEYA GALERİ SEÇİM ---
const askAndPickImage = async (type: 'progress' | 'meal') => {
  if (type === 'meal' && dailyMealRights <= 0) {
    return Alert.alert("Hakkın Bitti kanka!", "Bugünlük yemek tarama hakkın bitti. Geriye dönük sınırsız kayıt ve analiz için yakında VIP üye olabilirsin! 😉");
  }

  if (type === 'progress') {
    Alert.alert(
      "📸 Vücut Analizi İpucu",
      "Daha doğru bir yağ oranı tahmini için: aydınlık bir ortamda, vücudunu net gösteren kıyafetlerle (atlet/şort gibi) ve düz bir açıdan çekim yapmaya çalış.",
      [
        { text: "Anladım, Devam Et", onPress: () => showImageSourceOptions(type) }
      ]
    );
  } else {
    showImageSourceOptions(type);
  }
};

const showImageSourceOptions = (type: 'progress' | 'meal') => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  Alert.alert(
    "Fotoğraf Kaynağı 📸",
    "Fotoğrafı nasıl ekleyelim kanka?",
    [
      {
        text: "📸 Kamera ile Çek",
        onPress: async () => {
          let permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) return Alert.alert("Hata", "Kamera izni vermedin kanka!");

          let result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: type === 'progress' ? [1, 1] : [4, 3],
            quality: 0.6,
          });
          if (!result.canceled) {
            if (type === 'progress') {
              setImage(result.assets[0].uri);
            } else {
              setMealImage(result.assets[0].uri);
              setMealResult(null); // eski sonucu temizle

            }
          }
        }
      },
      {
        text: "🖼️ Galeriden Seç",
        onPress: async () => {
          let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: type === 'progress' ? [1, 1] : [4, 3],
            quality: 0.6,
          });
          if (!result.canceled) {
            if (type === 'progress') {
              setImage(result.assets[0].uri);
            } else {
              setMealImage(result.assets[0].uri);
              setMealResult(null); // eski sonucu temizle

            }
          }
        }
      },
      { text: "İptal", style: "cancel" }
    ]
  );
};
  // --- YEMEK ANALİZİNİ BACKEND'E GÖNDERME ---
const sendMealToAI = async (uri: string) => {
  setLoading(true);
  setMealResult(null);

  let formData = new FormData();
  let filename = uri.split('/').pop();
  formData.append('photo', { uri: uri, name: filename, type: 'image/jpeg' } as any);
  formData.append('note', mealNote);

  try {
    const response = await axios.post(`${API_URL}/analyze-meal`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      },
    });
    setMealResult(response.data);
    setMealNote('');
    fetchMealLogs(); // Günlüğü ve kalan hakkı tazele
  } catch (error: any) {
    console.log("🔥 AI GÖNDERİM HATASI:", error);
    const msg = error.response?.data?.error || 'Yemek analiz edilemedi. Sunucu logunu veya API keyini kontrol et kanka.';
    showToast(msg, 'error');
  } finally {
    setLoading(false);
  }
};
  // --- PROFİL FOTOĞRAFI: galeriden seç + yükle ---
const pickAndUploadProfilePhoto = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'profile.jpg';
    formData.append('photo', { uri, name: filename, type: 'image/jpeg' } as any);
    showToast('Fotoğraf yükleniyor…');
    const res = await axios.post(`${API_URL}/upload-profile-photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
    });
    if (res.data.user) setUser(res.data.user);
    showToast('Profil fotoğrafı güncellendi ✓');
  } catch (e: any) {
    showToast(e.response?.data?.error || 'Fotoğraf yüklenemedi', 'error');
  }
};
  // --- AÇILIŞ: otomatik giriş kontrol edilirken splash göster ---
  if (restoring) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <Text style={{ color: C.lime, fontSize: 28, fontWeight: '900', letterSpacing: 0.5 }}>GymBodyAI</Text>
        <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 20 }} />
      </View>
    );
  }
  // --- GİRİŞ EKRANI (AÇILIŞ) ---
  if (!user) {
    return (
      <View style={styles.authRoot}>
        <StatusBar style="light" />
        <LinearGradient
          colors={['#1A2A0E', '#0B0D12', '#0B0D12']}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          contentContainerStyle={styles.authScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo Rozeti */}
          <AnimatedLinearGradient
            colors={[C.lime, C.limeDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.logoBadge, logoStyle]}
          >
            <Ionicons name="barbell" size={40} color="#0B0D12" />
          </AnimatedLinearGradient>

          <Text style={styles.authBrand}>GymBody<Text style={{ color: C.lime }}>AI</Text></Text>
          <Text style={styles.authTitle}>{isRegister ? 'Aramıza Katıl' : 'Tekrar Hoş Geldin'}</Text>
          <Text style={styles.authSubtitle}>
            {isRegister ? 'Hedeflerine giden yolculuk burada başlıyor.' : 'Formuna kaldığın yerden devam et.'}
          </Text>

          <View style={styles.authCard}>
            {isRegister && (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={20} color={C.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.inputWithIcon}
                  placeholder="İsim Soyisim"
                  placeholderTextColor={C.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={C.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.inputWithIcon}
                placeholder="E-posta"
                placeholderTextColor={C.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={C.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.inputWithIcon}
                placeholder="Şifre"
                placeholderTextColor={C.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {isRegister && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={[styles.inputWrap, { flex: 0.48 }]}>
                    <Ionicons name="resize-outline" size={18} color={C.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="Boy (cm)"
                      placeholderTextColor={C.textMuted}
                      value={height}
                      onChangeText={setHeight}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.inputWrap, { flex: 0.48 }]}>
                    <Ionicons name="scale-outline" size={18} color={C.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="Kilo (kg)"
                      placeholderTextColor={C.textMuted}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </>
            )}

            {loading ? (
              <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 16 }} />
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={handleAuth} style={{ marginTop: 6 }}>
                <LinearGradient
                  colors={[C.lime, C.limeDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>{isRegister ? 'KAYDOL' : 'GİRİŞ YAP'}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#0B0D12" />
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* AYIRAÇ */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#262C3A' }} />
              <Text style={{ color: C.textMuted, marginHorizontal: 12, fontSize: 12 }}>veya</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#262C3A' }} />
            </View>

            {/* GOOGLE İLE GİRİŞ */}
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!gRequest || googleLoading}
              onPress={() => { setGoogleLoading(true); gPromptAsync(); }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 14,
                opacity: (!gRequest || googleLoading) ? 0.6 : 1,
              }}
            >
              {googleLoading ? (
                <ActivityIndicator color="#1D2230" />
              ) : (
                <Ionicons name="logo-google" size={20} color="#EA4335" />
              )}
              <Text style={{ color: '#1D2230', fontWeight: '700', fontSize: 15 }}>Google ile devam et</Text>
            </TouchableOpacity>

            {/* APPLE İLE GİRİŞ (yalnızca iOS — App Store 4.8 zorunlu) */}
            {Platform.OS === 'ios' && appleAvailable && (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={appleLoading}
                onPress={loginWithApple}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  backgroundColor: '#000000', borderRadius: 14, paddingVertical: 14, marginTop: 12,
                  borderWidth: 1, borderColor: '#3A3A3C', opacity: appleLoading ? 0.6 : 1,
                }}
              >
                {appleLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                )}
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Apple ile devam et</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={{ marginTop: 22 }}>
            <Text style={styles.switchText}>
              {isRegister ? 'Zaten hesabım var · ' : 'Hesabın yok mu? '}
              <Text style={{ color: C.lime, fontWeight: '700' }}>
                {isRegister ? 'Giriş Yap' : 'Yeni Hesap Aç'}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
  // --- TÜRETİLMİŞ VERİLER (kullanıcı giriş yaptıysa hesaplanır) ---
  // Bugünün öğünleri & kalan tarama hakkı (günde 2)
  const todayKey = new Date().toDateString();
  const todayLogs = mealLogs.filter((m) => new Date(m.date).toDateString() === todayKey);
  const dailyMealRights = userStats.isVip ? 999 : Math.max(0, 2 - todayLogs.length);
  const todayCalories = todayLogs.reduce((s, m) => s + (m.calories || 0), 0);

  // Bu haftanın yenen ürünleri (Pazartesi başlangıçlı) — liste sadece o hafta tutulur
  const weekStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // Pazartesi = 0
    d.setDate(d.getDate() - day);
    return d;
  })();
  const thisWeekMealLogs = mealLogs.filter((m) => new Date(m.date) >= weekStart);

  // Günlük toplamlar (haftalık grafik için gün gün topla)
  const dailyTotalsMap: Record<string, any> = {};
  mealLogs.forEach((m) => {
    const d = new Date(m.date); d.setHours(0, 0, 0, 0);
    const k = String(d.getTime());
    if (!dailyTotalsMap[k]) dailyTotalsMap[k] = { date: d, calories: 0 };
    dailyTotalsMap[k].calories += m.calories || 0;
  });
  const dailyTotals = Object.values(dailyTotalsMap).sort((a: any, b: any) => a.date - b.date);
  const last7 = dailyTotals.slice(-7);

  // Bazal metabolizma (Mifflin-St Jeor) + günlük hedef
  const gAge = parseFloat(goalAge);
  const gTarget = parseFloat(goalTarget);
  const uW = user.weight, uH = user.height;
  let bmr: number | null = null, tdee: number | null = null;
  if (uW && uH && gAge) {
    bmr = Math.round(10 * uW + 6.25 * uH - 5 * gAge + (goalGender === 'male' ? 5 : -161));
    tdee = Math.round(bmr * 1.375); // hafif aktif yaşam katsayısı
  }
  let dailyTarget: number | null = null, goalMode = '', goalWeeks: number | null = null, goalDelta = 0;
  if (tdee && gTarget && uW) {
    if (gTarget < uW) { goalDelta = -500; goalMode = 'Kilo Verme'; }
    else if (gTarget > uW) { goalDelta = 300; goalMode = 'Kilo Alma'; }
    else { goalDelta = 0; goalMode = 'Koruma'; }
    dailyTarget = tdee + goalDelta;
    if (goalDelta !== 0) goalWeeks = Math.ceil((Math.abs(uW - gTarget) * 7700) / (Math.abs(goalDelta) * 7));
  }

  // Kiloya göre günlük makro hedefleri (protein öncelikli) + bugün tüketilen
  const proteinTarget = uW ? Math.round(uW * 1.5) : null;          // örn. 100 kg → 150 g
  const fatTarget = uW ? Math.round(uW * 0.8) : null;              // örn. 100 kg → 80 g
  const carbsTarget = (dailyTarget && proteinTarget && fatTarget)
    ? Math.max(0, Math.round((dailyTarget - proteinTarget * 4 - fatTarget * 9) / 4))
    : null;
  const todayProtein = Math.round(todayLogs.reduce((s, m) => s + (m.protein || 0), 0));
  const todayCarbs = Math.round(todayLogs.reduce((s, m) => s + (m.carbs || 0), 0));
  const todayFat = Math.round(todayLogs.reduce((s, m) => s + (m.fat || 0), 0));

  const saveGoals = async () => {
    setLoading(true);
    try {
      const res = await axios.put(`${API_URL}/update-profile`, {
        age: goalAge ? parseFloat(goalAge) : undefined,
        gender: goalGender,
        targetWeight: goalTarget ? parseFloat(goalTarget) : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data.user);
      showToast('Hedefler kaydedildi ✓');
    } catch (error) {
      console.log("🔥 HEDEF KAYIT HATASI:", error);
      showToast('Hedefler kaydedilemedi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- ANA UYGULAMA EKRANI ---
  const TABS = [
  { key: 'analiz', label: 'Analiz', icon: 'analytics-outline' as const, gym: false },
  { key: 'pt', label: 'PT', icon: 'person-circle-outline' as const, gym: false },
  { key: 'gymBody', label: 'GymBody', icon: 'barbell-outline' as const, gym: true },
  { key: 'stats', label: 'Max Güç', icon: 'trophy-outline' as const, gym: false },
  { key: 'profile', label: 'Profil', icon: 'person-outline' as const, gym: false },
];

  const swipePanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dy) < 60,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 40) return;
      const tabKeys = TABS.map(t => t.key);
      const idx = tabKeys.indexOf(currentTab);
      if (g.dx < 0 && idx < TABS.length - 1) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCurrentTab(tabKeys[idx + 1]); }
      if (g.dx > 0 && idx > 0) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCurrentTab(tabKeys[idx - 1]); }
    },
  });

  return (
  <View style={[styles.container, { paddingTop: insets.top + 10 }]} {...swipePanResponder.panHandlers}>
      <StatusBar style="light" />

      {/* AMBIENT GLOW — sekme aksanına göre yumuşak üst ışık (sırıtmadan derinlik) */}
      {TAB_GLOW[currentTab] && (
        <LinearGradient
          pointerEvents="none"
          colors={TAB_GLOW[currentTab] as any}
          locations={[0, 0.45, 1]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={{ position: 'absolute', top: 0, left: -16, right: -16, height: 360 }}
        />
      )}

      {/* ÜST BAŞLIK */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topGreeting}>Hoş geldin 👋</Text>
          <Text style={styles.topName}>{user.name}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={pickAndUploadProfilePhoto} style={styles.avatar}>
          {(user.profilePhoto || user.googlePhoto) ? (
            <Image source={{ uri: user.profilePhoto || user.googlePhoto }} style={{ width: 46, height: 46, borderRadius: 16 }} />
          ) : (
            <LinearGradient colors={[C.lime, C.limeDark]} style={{ width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={styles.avatarText}>{(user.name?.[0] || 'S').toUpperCase()}</Text>
            </LinearGradient>
          )}
          <View style={{ position: 'absolute', bottom: -3, right: -3, backgroundColor: C.orange, borderRadius: 9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}>
            <Ionicons name="camera" size={10} color="#0B0D12" />
          </View>
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1 }} key={currentTab} entering={FadeIn.duration(300)}>
      {currentTab === 'gymBody' && (
  <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

    {!userStats.isVip ? (
      /* KİLİTLİ EKRAN */
      <TouchableOpacity activeOpacity={0.9} onPress={() => setCurrentTab('profile')} style={{ flex: 1, alignItems: 'center', paddingTop: 40 }}>
        <LinearGradient colors={['#2A1F60', '#1A1235']} style={styles.gymLockCard}>
          <Ionicons name="barbell" size={48} color="#FF9F1C" style={{ marginBottom: 16 }} />
          <Text style={styles.gymLockTitle}>GymBody VIP</Text>
          <Text style={styles.gymLockSubtitle}>
            Kişisel AI antrenörünle her hafta sana özel antrenman ve beslenme programı, Max Güç kayıt ve güç sıralaması, sınırsız yağ oranı analizi, gelişim fotoğrafı karşılaştırması ve kalori hedefi.
          </Text>

          <View style={styles.gymLockStats}>
            <View style={styles.gymLockStatItem}>
              <Ionicons name="flame" size={16} color={C.orange} />
              <Text style={styles.gymLockStatText}>{userStats.streak} Günlük Seri</Text>
            </View>
          </View>

          <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32, marginTop: 16, alignItems: 'center' }}>
            <Text style={{ color: '#1A1530', fontWeight: '900', fontSize: 15 }}>VIP'e Geç</Text>
          </LinearGradient>
        </LinearGradient>
      </TouchableOpacity>
    ) : (
      /* VIP EKRANI */
      <View>


        <View>

        {/* MOLA PROMPT */}
        {showRestPrompt && weeklyPlan && !weeklyPlan.completedFully && (() => {
          const nextDay = weeklyPlan.workoutPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);
          return (
            <View style={styles.restPromptCard}>
              <Text style={styles.restPromptTitle}>Tebrikler, günü bitirdin! 💪</Text>
              <Text style={styles.restPromptSub}>Bugün mola vermek ister misin?</Text>
              <View style={styles.restPromptBtns}>
                <TouchableOpacity
                  style={styles.restPromptYes}
                  activeOpacity={0.85}
                  onPress={() => { setIsRestDay(true); setShowRestPrompt(false); }}
                >
                  <Ionicons name="bed-outline" size={18} color={C.textSec} />
                  <Text style={styles.restPromptYesText}>Evet, mola ver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.restPromptNo}
                  activeOpacity={0.85}
                  onPress={() => { setIsRestDay(false); setShowRestPrompt(false); }}
                >
                  <Ionicons name="barbell-outline" size={18} color="#1A1235" />
                  <Text style={styles.restPromptNoText}>Hayır{nextDay ? ` · ${nextDay.focus}` : ''}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* MOLA GÜNÜ EKRANI */}
        {isRestDay && !showRestPrompt && weeklyPlan && (() => {
          const nextDay = weeklyPlan.workoutPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);
          const REST_QUOTES = [
            "Kaslar antrenman sırasında yıkılır, dinlenme sırasında inşa edilir.",
            "Bugün duruyorsun, yarın daha güçlü başlıyorsun.",
            "Dinlenme de programın parçası. Atlama.",
            "Büyüme, salondan çıktıktan sonra olur.",
            "Bugünkü mola, yarınki performansın temeli.",
          ];
          const quote = REST_QUOTES[Math.floor(Math.random() * REST_QUOTES.length)];
          return (
            <LinearGradient colors={['#1A1235', '#0B0D12']} style={styles.restDayCard}>
              {/* Ay ikonu */}
              <View style={styles.restMoonCircle}>
                <Ionicons name="moon" size={36} color="#FF9F1C" />
              </View>

              <Text style={styles.restDayTitle}>Mola Günü 🌙</Text>
              <Text style={styles.restDayQuote}>"{quote}"</Text>

              {/* Yarınki antrenman önizleme */}
              {nextDay && (
                <View style={styles.restNextCard}>
                  <Text style={styles.restNextLabel}>YARIN</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Ionicons name="barbell-outline" size={18} color="#FF9F1C" />
                    <Text style={styles.restNextFocus}>{nextDay.focus}</Text>
                  </View>
                  <Text style={styles.restNextCount}>{nextDay.exercises?.length || 0} egzersiz seni bekliyor</Text>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIsRestDay(false)}
                style={styles.restBackBtn}
              >
                <Ionicons name="barbell-outline" size={16} color="#FF9F1C" />
                <Text style={styles.restBackBtnText}>Antrenmana dön</Text>
              </TouchableOpacity>
            </LinearGradient>
          );
        })()}

        {/* FORM */}
        {!weeklyPlan && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Programını Oluştur</Text>

            {/* BESLENME HEDEFİ */}
            <Text style={[styles.statsSubtitle, { marginBottom: 10 }]}>Beslenme hedefin nedir?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              {([
                { key: 'definition', label: '🔥 Definasyon', desc: 'Yağ yak' },
                { key: 'bulk',       label: '💪 Bulk',       desc: 'Kas kazan' },
                { key: 'maintain',   label: '⚖️ Koruma',     desc: 'Formu koru' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setGymGoal(opt.key)}
                  style={{
                    flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
                    backgroundColor: gymGoal === opt.key ? '#FF9F1C22' : C.surface2,
                    borderWidth: 1.5,
                    borderColor: gymGoal === opt.key ? '#FF9F1C' : C.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: gymGoal === opt.key ? '#FF9F1C' : C.text }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ALERJİ */}
            <Text style={[styles.statsSubtitle, { marginBottom: 8 }]}>Alerji veya tüketmediğin yiyecekler var mı? (opsiyonel)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="örn. laktoz, fıstık, gluten, kırmızı et..."
              placeholderTextColor={C.textMuted}
              value={gymAllergy}
              onChangeText={setGymAllergy}
              multiline
            />

            {gymLoading ? (
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <ActivityIndicator size="large" color="#FF9F1C" />
                <Text style={[styles.loaderText, { marginTop: 12 }]}>AI programını hazırlıyor, bu biraz sürebilir...</Text>
              </View>
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={() => fetchWeeklyPlan()} style={{ marginTop: 8 }}>
                <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primaryBtn, { shadowColor: C.orange, shadowOpacity: 0.45 }]}>
                  <Ionicons name="sparkles" size={18} color="#1A1235" />
                  <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>PROGRAMIMI OLUŞTUR</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* PROGRAM HAZIR — İNTRO / "Programa Başla" */}
        {weeklyPlan && !weeklyPlan.completedFully && !weeklyPlan.started && weeklyPlan.currentDay === 1 && !weeklyPlan.lastDayCompletedAt && (
          <View style={[styles.statsCard, { alignItems: 'center', borderColor: '#FF9F1C', borderWidth: 1 }]}>
            <Text style={{ fontSize: 40, marginBottom: 4 }}>🎯</Text>
            <Text style={[styles.statsTitle, { textAlign: 'center' }]}>Programın Hazır!</Text>
            <Text style={[styles.statsSubtitle, { textAlign: 'center', marginTop: 6, marginBottom: 18 }]}>
              Sana özel olarak hazırlandı. İçinde antrenman ve beslenme planın gün gün seni bekliyor 💪
            </Text>

            {gymLoading ? (
              <ActivityIndicator size="large" color="#FF9F1C" />
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={startProgram} style={{ width: '100%' }}>
                <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primaryBtn, { shadowColor: C.orange, shadowOpacity: 0.45 }]}>
                  <Ionicons name="play" size={18} color="#1A1235" />
                  <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>PROGRAMA BAŞLA</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* HAREKET KÜTÜPHANESİ girişi */}
        <TouchableOpacity onPress={openLibrary} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="albums-outline" size={20} color={C.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Hareket Kütüphanesi</Text>
            <Text style={{ color: C.textMuted, fontSize: 12 }}>Hareketlerin yapılışına bak</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
        </TouchableOpacity>

        {/* PLAN GÖSTERİMİ */}
        {weeklyPlan && !weeklyPlan.completedFully && !isRestDay && !showRestPrompt && !(!weeklyPlan.started && weeklyPlan.currentDay === 1 && !weeklyPlan.lastDayCompletedAt) && (() => {
  const currentWorkoutDay = weeklyPlan.workoutPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);
  const currentNutritionDay = weeklyPlan.nutritionPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);

  return (
    <View>
      {currentWorkoutDay && (() => {
        const exs = currentWorkoutDay.exercises || [];
        const total = weeklyPlan.totalDays || weeklyPlan.workoutPlan?.length || 1;
        const estMin = exs.length * 6 + 8;
        return (
        <View>
          {/* HERO — bugünkü antrenman */}
          <View style={styles.gymDayCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.lime, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>BUGÜN</Text>
                <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', marginTop: 3 }}>{currentWorkoutDay.focus}</Text>
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="barbell-outline" size={15} color={C.textMuted} />
                    <Text style={{ color: C.textSec, fontSize: 12 }}>{exs.length} hareket</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="time-outline" size={15} color={C.textMuted} />
                    <Text style={{ color: C.textSec, fontSize: 12 }}>~{estMin} dk</Text>
                  </View>
                </View>
              </View>
              <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 4, borderColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: '800' }}>{weeklyPlan.currentDay}/{total}</Text>
              </View>
            </View>
            <TouchableOpacity activeOpacity={0.88} onPress={() => { setWorkoutExIdx(0); setWorkoutSetIdx(0); setRestSeconds(null); setWorkoutActive(true); }}
              style={{ marginTop: 14, backgroundColor: C.lime, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Ionicons name="play" size={18} color="#0B1207" />
              <Text style={{ color: '#0B1207', fontWeight: '800', fontSize: 15 }}>Antrenmana başla</Text>
            </TouchableOpacity>
          </View>

          {/* HAREKETLER */}
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 2 }}>Hareketler · {currentWorkoutDay.dayNumber}. gün</Text>
          {exs.map((ex: any, j: number) => (
            <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.surface, borderRadius: 12, padding: 9, marginBottom: 7, borderWidth: 1, borderColor: C.border }}>
              <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: C.surface2, overflow: 'hidden' }}>
                {ex.gifUrl ? <ExpoImage source={{ uri: `${API_URL}/gif-proxy?url=${encodeURIComponent(ex.gifUrl)}`, headers: { Authorization: `Bearer ${token}` } }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{ex.name}</Text>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>{ex.sets}</Text>
              </View>
              {ex.gifUrl && (
                <TouchableOpacity activeOpacity={0.8} onPress={() => setGifModalUrl(ex.gifUrl)} style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play" size={16} color={C.lime} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
        );
      })()}

      {/* GÜNÜN BESLENME PLANI — antrenmanla aynı yerde (Analiz'den taşındı) */}
      {currentNutritionDay && (
        <View style={[styles.gymDayCard, { marginTop: 12 }]}>
          <View style={styles.gymDayHeader}>
            <Text style={styles.gymDayTitle}>🍽️ Beslenme</Text>
            <View style={styles.gymFocusBadge}><Text style={styles.gymFocusText}>{currentNutritionDay.totalCalories} kcal</Text></View>
          </View>
          {currentNutritionDay.meals?.map((meal: any, j: number) => (
            <View key={j} style={styles.gymMealRow}>
              <Text style={styles.gymMealName}>{meal.name}</Text>
              <Text style={styles.gymMealItems}>{meal.items}</Text>
              <Text style={styles.gymMealCal}>{meal.calories} kcal</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity activeOpacity={0.85} onPress={() => setDayFeedbackVisible(true)} style={{ marginTop: 8 }}>
        <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primaryBtn, { shadowColor: C.orange, shadowOpacity: 0.45 }]}>
          <Ionicons name="checkmark-done-outline" size={18} color="#1A1235" />
          <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>{weeklyPlan.currentDay}. GÜNÜ TAMAMLADIM</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
})()}

{/* PROGRAM TAMAMLANDI */}
{weeklyPlan?.completedFully && (
  <View style={styles.statsCard}>
    <Text style={styles.statsTitle}>Programını Tamamladın!</Text>
    <Text style={styles.statsSubtitle}>Yeni programın buna göre ayarlansın diye yorum bırakabilirsin.</Text>
    <TextInput
      style={styles.noteInput}
      placeholder="örn. bacak günü az geldi, omuza ağırlık ver..."
      placeholderTextColor={C.textMuted}
      value={gymFeedback}
      onChangeText={setGymFeedback}
      multiline
    />
    <TouchableOpacity activeOpacity={0.85} onPress={() => setWeeklyPlan(null)} style={{ marginTop: 8 }}>
      <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primaryBtn, { shadowColor: C.orange, shadowOpacity: 0.45 }]}>
        <Ionicons name="refresh-outline" size={18} color="#1A1235" />
        <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>YENİ PROGRAM AYARLA</Text>
      </LinearGradient>
    </TouchableOpacity>
  </View>
)}

      </View>


      </View>
    )}
  </ScrollView>
      )}
      {currentTab === 'pt' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100, paddingTop: 12 }}>
          {!userStats.isVip ? (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setCurrentTab('profile')}
              style={{ margin: 16, padding: 24, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 12 }}>
              <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person-circle-outline" size={40} color="#5B8DEF" />
              </View>
              <Text style={{ color: C.text, fontWeight: '900', fontSize: 20, textAlign: 'center' }}>PT — Kişisel Hoca</Text>
              <Text style={{ color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Hocanın sana özel yazdığı antrenman & beslenme programı ve birebir sohbet <Text style={{ color: C.orange, fontWeight: '800' }}>VIP</Text> üyelere özeldir.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Ionicons name="lock-closed" size={16} color={C.orange} />
                <Text style={{ color: C.orange, fontWeight: '800', fontSize: 14 }}>VIP'e Geç →</Text>
              </View>
            </TouchableOpacity>
          ) : !coachData.hasCoach ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 30, alignItems: 'center', gap: 14 }}>
              <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person-circle-outline" size={40} color="#5B8DEF" />
              </View>
              <Text style={{ color: C.text, fontWeight: '900', fontSize: 20, textAlign: 'center' }}>Hocana Bağlan</Text>
              <Text style={{ color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Hocanın sana verdiği kodu gir; sana özel yazdığı antrenman & beslenme programı ve sohbet burada açılsın.
              </Text>
              <View style={{ width: '100%', marginTop: 8 }}>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Hoca kodu (örn. ali47)"
                  placeholderTextColor={C.textMuted}
                  value={joinCode}
                  autoCapitalize="none"
                  onChangeText={setJoinCode}
                />
                <TouchableOpacity activeOpacity={0.85} onPress={joinCoach} style={{ marginTop: 12 }}>
                  <LinearGradient colors={['#2563EB', '#1E40AF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                    <Ionicons name="link" size={18} color="#fff" />
                    <Text style={[styles.primaryBtnText, { color: '#fff' }]}>BAĞLAN</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16 }}>
              <View style={[styles.gymDayCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View>
                  <Text style={{ color: C.textMuted, fontSize: 12 }}>Hocan</Text>
                  <Text style={{ color: C.text, fontWeight: '900', fontSize: 18 }}>🏋️ {coachData.coachName}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.85} onPress={openCoachChat} style={{ backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Sohbet</Text>
                  {coachData.unread > 0 && (
                    <View style={{ backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{coachData.unread}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {(coachData.workoutPlan || []).length === 0 && (coachData.nutritionPlan || []).length === 0 && (
                <View style={[styles.statsCard, { alignItems: 'center', gap: 8 }]}>
                  <Ionicons name="barbell-outline" size={30} color={C.textMuted} />
                  <Text style={{ color: C.textSec, fontWeight: '700', fontSize: 15 }}>Program Bekleniyor</Text>
                  <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center' }}>Hocan sana özel program yazınca burada görünecek.</Text>
                </View>
              )}
              {(coachData.workoutPlan || []).map((day: any, i: number) => (
                <View key={'w' + i} style={styles.gymDayCard}>
                  <View style={styles.gymDayHeader}>
                    <Text style={styles.gymDayTitle}>{day.dayNumber || i + 1}. Gün</Text>
                    {!!day.focus && <View style={styles.gymFocusBadge}><Text style={styles.gymFocusText}>{day.focus}</Text></View>}
                  </View>
                  {(day.exercises || []).map((ex: any, j: number) => (
                    <View key={j} style={styles.gymExerciseRow}>
                      {ex.gifUrl && (
                        <TouchableOpacity activeOpacity={0.8} onPress={() => setGifModalUrl(ex.gifUrl)}>
                          <Ionicons name="play-circle" size={24} color="#2563EB" />
                        </TouchableOpacity>
                      )}
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.gymExerciseName}>{ex.name}</Text>
                        <Text style={styles.gymExerciseSets}>{ex.sets}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              {(coachData.nutritionPlan || []).map((day: any, i: number) => (
                <View key={'n' + i} style={styles.gymDayCard}>
                  <View style={styles.gymDayHeader}>
                    <Text style={styles.gymDayTitle}>🍽️ {day.dayNumber || i + 1}. Gün Beslenme</Text>
                    {!!day.totalCalories && <View style={styles.gymFocusBadge}><Text style={styles.gymFocusText}>{day.totalCalories} kcal</Text></View>}
                  </View>
                  {(day.meals || []).map((meal: any, j: number) => (
                    <View key={j} style={styles.gymMealRow}>
                      <Text style={styles.gymMealName}>{meal.name}</Text>
                      <Text style={styles.gymMealItems}>{meal.items}</Text>
                      <Text style={styles.gymMealCal}>{meal.calories} kcal</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
      {/* ANALİZ iç switcher: Gelişim (foto) | Beslenme (kalori) */}
      {currentTab === 'analiz' && (
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: C.surface, borderRadius: 16, padding: 5, borderWidth: 1, borderColor: C.border }}>
          <TouchableOpacity
            style={[{ flex: 1, gap: 4, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexDirection: 'row' },
              analizTab === 'gelisim' && { backgroundColor: C.lime }]}
            onPress={() => setAnalizTab('gelisim')}>
            <Ionicons name="images-outline" size={16} color={analizTab === 'gelisim' ? '#0B1207' : C.textSec} />
            <Text style={{ fontWeight: '700', color: analizTab === 'gelisim' ? '#0B1207' : C.textSec, fontSize: 13 }}>Gelişim</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[{ flex: 1, gap: 4, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexDirection: 'row' },
              analizTab === 'beslenme' && { backgroundColor: C.lime }]}
            onPress={() => setAnalizTab('beslenme')}>
            <Ionicons name="restaurant-outline" size={16} color={analizTab === 'beslenme' ? '#0B1207' : C.textSec} />
            <Text style={{ fontWeight: '700', color: analizTab === 'beslenme' ? '#0B1207' : C.textSec, fontSize: 13 }}>Beslenme</Text>
          </TouchableOpacity>
        </View>
      )}
      {currentTab === 'analiz' && analizTab === 'gelisim' && loading && gallery.length === 0 && (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          {[1,2,3].map(i => (
            <View key={i} style={{ backgroundColor: C.surface, borderRadius: 16, height: 120, opacity: 0.5 + i * 0.1 }} />
          ))}
        </View>
      )}
      {currentTab === 'analiz' && analizTab === 'gelisim' && !(loading && gallery.length === 0) && (
        <FlatList
          data={gallery}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={
            <View>
              {/* 📸 FOTOĞRAF EKLEME YERİ */}
              <View style={styles.uploadCard}>
              {!image ? (
                <TouchableOpacity activeOpacity={0.85} onPress={() => askAndPickImage('progress')}>
                  <View style={styles.dashedUpload}>
                    <View style={styles.uploadIconCircle}>
                      <Ionicons name="camera" size={24} color={C.lime} />
                    </View>
                    <Text style={styles.uploadTitle}>Yeni Gelişim Fotoğrafı</Text>
                    <Text style={styles.uploadHint}>Çek veya galeriden seç · AI yağ oranını tahmin etsin</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View>
                  <Image source={{ uri: image }} style={styles.preview} />
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Antrenman notunu yaz..."
                    placeholderTextColor={C.textMuted}
                    value={note}
                    onChangeText={setNote}
                    multiline
                  />
                  {loading ? <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 12 }} /> : (
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 12}}>
                      <TouchableOpacity style={[styles.miniBtn, styles.miniBtnPrimary]} onPress={uploadImage}>
                        <Ionicons name="checkmark" size={18} color="#0B0D12" />
                        <Text style={styles.miniBtnPrimaryText}>KAYDET</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.miniBtn, styles.miniBtnGhost]} onPress={() => setImage(null)}>
                        <Ionicons name="close" size={18} color={C.red} />
                        <Text style={styles.miniBtnGhostText}>İPTAL</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="camera-outline" size={52} color={C.orange} />
              <Text style={styles.emptyTitle}>Henüz fotoğraf yok</Text>
              <Text style={styles.emptyText}>İlk gelişim fotoğrafını ekle, AI yağ oranını hesaplasın ve değişimini takip etmeye başla.</Text>
              <TouchableOpacity
                onPress={() => showImageSourceOptions('progress')}
                style={{ marginTop: 18, backgroundColor: C.orange, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#0B0D12" />
                <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 14 }}>İlk Fotoğrafı Ekle</Text>
              </TouchableOpacity>
            </View>
          }
      renderItem={({ item }) => (
  <View style={styles.galleryCard}>
    <TouchableOpacity activeOpacity={0.92} onPress={() => setLightboxUrl(item.url)}>
      <Image source={{ uri: item.url }} style={styles.galleryImg} />
    </TouchableOpacity>
    <View style={styles.galleryInfo}>
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
        <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString('tr-TR')}</Text>
      </View>
      {!!item.note && <Text style={styles.noteText}>{item.note}</Text>}

      {item.bodyFatPercentage != null && (
        <View style={styles.analysisBox}>
          <View style={styles.analysisHeader}>
            <Ionicons name="analytics" size={16} color={C.lime} />
            <Text style={styles.analysisFat}>Tahmini Yağ Oranı: %{item.bodyFatPercentage}</Text>
          </View>
          <Text style={styles.analysisText}>{item.aiAnalysis}</Text>
        </View>
      )}
      {item.bodyFatPercentage == null && item.aiAnalysis && (
        <View style={styles.analysisBox}>
          <Text style={styles.analysisText}>⚠️ {item.aiAnalysis}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={[styles.deleteBtn, { flex: 1 }]} onPress={() => deletePhoto(item._id)}>
          <Ionicons name="trash-outline" size={15} color={C.red} />
          <Text style={styles.deleteBtnText}>Sil</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteBtn, { flex: 1, borderColor: C.orange }]}
          onPress={() => {
            setShareImgLoaded(false);
            setSharePhotoUrl(item.url);
            setSharePhotoFat(item.bodyFatPercentage);
            setShareCardReady(true);
          }}
        >
          <Ionicons name="share-social-outline" size={15} color={C.orange} />
          <Text style={[styles.deleteBtnText, { color: C.orange }]}>Paylaş</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
      )}
        ListFooterComponent={
          <View style={{ paddingHorizontal: 0, paddingBottom: 16 }}>
            {/* FOTOĞRAF KARŞILAŞTIRMA */}
            {!userStats.isVip ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setCurrentTab('profile')}
                style={[styles.statsCard, { marginHorizontal: 16, marginTop: 8, alignItems: 'center', gap: 10 }]}>
                <Ionicons name="lock-closed" size={26} color="#FF9F1C" />
                <Text style={[styles.statsTitle, { color: '#FF9F1C', textAlign: 'center' }]}>Gelişim Karşılaştırması</Text>
                <Text style={[styles.statsEmptyText, { textAlign: 'center' }]}>İlk ve son fotoğraflarını kıyasla, yağ oranı farkını gör. VIP üyelere özel.</Text>
                <Text style={{ color: '#FF9F1C', fontWeight: '700', fontSize: 13 }}>VIP'e Geç →</Text>
              </TouchableOpacity>
            ) : (() => {
              const withFat = gallery.filter(p => p.bodyFatPercentage != null);
              if (withFat.length < 2) {
                return (
                  <View style={[styles.statsCard, { marginHorizontal: 16, marginTop: 8, alignItems: 'center', gap: 8 }]}>
                    <Ionicons name="images-outline" size={26} color={C.textMuted} />
                    <Text style={[styles.statsEmptyText, { textAlign: 'center' }]}>Kıyaslama için yağ oranı bilinen en az 2 fotoğraf gerekiyor.</Text>
                  </View>
                );
              }
              // Dizi sırasına değil TARİHE göre belirle (eski vs yeni) — yağ oranı yön bug'ı fix
              const byDate = [...withFat].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              const first = byDate[0];
              const last = byDate[byDate.length - 1];
              const diff = parseFloat((first.bodyFatPercentage - last.bodyFatPercentage).toFixed(1));
              const improved = diff > 0;
              const sameish = Math.abs(diff) < 0.1;

              // Kaç gün geçti
              const daysPassed = Math.max(1, Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24)));

              // Kilo farkı (bodyStats varsa)
              const firstStat = bodyStats.length ? bodyStats[bodyStats.length - 1] : null;
              const lastStat = bodyStats.length ? bodyStats[0] : null;
              const weightDiff = (firstStat?.weight && lastStat?.weight)
                ? parseFloat((firstStat.weight - lastStat.weight).toFixed(1))
                : null;

              // Hedef yağ oranı tahmini (kullanıcının hedef kilosundan tahmini)
              const targetFat = user.gender === 'Erkek' ? 12 : 18; // varsayılan hedef
              const fatToGo = parseFloat((last.bodyFatPercentage - targetFat).toFixed(1));
              const weeklyRate = diff / (daysPassed / 7); // haftada kaç % düşüyor
              const weeksToGoal = (improved && weeklyRate > 0 && fatToGo > 0)
                ? Math.ceil(fatToGo / weeklyRate)
                : null;

              const praise = improved
                ? diff >= 5 ? '🏆 İnanılmaz bir dönüşüm!' : diff >= 3 ? '💪 Harika ilerleme!' : diff >= 1 ? '🔥 Doğru yoldasın!' : '✨ Başlangıç iyi, devam et!'
                : sameish ? '🎯 Yağ oranın koruyor.' : '📈 Küçük artış var, bırakma!';

              return (
                <View style={[styles.statsCard, { marginHorizontal: 16, marginTop: 8, gap: 14 }]}>
                  <Text style={styles.statsTitle}>Gelişim Karşılaştırması</Text>

                  {/* Yan yana fotoğraf */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                      <Image source={{ uri: first.url }} style={{ width: '100%', aspectRatio: 3/4, borderRadius: 12 }} />
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>{new Date(first.date).toLocaleDateString('tr-TR')}</Text>
                      <Text style={{ color: C.orange, fontWeight: '800', fontSize: 15 }}>%{first.bodyFatPercentage}</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: C.border, marginVertical: 8 }} />
                    <View style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                      <Image source={{ uri: last.url }} style={{ width: '100%', aspectRatio: 3/4, borderRadius: 12 }} />
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>{new Date(last.date).toLocaleDateString('tr-TR')}</Text>
                      <Text style={{ color: improved ? C.lime : C.red, fontWeight: '800', fontSize: 15 }}>%{last.bodyFatPercentage}</Text>
                    </View>
                  </View>

                  {/* ÖZET KARTI */}
                  <View style={{ backgroundColor: C.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: improved ? 'rgba(95,168,42,0.28)' : 'rgba(226,75,74,0.28)', gap: 10 }}>
                    <Text style={{ color: improved ? C.lime : C.red, fontWeight: '900', fontSize: 20, textAlign: 'center' }}>
                      {improved ? `−${diff}% yağ oranı` : sameish ? 'Değişim yok' : `+${Math.abs(diff)}% artış`}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>{daysPassed}</Text>
                        <Text style={{ color: C.textMuted, fontSize: 11 }}>gün</Text>
                      </View>
                      {weightDiff != null && (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: weightDiff > 0 ? C.lime : C.red, fontWeight: '800', fontSize: 16 }}>
                            {weightDiff > 0 ? `−${weightDiff}` : `+${Math.abs(weightDiff)}`} kg
                          </Text>
                          <Text style={{ color: C.textMuted, fontSize: 11 }}>kilo</Text>
                        </View>
                      )}
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: C.orange, fontWeight: '800', fontSize: 16 }}>{byDate.length}</Text>
                        <Text style={{ color: C.textMuted, fontSize: 11 }}>analiz</Text>
                      </View>
                    </View>
                    <Text style={{ color: C.textSec, fontSize: 13, textAlign: 'center' }}>{praise}</Text>
                  </View>

                  {/* BU HIZLA GİDERSEN TAHMİNİ */}
                  {weeksToGoal != null && (
                    <View style={{ backgroundColor: C.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(240,138,0,0.28)', gap: 6 }}>
                      <Text style={{ color: C.orange, fontWeight: '800', fontSize: 14 }}>⚡ Bu hızla gidersen…</Text>
                      <Text style={{ color: C.text, fontSize: 13, lineHeight: 20 }}>
                        Haftada <Text style={{ color: C.lime, fontWeight: '700' }}>~{weeklyRate.toFixed(1)}%</Text> yağ yakıyorsun.{'\n'}
                        Hedef yağ oranına (<Text style={{ color: C.lime, fontWeight: '700' }}>%{targetFat}</Text>) ulaşman yaklaşık{' '}
                        <Text style={{ color: C.orange, fontWeight: '800' }}>{weeksToGoal} hafta</Text> sürer.
                      </Text>
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>* Tutarlı antrenman ve beslenme varsayımıyla</Text>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        }
        />
      )}

      {/* ===== YEMEK SEKMESİ ===== */}
      {currentTab === 'analiz' && analizTab === 'beslenme' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>

          {mealTab === 'analiz' && (
          <View>
          {/* YAPAY ZEKA KALORİ ÖLÇER */}
          <LinearGradient
            colors={['#241A05', C.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mealHeaderCard}
          >
            <View style={styles.mealIconCircle}>
              <Ionicons name="restaurant" size={22} color={C.orange} />
            </View>
            <Text style={styles.mealTitle}>Yapay Zeka Şefin</Text>
            <Text style={styles.mealSubtitle}>Tabağının net bir fotoğrafını yükle, içindeki makroları anında söylesin.</Text>

            {!userStats.isVip && (
              <View style={styles.rightsPill}>
                <Ionicons name="ticket-outline" size={14} color={C.orange} />
                <Text style={styles.rightsText}>Bugünkü ücretsiz hakkın: <Text style={{ fontWeight: '800', color: C.orange }}>{dailyMealRights}</Text></Text>
              </View>
            )}

            <TouchableOpacity activeOpacity={0.85} style={styles.scanBtn} onPress={() => askAndPickImage('meal')} disabled={loading}>
              <Ionicons name="scan" size={20} color="#0B0D12" />
              <Text style={styles.scanBtnText}>TABAĞI TARA</Text>
            </TouchableOpacity>
          </LinearGradient>

          {mealImage && !mealResult && !loading && (
            <View style={{ marginTop: 16 }}>
              <Image source={{ uri: mealImage }} style={styles.mealPreviewImg} />
              <TextInput
                style={styles.noteInput}
                placeholder="Ek bilgi (opsiyonel): örn. 'içine protein tozu ekledim'"
                placeholderTextColor={C.textMuted}
                value={mealNote}
                onChangeText={setMealNote}
                multiline
              />
              <TouchableOpacity activeOpacity={0.85} onPress={() => sendMealToAI(mealImage)} style={{ marginTop: 12 }}>
                <LinearGradient colors={[C.lime, C.limeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                  <Ionicons name="sparkles" size={18} color="#0B0D12" />
                  <Text style={styles.primaryBtnText}>ANALİZ ET</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {loading && mealImage && (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color={C.orange} />
              <Text style={styles.loaderText}>Yapay zeka tabağı inceliyor, kalori hesabı yapılıyor...</Text>
            </View>
          )}

          {mealResult && !loading && (
            <View style={styles.resultCard}>
              {mealImage && <Image source={{ uri: mealImage }} style={styles.mealPreviewImg} />}
              <Text style={styles.resultMealName}>{mealResult.mealName}</Text>
              <Text style={styles.resultDesc}>{mealResult.description}</Text>

              <LinearGradient colors={['#2A2206', C.surface2]} style={styles.calorieBadge}>
                <Text style={styles.calorieNum}>{mealResult.calories}</Text>
                <Text style={styles.calorieLabel}>KCAL</Text>
              </LinearGradient>

              <View style={styles.macroContainer}>
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: C.red }]}>{mealResult.protein}g</Text>
                  <Text style={styles.macroLabel2}>Protein</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: C.orange }]}>{mealResult.carbs}g</Text>
                  <Text style={styles.macroLabel2}>Karbonh.</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: C.green }]}>{mealResult.fat}g</Text>
                  <Text style={styles.macroLabel2}>Yağ</Text>
                </View>
              </View>
            </View>
          )}

          {/* BUGÜN NE KADAR TAMAMLANDI — kaydırmalı (Protein, Karbonhidrat, Yağ, Kalori) */}
          <View style={[styles.statsCard, { marginTop: 16 }]}>
            <Text style={styles.statsTitle}>Bugün Ne Kadar Tamamlandı</Text>

            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setMacroPage(Math.round(e.nativeEvent.contentOffset.x / (Dimensions.get('window').width - 68)))}
            >
              {[
                { label: 'Protein', unit: 'g', color: C.red, cur: todayProtein, target: proteinTarget },
                { label: 'Karbonhidrat', unit: 'g', color: C.orange, cur: todayCarbs, target: carbsTarget },
                { label: 'Yağ', unit: 'g', color: C.green, cur: todayFat, target: fatTarget },
                { label: 'Kalori', unit: 'kcal', color: C.lime, cur: todayCalories, target: dailyTarget },
              ].map((mac) => {
                const pct = mac.target ? Math.min(100, Math.round((mac.cur / mac.target) * 100)) : 0;
                return (
                  <View key={mac.label} style={{ width: Dimensions.get('window').width - 68, alignItems: 'center', paddingVertical: 6 }}>
                    <Text style={{ color: mac.color, fontSize: 13, fontWeight: '800' }}>{mac.label}</Text>
                    <Text style={{ color: C.text, fontSize: 30, fontWeight: '900', marginVertical: 2 }}>
                      {mac.cur}<Text style={{ fontSize: 14, color: C.textMuted, fontWeight: '600' }}> / {mac.target ?? '--'} {mac.unit}</Text>
                    </Text>
                    <View style={{ width: '100%', height: 8, backgroundColor: C.surface2, borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: mac.color, borderRadius: 4 }} />
                    </View>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>%{pct} tamamlandı</Text>
                  </View>
                );
              })}
            </ScrollView>

            {/* Sayfa noktaları */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.pageDot, macroPage === i && styles.pageDotActive]} />
              ))}
            </View>

            <Text style={[styles.statsSubtitle, { marginTop: 10, marginBottom: 0, textAlign: 'center' }]}>
              {proteinTarget != null ? `Hedefler kilona göre · Bugün ${todayLogs.length} öğün tarandı` : 'Makro hedefleri için kilonu gir.'}
            </Text>
          </View>

          {/* BAZAL METABOLİZMA — sadece kalori analizi tabında */}
          <View style={[styles.statsCard, { marginTop: 16 }]}>
            <Text style={[styles.statsTitle, { marginBottom: 6 }]}>Kalori Hedefi</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Yaş" placeholderTextColor={C.textMuted} value={goalAge} onChangeText={setGoalAge} keyboardType="numeric" />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Hedef Kilo (kg)" placeholderTextColor={C.textMuted} value={goalTarget} onChangeText={setGoalTarget} keyboardType="numeric" />
            </View>
            <View style={[styles.genderRow, { marginBottom: 8 }]}>
              <TouchableOpacity style={[styles.genderBtn, goalGender === 'male' && styles.genderBtnActive]} onPress={() => setGoalGender('male')}>
                <Ionicons name="male" size={14} color={goalGender === 'male' ? '#0B0D12' : C.textSec} />
                <Text style={[styles.genderText, goalGender === 'male' && styles.genderTextActive]}>Erkek</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.genderBtn, goalGender === 'female' && styles.genderBtnActive]} onPress={() => setGoalGender('female')}>
                <Ionicons name="female" size={14} color={goalGender === 'female' ? '#0B0D12' : C.textSec} />
                <Text style={[styles.genderText, goalGender === 'female' && styles.genderTextActive]}>Kadın</Text>
              </TouchableOpacity>
            </View>
            {bmr != null ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,159,28,0.06)', borderRadius: 10, padding: 10, minWidth: 90, borderWidth: 1, borderColor: 'rgba(255,159,28,0.2)' }}>
                  <Text style={{ color: C.orange, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>BMR</Text>
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{bmr} <Text style={{ fontSize: 11, color: C.textMuted }}>kcal</Text></Text>
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,159,28,0.06)', borderRadius: 10, padding: 10, minWidth: 90, borderWidth: 1, borderColor: 'rgba(255,159,28,0.2)' }}>
                  <Text style={{ color: C.orange, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>TDEE</Text>
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{tdee} <Text style={{ fontSize: 11, color: C.textMuted }}>kcal</Text></Text>
                </View>
                {dailyTarget != null && (
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,159,28,0.12)', borderRadius: 10, padding: 10, minWidth: 90, borderWidth: 1, borderColor: 'rgba(255,159,28,0.35)' }}>
                    <Text style={{ color: C.orange, fontSize: 10, fontWeight: '700', marginBottom: 2 }}>{goalMode}</Text>
                    <Text style={{ color: C.orange, fontWeight: '900', fontSize: 15 }}>{dailyTarget} <Text style={{ fontSize: 11 }}>kcal</Text></Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[styles.statsEmptyText, { marginBottom: 0 }]}>Yaş gir → BMR hesaplansın.</Text>
            )}
            {loading ? <ActivityIndicator size="small" color={C.orange} style={{ marginTop: 8 }} /> : (
              <TouchableOpacity activeOpacity={0.85} onPress={saveGoals} style={{ marginTop: 10 }}>
                <LinearGradient colors={[C.orange, '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primaryBtn, { paddingVertical: 10 }]}>
                  <Text style={styles.primaryBtnText}>HEDEFLERİ KAYDET</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* YENEN ÜRÜNLER & DETAYLAR — bu hafta */}
          <View style={[styles.statsCard, { marginTop: 16 }]}>
            <Text style={styles.statsTitle}>Bu Hafta Yenenler</Text>
            <Text style={[styles.statsSubtitle, { marginBottom: 10 }]}>Liste her hafta başında (Pazartesi) yenilenir.</Text>
            {thisWeekMealLogs.length === 0 ? (
              <Text style={styles.statsEmptyText}>Bu hafta henüz taranmış öğün yok. Tabağını tara!</Text>
            ) : (
              thisWeekMealLogs.map((m, i) => (
                <View key={m._id || i} style={styles.mealLogRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealLogName}>{m.mealName || 'Öğün'}</Text>
                    <Text style={styles.mealLogDate}>{new Date(m.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
                    <View style={styles.mealLogMacros}>
                      <Text style={[styles.mealLogMacro, { color: C.red }]}>P {m.protein || 0}g</Text>
                      <Text style={[styles.mealLogMacro, { color: C.orange }]}>K {m.carbs || 0}g</Text>
                      <Text style={[styles.mealLogMacro, { color: C.green }]}>Y {m.fat || 0}g</Text>
                    </View>
                  </View>
                  <View style={styles.mealLogCalBox}>
                    <Text style={styles.mealLogCal}>{m.calories || 0}</Text>
                    <Text style={styles.mealLogCalUnit}>kcal</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* KİLO TREND GRAFİĞİ */}
          {bodyStats.length >= 2 && (() => {
            const sorted = [...bodyStats].reverse().slice(-10);
            const weights = sorted.map(s => parseFloat(s.weight || user?.weight || 70));
            const labels = sorted.map(s => {
              const d = new Date(s.createdAt || s.date);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            });
            const minW = Math.min(...weights) - 2;
            const maxW = Math.max(...weights) + 2;
            return (
              <View style={[styles.statsCard, { marginTop: 12 }]}>
                <Text style={styles.statsTitle}>Kilo Takibi</Text>
                <Text style={[styles.statsSubtitle, { marginBottom: 10 }]}>
                  {weights[0] > weights[weights.length - 1]
                    ? `+${(weights[weights.length - 1] - weights[0]).toFixed(1)} kg`
                    : `${(weights[weights.length - 1] - weights[0]).toFixed(1)} kg`
                  } · son {sorted.length} kayıt
                </Text>
                <LineChart
                  data={{ labels, datasets: [{ data: weights }] }}
                  width={Dimensions.get('window').width - 72}
                  height={140}
                  yAxisSuffix=" kg"
                  fromNumber={maxW}
                  fromZero={false}
                  chartConfig={{
                    backgroundColor: C.surface,
                    backgroundGradientFrom: C.surface,
                    backgroundGradientTo: C.surface,
                    decimalPlaces: 1,
                    color: (o = 1) => `rgba(255,159,28,${o})`,
                    labelColor: () => C.textMuted,
                    propsForDots: { r: '4', strokeWidth: '2', stroke: '#FF9F1C' },
                    propsForBackgroundLines: { stroke: C.border, strokeDasharray: '' },
                  }}
                  bezier
                  style={{ borderRadius: 12, marginLeft: -8 }}
                />
              </View>
            );
          })()}
          </View>
          )}
        </ScrollView>
      )}

      {currentTab === 'stats' && (
        <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <Text style={[styles.statsTitle, { marginBottom: 4 }]}>Max Ağırlıklar</Text>
          <Text style={[styles.statsSubtitle, { marginBottom: 16 }]}>GymBody'ye kaydettiğin en yüksek ağırlıklar ve rankların.</Text>

          {!userStats.isVip && (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setCurrentTab('profile')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,159,28,0.1)', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,159,28,0.3)' }}>
              <Ionicons name="lock-closed" size={18} color={C.orange} />
              <Text style={{ flex: 1, color: C.text, fontSize: 12.5, fontWeight: '600' }}>Ağırlık girişi ve sıralama VIP'e özel. Görüntülemek serbest — kaydetmek için VIP ol.</Text>
              <Ionicons name="chevron-forward" size={16} color={C.orange} />
            </TouchableOpacity>
          )}

          {/* RANK SIRASI */}
          <View style={[styles.statsCard, { marginBottom: 14 }]}>
            <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center', letterSpacing: 1.2, marginBottom: 14 }}>RANK SİSTEMİ</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
              {RANKS.map((r, i) => (
                <View key={r.key} style={{ alignItems: 'center', gap: 5, marginBottom: i * 4.5 }}>
                  <RankBadgeSvg rankKey={r.key} color={r.color} size={32 + i * 5} />
                  <Text style={{ color: r.color, fontSize: 8.5, fontWeight: '800' }}>{r.label}</Text>
                </View>
              ))}
            </View>
            {!user?.weight && <Text style={{ color: C.orange, fontSize: 11, textAlign: 'center', marginTop: 12 }}>Daha doğru rank için profilde kilonu gir</Text>}
          </View>

          {LIFTS.map((lift) => {
            const liftData = user?.lifts?.[lift.key];
            const best = liftData?.best || 0;
            const reps = liftData?.reps || 1;
            const { rankIndex } = computeRank(lift.key, best, user?.weight, user?.gender);
            const rank = rankIndex >= 0 ? RANKS[rankIndex] : null;
            const nextRank = rankIndex < RANKS.length - 1 ? RANKS[rankIndex + 1] : null;
            const bw = user?.weight || 80;
            const gender = user?.gender === 'Kadın' ? 'kadin' : 'erkek';
            const nextThreshold = nextRank ? (STD[lift.key]?.[gender]?.[rankIndex + 1] ?? 0) * bw : null;
            const progress = (nextThreshold && best > 0) ? Math.min(1, best / nextThreshold) : (best > 0 ? 1 : 0);

            return (
              <TouchableOpacity key={lift.key} activeOpacity={0.75}
                onPress={() => openLiftEntry(lift.key, best)}
                style={[styles.statsCard, { marginBottom: 10, paddingVertical: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{lift.label}</Text>
                    <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>{lift.muscle}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                    {best > 0 ? (
                      <>
                        <Text style={{ color: C.text, fontWeight: '900', fontSize: 22 }}>{best} <Text style={{ fontSize: 13, color: C.textMuted }}>kg</Text></Text>
                        <Text style={{ color: C.textMuted, fontSize: 11 }}>{reps} tekrar</Text>
                      </>
                    ) : (
                      <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>+ Gir</Text>
                    )}
                  </View>
                  {rank ? (
                    <View style={{ alignItems: 'center', minWidth: 56 }}>
                      <RankBadgeSvg rankKey={rank.key} color={rank.color} size={40} />
                      <Text style={{ color: rank.color, fontWeight: '800', fontSize: 10, marginTop: 3 }}>{rank.label.toUpperCase()}</Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', minWidth: 56 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="add" size={22} color={C.lime} />
                      </View>
                      <Text style={{ color: C.textMuted, fontWeight: '700', fontSize: 10, marginTop: 3 }}>BAŞLA</Text>
                    </View>
                  )}
                </View>
                {best > 0 && nextRank && nextThreshold && (
                  <View style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: C.textMuted, fontSize: 10 }}>Sonraki: {nextRank.label}</Text>
                      <Text style={{ color: C.textMuted, fontSize: 10 }}>{best} / {Math.round(nextThreshold)} kg</Text>
                    </View>
                    <View style={{ height: 5, backgroundColor: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: 5, width: `${Math.round(progress * 100)}%`, backgroundColor: rank ? rank.color : C.lime, borderRadius: 3 }} />
                    </View>
                  </View>
                )}
                {best > 0 && !nextRank && (
                  <Text style={{ color: '#FFD700', fontWeight: '700', fontSize: 12, marginTop: 8, textAlign: 'center' }}>Maksimum rank — efsanesin!</Text>
                )}
                {/* SİKLET SIRALAMASI + PAYLAŞIM — sadece platin+ */}
                {best > 0 && rank && rankIndex >= 3 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
                    <TouchableOpacity onPress={() => openLeaderboard(lift.key)} hitSlop={{top:8,bottom:8,left:8,right:8}}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="trophy" size={15} color={rank.color} />
                      <Text style={{ color: rank.color, fontSize: 12, fontWeight: '700' }}>
                        {myLiftRanks[lift.key] ? `Sikletinde #${myLiftRanks[lift.key].rank}` : 'Sıralamayı gör'} →
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShareLiftKey(lift.key)} hitSlop={{top:8,bottom:8,left:8,right:8}}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="share-social-outline" size={15} color={C.textMuted} />
                      <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '600' }}>Paylaş</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {/* PAYLAŞIM — platin altı ama rank var */}
                {best > 0 && rank && rankIndex < 3 && (
                  <TouchableOpacity onPress={() => setShareLiftKey(lift.key)} hitSlop={{top:8,bottom:8,left:8,right:8}}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
                    <Ionicons name="share-social-outline" size={15} color={C.textMuted} />
                    <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '600' }}>Paylaş</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}

          {/* ARKADAŞ MEYDAN OKUMASI */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 4 }}>
            <TouchableOpacity onPress={() => { setChallengeLift('bench'); setChallengeMyWeight(''); setChallengeScreen('create'); }}
              activeOpacity={0.82} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: C.orange + '55' }}>
              <Text style={{ fontSize: 16 }}>⚔️</Text>
              <Text style={{ color: C.orange, fontWeight: '800', fontSize: 13 }}>Meydan Oku</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setChallengeCodeInput(''); setChallengeTheirWeight(''); setChallengeInfo(null); setChallengeScreen('accept'); }}
              activeOpacity={0.82} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: C.border }}>
              <Ionicons name="key-outline" size={16} color={C.textSec} />
              <Text style={{ color: C.textSec, fontWeight: '700', fontSize: 13 }}>Kodu Gir</Text>
            </TouchableOpacity>
          </View>

          {/* KAYDIRMALİ LİFT GEÇMİŞİ GRAFİKLERİ */}
          {(() => {
            const liftsWithHistory = LIFTS.filter(lift => {
              const h = user?.lifts?.[lift.key]?.history;
              return h && h.length >= 1;
            });
            if (liftsWithHistory.length === 0) return null;
            const screenW = Dimensions.get('window').width;
            return (
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 15, marginBottom: 12 }}>Güç Geçmişi</Text>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -16 }}
                >
                  {liftsWithHistory.map((lift) => {
                    const rawHistory: { weight: number; date: string }[] = user.lifts[lift.key].history;
                    const history = rawHistory.length === 1 ? [rawHistory[0], rawHistory[0]] : rawHistory;
                    const sparse = history.length > 8
                      ? history.filter((_, i) => i % Math.ceil(history.length / 8) === 0 || i === history.length - 1)
                      : history;
                    const labels = sparse.map(h => new Date(h.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }));
                    const data = sparse.map(h => h.weight);
                    const rankColor = (() => {
                      const { rankIndex } = computeRank(lift.key, user.lifts[lift.key].best, user?.weight, user?.gender);
                      return rankIndex >= 0 ? RANKS[rankIndex].color : C.lime;
                    })();
                    return (
                      <View key={lift.key} style={{ width: screenW, paddingHorizontal: 16 }}>
                        <View style={[styles.statsCard, { paddingBottom: 8 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>{lift.label}</Text>
                            <Text style={{ color: rankColor, fontWeight: '900', fontSize: 18 }}>
                              {user.lifts[lift.key].best} kg
                            </Text>
                          </View>
                          <LineChart
                            data={{ labels, datasets: [{ data, color: () => rankColor }] }}
                            width={screenW - 64}
                            height={100}
                            chartConfig={{
                              ...chartConfig,
                              color: (o = 1) => rankColor + Math.round(o * 255).toString(16).padStart(2, '0'),
                              propsForDots: { r: '3', strokeWidth: '2', stroke: rankColor },
                            }}
                            bezier
                            withInnerLines={false}
                            withHorizontalLabels={false}
                            style={{ borderRadius: 12, marginLeft: -8 }}
                          />
                          <Text style={{ color: C.textMuted, fontSize: 10, textAlign: 'center', marginTop: 4 }}>
                            {rawHistory.length} kayıt · son {rawHistory.length > 8 ? '8' : rawHistory.length} gösteriliyor
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}
        </ScrollView>
      )}
      {currentTab === 'profile' && (
  <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
    <View style={styles.profileHero}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Text style={styles.profileName}>{user.name}</Text>
        {userStats.isVip && <Text style={{ fontSize: 22 }}>👑</Text>}
      </View>
      {!!user.email && <Text style={styles.profileEmail}>{user.email}</Text>}

      {/* Streak + Token inline */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 16 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: C.orange, fontWeight: '900', fontSize: 24 }}>{userStats.streak}</Text>
          <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>🔥 Seri</Text>
        </View>
        {userStats.isVip && (
          <>
            <View style={{ width: 1, height: 32, backgroundColor: C.border }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 24 }}>VIP</Text>
              <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>👑 Üye</Text>
            </View>
          </>
        )}
      </View>

      {/* GÜÇ ROZETLERİ */}
      {(() => {
        const earnedLifts = LIFTS
          .map(lift => {
            const best = user?.lifts?.[lift.key]?.best || 0;
            const { rankIndex } = computeRank(lift.key, best, user?.weight, user?.gender);
            return { lift, rankIndex, rank: rankIndex >= 0 ? RANKS[rankIndex] : null };
          })
          .filter(l => l.rank !== null)
          .sort((a, b) => b.rankIndex - a.rankIndex)
          .slice(0, 3);
        if (earnedLifts.length === 0) return null;
        return (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {earnedLifts.map(({ lift, rank }) => (
              <View key={lift.key} style={{ flex: 1, alignItems: 'center', backgroundColor: C.surface2,
                borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.border }}>
                <RankBadgeSvg rankKey={rank!.key} color={rank!.color} size={44} />
                <Text style={{ color: rank!.color, fontWeight: '800', fontSize: 11, marginTop: 4 }}>{rank!.label}</Text>
                <Text style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>{lift.label}</Text>
              </View>
            ))}
          </View>
        );
      })()}
    </View>

{/* VIP KARTI */}
{userStats.isVip ? (
  <LinearGradient colors={['#1A1530', C.surface]} style={[styles.statsCard, { borderColor: '#3A2E66', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }]}>
    <Ionicons name="star" size={22} color="#FF9F1C" />
    <View style={{ flex: 1 }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>VIP Üyesin! 👑</Text>
      {userStats.vipExpiresAt && (
        <Text style={{ color: C.textSec, fontSize: 12, marginTop: 2 }}>
          Bitiş: {new Date(userStats.vipExpiresAt).toLocaleDateString('tr-TR')}
        </Text>
      )}
    </View>
  </LinearGradient>
) : (
  <LinearGradient colors={['#1A1530', C.surface]} style={[styles.statsCard, { borderColor: '#3A2E66', paddingBottom: 20 }]}>
    {/* Başlık */}
    <View style={{ alignItems: 'center', marginBottom: 16 }}>
      <View style={{ backgroundColor: '#FF9F1C22', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 8 }}>
        <Text style={{ color: '#FF9F1C', fontWeight: '800', fontSize: 11, letterSpacing: 1.5 }}>GymBody VIP</Text>
      </View>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>Tüm özelliklerin kilidi</Text>
      <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>açılsın</Text>
    </View>

    {/* Özellik listesi */}
    {['Kişisel haftalık antrenman programı', 'Kişisel beslenme planı', 'Max Güç kayıt ve sıralama', 'Sınırsız yağ oranı analizi', 'Gelişim fotoğraf karşılaştırması'].map(f => (
      <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <Ionicons name="checkmark-circle" size={16} color="#FF9F1C" />
        <Text style={{ color: C.textSec, fontSize: 13 }}>{f}</Text>
      </View>
    ))}

    {/* Plan seçici kartlar */}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 14 }}>
      {[
        { id: '$rc_monthly', label: 'Aylık', price: '₺149', period: '/ay', badge: null },
        { id: '$rc_six_month', label: '6 Aylık', price: '₺599', period: '/6ay', badge: '%33' },
        { id: '$rc_annual', label: 'Yıllık', price: '₺899', period: '/yıl', badge: '%50' },
      ].map(plan => {
        const selected = selectedVipPlan === plan.id;
        return (
          <TouchableOpacity key={plan.id} activeOpacity={0.8} onPress={() => setSelectedVipPlan(plan.id)} style={{ flex: 1 }}>
            <View style={{
              borderRadius: 16, padding: 12, alignItems: 'center',
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? '#FF9F1C' : C.border,
              backgroundColor: selected ? '#FF9F1C18' : C.surface2,
            }}>
              {plan.badge && (
                <View style={{ backgroundColor: '#FF9F1C', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6 }}>
                  <Text style={{ color: '#1A1530', fontSize: 9, fontWeight: '900' }}>-{plan.badge}</Text>
                </View>
              )}
              <Text style={{ color: selected ? '#FF9F1C' : C.textMuted, fontWeight: '700', fontSize: 12, marginBottom: 4 }}>{plan.label}</Text>
              <Text style={{ color: selected ? '#fff' : C.text, fontWeight: '900', fontSize: 17 }}>{plan.price}</Text>
              <Text style={{ color: C.textMuted, fontSize: 10, marginTop: 2 }}>{plan.period}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>

    {/* Ana satın alma butonu */}
    {loading ? <ActivityIndicator size="large" color="#FF9F1C" style={{ marginVertical: 8 }} /> : (
      <>
        <TouchableOpacity activeOpacity={0.88} onPress={() => purchaseVip(selectedVipPlan)}>
          <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ color: '#1A1530', fontWeight: '900', fontSize: 15 }}>VIP'e Geç</Text>
          </LinearGradient>
        </TouchableOpacity>

      </>
    )}
  </LinearGradient>
)}

    {/* ROZETLER — VIP'in altında */}
    {(() => {
      const ALL_BADGES = [
        // common — gri
        { id: 'first_workout',    label: 'İlk Adım',        emoji: '🏃', rarity: 'common',    color: '#6B7384', desc: 'İlk antrenman gününü tamamla' },
        { id: 'first_pr',         label: 'İlk PR',          emoji: '💪', rarity: 'common',    color: '#6B7384', desc: 'İlk ağırlık kaydını gir' },
        { id: 'streak_3',         label: '3 Günlük Seri',   emoji: '🔥', rarity: 'common',    color: '#6B7384', desc: '3 gün üst üste giriş yap' },
        // rare — cyan
        { id: 'streak_7',         label: '7 Günlük Seri',   emoji: '⚡', rarity: 'rare',      color: '#5BC8E0', desc: '7 gün üst üste' },
        { id: 'plan_complete',    label: 'Programcı',       emoji: '📋', rarity: 'rare',      color: '#5BC8E0', desc: 'Bir programı tamamla' },
        { id: 'bench_50',         label: 'Başlangıç Gücü',  emoji: '🏋️', rarity: 'rare',      color: '#5BC8E0', desc: 'Bench 50 kg kaldır' },
        { id: 'first_friend',     label: 'Sosyal Kelebek',  emoji: '👥', rarity: 'rare',      color: '#5BC8E0', desc: 'İlk arkadaşını ekle' },
        // epic — mor
        { id: 'streak_30',        label: 'Demir Disiplin',  emoji: '👑', rarity: 'epic',      color: '#9B6BFF', desc: '30 gün üst üste' },
        { id: 'bench_100',        label: 'Yüz Kulübü',      emoji: '🔱', rarity: 'epic',      color: '#9B6BFF', desc: 'Bench 100 kg kaldır' },
        { id: 'challenge_won',    label: 'Kapışma Ustası',  emoji: '⚔️', rarity: 'epic',      color: '#9B6BFF', desc: 'Bir arkadaş kapışması kazan' },
        // legendary — altın
        { id: 'streak_100',       label: 'Efsane Seri',     emoji: '💎', rarity: 'legendary', color: '#FFD700', desc: '100 gün üst üste' },
        { id: 'bench_bodyweight', label: 'Vücut Gücü',      emoji: '🏆', rarity: 'legendary', color: '#FFD700', desc: 'Bench ≥ vücut ağırlığın' },
        { id: 'total_lifter',     label: 'Güç Canavarı',    emoji: '🦁', rarity: 'legendary', color: '#FFD700', desc: 'Bench+Squat+Deadlift ≥ 300 kg' },
      ];
      const earned = new Set(user.badges || []);
      const earnedCount = ALL_BADGES.filter(b => earned.has(b.id)).length;

      // ── AYLIK ROZETLER (performans, stack'lenir → Efsane ×2 gibi) ──
      const monthly = resolveMonthlyBadges(user);
      // Tier'a göre grupla → say (Efsane ×2)
      const tierOrder = ['legend','elite','rising'];
      const grouped = tierOrder
        .map(t => ({ tier: t, count: monthly.filter(m => m.tier === t).length,
                     months: monthly.filter(m => m.tier === t).map(m => { const mm = parseInt(m.period.split('-')[1]) - 1; return MONTH_SHORT_TR[mm] || ''; }) }))
        .filter(g => g.count > 0);

      return (
        <View style={[styles.statsCard, { marginHorizontal: 0 }]}>
          {/* ===== AYLIK ROZETLER (seviyelendirme) ===== */}
          {grouped.length > 0 && (
            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.statsTitle, { flex: 1, marginBottom: 0 }]}>Aylık Rozetler</Text>
                <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700' }}>her ay performans</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {grouped.map(g => {
                  const meta = MONTH_TIERS[g.tier];
                  const n = g.count;
                  const glowRadius = 6 + n * 4;
                  const glowOpacity = Math.min(0.35 + n * 0.18, 0.95);
                  const borderWidth = 2 + Math.min(n, 3);
                  const prestige = n >= 3;
                  return (
                    <TouchableOpacity key={g.tier} activeOpacity={0.8} onPress={() => setMonthlyDetailTier(g.tier)} style={{ alignItems: 'center', width: 78 }}>
                      <View style={{
                        width: 64, height: 64, borderRadius: 32,
                        backgroundColor: meta.color + (prestige ? '33' : '22'),
                        borderWidth, borderColor: meta.color,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: meta.color, shadowOpacity: glowOpacity, shadowRadius: glowRadius, shadowOffset: { width: 0, height: 0 }, elevation: 10,
                      }}>
                        <Text style={{ fontSize: 30 }}>{meta.emoji}</Text>
                        {n > 1 && (
                          <View style={{ position: 'absolute', bottom: -4, right: -4, backgroundColor: meta.color, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 2, borderColor: C.surface }}>
                            <Text style={{ color: '#0B0D12', fontSize: 11, fontWeight: '900' }}>×{n}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: meta.color, fontSize: 12, fontWeight: '900', marginTop: 7 }}>{meta.label}{prestige ? ' ✦' : ''}</Text>
                      <Text style={{ color: C.textMuted, fontSize: 9, marginTop: 1, textAlign: 'center' }} numberOfLines={1}>{g.months.join(' · ')}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ height: 1, backgroundColor: C.border, marginTop: 16 }} />
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[styles.statsTitle, { flex: 1, marginBottom: 0 }]}>Rozetler</Text>
            <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '700' }}>{earnedCount} / {ALL_BADGES.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {ALL_BADGES.map(b => {
              const isEarned = earned.has(b.id);
              return (
                <View key={b.id} style={{ alignItems: 'center', width: 68 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: isEarned ? b.color + '22' : C.surface2,
                    borderWidth: 2, borderColor: isEarned ? b.color : C.border,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: isEarned ? 1 : 0.45,
                  }}>
                    <Text style={{ fontSize: 26 }}>{isEarned ? b.emoji : '🔒'}</Text>
                  </View>
                  <Text style={{ color: isEarned ? C.text : C.textMuted, fontSize: 10, fontWeight: isEarned ? '800' : '600', marginTop: 5, textAlign: 'center' }} numberOfLines={2}>{b.label}</Text>
                  {!isEarned && (
                    <Text style={{ color: C.textMuted, fontSize: 9, textAlign: 'center', marginTop: 1 }} numberOfLines={2}>{b.desc}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      );
    })()}

    {/* ARKADAŞLAR — ölçülerin üstünde, daha erişilebilir */}
    <TouchableOpacity onPress={() => { fetchFriends(); setFriendsVisible(true); }} activeOpacity={0.85}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 12, borderWidth: 1, borderColor: C.border }}>
      <Ionicons name="people" size={20} color={C.orange} />
      <Text style={{ color: C.text, fontWeight: '800', fontSize: 15, flex: 1 }}>Arkadaşlar</Text>
      {friends.reduce((acc, f) => acc + f.unread, 0) > 0 && (
        <View style={{ backgroundColor: C.orange, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
          <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 11 }}>{friends.reduce((acc, f) => acc + f.unread, 0)}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
    </TouchableOpacity>

    {!isEditingProfile ? (
      <>
        {/* Özet — boy / kilo / VKİ */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderTopWidth: 1, borderColor: C.border }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 20 }}>{user.height || '--'}</Text>
            <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Boy (cm)</Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.border }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 20 }}>{user.weight || '--'}</Text>
            <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Kilo (kg)</Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.border }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontWeight: '900', fontSize: 20 }}>
              {user.height && user.weight ? (user.weight / ((user.height/100) * (user.height/100))).toFixed(1) : '--'}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>VKİ</Text>
          </View>
        </View>
        {/* Vücut ölçüleri — bel / omuz / boyun. En YENİ ölçü kaydını göster
            (backend date artan döndürür, o yüzden sondan başa ilk dolu kaydı bul). */}
        {(() => {
          const m = [...bodyStats].reverse().find(s => s?.waist || s?.shoulder || s?.neck);
          if (!m) return (
            <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, marginBottom: 16 }} />
          );
          return (
          <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }}>
            {m.waist ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 18 }}>{m.waist}</Text>
                <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Bel (cm)</Text>
              </View>
            ) : null}
            {m.shoulder ? (
              <>
                <View style={{ width: 1, backgroundColor: C.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 18 }}>{m.shoulder}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Omuz (cm)</Text>
                </View>
              </>
            ) : null}
            {m.neck ? (
              <>
                <View style={{ width: 1, backgroundColor: C.border }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 18 }}>{m.neck}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>Boyun (cm)</Text>
                </View>
              </>
            ) : null}
          </View>
          {/* En son ölçü kaydını düzelt / sil */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, paddingBottom: 11 }}>
            <TouchableOpacity onPress={() => startEditBodyStat(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="create-outline" size={15} color={C.lime} />
              <Text style={{ color: C.lime, fontSize: 12, fontWeight: '700' }}>Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteBodyStat(m._id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="trash-outline" size={15} color={C.red} />
              <Text style={{ color: C.red, fontSize: 12, fontWeight: '700' }}>Sil</Text>
            </TouchableOpacity>
          </View>
          </View>
          );
        })()}

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.editBtn, { marginBottom: 16 }]}
          onPress={() => {
            setEditName(user.name || '');
            setEditHeight(user.height ? String(user.height) : '');
            setEditWeight(user.weight ? String(user.weight) : '');
            setIsEditingProfile(true);
          }}
        >
          <Ionicons name="body-outline" size={17} color={C.lime} />
          <Text style={styles.editBtnText}>Ölçü Düzenle</Text>
        </TouchableOpacity>
      </>
    ) : (
      <View style={styles.profileCard}>
        <TextInput
          style={styles.input}
          placeholder="İsim Soyisim"
          placeholderTextColor={C.textMuted}
          value={editName}
          onChangeText={setEditName}
        />
        <TextInput
          style={styles.input}
          placeholder="Boy (cm)"
          placeholderTextColor={C.textMuted}
          value={editHeight}
          onChangeText={setEditHeight}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Kilo (kg)"
          placeholderTextColor={C.textMuted}
          value={editWeight}
          onChangeText={setEditWeight}
          keyboardType="numeric"
        />

        {/* Vücut ölçüleri */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Bel (cm)" placeholderTextColor={C.textMuted} value={statWaist} onChangeText={setStatWaist} keyboardType="numeric" />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Omuz (cm)" placeholderTextColor={C.textMuted} value={statShoulder} onChangeText={setStatShoulder} keyboardType="numeric" />
        </View>
        <TextInput style={styles.input} placeholder="Boyun (cm)" placeholderTextColor={C.textMuted} value={statNeck} onChangeText={setStatNeck} keyboardType="numeric" />

        {loading ? <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 10 }} /> : (
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 12}}>
            <TouchableOpacity style={[styles.miniBtn, styles.miniBtnPrimary]} onPress={updateProfile}>
              <Ionicons name="checkmark" size={18} color="#0B0D12" />
              <Text style={styles.miniBtnPrimaryText}>KAYDET</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.miniBtn, styles.miniBtnGhost]} onPress={() => { setIsEditingProfile(false); setEditingStatId(null); setStatWaist(''); setStatShoulder(''); setStatNeck(''); }}>
              <Ionicons name="close" size={18} color={C.red} />
              <Text style={styles.miniBtnGhostText}>İPTAL</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )}

    {/* HEDEF TAKİBİ */}
    {user.targetWeight && user.weight && (
      <View style={[styles.statsCard, { marginHorizontal: 0 }]}>
        <Text style={styles.statsTitle}>Hedefe İlerleme</Text>
        {(() => {
          const current = parseFloat(user.weight);
          const target  = parseFloat(user.targetWeight);
          const start   = bodyStats.length ? parseFloat(bodyStats[bodyStats.length - 1].weight || user.weight) : current;
          const totalToLose = Math.abs(start - target);
          const done        = Math.abs(start - current);
          const pct         = totalToLose > 0 ? Math.min(100, Math.round((done / totalToLose) * 100)) : 100;
          const losing      = target < start;
          return (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: C.textMuted, fontSize: 13 }}>Başlangıç: <Text style={{ color: C.text, fontWeight: '700' }}>{start} kg</Text></Text>
                <Text style={{ color: C.textMuted, fontSize: 13 }}>Hedef: <Text style={{ color: C.lime, fontWeight: '700' }}>{target} kg</Text></Text>
              </View>
              <View style={{ height: 10, backgroundColor: C.border, borderRadius: 5, overflow: 'hidden' }}>
                <LinearGradient colors={[C.lime, C.limeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ width: `${pct}%`, height: '100%', borderRadius: 5 }} />
              </View>
              <Text style={{ color: C.textSec, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                %{pct} tamamlandı · {losing ? `${Math.max(0, current - target).toFixed(1)} kg kaldı` : `${Math.max(0, target - current).toFixed(1)} kg kaldı`}
              </Text>
            </>
          );
        })()}
      </View>
    )}

    {/* GİZLİLİK LİNKLERİ */}
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 12, marginTop: 8 }}>
      <TouchableOpacity onPress={() => setPrivacyModal('privacy')}>
        <Text style={{ color: C.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>Gizlilik Politikası</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setPrivacyModal('terms')}>
        <Text style={{ color: C.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>Kullanım Koşulları</Text>
      </TouchableOpacity>
    </View>

    <TouchableOpacity style={styles.logoutBtn} onPress={async () => { await SecureStore.deleteItemAsync('userToken'); setUser(null); setToken(null); }}>
      <Ionicons name="log-out-outline" size={18} color={C.red} />
      <Text style={styles.logoutText}>ÇIKIŞ YAP</Text>
    </TouchableOpacity>

    {/* HESABI SİL — App Store/Play zorunlu, kalıcı silme */}
    <TouchableOpacity onPress={confirmDeleteAccount} style={{ alignItems: 'center', marginTop: 14, marginBottom: 8 }}>
      <Text style={{ color: C.textMuted, fontSize: 13, textDecorationLine: 'underline' }}>Hesabı Sil</Text>
    </TouchableOpacity>
  </ScrollView>
      )}
      </Animated.View>

      {/* AYLIK ROZET DETAY MODAL */}
      <Modal visible={!!monthlyDetailTier} transparent animationType="fade" onRequestClose={() => setMonthlyDetailTier(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setMonthlyDetailTier(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 28 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: C.surface, borderRadius: 22, padding: 22, borderWidth: 1, borderColor: C.border }}>
            {(() => {
              if (!monthlyDetailTier) return null;
              const meta = MONTH_TIERS[monthlyDetailTier];
              const items = resolveMonthlyBadges(user)
                .filter(m => m.tier === monthlyDetailTier)
                .sort((a, b) => b.period.localeCompare(a.period));
              return (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 18 }}>
                    <View style={{
                      width: 72, height: 72, borderRadius: 36, backgroundColor: meta.color + '22',
                      borderWidth: 3, borderColor: meta.color, alignItems: 'center', justifyContent: 'center',
                      shadowColor: meta.color, shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 12,
                    }}>
                      <Text style={{ fontSize: 36 }}>{meta.emoji}</Text>
                    </View>
                    <Text style={{ color: meta.color, fontSize: 19, fontWeight: '900', marginTop: 12 }}>{meta.label} ×{items.length}</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>{items.length} ay bu seviyeye ulaştın</Text>
                  </View>
                  {items.map((m, i) => {
                    const [yy, mm] = m.period.split('-');
                    return (
                      <View key={m.period + i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color, marginRight: 12 }} />
                        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{MONTH_FULL_TR[parseInt(mm) - 1]} {yy}</Text>
                        <Text style={{ color: meta.color, fontSize: 13, fontWeight: '800' }}>{meta.label} Rozeti</Text>
                        {typeof m.score === 'number' && (
                          <Text style={{ color: C.textMuted, fontSize: 12, marginLeft: 10 }}>{m.score} puan</Text>
                        )}
                      </View>
                    );
                  })}
                  <TouchableOpacity onPress={() => setMonthlyDetailTier(null)} style={{ marginTop: 18, backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 13, alignItems: 'center' }}>
                    <Text style={{ color: C.text, fontWeight: '800', fontSize: 14 }}>Kapat</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* GİZLİLİK / KULLANIM KOŞULLARI MODAL */}
      <Modal visible={!!privacyModal} transparent animationType="slide" onRequestClose={() => setPrivacyModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#13161E', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#262C3A' }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                {privacyModal === 'privacy' ? 'Gizlilik Politikası' : 'Kullanım Koşulları'}
              </Text>
              <TouchableOpacity onPress={() => setPrivacyModal(null)}>
                <Ionicons name="close" size={24} color="#8A93A8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {privacyModal === 'privacy' ? (
                <Text style={{ color: '#C8CDD8', fontSize: 14, lineHeight: 22 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>GymBody AI — Gizlilik Politikası{'\n'}</Text>
                  {'\n'}Son güncelleme: Haziran 2025{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>1. Topladığımız Veriler{'\n'}</Text>
                  GymBody AI uygulaması; ad, e-posta adresi, boy, kilo, beden yağ oranı ve yüklediğiniz fotoğraflar gibi kişisel verileri toplar. Bu veriler yalnızca uygulama özelliklerini sunmak amacıyla kullanılır.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>2. Verilerin Kullanımı{'\n'}</Text>
                  Toplanan veriler; ilerlemenizi takip etmek, yapay zeka destekli öneriler sunmak ve uygulama deneyimini kişiselleştirmek için kullanılır. Verileriniz üçüncü taraflarla satılmaz veya paylaşılmaz.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>3. Reklam{'\n'}</Text>
                  VIP üye olmayan kullanıcılara Google AdMob aracılığıyla reklam gösterilir. AdMob, cihaz bilgilerine ve reklam tercihlerinize göre kişiselleştirilmiş reklamlar sunabilir.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>4. Fotoğraflar{'\n'}</Text>
                  Yüklediğiniz fotoğraflar Cloudinary altyapısında güvenli şekilde saklanır ve yalnızca sizin hesabınızda görüntülenir.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>5. Haklarınız{'\n'}</Text>
                  KVKK kapsamında verilerinize erişme, düzeltme ve silme hakkına sahipsiniz. Talepleriniz için: destek@gymbody.ai{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>6. İletişim{'\n'}</Text>
                  Sorularınız için: destek@gymbody.ai
                </Text>
              ) : (
                <Text style={{ color: '#C8CDD8', fontSize: 14, lineHeight: 22 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>GymBody AI — Kullanım Koşulları{'\n'}</Text>
                  {'\n'}Son güncelleme: Haziran 2025{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>1. Kabul{'\n'}</Text>
                  Uygulamayı kullanarak bu koşulları kabul etmiş sayılırsınız. Kabul etmiyorsanız uygulamayı kullanmayınız.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>2. Hizmet{'\n'}</Text>
                  GymBody AI, fitness takibi ve yapay zeka destekli beslenme önerileri sunan bir mobil uygulamadır. Sağlık tavsiyeleri için doktora danışınız.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>3. Hesap{'\n'}</Text>
                  Hesap güvenliğinden kullanıcı sorumludur. Şifrenizi kimseyle paylaşmayınız.{'\n\n'}
                  {Platform.OS === 'ios' ? (
                    <><Text style={{ color: '#C6FF3D', fontWeight: '600' }}>4. VIP{'\n'}</Text>VIP üyelik aktif dönem boyunca geçerlidir; satın alma ve iade işlemleri App Store kurallarına tabidir.{'\n\n'}</>
                  ) : (
                    <><Text style={{ color: '#C6FF3D', fontWeight: '600' }}>4. Token ve VIP{'\n'}</Text>Tokenlar uygulama içi sanal birimdir, para değeri taşımaz ve iade edilemez. VIP üyelik aktif dönem boyunca geçerlidir.{'\n\n'}</>
                  )}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>5. Yasaklı Kullanım{'\n'}</Text>
                  Uygulamayı kötüye kullanmak, sistemi manipüle etmek veya başkalarının hesaplarına erişmeye çalışmak yasaktır.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>6. Değişiklikler{'\n'}</Text>
                  Koşulları önceden bildirmeksizin değiştirme hakkımız saklıdır.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>7. İletişim{'\n'}</Text>
                  Sorularınız için: destek@gymbody.ai
                </Text>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* GÜN TAMAMLAMA FEEDBACK MODAL */}
      <Modal visible={dayFeedbackVisible} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setDayFeedbackVisible(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1} onPress={Keyboard.dismiss} />
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 }}>💬 Bu Günü Nasıl Buldun?</Text>
            <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 19 }}>
              Eksik gelen, çok gelen veya bir sonraki programa yansıtmamı istediğin bir şey var mı? (opsiyonel)
            </Text>
            <TextInput
              style={[styles.noteInput, { minHeight: 72, marginBottom: 16 }]}
              placeholder="örn. omuz hareketi azdı, bench çok ağır geldi..."
              placeholderTextColor={C.textMuted}
              value={dayFeedbackText}
              onChangeText={setDayFeedbackText}
              multiline
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TouchableOpacity activeOpacity={0.85} onPress={() => { Keyboard.dismiss(); handleCompleteDay(dayFeedbackText); }}>
              <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primaryBtn, { shadowColor: C.orange, shadowOpacity: 0.45 }]}>
                <Ionicons name="checkmark-done-outline" size={18} color="#1A1235" />
                <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>GÜNÜ TAMAMLA</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); handleCompleteDay(); }} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>Yorum yazmadan geç</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* FOTOĞRAF SEÇİM MODAL */}
      <Modal visible={sharePickerVisible} transparent animationType="slide" onRequestClose={() => setSharePickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#13161E', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#262C3A' }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Hangi fotoğrafı paylaşmak istiyorsun?</Text>
              <TouchableOpacity onPress={() => setSharePickerVisible(false)}>
                <Ionicons name="close" size={24} color="#8A93A8" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {gallery.filter(p => p.bodyFatPercentage != null).map((photo, idx) => (
                <TouchableOpacity
                  key={photo._id || idx}
                  onPress={() => {
                    setSharePickerVisible(false);
                    setShareImgLoaded(false);
                    setSharePhotoUrl(photo.url);
                    setSharePhotoFat(photo.bodyFatPercentage);
                    setShareCardReady(true);
                  }}
                  style={{ width: '30%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: C.border }}
                >
                  <ExpoImage source={{ uri: photo.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  {photo.bodyFatPercentage != null && (
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, alignItems: 'center' }}>
                      <Text style={{ color: C.orange, fontSize: 11, fontWeight: '700' }}>%{photo.bodyFatPercentage}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* PAYLAŞIM KARTI MODAL */}
      <Modal visible={shareCardReady} transparent animationType="fade" onRequestClose={() => setShareCardReady(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ViewShot ref={shareCardRef} options={{ format: 'jpg', quality: 0.95 }} style={{ overflow: 'hidden' }}>
            <View style={{ width: 320, backgroundColor: '#0B0D12' }}>
              {sharePhotoUrl && (
                <Image
                  source={{ uri: sharePhotoUrl }}
                  style={{ width: 320, height: 400 }}
                  resizeMode="cover"
                  onLoadEnd={() => setShareImgLoaded(true)}
                />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(11,13,18,0.95)', '#0B0D12']}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180, justifyContent: 'flex-end', padding: 20 }}
              >
                {sharePhotoFat != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                    <Text style={{ color: '#C6FF3D', fontSize: 38, fontWeight: '900' }}>%{sharePhotoFat}</Text>
                    <Text style={{ color: '#A3ABBA', fontSize: 16, fontWeight: '600' }}>yağ oranı</Text>
                  </View>
                )}
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 2 }}>💪 {user?.name || ''} · GymBodyAI</Text>
                <Text style={{ color: '#6B7384', fontSize: 12 }}>gymbodyai.app</Text>
              </LinearGradient>
            </View>
          </ViewShot>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity onPress={() => setShareCardReady(false)}
              style={{ flex: 1, backgroundColor: '#1D2230', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: '#A3ABBA', fontWeight: '700' }}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={captureAndShare} disabled={!shareImgLoaded || shareLoading}
              style={{ flex: 2, borderRadius: 14, overflow: 'hidden', opacity: (!shareImgLoaded || shareLoading) ? 0.6 : 1 }}>
              <LinearGradient colors={['#C6FF3D', '#9FE000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {shareLoading || !shareImgLoaded ? (
                  <ActivityIndicator color="#0B0D12" />
                ) : (
                  <Ionicons name="share-social" size={18} color="#0B0D12" />
                )}
                <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 15 }}>
                  {!shareImgLoaded ? 'YÜKLENİYOR' : shareLoading ? 'HAZIRLANIYOR' : 'PAYLAŞ'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ANTRENMAN MODU MODAL */}
      {(() => {
        const exercises: any[] = weeklyPlan?.workoutPlan?.find((d: any) => d.dayNumber === weeklyPlan?.currentDay)?.exercises || [];
        const ex = exercises[workoutExIdx];
        if (!ex) return null;
        const { sets: totalSets, repsLabel } = parseExSets(ex.sets || '3x10');
        const isLastEx = workoutExIdx >= exercises.length - 1;
        const isLastSet = workoutSetIdx >= totalSets - 1;

        const startRest = () => {
          setRestSeconds(restDuration);
          clearInterval(restIntervalRef.current);
          restIntervalRef.current = setInterval(() => {
            setRestSeconds(prev => {
              if (prev === null || prev <= 1) { clearInterval(restIntervalRef.current); return null; }
              return prev - 1;
            });
          }, 1000);
        };

        const saveWorkoutLift = async (exIndex: number) => {
          const exercise = exercises[exIndex];
          const liftKey = exToLiftKey(exercise?.name || '');
          const wStr = workoutWeights[exIndex];
          const w = parseFloat(wStr);
          if (!liftKey || !token || !(w > 0)) return;
          try {
            await axios.post(`${API_URL}/update-lift`, { lift: liftKey, weight: w }, {
              headers: { Authorization: `Bearer ${token}` }
            });
            fetchUserStats();
          } catch {}
        };

        const handleSetDone = () => {
          if (!isLastSet) {
            setWorkoutSetIdx(s => s + 1);
            startRest();
          } else {
            saveWorkoutLift(workoutExIdx);
            if (!isLastEx) {
              setWorkoutExIdx(i => i + 1);
              setWorkoutSetIdx(0);
              startRest();
            } else {
              setWorkoutActive(false);
              setWorkoutExIdx(0);
              setWorkoutSetIdx(0);
              setWorkoutWeights({});
              setRestSeconds(null);
              setDayFeedbackVisible(true);
            }
          }
        };

        return (
          <Modal visible={workoutActive} transparent={false} animationType="slide" onRequestClose={() => setWorkoutActive(false)}>
            <View style={{ flex: 1, backgroundColor: C.bg }}>
              {/* Üst bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
                <TouchableOpacity onPress={() => setWorkoutActive(false)} style={{ marginRight: 12 }}>
                  <Ionicons name="close" size={24} color={C.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700' }}>{workoutExIdx + 1}/{exercises.length}. EGZERSİZ</Text>
                  <Text style={{ color: C.text, fontWeight: '900', fontSize: 17 }} numberOfLines={1}>{ex.name}</Text>
                </View>
                {ex.gifUrl && (
                  <TouchableOpacity onPress={() => setGifModalUrl(ex.gifUrl)} style={{ padding: 8 }}>
                    <Ionicons name="play-circle" size={28} color={C.lime} />
                  </TouchableOpacity>
                )}
              </View>

              {/* İlerleme barı */}
              <View style={{ height: 4, backgroundColor: C.border }}>
                <View style={{ height: 4, backgroundColor: '#FF9F1C', width: `${((workoutExIdx) / exercises.length) * 100}%` }} />
              </View>

              <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
                {/* Set göstergesi */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 32 }}>
                  {Array.from({ length: totalSets }).map((_, i) => (
                    <View key={i} style={{
                      width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: i < workoutSetIdx ? '#FF9F1C' : i === workoutSetIdx ? '#FF9F1C33' : C.surface2,
                      borderWidth: i === workoutSetIdx ? 2 : 0, borderColor: '#FF9F1C',
                    }}>
                      {i < workoutSetIdx
                        ? <Ionicons name="checkmark" size={18} color="#1A1235" />
                        : <Text style={{ color: i === workoutSetIdx ? '#FF9F1C' : C.textMuted, fontWeight: '700' }}>{i + 1}</Text>
                      }
                    </View>
                  ))}
                </View>

                {/* Tekrar */}
                <Text style={{ color: C.textMuted, fontSize: 14, marginBottom: 6 }}>Hedef tekrar</Text>
                <Text style={{ color: '#FF9F1C', fontWeight: '900', fontSize: 64, lineHeight: 68 }}>{repsLabel}</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>tekrar</Text>

                {/* Kilo girişi */}
                {exToLiftKey(ex.name || '') && (
                  <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 16 }}>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 8 }}>Kullandığın ağırlık (opsiyonel)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TextInput
                        style={{ backgroundColor: C.surface2, color: C.text, fontWeight: '800', fontSize: 26,
                          borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10,
                          borderWidth: 1, borderColor: workoutWeights[workoutExIdx] ? '#FF9F1C' : C.border,
                          minWidth: 100, textAlign: 'center' }}
                        keyboardType="numeric"
                        placeholder="—"
                        placeholderTextColor={C.textMuted}
                        value={workoutWeights[workoutExIdx] || ''}
                        onChangeText={v => setWorkoutWeights(prev => ({ ...prev, [workoutExIdx]: v }))}
                      />
                      <Text style={{ color: C.textMuted, fontSize: 18, fontWeight: '700' }}>kg</Text>
                    </View>
                    {(() => {
                      const liftKey = exToLiftKey(ex.name || '');
                      const currentBest = liftKey ? (user?.lifts?.[liftKey]?.best || 0) : 0;
                      const entered = parseFloat(workoutWeights[workoutExIdx]);
                      if (!currentBest || !entered) return null;
                      if (entered > currentBest) return <Text style={{ color: C.lime, fontSize: 11, marginTop: 6, fontWeight: '700' }}>Yeni PR! {entered} kg {'>'} {currentBest} kg</Text>;
                      return <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 6 }}>Mevcut max: {currentBest} kg</Text>;
                    })()}
                  </View>
                )}
                <View style={{ height: 24 }} />

                {/* Dinlenme sayacı */}
                {restSeconds !== null ? (
                  <View style={{ alignItems: 'center', marginBottom: 32 }}>
                    <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 8 }}>Dinlenme süresi</Text>
                    <Text style={{ color: restSeconds <= 10 ? C.orange : C.lime, fontWeight: '900', fontSize: 48 }}>{restSeconds}s</Text>
                    <TouchableOpacity onPress={() => { clearInterval(restIntervalRef.current); setRestSeconds(null); }}
                      style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border }}>
                      <Text style={{ color: C.textMuted, fontSize: 13 }}>Atla</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity activeOpacity={0.85} onPress={handleSetDone} style={{ width: '100%' }}>
                    <LinearGradient colors={['#FF9F1C', '#E8890A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ borderRadius: 18, paddingVertical: 20, alignItems: 'center' }}>
                      <Text style={{ color: '#1A1235', fontWeight: '900', fontSize: 18 }}>
                        {isLastSet && isLastEx ? 'Antrenmanı Bitir' : isLastSet ? 'Sonraki Egzersiz →' : `Set ${workoutSetIdx + 1} Tamamlandı`}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}

                {/* Dinlenme süresi seçici */}
                {restSeconds === null && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                    {[30, 60, 90, 120].map(s => (
                      <TouchableOpacity key={s} onPress={() => setRestDuration(s)}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                          backgroundColor: restDuration === s ? '#FF9F1C22' : C.surface2,
                          borderWidth: 1, borderColor: restDuration === s ? '#FF9F1C' : C.border }}>
                        <Text style={{ color: restDuration === s ? '#FF9F1C' : C.textMuted, fontSize: 12, fontWeight: '700' }}>{s}s</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </Modal>
        );
      })()}

      {/* GIF MODAL */}
      {/* PT — HOCA SOHBET MODALI */}
      <Modal visible={coachChatVisible} transparent animationType="slide" onRequestClose={closeCoachChat}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 54, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
              <TouchableOpacity onPress={closeCoachChat} style={{ marginRight: 12 }}>
                <Ionicons name="chevron-back" size={26} color={C.text} />
              </TouchableOpacity>
              <Text style={{ color: C.text, fontWeight: '900', fontSize: 17, flex: 1 }}>🏋️ {coachData.coachName || 'Hocan'}</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 8 }}>
              {coachMessages.length === 0 && (
                <Text style={{ color: C.textMuted, textAlign: 'center', marginTop: 40 }}>Henüz mesaj yok. Hocana yazabilirsin 👋</Text>
              )}
              {coachMessages.map((msg, i) => {
                const mine = msg.from === 'student';
                return (
                  <View key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: mine ? C.orange : C.surface2, borderRadius: 16, borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4, paddingVertical: 9, paddingHorizontal: 12 }}>
                    <Text style={{ color: mine ? '#0B0D12' : C.text, fontSize: 14, lineHeight: 19 }}>{msg.text}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface }}>
              <TextInput value={coachChatInput} onChangeText={setCoachChatInput} placeholder="Mesaj yaz..." placeholderTextColor={C.textMuted}
                style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: C.text }} />
              <TouchableOpacity onPress={sendCoachMessage} disabled={!coachChatInput.trim()}
                style={{ backgroundColor: coachChatInput.trim() ? C.orange : C.surface2, borderRadius: 20, padding: 10 }}>
                <Ionicons name="send" size={20} color={coachChatInput.trim() ? '#0B0D12' : C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!gifModalUrl} transparent animationType="fade" onRequestClose={() => setGifModalUrl(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setGifModalUrl(null)}>
         {gifModalUrl && (() => {
           // 2 kareli statik görsel (.../0.jpg başlangıç, .../1.jpg bitiş) → ard arda oynat
           const twoFrame = /\/[01]\.jpg$/i.test(gifModalUrl);
           const cur = twoFrame && gifFrame === 0 ? gifModalUrl.replace(/\/1\.jpg$/i, '/0.jpg') : gifModalUrl;
           return (
             <ExpoImage
               source={{ uri: `${API_URL}/gif-proxy?url=${encodeURIComponent(cur)}`, headers: { Authorization: `Bearer ${token}` } }}
               style={{ width: 308, height: 308, borderRadius: 16 }}
               contentFit="contain"
               transition={250}
             />
           );
         })()}
        </TouchableOpacity>
      </Modal>

      {/* EGZERSİZ KÜTÜPHANESİ MODAL */}
      <Modal visible={libVisible} animationType="slide" onRequestClose={() => { if (libDetail) setLibDetail(null); else setLibVisible(false); }}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, gap: 12 }}>
            <TouchableOpacity onPress={() => { if (libDetail) setLibDetail(null); else setLibVisible(false); }}>
              <Ionicons name={libDetail ? 'arrow-back' : 'close'} size={26} color={C.text} />
            </TouchableOpacity>
            <Text numberOfLines={1} style={{ color: C.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{libDetail ? libDetail.name : 'Hareket Kütüphanesi'}</Text>
          </View>

          {libDetail ? (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              <View style={{ alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <ExpoImage
                  source={{ uri: `${API_URL}/gif-proxy?url=${encodeURIComponent((libDetail.images && libDetail.images.length ? libDetail.images[gifFrame % libDetail.images.length] : libDetail.gifUrl))}`, headers: { Authorization: `Bearer ${token}` } }}
                  style={{ width: 260, height: 260, borderRadius: 12 }}
                  contentFit="contain"
                  transition={250}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                {!!libDetail._group && <View style={{ backgroundColor: C.surface2, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 11 }}><Text style={{ color: C.lime, fontSize: 12, fontWeight: '600' }}>{libDetail._group}</Text></View>}
                {!!libDetail.equipment && <View style={{ backgroundColor: C.surface2, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 11 }}><Text style={{ color: C.textSec, fontSize: 12 }}>{libDetail.equipment}</Text></View>}
                {!!libDetail.level && <View style={{ backgroundColor: C.surface2, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 11 }}><Text style={{ color: C.textSec, fontSize: 12 }}>{libDetail.level}</Text></View>}
              </View>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 15, marginBottom: 12 }}>Yapılışı</Text>
              {(libDetail.instructions || []).map((s: string, i: number) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 13 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.bg, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text></View>
                  <Text style={{ color: C.textSec, fontSize: 14, flex: 1, lineHeight: 21 }}>{s}</Text>
                </View>
              ))}
              {!(libDetail.instructions || []).length && <Text style={{ color: C.textMuted, fontSize: 13 }}>Bu hareket için talimat bulunmuyor.</Text>}
            </ScrollView>
          ) : (
            <>
              <View style={{ paddingHorizontal: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 12 }}>
                  <Ionicons name="search" size={18} color={C.textMuted} />
                  <TextInput value={libSearch} onChangeText={setLibSearch} placeholder="Hareket ara..." placeholderTextColor={C.textMuted} style={{ flex: 1, color: C.text, fontSize: 15 }} />
                </View>
              </View>
              <View style={{ marginBottom: 6 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                  {['Tümü', ...Object.keys(libData)].map((g) => (
                    <TouchableOpacity key={g} onPress={() => setLibGroup(g)} style={{ backgroundColor: libGroup === g ? C.lime : C.surface, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 14 }}>
                      <Text style={{ color: libGroup === g ? C.bg : C.textSec, fontSize: 13, fontWeight: '600' }}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {libLoading ? (
                <ActivityIndicator color={C.lime} style={{ marginTop: 50 }} />
              ) : (
                <FlatList
                  data={(() => {
                    const all = Object.entries(libData).flatMap(([g, arr]) => (arr as any[]).map((x) => ({ ...x, _group: g })));
                    const q = libSearch.toLowerCase().trim();
                    return all.filter((x) => (libGroup === 'Tümü' || x._group === libGroup) && (!q || x.name.toLowerCase().includes(q)));
                  })()}
                  keyExtractor={(it: any) => it.name}
                  numColumns={2}
                  contentContainerStyle={{ padding: 12 }}
                  columnWrapperStyle={{ gap: 10 }}
                  renderItem={({ item }: any) => (
                    <TouchableOpacity onPress={() => setLibDetail(item)} activeOpacity={0.85} style={{ flex: 1, maxWidth: '48%', backgroundColor: C.surface, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
                      <ExpoImage source={{ uri: `${API_URL}/gif-proxy?url=${encodeURIComponent(item.gifUrl)}`, headers: { Authorization: `Bearer ${token}` } }} style={{ width: '100%', height: 110, backgroundColor: C.surface2 }} contentFit="cover" />
                      <View style={{ padding: 9 }}>
                        <Text numberOfLines={2} style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{item.name}</Text>
                        {!!item.equipment && <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 3 }}>{item.equipment}</Text>}
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Eşleşen hareket yok.</Text>}
                />
              )}
            </>
          )}
        </View>
      </Modal>

      {/* ROZET KAZANILDI MODAL */}
      <Modal visible={newBadgeVisible} transparent animationType="fade" onRequestClose={() => setNewBadgeVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 32 }} activeOpacity={1} onPress={() => setNewBadgeVisible(false)}>
          <View style={{ backgroundColor: C.surface, borderRadius: 24, padding: 28, alignItems: 'center', width: '100%' }}>
            {(() => {
              const BADGE_META: Record<string,{emoji:string;color:string;rarity:string}> = {
                first_workout:    { emoji:'🏃', color:'#6B7384', rarity:'Common' },
                first_pr:         { emoji:'💪', color:'#6B7384', rarity:'Common' },
                streak_3:         { emoji:'🔥', color:'#6B7384', rarity:'Common' },
                streak_7:         { emoji:'⚡', color:'#5BC8E0', rarity:'Rare' },
                plan_complete:    { emoji:'📋', color:'#5BC8E0', rarity:'Rare' },
                bench_50:         { emoji:'🏋️', color:'#5BC8E0', rarity:'Rare' },
                first_friend:     { emoji:'👥', color:'#5BC8E0', rarity:'Rare' },
                streak_30:        { emoji:'👑', color:'#9B6BFF', rarity:'Epic' },
                bench_100:        { emoji:'🔱', color:'#9B6BFF', rarity:'Epic' },
                challenge_won:    { emoji:'⚔️', color:'#9B6BFF', rarity:'Epic' },
                streak_100:       { emoji:'💎', color:'#FFD700', rarity:'Legendary' },
                bench_bodyweight: { emoji:'🏆', color:'#FFD700', rarity:'Legendary' },
                total_lifter:     { emoji:'🦁', color:'#FFD700', rarity:'Legendary' },
              };
              const topBadge = newBadges[0] ? BADGE_META[newBadges[0].id] : null;
              return (
                <>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: (topBadge?.color || C.orange) + '22', borderWidth: 3, borderColor: topBadge?.color || C.orange, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 40 }}>{topBadge?.emoji || '🏅'}</Text>
                  </View>
                  {topBadge && <Text style={{ color: topBadge.color, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 4 }}>{topBadge.rarity.toUpperCase()}</Text>}
                  <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 4 }}>Rozet Kazandın!</Text>
                  {newBadges.map(b => {
                    const m = BADGE_META[b.id];
                    return (
                      <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <Text style={{ fontSize: 20 }}>{m?.emoji || '🏅'}</Text>
                        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>{b.label}</Text>
                      </View>
                    );
                  })}
                  <TouchableOpacity onPress={() => setNewBadgeVisible(false)}
                    style={{ marginTop: 20, backgroundColor: topBadge?.color || C.orange, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 36 }}>
                    <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 15 }}>HARİKA! 🎉</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* İLK GİRİŞ KARŞILAMA MODALI */}
      <Modal visible={welcomeVisible} transparent={false} animationType="fade" onRequestClose={() => {}}>
        {(() => {
          const QUESTIONS = [
            {
              key: 'goal', title: 'Hedefin ne?', subtitle: 'Sana en uygun programı hazırlayalım',
              options: [
                { id: 'fat_loss', icon: '🔥', label: 'Yağ Yak', desc: 'Kilo ver, form al' },
                { id: 'muscle', icon: '💪', label: 'Kas Kazan', desc: 'Hacim ve güç artır' },
                { id: 'maintain', icon: '⚖️', label: 'Form Koru', desc: 'Mevcut formu koru' },
                { id: 'strength', icon: '🏋️', label: 'Güçlen', desc: 'Max kaldırmayı artır' },
              ],
            },
            {
              key: 'experience', title: 'Deneyim seviyeni seç', subtitle: 'Programın zorluğu buna göre ayarlanır',
              options: [
                { id: 'beginner', icon: '🌱', label: 'Yeni Başlayan', desc: '0-1 yıl' },
                { id: 'intermediate', icon: '⚡', label: 'Orta Seviye', desc: '1-3 yıl' },
                { id: 'advanced', icon: '🔱', label: 'İleri Seviye', desc: '3+ yıl' },
              ],
            },
            {
              key: 'daysPerWeek', title: 'Haftada kaç gün?', subtitle: 'Program bu gün sayısına göre oluşturulur',
              options: [
                { id: '3', icon: '3️⃣', label: '3 Gün', desc: 'Haftada 3' },
                { id: '4', icon: '4️⃣', label: '4 Gün', desc: 'Haftada 4' },
                { id: '5', icon: '5️⃣', label: '5 Gün', desc: 'Haftada 5' },
                { id: '6', icon: '6️⃣', label: '6 Gün', desc: 'Haftada 6' },
              ],
            },
            {
              key: 'location', title: 'Nerede antrenman yapıyorsun?', subtitle: 'Ekipman durumuna göre egzersizler seçilir',
              options: [
                { id: 'gym', icon: '🏋️', label: 'Spor Salonu', desc: 'Tam ekipman' },
                { id: 'home_equipped', icon: '🏠', label: 'Evde (Ekipmanlı)', desc: 'Dambıl, bant vs.' },
                { id: 'home_bare', icon: '🤸', label: 'Evde (Ekipmansız)', desc: 'Sadece vücut ağırlığı' },
              ],
            },
            {
              key: 'restrictions', title: 'Fiziksel kısıtlaman var mı?', subtitle: 'Sakatlık veya ağrı bölgelerini atlayalım',
              options: [
                { id: 'none', icon: '✅', label: 'Hayır, yok', desc: 'Her şey yolunda' },
                { id: 'back', icon: '🔴', label: 'Bel', desc: 'Bel fıtığı / ağrısı' },
                { id: 'knee', icon: '🔴', label: 'Diz', desc: 'Diz sorunu' },
                { id: 'shoulder', icon: '🔴', label: 'Omuz', desc: 'Omuz ağrısı' },
              ],
            },
          ];

          const q = QUESTIONS[onboardingStep];
          const isLast = onboardingStep === QUESTIONS.length - 1;
          const selected = onboardingAnswers[q.key];
          const allAnswered = isLast && selected;

          const handleSelect = (id: string) => {
            setOnboardingAnswers(prev => ({ ...prev, [q.key]: id }));
          };

          const handleNext = () => {
            if (!selected) return;
            if (isLast) { completeOnboarding(); return; }
            animateStep(() => setOnboardingStep(s => s + 1));
          };

          return (
            <View style={{ flex: 1, backgroundColor: '#080B14' }}>
              {/* Progress bar */}
              <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 24, paddingBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
                  {QUESTIONS.map((_, i) => (
                    <View key={i} style={{ flex: 1, height: 3, borderRadius: 2,
                      backgroundColor: i <= onboardingStep ? '#FF9F1C' : '#1E2335' }} />
                  ))}
                </View>

                {/* Logo */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 }}>
                  <LinearGradient colors={['#FF9F1C', '#E8890A']} style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="barbell" size={18} color="#1A1235" />
                  </LinearGradient>
                  <Text style={{ color: '#FF9F1C', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 }}>GymBody AI</Text>
                  <Text style={{ color: '#1E2335', fontWeight: '700', fontSize: 13, marginLeft: 'auto' }}>{onboardingStep + 1} / {QUESTIONS.length}</Text>
                </View>
              </View>

              <RNAnimated.View style={{ flex: 1, opacity: onboardingAnim, paddingHorizontal: 24 }}>
                {/* Soru */}
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 26, lineHeight: 32, marginBottom: 8 }}>{q.title}</Text>
                <Text style={{ color: '#4A5280', fontSize: 14, marginBottom: 28 }}>{q.subtitle}</Text>

                {/* Seçenekler */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {q.options.map(opt => {
                    const isSelected = selected === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        activeOpacity={0.8}
                        onPress={() => handleSelect(opt.id)}
                        style={{
                          width: q.options.length === 3 ? '47%' : '47%',
                          borderRadius: 18,
                          padding: 18,
                          borderWidth: 2,
                          borderColor: isSelected ? '#FF9F1C' : '#1A1F35',
                          backgroundColor: isSelected ? 'rgba(255,159,28,0.12)' : '#0F1322',
                        }}
                      >
                        <Text style={{ fontSize: 28, marginBottom: 10 }}>{opt.icon}</Text>
                        <Text style={{ color: isSelected ? '#FF9F1C' : '#fff', fontWeight: '800', fontSize: 15, marginBottom: 4 }}>{opt.label}</Text>
                        <Text style={{ color: '#4A5280', fontSize: 12 }}>{opt.desc}</Text>
                        {isSelected && (
                          <View style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: 10,
                            backgroundColor: '#FF9F1C', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="checkmark" size={13} color="#1A1235" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </RNAnimated.View>

              {/* Alt buton */}
              <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}>
                <TouchableOpacity activeOpacity={selected ? 0.88 : 1} onPress={handleNext}>
                  <LinearGradient
                    colors={selected ? ['#FF9F1C', '#E8890A'] : ['#1A1F35', '#1A1F35']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ borderRadius: 18, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <Text style={{ color: selected ? '#1A1235' : '#2A3050', fontWeight: '900', fontSize: 16 }}>
                      {isLast ? 'Programımı Oluştur' : 'Devam Et'}
                    </Text>
                    <Ionicons name={isLast ? 'rocket' : 'arrow-forward'} size={18} color={selected ? '#1A1235' : '#2A3050'} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}
      </Modal>

      {/* HAFTALIK ÖZET MODAL */}
      <Modal visible={weeklySummaryVisible} transparent animationType="slide" onRequestClose={() => setWeeklySummaryVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: C.border, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>📊 Bu Haftanın Özeti</Text>
              <TouchableOpacity onPress={() => setWeeklySummaryVisible(false)}>
                <Ionicons name="close" size={24} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {weeklySummary && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  {[
                    { icon: 'flame', color: C.orange, val: weeklySummary.streak, label: 'Günlük Seri' },
                    { icon: 'barbell-outline', color: C.lime, val: weeklySummary.workoutDays, label: 'Antrenman' },
                    { icon: 'restaurant-outline', color: C.blue, val: weeklySummary.mealScans, label: 'Öğün Tarama' },
                    { icon: 'flame-outline', color: C.red, val: `${weeklySummary.avgCalories} kal`, label: 'Ort. Kalori' },
                  ].map(item => (
                    <View key={item.label} style={{ flex: 1, minWidth: '45%', backgroundColor: C.surface2, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 4 }}>
                      <Ionicons name={item.icon as any} size={22} color={item.color} />
                      <Text style={{ color: C.text, fontWeight: '800', fontSize: 18 }}>{item.val}</Text>
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>{item.label}</Text>
                    </View>
                  ))}
                </View>
                {weeklySummary.weightDiff !== null && (
                  <View style={{ backgroundColor: weeklySummary.weightDiff <= 0 ? '#0f2a1a' : '#2a0f0f', borderRadius: 14, padding: 16, marginBottom: 10 }}>
                    <Text style={{ color: weeklySummary.weightDiff <= 0 ? C.green : C.red, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>
                      {weeklySummary.weightDiff <= 0 ? `−${Math.abs(weeklySummary.weightDiff)} kg verdin 🔥` : `+${weeklySummary.weightDiff} kg aldın`}
                    </Text>
                    <Text style={{ color: C.textSec, fontSize: 13, textAlign: 'center', marginTop: 4 }}>Bu haftaki kilo değişimi</Text>
                  </View>
                )}
                {weeklySummary.fatDiff !== null && (
                  <View style={{ backgroundColor: weeklySummary.fatDiff > 0 ? '#0f2a1a' : '#2a0f0f', borderRadius: 14, padding: 16, marginBottom: 10 }}>
                    <Text style={{ color: weeklySummary.fatDiff > 0 ? C.green : C.red, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>
                      {weeklySummary.fatDiff > 0 ? `−%${weeklySummary.fatDiff} yağ oranı düştü 💪` : `+%${Math.abs(weeklySummary.fatDiff)} yağ oranı arttı`}
                    </Text>
                    <Text style={{ color: C.textSec, fontSize: 13, textAlign: 'center', marginTop: 4 }}>Bu haftaki yağ oranı değişimi</Text>
                  </View>
                )}
                <View style={{ backgroundColor: C.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                    {weeklySummary.workoutDays >= 4 ? '🏆 Mükemmel bir hafta geçirdin! Bu tempo devam ederse sonuçlar kaçınılmaz.' :
                     weeklySummary.workoutDays >= 2 ? '💪 İyi bir haftaydı. Bir sonraki haftada biraz daha sıkıştır.' :
                     '🎯 Bu hafta biraz sessiz geçti. Küçük adımlar da sayılır, hadi devam!'}
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* AI SOHBET BUTONU (floating) */}
      {user && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setChatVisible(true)}
          style={{ position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', zIndex: 100 }}
        >
          <LinearGradient colors={[C.lime, C.limeDark]} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="chatbubble-ellipses" size={24} color="#0B0D12" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* AI SOHBET MODAL */}
      <Modal visible={chatVisible} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setChatVisible(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.border, maxHeight: '80%', minHeight: '60%', flexDirection: 'column' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
              <View>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 17 }}>🤖 AI Koçun</Text>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>{userStats.isVip ? 'Sınırsız sohbet' : 'Günde 3 ücretsiz mesaj'}</Text>
              </View>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setChatVisible(false); }}>
                <Ionicons name="close" size={24} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView ref={chatScrollRef} style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {chatMessages.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: 20, gap: 8 }}>
                  <Text style={{ fontSize: 40 }}>🏋️</Text>
                  <Text style={{ color: C.textSec, textAlign: 'center', lineHeight: 20 }}>Merhaba! Antrenman, beslenme veya hedeflerin hakkında her şeyi sorabilirsin.</Text>
                  <View style={{ gap: 8, width: '100%', marginTop: 12 }}>
                    {['Bugün için antrenman öner', 'Protein ihtiyacım ne kadar?', 'Motivasyon düştü, ne yapayım?'].map(q => (
                      <TouchableOpacity key={q} onPress={() => { setChatInput(q); }}
                        style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border }}>
                        <Text style={{ color: C.textSec, fontSize: 13 }}>{q}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {chatMessages.map((m, i) => (
                <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <View style={{ backgroundColor: m.role === 'user' ? C.lime : C.surface2, borderRadius: 16, borderBottomRightRadius: m.role === 'user' ? 4 : 16, borderBottomLeftRadius: m.role === 'user' ? 16 : 4, padding: 12 }}>
                    <Text style={{ color: m.role === 'user' ? '#0B0D12' : C.text, fontSize: 14, lineHeight: 20 }}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {chatLoading && (
                <View style={{ alignSelf: 'flex-start', backgroundColor: C.surface2, borderRadius: 16, padding: 14 }}>
                  <ActivityIndicator size="small" color={C.lime} />
                </View>
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingTop: 10, borderTopWidth: 1, borderColor: C.border }}>
              <TextInput
                style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border }}
                placeholder="Sor bakalım..."
                placeholderTextColor={C.textMuted}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChatMessage}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={sendChatMessage} disabled={!chatInput.trim() || chatLoading}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chatInput.trim() ? C.lime : C.border, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="send" size={18} color={chatInput.trim() ? '#0B0D12' : C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* LIGHTBOX */}
      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setLightboxUrl(null)} style={{ position: 'absolute', top: insets.top + 16, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {lightboxUrl && (
            <Image source={{ uri: lightboxUrl }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.82 }} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* GÜÇ — PR GİRİŞİ MODALI */}
      <Modal visible={!!liftModal} transparent animationType="fade" onRequestClose={() => setLiftModal(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setLiftModal(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 28 }}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: C.bgAlt, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: C.border }}>
            {(() => {
              const lift = LIFTS.find(l => l.key === liftModal);
              if (!lift) return null;
              const best = user?.lifts?.[liftModal!]?.best || 0;
              return (
                <>
                  <Text style={{ fontSize: 34, textAlign: 'center', marginBottom: 6 }}>{lift.icon}</Text>
                  <Text style={{ color: C.text, fontWeight: '800', fontSize: 19, textAlign: 'center' }}>{lift.label}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: (lift as any).hint ? 8 : 18 }}>
                    {lift.muscle} • Şu anki rekor: {best ? `${best} kg` : '—'}
                  </Text>
                  {(lift as any).hint && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 16 }}>
                      <Ionicons name="information-circle-outline" size={14} color={C.orange} />
                      <Text style={{ color: C.orange, fontSize: 12 }}>{(lift as any).hint}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TextInput
                      value={liftInput}
                      onChangeText={setLiftInput}
                      keyboardType="numeric"
                      placeholder="Kaç kg?"
                      placeholderTextColor={C.textMuted}
                      style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, color: C.text, fontSize: 18, fontWeight: '700' }}
                    />
                    <Text style={{ color: C.textSec, fontSize: 16, fontWeight: '700' }}>kg</Text>
                  </View>
                  <TouchableOpacity onPress={saveLift} disabled={liftSaving} activeOpacity={0.85}
                    style={{ marginTop: 16, backgroundColor: C.orange, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                    {liftSaving ? <ActivityIndicator color="#0B0D12" /> : <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 15 }}>Kaydet</Text>}
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* SİKLET LİDERLİK TABLOSU MODALI */}
      <Modal visible={!!leaderboardLift} transparent animationType="slide" onRequestClose={() => setLeaderboardLift(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setLeaderboardLift(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: C.bgAlt, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: insets.bottom + 24, maxHeight: '82%' }}>
            {(() => {
              const lift = LIFTS.find(l => l.key === leaderboardLift);
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="trophy" size={22} color={RANKS[4].color} />
                      <View>
                        <Text style={{ color: C.text, fontWeight: '800', fontSize: 19 }}>{lift?.label}</Text>
                        {leaderboardData?.bracket && (
                          <Text style={{ color: C.orange, fontWeight: '700', fontSize: 13, marginTop: 1 }}>
                            🏋️ {leaderboardData.genderLabel ? `${leaderboardData.genderLabel} · ` : ''}{String(leaderboardData.bracket).replace(' kg', '')} sikleti
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setLeaderboardLift(null)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                      <Ionicons name="close" size={24} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {leaderboardLoading ? (
                    <ActivityIndicator size="large" color={C.orange} style={{ marginVertical: 40 }} />
                  ) : leaderboardData ? (
                    <>
                      <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 8, marginBottom: 16 }}>
                        {leaderboardData.total} kişi yarışıyor · Senin sıran: {leaderboardData.myRank > 0 ? `#${leaderboardData.myRank}` : '—'}
                      </Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        {leaderboardData.top10?.length > 0 ? leaderboardData.top10.map((row: any) => (
                          <View key={row.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
                            paddingHorizontal: 10, borderRadius: 12, marginBottom: 6,
                            backgroundColor: row.isMe ? 'rgba(255,159,28,0.14)' : C.surface,
                            borderWidth: row.isMe ? 1 : 0, borderColor: C.orange }}>
                            <Text style={{ width: 26, textAlign: 'center', fontSize: row.rank <= 3 ? 18 : 13, fontWeight: '800',
                              color: row.rank === 1 ? '#FFD700' : row.rank === 2 ? '#C0C0C0' : row.rank === 3 ? '#CD7F32' : C.textSec }}>
                              {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                            </Text>
                            {row.photo ? (
                              <Image source={{ uri: row.photo }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                            ) : (
                              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
                                <Text style={{ color: C.textSec, fontWeight: '800', fontSize: 14 }}>{(row.name?.[0] || '?').toUpperCase()}</Text>
                              </View>
                            )}
                            <Text style={{ flex: 1, color: row.isMe ? C.orange : C.text, fontWeight: row.isMe ? '800' : '600', fontSize: 14 }} numberOfLines={1}>
                              {row.name}{row.isMe ? ' (sen)' : ''}
                            </Text>
                            {!row.isMe && row.id && (() => {
                              const sent = rankSentIds.includes(row.id) || String(row.friendStatus || '').startsWith('sent');
                              const accepted = String(row.friendStatus || '').includes('accepted');
                              const incoming = String(row.friendStatus || '').startsWith('received');
                              if (accepted) return <Ionicons name="checkmark-circle" size={22} color={C.green} />;
                              if (sent) return <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700' }}>İstendi</Text>;
                              if (incoming) return <Text style={{ color: C.lime, fontSize: 11, fontWeight: '700' }}>Sana istek</Text>;
                              return (
                                <TouchableOpacity onPress={() => { sendFriendRequest(row.id); setRankSentIds(prev => [...prev, row.id]); }}
                                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(198,255,61,0.14)', borderWidth: 1, borderColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
                                  <Ionicons name="person-add" size={16} color={C.lime} />
                                </TouchableOpacity>
                              );
                            })()}
                            <Text style={{ color: row.isMe ? C.orange : C.textSec, fontWeight: '800', fontSize: 15, minWidth: 52, textAlign: 'right' }}>{row.best} kg</Text>
                          </View>
                        )) : (
                          <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginVertical: 30 }}>
                            Bu siklette henüz kimse PR girmemiş. İlk sen ol! 💪
                          </Text>
                        )}
                        {leaderboardData.myRank > 20 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12,
                            borderRadius: 12, marginTop: 6, backgroundColor: 'rgba(255,159,28,0.14)', borderWidth: 1, borderColor: C.orange }}>
                            <Text style={{ width: 30, textAlign: 'center', fontSize: 14, fontWeight: '800', color: C.orange }}>#{leaderboardData.myRank}</Text>
                            <Text style={{ flex: 1, color: C.orange, fontWeight: '800', fontSize: 14 }}>Sen</Text>
                            <Text style={{ color: C.orange, fontWeight: '800', fontSize: 15 }}>{leaderboardData.myBest} kg</Text>
                          </View>
                        )}
                      </ScrollView>
                      {leaderboardData.myRank > 0 && (
                        <TouchableOpacity onPress={() => openRankShare(leaderboardLift!)} activeOpacity={0.85}
                          style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                            backgroundColor: C.orange, borderRadius: 16, paddingVertical: 14 }}>
                          <Ionicons name="share-social" size={18} color="#0B0D12" />
                          <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 15 }}>Sıranı Paylaş</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : null}
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ARKADAŞ MEYDAN OKUMASI MODALI */}
      <Modal visible={!!challengeScreen} transparent animationType="slide" onRequestClose={() => { setChallengeScreen(null); setChallengeSharePhoto(null); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <TouchableOpacity onPress={() => { setChallengeScreen(null); setChallengeSharePhoto(null); setChallengeResult(null); }}
              style={{ position: 'absolute', top: 18, right: 18, backgroundColor: C.surface2, borderRadius: 16, padding: 6 }}>
              <Ionicons name="close" size={20} color={C.textMuted} />
            </TouchableOpacity>

            {/* CREATE: sadece hareket seç, kilo yok */}
            {challengeScreen === 'create' && (
              <View>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 6 }}>⚔️ Meydan Okuma Oluştur</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 18 }}>Arkadaşın katıldıktan sonra ikiniz de kiloyu o an girersiniz.</Text>
                <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>HANGİ HAREKET?</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                  {Object.entries(LIFT_LABELS_MAP).map(([key, label]) => (
                    <TouchableOpacity key={key} onPress={() => setChallengeLift(key)}
                      style={{ marginRight: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: challengeLift === key ? C.orange : C.surface2, borderWidth: 1, borderColor: challengeLift === key ? C.orange : C.border }}>
                      <Text style={{ color: challengeLift === key ? '#0B0D12' : C.textSec, fontWeight: '700', fontSize: 13 }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity onPress={createChallenge} activeOpacity={0.85} disabled={loading}
                  style={{ backgroundColor: C.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                  <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 16 }}>{loading ? 'Oluşturuluyor...' : 'Kapışma Oluştur'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* CODE: kodu göster + kopyala + kendi kilonu gir */}
            {challengeScreen === 'code' && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 4 }}>Kapışma Hazır!</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
                  Kodu arkadaşına gönder, o katıldıktan sonra ikiniz de kendi kilonuzu girin.
                </Text>
                <View style={{ backgroundColor: C.surface2, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 36, borderWidth: 2, borderColor: C.orange, marginBottom: 10 }}>
                  <Text style={{ color: C.orange, fontSize: 38, fontWeight: '900', letterSpacing: 6 }}>{challengeCode}</Text>
                </View>
                <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 20 }}>{LIFT_LABELS_MAP[challengeLift]}</Text>
                <TouchableOpacity onPress={() => {
                  const msg = `GymBodyAI'da ${LIFT_LABELS_MAP[challengeLift]} kapışması başlattım! ⚔️\nKatıl → GymBodyAI aç, "Kodu Gir" → ${challengeCode}\nKiloları o an girersiniz, kazanan belli olur!`;
                  Share.share({ message: msg });
                }} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22, marginBottom: 14, borderWidth: 1, borderColor: C.border }}>
                  <Ionicons name="copy-outline" size={16} color={C.textSec} />
                  <Text style={{ color: C.textSec, fontWeight: '700', fontSize: 14 }}>Davet Mesajını Kopyala</Text>
                </TouchableOpacity>

                {/* Challenger kendi kilosunu girer */}
                <View style={{ alignSelf: 'stretch', backgroundColor: C.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.orange + '55' }}>
                  <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>SENİN AĞIRLIĞIN (kg) — rakip beklerken gir</Text>
                  <TextInput value={challengeMyWeight} onChangeText={setChallengeMyWeight} keyboardType="decimal-pad"
                    placeholder="0" placeholderTextColor={C.textMuted}
                    style={{ backgroundColor: C.surface, borderRadius: 10, padding: 12, color: C.text, fontSize: 17, fontWeight: '700', borderWidth: 1, borderColor: C.border, marginBottom: 12 }} />
                  <TouchableOpacity onPress={() => submitChallengeWeight(true)} activeOpacity={0.85} disabled={loading}
                    style={{ backgroundColor: C.orange, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                    <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 15 }}>{loading ? 'Kaydediliyor...' : 'Kilonu Kaydet ⚡'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ACCEPT: kod gir */}
            {challengeScreen === 'accept' && (
              <View>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 6 }}>Kodu Gir</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 18 }}>Sana gönderilen kapışma kodunu buraya yaz.</Text>
                <TextInput value={challengeCodeInput} onChangeText={t => setChallengeCodeInput(t.toUpperCase())}
                  placeholder="ABC123" placeholderTextColor={C.textMuted} autoCapitalize="characters" maxLength={8}
                  style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 14, color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 4, textAlign: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 20 }} />
                <TouchableOpacity onPress={joinChallenge} activeOpacity={0.85} disabled={loading}
                  style={{ backgroundColor: C.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                  <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 16 }}>{loading ? 'Katılıyor...' : 'Katıl ⚔️'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ACCEPT-WEIGHT: katılındı, kilo gir */}
            {challengeScreen === 'accept-weight' && challengeInfo && (
              <View>
                <View style={{ backgroundColor: C.surface2, borderRadius: 14, padding: 16, marginBottom: 18, borderLeftWidth: 3, borderLeftColor: C.orange }}>
                  <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '700' }}>KAPIŞMA BAŞLADI</Text>
                  <Text style={{ color: C.text, fontWeight: '900', fontSize: 17, marginTop: 4 }}>{challengeInfo.liftLabel}</Text>
                  <Text style={{ color: C.orange, fontSize: 16, fontWeight: '700', marginTop: 4 }}>{challengeInfo.challengerName} seni meydan okuyor!</Text>
                </View>
                <Text style={{ color: C.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>SENİN AĞIRLIĞIN (kg)</Text>
                <TextInput value={challengeTheirWeight} onChangeText={setChallengeTheirWeight} keyboardType="decimal-pad"
                  placeholder="0" placeholderTextColor={C.textMuted}
                  style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 14, color: C.text, fontSize: 17, fontWeight: '700', borderWidth: 1, borderColor: C.border, marginBottom: 20 }} />
                <TouchableOpacity onPress={() => submitChallengeWeight(false)} activeOpacity={0.85} disabled={loading}
                  style={{ backgroundColor: C.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                  <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 16 }}>{loading ? 'Kaydediliyor...' : 'Kapış! ⚔️'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* WAITING: rakip bekleniyor */}
            {challengeScreen === 'waiting' && (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>⏳</Text>
                <Text style={{ color: C.text, fontWeight: '900', fontSize: 18, marginBottom: 8 }}>Rakibini Bekliyorsun...</Text>
                <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
                  Rakibin kilosunu girdikten sonra sonucu görebilirsin.
                </Text>
                <TouchableOpacity onPress={checkChallengeResult} activeOpacity={0.85} disabled={loading}
                  style={{ backgroundColor: C.orange, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 36, alignItems: 'center' }}>
                  <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 15 }}>{loading ? 'Kontrol ediliyor...' : 'Sonucu Kontrol Et'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* RESULT: sonuç + paylaşım kartı */}
            {challengeScreen === 'result' && challengeResult && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: challengeResult.iWon ? '#FFD700' : C.textMuted, fontSize: 30, fontWeight: '900', marginBottom: 4 }}>
                  {challengeResult.iWon ? '🏆 KAZANDIN!' : '💪 İyi mücadele!'}
                </Text>
                <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 16 }}>{challengeResult.liftLabel}</Text>

                <ViewShot ref={challengeShareRef} options={{ format: 'jpg', quality: 0.95 }} style={{ overflow: 'hidden' }}>
                  <View style={{ width: 300, height: 380, backgroundColor: '#0B0D12', borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: challengeResult.iWon ? '#FFD70088' : C.orange + '55' }}>
                    {challengeSharePhoto ? (
                      <Image source={{ uri: challengeSharePhoto }} style={{ position: 'absolute', width: 300, height: 380 }} resizeMode="cover" />
                    ) : (
                      <LinearGradient colors={['#1A1205', '#0B0D12']} style={{ position: 'absolute', width: 300, height: 380, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 72, opacity: 0.15 }}>⚔️</Text>
                      </LinearGradient>
                    )}
                    <Text style={{ position: 'absolute', top: 16, left: 18, color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 }}>GYMBODY</Text>
                    <LinearGradient
                      colors={['transparent', 'rgba(11,13,18,0.97)', '#0B0D12']}
                      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 230, justifyContent: 'flex-end', padding: 20 }}
                    >
                      <Text style={{ color: '#A3ABBA', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>KAPIŞMA · {challengeResult.liftLabel.toUpperCase()}</Text>
                      {/* Kazanan üstte */}
                      {(() => {
                        const myBest = challengeResult.iWon
                          ? Math.max(challengeResult.challengerBest, challengeResult.respondentBest)
                          : Math.min(challengeResult.challengerBest, challengeResult.respondentBest);
                        const theirBest = challengeResult.iWon
                          ? Math.min(challengeResult.challengerBest, challengeResult.respondentBest)
                          : Math.max(challengeResult.challengerBest, challengeResult.respondentBest);
                        const myName = user?.name || '';
                        const theirName = myName === challengeResult.challengerName ? challengeResult.respondentName : challengeResult.challengerName;
                        return (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <Text style={{ fontSize: 16 }}>🏆</Text>
                              <Text style={{ color: '#FFD700', fontSize: 20, fontWeight: '900', flex: 1 }}>{challengeResult.iWon ? myName : theirName}</Text>
                              <Text style={{ color: '#FFD700', fontSize: 28, fontWeight: '900' }}>{challengeResult.iWon ? myBest : theirBest} kg</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                              <Text style={{ fontSize: 16, opacity: 0 }}>🏆</Text>
                              <Text style={{ color: C.textSec, fontSize: 16, fontWeight: '700', flex: 1 }}>{challengeResult.iWon ? theirName : myName}</Text>
                              <Text style={{ color: C.textMuted, fontSize: 22, fontWeight: '800' }}>{challengeResult.iWon ? theirBest : myBest} kg</Text>
                            </View>
                          </>
                        );
                      })()}
                      <Text style={{ color: '#6B7384', fontSize: 11 }}>GymBodyAI · gymbodyai.app</Text>
                    </LinearGradient>
                  </View>
                </ViewShot>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <TouchableOpacity onPress={pickChallengePhoto} activeOpacity={0.85}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.surface2, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: C.border }}>
                    <Ionicons name="image" size={17} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{challengeSharePhoto ? 'Değiştir' : 'Foto Seç'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={captureChallengeShare} activeOpacity={0.85}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 14, paddingVertical: 13 }}>
                    <Ionicons name="share-social" size={17} color="#0B0D12" />
                    <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 15 }}>Paylaş</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* SİKLET SIRASI PAYLAŞIM KARTI MODALI */}
      <Modal visible={!!rankShareData} transparent animationType="fade" onRequestClose={() => setRankShareData(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <TouchableOpacity onPress={() => { setRankShareData(null); setRankSharePhoto(null); }} style={{ position: 'absolute', top: insets.top + 16, right: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {rankShareData && (
            <>
              <ViewShot ref={rankShareRef} options={{ format: 'jpg', quality: 0.95 }} style={{ overflow: 'hidden' }}>
                <View style={{ width: 320, height: 420, backgroundColor: '#0B0D12', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.orange + '55' }}>
                  {rankSharePhoto ? (
                    <Image source={{ uri: rankSharePhoto }} style={{ position: 'absolute', width: 320, height: 420 }} resizeMode="cover" />
                  ) : (
                    <LinearGradient colors={['#241A05', '#0B0D12']} style={{ position: 'absolute', width: 320, height: 420, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 96, opacity: 0.9 }}>{rankShareData.icon}</Text>
                    </LinearGradient>
                  )}
                  {/* üst marka */}
                  <Text style={{ position: 'absolute', top: 16, left: 18, color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6 }}>GYMBODY</Text>
                  {/* alt bilgi şeridi (yağ oranı kartı gibi) */}
                  <LinearGradient
                    colors={['transparent', 'rgba(11,13,18,0.92)', '#0B0D12']}
                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 210, justifyContent: 'flex-end', padding: 20 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
                      <Text style={{ color: C.orange, fontSize: 46, fontWeight: '900' }}>#{rankShareData.rank}</Text>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{rankShareData.genderLabel ? `${rankShareData.genderLabel} · ` : ''}{rankShareData.bracket} sikletinde</Text>
                    </View>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 3 }}>{rankShareData.label} · {rankShareData.best} kg</Text>
                    <Text style={{ color: '#A3ABBA', fontSize: 12, marginTop: 1 }}>{rankShareData.total} kişi arasında</Text>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 8 }}>{user?.name || ''} · GymBodyAI</Text>
                    <Text style={{ color: '#6B7384', fontSize: 12 }}>gymbodyai.app</Text>
                  </LinearGradient>
                </View>
              </ViewShot>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
                <TouchableOpacity onPress={pickRankSharePhoto} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 18 }}>
                  <Ionicons name="image" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{rankSharePhoto ? 'Değiştir' : 'Foto Seç'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={captureRankShare} activeOpacity={0.85}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 13 }}>
                  <Ionicons name="share-social" size={18} color="#0B0D12" />
                  <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 15 }}>Paylaş</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* GÜÇ — PAYLAŞIM KARTI MODALI */}
      <Modal visible={!!shareLiftKey} transparent animationType="fade" onRequestClose={() => setShareLiftKey(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <TouchableOpacity onPress={() => setShareLiftKey(null)} style={{ position: 'absolute', top: insets.top + 16, right: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 8 }}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {(() => {
            if (!shareLiftKey) return null;
            const lift = LIFTS.find(l => l.key === shareLiftKey);
            if (!lift) return null;
            const best = user?.lifts?.[shareLiftKey]?.best || 0;
            const { rankIndex, nextWeight, ratio } = computeRank(shareLiftKey, best, user?.weight, user?.gender);
            const rank = rankIndex >= 0 ? RANKS[rankIndex] : RANKS[0];
            return (
              <>
                <ViewShot ref={liftShareRef} options={{ format: 'jpg', quality: 0.95 }}>
                  <View style={{ width: 320, borderRadius: 32, overflow: 'hidden', borderWidth: 1.5, borderColor: rank.color + '66' }}>
                    <LinearGradient colors={[rank.color + '2E', '#0E1118', '#0B0D12']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ paddingVertical: 30, paddingHorizontal: 26, alignItems: 'center' }}>
                      {/* Marka */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="barbell" size={15} color={rank.color} />
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 3 }}>GYMBODY<Text style={{ color: C.lime }}>AI</Text></Text>
                      </View>
                      {/* Rozet + glow */}
                      <View style={{ marginTop: 20, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: rank.color + '20' }} />
                        <View style={{ position: 'absolute', width: 104, height: 104, borderRadius: 52, backgroundColor: rank.color + '18' }} />
                        <RankBadgeSvg rankKey={rank.key} color={rank.color} size={104} />
                      </View>
                      {/* Rank pill */}
                      <View style={{ backgroundColor: rank.color + '22', borderColor: rank.color, borderWidth: 1, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 6 }}>
                        <Text style={{ color: rank.color, fontSize: 22, fontWeight: '900', letterSpacing: 2 }}>{rank.label.toUpperCase()}</Text>
                      </View>
                      {/* Hareket + kilo */}
                      <Text style={{ color: C.textSec, fontSize: 15, fontWeight: '700', marginTop: 22, letterSpacing: 0.5 }}>{lift.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 54, fontWeight: '900', lineHeight: 58 }}>{best}</Text>
                        <Text style={{ color: rank.color, fontSize: 22, fontWeight: '900', marginBottom: 9 }}>kg</Text>
                      </View>
                      <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>Vücut ağırlığının {ratio.toFixed(2)}× katı</Text>
                      {/* Alt bilgi */}
                      {nextWeight ? (
                        <View style={{ marginTop: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16 }}>
                          <Text style={{ color: C.textSec, fontSize: 12 }}>Sonraki rank'a <Text style={{ color: '#fff', fontWeight: '800' }}>{nextWeight - best} kg</Text> kaldı</Text>
                        </View>
                      ) : (
                        <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: rank.color + '22', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16 }}>
                          <Ionicons name="flame" size={15} color={rank.color} />
                          <Text style={{ color: rank.color, fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>EN YÜKSEK RANK</Text>
                        </View>
                      )}
                    </LinearGradient>
                  </View>
                </ViewShot>
                <TouchableOpacity onPress={captureLiftShare} activeOpacity={0.85}
                  style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32 }}>
                  <Ionicons name="share-social" size={18} color="#0B0D12" />
                  <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 15 }}>Paylaş</Text>
                </TouchableOpacity>
              </>
            );
          })()}
        </View>
      </Modal>

      {/* PR KUTLAMA */}
      <Modal visible={!!prCelebration} transparent animationType="fade" onRequestClose={() => setPrCelebration(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          {/* Konfeti parçaları */}
          {prCelebration && (() => {
            const COLORS = [C.orange, '#FFD700', '#4CAF50', '#FF6B6B', '#9B6BFF', '#5BC8E0', '#fff'];
            return Array.from({ length: 28 }).map((_, i) => {
              const leftPct = (i * 37 + 7) % 100;
              const delay = (i * 120) % 1800;
              const color = COLORS[i % COLORS.length];
              return (
                <RNAnimated.View key={i} style={{
                  position: 'absolute', top: -20, left: `${leftPct}%`,
                  width: 8 + (i % 5), height: 8 + (i % 4),
                  backgroundColor: color, borderRadius: i % 3 === 0 ? 4 : 2,
                  opacity: 0.9,
                  transform: [{ translateY: (() => {
                    const a = new RNAnimated.Value(0);
                    RNAnimated.loop(RNAnimated.timing(a, { toValue: 1, duration: 1800 + (i * 80) % 700, delay, useNativeDriver: true })).start();
                    return a.interpolate({ inputRange: [0, 1], outputRange: [-20, 900] });
                  })() }],
                }} />
              );
            });
          })()}

          <TouchableOpacity onPress={() => setPrCelebration(null)}
            style={{ position: 'absolute', top: (insets.top || 0) + 16, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8 }}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          {prCelebration && (() => {
            const lift = LIFTS.find(l => l.key === prCelebration.lift);
            return (
              <View style={{ alignItems: 'center', width: '100%' }}>
                <Text style={{ fontSize: 56, marginBottom: 8 }}>🏆</Text>
                <Text style={{ color: '#FFD700', fontSize: 32, fontWeight: '900', textAlign: 'center' }}>YENİ KİŞİSEL REKOR!</Text>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 6, marginBottom: 20 }}>{lift?.label}</Text>

                <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 24, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: C.orange + '66' }}>
                  <Text style={{ color: C.orange, fontSize: 60, fontWeight: '900' }}>{prCelebration.weight} <Text style={{ fontSize: 24, color: C.textSec }}>kg</Text></Text>
                  {prCelebration.prevBest > 0 && (
                    <Text style={{ color: C.textMuted, fontSize: 14, marginTop: 4 }}>
                      Önceki: {prCelebration.prevBest} kg → +{(prCelebration.weight - prCelebration.prevBest).toFixed(1)} kg
                    </Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
                  <TouchableOpacity onPress={() => { setPrCelebration(null); setShareLiftKey(prCelebration.lift); }}
                    activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.orange, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24 }}>
                    <Ionicons name="share-social" size={18} color="#0B0D12" />
                    <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 15 }}>Paylaş</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPrCelebration(null)}
                    activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Tamam</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ARKADAŞLAR MODALI */}
      <Modal visible={friendsVisible} transparent animationType="slide" onRequestClose={() => { setFriendsVisible(false); closeChat(); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
            {/* CHAT ekranı */}
            {chatFriend ? (
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <TouchableOpacity onPress={closeChat} style={{ marginRight: 12 }}>
                    <Ionicons name="chevron-back" size={24} color={C.orange} />
                  </TouchableOpacity>
                  <Text style={{ color: C.text, fontWeight: '900', fontSize: 17, flex: 1 }}>{chatFriend.name}</Text>
                  <TouchableOpacity onPress={() => openModerationMenu(chatFriend)} style={{ marginRight: 14 }}>
                    <Ionicons name="ellipsis-horizontal" size={22} color={C.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setFriendsVisible(false); closeChat(); }}>
                    <Ionicons name="close" size={22} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 8 }}>
                  {friendMessages.length === 0 && (
                    <Text style={{ color: C.textMuted, textAlign: 'center', marginTop: 32, fontSize: 14 }}>Henüz mesaj yok. Merhaba de! 👋</Text>
                  )}
                  {friendMessages.map((msg, i) => {
                    const isMe = msg.senderId === user?._id;
                    return (
                      <View key={msg._id || i} style={{ flexDirection: 'row', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                        <View style={{ maxWidth: '75%', backgroundColor: isMe ? C.orange : C.surface2, borderRadius: 16, borderBottomRightRadius: isMe ? 4 : 16, borderBottomLeftRadius: isMe ? 16 : 4, paddingVertical: 10, paddingHorizontal: 14 }}>
                          <Text style={{ color: isMe ? '#0B0D12' : C.text, fontSize: 15 }}>{msg.text}</Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: C.border, gap: 8 }}>
                  <TextInput value={friendChatInput} onChangeText={setFriendChatInput} placeholder="Mesaj yaz..." placeholderTextColor={C.textMuted}
                    style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border }} />
                  <TouchableOpacity onPress={sendMessage} disabled={!friendChatInput.trim()}
                    style={{ backgroundColor: friendChatInput.trim() ? C.orange : C.surface2, borderRadius: 20, padding: 10 }}>
                    <Ionicons name="send" size={20} color={friendChatInput.trim() ? '#0B0D12' : C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* ARKADAŞ LİSTESİ ekranı */
              <View style={{ padding: 20, paddingBottom: Math.max(insets.bottom, 20) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: C.text, fontWeight: '900', fontSize: 20, flex: 1 }}>Arkadaşlar</Text>
                  <TouchableOpacity onPress={() => setFriendsVisible(false)}>
                    <Ionicons name="close" size={22} color={C.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Arama */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, marginBottom: 16, borderWidth: 1, borderColor: C.border }}>
                  <Ionicons name="search" size={16} color={C.textMuted} />
                  <TextInput value={friendSearch} onChangeText={searchFriends} placeholder="İsimle ara..." placeholderTextColor={C.textMuted}
                    style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 8, color: C.text, fontSize: 14 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                  {/* Arama sonuçları */}
                  {friendSearchResults.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>SONUÇLAR</Text>
                      {friendSearchResults.map(u => (
                        <View key={u._id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.orange + '33', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Text style={{ color: C.orange, fontWeight: '900', fontSize: 15 }}>{u.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <Text style={{ color: C.text, fontSize: 15, flex: 1 }}>{u.name}</Text>
                          {u.friendStatus === 'none' ? (
                            <TouchableOpacity onPress={() => sendFriendRequest(u._id)}
                              style={{ backgroundColor: C.orange, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14 }}>
                              <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 13 }}>Ekle</Text>
                            </TouchableOpacity>
                          ) : u.friendStatus.includes('sent') ? (
                            <Text style={{ color: C.textMuted, fontSize: 12 }}>İstek gönderildi</Text>
                          ) : u.friendStatus.includes('accepted') ? (
                            <Text style={{ color: C.lime, fontSize: 12 }}>Arkadaş ✓</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Gelen istekler */}
                  {friendRequests.length > 0 && friendSearchResults.length === 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>GELEN İSTEKLER ({friendRequests.length})</Text>
                      {friendRequests.map(r => (
                        <View key={r._id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Text style={{ color: C.text, fontWeight: '900', fontSize: 15 }}>{r.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <Text style={{ color: C.text, fontSize: 15, flex: 1 }}>{r.name}</Text>
                          <TouchableOpacity onPress={() => acceptFriendRequest(r._id)}
                            style={{ backgroundColor: C.orange, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14 }}>
                            <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 13 }}>Kabul Et</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Arkadaş listesi */}
                  {friends.length === 0 && friendSearchResults.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                      <Text style={{ fontSize: 40, marginBottom: 10 }}>👥</Text>
                      <Text style={{ color: C.textMuted, fontSize: 14, textAlign: 'center' }}>Henüz arkadaşın yok. Yukarıdan ara ve ekle!</Text>
                    </View>
                  ) : friendSearchResults.length === 0 && (
                    <>
                      <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>ARKADAŞLARIM ({friends.length})</Text>
                      {friends.map(f => (
                        <TouchableOpacity key={f._id} onPress={() => openChat(f)}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
                          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.orange + '33', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Text style={{ color: C.orange, fontWeight: '900', fontSize: 16 }}>{f.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <Text style={{ color: C.text, fontSize: 15, flex: 1, fontWeight: '600' }}>{f.name}</Text>
                          {f.unread > 0 && (
                            <View style={{ backgroundColor: C.orange, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                              <Text style={{ color: '#0B0D12', fontWeight: '900', fontSize: 11 }}>{f.unread}</Text>
                            </View>
                          )}
                          <Ionicons name="chevron-forward" size={16} color={C.textMuted} style={{ marginLeft: 6 }} />
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* TOAST */}
      {toast && (
        <View style={{ position: 'absolute', bottom: 90 + (insets.bottom || 0), left: 16, right: 16, zIndex: 999,
          backgroundColor: toast.type === 'error' ? 'rgba(255,60,60,0.95)' : 'rgba(30,30,40,0.97)',
          borderRadius: 16, paddingVertical: 13, paddingHorizontal: 18,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          borderWidth: 1, borderColor: toast.type === 'error' ? 'rgba(255,80,80,0.4)' : 'rgba(255,159,28,0.3)',
          shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 20 }}>
          <Ionicons name={toast.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={20} color={toast.type === 'error' ? '#ff6b6b' : C.orange} />
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 }}>{toast.msg}</Text>
        </View>
      )}

      {/* ALT TAB BAR */}
      <View style={[styles.tabBarOuter, { paddingBottom: (insets.bottom || 8) + 4 }]}>
        {TABS.map((t) => {
          const active = currentTab === t.key;
          if (t.gym) {
            return (
              <TouchableOpacity key={t.key} activeOpacity={0.85} style={styles.gymTabBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCurrentTab(t.key); }}>
                <LinearGradient
                  colors={active ? [C.orange, '#E07800'] : ['#252525', '#1C1C1C']}
                  style={styles.gymTabCircle}
                >
                  <Ionicons name={t.icon} size={26} color={active ? '#0B0D12' : C.orange} />
                </LinearGradient>
                <Text style={[styles.tabBtnText, { marginTop: 4 }, active && { color: C.orange, fontWeight: '700' }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity key={t.key} activeOpacity={0.85} style={styles.tabBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCurrentTab(t.key); }}>
              {active && <View style={styles.tabActivePill} />}
              <View>
                <Ionicons name={t.icon} size={22} color={active ? C.orange : C.textSec} />
                {t.key === 'pt' && coachData.unread > 0 && (
                  <View style={{ position: 'absolute', top: -5, right: -9, backgroundColor: '#EF4444', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: C.bg }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{coachData.unread > 9 ? '9+' : coachData.unread}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabBtnText, active && { color: C.orange, fontWeight: '700' }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

    </View>
  );
}
const chartConfig = {
  backgroundGradientFrom: C.surface,
  backgroundGradientTo: C.surface,
  decimalPlaces: 1,
  color: (o = 1) => `rgba(198, 255, 61, ${o})`,
  labelColor: () => C.textSec,
  style: { borderRadius: 12 },
  propsForBackgroundLines: { stroke: C.border },
  propsForDots: { r: '4', strokeWidth: '2', stroke: C.lime }
};
const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },

  // ---- AUTH ----
  authRoot: { flex: 1, backgroundColor: C.bg },
  authScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 60 },
  logoBadge: {
    width: 76, height: 76, borderRadius: 24, alignSelf: 'center',
    justifyContent: 'center', alignItems: 'center', marginBottom: 22,
    shadowColor: C.lime, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  authBrand: { fontSize: 30, fontWeight: '900', textAlign: 'center', color: C.text, letterSpacing: 1 },
  authTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: C.text, marginTop: 18 },
  authSubtitle: { fontSize: 14, textAlign: 'center', color: C.textSec, marginTop: 6, marginBottom: 26, lineHeight: 20 },
  authCard: {
    backgroundColor: C.surface, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: C.border,
  },
  //TOKEN & STREAK KARTLARI
  tokenCardRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  tokenCard: { flex: 1, backgroundColor: C.surface, borderRadius: 16, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  tokenValue: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 3 },
  tokenLabel: { fontSize: 10.5, color: C.textMuted, marginTop: 1 },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.surface2, borderRadius: 14, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 14, marginBottom: 13,
    },
    inputIcon: { marginRight: 10 },
    inputWithIcon: { flex: 1, paddingVertical: 15, fontSize: 15, color: C.text },

    switchText: { textAlign: 'center', color: C.textSec, fontSize: 14 },

  // ---- BUTTONS ----
  primaryBtn: {
    flexDirection: 'row', gap: 8, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
    shadowColor: C.lime, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  primaryBtnText: { color: '#0B0D12', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },

  miniBtn: { flex: 0.48, flexDirection: 'row', gap: 6, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  miniBtnPrimary: { backgroundColor: C.lime },
  miniBtnPrimaryText: { color: '#0B0D12', fontWeight: '800', fontSize: 14 },
  miniBtnGhost: { backgroundColor: 'rgba(255,90,82,0.12)', borderWidth: 1, borderColor: 'rgba(255,90,82,0.4)' },
  miniBtnGhostText: { color: C.red, fontWeight: '700', fontSize: 14 },

  // ---- TOP BAR ----
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  topGreeting: { color: C.textSec, fontSize: 13 },
  topName: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    shadowColor: C.lime, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  avatarText: { color: '#0B0D12', fontWeight: '900', fontSize: 18 },

  // ---- BOTTOM TAB BAR ----
  tabBarOuter: {
    flexDirection: 'row', alignItems: 'flex-end',
    marginHorizontal: -16, paddingHorizontal: 8, paddingTop: 8,
    backgroundColor: '#0A0A12',
    borderTopWidth: 1, borderTopColor: 'rgba(255,159,28,0.18)',
    shadowColor: '#FF9F1C', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 30,
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6, gap: 3, minHeight: 56 },
  tabActivePill: { position: 'absolute', top: 0, width: 28, height: 3, borderRadius: 2, backgroundColor: C.orange },
  tabBtnText: { fontSize: 10, fontWeight: '600', color: C.textSec },
  gymTabBtn: { flex: 1.3, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6, gap: 3 },
  gymTabCircle: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    shadowColor: C.orange, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 12,
  },

  // ---- UPLOAD ----
  uploadCard: { marginBottom: 16 },
  dashedUpload: {
    backgroundColor: C.surface, borderRadius: 18, paddingVertical: 28, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
  },
  uploadIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(198,255,61,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  uploadTitle: { color: C.text, fontWeight: '700', fontSize: 16 },
  uploadHint: { color: C.textMuted, fontSize: 12.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
  preview: { width: '100%', height: 220, borderRadius: 14, marginBottom: 12 },
  noteInput: { backgroundColor: C.surface2, padding: 14, borderRadius: 12, minHeight: 52, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14 },

  // ---- GALLERY ----
  galleryCard: { backgroundColor: C.surface, borderRadius: 20, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  galleryImg: { width: '100%', height: 320 },
  galleryInfo: { padding: 14 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  noteText: { fontSize: 15, color: C.text, marginTop: 8, lineHeight: 21 },
  analysisBox: { backgroundColor: C.surface2, borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: C.border },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  analysisFat: { fontSize: 14, fontWeight: '800', color: C.lime },
  analysisText: { fontSize: 13, color: C.textSec, lineHeight: 19 },
  deleteBtn: { marginTop: 12, flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,90,82,0.1)', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,90,82,0.25)' },
  deleteBtnText: { color: C.red, fontWeight: '700', fontSize: 13 },

  // ---- EMPTY ----
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptyText: { color: C.textMuted, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  // ---- GYMBODY ----
  gymLockCard: { width: '100%', borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#3A2E66' },
  gymLockTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 12 },
  gymLockSubtitle: { fontSize: 14, color: C.textSec, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  gymLockStats: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  gymLockStatItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gymLockStatText: { color: C.text, fontWeight: '700', fontSize: 13 },
  gymDayCard: { backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  gymDayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  gymDayTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  gymFocusBadge: { backgroundColor: 'rgba(183,156,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#3A2E66' },
  gymFocusText: { color: '#FF9F1C', fontSize: 12, fontWeight: '700' },
  restDayCard: {
    borderRadius: 24, padding: 28, marginBottom: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A1F60',
  },
  restMoonCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(183,156,255,0.12)', borderWidth: 1, borderColor: '#3A2E66',
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  restDayTitle: { fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 12 },
  restDayQuote: {
    fontSize: 13.5, color: C.textSec, textAlign: 'center', lineHeight: 21,
    fontStyle: 'italic', paddingHorizontal: 8, marginBottom: 24,
  },
  restNextCard: {
    width: '100%', backgroundColor: 'rgba(183,156,255,0.08)',
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#3A2E66', marginBottom: 24,
  },
  restNextLabel: { fontSize: 10, fontWeight: '800', color: '#FF9F1C', letterSpacing: 1.5 },
  restNextFocus: { fontSize: 16, fontWeight: '800', color: C.text },
  restNextCount: { fontSize: 12, color: C.textMuted, marginTop: 4 },
  restBackBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 24,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(183,156,255,0.3)',
    backgroundColor: 'rgba(183,156,255,0.07)',
  },
  restBackBtnText: { color: '#FF9F1C', fontWeight: '700', fontSize: 14 },
  restPromptCard: {
    backgroundColor: C.surface, borderRadius: 22, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#3A2E66', alignItems: 'center',
  },
  restPromptTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 4 },
  restPromptSub: { fontSize: 13, color: C.textMuted, marginBottom: 18 },
  restPromptBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  restPromptYes: {
    flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2,
  },
  restPromptYesText: { color: C.textSec, fontWeight: '700', fontSize: 13 },
  restPromptNo: {
    flex: 1.4, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, backgroundColor: '#FF9F1C',
  },
  restPromptNoText: { color: '#1A1235', fontWeight: '800', fontSize: 13 },
  gymExerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  gymExerciseName: { fontSize: 14, fontWeight: '700', color: C.text },
  gymExerciseSets: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  gymMealRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  gymMealName: { fontSize: 13, fontWeight: '800', color: '#FF9F1C' },
  gymMealItems: { fontSize: 13, color: C.text, marginTop: 3, lineHeight: 19 },
  gymMealCal: { fontSize: 12, color: C.textMuted, marginTop: 3 },
  dayBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  dayBtnActive: { backgroundColor: '#FF9F1C', borderColor: '#FF9F1C' },
  dayBtnText: { fontSize: 18, fontWeight: '800', color: C.text },
  dayBtnTextActive: { color: '#1A1235' },
  dayBtnLabel: { fontSize: 10, color: C.textMuted, marginTop: 2 },

  // ---- MEAL ----
  mealHeaderCard: { borderRadius: 22, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  mealIconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,159,28,0.14)', justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    shadowColor: C.orange, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  mealTitle: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  mealSubtitle: { fontSize: 13, color: C.textSec, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 10 },
  rightsPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,159,28,0.12)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 10 },
  rightsText: { color: C.textSec, fontSize: 12.5 },
  scanBtn: { flexDirection: 'row', gap: 8, backgroundColor: C.orange, paddingVertical: 13, paddingHorizontal: 30, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12, alignSelf: 'stretch',
    shadowColor: C.orange, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  scanBtnText: { color: '#0B0D12', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  loaderBox: { marginVertical: 36, alignItems: 'center' },
  loaderText: { marginTop: 14, color: C.textSec, fontStyle: 'italic', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
  resultCard: { backgroundColor: C.surface, borderRadius: 22, padding: 18, marginBottom: 30, borderWidth: 1, borderColor: C.border },
  mealPreviewImg: { width: '100%', height: 190, borderRadius: 14, marginBottom: 14 },
  resultMealName: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },
  resultDesc: { fontSize: 13.5, color: C.textSec, textAlign: 'center', marginVertical: 10, lineHeight: 20 },
  calorieBadge: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginVertical: 14, borderWidth: 1, borderColor: 'rgba(255,159,28,0.3)' },
  calorieNum: { fontSize: 30, fontWeight: '900', color: C.orange },
  calorieLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1 },
  macroContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 },
  macroBox: { alignItems: 'center', flex: 1 },
  macroDivider: { width: 1, height: 34, backgroundColor: C.border },
  macroVal: { fontSize: 19, fontWeight: '800' },
  macroLabel2: { fontSize: 12, color: C.textMuted, marginTop: 3 },

  // ---- STATS ----
  statsCard: { backgroundColor: C.surface, borderRadius: 20, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  statsTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 10 },
  statsSubtitle: { fontSize: 12.5, color: C.textMuted, marginBottom: 10, lineHeight: 17 },
  statsEmptyText: { fontSize: 13.5, color: C.textMuted, textAlign: 'center', paddingVertical: 6, lineHeight: 20 },
  input: { backgroundColor: C.surface2, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10, fontSize: 15, color: C.text },
  vipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageIndicator: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16, marginTop: -4 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  pageDotActive: { backgroundColor: C.lime, width: 18 },

  // ---- PROFILE ----
  profileHero: { alignItems: 'center', paddingVertical: 18, marginBottom: 8 },
  profileAvatar: { width: 88, height: 88, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 14, shadowColor: C.lime, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  profileAvatarText: { color: '#0B0D12', fontWeight: '900', fontSize: 34 },
  profileName: { fontSize: 23, fontWeight: '800', color: C.text },
  profileEmail: { fontSize: 13.5, color: C.textMuted, marginTop: 4 },
  statCardsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statMiniCard: { flex: 1, backgroundColor: C.surface, borderRadius: 16, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statMiniValue: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 8 },
  statMiniLabel: { fontSize: 11.5, color: C.textMuted, marginTop: 3 },
  editBtn: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(198,255,61,0.1)', paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(198,255,61,0.3)' },
  editBtnText: { color: C.lime, fontWeight: '700', fontSize: 15 },
  profileCard: { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border },
  logoutBtn: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(255,90,82,0.1)', paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,90,82,0.25)' },
  logoutText: { color: C.red, fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },

  // ---- KALORİ TAKİP / HEDEFLER ----
  calTodayRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  calTodayNum: { fontSize: 32, fontWeight: '900', color: C.text },
  calTodayUnit: { fontSize: 15, fontWeight: '600', color: C.textMuted },
  calTodayTarget: { fontSize: 12.5, color: C.textSec, marginBottom: 6 },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: C.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: C.lime },
  genderRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  genderBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  genderBtnActive: { backgroundColor: C.lime, borderColor: C.lime },
  genderText: { color: C.textSec, fontWeight: '700', fontSize: 14 },
  genderTextActive: { color: '#0B0D12' },
  bmrResult: { backgroundColor: C.surface2, borderRadius: 14, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border },
  bmrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  bmrLabel: { fontSize: 13.5, color: C.textSec },
  bmrVal: { fontSize: 15, fontWeight: '700', color: C.text },
  bmrHighlight: { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 11 },
  bmrNote: { fontSize: 12.5, color: C.textMuted, marginTop: 8, lineHeight: 18 },
  mealLogRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  mealLogName: { fontSize: 15, fontWeight: '700', color: C.text },
  mealLogDate: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  mealLogMacros: { flexDirection: 'row', gap: 12, marginTop: 6 },
  mealLogMacro: { fontSize: 12.5, fontWeight: '700' },
  mealLogCalBox: { alignItems: 'center', marginLeft: 12, backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  mealLogCal: { fontSize: 17, fontWeight: '800', color: C.orange },
  mealLogCalUnit: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
});
