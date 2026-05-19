// services/fcm.web.js
// Web এ FCM/Notifee কাজ করে না — সব stub করা হয়েছে
// Metro bundler web build এ এই file টা automatically use করবে

export const setupAndroidChannels         = async () => {}
export const registerForPushNotifications = async () => null
export const setupForegroundHandler       = ()      => () => {}
export const registerBackgroundHandler    = ()      => {}
export const getInitialNotification       = async () => null
export const setupNotificationListeners   = ()      => () => {}
export const setupNotifeeListeners        = ()      => () => {}
export const showIncomingCallNotification = async () => {}
export const cancelCallNotification       = async () => {}
export const setBadgeCount                = async () => {}
export const clearBadge                   = async () => {}