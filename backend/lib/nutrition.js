const FIELDS = ['calories', 'protein', 'carbs', 'fat'];
function fail(message) { const error = new Error(message); error.status = 400; throw error; }
function mealValues(input) {
  const mealName = String(input?.mealName || input?.title || '').trim().slice(0, 120);
  if (!mealName) fail('Öğün adı gerekli.');
  const result = { mealName, description: String(input.description || input.items || '').slice(0, 1200) };
  for (const key of FIELDS) {
    const n = Number(input[key]);
    if (input[key] == null || String(input[key]).trim() === '' || !Number.isFinite(n) || n < 0 || n > (key === 'calories' ? 15000 : 2000)) fail('Besin değerlerini kontrol et.');
    result[key] = Math.round(n * 10) / 10;
  }
  return result;
}
function portionValues(meal, portion) {
  const n = Number(portion);
  if (![0.5, 1, 1.5, 2].includes(n)) fail('Geçersiz porsiyon.');
  const base = Number(meal.portion) || 1;
  return { ...mealValues({ ...meal, ...Object.fromEntries(FIELDS.map(k => [k, Number(meal[k] || 0) * n / base])) }), portion: n };
}
function dayRange(offsetValue = 0, now = new Date()) {
  const offset = Number(offsetValue);
  if (!Number.isInteger(offset) || Math.abs(offset) > 840) fail('Geçersiz saat dilimi.');
  const local = new Date(now.getTime() - offset * 60000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + offset * 60000);
  return { start, end: new Date(start.getTime() + 86400000), offset };
}
function targets(user) {
  const weight = Number(user.weight), height = Number(user.height), age = Number(user.age), target = Number(user.targetWeight);
  if (!(weight > 0 && height > 0 && age >= 18 && target > 0)) fail('Plan için profilindeki yaş, boy, kilo ve hedef kiloyu tamamla.');
  const female = ['female', 'kadin', 'kadın', 'woman'].includes(String(user.gender).toLowerCase());
  const bmr = Math.round(10 * weight + 6.25 * height - 5 * age + (female ? -161 : 5));
  const calories = Math.round(bmr * 1.375) + (target < weight ? -500 : target > weight ? 300 : 0);
  return { calories, protein: Math.round(weight * 1.5) };
}
function parseAI(text) { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')); }
module.exports = { FIELDS, mealValues, portionValues, dayRange, targets, parseAI };

function weeklyReview(logs, offsetValue = 0, now = new Date()) {
  const { start, offset } = dayRange(offsetValue, now);
  const first = new Date(start.getTime() - 6 * 86400000);
  const days = Array.from({ length: 7 }, (_, index) => ({ date: new Date(first.getTime() + index * 86400000 - offset * 60000).toISOString().slice(0, 10), count: 0 }));
  const prior = new Set();
  const foods = new Map();
  for (const meal of logs) {
    if (meal.deletedAt || meal.status === 'planned') continue;
    const index = Math.floor((new Date(meal.date).getTime() - first.getTime()) / 86400000);
    if (index >= -7 && index < 0) prior.add(index);
    if (index < 0 || index >= 7 || !Number.isFinite(index)) continue;
    days[index].count++;
    const key = String(meal.mealName || '').trim().toLocaleLowerCase('tr');
    if (!key) continue;
    const entry = foods.get(key) || { name: meal.mealName, count: 0, mealId: String(meal._id), favorite: false };
    entry.count++; entry.favorite ||= !!meal.favorite; foods.set(key, entry);
  }
  return { days, loggedDays: days.filter(d => d.count > 0).length, previousLoggedDays: prior.size, mealCount: days.reduce((a, d) => a + d.count, 0), topMeal: [...foods.values()].sort((a, b) => b.count - a.count)[0] || null };
}
module.exports.weeklyReview = weeklyReview;
