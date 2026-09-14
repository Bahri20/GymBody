# GymBody Telegram bildirimleri

## Backend ortam değişkenleri

- `TELEGRAM_BOT_TOKEN`: BotFather token'ı.
- `TELEGRAM_CHAT_ID`: sahibin özel sohbet kimliği.
- `REVENUECAT_WEBHOOK_SECRET`: bağımsız, rastgele bir gizli değer (ör. `openssl rand -hex 32`). Telegram token'ını bunun yerine kullanma.

Backend deploy edilince yalnız yeni oluşturulan Google, Apple ve e-posta hesapları bildirilir. Mevcut kullanıcıların girişleri ve eski kayıtlar bildirilmez. Hediye VIP, ücretli abonelik olarak sayılmaz. Mesajlar ad, sağlayıcı ve üye kimliği içerir; e-posta/telefon içermez. HTTP gönderimi yanıt öncesi beklenir (Cloud Run istek sonrası CPU'yu durdurabilir); Telegram isteği 3.5 saniyeyle sınırlıdır. Gönderim hatası kaydı/girişi engellemez.

## RevenueCat ayarı

Project → Integrations → Webhooks → Add new configuration:

- URL: `https://gymbody.bahriapps.com/integrations/revenuecat`
- Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET ile aynı değer>`
- Environment: Production
- Events: INITIAL_PURCHASE ve RENEWAL (yalnız trial conversion işlenir)

Yalnız pozitif ücretli, production App Store/Play Store VIP işlemleri bildirilir. Sandbox, TEST, ücretsiz deneme, promosyon ve normal yenilemeler atlanır. RevenueCat test olayı 200/ignored alır; Telegram mesajı üretmez.

Mobil satın alma öncesinde RevenueCat kullanıcısı GymBody user ID'siyle eşleştirilir. Bunun için yeni mobil build gerekir. Eski build'lerden anonim RevenueCat ID'si gelirse ödeme bildirimi yine gelir, kullanıcı adı yerine RevenueCat ID'si gösterilir.

Eski `/revenuecat-webhook` mobil VIP senkronizasyon yolu aynı kalır; yeni sunucu bildirimi buradan tetiklenmez. Yeni bildirim endpoint'i VIP hakkını değiştirmez.

## Test ve tekrar deneme

`node --test tests/telegram.test.js`

Canlı bağlantıyı test etmek için admin oturum token'ıyla `POST /admin/telegram/test` çağrılabilir. Bu endpoint yalnız sabit bir test mesajını yapılandırılmış alıcıya yollar; dışarıdan alıcı/metin kabul etmez.

MongoDB `telegramreceipts` koleksiyonu gönderilen olay kimliklerini ve bekleyen mesajları tutar. Aynı olay tekrar geldiğinde yeniden gönderilmez. Gönderim hatası lease'i serbest bırakır; RevenueCat başarısız webhook'ları tekrar gönderir.

Normal yeni üye bildirimlerinde de geçici hataları tekrar denemek için Cloud Scheduler'da 5 dakikada bir `POST https://gymbody.bahriapps.com/internal/cron/telegram-notifications` çağrısı tanımla; mevcut cron işleri gibi `X-Cron-Secret` başlığını kullan. Her çağrı en fazla 10 bekleyen mesaj işler. Node cron etkin ortamlarda bu görev otomatik çalışır. Cloud Run'da kalıcı arka plan timer'ına güvenilmez.

Telegram mesajı kabul ettikten hemen sonra bağlantı/DB koparsa yeniden denemede nadiren tekrar mesaj olabilir; Telegram sendMessage uç noktası idempotency anahtarı sağlamaz.

Token'ları Git'e, ekran görüntüsüne veya loglara ekleme. Canlı test ve deploy yerel testlerden ayrı adımlardır.
