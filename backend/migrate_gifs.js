require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const ExerciseGif = require('./models/ExerciseGif');

function fetchExerciseDB(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'exercisedb.p.rapidapi.com',
      path,
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse hatası: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function wordOverlap(a, b) {
  const wa = normalize(a).split(/\s+/);
  const wb = normalize(b).split(/\s+/);
  const shorter = wa.length <= wb.length ? wa : wb;
  const longer  = wa.length <= wb.length ? wb : wa;
  return shorter.every(w => longer.includes(w));
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('✅ MongoDB bağlandı\n🔄 ExerciseDB\'den tüm egzersizler çekiliyor...');

  let allExercises = [];
  try {
    allExercises = await fetchExerciseDB('/exercises?limit=1300&offset=0');
    console.log(`📦 ExerciseDB\'den ${allExercises.length} egzersiz alındı\n`);
  } catch (err) {
    console.error('❌ ExerciseDB çekilemedi:', err.message);
    return mongoose.disconnect();
  }

  const dbExercises = await ExerciseGif.find({});
  let updated = 0, notFound = [];

  for (const ex of dbExercises) {
    // 1. Tam isim eşleşmesi
    let match = allExercises.find(e => normalize(e.name) === normalize(ex.name));
    // 2. Kelime örtüşmesi
    if (!match) match = allExercises.find(e => wordOverlap(e.name, ex.name));

    if (match?.gifUrl) {
      await ExerciseGif.findByIdAndUpdate(ex._id, { gifUrl: match.gifUrl });
      console.log(`✅ ${ex.name} → ${match.name}`);
      updated++;
    } else {
      console.log(`❌ EŞLEŞME YOK: ${ex.name}`);
      notFound.push(ex.name);
    }
    await sleep(100);
  }

  console.log(`\n🎉 Tamamlandı: ${updated}/${dbExercises.length} egzersiz güncellendi`);
  if (notFound.length) console.log('⚠️  Eşleşemeyen egzersizler:', notFound.join(', '));
  mongoose.disconnect();
});
