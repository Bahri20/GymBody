const mongoose = require('mongoose');

const exerciseGifSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  gifUrl: { type: String },          // gösterilecek ana görsel (animasyonlu GIF veya statik foto)
  animatedGifUrl: { type: String },  // eski animasyonlu GIF (uyum için statiğe geçince yedeklendi; geri dönülebilir)
  bodyPart: { type: String },        // TR kategori: Göğüs/Sırt/Bacak/Omuz/Biceps/Triceps/Karın/Kardiyo

  // --- zenginleştirilmiş alanlar (free-exercise-db import'u ile geldi) ---
  animated: { type: Boolean, default: false },   // true = animasyonlu GIF, false = statik foto
  equipment: { type: String },                   // barbell/dumbbell/cable/machine/body only ...
  primaryMuscles: [{ type: String }],
  secondaryMuscles: [{ type: String }],
  level: { type: String },                        // beginner/intermediate/advanced
  category: { type: String },                     // strength/stretching/cardio ...
  instructions: [{ type: String }],               // adım adım yapılış (orijinal, EN)
  instructionsTr: [{ type: String }],              // Türkçe çeviri (kütüphanede gösterilir)
  images: [{ type: String }],                     // statik kaynakta başlangıç+bitiş foto URL'leri
  source: { type: String, default: 'exercisedb' },// exercisedb (mevcut 57) | free-exercise-db (yeni)
});

module.exports = mongoose.model('ExerciseGif', exerciseGifSchema);
