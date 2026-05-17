import React, { useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, Animated,
  TouchableOpacity, StatusBar, Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { T } from '../../theme'

const { width: W } = Dimensions.get('window')

const FEATURES = [
  {
    icon: 'call',
    color: T.accent,
    dim: T.accentDim,
    title: 'Voice Call',
    desc: 'HD quality voice call যেকোনো সময়',
  },
  {
    icon: 'videocam',
    color: '#A78BFA',
    dim: 'rgba(167,139,250,0.12)',
    title: 'Video Call',
    desc: 'Face-to-face কথা বলো যেকোনো জায়গা থেকে',
  },
  {
    icon: 'people',
    color: T.amber,
    dim: T.amberDim,
    title: 'Group Call',
    desc: 'একসাথে অনেকজনের সাথে কথা বলো',
  },
  {
    icon: 'shield-checkmark',
    color: '#34D399',
    dim: 'rgba(52,211,153,0.12)',
    title: 'End-to-End Encrypted',
    desc: 'তোমার call সম্পূর্ণ নিরাপদ ও private',
  },
]

// ── Animated ring ─────────────────────────────────────────────────────────────
function PulseRing({ delay, size, color }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1, duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0, duration: 0,
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size, height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 0.3, 0] }),
        transform: [{
          scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }),
        }],
      }}
    />
  )
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ item, index }) {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(24)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 400,
        delay: 600 + index * 120,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0, duration: 400,
        delay: 600 + index * 120,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[
      fc.card,
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      <View style={[fc.iconWrap, { backgroundColor: item.dim }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={fc.title}>{item.title}</Text>
        <Text style={fc.desc}>{item.desc}</Text>
      </View>
      <View style={[fc.soon, { borderColor: item.color + '40' }]}>
        <Text style={[fc.soonText, { color: item.color }]}>Soon</Text>
      </View>
    </Animated.View>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CallsScreen() {
  const insets = useSafeAreaInsets()

  const heroFade  = useRef(new Animated.Value(0)).current
  const heroSlide = useRef(new Animated.Value(30)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroFade,  { toValue: 1, duration: 500, delay: 100, useNativeDriver: true }),
      Animated.timing(heroSlide, { toValue: 0, duration: 500, delay: 100, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.surface} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerAccent} />
          <Text style={s.headerTitle}>Calls</Text>
        </View>
      </View>

      <View style={s.body}>

        {/* Hero icon with pulse rings */}
        <Animated.View style={[s.heroWrap, {
          opacity: heroFade,
          transform: [{ translateY: heroSlide }],
        }]}>
          <View style={s.ringContainer}>
            <PulseRing delay={0}    size={160} color={T.accent} />
            <PulseRing delay={700}  size={160} color={T.accent} />
            <PulseRing delay={1400} size={160} color={T.accent} />
            <View style={s.heroIcon}>
              <Ionicons name="call" size={52} color={T.accent} />
            </View>
          </View>

          <Text style={s.heroTitle}>Call Feature</Text>
          <Text style={s.heroSub}>শীঘ্রই আসছে</Text>
          <Text style={s.heroDesc}>
            আমরা তোমার জন্য একটি দারুণ calling experience তৈরি করছি।
            {'\n'}একটু অপেক্ষা করো! 🚀
          </Text>
        </Animated.View>

        {/* Divider */}
        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>আসছে যা যা</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Feature cards */}
        <View style={s.featureList}>
          {FEATURES.map((item, i) => (
            <FeatureCard key={item.title} item={item} index={i} />
          ))}
        </View>

      </View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAccent: { width: 4, height: 22, borderRadius: 2, backgroundColor: T.accent },
  headerTitle:  { fontSize: 22, fontWeight: '800', color: T.textPrimary },

  body: { flex: 1, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24 },

  // Hero
  heroWrap: { alignItems: 'center', marginBottom: 36 },
  ringContainer: {
    width: 160, height: 160,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  heroIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: T.accentDim,
    borderWidth: 1.5, borderColor: 'rgba(45,212,191,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 26, fontWeight: '900', color: T.textPrimary,
    letterSpacing: 0.5, marginBottom: 6,
  },
  heroSub: {
    fontSize: 13, fontWeight: '700', color: T.accent,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14,
  },
  heroDesc: {
    fontSize: 14, color: T.textSecond, textAlign: 'center',
    lineHeight: 22, paddingHorizontal: 10,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: {
    fontSize: 11, fontWeight: '700', color: T.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },

  featureList: { gap: 10 },
})

const fc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: T.surface, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: T.border,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '700', color: T.textPrimary, marginBottom: 2 },
  desc:  { fontSize: 12, color: T.textSecond, lineHeight: 17 },
  soon: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  soonText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
})