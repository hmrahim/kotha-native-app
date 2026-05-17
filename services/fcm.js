// services/fcm.js
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { registerFcmToken } from './api'

// ─── expo-task-manager শুধু dev-client/standalone build এ কাজ করে ────────────
// Expo Go তে কাজ করে না, তাই safely import করি
let TaskManager = null
try {
  TaskManager = require('expo-task-manager')
} catch (_) {}

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK'

// Background task define — শুধু TaskManager available থাকলে
if (TaskManager) {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error }) => {
    if (error) {
      console.log('❌ Background notification error:', error)
      return
    }
    console.log('🔔 Background notification:', data?.notification?.request?.content?.title)
  })
}

// ─── Foreground Handler ───────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

// ─── Android Channel ──────────────────────────────────────────────────────────
const setupAndroidChannel = async () => {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'received',
      vibrationPattern: [0, 250, 100, 250],
      lightColor: '#2DD4BF',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    })
  } catch (e) {
    console.log('⚠️ Android channel setup failed:', e?.message)
  }
}

// ─── Register Push Token ──────────────────────────────────────────────────────
export const registerForPushNotifications = async () => {
  try {
    if (!Device.isDevice) {
      console.log('📵 Push notifications require a physical device')
      return null
    }

    await setupAndroidChannel()

    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') {
      console.log('🔕 Push permission not granted')
      return null
    }

    let token = null
    try {
      const res = await Notifications.getDevicePushTokenAsync()
      token = res?.data
    } catch (e) {
      console.log('⚠️ getDevicePushTokenAsync failed:', e?.message)
      try {
        const res = await Notifications.getExpoPushTokenAsync()
        token = res?.data
      } catch (e2) {
        console.log('⚠️ getExpoPushTokenAsync failed:', e2?.message)
      }
    }

    if (!token) return null
    console.log('📲 FCM token:', token.slice(0, 24) + '...')

    try {
      await registerFcmToken(token)
      console.log('✅ FCM token registered')
    } catch (e) {
      console.log('⚠️ Backend token register failed:', e?.message)
    }

    // Background task — শুধু TaskManager থাকলে
    if (TaskManager) {
      try {
        await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK)
        console.log('✅ Background task registered')
      } catch (e) {
        console.log('⚠️ Background task register failed (Expo Go তে হবে না):', e?.message)
      }
    }

    return token
  } catch (err) {
    console.log('registerForPushNotifications error:', err?.message)
    return null
  }
}

// ─── Listeners ────────────────────────────────────────────────────────────────
export const setupNotificationListeners = ({ onTap, onReceive } = {}) => {
  const sub1 = Notifications.addNotificationReceivedListener((notif) => {
    console.log('🔔 Notification received:', notif?.request?.content?.title)
    onReceive?.(notif?.request?.content?.data || {})
  })

  const sub2 = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {}
    console.log('👆 Notification tapped:', data)
    onTap?.(data)
  })

  return () => {
    sub1.remove()
    sub2.remove()
  }
}

// ─── Killed state থেকে খুললে ─────────────────────────────────────────────────
export const getInitialNotification = async () => {
  try {
    const response = await Notifications.getLastNotificationResponseAsync()
    return response?.notification?.request?.content?.data || null
  } catch (_) {
    return null
  }
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export const setBadgeCount = async (count) => {
  try { await Notifications.setBadgeCountAsync(count) } catch (_) {}
}
export const clearBadge = () => setBadgeCount(0)
