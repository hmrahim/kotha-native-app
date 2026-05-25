import 'expo-router/entry'

import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import messaging from '@react-native-firebase/messaging'

const API_URL = 'http://192.168.100.185:5000/api'

// ─── Channel Setup ────────────────────────────────────────────────────────────
async function setupChannels() {
  await notifee.createChannel({
    id: 'incoming_call',
    name: 'Incoming Calls',
    importance: AndroidImportance.HIGH,
    sound: 'ringtone',
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
          { title: 'Accept',  pressAction: { id: 'accept',  launchActivity: 'default' } },
          { title: 'Decline', pressAction: { id: 'decline' } },
        ],
        sound:            'ringtone',
        vibrationPattern: [100, 1000, 500, 1000],
        lights:           ['#0084FF', 500, 500],
        ongoing:          true,
        autoCancel:       false,
        wakeUpScreen:     true,
        showChronometer:  false,
      },
    })
    console.log('[BG] ✅ Call notification displayed, callId:', data.callId)
  } catch (e) {
    console.warn('[BG] showCallNotification error:', e?.message)
  }
}

// ─── Show Message Notification ────────────────────────────────────────────────
async function showMessageNotification(data, notification = {}) {
  try {
    await notifee.displayNotification({
      title: data.senderName || notification?.title || 'New message',
      body:  data.body       || notification?.body  || 'Sent you a message',
      android: {
        channelId:   'messages',
        pressAction: { id: 'default', launchActivity: 'default' },
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
      JSON.stringify({ ...data, wasAccepted: true })
    )
    console.log('[BG] ✅ Call accept saved, callId:', data?.callId)
  } catch (e) {
    console.warn('[BG] AsyncStorage save error:', e?.message)
  }
}

// ─── 1. FCM Background Handler (App killed / background) ─────────────────────
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const data         = remoteMessage?.data || {}
  const notification = remoteMessage?.notification || {}
  console.log('[BG] FCM background message, type:', data?.type)

  if (data?.type === 'incoming_call' && data?.callId) {
    await showCallNotification(data)
    return
  }

  if (data?.type === 'message') {
    await showMessageNotification(data, notification)
  }
})

// ─── 2. Notifee Background Event (Button press / notification tap) ────────────
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail
  const data = notification?.data || {}
  console.log('[BG] Notifee background event, type:', type, 'action:', pressAction?.id)

  if (type === EventType.PRESS) {
    await notifee.cancelNotification(notification.id)

    if (data?.type === 'incoming_call') {
      await saveCallAccept(data)
      return
    }

    if (data?.type === 'message') {
      await AsyncStorage.setItem(
        '@pendingMessageTap',
        JSON.stringify({ senderId: data.senderId, senderName: data.senderName })
      )
      return
    }
  }

  if (type === EventType.ACTION_PRESS) {
    await notifee.cancelNotification(notification.id)

    if (pressAction?.id === 'accept' && data?.callId) {
      await saveCallAccept(data)
    }

    if (pressAction?.id === 'decline' && data?.callId) {
      await rejectCallHttp(data.callId)
    }
  }
})