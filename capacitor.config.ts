import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ibexscreenguide.app',
  appName: 'Ibex Screen Guide',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#F8FAFC',
    allowMixedContent: false,
  },
};

export default config;
