// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    // ✅ notifee mock
    if (
      moduleName === '@notifee/react-native' ||
      moduleName.startsWith('@notifee/react-native/')
    ) {
      return {
        filePath: path.resolve(__dirname, 'notifee.web.js'),
        type: 'sourceFile',
      };
    }

    // ✅ firebase/messaging mock
    if (
      moduleName === '@react-native-firebase/messaging' ||
      moduleName.startsWith('@react-native-firebase/messaging/')
    ) {
      return {
        filePath: path.resolve(__dirname, 'firebase-messaging.web.js'),
        type: 'sourceFile',
      };
    }

    // ✅ react-native-webrtc mock (RTCView web এ কাজ করে না)
    if (
      moduleName === 'react-native-webrtc' ||
      moduleName.startsWith('react-native-webrtc/')
    ) {
      return {
        filePath: path.resolve(__dirname, 'webrtc-mock.web.js'),
        type: 'sourceFile',
      };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
  'mjs',
];

module.exports = config;