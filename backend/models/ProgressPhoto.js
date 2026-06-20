const mongoose = require('mongoose');

const progressPhotoSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  url: { type: String, required: true },
  public_id: { type: String },
  note: { type: String },
  date: { type: Date, default: Date.now },
  bodyFatPercentage: { type: Number },
  aiAnalysis: { type: String }
});

module.exports = mongoose.model('ProgressPhoto', progressPhotoSchema);