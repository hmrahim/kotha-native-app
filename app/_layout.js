import React, { useEffect, useRef, useState } from 'react'
import { AppState, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'

import { AuthProvider, useAuth } from '../context/AuthContext'
import AnimatedSplash from '../components/AnimatedSplash'
import AppLoader from '../components/AppLoader'
import NetworkBanner from '../components/NetworkBanner'
import {
  registerForPushNotifications,
  setupNotificationListeners,
  getInitialNotification,
  clearBadge,
} from '../services/fcm'
import { setupAndroidChannel } from '../services/notification'
import { getSocket } from '../services/socket'
import { playIncoming } from '../services/sounds'

SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

const BG = '#0D1117'

// ─── Notification tap হলে chat screen এ যাবে ─────────────────────────────────
const navigateFromNotification = (router, data) => {
  if (!data) return
  if (data?.senderId) {
    router.push({
      pathname: '/chat',
      params: {
        id: data.senderId,
        name: data.senderName ?? 'Chat',
        avater: data.senderAvatar ?? '',
      },
    })
  }
}

function AppNavigator() {
  const { user, mongoUser, loading, emailVerified } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const appState = useRef(AppState.currentState)

  const [nativeSplashHidden, setNativeSplashHidden] = useState(false)
  const [showAnimSplash] = useState(false)

  const currentChatId = useRef(null)

  useEffect(() => {
    SplashScreen.hideAsync()
      .then(() => setNativeSplashHidden(true))
      .catch(() => setNativeSplashHidden(true))
  }, [])

  // Auth guard
  useEffect(() => {
    if (!nativeSplashHidden || loading) return
    const inAuthScreens  = segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'forgot-password'
    const inVerifyScreen = segments[0] === 'verify-email'

    if (!user) {
      if (!inAuthScreens) router.replace('/login')
    } else if (!emailVerified) {
      if (!inVerifyScreen) router.replace('/verify-email')
    } else {
      if (inAuthScreens || inVerifyScreen || segments.length === 0) router.replace('/(tab)')
    }
  }, [user, emailVerified, loading, segments, nativeSplashHidden])

  // ─── Global Socket Sound Listener ─────────────────────────────────────────
  useEffect(() => {
    if (!mongoUser?._id) return

    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) return

      socket.off('receive_message_global_sound')

      socket.on('receive_message_global_sound', ({ chatId, senderId }) => {
        const onChatScreen = segments[0] === 'chat'
        if (senderId?.toString() === mongoUser._id?.toString()) return
        if (!onChatScreen) {
          playIncoming()
        }
      })

      clearInterval(interval)
    }, 1000)

    return () => clearInterval(interval)
  }, [mongoUser?._id, segments])

  // ─── receive_message এ global sound ──────────────────────────────────────
  useEffect(() => {
    if (!mongoUser?._id) return

    const setupGlobalSound = () => {
      const socket = getSocket()
      if (!socket) return false

      socket.off('receive_message', handleGlobalMessage)
      socket.on('receive_message', handleGlobalMessage)
      return true
    }

    const handleGlobalMessage = (msg) => {
      if (msg?.senderId?.toString() === mongoUser._id?.toString()) return
      const onChatScreen = segments[0] === 'chat'
      if (!onChatScreen) {
        playIncoming()
      }
    }

    const timer = setTimeout(() => {
      setupGlobalSound()
    }, 1500)

    return () => {
      clearTimeout(timer)
      const socket = getSocket()
      if (socket) socket.off('receive_message', handleGlobalMessage)
    }
  }, [mongoUser?._id])

  // Notification + FCM setup
  useEffect(() => {
    if (!mongoUser?._id) return

    const initNotifications = async () => {
      try {
        await setupAndroidChannel()
        await registerForPushNotifications().catch(() => {})
        console.log('✅ Notification setup complete')
      } catch (err) {
        console.log('Notification init error:', err?.message)
      }
    }
    initNotifications()

    const checkInitialNotification = async () => {
      const data = await getInitialNotification()
      if (data) {
        setTimeout(() => navigateFromNotification(router, data), 500)
      }
    }
    checkInitialNotification()

    const unsub = setupNotificationListeners({
      onTap: (data) => navigateFromNotification(router, data),
      onReceive: (_data) => {},
    })

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        clearBadge()
      }
      appState.current = nextState
    })

    return () => {
      unsub()
      subscription.remove()
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
        <Stack.Screen name="(tab)"           options={{ animation: 'none',             animationDuration: 150, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="login"           options={{ animation: 'fade',             animationDuration: 200, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="register"        options={{ animation: 'slide_from_bottom', animationDuration: 250, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="verify-email"    options={{ animation: 'fade',             animationDuration: 200, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="forgot-password" options={{ animation: 'slide_from_bottom', animationDuration: 220, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="chat"            options={{ animation: 'slide_from_right',  animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <Stack.Screen name="profile"         options={{ animation: 'slide_from_right',  animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="settings"        options={{ animation: 'slide_from_right',  animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="developer"       options={{ animation: 'slide_from_right',  animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
        <Stack.Screen name="change-password" options={{ animation: 'slide_from_right',  animationDuration: 200, contentStyle: { backgroundColor: BG }, gestureEnabled: true }} />
      </Stack>
    </View>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </QueryClientProvider>
  )
}