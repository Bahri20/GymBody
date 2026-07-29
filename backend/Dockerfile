# Cloud Run için üretim imajı (sharp ve bcrypt'in prebuilt binary'leri Debian slim'de çalışır)
FROM node:22-slim

WORKDIR /app

# Önce sadece bağımlılıkları kopyala ki kod değişikliklerinde bu katman cache'ten gelsin
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

# Cloud Run PORT env'ini kendisi verir; index.js process.env.PORT'u okuyor
CMD ["node", "index.js"]
