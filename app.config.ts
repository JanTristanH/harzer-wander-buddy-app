import type { ExpoConfig } from 'expo/config';

const config = (require('./app.json') as { expo: ExpoConfig }).expo;
const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const isAndroidEasBuild = process.env.EAS_BUILD_PLATFORM === 'android';

if (isAndroidEasBuild && !androidGoogleMapsApiKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for Android build. Set it with: eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value <your_key>'
  );
}

export default (): ExpoConfig => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android?.config ?? {}),
      ...(androidGoogleMapsApiKey
        ? {
            googleMaps: {
              apiKey: androidGoogleMapsApiKey,
            },
          }
        : {}),
    },
  },
});
