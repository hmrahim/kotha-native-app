// services/fcm.js — Foreground/Active state FCM handler
// App killed/background এ index.js এর handlers কাজ করে।
// এই file শুধু foreground (app open) state এ কাজ করে।

import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native'
import messaging from '@react-native-firebase/messaging'
import * as Notifications from 'expo-notifications'
import { PermissionsAndroid, Platform } from 'react-native'
import { getActiveChatUser } from './socket'

// ─── Android Notification Channels ───────────────────────────────────────────
export const setupAndroidChannels = async () => {
  if (Platform.OS !== 'android') return

  await notifee.requestPermission()

  // Android 14+ এ full screen intent runtime permission
  if (Platform.Version >= 34) {
    try {
      await PermissionsAndroid.request('android.permission.USE_FULL_SCREEN_INTENT')
    } catch (_) {}
  }

  // ✅ FIX: sound নাম = actual file নাম WITHOUT extension
  // ringtun.mp3 → 'ringtun' (আগে ভুলে 'ringtone' লেখা ছিল)
  await notifee.createChannel({
    id: 'messages',
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    sound: 'received',
    vibration: true,
    vibrationPattern: [100, 250, 100, 250],
  })
  await notifee.createChannel({
    id: 'incoming_call',
    name: 'Incoming Calls',
    importance: AndroidImportance.HIGH,
    sound: 'ringtun',       // ✅ FIX: 'ringtone' → 'ringtun'
    vibration: true,
    vibrationPattern: [100, 1000, 500, 1000],
    bypassDnd: true,
    lights: true,
    lightColor: '#0084FF',
  })
  console.log('[FCM] ✅ Android channels created')
}

// ─── FCM Token Register ───────────────────────────────────────────────────────
export const registerForPushNotifications = async () => {
  try {
    const authStatus = await messaging().requestPermission()
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL

    if (!enabled) {
      console.warn('[FCM] ❌ Permission NOT granted')
      return null
    }

    const token = await messaging().getToken()
    console.log('[FCM] ✅ Token:', token ? token.slice(0, 30) + '...' : 'NULL')
    return token
  } catch (e) {
    console.warn('[FCM] registerForPushNotifications error:', e?.message)
    return null
  }
}

// ─── Badge Clear ──────────────────────────────────────────────────────────────
export const clearBadge = async () => {
  try { await Notifications.setBadgeCountAsync(0) } catch (_) {}
}

// ─── Show Message Notification ────────────────────────────────────────────────
const showMessageNotification = async (data) => {
  try {
    const activeChatId = getActiveChatUser()
    if (activeChatId && activeChatId === data?.senderId?.toString()) {
      console.log('[FCM] 🔕 Suppressed — chat active with sender')
      return
    }
    await notifee.displayNotification({
      title: data.senderName || data.title || 'New message',
      body:  data.body       || 'Sent you a message',
      android: {
        channelId:   'messages',
        sound:       'received',
        pressAction: { id: 'default', launchActivity: 'default' },
        importance:  AndroidImportance.HIGH,
      },
      data,
    })
    console.log('[FCM] ✅ Message notification displayed')
  } catch (e) {
    console.warn('[FCM] showMessageNotification error:', e?.message)
  }
}

// ─── Show Call Notification ───────────────────────────────────────────────────
const showCallNotification = async (data) => {
  try {
    await notifee.displayNotification({
      id:    `call_${data.callId}`,
      title: data.callerName || 'Incoming Call',
      body:  data.callType === 'video' ? 'Incoming video call' : 'Incoming voice call',
      data,
      android: {
        channelId:        'incoming_call',
        importance:       AndroidImportance.HIGH,
        visibility:       AndroidVisibility.PUBLIC,
        category:         'call',
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction:      { id: 'default', launchActivity: 'default' },
        actions: [
          { title: '✅ Accept',  pressAction: { id: 'accept',  launchActivity: 'default' } },
          { title: '❌ Decline', pressAction: { id: 'decline' } },
        ],
        sound:            'ringtun',    // ✅ FIX
        vibrationPattern: [100, 1000, 500, 1000],
        lights:           ['#0084FF', 500, 500],
        ongoing:          true,
        autoCancel:       false,
        wakeUpScreen:     true,
        showChronometer:  false,
      },
    })
  } catch (e) {
    console.warn('[FCM] showCallNotification error:', e?.message)
  }
}

// ─── Cancel Call Notification ─────────────────────────────────────────────────
export const cancelCallNotification = async (callId) => {
  try { await notifee.cancelNotification(`call_${callId}`) } catch (_) {}
}

// ─── Background Handler (Foreground এ duplicate এড়াতে এখানে no-op) ──────────
// ✅ FIX: index.js এ setBackgroundMessageHandler define করা আছে।
// এখানে আবার define করলে দুটো handler conflict করে।
// তাই এই function টা শুধু log করে — কিছু করে না।
export const registerBackgroundHandler = () => {
  console.log('[FCM] registerBackgroundHandler — handled in index.js')
}

// ─── Foreground FCM Handler ───────────────────────────────────────────────────
// App foreground এ থাকলে FCM message এখানে আসে
export const setupForegroundHandler = () => {
  const unsubscribe = messaging().onMessage(async (remoteMessage) => {
    console.log('[FCM] 🔔 Foreground message:', JSON.stringify(remoteMessage?.data))
    const data = remoteMessage?.data || {}

    // Foreground এ call notification দেখাবে না।
    // CallContext socket listener incoming-call screen এ নিয়ে যায়।
    if (data?.type === 'incoming_call') return

    if (data?.type === 'message') {
      await showMessageNotification(data)
    }
  })
  return unsubscribe
}

// ─── Notifee Foreground Event Listeners ──────────────────────────────────────
export const setupNotifeeListeners = ({ onAccept, onDecline, onTap }) => {
  const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail
    const data = notification?.data || {}

    if (type === EventType.PRESS) {
      await notifee.cancelNotification(notification.id)
      if (data?.type === 'message') onTap?.(data)
      if (data?.type === 'incoming_call') onAccept?.(data)
    }

    if (type === EventType.ACTION_PRESS) {
      await notifee.cancelNotification(notification.id)
      if (pressAction?.id === 'accept')  onAccept?.(data)
      if (pressAction?.id === 'decline') onDecline?.(data)
    }

    if (type === EventType.DISMISSED) {
      if (data?.type === 'incoming_call') onDecline?.(data)
    }
  })
  return unsubscribe
}

// ─── Notification Tap (expo-notifications fallback) ───────────────────────────
export const setupNotificationListeners = ({ onTap }) => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data
    onTap?.(data)
  })
  return () => sub.remove()
}

// ─── Initial Notification (App killed থেকে open) ─────────────────────────────
export const getInitialNotification = async () => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default

    // ✅ App killed এ call accept button চাপলে এখানে থাকবে
    const callRaw = await AsyncStorage.getItem('@pendingCallAccept')
    if (callRaw) {
      await AsyncStorage.removeItem('@pendingCallAccept')
      const data = JSON.parse(callRaw)
      console.log('[FCM] ✅ Pending call accept:', data?.callId)
      return { ...data, notifType: 'call_accept' }
    }

    // ✅ App killed এ message notification tap করলে এখানে থাকবে
    const msgRaw = await AsyncStorage.getItem('@pendingMessageTap')
    if (msgRaw) {
      await AsyncStorage.removeItem('@pendingMessageTap')
      const data = JSON.parse(msgRaw)
      console.log('[FCM] ✅ Pending message tap:', data?.senderId)
      return { ...data, notifType: 'message_tap' }
    }

    // Notifee initial notification (notification tap করে app open)
    const initial = await notifee.getInitialNotification()
    if (initial?.notification?.data) {
      console.log('[FCM] ✅ Notifee initial notification found')
      return initial.notification.data
    }

    // FCM initial notification (FCM tap করে app open)
    const remoteMessage = await messaging().getInitialNotification()
    if (remoteMessage?.data) {
      console.log('[FCM] ✅ FCM initial notification found')
      return remoteMessage.data
    }

    return null
  } catch (e) {
    console.warn('[FCM] getInitialNotification error:', e?.message)
    return null
  }
}