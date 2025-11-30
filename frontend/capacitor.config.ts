import type { CapacitorConfig } from '@capacitor/cli';

// Environment-based configuration
// Set NODE_ENV=production to build for production (no dev server)
const isDevelopment = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'com.lidify.app',
  appName: 'Lidify',
  webDir: 'out',

  // Only include dev server in development mode
  // For production builds: Run with NODE_ENV=production
  ...(isDevelopment && {
    server: {
      // For development: Point to Next.js dev server
      // Use 10.0.2.2 for Android Emulator (special address to reach host PC)
      // Use your local IP for physical device on same WiFi (find with: ipconfig or ifconfig)
      url: 'http://10.0.2.2:3030',
      cleartext: true, // Allow HTTP traffic for local development
    },
  }),
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
      launchShowDuration: 2000,
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
