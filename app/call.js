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
  try { RTCView = require('react-native-webrtc').RTCView } catch (_) {}
}

function WebVideoView({ stream, mirror = false, style }) {
  const videoRef = useRef(null)
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream }, [stream])
  return (
    <video ref={videoRef} autoPlay playsInline muted={mirror}
      style={{ width: '100%', height: '100%', objectFit: 'cover',
        transform: mirror ? 'scaleX(-1)' : 'none', ...style }} />
  )
}

const { width: W, height: H } = Dimensions.get('window')

// PiP size constants
const PIP_W = 100
const PIP_H = 148
const PIP_MARGIN = 14
// Safe boundaries so PiP stays on screen
const PIP_MAX_X = W - PIP_W - PIP_MARGIN
const PIP_MAX_Y = H - PIP_H - 120 // above controls bar

const C = {
  bg: '#000000', accent: '#0084FF', green: '#31A24C', red: '#FA3E3E',
  white: '#FFFFFF', whiteD: 'rgba(255,255,255,0.75)', whiteDD: 'rgba(255,255,255,0.42)',
  ctrl: 'rgba(255,255,255,0.15)', ctrlOn: 'rgba(255,255,255,0.30)',
}

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
  const [videoOff, setVideoOff] = useState(false)
  const [connected, setConnected] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [netWeak, setNetWeak] = useState(false)
  const [ctrlShown, setCtrlShown] = useState(true)
  const [swapped, setSwapped] = useState(false)

  const ctrlOpacity   = useRef(new Animated.Value(1)).current
  const pipScale      = useRef(new Animated.Value(0)).current
  const pipSizeScale  = useRef(new Animated.Value(1)).current
  const pipSizeRef    = useRef(1)
  const remoteOpacity = useRef(new Animated.Value(0)).current
  const pulseAnim     = useRef(new Animated.Value(1)).current

  const pipInitX = W - PIP_W - PIP_MARGIN
  const pipInitY = Platform.OS === 'android' ? 88 : 108
  const pipPan   = useRef(new Animated.ValueXY({ x: pipInitX, y: pipInitY })).current
  const pipPanOffset = useRef({ x: pipInitX, y: pipInitY })

  const timerRef         = useRef(null)
  const mountedRef       = useRef(true)
  const setupDone        = useRef(false)
  const ctrlTimer        = useRef(null)
  const connectedRef     = useRef(false)
  const dragStartRef     = useRef(null)
  const pcReadyRef       = useRef(false)
  const remoteDescSetRef = useRef(false)
  const pendingOfferRef  = useRef(null)
  const pendingAnswerRef = useRef(null)
  const pendingIceRef    = useRef([])
  const offerSentRef     = useRef(false)

  // ── PanResponder for draggable PiP ────────────────────────────────────────
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

        const dx = Math.abs(g.dx)
        const dy = Math.abs(g.dy)
        const isTap = dx < 6 && dy < 6

        if (isTap) {
          setSwapped((prev) => !prev)
          return
        }

        const currentX = pipPanOffset.current.x + g.dx
        const currentY = pipPanOffset.current.y + g.dy

        const snapX = currentX < W / 2 ? PIP_MARGIN : PIP_MAX_X
        const snapY = Math.max(
          Platform.OS === 'android' ? 80 : 100,
          Math.min(currentY, PIP_MAX_Y)
        )

        Animated.spring(pipPan, {
          toValue: { x: snapX, y: snapY },
          useNativeDriver: false,
          tension: 120,
          friction: 10,
        }).start()

        pipPanOffset.current = { x: snapX, y: snapY }
      },
    })
  ).current

  // ── PinchResponder for resizable PiP ──────────────────────────────────────
  const lastDistRef = useRef(null)
  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, g) => g.numberActiveTouches === 2,
      onMoveShouldSetPanResponder: (_, g) => g.numberActiveTouches === 2,

      onPanResponderGrant: () => {
        lastDistRef.current = null
      },

      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches
        if (touches.length < 2) return

        const dx = touches[0].pageX - touches[1].pageX
        const dy = touches[0].pageY - touches[1].pageY
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (lastDistRef.current !== null) {
          const delta = dist / lastDistRef.current
          const next = Math.min(Math.max(pipSizeRef.current * delta, 0.5), 2.5)
          pipSizeRef.current = next
          pipSizeScale.setValue(next)
        }
        lastDistRef.current = dist
      },

      onPanResponderRelease: () => {
        lastDistRef.current = null
        const cur = pipSizeRef.current
        const snapped = cur < 0.85 ? 0.7 : cur > 1.3 ? 1.6 : 1.0
        pipSizeRef.current = snapped
        Animated.spring(pipSizeScale, {
          toValue: snapped,
          useNativeDriver: false,
          tension: 150,
          friction: 8,
        }).start()
      },
    })
  ).current

  // ── Pulse animation (waiting state) ───────────────────────────────────────
  useEffect(() => {
    if (connected) return
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.07, duration: 950, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0,  duration: 950, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [connected])

  // ── Controls auto-hide ────────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (!isVideo) return
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current)
    ctrlTimer.current = setTimeout(() => {
      Animated.timing(ctrlOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start()
      setCtrlShown(false)
    }, 4500)
  }, [isVideo])

  const bringCtrl = useCallback(() => {
    setCtrlShown(true)
    Animated.timing(ctrlOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    scheduleHide()
  }, [scheduleHide])

  useEffect(() => {
    if (isVideo && connected) scheduleHide()
    return () => { if (ctrlTimer.current) clearTimeout(ctrlTimer.current) }
  }, [isVideo, connected])

  useEffect(() => {
    if (connected && isVideo) {
      Animated.spring(pipScale, {
        toValue: 1,
        useNativeDriver: false,
        tension: 120,
        friction: 8,
      }).start()
    }
  }, [connected, isVideo])

  // ── handleEnd ─────────────────────────────────────────────────────────────
  const handleEnd = useCallback((remote = false) => {
    if (!remote) getSocket()?.emit('call:end', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }, [callId, dispatch, router])

  // ══════════════════════════════════════════════════════════════════════════
  //  MAIN SETUP
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    mountedRef.current = true
    connectedRef.current = false

    if (!callId || !roomId) return
    if (setupDone.current) return
    setupDone.current = true

    const socket = getSocket()
    if (isOutgoing) startRingback().catch(() => {})

    const processOffer = async (offer) => {
      try {
        await setRemoteDescription(offer)
        remoteDescSetRef.current = true
        for (const c of pendingIceRef.current) {
          try { await addIceCandidate(c) } catch (_) {}
        }
        pendingIceRef.current = []
        const answer = await createAnswer()
        socket?.emit('webrtc:answer', { callId, answer })
      } catch (err) {
        console.error('[Call] processOffer error:', err.message)
      }
    }

    const processAnswer = async (answer) => {
      try {
        await setRemoteDescription(answer)
        remoteDescSetRef.current = true
        for (const c of pendingIceRef.current) {
          try { await addIceCandidate(c) } catch (_) {}
        }
        pendingIceRef.current = []
      } catch (err) {
        console.error('[Call] processAnswer error:', err.message)
      }
    }

    const sendOffer = async () => {
      if (offerSentRef.current) return
      offerSentRef.current = true
      try {
        const offer = await createOffer()
        socket?.emit('webrtc:offer', { callId, offer })
      } catch (err) {
        console.error('[Call] sendOffer error:', err.message)
        offerSentRef.current = false
      }
    }

    const onOffer = ({ callId: cid, offer }) => {
      if (cid !== callId) return
      if (!pcReadyRef.current) { pendingOfferRef.current = offer; return }
      processOffer(offer)
    }
    const onAnswer = ({ callId: cid, answer }) => {
      if (cid !== callId) return
      if (!pcReadyRef.current) { pendingAnswerRef.current = answer; return }
      processAnswer(answer)
    }
    const onIce = ({ callId: cid, candidate }) => {
      if (cid !== callId || !candidate) return
      if (!pcReadyRef.current || !remoteDescSetRef.current) {
        pendingIceRef.current.push(candidate)
        return
      }
      addIceCandidate(candidate).catch(() => {})
    }
    const onStartOffer = ({ callId: cid }) => {
      if (cid !== callId || !isOutgoing || !pcReadyRef.current) return
      sendOffer()
    }
    const onEnd = () => { if (mountedRef.current) handleEnd(true) }

    socket?.on('webrtc:offer',         onOffer)
    socket?.on('webrtc:answer',        onAnswer)
    socket?.on('webrtc:ice-candidate', onIce)
    socket?.on('webrtc:start_offer',   onStartOffer)
    socket?.on('call:ended',           onEnd)
    socket?.on('call:rejected',        onEnd)
    socket?.on('call:canceled',        onEnd)

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
            stopRingback().catch(() => {})
            setRemoteStreamState(rs)
            setConnected(true)
            setNetWeak(false)
            Animated.timing(remoteOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
            if (isVideo) scheduleHide()
            if (!timerRef.current) {
              timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
            }
          },
          onIceCandidate: (candidate) => {
            socket?.emit('webrtc:ice-candidate', { callId, candidate })
          },
          onConnectionStateChange: (state) => {
            if (state === 'failed' || state === 'disconnected') setNetWeak(true)
            if (state === 'connected') setNetWeak(false)
          },
          onError: (err) => {
            console.error('[Call] PC Error:', err)
            if (mountedRef.current) handleEnd(true)
          },
        })

        pcReadyRef.current = true

        if (pendingOfferRef.current) {
          const o = pendingOfferRef.current; pendingOfferRef.current = null
          await processOffer(o)
        }
        if (pendingAnswerRef.current) {
          const a = pendingAnswerRef.current; pendingAnswerRef.current = null
          await processAnswer(a)
        }

        socket?.emit('webrtc:ready', { callId }, () => {})

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
      stopRingback().catch(() => {})
      const s = getSocket()
      s?.off('webrtc:offer',         onOffer)
      s?.off('webrtc:answer',        onAnswer)
      s?.off('webrtc:ice-candidate', onIce)
      s?.off('webrtc:start_offer',   onStartOffer)
      s?.off('call:ended',           onEnd)
      s?.off('call:rejected',        onEnd)
      s?.off('call:canceled',        onEnd)
      if (timerRef.current)  clearInterval(timerRef.current)
      if (ctrlTimer.current) clearTimeout(ctrlTimer.current)
      cleanup()
    }
  }, [callId, roomId])

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const statusText =
    netWeak && connected ? '⚡ Weak network…'
    : connected ? fmt(seconds)
    : isOutgoing ? 'Ringing…'
    : 'Connecting…'

  // ── Video stream renderer (fullscreen) ────────────────────────────────────
  const renderFullscreen = (stream, mirror = false, opacity = null) => {
    const inner = isWeb
      ? <WebVideoView stream={stream} mirror={mirror} />
      : <RTCView streamURL={stream?.toURL?.()} style={{ flex: 1 }} objectFit="cover" mirror={mirror} />

    if (opacity) {
      return (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          {inner}
        </Animated.View>
      )
    }
    return <View style={StyleSheet.absoluteFill}>{inner}</View>
  }

  // ── Video stream renderer (PiP) ───────────────────────────────────────────
  //
  // FIX: scale transform এবং overflow:hidden একই Animated.View এ রাখা যাবে না।
  // Android এ scale transform overflow:hidden কে bypass করে।
  // Solution:
  //   1. Outer Animated.View → শুধু translate transform (position)
  //   2. Inner Animated.View → শুধু scale transform
  //   3. Plain View (pipClip) → overflow:'hidden' + borderRadius (actual clipping)
  //   4. RTCView → flex:1 (absoluteFill নয়)
  //
  const renderPip = (stream, mirror = false, label = null) => {
    if (!stream) return null
    return (
      <Animated.View
        style={[s.pipBox, {
          transform: [{ translateX: pipPan.x }, { translateY: pipPan.y }],
        }]}
        {...pinchResponder.panHandlers}
        {...panResponder.panHandlers}
      >
        {/* ✅ FIX: scale আলাদা Animated.View এ — overflow:hidden এর সাথে মিশবে না */}
        <Animated.View style={{
          flex: 1,
          transform: [{ scale: pipScale }, { scale: pipSizeScale }],
        }}>
          {/* ✅ FIX: plain View এ overflow:hidden + borderRadius → Android এ সঠিকভাবে clip করে */}
          <View style={s.pipClip}>
            {isWeb
              ? <WebVideoView stream={stream} mirror={mirror} />
              : (
                <RTCView
                  streamURL={stream?.toURL?.()}
                  style={s.pipRTCView}
                  objectFit="cover"
                  mirror={mirror}
                />
              )
            }
            {label && (
              <View style={s.pipLabel}>
                <Text style={s.pipLabelTxt}>{label}</Text>
              </View>
            )}
            <View style={s.pipHandle}>
              <View style={s.dot}/><View style={s.dot}/><View style={s.dot}/>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    )
  }

  // ── Waiting camera background (before connected) ──────────────────────────
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

  // ── Decide what to render when connected ──────────────────────────────────
  const renderVideoLayers = () => {
    if (!isVideo || !connected) return null

    if (!swapped) {
      return (
        <>
          {remoteStreamState && renderFullscreen(remoteStreamState, false, remoteOpacity)}
          {!videoOff && localStreamState && renderPip(localStreamState, true, 'You')}
          {videoOff && (
            <Animated.View
              style={[s.pipBox, {
                transform: [{ translateX: pipPan.x }, { translateY: pipPan.y }],
              }]}
              {...pinchResponder.panHandlers}
              {...panResponder.panHandlers}
            >
              <Animated.View style={{ flex: 1, transform: [{ scale: pipScale }, { scale: pipSizeScale }] }}>
                <View style={s.pipClip}>
                  <View style={s.pipOff}>
                    <Ionicons name="videocam-off" size={20} color={C.whiteD} />
                  </View>
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
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="videocam-off" size={48} color={C.whiteD} />
              <Text style={{ color: C.whiteD, marginTop: 10, fontSize: 14 }}>Camera off</Text>
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
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {renderWaitingCamera()}
      {renderVideoLayers()}

      {/* ── Top bar ── */}
      <SafeAreaView style={s.topSafe}>
        <View style={s.topBar}>
          <View style={s.typePill}>
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={12} color={C.white} />
            <Text style={s.typeTxt}>{isVideo ? 'Video Call' : 'Voice Call'}</Text>
          </View>
          <Text style={[s.durationTxt, netWeak && { color: '#FFB800' }]}>{statusText}</Text>
          {isVideo && connected && (
            <TouchableOpacity
              onPress={() => setSwapped((p) => !p)}
              style={s.swapHint}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="swap-horizontal" size={14} color={C.whiteD} />
              <Text style={s.swapHintTxt}>Tap preview to swap</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* ── Avatar / name (voice call or waiting) ── */}
      {(!isVideo || !connected) && (
        <View style={s.center} pointerEvents="none">
          <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center' }}>
            <View style={s.avatarRing}>
              {peerAvatar
                ? <Image source={{ uri: peerAvatar }} style={s.avatar} />
                : (
                  <View style={[s.avatar, s.avatarFb]}>
                    <Text style={s.avatarLetter}>{(peerName?.[0] || '?').toUpperCase()}</Text>
                  </View>
                )
              }
            </View>
            <Text style={s.peerName}>{peerName}</Text>
            <Text style={s.subTxt}>{statusText}</Text>
          </Animated.View>
        </View>
      )}

      {/* ── Controls ── */}
      <Animated.View
        style={[s.ctrlOuter, isVideo && connected && { opacity: ctrlOpacity }]}
        pointerEvents={ctrlShown || !isVideo ? 'auto' : 'none'}
      >
        <SafeAreaView>
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
                label={videoOff ? 'Start' : 'Stop'}
                active={videoOff}
                onPress={() => { const v = !videoOff; setVideoOff(v); setVideoMuted(v) }}
              />
            )}
            <EndBtn onPress={() => handleEnd(false)} />
            {isVideo && <CtrlBtn icon="camera-reverse" label="Flip" onPress={() => switchCamera()} />}
            {!isVideo && (
              <CtrlBtn
                icon={speakerOn ? 'volume-high' : 'volume-low'}
                label={speakerOn ? 'Speaker' : 'Ear'}
                active={speakerOn}
                onPress={() => {
                  const next = !speakerOn
                  setSpeakerOn(next)
                  setSpeaker(next)
                }}
              />
            )}
          </View>
        </SafeAreaView>
      </Animated.View>
    </TouchableOpacity>
  )
}

// ── Buttons ───────────────────────────────────────────────────────────────────
function EndBtn({ onPress }) {
  const sc = useRef(new Animated.Value(1)).current
  return (
    <TouchableOpacity onPress={onPress}
      onPressIn={() => Animated.spring(sc, { toValue: 0.88, useNativeDriver: true, speed: 60 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 60 }).start()}
      activeOpacity={1}>
      <Animated.View style={[s.endBtn, { transform: [{ scale: sc }] }]}>
        <Ionicons name="call" size={28} color={C.white} style={{ transform: [{ rotate: '135deg' }] }} />
      </Animated.View>
    </TouchableOpacity>
  )
}

function CtrlBtn({ icon, label, onPress, active = false }) {
  const sc = useRef(new Animated.Value(1)).current
  return (
    <TouchableOpacity onPress={onPress}
      onPressIn={() => Animated.spring(sc, { toValue: 0.86, useNativeDriver: true, speed: 60 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 60 }).start()}
      activeOpacity={1} style={s.ctrlWrap}>
      <Animated.View style={[s.ctrl, active && s.ctrlActive, { transform: [{ scale: sc }] }]}>
        <Ionicons name={icon} size={22} color={C.white} />
      </Animated.View>
      <Text style={s.ctrlLbl}>{label}</Text>
    </TouchableOpacity>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  waitingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },

  topSafe: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    paddingTop: Platform.OS === 'android' ? 32 : 0,
  },
  topBar: { alignItems: 'center', paddingTop: 14, gap: 6 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  typeTxt: { color: C.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  durationTxt: { color: C.whiteD, fontSize: 14, fontWeight: '400', letterSpacing: 0.8 },
  swapHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    marginTop: 2,
  },
  swapHintTxt: { color: C.whiteD, fontSize: 11 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 60, paddingBottom: 160, zIndex: 10,
  },
  avatarRing: {
    borderRadius: 78, padding: 3, borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: C.accent, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 28, elevation: 14, marginBottom: 22,
  },
  avatar: { width: 144, height: 144, borderRadius: 72 },
  avatarFb: { backgroundColor: C.accent + '44', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: C.white, fontSize: 56, fontWeight: '700' },
  peerName: {
    color: C.white, fontSize: 27, fontWeight: '700', letterSpacing: 0.2,
    marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  subTxt: { color: C.whiteDD, fontSize: 14, letterSpacing: 1.2 },

  pipBox: {
    position: 'absolute',
    width: PIP_W,
    height: PIP_H,
    zIndex: 25,
    // ✅ FIX: shadow/elevation সরানো — এগুলো border এর মতো দেখাচ্ছিল
    // এবং Android এ overflow:hidden কে ভাঙছিল
  },

  // ✅ FIX: plain View এ overflow:'hidden' + borderRadius
  // Animated.View এ scale transform থাকলে overflow:hidden কাজ করে না Android এ
  // তাই scale আলাদা Animated.View এ রেখে, clipping এই plain View এ করা হয়েছে
  pipClip: {
    flex: 1,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },

  // ✅ FIX: flex:1 (absoluteFill নয়) + borderRadius as secondary clip guard
  pipRTCView: {
    flex: 1,
    borderRadius:5,
  },

  pipOff: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  pipLabel: {
    position: 'absolute', bottom: 4, left: 0, right: 0,
    alignItems: 'center',
  },
  pipLabelTxt: {
    color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 5,
    paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },
  pipHandle: {
    position: 'absolute', top: 6, right: 6,
    flexDirection: 'row', gap: 2,
  },
  dot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  ctrlOuter: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 },
  controls: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
    paddingVertical: 22, paddingHorizontal: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 28,
    backgroundColor: 'rgba(8,8,8,0.75)',
  },
  ctrlWrap: { alignItems: 'center', gap: 7, minWidth: 58 },
  ctrl: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.ctrl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  ctrlActive: { backgroundColor: C.ctrlOn, borderColor: 'rgba(255,255,255,0.30)' },
  ctrlLbl: { color: C.whiteD, fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },
  endBtn: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
  },
})
