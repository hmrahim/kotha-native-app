import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    Animated,
    Dimensions,
    Image,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { useCall } from '../context/CallContext'
import { getSocket } from '../services/socket'
import { stopRingtone } from '../services/sounds'
import { getLocalStream, preWarmForCall } from '../services/webrtc'

let RTCView = null
if (Platform.OS !== 'web') {
  try { RTCView = require('react-native-webrtc').RTCView } catch (_) {}
}

const { width: W, height: H } = Dimensions.get('window')

const C = {
  bg:        '#060A12',
  green:     '#00E5A0',
  greenDark: '#00B87A',
  red:       '#FF4560',
  redDark:   '#CC2A40',
  white:     '#FFFFFF',
  whiteD:    'rgba(255,255,255,0.75)',
  whiteDD:   'rgba(255,255,255,0.40)',
  accent:    '#4F8EF7',
  accentGlow:'rgba(79,142,247,0.35)',
  glass:     'rgba(255,255,255,0.06)',
  glassBorder:'rgba(255,255,255,0.12)',
}

const safeStop = () => { try { stopRingtone() } catch (_) {} }

// ── Animated gradient orbs in background ──────────────────────────────────
function BackgroundOrbs({ isVideo }) {
  const orb1 = useRef(new Animated.Value(0)).current
  const orb2 = useRef(new Animated.Value(0)).current
  const orb3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = (val, duration, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration, useNativeDriver: true }),
        ])
      ).start()

    loop(orb1, 3500, 0)
    loop(orb2, 4200, 700)
    loop(orb3, 3800, 1400)
  }, [])

  if (isVideo) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[s.orb, {
        width: W * 0.85,
        height: W * 0.85,
        borderRadius: W * 0.425,
        top: -W * 0.3,
        left: -W * 0.25,
        backgroundColor: 'rgba(0,180,150,0.13)',
        opacity: orb1.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
        transform: [{ scale: orb1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
      }]} />
      <Animated.View style={[s.orb, {
        width: W * 0.9,
        height: W * 0.9,
        borderRadius: W * 0.45,
        bottom: -W * 0.2,
        right: -W * 0.3,
        backgroundColor: 'rgba(79,142,247,0.12)',
        opacity: orb2.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
        transform: [{ scale: orb2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
      }]} />
      <Animated.View style={[s.orb, {
        width: W * 0.5,
        height: W * 0.5,
        borderRadius: W * 0.25,
        top: H * 0.35,
        left: W * 0.25,
        backgroundColor: 'rgba(79,142,247,0.07)',
        opacity: orb3.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] }),
        transform: [{ scale: orb3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
      }]} />
    </View>
  )
}

// ── Pulsing ring ──────────────────────────────────────────────────────────
function RippleRing({ delay, color }) {
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.7, duration: 1600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 1600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start()
  }, [])

  return (
    <Animated.View style={[s.rippleRing, {
      borderColor: color,
      transform: [{ scale }],
      opacity,
    }]} />
  )
}

// ── Slide-up action button ────────────────────────────────────────────────
function ActionBtn({ icon, color, colorDark, label, onPress, slideAnim }) {
  const pressScale = useRef(new Animated.Value(1)).current

  const onIn  = () => Animated.spring(pressScale, { toValue: 0.88, useNativeDriver: true, speed: 80 }).start()
  const onOut = () => Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, speed: 60 }).start()

  return (
    <Animated.View style={{ transform: [{ translateY: slideAnim }, { scale: pressScale }], alignItems: 'center', gap: 14 }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        activeOpacity={1}
      >
        {/* Outer glow ring */}
        <View style={[s.btnGlow, { shadowColor: color }]}>
          {/* Glass ring */}
          <View style={[s.btnRing, { borderColor: color + '55' }]}>
            {/* Filled button */}
            <View style={[s.btnInner, { backgroundColor: color }]}>
              <Ionicons name={icon} size={30} color="#fff" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
      <Text style={s.btnLabel}>{label}</Text>
    </Animated.View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function IncomingCallScreen() {
  const router       = useRouter()
  const { state, dispatch } = useCall()
  const acceptingRef = useRef(false)
  const [localStream, setLocalStream] = useState(null)

  const isVideo = state.type === 'video'
  const avatar  = state.peer?.avatar
  const name    = state.peer?.name || 'Unknown'

  // Entry animations
  const headerY   = useRef(new Animated.Value(-40)).current
  const headerOp  = useRef(new Animated.Value(0)).current
  const avatarSc  = useRef(new Animated.Value(0.6)).current
  const avatarOp  = useRef(new Animated.Value(0)).current
  const nameY     = useRef(new Animated.Value(20)).current
  const nameOp    = useRef(new Animated.Value(0)).current
  const declineY  = useRef(new Animated.Value(80)).current
  const acceptY   = useRef(new Animated.Value(80)).current
  const camOp     = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(headerY,  { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(headerOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(avatarSc, { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }),
        Animated.timing(avatarOp, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(nameY,  { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(nameOp, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(declineY, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(acceptY,  { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
  }, [])

  // Pre-warm WebRTC
  useEffect(() => {
    if (!state.type) return
    let cancelled = false
    ;(async () => {
      try {
        await preWarmForCall(state.type)
        if (cancelled || state.type !== 'video') return
        const stream = getLocalStream()
        if (stream && !cancelled) {
          setLocalStream(stream)
          Animated.timing(camOp, { toValue: 1, duration: 600, useNativeDriver: true }).start()
        }
      } catch (e) { console.warn('[IncomingCall] preWarm:', e) }
    })()
    return () => { cancelled = true }
  }, [state.type])

  // Auto-close when call ends externally (rejected/canceled/ended by caller)
  useEffect(() => {
    if (state.phase !== 'incoming') {
      if (acceptingRef.current) return // we are accepting — do NOT close
      safeStop()
      try { router.back() } catch (_) {}
    }
  }, [state.phase])

  // ── FIX: Accept immediately using state data — do NOT wait for server callback ──
  // All the info we need (callId, roomId, type, peer) is already in CallContext
  // state from when the incoming call was dispatched. Waiting for the socket
  // callback causes the screen to disappear when the callback is slow or if the
  // server doesn't acknowledge quickly enough.
  const handleAccept = useCallback(() => {
    if (acceptingRef.current) return
    acceptingRef.current = true
    safeStop()

    const socket = getSocket()
    if (!socket || !state.callId) {
      // No socket or no call — reset and go back
      dispatch({ type: 'RESET' })
      try { router.back() } catch (_) {}
      return
    }

    // Navigate immediately — we already have everything we need in state.
    // This is the fix: the old code waited for the socket ack callback which
    // sometimes never arrived (or arrived with ok:false), causing the screen
    // to vanish without opening the call screen.
    dispatch({ type: 'ACTIVE' })
    router.replace({
      pathname: '/call',
      params: {
        callId:     state.callId,
        roomId:     state.roomId  || '',
        type:       state.type    || 'voice',
        peerName:   state.peer?.name   || 'User',
        peerAvatar: state.peer?.avatar || '',
        outgoing:   '0',
      },
    })

    // Notify server in fire-and-forget fashion. The call screen handles the
    // WebRTC setup independently via socket events (webrtc:offer, etc.).
    socket.emit('call:accept', { callId: state.callId }, (response) => {
      if (!response?.ok) {
        // Server rejected — the call screen will receive call:ended and clean up.
        console.warn('[IncomingCall] server rejected accept:', response?.error)
      }
    })
  }, [state.callId, state.roomId, state.type, state.peer, dispatch, router])

  const handleReject = useCallback(() => {
    safeStop()
    const socket = getSocket()
    if (socket && state.callId) socket.emit('call:reject', { callId: state.callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }, [state.callId, dispatch, router])

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Background ── */}
      {isVideo && localStream ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: camOp }]}>
          {Platform.OS !== 'web' && RTCView ? (
            <RTCView streamURL={localStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror />
          ) : null}
          <View style={s.videoOverlay} />
        </Animated.View>
      ) : (
        <BackgroundOrbs isVideo={isVideo} />
      )}

      {/* ── Subtle grid overlay ── */}
      <View style={s.gridOverlay} pointerEvents="none" />

      {/* ── Content ── */}
      <View style={s.content}>

        {/* ── Header badge ── */}
        <Animated.View style={[s.headerWrap, { opacity: headerOp, transform: [{ translateY: headerY }] }]}>
          <View style={s.headerBadge}>
            <View style={s.headerDot} />
            <Text style={s.headerText}>
              Incoming {isVideo ? 'Video' : 'Voice'} Call
            </Text>
          </View>
        </Animated.View>

        {/* ── Avatar section ── */}
        <View style={s.avatarSection}>
          {/* Ripple rings */}
          <View style={s.rippleWrap}>
            <RippleRing delay={0}    color={isVideo ? C.accent : C.green} />
            <RippleRing delay={550}  color={isVideo ? C.accent : C.green} />
            <RippleRing delay={1100} color={isVideo ? C.accent : C.green} />

            {/* Avatar container */}
            <Animated.View style={[s.avatarContainer, {
              opacity:   avatarOp,
              transform: [{ scale: avatarSc }],
            }]}>
              {/* Glass border ring */}
              <View style={[s.avatarGlassRing, { borderColor: isVideo ? C.accent + '60' : C.green + '60' }]}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={s.avatarImg} />
                ) : (
                  <View style={[s.avatarFallback, { backgroundColor: isVideo ? C.accent + '30' : C.green + '20' }]}>
                    <Text style={[s.avatarLetter, { color: isVideo ? C.accent : C.green }]}>
                      {name[0]?.toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </View>

          {/* Name + type */}
          <Animated.View style={[s.nameWrap, { opacity: nameOp, transform: [{ translateY: nameY }] }]}>
            <Text style={s.nameText} numberOfLines={1}>{name}</Text>
            <View style={[s.typePill, { borderColor: isVideo ? C.accent + '40' : C.green + '40' }]}>
              <Ionicons
                name={isVideo ? 'videocam' : 'call'}
                size={12}
                color={isVideo ? C.accent : C.green}
              />
              <Text style={[s.typeText, { color: isVideo ? C.accent : C.green }]}>
                {isVideo ? 'Video Call' : 'Voice Call'}
              </Text>
            </View>
          </Animated.View>
        </View>

        {/* ── Swipe hint ── */}
        <Text style={s.swipeHint}>Tap to respond</Text>

        {/* ── Action buttons ── */}
        <View style={s.actionsRow}>
          <ActionBtn
            icon="close"
            color={C.red}
            colorDark={C.redDark}
            label="Decline"
            onPress={handleReject}
            slideAnim={declineY}
          />
          <ActionBtn
            icon={isVideo ? 'videocam' : 'call'}
            color={C.green}
            colorDark={C.greenDark}
            label="Accept"
            onPress={handleAccept}
            slideAnim={acceptY}
          />
        </View>

      </View>
    </View>
  )
}

// ── Web cam fallback ───────────────────────────────────────────────────────
function WebCameraView({ stream }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
    />
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  orb: {
    position: 'absolute',
  },

  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03,
    backgroundColor: 'transparent',
  },

  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,10,18,0.55)',
  },

  content: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 56 : 72,
    paddingBottom: Platform.OS === 'android' ? 48 : 64,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
  },
  headerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.green,
    shadowColor: C.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  headerText: {
    color: C.whiteD,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
  },

  avatarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },

  rippleWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rippleRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
  },

  avatarContainer: {},

  avatarGlassRing: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },

  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 68,
  },

  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarLetter: {
    fontSize: 56,
    fontWeight: '700',
  },

  nameWrap: {
    alignItems: 'center',
    gap: 12,
  },

  nameText: {
    color: C.white,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    maxWidth: W - 60,
    textAlign: 'center',
  },

  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  typeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  swipeHint: {
    color: C.whiteDD,
    fontSize: 12,
    letterSpacing: 1.2,
    fontWeight: '500',
    textTransform: 'uppercase',
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: 20,
  },

  btnGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 16,
    borderRadius: 44,
  },

  btnRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  btnInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  btnLabel: {
    color: C.whiteD,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
})
