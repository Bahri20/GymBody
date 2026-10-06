// Same two-frame images format used by the mobile exercise detail animation.
// node seed_home_exercises.js (preview), --write (insert missing records).
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const ExerciseGif = require('./models/ExerciseGif');
const BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@b0eed061e1c832b3ed815fbaa4b45b3cdc14df49/';
const PICKS = [
  [
    "Pushups",
    "Göğüs"
  ],
  [
    "Push-Up Wide",
    "Göğüs"
  ],
  [
    "Push-Ups - Close Triceps Position",
    "Triceps"
  ],
  [
    "Bodyweight Squat",
    "Bacak"
  ],
  [
    "Butt Lift (Bridge)",
    "Bacak"
  ],
  [
    "Single Leg Glute Bridge",
    "Bacak"
  ],
  [
    "Glute Kickback",
    "Bacak"
  ],
  [
    "Plank",
    "Karın"
  ],
  [
    "Dead Bug",
    "Karın"
  ],
  [
    "Air Bike",
    "Karın"
  ],
  [
    "Reverse Crunch",
    "Karın"
  ],
  [
    "Alternate Heel Touchers",
    "Karın"
  ],
  [
    "Superman",
    "Sırt"
  ],
  [
    "Dumbbell Squat",
    "Bacak"
  ],
  [
    "Dumbbell Lunges",
    "Bacak"
  ],
  [
    "Bent Over Two-Dumbbell Row",
    "Sırt"
  ],
  [
    "Hammer Curls",
    "Biceps"
  ],
  [
    "Standing Dumbbell Press",
    "Omuz"
  ],
  [
    "Side Lateral Raise",
    "Omuz"
  ],
  [
    "Tricep Dumbbell Kickback",
    "Triceps"
  ],
  [
    "Stiff-Legged Dumbbell Deadlift",
    "Bacak"
  ],
  [
    "Band Pull Apart",
    "Omuz"
  ],
  [
    "Squats - With Bands",
    "Bacak"
  ],
  [
    "Lateral Raise - With Bands",
    "Omuz"
  ],
];

async function main() {
  const response = await fetch(`${BASE}dist/exercises.json`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json();
  const candidates = [];
  for (const [name, bodyPart] of PICKS) {
    const source = catalog.find(ex => ex.name === name);
    if (!source || source.images?.length !== 2 || !source.instructions?.length) throw new Error(`Missing image pair: ${name}`);
    const images = source.images.map(path => `${BASE}exercises/${path}`);
    for (const url of images) {
      const image = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      if (!image.ok || !image.headers.get('content-type')?.startsWith('image/')) {
        throw new Error(`Unavailable image: ${url}`);
      }
    }
    candidates.push({ name, bodyPart, images, gifUrl: images[1], animated: false,
      equipment: source.equipment, primaryMuscles: source.primaryMuscles,
      secondaryMuscles: source.secondaryMuscles, level: source.level,
      category: source.category, instructions: source.instructions, source: 'free-exercise-db' });
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const existingRecords = await ExerciseGif.find({}, 'name images gifUrl').lean();
  const norm = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const record of candidates) {
    const duplicate = existingRecords.find(item => norm(item.name) === norm(record.name) ||
      record.images.some(url => [...(item.images || []), item.gifUrl || ''].some(existingUrl => existingUrl.endsWith('/' + url.split('/exercises/')[1]))));
    if (duplicate) { console.log('SKIP ' + record.name + ': ' + duplicate.name); continue; }
    // An existing alias can already use these photos; do not duplicate it.
    const query = { $or: [{ name: record.name }, { images: record.images[0] }] };
    const existing = await ExerciseGif.findOne(query).select('name').lean();
    if (existing) { console.log(`SKIP ${record.name}: ${existing.name}`); continue; }
    if (process.argv.includes('--write')) {
      const result = await ExerciseGif.updateOne(query, { $setOnInsert: record }, { upsert: true });
      console.log(`${result.upsertedCount ? 'ADDED' : 'SKIP'} ${record.name}`);
    } else console.log(`WOULD ADD ${record.name} (${record.images.length} frames)`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
