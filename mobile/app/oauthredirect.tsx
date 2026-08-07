import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// Google girişi bitince tarayıcı `com.gymbodyai.app:/oauthredirect` adresine
// yönlendiriyor. expo-router bunu bir sayfa sanıp "Unmatched Route" basmasın diye
// bu ekran var. Token işini (tabs)/index içindeki gResponse effect'i üstleniyor;
// burada tek yapılan, kullanıcıyı hiç göstermeden ana ekrana geri almak.
export default function OAuthRedirect() {
  useEffect(() => {
    router.replace('/');
  }, []);

  return <View style={{ flex: 1, backgroundColor: '#0B0D12' }} />;
}
