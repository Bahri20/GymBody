import React, { useState, useEffect, useRef, useCallback } from 'react';
import ViewShot from 'react-native-view-shot';
import { View, Text, StyleSheet, Alert, ActivityIndicator, FlatList, TextInput, TouchableOpacity, ScrollView, Dimensions, Modal, Image, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import mobileAds, { BannerAd, BannerAdSize, TestIds, RewardedAd, RewardedAdEventType, AdEventType } from 'react-native-google-mobile-ads';

WebBrowser.maybeCompleteAuthSession(); // Google girişi sonrası tarayıcı sekmesini kapat
import axios from 'axios';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Grafik için maksimum N etiket göster, aradakileri boşalt
function sparseLabels(items: any[], maxLabels = 5, fn: (item: any) => string): string[] {
  if (items.length <= maxLabels) return items.map(fn);
  return items.map((item, i) => {
    const step = Math.ceil(items.length / maxLabels);
    return i % step === 0 || i === items.length - 1 ? fn(item) : '';
  });
}

// 🎨 TASARIM SİSTEMİ — Koyu + Neon Yeşil
const C = {
  bg: '#0B0D12',
  bgAlt: '#10131A',
  surface: '#12151C',  // sayfa rengine yakın, gömme kart hissi
  surface2: '#171C26', // nested/etkileşimli elemanlar için hafif daha açık
  border: 'rgba(255,255,255,0.07)', // sert kutu yerine yumuşak kenar ışığı
  borderStrong: '#262C3A', // gerektiğinde belirgin kenar (eski değer)
  text: '#FFFFFF',
  textSec: '#A3ABBA',
  textMuted: '#6B7384',
  lime: '#C6FF3D',
  limeDark: '#9FE000',
  blue: '#5B8DEF',
  orange: '#FF9F1C',
  red: '#FF5A52',
  green: '#34D399',
};

// Canlı backend (Render). Yerel geliştirme için: 'http://192.168.1.100:3000'
const API_URL = 'https://gymbody.onrender.com';

// ⚠️ Google Cloud Console > Credentials'tan al, buraya yapıştır
const GOOGLE_CLIENT_IDS = {
  webClientId: '715798761426-marncqp4mh3jkrd2346h74o1cfikgf92.apps.googleusercontent.com',
  iosClientId: '715798761426-vpka1e4obfhgut4uo1d9ibf1h8qe51qk.apps.googleusercontent.com',
  androidClientId: '715798761426-sg8b01jtn26djnkno3acce1dcmbbl6kj.apps.googleusercontent.com',
};

export default function App() {
  const insets = useSafeAreaInsets();

  // Logo nabız animasyonu (giriş ekranı)
  const logoScale = useSharedValue(1);
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));
  useEffect(() => {
    logoScale.value = withRepeat(withTiming(1.08, { duration: 900 }), -1, true);
  }, []);

  // Giriş ve Kullanıcı State'leri
  const [user, setUser] = useState<any>(null);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralBonus, setReferralBonus] = useState<{ coachName: string; discountRate: number } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [privacyModal, setPrivacyModal] = useState<'privacy' | 'terms' | null>(null);
  const [editName, setEditName] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [bodyStats, setBodyStats] = useState<any[]>([]);
  const [statWeight, setStatWeight] = useState('');
  const [statWaist, setStatWaist] = useState('');
  const [statShoulder, setStatShoulder] = useState('');
  const [statNeck, setStatNeck] = useState('');
  const [statsPage, setStatsPage] = useState(0);
  const [macroPage, setMacroPage] = useState(0); // "Bugün ne kadar tamamlandı" kaydırma sayfası
  const [userStats, setUserStats] = useState<any>({ tokens: 0, streak: 0, isVip: false, vipExpiresAt: null });
  const [gymTrainingDays, setGymTrainingDays] = useState(4);
  const [gymAllergy, setGymAllergy] = useState('');
  const [gymFeedback, setGymFeedback] = useState('');
  const [gymGoal, setGymGoal] = useState<'definition' | 'bulk' | 'maintain'>('definition');
  const [weeklyPlan, setWeeklyPlan] = useState<any>(null);
  const [gymLoading, setGymLoading] = useState(false);
  const [gymPlanTab, setGymPlanTab] = useState<'workout' | 'nutrition'>('workout');
  const [gifModalUrl, setGifModalUrl] = useState<string | null>(null);
  const [dayFeedbackVisible, setDayFeedbackVisible] = useState(false);
  const [dayFeedbackText, setDayFeedbackText] = useState('');
  const [showRestPrompt, setShowRestPrompt] = useState(false);
  const [isRestDay, setIsRestDay] = useState(false);

  // YENİ ÖZELLİKLER
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string; text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const shareCardRef = useRef<ViewShot>(null);

  const [weeklySummaryVisible, setWeeklySummaryVisible] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);

  const [newBadgeVisible, setNewBadgeVisible] = useState(false);
  const [newBadges, setNewBadges] = useState<{id: string; label: string}[]>([]);

  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true); // açılışta otomatik giriş kontrolü
  const [googleLoading, setGoogleLoading] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false); // ilk giriş karşılama modalı
  const [adLoading, setAdLoading] = useState(false); // ödüllü reklam yükleniyor
  const onboardingDoneRef = useRef(false); // completeOnboarding çift çağrısını engelle

  // Google ile giriş isteği
  const [gRequest, gResponse, gPromptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_IDS.webClientId,
    iosClientId: GOOGLE_CLIENT_IDS.iosClientId,
    androidClientId: GOOGLE_CLIENT_IDS.androidClientId,
  });


  // Uygulama içi Genel State'ler
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gallery, setGallery] = useState<any[]>([]);
  const [note, setNote] = useState('');

  // SEKME YÖNETİMİ: 'gallery' | 'meal' | 'profile'
  const [currentTab, setCurrentTab] = useState('gallery');

  // Yemek Kalori Ölçer State'leri
  const [mealImage, setMealImage] = useState<string | null>(null);
  const [mealResult, setMealResult] = useState<any>(null);
  const [mealLogs, setMealLogs] = useState<any[]>([]); // Günlük öğün kayıtları

  // Hedefler (Goals) state'leri
  const [goalAge, setGoalAge] = useState('');
  const [goalGender, setGoalGender] = useState<'male' | 'female'>('male');
  const [goalTarget, setGoalTarget] = useState('');

 // Açılışta kayıtlı token varsa otomatik giriş yap
 useEffect(() => {
   (async () => {
     try {
       const savedToken = await SecureStore.getItemAsync('userToken');
       if (savedToken) {
         const res = await axios.get(`${API_URL}/me`, {
           headers: { Authorization: `Bearer ${savedToken}` },
         });
         setToken(savedToken);
         setUser(res.data.user);
         registerPushToken(savedToken);
       }
     } catch (err) {
       // token geçersiz/süresi dolmuş → temizle, giriş ekranına düş
       await SecureStore.deleteItemAsync('userToken');
     } finally {
       setRestoring(false);
     }
   })();
 }, []);

 // AdMob'u bir kez başlat
 useEffect(() => { mobileAds().initialize(); }, []);

 // Ödüllü reklam göster → izlenince backend'den token al (VIP hariç, sunucu günlük sınırı uygular)
 const showRewardedAd = () => {
   if (userStats.isVip || adLoading) return;
   setAdLoading(true);
   const rewarded = RewardedAd.createForAdRequest(TestIds.REWARDED);
   let earned = false;
   const subs: Array<() => void> = [];
   const cleanup = () => subs.forEach((u) => u());
   subs.push(rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => { setAdLoading(false); rewarded.show(); }));
   subs.push(rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }));
   subs.push(rewarded.addAdEventListener(AdEventType.CLOSED, async () => {
     cleanup();
     if (earned) {
       try {
         const res = await axios.post(`${API_URL}/reward-ad-token`, {}, { headers: { Authorization: `Bearer ${token}` } });
         Alert.alert('Tebrikler! 🎉', `${res.data.reward} token kazandın! Bugün ${res.data.remaining} hakkın kaldı.`);
         fetchUserStats();
       } catch (e: any) {
         Alert.alert('Hata', e.response?.data?.error || 'Token verilemedi.');
       }
     }
   }));
   subs.push(rewarded.addAdEventListener(AdEventType.ERROR, () => {
     setAdLoading(false); cleanup();
     Alert.alert('Reklam Hatası', 'Reklam şu an yüklenemedi, biraz sonra tekrar dene.');
   }));
   rewarded.load();
 };

 // Google giriş sonucu döndüğünde backend'e gönder
 useEffect(() => {
   if (gResponse?.type === 'success') {
     const idToken = gResponse.authentication?.idToken || (gResponse.params as any)?.id_token;
     const accessToken = gResponse.authentication?.accessToken;
     loginWithGoogle(idToken, accessToken);
   } else if (gResponse?.type === 'error') {
     setGoogleLoading(false);
     Alert.alert('Google Hatası', 'Google ile giriş tamamlanamadı.');
   } else if (gResponse?.type === 'dismiss' || gResponse?.type === 'cancel') {
     setGoogleLoading(false);
   }
 }, [gResponse]);

 const loginWithGoogle = async (idToken?: string, accessToken?: string) => {
   if (!idToken && !accessToken) {
     setGoogleLoading(false);
     Alert.alert('Google Hatası', 'Google kimlik bilgisi alınamadı.');
     return;
   }
   try {
     setGoogleLoading(true);
     const res = await axios.post(`${API_URL}/google-login`, { idToken, accessToken });
     setUser(res.data.user);
     setToken(res.data.token);
     await SecureStore.setItemAsync('userToken', res.data.token);
     registerPushToken(res.data.token);
     // Not: referans kodu, karşılama modalı kapandıktan sonra sorulur (her yeni kullanıcı için)
   } catch (err: any) {
     const msg = err.response?.data?.error || 'Google girişi başarısız.';
     Alert.alert('Google Hatası', msg);
   } finally {
     setGoogleLoading(false);
   }
 };

 useEffect(() => {
  if (user) {
    fetchPhotos();
    fetchBodyStats();
    fetchMealLogs();
    fetchUserStats();
    setGoalAge(user.age ? String(user.age) : '');
    setGoalGender(user.gender === 'female' ? 'female' : 'male');
    setGoalTarget(user.targetWeight ? String(user.targetWeight) : '');
    // İlk giriş → karşılama modalını göster
    if (!user.onboarded) { onboardingDoneRef.current = false; setWelcomeVisible(true); }
  }
}, [user]);

// Karşılama modalı kapanınca: onboarding'i işaretle + hocaya bağlı değilse referans sor
const completeOnboarding = async () => {
  if (onboardingDoneRef.current) return; // çift çağrıyı engelle (buton + onRequestClose)
  onboardingDoneRef.current = true;
  setWelcomeVisible(false);
  try {
    await axios.post(`${API_URL}/complete-onboarding`, {}, { headers: { Authorization: `Bearer ${token}` } });
  } catch {}
  setUser((prev: any) => prev ? { ...prev, onboarded: true } : prev);
  if (!user?.referredBy) setTimeout(() => askReferralCode(), 400);
};

// GymBody sekmesine her geçişte mola durumunu sıfırla (yeni gün = antrenman zamanı)
useEffect(() => {
  if (currentTab === 'gymBody' && isRestDay) {
    const lastCompleted = weeklyPlan?.lastDayCompletedAt;
    if (lastCompleted) {
      const completedDate = new Date(lastCompleted).toDateString();
      const today = new Date().toDateString();
      if (completedDate !== today) setIsRestDay(false);
    }
  }
}, [currentTab]);

// VIP durumu netleşince planı çek
useEffect(() => {
  if (userStats.isVip) {
    fetchWeeklyPlan(true); // silent=true, hata alert'i gösterme
  }
}, [userStats.isVip]);
  const fetchMealLogs = async () => {
    try {
      const response = await axios.get(`${API_URL}/get-meal-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMealLogs(response.data);
    } catch (error) { console.log("Öğün kayıtları çekilemedi"); }
  };
  const fetchUserStats = async () => {
  try {
    const response = await axios.get(`${API_URL}/get-user-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUserStats(response.data);
  } catch (error) { console.log("Kullanıcı istatistikleri çekilemedi"); }
};
  const fetchBodyStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/get-body-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBodyStats(response.data);
    } catch (error) { console.log("İstatistikler çekilemedi"); }
  };
  const fetchPhotos = async () => {
    try {
      const response = await axios.get(`${API_URL}/get-progress-photos/${user._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGallery(response.data);
    } catch (error) { console.log("Fotoğraflar çekilemedi"); }
  };
const fetchWeeklyPlan = async (silent = false) => {
  if (!userStats.isVip) return;
  if (!silent) setGymLoading(true);
  try {
    const res = await axios.post(`${API_URL}/get-weekly-plan`, {
      trainingDaysPerWeek: gymTrainingDays,
      allergy: gymAllergy,
      feedback: gymFeedback,
      goal: gymGoal
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklyPlan(res.data);
    if (res.data.trainingDaysPerWeek) setGymTrainingDays(res.data.trainingDaysPerWeek);
    setGymFeedback('');
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Plan oluşturulamadı.';
    if (!silent) Alert.alert('Hata', msg);
  } finally {
    if (!silent) setGymLoading(false);
  }
};
// "Programa Başla" → intro'yu kapat, 1. günü aç
const startProgram = async () => {
  try {
    setGymLoading(true);
    const res = await axios.post(`${API_URL}/start-program`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklyPlan(res.data);
  } catch (error: any) {
    Alert.alert('Hata', error.response?.data?.error || 'Program başlatılamadı.');
  } finally {
    setGymLoading(false);
  }
};
const saveBodyStat = async () => {
  if (!statWeight && !statWaist && !statShoulder && !statNeck) {
    return Alert.alert("Uyarı", "En az bir değer girmelisin kanka!");
  }

  setLoading(true);
  try {
    await axios.post(`${API_URL}/add-body-stat`, {
      weight: statWeight ? parseFloat(statWeight) : null,
      waist: statWaist ? parseFloat(statWaist) : null,
      shoulder: statShoulder ? parseFloat(statShoulder) : null,
      neck: statNeck ? parseFloat(statNeck) : null
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    Alert.alert("Başarılı ✅", "Ölçülerin kaydedildi kanka!");
    setStatWeight(''); setStatWaist(''); setStatShoulder(''); setStatNeck('');
    fetchBodyStats();

    // Eğer kilo girildiyse, user state'ini de güncelle (profil senkron olsun)
    if (statWeight) {
      setUser({ ...user, weight: parseFloat(statWeight) });
    }
  } catch (error) {
    console.log("🔥 BODYSTAT HATASI:", error);
    Alert.alert('Hata', 'Ölçüler kaydedilemedi.');
  } finally {
    setLoading(false);
  }
};
// Push token kayıt
const registerPushToken = async (authToken: string) => {
  try {
    if (!Device.isDevice) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
    await axios.post(`${API_URL}/save-push-token`, { pushToken }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
  } catch (err) { /* sessizce geç */ }
};

// Haftalık özet
const fetchWeeklySummary = async () => {
  try {
    const res = await axios.get(`${API_URL}/weekly-summary`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklySummary(res.data);
    setWeeklySummaryVisible(true);
  } catch { Alert.alert('Hata', 'Özet alınamadı.'); }
};

// AI Chat
const sendChatMessage = async () => {
  if (!chatInput.trim() || chatLoading) return;
  const userMsg = { role: 'user', text: chatInput.trim() };
  const newHistory = [...chatMessages, userMsg];
  setChatMessages(newHistory);
  setChatInput('');
  setChatLoading(true);
  setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  try {
    const res = await axios.post(`${API_URL}/ai-chat`, {
      message: userMsg.text,
      history: chatMessages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }))
    }, { headers: { Authorization: `Bearer ${token}` } });
    setChatMessages(prev => [...prev, { role: 'model', text: res.data.reply }]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  } catch (err: any) {
    const msg = err.response?.data?.error || 'AI yanıt veremedi.';
    setChatMessages(prev => [...prev, { role: 'model', text: `⚠️ ${msg}` }]);
  } finally {
    setChatLoading(false);
  }
};

// Before/After paylaş — ViewShot ile görsel oluştur
const [sharePhotoUrl, setSharePhotoUrl] = useState<string | null>(null);
const [sharePhotoFat, setSharePhotoFat] = useState<number | null>(null);
const [shareCardReady, setShareCardReady] = useState(false);
const [shareImgLoaded, setShareImgLoaded] = useState(false);
const [shareLoading, setShareLoading] = useState(false);

const shareProgress = async () => {
  const withFat = gallery.filter(p => p.bodyFatPercentage != null);
  if (withFat.length < 1) {
    Alert.alert('Fotoğraf Yok', 'Paylaşmak için en az bir vücut analizi fotoğrafı gerekiyor.');
    return;
  }
  const latest = withFat[0];
  setShareImgLoaded(false);
  setSharePhotoUrl(latest.url);
  setSharePhotoFat(latest.bodyFatPercentage);
  setShareCardReady(true);
};

const captureAndShare = async () => {
  try {
    setShareLoading(true);
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { Alert.alert('Hata', 'Paylaşım bu cihazda desteklenmiyor.'); return; }
    const uri = await (shareCardRef.current as any)?.capture();
    if (!uri) { Alert.alert('Hata', 'Görsel oluşturulamadı.'); return; }
    // tmp'den kalıcı dizine kopyala — WhatsApp/Instagram tmp'yi okuyamıyor
    const dest = FileSystem.documentDirectory + 'gymbodyai_share.jpg';
    const srcUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    // önceki paylaşımdan kalan dosya varsa sil (copyAsync üzerine yazamıyor)
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    // ÖNEMLİ: modal'ı kapatma — paylaşım menüsü modal'ın üstünde açılmalı,
    // aksi halde iOS kapanma animasyonuyla çakışıp menüyü sessizce iptal ediyor
    await Sharing.shareAsync(dest, {
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
      dialogTitle: 'GymBodyAI Gelişimim',
    });
  } catch (err: any) {
    Alert.alert('Hata', err?.message || 'Paylaşım başarısız.');
  } finally {
    setShareLoading(false);
    setShareCardReady(false); // paylaşım menüsü kapandıktan sonra modal'ı kapat
  }
};

const handleCompleteDay = async (feedback?: string) => {
  try {
    const res = await axios.post(`${API_URL}/complete-day`, { dailyFeedback: feedback || '' }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setWeeklyPlan(res.data.weeklyPlan);
    setDayFeedbackText('');
    setDayFeedbackVisible(false);
    if (!res.data.isLastDay) setShowRestPrompt(true);
    // Yeni rozetler
    if (res.data.newBadges?.length) {
      setNewBadges(res.data.newBadges);
      setNewBadgeVisible(true);
    }
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Gün tamamlanamadı.';
    setDayFeedbackVisible(false);
    Alert.alert(error.response?.status === 429 ? 'Bilgi' : 'Hata', msg);
  }
};
  // Auth İşlemleri (Loglu)
  const handleAuth = async () => {
    if (!email || !password) {
      return Alert.alert("Hata", "E-posta ve şifre alanlarını doldur kanka");
    }

    setLoading(true);
    try {
      if (isRegister) {
        const payload: any = {
          email: email.trim(),
          password: password,
          name: name.trim() || "İsimsiz Sporcu",
          height: parseFloat(height) || 0,
          weight: parseFloat(weight) || 0
        };
        if (referralCode.trim()) payload.referralCode = referralCode.trim();
        const res = await axios.post(`${API_URL}/register`, payload);
        const bonus = res.data.referralBonus;
        const msg = bonus
          ? `Kayıt başarılı! ${bonus.coachName} referansıyla %${bonus.discountRate} VIP indirimi kazandın! 🎉`
          : "Kayıt başarılı kanka, şimdi giriş yapabilirsin!";
        Alert.alert("Başarılı 🏋️‍♂️", msg);
        setIsRegister(false);
        setReferralCode('');
        setReferralBonus(null);
      } else {
        const res = await axios.post(`${API_URL}/login`, {
          email: email.trim(),
          password: password
        });
        setUser(res.data.user);
        setToken(res.data.token);
        await SecureStore.setItemAsync('userToken', res.data.token); // otomatik giriş için sakla
        registerPushToken(res.data.token);
      }
    } catch (err: any) {
      console.log("🔥 AUTH HATASI:", err);
      const errorMsg = err.response?.data?.error || err.message || "Sunucuya bağlanılamadı kanka";
      Alert.alert("Bağlantı Hatası", errorMsg);
    } finally {
      setLoading(false);
    }
  };
// ☁️ GELİŞİM FOTOĞRAFINI CLOUDINARY'YE GÖNDEREN FONKSİYON
  const uploadImage = async () => {
    if (!image) return;
    setLoading(true);

    let formData = new FormData();
    let filename = image.split('/').pop();
    formData.append('photo', { uri: image, name: filename, type: 'image/jpeg' } as any);
    formData.append('note', note);
    formData.append('userId', user._id);

    try {
      console.log("📤 Gelişim fotoğrafı backend'e basılıyor...");
      await axios.post(`${API_URL}/upload-progress`, formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
    Authorization: `Bearer ${token}`
  },
});
      Alert.alert('Başarılı! 🎉', 'Gelişim fotoğrafın buluta jilet gibi yüklendi kanka.');
      setImage(null);
      setNote('');
      fetchPhotos(); // Akışı yenilesin kanka
    } catch (error) {
      console.log("🔥 FOTO YÜKLEME HATASI:", error);
      Alert.alert('Hata', 'Fotoğraf yüklenirken pürüz çıktı.');
    } finally {
      setLoading(false);
    }
  };
  const updateProfile = async () => {
  setLoading(true);
  try {
    const res = await axios.put(`${API_URL}/update-profile`, {
      name: editName.trim() || user.name,
      height: parseFloat(editHeight) || user.height,
      weight: parseFloat(editWeight) || user.weight
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUser(res.data.user);

    // Opsiyonel vücut ölçüleri girildiyse onları da kaydet (BodyStat)
    if (statWaist || statShoulder || statNeck) {
      await axios.post(`${API_URL}/add-body-stat`, {
        weight: parseFloat(editWeight) || null,
        waist: statWaist ? parseFloat(statWaist) : null,
        shoulder: statShoulder ? parseFloat(statShoulder) : null,
        neck: statNeck ? parseFloat(statNeck) : null
      }, { headers: { Authorization: `Bearer ${token}` } });
      setStatWaist(''); setStatShoulder(''); setStatNeck('');
      fetchBodyStats();
    }

    setIsEditingProfile(false);
    Alert.alert("Başarılı ✅", "Profilin güncellendi kanka!");
  } catch (error) {
    console.log("🔥 PROFİL GÜNCELLEME HATASI:", error);
    Alert.alert('Hata', 'Profil güncellenemedi.');
  } finally {
    setLoading(false);
  }
};
  const deletePhoto = async (photoId: string) => {
  Alert.alert(
    "Fotoğrafı Sil",
    "Bu fotoğrafı kalıcı olarak silmek istediğine emin misin?",
    [
      { text: "İptal", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await axios.delete(`${API_URL}/delete-progress/${photoId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            fetchPhotos(); // listeyi yenile
          } catch (error) {
            console.log("🔥 SİLME HATASI:", error);
            Alert.alert('Hata', 'Fotoğraf silinemedi.');
          }
        }
      }
    ]
  );
};
const redeemVip = async () => {
  setLoading(true);
  try {
    const res = await axios.post(`${API_URL}/redeem-vip`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    Alert.alert("Tebrikler! 🎉", res.data.message);
    fetchUserStats();
  } catch (error: any) {
    const msg = error.response?.data?.error || 'VIP aktifleştirilemedi.';
    Alert.alert('Hata', msg);
  } finally {
    setLoading(false);
  }
};

const redeemPromo = () => {
  Alert.prompt(
    '🎁 Promosyon Kodu',
    'Sana verilen kodu gir:',
    async (code) => {
      if (!code?.trim()) return;
      try {
        const res = await axios.post(`${API_URL}/redeem-promo`, { code: code.trim() }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Alert.alert('Tebrikler! 🎉', res.data.message);
        fetchUserStats();
      } catch (error: any) {
        const msg = error.response?.data?.error || 'Geçersiz kod.';
        Alert.alert('Hata', msg);
      }
    },
    'plain-text'
  );
};

// Referans (hoca) kodunu kayıttan sonra uygula — Google ile gelenler veya sonradan girmek isteyenler
const applyReferral = async (code: string, authToken?: string) => {
  if (!code?.trim()) return;
  try {
    const res = await axios.post(`${API_URL}/apply-referral`, { code: code.trim() }, {
      headers: { Authorization: `Bearer ${authToken || token}` }
    });
    // Yerel kullanıcıyı güncelle ki "referans kodu gir" butonu gizlensin
    setUser((prev: any) => prev ? { ...prev, referredBy: res.data.coachName, discountRate: res.data.discountRate } : prev);
    Alert.alert('Tebrikler! 🎉', res.data.message);
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Geçersiz referans kodu.';
    Alert.alert('Hata', msg);
  }
};

const askReferralCode = (authToken?: string) => {
  Alert.prompt(
    '🎯 Referans Kodu',
    'Bir hocanın referans kodu varsa gir — VIP alırken indirim kazanırsın (opsiyonel):',
    [
      { text: 'Geç', style: 'cancel' },
      { text: 'Uygula', onPress: (code?: string) => applyReferral(code || '', authToken) },
    ],
    'plain-text'
  );
};
  // --- KAMERA VEYA GALERİ SEÇİM ---
const askAndPickImage = async (type: 'progress' | 'meal') => {
  if (type === 'meal' && dailyMealRights <= 0) {
    return Alert.alert("Hakkın Bitti kanka!", "Bugünlük yemek tarama hakkın bitti. Geriye dönük sınırsız kayıt ve analiz için yakında VIP üye olabilirsin! 😉");
  }

  if (type === 'progress') {
    Alert.alert(
      "📸 Vücut Analizi İpucu",
      "Daha doğru bir yağ oranı tahmini için: aydınlık bir ortamda, vücudunu net gösteren kıyafetlerle (atlet/şort gibi) ve düz bir açıdan çekim yapmaya çalış.",
      [
        { text: "Anladım, Devam Et", onPress: () => showImageSourceOptions(type) }
      ]
    );
  } else {
    showImageSourceOptions(type);
  }
};

const showImageSourceOptions = (type: 'progress' | 'meal') => {
  Alert.alert(
    "Fotoğraf Kaynağı 📸",
    "Fotoğrafı nasıl ekleyelim kanka?",
    [
      {
        text: "📸 Kamera ile Çek",
        onPress: async () => {
          let permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) return Alert.alert("Hata", "Kamera izni vermedin kanka!");

          let result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: type === 'progress' ? [1, 1] : [4, 3],
            quality: 0.6,
          });
          if (!result.canceled) {
            if (type === 'progress') {
              setImage(result.assets[0].uri);
            } else {
              setMealImage(result.assets[0].uri);
              setMealResult(null); // eski sonucu temizle

            }
          }
        }
      },
      {
        text: "🖼️ Galeriden Seç",
        onPress: async () => {
          let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: type === 'progress' ? [1, 1] : [4, 3],
            quality: 0.6,
          });
          if (!result.canceled) {
            if (type === 'progress') {
              setImage(result.assets[0].uri);
            } else {
              setMealImage(result.assets[0].uri);
              setMealResult(null); // eski sonucu temizle

            }
          }
        }
      },
      { text: "İptal", style: "cancel" }
    ]
  );
};
  // --- YEMEK ANALİZİNİ BACKEND'E GÖNDERME ---
const sendMealToAI = async (uri: string) => {
  setLoading(true);
  setMealResult(null);

  let formData = new FormData();
  let filename = uri.split('/').pop();
  formData.append('photo', { uri: uri, name: filename, type: 'image/jpeg' } as any);
  formData.append('note', mealNote);

  try {
    const response = await axios.post(`${API_URL}/analyze-meal`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`
      },
    });
    setMealResult(response.data);
    setMealNote('');
    fetchMealLogs(); // Günlüğü ve kalan hakkı tazele
  } catch (error: any) {
    console.log("🔥 AI GÖNDERİM HATASI:", error);
    const msg = error.response?.data?.error || 'Yemek analiz edilemedi. Sunucu logunu veya API keyini kontrol et kanka.';
    Alert.alert('Hata', msg);
  } finally {
    setLoading(false);
  }
};
  // --- AÇILIŞ: otomatik giriş kontrol edilirken splash göster ---
  if (restoring) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <Text style={{ color: C.lime, fontSize: 28, fontWeight: '900', letterSpacing: 0.5 }}>GymBodyAI</Text>
        <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 20 }} />
      </View>
    );
  }
  // --- GİRİŞ EKRANI (AÇILIŞ) ---
  if (!user) {
    return (
      <View style={styles.authRoot}>
        <StatusBar style="light" />
        <LinearGradient
          colors={['#1A2A0E', '#0B0D12', '#0B0D12']}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          contentContainerStyle={styles.authScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo Rozeti */}
          <AnimatedLinearGradient
            colors={[C.lime, C.limeDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.logoBadge, logoStyle]}
          >
            <Ionicons name="barbell" size={40} color="#0B0D12" />
          </AnimatedLinearGradient>

          <Text style={styles.authBrand}>GymBody<Text style={{ color: C.lime }}>AI</Text></Text>
          <Text style={styles.authTitle}>{isRegister ? 'Aramıza Katıl' : 'Tekrar Hoş Geldin'}</Text>
          <Text style={styles.authSubtitle}>
            {isRegister ? 'Hedeflerine giden yolculuk burada başlıyor.' : 'Formuna kaldığın yerden devam et.'}
          </Text>

          <View style={styles.authCard}>
            {isRegister && (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={20} color={C.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.inputWithIcon}
                  placeholder="İsim Soyisim"
                  placeholderTextColor={C.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={C.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.inputWithIcon}
                placeholder="E-posta"
                placeholderTextColor={C.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={C.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.inputWithIcon}
                placeholder="Şifre"
                placeholderTextColor={C.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {isRegister && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={[styles.inputWrap, { flex: 0.48 }]}>
                    <Ionicons name="resize-outline" size={18} color={C.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="Boy (cm)"
                      placeholderTextColor={C.textMuted}
                      value={height}
                      onChangeText={setHeight}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.inputWrap, { flex: 0.48 }]}>
                    <Ionicons name="scale-outline" size={18} color={C.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputWithIcon}
                      placeholder="Kilo (kg)"
                      placeholderTextColor={C.textMuted}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={[styles.inputWrap, referralBonus ? { borderColor: '#4ade80' } : {}]}>
                  <Ionicons name="pricetag-outline" size={18} color={referralBonus ? '#4ade80' : C.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.inputWithIcon}
                    placeholder="Referans kodu (opsiyonel)"
                    placeholderTextColor={C.textMuted}
                    value={referralCode}
                    autoCapitalize="none"
                    onChangeText={async (val) => {
                      setReferralCode(val);
                      setReferralBonus(null);
                      if (val.trim().length >= 3) {
                        try {
                          const r = await axios.get(`${API_URL}/check-referral/${val.trim()}`);
                          if (r.data.valid) setReferralBonus(r.data);
                        } catch {}
                      }
                    }}
                  />
                </View>
                {referralBonus && (
                  <Text style={{ color: '#4ade80', fontSize: 12, marginTop: -8, marginBottom: 8, marginLeft: 4 }}>
                    ✓ {referralBonus.coachName} referansı · %{referralBonus.discountRate} VIP indirimi
                  </Text>
                )}
              </>
            )}

            {loading ? (
              <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 16 }} />
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={handleAuth} style={{ marginTop: 6 }}>
                <LinearGradient
                  colors={[C.lime, C.limeDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>{isRegister ? 'KAYDOL' : 'GİRİŞ YAP'}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#0B0D12" />
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* AYIRAÇ */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#262C3A' }} />
              <Text style={{ color: C.textMuted, marginHorizontal: 12, fontSize: 12 }}>veya</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#262C3A' }} />
            </View>

            {/* GOOGLE İLE GİRİŞ */}
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!gRequest || googleLoading}
              onPress={() => { setGoogleLoading(true); gPromptAsync(); }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 14,
                opacity: (!gRequest || googleLoading) ? 0.6 : 1,
              }}
            >
              {googleLoading ? (
                <ActivityIndicator color="#1D2230" />
              ) : (
                <Ionicons name="logo-google" size={20} color="#EA4335" />
              )}
              <Text style={{ color: '#1D2230', fontWeight: '700', fontSize: 15 }}>Google ile devam et</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={{ marginTop: 22 }}>
            <Text style={styles.switchText}>
              {isRegister ? 'Zaten hesabım var · ' : 'Hesabın yok mu? '}
              <Text style={{ color: C.lime, fontWeight: '700' }}>
                {isRegister ? 'Giriş Yap' : 'Yeni Hesap Aç'}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
  // --- TÜRETİLMİŞ VERİLER (kullanıcı giriş yaptıysa hesaplanır) ---
  // Bugünün öğünleri & kalan tarama hakkı (günde 2)
  const todayKey = new Date().toDateString();
  const todayLogs = mealLogs.filter((m) => new Date(m.date).toDateString() === todayKey);
  const dailyMealRights = userStats.isVip ? 999 : Math.max(0, 2 - todayLogs.length);
  const todayCalories = todayLogs.reduce((s, m) => s + (m.calories || 0), 0);

  // Bu haftanın yenen ürünleri (Pazartesi başlangıçlı) — liste sadece o hafta tutulur
  const weekStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // Pazartesi = 0
    d.setDate(d.getDate() - day);
    return d;
  })();
  const thisWeekMealLogs = mealLogs.filter((m) => new Date(m.date) >= weekStart);

  // Günlük toplamlar (haftalık grafik için gün gün topla)
  const dailyTotalsMap: Record<string, any> = {};
  mealLogs.forEach((m) => {
    const d = new Date(m.date); d.setHours(0, 0, 0, 0);
    const k = String(d.getTime());
    if (!dailyTotalsMap[k]) dailyTotalsMap[k] = { date: d, calories: 0 };
    dailyTotalsMap[k].calories += m.calories || 0;
  });
  const dailyTotals = Object.values(dailyTotalsMap).sort((a: any, b: any) => a.date - b.date);
  const last7 = dailyTotals.slice(-7);

  // Bazal metabolizma (Mifflin-St Jeor) + günlük hedef
  const gAge = parseFloat(goalAge);
  const gTarget = parseFloat(goalTarget);
  const uW = user.weight, uH = user.height;
  let bmr: number | null = null, tdee: number | null = null;
  if (uW && uH && gAge) {
    bmr = Math.round(10 * uW + 6.25 * uH - 5 * gAge + (goalGender === 'male' ? 5 : -161));
    tdee = Math.round(bmr * 1.375); // hafif aktif yaşam katsayısı
  }
  let dailyTarget: number | null = null, goalMode = '', goalWeeks: number | null = null, goalDelta = 0;
  if (tdee && gTarget && uW) {
    if (gTarget < uW) { goalDelta = -500; goalMode = 'Kilo Verme'; }
    else if (gTarget > uW) { goalDelta = 300; goalMode = 'Kilo Alma'; }
    else { goalDelta = 0; goalMode = 'Koruma'; }
    dailyTarget = tdee + goalDelta;
    if (goalDelta !== 0) goalWeeks = Math.ceil((Math.abs(uW - gTarget) * 7700) / (Math.abs(goalDelta) * 7));
  }

  // Kiloya göre günlük makro hedefleri (protein öncelikli) + bugün tüketilen
  const proteinTarget = uW ? Math.round(uW * 1.5) : null;          // örn. 100 kg → 150 g
  const fatTarget = uW ? Math.round(uW * 0.8) : null;              // örn. 100 kg → 80 g
  const carbsTarget = (dailyTarget && proteinTarget && fatTarget)
    ? Math.max(0, Math.round((dailyTarget - proteinTarget * 4 - fatTarget * 9) / 4))
    : null;
  const todayProtein = Math.round(todayLogs.reduce((s, m) => s + (m.protein || 0), 0));
  const todayCarbs = Math.round(todayLogs.reduce((s, m) => s + (m.carbs || 0), 0));
  const todayFat = Math.round(todayLogs.reduce((s, m) => s + (m.fat || 0), 0));

  const saveGoals = async () => {
    setLoading(true);
    try {
      const res = await axios.put(`${API_URL}/update-profile`, {
        age: goalAge ? parseFloat(goalAge) : undefined,
        gender: goalGender,
        targetWeight: goalTarget ? parseFloat(goalTarget) : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data.user);
      Alert.alert("Başarılı ✅", "Hedeflerin kaydedildi kanka!");
    } catch (error) {
      console.log("🔥 HEDEF KAYIT HATASI:", error);
      Alert.alert('Hata', 'Hedefler kaydedilemedi.');
    } finally {
      setLoading(false);
    }
  };

  // --- ANA UYGULAMA EKRANI ---
  const TABS = [
  { key: 'gallery', label: 'Galeri', icon: 'images-outline' as const, gym: false },
  { key: 'meal', label: 'Yemek', icon: 'restaurant-outline' as const, gym: false },
  { key: 'gymBody', label: 'GymBody', icon: 'barbell-outline' as const, gym: true },
  { key: 'stats', label: 'İstatistik', icon: 'stats-chart-outline' as const, gym: false },
  { key: 'profile', label: 'Profil', icon: 'person-outline' as const, gym: false },
];

  return (
  <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <StatusBar style="light" />

      {/* ÜST BAŞLIK */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topGreeting}>Hoş geldin 👋</Text>
          <Text style={styles.topName}>{user.name}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setCurrentTab('profile')}>
          <LinearGradient colors={[C.lime, C.limeDark]} style={styles.avatar}>
            <Text style={styles.avatarText}>{(user.name?.[0] || 'S').toUpperCase()}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ÜST TAB BAR SEÇİMİ */}
     <View style={styles.tabContainer}>
  {TABS.map((t) => {
    const active = currentTab === t.key;
    if (t.gym) {
      return (
        <TouchableOpacity
          key={t.key}
          activeOpacity={0.8}
          style={styles.gymTab}
          onPress={() => setCurrentTab(t.key)}
        >
          <LinearGradient
            colors={active ? [C.lime, C.limeDark] : ['#2A1F60', '#1A1235']}
            style={styles.gymTabInner}
          >
            <Ionicons name={t.icon} size={22} color={active ? '#0B0D12' : '#B79CFF'} />
            <Text style={[styles.gymTabText, active && { color: '#0B0D12' }]}>{t.label}</Text>
          </LinearGradient>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={t.key}
        activeOpacity={0.8}
        style={[styles.tab, active && styles.activeTab]}
        onPress={() => setCurrentTab(t.key)}
      >
        <Ionicons name={t.icon} size={18} color={active ? '#0B0D12' : C.textSec} />
        <Text style={[styles.tabText, active && styles.activeTabText]}>{t.label}</Text>
      </TouchableOpacity>
    );
  })}
</View>

      <Animated.View style={{ flex: 1 }} key={currentTab} entering={FadeIn.duration(300)}>
      {currentTab === 'gymBody' && (
  <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

    {!userStats.isVip ? (
      /* KİLİTLİ EKRAN */
      <View style={{ flex: 1, alignItems: 'center', paddingTop: 40 }}>
        <LinearGradient colors={['#2A1F60', '#1A1235']} style={styles.gymLockCard}>
          <Ionicons name="barbell" size={48} color="#B79CFF" style={{ marginBottom: 16 }} />
          <Text style={styles.gymLockTitle}>GymBody VIP</Text>
          <Text style={styles.gymLockSubtitle}>
            İsteklerine göre eğitilen kişisel AI antrenörün seni bekliyor. Her hafta sana özel antrenman ve beslenme programı, sınırsız kalori, yağ oranı analizi ve kıyaslaması, alternatif öğün seçenekleri.
          </Text>

          <View style={styles.gymLockStats}>
            <View style={styles.gymLockStatItem}>
              <Ionicons name="diamond" size={16} color={C.lime} />
              <Text style={styles.gymLockStatText}>{userStats.tokens} / 200 Token</Text>
            </View>
            <View style={styles.gymLockStatItem}>
              <Ionicons name="flame" size={16} color={C.orange} />
              <Text style={styles.gymLockStatText}>{userStats.streak} Günlük Seri</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, (userStats.tokens / 200) * 100)}%`, backgroundColor: '#B79CFF' }]} />
          </View>
          <Text style={[styles.statsSubtitle, { color: C.textSec, textAlign: 'center' }]}>
            {userStats.tokens >= 200 ? 'Profil sekmesinden VIP aç!' : `VIP için ${200 - userStats.tokens} token daha kazan`}
          </Text>
        </LinearGradient>
      </View>
    ) : (
      /* VIP EKRANI */
      <View>

        {/* MOLA PROMPT */}
        {showRestPrompt && weeklyPlan && !weeklyPlan.completedFully && (() => {
          const nextDay = weeklyPlan.workoutPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);
          return (
            <View style={styles.restPromptCard}>
              <Text style={styles.restPromptTitle}>Tebrikler, günü bitirdin! 💪</Text>
              <Text style={styles.restPromptSub}>Bugün mola vermek ister misin?</Text>
              <View style={styles.restPromptBtns}>
                <TouchableOpacity
                  style={styles.restPromptYes}
                  activeOpacity={0.85}
                  onPress={() => { setIsRestDay(true); setShowRestPrompt(false); }}
                >
                  <Ionicons name="bed-outline" size={18} color={C.textSec} />
                  <Text style={styles.restPromptYesText}>Evet, mola ver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.restPromptNo}
                  activeOpacity={0.85}
                  onPress={() => { setIsRestDay(false); setShowRestPrompt(false); }}
                >
                  <Ionicons name="barbell-outline" size={18} color="#1A1235" />
                  <Text style={styles.restPromptNoText}>Hayır{nextDay ? ` · ${nextDay.focus}` : ''}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* MOLA GÜNÜ EKRANI */}
        {isRestDay && !showRestPrompt && weeklyPlan && (() => {
          const nextDay = weeklyPlan.workoutPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);
          const REST_QUOTES = [
            "Kaslar antrenman sırasında yıkılır, dinlenme sırasında inşa edilir.",
            "Bugün duruyorsun, yarın daha güçlü başlıyorsun.",
            "Dinlenme de programın parçası. Atlama.",
            "Büyüme, salondan çıktıktan sonra olur.",
            "Bugünkü mola, yarınki performansın temeli.",
          ];
          const quote = REST_QUOTES[Math.floor(Math.random() * REST_QUOTES.length)];
          return (
            <LinearGradient colors={['#1A1235', '#0B0D12']} style={styles.restDayCard}>
              {/* Ay ikonu */}
              <View style={styles.restMoonCircle}>
                <Ionicons name="moon" size={36} color="#B79CFF" />
              </View>

              <Text style={styles.restDayTitle}>Mola Günü 🌙</Text>
              <Text style={styles.restDayQuote}>"{quote}"</Text>

              {/* Yarınki antrenman önizleme */}
              {nextDay && (
                <View style={styles.restNextCard}>
                  <Text style={styles.restNextLabel}>YARIN</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Ionicons name="barbell-outline" size={18} color="#B79CFF" />
                    <Text style={styles.restNextFocus}>{nextDay.focus}</Text>
                  </View>
                  <Text style={styles.restNextCount}>{nextDay.exercises?.length || 0} egzersiz seni bekliyor</Text>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIsRestDay(false)}
                style={styles.restBackBtn}
              >
                <Ionicons name="barbell-outline" size={16} color="#B79CFF" />
                <Text style={styles.restBackBtnText}>Antrenmana dön</Text>
              </TouchableOpacity>
            </LinearGradient>
          );
        })()}

        {/* FORM */}
        {!weeklyPlan && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>💪 Programını Oluştur</Text>

            {/* BESLENME HEDEFİ */}
            <Text style={[styles.statsSubtitle, { marginBottom: 10 }]}>Beslenme hedefin nedir?</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              {([
                { key: 'definition', label: '🔥 Definasyon', desc: 'Yağ yak' },
                { key: 'bulk',       label: '💪 Bulk',       desc: 'Kas kazan' },
                { key: 'maintain',   label: '⚖️ Koruma',     desc: 'Formu koru' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setGymGoal(opt.key)}
                  style={{
                    flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
                    backgroundColor: gymGoal === opt.key ? '#B79CFF22' : C.surface2,
                    borderWidth: 1.5,
                    borderColor: gymGoal === opt.key ? '#B79CFF' : C.border,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: gymGoal === opt.key ? '#B79CFF' : C.text }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ALERJİ */}
            <Text style={[styles.statsSubtitle, { marginBottom: 8 }]}>Alerji veya tüketmediğin yiyecekler var mı? (opsiyonel)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="örn. laktoz, fıstık, gluten, kırmızı et..."
              placeholderTextColor={C.textMuted}
              value={gymAllergy}
              onChangeText={setGymAllergy}
              multiline
            />

            {gymLoading ? (
              <View style={{ alignItems: 'center', marginTop: 20 }}>
                <ActivityIndicator size="large" color="#B79CFF" />
                <Text style={[styles.loaderText, { marginTop: 12 }]}>AI programını hazırlıyor, bu biraz sürebilir...</Text>
              </View>
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={() => fetchWeeklyPlan()} style={{ marginTop: 8 }}>
                <LinearGradient colors={['#B79CFF', '#8A6FE0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                  <Ionicons name="sparkles" size={18} color="#1A1235" />
                  <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>PROGRAMIMI OLUŞTUR</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* PROGRAM HAZIR — İNTRO / "Programa Başla" */}
        {weeklyPlan && !weeklyPlan.completedFully && !weeklyPlan.started && weeklyPlan.currentDay === 1 && !weeklyPlan.lastDayCompletedAt && (
          <View style={[styles.statsCard, { alignItems: 'center', borderColor: '#B79CFF', borderWidth: 1 }]}>
            <Text style={{ fontSize: 40, marginBottom: 4 }}>🎯</Text>
            <Text style={[styles.statsTitle, { textAlign: 'center' }]}>Programın Hazır!</Text>
            <Text style={[styles.statsSubtitle, { textAlign: 'center', marginTop: 6, marginBottom: 18 }]}>
              Sana özel olarak hazırlandı. İçinde antrenman ve beslenme planın gün gün seni bekliyor 💪
            </Text>

            {gymLoading ? (
              <ActivityIndicator size="large" color="#B79CFF" />
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={startProgram} style={{ width: '100%' }}>
                <LinearGradient colors={['#B79CFF', '#8A6FE0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                  <Ionicons name="play" size={18} color="#1A1235" />
                  <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>PROGRAMA BAŞLA</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* PLAN GÖSTERİMİ */}
        {weeklyPlan && !weeklyPlan.completedFully && !isRestDay && !showRestPrompt && !(!weeklyPlan.started && weeklyPlan.currentDay === 1 && !weeklyPlan.lastDayCompletedAt) && (() => {
  const currentWorkoutDay = weeklyPlan.workoutPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);
  const currentNutritionDay = weeklyPlan.nutritionPlan?.find((d: any) => d.dayNumber === weeklyPlan.currentDay);

  return (
    <View>
      <View style={[styles.tabContainer, { marginBottom: 12 }]}>
        <TouchableOpacity style={[styles.tab, gymPlanTab === 'workout' && styles.activeTab]} onPress={() => setGymPlanTab('workout')}>
          <Ionicons name="barbell-outline" size={16} color={gymPlanTab === 'workout' ? '#0B0D12' : C.textSec} />
          <Text style={[styles.tabText, gymPlanTab === 'workout' && styles.activeTabText]}>Antrenman</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, gymPlanTab === 'nutrition' && styles.activeTab]} onPress={() => setGymPlanTab('nutrition')}>
          <Ionicons name="restaurant-outline" size={16} color={gymPlanTab === 'nutrition' ? '#0B0D12' : C.textSec} />
          <Text style={[styles.tabText, gymPlanTab === 'nutrition' && styles.activeTabText]}>Beslenme</Text>
        </TouchableOpacity>
      </View>

      {gymPlanTab === 'workout' && currentWorkoutDay && (
        <View style={styles.gymDayCard}>
          <View style={styles.gymDayHeader}>
            <Text style={styles.gymDayTitle}>{currentWorkoutDay.dayNumber}. Gün</Text>
            <View style={styles.gymFocusBadge}><Text style={styles.gymFocusText}>{currentWorkoutDay.focus}</Text></View>
          </View>
          {currentWorkoutDay.exercises?.map((ex: any, j: number) => (
            <View key={j} style={styles.gymExerciseRow}>
              {/* En soldaki standart tik */}
              <Ionicons name="checkmark-circle-outline" size={18} color="#B79CFF" />
              
              {ex.gifUrl && (
                <TouchableOpacity activeOpacity={0.8} onPress={() => setGifModalUrl(ex.gifUrl)} style={{ marginLeft: 8 }}>
                  <Ionicons name="play-circle" size={24} color="#C4F000" />
                </TouchableOpacity>
              )}

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.gymExerciseName}>{ex.name}</Text>
                <Text style={styles.gymExerciseSets}>{ex.sets}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {gymPlanTab === 'nutrition' && weeklyPlan.nutritionPlan?.map((day: any, i: number) => (
        <View key={i} style={styles.gymDayCard}>
          <View style={styles.gymDayHeader}>
            <Text style={styles.gymDayTitle}>{day.day || `${day.dayNumber}. Gün`}</Text>
            <View style={styles.gymFocusBadge}>
              <Text style={styles.gymFocusText}>{day.totalCalories} kcal</Text>
            </View>
          </View>
          {day.meals?.map((meal: any, j: number) => (
            <View key={j} style={styles.gymMealRow}>
              <Text style={styles.gymMealName}>{meal.name}</Text>
              <Text style={styles.gymMealItems}>{meal.items}</Text>
              <Text style={styles.gymMealCal}>{meal.calories} kcal</Text>
            </View>
          ))}
        </View>
      ))}

      <TouchableOpacity activeOpacity={0.85} onPress={() => setDayFeedbackVisible(true)} style={{ marginTop: 8 }}>
        <LinearGradient colors={['#B79CFF', '#8A6FE0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
          <Ionicons name="checkmark-done-outline" size={18} color="#1A1235" />
          <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>{weeklyPlan.currentDay}. GÜNÜ TAMAMLADIM</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
})()}

{/* PROGRAM TAMAMLANDI */}
{weeklyPlan?.completedFully && (
  <View style={styles.statsCard}>
    <Text style={styles.statsTitle}>🎉 Programını Tamamladın!</Text>
    <Text style={styles.statsSubtitle}>Yeni programın buna göre ayarlansın diye yorum bırakabilirsin.</Text>
    <TextInput
      style={styles.noteInput}
      placeholder="örn. bacak günü az geldi, omuza ağırlık ver..."
      placeholderTextColor={C.textMuted}
      value={gymFeedback}
      onChangeText={setGymFeedback}
      multiline
    />
    <TouchableOpacity activeOpacity={0.85} onPress={() => setWeeklyPlan(null)} style={{ marginTop: 8 }}>
      <LinearGradient colors={['#B79CFF', '#8A6FE0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
        <Ionicons name="refresh-outline" size={18} color="#1A1235" />
        <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>YENİ PROGRAM AYARLA</Text>
      </LinearGradient>
    </TouchableOpacity>
  </View>
)}

      </View>
    )}
  </ScrollView>
      )} 
      {currentTab === 'gallery' && (
        <FlatList
          data={gallery}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListHeaderComponent={
            <View>
              {/* 📸 FOTOĞRAF EKLEME YERİ */}
              <View style={styles.uploadCard}>
              {!image ? (
                <TouchableOpacity activeOpacity={0.85} onPress={() => askAndPickImage('progress')}>
                  <View style={styles.dashedUpload}>
                    <View style={styles.uploadIconCircle}>
                      <Ionicons name="camera" size={24} color={C.lime} />
                    </View>
                    <Text style={styles.uploadTitle}>Yeni Gelişim Fotoğrafı</Text>
                    <Text style={styles.uploadHint}>Çek veya galeriden seç · AI yağ oranını tahmin etsin</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View>
                  <Image source={{ uri: image }} style={styles.preview} />
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Antrenman notunu yaz..."
                    placeholderTextColor={C.textMuted}
                    value={note}
                    onChangeText={setNote}
                    multiline
                  />
                  {loading ? <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 12 }} /> : (
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 12}}>
                      <TouchableOpacity style={[styles.miniBtn, styles.miniBtnPrimary]} onPress={uploadImage}>
                        <Ionicons name="checkmark" size={18} color="#0B0D12" />
                        <Text style={styles.miniBtnPrimaryText}>KAYDET</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.miniBtn, styles.miniBtnGhost]} onPress={() => setImage(null)}>
                        <Ionicons name="close" size={18} color={C.red} />
                        <Text style={styles.miniBtnGhostText}>İPTAL</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
            {/* GELİŞİMİ PAYLAŞ BUTONU */}
            {gallery.some(p => p.bodyFatPercentage != null) && (
              <TouchableOpacity activeOpacity={0.85} onPress={shareProgress}
                style={{ marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border }}>
                <Ionicons name="share-social-outline" size={20} color={C.lime} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>Gelişimimi Paylaş</Text>
              </TouchableOpacity>
            )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={44} color={C.textMuted} />
              <Text style={styles.emptyTitle}>Henüz fotoğraf yok</Text>
              <Text style={styles.emptyText}>İlk gelişim fotoğrafını ekle, değişimini takip etmeye başla.</Text>
            </View>
          }
      renderItem={({ item }) => (
  <View style={styles.galleryCard}>
    <Image source={{ uri: item.url }} style={styles.galleryImg} />
    <View style={styles.galleryInfo}>
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
        <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString('tr-TR')}</Text>
      </View>
      {!!item.note && <Text style={styles.noteText}>{item.note}</Text>}

      {item.bodyFatPercentage != null && (
        <View style={styles.analysisBox}>
          <View style={styles.analysisHeader}>
            <Ionicons name="analytics" size={16} color={C.lime} />
            <Text style={styles.analysisFat}>Tahmini Yağ Oranı: %{item.bodyFatPercentage}</Text>
          </View>
          <Text style={styles.analysisText}>{item.aiAnalysis}</Text>
        </View>
      )}
      {item.bodyFatPercentage == null && item.aiAnalysis && (
        <View style={styles.analysisBox}>
          <Text style={styles.analysisText}>⚠️ {item.aiAnalysis}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.deleteBtn} onPress={() => deletePhoto(item._id)}>
        <Ionicons name="trash-outline" size={15} color={C.red} />
        <Text style={styles.deleteBtnText}>Sil</Text>
      </TouchableOpacity>
    </View>
  </View>
      )}
        ListFooterComponent={
          <View style={{ paddingHorizontal: 0, paddingBottom: 16 }}>
            {/* FOTOĞRAF KARŞILAŞTIRMA */}
            {!userStats.isVip ? (
              <View style={[styles.statsCard, { marginHorizontal: 16, marginTop: 8, alignItems: 'center', gap: 10 }]}>
                <Ionicons name="lock-closed" size={26} color="#B79CFF" />
                <Text style={[styles.statsTitle, { color: '#B79CFF', textAlign: 'center' }]}>Gelişim Karşılaştırması</Text>
                <Text style={[styles.statsEmptyText, { textAlign: 'center' }]}>İlk ve son fotoğraflarını kıyasla, yağ oranı farkını gör. VIP üyelere özel.</Text>
              </View>
            ) : (() => {
              const withFat = gallery.filter(p => p.bodyFatPercentage != null);
              if (withFat.length < 2) {
                return (
                  <View style={[styles.statsCard, { marginHorizontal: 16, marginTop: 8, alignItems: 'center', gap: 8 }]}>
                    <Ionicons name="images-outline" size={26} color={C.textMuted} />
                    <Text style={[styles.statsEmptyText, { textAlign: 'center' }]}>Kıyaslama için yağ oranı bilinen en az 2 fotoğraf gerekiyor.</Text>
                  </View>
                );
              }
              // Dizi sırasına değil TARİHE göre belirle (eski vs yeni) — yağ oranı yön bug'ı fix
              const byDate = [...withFat].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              const first = byDate[0];                    // en eski
              const last = byDate[byDate.length - 1];      // en yeni
              const diff = parseFloat((first.bodyFatPercentage - last.bodyFatPercentage).toFixed(1));
              const improved = diff > 0;                   // eski > yeni → yağ azalmış
              const sameish = diff === 0;
              const praise = improved
                ? diff >= 5 ? '🏆 İnanılmaz bir dönüşüm! Bu fark ciddi bir çalışmanın ürünü.' :
                  diff >= 3 ? '💪 Harika ilerleme! Vücudun değişiyor, devam et.' :
                  diff >= 1 ? '🔥 Doğru yoldasın, kayıplar birikmeye devam ediyor.' :
                  '✨ Başlangıç iyi, tutarlı kal!'
                : sameish ? '🎯 Yağ oranın koruyor — şimdi düşürme zamanı!'
                : '📈 Bir miktar artış var ama bu sürecin parçası, bırakma!';

              return (
                <View style={[styles.statsCard, { marginHorizontal: 16, marginTop: 8, gap: 14 }]}>
                  <Text style={styles.statsTitle}>📸 Gelişim Karşılaştırması</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                      <Image source={{ uri: first.url }} style={{ width: '100%', aspectRatio: 3/4, borderRadius: 12 }} />
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>{new Date(first.date).toLocaleDateString('tr-TR')}</Text>
                      <Text style={{ color: C.orange, fontWeight: '700', fontSize: 15 }}>%{first.bodyFatPercentage}</Text>
                    </View>
                    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Ionicons name="arrow-forward" size={20} color={improved ? C.lime : C.red} />
                    </View>
                    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                      <Image source={{ uri: last.url }} style={{ width: '100%', aspectRatio: 3/4, borderRadius: 12 }} />
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>{new Date(last.date).toLocaleDateString('tr-TR')}</Text>
                      <Text style={{ color: improved ? C.lime : C.red, fontWeight: '700', fontSize: 15 }}>%{last.bodyFatPercentage}</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: improved ? '#0f2a1a' : '#2a0f0f', borderRadius: 12, padding: 14, gap: 4 }}>
                    <Text style={{ color: improved ? C.lime : C.red, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>
                      {improved ? `−${diff}% yağ oranı` : sameish ? 'Değişim yok' : `+${Math.abs(diff)}% artış`}
                    </Text>
                    <Text style={{ color: C.textSec, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>{praise}</Text>
                  </View>
                </View>
              );
            })()}
          </View>
        }
        />
      )}

      {/* ===== YEMEK SEKMESİ ===== */}
      {currentTab === 'meal' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
          {/* YAPAY ZEKA KALORİ ÖLÇER */}
          <LinearGradient
            colors={['#241A05', C.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mealHeaderCard}
          >
            <View style={styles.mealIconCircle}>
              <Ionicons name="restaurant" size={22} color={C.orange} />
            </View>
            <Text style={styles.mealTitle}>Yapay Zeka Şefin</Text>
            <Text style={styles.mealSubtitle}>Tabağının net bir fotoğrafını yükle, içindeki makroları anında söylesin.</Text>

            <View style={styles.rightsPill}>
              <Ionicons name="ticket-outline" size={14} color={C.orange} />
              <Text style={styles.rightsText}>Bugünkü ücretsiz hakkın: <Text style={{ fontWeight: '800', color: C.orange }}>{dailyMealRights}</Text></Text>
            </View>

            <TouchableOpacity activeOpacity={0.85} style={styles.scanBtn} onPress={() => askAndPickImage('meal')} disabled={loading}>
              <Ionicons name="scan" size={20} color="#0B0D12" />
              <Text style={styles.scanBtnText}>TABAĞI TARA</Text>
            </TouchableOpacity>
          </LinearGradient>

          {mealImage && !mealResult && !loading && (
            <View style={{ marginTop: 16 }}>
              <Image source={{ uri: mealImage }} style={styles.mealPreviewImg} />
              <TextInput
                style={styles.noteInput}
                placeholder="Ek bilgi (opsiyonel): örn. 'içine protein tozu ekledim'"
                placeholderTextColor={C.textMuted}
                value={mealNote}
                onChangeText={setMealNote}
                multiline
              />
              <TouchableOpacity activeOpacity={0.85} onPress={() => sendMealToAI(mealImage)} style={{ marginTop: 12 }}>
                <LinearGradient colors={[C.lime, C.limeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                  <Ionicons name="sparkles" size={18} color="#0B0D12" />
                  <Text style={styles.primaryBtnText}>ANALİZ ET</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {loading && mealImage && (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color={C.orange} />
              <Text style={styles.loaderText}>Yapay zeka tabağı inceliyor, kalori hesabı yapılıyor...</Text>
            </View>
          )}

          {mealResult && !loading && (
            <View style={styles.resultCard}>
              {mealImage && <Image source={{ uri: mealImage }} style={styles.mealPreviewImg} />}
              <Text style={styles.resultMealName}>{mealResult.mealName}</Text>
              <Text style={styles.resultDesc}>{mealResult.description}</Text>

              <LinearGradient colors={['#2A2206', C.surface2]} style={styles.calorieBadge}>
                <Text style={styles.calorieNum}>{mealResult.calories}</Text>
                <Text style={styles.calorieLabel}>KCAL</Text>
              </LinearGradient>

              <View style={styles.macroContainer}>
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: C.red }]}>{mealResult.protein}g</Text>
                  <Text style={styles.macroLabel2}>Protein</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: C.orange }]}>{mealResult.carbs}g</Text>
                  <Text style={styles.macroLabel2}>Karbonh.</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroBox}>
                  <Text style={[styles.macroVal, { color: C.green }]}>{mealResult.fat}g</Text>
                  <Text style={styles.macroLabel2}>Yağ</Text>
                </View>
              </View>
            </View>
          )}

          {/* BUGÜN NE KADAR TAMAMLANDI — kaydırmalı (Protein, Karbonhidrat, Yağ, Kalori) */}
          <View style={[styles.statsCard, { marginTop: 16 }]}>
            <Text style={styles.statsTitle}>🔥 Bugün Ne Kadar Tamamlandı</Text>

            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setMacroPage(Math.round(e.nativeEvent.contentOffset.x / (Dimensions.get('window').width - 68)))}
            >
              {[
                { label: 'Protein', unit: 'g', color: C.red, cur: todayProtein, target: proteinTarget },
                { label: 'Karbonhidrat', unit: 'g', color: C.orange, cur: todayCarbs, target: carbsTarget },
                { label: 'Yağ', unit: 'g', color: C.green, cur: todayFat, target: fatTarget },
                { label: 'Kalori', unit: 'kcal', color: C.lime, cur: todayCalories, target: dailyTarget },
              ].map((mac) => {
                const pct = mac.target ? Math.min(100, Math.round((mac.cur / mac.target) * 100)) : 0;
                return (
                  <View key={mac.label} style={{ width: Dimensions.get('window').width - 68, alignItems: 'center', paddingVertical: 6 }}>
                    <Text style={{ color: mac.color, fontSize: 13, fontWeight: '800' }}>{mac.label}</Text>
                    <Text style={{ color: C.text, fontSize: 30, fontWeight: '900', marginVertical: 2 }}>
                      {mac.cur}<Text style={{ fontSize: 14, color: C.textMuted, fontWeight: '600' }}> / {mac.target ?? '--'} {mac.unit}</Text>
                    </Text>
                    <View style={{ width: '100%', height: 8, backgroundColor: C.surface2, borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: mac.color, borderRadius: 4 }} />
                    </View>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>%{pct} tamamlandı</Text>
                  </View>
                );
              })}
            </ScrollView>

            {/* Sayfa noktaları */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.pageDot, macroPage === i && styles.pageDotActive]} />
              ))}
            </View>

            <Text style={[styles.statsSubtitle, { marginTop: 10, marginBottom: 0, textAlign: 'center' }]}>
              {proteinTarget != null ? `Hedefler kilona göre · Bugün ${todayLogs.length} öğün tarandı` : 'Makro hedefleri için kilonu gir.'}
            </Text>
          </View>

          {/* YENEN ÜRÜNLER & DETAYLAR — bu hafta */}
          <View style={[styles.statsCard, { marginTop: 16 }]}>
            <Text style={styles.statsTitle}>🍽️ Bu Hafta Yenenler</Text>
            <Text style={[styles.statsSubtitle, { marginBottom: 10 }]}>Liste her hafta başında (Pazartesi) yenilenir.</Text>
            {thisWeekMealLogs.length === 0 ? (
              <Text style={styles.statsEmptyText}>Bu hafta henüz taranmış öğün yok. Tabağını tara! 🍽️</Text>
            ) : (
              thisWeekMealLogs.map((m, i) => (
                <View key={m._id || i} style={styles.mealLogRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealLogName}>{m.mealName || 'Öğün'}</Text>
                    <Text style={styles.mealLogDate}>{new Date(m.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
                    <View style={styles.mealLogMacros}>
                      <Text style={[styles.mealLogMacro, { color: C.red }]}>P {m.protein || 0}g</Text>
                      <Text style={[styles.mealLogMacro, { color: C.orange }]}>K {m.carbs || 0}g</Text>
                      <Text style={[styles.mealLogMacro, { color: C.green }]}>Y {m.fat || 0}g</Text>
                    </View>
                  </View>
                  <View style={styles.mealLogCalBox}>
                    <Text style={styles.mealLogCal}>{m.calories || 0}</Text>
                    <Text style={styles.mealLogCalUnit}>kcal</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {currentTab === 'stats' && (
         <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

          {/* KAYDIRMALI GRAFİK SAYFALARI */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / Dimensions.get('window').width);
              setStatsPage(page);
            }}
            style={{ marginHorizontal: -16 }}
          >
            {/* SAYFA 1: HAFTALIK KALORİ */}
            <View style={{ width: Dimensions.get('window').width, paddingHorizontal: 16 }}>
              {last7.length >= 2 ? (
                <View style={styles.statsCard}>
                  <Text style={styles.statsTitle}>📅 Haftalık Kalori (son 7 gün)</Text>
                  <LineChart
                    data={{
                      labels: last7.map((d: any) => new Date(d.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })),
                      datasets: [{ data: last7.map((d: any) => d.calories) }]
                    }}
                    width={Dimensions.get('window').width - 64}
                    height={153}
                    chartConfig={{ ...chartConfig, color: (o = 1) => `rgba(91, 141, 239, ${o})` }}
                    bezier
                    style={{ borderRadius: 12, marginLeft: -8 }}
                  />
                </View>
              ) : (
                <View style={styles.statsCard}>
                  <Ionicons name="restaurant-outline" size={30} color={C.textMuted} style={{ alignSelf: 'center', marginBottom: 8 }} />
                  <Text style={styles.statsEmptyText}>Haftalık kalori grafiği için en az 2 gün öğün takibi gerekiyor. Tabağını tara! 🍽️</Text>
                </View>
              )}
            </View>

            {/* SAYFA 2: YAĞ ORANI GEÇMİŞİ */}
            <View style={{ width: Dimensions.get('window').width, paddingHorizontal: 16 }}>
              {!userStats.isVip ? (
                <View style={[styles.statsCard, { alignItems: 'center', gap: 10 }]}>
                  <Ionicons name="lock-closed" size={28} color="#B79CFF" />
                  <Text style={[styles.statsTitle, { color: '#B79CFF', textAlign: 'center' }]}>Yağ Oranı Grafiği</Text>
                  <Text style={[styles.statsEmptyText, { textAlign: 'center' }]}>Bu özellik VIP üyelere özel. Gelişimini grafikle takip etmek için VIP'e geç.</Text>
                </View>
              ) : bodyStats.filter(s => s.bodyFatPercentage != null).length >= 2 ? (
                <View style={styles.statsCard}>
                  <Text style={styles.statsTitle}>🔥 Yağ Oranı Geçmişi</Text>
                  <LineChart
                    data={{
                      labels: sparseLabels(bodyStats.filter(s => s.bodyFatPercentage != null), 5, s => new Date(s.date).toLocaleDateString('tr-TR', {day: '2-digit', month: '2-digit'})),
                      datasets: [{ data: bodyStats.filter(s => s.bodyFatPercentage != null).map(s => s.bodyFatPercentage) }]
                    }}
                    width={Dimensions.get('window').width - 64}
                    height={153}
                    chartConfig={{...chartConfig, color: (o = 1) => `rgba(255, 159, 28, ${o})`}}
                    bezier
                    style={{ borderRadius: 12, marginLeft: -8 }}
                  />
                </View>
              ) : (
                <View style={styles.statsCard}>
                  <Ionicons name="analytics-outline" size={30} color={C.textMuted} style={{ alignSelf: 'center', marginBottom: 8 }} />
                  <Text style={styles.statsEmptyText}>Yağ oranı grafiği için en az 2 AI analizi gerekiyor. Vücut analizi yap! 🔥</Text>
                </View>
              )}
            </View>

            {/* SAYFA 3: KİLO GEÇMİŞİ */}
            <View style={{ width: Dimensions.get('window').width, paddingHorizontal: 16 }}>
              {bodyStats.length >= 2 ? (
                <View style={styles.statsCard}>
                  <Text style={styles.statsTitle}>📈 Kilo Geçmişi</Text>
                  <LineChart
                    data={{
                      labels: sparseLabels(bodyStats.filter(s => s.weight), 5, s => new Date(s.date).toLocaleDateString('tr-TR', {day: '2-digit', month: '2-digit'})),
                      datasets: [{ data: bodyStats.filter(s => s.weight).map(s => s.weight) }]
                    }}
                    width={Dimensions.get('window').width - 64}
                    height={153}
                    chartConfig={chartConfig}
                    bezier
                    style={{ borderRadius: 12, marginLeft: -8 }}
                  />
                </View>
              ) : (
                <View style={styles.statsCard}>
                  <Ionicons name="trending-up-outline" size={30} color={C.textMuted} style={{ alignSelf: 'center', marginBottom: 8 }} />
                  <Text style={styles.statsEmptyText}>Grafik için en az 2 ölçü kaydı gerekiyor. Aşağıdan ölçülerini ekle! 📊</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {/* SAYFA GÖSTERGESİ */}
          <View style={styles.pageIndicator}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.pageDot, statsPage === i && styles.pageDotActive]} />
            ))}
          </View>

          {/* HAFTALIK ÖZET — grafiklerin hemen altında */}
          <TouchableOpacity activeOpacity={0.85} onPress={fetchWeeklySummary}
            style={{ marginBottom: 12, backgroundColor: C.surface2, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.border }}>
            <Ionicons name="bar-chart-outline" size={22} color={C.blue} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>Haftalık Özet</Text>
              <Text style={{ color: C.textMuted, fontSize: 12 }}>Bu haftanı gözden geçir</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
          </TouchableOpacity>

          {/* BAZAL METABOLİZMA & HEDEFLER */}
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>🎯 Bazal Metabolizma & Hedef</Text>
            <Text style={styles.statsSubtitle}>Yaş, cinsiyet ve hedef kilonla günlük kalori hedefini hesapla.</Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Yaş" placeholderTextColor={C.textMuted} value={goalAge} onChangeText={setGoalAge} keyboardType="numeric" />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Hedef Kilo (kg)" placeholderTextColor={C.textMuted} value={goalTarget} onChangeText={setGoalTarget} keyboardType="numeric" />
            </View>

            <View style={styles.genderRow}>
              <TouchableOpacity style={[styles.genderBtn, goalGender === 'male' && styles.genderBtnActive]} onPress={() => setGoalGender('male')}>
                <Ionicons name="male" size={16} color={goalGender === 'male' ? '#0B0D12' : C.textSec} />
                <Text style={[styles.genderText, goalGender === 'male' && styles.genderTextActive]}>Erkek</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.genderBtn, goalGender === 'female' && styles.genderBtnActive]} onPress={() => setGoalGender('female')}>
                <Ionicons name="female" size={16} color={goalGender === 'female' ? '#0B0D12' : C.textSec} />
                <Text style={[styles.genderText, goalGender === 'female' && styles.genderTextActive]}>Kadın</Text>
              </TouchableOpacity>
            </View>

            {bmr != null ? (
              <View style={styles.bmrResult}>
                <View style={styles.bmrRow}>
                  <Text style={styles.bmrLabel}>Bazal Metabolizma (BMR)</Text>
                  <Text style={styles.bmrVal}>{bmr} kcal</Text>
                </View>
                <View style={styles.bmrRow}>
                  <Text style={styles.bmrLabel}>Günlük İhtiyaç (TDEE)</Text>
                  <Text style={styles.bmrVal}>{tdee} kcal</Text>
                </View>
                {dailyTarget != null && (
                  <>
                    <View style={[styles.bmrRow, styles.bmrHighlight]}>
                      <Text style={[styles.bmrLabel, { color: C.lime, fontWeight: '700' }]}>Günlük Hedef · {goalMode}</Text>
                      <Text style={[styles.bmrVal, { color: C.lime }]}>{dailyTarget} kcal</Text>
                    </View>
                    {goalDelta !== 0 && (
                      <Text style={styles.bmrNote}>
                        {goalDelta < 0 ? `Günde ${Math.abs(goalDelta)} kcal açık ver` : `Günde ${goalDelta} kcal fazla al`} · Hedefe ~{goalWeeks} haftada ulaşırsın
                      </Text>
                    )}
                  </>
                )}
              </View>
            ) : (
              <Text style={styles.statsEmptyText}>Hesaplama için yaş bilgisini girmelisin.</Text>
            )}

            {loading ? <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 10 }} /> : (
              <TouchableOpacity activeOpacity={0.85} onPress={saveGoals}>
                <LinearGradient colors={[C.lime, C.limeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>HEDEFLERİ KAYDET</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* MANUEL ÖLÇÜ GİRİŞİ FORMU */}
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>✏️ Yeni Ölçü Ekle</Text>
            <Text style={styles.statsSubtitle}>Ölçülerini güncel tut — hepsi opsiyonel.</Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Kilo (kg)" placeholderTextColor={C.textMuted} value={statWeight} onChangeText={setStatWeight} keyboardType="numeric" />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Bel (cm)" placeholderTextColor={C.textMuted} value={statWaist} onChangeText={setStatWaist} keyboardType="numeric" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Omuz (cm)" placeholderTextColor={C.textMuted} value={statShoulder} onChangeText={setStatShoulder} keyboardType="numeric" />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Boyun (cm)" placeholderTextColor={C.textMuted} value={statNeck} onChangeText={setStatNeck} keyboardType="numeric" />
            </View>

            {loading ? <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 10 }} /> : (
              <TouchableOpacity activeOpacity={0.85} onPress={saveBodyStat}>
                <LinearGradient colors={[C.lime, C.limeDark]} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>KAYDET</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
    </ScrollView>
      )}
      {currentTab === 'profile' && (
  <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
    <View style={styles.profileHero}>
      <LinearGradient colors={[C.lime, C.limeDark]} style={styles.profileAvatar}>
        <Text style={styles.profileAvatarText}>{(user.name?.[0] || 'S').toUpperCase()}</Text>
      </LinearGradient>
      <Text style={styles.profileName}>{user.name}</Text>
      {!!user.email && <Text style={styles.profileEmail}>{user.email}</Text>}
    </View>
{/* TOKEN & STREAK KARTI */}
<View style={styles.tokenCardRow}>
  <View style={styles.tokenCard}>
    <Ionicons name="flame" size={18} color={C.orange} />
    <Text style={styles.tokenValue}>{userStats.streak}</Text>
    <Text style={styles.tokenLabel}>Günlük Seri</Text>
  </View>
  <View style={styles.tokenCard}>
    <Ionicons name="diamond" size={18} color={C.lime} />
    <Text style={styles.tokenValue}>{userStats.tokens}</Text>
    <Text style={styles.tokenLabel}>Token</Text>
  </View>
</View>

{/* VIP KARTI */}
{userStats.isVip ? (
  <LinearGradient colors={['#1A1530', C.surface]} style={[styles.statsCard, { borderColor: '#3A2E66', alignItems: 'center' }]}>
    <Ionicons name="star" size={24} color="#B79CFF" />
    <Text style={[styles.statsTitle, { color: '#fff', marginTop: 8 }]}>VIP Üyesin! 👑</Text>
    {userStats.vipExpiresAt && (
      <Text style={[styles.statsSubtitle, { color: C.textSec, textAlign: 'center', marginBottom: 0 }]}>
        Bitiş: {new Date(userStats.vipExpiresAt).toLocaleDateString('tr-TR')}
      </Text>
    )}
  </LinearGradient>
) : (
  <LinearGradient colors={['#1A1530', C.surface]} style={[styles.statsCard, { borderColor: '#3A2E66' }]}>
    <View style={styles.vipHeader}>
      <Ionicons name="lock-closed" size={16} color="#B79CFF" />
      <Text style={[styles.statsTitle, { color: '#fff', marginBottom: 0 }]}>VIP'e Geç</Text>
    </View>
    <Text style={[styles.statsSubtitle, { color: C.textSec, marginTop: 8 }]}>
      200 token ile 30 gün VIP aç: sınırsız vücut analizi ve özel antrenman/beslenme planları.
    </Text>
    {loading ? <ActivityIndicator size="large" color={C.lime} /> : (
      <>
        <TouchableOpacity activeOpacity={0.85} onPress={redeemVip} disabled={userStats.tokens < 200}>
          <LinearGradient
            colors={userStats.tokens >= 200 ? ['#B79CFF', '#8A6FE0'] : [C.border, C.border]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.primaryBtn}
          >
            <Text style={[styles.primaryBtnText, { color: userStats.tokens >= 200 ? '#1A1530' : C.textMuted }]}>
              {userStats.tokens >= 200 ? 'VIP AÇ (200 TOKEN)' : `${200 - userStats.tokens} TOKEN DAHA GEREKİYOR`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} onPress={redeemPromo} style={{ marginTop: 10, alignItems: 'center' }}>
          <Text style={{ color: '#B79CFF', fontSize: 13, fontWeight: '600' }}>🎁 Promosyon kodum var</Text>
        </TouchableOpacity>
        {!user?.referredBy && (
          <TouchableOpacity activeOpacity={0.8} onPress={() => askReferralCode()} style={{ marginTop: 8, alignItems: 'center' }}>
            <Text style={{ color: '#4ade80', fontSize: 13, fontWeight: '600' }}>🎯 Referans kodu gir</Text>
          </TouchableOpacity>
        )}
        {(userStats.adRewardsRemaining ?? 0) > 0 && (
          <TouchableOpacity activeOpacity={0.85} onPress={showRewardedAd} disabled={adLoading} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(198,255,61,0.12)', borderWidth: 1, borderColor: C.lime }}>
              {adLoading ? <ActivityIndicator color={C.lime} /> : <Ionicons name="play-circle" size={18} color={C.lime} />}
              <Text style={{ color: C.lime, fontWeight: '700', fontSize: 13 }}>🎬 Reklam izle, 5 token kazan ({userStats.adRewardsRemaining} hak)</Text>
            </View>
          </TouchableOpacity>
        )}
      </>
    )}
  </LinearGradient>
)}

    {/* ROZETLER — VIP'in altında */}
    {(user.badges?.length > 0 || userStats.badges?.length > 0) && (
      <View style={[styles.statsCard, { marginHorizontal: 0 }]}>
        <Text style={styles.statsTitle}>🏅 Rozetlerim</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {(user.badges || []).map((b: string) => {
            const BADGE_LABELS: any = {
              first_workout: 'İlk Adım 🏃', streak_3: '3 Günlük Seri 🔥',
              streak_7: '7 Günlük Seri ⚡', streak_30: '30 Günlük Efsane 👑',
              vip_member: 'VIP Üye ⭐', plan_complete: 'Program Tamamlandı 💪'
            };
            return (
              <View key={b} style={{ backgroundColor: C.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>{BADGE_LABELS[b] || b}</Text>
              </View>
            );
          })}
        </View>
      </View>
    )}

    {!isEditingProfile ? (
      <>
        {/* Özet kartları */}
        <View style={styles.statCardsRow}>
          <View style={styles.statMiniCard}>
            <Ionicons name="resize-outline" size={18} color={C.lime} />
            <Text style={styles.statMiniValue}>{user.height || '--'}</Text>
            <Text style={styles.statMiniLabel}>Boy (cm)</Text>
          </View>
          <View style={styles.statMiniCard}>
            <Ionicons name="scale-outline" size={18} color={C.lime} />
            <Text style={styles.statMiniValue}>{user.weight || '--'}</Text>
            <Text style={styles.statMiniLabel}>Kilo (kg)</Text>
          </View>
          <View style={styles.statMiniCard}>
            <Ionicons name="fitness-outline" size={18} color={C.lime} />
            <Text style={styles.statMiniValue}>
              {user.height && user.weight ? (user.weight / ((user.height/100) * (user.height/100))).toFixed(1) : '--'}
            </Text>
            <Text style={styles.statMiniLabel}>VKİ</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.editBtn}
          onPress={() => {
            setEditName(user.name);
            setEditHeight(String(user.height));
            setEditWeight(String(user.weight));
            setIsEditingProfile(true);
          }}
        >
          <Ionicons name="create-outline" size={18} color={C.lime} />
          <Text style={styles.editBtnText}>Profili Düzenle</Text>
        </TouchableOpacity>
      </>
    ) : (
      <View style={styles.profileCard}>
        <TextInput
          style={styles.input}
          placeholder="İsim Soyisim"
          placeholderTextColor={C.textMuted}
          value={editName}
          onChangeText={setEditName}
        />
        <TextInput
          style={styles.input}
          placeholder="Boy (cm)"
          placeholderTextColor={C.textMuted}
          value={editHeight}
          onChangeText={setEditHeight}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Kilo (kg)"
          placeholderTextColor={C.textMuted}
          value={editWeight}
          onChangeText={setEditWeight}
          keyboardType="numeric"
        />

        {/* Opsiyonel vücut ölçüleri */}
        <Text style={[styles.statsSubtitle, { marginTop: 2, marginBottom: 8 }]}>İstersen vücut ölçülerini de gir (opsiyonel):</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Bel (cm)" placeholderTextColor={C.textMuted} value={statWaist} onChangeText={setStatWaist} keyboardType="numeric" />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Omuz (cm)" placeholderTextColor={C.textMuted} value={statShoulder} onChangeText={setStatShoulder} keyboardType="numeric" />
        </View>
        <TextInput style={styles.input} placeholder="Boyun (cm)" placeholderTextColor={C.textMuted} value={statNeck} onChangeText={setStatNeck} keyboardType="numeric" />

        {loading ? <ActivityIndicator size="large" color={C.lime} style={{ marginTop: 10 }} /> : (
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 12}}>
            <TouchableOpacity style={[styles.miniBtn, styles.miniBtnPrimary]} onPress={updateProfile}>
              <Ionicons name="checkmark" size={18} color="#0B0D12" />
              <Text style={styles.miniBtnPrimaryText}>KAYDET</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.miniBtn, styles.miniBtnGhost]} onPress={() => setIsEditingProfile(false)}>
              <Ionicons name="close" size={18} color={C.red} />
              <Text style={styles.miniBtnGhostText}>İPTAL</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )}

    {/* HEDEF TAKİBİ */}
    {user.targetWeight && user.weight && (
      <View style={[styles.statsCard, { marginHorizontal: 0 }]}>
        <Text style={styles.statsTitle}>🎯 Hedefe İlerleme</Text>
        {(() => {
          const current = parseFloat(user.weight);
          const target  = parseFloat(user.targetWeight);
          const start   = bodyStats.length ? parseFloat(bodyStats[bodyStats.length - 1].weight || user.weight) : current;
          const totalToLose = Math.abs(start - target);
          const done        = Math.abs(start - current);
          const pct         = totalToLose > 0 ? Math.min(100, Math.round((done / totalToLose) * 100)) : 100;
          const losing      = target < start;
          return (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: C.textMuted, fontSize: 13 }}>Başlangıç: <Text style={{ color: C.text, fontWeight: '700' }}>{start} kg</Text></Text>
                <Text style={{ color: C.textMuted, fontSize: 13 }}>Hedef: <Text style={{ color: C.lime, fontWeight: '700' }}>{target} kg</Text></Text>
              </View>
              <View style={{ height: 10, backgroundColor: C.border, borderRadius: 5, overflow: 'hidden' }}>
                <LinearGradient colors={[C.lime, C.limeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ width: `${pct}%`, height: '100%', borderRadius: 5 }} />
              </View>
              <Text style={{ color: C.textSec, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                %{pct} tamamlandı · {losing ? `${Math.max(0, current - target).toFixed(1)} kg kaldı` : `${Math.max(0, target - current).toFixed(1)} kg kaldı`}
              </Text>
            </>
          );
        })()}
      </View>
    )}

    {/* GİZLİLİK LİNKLERİ */}
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 12, marginTop: 8 }}>
      <TouchableOpacity onPress={() => setPrivacyModal('privacy')}>
        <Text style={{ color: C.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>Gizlilik Politikası</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setPrivacyModal('terms')}>
        <Text style={{ color: C.textMuted, fontSize: 12, textDecorationLine: 'underline' }}>Kullanım Koşulları</Text>
      </TouchableOpacity>
    </View>

    <TouchableOpacity style={styles.logoutBtn} onPress={async () => { await SecureStore.deleteItemAsync('userToken'); setUser(null); setToken(null); }}>
      <Ionicons name="log-out-outline" size={18} color={C.red} />
      <Text style={styles.logoutText}>ÇIKIŞ YAP</Text>
    </TouchableOpacity>
  </ScrollView>
      )}
      </Animated.View>

      {/* GİZLİLİK / KULLANIM KOŞULLARI MODAL */}
      <Modal visible={!!privacyModal} transparent animationType="slide" onRequestClose={() => setPrivacyModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#13161E', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#262C3A' }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                {privacyModal === 'privacy' ? 'Gizlilik Politikası' : 'Kullanım Koşulları'}
              </Text>
              <TouchableOpacity onPress={() => setPrivacyModal(null)}>
                <Ionicons name="close" size={24} color="#8A93A8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {privacyModal === 'privacy' ? (
                <Text style={{ color: '#C8CDD8', fontSize: 14, lineHeight: 22 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>GymBody AI — Gizlilik Politikası{'\n'}</Text>
                  {'\n'}Son güncelleme: Haziran 2025{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>1. Topladığımız Veriler{'\n'}</Text>
                  GymBody AI uygulaması; ad, e-posta adresi, boy, kilo, beden yağ oranı ve yüklediğiniz fotoğraflar gibi kişisel verileri toplar. Bu veriler yalnızca uygulama özelliklerini sunmak amacıyla kullanılır.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>2. Verilerin Kullanımı{'\n'}</Text>
                  Toplanan veriler; ilerlemenizi takip etmek, yapay zeka destekli öneriler sunmak ve uygulama deneyimini kişiselleştirmek için kullanılır. Verileriniz üçüncü taraflarla satılmaz veya paylaşılmaz.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>3. Reklam{'\n'}</Text>
                  VIP üye olmayan kullanıcılara Google AdMob aracılığıyla reklam gösterilir. AdMob, cihaz bilgilerine ve reklam tercihlerinize göre kişiselleştirilmiş reklamlar sunabilir.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>4. Fotoğraflar{'\n'}</Text>
                  Yüklediğiniz fotoğraflar Cloudinary altyapısında güvenli şekilde saklanır ve yalnızca sizin hesabınızda görüntülenir.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>5. Haklarınız{'\n'}</Text>
                  KVKK kapsamında verilerinize erişme, düzeltme ve silme hakkına sahipsiniz. Talepleriniz için: destek@gymbody.ai{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>6. İletişim{'\n'}</Text>
                  Sorularınız için: destek@gymbody.ai
                </Text>
              ) : (
                <Text style={{ color: '#C8CDD8', fontSize: 14, lineHeight: 22 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>GymBody AI — Kullanım Koşulları{'\n'}</Text>
                  {'\n'}Son güncelleme: Haziran 2025{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>1. Kabul{'\n'}</Text>
                  Uygulamayı kullanarak bu koşulları kabul etmiş sayılırsınız. Kabul etmiyorsanız uygulamayı kullanmayınız.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>2. Hizmet{'\n'}</Text>
                  GymBody AI, fitness takibi ve yapay zeka destekli beslenme önerileri sunan bir mobil uygulamadır. Sağlık tavsiyeleri için doktora danışınız.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>3. Hesap{'\n'}</Text>
                  Hesap güvenliğinden kullanıcı sorumludur. Şifrenizi kimseyle paylaşmayınız.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>4. Token ve VIP{'\n'}</Text>
                  Tokenlar uygulama içi sanal birimdir, para değeri taşımaz ve iade edilemez. VIP üyelik aktif dönem boyunca geçerlidir.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>5. Yasaklı Kullanım{'\n'}</Text>
                  Uygulamayı kötüye kullanmak, sistemi manipüle etmek veya başkalarının hesaplarına erişmeye çalışmak yasaktır.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>6. Değişiklikler{'\n'}</Text>
                  Koşulları önceden bildirmeksizin değiştirme hakkımız saklıdır.{'\n\n'}
                  <Text style={{ color: '#C6FF3D', fontWeight: '600' }}>7. İletişim{'\n'}</Text>
                  Sorularınız için: destek@gymbody.ai
                </Text>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ALT BANNER REKLAM — sadece non-VIP */}
      {!userStats.isVip && (
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <BannerAd unitId={TestIds.BANNER} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
        </View>
      )}

      {/* GÜN TAMAMLAMA FEEDBACK MODAL */}
      <Modal visible={dayFeedbackVisible} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setDayFeedbackVisible(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1} onPress={Keyboard.dismiss} />
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 6 }}>💬 Bu Günü Nasıl Buldun?</Text>
            <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 19 }}>
              Eksik gelen, çok gelen veya bir sonraki programa yansıtmamı istediğin bir şey var mı? (opsiyonel)
            </Text>
            <TextInput
              style={[styles.noteInput, { minHeight: 72, marginBottom: 16 }]}
              placeholder="örn. omuz hareketi azdı, bench çok ağır geldi..."
              placeholderTextColor={C.textMuted}
              value={dayFeedbackText}
              onChangeText={setDayFeedbackText}
              multiline
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TouchableOpacity activeOpacity={0.85} onPress={() => { Keyboard.dismiss(); handleCompleteDay(dayFeedbackText); }}>
              <LinearGradient colors={['#B79CFF', '#8A6FE0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                <Ionicons name="checkmark-done-outline" size={18} color="#1A1235" />
                <Text style={[styles.primaryBtnText, { color: '#1A1235' }]}>GÜNÜ TAMAMLA</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); handleCompleteDay(); }} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>Yorum yazmadan geç</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* PAYLAŞIM KARTI MODAL */}
      <Modal visible={shareCardReady} transparent animationType="fade" onRequestClose={() => setShareCardReady(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <ViewShot ref={shareCardRef} options={{ format: 'jpg', quality: 0.95 }} style={{ overflow: 'hidden' }}>
            <View style={{ width: 320, backgroundColor: '#0B0D12' }}>
              {sharePhotoUrl && (
                <Image
                  source={{ uri: sharePhotoUrl }}
                  style={{ width: 320, height: 400 }}
                  resizeMode="cover"
                  onLoadEnd={() => setShareImgLoaded(true)}
                />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(11,13,18,0.95)', '#0B0D12']}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180, justifyContent: 'flex-end', padding: 20 }}
              >
                {sharePhotoFat != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                    <Text style={{ color: '#C6FF3D', fontSize: 38, fontWeight: '900' }}>%{sharePhotoFat}</Text>
                    <Text style={{ color: '#A3ABBA', fontSize: 16, fontWeight: '600' }}>yağ oranı</Text>
                  </View>
                )}
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 2 }}>💪 {user?.name || ''} · GymBodyAI</Text>
                <Text style={{ color: '#6B7384', fontSize: 12 }}>gymbodyai.app</Text>
              </LinearGradient>
            </View>
          </ViewShot>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity onPress={() => setShareCardReady(false)}
              style={{ flex: 1, backgroundColor: '#1D2230', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
              <Text style={{ color: '#A3ABBA', fontWeight: '700' }}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={captureAndShare} disabled={!shareImgLoaded || shareLoading}
              style={{ flex: 2, borderRadius: 14, overflow: 'hidden', opacity: (!shareImgLoaded || shareLoading) ? 0.6 : 1 }}>
              <LinearGradient colors={['#C6FF3D', '#9FE000']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {shareLoading || !shareImgLoaded ? (
                  <ActivityIndicator color="#0B0D12" />
                ) : (
                  <Ionicons name="share-social" size={18} color="#0B0D12" />
                )}
                <Text style={{ color: '#0B0D12', fontWeight: '800', fontSize: 15 }}>
                  {!shareImgLoaded ? 'YÜKLENİYOR' : shareLoading ? 'HAZIRLANIYOR' : 'PAYLAŞ'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* GIF MODAL */}
      <Modal visible={!!gifModalUrl} transparent animationType="fade" onRequestClose={() => setGifModalUrl(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setGifModalUrl(null)}>
         {gifModalUrl && (
           <ExpoImage
             source={{ uri: `${API_URL}/gif-proxy?url=${encodeURIComponent(gifModalUrl)}`, headers: { Authorization: `Bearer ${token}` } }}
             style={{ width: 280, height: 280, borderRadius: 16 }}
             contentFit="contain"
           />
         )}
        </TouchableOpacity>
      </Modal>

      {/* ROZET KAZANILDI MODAL */}
      <Modal visible={newBadgeVisible} transparent animationType="fade" onRequestClose={() => setNewBadgeVisible(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 32 }} activeOpacity={1} onPress={() => setNewBadgeVisible(false)}>
          <View style={{ backgroundColor: C.surface, borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: C.lime, width: '100%' }}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>🏅</Text>
            <Text style={{ color: C.lime, fontSize: 20, fontWeight: '800', marginBottom: 4 }}>Yeni Rozet Kazandın!</Text>
            {newBadges.map(b => (
              <Text key={b.id} style={{ color: C.text, fontSize: 16, fontWeight: '700', marginTop: 8 }}>{b.label}</Text>
            ))}
            <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 12 }}>+{newBadges.length * 5} bonus token kazandın!</Text>
            <TouchableOpacity onPress={() => setNewBadgeVisible(false)} style={{ marginTop: 20 }}>
              <LinearGradient colors={[C.lime, C.limeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primaryBtn, { paddingHorizontal: 32 }]}>
                <Text style={styles.primaryBtnText}>HARİKA!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* İLK GİRİŞ KARŞILAMA MODALI */}
      <Modal visible={welcomeVisible} transparent animationType="fade" onRequestClose={completeOnboarding}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.surface, borderRadius: 24, padding: 26, width: '100%', borderWidth: 1, borderColor: C.lime }}>
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 46 }}>🎉</Text>
              <Text style={{ color: C.text, fontSize: 22, fontWeight: '900', marginTop: 4 }}>Aramıza Hoş Geldin{user?.name ? `, ${String(user.name).split(' ')[0]}` : ''}!</Text>
            </View>

            {/* VIP HEDİYE ROZETİ */}
            <View style={{ backgroundColor: 'rgba(198,255,61,0.12)', borderRadius: 16, padding: 14, marginVertical: 14, borderWidth: 1, borderColor: C.lime, alignItems: 'center' }}>
              <Text style={{ color: C.lime, fontSize: 16, fontWeight: '800' }}>🎁 1 Günlük VIP Hediyemiz Aktif!</Text>
              <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>Bugün tüm premium özellikleri ücretsiz dene</Text>
            </View>

            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>Neler yapabilirsin:</Text>
            {[
              { icon: '🤖', t: 'Sana özel AI antrenman + beslenme programı' },
              { icon: '📸', t: 'Fotoğraftan vücut yağ oranı analizi' },
              { icon: '🍽️', t: 'Sınırsız yemek & kalori tarama' },
              { icon: '💬', t: '7/24 yapay zeka fitness koçu' },
              { icon: '📊', t: 'Gelişim grafikleri ve rozetler' },
            ].map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <Text style={{ fontSize: 18 }}>{f.icon}</Text>
                <Text style={{ color: C.textSec, fontSize: 13, flex: 1 }}>{f.t}</Text>
              </View>
            ))}

            <TouchableOpacity activeOpacity={0.85} onPress={completeOnboarding} style={{ marginTop: 16 }}>
              <LinearGradient colors={[C.lime, C.limeDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>HADİ BAŞLAYALIM</Text>
                <Ionicons name="arrow-forward" size={18} color="#0B0D12" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* HAFTALIK ÖZET MODAL */}
      <Modal visible={weeklySummaryVisible} transparent animationType="slide" onRequestClose={() => setWeeklySummaryVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: C.border, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>📊 Bu Haftanın Özeti</Text>
              <TouchableOpacity onPress={() => setWeeklySummaryVisible(false)}>
                <Ionicons name="close" size={24} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {weeklySummary && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  {[
                    { icon: 'flame', color: C.orange, val: weeklySummary.streak, label: 'Günlük Seri' },
                    { icon: 'barbell-outline', color: C.lime, val: weeklySummary.workoutDays, label: 'Antrenman' },
                    { icon: 'restaurant-outline', color: C.blue, val: weeklySummary.mealScans, label: 'Öğün Tarama' },
                    { icon: 'flame-outline', color: C.red, val: `${weeklySummary.avgCalories} kal`, label: 'Ort. Kalori' },
                  ].map(item => (
                    <View key={item.label} style={{ flex: 1, minWidth: '45%', backgroundColor: C.surface2, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 4 }}>
                      <Ionicons name={item.icon as any} size={22} color={item.color} />
                      <Text style={{ color: C.text, fontWeight: '800', fontSize: 18 }}>{item.val}</Text>
                      <Text style={{ color: C.textMuted, fontSize: 11 }}>{item.label}</Text>
                    </View>
                  ))}
                </View>
                {weeklySummary.weightDiff !== null && (
                  <View style={{ backgroundColor: weeklySummary.weightDiff <= 0 ? '#0f2a1a' : '#2a0f0f', borderRadius: 14, padding: 16, marginBottom: 10 }}>
                    <Text style={{ color: weeklySummary.weightDiff <= 0 ? C.green : C.red, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>
                      {weeklySummary.weightDiff <= 0 ? `−${Math.abs(weeklySummary.weightDiff)} kg verdin 🔥` : `+${weeklySummary.weightDiff} kg aldın`}
                    </Text>
                    <Text style={{ color: C.textSec, fontSize: 13, textAlign: 'center', marginTop: 4 }}>Bu haftaki kilo değişimi</Text>
                  </View>
                )}
                {weeklySummary.fatDiff !== null && (
                  <View style={{ backgroundColor: weeklySummary.fatDiff > 0 ? '#0f2a1a' : '#2a0f0f', borderRadius: 14, padding: 16, marginBottom: 10 }}>
                    <Text style={{ color: weeklySummary.fatDiff > 0 ? C.green : C.red, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>
                      {weeklySummary.fatDiff > 0 ? `−%${weeklySummary.fatDiff} yağ oranı düştü 💪` : `+%${Math.abs(weeklySummary.fatDiff)} yağ oranı arttı`}
                    </Text>
                    <Text style={{ color: C.textSec, fontSize: 13, textAlign: 'center', marginTop: 4 }}>Bu haftaki yağ oranı değişimi</Text>
                  </View>
                )}
                <View style={{ backgroundColor: C.surface2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                    {weeklySummary.workoutDays >= 4 ? '🏆 Mükemmel bir hafta geçirdin! Bu tempo devam ederse sonuçlar kaçınılmaz.' :
                     weeklySummary.workoutDays >= 2 ? '💪 İyi bir haftaydı. Bir sonraki haftada biraz daha sıkıştır.' :
                     '🎯 Bu hafta biraz sessiz geçti. Küçük adımlar da sayılır, hadi devam!'}
                  </Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* AI SOHBET BUTONU (floating) */}
      {user && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setChatVisible(true)}
          style={{ position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', zIndex: 100 }}
        >
          <LinearGradient colors={[C.lime, C.limeDark]} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="chatbubble-ellipses" size={24} color="#0B0D12" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* AI SOHBET MODAL */}
      <Modal visible={chatVisible} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setChatVisible(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.border, maxHeight: '80%', minHeight: '60%', flexDirection: 'column' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.border }}>
              <View>
                <Text style={{ color: C.text, fontWeight: '800', fontSize: 17 }}>🤖 AI Koçun</Text>
                <Text style={{ color: C.textMuted, fontSize: 12 }}>{userStats.isVip ? 'Sınırsız sohbet' : 'Günde 3 ücretsiz mesaj'}</Text>
              </View>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setChatVisible(false); }}>
                <Ionicons name="close" size={24} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView ref={chatScrollRef} style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
              {chatMessages.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: 20, gap: 8 }}>
                  <Text style={{ fontSize: 40 }}>🏋️</Text>
                  <Text style={{ color: C.textSec, textAlign: 'center', lineHeight: 20 }}>Merhaba! Antrenman, beslenme veya hedeflerin hakkında her şeyi sorabilirsin.</Text>
                  <View style={{ gap: 8, width: '100%', marginTop: 12 }}>
                    {['Bugün için antrenman öner', 'Protein ihtiyacım ne kadar?', 'Motivasyon düştü, ne yapayım?'].map(q => (
                      <TouchableOpacity key={q} onPress={() => { setChatInput(q); }}
                        style={{ backgroundColor: C.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border }}>
                        <Text style={{ color: C.textSec, fontSize: 13 }}>{q}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {chatMessages.map((m, i) => (
                <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <View style={{ backgroundColor: m.role === 'user' ? C.lime : C.surface2, borderRadius: 16, borderBottomRightRadius: m.role === 'user' ? 4 : 16, borderBottomLeftRadius: m.role === 'user' ? 16 : 4, padding: 12 }}>
                    <Text style={{ color: m.role === 'user' ? '#0B0D12' : C.text, fontSize: 14, lineHeight: 20 }}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {chatLoading && (
                <View style={{ alignSelf: 'flex-start', backgroundColor: C.surface2, borderRadius: 16, padding: 14 }}>
                  <ActivityIndicator size="small" color={C.lime} />
                </View>
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingTop: 10, borderTopWidth: 1, borderColor: C.border }}>
              <TextInput
                style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border }}
                placeholder="Sor bakalım..."
                placeholderTextColor={C.textMuted}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChatMessage}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={sendChatMessage} disabled={!chatInput.trim() || chatLoading}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chatInput.trim() ? C.lime : C.border, justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="send" size={18} color={chatInput.trim() ? '#0B0D12' : C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}
const chartConfig = {
  backgroundGradientFrom: C.surface,
  backgroundGradientTo: C.surface,
  decimalPlaces: 1,
  color: (o = 1) => `rgba(198, 255, 61, ${o})`,
  labelColor: () => C.textSec,
  style: { borderRadius: 12 },
  propsForBackgroundLines: { stroke: C.border },
  propsForDots: { r: '4', strokeWidth: '2', stroke: C.lime }
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },

  // ---- AUTH ----
  authRoot: { flex: 1, backgroundColor: C.bg },
  authScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 60 },
  logoBadge: {
    width: 76, height: 76, borderRadius: 24, alignSelf: 'center',
    justifyContent: 'center', alignItems: 'center', marginBottom: 22,
    shadowColor: C.lime, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  authBrand: { fontSize: 30, fontWeight: '900', textAlign: 'center', color: C.text, letterSpacing: 1 },
  authTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: C.text, marginTop: 18 },
  authSubtitle: { fontSize: 14, textAlign: 'center', color: C.textSec, marginTop: 6, marginBottom: 26, lineHeight: 20 },
  authCard: {
    backgroundColor: C.surface, borderRadius: 22, padding: 18,
    borderWidth: 1, borderColor: C.border,
  },
  //TOKEN & STREAK KARTLARI
  tokenCardRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  tokenCard: { flex: 1, backgroundColor: C.surface, borderRadius: 16, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  tokenValue: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 3 },
  tokenLabel: { fontSize: 10.5, color: C.textMuted, marginTop: 1 },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.surface2, borderRadius: 14, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 14, marginBottom: 13,
    },
    inputIcon: { marginRight: 10 },
    inputWithIcon: { flex: 1, paddingVertical: 15, fontSize: 15, color: C.text },

    switchText: { textAlign: 'center', color: C.textSec, fontSize: 14 },

  // ---- BUTTONS ----
  primaryBtn: {
    flexDirection: 'row', gap: 8, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 10,
    shadowColor: C.lime, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  primaryBtnText: { color: '#0B0D12', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },

  miniBtn: { flex: 0.48, flexDirection: 'row', gap: 6, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  miniBtnPrimary: { backgroundColor: C.lime },
  miniBtnPrimaryText: { color: '#0B0D12', fontWeight: '800', fontSize: 14 },
  miniBtnGhost: { backgroundColor: 'rgba(255,90,82,0.12)', borderWidth: 1, borderColor: 'rgba(255,90,82,0.4)' },
  miniBtnGhostText: { color: C.red, fontWeight: '700', fontSize: 14 },

  // ---- TOP BAR ----
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  topGreeting: { color: C.textSec, fontSize: 13 },
  topName: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#0B0D12', fontWeight: '900', fontSize: 18 },

  // ---- TABS ----
  tabContainer: { flexDirection: 'row', marginBottom: 16, backgroundColor: C.surface, borderRadius: 16, padding: 5, borderWidth: 1, borderColor: C.border },
  tab: { flex: 1, gap: 3, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  activeTab: { backgroundColor: C.lime },
  tabText: { fontWeight: '700', color: C.textSec, fontSize: 10 },
  activeTabText: { color: '#0B0D12' },
  gymTab: { flex: 1.4, alignItems: 'center', justifyContent: 'center', marginVertical: -4 },
  gymTabInner: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3, shadowColor: '#B79CFF', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  gymTabText: { color: '#B79CFF', fontWeight: '800', fontSize: 11 }, 

  // ---- UPLOAD ----
  uploadCard: { marginBottom: 16 },
  dashedUpload: {
    backgroundColor: C.surface, borderRadius: 18, paddingVertical: 28, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
  },
  uploadIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(198,255,61,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  uploadTitle: { color: C.text, fontWeight: '700', fontSize: 16 },
  uploadHint: { color: C.textMuted, fontSize: 12.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
  preview: { width: '100%', height: 220, borderRadius: 14, marginBottom: 12 },
  noteInput: { backgroundColor: C.surface2, padding: 14, borderRadius: 12, minHeight: 52, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14 },

  // ---- GALLERY ----
  galleryCard: { backgroundColor: C.surface, borderRadius: 20, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  galleryImg: { width: '100%', height: 320 },
  galleryInfo: { padding: 14 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  noteText: { fontSize: 15, color: C.text, marginTop: 8, lineHeight: 21 },
  analysisBox: { backgroundColor: C.surface2, borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: C.border },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  analysisFat: { fontSize: 14, fontWeight: '800', color: C.lime },
  analysisText: { fontSize: 13, color: C.textSec, lineHeight: 19 },
  deleteBtn: { marginTop: 12, flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,90,82,0.1)', paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,90,82,0.25)' },
  deleteBtnText: { color: C.red, fontWeight: '700', fontSize: 13 },

  // ---- EMPTY ----
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptyText: { color: C.textMuted, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  // ---- GYMBODY ----
  gymLockCard: { width: '100%', borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#3A2E66' },
  gymLockTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 12 },
  gymLockSubtitle: { fontSize: 14, color: C.textSec, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  gymLockStats: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  gymLockStatItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gymLockStatText: { color: C.text, fontWeight: '700', fontSize: 13 },
  gymDayCard: { backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  gymDayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  gymDayTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  gymFocusBadge: { backgroundColor: 'rgba(183,156,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#3A2E66' },
  gymFocusText: { color: '#B79CFF', fontSize: 12, fontWeight: '700' },
  restDayCard: {
    borderRadius: 24, padding: 28, marginBottom: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A1F60',
  },
  restMoonCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(183,156,255,0.12)', borderWidth: 1, borderColor: '#3A2E66',
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  restDayTitle: { fontSize: 24, fontWeight: '900', color: C.text, marginBottom: 12 },
  restDayQuote: {
    fontSize: 13.5, color: C.textSec, textAlign: 'center', lineHeight: 21,
    fontStyle: 'italic', paddingHorizontal: 8, marginBottom: 24,
  },
  restNextCard: {
    width: '100%', backgroundColor: 'rgba(183,156,255,0.08)',
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#3A2E66', marginBottom: 24,
  },
  restNextLabel: { fontSize: 10, fontWeight: '800', color: '#B79CFF', letterSpacing: 1.5 },
  restNextFocus: { fontSize: 16, fontWeight: '800', color: C.text },
  restNextCount: { fontSize: 12, color: C.textMuted, marginTop: 4 },
  restBackBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 24,
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(183,156,255,0.3)',
    backgroundColor: 'rgba(183,156,255,0.07)',
  },
  restBackBtnText: { color: '#B79CFF', fontWeight: '700', fontSize: 14 },
  restPromptCard: {
    backgroundColor: C.surface, borderRadius: 22, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#3A2E66', alignItems: 'center',
  },
  restPromptTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 4 },
  restPromptSub: { fontSize: 13, color: C.textMuted, marginBottom: 18 },
  restPromptBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  restPromptYes: {
    flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface2,
  },
  restPromptYesText: { color: C.textSec, fontWeight: '700', fontSize: 13 },
  restPromptNo: {
    flex: 1.4, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, backgroundColor: '#B79CFF',
  },
  restPromptNoText: { color: '#1A1235', fontWeight: '800', fontSize: 13 },
  gymExerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  gymExerciseName: { fontSize: 14, fontWeight: '700', color: C.text },
  gymExerciseSets: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  gymMealRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  gymMealName: { fontSize: 13, fontWeight: '800', color: '#B79CFF' },
  gymMealItems: { fontSize: 13, color: C.text, marginTop: 3, lineHeight: 19 },
  gymMealCal: { fontSize: 12, color: C.textMuted, marginTop: 3 },
  dayBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  dayBtnActive: { backgroundColor: '#B79CFF', borderColor: '#B79CFF' },
  dayBtnText: { fontSize: 18, fontWeight: '800', color: C.text },
  dayBtnTextActive: { color: '#1A1235' },
  dayBtnLabel: { fontSize: 10, color: C.textMuted, marginTop: 2 },

  // ---- MEAL ----
  mealHeaderCard: { borderRadius: 22, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  mealIconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,159,28,0.14)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  mealTitle: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  mealSubtitle: { fontSize: 13, color: C.textSec, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 10 },
  rightsPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,159,28,0.12)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 10 },
  rightsText: { color: C.textSec, fontSize: 12.5 },
  scanBtn: { flexDirection: 'row', gap: 8, backgroundColor: C.orange, paddingVertical: 13, paddingHorizontal: 30, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12, alignSelf: 'stretch' },
  scanBtnText: { color: '#0B0D12', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  loaderBox: { marginVertical: 36, alignItems: 'center' },
  loaderText: { marginTop: 14, color: C.textSec, fontStyle: 'italic', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
  resultCard: { backgroundColor: C.surface, borderRadius: 22, padding: 18, marginBottom: 30, borderWidth: 1, borderColor: C.border },
  mealPreviewImg: { width: '100%', height: 190, borderRadius: 14, marginBottom: 14 },
  resultMealName: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center' },
  resultDesc: { fontSize: 13.5, color: C.textSec, textAlign: 'center', marginVertical: 10, lineHeight: 20 },
  calorieBadge: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginVertical: 14, borderWidth: 1, borderColor: 'rgba(255,159,28,0.3)' },
  calorieNum: { fontSize: 30, fontWeight: '900', color: C.orange },
  calorieLabel: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1 },
  macroContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 },
  macroBox: { alignItems: 'center', flex: 1 },
  macroDivider: { width: 1, height: 34, backgroundColor: C.border },
  macroVal: { fontSize: 19, fontWeight: '800' },
  macroLabel2: { fontSize: 12, color: C.textMuted, marginTop: 3 },

  // ---- STATS ----
  statsCard: { backgroundColor: C.surface, borderRadius: 20, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  statsTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 10 },
  statsSubtitle: { fontSize: 12.5, color: C.textMuted, marginBottom: 10, lineHeight: 17 },
  statsEmptyText: { fontSize: 13.5, color: C.textMuted, textAlign: 'center', paddingVertical: 6, lineHeight: 20 },
  input: { backgroundColor: C.surface2, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10, fontSize: 15, color: C.text },
  vipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageIndicator: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16, marginTop: -4 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  pageDotActive: { backgroundColor: C.lime, width: 18 },

  // ---- PROFILE ----
  profileHero: { alignItems: 'center', paddingVertical: 18, marginBottom: 8 },
  profileAvatar: { width: 88, height: 88, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 14, shadowColor: C.lime, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  profileAvatarText: { color: '#0B0D12', fontWeight: '900', fontSize: 34 },
  profileName: { fontSize: 23, fontWeight: '800', color: C.text },
  profileEmail: { fontSize: 13.5, color: C.textMuted, marginTop: 4 },
  statCardsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statMiniCard: { flex: 1, backgroundColor: C.surface, borderRadius: 16, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statMiniValue: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 8 },
  statMiniLabel: { fontSize: 11.5, color: C.textMuted, marginTop: 3 },
  editBtn: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(198,255,61,0.1)', paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(198,255,61,0.3)' },
  editBtnText: { color: C.lime, fontWeight: '700', fontSize: 15 },
  profileCard: { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border },
  logoutBtn: { flexDirection: 'row', gap: 8, backgroundColor: 'rgba(255,90,82,0.1)', paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,90,82,0.25)' },
  logoutText: { color: C.red, fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },

  // ---- KALORİ TAKİP / HEDEFLER ----
  calTodayRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  calTodayNum: { fontSize: 32, fontWeight: '900', color: C.text },
  calTodayUnit: { fontSize: 15, fontWeight: '600', color: C.textMuted },
  calTodayTarget: { fontSize: 12.5, color: C.textSec, marginBottom: 6 },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: C.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: C.lime },
  genderRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  genderBtn: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  genderBtnActive: { backgroundColor: C.lime, borderColor: C.lime },
  genderText: { color: C.textSec, fontWeight: '700', fontSize: 14 },
  genderTextActive: { color: '#0B0D12' },
  bmrResult: { backgroundColor: C.surface2, borderRadius: 14, padding: 12, marginTop: 10, borderWidth: 1, borderColor: C.border },
  bmrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  bmrLabel: { fontSize: 13.5, color: C.textSec },
  bmrVal: { fontSize: 15, fontWeight: '700', color: C.text },
  bmrHighlight: { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 11 },
  bmrNote: { fontSize: 12.5, color: C.textMuted, marginTop: 8, lineHeight: 18 },
  mealLogRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  mealLogName: { fontSize: 15, fontWeight: '700', color: C.text },
  mealLogDate: { fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  mealLogMacros: { flexDirection: 'row', gap: 12, marginTop: 6 },
  mealLogMacro: { fontSize: 12.5, fontWeight: '700' },
  mealLogCalBox: { alignItems: 'center', marginLeft: 12, backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  mealLogCal: { fontSize: 17, fontWeight: '800', color: C.orange },
  mealLogCalUnit: { fontSize: 10, color: C.textMuted, fontWeight: '600' },
});
