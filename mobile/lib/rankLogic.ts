// ======================= GÜÇ SIRALAMASI (STRENGTH RANK) =======================
// Saf hesaplama mantığı — React/RN'e bağımlı değil, bu yüzden ayrı bir modülde ve test edilebilir.
// NOT: backend/index.js ve backend/views/coach.html içinde bu mantığın kopyaları var (ayrı
// runtime'lar, paylaşılan modül kuramıyorlar) — biri değişirse üçü de güncellenmeli.

// muscleKey: MuscleBodyMap bileşenindeki kas bölgesi anahtarı (bkz. mobile/components/MuscleBodyMap.tsx)
// unit: 'tekrar' ise ağırlık değil tekrar sayısı kaydedilir (rank hesabı vücut ağırlığına bölünmez)
// libraryName: backend ExerciseGif koleksiyonundaki tam isim (gif eşleşmesi için)
export type Lift = {
  key: string;
  label: string;
  icon: string;
  muscle: string;
  muscleKey: string;
  libraryName: string;
  unit?: 'tekrar';
  hint?: string;
};

export const LIFTS: readonly Lift[] = [
  { key: 'bench',    label: 'Bench Press',  icon: '🏋️', muscle: 'Göğüs', muscleKey: 'gogus', libraryName: 'Bench Press' },
  { key: 'squat',    label: 'Barbell Squat', icon: '🦵', muscle: 'Bacak', muscleKey: 'kuad', libraryName: 'Barbell Squat' },
  { key: 'deadlift', label: 'Deadlift',     icon: '🔩', muscle: 'Bel', muscleKey: 'bel', libraryName: 'Deadlift' },
  { key: 'ohp',      label: 'Shoulder Press', icon: '💪', muscle: 'Omuz', muscleKey: 'omuz', libraryName: 'Barbell Shoulder Press' },
  { key: 'latpull',  label: 'Lat Pull Down',icon: '🦅', muscle: 'Sırt', muscleKey: 'sirt', libraryName: 'Lat Pulldown' },
  { key: 'curl',     label: 'Barbell Curl', icon: '💥', muscle: 'Biceps', muscleKey: 'biceps', libraryName: 'Barbell Curl' },
  { key: 'lateral',  label: 'Lateral Raise', icon: '🦾', muscle: 'Omuz', muscleKey: 'omuz', hint: 'Tek dumbbell / cable ağırlığı', libraryName: 'Dumbbell Lateral Raise' },

  { key: 'inclinebench', label: 'Incline Bench Press', icon: '📐', muscle: 'Göğüs', muscleKey: 'gogus', libraryName: 'Barbell Incline Bench Press - Medium Grip' },
  { key: 'cablecrossover', label: 'Cable Crossover', icon: '✖️', muscle: 'Göğüs', muscleKey: 'gogus', libraryName: 'Cable Crossover' },
  { key: 'dumbbellcurl', label: 'Dumbbell Biceps Curl', icon: '💪', muscle: 'Biceps', muscleKey: 'biceps', hint: 'Tek dumbbell ağırlığı', libraryName: 'Dumbbell Bicep Curl' },
  { key: 'hammercurl', label: 'Hammer Curl', icon: '🔨', muscle: 'Biceps', muscleKey: 'biceps', hint: 'Tek dumbbell ağırlığı', libraryName: 'Hammer Curls' },
  { key: 'reversecurl', label: 'Reverse Curl', icon: '🔁', muscle: 'Ön Kol', muscleKey: 'onkol', libraryName: 'Reverse Barbell Curl' },
  { key: 'cablecrunch', label: 'Cable Crunch', icon: '🔻', muscle: 'Karın', muscleKey: 'karin', libraryName: 'Cable Crunch' },
  { key: 'situp', label: 'Sit-Up', icon: '🔺', muscle: 'Karın', muscleKey: 'karin', unit: 'tekrar', libraryName: '3/4 Sit-Up' },
  { key: 'legext', label: 'Leg Extension', icon: '🦿', muscle: 'Bacak', muscleKey: 'kuad', libraryName: 'Leg Extension' },
  { key: 'tricepext', label: 'Cable Tricep Extension', icon: '💢', muscle: 'Triceps', muscleKey: 'triceps', hint: 'Tek taraf (tek kol) ağırlığı', libraryName: 'Cable One Arm Tricep Extension' },
  { key: 'triceppushdown', label: 'Tricep Pushdown', icon: '⬇️', muscle: 'Triceps', muscleKey: 'triceps', libraryName: 'Tricep Pushdown' },
  { key: 'seatedrow', label: 'Seated Cable Row', icon: '🚣', muscle: 'Sırt', muscleKey: 'sirt', libraryName: 'Seated Cable Row' },
  { key: 'barbellrow', label: 'Barbell Row', icon: '🎣', muscle: 'Sırt', muscleKey: 'sirt', libraryName: 'Bent Over Barbell Row' },
  { key: 'shrug', label: 'Barbell Shrug', icon: '🎽', muscle: 'Trapez', muscleKey: 'trapez', libraryName: 'Barbell Shrug' },
  { key: 'hipthrust', label: 'Hip Thrust', icon: '🍑', muscle: 'Kalça', muscleKey: 'kalca', libraryName: 'Barbell Hip Thrust' },
  { key: 'glutebridge', label: 'Glute Bridge', icon: '🌉', muscle: 'Kalça', muscleKey: 'kalca', libraryName: 'Barbell Glute Bridge' },
  { key: 'rdl', label: 'Romanian Deadlift', icon: '🦵', muscle: 'Arka Bacak', muscleKey: 'arkabacak', libraryName: 'Romanian Deadlift' },
  { key: 'legcurl', label: 'Leg Curl', icon: '🦿', muscle: 'Arka Bacak', muscleKey: 'arkabacak', libraryName: 'Leg Curl' },
  { key: 'calfraise', label: 'Calf Raise', icon: '🦶', muscle: 'Kalf', muscleKey: 'kalf', hint: 'Tek dumbbell ağırlığı', libraryName: 'Calf Raises' },
];

// tekrar-bazlı (kg değil) hareketler — computeRank'ta vücut ağırlığına bölünmez
export const REP_BASED_LIFTS = new Set(['situp']);

import { TIER_THEMES } from './tierTheme';
export const RANKS = [
  { key: 'bronz',  label: 'Bronz',  emoji: '🥉', color: TIER_THEMES.bronz.primaryColor },
  { key: 'gumus',  label: 'Gümüş',  emoji: '⚪', color: TIER_THEMES.gumus.primaryColor },
  { key: 'altin',  label: 'Altın',  emoji: '🥇', color: TIER_THEMES.altin.primaryColor },
  { key: 'platin', label: 'Platin', emoji: '💠', color: TIER_THEMES.platin.primaryColor },
  { key: 'elmas',  label: 'Elmas',  emoji: '💎', color: TIER_THEMES.elmas.primaryColor },
  { key: 'efsane', label: 'Efsane', emoji: '🔥', color: TIER_THEMES.efsane.primaryColor },
] as const;

// 95 kg erkek referansına göre kalibre edilmiş eşikler / vücut ağırlığı.
// Alt sınıfların dağılımı ve kadın/erkek oranları korunur; Sit-Up doğrudan tekrar sayısıdır.
// Özel hareketlerde son değer rank puanıdır; Efsane ayrıca kişiye göre tekrar şartı arar.
export const STD: Record<string, { erkek: number[]; kadin: number[] }> = {
  bench: { erkek: [41.5 / 95, 62.5 / 95, 83.5 / 95, 104 / 95, 125 / 95, 150 / 95], kadin: [25 / 95, 37.5 / 95, 50 / 95, 66.5 / 95, 83.5 / 95, 100 / 95] },
  squat: { erkek: [69 / 95, 92.5 / 95, 138.5 / 95, 161.5 / 95, 207.5 / 95, 240 / 95], kadin: [46 / 95, 69.5 / 95, 92.5 / 95, 115.5 / 95, 147.5 / 95, 175.5 / 95] },
  deadlift: { erkek: [97 / 95, 121 / 95, 169.5 / 95, 217.5 / 95, 266 / 95, 300 / 95], kadin: [58 / 95, 87 / 95, 121 / 95, 154.5 / 95, 193.5 / 95, 222.5 / 95] },
  ohp: { erkek: [42.5 / 95, 61 / 95, 79 / 95, 97.5 / 95, 121.5 / 95, 140 / 95], kadin: [24.5 / 95, 36.5 / 95, 54.5 / 95, 67 / 95, 85 / 95, 103.5 / 95] },
  latpull: { erkek: [41.5 / 95, 54 / 95, 66.5 / 95, 83.5 / 95, 100 / 95, 140 / 95], kadin: [25 / 95, 37.5 / 95, 50 / 95, 62.5 / 95, 75 / 95, 105 / 95] },
  curl: { erkek: [22 / 95, 31 / 95, 40 / 95, 53.5 / 95, 66.5 / 95, 80 / 95], kadin: [13 / 95, 19.5 / 95, 26.5 / 95, 35.5 / 95, 44.5 / 95, 53.5 / 95] },
  lateral: { erkek: [7 / 95, 11 / 95, 14.5 / 95, 19 / 95, 24 / 95, 30 / 95], kadin: [4.5 / 95, 7.5 / 95, 11 / 95, 14 / 95, 18 / 95, 21.5 / 95] },
  inclinebench: { erkek: [37.5 / 95, 56 / 95, 79.5 / 95, 98 / 95, 116.5 / 95, 140 / 95], kadin: [23.5 / 95, 35.5 / 95, 51.5 / 95, 65.5 / 95, 79 / 95, 93.5 / 95] },
  cablecrossover: { erkek: [21 / 95, 34.5 / 95, 48.5 / 95, 62.5 / 95, 76 / 95, 90 / 95], kadin: [14 / 95, 22 / 95, 30.5 / 95, 40.5 / 95, 49.5 / 95, 59.5 / 95] },
  dumbbellcurl: { erkek: [10 / 95, 15 / 95, 20 / 95, 26.5 / 95, 33.5 / 95, 40 / 95], kadin: [6.5 / 95, 9 / 95, 13.5 / 95, 16.5 / 95, 21 / 95, 25 / 95] },
  hammercurl: { erkek: [13 / 95, 19 / 95, 26 / 95, 34 / 95, 42 / 95, 50 / 95], kadin: [8 / 95, 12 / 95, 17 / 95, 21 / 95, 26 / 95, 31 / 95] },
  reversecurl: { erkek: [12.5 / 95, 18.5 / 95, 25 / 95, 33.5 / 95, 41.5 / 95, 50 / 95], kadin: [8.5 / 95, 12 / 95, 16 / 95, 21 / 95, 25.5 / 95, 31 / 95] },
  cablecrunch: { erkek: [30 / 95, 45 / 95, 60 / 95, 80 / 95, 100 / 95, 140 / 95], kadin: [20 / 95, 30 / 95, 40 / 95, 52 / 95, 65 / 95, 91 / 95] },
  situp: { erkek: [15, 25, 40, 60, 80, 100], kadin: [12, 20, 32, 48, 65, 85] },
  legext: { erkek: [35.5 / 95, 53 / 95, 75 / 95, 97 / 95, 123.5 / 95, 150 / 95], kadin: [25 / 95, 37 / 95, 53 / 95, 69 / 95, 88 / 95, 106 / 95] },
  tricepext: { erkek: [12 / 95, 18.5 / 95, 24.5 / 95, 33 / 95, 41.5 / 95, 50 / 95], kadin: [7 / 95, 11 / 95, 16 / 95, 21 / 95, 25.5 / 95, 31.5 / 95] },
  triceppushdown: { erkek: [29.5 / 95, 44.5 / 95, 61 / 95, 80 / 95, 100 / 95, 140 / 95], kadin: [19 / 95, 28 / 95, 38.5 / 95, 50.5 / 95, 63.5 / 95, 88.9 / 95] },
  seatedrow: { erkek: [35.5 / 95, 50 / 95, 64.5 / 95, 82 / 95, 100 / 95, 140 / 95], kadin: [22.5 / 95, 32 / 95, 43 / 95, 55 / 95, 67 / 95, 93.8 / 95] },
  barbellrow: { erkek: [32 / 95, 46.5 / 95, 64.5 / 95, 82 / 95, 100 / 95, 140 / 95], kadin: [20 / 95, 29.5 / 95, 41 / 95, 52 / 95, 63.5 / 95, 88.9 / 95] },
  shrug: { erkek: [30 / 95, 40 / 95, 60 / 95, 80 / 95, 100 / 95, 140 / 95], kadin: [20 / 95, 26 / 95, 40 / 95, 54 / 95, 68 / 95, 95.2 / 95] },
  hipthrust: { erkek: [60.5 / 95, 88.5 / 95, 129 / 95, 169.5 / 95, 209.5 / 95, 250 / 95], kadin: [48.5 / 95, 72.5 / 95, 109 / 95, 145.5 / 95, 185.5 / 95, 226 / 95] },
  glutebridge: { erkek: [52 / 95, 76 / 95, 112 / 95, 148 / 95, 184 / 95, 220 / 95], kadin: [40 / 95, 60 / 95, 92 / 95, 124 / 95, 156 / 95, 192 / 95] },
  rdl: { erkek: [63.5 / 95, 84.5 / 95, 118.5 / 95, 152.5 / 95, 186 / 95, 220 / 95], kadin: [38 / 95, 57.5 / 95, 80.5 / 95, 106 / 95, 131 / 95, 156.5 / 95] },
  legcurl: { erkek: [30 / 95, 45 / 95, 60 / 95, 80 / 95, 100 / 95, 140 / 95], kadin: [20 / 95, 30 / 95, 42 / 95, 55 / 95, 68 / 95, 95.2 / 95] },
  calfraise: { erkek: [9.5 / 95, 15 / 95, 22 / 95, 31.5 / 95, 40.5 / 95, 50 / 95], kadin: [6 / 95, 10 / 95, 14.5 / 95, 21 / 95, 26.5 / 95, 32.5 / 95] },
};

// Bir hareketin rank durumunu hesapla. Döner: { rankIndex (-1=henüz bronz değil), ratio, nextWeight, progress }
// Cinsiyetin TEK normalizasyon noktası (backend'deki normGender ile aynı kurallar).
// Kayıtlarda 'male'/'female' ve eski 'Erkek'/'Kadın' yazımları bir arada olabiliyor;
// rank eşikleri buna göre değiştiği için karşılaştırma hep buradan geçmeli.
// Bilinmiyorsa null döner — "varsayılan erkek" ile "hiç seçilmemiş" ayrılabilsin.
export function normGender(gender?: string): 'male' | 'female' | null {
  const s = String(gender || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'female' || s === 'kadın' || s === 'kadin' || s === 'woman' || s === 'f') return 'female';
  if (s === 'male' || s === 'erkek' || s === 'man' || s === 'm') return 'male';
  return null;
}
export const genderKey = (gender?: string): 'erkek' | 'kadin' => (normGender(gender) === 'female' ? 'kadin' : 'erkek');

// 100 kg Elmas hareketleri: hafif sıklette kilo eşiği düşer, ağır sıklette tekrar şartı artar.
export const REP_FOCUSED_LIFTS = new Set(['latpull', 'cablecrunch', 'triceppushdown', 'seatedrow', 'barbellrow', 'shrug', 'legcurl']);
export const LEGEND_MIN_REPS = 11;
const normalizedReps = (reps: number) => Number.isFinite(reps) ? Math.max(1, Math.floor(reps)) : 1;

const validBodyweight = (bodyweight: number) => bodyweight > 0 ? bodyweight : 70;
export function legendMinReps(liftKey: string, bodyweight: number): number {
  return REP_FOCUSED_LIFTS.has(liftKey) ? Math.max(2, LEGEND_MIN_REPS + Math.ceil((validBodyweight(bodyweight) - 95) / 5)) : 1;
}
export function repBonusThreshold(liftKey: string, bodyweight = 70, gender?: string): number {
  return REP_FOCUSED_LIFTS.has(liftKey)
    ? STD[liftKey][genderKey(gender)][4] * Math.min(validBodyweight(bodyweight), 95)
    : Infinity;
}

// Uygulamaya özel puan; 1RM tahmini değildir. Elmas yüküne ulaşınca özel tekrar katkısı başlar.
export function rankRepMultiplier(liftKey: string, reps = 1, best = 0, bodyweight = 70, gender?: string): number {
  if (REP_BASED_LIFTS.has(liftKey)) return 1;
  const bonus = best + 1e-8 >= repBonusThreshold(liftKey, bodyweight, gender) ? 0.04 : 0.02;
  return 1 + Math.min(normalizedReps(reps) - 1, 10) * bonus;
}

export function rankScore(liftKey: string, best: number, reps = 1, bodyweight = 70, gender?: string): number {
  return best * rankRepMultiplier(liftKey, reps, best, bodyweight, gender);
}

export function computeRank(liftKey: string, best: number, bodyweight: number, gender?: string, reps = 1) {
  const thresholds = [...STD[liftKey][genderKey(gender)]];
  const isRepBased = REP_BASED_LIFTS.has(liftKey);
  const userBw = validBodyweight(bodyweight);
  const bw = isRepBased ? 1 : (REP_FOCUSED_LIFTS.has(liftKey) ? Math.min(userBw, 95) : userBw);
  const requiredReps = legendMinReps(liftKey, userBw);
  if (REP_FOCUSED_LIFTS.has(liftKey)) thresholds[5] = thresholds[4] * (1 + Math.min(requiredReps - 1, 10) * 0.04);
  const score = rankScore(liftKey, best, reps, userBw, gender);
  const ratio = score / bw;
  const count = isRepBased ? 1 : normalizedReps(reps);
  const needsReps = REP_FOCUSED_LIFTS.has(liftKey);
  let rankIndex = -1;
  for (let i = 0; i < thresholds.length; i++) {
    if (ratio + 1e-10 >= thresholds[i] && (i < 5 || !needsReps || count >= requiredReps)) rankIndex = i;
  }
  const nextIdx = rankIndex + 1;
  let nextWeight: number | null = null;
  let nextReps: number | null = null;
  let nextTargetWeight: number | null = null;
  let nextTargetReps = count;
  let progress = 1;
  if (nextIdx < thresholds.length) {
    const targetScore = thresholds[nextIdx] * bw;
    const repGate = nextIdx === 5 && needsReps;
    // Elmas yükünde çarpan değiştiği için sabit çarpana bölmek yanlış hedef verir.
    // Aynı tekrar sayısında hedefi karşılayan en küçük tam kg / tekrar sayısı.
    const targetWeightAt = (targetReps: number) => {
      let low = 0, high = Math.ceil(targetScore);
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (rankScore(liftKey, mid, targetReps, userBw, gender) + 1e-8 >= targetScore) high = mid;
        else low = mid + 1;
      }
      return low;
    };
    nextTargetReps = repGate ? Math.max(count, requiredReps) : count;
    nextTargetWeight = targetWeightAt(nextTargetReps);
    if (!repGate || count >= requiredReps) nextWeight = nextTargetWeight;
    if (!isRepBased && best > 0) {
      for (let candidate = count + 1; candidate <= Math.max(11, requiredReps); candidate++) {
        if ((!repGate || candidate >= requiredReps) && rankScore(liftKey, best, candidate, userBw, gender) + 1e-8 >= targetScore) {
          nextReps = candidate;
          break;
        }
      }
    }
    const lowRatio = rankIndex >= 0 ? thresholds[rankIndex] : 0;
    progress = Math.max(0, Math.min(1, (ratio - lowRatio) / (thresholds[nextIdx] - lowRatio)));
    if (repGate) progress = Math.min(progress, (count - 1) / (requiredReps - 1));
  }
  return { rankIndex, ratio, nextWeight, nextReps, nextTargetWeight, nextTargetReps, progress, score };
}

// 13 kas bölgesi — MuscleBodyMap bileşenindeki MUSCLE_NAMES anahtarlarıyla birebir aynı olmalı
export const MUSCLE_KEYS = ['trapez', 'omuz', 'gogus', 'biceps', 'onkol', 'karin', 'kuad', 'triceps', 'sirt', 'bel', 'kalca', 'arkabacak', 'kalf'];

// Kas grubu → egzersiz eşleştirme — LIFTS'teki muscleKey alanından türetilir (tek kaynak, çift bakım yok)
export const MUSCLE_LIFT_MAP: Record<string, string[]> = LIFTS.reduce((acc, l) => {
  (acc[l.muscleKey] = acc[l.muscleKey] || []).push(l.key);
  return acc;
}, {} as Record<string, string[]>);

// Kart ve kas haritası aynı tekrar katkılı rank puanını kullanır.
export function estRankIndex(liftKey: string, liftData: any, bodyweight: number, gender?: string): number {
  const best = liftData?.best || 0;
  if (best <= 0) return -1;
  return computeRank(liftKey, best, bodyweight, gender, liftData?.reps).rankIndex;
}

// Kas bazlı rank: o kasa bağlı hareketlerin ortalaması (kayıtlı olanlar üzerinden, en yakın rank'a yuvarlanır)
export function computeMuscleRank(muscleKey: string, liftsData: Record<string, any>, bodyweight: number, gender?: string): number {
  const idxs = (MUSCLE_LIFT_MAP[muscleKey] || [])
    .map((k) => estRankIndex(k, liftsData?.[k], bodyweight, gender))
    .filter((i) => i >= 0);
  if (!idxs.length) return -1;
  return Math.round(idxs.reduce((s, i) => s + i, 0) / idxs.length);
}

// Genel vücut ortalaması: kas bölgesi ortalamalarının ortalaması (hareketi çok olan kas haksız ağırlık kazanmaz)
export function computeBodyAverageRank(liftsData: Record<string, any>, bodyweight: number, gender?: string): number {
  const idxs = MUSCLE_KEYS
    .map((mk) => computeMuscleRank(mk, liftsData, bodyweight, gender))
    .filter((i) => i >= 0);
  if (!idxs.length) return -1;
  return Math.round(idxs.reduce((s, i) => s + i, 0) / idxs.length);
}

// MuscleBodyMap'e geçilecek { kas: rankKey } haritası — hareketi olmayan kaslar boş kalır (default gri)
export function buildMuscleRanksMap(liftsData: Record<string, any>, bodyweight: number, gender?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mk of MUSCLE_KEYS) {
    const idx = computeMuscleRank(mk, liftsData, bodyweight, gender);
    if (idx >= 0) out[mk] = RANKS[idx].key;
  }
  return out;
}

// ======================= KAS GELİŞİMİ (ZAMAN İÇİNDE KARŞILAŞTIRMA) =======================
// "best" alanı en son girilen değer olabilir (forceUpdate ile üzerine yazılıyor), gerçek geçmiş
// durumu her zaman `history` dizisinden çıkarılır — bu yüzden mevcut rank hesaplarından AYRI
// bir fonksiyon ailesi: buradaki 'now' bilerek `entry.best` kullanır (ana karttakiyle birebir
// aynı görünsün diye), 'first'/'1m' ise history'den geriye dönük en iyiyi bulur.
export type TrendPeriod = 'now' | '1m' | 'first';

export function bestForPeriod(liftKey: string, liftData: any, period: TrendPeriod, bodyweight = 70, gender?: string): { best: number; reps: number } {
  if (period === 'now') return { best: liftData?.best || 0, reps: liftData?.reps || 1 };
  const history: { weight: number; reps?: number; date: string }[] = liftData?.history || [];
  if (!history.length) return { best: 0, reps: 1 };
  if (period === 'first') {
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { best: sorted[0].weight, reps: sorted[0].reps || 1 };
  }
  // '1m' — 30 gün önceye kadar kayıtlı en iyi değer
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const pool = history.filter((h) => new Date(h.date) <= cutoff);
  if (!pool.length) return { best: 0, reps: 1 };
  const scoreOf = (h: { weight: number; reps?: number }) => rankScore(liftKey, h.weight, h.reps, bodyweight, gender);
  const bestEntry = pool.reduce((best, h) => {
    const rank = (entry: typeof h) => computeRank(liftKey, entry.weight, bodyweight, gender, entry.reps).rankIndex;
    if (rank(h) !== rank(best)) return rank(h) > rank(best) ? h : best;
    return scoreOf(h) > scoreOf(best) || (scoreOf(h) === scoreOf(best) && (h.reps || 1) > (best.reps || 1)) ? h : best;
  }, pool[0]);
  return { best: bestEntry.weight, reps: bestEntry.reps || 1 };
}

export function computeMuscleRankForPeriod(muscleKey: string, liftsData: Record<string, any>, bodyweight: number, gender: string | undefined, period: TrendPeriod): number {
  // Geçmiş kayıtlar da güncel kartlarla aynı tekrar katkısını kullanır.
  const idxs = (MUSCLE_LIFT_MAP[muscleKey] || [])
    .map((k) => {
      const { best, reps } = bestForPeriod(k, liftsData?.[k], period, bodyweight, gender);
      if (best <= 0) return -1;
      return computeRank(k, best, bodyweight, gender, reps).rankIndex;
    })
    .filter((i) => i >= 0);
  if (!idxs.length) return -1;
  return Math.round(idxs.reduce((s, i) => s + i, 0) / idxs.length); // computeMuscleRank ile aynı mantık
}

export function buildMuscleRanksMapForPeriod(liftsData: Record<string, any>, bodyweight: number, gender: string | undefined, period: TrendPeriod): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mk of MUSCLE_KEYS) {
    const idx = computeMuscleRankForPeriod(mk, liftsData, bodyweight, gender, period);
    if (idx >= 0) out[mk] = RANKS[idx].key;
  }
  return out;
}
