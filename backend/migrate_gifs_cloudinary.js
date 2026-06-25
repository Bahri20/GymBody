// TEK SEFERLİK: workoutx GIF'lerini Cloudinary'ye taşır, DB'yi günceller.
// Böylece her gösterimde dış API'ye gidilmez (kota tükenmesin). Çalıştır: node migrate_gifs_cloudinary.js
require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const cloudinary = require('cloudinary').v2;
const ExerciseGif = require('./models/ExerciseGif');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function uploadToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'exercise_gifs', public_id: publicId, resource_type: 'image', overwrite: true },
      (err, result) => (err ? reject(err) : resolve(result))
    ).end(buffer);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const gifs = await ExerciseGif.find({ gifUrl: /workoutxapp/ });
  console.log(`Taşınacak GIF: ${gifs.length}`);
  let ok = 0, fail = 0;
  for (const g of gifs) {
    try {
      const fname = (g.gifUrl.split('/').pop() || '').replace('.gif', '') || g._id.toString();
      const proxyUrl = `${g.gifUrl}?api-key=${process.env.WORKOUTX_API_KEY}`;
      const buf = await download(proxyUrl);
      const result = await uploadToCloudinary(buf, `gif_${fname}`);
      g.gifUrl = result.secure_url;
      await g.save();
      ok++;
      console.log(`✓ ${g.name} → Cloudinary (${ok}/${gifs.length})`);
      await sleep(400);
    } catch (e) {
      fail++;
      console.error(`✗ ${g.name}: ${e.message}`);
    }
  }
  console.log(`\nBitti. Başarılı: ${ok}, Hata: ${fail}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
