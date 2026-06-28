const mongoose = require('mongoose');

// Birebir hoca ↔ öğrenci mesajı (kullanıcı↔arkadaş Message modelinden ayrı)
const coachMessageSchema = new mongoose.Schema({
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true, index: true },
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
  from:  { type: String, enum: ['coach', 'student'], required: true },
  text:  { type: String, required: true, maxlength: 2000 },
  readByCoach:   { type: Boolean, default: false },
  readByStudent: { type: Boolean, default: false },
}, { timestamps: true });

coachMessageSchema.index({ coach: 1, user: 1, createdAt: 1 });

module.exports = mongoose.model('CoachMessage', coachMessageSchema);
