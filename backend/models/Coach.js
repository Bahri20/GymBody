const mongoose = require('mongoose');

const commissionEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: String,
  amount: Number,       // komisyon tutarı (TL)
  saleAmount: Number,   // orijinal satış tutarı
  rate: Number,         // yüzde oran (ör: 15)
  createdAt: { type: Date, default: Date.now }
});

const withdrawalSchema = new mongoose.Schema({
  amount: Number,
  status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending' },
  iban: String,
  requestedAt: { type: Date, default: Date.now },
  paidAt: Date
});

const coachSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  referralCode: { type: String, required: true, unique: true },
  gymCode: { type: String, uppercase: true, trim: true }, // salon kodu (ör. MLFT2) — hocaları salona göre grupla
  discountRate: { type: Number, default: 10 },      // kullanıcılara verilen indirim %
  commissionRate: { type: Number, default: 15 },    // hocaya giden komisyon %
  freeVipDays: { type: Number, default: 0 },        // kayıtta verilen ücretsiz VIP günü
  balance: { type: Number, default: 0 },            // birikmiş bakiye (TL)
  totalEarned: { type: Number, default: 0 },
  referredUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commissions: [commissionEntrySchema],
  withdrawals: [withdrawalSchema],
  isActive: { type: Boolean, default: true },
  notes: { type: String }  // admin notları
}, { timestamps: true });

module.exports = mongoose.model('Coach', coachSchema);
