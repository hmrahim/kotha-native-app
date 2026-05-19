// notifee.web.js
// Web platform এ notifee কাজ করে না, তাই এটা mock করা হয়েছে

const notifee = {
  requestPermission: async () => ({ authorizationStatus: 1 }),
  createChannel: async () => 'default',
  createChannelGroup: async () => {},
  displayNotification: async () => {},
  cancelNotification: async () => {},
  cancelAllNotifications: async () => {},
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => {},
  getInitialNotification: async () => null,
  setBadgeCount: async () => {},
  getBadgeCount: async () => 0,
  incrementBadgeCount: async () => {},
  decrementBadgeCount: async () => {},
  getChannels: async () => [],
  getChannel: async () => null,
  deleteChannel: async () => {},
  getNotifications: async () => [],
  getTriggerNotifications: async () => [],
  getTriggerNotificationIds: async () => [],
  createTriggerNotification: async () => {},
  isChannelBlocked: async () => false,
  isChannelCreated: async () => false,
  openNotificationSettings: async () => {},
  openPowerManagerSettings: async () => {},
  openBatteryOptimizationSettings: async () => {},
  isBatteryOptimizationEnabled: async () => false,
  getPowerManagerInfo: async () => ({}),
  registerForegroundService: () => {},
  stopForegroundService: async () => {},
};

export default notifee;

export const AndroidImportance = {
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
};

export const AndroidVisibility = {
  PRIVATE: 0,
  PUBLIC: 1,
  SECRET: -1,
};

export const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
};

export const EventType = {
  UNKNOWN: -1,
  DISMISSED: 0,
  PRESS: 1,
  ACTION_PRESS: 2,
  DELIVERED: 3,
  APP_BLOCKED: 4,
  CHANNEL_BLOCKED: 5,
  CHANNEL_GROUP_BLOCKED: 6,
  TRIGGER_NOTIFICATION_CREATED: 7,
  FG_ALREADY_EXIST: 8,
};

export const TriggerType = {
  TIMESTAMP: 0,
  INTERVAL: 1,
};

export const RepeatFrequency = {
  NONE: -1,
  HOURLY: 0,
  DAILY: 1,
  WEEKLY: 2,
};