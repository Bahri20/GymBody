const { withAndroidManifest } = require('expo/config-plugins');

const AD_ID_PERMISSION = 'com.google.android.gms.permission.AD_ID';

// expo-notifications pulls in Firebase libraries that declare AD_ID by default,
// even though this app never reads the advertising ID. Strip it so the manifest
// matches the Play Console declaration (no advertising ID usage).
module.exports = function withRemoveAdIdPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const alreadyPresent = manifest['uses-permission'].some(
      (p) => p.$ && p.$['android:name'] === AD_ID_PERMISSION
    );
    if (!alreadyPresent) {
      manifest['uses-permission'].push({
        $: {
          'android:name': AD_ID_PERMISSION,
          'tools:node': 'remove',
        },
      });
    }
    return config;
  });
};
