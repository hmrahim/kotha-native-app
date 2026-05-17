// components/MessageSkeleton.js — WhatsApp-style skeleton while messages load
import React, { useEffect, useRef } from 'react'
import { Animated, View, StyleSheet } from 'react-native'
import { T } from '../theme'

function ShimmerBar({ width, alignSelf, height = 14 }) {
  const op = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View
      style={[
        s.bar,
        { width, alignSelf, height, opacity: op },
      ]}
    />
  )
}

const ROWS = [
  { w: 180, side: 'flex-start' },
  { w: 110, side: 'flex-end' },
  { w: 220, side: 'flex-start' },
  { w: 150, side: 'flex-end' },
  { w: 90,  side: 'flex-start' },
  { w: 200, side: 'flex-end' },
  { w: 130, side: 'flex-start' },
  { w: 180, side: 'flex-end' },
]

export default function MessageSkeleton() {
  return (
    <View style={s.wrap} data-testid="message-skeleton">
      {ROWS.map((r, i) => (
        <View key={i} style={[s.row, { alignItems: r.side }]}>
          <ShimmerBar width={r.w} alignSelf={r.side} height={36} />
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  row: { width: '100%' },
  bar: {
    borderRadius: 12,
    backgroundColor: T.surfaceHigh || '#1C2333',
  },
})
