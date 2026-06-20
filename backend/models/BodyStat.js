const mongoose = require('mongoose');

const bodyStatSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  weight: { type: Number },
  height: { type: Number },
  waist: { type: Number },      // bel çevresi
  shoulder: { type: Number },   // omuz genişliği
  neck: { type: Number },       // boyun çevresi
  bodyFatPercentage: { type: Number }
});

module.exports = mongoose.model('BodyStat', bodyStatSchema);