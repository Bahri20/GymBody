// ======================= GÜÇ SIRALAMASI (STRENGTH RANK) =======================
// Saf hesaplama mantığı — React/RN'e bağımlı değil, bu yüzden ayrı bir modülde ve test edilebilir.
// NOT: backend/index.js ve backend/views/coach.html içinde bu mantığın kopyaları var (ayrı
// runtime'lar, paylaşılan modül kuramıyorlar) — biri değişirse üçü de güncellenmeli.

// muscleKey: MuscleBodyMap bileşenindeki kas bölgesi anahtarı (bkz. mobile/components/MuscleBodyMap.tsx)
// unit: 'tekrar' ise ağırlık değil tekrar sayısı kaydedilir (rank hesabı vücut ağırlığına bölünmez)
// libraryName: backend ExerciseGif koleksiyonundaki tam isim (gif eşleşmesi için)
export const LIFTS = [
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
] as const;

// tekrar-bazlı (kg değil) hareketler — computeRank'ta vücut ağırlığına bölünmez
export const REP_BASED_LIFTS = new Set(['situp']);

export const RANKS = [
  { key: 'bronz',  label: 'Bronz',  emoji: '🥉', color: '#CD7F32' },
  { key: 'gumus',  label: 'Gümüş',  emoji: '⚪', color: '#C0C0C0' },
  { key: 'altin',  label: 'Altın',  emoji: '🥇', color: '#FFD700' },
  { key: 'platin', label: 'Platin', emoji: '💠', color: '#5BC8E0' },
  { key: 'elmas',  label: 'Elmas',  emoji: '💎', color: '#9B6BFF' },
  { key: 'efsane', label: 'Efsane', emoji: '🔥', color: '#EF4444' },
] as const;

// oran eşikleri [bronz, gümüş, altın, platin, elmas, efsane]
export const STD: Record<string, { erkek: number[]; kadin: number[] }> = {
  bench:    { erkek: [0.50, 0.75, 1.00, 1.25, 1.50, 1.80], kadin: [0.30, 0.45, 0.60, 0.80, 1.00, 1.20] },
  squat:    { erkek: [0.75, 1.00, 1.50, 1.75, 2.25, 2.60], kadin: [0.50, 0.75, 1.00, 1.25, 1.60, 1.90] },
  deadlift: { erkek: [1.00, 1.25, 1.75, 2.25, 2.75, 3.10], kadin: [0.60, 0.90, 1.25, 1.60, 2.00, 2.30] },
  ohp:      { erkek: [0.35, 0.50, 0.65, 0.80, 1.00, 1.15], kadin: [0.20, 0.30, 0.45, 0.55, 0.70, 0.85] },
  // Kablo/makine hareketi — ağır sıklette (90kg+) gerçek salon deneyimine göre ~%15-20 aşağı kalibre edildi
  // (kullanıcı geri bildirimi: 92kg vücut, 95kg zar zor kalkıyor, gerçek salonlarda tipik max 100-130kg)
  latpull:  { erkek: [0.50, 0.65, 0.80, 1.00, 1.20, 1.40], kadin: [0.30, 0.45, 0.60, 0.75, 0.90, 1.05] },
  curl:     { erkek: [0.25, 0.35, 0.45, 0.60, 0.75, 0.90], kadin: [0.15, 0.22, 0.30, 0.40, 0.50, 0.60] },
  // Lateral raise tek dumbbell/cable (tek kol) — izolasyon, vücut ağırlığıyla az ölçeklenir
  lateral:  { erkek: [0.06, 0.09, 0.12, 0.16, 0.20, 0.25], kadin: [0.04, 0.06, 0.09, 0.12, 0.15, 0.18] },

  // Aşağıdakiler taslak eşikler — gerçek kullanıcı verisiyle kalibre edilmedi, sahada ince ayar gerekebilir.
  inclinebench:    { erkek: [0.40, 0.60, 0.85, 1.05, 1.25, 1.50], kadin: [0.25, 0.38, 0.55, 0.70, 0.85, 1.00] },
  cablecrossover:  { erkek: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65], kadin: [0.10, 0.16, 0.22, 0.29, 0.36, 0.43] },
  dumbbellcurl:    { erkek: [0.12, 0.18, 0.24, 0.32, 0.40, 0.48], kadin: [0.08, 0.11, 0.16, 0.20, 0.25, 0.30] },
  hammercurl:      { erkek: [0.13, 0.19, 0.26, 0.34, 0.42, 0.50], kadin: [0.08, 0.12, 0.17, 0.21, 0.26, 0.31] },
  reversecurl:     { erkek: [0.15, 0.22, 0.30, 0.40, 0.50, 0.60], kadin: [0.10, 0.14, 0.19, 0.25, 0.31, 0.37] },
  cablecrunch:     { erkek: [0.30, 0.45, 0.60, 0.80, 1.00, 1.20], kadin: [0.20, 0.30, 0.40, 0.52, 0.65, 0.78] },
  // Sit-Up tekrar bazlı — bu diziler kg/vücut oranı değil, doğrudan tekrar sayısı eşiği
  situp:           { erkek: [15, 25, 40, 60, 80, 100], kadin: [12, 20, 32, 48, 65, 85] },
  legext:          { erkek: [0.40, 0.60, 0.85, 1.10, 1.40, 1.70], kadin: [0.28, 0.42, 0.60, 0.78, 1.00, 1.20] },
  // Cable One Arm Tricep Extension tek kol
  tricepext:       { erkek: [0.10, 0.15, 0.20, 0.27, 0.34, 0.41], kadin: [0.06, 0.09, 0.13, 0.17, 0.21, 0.26] },
  triceppushdown:  { erkek: [0.25, 0.38, 0.52, 0.68, 0.85, 1.02], kadin: [0.16, 0.24, 0.33, 0.43, 0.54, 0.65] },
  seatedrow:       { erkek: [0.50, 0.70, 0.90, 1.15, 1.40, 1.65], kadin: [0.32, 0.45, 0.60, 0.77, 0.94, 1.11] },
  barbellrow:      { erkek: [0.45, 0.65, 0.90, 1.15, 1.40, 1.65], kadin: [0.28, 0.41, 0.57, 0.73, 0.89, 1.05] },
  shrug:           { erkek: [0.75, 1.00, 1.50, 2.00, 2.50, 3.00], kadin: [0.50, 0.65, 1.00, 1.35, 1.70, 2.00] },
  hipthrust:       { erkek: [0.75, 1.10, 1.60, 2.10, 2.60, 3.10], kadin: [0.60, 0.90, 1.35, 1.80, 2.30, 2.80] },
  glutebridge:     { erkek: [0.65, 0.95, 1.40, 1.85, 2.30, 2.75], kadin: [0.50, 0.75, 1.15, 1.55, 1.95, 2.40] },
  rdl:             { erkek: [0.75, 1.00, 1.40, 1.80, 2.20, 2.60], kadin: [0.45, 0.68, 0.95, 1.25, 1.55, 1.85] },
  legcurl:         { erkek: [0.30, 0.45, 0.60, 0.80, 1.00, 1.20], kadin: [0.20, 0.30, 0.42, 0.55, 0.68, 0.82] },
  // Calf raise tek dumbbell
  calfraise:       { erkek: [0.25, 0.40, 0.60, 0.85, 1.10, 1.35], kadin: [0.16, 0.26, 0.40, 0.56, 0.72, 0.88] },
};

// Bir hareketin rank durumunu hesapla. Döner: { rankIndex (-1=henüz bronz değil), ratio, nextWeight, progress }
export function computeRank(liftKey: string, best: number, bodyweight: number, gender?: string) {
  const g = String(gender || '').toLowerCase();
  const isFemale = g === 'female' || g === 'kadın' || g === 'kadin';
  const thresholds = STD[liftKey][isFemale ? 'kadin' : 'erkek'];
  const bw = REP_BASED_LIFTS.has(liftKey) ? 1 : (bodyweight && bodyweight > 0 ? bodyweight : 70);
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

// 13 kas bölgesi — MuscleBodyMap bileşenindeki MUSCLE_NAMES anahtarlarıyla birebir aynı olmalı
export const MUSCLE_KEYS = ['trapez', 'omuz', 'gogus', 'biceps', 'onkol', 'karin', 'kuad', 'triceps', 'sirt', 'bel', 'kalca', 'arkabacak', 'kalf'];

// Kas grubu → egzersiz eşleştirme — LIFTS'teki muscleKey alanından türetilir (tek kaynak, çift bakım yok)
export const MUSCLE_LIFT_MAP: Record<string, string[]> = LIFTS.reduce((acc, l) => {
  (acc[l.muscleKey] = acc[l.muscleKey] || []).push(l.key);
  return acc;
}, {} as Record<string, string[]>);

// Bir hareketin rank index'i, hiç veri yoksa -1. NOT: ham best kullanılır (Epley 1RM DEĞİL) —
// kart üzerinde gösterilen rank ile birebir aynı olsun diye; yoksa kas ortalaması, kartlardaki
// tekil rank'ların hiçbirinde olmayan daha yüksek bir rank'a "sıçrayabilir" (kafa karıştırıcı).
export function estRankIndex(liftKey: string, liftData: any, bodyweight: number, gender?: string): number {
  const best = liftData?.best || 0;
  if (best <= 0) return -1;
  return computeRank(liftKey, best, bodyweight, gender).rankIndex;
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

export function bestForPeriod(liftKey: string, liftData: any, period: TrendPeriod): { best: number; reps: number } {
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
  const isRep = REP_BASED_LIFTS.has(liftKey);
  const scoreOf = (h: { weight: number; reps?: number }) => {
    const r = h.reps || 1;
    return isRep ? h.weight : (r > 1 ? h.weight * (1 + r / 55) : h.weight);
  };
  const bestEntry = pool.reduce((best, h) => (scoreOf(h) > scoreOf(best) ? h : best), pool[0]);
  return { best: bestEntry.weight, reps: bestEntry.reps || 1 };
}

export function computeMuscleRankForPeriod(muscleKey: string, liftsData: Record<string, any>, bodyweight: number, gender: string | undefined, period: TrendPeriod): number {
  // NOT: bestForPeriod farklı tekrar sayılarını kıyaslamak için Epley kullanır ama ham ağırlığı
  // döner — rank'a çevirirken tekrar bir daha uygulanmaz (kartlardaki rank ile tutarlı kalsın diye).
  const idxs = (MUSCLE_LIFT_MAP[muscleKey] || [])
    .map((k) => {
      const { best } = bestForPeriod(k, liftsData?.[k], period);
      if (best <= 0) return -1;
      return computeRank(k, best, bodyweight, gender).rankIndex;
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
