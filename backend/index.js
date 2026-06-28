const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/auth');
const express = require('express');
const multer = require('multer');
const BodyStat = require('./models/BodyStat');
const ExerciseGif = require('./models/ExerciseGif');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const User = require('./models/user');
const Coach = require('./models/Coach');
const PromoCode = require('./models/PromoCode');
const ProgressPhoto = require('./models/ProgressPhoto');
const MealLog = require('./models/MealLog');
const CoachMessage = require('./models/CoachMessage');
const sharp = require('sharp');
const toDateString = (date) => date.toISOString().split('T')[0];
require('dotenv').config({ path: path.join(__dirname, '.env') });
const cloudinary = require('cloudinary').v2;
const appleSignin = require('apple-signin-auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client();
const axios = require('axios');

// Ödüllü reklam: VIP hariç, günde max 3, her izleme 5 token (200'lük VIP'e reklamla kolay ulaşılamaz)
const AD_DAILY_CAP = 3;
const AD_REWARD = 5;

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB bağlantısı başarılı!"))
  .catch((err) => console.error("🔥 MongoDB bağlantı hatası:", err));

const app = express();
// Render/proxy arkasında gerçek istemci IP'sini al — yoksa rate-limit TÜM kullanıcıları
// tek (proxy) IP sayar ve hepsini birden engeller. 1 = tek güvenilir proxy hop (Render).
app.set('trust proxy', 1);

// ─── GÜVENLİK MİDDLEWARE'LERİ ───────────────────────────────────────────────

// HTTP başlıklarını güvenli hale getirir (XSS, clickjacking, MIME sniffing vb.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // admin panel inline script kullanıyor
      scriptSrcAttr: ["'unsafe-inline'"],         // panel inline onclick/onkeydown handler'ları
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS — sadece kendi uygulamanı kabul et
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',   // Expo dev
  'exp://',                  // Expo Go
  'https://gymbody.onrender.com', // canlı (admin/PT panelleri)
];
app.use(cors({
  origin: (origin, cb) => {
    // origin yoksa (mobil uygulama, Postman, curl) geçir
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error('CORS: Bu kaynağa izin verilmiyor.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
}));

// JSON body boyutunu sınırla (DDoS / bellek taşması önlemi)
app.use(express.json({ limit: '10kb' }));

// MongoDB operatör enjeksiyonunu engelle ($where, $gt vb. field isimlerini temizler)
function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) { delete obj[key]; }
    else sanitizeObj(obj[key]);
  }
}
app.use((req, _res, next) => { sanitizeObj(req.body); next(); });

// ─── RATE LİMİTLER ───────────────────────────────────────────────────────────

// Genel API limiti — TÜM endpoint'lere uygulanır (IP başına)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 dakika
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderdin, 15 dakika sonra tekrar dene.' }
});
app.use(generalLimiter);

// Auth endpoint'leri için sıkı limit (brute force önlemi)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // kişi başı (trust proxy ile gerçek IP); başarılı girişler sayılmaz
  message: { error: 'Çok fazla giriş denemesi. 15 dakika bekle.' },
  skipSuccessfulRequests: true
});
app.use('/register', authLimiter);
app.use('/login', authLimiter);
app.use('/coach/login', authLimiter);
app.use('/admin/login', authLimiter);

// AI endpoint'leri için limit (pahalı Gemini çağrıları — fatura koruması)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 dakika
  max: 5,
  message: { error: 'AI isteği sınırına ulaştın, 1 dakika bekle.' }
});
app.use('/analyze-meal', aiLimiter);     // yemek analizi
app.use('/get-weekly-plan', aiLimiter);  // program üretimi
app.use('/ai-chat', aiLimiter);          // AI koç sohbeti
app.use('/upload-progress', aiLimiter);  // yağ oranı analizi

// ─────────────────────────────────────────────────────────────────────────────

// Kritik env değişkenlerini kontrol et
const REQUIRED_ENV = ['JWT_SECRET', 'MONGO_URI', 'CLOUDINARY_API_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'ADMIN_KEY'];
REQUIRED_ENV.forEach(key => {
  if (!process.env[key]) console.error(`⚠️  EKSİK ENV: ${key} tanımlı değil!`);
});
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('⚠️  GÜVENLİK: JWT_SECRET çok kısa! En az 32 karakter olmalı.');
}

app.use(express.static(path.join(__dirname, 'public')));
// ☁️ CLOUDINARY YAPILANDIRMASI 
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
async function generateWithRetry(model, prompt, imagePart, retries = 2) {
  const content = imagePart ? [prompt, imagePart] : [prompt];
  for (let i = 0; i <= retries; i++) {
    try {
      return await model.generateContent(content);
    } catch (err) {
      if (err.status === 503 && i < retries) {
        console.log(`⏳ 503 hatası, ${i + 1}. tekrar deneniyor...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        throw err;
      }
    }
  }
}

// Egzersiz adından en uygun GIF'i bulur. Eski sürüm "ilk benzeri" alıp yanlış GIF
// eşleştirebiliyordu; bu sürüm kelime kesişim oranına göre PUANLAYIP en iyisini seçer,
// çok zayıf eşleşmeyi reddeder (yanlış GIF göstermektense hiç gösterme).
function matchGifUrl(exerciseName, availableExercises) {
  // anlam taşımayan dolgu kelimeleri ele (yanlış eşleşmeyi azaltır)
  const STOP = new Set(['the','a','an','with','and','to','of','for','on','in','-','&','your','one']);
  const norm = (s) => (s || '').toLowerCase()
    .replace(/[()\/,.]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP.has(w));

  const aiWords = norm(exerciseName);
  if (aiWords.length === 0) return null;

  let best = null, bestScore = 0;
  for (const e of availableExercises) {
    const dbWords = norm(e.name);
    if (dbWords.length === 0) continue;
    const common = aiWords.filter(w => dbWords.includes(w)).length;
    if (common === 0) continue;
    // Jaccard benzeri skor: ortak kelimelerin HER İKİ isimdeki oranının çarpımı.
    // Böylece "press" tek kelimesi uzun bir isimle gevşek eşleşip yüksek puan alamaz.
    const score = (common / aiWords.length) * (common / dbWords.length);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  // Eşik: en az anlamlı bir örtüşme yoksa eşleştirme yapma (yanlış GIF'i engelle)
  return bestScore >= 0.34 ? best : null;
}
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
// Multer ayarı (RAM hafızasında tutma)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Sadece resim dosyaları kabul edilir kanka!'));
  }
});
// ================= 1. KAPISI: KAYIT OL =================
app.post('/register', async (req, res) => {
  try {
    const { email, password, name, height, weight, referralCode } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, şifre ve isim zorunlu kanka!" });
    }
    // Email format kontrolü
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Geçerli bir e-posta adresi gir." });
    }
    // Şifre minimum uzunluk
    if (password.length < 6) {
      return res.status(400).json({ error: "Şifre en az 6 karakter olmalı." });
    }
    // Alan uzunluk sınırları
    if (name.length > 60) return res.status(400).json({ error: "İsim çok uzun." });
    if (email.length > 100) return res.status(400).json({ error: "Email çok uzun." });

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) return res.status(400).json({ error: "Bu e-posta zaten kayıtlı kanka!" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Referral kodu varsa doğrula
    let coach = null;
    let discountRate = 0;
    if (referralCode) {
      coach = await Coach.findOne({ referralCode: referralCode.toLowerCase().trim(), isActive: true });
      if (coach) {
        discountRate = coach.discountRate;
        console.log(`🎯 Referral kodu bulundu: ${coach.name} (${coach.referralCode}) → %${discountRate} indirim`);
      }
    }

    // Tüm yeni kullanıcılara 1 gün ücretsiz VIP
    const isVip = true;
    const vipExpiresAt = new Date();
    vipExpiresAt.setDate(vipExpiresAt.getDate() + 1);

    const newUser = await User.create({
      email, password: hashedPassword, name, height, weight,
      referredBy: coach?._id || undefined,
      discountRate,
      isVip,
      vipExpiresAt
    });

    // Koçun referred listesine ekle
    if (coach) {
      await Coach.findByIdAndUpdate(coach._id, {
        $push: { referredUsers: newUser._id }
      });
    }

    const { password: _, ...safeUser } = newUser.toObject();
    const logMsg = coach ? `(${coach.name} referansıyla${isVip ? `, ${coach.freeVipDays} gün VIP verildi` : ''})` : '';
    console.log("👤 Yeni kullanıcı kaydedildi:", newUser.name, logMsg);
    res.status(201).json({
      message: "Kayıt başarılı kanka!",
      user: safeUser,
      referralBonus: coach ? { coachName: coach.name, discountRate, freeVipDays: coach.freeVipDays } : null
    });
  } catch (err) {
    console.error("🔥 Register Hatası:", err);
    res.status(500).json({ error: "Kayıt sırasında hata oluştu kanka." });
  }
});
// ================= 2. KAPISI: GİRİŞ YAP =================
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "E-posta veya şifre hatalı kanka!" });

    // Google ile açılmış hesapta şifre yok → şifreyle giriş yapamaz
    if (!user.password) {
      return res.status(400).json({ error: "Bu hesap Google ile açılmış, Google ile giriş yap kanka!" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "E-posta veya şifre hatalı kanka!" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '90d' });

    const { password: _, ...safeUser } = user.toObject();
    console.log("🔑 Kullanıcı giriş yaptı:", user.name);
    res.json({ message: "Giriş başarılı kanka!", token, user: safeUser });
  } catch (err) {
    console.error("🔥 Login Hatası:", err);
    res.status(500).json({ error: "Giriş sırasında hata oluştu kanka." });
  }
});

// ============== GOOGLE İLE GİRİŞ / KAYIT ==============
app.post('/google-login', async (req, res) => {
  try {
    const { idToken, accessToken } = req.body;
    if (!idToken && !accessToken) return res.status(400).json({ error: "Google token gerekli kanka!" });

    // İzin verilen tüm client ID'ler (web, iOS, android) — hangisi tanımlıysa
    const allowedAudiences = [
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter(Boolean);

    if (allowedAudiences.length === 0) {
      console.error("🔥 GOOGLE_*_CLIENT_ID .env'de tanımlı değil!");
      return res.status(500).json({ error: "Google girişi yapılandırılmamış." });
    }

    let email, googleId, name, emailVerified, googlePhoto;

    if (idToken) {
      // Tercih edilen yol: ID token'ı Google'ın kendisine doğrulat (client'a güvenme)
      const ticket = await googleClient.verifyIdToken({ idToken, audience: allowedAudiences });
      const payload = ticket.getPayload();
      email = payload?.email;
      googleId = payload?.sub;
      name = payload?.name;
      emailVerified = payload?.email_verified;
      googlePhoto = payload?.picture;
    } else {
      // Yedek yol: önce access token'ın audience'ını doğrula (token confusion / başka
      // uygulamanın token'ıyla giriş önlemi), sonra userinfo çek
      const { data: tokenInfo } = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
      );
      if (!tokenInfo.aud || !allowedAudiences.includes(tokenInfo.aud)) {
        return res.status(401).json({ error: "Google token bu uygulamaya ait değil." });
      }
      const { data } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      email = data?.email;
      googleId = data?.sub;
      name = data?.name;
      emailVerified = data?.email_verified;
      googlePhoto = data?.picture;
    }

    if (!email) return res.status(400).json({ error: "Google hesabından e-posta alınamadı." });
    if (emailVerified === false) return res.status(400).json({ error: "Google e-postan doğrulanmamış." });

    email = email.toLowerCase().trim();
    name = name || email.split('@')[0];

    let user = await User.findOne({ email });
    let isNew = false;

    if (!user) {
      // Yeni kullanıcı → kayıttaki gibi 1 gün ücretsiz VIP
      const vipExpiresAt = new Date();
      vipExpiresAt.setDate(vipExpiresAt.getDate() + 1);
      user = await User.create({
        email, name, googleId, authProvider: 'google',
        googlePhoto: googlePhoto || null,
        isVip: true, vipExpiresAt,
      });
      isNew = true;
      console.log("👤 Google ile yeni kullanıcı:", name);
    } else if (!user.googleId) {
      // Mevcut e-posta hesabını Google'a bağla
      user.googleId = googleId;
      if (googlePhoto) user.googlePhoto = googlePhoto;
      await user.save();
      console.log("🔗 Mevcut hesap Google'a bağlandı:", name);
    }

    // Her girişte Google fotoğrafını güncelle
    if (googlePhoto && user.googlePhoto !== googlePhoto) {
      user.googlePhoto = googlePhoto;
      await user.save();
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '90d' });
    const { password: _, ...safeUser } = user.toObject();
    res.json({ message: "Google girişi başarılı kanka!", token, user: safeUser, isNew });
  } catch (err) {
    console.error("🔥 Google Login Hatası:", err.message);
    res.status(401).json({ error: "Google girişi doğrulanamadı kanka." });
  }
});

// ============== APPLE İLE GİRİŞ / KAYIT (App Store 4.8 zorunlu) ==============
app.post('/apple-login', async (req, res) => {
  try {
    const { identityToken, fullName } = req.body;
    if (!identityToken) return res.status(400).json({ error: "Apple token gerekli." });

    // Apple identity token'ı doğrula (imza + audience)
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: 'com.gymbodyai.app',
      ignoreExpiration: false,
    });
    const appleId = payload.sub;
    if (!appleId) return res.status(401).json({ error: "Apple kimliği alınamadı." });
    let email = (payload.email || '').toLowerCase().trim();

    // Önce appleId, sonra (varsa) e-posta ile mevcut kullanıcıyı bul
    let user = await User.findOne({ appleId });
    if (!user && email) user = await User.findOne({ email });
    let isNew = false;

    if (!user) {
      // Apple gizli relay e-posta vermemişse appleId bazlı placeholder
      const finalEmail = email || `apple_${appleId.slice(-12)}@privaterelay.gymbodyai.com`;
      const name = (fullName && (fullName.givenName || fullName.familyName))
        ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim()
        : (email ? email.split('@')[0] : 'GymBody Üyesi');
      const vipExpiresAt = new Date();
      vipExpiresAt.setDate(vipExpiresAt.getDate() + 1); // kayıttaki gibi 1 gün VIP
      user = await User.create({
        email: finalEmail, name, appleId, authProvider: 'apple',
        isVip: true, vipExpiresAt,
      });
      isNew = true;
      console.log("👤 Apple ile yeni kullanıcı:", name);
    } else if (!user.appleId) {
      user.appleId = appleId; // mevcut hesabı Apple'a bağla
      await user.save();
      console.log("🔗 Mevcut hesap Apple'a bağlandı:", user.name);
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '90d' });
    const { password: _, ...safeUser } = user.toObject();
    res.json({ message: "Apple girişi başarılı!", token, user: safeUser, isNew });
  } catch (err) {
    console.error("🔥 Apple Login Hatası:", err.message);
    res.status(401).json({ error: "Apple girişi doğrulanamadı." });
  }
});

// Sağlık kontrolü — harici uptime pinger için (Render'ı uyutmamak)
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.put('/update-profile', authMiddleware, async (req, res) => {
  try {
    const allowed = ['name', 'height', 'weight', 'age', 'gender', 'targetWeight'];
    const update = {};
    for (const f of allowed) if (req.body[f] !== undefined) update[f] = req.body[f];

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      update,
      { new: true } // güncellenmiş hali döndür
    );

    if (!updatedUser) return res.status(404).json({ error: "Kullanıcı bulunamadı kanka!" });

    const { password: _, ...safeUser } = updatedUser.toObject();
    console.log("✏️ Profil güncellendi:", safeUser.name);
    res.json({ message: "Profil güncellendi kanka!", user: safeUser });
  } catch (err) {
    console.error("🔥 Profil Güncelleme Hatası:", err);
    res.status(500).json({ error: "Profil güncellenemedi." });
  }
});

// ---- PROFİL FOTOĞRAFI YÜKLEME ----
app.post('/upload-profile-photo', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fotoğraf gelmedi." });

    const resizedBuffer = await sharp(req.file.buffer)
      .resize({ width: 400, height: 400, fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'profile_photos', public_id: `user_${req.userId}`, overwrite: true },
        (err, result) => err ? reject(err) : resolve(result)
      ).end(resizedBuffer);
    });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { profilePhoto: uploadResult.secure_url },
      { new: true }
    );

    const { password: _, ...safeUser } = user.toObject();
    res.json({ message: "Profil fotoğrafı güncellendi!", user: safeUser });
  } catch (err) {
    console.error("🔥 Profil Foto Hatası:", err);
    res.status(500).json({ error: "Fotoğraf yüklenemedi." });
  }
});
// ================= 3. KAPISI: GELİŞİM FOTOĞRAFI YÜKLEME (Eski Çalışan Orijinal Stream Yöntemi) =================
app.post('/upload-progress', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { note } = req.body;
    const userId = req.userId;
    if (!req.file) return res.status(400).json({ error: "Fotoğraf gelmedi kanka!" });
    // Kullanıcının en güncel ölçülerini al
    const user = await User.findById(userId);
    const latestStat = await BodyStat.findOne({ userId }).sort({ date: -1 });
    const userMeasurements = {
    height: user?.height || latestStat?.height,
    weight: user?.weight || latestStat?.weight,
    waist: latestStat?.waist || null,
    shoulder: latestStat?.shoulder || null,
    neck: latestStat?.neck || null
};
      // 🔒 ANALİZ LİMİTİ — ücretsiz: haftada 1, VIP: günde max 3 (abuse/maliyet koruması)
    let canAnalyze = true;
    let limitReason = 'free'; // 'free' (haftalık) | 'vipDaily' (günlük VIP)
    const isVipActive = user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date());

    if (!isVipActive) {
      const lastAnalyzed = await ProgressPhoto.findOne({
        userId,
        bodyFatPercentage: { $ne: null }
      }).sort({ date: -1 });

      if (lastAnalyzed) {
        const daysSince = (Date.now() - new Date(lastAnalyzed.date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          canAnalyze = false;
        }
      }
    } else {
      // VIP: günde en fazla 3 vücut analizi
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayAnalyzed = await ProgressPhoto.countDocuments({
        userId,
        bodyFatPercentage: { $ne: null },
        date: { $gte: startOfDay }
      });
      if (todayAnalyzed >= 3) {
        canAnalyze = false;
        limitReason = 'vipDaily';
      }
    }
    console.log("📸 Gelişim fotoğrafı geldi, AI analizi başlıyor...");

// 🤖 GEMINI YAĞ ORANI ANALİZİ
    let bodyFatPercentage = null;
    let aiAnalysis = "";
    if (canAnalyze) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const resizedBuffer = await sharp(req.file.buffer)
          .resize({ width: 800, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        const imagePart = {
          inlineData: {
            data: resizedBuffer.toString("base64"),
            mimeType: "image/jpeg"
          }
        };

      const prompt = `
    Bu fotoğraftaki kişinin vücut yağ oranını tahmin et.
    Kişinin bilinen ölçüleri: Boy: ${userMeasurements.height || 'bilinmiyor'} cm, 
    Kilo: ${userMeasurements.weight || 'bilinmiyor'} kg
    ${userMeasurements.waist ? `, Bel çevresi: ${userMeasurements.waist} cm` : ''}
    ${userMeasurements.shoulder ? `, Omuz genişliği: ${userMeasurements.shoulder} cm` : ''}
    ${userMeasurements.neck ? `, Boyun çevresi: ${userMeasurements.neck} cm` : ''}
    
    Bu sayısal verileri VKİ (vücut kitle indeksi) hesaplamak ve görsel tahminle birleştirmek için kullan. 
    Tahminini sadece görsele değil, verilen boy/kilo bilgisine dayanarak da oluştur.
    
    Eğer fotoğrafta vücut net görünmüyorsa (kıyafet, açı, ışık sorunu vb.) bunu açıklamada belirt 
    ve bodyFatPercentage alanını null yap.
    Yalnızca aşağıdaki saf JSON formatında cevap ver, kod bloğu veya açıklama ekleme:
    {"bodyFatPercentage": 18.5, "analysis": "Kısa değerlendirme ve öneri mesajı"}
`;

const result = await generateWithRetry(model, prompt, imagePart);
      let responseText = result.response.text().trim();

      let cleanJson = responseText.trim();
      if (cleanJson.startsWith("```json")) cleanJson = cleanJson.substring(7);
      if (cleanJson.startsWith("```")) cleanJson = cleanJson.substring(3);
      if (cleanJson.endsWith("```")) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
      cleanJson = cleanJson.trim();

      const aiResult = JSON.parse(cleanJson);
      bodyFatPercentage = aiResult.bodyFatPercentage;
      aiAnalysis = aiResult.analysis;

      console.log("✅ AI Analizi tamamlandı:", aiResult);
    } catch (aiErr) {
      console.error("🔥 AI Analiz Hatası (foto yine kaydedilecek):", aiErr);
      aiAnalysis = "Analiz yapılamadı, farklı fotoğrafla deneyin.";
    }} else if (limitReason === 'vipDaily') {
      aiAnalysis = `Bugün için günlük vücut analizi limitine ulaştın (3). Yarın devam edebilirsin! 💪`;
      bodyFatPercentage = null;
    } else {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 7);
      aiAnalysis = `Ücretsiz analiz hakkın bu hafta kullanıldı. Sınırsız analiz için VIP'e geçebilirsin! Bir dahaki ücretsiz analiz: ${nextDate.toLocaleDateString('tr-TR')}`;
      bodyFatPercentage = null;
    }

// ☁️ CLOUDINARY YÜKLEME
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: `fitness_app_progress/${userId}` },
      async (error, result) => {
        if (error) {
          console.error("🔥 Cloudinary Stream Hatası:", error);
          return res.status(500).json({ error: "Cloudinary yüklemesi başarısız." });
        }

        try {
          const newPhoto = await ProgressPhoto.create({
            userId,
            url: result.secure_url,
            public_id: result.public_id,
            note: note || "Buz gibi idman bitti!",
            bodyFatPercentage,
            aiAnalysis
          });
        if (bodyFatPercentage !== null) {
          await BodyStat.create({
            userId,
            weight: userMeasurements.weight,
            height: userMeasurements.height,
            waist: userMeasurements.waist,
            shoulder: userMeasurements.shoulder,
            neck: userMeasurements.neck,
            bodyFatPercentage
          });
        }
// 🎯 STREAK & TOKEN GÜNCELLEME
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastActivity = user.lastActivityDate ? new Date(user.lastActivityDate) : null;
    if (lastActivity) lastActivity.setHours(0, 0, 0, 0);

    let tokensEarned = 0;
    let newStreak = user.streak || 0;

    if (!lastActivity || lastActivity.getTime() !== today.getTime()) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastActivity && lastActivity.getTime() === yesterday.getTime()) {
        newStreak = (user.streak || 0) + 1;
      } else {
        newStreak = 1;
      }

      tokensEarned += 2;

      const claimed = user.streakMilestonesClaimed || [];
      if (newStreak % 5 === 0 && !claimed.includes(newStreak)) {
        tokensEarned += 10;
        claimed.push(newStreak);
        user.streakMilestonesClaimed = claimed;
      }

      user.streak = newStreak;
      user.lastActivityDate = today;
    }

    // Önce/sonra bonus
    if (!user.beforeAfterClaimed && bodyFatPercentage !== null) {
      const analyzedCount = await ProgressPhoto.countDocuments({ userId, bodyFatPercentage: { $ne: null } });
      if (analyzedCount >= 2) {
        tokensEarned += 5;
        user.beforeAfterClaimed = true;
      }
    }

    user.tokens = (user.tokens || 0) + tokensEarned;
    await user.save();

console.log(`🎯 Streak: ${user.streak}, Token kazanıldı: +${tokensEarned}, Toplam token: ${user.tokens}`);
          console.log("✅ Fotoğraf ve analiz kaydedildi:", result.secure_url);
          return res.json({ message: "Fotoğraf başarıyla buluta yüklendi kanka!", photo: newPhoto });
        } catch (dbErr) {
          console.error("🔥 DB Kayıt Hatası:", dbErr);
          return res.status(500).json({ error: "Fotoğraf DB'ye kaydedilemedi." });
        }
      }
    );

    uploadStream.end(req.file.buffer);

  } catch (err) {
    console.error("🔥 Genel Yükleme Hatası:", err);
    res.status(500).json({ error: "Fotoğraf yüklenirken pürüz çıktı." });
  }
});
// ================= 4. KAPISI: GELİŞİM FOTOĞRAFLARINI GETİR =================
app.get('/get-progress-photos/:userId', authMiddleware, async (req, res) => {
  try {
    // Güvenlik: URL'deki userId yerine token'daki userId kullan
    const userPhotos = await ProgressPhoto.find({ userId: req.userId }).sort({ date: -1 }); // en yeni üstte
    console.log(`📡 Kullanıcı (${req.userId}) için ${userPhotos.length} adet gelişim fotosu gönderiliyor.`);
    res.json(userPhotos);
  } catch (err) {
    console.error("🔥 Foto Listeleme Hatası:", err);
    res.status(500).json({ error: "Fotoğraflar getirilemedi." });
  }
});
app.delete('/delete-progress/:photoId', authMiddleware, async (req, res) => {
  try {
    const photo = await ProgressPhoto.findById(req.params.photoId);

    if (!photo) return res.status(404).json({ error: "Fotoğraf bulunamadı kanka!" });

    // Güvenlik: sadece kendi fotoğrafını silebilsin
    if (photo.userId.toString() !== req.userId) {
      return res.status(403).json({ error: "Bu fotoğrafı silme yetkin yok kanka!" });
    }

    // Cloudinary'den sil
    if (photo.public_id) {
      await cloudinary.uploader.destroy(photo.public_id);
    }

    // DB'den sil
    await ProgressPhoto.findByIdAndDelete(req.params.photoId);

    console.log("🗑️ Fotoğraf silindi:", req.params.photoId);
    res.json({ message: "Fotoğraf silindi kanka!" });
  } catch (err) {
    console.error("🔥 Silme Hatası:", err);
    res.status(500).json({ error: "Fotoğraf silinemedi." });
  }
});
// Otomatik giriş: token geçerliyse güncel kullanıcıyı döndür
app.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı kanka!" });
    res.json({ user });
  } catch (err) {
    console.error("🔥 /me Hatası:", err);
    res.status(500).json({ error: "Kullanıcı getirilemedi." });
  }
});
// Güç sıralaması — bir hareketin PR'ını (max ağırlık) kaydet
app.post('/update-lift', authMiddleware, async (req, res) => {
  try {
    const { lift, weight, forceUpdate } = req.body;
    const allowed = ['bench', 'squat', 'deadlift', 'ohp', 'latpull', 'curl', 'lateral'];
    const w = parseFloat(weight);
    if (!allowed.includes(lift) || !(w > 0) || w > 1000) {
      return res.status(400).json({ error: "Geçersiz hareket veya ağırlık." });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

    // Gerçekçilik tavanı: vücut ağırlığına oranlı abartı kontrolü.
    // Katsayılar elit (elmas) eşiğinin ~1.7 katı — gerçek outlier'lara izin verir,
    // 100 kg birinin 100 kg lateral girmesi gibi absürt değerleri reddeder.
    // İLERİDE: aynı siklet + en üst rank kullanıcıların ortalamasına göre dinamikleştirilebilir.
    const MAX_RATIO = { bench: 2.5, squat: 3.6, deadlift: 4.5, ohp: 1.7, latpull: 2.3, curl: 1.4, lateral: 0.35 };
    const bw = (user.weight && user.weight > 0) ? user.weight : 70;
    const cap = Math.round(bw * MAX_RATIO[lift]);
    if (w > cap) {
      return res.status(400).json({ error: `Bu ${w} kg, kilona göre gerçekçi sınırın (~${cap} kg) üstünde görünüyor. Doğru girdiysen yeni dünya rekorun olabilir 💪 — emin misen tekrar dene.` });
    }

    const lifts = user.lifts || {};
    const entry = lifts[lift] || { best: 0, history: [] };
    entry.history = [...(entry.history || []), { weight: w, date: new Date() }].slice(-60);
    if (forceUpdate || w > (entry.best || 0)) entry.best = w;
    lifts[lift] = entry;
    user.lifts = lifts;
    user.markModified('lifts');
    await user.save();

    const newBadges = await checkAndAwardBadges(req.userId).catch(() => []);
    res.json({ message: "PR kaydedildi!", lifts: user.lifts, newBadges });
  } catch (err) {
    console.error("🔥 /update-lift Hatası:", err);
    res.status(500).json({ error: "PR kaydedilemedi." });
  }
});
// Güç sıralaması — siklet bazlı liderlik tablosu (5 kg siklet, mutlak kg, VIP'e özel)
app.get('/lift-leaderboard', authMiddleware, async (req, res) => {
  try {
    const { lift } = req.query;
    const allowed = ['bench', 'squat', 'deadlift', 'ohp', 'latpull', 'curl', 'lateral'];
    if (!allowed.includes(lift)) return res.status(400).json({ error: "Geçersiz hareket." });

    const me = await User.findById(req.userId);
    if (!me) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

    const now = new Date();
    const meVip = me.isVip && (!me.vipExpiresAt || me.vipExpiresAt > now);
    if (!meVip) return res.status(403).json({ error: "Bu özellik VIP'e özel kanka." });
    if (!me.weight) return res.status(400).json({ error: "Önce profilden kilonu gir." });

    // Cinsiyet normalize: 'female'/'Kadın' → female, diğer her şey male
    const normGender = (g) => {
      const s = String(g || '').toLowerCase();
      return (s === 'female' || s === 'kadın' || s === 'kadin') ? 'female' : 'male';
    };
    const myGender = normGender(me.gender);

    // 5 kg siklet: 97 → 95-100
    const bracketMin = Math.floor(me.weight / 5) * 5;
    const bracketMax = bracketMin + 5;

    // Aynı siklet + aynı cinsiyetteki herkesi çek, VIP + PR filtresini JS'te yap (lifts Mixed)
    const users = await User.find({
      weight: { $gte: bracketMin, $lt: bracketMax }
    }).select('name lifts weight isVip vipExpiresAt gender profilePhoto googlePhoto');

    const ranked = users
      .filter(u => u.isVip && (!u.vipExpiresAt || u.vipExpiresAt > now) && normGender(u.gender) === myGender)
      .map(u => ({ id: String(u._id), name: u.name || 'Anonim', best: u.lifts?.[lift]?.best || 0, photo: u.profilePhoto || u.googlePhoto || null }))
      .filter(u => u.best > 0)
      .sort((a, b) => b.best - a.best);

    // İsim maskele: "Bahri İlhan" → "Bahri İ."
    const mask = (n) => {
      const parts = String(n).trim().split(/\s+/);
      return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : parts[0];
    };

    const myId = String(me._id);
    const myRank = ranked.findIndex(u => u.id === myId) + 1; // 0 = listede yok (PR girilmemiş)
    const top = ranked.slice(0, 10);

    // İlk 10 için arkadaşlık durumlarını tek sorguda çek
    const topIds = top.map(u => u.id).filter(id => id !== myId);
    const friendships = await Friendship.find({
      $or: [
        { requesterId: myId, recipientId: { $in: topIds } },
        { recipientId: myId, requesterId: { $in: topIds } },
      ],
    }).catch(() => []);
    const friendStatusFor = (otherId) => {
      const fs = friendships.find(f => f.requesterId.equals(otherId) || f.recipientId.equals(otherId));
      if (!fs) return 'none';
      return fs.requesterId.equals(myId) ? `sent_${fs.status}` : `received_${fs.status}`;
    };

    const top10 = top.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: mask(u.name),
      best: u.best,
      photo: u.photo,
      isMe: u.id === myId,
      friendStatus: u.id === myId ? 'self' : friendStatusFor(u.id),
    }));

    res.json({
      bracket: `${bracketMin}-${bracketMax} kg`,
      gender: myGender,
      genderLabel: myGender === 'female' ? 'Kadın' : 'Erkek',
      total: ranked.length,
      myRank,
      myBest: me.lifts?.[lift]?.best || 0,
      top10
    });
  } catch (err) {
    console.error("🔥 /lift-leaderboard Hatası:", err);
    res.status(500).json({ error: "Sıralama getirilemedi." });
  }
});
// Güç sıralaması — kullanıcının TÜM hareketlerdeki siklet sırası (tek çağrı, inline gösterim için)
app.get('/my-lift-ranks', authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId);
    if (!me) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    const now = new Date();
    const meVip = me.isVip && (!me.vipExpiresAt || me.vipExpiresAt > now);
    if (!meVip || !me.weight) return res.json({ ranks: {}, bracket: null });

    const normGender = (g) => {
      const s = String(g || '').toLowerCase();
      return (s === 'female' || s === 'kadın' || s === 'kadin') ? 'female' : 'male';
    };
    const myGender = normGender(me.gender);

    const bracketMin = Math.floor(me.weight / 5) * 5;
    const bracketMax = bracketMin + 5;
    const bracket = `${bracketMin}-${bracketMax}`;

    const users = (await User.find({ weight: { $gte: bracketMin, $lt: bracketMax } })
      .select('lifts isVip vipExpiresAt gender'))
      .filter(u => u.isVip && (!u.vipExpiresAt || u.vipExpiresAt > now) && normGender(u.gender) === myGender);

    const lifts = ['bench', 'squat', 'deadlift', 'ohp', 'latpull', 'curl', 'lateral'];
    const myId = String(me._id);
    const ranks = {};
    for (const lift of lifts) {
      const sorted = users
        .map(u => ({ id: String(u._id), best: u.lifts?.[lift]?.best || 0 }))
        .filter(u => u.best > 0)
        .sort((a, b) => b.best - a.best);
      const r = sorted.findIndex(u => u.id === myId) + 1;
      if (r > 0) ranks[lift] = { rank: r, total: sorted.length };
    }
    res.json({ ranks, bracket });
  } catch (err) {
    console.error("🔥 /my-lift-ranks Hatası:", err);
    res.status(500).json({ error: "Sıralar getirilemedi." });
  }
});
// Ödüllü reklam izlendi → token ver (sunucu tarafı günlük sınır, VIP hariç)
app.post('/reward-ad-token', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

    const isVipActive = user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date());
    if (isVipActive) return res.status(403).json({ error: "VIP üyeler reklamla token kazanmaz." });

    const today = new Date().toISOString().split('T')[0];
    if (user.adRewardDate !== today) { user.adRewardDate = today; user.adRewardsToday = 0; }
    if ((user.adRewardsToday || 0) >= AD_DAILY_CAP) {
      return res.status(429).json({ error: "Bugünlük reklam hakkın doldu kanka.", remaining: 0 });
    }

    user.adRewardsToday = (user.adRewardsToday || 0) + 1;
    user.tokens = (user.tokens || 0) + AD_REWARD;
    await user.save();
    res.json({ tokens: user.tokens, reward: AD_REWARD, remaining: AD_DAILY_CAP - user.adRewardsToday });
  } catch (err) {
    console.error("🔥 Reward Ad Hatası:", err);
    res.status(500).json({ error: "Ödül verilemedi." });
  }
});
// İlk giriş karşılama modalı gösterildi → bir daha gösterme
app.post('/complete-onboarding', authMiddleware, async (req, res) => {
  try {
    const { goal, experience, daysPerWeek, location, restrictions } = req.body;
    const update = { onboarded: true };
    if (goal) update.onboardingData = { goal, experience, daysPerWeek: parseInt(daysPerWeek) || 4, location, restrictions };
    await User.findByIdAndUpdate(req.userId, update);
    res.json({ message: "ok" });
  } catch (err) {
    res.status(500).json({ error: "Onboarding güncellenemedi." });
  }
});
app.get('/get-user-stats', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı kanka!" });

    const isVipActive = user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date());

    const today = new Date().toISOString().split('T')[0];
    const usedToday = user.adRewardDate === today ? (user.adRewardsToday || 0) : 0;
    res.json({
      tokens: user.tokens || 0,
      streak: user.streak || 0,
      isVip: isVipActive,
      vipExpiresAt: user.vipExpiresAt || null,
      adRewardsRemaining: isVipActive ? 0 : Math.max(0, AD_DAILY_CAP - usedToday)
    });
  } catch (err) {
    console.error("🔥 User Stats Hatası:", err);
    res.status(500).json({ error: "İstatistikler getirilemedi." });
  }
});
app.post('/redeem-vip', authMiddleware, async (req, res) => {
  try {
    const VIP_COST = 200;

    // Atomik: yeterli token varsa tek işlemde düş — eşzamanlı istekte çift harcamayı önler
    const user = await User.findOneAndUpdate(
      { _id: req.userId, tokens: { $gte: VIP_COST } },
      { $inc: { tokens: -VIP_COST } },
      { new: true }
    );
    if (!user) {
      const exists = await User.findById(req.userId);
      if (!exists) return res.status(404).json({ error: "Kullanıcı bulunamadı kanka!" });
      return res.status(400).json({ error: `Yetersiz token! ${VIP_COST} token gerekiyor, sende ${exists.tokens || 0} token var.` });
    }

    // Eğer aktif VIP süresi varsa üzerine ekle, yoksa şimdiden başlat
    const now = new Date();
    const currentExpiry = (user.vipExpiresAt && user.vipExpiresAt > now) ? user.vipExpiresAt : now;
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + 30);

    user.isVip = true;
    user.vipExpiresAt = newExpiry;

    await user.save();

    // Referral komisyon hesapla
    const VIP_PRICE_TL = 149; // VIP'in TL fiyatı
    if (user.referredBy) {
      const coach = await Coach.findById(user.referredBy);
      if (coach && coach.isActive) {
        const commissionAmount = Math.round(VIP_PRICE_TL * (coach.commissionRate / 100) * 100) / 100;
        coach.balance += commissionAmount;
        coach.totalEarned += commissionAmount;
        coach.commissions.push({
          userId: user._id,
          userName: user.name,
          amount: commissionAmount,
          saleAmount: VIP_PRICE_TL,
          rate: coach.commissionRate
        });
        await coach.save();
        console.log(`💰 Komisyon: ${coach.name} → +${commissionAmount} TL (${user.name}'ın VIP alımı)`);
      }
    }

    console.log(`👑 VIP açıldı: ${user.email}, bitiş: ${newExpiry}`);
    res.json({
      message: "VIP başarıyla aktifleştirildi! 🎉",
      tokens: user.tokens,
      isVip: true,
      vipExpiresAt: user.vipExpiresAt
    });
  } catch (err) {
    console.error("🔥 VIP Redeem Hatası:", err);
    res.status(500).json({ error: "VIP aktifleştirilemedi." });
  }
});
// ================= 5. KAPISI: GEMINI YEMEK ANALİZİ =================
app.post('/analyze-meal', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fotoğraf gelmedi!" });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "API anahtarı .env dosyasında yok kanka!" });

    // Günlük tarama limiti: 2 adet
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await MealLog.countDocuments({ userId: req.userId, date: { $gte: startOfDay } });
    const user = await User.findById(req.userId);
    const isVipActive = user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date());

if (!isVipActive && todayCount >= 2) {
  return res.status(429).json({ error: "Bugünlük tarama hakkın doldu kanka! Yarın tekrar dene veya VIP'e geç. 😉" });
}
// VIP'te de günlük üst sınır (abuse/maliyet koruması)
if (isVipActive && todayCount >= 5) {
  return res.status(429).json({ error: "Bugün için günlük yemek analizi limitine ulaştın (5). Yarın devam edebilirsin! 💪" });
}

    const { note } = req.body;

    console.log("📸 Yapay zeka analizi tetiklendi...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const resizedBuffer = await sharp(req.file.buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

    const imagePart = {
     inlineData: { 
     data: resizedBuffer.toString("base64"), 
     mimeType: "image/jpeg" 
  }
};

    const prompt = `
      Bu yemek fotoğrafını analiz et. Kalori, protein, karbonhidrat ve yağ değerlerini tahmin et.
      ${note ? `Kullanıcının verdiği ek bilgi: "${note}". Bu bilgiyi analizde mutlaka dikkate al.` : ''}
      Yalnızca ve yalnızca aşağıdaki saf JSON formatında cevap ver, kod blokları (\`\`\`) veya açıklama ekleme:
      {"mealName": "Yemeğin Adı", "calories": 500, "protein": 30, "carbs": 50, "fat": 15, "description": "Tavsiye mesajı"}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([prompt, imagePart]);
    let responseText = result.response.text().trim();
    
    console.log("🤖 AI'dan gelen ham metin:", responseText);

    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```json")) cleanJson = cleanJson.substring(7);
    if (cleanJson.startsWith("```")) cleanJson = cleanJson.substring(3);
    if (cleanJson.endsWith("```")) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
    cleanJson = cleanJson.trim();

    const mealData = JSON.parse(cleanJson);

    // 📒 Öğünü kullanıcının günlüğüne kaydet (gün gün takip için)
    const savedLog = await MealLog.create({
      userId: req.userId,
      mealName: mealData.mealName,
      calories: mealData.calories ?? 0,
      protein: mealData.protein ?? 0,
      carbs: mealData.carbs ?? 0,
      fat: mealData.fat ?? 0,
      description: mealData.description
    });

    console.log("✅ AI Başarılı:", mealData.mealName);
    res.json({ ...mealData, _id: savedLog._id, remainingRights: Math.max(0, 2 - (todayCount + 1)) });
  } catch (error) {
    console.error("🔥 AI Hatası:", error);
    res.status(500).json({ error: "Yapay zeka tabağı çözemedi kanka." });
  }
});
app.post('/add-body-stat', authMiddleware, async (req, res) => {
  try {
    const { weight, height, waist, shoulder, neck } = req.body;

    const newStat = await BodyStat.create({
      userId: req.userId,
      weight: weight || null,
      height: height || null,
      waist: waist || null,
      shoulder: shoulder || null,
      neck: neck || null
    });

    // Eğer boy/kilo girildiyse, User profilini de güncelle (senkron kalsın)
    if (weight || height) {
      const updateData = {};
      if (weight) updateData.weight = weight;
      if (height) updateData.height = height;
      await User.findByIdAndUpdate(req.userId, updateData);
    }

    console.log("📊 Yeni ölçü kaydı eklendi:", req.userId);
    res.json({ message: "Ölçüler kaydedildi kanka!", stat: newStat });
  } catch (err) {
    console.error("🔥 BodyStat Kayıt Hatası:", err);
    res.status(500).json({ error: "Ölçüler kaydedilemedi." });
  }
});
app.get('/get-body-stats', authMiddleware, async (req, res) => {
  try {
    const stats = await BodyStat.find({ userId: req.userId }).sort({ date: 1 }); // eskiden yeniye
    res.json(stats);
  } catch (err) {
    console.error("🔥 BodyStat Listeleme Hatası:", err);
    res.status(500).json({ error: "Veriler getirilemedi." });
  }
});
// Tek bir ölçü kaydını güncelle (yanlış girilen değeri düzeltmek için)
app.put('/body-stat/:id', authMiddleware, async (req, res) => {
  try {
    const { weight, height, waist, shoulder, neck } = req.body;
    // sadece gönderilen alanları güncelle (boş gelenlere dokunma)
    const fields = { weight, height, waist, shoulder, neck };
    const update = {};
    Object.keys(fields).forEach(k => { if (fields[k] !== undefined) update[k] = fields[k] || null; });

    // kayıt bu kullanıcıya mı ait? (başkasının kaydını düzeltemesin)
    const stat = await BodyStat.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      update,
      { new: true }
    );
    if (!stat) return res.status(404).json({ error: "Kayıt bulunamadı." });

    // boy/kilo düzeltildiyse profili de senkron tut
    if (weight || height) {
      const profileUpdate = {};
      if (weight) profileUpdate.weight = weight;
      if (height) profileUpdate.height = height;
      await User.findByIdAndUpdate(req.userId, profileUpdate);
    }
    res.json({ message: "Ölçü güncellendi kanka!", stat });
  } catch (err) {
    console.error("🔥 BodyStat Güncelleme Hatası:", err);
    res.status(500).json({ error: "Güncellenemedi." });
  }
});
// Tek bir ölçü kaydını sil (yanlış/fazladan girilen kaydı kaldırmak için)
app.delete('/body-stat/:id', authMiddleware, async (req, res) => {
  try {
    const stat = await BodyStat.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!stat) return res.status(404).json({ error: "Kayıt bulunamadı." });
    res.json({ message: "Ölçü silindi kanka!" });
  } catch (err) {
    console.error("🔥 BodyStat Silme Hatası:", err);
    res.status(500).json({ error: "Silinemedi." });
  }
});
app.post('/get-weekly-plan', authMiddleware, async (req, res) => {
  try {
    const { allergy, feedback, goal } = req.body;
    const goalLabels = {
      definition: 'Definasyon (yağ yakma, kalori açığı)',
      bulk: 'Bulk (kas kazanımı, kalori fazlası)',
      maintain: 'Koruma (mevcut formu koruma)',
    };
    const goalText = goalLabels[goal] || 'Definasyon (yağ yakma)';
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı kanka!" });

    const od = user.onboardingData || {};
    const programDays = od.daysPerWeek && [2,3,4,5].includes(od.daysPerWeek) ? od.daysPerWeek : 3;
    const experienceText = { beginner: 'Yeni başlayan (0-1 yıl)', intermediate: 'Orta seviye (1-3 yıl)', advanced: 'İleri seviye (3+ yıl)' }[od.experience] || 'Orta seviye';
    const locationText = { gym: 'Spor salonu (tam ekipman)', home_equipped: 'Ev (dambıl, bant vs.)', home_bare: 'Ev (ekipmansız, sadece vücut ağırlığı)' }[od.location] || 'Spor salonu';
    const restrictionsText = od.restrictions && od.restrictions !== 'none' ? `Kısıtlama: ${od.restrictions} sorunu var — o bölgeyi zorlayan egzersizlerden kaçın` : 'Fiziksel kısıtlama yok';

    const isVipActive = user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date());
    if (!isVipActive) {
      return res.status(403).json({ error: "Bu özellik sadece VIP üyeler için kanka!" });
    }

    const existingPlan = user.weeklyPlan;

    // ARTIK TAKVİM HAFTASINA GÖRE DEĞİL: program tamamlanana kadar aynı plan dönüyor
    const planIsActive = existingPlan && !existingPlan.completedFully && existingPlan.workoutPlan?.length > 0;
    if (planIsActive) {
      console.log(`📋 Devam eden program döndürülüyor (Gün ${existingPlan.currentDay}/${existingPlan.totalDays})`);
      // gifUrl'leri her seferinde DB'den taze eşleştir (eksik/null olabilir)
      const gifExercises = await ExerciseGif.find({}, 'name gifUrl');
      existingPlan.workoutPlan?.forEach((day) => {
        day.exercises?.forEach((ex) => {
          if (!ex.gifUrl) {
            const match = matchGifUrl(ex.name, gifExercises);
            if (match) {
              ex.name = match.name;
              ex.gifUrl = match.gifUrl;
            }
          }
        });
      });
      user.markModified('weeklyPlan');
      await user.save();
      return res.json(existingPlan);
    }

    console.log("🤖 Yeni program üretiliyor...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // temperature yüksek → her üretimde farklı egzersiz varyasyonları (aynı program tekrarını önler)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 1.0 },
    });

    const latestStat = await BodyStat.findOne({ userId: req.userId }).sort({ date: -1 });
    const bodyFat = latestStat?.bodyFatPercentage;

    const gAge = user.age;
    const uW = user.weight, uH = user.height;
    let dailyCalorieTarget = 2000;
    if (uW && uH && gAge) {
      const bmr = 10 * uW + 6.25 * uH - 5 * gAge + (user.gender === 'female' ? -161 : 5);
      const tdee = bmr * 1.375;
      if (user.targetWeight && user.targetWeight < uW) dailyCalorieTarget = Math.round(tdee - 500);
      else if (user.targetWeight && user.targetWeight > uW) dailyCalorieTarget = Math.round(tdee + 300);
      else dailyCalorieTarget = Math.round(tdee);
    }

    // GIF'i olan egzersizleri çek — AI sadece bunlardan seçecek (constrained generation)
    const availableExercises = await ExerciseGif.find({}, 'name bodyPart gifUrl');
    // Listeyi her üretimde karıştır → AI hep aynı ilk egzersizleri seçmesin, çeşitlilik artsın
    const shuffledExercises = [...availableExercises].sort(() => Math.random() - 0.5);
    const exerciseListText = shuffledExercises.map(e => e.name).join(', ');

    const DAY_STRUCTURES = {
      2: [
        { focus: 'Göğüs & Triceps & Omuz', rules: '4 göğüs + 2 triceps + 2 omuz + 2 karın/kardiyo' },
        { focus: 'Sırt & Biceps & Bacak',  rules: '4 sırt + 2 biceps + 3 bacak + 2 karın/kardiyo' },
      ],
      3: [
        { focus: 'Göğüs & Triceps', rules: '4 göğüs + 2 triceps + 2 karın/kardiyo' },
        { focus: 'Sırt & Biceps',   rules: '4 sırt + 2 biceps + 2 karın/kardiyo' },
        { focus: 'Omuz & Bacak',    rules: '3-4 omuz + 3-4 bacak + 2 karın/kardiyo' },
      ],
      4: [
        { focus: 'Göğüs & Triceps', rules: '4 göğüs + 2 triceps + 2 karın/kardiyo' },
        { focus: 'Sırt & Biceps',   rules: '4 sırt + 2 biceps + 2 karın/kardiyo' },
        { focus: 'Omuz',            rules: '4 omuz + 3 karın/kardiyo' },
        { focus: 'Bacak',           rules: '5 bacak + 2 karın/kardiyo' },
      ],
      5: [
        { focus: 'Göğüs & Triceps', rules: '4 göğüs + 2 triceps + 2 karın/kardiyo' },
        { focus: 'Sırt & Biceps',   rules: '4 sırt + 2 biceps + 2 karın/kardiyo' },
        { focus: 'Omuz',            rules: '4 omuz + 3 karın/kardiyo' },
        { focus: 'Bacak',           rules: '5 bacak + 2 karın/kardiyo' },
        { focus: 'Kol & Karın',     rules: '2 biceps + 2 triceps + 4 karın/kardiyo' },
      ],
    };
    const dayStructure = DAY_STRUCTURES[programDays] || DAY_STRUCTURES[3];
    const dayStructureText = dayStructure.map((d, i) =>
      `  Gün ${i + 1} — ${d.focus}: ${d.rules}`
    ).join('\n');

    const prevPlan = user.weeklyPlan;
    const dayFeedbacksText = prevPlan?.workoutPlan?.filter(d => d.feedback)
      .map(d => `  • ${d.dayNumber}. gün (${d.focus}): "${d.feedback}"`).join('\n') || '';
    const prevExercisesText = prevPlan?.workoutPlan
      ?.flatMap(d => d.exercises?.map(e => e.name) || []).join(', ') || '';

    // Yağ oranına göre beslenme direktifi
    let fatDirective = '';
    if (bodyFat != null) {
      if (bodyFat >= 25) {
        fatDirective = `Kullanıcının yağ oranı yüksek (%${bodyFat}). Beslenme planı: yüksek protein (vücut ağırlığının 2-2.2g/kg), düşük karbonhidrat (günlük karbonhidratların büyük kısmı antrenman saatine yığ), düşük işlenmiş şeker, lifli sebzeler ön planda. Porsiyon kontrolü vurgula. Kalori açığı kesinlikle korunmalı.`;
      } else if (bodyFat >= 18) {
        fatDirective = `Kullanıcının yağ oranı orta (%${bodyFat}). Beslenme planı: orta-yüksek protein (vücut ağırlığının 1.8-2g/kg), orta karbonhidrat (antrenman günleri biraz fazla, dinlenme günleri biraz az), sağlıklı yağlar ılımlı. Sürdürülebilir kalori açığı veya idame, hedefe göre.`;
      } else if (bodyFat >= 12) {
        fatDirective = `Kullanıcının yağ oranı iyi (%${bodyFat}). Beslenme planı: yüksek protein (vücut ağırlığının 1.8g/kg), karbonhidrat döngüsü (antrenman günleri yüksek karbonhidrat, dinlenme günleri düşük), kas kayıp olmaması için kalori açığını az tut.`;
      } else {
        fatDirective = `Kullanıcının yağ oranı çok düşük/atletik (%${bodyFat}). Beslenme planı: yüksek protein (vücut ağırlığının 1.8-2g/kg), yüksek karbonhidrat (performans ve kas için), sağlıklı yağlar bol. Kalori fazlası veya idame önerilir, kesinlikle açık kalori kesme.`;
      }
    }

    const prompt = `
Sen bir kişisel antrenör ve diyetisyensin. Aşağıdaki bilgilere göre ${programDays} günlük döngü antrenman ve beslenme programı hazırla:

- Boy: ${uH || 'bilinmiyor'} cm, Kilo: ${uW || 'bilinmiyor'} kg
- Yaş: ${gAge || 'bilinmiyor'}, Cinsiyet: ${user.gender || 'bilinmiyor'}
- Vücut yağ oranı: ${bodyFat != null ? '%' + bodyFat : 'bilinmiyor'}
- Hedef kilo: ${user.targetWeight || 'belirtilmemiş'}
- Günlük kalori hedefi: ${dailyCalorieTarget} kcal
- Döngü uzunluğu: ${programDays} gün
- Beslenme hedefi: ${goalText}
- Deneyim seviyesi: ${experienceText}
- Antrenman yeri: ${locationText}
- ${restrictionsText}
- Alerji/kısıtlama: ${allergy || 'yok'}
${fatDirective ? `- BESLENME DİREKTİFİ (MUTLAKA UYGULA): ${fatDirective}` : ''}
- Önceki programa genel kullanıcı yorumu: ${feedback || 'yok'}
${dayFeedbacksText ? `- Önceki programın günlük geri bildirimleri (mutlaka dikkate al):\n${dayFeedbacksText}` : ''}
${prevExercisesText ? `- Önceki döngüde kullanılan egzersizler (bunları TEKRAR KULLANMA, tamamen farklı varyasyonlar seç): ${prevExercisesText}` : ''}

GÜN YAPISI — BU KURALLARA HARFIYEN UY, DEĞIŞTIRME:
${dayStructureText}

KURALLAR:
- "Pazartesi" gibi takvim isimleri KULLANMA, sadece dayNumber (1'den ${programDays}'e kadar) kullan
- Egzersiz adını YALNIZCA şu listeden seç: ${exerciseListText}
- Aynı egzersiz tüm program boyunca yalnızca 1 kez kullanılabilir
- ÇEŞİTLİLİK ÖNEMLİ: her zaman aynı temel egzersizleri (örn. sadece bench press, squat) seçme; listedeki farklı varyasyonlardan dengeli ve değişken bir seçim yap
- Set/tekrar: bileşik harekette 4x6-8, izole harekette 3x10-12

Beslenme planı için: ${programDays} günün her birine günlük örnek öğün listesi ver, kalori hedefine yakın olsun.

Yalnızca aşağıdaki saf JSON formatında cevap ver, kod bloğu veya açıklama ekleme:
{
  "workoutPlan": [
    { "dayNumber": 1, "focus": "Göğüs & Triceps", "exercises": [{"name": "Bench Press", "sets": "4x8"}] }
  ],
  "nutritionPlan": [
    { "dayNumber": 1, "meals": [{"name": "Kahvaltı", "items": "Yulaf, yumurta, meyve", "calories": 450}], "totalCalories": ${dailyCalorieTarget} }
  ]
}
`;

    const result = await generateWithRetry(model, prompt, null);
    let responseText = result.response.text().trim();
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith("```json")) cleanJson = cleanJson.substring(7);
    if (cleanJson.startsWith("```")) cleanJson = cleanJson.substring(3);
    if (cleanJson.endsWith("```")) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
    cleanJson = cleanJson.trim();

    const planData = JSON.parse(cleanJson);

    // Önce her egzersizi DB'deki kanonik isme/gifUrl'e eşle
    planData.workoutPlan.forEach((day, index) => {
      day.dayNumber = index + 1;
      day.completed = false;

      day.exercises.forEach(ex => {
        const matchedExercise = matchGifUrl(ex.name, availableExercises);
        if (matchedExercise) {
          console.log(`🤖 AI: ${ex.name} ---> ✅ ${matchedExercise.name}`);
          ex.name = matchedExercise.name;
          ex.gifUrl = matchedExercise.gifUrl;
        } else {
          console.log(`🤖 AI: ${ex.name} ---> ❌ BULUNAMADI`);
          ex.gifUrl = null;
        }
      });
    });

    // Eşleştirmeden SONRA tekrarları temizle — farklı AI isimleri (Bench Press, Barbell Bench Press)
    // aynı egzersize eşlenince çift oluyordu; kanonik isme göre dedup
    const usedExercises = new Set();
    planData.workoutPlan.forEach(day => {
      day.exercises = day.exercises.filter(ex => {
        const key = ex.name.toLowerCase().trim();
        if (usedExercises.has(key)) {
          console.log(`⚠️ Tekrar eden egzersiz çıkarıldı: ${ex.name}`);
          return false;
        }
        usedExercises.add(key);
        return true;
      });
    });

    // Beslenme Planı: Gün numaralarını ekliyoruz
    planData.nutritionPlan.forEach((day, index) => { 
      day.dayNumber = index + 1; 
      day.completed = false; 
    });

    user.weeklyPlan = {
      generatedAt: new Date(),
      trainingDaysPerWeek: programDays,
      cycleDays: programDays,
      totalDays: programDays,
      currentDay: 1,
      lastDayCompletedAt: null,
      completedFully: false,
      started: false, // kullanıcı "Programa Başla" deyene kadar intro gösterilir
      workoutPlan: planData.workoutPlan,
      nutritionPlan: planData.nutritionPlan
    };
    await user.save();

    console.log("✅ Program oluşturuldu ve kaydedildi");
    res.json(user.weeklyPlan);

  } catch (err) {
    console.error("🔥 Program Hatası:", err);
    res.status(500).json({ error: "Program oluşturulamadı." });
  }
});
// ================= PROGRAMA BAŞLA (intro'dan sonra) =================
app.post('/start-program', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.weeklyPlan) return res.status(404).json({ error: "Aktif program yok." });
    user.weeklyPlan.started = true;
    user.markModified('weeklyPlan');
    await user.save();
    res.json(user.weeklyPlan);
  } catch (err) {
    console.error("🔥 Start Program Hatası:", err);
    res.status(500).json({ error: "Program başlatılamadı." });
  }
});
// ================= PLAN SIFIRLA =================
app.post('/reset-plan', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { $unset: { weeklyPlan: "" } });
    res.json({ message: "Program sıfırlandı." });
  } catch (err) {
    res.status(500).json({ error: "Plan sıfırlanamadı." });
  }
});
// ================= ÖĞÜN GÜNLÜĞÜNÜ GETİR =================
app.get('/get-meal-logs', authMiddleware, async (req, res) => {
  try {
    const logs = await MealLog.find({ userId: req.userId }).sort({ date: -1 }); // yeniden eskiye
    res.json(logs);
  } catch (err) {
    console.error("🔥 MealLog Listeleme Hatası:", err);
    res.status(500).json({ error: "Öğün kayıtları getirilemedi." });
  }
});
app.post('/complete-day', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const plan = user?.weeklyPlan;
    if (!plan || !plan.workoutPlan?.length) {
      return res.status(400).json({ error: "Aktif bir program bulunamadı." });
    }

    const today = toDateString(new Date());
    if (plan.lastDayCompletedAt && toDateString(plan.lastDayCompletedAt) === today) {
      return res.status(429).json({ error: "Bugün için zaten bir gün tamamladın, yarın devam edebilirsin." });
    }

    const { dailyFeedback } = req.body;

    const workoutDay = plan.workoutPlan.find(d => d.dayNumber === plan.currentDay);
    const nutritionDay = plan.nutritionPlan.find(d => d.dayNumber === plan.currentDay);
    if (workoutDay) {
      workoutDay.completed = true;
      if (dailyFeedback?.trim()) workoutDay.feedback = dailyFeedback.trim();
    }
    if (nutritionDay) nutritionDay.completed = true;

    plan.lastDayCompletedAt = new Date();

    const isLastDay = plan.currentDay >= plan.totalDays;
    if (isLastDay) plan.completedFully = true;
    else plan.currentDay += 1;

    user.weeklyPlan = plan;
    user.markModified('weeklyPlan');
    await user.save();

    // Rozet kontrol (async, cevabı bekletmez)
    const newBadges = await checkAndAwardBadges(req.userId).catch(() => []);

    res.json({ success: true, isLastDay, weeklyPlan: user.weeklyPlan, newBadges });
  } catch (err) {
    console.error("🔥 Gün tamamlama hatası:", err);
    res.status(500).json({ error: "Gün tamamlanamadı." });
  }
});
// ================= GIF PROXY =================
app.get('/gif-proxy', authMiddleware, async (req, res) => {
  try {
    const { url } = req.query;
    const isWorkoutx = url && url.startsWith('https://api.workoutxapp.com/');
    const isCloudinary = url && /^https:\/\/res\.cloudinary\.com\//.test(url);
    if (!isWorkoutx && !isCloudinary) {
      return res.status(400).json({ error: "Geçersiz URL" });
    }
    const https = require('https');
    // Cloudinary genel erişimli (api-key gerekmez); workoutx için anahtar ekle
    const proxyUrl = isWorkoutx ? `${url}?api-key=${process.env.WORKOUTX_API_KEY}` : url;
    const gifReq = https.get(proxyUrl, (gifRes) => {
      res.setHeader('Content-Type', gifRes.headers['content-type'] || 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      gifRes.pipe(res);
    });
    gifReq.on('error', () => res.status(500).json({ error: "GIF yüklenemedi" }));
  } catch (err) {
    res.status(500).json({ error: "GIF proxy hatası" });
  }
});
// ==================== PUSH TOKEN ====================
app.post('/save-push-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken) return res.status(400).json({ error: "Token yok." });
    await User.findByIdAndUpdate(req.userId, { pushToken });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Push token kaydedilemedi." });
  }
});

// ==================== HAFTALIK ÖZET ====================
app.get('/weekly-summary', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

    const MealLog = require('./models/MealLog');
    const BodyStat = require('./models/BodyStat');
    const ProgressPhoto = require('./models/ProgressPhoto');

    const [mealLogs, bodyStats, photos] = await Promise.all([
      MealLog.find({ userId: req.userId, date: { $gte: toDateString(weekAgo) } }),
      BodyStat.find({ userId: req.userId, date: { $gte: weekAgo } }).sort({ date: 1 }),
      ProgressPhoto.find({ userId: req.userId, date: { $gte: weekAgo } }).sort({ date: 1 })
    ]);

    const totalCalories = mealLogs.reduce((s, m) => s + (m.totalCalories || 0), 0);
    const avgCalories = mealLogs.length ? Math.round(totalCalories / mealLogs.length) : 0;

    const workoutDays = user.weeklyPlan?.workoutPlan?.filter(d => d.completed)?.length || 0;

    const latestFat = photos.filter(p => p.bodyFatPercentage != null).slice(-1)[0];
    const firstFat  = photos.filter(p => p.bodyFatPercentage != null)[0];
    const fatDiff = (latestFat && firstFat && latestFat._id.toString() !== firstFat._id.toString())
      ? parseFloat((firstFat.bodyFatPercentage - latestFat.bodyFatPercentage).toFixed(1))
      : null;

    const weightStart = bodyStats[0]?.weight;
    const weightEnd   = bodyStats[bodyStats.length - 1]?.weight;
    const weightDiff  = (weightStart && weightEnd) ? parseFloat((weightEnd - weightStart).toFixed(1)) : null;

    res.json({
      streak: user.streak || 0,
      workoutDays,
      totalCalories,
      avgCalories,
      mealScans: mealLogs.length,
      fatDiff,
      weightDiff,
      badges: user.badges || [],
      isVip: user.isVip && (!user.vipExpiresAt || user.vipExpiresAt > now)
    });
  } catch (err) {
    console.error("Weekly summary hatası:", err);
    res.status(500).json({ error: "Özet alınamadı." });
  }
});

// ==================== ROZET KONTROL YARDIMCISI ====================
async function checkAndAwardBadges(userId) {
  const user = await User.findById(userId);
  if (!user) return [];
  const existing = new Set(user.badges || []);

  // async context
  const hasFriend = await Friendship.findOne({ status: 'accepted', $or: [{ requesterId: userId }, { recipientId: userId }] }).catch(() => null);
  const completedChallenges = await Challenge.find({ status: 'complete', $or: [{ challengerId: userId }, { respondentId: userId }] }).catch(() => []);
  const wonChallenge = completedChallenges.some(c => {
    const isMe = c.challengerId.toString() === userId.toString();
    return isMe ? (c.challengerBest || 0) >= (c.respondentBest || 0) : (c.respondentBest || 0) >= (c.challengerBest || 0);
  });
  const benchBest = user.lifts?.bench?.best || 0;
  const sqBest   = user.lifts?.squat?.best || 0;
  const dlBest   = user.lifts?.deadlift?.best || 0;
  const anyPR    = Object.values(user.lifts || {}).some(l => l.history?.length > 0);

  const BADGE_RULES = [
    // ── COMMON ──────────────────────────────────────────────────────
    { id: 'first_workout',    label: 'İlk Adım',        check: () => (user.weeklyPlan?.currentDay || 0) >= 1 },
    { id: 'first_pr',         label: 'İlk PR',          check: () => anyPR },
    { id: 'streak_3',         label: '3 Günlük Seri',   check: () => (user.streak || 0) >= 3 },
    // ── RARE ────────────────────────────────────────────────────────
    { id: 'streak_7',         label: '7 Günlük Seri',   check: () => (user.streak || 0) >= 7 },
    { id: 'plan_complete',    label: 'Programcı',       check: () => !!(user.weeklyPlan?.completedFully) },
    { id: 'bench_50',         label: 'Başlangıç Gücü',  check: () => benchBest >= 50 },
    { id: 'first_friend',     label: 'Sosyal Kelebek',  check: () => !!hasFriend },
    // ── EPIC ────────────────────────────────────────────────────────
    { id: 'streak_30',        label: 'Demir Disiplin',  check: () => (user.streak || 0) >= 30 },
    { id: 'bench_100',        label: 'Yüz Kulübü',      check: () => benchBest >= 100 },
    { id: 'challenge_won',    label: 'Kapışma Ustası',  check: () => wonChallenge },
    // ── LEGENDARY ───────────────────────────────────────────────────
    { id: 'streak_100',       label: 'Efsane Seri',     check: () => (user.streak || 0) >= 100 },
    { id: 'bench_bodyweight', label: 'Vücut Gücü',      check: () => !!(user.weight && benchBest >= user.weight) },
    { id: 'total_lifter',     label: 'Güç Canavarı',    check: () => (benchBest + sqBest + dlBest) >= 300 },
  ];

  const newBadges = [];
  for (const rule of BADGE_RULES) {
    if (!existing.has(rule.id) && rule.check()) {
      newBadges.push({ id: rule.id, label: rule.label });
    }
  }

  if (newBadges.length) {
    await User.findByIdAndUpdate(userId, {
      $push: { badges: { $each: newBadges.map(b => b.id) } },
      $inc: { tokens: newBadges.length * 10 }
    });
  }
  return newBadges;
}

// ==================== AYLIK ROZET (PERFORMANS) ====================
// Ay sonunda performansa göre rozet: güç (PR artışı) + aktivite birleşik skor.
// Rozetler stack'lenir → frontend "Efsane ×2" gibi gösterir, arttıkça renklenir.
const MONTH_NAMES_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function periodKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Bir kullanıcının verilen ay (YYYY-MM) için bileşik skoru: güç + aktivite
async function computeMonthlyScore(user, period) {
  const [y, m] = period.split('-').map(Number);
  const periodStart = new Date(y, m - 1, 1);
  const periodEnd   = new Date(y, m, 1);

  // GÜÇ — ay içindeki PR artışı (bench+squat+deadlift, kg)
  let strengthGain = 0;
  for (const lift of ['bench', 'squat', 'deadlift']) {
    const hist = (user.lifts?.[lift]?.history) || [];
    const within = hist.filter(h => { const d = new Date(h.date); return d >= periodStart && d < periodEnd; }).map(h => h.weight);
    if (!within.length) continue;
    const before = hist.filter(h => new Date(h.date) < periodStart).map(h => h.weight);
    const periodMax = Math.max(...within);
    const priorBest = before.length ? Math.max(...before) : Math.min(...within);
    strengthGain += Math.max(0, periodMax - priorBest);
  }

  // AKTİVİTE — ay içindeki etkinlik sayısı (PR kayıtları + gelişim fotoğrafları)
  let activityEvents = 0;
  for (const lift of Object.values(user.lifts || {})) {
    activityEvents += ((lift && lift.history) || []).filter(h => { const d = new Date(h.date); return d >= periodStart && d < periodEnd; }).length;
  }
  const photoCount = await ProgressPhoto.countDocuments({
    userId: String(user._id),
    date: { $gte: periodStart, $lt: periodEnd }
  }).catch(() => 0);
  activityEvents += photoCount;

  return Math.round(strengthGain * 2 + activityEvents * 3);
}

function tierForScore(score) {
  if (score >= 60) return 'legend';
  if (score >= 30) return 'elite';
  if (score >= 10) return 'rising';
  return null;
}

// Verilen ay için kullanıcıya aylık rozet ver (zaten verilmişse atla)
async function awardMonthlyBadgeForPeriod(userId, period) {
  const user = await User.findById(userId);
  if (!user) return null;
  if ((user.monthlyBadges || []).some(b => b.period === period)) return null;
  const score = await computeMonthlyScore(user, period);
  const tier = tierForScore(score);
  if (!tier) return null;
  await User.findByIdAndUpdate(userId, {
    $push: { monthlyBadges: { period, tier, score, awardedAt: new Date() } },
    $inc: { tokens: tier === 'legend' ? 50 : tier === 'elite' ? 25 : 10 },
  });
  return { period, tier, score };
}

// Çağıran kullanıcı için İÇİNDE BULUNULAN ayın rozetini hemen hesapla/ver (uygulama içi tetikleme)
app.post('/monthly-badge/run', authMiddleware, async (req, res) => {
  try {
    const period = periodKey(new Date());
    const awarded = await awardMonthlyBadgeForPeriod(req.userId, period);
    const user = await User.findById(req.userId).select('monthlyBadges tokens');
    res.json({ awarded, period, monthlyBadges: user.monthlyBadges || [], tokens: user.tokens || 0 });
  } catch (err) {
    console.error('🔥 /monthly-badge/run Hatası:', err.message);
    res.status(500).json({ error: 'Aylık rozet hesaplanamadı.' });
  }
});

// ==================== AI ANTRENMAN KOÇU CHAT ====================
app.post('/ai-chat', authMiddleware, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Mesaj boş." });

    const user = await User.findById(req.userId);
    const isVipActive = user?.isVip && (!user.vipExpiresAt || user.vipExpiresAt > new Date());

    // VIP değilse günde 3 mesaj hakkı
    if (!isVipActive) {
      const today = toDateString(new Date());
      const chatKey = `chatCount_${today}`;
      // Basit in-memory rate limit (üretimde Redis kullan)
      if (!global.chatCounts) global.chatCounts = {};
      const userKey = `${req.userId}_${today}`;
      global.chatCounts[userKey] = (global.chatCounts[userKey] || 0) + 1;
      if (global.chatCounts[userKey] > 3) {
        return res.status(429).json({ error: "Bugünlük ücretsiz sohbet hakkın bitti (3/3). VIP ile sınırsız sor!" });
      }
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemPrompt = `Sen GymBodyAI'ın kişisel fitness koçusun. Kullanıcı: ${user?.name || 'Sporcu'}, ${user?.weight || '?'}kg, ${user?.height || '?'}cm. Kısa, samimi, motive edici cevaplar ver. Türkçe konuş. Fitness, beslenme, antrenman dışındaki konularda kibar şekilde konuyu yönlendir.`;

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Anlıyorum, hazırım!' }] },
        ...(history || []).map((m) => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      ]
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();
    res.json({ reply });
  } catch (err) {
    console.error("AI Chat hatası:", err);
    res.status(500).json({ error: "AI şu an yanıt veremiyor." });
  }
});

// ==================== REVENUECAT IAP WEBHOOK ====================

app.post('/revenuecat-webhook', authMiddleware, async (req, res) => {
  try {
    const { entitlement, expiresAt } = req.body;
    if (entitlement !== 'vip') return res.status(400).json({ error: 'Geçersiz entitlement' });
    const expiry = expiresAt ? new Date(expiresAt) : (() => {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d;
    })();
    await User.findByIdAndUpdate(req.userId, { isVip: true, vipExpiresAt: expiry });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================== PROMO KOD SİSTEMİ ====================

app.post('/redeem-promo', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Kod girilmedi." });

    const promo = await PromoCode.findOne({ code: code.toLowerCase().trim(), isActive: true });
    if (!promo) return res.status(404).json({ error: "Geçersiz veya süresi dolmuş kod." });

    // Bu hesap daha önce kullandı mı?
    if (promo.usedBy.some(id => id.equals(req.userId))) {
      return res.status(400).json({ error: "Bu kodu daha önce kullandın." });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });

    // VIP ekle
    const now = new Date();
    const base = (user.vipExpiresAt && user.vipExpiresAt > now) ? user.vipExpiresAt : now;
    const newExpiry = new Date(base);
    newExpiry.setDate(newExpiry.getDate() + promo.vipDays);
    user.isVip = true;
    user.vipExpiresAt = newExpiry;
    await user.save();

    // Kodu kullanıldı olarak işaretle
    promo.usedBy.push(req.userId);
    await promo.save();

    console.log(`🎁 Promo kod kullanıldı: ${user.name} → "${promo.code}" (${promo.vipDays} gün VIP)`);
    res.json({
      message: `🎉 ${promo.vipDays} günlük VIP aktifleştirildi!`,
      isVip: true,
      vipExpiresAt: newExpiry
    });
  } catch (err) {
    console.error("Promo kod hatası:", err);
    res.status(500).json({ error: "Bir hata oluştu." });
  }
});

// ==================== PT / COACH SİSTEMİ ====================

// Referral kodu doğrula (kayıt ekranında anlık kontrol için)
app.get('/check-referral/:code', async (req, res) => {
  try {
    const coach = await Coach.findOne({
      referralCode: req.params.code.toLowerCase().trim(),
      isActive: true
    });
    if (!coach) return res.status(404).json({ valid: false });
    res.json({ valid: true, coachName: coach.name, discountRate: coach.discountRate });
  } catch (err) {
    res.status(500).json({ valid: false });
  }
});

// Referans kodunu kayıttan SONRA uygula (Google ile gelenler veya sonradan girmek isteyenler için)
app.post('/apply-referral', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: "Kod gerekli kanka!" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    if (user.referredBy) {
      return res.status(400).json({ error: "Zaten bir referans kodun tanımlı, tekrar giremezsin kanka." });
    }

    const coach = await Coach.findOne({ referralCode: code.toLowerCase().trim(), isActive: true });
    if (!coach) return res.status(404).json({ error: "Geçersiz referans kodu." });

    user.referredBy = coach._id;
    user.discountRate = coach.discountRate;
    await user.save();
    await Coach.findByIdAndUpdate(coach._id, { $addToSet: { referredUsers: user._id } });

    console.log(`🎯 Referans sonradan uygulandı: ${user.name} → ${coach.name} (%${coach.discountRate})`);
    res.json({
      message: `${coach.name} referansı uygulandı! VIP alırken %${coach.discountRate} indirim kazandın 🎉`,
      coachName: coach.name,
      discountRate: coach.discountRate,
    });
  } catch (err) {
    console.error("🔥 Apply Referral Hatası:", err);
    res.status(500).json({ error: "Referans uygulanırken hata oluştu." });
  }
});

// PT Giriş
app.post('/coach/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const coach = await Coach.findOne({ email });
    if (!coach) return res.status(400).json({ error: "E-posta veya şifre hatalı." });

    const isMatch = await bcrypt.compare(password, coach.password);
    if (!isMatch) return res.status(400).json({ error: "E-posta veya şifre hatalı." });
    if (!coach.isActive) return res.status(403).json({ error: "Hesabınız aktif değil. Yöneticiyle iletişime geçin." });

    const token = jwt.sign({ coachId: coach._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    console.log(`🏋️ Coach giriş: ${coach.name}`);
    res.json({ token, coach: { _id: coach._id, name: coach.name, email: coach.email, referralCode: coach.referralCode, discountRate: coach.discountRate, commissionRate: coach.commissionRate, balance: coach.balance, totalEarned: coach.totalEarned } });
  } catch (err) {
    res.status(500).json({ error: "Giriş hatası." });
  }
});

// PT Auth Middleware
function coachMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: "Yetkisiz." });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    if (!decoded.coachId) return res.status(401).json({ error: "Yetkisiz." });
    req.coachId = decoded.coachId;
    next();
  } catch {
    res.status(401).json({ error: "Token geçersiz." });
  }
}

// PT Dashboard
app.get('/coach/dashboard', coachMiddleware, async (req, res) => {
  try {
    const coach = await Coach.findById(req.coachId)
      .populate('referredUsers', 'name email isVip vipExpiresAt createdAt');
    if (!coach) return res.status(404).json({ error: "Koç bulunamadı." });

    const recentCommissions = coach.commissions.slice(-20).reverse();
    const now = new Date();
    // Öğrenci listesi (program yazılacak üyeler)
    const students = (coach.referredUsers || []).map(u => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      isVip: u.isVip && (!u.vipExpiresAt || u.vipExpiresAt > now),
      joinedAt: u.createdAt,
    }));

    // Salon geneli öğrenciler — aynı gymCode'daki TÜM hocaların öğrencileri (ortak havuz).
    // Salon ekibindeki her hoca tüm öğrencileri görür/yönetir.
    let gymStudents = [];
    if (coach.gymCode) {
      const gymCoaches = await Coach.find({ gymCode: coach.gymCode })
        .populate('referredUsers', 'name email isVip vipExpiresAt createdAt');
      const seen = new Set();
      for (const gc of gymCoaches) {
        for (const u of (gc.referredUsers || [])) {
          if (seen.has(String(u._id))) continue;
          seen.add(String(u._id));
          gymStudents.push({
            _id: u._id, name: u.name, email: u.email,
            isVip: u.isVip && (!u.vipExpiresAt || u.vipExpiresAt > now),
            coachName: gc.name, coachId: gc._id,
          });
        }
      }
    }

    res.json({
      name: coach.name,
      coachId: coach._id,
      referralCode: coach.referralCode,
      gymCode: coach.gymCode || null,
      discountRate: coach.discountRate,
      commissionRate: coach.commissionRate,
      balance: coach.balance,
      totalEarned: coach.totalEarned,
      referredCount: students.length,
      students,
      gymStudents,
      recentCommissions,
      withdrawals: coach.withdrawals.slice(-20).reverse(),
    });
  } catch (err) {
    res.status(500).json({ error: "Dashboard yüklenemedi." });
  }
});

// Para Çekme Talebi
app.post('/coach/withdraw', coachMiddleware, async (req, res) => {
  try {
    const { amount, iban } = req.body;
    const coach = await Coach.findById(req.coachId);
    if (!coach) return res.status(404).json({ error: "Koç bulunamadı." });
    if (!amount || amount < 50) return res.status(400).json({ error: "Minimum çekim tutarı 50 TL'dir." });
    if (coach.balance < amount) return res.status(400).json({ error: `Yetersiz bakiye. Mevcut: ${coach.balance} TL` });
    if (!iban) return res.status(400).json({ error: "IBAN gerekli." });

    coach.balance -= amount;
    coach.withdrawals.push({ amount, iban });
    await coach.save();

    console.log(`💸 Para çekme talebi: ${coach.name} → ${amount} TL (IBAN: ${iban})`);
    res.json({ message: "Para çekme talebiniz alındı. 1-3 iş günü içinde hesabınıza aktarılacaktır.", balance: coach.balance });
  } catch (err) {
    res.status(500).json({ error: "Para çekme talebi oluşturulamadı." });
  }
});

// Öğrenci ekle (hoca, e-posta ile) — kendi öğrenci listesine alır
app.post('/coach/students/add', coachMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Öğrencinin e-postasını gir." });
    const user = await User.findOne({ email: email.trim() });
    if (!user) return res.status(404).json({ error: "Bu e-posta ile kayıtlı kullanıcı yok." });
    const coach = await Coach.findById(req.coachId);
    if (coach.referredUsers.some(id => id.equals(user._id))) {
      return res.status(400).json({ error: "Bu öğrenci zaten listende." });
    }
    coach.referredUsers.push(user._id);
    await coach.save();
    user.referredBy = coach._id;
    await user.save();
    res.json({ message: `${user.name} öğrenci listene eklendi.`, student: { _id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("Öğrenci ekleme hatası:", err);
    res.status(500).json({ error: "Öğrenci eklenemedi." });
  }
});

// Öğrenci çıkar (hoca)
app.post('/coach/students/remove', coachMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId gerekli." });
    const coach = await Coach.findById(req.coachId);
    coach.referredUsers = coach.referredUsers.filter(id => !id.equals(userId));
    await coach.save();
    await User.updateOne({ _id: userId, referredBy: coach._id }, { $unset: { referredBy: 1 } });
    res.json({ message: "Öğrenci listenden çıkarıldı." });
  } catch (err) {
    console.error("Öğrenci çıkarma hatası:", err);
    res.status(500).json({ error: "Öğrenci çıkarılamadı." });
  }
});

// Yardımcı: öğrenci bu hocanın salonunda mı? (gymCode bazlı erişim — güvenlik)
async function studentInCoachGym(coachId, userId) {
  const coach = await Coach.findById(coachId);
  if (!coach) return false;
  if (coach.referredUsers.some(id => id.equals(userId))) return true; // kendi öğrencisi
  if (coach.gymCode) {
    const user = await User.findById(userId, 'referredBy');
    if (user && user.referredBy) {
      const refCoach = await Coach.findById(user.referredBy, 'gymCode');
      if (refCoach && refCoach.gymCode === coach.gymCode) return true; // aynı salon
    }
  }
  return false;
}

// Kas grubuna göre egzersiz listesi (program editörü — hoca buradan seçer)
app.get('/coach/exercises', coachMiddleware, async (req, res) => {
  try {
    const exs = await ExerciseGif.find({}, 'name gifUrl bodyPart').sort({ name: 1 });
    const grouped = {};
    for (const e of exs) {
      const p = e.bodyPart || 'Diğer';
      (grouped[p] = grouped[p] || []).push({ name: e.name, gifUrl: e.gifUrl });
    }
    res.json(grouped);
  } catch (err) { res.status(500).json({ error: "Egzersizler yüklenemedi." }); }
});

// Öğrenci detayı — ilerleme + mevcut program
app.get('/coach/students/:userId', coachMiddleware, async (req, res) => {
  try {
    if (!(await studentInCoachGym(req.coachId, req.params.userId)))
      return res.status(403).json({ error: "Bu öğrenciye erişimin yok." });
    const user = await User.findById(req.params.userId, 'name email weight height gender weeklyPlan lifts');
    if (!user) return res.status(404).json({ error: "Öğrenci bulunamadı." });
    const stats = await BodyStat.find({ userId: user._id }).sort({ date: -1 }).limit(8);
    res.json({
      name: user.name, email: user.email, weight: user.weight, height: user.height, gender: user.gender,
      workoutPlan: user.weeklyPlan?.workoutPlan || [],
      nutritionPlan: user.weeklyPlan?.nutritionPlan || [],
      lifts: user.lifts || {},
      bodyStats: stats,
    });
  } catch (err) { res.status(500).json({ error: "Öğrenci yüklenemedi." }); }
});

// Hoca öğrenciye program kaydeder (uygulama formatıyla birebir: workoutPlan)
app.post('/coach/students/:userId/program', coachMiddleware, async (req, res) => {
  try {
    if (!(await studentInCoachGym(req.coachId, req.params.userId)))
      return res.status(403).json({ error: "Bu öğrenciye erişimin yok." });
    const { workoutPlan } = req.body;
    if (!Array.isArray(workoutPlan) || !workoutPlan.length) return res.status(400).json({ error: "Program boş olamaz." });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "Öğrenci bulunamadı." });
    user.weeklyPlan = user.weeklyPlan || {};
    user.weeklyPlan.workoutPlan = workoutPlan;
    user.weeklyPlan.generatedAt = new Date();
    user.weeklyPlan.completedFully = false;
    user.weeklyPlan.currentDay = 1;
    user.weeklyPlan.totalDays = workoutPlan.length;
    user.weeklyPlan.started = true;
    user.markModified('weeklyPlan');
    await user.save();
    console.log(`📋 Hoca programı kaydedildi → ${user.name} (${workoutPlan.length} gün)`);
    res.json({ message: "Program kaydedildi ✓" });
  } catch (err) { console.error("Program kaydetme hatası:", err); res.status(500).json({ error: "Program kaydedilemedi." }); }
});

// Hoca öğrenciye beslenme planı kaydeder (uygulama formatı: weeklyPlan.nutritionPlan)
app.post('/coach/students/:userId/nutrition', coachMiddleware, async (req, res) => {
  try {
    if (!(await studentInCoachGym(req.coachId, req.params.userId)))
      return res.status(403).json({ error: "Bu öğrenciye erişimin yok." });
    const { nutritionPlan } = req.body;
    if (!Array.isArray(nutritionPlan)) return res.status(400).json({ error: "Geçersiz beslenme planı." });
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "Öğrenci bulunamadı." });
    // gün numaralarını ve toplam kaloriyi normalize et (uygulama bu alanları okur)
    const clean = nutritionPlan.map((day, i) => {
      const meals = (day.meals || []).map(m => ({
        name: (m.name || '').trim() || 'Öğün',
        items: (m.items || '').trim(),
        calories: Number(m.calories) || 0,
      }));
      return {
        dayNumber: i + 1,
        meals,
        totalCalories: meals.reduce((s, m) => s + (m.calories || 0), 0),
        completed: false,
      };
    });
    user.weeklyPlan = user.weeklyPlan || {};
    user.weeklyPlan.nutritionPlan = clean;
    user.markModified('weeklyPlan');
    await user.save();
    console.log(`🥗 Hoca beslenmesi kaydedildi → ${user.name} (${clean.length} gün)`);
    res.json({ message: "Beslenme kaydedildi ✓" });
  } catch (err) { console.error("Beslenme kaydetme hatası:", err); res.status(500).json({ error: "Beslenme kaydedilemedi." }); }
});

// Sohbet — mesajları getir (öğrenci mesajlarını okundu işaretle)
app.get('/coach/students/:userId/messages', coachMiddleware, async (req, res) => {
  try {
    if (!(await studentInCoachGym(req.coachId, req.params.userId)))
      return res.status(403).json({ error: "Bu öğrenciye erişimin yok." });
    const msgs = await CoachMessage.find({ coach: req.coachId, user: req.params.userId })
      .sort({ createdAt: 1 }).limit(200).lean();
    // hocanın açtığı sohbette öğrenci mesajlarını okundu say
    await CoachMessage.updateMany(
      { coach: req.coachId, user: req.params.userId, from: 'student', readByCoach: false },
      { $set: { readByCoach: true } }
    );
    res.json(msgs.map(m => ({ from: m.from, text: m.text, at: m.createdAt })));
  } catch (err) { console.error("Mesaj getirme hatası:", err); res.status(500).json({ error: "Mesajlar yüklenemedi." }); }
});

// Sohbet — hoca mesaj gönderir
app.post('/coach/students/:userId/messages', coachMiddleware, async (req, res) => {
  try {
    if (!(await studentInCoachGym(req.coachId, req.params.userId)))
      return res.status(403).json({ error: "Bu öğrenciye erişimin yok." });
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: "Mesaj boş olamaz." });
    if (text.length > 2000) return res.status(400).json({ error: "Mesaj çok uzun." });
    const msg = await CoachMessage.create({
      coach: req.coachId, user: req.params.userId,
      from: 'coach', text, readByCoach: true,
    });
    res.json({ from: 'coach', text: msg.text, at: msg.createdAt });
  } catch (err) { console.error("Mesaj gönderme hatası:", err); res.status(500).json({ error: "Mesaj gönderilemedi." }); }
});

// Hoca kendi şifresini değiştirir
app.post('/coach/change-password', coachMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Yeni şifre en az 6 karakter olmalı." });
    const coach = await Coach.findById(req.coachId);
    if (!coach) return res.status(404).json({ error: "Koç bulunamadı." });
    const ok = await bcrypt.compare(currentPassword || '', coach.password);
    if (!ok) return res.status(400).json({ error: "Mevcut şifren hatalı." });
    coach.password = await bcrypt.hash(newPassword, 10);
    await coach.save();
    res.json({ message: "Şifren güncellendi ✓" });
  } catch (err) {
    console.error("Şifre değiştirme hatası:", err);
    res.status(500).json({ error: "Şifre güncellenemedi." });
  }
});

// ---- ADMIN GİRİŞ + MIDDLEWARE ----
app.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email !== process.env.ADMIN_EMAIL) return res.status(401).json({ error: "Hatalı bilgiler." });
    const isMatch = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!isMatch) return res.status(401).json({ error: "Hatalı bilgiler." });
    const token = jwt.sign({ isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Giriş hatası." });
  }
});

function adminMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: "Yetkisiz." });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    if (!decoded.isAdmin) return res.status(401).json({ error: "Yetkisiz." });
    next();
  } catch {
    res.status(401).json({ error: "Token geçersiz." });
  }
}

// Koç sil (admin)
app.delete('/admin/coach/:id', adminMiddleware, async (req, res) => {
  try {
    await Coach.findByIdAndDelete(req.params.id);
    res.json({ message: "Koç silindi." });
  } catch (err) {
    res.status(500).json({ error: "Silme başarısız." });
  }
});

// Koç oluştur (admin)
app.post('/admin/coach', adminMiddleware, async (req, res) => {
  try {
    const { name, email, password, phone, referralCode, gymCode, discountRate, commissionRate, notes } = req.body;
    if (!name || !email || !password || !referralCode) {
      return res.status(400).json({ error: "İsim, email, şifre ve referral kodu zorunlu." });
    }
    const existing = await Coach.findOne({ $or: [{ email }, { referralCode: referralCode.toLowerCase() }] });
    if (existing) return res.status(400).json({ error: "Bu email veya referral kodu zaten kullanılıyor." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const coach = await Coach.create({
      name, email, phone, notes,
      password: hashedPassword,
      referralCode: referralCode.toLowerCase().trim(),
      gymCode: gymCode ? gymCode.toUpperCase().trim() : undefined, // salon kodu (ör. MLFT2)
      discountRate: discountRate || 10,
      commissionRate: commissionRate || 15
    });

    console.log(`✅ Yeni koç eklendi: ${coach.name} (${coach.referralCode})`);
    res.status(201).json({ message: "Koç başarıyla oluşturuldu.", coachId: coach._id, referralCode: coach.referralCode });
  } catch (err) {
    console.error("Coach oluşturma hatası:", err);
    res.status(500).json({ error: "Koç oluşturulamadı." });
  }
});

// Tüm koçları listele (admin)
app.get('/admin/coaches', adminMiddleware, async (req, res) => {
  try {
    const coaches = await Coach.find({}, '-password').sort({ createdAt: -1 });
    res.json(coaches);
  } catch (err) {
    res.status(500).json({ error: "Koçlar listelenemedi." });
  }
});

// Komisyon oranını güncelle (admin)
app.patch('/admin/coach/:id', adminMiddleware, async (req, res) => {
  try {
    const { commissionRate, discountRate, isActive, notes } = req.body;
    const update = {};
    if (commissionRate !== undefined) update.commissionRate = commissionRate;
    if (discountRate !== undefined) update.discountRate = discountRate;
    if (isActive !== undefined) update.isActive = isActive;
    if (notes !== undefined) update.notes = notes;
    const coach = await Coach.findByIdAndUpdate(req.params.id, update, { new: true, select: '-password' });
    if (!coach) return res.status(404).json({ error: "Koç bulunamadı." });
    res.json(coach);
  } catch (err) {
    res.status(500).json({ error: "Güncelleme başarısız." });
  }
});

// Promo kod oluştur (admin)
app.post('/admin/promo', adminMiddleware, async (req, res) => {
  try {
    const { code, vipDays } = req.body;
    if (!code || !vipDays) return res.status(400).json({ error: "Kod ve gün sayısı zorunlu." });
    const existing = await PromoCode.findOne({ code: code.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: "Bu kod zaten var." });
    const promo = await PromoCode.create({ code: code.toLowerCase().trim(), vipDays });
    console.log(`🎁 Yeni promo kod: ${promo.code} (${promo.vipDays} gün)`);
    res.status(201).json(promo);
  } catch (err) {
    res.status(500).json({ error: "Oluşturulamadı." });
  }
});

// Tüm promo kodları listele (admin)
app.get('/admin/promos', adminMiddleware, async (req, res) => {
  try {
    const promos = await PromoCode.find({}).sort({ createdAt: -1 });
    res.json(promos);
  } catch (err) {
    res.status(500).json({ error: "Listelenemedi." });
  }
});

// Promo kodu sil/deaktif et (admin)
app.delete('/admin/promo/:id', adminMiddleware, async (req, res) => {
  try {
    await PromoCode.findByIdAndDelete(req.params.id);
    res.json({ message: "Kod silindi." });
  } catch (err) {
    res.status(500).json({ error: "Silinemedi." });
  }
});

// Para çekme taleplerini onayla (admin)
app.patch('/admin/withdrawal/:coachId/:withdrawalId', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // 'paid' veya 'rejected'
    const coach = await Coach.findById(req.params.coachId);
    if (!coach) return res.status(404).json({ error: "Koç bulunamadı." });

    const withdrawal = coach.withdrawals.id(req.params.withdrawalId);
    if (!withdrawal) return res.status(404).json({ error: "Talep bulunamadı." });

    if (status === 'rejected' && withdrawal.status === 'pending') {
      // Red edilirse bakiyeyi geri ver
      coach.balance += withdrawal.amount;
    }
    withdrawal.status = status;
    if (status === 'paid') withdrawal.paidAt = new Date();
    await coach.save();

    res.json({ message: `Talep ${status === 'paid' ? 'ödendi' : 'reddedildi'}.` });
  } catch (err) {
    res.status(500).json({ error: "İşlem başarısız." });
  }
});

// Global hata yakalayıcı — stack trace dışarıya çıkmaz
app.use((err, req, res, next) => {
  if (err) {
    console.error("🔥 Genel Hata:", err.message);
    // CORS hatası
    if (err.message.startsWith('CORS:')) return res.status(403).json({ error: err.message });
    // Multer / dosya hatası
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: "Dosya çok büyük." });
    // Diğerleri — iç detayı gizle
    return res.status(400).json({ error: err.message || "Bir hata oluştu." });
  }
  next();
});
// ==================== PUSH BİLDİRİM YARDIMCISI ====================
async function sendPushNotification(pushToken, title, body) {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return;
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: pushToken, title, body, sound: 'default', priority: 'high'
    }, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Push bildirim hatası:', err.message);
  }
}

// ==================== CRON JOBS ====================
const cron = require('node-cron');

// Her gün saat 20:00'de streak hatırlatıcısı
cron.schedule('0 20 * * *', async () => {
  try {
    const today = toDateString(new Date());
    // Streak'i olan ama bugün antrenman yapmayan kullanıcılar
    const users = await User.find({
      streak: { $gt: 0 },
      pushToken: { $exists: true, $ne: null },
      lastActivityDate: { $ne: new Date(today) }
    });
    for (const u of users) {
      await sendPushNotification(
        u.pushToken,
        `🔥 ${u.streak} günlük serinı kaybetme!`,
        'Bugün henüz antrenman yapmadın. Hadi git, seni bekliyoruz!'
      );
    }
    console.log(`📬 Streak hatırlatıcısı gönderildi: ${users.length} kullanıcı`);
  } catch (err) {
    console.error('Streak cron hatası:', err.message);
  }
}, { timezone: 'Europe/Istanbul' });

// Her Pazar 10:00'da haftalık özet bildirimi
cron.schedule('0 10 * * 0', async () => {
  try {
    const users = await User.find({ pushToken: { $exists: true, $ne: null } });
    for (const u of users) {
      await sendPushNotification(
        u.pushToken,
        '📊 Haftalık Özet Hazır!',
        `${u.name}, bu haftanın raporunu görmek için aç!`
      );
    }
    console.log(`📊 Haftalık özet bildirimi: ${users.length} kullanıcı`);
  } catch (err) {
    console.error('Haftalık özet cron hatası:', err.message);
  }
}, { timezone: 'Europe/Istanbul' });

// Her ayın 1'inde 00:30'da bir önceki ayın performans rozetlerini herkese dağıt
cron.schedule('30 0 1 * *', async () => {
  try {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = periodKey(prev);
    const users = await User.find({}).select('_id');
    let awarded = 0;
    for (const u of users) {
      const r = await awardMonthlyBadgeForPeriod(u._id, period).catch(() => null);
      if (r) {
        awarded++;
        const fresh = await User.findById(u._id).select('pushToken name');
        if (fresh?.pushToken) {
          const tierLabel = r.tier === 'legend' ? 'Efsanesi' : r.tier === 'elite' ? 'Eliti' : 'Yıldızı';
          await sendPushNotification(
            fresh.pushToken,
            `🏅 ${MONTH_NAMES_TR[prev.getMonth()]} ${tierLabel}!`,
            'Bu ayın performans rozetini kazandın, profilinden gör!'
          ).catch(() => {});
        }
      }
    }
    console.log(`🏅 Aylık rozet dağıtıldı (${period}): ${awarded} kullanıcı`);
  } catch (err) {
    console.error('Aylık rozet cron hatası:', err.message);
  }
}, { timezone: 'Europe/Istanbul' });

// ─── ARKADAŞ MEYDAN OKUMASI ───────────────────────────────────────────────────
const challengeSchema = new mongoose.Schema({
  code:           { type: String, required: true, unique: true },
  challengerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challengerName: { type: String, required: true },
  lift:           { type: String, required: true },
  liftLabel:      { type: String, required: true },
  challengerBest: Number,   // ikisi de bağlanınca girilir
  respondentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  respondentName: String,
  respondentBest: Number,
  status:         { type: String, enum: ['pending','active','complete'], default: 'pending' },
  createdAt:      { type: Date, default: Date.now, expires: 7 * 24 * 3600 },
});
const Challenge = mongoose.model('Challenge', challengeSchema);

const LIFT_LABELS = { bench: 'Bench Press', squat: 'Squat', deadlift: 'Deadlift', ohp: 'Shoulder Press', latpull: 'Lat Pull Down', curl: 'Barbell Curl', lateral: 'Lateral Raise' };

// Kapışma oluştur — sadece hareket, kilo yok
app.post('/challenge/create', authMiddleware, async (req, res) => {
  try {
    const { lift } = req.body;
    if (!LIFT_LABELS[lift]) return res.status(400).json({ error: 'Geçersiz hareket' });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    let code, exists = true;
    while (exists) {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      exists = await Challenge.findOne({ code });
    }
    await Challenge.create({ code, challengerId: req.userId, challengerName: user.name, lift, liftLabel: LIFT_LABELS[lift] });
    res.json({ code });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kapışmayı getir
app.get('/challenge/:code', async (req, res) => {
  try {
    const ch = await Challenge.findOne({ code: req.params.code.toUpperCase() });
    if (!ch) return res.status(404).json({ error: 'Meydan okuma bulunamadı' });
    res.json({
      lift: ch.lift, liftLabel: ch.liftLabel,
      challengerName: ch.challengerName, respondentName: ch.respondentName,
      status: ch.status,
      challengerSubmitted: ch.challengerBest != null,
      respondentSubmitted: ch.respondentBest != null,
      // Sonuç tamamsa her iki kiloyu da gönder
      ...(ch.status === 'complete' ? {
        challengerBest: ch.challengerBest, respondentBest: ch.respondentBest
      } : {}),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rakip katıl — challenge active olur
app.post('/challenge/:code/join', authMiddleware, async (req, res) => {
  try {
    const ch = await Challenge.findOne({ code: req.params.code.toUpperCase() });
    if (!ch) return res.status(404).json({ error: 'Meydan okuma bulunamadı' });
    if (ch.status !== 'pending') return res.status(400).json({ error: 'Bu kapışmaya zaten katılındı' });
    if (ch.challengerId.toString() === req.userId) return res.status(400).json({ error: 'Kendi kapışmana kendi katılamazsın' });
    const user = await User.findById(req.userId);
    ch.respondentId = req.userId;
    ch.respondentName = user.name;
    ch.status = 'active';
    await ch.save();
    res.json({ liftLabel: ch.liftLabel, challengerName: ch.challengerName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// İki taraftan biri kilosunu gönderir; ikisi de gönderdiyse sonuç döner
app.post('/challenge/:code/submit', authMiddleware, async (req, res) => {
  try {
    const w = parseFloat(req.body.weight);
    if (!(w > 0)) return res.status(400).json({ error: 'Geçerli ağırlık gir' });
    const ch = await Challenge.findOne({ code: req.params.code.toUpperCase() });
    if (!ch) return res.status(404).json({ error: 'Meydan okuma bulunamadı' });
    if (ch.status === 'complete') return res.status(400).json({ error: 'Kapışma zaten bitti' });

    const isChallenger = ch.challengerId.toString() === req.userId;
    const isRespondent = ch.respondentId?.toString() === req.userId;
    if (!isChallenger && !isRespondent) return res.status(403).json({ error: 'Bu kapışmada değilsin' });

    if (isChallenger) ch.challengerBest = w;
    if (isRespondent) ch.respondentBest = w;

    if (ch.challengerBest != null && ch.respondentBest != null) {
      ch.status = 'complete';
      await ch.save();
      const newBadges = await checkAndAwardBadges(req.userId).catch(() => []);
      return res.json({
        complete: true,
        challengerName: ch.challengerName, challengerBest: ch.challengerBest,
        respondentName: ch.respondentName, respondentBest: ch.respondentBest,
        liftLabel: ch.liftLabel,
        iWon: isChallenger ? ch.challengerBest >= ch.respondentBest : ch.respondentBest >= ch.challengerBest,
        newBadges,
      });
    }
    await ch.save();
    res.json({ complete: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ARKADAŞLAR + SOHBET ────────────────────────────────────────────────────
const friendshipSchema = new mongoose.Schema({
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:      { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  createdAt:   { type: Date, default: Date.now },
});
const Friendship = mongoose.model('Friendship', friendshipSchema);

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:       { type: String, required: true, maxLength: 500 },
  read:       { type: Boolean, default: false },
  createdAt:  { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', messageSchema);

// Kullanıcı/içerik şikayetleri — moderasyon (App Store/Play Store UGC zorunluluğu)
const reportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:     { type: String, maxLength: 500 },
  context:    { type: String }, // 'chat' | 'profile' | 'leaderboard' vb.
  status:     { type: String, enum: ['open', 'reviewed'], default: 'open' },
  createdAt:  { type: Date, default: Date.now },
});
const Report = mongoose.model('Report', reportSchema);

// Bir kullanıcının engellediği VE onu engelleyenlerin ID set'i (her iki yön de gizlenir)
async function blockedIdSet(myId) {
  const me = await User.findById(myId).select('blockedUsers');
  const blockedByMe = (me?.blockedUsers || []).map(id => String(id));
  const blockedMe = await User.find({ blockedUsers: myId }).select('_id');
  const set = new Set(blockedByMe);
  blockedMe.forEach(u => set.add(String(u._id)));
  return set;
}

// Kullanıcıyı engelle — arkadaşlığı siler, iki yönlü mesajlaşmayı keser
app.post('/block/:userId', authMiddleware, async (req, res) => {
  try {
    const target = req.params.userId;
    if (target === req.userId) return res.status(400).json({ error: 'Kendini engelleyemezsin.' });
    await User.findByIdAndUpdate(req.userId, { $addToSet: { blockedUsers: target } });
    // varsa arkadaşlığı kaldır
    await Friendship.deleteMany({
      $or: [
        { requesterId: req.userId, recipientId: target },
        { requesterId: target, recipientId: req.userId },
      ],
    }).catch(() => {});
    res.json({ ok: true, message: 'Kullanıcı engellendi.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Engeli kaldır
app.post('/unblock/:userId', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { $pull: { blockedUsers: req.params.userId } });
    res.json({ ok: true, message: 'Engel kaldırıldı.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Engellediklerimin listesi
app.get('/blocked', authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId).populate('blockedUsers', 'name _id profilePhoto googlePhoto');
    res.json((me?.blockedUsers || []).map(u => ({ _id: u._id, name: u.name, photo: u.profilePhoto || u.googlePhoto || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kullanıcıyı/içeriği şikayet et
app.post('/report/:userId', authMiddleware, async (req, res) => {
  try {
    const target = req.params.userId;
    if (target === req.userId) return res.status(400).json({ error: 'Kendini şikayet edemezsin.' });
    await Report.create({
      reporterId: req.userId,
      reportedId: target,
      reason: (req.body.reason || '').slice(0, 500),
      context: req.body.context || 'chat',
    });
    res.json({ ok: true, message: 'Şikayetin alındı, 24 saat içinde incelenecek.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kullanıcı ara
app.get('/users/search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const blocked = await blockedIdSet(req.userId);
    const users = (await User.find({ _id: { $ne: req.userId }, name: { $regex: q, $options: 'i' } }, 'name _id').limit(30))
      .filter(u => !blocked.has(String(u._id))).slice(0, 15);
    // arkadaşlık durumu ekle
    const friendships = await Friendship.find({
      $or: [{ requesterId: req.userId }, { recipientId: req.userId }],
      $or: [{ requesterId: { $in: users.map(u => u._id) } }, { recipientId: { $in: users.map(u => u._id) } }],
    });
    const result = users.map(u => {
      const fs = friendships.find(f => f.requesterId.equals(u._id) || f.recipientId.equals(u._id));
      return { _id: u._id, name: u.name, friendStatus: fs ? (fs.requesterId.equals(req.userId) ? `sent_${fs.status}` : `received_${fs.status}`) : 'none' };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// İstek gönder
app.post('/friends/request/:userId', authMiddleware, async (req, res) => {
  try {
    const exists = await Friendship.findOne({ requesterId: req.userId, recipientId: req.params.userId });
    if (exists) return res.status(400).json({ error: 'Zaten istek gönderildi' });
    await Friendship.create({ requesterId: req.userId, recipientId: req.params.userId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// İsteği kabul et
app.post('/friends/accept/:userId', authMiddleware, async (req, res) => {
  try {
    const fs = await Friendship.findOne({ requesterId: req.params.userId, recipientId: req.userId, status: 'pending' });
    if (!fs) return res.status(404).json({ error: 'İstek bulunamadı' });
    fs.status = 'accepted';
    await fs.save();
    await checkAndAwardBadges(req.userId).catch(() => []);
    await checkAndAwardBadges(req.params.userId).catch(() => []);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Arkadaş listesi + bekleyen istekler
app.get('/friends', authMiddleware, async (req, res) => {
  try {
    const myId = req.userId;
    const blocked = await blockedIdSet(myId);
    const accepted = await Friendship.find({ status: 'accepted', $or: [{ requesterId: myId }, { recipientId: myId }] });
    const friendIds = accepted.map(f => f.requesterId.equals(myId) ? f.recipientId : f.requesterId)
      .filter(id => !blocked.has(String(id)));
    const friends = await User.find({ _id: { $in: friendIds } }, 'name _id');
    const pending = (await Friendship.find({ recipientId: myId, status: 'pending' }).populate('requesterId', 'name _id'))
      .filter(p => p.requesterId && !blocked.has(String(p.requesterId._id)));
    // okunmamış mesaj sayısı
    const unread = await Message.aggregate([
      { $match: { receiverId: new mongoose.Types.ObjectId(myId), read: false } },
      { $group: { _id: '$senderId', count: { $sum: 1 } } },
    ]);
    const unreadMap = {};
    unread.forEach(u => { unreadMap[u._id.toString()] = u.count; });
    res.json({
      friends: friends.map(f => ({ _id: f._id, name: f.name, unread: unreadMap[f._id.toString()] || 0 })),
      requests: pending.map(p => ({ _id: p.requesterId._id, name: p.requesterId.name })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mesaj gönder
app.post('/messages/:friendId', authMiddleware, async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Mesaj boş olamaz' });
    // engelli ilişkide mesajlaşma yok (iki yön)
    const blocked = await blockedIdSet(req.userId);
    if (blocked.has(String(req.params.friendId))) return res.status(403).json({ error: 'Bu kullanıcıyla mesajlaşamazsın.' });
    const msg = await Message.create({ senderId: req.userId, receiverId: req.params.friendId, text });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sohbet geçmişi + okundu işaretle
app.get('/messages/:friendId', authMiddleware, async (req, res) => {
  try {
    const myId = req.userId;
    const friendId = req.params.friendId;
    await Message.updateMany({ senderId: friendId, receiverId: myId, read: false }, { read: true });
    const msgs = await Message.find({
      $or: [{ senderId: myId, receiverId: friendId }, { senderId: friendId, receiverId: myId }],
    }).sort({ createdAt: 1 }).limit(100);
    res.json(msgs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HESAP SİLME (App Store 5.1.1 + Google Play zorunlu) ───
// Kullanıcının kendi hesabını ve tüm ilişkili verilerini kalıcı siler
app.delete('/account', authMiddleware, async (req, res) => {
  try {
    const myId = req.userId;
    const user = await User.findById(myId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    // Şifre gönderilmişse doğrula (ekstra güvenlik); gönderilmediyse token yeterli (kullanıcı zaten oturum açmış).
    // NOT: req.body body'siz DELETE isteğinde undefined olabilir → optional chaining ile güvenli.
    if (user.password && req.body?.password) {
      const ok = await bcrypt.compare(req.body.password, user.password);
      if (!ok) return res.status(400).json({ error: 'Şifre hatalı.' });
    }

    const oid = new mongoose.Types.ObjectId(myId);
    // İlişkili verileri temizle (her biri ayrı, hata olsa da devam)
    await Promise.allSettled([
      ProgressPhoto.deleteMany({ userId: myId }),
      Message.deleteMany({ $or: [{ senderId: oid }, { receiverId: oid }] }),
      Friendship.deleteMany({ $or: [{ requesterId: oid }, { recipientId: oid }] }),
      Report.deleteMany({ $or: [{ reporterId: oid }, { reportedId: oid }] }),
      Challenge.deleteMany({ $or: [{ challengerId: myId }, { respondentId: myId }] }).catch(() => {}),
      BodyStat.deleteMany({ userId: myId }).catch(() => {}),
      MealLog.deleteMany({ userId: myId }).catch(() => {}),
      User.updateMany({ blockedUsers: oid }, { $pull: { blockedUsers: oid } }),
    ]);
    // Cloudinary profil fotoğrafını sil (varsa)
    try { await cloudinary.uploader.destroy(`profile_photos/user_${myId}`); } catch {}

    await User.findByIdAndDelete(myId);
    console.log(`🗑️ Hesap silindi: ${user.email || user.name} (${myId})`);
    res.json({ ok: true, message: 'Hesabın ve tüm verilerin kalıcı olarak silindi.' });
  } catch (err) {
    console.error('🔥 Hesap silme hatası:', err);
    res.status(500).json({ error: 'Hesap silinemedi, tekrar dene.' });
  }
});

// ─── GİZLİLİK POLİTİKASI & KULLANIM KOŞULLARI (App Store / Play Store zorunlu) ───
const LEGAL_PAGE = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>${title} — GymBodyAI</title>
<style>
  body{margin:0;background:#0B0D12;color:#E7EAF0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7}
  .wrap{max-width:760px;margin:0 auto;padding:40px 22px 80px}
  h1{color:#C6FF3D;font-size:26px;margin-bottom:4px}
  .date{color:#6B7384;font-size:13px;margin-bottom:32px}
  h2{color:#FF9F1C;font-size:18px;margin-top:34px}
  a{color:#5B8DEF}
  ul{padding-left:20px}
  li{margin:6px 0}
  .foot{margin-top:48px;color:#6B7384;font-size:13px;border-top:1px solid #1C2230;padding-top:18px}
</style></head>
<body><div class="wrap">${bodyHtml}
<div class="foot">İletişim: <a href="mailto:ilhanbahri4@gmail.com">ilhanbahri4@gmail.com</a><br>GymBodyAI © 2026</div>
</div></body></html>`;

// Ana sayfa — basit tanıtım (mağaza web sitesi alanı için)
// ─── HOCA WEB PANELİ (PT) — login + öğrenci yönetimi + komisyon/para çekme ───
app.get('/coach', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'coach.html'));
});

// Yönetim paneli (coach ile aynı düzen: views/ + route). Eski /admin-panel.html linki de çalışsın.
app.get(['/admin', '/admin-panel.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-panel.html'));
});

app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>GymBodyAI — Yapay Zeka Antrenörün</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0B0D12;color:#E7EAF0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;text-align:center}
  .hero{max-width:760px;margin:0 auto;padding:80px 24px 40px}
  .logo{width:96px;height:96px;border-radius:24px;background:linear-gradient(135deg,#D4FF5C,#9FE000);display:inline-flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 10px 40px rgba(159,224,0,0.35);margin-bottom:28px}
  h1{font-size:40px;font-weight:800;letter-spacing:-1px}
  h1 .ai{color:#C6FF3D}
  .tag{color:#A3ABBA;font-size:18px;margin-top:10px}
  .feats{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin:44px 0}
  .feat{background:#12151C;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:18px 20px;width:220px;text-align:left}
  .feat .e{font-size:24px}
  .feat .t{font-weight:700;margin-top:8px}
  .feat .d{color:#6B7384;font-size:13px;margin-top:2px}
  .links{margin-top:40px;color:#6B7384;font-size:14px}
  .links a{color:#5B8DEF;text-decoration:none;margin:0 10px}
  .foot{color:#6B7384;font-size:13px;margin-top:30px;padding-bottom:40px}
</style></head>
<body>
  <div class="hero">
    <div class="logo">🏋️</div>
    <h1>GymBody<span class="ai">AI</span></h1>
    <div class="tag">Yapay zeka destekli kişisel fitness asistanın</div>
    <div class="feats">
      <div class="feat"><div class="e">🏋️</div><div class="t">AI Antrenman</div><div class="d">Sana özel haftalık program</div></div>
      <div class="feat"><div class="e">🥗</div><div class="t">Beslenme Planı</div><div class="d">Kalori takibi & makro analizi</div></div>
      <div class="feat"><div class="e">🏆</div><div class="t">Güç Sıralaması</div><div class="d">Ranklar, rozetler, liderlik</div></div>
      <div class="feat"><div class="e">📸</div><div class="t">Gelişim Analizi</div><div class="d">AI ile yağ oranı & fotoğraf</div></div>
    </div>
    <div style="margin-top:36px">
      <a href="/coach" style="display:inline-block;background:#C6FF3D;color:#0B0D12;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;margin:6px">🏋️ Hoca Girişi</a>
      <a href="/admin-panel.html" style="display:inline-block;background:transparent;color:#C6FF3D;border:1px solid #C6FF3D;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;margin:6px">⚙️ Yönetim</a>
    </div>
    <div class="links">
      <a href="/privacy">Gizlilik Politikası</a> ·
      <a href="/terms">Kullanım Koşulları</a> ·
      <a href="/delete-account">Hesap Silme</a>
    </div>
    <div class="foot">İletişim: ilhanbahri4@gmail.com<br>GymBodyAI © 2026</div>
  </div>
</body></html>`);
});

app.get('/privacy', (req, res) => {
  res.type('html').send(LEGAL_PAGE('Gizlilik Politikası', `
    <h1>Gizlilik Politikası</h1>
    <div class="date">Son güncelleme: 25 Haziran 2026</div>
    <p>GymBodyAI ("uygulama") olarak gizliliğine önem veriyoruz. Bu politika, hangi verileri topladığımızı, nasıl kullandığımızı ve haklarını açıklar.</p>

    <h2>1. Topladığımız Veriler</h2>
    <ul>
      <li><b>Hesap bilgileri:</b> Ad, e-posta adresi ve (Google ile giriş yapıyorsan) Google profil bilgilerin.</li>
      <li><b>Fiziksel veriler:</b> Boy, kilo, yaş, cinsiyet, hedef kilo ve antrenman/güç kayıtların — sana kişisel program ve gelişim takibi sunmak için.</li>
      <li><b>Fotoğraflar:</b> Yüklediğin profil ve gelişim fotoğrafları.</li>
      <li><b>Kullanım verileri:</b> Seri (streak), token, rozet ve uygulama içi etkinlik bilgileri.</li>
      <li><b>Bildirim kimliği:</b> Push bildirimi gönderebilmek için cihaz bildirim jetonu.</li>
    </ul>

    <h2>2. Verileri Nasıl Kullanıyoruz</h2>
    <ul>
      <li>Sana özel antrenman ve beslenme programı oluşturmak,</li>
      <li>Gelişimini takip etmek ve karşılaştırmalı analiz sunmak,</li>
      <li>Güç sıralaması ve arkadaş özelliklerini sağlamak,</li>
      <li>Hatırlatma ve bilgilendirme bildirimleri göndermek.</li>
    </ul>

    <h2>3. Üçüncü Taraf Hizmetler</h2>
    <p>Uygulama aşağıdaki hizmetleri kullanır; bu hizmetlerin kendi gizlilik politikaları geçerlidir:</p>
    <ul>
      <li><b>Google AdMob</b> — reklam gösterimi (VIP üyeler reklam görmez).</li>
      <li><b>RevenueCat / App Store</b> — abonelik ve satın alma yönetimi.</li>
      <li><b>Cloudinary</b> — fotoğraf depolama.</li>
      <li><b>Google Sign-In</b> — isteğe bağlı giriş yöntemi.</li>
    </ul>

    <h2>4. Veri Güvenliği</h2>
    <p>Verilerin şifreli bağlantı (HTTPS) üzerinden iletilir ve güvenli sunucularda saklanır. Şifreler hash'lenerek tutulur.</p>

    <h2>5. Haklarınız</h2>
    <p>Hesabını ve tüm verilerini silmek istersen uygulama içinden hesabını silebilir veya bizimle iletişime geçebilirsin. Talebin üzerine verilerin kalıcı olarak silinir.</p>

    <h2>6. Çocukların Gizliliği</h2>
    <p>Uygulama 13 yaş altı kullanıcılara yönelik değildir.</p>

    <h2>7. Değişiklikler</h2>
    <p>Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikleri uygulama üzerinden bildiririz.</p>
  `));
});

app.get('/terms', (req, res) => {
  res.type('html').send(LEGAL_PAGE('Kullanım Koşulları', `
    <h1>Kullanım Koşulları</h1>
    <div class="date">Son güncelleme: 25 Haziran 2026</div>
    <p>GymBodyAI uygulamasını kullanarak aşağıdaki koşulları kabul etmiş olursun.</p>

    <h2>1. Hizmet</h2>
    <p>GymBodyAI; yapay zeka destekli antrenman ve beslenme önerileri, gelişim takibi ve güç sıralaması sunan bir fitness uygulamasıdır.</p>

    <h2>2. Sağlık Uyarısı</h2>
    <p>Uygulamadaki öneriler genel bilgilendirme amaçlıdır ve <b>tıbbi tavsiye yerine geçmez</b>. Yeni bir antrenman veya beslenme programına başlamadan önce doktoruna danışmanı öneririz. Yaptığın egzersizlerden doğan sorumluluk sana aittir.</p>

    <h2>3. Abonelik (VIP)</h2>
    <ul>
      <li>VIP üyelik aylık, 6 aylık veya yıllık olarak sunulur.</li>
      <li>Ödeme, App Store hesabın üzerinden tahsil edilir.</li>
      <li>Abonelik, dönem bitiminden en az 24 saat önce iptal edilmezse otomatik yenilenir.</li>
      <li>Abonelik yönetimi ve iptal, cihazının App Store ayarlarından yapılır.</li>
    </ul>

    <h2>4. Kullanıcı Sorumluluğu</h2>
    <p>Hesabını ve şifreni gizli tutmaktan sen sorumlusun. Başkalarını rahatsız edici içerik paylaşmamayı kabul edersin.</p>

    <h2>5. Fikri Mülkiyet</h2>
    <p>Uygulamanın tüm içeriği ve tasarımı GymBodyAI'ya aittir. İzinsiz kopyalanamaz.</p>

    <h2>6. Sorumluluğun Sınırlanması</h2>
    <p>Uygulama "olduğu gibi" sunulur. Kullanımdan doğan dolaylı zararlardan sorumlu tutulamayız.</p>

    <h2>7. İletişim</h2>
    <p>Sorularını ilhanbahri4@gmail.com adresine iletebilirsin.</p>
  `));
});

app.get('/delete-account', (req, res) => {
  res.type('html').send(LEGAL_PAGE('Hesabı Sil', `
    <h1>GymBodyAI — Hesap Silme</h1>
    <div class="date">Son güncelleme: 25 Haziran 2026</div>
    <p>Hesabını ve tüm verilerini iki şekilde kalıcı olarak silebilirsin:</p>

    <h2>1. Uygulama içinden (önerilen)</h2>
    <ul>
      <li>GymBodyAI uygulamasını aç</li>
      <li><b>Profil</b> sekmesine git</li>
      <li>En altta <b>"Hesabı Sil"</b> bağlantısına dokun</li>
      <li>Onay adımlarını tamamla</li>
    </ul>

    <h2>2. E-posta ile</h2>
    <p>Uygulamaya erişemiyorsan, hesabını açtığın e-posta adresinden <a href="mailto:ilhanbahri4@gmail.com">ilhanbahri4@gmail.com</a> adresine "Hesap silme talebi" konulu bir e-posta gönder. Talebin en geç 30 gün içinde işlenir.</p>

    <h2>Silinen veriler</h2>
    <p>Hesap silindiğinde şunlar kalıcı olarak kaldırılır: ad, e-posta, profil ve gelişim fotoğrafları, antrenman ve beslenme verileri, güç kayıtları, mesajlar, arkadaşlıklar ve rozetler.</p>

    <h2>Saklanan veriler</h2>
    <p>Yasal yükümlülükler gereği faturalandırma/işlem kayıtları sınırlı süre saklanabilir; bunlar kişisel profilinle ilişkilendirilmez. Abonelik iptali App Store/Google Play hesabından ayrıca yapılmalıdır.</p>
  `));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sistem tam kapasite hazır! (port ${PORT})`));