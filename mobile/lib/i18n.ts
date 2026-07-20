// i18n kurulumu — gettext tarzı: Türkçe metnin kendisi anahtar, en.json TR→EN sözlük.
// Dil önceliği: kullanıcının elle seçimi (SecureStore) > cihaz dili (tr→tr, diğer→en).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import en from './locales/en.json';

export const LANGUAGE_PREF_KEY = 'app_language'; // 'auto' | 'tr' | 'en'
export type LanguagePref = 'auto' | 'tr' | 'en';
export type AppLanguage = 'tr' | 'en';

export function deviceLanguage(): AppLanguage {
  return Localization.getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';
}

export function getLanguagePref(): LanguagePref {
  const stored = SecureStore.getItem(LANGUAGE_PREF_KEY);
  return stored === 'tr' || stored === 'en' ? stored : 'auto';
}

export function resolveLanguage(pref: LanguagePref = getLanguagePref()): AppLanguage {
  return pref === 'auto' ? deviceLanguage() : pref;
}

export async function setLanguagePref(pref: LanguagePref) {
  await SecureStore.setItemAsync(LANGUAGE_PREF_KEY, pref);
  await i18n.changeLanguage(resolveLanguage(pref));
}

// Backend'e gönderilecek aktif dil (AI cevapları bu dilde üretilir)
export function currentLang(): AppLanguage {
  return i18n.language === 'tr' ? 'tr' : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: {} }, // tr'de çeviri yok: anahtar (Türkçe metin) aynen döner
  },
  lng: resolveLanguage(),
  fallbackLng: false, // tr'de en'e düşmesin; eksik anahtar = Türkçe metnin kendisi
  keySeparator: false, // Türkçe cümlelerdeki nokta anahtar ayracı sanılmasın
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

export default i18n;
