// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Web এ notifee এবং firebase/messaging mock করা হচ্ছে
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (
      moduleName === '@notifee/react-native' ||
      moduleName.startsWith('@notifee/react-native/')
    ) {
      return {
        filePath: path.resolve(__dirname, 'notifee.web.js'),
        type: 'sourceFile',
      };
    }

    if (
      moduleName === '@react-native-firebase/messaging' ||
      moduleName.startsWith('@react-native-firebase/messaging/')
    ) {
      return {
        filePath: path.resolve(__dirname, 'firebase-messaging.web.js'),
        type: 'sourceFile',
      };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

// cjs + mjs support
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
  'mjs',
];

module.exports = config;