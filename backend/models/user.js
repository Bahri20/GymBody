const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Google ile girenlerde şifre olmaz
  googleId: { type: String }, // Google hesap kimliği (sub)
  authProvider: { type: String, default: 'email' }, // 'email' | 'google'
  googlePhoto: { type: String }, // Google hesabından gelen profil fotoğrafı URL
  profilePhoto: { type: String }, // Kullanıcının kendi yüklediği profil fotoğrafı
  name: { type: String, required: true },
  height: { type: Number },
  weight: { type: Number },
  age: { type: Number },
  gender: { type: String },
  targetWeight: { type: Number },
  tokens: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastActivityDate: { type: Date },
  streakMilestonesClaimed: [{ type: Number }],
  beforeAfterClaimed: { type: Boolean, default: false },
  isVip: { type: Boolean, default: false },
  vipExpiresAt: { type: Date },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
  discountRate: { type: Number, default: 0 },
  pushToken: { type: String },
  badges: [{ type: String }],
  // Aylık rozetler — her ay performansa göre kazanılır, stack'lenir (Efsane ×2 gibi)
  // monthlyBadges: [{ period: '2026-06', tier: 'legend'|'elite'|'rising', score: 72 }]
  monthlyBadges: [{
    period: { type: String },   // YYYY-MM
    tier:   { type: String },   // legend | elite | rising
    score:  { type: Number },
    awardedAt: { type: Date, default: Date.now },
  }],
  // Güç sıralaması — temel bileşik hareketlerde max ağırlık (PR) ve geçmiş
  // lifts: { bench: { best: 80, history: [{ weight, date }] }, squat: {...}, ... }
  lifts: { type: mongoose.Schema.Types.Mixed, default: {} },
  onboarded: { type: Boolean, default: false }, // ilk giriş karşılama modalı gösterildi mi
  adRewardsToday: { type: Number, default: 0 }, // bugün izlenen ödüllü reklam sayısı
  adRewardDate: { type: String }, // YYYY-MM-DD (gün değişince sıfırlanır)
  weeklyPlan: {
    generatedAt: { type: Date },
    weekStart: { type: Date },
    trainingDaysPerWeek: { type: Number },
    cycleDays: { type: Number },
    totalDays: { type: Number },
    currentDay: { type: Number },
    lastDayCompletedAt: { type: Date },
    completedFully: { type: Boolean, default: false },
    started: { type: Boolean, default: false },
    workoutPlan: { type: mongoose.Schema.Types.Mixed },
    nutritionPlan: { type: mongoose.Schema.Types.Mixed }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);