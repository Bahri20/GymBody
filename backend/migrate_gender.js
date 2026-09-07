// Tek seferlik: cinsiyet alanını kanonik 'male'/'female' değerlerine çevirir.
// Eski sürümler 'Erkek'/'Kadın' yazıyordu; rank eşikleri, BMR ve yağ oranı analizi
// artık tek bir normalizasyondan geçtiği için kayıtları da aynı yazıma getiriyoruz.
// Çalıştırma: MONGO_URI=... node migrate_gender.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

const norm = (g) => {
  const s = String(g || '').trim().toLowerCase();
  if (!s) return null;
  if (['female', 'kadın', 'kadin', 'woman', 'f'].includes(s)) return 'female';
  if (['male', 'erkek', 'man', 'm'].includes(s)) return 'male';
  return null;
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({ gender: { $exists: true, $ne: null } }, 'gender');
  let changed = 0, cleared = 0;
  for (const u of users) {
    const g = norm(u.gender);
    if (g === u.gender) continue;
    if (g) { u.gender = g; changed++; }
    else { u.gender = undefined; cleared++; }   // tanınmayan değer: boş bırak, kullanıcıya tekrar sorulsun
    await u.save();
  }
  console.log(`✅ ${changed} kayıt kanonik hale getirildi, ${cleared} tanınmayan değer temizlendi (toplam ${users.length}).`);
  await mongoose.disconnect();
})().catch((e) => { console.error('🔥 Migrasyon hatası:', e); process.exit(1); });
