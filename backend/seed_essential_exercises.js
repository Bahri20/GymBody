// Same two-frame images format used by the mobile exercise detail animation.
// node seed_essential_exercises.js (preview), --write (insert missing records).
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const ExerciseGif = require('./models/ExerciseGif');
const BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@b0eed061e1c832b3ed815fbaa4b45b3cdc14df49/';
const PICKS = [
  ['Lying Leg Curls', 'Bacak'],
  ['Smith Machine Squat', 'Bacak'],
  ['Straight-Arm Pulldown', 'Sırt'],
  ['Thigh Abductor', 'Bacak'],
];

async function main() {
  const response = await fetch(`${BASE}dist/exercises.json`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json();
  const candidates = [];
  for (const [name, bodyPart] of PICKS) {
    const source = catalog.find(ex => ex.name === name);
    if (!source || source.images?.length !== 2) throw new Error(`Missing image pair: ${name}`);
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
  for (const record of candidates) {
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
