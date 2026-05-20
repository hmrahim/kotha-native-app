// app/_layout.js
import React, { useEffect, useRef, useState } from 'react'
import { AppState, Platform, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'

import { AuthProvider, useAuth } from '../context/AuthContext'
import AnimatedSplash from '../components/AnimatedSplash'
import AppLoader from '../components/AppLoader'
import NetworkBanner from '../components/NetworkBanner'
import { getSocket } from '../services/socket'
import { playIncoming } from '../services/sounds'
import { registerFcmToken } from '../services/api'
import '../services/notification'  // ✅ setNotificationHandler — foreground এ notification দেখানোর জন্য
import { CallProvider, useCall } from '../context/CallContext'

// ─── Native-only modules safely import করো ────────────────────────────────
let registerForPushNotifications  = async () => null
let setupNotificationListeners    = () => () => {}
let getInitialNotification        = async () => null
let clearBadge                    = async () => {}
let setupAndroidChannels          = async () => {}
let registerBackgroundHandler     = () => {}
let setupNotifeeListeners         = () => () => {}
let cancelCallNotification        = async () => {}
let setupForegroundHandler        = () => () => {}

if (Platform.OS !== 'web') {
  try {
    const fcm = require('../services/fcm')
    registerForPushNotifications = fcm.registerForPushNotifications
    setupNotificationListeners   = fcm.setupNotificationListeners
    getInitialNotification       = fcm.getInitialNotification
    clearBadge                   = fcm.clearBadge
    setupAndroidChannels         = fcm.setupAndroidChannels
    registerBackgroundHandler    = fcm.registerBackgroundHandler
    setupNotifeeListeners        = fcm.setupNotifeeListeners
    cancelCallNotification       = fcm.cancelCallNotification
    setupForegroundHandler       = fcm.setupForegroundHandler
  } catch (e) {
    console.warn('[Layout] FCM import failed:', e?.message)
  }
}

// Background handler নিচে useEffect এ register হবে

SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

const BG = '#0D1117'

const navigateFromNotification = (router, data, dispatch) => {
  if (!data) return

  // ✅ Incoming call notification tap — incoming-call screen এ যাও
  if (data?.type === 'incoming_call' && data?.callId) {
    // CallContext এ INCOMING dispatch করো
    dispatch?.({
      type: 'INCOMING',
      payload: {
        callId:      data.callId,
        channelName: data.channelName || '',
        type:        data.callType    || 'voice',
        token:       null,
        uid:         null,
        appId:       null,
        peer: {
          _id:    data.callerId    || '',
          name:   data.callerName  || 'Unknown',
          avatar: data.callerAvatar || '',
        },
      },
    })
    router.push({ pathname: '/incoming-call', params: {} })
    return
  }

  // Regular message notification tap
  if (data?.senderId) {
    router.push({
      pathname: '/chat',
      params: {
        id:     data.senderId,
        name:   data.senderName   ?? 'Chat',
        avater: data.senderAvatar ?? '',
      },
    })
  }
}

function AppNavigator() {
  const { user, mongoUser, loading, emailVerified } = useAuth()
  const { dispatch }  = useCall()
  const router        = useRouter()
  const segments      = useSegments()
  const appState      = useRef(AppState.currentState)

  const [nativeSplashHidden, setNativeSplashHidden] = useState(false)
  const [showAnimSplash]                            = useState(false)

  useEffect(() => {
    SplashScreen.hideAsync()
      .then(() => setNativeSplashHidden(true))
      .catch(() => setNativeSplashHidden(true))
  }, [])

  // Auth guard
  useEffect(() => {
    if (!nativeSplashHidden || loading) return
    const inAuth   = segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'forgot-password'
    const inVerify = segments[0] === 'verify-email'

    if (!user) {
      if (!inAuth) router.replace('/login')
    } else if (!emailVerified) {
      if (!inVerify) router.replace('/verify-email')
    } else {
      if (inAuth || inVerify || segments.length === 0) router.replace('/(tab)')
    }
  }, [user, emailVerified, loading, segments, nativeSplashHidden])

  // Global socket sound listener
  useEffect(() => {
    if (!mongoUser?._id) return

    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) return

      socket.off('receive_message_global_sound')
      socket.on('receive_message_global_sound', ({ senderId }) => {
        if (senderId?.toString() === mongoUser._id?.toString()) return
        if (segments[0] !== 'chat') {
          try { playIncoming() } catch (_) {}
        }
      })

      clearInterval(interval)
    }, 1000)

    return () => clearInterval(interval)
  }, [mongoUser?._id, segments])

  useEffect(() => {
    if (!mongoUser?._id) return

    const handleGlobalMessage = (msg) => {
      if (msg?.senderId?.toString() === mongoUser._id?.toString()) return
      if (segments[0] !== 'chat') {
        try { playIncoming() } catch (_) {}
      }
    }

    const timer = setTimeout(() => {
      const socket = getSocket()
      if (!socket) return
      socket.off('receive_message', handleGlobalMessage)
      socket.on('receive_message', handleGlobalMessage)
    }, 1500)

    return () => {
      clearTimeout(timer)
      const socket = getSocket()
      socket?.off('receive_message', handleGlobalMessage)
    }
  }, [mongoUser?._id])

  // ✅ Notification + FCM setup
  useEffect(() => {
    if (!mongoUser?._id || Platform.OS === 'web') return

    // ⚠️ Background handler index.js এ register হয় (React mount এর আগে)
    // এখানে call করলে killed state এ কাজ করে না — তাই remove করা হয়েছে

    const init = async () => {
      try {
        // ✅ Android notification channels — call channel সহ
        await setupAndroidChannels()

        // ✅ FCM token register করো এবং server এ save করো
        const fcmToken = await registerForPushNotifications().catch(() => null)
        console.log('[Layout] fcmToken received:', fcmToken ? 'YES' : 'NULL')
        if (fcmToken) {
          try {
            await registerFcmToken(fcmToken)
            console.log('[Layout] ✅ FCM token saved to server successfully')
          } catch (e) {
            console.warn('[Layout] ❌ registerFcmToken FAILED:', e?.message)
          }
        } else {
          console.warn('[Layout] ❌ No FCM token — notification will NOT work')
        }
        console.log('[Layout] ✅ FCM setup complete')
      } catch (err) {
        console.log('[Layout] Notification init error:', err?.message)
      }
    }
    init()

    // ✅ Killed state থেকে notification tap করে app খোলা
    const checkInitial = async () => {
      const data = await getInitialNotification()
      if (data) {
        setTimeout(() => navigateFromNotification(router, data, dispatch), 800)
      }
    }
    checkInitial()

    // ✅ Background → foreground notification tap
    const unsubNotif = setupNotificationListeners({
      onTap: (data) => navigateFromNotification(router, data, dispatch),
    })

    // ✅ Foreground FCM handler — message + call দুটোই handle করে
    // setupForegroundHandler নিজেই notifee দিয়ে notification দেখায়
    const unsubForeground = setupForegroundHandler()

    // ✅ Notifee Accept/Decline button press (notification এ)
    const unsubNotifee = setupNotifeeListeners({
      onAccept: (data) => {
        cancelCallNotification(data?.callId)
        // Socket দিয়ে accept করো
        const socket = getSocket()
        if (socket && data?.callId) {
          dispatch({
            type: 'INCOMING',
            payload: {
              callId:      data.callId,
              channelName: data.channelName || '',
              type:        data.callType    || 'voice',
              token:       null,
              uid:         null,
              appId:       null,
              peer: {
                _id:    data.callerId    || '',
                name:   data.callerName  || 'Unknown',
                avatar: data.callerAvatar || '',
              },
            },
          })
          router.push({ pathname: '/incoming-call', params: {} })
        }
      },
      onDecline: (data) => {
        cancelCallNotification(data?.callId)
        const socket = getSocket()
        if (socket && data?.callId) {
          socket.emit('call:reject', { callId: data.callId })
        }
      },
    })

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        clearBadge()
      }
      appState.current = next
    })

    return () => {
      unsubNotif?.()
      unsubForeground?.()
      unsubNotifee?.()
      sub.remove()
    }
  }, [mongoUser?._id])

  if (!nativeSplashHidden || loading) {
    return (
      <>
        <StatusBar style="light" backgroundColor={BG} />
        <AppLoader />
      </>
    )
  }

  if (showAnimSplash) {
    return (
      <>
        <StatusBar style="light" backgroundColor={BG} />
        <AnimatedSplash onDone={() => {}} />
      </>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" backgroundColor={BG} />
      <NetworkBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: BG },
          animation: 'none',
          animationDuration: 150,
        }}
      >
        <Stack.Screen name="(tab)"            options={{ animation: 'none', animationDuration: 150, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="login"            options={{ animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="register"         options={{ animation: 'slide_from_bottom', animationDuration: 250, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="verify-email"     options={{ animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="forgot-password"  options={{ animation: 'slide_from_bottom', animationDuration: 220, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="chat"             options={{ animation: 'slide_from_right', animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <Stack.Screen name="profile"          options={{ animation: 'slide_from_right', animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="settings"         options={{ animation: 'slide_from_right', animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="developer"        options={{ animation: 'slide_from_right', animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="change-password"  options={{ animation: 'slide_from_right', animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="call"             options={{ animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: '#000' }, gestureEnabled: false }} />
        <Stack.Screen name="incoming-call"    options={{ animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: '#0D1117' }, gestureEnabled: false }} />
        <Stack.Screen name="add-user"         options={{ animation: 'slide_from_bottom', animationDuration: 220, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="message-requests" options={{ animation: 'slide_from_right', animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
      </Stack>
    </View>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CallProvider>
          <AppNavigator />
        </CallProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}