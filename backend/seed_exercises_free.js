// free-exercise-db'den (MIT, anahtarsız) salon-uygun egzersizleri içe aktarır.
// Mevcut animasyonlu GIF'li kayıtlara DOKUNMAZ (isim çakışırsa atlar).
// Statik görseller jsDelivr CDN'den referanslanır (upload yok, ücretsiz).
// Çalıştır:  node seed_exercises_free.js         (kuru koşu — sadece rapor)
//            node seed_exercises_free.js --write  (DB'ye yaz)
require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const ExerciseGif = require('./models/ExerciseGif');

const WRITE = process.argv.includes('--write');
const SRC = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@b0eed061e1c832b3ed815fbaa4b45b3cdc14df49/exercises/';
const CAP_PER_GROUP = 40; // her TR kas grubu için üst sınır (dengeli havuz)

// kas grubu (free-exercise-db) -> TR bodyPart (mevcut taksonomi)
const MUSCLE_TO_TR = {
  chest: 'Göğüs',
  lats: 'Sırt', 'middle back': 'Sırt', 'lower back': 'Sırt', traps: 'Sırt', neck: 'Sırt',
  quadriceps: 'Bacak', hamstrings: 'Bacak', calves: 'Bacak', glutes: 'Bacak', adductors: 'Bacak', abductors: 'Bacak',
  shoulders: 'Omuz',
  biceps: 'Biceps', forearms: 'Biceps',
  triceps: 'Triceps',
  abdominals: 'Karın',
};
// salon-uygun ekipman (lüks/exotic dışarıda)
const OK_EQUIP = new Set(['barbell','dumbbell','cable','machine','body only','kettlebell','e-z curl bar','bands','exercise ball','medicine ball']);
const OK_CATEGORY = new Set(['strength','powerlifting','cardio','plyometrics']);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'gymbody' } }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB bağlandı');

  // 0) mevcut kayıtları işaretle (animated=true, source=exercisedb) — bir kez
  if (WRITE) {
    const bf = await ExerciseGif.updateMany(
      { source: { $exists: false } },
      { $set: { animated: true, source: 'exercisedb' } }
    );
    console.log(`🔖 Mevcut kayıt işaretlendi (animated/source): ${bf.modifiedCount}`);
  }

  const existing = await ExerciseGif.find({}, 'name');
  const existingNames = new Set(existing.map(e => norm(e.name)));
  console.log(`📦 DB'de mevcut: ${existing.length} egzersiz`);

  const all = await fetchJson(SRC);
  console.log(`🌐 free-exercise-db: ${all.length} egzersiz çekildi`);

  // filtrele + eşle
  const perGroup = {};
  const toAdd = [];
  const seen = new Set();
  for (const ex of all) {
    const equip = (ex.equipment || '').toLowerCase();
    if (!OK_EQUIP.has(equip)) continue;
    if (!OK_CATEGORY.has((ex.category || '').toLowerCase())) continue;
    const prim = (ex.primaryMuscles || [])[0];
    const tr = ex.category === 'cardio' ? 'Kardiyo' : MUSCLE_TO_TR[prim];
    if (!tr) continue;
    const key = norm(ex.name);
    if (!key || seen.has(key) || existingNames.has(key)) continue;
    if ((perGroup[tr] || 0) >= CAP_PER_GROUP) continue;
    if (!Array.isArray(ex.images) || ex.images.length === 0) continue;

    seen.add(key);
    perGroup[tr] = (perGroup[tr] || 0) + 1;
    const imgs = ex.images.map(i => CDN + i);
    toAdd.push({
      name: ex.name,
      gifUrl: imgs[imgs.length - 1] || imgs[0], // bitiş pozisyonu genelde daha açıklayıcı
      bodyPart: tr,
      animated: false,
      equipment: ex.equipment,
      primaryMuscles: ex.primaryMuscles || [],
      secondaryMuscles: ex.secondaryMuscles || [],
      level: ex.level,
      category: ex.category,
      instructions: ex.instructions || [],
      images: imgs,
      source: 'free-exercise-db',
    });
  }

  console.log(`\n🎯 Eklenecek: ${toAdd.length} yeni egzersiz`);
  console.log('   TR kas grubu dağılımı:', JSON.stringify(perGroup));

  if (!WRITE) {
    console.log('\n(kuru koşu — DB\'ye yazılmadı. Yazmak için: node seed_exercises_free.js --write)');
    console.log('Örnek 5:'); toAdd.slice(0, 5).forEach(e => console.log(`  - ${e.name} [${e.bodyPart}/${e.equipment}]`));
    return mongoose.disconnect();
  }

  const res = await ExerciseGif.insertMany(toAdd, { ordered: false }).catch(e => {
    console.log('⚠️ bazı kayıtlar atlandı (çakışma):', e.writeErrors?.length || e.message);
    return e.insertedDocs || [];
  });
  const inserted = Array.isArray(res) ? res.length : res.insertedCount || toAdd.length;
  const total = await ExerciseGif.countDocuments();
  console.log(`\n🎉 Eklendi: ${inserted} | Yeni toplam: ${total}`);
  await mongoose.disconnect();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
