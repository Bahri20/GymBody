// Bir kerelik temizlik: 57→346 egzersiz migration'ında bazı hareketler (örn. Burpees,
// Kettlebell Swing) yeni free-exercise-db havuzunda karşılık bulamadı — bu yüzden
// migrate_plan_gifurls.js onları güncelleyemeden atladı ve kullanıcıların kayıtlı
// programlarında hâlâ eski Cloudinary gif'iyle donmuş kalıyorlar. Bu script, DB'de
// artık karşılığı olmayan (Cloudinary gif'li VE isimce eşleşmeyen) egzersizleri
// kullanıcıların weeklyPlan/coachPlan'ından tamamen kaldırır.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');
const ExerciseGif = require('./models/ExerciseGif');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB bağlandı');

  const allExercises = await ExerciseGif.find({}, 'name');
  const validNames = new Set(allExercises.map(e => e.name.trim().toLowerCase()));
  console.log(`📚 ${allExercises.length} geçerli egzersiz adı yüklendi`);

  const users = await User.find({
    $or: [
      { 'weeklyPlan.workoutPlan': { $exists: true, $ne: null } },
      { 'coachPlan.workoutPlan': { $exists: true, $ne: null } },
    ],
  });

  let usersTouched = 0, removedTotal = 0;
  const removedNames = new Map();

  for (const user of users) {
    let changed = false;

    const cleanPlan = (workoutPlan, label) => {
      if (!Array.isArray(workoutPlan)) return;
      for (const day of workoutPlan) {
        if (!Array.isArray(day?.exercises)) continue;
        const before = day.exercises.length;
        day.exercises = day.exercises.filter(ex => {
          const isOrphan = ex.gifUrl && /^https:\/\/res\.cloudinary\.com/.test(ex.gifUrl)
            && !validNames.has((ex.name || '').trim().toLowerCase());
          if (isOrphan) {
            removedNames.set(ex.name, (removedNames.get(ex.name) || 0) + 1);
            return false; // kaldır
          }
          return true; // koru
        });
        const removed = before - day.exercises.length;
        if (removed > 0) {
          removedTotal += removed;
          changed = true;
          console.log(`  ${user.name} | ${label} | gün ${day.dayNumber}: ${removed} hareket kaldırıldı`);
        }
      }
    };

    cleanPlan(user.weeklyPlan?.workoutPlan, 'weeklyPlan');
    cleanPlan(user.coachPlan?.workoutPlan, 'coachPlan');

    if (changed) {
      user.markModified('weeklyPlan.workoutPlan');
      user.markModified('coachPlan.workoutPlan');
      await user.save();
      usersTouched++;
    }
  }

  console.log(`\n🎉 Bitti — ${usersTouched} kullanıcı güncellendi, toplam ${removedTotal} yetim hareket kaldırıldı.`);
  console.log('Kaldırılanlar:', [...removedNames.entries()].map(([n, c]) => `${n} (${c})`).join(', '));
  process.exit(0);
}

run().catch(err => { console.error('❌ Temizlik hatası:', err); process.exit(1); });
