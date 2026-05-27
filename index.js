import 'expo-router/entry'

import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import messaging from '@react-native-firebase/messaging'

// ⚠️ IMPORTANT: এই file টা app killed/background state এ headless JS হিসেবে run হয়।
// এখানে কোনো React component বা context use করা যাবে না।
// শুধু raw JS — AsyncStorage, fetch, notifee।

const API_URL = 'https://kotha-server-c5wy.onrender.com/api'

// ─── Channel Setup ────────────────────────────────────────────────────────────
// App killed state এও channel exist করা দরকার।
// sound নাম = asset file নাম WITHOUT extension (Android নিজেই খোঁজে)
// ringtun.mp3 → 'ringtun', received.mp3 → 'received'
async function setupChannels() {
  await notifee.createChannel({
    id: 'incoming_call',
    name: 'Incoming Calls',
    importance: AndroidImportance.HIGH,
    sound: 'ringtun',          // ✅ FIX: 'ringtone' → 'ringtun' (actual filename)
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
    sound: 'received',         // ✅ received.mp3 → 'received'
    vibration: true,
    vibrationPattern: [100, 250, 100, 250],
  })
}
setupChannels()

// ─── Show Call Notification ───────────────────────────────────────────────────
async function showCallNotification(data) {
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
          { title: ' Accept',  pressAction: { id: 'accept',  launchActivity: 'default' } },
          { title: ' Decline', pressAction: { id: 'decline' } },
        ],
        sound:            'ringtun',    // ✅ FIX: actual filename
        vibrationPattern: [100, 1000, 500, 1000],
        lights:           ['#0084FF', 500, 500],
        ongoing:          true,
        autoCancel:       false,
        wakeUpScreen:     true,
        showChronometer:  false,
        asForegroundService: false,
      },
    })
    console.log('[BG] ✅ Call notification displayed, callId:', data.callId)
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
        sound:       'received',   // ✅ explicit sound
        pressAction: { id: 'default', launchActivity: 'default' },
        importance:  AndroidImportance.HIGH,
      },
      data,
    })
    console.log('[BG] ✅ Message notification displayed')
  } catch (e) {
    console.warn('[BG] showMessageNotification error:', e?.message)
  }
}

// ─── Reject Call via HTTP ─────────────────────────────────────────────────────
async function rejectCallHttp(callId) {
  try {
    // ✅ Auth token ছাড়াই reject করতে পারবে (server এ এই endpoint open রাখো)
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
      JSON.stringify({ ...data, wasAccepted: true })
    )
    console.log('[BG] ✅ Call accept saved, callId:', data?.callId)
  } catch (e) {
    console.warn('[BG] AsyncStorage save error:', e?.message)
  }
}

// ─── 1. FCM Background/Killed Handler ────────────────────────────────────────
// ✅ KEY FIX: এই handler শুধু কাজ করবে যদি FCM payload DATA-ONLY হয়।
// Server থেকে পাঠাতে হবে:
//   { data: { type, ... } }           ← ✅ সঠিক (data-only)
//   { notification: {...}, data: {} } ← ❌ ভুল (Android নিজে handle করে, handler fire হয় না)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const data = remoteMessage?.data || {}
  console.log('[BG] FCM background/killed message received, type:', data?.type)

  if (data?.type === 'incoming_call' && data?.callId) {
    await showCallNotification(data)
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

  // Notification এ tap (body press)
  if (type === EventType.PRESS) {
    await notifee.cancelNotification(notification.id)

    if (data?.type === 'incoming_call') {
      // Call notification tap = accept হিসেবে ধরো
      await saveCallAccept(data)
      return
    }

    if (data?.type === 'message') {
      try {
        await AsyncStorage.setItem(
          '@pendingMessageTap',
          JSON.stringify({
            senderId:   data.senderId,
            senderName: data.senderName,
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
      await saveCallAccept(data)
    }

    if (pressAction?.id === 'decline' && data?.callId) {
      await rejectCallHttp(data.callId)
    }
  }

  // Notification dismissed (swipe away)
  if (type === EventType.DISMISSED) {
    if (data?.type === 'incoming_call' && data?.callId) {
      await rejectCallHttp(data.callId)
    }
  }
})