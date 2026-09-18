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
async function invoke(path, method, body, model, generate) {
  const originals = {};
  for (const [key, value] of Object.entries(model)) { originals[key] = MealLog[key]; MealLog[key] = value; }
  try {
    const router = createRouter({ auth: (_, __, next) => next(), aiLimiter: (_, __, next) => next(), generate, language: () => '', cloudinary: {} });
    const layer = router.stack.find(s => s.route?.path === path && s.route.methods[method]);
    const req = { params: { id }, body, userId: 'owner', query: {} };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.data = value; } };
    await layer.route.stack.at(-1).handle(req, res);
    return res;
  } finally { for (const [key, value] of Object.entries(originals)) MealLog[key] = value; }
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
