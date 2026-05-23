
import 'expo-router/entry'

import notifee, { EventType } from '@notifee/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import messaging from '@react-native-firebase/messaging'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.185:5000/api'

async function showCallNotification(data) {
  try {
    await notifee.createChannel({
      id: 'incoming_call', name: 'Incoming Calls', importance: 5,
      sound: 'ringtone', vibration: true, vibrationPattern: [100, 1000, 500, 1000],
      bypassDnd: true, lights: true, lightColor: '#0084FF',
    })
    await notifee.displayNotification({
      id:    `call_${data.callId}`,
      title: data.callerName || 'Incoming Call',
      body:  data.callType === 'video' ? 'Incoming video call' : 'Incoming voice call',
      data,
      android: {
        channelId: 'incoming_call', importance: 5,
        category: 'call', visibility: 1,
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction:      { id: 'default', launchActivity: 'default' },
        actions: [
          { title: 'Accept',  pressAction: { id: 'accept',  launchActivity: 'default' } },
          { title: 'Decline', pressAction: { id: 'decline' } },
        ],
        sound: 'ringtone', vibrationPattern: [100, 1000, 500, 1000],
        lights: ['#0084FF', 500, 500],
        // ✅ ongoing: true — notification stays in tray until call ends
        ongoing: true, wakeUpScreen: true, showChronometer: false,
        // ✅ FIX: do not auto-dismiss the call notification
        autoCancel: false,
      },
    })
  } catch (e) {
    console.warn('[BG] showCallNotification:', e?.message)
  }
}

async function rejectCallHttp(callId) {
  try {
    await fetch(`${API_URL}/calls/${callId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    })
  } catch (_) {}
}

async function showMessageNotification(data, notification) {
  try {
    await notifee.createChannel({
      id: 'messages', name: 'Messages', importance: 5,
      sound: 'received', vibration: true,
    })
    await notifee.displayNotification({
      title: data.senderName || notification?.title || 'New message',
      body:  data.body       || notification?.body  || 'Sent you a message',
      android: { channelId: 'messages', pressAction: { id: 'default', launchActivity: 'default' } },
      data,
    })
  } catch (e) {
    console.warn('[BG] showMessageNotification:', e?.message)
  }
}

// 1. App killed/background — FCM data message
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const data         = remoteMessage?.data || {}
  const notification = remoteMessage?.notification || {}

  if (data?.type === 'incoming_call' && data?.callId) {
    await showCallNotification(data)
    return
  }
  if (data?.type === 'message') {
    await showMessageNotification(data, notification)
  }
})

// 2. App killed/background — notification button press
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail
  const data = notification?.data || {}

  if (type === EventType.ACTION_PRESS) {
    await notifee.cancelNotification(notification.id)

    if (pressAction?.id === 'accept' && data?.callId) {
      try {
        // ✅ Flag this as accepted so _layout can auto-accept on launch
        await AsyncStorage.setItem(
          '@pendingCallAccept',
          JSON.stringify({ ...data, wasAccepted: true })
        )
        console.log('[BG] ✅ Call accept saved:', data?.callId)
      } catch (e) {
        console.warn('[BG] AsyncStorage save error:', e?.message)
      }
    }

    if (pressAction?.id === 'decline' && data?.callId) {
      await rejectCallHttp(data.callId)
    }
  }
})
