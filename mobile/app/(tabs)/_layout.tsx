import { Tabs } from 'expo-router';
import React from 'react';

// Uygulamanın kendi üst sekme yönetimi var (Akış / Kalori / İstatistik / Profil),
// bu yüzden alt sekme barını gizliyoruz ve tek ekranı (index) gösteriyoruz.
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
