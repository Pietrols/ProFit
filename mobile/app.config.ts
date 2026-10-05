import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the static config; this file adds what depends on environment variables.
//
// The Google sign-in plugin is only needed for iOS, and it refuses to run without the reversed
// iOS client ID. Android needs only the Web client ID, which the app reads at runtime. So the plugin
// is added once EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME is set (see docs/GOOGLE_SIGN_IN.md).
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  const plugins: ExpoConfig['plugins'] = [...(config.plugins ?? [])];
  if (iosUrlScheme) plugins.push(['react-native-nitro-google-signin', { iosUrlScheme }]);
  return { ...config, name: config.name ?? 'ProFit', slug: config.slug ?? 'profit', plugins };
};
