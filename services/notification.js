// services/notification.js
// @react-native-firebase/messaging ব্যবহার করা হয়নি — expo-notifications দিয়েই সব হয়
// FCM Token registration: services/fcm.js এর registerForPushNotifications() করে
// এই file টা শুধু foreground notification আর channel setup করে

import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// ─── Foreground Notification Handler ─────────────────────────────────────────
// App খোলা থাকলেও notification দেখাবে
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

// ─── Android Notification Channel ────────────────────────────────────────────
export const setupAndroidChannel = async () => {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'received',
      vibrationPattern: [100, 250, 100, 250],
      lightColor: '#2DD4BF',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    })
    console.log('✅ Android notification channel ready')
  } catch (e) {
    console.log('⚠️ Android channel setup failed:', e?.message)
  }
}