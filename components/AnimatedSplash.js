import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  Animated,
  StyleSheet,
  StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const T = {
  bg:     '#0D1117',
  accent: '#2DD4BF',
  text:   '#F0F6FC',
  muted:  '#7D8590',
  dim:    '#484F58',
}

export default function AnimatedSplash({ onDone }) {
  const logoScale   = useRef(new Animated.Value(0)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const textOpacity = useRef(new Animated.Value(0)).current
  const tagOpacity  = useRef(new Animated.Value(0)).current
  const ringScale   = useRef(new Animated.Value(0.6)).current
  const ringOpacity = useRef(new Animated.Value(0)).current
  const devOpacity  = useRef(new Animated.Value(0)).current
  const devSlide    = useRef(new Animated.Value(20)).current
  const overlayOp   = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.sequence([
      // 1. Ring pulse in
      Animated.parallel([
        Animated.spring(ringScale,   { toValue: 1,   useNativeDriver: true, tension: 60, friction: 8 }),
        Animated.timing(ringOpacity, { toValue: 0.2, duration: 500, useNativeDriver: true }),
      ]),
      // 2. Logo pop in
      Animated.parallel([
        Animated.spring(logoScale,   { toValue: 1,   useNativeDriver: true, tension: 80, friction: 7 }),
        Animated.timing(logoOpacity, { toValue: 1,   duration: 300, useNativeDriver: true }),
      ]),
      // 3. App name fade in
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      // 4. Tagline fade in
      Animated.timing(tagOpacity,  { toValue: 1, duration: 400, useNativeDriver: true }),
      // 5. Developer credit slide up
      Animated.parallel([
        Animated.timing(devOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(devSlide,   { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      // 6. Hold
      Animated.delay(1200),
      // 7. Fade out overlay
      Animated.timing(overlayOp, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start(() => onDone())
  }, [])

  return (
    <Animated.View
      style={[s.overlay, { opacity: overlayOp }]}
      pointerEvents="none"
    >
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Background glow */}
      <Animated.View style={[s.bgGlow, {
        opacity:   ringOpacity,
        transform: [{ scale: ringScale }],
      }]} />

      {/* Logo ring */}
      <Animated.View style={[s.logoRing, {
        opacity:   ringOpacity,
        transform: [{ scale: ringScale }],
      }]} />

      {/* Icon */}
      <Animated.View style={[s.logoBox, {
        opacity:   logoOpacity,
        transform: [{ scale: logoScale }],
      }]}>
        <Ionicons name="chatbubbles" size={56} color={T.accent} />
      </Animated.View>

      {/* App name */}
      <Animated.Text style={[s.appName, { opacity: textOpacity }]}>
        KOTHA
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[s.tagline, { opacity: tagOpacity }]}>
        connect · কথা বলো
      </Animated.Text>

      {/* Developer credit */}
      <Animated.View style={[s.devCard, {
        opacity:   devOpacity,
        transform: [{ translateY: devSlide }],
      }]}>
        <View style={s.devDivider} />
        <Text style={s.devLabel}>developed by</Text>
        <View style={s.devNameRow}>
          <View style={s.devDot} />
          <Text style={s.devName}>Rahim</Text>
          <View style={s.devDot} />
        </View>
        <View style={s.devGlow} />
      </Animated.View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.bg,
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          999,
  },
  bgGlow: {
    position:        'absolute',
    width:           320,
    height:          320,
    borderRadius:    160,
    backgroundColor: T.accent,
    opacity:         0.06,
  },
  logoRing: {
    position:     'absolute',
    width:        140,
    height:       140,
    borderRadius: 70,
    borderWidth:  1.5,
    borderColor:  T.accent,
  },
  logoBox: {
    width:           110,
    height:          110,
    borderRadius:    32,
    backgroundColor: 'rgba(45,212,191,0.10)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     'rgba(45,212,191,0.20)',
    marginBottom:    28,
  },
  appName: {
    fontSize:      38,
    fontWeight:    '900',
    color:         T.text,
    letterSpacing: 8,
    marginBottom:  10,
  },
  tagline: {
    fontSize:      14,
    color:         T.muted,
    letterSpacing: 2,
  },
  devCard: {
    position:   'absolute',
    bottom:     44,
    alignItems: 'center',
    gap:        8,
    width:      200,
  },
  devDivider: {
    width:           40,
    height:          1,
    backgroundColor: 'rgba(45,212,191,0.25)',
    marginBottom:    4,
  },
  devLabel: {
    fontSize:      11,
    color:         T.dim,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  devNameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  devDot: {
    width:           4,
    height:          4,
    borderRadius:    2,
    backgroundColor: T.accent,
    opacity:         0.7,
  },
  devName: {
    fontSize:      18,
    fontWeight:    '800',
    color:         T.accent,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  devGlow: {
    width:           80,
    height:          2,
    borderRadius:    1,
    backgroundColor: T.accent,
    opacity:         0.15,
    marginTop:       4,
  },
})
