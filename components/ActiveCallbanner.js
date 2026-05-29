import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useCall } from '../context/CallContext'
import { getSocket } from '../services/socket'
import { FloatingBubble } from '../services/FloatingBubble'

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function ActiveCallBanner() {
  const { state, dispatch, callSeconds, callScreenFocused } = useCall()
  const router = useRouter()

  const slideY = useRef(new Animated.Value(-56)).current
  const opacity = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const pulseLoop = useRef(null)

  const isActive = state.phase === 'active'
  // ✅ Call screen focused থাকলে banner দেখাবে না
  const isVisible = isActive && !!state.peer && !callScreenFocused

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          tension: 100,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()

      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      )
      pulseLoop.current.start()
    } else {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: -56,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
      if (pulseLoop.current) {
        pulseLoop.current.stop()
        pulseLoop.current = null
      }
    }
  }, [isVisible])

  if (!isVisible) return null

  const isVideo = state.type === 'video'
  const peerName = state.peer?.name || 'Unknown'
  const accentColor = isVideo ? '#4F8EF7' : '#00E5A0'

  // ✅ Banner tap → call screen এ ফিরে যাও (router.back — call screen stack এ alive আছে)
  const handleTap = () => {
    try {
      if (Platform.OS === 'android' && FloatingBubble.isSupported) {
        try { FloatingBubble.hide() } catch (_) {}
      }
      router.back()
    } catch (_) {}
  }

  const handleEnd = () => {
    try { FloatingBubble.hide() } catch (_) {}
    getSocket()?.emit('call:end', { callId: state.callId })
    dispatch({ type: 'RESET' })
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderBottomColor: accentColor + '40',
          transform: [{ translateY: slideY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={handleTap}
        activeOpacity={0.85}
      >
        <View style={styles.leftSection}>
          <View style={[styles.iconWrap, { backgroundColor: accentColor + '22' }]}>
            <Ionicons
              name={isVideo ? 'videocam' : 'call'}
              size={14}
              color={accentColor}
            />
          </View>
          <Animated.View
            style={[styles.pulseDot, { backgroundColor: accentColor, opacity: pulseAnim }]}
          />
        </View>

        <View style={styles.centerSection}>
          <Text style={styles.nameText} numberOfLines={1}>{peerName}</Text>
          <Text style={[styles.timerText, { color: accentColor }]}>
            {callSeconds > 0 ? fmt(callSeconds) : isVideo ? 'Video call' : 'Voice call'}
          </Text>
        </View>

        <View style={styles.rightSection}>
          <Text style={styles.returnText}>Return</Text>
          <TouchableOpacity
            style={styles.endBtn}
            onPress={handleEnd}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="call"
              size={14}
              color="#fff"
              style={{ transform: [{ rotate: '135deg' }] }}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D1220',
    borderBottomWidth: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
    minHeight: 44,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  centerSection: {
    flex: 1,
    gap: 1,
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  returnText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '500',
  },
  endBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FF4560',
    alignItems: 'center',
    justifyContent: 'center',
  },
})