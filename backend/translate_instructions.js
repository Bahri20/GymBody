// Egzersiz talimatlarını (EN) Türkçe'ye çevirir → instructionsTr alanına yazar.
// YERELDEN çalışır (GEMINI_API_KEY doğrudan; Render bloklu, yerel Türkiye IP çalışıyor).
// Idempotent: instructionsTr dolu olanları atlar → kesilirse kaldığından devam eder.
// Çalıştır:  node translate_instructions.js
require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const ExerciseGif = require('./models/ExerciseGif');

const KEY = process.env.GEMINI_API_KEY;
const BATCH = 12;                 // her çağrıda kaç egzersiz
const MODEL = 'gemini-2.5-flash';

function gemini(prompt) {
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const t = j?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!t) return reject(new Error('boş cevap: ' + d.slice(0, 200)));
          resolve(t);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function stripJson(t) {
  let s = t.trim();
  if (s.startsWith('```')) s = s.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return s;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const todo = await ExerciseGif.find({
    instructions: { $exists: true, $not: { $size: 0 } },
    $or: [{ instructionsTr: { $exists: false } }, { instructionsTr: { $size: 0 } }],
  });
  console.log(`Çevrilecek: ${todo.length} egzersiz`);

  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const input = chunk.map((e, k) => ({ i: k, name: e.name, steps: e.instructions }));
    const prompt =
`Aşağıdaki fitness egzersiz talimatlarını doğal, akıcı Türkçe'ye çevir. Spor terimlerini Türkçe fitness dilinde kullan (ör. "repetitions"→"tekrar", "grip"→"tutuş"). Adım sayısını ve sırasını KORU.
YALNIZCA saf JSON dizisi döndür, açıklama/kod bloğu ekleme. Format: her eleman {"i": <index>, "steps": [<çevrilmiş adımlar>]}.
Girdi:
${JSON.stringify(input)}`;

    try {
      const raw = await gemini(prompt);
      const arr = JSON.parse(stripJson(raw));
      const byIdx = new Map(arr.map(x => [x.i, x.steps]));
      for (let k = 0; k < chunk.length; k++) {
        const steps = byIdx.get(k);
        if (Array.isArray(steps) && steps.length) {
          chunk[k].instructionsTr = steps;
          await chunk[k].save();
          done++;
        }
      }
      console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length} işlendi (toplam çevrilen: ${done})`);
    } catch (e) {
      console.error(`  ⚠️ batch ${i} hata: ${e.message} — atlandı`);
    }
    await sleep(600);
  }
  console.log(`\n🎉 Bitti: ${done}/${todo.length} egzersiz Türkçe talimatlı`);
  await mongoose.disconnect();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
