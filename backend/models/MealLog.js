const mongoose = require('mongoose');

const mealLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  mealName: { type: String },
  calories: { type: Number },
  protein: { type: Number },
  carbs: { type: Number },
  fat: { type: Number },
  description: { type: String },
  imageUrl: { type: String },
  imagePublicId: { type: String },
  status: { type: String, enum: ['eaten', 'planned'], default: 'eaten' },
  source: { type: String, enum: ['scan', 'repeat', 'plan'], default: 'scan' },
  favorite: { type: Boolean, default: false },
  portion: { type: Number, default: 1 },
  revision: { type: Number, default: 0 },
  requestId: String,
  deletedAt: Date
});
mealLogSchema.index({ userId: 1, date: -1 });
mealLogSchema.index({ userId: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

module.exports = mongoose.model('MealLog', mealLogSchema);
