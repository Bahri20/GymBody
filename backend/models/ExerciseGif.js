const mongoose = require('mongoose');

const exerciseGifSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  gifUrl: { type: String },
  bodyPart: { type: String }
});

module.exports = mongoose.model('ExerciseGif', exerciseGifSchema);