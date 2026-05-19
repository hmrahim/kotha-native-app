// services/fcm.js — Client-side FCM (React Native / Expo)
import messaging from '@react-native-firebase/messaging'
import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// ─── Android Notification Channels ───────────────────────────────────────────
export const setupAndroidChannels = async () => {
  if (Platform.OS !== 'android') return
  await notifee.createChannel({
    id: 'messages',
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    sound: 'received',
    vibration: true,
  })
  await notifee.createChannel({
    id: 'incoming_call',
    name: 'Incoming Calls',
    importance: AndroidImportance.HIGH,
    sound: 'ringtone',
    vibration: true,
    vibrationPattern: [0, 1000, 500, 1000],
    bypassDnd: true,
    lights: true,
    lightColor: '#0084FF',
  })
}

// ─── FCM Token Register ───────────────────────────────────────────────────────
export const registerForPushNotifications = async () => {
  try {
    const authStatus = await messaging().requestPermission()
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL

    if (!enabled) return null

    const token = await messaging().getToken()
    return token
  } catch (e) {
    console.warn('[FCM] registerForPushNotifications error:', e?.message)
    return null
  }
}

// ─── Badge Clear ──────────────────────────────────────────────────────────────
export const clearBadge = async () => {
  try {
    await Notifications.setBadgeCountAsync(0)
  } catch (_) {}
}

// ─── Background Handler Register ─────────────────────────────────────────────
export const registerBackgroundHandler = () => {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage?.data || {}
    if (data?.type === 'incoming_call' && data?.callId) {
      await showCallNotification(data)
    }
  })
}

// ─── Show Call Notification (Notifee) ────────────────────────────────────────
const showCallNotification = async (data) => {
  try {
    await notifee.displayNotification({
      id: `call_${data.callId}`,
      title: data.callerName || 'Incoming Call',
      body: data.callType === 'video' ? 'Incoming video call' : 'Incoming voice call',
      data,
      android: {
        channelId: 'incoming_call',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        category: 'call',
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction: { id: 'default', launchActivity: 'default' },
        actions: [
          { title: 'Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
          { title: 'Decline', pressAction: { id: 'decline' } },
        ],
        sound: 'ringtone',
        vibrationPattern: [0, 1000, 500, 1000],
        lights: true,
        lightColor: '#0084FF',
        ongoing: true,
        wakeUpScreen: true,
        showChronometer: false,
      },
    })
  } catch (e) {
    console.warn('[FCM] showCallNotification error:', e?.message)
  }
}

// ─── Cancel Call Notification ─────────────────────────────────────────────────
export const cancelCallNotification = async (callId) => {
  try {
    await notifee.cancelNotification(`call_${callId}`)
  } catch (_) {}
}

// ─── Foreground FCM Handler ───────────────────────────────────────────────────
export const setupForegroundHandler = () => {
  const unsubscribe = messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage?.data || {}
    if (data?.type === 'incoming_call' && data?.callId) {
      await showCallNotification(data)
    }
  })
  return unsubscribe
}

// ─── Notifee Foreground Event Listeners ──────────────────────────────────────
export const setupNotifeeListeners = ({ onAccept, onDecline, onDismiss }) => {
  const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail
    const data = notification?.data || {}

    if (type === EventType.ACTION_PRESS) {
      await notifee.cancelNotification(notification.id)
      if (pressAction?.id === 'accept') {
        onAccept?.(data)
      } else if (pressAction?.id === 'decline') {
        onDecline?.(data)
      }
    }
    if (type === EventType.DISMISSED) {
      onDismiss?.(data)
    }
  })
  return unsubscribe
}

// ─── Notification Tap Listeners ───────────────────────────────────────────────
export const setupNotificationListeners = ({ onNotificationTap }) => {
  // App foreground এ notification tap
  const sub1 = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data
    onNotificationTap?.(data)
  })

  return () => {
    sub1.remove()
  }
}

// ─── Initial Notification (App killed থেকে open) ─────────────────────────────
export const getInitialNotification = async () => {
  try {
    // Notifee থেকে initial notification
    const initial = await notifee.getInitialNotification()
    if (initial) return initial.notification?.data || null

    // FCM থেকে initial notification
    const remoteMessage = await messaging().getInitialNotification()
    if (remoteMessage) return remoteMessage.data || null

    return null
  } catch (e) {
    console.warn('[FCM] getInitialNotification error:', e?.message)
    return null
  }
}