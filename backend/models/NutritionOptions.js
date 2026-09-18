const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  summary: String,
  suggestions: [{ mealName: String, description: String, calories: Number, protein: Number, carbs: Number, fat: Number, type: String, prepMinutes: Number }],
  createdAt: { type: Date, default: Date.now, expires: 604800 },
});
module.exports = mongoose.model('NutritionOptions', schema);
