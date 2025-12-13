import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lidify.app',
  appName: 'Lidify',
  webDir: 'out',

  // No server.url - load from bundled shell HTML
  // Shell asks user for their server URL
  // IMPORTANT: the shell then navigates to the user’s server origin (remote URL).
  // Allow navigation to arbitrary self-hosted servers inside the WebView.
  server: {
    allowNavigation: ["*"],
  },
  
  android: {
    backgroundColor: '#000000',
    allowMixedContent: true, // Allow HTTP traffic for development
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#000000',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000',
    },
  },
};

export default config;
