const mongoose = require('mongoose');

// Hoca (PT) programındaki bir antrenman gününün yapılma kaydı.
// GymBody'nin kendi weeklyPlan akışından (currentDay + /complete-day) ayrıdır:
// hoca planında "bugün" kavramı yok, öğrenci günü kendi seçiyor. Bu yüzden burada
// "plana uydu mu" değil, sadece "hangi tarihte hangi günü yaptı" tutulur; yorumu hoca yapar.
const coachWorkoutLogSchema = new mongoose.Schema({
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true, index: true },
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
  dayNumber: { type: Number },
  focus: { type: String },   // gün başlığı kopyası — hoca planı sonradan değişse de geçmiş okunabilir kalsın
  // Kayıt 'abandoned' olarak açılır: öğrenci uygulamayı kapatır ya da app çökerse
  // kayıt kendiliğinden "bitmedi" kalır. 'completed' ancak son set bitince yazılır.
  status: { type: String, enum: ['completed', 'abandoned'], default: 'abandoned' },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  totalExercises: { type: Number, default: 0 },
  doneExercises: { type: Number, default: 0 },
}, { timestamps: true });

coachWorkoutLogSchema.index({ user: 1, createdAt: -1 });
coachWorkoutLogSchema.index({ coach: 1, createdAt: -1 });

module.exports = mongoose.model('CoachWorkoutLog', coachWorkoutLogSchema);
