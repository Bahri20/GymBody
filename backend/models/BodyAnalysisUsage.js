const mongoose = require('mongoose');

// Tracks AI-analysis limits without retaining the user's source photo.
const bodyAnalysisUsageSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  bodyFatPercentage: { type: Number, required: true },
  date: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('BodyAnalysisUsage', bodyAnalysisUsageSchema);
