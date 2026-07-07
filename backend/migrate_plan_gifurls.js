// Bir kerelik migration: kullanıcıların ZATEN OLUŞTURULMUŞ programlarındaki (weeklyPlan
// ve coachPlan) egzersiz gifUrl'leri, program oluşturulduğu andaki DB durumuna göre donmuştu.
// ExerciseGif koleksiyonu 57→346 egzersize çıkarılıp free-exercise-db 2-kareli görsellerine
// geçince, bu eski planlardaki gifUrl'ler güncellenmedi. Bu script isme göre yeniden eşleştirip
// günceller — set/tekrar/gün sırası gibi başka hiçbir şeye dokunmaz.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const ExerciseGif = require('./models/ExerciseGif');

const STOP = new Set(['the','a','an','with','and','to','of','for','on','in','-','&','your','one']);
const norm = (s) => (s || '').toLowerCase()
  .replace(/[()\/,.]/g, ' ')
  .split(/\s+/)
  .filter(w => w && !STOP.has(w));

function fuzzyMatch(name, exercises) {
  const aiWords = norm(name);
  if (!aiWords.length) return null;
  let best = null, bestScore = 0;
  for (const e of exercises) {
    const dbWords = norm(e.name);
    if (!dbWords.length) continue;
    const common = aiWords.filter(w => dbWords.includes(w)).length;
    if (!common) continue;
    const score = (common / aiWords.length) * (common / dbWords.length);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return bestScore >= 0.34 ? best : null;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB bağlandı');

  const allExercises = await ExerciseGif.find({}, 'name gifUrl');
  const byExactName = new Map(allExercises.map(e => [e.name.trim().toLowerCase(), e]));
  console.log(`📚 ${allExercises.length} egzersiz DB'den yüklendi`);

  const users = await User.find({
    $or: [
      { 'weeklyPlan.workoutPlan': { $exists: true, $ne: null } },
      { 'coachPlan.workoutPlan': { $exists: true, $ne: null } },
    ],
  });
  console.log(`👤 ${users.length} kullanıcı kontrol edilecek`);

  let usersTouched = 0, exercisesUpdated = 0, exercisesUnmatched = 0;

  for (const user of users) {
    let changed = false;

    const patchPlan = (workoutPlan) => {
      if (!Array.isArray(workoutPlan)) return;
      for (const day of workoutPlan) {
        if (!Array.isArray(day?.exercises)) continue;
        for (const ex of day.exercises) {
          const exact = byExactName.get((ex.name || '').trim().toLowerCase());
          const match = exact || fuzzyMatch(ex.name, allExercises);
          if (match && match.gifUrl && match.gifUrl !== ex.gifUrl) {
            ex.gifUrl = match.gifUrl;
            exercisesUpdated++;
            changed = true;
          } else if (!match) {
            exercisesUnmatched++;
          }
        }
      }
    };

    patchPlan(user.weeklyPlan?.workoutPlan);
    patchPlan(user.coachPlan?.workoutPlan);

    if (changed) {
      user.markModified('weeklyPlan.workoutPlan');
      user.markModified('coachPlan.workoutPlan');
      await user.save();
      usersTouched++;
    }
  }

  console.log(`\n🎉 Bitti — ${usersTouched} kullanıcı güncellendi, ${exercisesUpdated} egzersiz gifUrl'i tazelendi, ${exercisesUnmatched} eşleşmeyen (dokunulmadı).`);
  process.exit(0);
}

run().catch(err => { console.error('❌ Migration hatası:', err); process.exit(1); });
