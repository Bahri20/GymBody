const mongoose = require('mongoose');

const mealLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  mealName: { type: String },
  calories: { type: Number },
  protein: { type: Number },
  carbs: { type: Number },
  fat: { type: Number },
  description: { type: String }
});

module.exports = mongoose.model('MealLog', mealLogSchema);
