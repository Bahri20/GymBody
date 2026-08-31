# Cloud Run Deploy Rehberi

Backend'i Google Cloud Run'da çalıştırma rehberi. Bir kere kurulunca sonraki deploy'lar tek komut.
Bu düzen başka projeler için de şablon olarak kullanılabilir.

## Mimari özeti

- **Cloud Run** (min-instances=0): İstek geldikçe çalışır, boşta $0. Ücretsiz kota ayda ~2M istek.
- **Cloud Scheduler**: `node-cron` Cloud Run'da çalışamayacağı için (process istek dışında uyur)
  zamanlanmış görevleri `POST /internal/cron/<görev>` endpoint'leri üzerinden tetikler.
  Cloud Run'da `DISABLE_NODE_CRON=1` verilir; Render gibi sürekli çalışan ortamlarda
  bu değişken verilmez ve node-cron eskisi gibi çalışır.
- MongoDB Atlas ve Cloudinary aynen kalır, sadece API taşınır.

## 1. Tek seferlik kurulum

### gcloud CLI

```bash
brew install --cask google-cloud-sdk
gcloud init          # Google hesabınla giriş yap
```

### Proje + billing

```bash
gcloud projects create gymbody-prod --name="GymBody"
gcloud config set project gymbody-prod
```

Billing'i konsoldan bağla (kart ister, ücretsiz kota aşılmadıkça çekim olmaz):
https://console.cloud.google.com/billing → projeye billing hesabı bağla.

### Gerekli API'ler

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com
```

## 2. Env değişkenleri

`backend/env.yaml` oluştur (bu dosya .gitignore'da, ASLA commit'lenmez).
Değerleri `backend/.env`'den kopyala, üstüne Cloud Run'a özel 2 değişkeni ekle:

```yaml
# .env'deki mevcut değerler:
CLOUDINARY_CLOUD_NAME: "..."
CLOUDINARY_API_KEY: "..."
CLOUDINARY_API_SECRET: "..."
JWT_SECRET: "..."
GEMINI_API_KEY: "..."
MONGO_URI: "..."
ADMIN_KEY: "..."
ADMIN_EMAIL: "..."
ADMIN_PASSWORD_HASH: "..."
GOOGLE_WEB_CLIENT_ID: "..."
GOOGLE_IOS_CLIENT_ID: "..."
GOOGLE_ANDROID_CLIENT_ID: "..."

# Cloud Run'a özel:
DISABLE_NODE_CRON: "1"
CRON_SECRET: "..."   # üret: openssl rand -hex 32
```

Not: Tüm değerler tırnak içinde string olmalı (YAML sayıya çevirmesin).

⚠️ Lokal `.env` ile Render dashboard'daki env listesi birebir aynı olmayabilir
(ör. `VERTEX_PROXY_URL`, `RAPIDAPI_KEY` gibi sonradan eklenenler). Deploy'dan önce
Render > Environment listesini aç ve oradaki TÜM key'lerin env.yaml'da olduğundan emin ol.

## 3. Deploy

```bash
cd backend
gcloud run deploy gymbody-api \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --memory 512Mi \
  --env-vars-file env.yaml
```

- `europe-west1` (Belçika): tier-1 (ucuz) fiyat sınıfı, Türkiye'ye ~50ms.
- `sharp` görsel işlemede bellek yetmezse (loglarda OOM): `--memory 1Gi` ile tekrar deploy.
- Çıktıdaki servis URL'ini not al: `https://gymbody-api-XXXX.europe-west1.run.app`

Sonraki deploy'lar (env değişmediyse) tek satır — Cloud Run mevcut ayarları korur:

```bash
cd backend && gcloud run deploy gymbody-api --source . --region europe-west1
```

Kod değişikliğini canlıya çıkaran komut budur. `git commit` / `git push` canlıyı
etkilemez; onlar sadece kodun kaydı ve GitHub yedeğidir.

### MongoDB Atlas erişimi

Cloud Run'ın çıkış IP'si sabit değil. Atlas → Network Access → `0.0.0.0/0` (Allow from anywhere)
tanımlı olmalı (Render için de büyük ihtimalle zaten böyle; güvenlik kullanıcı adı/şifre + TLS ile sağlanıyor).

## 4. Cloud Scheduler görevleri

`SERVICE_URL` ve `CRON_SECRET` değerlerini kendi değerlerinle değiştirip üçünü de çalıştır:

```bash
SERVICE_URL="https://gymbody-api-XXXX.europe-west1.run.app"
CRON_SECRET="env.yaml'daki değer"

# Her gün 20:00 — streak hatırlatıcısı
gcloud scheduler jobs create http streak-reminder \
  --location europe-west1 \
  --schedule "0 20 * * *" \
  --time-zone "Europe/Istanbul" \
  --uri "$SERVICE_URL/internal/cron/streak-reminder" \
  --http-method POST \
  --headers "X-Cron-Secret=$CRON_SECRET"

# Her Pazar 10:00 — haftalık özet
gcloud scheduler jobs create http weekly-summary \
  --location europe-west1 \
  --schedule "0 10 * * 0" \
  --time-zone "Europe/Istanbul" \
  --uri "$SERVICE_URL/internal/cron/weekly-summary" \
  --http-method POST \
  --headers "X-Cron-Secret=$CRON_SECRET"

# Her ayın 1'i 00:30 — aylık rozet dağıtımı
gcloud scheduler jobs create http monthly-badges \
  --location europe-west1 \
  --schedule "30 0 1 * *" \
  --time-zone "Europe/Istanbul" \
  --uri "$SERVICE_URL/internal/cron/monthly-badges" \
  --http-method POST \
  --headers "X-Cron-Secret=$CRON_SECRET"
```

⚠️ Scheduler konsolundaki "Force run" gerçek kullanıcılara push bildirimi gönderir — test için kullanma.
İlk doğal çalışmayı Cloud Logging'den doğrula (aşağıda).

## 5. Bütçe alarmı

Konsoldan: https://console.cloud.google.com/billing → Budgets & alerts → Create budget
→ $10 → %50/%90/%100 e-posta uyarısı. (Alarm sadece haber verir, servisi durdurmaz.)

## 6. Doğrulama

```bash
# Servis ayakta mı?
curl -s -o /dev/null -w "%{http_code}\n" $SERVICE_URL/          # 200 beklenir

# Cron endpoint korumalı mı?
curl -s -X POST $SERVICE_URL/internal/cron/streak-reminder      # 401 beklenir

# Loglar (ilk cron çalışmasından sonra "📬 Streak hatırlatıcısı" aranır):
gcloud run services logs read gymbody-api --region europe-west1 --limit 50
```

## 7. Mobil geçişi

1. `mobile/app/(tabs)/index.tsx` içindeki `API_URL`'i Cloud Run URL'ine çevir.
2. Expo dev client'ta login + egzersiz listesi akışını dene.
3. Yeni sürümü store'lara gönder.
4. **Render'ı hemen kapatma:** store'daki eski sürümler hâlâ Render URL'ine gidiyor.
   Yeni sürüm yaygınlaşana kadar iki backend paralel çalışır (ikisi de aynı Atlas'a bağlı,
   veri tutarlılığı sorunu yok). Render'daki cron'lar da çalışmaya devam edeceği için
   bildirimlerin çift gitmemesi adına Render'daki servise `DISABLE_NODE_CRON=1` env'i ekle.
