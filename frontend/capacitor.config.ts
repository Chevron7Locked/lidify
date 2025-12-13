import type { CapacitorConfig } from '@capacitor/cli';

// ============================================================================
// DEVELOPMENT MODE: Set your dev server URL here for local testing with plugins
// Comment out for production builds!
// ============================================================================
const DEV_SERVER_URL = 'http://192.168.50.112:3030'; // Your LAN IP
// const DEV_SERVER_URL = undefined; // Uncomment for production build

const config: CapacitorConfig = {
  appId: 'com.lidify.app',
  appName: 'Lidify',
  webDir: 'out',

  server: DEV_SERVER_URL 
    ? {
        // DEV MODE: Proxy dev server through localhost - plugins work!
        url: DEV_SERVER_URL,
        cleartext: true, // Allow HTTP
      }
    : {
        // PRODUCTION MODE: Bundle shell, navigate to user's server
        // WARNING: Plugins won't work on remote origins!
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
    // Music controls plugin handles foreground service notification for background audio
    // No separate BackgroundMode plugin needed - it was causing conflicts
  },
};

export default config;
