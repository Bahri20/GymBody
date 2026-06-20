require('dotenv').config();
const mongoose = require('mongoose');
const ExerciseGif = require('./models/ExerciseGif');
const backup = require('./exerciseGif_backup.json');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  let restored = 0;
  for (const item of backup) {
    await ExerciseGif.findByIdAndUpdate(item._id, { gifUrl: item.gifUrl });
    restored++;
  }
  console.log(`✅ ${restored} egzersiz eski URL'lere geri döndürüldü.`);
  mongoose.disconnect();
});
