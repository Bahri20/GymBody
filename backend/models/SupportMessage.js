const mongoose = require('mongoose');

// Hoca ile yönetim arasındaki destek yazışması. E-posta yerine site üzerinden:
// mesaj burada kalıcı duruyor, iki taraf da geçmişi ve okundu durumunu görebiliyor.
const supportMessageSchema = new mongoose.Schema({
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true, index: true },
  from: { type: String, enum: ['coach', 'admin'], required: true },
  text: { type: String, required: true, maxlength: 4000 },
  readByAdmin: { type: Boolean, default: false },
  readByCoach: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
