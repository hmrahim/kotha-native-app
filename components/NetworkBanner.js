// components/NetworkBanner.js — Facebook-style offline / reconnecting banner
import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { Ionicons } from '@expo/vector-icons'
import { getSocket } from '../services/socket'

const COLORS = {
  bg: '#0D1117',
  surface: '#1C2333',
  warning: '#F59E0B',
  danger: '#F85149',
  success: '#3FB950',
}

export default function NetworkBanner() {
  // 'online' | 'offline' | 'connecting' | 'restored'
  const [state, setState] = useState('online')
  const slide = useRef(new Animated.Value(-60)).current

  useEffect(() => {
    let restoreTimer = null
    let lastOnline = true

    const unsub = NetInfo.addEventListener((s) => {
      const connected = !!s.isConnected && s.isInternetReachable !== false

      if (!connected) {
        setState('offline')
        lastOnline = false
        if (restoreTimer) clearTimeout(restoreTimer)
      } else if (!lastOnline) {
        setState('restored')
        lastOnline = true
        if (restoreTimer) clearTimeout(restoreTimer)
        restoreTimer = setTimeout(() => setState('online'), 2000)
      } else {
        setState('online')
      }
    })

    // Listen socket reconnect events
    const socket = getSocket()
    const onConnect = () => {
      if (state === 'connecting') setState('restored')
    }
    const onDisconnect = () => setState((s) => (s === 'offline' ? s : 'connecting'))
    if (socket) {
      socket.on('connect', onConnect)
      socket.on('disconnect', onDisconnect)
    }

    return () => {
      unsub?.()
      if (socket) {
        socket.off('connect', onConnect)
        socket.off('disconnect', onDisconnect)
      }
      if (restoreTimer) clearTimeout(restoreTimer)
    }
  }, [])

  useEffect(() => {
    const visible = state !== 'online'
    Animated.timing(slide, {
      toValue: visible ? 0 : -60,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [state])

  const cfg = {
    offline: { icon: 'cloud-offline-outline', text: 'No internet connection', color: COLORS.danger },
    connecting: { icon: 'sync-outline', text: 'Connecting…', color: COLORS.warning },
    restored: { icon: 'checkmark-circle-outline', text: 'Connected', color: COLORS.success },
    online: { icon: 'wifi', text: '', color: COLORS.success },
  }[state]

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        { backgroundColor: cfg.color, transform: [{ translateY: slide }] },
      ]}
      data-testid="network-banner"
    >
      <Ionicons name={cfg.icon} color="#fff" size={16} />
      <Text style={s.text}>{cfg.text}</Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 24,
    left: 0,
    right: 0,
    height: 32,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
})
