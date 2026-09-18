const test = require('node:test');
const assert = require('node:assert/strict');
const { mealValues, portionValues, dayRange, targets } = require('../lib/nutrition');
const MealLog = require('../models/MealLog');
const createRouter = require('../routes/nutrition');
const base = { mealName: 'Pilav', calories: 400, protein: 20, carbs: 60, fat: 10, portion: 1 };
test('portion changes scale from the current portion, not repeatedly from the total', () => {
  const half = portionValues(base, 0.5);
  assert.equal(half.calories, 200);
  assert.equal(portionValues(half, 2).calories, 800);
  assert.equal(portionValues(portionValues(half, 2), 1).protein, 20);
  assert.throws(() => portionValues(base, -1));
});
test('empty, negative and invalid AI nutrition values cannot be saved', () => {
  for (const calories of ['', -2, Infinity, 'abc', 16000]) assert.throws(() => mealValues({ ...base, calories }));
  assert.throws(() => mealValues({ ...base, protein: undefined }));
});
test('daily boundaries match the user timezone, including midnight crossing', () => {
  const { start, end } = dayRange(-180, new Date('2026-09-18T22:30:00Z'));
  assert.equal(start.toISOString(), '2026-09-18T21:00:00.000Z');
  assert.equal(end.toISOString(), '2026-09-19T21:00:00.000Z');
  assert.throws(() => dayRange(2000));
});
test('planner uses the same targets as the existing mobile calorie card and requires a completed adult profile', () => {
  assert.deepEqual(targets({ weight: 80, height: 180, age: 30, targetWeight: 75, gender: 'male' }), { calories: 1948, protein: 120 });
  assert.throws(() => targets({ weight: 80 }));
  assert.throws(() => targets({ weight: 80, height: 180, age: 15, targetWeight: 75 }));
});
const id = '507f1f77bcf86cd799439011';
async function invoke(path, method, body, model, generate, extraMocks = []) {
  const originals = [];
  for (const [target, methods] of [[MealLog, model], ...extraMocks]) {
    for (const [key, value] of Object.entries(methods)) { originals.push([target, key, target[key]]); target[key] = value; }
  }
  try {
    const router = createRouter({ auth: (_, __, next) => next(), aiLimiter: (_, __, next) => next(), generate, language: () => '', cloudinary: {} });
    const layer = router.stack.find(s => s.route?.path === path && s.route.methods[method]);
    const req = { params: { id }, body, userId: 'owner', query: {} };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.data = value; } };
    await layer.route.stack.at(-1).handle(req, res);
    return res;
  } finally { for (const [target, key, value] of originals) target[key] = value; }
}
test('correction only previews values and enforces ownership', async () => {
  let writes = 0;
  const res = await invoke('/meals/:id/correction', 'post', { note: 'yarısını yedim' }, {
    findOne: async filter => { assert.equal(filter.userId, 'owner'); return { ...base, _id: id }; },
    findOneAndUpdate: async () => { writes++; },
  }, async () => JSON.stringify({ ...base, calories: 200 }));
  assert.equal(res.data.calories, 200); assert.equal(writes, 0);
  const denied = await invoke('/meals/:id/correction', 'post', { note: 'test' }, { findOne: async () => null }, () => { throw Error('must not call AI'); });
  assert.equal(denied.statusCode, 404);
});
test('planned meal becomes eaten once; retries do not add another meal', async () => {
  let current = { ...base, _id: id, status: 'planned' }, writes = 0;
  const model = { findOne: async () => current, findOneAndUpdate: async (filter, update) => {
    assert.equal(filter.status, 'planned'); writes++; current = { ...current, ...update.$set }; return current;
  }};
  await invoke('/meals/:id/eat', 'post', {}, model);
  await invoke('/meals/:id/eat', 'post', {}, model);
  assert.equal(writes, 1); assert.equal(current.status, 'eaten');
});
test('repeat is isolated by owner and uses an idempotent request key without spending scan quota', async () => {
  const result = await invoke('/meals/:id/repeat', 'post', { requestId: 'same-action-123' }, {
    findOne: async () => ({ ...base, _id: id }),
    findOneAndUpdate: async (filter, update, options) => {
      assert.deepEqual(filter, { userId: 'owner', requestId: 'same-action-123' });
      assert.equal(options.upsert, true); assert.equal(update.$setOnInsert.source, 'repeat');
      assert.equal(update.$setOnInsert.status, 'eaten'); return update.$setOnInsert;
    },
  });
  assert.equal(result.statusCode, 200);
});

test('weekly review counts recorded days, ignores planned/deleted meals, and never turns missing days into zero-intake claims', () => {
  const { weeklyReview } = require('../lib/nutrition');
  const logs = [
    { _id: 'a', mealName: 'Omlet', date: '2026-09-18T08:00:00Z', status: 'eaten' },
    { _id: 'b', mealName: 'omlet', date: '2026-09-18T09:00:00Z', status: 'eaten', favorite: true },
    { _id: 'c', mealName: 'Pilav', date: '2026-09-17T09:00:00Z', status: 'planned' },
    { _id: 'd', mealName: 'Pilav', date: '2026-09-16T09:00:00Z', deletedAt: new Date() },
    { _id: 'e', mealName: 'Çorba', date: '2026-09-10T09:00:00Z' },
    { _id: 'f', mealName: 'Omlet', date: '2026-09-17T22:00:00Z' },
  ];
  const review = weeklyReview(logs, -180, new Date('2026-09-18T12:00:00Z'));
  assert.equal(review.loggedDays, 1); assert.equal(review.previousLoggedDays, 1);
  assert.equal(review.mealCount, 3); assert.equal(review.topMeal.count, 3); assert.equal(review.topMeal.favorite, true);
  assert.equal(review.days[6].date, '2026-09-18');
  assert.equal(review.days.filter(d => d.count === 0).length, 6);
  assert.equal(review.avgCalories, undefined);
});

test('saved kitchen preferences reach planning and generation does not log a meal', async () => {
  const User = require('../models/user');
  const Preferences = require('../models/NutritionPreferences');
  const Options = require('../models/NutritionOptions');
  let prompt, writes = 0;
  const res = await invoke('/finish-day', 'post', { offset: -180, avoid: 'makarna' }, {
    find: async query => { assert.equal(query.status.$ne, 'planned'); assert.equal(query.deletedAt, null); return [base]; },
    create: async () => { writes++; },
  }, async text => { prompt = text; return JSON.stringify({ summary: 'Öneriler', suggestions: [1, 2, 3].map(() => ({ ...base, type: 'Pratik', prepMinutes: 10 })) }); }, [
    [User, { findById: async () => ({ weight: 80, height: 180, age: 30, targetWeight: 75, gender: 'male' }) }],
    [Preferences, { findOne: () => ({ lean: async () => ({ pantry: 'yumurta, yoğurt', excluded: 'fıstık', context: 'home', minutes: 15 }) }) }],
    [Options, { create: async data => ({ toObject: () => data }) }],
  ]);
  assert.equal(res.statusCode, 200); assert.equal(writes, 0);
  assert.match(prompt, /yumurta, yoğurt/); assert.match(prompt, /fıstık/); assert.match(prompt, /makarna/);
  assert.match(prompt, /"minutes":15/);
  assert.equal(res.data.remainingCalories, 1548);
});
test('selecting a suggestion persists only a planned meal from the authenticated owners options', async () => {
  const Options = require('../models/NutritionOptions');
  const res = await invoke('/select', 'post', { optionsId: id, suggestionId: id, calories: 9999 }, {
    findOneAndUpdate: async (filter, update) => { assert.equal(filter.requestId, `option_${id}`); assert.equal(update.$setOnInsert.status, 'planned'); assert.equal(update.$setOnInsert.calories, 400); return update.$setOnInsert; },
  }, null, [[Options, { findOne: async filter => { assert.equal(filter.userId, 'owner'); return { suggestions: { id: () => ({ ...base, _id: id }) } }; } }]]);
  assert.equal(res.statusCode, 200); assert.equal(res.data.source, 'plan');
});
test('kitchen settings accept only allowed preparation times and ignore reward fields supplied by clients', async () => {
  const Prefs = require('../models/NutritionPreferences');
  const invalid = await invoke('/preferences', 'put', { pantry: 'yumurta', context: 'home', minutes: 999 }, {});
  assert.equal(invalid.statusCode, 400);
  const valid = await invoke('/preferences', 'put', { pantry: 'yumurta', context: 'home', minutes: 15, earnedBadges: [50] }, {}, null, [[Prefs, { findOneAndUpdate: async (filter, update) => {
    assert.equal(filter.userId, 'owner'); assert.equal(update.$set.earnedBadges, undefined); return update.$set;
  } }]]);
  assert.equal(valid.statusCode, 200);
});
