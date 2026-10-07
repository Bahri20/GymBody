import {
  LIFTS, RANKS, STD, REP_BASED_LIFTS, computeRank,
  MUSCLE_KEYS, MUSCLE_LIFT_MAP, computeMuscleRank, computeBodyAverageRank, buildMuscleRanksMap,
  bestForPeriod, rankScore, computeMuscleRankForPeriod, REP_FOCUSED_LIFTS, legendMinReps, repBonusThreshold,
} from '../rankLogic';

describe('computeRank', () => {
  it('eşik altında -1 (henüz bronz değil) döner', () => {
    // 95 kg referansında Bronz sınırının hemen altı.
    expect(computeRank('bench', STD.bench.erkek[0] * 95 - 0.01, 95, 'male').rankIndex).toBe(-1);
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
  it('kartlardaki tekrar katkılı rankların ortalamasını alır', () => {
    const bw = 80;
    const lifts = { ohp: { best: 75, reps: 6 }, lateral: { best: 16, reps: 10 } };
    expect(computeRank('ohp', 75, bw, 'male', 6).rankIndex).toBe(3);
    expect(computeRank('lateral', 16, bw, 'male', 10).rankIndex).toBe(3);
    expect(computeMuscleRank('omuz', lifts, bw, 'male')).toBe(3);
  });

  it('biri Platin biri Elmas ise kas ortalamaya (en yakın rank\'a) yuvarlanır', () => {
    const bw = 80;
    // curl platin(idx3)=0.60..<0.75 -> 50kg (0.625) platin
    // dumbbellcurl elmas(idx4)=0.40..<0.48 -> 34kg (0.425) elmas
    const lifts = { curl: { best: 50, reps: 1 }, dumbbellcurl: { best: 30, reps: 1 } };
    expect(computeRank('curl', 50, bw, 'male').rankIndex).toBe(3); // platin
    expect(computeRank('dumbbellcurl', 30, bw, 'male').rankIndex).toBe(4); // elmas
    expect(computeMuscleRank('biceps', lifts, bw, 'male')).toBe(4); // round((3+4)/2)=4 -> elmas
  });

  it('tekrarlar rankı yükseltirken kart, kas ve geçmiş görünümü aynı kalır', () => {
    const lifts = { bench: { best: 80, reps: 4 } };
    expect(computeRank('bench', 80, 95, 'male', 1).rankIndex).toBe(1);
    expect(computeRank('bench', 80, 95, 'male', 4).rankIndex).toBe(2);
    expect(computeMuscleRank('gogus', lifts, 95, 'male')).toBe(2);
    expect(computeMuscleRankForPeriod('gogus', lifts, 95, 'male', 'now')).toBe(2);
    expect(buildMuscleRanksMap(lifts, 95, 'male').gogus).toBe('altin');
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

describe('sınırlı tekrar katkısı', () => {
  it('1 tekrarı değiştirmez, 6 tekrarda %10, 11+ tekrarda en fazla %20 ekler', () => {
    expect(rankScore('bench', 100, 1)).toBe(100);
    expect(rankScore('bench', 100, 6)).toBeCloseTo(110);
    expect(rankScore('bench', 100, 11)).toBe(120);
    expect(rankScore('bench', 100, 50)).toBe(120);
    expect(rankScore('bench', 50, 50)).toBeLessThan(rankScore('bench', 100, 1));
  });
  it('eksik veya geçersiz tekrarı tek tekrar kabul eder, sıfır ağırlığa puan vermez', () => {
    for (const reps of [undefined, NaN, Infinity, -5, 0]) {
      expect(rankScore('bench', 100, reps)).toBe(100);
    }
    expect(rankScore('bench', 0, 30)).toBe(0);
  });
  it('Sit-Up tekrar sayısına ikinci bir tekrar bonusu eklemez', () => {
    expect(computeRank('situp', 60, 95, 'male', 30)).toEqual(computeRank('situp', 60, 95, 'male', 1));
  });
  it('sonraki kilo hedefi aynı tekrar sayısıyla gerçekten sonraki ranka ulaştırır', () => {
    const current = computeRank('bench', 80, 95, 'male', 4);
    expect(current.nextWeight).toBe(99);
    expect(computeRank('bench', current.nextWeight!, 95, 'male', 4).rankIndex).toBe(3);
    expect(computeRank('bench', current.nextWeight! - 1, 95, 'male', 4).rankIndex).toBe(2);
  });
  it('geçmiş performansı da sınırlı puanla karşılaştırır', () => {
    const lift = { history: [
      { weight: 50, reps: 50, date: '2020-01-01' },
      { weight: 70, reps: 1, date: '2020-02-01' },
    ] };
    expect(bestForPeriod('bench', lift, '1m')).toEqual({ best: 70, reps: 1 });
  });
});

describe('mobil / backend / koç hesap uyumu', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const backend = fs.readFileSync(path.resolve(__dirname, '../../../backend/index.js'), 'utf8');
  const coach = fs.readFileSync(path.resolve(__dirname, '../../../backend/views/coach.html'), 'utf8');
  // Sunucu/DOM başlatmadan gerçek üretim hesaplarını çalıştır.
  const serverRank = vm.runInNewContext(backend.slice(backend.indexOf('const MUSCLE_STD'), backend.indexOf("const mongoose = require")) + '; liftRankIndex');
  const coachRank = vm.runInNewContext(coach.slice(coach.indexOf('const MM_STD'), coach.indexOf('const MM_MUSCLES')) + '; mmRankIndex');
  it('tüm hareketlerde, cinsiyetlerde ve tekrar değerlerinde aynı sınıfı verir', () => {
    for (const lift of LIFTS) for (const gender of ['male', 'female', 'Kadın', 'f']) {
      for (const bw of [60, 85, 90, 95, 100, 110]) for (const reps of [1, 4, 6, 10, 11, 12, 30, 50]) for (const weight of [0, 15, 40, 90, 100, 200]) {
        const args = [lift.key, weight, bw, gender, reps] as const;
        const expected = computeRank(...args).rankIndex;
        expect(serverRank(...args)).toBe(expected);
        expect(coachRank(...args)).toBe(expected);
      }
    }
  });
});


describe('95 kg referans kalibrasyonu', () => {
  it('normal hareketlerin Efsane eşikleri kullanıcının verdiği kilolarla aynıdır', () => {
    const targets: Record<string, number> = { bench:150, squat:240, deadlift:300, ohp:140, curl:80, lateral:30, inclinebench:140, cablecrossover:90, dumbbellcurl:40, hammercurl:50, reversecurl:50, situp:100, legext:150, tricepext:50, hipthrust:250, glutebridge:220, rdl:220, calfraise:50 };
    for (const [key, weight] of Object.entries(targets)) {
      expect(computeRank(key, weight, 95, 'male', 1).rankIndex).toBe(5);
      expect(computeRank(key, weight - 0.01, 95, 'male', 1).rankIndex).toBe(4);
    }
  });
  it('100 kg özel hareketlerinde 1–10 tekrar Elmas, 11 tekrar Efsane', () => {
    for (const key of REP_FOCUSED_LIFTS) {
      for (const reps of [1, 6, 10]) expect(computeRank(key, 100, 95, 'male', reps).rankIndex).toBe(4);
      expect(computeRank(key, 100, 95, 'male', 11).rankIndex).toBe(5);
      expect(computeRank(key, 200, 95, 'male', 1).rankIndex).toBe(4);
      expect(computeRank(key, 100, 95, 'male', 1).nextReps).toBe(11);
    }
  });
  it('hafif sıklette hem Elmas kilosu hem Efsane tekrar şartı düşer', () => {
    for (const key of REP_FOCUSED_LIFTS) for (const [bw, reps] of [[85, 9], [90, 10], [95, 11], [100, 12]]) {
      const weight = Math.min(bw, 95) / 95 * 100;
      expect(legendMinReps(key, bw)).toBe(reps);
      expect(repBonusThreshold(key, bw, 'male')).toBeCloseTo(weight);
      expect(computeRank(key, weight, bw, 'male', 1).rankIndex).toBe(4);
      expect(computeRank(key, weight, bw, 'male', reps - 1).rankIndex).toBe(4);
      expect(computeRank(key, weight, bw, 'male', reps).rankIndex).toBe(5);
    }
  });
  it('özel katkı yalnızca kişiye ait Elmas yükünde başlar', () => {
    expect(rankScore('latpull', 99, 6, 95, 'male')).toBeCloseTo(108.9);
    expect(rankScore('latpull', 100, 6, 95, 'male')).toBe(120);
    expect(rankScore('latpull', 100, 50, 95, 'male')).toBe(140);
    expect(rankScore('bench', 100, 50, 95, 'male')).toBe(120);
  });
  it('tekrar kilidi varken daha fazla kilo hedefi yerine doğru kilo × tekrar hedefi döner', () => {
    const r = computeRank('latpull', 100, 100, 'male', 11);
    expect(r.rankIndex).toBe(4);
    expect(r.nextWeight).toBeNull();
    expect(r.nextReps).toBe(12);
    expect(r.nextTargetWeight).toBe(100);
    expect(r.nextTargetReps).toBe(12);
  });
  it('tüm kilo/tekrar önerileri vaat edilen sonraki ranka ulaştırır', () => {
    for (const lift of LIFTS) for (const bw of [60, 90, 95, 100, 110]) for (const gender of ['male', 'female']) for (const reps of [1, 6, 10, 11, 12]) {
      const weight = 50;
      const r = computeRank(lift.key, weight, bw, gender, reps);
      if (r.nextTargetWeight !== null) expect(computeRank(lift.key, r.nextTargetWeight, bw, gender, r.nextTargetReps).rankIndex).toBeGreaterThan(r.rankIndex);
      if (r.nextReps !== null) expect(computeRank(lift.key, weight, bw, gender, r.nextReps).rankIndex).toBeGreaterThan(r.rankIndex);
    }
  });
  it('aynı puanda daha fazla tekrar gerektiren eski Efsane kaydını seçer', () => {
    const data = { history: [
      { weight:100, reps:11, date:'2020-01-01' },
      { weight:100, reps:12, date:'2020-02-01' },
    ] };
    expect(bestForPeriod('latpull', data, '1m', 100, 'male').reps).toBe(12);
  });
});
