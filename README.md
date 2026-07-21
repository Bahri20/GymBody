# GymBodyAI

> AI-powered fitness companion — workout tracking, strength analytics, AI nutrition & coaching. Published on the **App Store** and **Google Play**.

GymBodyAI is a production, full-stack mobile application (iOS & Android) that helps people train smarter. It combines strength progression analytics, an AI coach powered by Google Gemini, photo-based nutrition analysis, progress tracking, and a competitive leaderboard — wrapped in a bilingual (TR/EN) React Native experience.

<p align="left">
  <img alt="Platform" src="https://img.shields.io/badge/platform-iOS%20%7C%20Android-black">
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-Expo%20SDK%2054-000?logo=expo">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Backend" src="https://img.shields.io/badge/backend-Node.js%20%2B%20Express-339933?logo=node.js&logoColor=white">
  <img alt="AI" src="https://img.shields.io/badge/AI-Google%20Gemini-8E75B2?logo=googlegemini&logoColor=white">
</p>

---

## ✨ Features

- **AI Coach (Gemini)** — Personalised workout and nutrition guidance in natural language, localized per user (TR/EN).
- **Photo-based Nutrition Analysis** — Snap a meal, get an AI estimate of macros/calories; meals are logged and tracked over time.
- **Strength & 1RM Analytics** — Per-lift progression with Epley-based 1RM estimates across 25+ tracked movements.
- **Rank System & Muscle Map** — Per-muscle rank driven by a "weakest-link" model, with muscle-group development trends over time.
- **Leaderboard & Head-to-Head** — Weight-class leaderboards with rep-count tiebreakers and a versus/battle mode.
- **Progress Photos & Body Stats** — Secure photo timeline and body-metric history to visualise change.
- **Coach Panel & Messaging** — In-app coach dashboard and user↔coach messaging.
- **Subscriptions & Rewards** — RevenueCat-backed IAP (VIP tier) and a token economy with daily-capped rewarded actions.
- **Auth** — Sign in with Apple and Google, JWT-secured sessions.
- **Push Notifications** — FCM (Firebase Cloud Messaging) via `expo-notifications`.
- **Bilingual** — Full Turkish/English localization with `i18next`; AI responses honour the user's language.

---

## 🏗️ Tech Stack

### Mobile (`/mobile`)
- **Expo SDK 54** / **React Native** with the **New Architecture** & **React Compiler** enabled
- **TypeScript** (strict, typed routes)
- **Expo Router** — file-based navigation
- **react-native-reanimated**, **gesture-handler**, **svg**, **chart-kit** for UI & data viz
- **react-native-purchases** (RevenueCat) — in-app purchases
- **expo-apple-authentication** / **expo-auth-session** — Apple & Google sign-in
- **i18next** + **react-i18next** + **expo-localization** — TR/EN
- **EAS Build & Submit** — CI builds and store submission

### Backend (`/backend`)
- **Node.js** + **Express 5** REST API (~90 endpoints)
- **MongoDB** + **Mongoose** data layer
- **Google Gemini via Vertex AI** (`@google/genai`) — AI coaching & nutrition
- **JWT** + **bcrypt** authentication; Apple/Google token verification
- **Cloudinary** + **sharp** — image storage & processing
- **Security**: `helmet`, `express-rate-limit`, `express-mongo-sanitize`, `hpp`
- **node-cron** — scheduled jobs
- Deployed on **Render**

---

## 📁 Project Structure

```
fitness-app/
├── mobile/                 # Expo / React Native app (iOS & Android)
│   ├── app/                # Expo Router screens (file-based routing)
│   ├── components/         # Reusable UI components
│   ├── lib/                # i18n, business logic (e.g. rank system), tests
│   ├── constants/ hooks/   # Theming & shared hooks
│   └── eas.json            # EAS build/submit profiles
│
└── backend/                # Node.js + Express API
    ├── index.js            # App entry & routes
    ├── models/             # Mongoose schemas (User, MealLog, Coach, …)
    ├── middleware/         # Auth & request middleware
    └── views/ public/      # Server-rendered pages & static assets
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 20
- A MongoDB instance (Atlas or local)
- Expo CLI / EAS CLI (`npm i -g eas-cli`)

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in the values below
npm start
```

Required environment variables (`backend/.env`):
```bash
MONGO_URI=              # MongoDB connection string
JWT_SECRET=             # secret for signing auth tokens
CLOUDINARY_URL=         # Cloudinary credentials
GOOGLE_APPLICATION_CREDENTIALS=  # path to Vertex AI service-account JSON
# Apple / Google sign-in client IDs, RevenueCat webhook secret, etc.
```

### Mobile
```bash
cd mobile
npm install
npx expo start          # run in Expo Go / dev client
```

Build & submit to stores with EAS:
```bash
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios --latest
eas submit --platform android --latest
```

---

## 🧪 Testing

Core business logic (e.g. the strength rank system) is covered by unit tests:
```bash
cd mobile
npm test
```

---

## 📱 Availability

GymBodyAI is live on both stores under the bundle id `com.gymbodyai.app`.

---

## 📝 License

This repository is shared as a portfolio / showcase project. All rights reserved unless otherwise noted.
