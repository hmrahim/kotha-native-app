// firebase-messaging.web.js
// Web platform এ Firebase Messaging কাজ করে না, তাই mock করা হয়েছে

const messaging = () => ({
  onMessage: () => () => {},
  setBackgroundMessageHandler: () => {},
  getToken: async () => null,
  requestPermission: async () => 1,
  onNotificationOpenedApp: () => () => {},
  getInitialNotification: async () => null,
  subscribeToTopic: async () => {},
  unsubscribeFromTopic: async () => {},
  deleteToken: async () => {},
});

messaging.AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
};

export default messaging;