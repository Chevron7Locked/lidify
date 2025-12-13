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
    BackgroundMode: {
      // Foreground service notification settings
      title: 'Lidify',
      text: 'Playing audio in background',
      icon: 'ic_stat_icon',
      importance: 'high',
      visibility: 'public',
      channelName: 'Audio Playback',
      channelDescription: 'Keeps audio playing when app is in background',
      // Keep the foreground service running
      disableWebViewOptimizations: true,
    },
  },
};

export default config;
