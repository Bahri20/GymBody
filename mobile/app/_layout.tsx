import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '@/lib/i18n'; // dil algılama + çeviriler uygulama açılırken yüklensin
import { useFonts } from 'expo-font';
// Tasarım sistemi fontları: başlıklarda Sora (geometrik, teknik), gövdede Hanken Grotesk
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Uygulama tamamen koyu tema — gezinme arka planlarını da koyulaştırıyoruz
const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0B0D12',
    card: '#0B0D12',
    border: '#262C3A',
    primary: '#C6FF3D',
  },
};

export default function RootLayout() {
  // Fontlar yüklenene kadar splash açık kalır; yüklenemezse uygulama sistem fontuyla açılır
  const [fontsLoaded, fontError] = useFonts({
    Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold,
    HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold,
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={AppDarkTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
