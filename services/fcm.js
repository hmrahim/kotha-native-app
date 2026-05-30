// services/fcm.js — Client-side FCM (React Native / Expo)
import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native'
import messaging from '@react-native-firebase/messaging'
import * as Notifications from 'expo-notifications'
import { PermissionsAndroid, Platform } from 'react-native'
import { getActiveChatUser } from './socket'

// ─── Android Notification Channels ───────────────────────────────────────────
export const setupAndroidChannels = async () => {
  if (Platform.OS !== 'android') return

  // ✅ Android 14+ এ full screen intent permission runtime এ নিতে হয়
  await notifee.requestPermission()
  if (Platform.Version >= 34) {
    try {
      await PermissionsAndroid.request(
        'android.permission.USE_FULL_SCREEN_INTENT'
      )
    } catch (_) {}
  }

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
    sound: 'ringtun',
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
    console.log('[FCM] authStatus:', authStatus)
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL

    if (!enabled) {
      console.warn('[FCM] ❌ Permission NOT granted, authStatus:', authStatus)
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
  try {
    await Notifications.setBadgeCountAsync(0)
  } catch (_) {}
}

// ─── Show Message Notification (Notifee) ─────────────────────────────────────
const showMessageNotification = async (data) => {
  try {
    // chat screen খোলা থাকলে notification দেখাবে না
    const activeChatId = getActiveChatUser()
    if (activeChatId && activeChatId === data?.senderId?.toString()) {
      console.log('[FCM] 🔕 Notification suppressed — chat is active with sender:', data.senderId)
      return
    }
    const notifId = await notifee.displayNotification({
      title: data.senderName || data.title || 'New message',
      body:  data.body       || 'Sent you a message',
      android: {
        channelId:   'messages',
        pressAction: { id: 'default', launchActivity: 'default' },
      },
      data,
    })
    console.log('[FCM] ✅ Notification displayed, id:', notifId)
  } catch (e) {
    console.warn('[FCM] showMessageNotification error:', e?.message)
  }
}

// ─── Background Handler Register ─────────────────────────────────────────────
export const registerBackgroundHandler = () => {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage?.data || {}

    // ✅ incoming_call → index.js handle করে, duplicate এড়াতে skip
    if (data?.type === 'incoming_call') return

    if (data?.type === 'message') {
      await showMessageNotification(data)
    }
  })
}

// ─── Show Call Notification (Notifee) ────────────────────────────────────────
const showCallNotification = async (data) => {
  try {
    await notifee.displayNotification({
      id:    `call_${data.callId}`,
      title: data.callerName || 'Incoming Call',
      body:  data.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call',
      data,
      android: {
        channelId:   'incoming_call',
        importance:  AndroidImportance.HIGH,
        visibility:  AndroidVisibility.PUBLIC,
        category:    'call',

        // ✅ KEY: fullScreenAction → IncomingCallActivity
        // Screen off / lock screen এ এই Activity launch হবে
        // IncomingCallActivity নিজে MainActivity কে সামনে আনবে
        fullScreenAction: {
          id:             'default',
          launchActivity: 'com.kotha.app.IncomingCallActivity',
          // FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_NO_USER_ACTION
          launchActivityFlags: [16777216, 262144],
        },

        // ✅ Notification body tap → IncomingCallActivity
        pressAction: {
          id:             'default',
          launchActivity: 'com.kotha.app.IncomingCallActivity',
          launchActivityFlags: [16777216, 262144],
        },

        actions: [
          {
            title:       '✅ Accept',
            pressAction: {
              id:             'accept',
              launchActivity: 'com.kotha.app.IncomingCallActivity',
              launchActivityFlags: [16777216],
            },
          },
          {
            title:       '❌ Decline',
            pressAction: { id: 'decline' },
          },
        ],

        sound:            'ringtun',         // assets/sound/ringtun.mp3
        vibrationPattern: [100, 1000, 500, 1000],
        lights:           ['#0084FF', 500, 500],
        ongoing:          true,
        autoCancel:       false,
        wakeUpScreen:     true,              // screen জ্বলবে
        showChronometer:  false,
      },
    })
    console.log('[FCM] ✅ Call notification displayed (foreground), callId:', data.callId)
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
  console.log('[FCM] setupForegroundHandler registered')
  const unsubscribe = messaging().onMessage(async (remoteMessage) => {
    console.log('[FCM] 🔔 Foreground message received:', JSON.stringify(remoteMessage?.data))
    const data = remoteMessage?.data || {}

    // App foreground এ call notification দেখাবে না
    // CallContext socket listener নিজেই incoming-call screen এ নিয়ে যায়
    if (data?.type === 'incoming_call') return

    if (data?.type === 'message') {
      console.log('[FCM] 📨 Showing message notification for:', data.senderName)
      await showMessageNotification(data)
    } else {
      console.warn('[FCM] ⚠️ Unknown message type:', data?.type)
    }
  })
  return unsubscribe
}

// ─── Notifee Foreground Event Listeners ──────────────────────────────────────
export const setupNotifeeListeners = ({ onAccept, onDecline, onTap, onDismiss }) => {
  const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail
    const data = notification?.data || {}

    // ✅ Message notification tap → chat screen
    if (type === EventType.PRESS) {
      if (data?.type === 'message') {
        onTap?.(data)
      } else if (data?.type === 'incoming_call') {
        // ✅ Call notification tap (without action button)
        onTap?.(data)
      }
    }

    if (type === EventType.ACTION_PRESS) {
      await notifee.cancelNotification(notification.id)
      if (pressAction?.id === 'accept') {
        onAccept?.(data)
      } else if (pressAction?.id === 'decline') {
        onDecline?.(data)
      }
    }

    // ✅ Notification dismissed (swipe away)
    if (type === EventType.DISMISSED) {
      onDismiss?.(data)
    }
  })
  return unsubscribe
}

// ─── Notification Tap Listeners ───────────────────────────────────────────────
export const setupNotificationListeners = ({ onTap }) => {
  const sub1 = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data
    onTap?.(data)
  })

  return () => {
    sub1.remove()
  }
}

// ─── Initial Notification (App killed থেকে open) ─────────────────────────────
export const getInitialNotification = async () => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default

    // ✅ Call accept check
    const callRaw = await AsyncStorage.getItem('@pendingCallAccept')
    if (callRaw) {
      await AsyncStorage.removeItem('@pendingCallAccept')
      const data = JSON.parse(callRaw)
      console.log('[FCM] ✅ Pending call accept found in AsyncStorage:', data?.callId)
      return { ...data, notifType: 'call_accept' }
    }

    // ✅ Message tap check
    const msgRaw = await AsyncStorage.getItem('@pendingMessageTap')
    if (msgRaw) {
      await AsyncStorage.removeItem('@pendingMessageTap')
      const data = JSON.parse(msgRaw)
      console.log('[FCM] ✅ Pending message tap found in AsyncStorage:', data?.senderId)
      return { ...data, notifType: 'message_tap' }
    }

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