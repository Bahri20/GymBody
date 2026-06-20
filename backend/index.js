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
const sharp = require('sharp');
const toDateString = (date) => date.toISOString().split('T')[0];
require('dotenv').config({ path: path.join(__dirname, '.env') });
const cloudinary = require('cloudinary').v2;
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

// Genel API limiti
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 dakika
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderdin, 15 dakika sonra tekrar dene.' }
});
app.use('/api', generalLimiter);

// Auth endpoint'leri için sıkı limit (brute force önlemi)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Çok fazla giriş denemesi. 15 dakika bekle.' },
  skipSuccessfulRequests: true
});
app.use('/register', authLimiter);
app.use('/login', authLimiter);
app.use('/coach/login', authLimiter);
app.use('/admin/login', authLimiter);

// AI endpoint'leri için limit (pahalı çağrılar)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 dakika
  max: 5,
  message: { error: 'AI isteği sınırına ulaştın, 1 dakika bekle.' }
});
app.use('/analyze-meal', aiLimiter);
app.use('/generate-weekly-plan', aiLimiter);

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

function matchGifUrl(exerciseName, availableExercises) {
  const aiWords = exerciseName.toLowerCase().split(/\s+/);
  return availableExercises.find(e => {
    const dbWords = e.name.toLowerCase().split(/\s+/);
    const shorter = aiWords.length <= dbWords.length ? aiWords : dbWords;
    const longer  = aiWords.length <= dbWords.length ? dbWords : aiWords;
    return shorter.every(w => longer.includes(w));
  });
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
      // Yedek yol: access token ile Google userinfo'dan kimlik çek
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
    await User.findByIdAndUpdate(req.userId, { onboarded: true });
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
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı kanka!" });

    const VIP_COST = 200;

    if ((user.tokens || 0) < VIP_COST) {
      return res.status(400).json({ error: `Yetersiz token! ${VIP_COST} token gerekiyor, sende ${user.tokens || 0} token var.` });
    }

    user.tokens -= VIP_COST;

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

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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
      calories: mealData.calories,
      protein: mealData.protein,
      carbs: mealData.carbs,
      fat: mealData.fat,
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
app.post('/get-weekly-plan', authMiddleware, async (req, res) => {
  try {
    const { allergy, feedback, goal } = req.body;
    const goalLabels = {
      definition: 'Definasyon (yağ yakma, kalori açığı)',
      bulk: 'Bulk (kas kazanımı, kalori fazlası)',
      maintain: 'Koruma (mevcut formu koruma)',
    };
    const goalText = goalLabels[goal] || 'Definasyon (yağ yakma)';
    const programDays = 3;
    const trainingDaysPerWeek = null;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı kanka!" });

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
      model: "gemini-1.5-flash",
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

    const prompt = `
Sen bir kişisel antrenör ve diyetisyensin. Aşağıdaki bilgilere göre ${programDays} günlük döngü antrenman ve beslenme programı hazırla:

- Boy: ${uH || 'bilinmiyor'} cm, Kilo: ${uW || 'bilinmiyor'} kg
- Yaş: ${gAge || 'bilinmiyor'}, Cinsiyet: ${user.gender || 'bilinmiyor'}
- Vücut yağ oranı: ${bodyFat != null ? bodyFat + '%' : 'bilinmiyor'}
- Hedef kilo: ${user.targetWeight || 'belirtilmemiş'}
- Günlük kalori hedefi: ${dailyCalorieTarget} kcal
- Döngü uzunluğu: ${programDays} gün — sabit 3 günlük döngü (bittikten sonra baştan başlar)
- Beslenme hedefi: ${goalText}
- Alerji/kısıtlama: ${allergy || 'yok'}
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
      trainingDaysPerWeek,
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
    if (!url || !url.startsWith('https://api.workoutxapp.com/')) {
      return res.status(400).json({ error: "Geçersiz URL" });
    }
    const https = require('https');
    const proxyUrl = `${url}?api-key=${process.env.WORKOUTX_API_KEY}`;
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
  const newBadges = [];

  const BADGE_RULES = [
    { id: 'first_workout',   label: 'İlk Adım 🏃',      check: () => (user.weeklyPlan?.currentDay || 0) >= 1 },
    { id: 'streak_3',        label: '3 Günlük Seri 🔥',  check: () => (user.streak || 0) >= 3 },
    { id: 'streak_7',        label: '7 Günlük Seri ⚡',  check: () => (user.streak || 0) >= 7 },
    { id: 'streak_30',       label: '30 Günlük Efsane 👑', check: () => (user.streak || 0) >= 30 },
    { id: 'vip_member',      label: 'VIP Üye ⭐',         check: () => user.isVip },
    { id: 'plan_complete',   label: 'Program Tamamlandı 💪', check: () => user.weeklyPlan?.completedFully },
  ];

  for (const rule of BADGE_RULES) {
    if (!existing.has(rule.id) && rule.check()) {
      newBadges.push({ id: rule.id, label: rule.label });
    }
  }

  if (newBadges.length) {
    await User.findByIdAndUpdate(userId, {
      $push: { badges: { $each: newBadges.map(b => b.id) } },
      $inc: { tokens: newBadges.length * 5 }
    });
  }
  return newBadges;
}

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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
    const coach = await Coach.findById(req.coachId);
    if (!coach) return res.status(404).json({ error: "Koç bulunamadı." });

    const recentCommissions = coach.commissions.slice(-20).reverse();
    const pendingWithdrawals = coach.withdrawals.filter(w => w.status === 'pending');

    res.json({
      name: coach.name,
      referralCode: coach.referralCode,
      discountRate: coach.discountRate,
      commissionRate: coach.commissionRate,
      balance: coach.balance,
      totalEarned: coach.totalEarned,
      referredCount: coach.referredUsers.length,
      recentCommissions,
      pendingWithdrawals
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
    const { name, email, password, phone, referralCode, discountRate, commissionRate, notes } = req.body;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Sistem tam kapasite hazır! (port ${PORT})`));