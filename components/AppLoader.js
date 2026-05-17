import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet, Dimensions } from 'react-native'

const { width } = Dimensions.get('window')
const BG      = '#0D1117'
const SURFACE = '#161B22'
const SHIMMER = '#1C2333'
const ACCENT  = '#2DD4BF'

function ShimmerBar({ w, h = 14, radius = 8, delay = 0, style }) {
  const anim = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: radius, backgroundColor: SHIMMER, opacity: anim },
        style,
      ]}
    />
  )
}

function SkeletonRow({ delay }) {
  return (
    <View style={sk.row}>
      <ShimmerBar w={50} h={50} radius={25} delay={delay} />
      <View style={sk.content}>
        <View style={sk.top}>
          <ShimmerBar w={width * 0.38} h={13} delay={delay} />
          <ShimmerBar w={45}           h={11} delay={delay} />
        </View>
        <ShimmerBar w={width * 0.55} h={11} delay={delay + 80} style={{ marginTop: 8 }} />
      </View>
    </View>
  )
}

function PulsingDot() {
  const scale   = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.4, duration: 700, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        ]),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View style={[s.dot, { transform: [{ scale }], opacity }]} />
  )
}

export default function AppLoader() {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start()
  }, [])

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim }]}>
      <View style={s.header}>
        <View style={s.logoRow}>
          <View style={s.logoMark} />
          <ShimmerBar w={80} h={18} radius={6} />
        </View>
        <View style={s.headerIcons}>
          <ShimmerBar w={28} h={28} radius={14} delay={0} />
          <ShimmerBar w={28} h={28} radius={14} delay={80} />
          <ShimmerBar w={28} h={28} radius={14} delay={160} />
        </View>
      </View>

      <View style={s.chips}>
        {[70, 80, 65, 90].map((w, i) => (
          <ShimmerBar key={i} w={w} h={30} radius={20} delay={i * 60} />
        ))}
      </View>

      <View style={s.list}>
        {[0, 100, 200, 300, 400, 500, 600].map((delay, i) => (
          <View key={i}>
            <SkeletonRow delay={delay} />
            {i < 6 && <View style={s.sep} />}
          </View>
        ))}
      </View>

      <View style={s.dotWrap}>
        <PulsingDot />
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: BG },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: SURFACE, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(240,246,252,0.06)' },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark:    { width: 8, height: 22, borderRadius: 4, backgroundColor: ACCENT, opacity: 0.7 },
  headerIcons: { flexDirection: 'row', gap: 10 },
  chips:       { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  list:        { flex: 1, paddingTop: 4 },
  sep:         { height: 1, backgroundColor: 'rgba(240,246,252,0.04)', marginLeft: 79 },
  dotWrap:     { alignItems: 'center', paddingBottom: 40, paddingTop: 16 },
  dot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
})

const sk = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  content: { flex: 1 },
  top:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})