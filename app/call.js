import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useCall } from '../context/CallContext'
import {
  addIceCandidate,
  cleanup,
  createAnswer,
  createOffer,
  createPeerConnection,
  initLocalStream,
  requestCallPermissions,
  setMuted,
  setRemoteDescription,
  setVideoMuted,
  setSpeaker,
  startAudioSession,
  switchCamera,
} from '../services/webrtc'
import { getSocket } from '../services/socket'
import { startRingback, stopRingback } from '../services/sounds'

let RTCView = null
if (Platform.OS !== 'web') {
  try { RTCView = require('react-native-webrtc').RTCView } catch (_) { }
}

function WebVideoView({ stream, mirror = false, style }) {
  const videoRef = useRef(null)
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream }, [stream])
  return (
    <video ref={videoRef} autoPlay playsInline muted={mirror}
      style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: mirror ? 'scaleX(-1)' : 'none', ...style
      }} />
  )
}

const { width: W, height: H } = Dimensions.get('window')

const PIP_W = 108
const PIP_H = 156
const PIP_MARGIN = 16
const PIP_MAX_X = W - PIP_W - PIP_MARGIN
const PIP_MAX_Y = H - PIP_H - 130

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#050810',
  surface: '#0D1220',
  glass: 'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.11)',
  accent: '#4F8EF7',
  accentSoft: 'rgba(79,142,247,0.25)',
  green: '#00E5A0',
  greenSoft: 'rgba(0,229,160,0.20)',
  red: '#FF4560',
  redSoft: 'rgba(255,69,96,0.20)',
  amber: '#FFB800',
  white: '#FFFFFF',
  whiteD: 'rgba(255,255,255,0.72)',
  whiteDD: 'rgba(255,255,255,0.38)',
  ctrl: 'rgba(255,255,255,0.09)',
  ctrlBorder: 'rgba(255,255,255,0.13)',
  ctrlActive: 'rgba(255,255,255,0.22)',
}

// ── Animated background — deep space orbs ─────────────────────────────────────
function SpaceBackground({ accent }) {
  const a1 = useRef(new Animated.Value(0)).current
  const a2 = useRef(new Animated.Value(0)).current
  const a3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = (val, dur, delay) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: true }),
        Animated.timing(val, { toValue: 0, duration: dur, useNativeDriver: true }),
      ])).start()
    loop(a1, 4000, 0)
    loop(a2, 5000, 800)
    loop(a3, 3500, 1600)
  }, [])

  const color1 = accent === 'green'
    ? 'rgba(0,229,160,0.10)' : 'rgba(79,142,247,0.10)'
  const color2 = accent === 'green'
    ? 'rgba(0,180,130,0.07)' : 'rgba(120,80,255,0.08)'

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={{
        position: 'absolute',
        width: W * 1.1, height: W * 1.1, borderRadius: W * 0.55,
        top: -W * 0.4, left: -W * 0.15,
        backgroundColor: color1,
        opacity: a1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
        transform: [{ scale: a1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
      }} />
      <Animated.View style={{
        position: 'absolute',
        width: W * 0.9, height: W * 0.9, borderRadius: W * 0.45,
        bottom: -W * 0.1, right: -W * 0.25,
        backgroundColor: color2,
        opacity: a2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
        transform: [{ scale: a2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
      }} />
      <Animated.View style={{
        position: 'absolute',
        width: W * 0.6, height: W * 0.6, borderRadius: W * 0.3,
        top: H * 0.38, left: W * 0.2,
        backgroundColor: 'rgba(255,255,255,0.03)',
        opacity: a3.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] }),
        transform: [{ scale: a3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
      }} />
    </View>
  )
}

// ── Pulsing rings around avatar (waiting state) ───────────────────────────────
function PulseRings({ color, active }) {
  const r1s = useRef(new Animated.Value(1)).current
  const r1o = useRef(new Animated.Value(0.45)).current
  const r2s = useRef(new Animated.Value(1)).current
  const r2o = useRef(new Animated.Value(0.28)).current
  const r3s = useRef(new Animated.Value(1)).current
  const r3o = useRef(new Animated.Value(0.15)).current

  useEffect(() => {
    if (!active) return
    const ring = (scale, opacity, delay) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.85, duration: 1800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 1800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: opacity === r1o ? 0.45 : opacity === r2o ? 0.28 : 0.15, duration: 0, useNativeDriver: true }),
        ]),
      ])).start()

    ring(r1s, r1o, 0)
    ring(r2s, r2o, 600)
    ring(r3s, r3o, 1200)
  }, [active])

  return (
    <View style={{ position: 'absolute', width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
      {[{ s: r3s, o: r3o }, { s: r2s, o: r2o }, { s: r1s, o: r1o }].map((r, i) => (
        <Animated.View key={i} style={{
          position: 'absolute',
          width: 170, height: 170, borderRadius: 85,
          borderWidth: 1.5, borderColor: color,
          transform: [{ scale: r.s }], opacity: r.o,
        }} />
      ))}
    </View>
  )
}

// ── Control button ────────────────────────────────────────────────────────────
function CtrlBtn({ icon, label, onPress, active = false, danger = false }) {
  const sc = useRef(new Animated.Value(1)).current
  const bgColor = danger ? C.red : active ? C.ctrlActive : C.ctrl
  const borderColor = danger ? 'rgba(255,69,96,0.5)' : active ? C.ctrlBorder : C.ctrlBorder

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => Animated.spring(sc, { toValue: 0.84, useNativeDriver: true, speed: 80 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 60 }).start()}
      activeOpacity={1}
      style={s.ctrlWrap}
    >
      <Animated.View style={[s.ctrl, { backgroundColor: bgColor, borderColor, transform: [{ scale: sc }] }]}>
        {danger ? (
          <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        ) : (
          <Ionicons name={icon} size={22} color={active ? '#fff' : C.whiteD} />
        )}
      </Animated.View>
      <Text style={[s.ctrlLbl, danger && { color: C.red }]}>{label}</Text>
    </TouchableOpacity>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CallScreen() {
  const params = useLocalSearchParams()
  const router = useRouter()
  const { dispatch } = useCall()

  const {
    callId, roomId, type = 'voice',
    peerName = 'Calling…', peerAvatar = '', outgoing = '0',
  } = params

  const isVideo = type === 'video'
  const isOutgoing = outgoing === '1'
  const isWeb = Platform.OS === 'web'

  const [remoteStreamState, setRemoteStreamState] = useState(null)
  const [localStreamState, setLocalStreamState] = useState(null)
  const [muted, setM] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(isVideo)
  const speakerOnRef = useRef(isVideo)
  const [videoOff, setVideoOff] = useState(false)
  const [connected, setConnected] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [netWeak, setNetWeak] = useState(false)
  const [ctrlShown, setCtrlShown] = useState(true)
  const [swapped, setSwapped] = useState(false)

  // Animations
  const ctrlOpacity = useRef(new Animated.Value(1)).current
  const pipScale = useRef(new Animated.Value(0)).current
  const pipSizeScale = useRef(new Animated.Value(1)).current
  const pipSizeRef = useRef(1)
  const remoteOpacity = useRef(new Animated.Value(0)).current
  const avatarOp = useRef(new Animated.Value(0)).current
  const avatarSc = useRef(new Animated.Value(0.7)).current
  const topBarOp = useRef(new Animated.Value(0)).current
  const topBarY = useRef(new Animated.Value(-20)).current
  const ctrlBarOp = useRef(new Animated.Value(0)).current
  const ctrlBarY = useRef(new Animated.Value(40)).current
  const timerGlowAnim = useRef(new Animated.Value(0)).current

  const pipInitX = W - PIP_W - PIP_MARGIN
  const pipInitY = Platform.OS === 'android' ? 90 : 110
  const pipPan = useRef(new Animated.ValueXY({ x: pipInitX, y: pipInitY })).current
  const pipPanOffset = useRef({ x: pipInitX, y: pipInitY })

  const timerRef = useRef(null)
  const mountedRef = useRef(true)
  const setupDone = useRef(false)
  const ctrlTimer = useRef(null)
  const connectedRef = useRef(false)
  const dragStartRef = useRef(null)
  const pcReadyRef = useRef(false)
  const remoteDescSetRef = useRef(false)
  const pendingOfferRef = useRef(null)
  const pendingAnswerRef = useRef(null)
  const pendingIceRef = useRef([])
  const offerSentRef = useRef(false)
  const lastDistRef = useRef(null)

  // Entry animation
  useEffect(() => {
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(topBarOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(topBarY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(avatarSc, { toValue: 1, tension: 65, friction: 7, useNativeDriver: true }),
        Animated.timing(avatarOp, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ctrlBarOp, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(ctrlBarY, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start()
  }, [])

  // Timer glow pulse when connected
  useEffect(() => {
    if (!connected) return
    Animated.loop(Animated.sequence([
      Animated.timing(timerGlowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(timerGlowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ])).start()
  }, [connected])

  // PanResponder for PiP drag
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, g) => g.numberActiveTouches === 1,
      onMoveShouldSetPanResponder: (_, g) =>
        g.numberActiveTouches === 1 && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
      onPanResponderGrant: (_, g) => {
        dragStartRef.current = { x: g.x0, y: g.y0 }
        pipPan.setOffset(pipPanOffset.current)
        pipPan.setValue({ x: 0, y: 0 })
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pipPan.x, dy: pipPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, g) => {
        pipPan.flattenOffset()
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          setSwapped(p => !p); return
        }
        const cx = pipPanOffset.current.x + g.dx
        const cy = pipPanOffset.current.y + g.dy
        const snapX = cx < W / 2 ? PIP_MARGIN : PIP_MAX_X
        const snapY = Math.max(Platform.OS === 'android' ? 80 : 100, Math.min(cy, PIP_MAX_Y))
        Animated.spring(pipPan, { toValue: { x: snapX, y: snapY }, useNativeDriver: false, tension: 120, friction: 10 }).start()
        pipPanOffset.current = { x: snapX, y: snapY }
      },
    })
  ).current

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, g) => g.numberActiveTouches === 2,
      onMoveShouldSetPanResponder: (_, g) => g.numberActiveTouches === 2,
      onPanResponderGrant: () => { lastDistRef.current = null },
      onPanResponderMove: (e) => {
        const t = e.nativeEvent.touches
        if (t.length < 2) return
        const d = Math.sqrt((t[0].pageX - t[1].pageX) ** 2 + (t[0].pageY - t[1].pageY) ** 2)
        if (lastDistRef.current !== null) {
          const next = Math.min(Math.max(pipSizeRef.current * (d / lastDistRef.current), 0.5), 2.5)
          pipSizeRef.current = next
          pipSizeScale.setValue(next)
        }
        lastDistRef.current = d
      },
      onPanResponderRelease: () => {
        lastDistRef.current = null
        const cur = pipSizeRef.current
        const snapped = cur < 0.85 ? 0.7 : cur > 1.3 ? 1.6 : 1.0
        pipSizeRef.current = snapped
        Animated.spring(pipSizeScale, { toValue: snapped, useNativeDriver: false, tension: 150, friction: 8 }).start()
      },
    })
  ).current

  const scheduleHide = useCallback(() => {
    if (!isVideo) return
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current)
    ctrlTimer.current = setTimeout(() => {
      Animated.timing(ctrlOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start()
      setCtrlShown(false)
    }, 4500)
  }, [isVideo])

  const bringCtrl = useCallback(() => {
    setCtrlShown(true)
    Animated.timing(ctrlOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    scheduleHide()
  }, [scheduleHide])

  useEffect(() => {
    if (isVideo && connected) scheduleHide()
    return () => { if (ctrlTimer.current) clearTimeout(ctrlTimer.current) }
  }, [isVideo, connected])

  useEffect(() => {
    if (connected && isVideo) {
      Animated.spring(pipScale, { toValue: 1, useNativeDriver: false, tension: 120, friction: 8 }).start()
    }
  }, [connected, isVideo])

  const handleEnd = useCallback((remote = false) => {
    if (!remote) getSocket()?.emit('call:end', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) { }
  }, [callId, dispatch, router])

  useEffect(() => {
    mountedRef.current = true
    connectedRef.current = false
    if (!callId || !roomId || setupDone.current) return
    setupDone.current = true

    const socket = getSocket()
    if (isOutgoing) startRingback().catch(() => { })

    const processOffer = async (offer) => {
      try {
        await setRemoteDescription(offer)
        remoteDescSetRef.current = true
        for (const c of pendingIceRef.current) { try { await addIceCandidate(c) } catch (_) { } }
        pendingIceRef.current = []
        const answer = await createAnswer()
        socket?.emit('webrtc:answer', { callId, answer })
      } catch (err) { console.error('[Call] processOffer:', err.message) }
    }

    const processAnswer = async (answer) => {
      try {
        await setRemoteDescription(answer)
        remoteDescSetRef.current = true
        for (const c of pendingIceRef.current) { try { await addIceCandidate(c) } catch (_) { } }
        pendingIceRef.current = []
      } catch (err) { console.error('[Call] processAnswer:', err.message) }
    }

    const sendOffer = async () => {
      if (offerSentRef.current) return
      offerSentRef.current = true
      try {
        const offer = await createOffer()
        socket?.emit('webrtc:offer', { callId, offer })
      } catch (err) { console.error('[Call] sendOffer:', err.message); offerSentRef.current = false }
    }

    const onOffer = ({ callId: cid, offer }) => { if (cid !== callId) return; if (!pcReadyRef.current) { pendingOfferRef.current = offer; return } processOffer(offer) }
    const onAnswer = ({ callId: cid, answer }) => { if (cid !== callId) return; if (!pcReadyRef.current) { pendingAnswerRef.current = answer; return } processAnswer(answer) }
    const onIce = ({ callId: cid, candidate }) => {
      if (cid !== callId || !candidate) return
      if (!pcReadyRef.current || !remoteDescSetRef.current) { pendingIceRef.current.push(candidate); return }
      addIceCandidate(candidate).catch(() => { })
    }
    const onStartOffer = ({ callId: cid }) => { if (cid !== callId || !isOutgoing || !pcReadyRef.current) return; sendOffer() }
    const onEnd = () => { if (mountedRef.current) handleEnd(true) }

    socket?.on('webrtc:offer', onOffer)
    socket?.on('webrtc:answer', onAnswer)
    socket?.on('webrtc:ice-candidate', onIce)
    socket?.on('webrtc:start_offer', onStartOffer)
    socket?.on('call:ended', onEnd)
    socket?.on('call:rejected', onEnd)
    socket?.on('call:canceled', onEnd)

    const setup = async () => {
      try {
        const ok = await requestCallPermissions(isVideo ? 'video' : 'voice')
        if (!ok || !mountedRef.current) { handleEnd(true); return }
        startAudioSession(isVideo ? 'video' : 'audio')
        const stream = await initLocalStream(isVideo)
        if (!mountedRef.current) return
        setLocalStreamState(stream)
        setSpeaker(isVideo)
        createPeerConnection({
          onRemoteStream: (rs) => {
            if (!mountedRef.current || connectedRef.current) return
            connectedRef.current = true
            stopRingback().catch(() => { })
            setRemoteStreamState(rs)
            setConnected(true)
            setNetWeak(false)
            Animated.timing(remoteOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start()
            if (isVideo) scheduleHide()
            if (!timerRef.current) timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
            // ✅ FIX: connect হওয়ার পরে WebRTC audio reset করে, তাই আবার set করতে হয়
            setTimeout(() => { setSpeaker(speakerOnRef.current) }, 500)
          },
          onIceCandidate: (candidate) => { socket?.emit('webrtc:ice-candidate', { callId, candidate }) },
          onConnectionStateChange: (state) => {
            if (state === 'failed' || state === 'disconnected') setNetWeak(true)
            if (state === 'connected') setNetWeak(false)
          },
          onError: (err) => { console.error('[Call] PC Error:', err); if (mountedRef.current) handleEnd(true) },
        })
        pcReadyRef.current = true
        if (pendingOfferRef.current) { const o = pendingOfferRef.current; pendingOfferRef.current = null; await processOffer(o) }
        if (pendingAnswerRef.current) { const a = pendingAnswerRef.current; pendingAnswerRef.current = null; await processAnswer(a) }
        socket?.emit('webrtc:ready', { callId }, () => { })
        if (isOutgoing) {
          setTimeout(() => {
            if (mountedRef.current && pcReadyRef.current && !offerSentRef.current) sendOffer()
          }, 1500)
        }
      } catch (err) {
        console.error('[Call] Setup error:', err)
        if (mountedRef.current) handleEnd(true)
      }
    }

    setup()

    return () => {
      mountedRef.current = false
      stopRingback().catch(() => { })
      const s = getSocket()
      s?.off('webrtc:offer', onOffer)
      s?.off('webrtc:answer', onAnswer)
      s?.off('webrtc:ice-candidate', onIce)
      s?.off('webrtc:start_offer', onStartOffer)
      s?.off('call:ended', onEnd)
      s?.off('call:rejected', onEnd)
      s?.off('call:canceled', onEnd)
      if (timerRef.current) clearInterval(timerRef.current)
      if (ctrlTimer.current) clearTimeout(ctrlTimer.current)
      cleanup()
    }
  }, [callId, roomId])

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const statusText =
    netWeak && connected ? 'Weak signal…'
      : connected ? fmt(seconds)
        : isOutgoing ? 'Ringing…'
          : 'Connecting…'

  const accentColor = isVideo ? C.accent : C.green

  // ── Video renderers ───────────────────────────────────────────────────────
  const renderFullscreen = (stream, mirror = false, opacity = null) => {
    const inner = isWeb
      ? <WebVideoView stream={stream} mirror={mirror} />
      : <RTCView streamURL={stream?.toURL?.()} style={{ flex: 1 }} objectFit="cover" mirror={mirror} />
    if (opacity) return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{inner}</Animated.View>
    return <View style={StyleSheet.absoluteFill}>{inner}</View>
  }

  const renderPip = (stream, mirror = false, label = null) => {
    if (!stream) return null
    return (
      <Animated.View
        style={[s.pipBox, { transform: [{ translateX: pipPan.x }, { translateY: pipPan.y }] }]}
        {...pinchResponder.panHandlers}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ flex: 1, transform: [{ scale: pipScale }, { scale: pipSizeScale }] }}>
          <View style={s.pipClip}>
            {isWeb
              ? <WebVideoView stream={stream} mirror={mirror} />
              : <RTCView streamURL={stream?.toURL?.()} style={s.pipRTCView} objectFit="cover" mirror={mirror} />
            }
            {label && (
              <View style={s.pipLabel}>
                <Text style={s.pipLabelTxt}>{label}</Text>
              </View>
            )}
            {/* Drag handle dots */}
            <View style={s.pipHandle}>
              {[0, 1, 2].map(i => <View key={i} style={s.dot} />)}
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    )
  }

  const renderWaitingCamera = () => {
    if (!isVideo || connected || !localStreamState || videoOff) return null
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {isWeb
          ? <WebVideoView stream={localStreamState} mirror />
          : <RTCView streamURL={localStreamState.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror />
        }
        <View style={s.waitingOverlay} />
      </View>
    )
  }

  const renderVideoLayers = () => {
    if (!isVideo || !connected) return null
    if (!swapped) {
      return (
        <>
          {remoteStreamState && renderFullscreen(remoteStreamState, false, remoteOpacity)}
          {!videoOff && localStreamState && renderPip(localStreamState, true, 'You')}
          {videoOff && (
            <Animated.View style={[s.pipBox, { transform: [{ translateX: pipPan.x }, { translateY: pipPan.y }] }]}
              {...pinchResponder.panHandlers} {...panResponder.panHandlers}>
              <Animated.View style={{ flex: 1, transform: [{ scale: pipScale }, { scale: pipSizeScale }] }}>
                <View style={s.pipClip}>
                  <View style={s.pipOff}><Ionicons name="videocam-off" size={22} color={C.whiteD} /></View>
                </View>
              </Animated.View>
            </Animated.View>
          )}
        </>
      )
    } else {
      return (
        <>
          {localStreamState && !videoOff && renderFullscreen(localStreamState, true)}
          {videoOff && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0D1220', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="videocam-off" size={44} color={C.whiteDD} />
              <Text style={{ color: C.whiteDD, marginTop: 10, fontSize: 14 }}>Camera off</Text>
            </View>
          )}
          {remoteStreamState && renderPip(remoteStreamState, false, peerName)}
        </>
      )
    }
  }

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={s.root}
      onPress={isVideo && connected ? bringCtrl : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Background ── */}
      {(!isVideo || !connected) && <SpaceBackground accent={isVideo ? 'blue' : 'green'} />}

      {renderWaitingCamera()}
      {renderVideoLayers()}

      {/* ── Top bar ── */}
      <SafeAreaView style={s.topSafe}>
        <Animated.View style={[s.topBar, {
          opacity: topBarOp,
          transform: [{ translateY: topBarY }],
        }]}>
          {/* Type pill */}
          <View style={[s.typePill, { borderColor: accentColor + '40', backgroundColor: accentColor + '15' }]}>
            <View style={[s.typeDot, { backgroundColor: accentColor }]} />
            <Text style={[s.typeTxt, { color: accentColor }]}>
              {isVideo ? 'Video Call' : 'Voice Call'}
            </Text>
          </View>

          {/* Timer / status */}
          <Animated.View style={[s.timerWrap, {
            shadowColor: connected ? C.green : 'transparent',
            shadowOpacity: timerGlowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
          }]}>
            <Text style={[
              s.durationTxt,
              netWeak && { color: C.amber },
              connected && !netWeak && { color: C.green },
            ]}>
              {statusText}
            </Text>
          </Animated.View>

          {/* Swap hint */}
          {isVideo && connected && (
            <TouchableOpacity onPress={() => setSwapped(p => !p)} style={s.swapPill}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="swap-horizontal" size={12} color={C.whiteDD} />
              <Text style={s.swapTxt}>Tap preview to swap</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </SafeAreaView>

      {/* ── Avatar / name (voice or waiting) ── */}
      {(!isVideo || !connected) && (
        <View style={s.center} pointerEvents="none">
          <Animated.View style={{ alignItems: 'center', opacity: avatarOp, transform: [{ scale: avatarSc }] }}>

            {/* Ripple rings */}
            <PulseRings color={accentColor} active={!connected} />

            {/* Avatar */}
            <View style={[s.avatarGlassRing, { borderColor: accentColor + '55', shadowColor: accentColor }]}>
              {peerAvatar
                ? <Image source={{ uri: peerAvatar }} style={s.avatarImg} />
                : (
                  <View style={[s.avatarFallback, { backgroundColor: accentColor + '20' }]}>
                    <Text style={[s.avatarLetter, { color: accentColor }]}>
                      {(peerName?.[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                )
              }
            </View>

            {/* Name */}
            <Text style={s.peerName}>{peerName}</Text>

            {/* Status pill */}
            <View style={[s.statusPill, { borderColor: accentColor + '35' }]}>
              {!connected && <View style={[s.statusDotAnim, { backgroundColor: accentColor }]} />}
              <Text style={[s.statusTxt, netWeak && { color: C.amber }]}>{statusText}</Text>
            </View>
          </Animated.View>
        </View>
      )}

      {/* ── Controls bar ── */}
      <Animated.View
        style={[
          s.ctrlOuter,
          isVideo && connected && { opacity: ctrlOpacity },
          { opacity: Animated.multiply(isVideo && connected ? ctrlOpacity : new Animated.Value(1), ctrlBarOp) },
          { transform: [{ translateY: ctrlBarY }] },
        ]}
        pointerEvents={ctrlShown || !isVideo ? 'auto' : 'none'}
      >
        <SafeAreaView>
          {/* Frosted glass bar */}
          <View style={s.ctrlBar}>
            {/* Thin top separator line */}
            <View style={s.ctrlBarLine} />

            <View style={s.controls}>
              <CtrlBtn
                icon={muted ? 'mic-off' : 'mic'}
                label={muted ? 'Unmute' : 'Mute'}
                active={muted}
                onPress={() => { const v = !muted; setM(v); setMuted(v) }}
              />

              {isVideo && (
                <CtrlBtn
                  icon={videoOff ? 'videocam-off' : 'videocam'}
                  label={videoOff ? 'Start Cam' : 'Stop Cam'}
                  active={videoOff}
                  onPress={() => { const v = !videoOff; setVideoOff(v); setVideoMuted(v) }}
                />
              )}

              {/* End call — center, bigger */}
              <CtrlBtn
                icon="call"
                label="End Call"
                danger
                onPress={() => handleEnd(false)}
              />

              {isVideo && (
                <CtrlBtn
                  icon="camera-reverse"
                  label="Flip"
                  onPress={() => switchCamera()}
                />
              )}

              {!isVideo && (
                <CtrlBtn
                  icon={speakerOn ? 'volume-high' : 'volume-low'}
                  label={speakerOn ? 'Speaker' : 'Earpiece'}
                  active={speakerOn}
                  onPress={() => { const n = !speakerOn; setSpeakerOn(n); speakerOnRef.current = n; setSpeaker(n) }}
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    </TouchableOpacity>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  waitingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,8,16,0.52)',
  },

  // ── Top bar ──
  topSafe: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    paddingTop: Platform.OS === 'android' ? 36 : 0,
  },
  topBar: {
    alignItems: 'center',
    paddingTop: 14,
    gap: 8,
  },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 24,
  },
  typeDot: {
    width: 6, height: 6, borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 4,
  },
  typeTxt: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },

  timerWrap: { elevation: 0 },
  durationTxt: {
    color: C.whiteDD,
    fontSize: 16,
    fontWeight: '300',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },

  swapPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, marginTop: 2,
  },
  swapTxt: { color: C.whiteDD, fontSize: 10, letterSpacing: 0.3 },

  // ── Center avatar ──
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 70,
    paddingBottom: 160,
    zIndex: 10,
  },

  avatarGlassRing: {
    width: 152, height: 152, borderRadius: 76,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 18,
    marginBottom: 28,
  },
  avatarImg: {
    width: '100%', height: '100%', borderRadius: 74,
  },
  avatarFallback: {
    width: '100%', height: '100%', borderRadius: 74,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 58, fontWeight: '700',
  },

  peerName: {
    color: C.white,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    maxWidth: W - 60,
    textAlign: 'center',
  },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  statusDotAnim: {
    width: 6, height: 6, borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 5,
  },
  statusTxt: {
    color: C.whiteDD,
    fontSize: 13,
    letterSpacing: 1.0,
    fontWeight: '400',
  },

  // ── Controls bar ──
  ctrlOuter: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
  },
  ctrlBar: {
    backgroundColor: 'rgba(10,14,24,0.88)',
    borderTopWidth: 0,
  },
  ctrlBarLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 0,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 30,
  },

  ctrlWrap: { alignItems: 'center', gap: 8, minWidth: 64 },
  ctrl: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  ctrlLbl: {
    color: C.whiteDD,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // ── PiP ──
  pipBox: {
    position: 'absolute', width: PIP_W, height: PIP_H, zIndex: 25,
  },
  pipClip: {
    flex: 1, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#111820',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 10, elevation: 10,
  },
  pipRTCView: { flex: 1, borderRadius: 14 },
  pipOff: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  pipLabel: {
    position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center',
  },
  pipLabelTxt: {
    color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  pipHandle: {
    position: 'absolute', top: 7, right: 7,
    flexDirection: 'row', gap: 3,
  },
  dot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
})