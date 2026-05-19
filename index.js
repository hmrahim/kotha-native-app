// ✅ Expo Router entry — সবার আগে থাকতে হবে
import 'expo-router/entry'

import messaging from '@react-native-firebase/messaging'
import notifee, { EventType } from '@notifee/react-native'
import { Platform } from 'react-native'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.185:5000/api'

if (Platform.OS !== 'web') {

  async function showCallNotification(data) {
    try {
      await notifee.createChannel({
        id: 'incoming_call', name: 'Incoming Calls', importance: 5,
        sound: 'ringtone', vibration: true, vibrationPattern: [0, 1000, 500, 1000],
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
          sound: 'ringtone', vibrationPattern: [0, 1000, 500, 1000],
          lights: true, lightColor: '#0084FF',
          ongoing: true, wakeUpScreen: true, showChronometer: false,
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

  // 1. App killed/background — FCM data message
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage?.data || {}
    if (data?.type === 'incoming_call' && data?.callId) {
      await showCallNotification(data)
    }
  })

  // 2. App killed/background — notification button press
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const { notification, pressAction } = detail
    const data = notification?.data || {}
    if (type === EventType.ACTION_PRESS) {
      await notifee.cancelNotification(notification.id)
      if (pressAction?.id === 'decline' && data?.callId) {
        await rejectCallHttp(data.callId)
      }
    }
    if (type === EventType.DISMISSED && data?.callId) {
      await rejectCallHttp(data.callId)
    }
  })
}