import {
  LIFTS, RANKS, STD, REP_BASED_LIFTS, computeRank,
  MUSCLE_KEYS, MUSCLE_LIFT_MAP, computeMuscleRank, computeBodyAverageRank, buildMuscleRanksMap,
  bestForPeriod,
} from '../rankLogic';

describe('computeRank', () => {
  it('eşik altında -1 (henüz bronz değil) döner', () => {
    // bench erkek bronz eşiği 0.50 — 80kg vücutta 39kg bunun altında
    expect(computeRank('bench', 39, 80, 'male').rankIndex).toBe(-1);
  });

  it('her rank eşiğinde doğru index döner (bench, erkek)', () => {
    const bw = 80;
    const th = STD.bench.erkek;
    th.forEach((ratio, i) => {
      const weight = Math.ceil(ratio * bw); // eşiğin biraz üstü, kesin geçsin
      expect(computeRank('bench', weight, bw, 'male').rankIndex).toBe(i);
    });
  });

  it('kadın eşik tablosunu kullanır', () => {
    const bw = 60;
    const weight = STD.bench.kadin[2] * bw; // altın eşiği
    expect(computeRank('bench', weight, bw, 'kadın').rankIndex).toBe(2);
    // aynı ağırlık+vücut ağırlığı erkek tablosunda daha düşük rank verir (kadın eşiği daha düşük olduğu için)
    expect(computeRank('bench', weight, bw, 'male').rankIndex).toBeLessThan(2);
  });

  it('tekrar-bazlı hareket (situp) vücut ağırlığına bölmez, direkt tekrar sayısını kullanır', () => {
    expect(REP_BASED_LIFTS.has('situp')).toBe(true);
    // situp erkek platin eşiği 60 tekrar — vücut ağırlığı ne olursa olsun aynı sonucu vermeli
    expect(computeRank('situp', 60, 50, 'male').rankIndex).toBe(3);
    expect(computeRank('situp', 60, 120, 'male').rankIndex).toBe(3);
  });

  it('vücut ağırlığı verilmezse 70kg varsayılan kullanır', () => {
    const withDefault = computeRank('bench', 52, 0, 'male');
    const explicit70 = computeRank('bench', 52, 70, 'male');
    expect(withDefault.rankIndex).toBe(explicit70.rankIndex);
  });
});

describe('LIFTS / MUSCLE_LIFT_MAP bütünlüğü', () => {
  it('her LIFTS girdisinin muscleKey\'i MUSCLE_KEYS içinde var', () => {
    for (const lift of LIFTS) {
      expect(MUSCLE_KEYS).toContain(lift.muscleKey);
    }
  });

  it('her LIFTS girdisinin STD tablosunda karşılığı var', () => {
    for (const lift of LIFTS) {
      expect(STD[lift.key]).toBeDefined();
      expect(STD[lift.key].erkek).toHaveLength(6);
      expect(STD[lift.key].kadin).toHaveLength(6);
    }
  });

  it('13 kas grubunun hepsi en az bir hareketle eşleşiyor', () => {
    for (const mk of MUSCLE_KEYS) {
      expect(MUSCLE_LIFT_MAP[mk]?.length).toBeGreaterThan(0);
    }
  });
});

describe('computeMuscleRank — ortalama mantığı', () => {
  it('iki hareket de aynı rank\'taysa kas o rank olur', () => {
    const bw = 80;
    // ohp thresholds erkek platin(idx3)=0.80..<1.00 -> 70kg (0.875) platin
    // lateral thresholds erkek platin(idx3)=0.16..<0.20 -> 14kg (0.175) platin
    const lifts = { ohp: { best: 70, reps: 6 }, lateral: { best: 14, reps: 10 } };
    expect(computeRank('ohp', 70, bw, 'male').rankIndex).toBe(3); // platin
    expect(computeRank('lateral', 14, bw, 'male').rankIndex).toBe(3); // platin
    expect(computeMuscleRank('omuz', lifts, bw, 'male')).toBe(3); // platin
  });

  it('biri Platin biri Elmas ise kas ortalamaya (en yakın rank\'a) yuvarlanır', () => {
    const bw = 80;
    // curl platin(idx3)=0.60..<0.75 -> 50kg (0.625) platin
    // dumbbellcurl elmas(idx4)=0.40..<0.48 -> 34kg (0.425) elmas
    const lifts = { curl: { best: 50, reps: 1 }, dumbbellcurl: { best: 34, reps: 1 } };
    expect(computeRank('curl', 50, bw, 'male').rankIndex).toBe(3); // platin
    expect(computeRank('dumbbellcurl', 34, bw, 'male').rankIndex).toBe(4); // elmas
    expect(computeMuscleRank('biceps', lifts, bw, 'male')).toBe(4); // round((3+4)/2)=4 -> elmas
  });

  it('REGRESYON: tekrar sayısı (Epley) kas rank\'ını kart\'takinden farklı yönde etkilemez', () => {
    const bw = 80;
    // aynı ham ağırlık, farklı tekrar sayıları — muscle rank aynı kalmalı (kart'ta gösterilenle tutarlı)
    const singleRep = computeMuscleRank('omuz', { ohp: { best: 70, reps: 1 } }, bw, 'male');
    const sixReps = computeMuscleRank('omuz', { ohp: { best: 70, reps: 6 } }, bw, 'male');
    expect(singleRep).toBe(sixReps);
  });

  it('hiç veri yoksa -1 döner (harita default gri)', () => {
    expect(computeMuscleRank('kalf', {}, 80, 'male')).toBe(-1);
  });

  it('sadece kayıtlı hareketleri sayar, best=0 olanları yok sayar', () => {
    const lifts = { ohp: { best: 70, reps: 1 }, lateral: { best: 0, reps: 0 } };
    // lateral'ın best'i 0 olduğu için sadece ohp sayılmalı
    expect(computeMuscleRank('omuz', lifts, 80, 'male')).toBe(computeRank('ohp', 70, 80, 'male').rankIndex);
  });
});

describe('computeBodyAverageRank', () => {
  it('kas ortalamalarının ortalamasını alır (kayıtlı olanlar üzerinden)', () => {
    const bw = 80;
    // gogus: bench 100kg -> hesapla, biceps: curl 50kg (platin) -> tek başına, diğer kaslar boş
    const bodyIdx = computeBodyAverageRank({ curl: { best: 50, reps: 1 } }, bw, 'male');
    expect(bodyIdx).toBe(computeRank('curl', 50, bw, 'male').rankIndex);
  });

  it('hiç veri yoksa -1 döner', () => {
    expect(computeBodyAverageRank({}, 80, 'male')).toBe(-1);
  });

  it('birden fazla kas hareketi olan bir kas, tek hareketli bir kasa göre haksız ağırlık kazanmaz', () => {
    const bw = 80;
    // omuz 2 hareketle platin(3), bel tek hareketle daha düşük bir rank — vücut ortalaması ikisinin
    // ortalaması olmalı, sadece hareketi çok olan omuz'a göre değil (tam index'ler aşağıda hesaplanıyor)
    const lifts = {
      ohp: { best: 70, reps: 1 }, lateral: { best: 14, reps: 1 }, // omuz -> platin(3)
      deadlift: { best: 87.5, reps: 1 }, // bel -> düşük bir rank
    };
    const omuzIdx = computeMuscleRank('omuz', lifts, bw, 'male');
    const belIdx = computeMuscleRank('bel', lifts, bw, 'male');
    const bodyIdx = computeBodyAverageRank(lifts, bw, 'male');
    expect(bodyIdx).toBe(Math.round((omuzIdx + belIdx) / 2));
  });
});

describe('buildMuscleRanksMap', () => {
  it('sadece verisi olan kaslar için rank key döner, gerisi haritada yok', () => {
    const map = buildMuscleRanksMap({ curl: { best: 50, reps: 1 } }, 80, 'male');
    expect(map.biceps).toBe(RANKS[computeRank('curl', 50, 80, 'male').rankIndex].key);
    expect(map.kalf).toBeUndefined();
  });
});

describe('bestForPeriod', () => {
  const liftData = {
    best: 100,
    reps: 1,
    history: [
      { weight: 60, reps: 5, date: '2025-01-01' },
      { weight: 80, reps: 1, date: '2025-06-01' },
      { weight: 100, reps: 1, date: new Date().toISOString() },
    ],
  };

  it("'now' her zaman liftData.best'i kullanır (history'yi yoksayar)", () => {
    expect(bestForPeriod('bench', liftData, 'now')).toEqual({ best: 100, reps: 1 });
  });

  it("'first' history'deki en eski kaydı döner", () => {
    expect(bestForPeriod('bench', liftData, 'first')).toEqual({ best: 60, reps: 5 });
  });

  it("history yoksa 'first'/'1m' için best=0 döner", () => {
    expect(bestForPeriod('bench', { best: 100, reps: 1 }, 'first')).toEqual({ best: 0, reps: 1 });
  });

  it("'1m' 30 günden yeni kayıtları hariç tutar", () => {
    const result = bestForPeriod('bench', liftData, '1m');
    // en güncel kayıt (bugün) 30 günden yeni olduğu için havuzda olmamalı
    expect(result.best).not.toBe(100);
  });
});
