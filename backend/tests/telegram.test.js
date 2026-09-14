const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authorized, paidEvent, sendTelegram, deliverOnce, purchaseMessage } = require('../services/telegram');
const valid = { id: 'event1', environment: 'PRODUCTION', store: 'APP_STORE', type: 'INITIAL_PURCHASE', period_type: 'NORMAL', price: 9.99, entitlement_ids: ['vip'] };
test('only real initial payments and trial conversions qualify', () => {
  assert.equal(paidEvent(valid), true);
  assert.equal(paidEvent({ ...valid, store: 'PLAY_STORE', type: 'RENEWAL', is_trial_conversion: true }), true);
  for (const change of [{ environment: 'SANDBOX' }, { store: 'PROMOTIONAL' }, { type: 'TEST' }, { type: 'RENEWAL' }, { period_type: 'TRIAL' }, { price: 0 }, { price: null }, { entitlement_ids: [] }, { id: '' }]) {
    assert.equal(paidEvent({ ...valid, ...change }), false, JSON.stringify(change));
  }
});
test('webhook authorization fails closed', () => {
  assert.equal(authorized('Bearer abc', 'abc'), true);
  assert.equal(authorized('abc', 'abc'), false);
  assert.equal(authorized(undefined, 'abc'), false);
  assert.equal(authorized('Bearer ', ''), false);
});
test('notification names cannot inject extra lines', () => {
  const message = purchaseMessage(valid, { name: 'A\nFake alert', _id: '123' });
  assert.match(message, /Üye: A Fake alert/);
});
test('Telegram request is bounded and never leaks tokens on failure', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'private-test-token';
  process.env.TELEGRAM_CHAT_ID = '123';
  await sendTelegram('test', async (_, options) => {
    assert.equal(JSON.parse(options.body).chat_id, '123');
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  await assert.rejects(sendTelegram('test', async () => { throw new Error('private-test-token'); }), { message: 'Telegram mesajı gönderilemedi' });
  await assert.rejects(sendTelegram('test', async () => ({ ok: true, json: async () => ({ ok: false }) })), /gönderilemedi/);
});
test('delivered events are deduplicated; failed sends release their lease for retry', async () => {
  const model = require('mongoose').model('TelegramReceipt');
  const originals = { updateOne: model.updateOne, findOneAndUpdate: model.findOneAndUpdate, findById: model.findById };
  const originalFetch = global.fetch;
  const rows = new Map();
  let sends = 0;
  model.updateOne = async (filter, update) => {
    if (!rows.has(filter._id)) rows.set(filter._id, { ...update.$setOnInsert });
    Object.assign(rows.get(filter._id), update.$set);
  };
  model.findOneAndUpdate = async (filter, update) => {
    const row = rows.get(filter._id);
    if (row.sentAt || row.leaseUntil > new Date()) return null;
    Object.assign(row, update.$set);
    return row;
  };
  model.findById = async id => rows.get(id);
  global.fetch = async () => { sends++; return { ok: true, json: async () => ({ ok: true }) }; };
  try {
    await deliverOnce('same', 'hello');
    await deliverOnce('same', 'hello');
    assert.equal(sends, 1);
    global.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(deliverOnce('retry', 'hello'));
    assert.equal(rows.get('retry').leaseUntil.getTime(), 0);
    global.fetch = async () => { sends++; return { ok: true, json: async () => ({ ok: true }) }; };
    await deliverOnce('retry', 'hello');
    assert.ok(rows.get('retry').sentAt);
    rows.set('busy', { leaseUntil: new Date(Date.now() + 30000) });
    await assert.rejects(deliverOnce('busy', 'hello'), /işleniyor/);
  } finally { Object.assign(model, originals); global.fetch = originalFetch; }
});
