// going through /incoming-call again.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'
import { AppState, Platform, View } from 'react-native'

import AnimatedSplash from '../components/AnimatedSplash'
import AppLoader from '../components/AppLoader'
import NetworkBanner from '../components/NetworkBanner'
import ActiveCallBanner from '../components/ActiveCallbanner'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { CallProvider, useCall } from '../context/CallContext'
import { registerFcmToken } from '../services/api'
import '../services/notification'
import { getActiveChatUser, getSocket } from '../services/socket'
import { playIncoming } from '../services/sounds'

let registerForPushNotifications = async () => null
let setupNotificationListeners = () => () => { }
let getInitialNotification = async () => null
let clearBadge = async () => { }
let setupAndroidChannels = async () => { }
let registerBackgroundHandler = () => { }
let setupNotifeeListeners = () => () => { }
let cancelCallNotification = async () => { }
let setupForegroundHandler = () => () => { }

if (Platform.OS !== 'web') {
  try {
    const fcm = require('../services/fcm')
    registerForPushNotifications = fcm.registerForPushNotifications
    setupNotificationListeners = fcm.setupNotificationListeners
    getInitialNotification = fcm.getInitialNotification
    clearBadge = fcm.clearBadge
    setupAndroidChannels = fcm.setupAndroidChannels
    registerBackgroundHandler = fcm.registerBackgroundHandler
    setupNotifeeListeners = fcm.setupNotifeeListeners
    cancelCallNotification = fcm.cancelCallNotification
    setupForegroundHandler = fcm.setupForegroundHandler
  } catch (e) {
    console.warn('[Layout] FCM import failed:', e?.message)
  }
}

SplashScreen.preventAutoHideAsync().catch(() => { })

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000, refetchOnWindowFocus: false } },
})

const BG = '#0D1117'

// ─── Wait for socket then run callback ──────────────────────────────────────
const waitForSocket = (cb, maxRetries = 25, delay = 400) => {
  let attempts = 0
  const tick = () => {
    const socket = getSocket()
    if (socket?.connected) return cb(socket)
    if (attempts++ < maxRetries) setTimeout(tick, delay)
    else { console.warn('[Layout] socket never connected'); cb(getSocket()) }
  }
  setTimeout(tick, 400)
}

// ─── Accept call directly (from notification) ───────────────────────────────
const acceptCallDirect = (router, dispatch, data) => {
  waitForSocket((socket) => {
    if (!socket?.connected || !data?.callId) return
    socket.emit('call:accept', { callId: data.callId }, (response) => {
      if (response?.ok) {
        const { roomId, type, caller } = response
        dispatch?.({
          type: 'INCOMING',
          payload: {
            callId: data.callId,
            roomId,
            type,
            peer: {
              _id: caller?._id || data.callerId || '',
              name: caller?.name || data.callerName || 'User',
              avatar: caller?.avatar || data.callerAvatar || '',
            },
          },
        })
        try {
          router.replace({
            pathname: '/call',
            params: {
              callId: data.callId,
              roomId,
              type,
              peerName: caller?.name || data.callerName || 'User',
              peerAvatar: caller?.avatar || data.callerAvatar || '',
              outgoing: '0',
            },
          })
        } catch (_) { }
      } else {
        console.warn('[Layout] direct accept failed:', response?.error)
      }
    })
  })
}

// ─── Show incoming-call screen from notification data ───────────────────────
const showIncomingScreen = (router, dispatch, data) => {
  if (!data?.callId) return
  dispatch?.({
    type: 'INCOMING',
    payload: {
      callId: data.callId,
      roomId: data.roomId || data.channelName || '',
      type: data.callType || 'voice',
      peer: {
        _id: data.callerId || '',
        name: data.callerName || 'Unknown',
        avatar: data.callerAvatar || '',
      },
    },
  })
  try { router.push({ pathname: '/incoming-call', params: {} }) } catch (_) { }
}

// ─── Navigate from notification data ────────────────────────────────────────
const navigateFromNotification = (router, data, dispatch) => {
  if (!data) return

  // ✅ App killed → call accept (AsyncStorage থেকে)
  if (data?.notifType === 'call_accept' || (data?.wasAccepted && data?.callId)) {
    acceptCallDirect(router, dispatch, data)
    return
  }

  // ✅ App killed → message tap (AsyncStorage থেকে)
  if (data?.notifType === 'message_tap' && data?.senderId) {
    try {
      router.push({
        pathname: '/chat',
        params: { id: data.senderId, name: data.senderName ?? 'Chat', avater: data.senderAvatar ?? '' },
      })
    } catch (_) { }
    return
  }

  if (data?.type === 'incoming_call' && data?.callId) {
    waitForSocket(() => showIncomingScreen(router, dispatch, data))
    return
  }

  if (data?.senderId) {
    try {
      router.push({
        pathname: '/chat',
        params: { id: data.senderId, name: data.senderName ?? 'Chat', avater: data.senderAvatar ?? '' },
      })
    } catch (_) { }
  }
}

function AppNavigator() {
  const { user, mongoUser, loading, emailVerified } = useAuth()
  const { dispatch } = useCall()
  const router = useRouter()
  const segments = useSegments()
  const appState = useRef(AppState.currentState)

  const [nativeSplashHidden, setNativeSplashHidden] = useState(false)
  const [showAnimSplash] = useState(false)

  useEffect(() => {
    SplashScreen.hideAsync().then(() => setNativeSplashHidden(true)).catch(() => setNativeSplashHidden(true))
  }, [])

  useEffect(() => {
    if (!nativeSplashHidden || loading) return
    const inAuth = segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'forgot-password'
    const inVerify = segments[0] === 'verify-email'
    // ✅ Fix: (tab) group-এ থাকলে আবার redirect করো না — double-navigate prevent
    const inTab = segments[0] === '(tab)'

    const t = setTimeout(() => {
      if (!user) {
        if (!inAuth) router.replace('/login')
      } else if (!emailVerified) {
        if (!inVerify) router.replace('/verify-email')
      } else {
        // ✅ inTab হলে আর replace করো না (unnecessary navigation বন্ধ)
        if (inAuth || inVerify || (!inTab && segments.length === 0)) router.replace('/(tab)')
      }
    }, 0)

    return () => clearTimeout(t)
  }, [user, emailVerified, loading, segments, nativeSplashHidden])

  useEffect(() => {
    if (!mongoUser?._id) return
    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) return
      socket.off('receive_message_global_sound')
      socket.on('receive_message_global_sound', ({ senderId }) => {
        if (senderId?.toString() === mongoUser._id?.toString()) return
        const activeChatId = getActiveChatUser()
        if (activeChatId && activeChatId === senderId?.toString()) return
        if (segments[0] !== 'chat') { try { playIncoming() } catch (_) { } }
      })
      clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [mongoUser?._id, segments])

  useEffect(() => {
    if (!mongoUser?._id) return
    const handleGlobalMessage = (msg) => {
      if (msg?.senderId?.toString() === mongoUser._id?.toString()) return
      const activeChatId = getActiveChatUser()
      if (activeChatId && activeChatId === msg?.senderId?.toString()) return
      if (segments[0] !== 'chat') { try { playIncoming() } catch (_) { } }
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

    const init = async () => {
      try {
        await setupAndroidChannels()
        const fcmToken = await registerForPushNotifications().catch(() => null)
        if (fcmToken) {
          try { await registerFcmToken(fcmToken) }
          catch (e) { console.warn('[Layout] registerFcmToken err:', e?.message) }
        }
      } catch (err) {
        console.log('[Layout] Notification init error:', err?.message)
      }
    }
    init()

    // Killed-state notification check (incl. AsyncStorage pending accept)
    const checkInitial = async () => {
      const data = await getInitialNotification()
      if (data) navigateFromNotification(router, data, dispatch)
    }
    checkInitial()

    const unsubNotif = setupNotificationListeners({
      onTap: (data) => navigateFromNotification(router, data, dispatch),
    })

    const unsubForeground = setupForegroundHandler()

    const unsubNotifee = setupNotifeeListeners({
      // ✅ Foreground message notification tap → chat screen
      onTap: (data) => navigateFromNotification(router, data, dispatch),
      onAccept: (data) => {
        cancelCallNotification(data?.callId)
        if (!data?.callId) return
        acceptCallDirect(router, dispatch, data)
      },
      onDecline: (data) => {
        cancelCallNotification(data?.callId)
        const socket = getSocket()
        if (socket?.connected && data?.callId) {
          socket.emit('call:reject', { callId: data.callId })
        }
      },
      onDismiss: (data) => {
        if (data?.callId) {
          cancelCallNotification(data.callId)
          const socket = getSocket()
          if (socket?.connected) socket.emit('call:reject', { callId: data.callId })
        }
      },
    })

    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') clearBadge()
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
        <AnimatedSplash onDone={() => { }} />
      </>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" backgroundColor={BG} />
      <NetworkBanner />
      {/* ✅ Messenger-style active call banner — call চলার সময় অন্য screen এ গেলে দেখাবে */}

      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG }, animation: 'none', animationDuration: 150 }}>
        <Stack.Screen name="(tab)" options={{ animation: 'none' }} />
        <Stack.Screen name="login" options={{ animation: 'fade', animationDuration: 200 }} />
        <Stack.Screen name="register" options={{ animation: 'slide_from_bottom', animationDuration: 250 }} />
        <Stack.Screen name="verify-email" options={{ animation: 'fade', animationDuration: 200 }} />
        <Stack.Screen name="forgot-password" options={{ animation: 'slide_from_bottom', animationDuration: 220, gestureEnabled: true }} />
        <Stack.Screen name="chat" options={{ animation: 'slide_from_right', animationDuration: 200, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_right', animationDuration: 200, gestureEnabled: true }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right', animationDuration: 200, gestureEnabled: true }} />
        <Stack.Screen name="developer" options={{ animation: 'slide_from_right', animationDuration: 200, gestureEnabled: true }} />
        <Stack.Screen name="change-password" options={{ animation: 'slide_from_right', animationDuration: 200, gestureEnabled: true }} />
        <Stack.Screen name="call" options={{ animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: '#000' }, gestureEnabled: false }} />
        <Stack.Screen name="incoming-call" options={{ animation: 'fade', animationDuration: 200, gestureEnabled: false }} />
        <Stack.Screen name="add-user" options={{ animation: 'slide_from_bottom', animationDuration: 220, gestureEnabled: true }} />
        <Stack.Screen name="message-requests" options={{ animation: 'slide_from_right', animationDuration: 200, gestureEnabled: true }} />
      </Stack>
      <ActiveCallBanner />
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