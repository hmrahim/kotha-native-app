// components/ScrollToBottomButton.js — circular button that appears when user scrolls up
import React, { useEffect, useRef } from 'react'
import { Animated, TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { T } from '../theme'

export default function ScrollToBottomButton({ visible, unreadCount = 0, onPress }) {
  const scale = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(scale, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 80,
    }).start()
  }, [visible])

  return (
    <Animated.View
      style={[s.wrap, { transform: [{ scale }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={s.btn}
        activeOpacity={0.8}
        onPress={onPress}
        data-testid="scroll-to-bottom-btn"
      >
        <Ionicons name="chevron-down" size={22} color={T.textPrimary} />
        {unreadCount > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    bottom: 92,
    width: 42, height: 42,
  },
  btn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: T.surfaceHigh || '#1C2333',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border || 'rgba(240,246,252,0.10)',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  badge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: T.accent || '#2DD4BF',
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { color: '#0D1117', fontSize: 11, fontWeight: '800' },
})
