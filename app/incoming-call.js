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
import { preWarmForCall, getLocalStream } from '../services/webrtc'
import { getSocket } from '../services/socket'
import { stopRingtone } from '../services/sounds'

// RTCView — only on native
let RTCView = null
if (Platform.OS !== 'web') {
  try { RTCView = require('react-native-webrtc').RTCView } catch (_) {}
}

const { width: W, height: H } = Dimensions.get('window')

const C = {
  bg: '#000000',
  green: '#31A24C',
  red: '#FA3E3E',
  white: '#FFFFFF',
  whiteD: 'rgba(255,255,255,0.72)',
  whiteDD: 'rgba(255,255,255,0.40)',
  accent: '#0084FF',
}

const safeStop = () => {
  try { stopRingtone() } catch (_) {}
}

export default function IncomingCallScreen() {
  const router = useRouter()
  const { state, dispatch } = useCall()
  const acceptingRef = useRef(false)

  // Local camera stream for video preview
  const [localStream, setLocalStream] = useState(null)

  // Animations
  const bgScale   = useRef(new Animated.Value(1.08)).current
  const avatarScale = useRef(new Animated.Value(0.85)).current
  const contentY  = useRef(new Animated.Value(30)).current
  const contentOp = useRef(new Animated.Value(0)).current
  const btnScale  = useRef(new Animated.Value(0)).current
  const ripple1   = useRef(new Animated.Value(1)).current
  const ripple2   = useRef(new Animated.Value(1)).current
  const ripple1Op = useRef(new Animated.Value(0.35)).current
  const ripple2Op = useRef(new Animated.Value(0.2)).current
  const camFadeIn = useRef(new Animated.Value(0)).current

  const isVideo = state.type === 'video'
  const avatar  = state.peer?.avatar
  const name    = state.peer?.name || 'Unknown'

  // ── Pre-warm WebRTC + get camera stream for video calls ────────────────
  useEffect(() => {
    if (!state.type) return
    let cancelled = false

    const warmUp = async () => {
      try {
        await preWarmForCall(state.type)
        if (cancelled) return

        if (state.type === 'video') {
          // preWarmForCall already called initLocalStream, just grab it
          const stream = getLocalStream()
          if (stream && !cancelled) {
            setLocalStream(stream)
            // Fade in camera preview smoothly
            Animated.timing(camFadeIn, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }).start()
          }
        }
      } catch (err) {
        console.warn('[IncomingCall] preWarm error:', err)
      }
    }

    warmUp()
    return () => { cancelled = true }
  }, [state.type])

  // ── Entry animations ───────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(bgScale, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(avatarScale, { toValue: 1, duration: 500, useNativeDriver: true, delay: 100 }),
      Animated.timing(contentOp, { toValue: 1, duration: 400, useNativeDriver: true, delay: 150 }),
      Animated.timing(contentY, { toValue: 0, duration: 400, useNativeDriver: true, delay: 150 }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, tension: 90, friction: 7, delay: 300 }),
    ]).start()

    const rLoop1 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ripple1, { toValue: 1.55, duration: 1200, useNativeDriver: true }),
          Animated.timing(ripple1Op, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ripple1, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(ripple1Op, { toValue: 0.35, duration: 0, useNativeDriver: true }),
        ]),
      ])
    )
    const rLoop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(ripple2, { toValue: 1.55, duration: 1200, useNativeDriver: true }),
          Animated.timing(ripple2Op, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ripple2, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(ripple2Op, { toValue: 0.2, duration: 0, useNativeDriver: true }),
        ]),
      ])
    )
    rLoop1.start()
    rLoop2.start()
    return () => { rLoop1.stop(); rLoop2.stop() }
  }, [])

  // ── Auto-close if call state changes ──────────────────────────────────
  useEffect(() => {
    if (state.phase !== 'incoming') {
      if (acceptingRef.current) return
      safeStop()
      try { router.back() } catch (_) {}
    }
  }, [state.phase])

  // ── Accept ─────────────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (acceptingRef.current) return
    acceptingRef.current = true

    safeStop()

    const socket = getSocket()
    if (!socket || !state.callId) {
      dispatch({ type: 'RESET' })
      try { router.back() } catch (_) {}
      return
    }

    socket.emit('call:accept', { callId: state.callId }, (response) => {
      if (response?.ok) {
        const { roomId, type, caller } = response
        router.replace({
          pathname: '/call',
          params: {
            callId: state.callId,
            roomId,
            type,
            peerName: caller?.name || 'User',
            peerAvatar: caller?.avatar || '',
            outgoing: '0',
          },
        })
      } else {
        console.error('[Incoming] Accept failed:', response?.error)
        acceptingRef.current = false
        dispatch({ type: 'RESET' })
        try { router.back() } catch (_) {}
      }
    })
  }, [state.callId, state.type, dispatch, router])

  // ── Reject ─────────────────────────────────────────────────────────────
  const handleReject = useCallback(() => {
    safeStop()
    const socket = getSocket()
    if (socket && state.callId) {
      socket.emit('call:reject', { callId: state.callId })
    }
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }, [state.callId, dispatch, router])

  // ── Render local camera background (video call only) ───────────────────
  const renderCameraBackground = () => {
    if (!isVideo || !localStream) return null

    // Native: use RTCView
    if (Platform.OS !== 'web' && RTCView) {
      return (
        <Animated.View style={[s.camBg, { opacity: camFadeIn }]}>
          <RTCView
            streamURL={localStream.toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror={true}
          />
          {/* Dark gradient overlay so text stays readable */}
          <View style={s.camOverlay} />
        </Animated.View>
      )
    }

    // Web: use <video> element
    return (
      <Animated.View style={[s.camBg, { opacity: camFadeIn }]}>
        <WebCameraView stream={localStream} />
        <View style={s.camOverlay} />
      </Animated.View>
    )
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} translucent />

      {/* ── Camera background (video) or solid black (voice) ── */}
      {isVideo ? (
        renderCameraBackground()
      ) : (
        <Animated.View style={[s.bgGrad, { transform: [{ scale: bgScale }] }]} />
      )}

      <View style={s.content}>
        <Animated.View
          style={[s.topSection, { opacity: contentOp, transform: [{ translateY: contentY }] }]}
        >
          {/* "Incoming Video Call" label */}
          <Text style={s.label}>Incoming {isVideo ? 'Video' : 'Voice'} Call</Text>

          <View style={s.avatarWrap}>
            <Animated.View style={[s.ripple, { transform: [{ scale: ripple1 }], opacity: ripple1Op }]} />
            <Animated.View style={[s.ripple, { transform: [{ scale: ripple2 }], opacity: ripple2Op }]} />

            <Animated.View style={[s.avatarOuter, { transform: [{ scale: avatarScale }] }]}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarFb]}>
                  <Text style={s.avatarLetter}>{name[0]?.toUpperCase() || '?'}</Text>
                </View>
              )}
            </Animated.View>
          </View>

          <Text style={s.name}>{name}</Text>
          <View style={s.typePill}>
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={14} color={C.whiteD} />
            <Text style={s.typeTxt}>{isVideo ? 'Video Call' : 'Voice Call'}</Text>
          </View>
        </Animated.View>

        {/* ── Accept / Decline buttons ── */}
        <Animated.View style={[s.actions, { transform: [{ scale: btnScale }] }]}>
          <ActionBtn icon="close"  color={C.red}   label="Decline" onPress={handleReject} />
          <ActionBtn icon="call"   color={C.green}  label="Accept"  onPress={handleAccept} />
        </Animated.View>
      </View>
    </View>
  )
}

// ── Web camera fallback ────────────────────────────────────────────────────
function WebCameraView({ stream }) {
  const videoRef = useRef(null)
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        objectFit: 'cover', transform: 'scaleX(-1)',
      }}
    />
  )
}

// ── Action button ──────────────────────────────────────────────────────────
function ActionBtn({ icon, color, label, onPress }) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, speed: 60 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60 }).start()}
      activeOpacity={1}
      style={s.actionWrap}
    >
      <Animated.View style={[s.actionBtn, { backgroundColor: color, transform: [{ scale }] }]}>
        <Ionicons name={icon} size={32} color="#fff" />
      </Animated.View>
      <Text style={s.actionLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Solid BG for voice calls
  bgGrad: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
  },

  // Full-screen camera layer (video calls)
  camBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  // Semi-transparent dark overlay so caller info stays readable
  camOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },

  content: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 60 : 80,
    paddingBottom: Platform.OS === 'android' ? 40 : 60,
    paddingHorizontal: 20,
  },
  topSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: C.whiteDD,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 40,
  },

  avatarWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  ripple: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: C.accent,
  },
  avatarOuter: {
    width: 168,
    height: 168,
    borderRadius: 84,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 20,
  },
  avatar: { width: 160, height: 160, borderRadius: 80 },
  avatarFb: {
    backgroundColor: C.accent + '66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: C.white, fontSize: 64, fontWeight: '700' },

  name: {
    color: C.white,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  typeTxt: { color: C.whiteD, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },

  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  actionWrap: { alignItems: 'center', gap: 12 },
  actionBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 12,
  },
  actionLabel: { color: C.whiteD, fontSize: 15, fontWeight: '600', letterSpacing: 0.5 },
})