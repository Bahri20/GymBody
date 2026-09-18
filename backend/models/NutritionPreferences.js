const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  pantry: { type: String, default: '', maxlength: 1000 },
  excluded: { type: String, default: '', maxlength: 600 },
  context: { type: String, enum: ['home', 'outside', 'budget'], default: 'home' },
  minutes: { type: Number, enum: [10, 15, 30, 60], default: 15 },
  earnedBadges: { type: [Number], default: [] },
});
module.exports = mongoose.model('NutritionPreferences', schema);
