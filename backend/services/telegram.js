const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Receipt = mongoose.model('TelegramReceipt', new mongoose.Schema({
  _id: String,
  text: String,
  createdAt: { type: Date, default: Date.now },
  sentAt: Date,
  leaseUntil: Date,
}));
const clean = value => String(value ?? '').replace(/[\r\n]/g, ' ').slice(0, 180);
const date = value => new Date(value || Date.now()).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
function authorized(header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function paidEvent(event) {
  return !!event && typeof event.id === 'string' && event.id.length > 0 &&
    event.environment === 'PRODUCTION' && ['APP_STORE', 'PLAY_STORE'].includes(event.store) &&
    (event.type === 'INITIAL_PURCHASE' || (event.type === 'RENEWAL' && event.is_trial_conversion === true)) &&
    event.period_type !== 'TRIAL' && Number.isFinite(event.price) && event.price > 0 &&
    Array.isArray(event.entitlement_ids) && event.entitlement_ids.includes('vip');
}
async function sendTelegram(text, fetchImpl = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram yapılandırılmamış');
  // Never log the request URL or raw errors: they can contain the bot token.
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(3500),
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error('rejected');
  } catch { throw new Error('Telegram mesajı gönderilemedi'); }
}
async function deliverOnce(key, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) throw new Error('Telegram yapılandırılmamış');
  await Receipt.updateOne({ _id: key }, { $setOnInsert: { text, leaseUntil: new Date(0) } }, { upsert: true });
  const receipt = await Receipt.findOneAndUpdate({ _id: key, sentAt: null, leaseUntil: { $lte: new Date() } },
    { $set: { leaseUntil: new Date(Date.now() + 30000) } }, { new: true });
  if (!receipt) {
    if ((await Receipt.findById(key))?.sentAt) return;
    throw new Error('Bildirim işleniyor');
  }
  try {
    await sendTelegram(text);
    await Receipt.updateOne({ _id: key }, { $set: { sentAt: new Date() } });
  } catch (error) {
    await Receipt.updateOne({ _id: key }, { $set: { leaseUntil: new Date(0) } });
    throw error;
  }
}
async function notifySignup(user, provider) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  try {
    await deliverOnce(`signup:${user._id}`, `👤 Yeni GymBody üyesi\nAd: ${clean(user.name)}\nGiriş: ${clean(provider)}\nTarih: ${date(user.createdAt)}\nÜye ID: ${user._id}`);
  } catch { console.warn('Telegram yeni üye bildirimi gönderilemedi'); }
}
function purchaseMessage(event, user) {
  return `💎 Yeni ücretli GymBody aboneliği\nÜye: ${clean(user?.name || 'RevenueCat kullanıcısı')}\nPaket: ${clean(event.product_id)}\nMağaza: ${event.store === 'APP_STORE' ? 'App Store' : 'Google Play'}\nTutar: ${clean(event.price_in_purchased_currency ?? event.price)} ${clean(event.currency || 'USD')}\nTarih: ${date(event.purchased_at_ms)}\nÜye ID: ${clean(user?._id || event.app_user_id)}`;
}
async function retryPending() {
  const pending = await Receipt.find({ sentAt: null, leaseUntil: { $lte: new Date() }, text: { $exists: true } })
    .sort({ createdAt: 1 }).limit(10);
  let sent = 0;
  for (const item of pending) {
    await deliverOnce(item._id, item.text);
    sent++;
  }
  return { sent };
}
module.exports = { retryPending, authorized, paidEvent, sendTelegram, deliverOnce, notifySignup, purchaseMessage };
