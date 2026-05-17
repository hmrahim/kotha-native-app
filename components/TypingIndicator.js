// components/TypingIndicator.js
import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet } from 'react-native'
import { T } from '../theme'

function Dot({ delay }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: -6, duration: 300, useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0, duration: 300, useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View style={[s.dot, { transform: [{ translateY: anim }] }]} />
  )
}

export default function TypingIndicator({ name }) {
  return (
    <View style={s.wrapper}>
      <View style={s.bubble}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrapper: {
    alignSelf: 'flex-start',
    marginTop: 4,
    marginLeft: 4,
    marginBottom: 8,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.bubbleThem,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: T.bubbleThemBorder,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 5,
    minWidth: 60,
    justifyContent: 'center',
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: T.textMuted,
  },
})
