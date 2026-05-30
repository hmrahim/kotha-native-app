import 'expo-router/entry'

import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import messaging from '@react-native-firebase/messaging'

// ⚠️ IMPORTANT: এই file টা app killed/background state এ headless JS হিসেবে run হয়।
// এখানে কোনো React component বা context use করা যাবে না।
// শুধু raw JS — AsyncStorage, fetch, notifee।

const API_URL = 'https://kotha-server-c5wy.onrender.com/api'

// ─── Channel Setup ────────────────────────────────────────────────────────────
async function setupChannels() {
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
  await notifee.createChannel({
    id: 'messages',
    name: 'Messages',
    importance: AndroidImportance.HIGH,
    sound: 'received',
    vibration: true,
    vibrationPattern: [100, 250, 100, 250],
  })
}
setupChannels()

// ─── Show Call Notification ───────────────────────────────────────────────────
// ✅ Screen off / lock screen / যেকোনো app এর উপরে call screen দেখাবে
async function showCallNotification(data) {
  try {
    // ✅ FIX: launchActivityFlags must be a single integer bitmask, NOT an array
    // Notifee v9+ এ array format কাজ করে না properly
    // FLAG_ACTIVITY_NEW_TASK (0x10000000) = 268435456
    // FLAG_ACTIVITY_SINGLE_TOP (0x20000000) = 536870912
    // FLAG_ACTIVITY_CLEAR_TOP (0x04000000) = 67108864
    // Combined: 268435456 | 536870912 | 67108864 = 872415232
    const LAUNCH_FLAGS = 268435456 | 536870912 | 67108864

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

        // ✅ KEY: Screen off/lock screen → IncomingCallActivity launch হবে
        // IncomingCallActivity.java: setShowWhenLocked + setTurnScreenOn করে
        // তারপর MainActivity কে foreground এ এনে incoming-call route খোলে
        fullScreenAction: {
          id:             'default',
          launchActivity: 'com.kotha.app.IncomingCallActivity',
          launchActivityFlags: LAUNCH_FLAGS,
        },

        // ✅ Notification body tap → IncomingCallActivity
        pressAction: {
          id:             'default',
          launchActivity: 'com.kotha.app.IncomingCallActivity',
          launchActivityFlags: LAUNCH_FLAGS,
        },

        actions: [
          {
            title:       '✅ Accept',
            pressAction: {
              id:             'accept',
              launchActivity: 'com.kotha.app.IncomingCallActivity',
              launchActivityFlags: 268435456 | 536870912,
            },
          },
          {
            title:       '❌ Decline',
            pressAction: { id: 'decline' },
          },
        ],

        sound:            'ringtun',
        vibrationPattern: [100, 1000, 500, 1000],
        lights:           ['#0084FF', 500, 500],
        ongoing:          true,
        autoCancel:       false,
        wakeUpScreen:     true,   // ✅ screen জ্বলবে
        showChronometer:  false,
        asForegroundService: false,
      },
    })
    console.log('[BG] ✅ Call notification displayed (bg/killed), callId:', data.callId)
  } catch (e) {
    console.warn('[BG] showCallNotification error:', e?.message)
  }
}

// ─── Show Message Notification ────────────────────────────────────────────────
async function showMessageNotification(data) {
  try {
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
  } catch (e) {
    console.warn('[BG] showMessageNotification error:', e?.message)
  }
}

// ─── Reject Call via HTTP ─────────────────────────────────────────────────────
async function rejectCallHttp(callId) {
  try {
    await fetch(`${API_URL}/calls/${callId}/reject`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ callId }),
    })
    console.log('[BG] ✅ Call rejected via HTTP, callId:', callId)
  } catch (e) {
    console.warn('[BG] rejectCallHttp error:', e?.message)
  }
}

// ─── Save Accept to AsyncStorage ──────────────────────────────────────────────
async function saveCallAccept(data) {
  try {
    await AsyncStorage.setItem(
      '@pendingCallAccept',
      JSON.stringify({ ...data, wasAccepted: true, _savedAt: Date.now() })
    )
    console.log('[BG] ✅ Call accept saved, callId:', data?.callId)
  } catch (e) {
    console.warn('[BG] AsyncStorage save error:', e?.message)
  }
}

// ─── 1. FCM Background/Killed Handler ────────────────────────────────────────
// ✅ KEY: Server থেকে DATA-ONLY payload পাঠাতে হবে
//   { data: { type, ... } }           ← ✅ সঠিক (handler fire হয়)
//   { notification: {...}, data: {} } ← ❌ ভুল (Android নিজে handle করে, handler fire হয় না)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const data = remoteMessage?.data || {}
  console.log('[BG] FCM background/killed message received, type:', data?.type)

  if (data?.type === 'incoming_call' && data?.callId) {
    // ✅ Notification দেখাও
    await showCallNotification(data)
    // ✅ AsyncStorage তে save করো — app boot হলে getInitialNotification() পড়বে
    await AsyncStorage.setItem(
      '@pendingIncomingCall',
      JSON.stringify({ ...data, _savedAt: Date.now() })
    )
    return
  }

  // ✅ Call cancel/end FCM — pending clear করো
  if (data?.type === 'call_ended' || data?.type === 'call_cancelled') {
    await AsyncStorage.removeItem('@pendingIncomingCall')
    if (data?.callId) {
      try { await notifee.cancelNotification(`call_${data.callId}`) } catch (_) {}
    }
    return
  }

  if (data?.type === 'message') {
    await showMessageNotification(data)
    return
  }

  console.warn('[BG] Unknown FCM type:', data?.type)
})

// ─── 2. Notifee Background Event ─────────────────────────────────────────────
// App killed/background এ notification button press handle করে
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail
  const data = notification?.data || {}
  console.log('[BG] Notifee background event, type:', type, 'action:', pressAction?.id)

  // Notification body tap
  if (type === EventType.PRESS) {
    await notifee.cancelNotification(notification.id)

    if (data?.type === 'incoming_call') {
      // ✅ Notification body tap = incoming-call SCREEN দেখাও (auto-accept না!)
      await AsyncStorage.setItem(
        '@pendingIncomingCall',
        JSON.stringify({ ...data, _savedAt: Date.now() })
      )
      return
    }

    if (data?.type === 'message') {
      try {
        await AsyncStorage.setItem(
          '@pendingMessageTap',
          JSON.stringify({
            senderId:     data.senderId,
            senderName:   data.senderName,
            senderAvatar: data.senderAvatar || '',
          })
        )
      } catch (_) {}
      return
    }
  }

  // Action button press (Accept / Decline)
  if (type === EventType.ACTION_PRESS) {
    await notifee.cancelNotification(notification.id)

    if (pressAction?.id === 'accept' && data?.callId) {
      await AsyncStorage.removeItem('@pendingIncomingCall')
      await saveCallAccept(data)
    }

    if (pressAction?.id === 'decline' && data?.callId) {
      await AsyncStorage.removeItem('@pendingIncomingCall')
      await rejectCallHttp(data.callId)
    }
  }

  // Notification dismissed (swipe away)
  if (type === EventType.DISMISSED) {
    if (data?.type === 'incoming_call' && data?.callId) {
      await AsyncStorage.removeItem('@pendingIncomingCall')
      await rejectCallHttp(data.callId)
    }
  }
})
