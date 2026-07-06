// 57 animasyonlu egzersizi ELLE KÜRATÖRLENMİŞ doğru free-exercise-db karşılığıyla
// eşler → tüm havuz aynı kaynaktan statik, tam görsel uyum, YANLIŞ görsel yok.
// Eşleşmeyen 3 hareket animasyonlu kalır. Eski GIF `animatedGifUrl`'e yedeklenir.
// Çalıştır:  node unify_57_curated.js          (kuru koşu)
//            node unify_57_curated.js --write   (DB'ye yaz)
require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const ExerciseGif = require('./models/ExerciseGif');

const WRITE = process.argv.includes('--write');
const SRC = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json';
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';

// bizim isim -> free-exercise-db birebir ismi (doğrulanmış)
const MAP = {
  'Bench Press': 'Barbell Bench Press - Medium Grip',
  'Incline Bench Press': 'Barbell Incline Bench Press - Medium Grip',
  'Decline Bench Press': 'Decline Barbell Bench Press',
  'Cable Bench Press': 'Cable Chest Press',
  'Dumbbell Incline Flyes': 'Incline Dumbbell Flyes',
  'Cable Flyes': 'Flat Bench Cable Flyes',
  'Push-ups': 'Pushups',
  'Incline Dumbbell Press': 'Incline Dumbbell Press',
  'Deadlift': 'Barbell Deadlift',
  'Pull-ups': 'Pullups',
  'Chin-ups': 'Chin-Up',
  'Lat Pulldown': 'Wide-Grip Lat Pulldown',
  'Seated Cable Row': 'Seated Cable Rows',
  'Barbell Row': 'Bent Over Barbell Row',
  'One Arm Dumbbell Row': 'One-Arm Dumbbell Row',
  'Standing Rear Delt Row': 'Barbell Rear Delt Row',
  'Romanian Deadlift': 'Romanian Deadlift',
  'Squat': 'Barbell Squat',
  'Leg Press': 'Leg Press',
  'Leg Extension': 'Leg Extensions',
  'Leg Curl': 'Seated Leg Curl',
  'Calf Raises': 'Standing Calf Raises',
  'Goblet Squat': 'Goblet Squat',
  'Dumbbell Squat': 'Dumbbell Squat',
  'Split Squat': 'Split Squat with Dumbbells',
  'Walking Lunges': 'Bodyweight Walking Lunge',
  'Barbell Full Squat': 'Barbell Full Squat',
  'Front Raise': 'Front Dumbbell Raise',
  'Upright Row': 'Standing Dumbbell Upright Row',
  'Military Press': 'Standing Military Press',
  'Dumbbell Shoulder Press': 'Dumbbell Shoulder Press',
  'Dumbbell Lateral Raise': 'Side Lateral Raise',
  'Cable Lateral Raise': 'Cable Seated Lateral Raise',
  'Barbell Front Raise': 'Standing Front Barbell Raise Over Head',
  'Bicep Curl': 'Dumbbell Bicep Curl',
  'Hammer Curl': 'Alternate Hammer Curl',
  'Barbell Curl': 'Barbell Curl',
  'Dumbbell Biceps Curl': 'Dumbbell Alternate Bicep Curl',
  'Tricep Pushdown': 'Triceps Pushdown',
  'Tricep Dips': 'Bench Dips',
  'Overhead Tricep Extension': 'Cable Rope Overhead Triceps Extension',
  'Close Grip Bench Press': 'Close-Grip Barbell Bench Press',
  'Cable Pushdown': 'Triceps Pushdown',
  'Dips': 'Dips - Triceps Version',
  'Plank': 'Plank',
  'Crunches': 'Crunches',
  'Hanging Leg Raise': 'Hanging Leg Raise',
  'Russian Twist': 'Russian Twist',
  'Bicycle Crunch': 'Air Bike',
  'Cable Crunch': 'Cable Crunch',
  'Sit-ups': 'Sit-Up',
  'Leg Raises': 'Flat Bench Lying Leg Raise',
  'Mountain Climbers': 'Mountain Climbers',
  "Farmer's Walk": "Farmer's Walk",
  // eşleşmeyen (animasyonlu kalacak): Kettlebell Swing, Burpees, Cable Curl
};

function fetchJson(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'gymbody' } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const all = await fetchJson(SRC);
  const byName = new Map(all.map(e => [e.name, e]));

  const targets = await ExerciseGif.find({ animated: true });
  let done = 0; const missTarget = []; const leftAnimated = [];

  for (const ex of targets) {
    const tName = MAP[ex.name];
    if (!tName) { leftAnimated.push(ex.name); continue; }
    const c = byName.get(tName);
    if (!c || !Array.isArray(c.images) || !c.images.length) { missTarget.push(`${ex.name} -> ${tName}`); continue; }
    const imgs = c.images.map(i => CDN + i);
    done++;
    if (WRITE) {
      await ExerciseGif.findByIdAndUpdate(ex._id, {
        animatedGifUrl: ex.animatedGifUrl || ex.gifUrl,
        gifUrl: imgs[imgs.length - 1] || imgs[0],
        images: imgs,
        animated: false,
        equipment: c.equipment,
        primaryMuscles: c.primaryMuscles || [],
        secondaryMuscles: c.secondaryMuscles || [],
        level: c.level,
        category: c.category,
        instructions: c.instructions || [],
        source: 'exercisedb+free',
      });
    }
    console.log(`  ✅ ${ex.name}  →  ${tName}`);
  }

  console.log(`\n${done} eşleşti (statiğe çevrildi), ${leftAnimated.length} animasyonlu kaldı: ${leftAnimated.join(', ')}`);
  if (missTarget.length) console.log('⚠️ HEDEF BULUNAMADI (haritayı düzelt):', missTarget.join('; '));
  if (!WRITE) console.log('(kuru koşu — yazmak için --write)');
  await mongoose.disconnect();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
