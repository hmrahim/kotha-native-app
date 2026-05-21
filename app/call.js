// app/call.js
// ✅ INSTANT CONNECT — Complete fix for zero-delay call connection

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  SafeAreaView, Image, Animated, Dimensions, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  initAgoraEngine, joinChannel, leaveChannel,
  setMuted, setVideoMuted, switchCamera, setSpeaker,
  requestCallPermissions, destroyAgoraEngine, RtcSurfaceView,
  registerEventHandler, getEngine,
} from '../services/agora'
import { getSocket } from '../services/socket'
import { useCall } from '../context/CallContext'
import { startRingback, stopRingback } from '../services/sounds'

const { width: W, height: H } = Dimensions.get('window')

const C = {
  bg:      '#000000',
  accent:  '#0084FF',
  green:   '#31A24C',
  red:     '#FA3E3E',
  white:   '#FFFFFF',
  whiteD:  'rgba(255,255,255,0.75)',
  whiteDD: 'rgba(255,255,255,0.42)',
  ctrl:    'rgba(255,255,255,0.15)',
  ctrlOn:  'rgba(255,255,255,0.30)',
}

export default function CallScreen() {
  const params       = useLocalSearchParams()
  const router       = useRouter()
  const { dispatch } = useCall()

  const {
    callId, channelName, type = 'voice', token, uid,
    peerName = 'Calling…', peerAvatar = '', outgoing = '0',
    earlyJoined = '0',
  } = params

  const isVideo      = type === 'video'
  const isOutgoing   = outgoing === '1'
  const wasEarlyJoin = earlyJoined === '1'

  const [remoteUid,  setRemoteUid]  = useState(null)
  const [muted,      setM]          = useState(false)
  const [speakerOn,  setSpeakerOn]  = useState(!isVideo) // ✅ FIX: voice=speaker ON by default
  const [videoOff,   setVideoOff]   = useState(false)
  const [connected,  setConnected]  = useState(false)
  const [seconds,    setSeconds]    = useState(0)
  const [netWeak,    setNetWeak]    = useState(false)
  const [ctrlShown,  setCtrlShown]  = useState(true)

  const ctrlOpacity   = useRef(new Animated.Value(1)).current
  const pipScale      = useRef(new Animated.Value(0)).current
  const remoteOpacity = useRef(new Animated.Value(0)).current
  const pulseAnim     = useRef(new Animated.Value(1)).current

  const timerRef     = useRef(null)
  const mountedRef   = useRef(true)
  const setupDone    = useRef(false)
  const ctrlTimer    = useRef(null)
  const connectedRef = useRef(false)

  // ✅ KEY FIX: earlyJoin এ remote user আগেই join করে থাকতে পারে।
  const pendingRemoteUid = useRef(null)

  // ── Pulse animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (connected) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.07, duration: 950, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 950, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [connected])

  // ── Controls auto-hide ─────────────────────────────────────────────────────
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

  // ── handleEnd ──────────────────────────────────────────────────────────────
  const handleEnd = useCallback((remote = false) => {
    if (!remote) getSocket()?.emit('call:end', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }, [callId, dispatch, router])

  // ── onRemoteConnected ──────────────────────────────────────────────────────
  const onRemoteConnected = useCallback((rUid) => {
    if (!mountedRef.current) return
    if (connectedRef.current) return
    connectedRef.current = true

    stopRingback().catch(() => {})
    setRemoteUid(rUid)
    setConnected(true)
    setNetWeak(false)

    // ✅ BUG FIX: আগে setSpeaker(isVideo) ছিল।
    // Voice call এ isVideo=false → speaker OFF হতো — audio earpiece এ যেত।
    // এখন voice=speaker ON, video=speaker OFF (ভিডিও call এ earpiece natural)।
    setSpeaker(!isVideo)
    setSpeakerOn(!isVideo)

    Animated.timing(remoteOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()

    if (isVideo) {
      Animated.spring(pipScale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start()
      scheduleHide()
    }

    if (!timerRef.current) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    }
  }, [isVideo, scheduleHide])

  // ── Main setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current   = true
    connectedRef.current = false

    if (!token || !channelName || !uid) return
    if (setupDone.current) return
    setupDone.current = true

    if (isOutgoing) startRingback().catch(() => {})

    const registerHandlers = () => {
      registerEventHandler({
        onJoinChannelSuccess: () => {
          console.log('[Call] ✅ Joined channel')
        },

        onUserJoined: (_conn, rUid) => {
          console.log('[Call] ✅ onUserJoined uid:', rUid)
          onRemoteConnected(rUid)
        },

        onUserOffline: (_conn) => {
          if (mountedRef.current) handleEnd(true)
        },

        onError: (errCode) => {
          console.warn('[Call] Error:', errCode)
          if (errCode === 109 || errCode === 110) handleEnd(true)
        },

        onNetworkQuality: (_conn, _uid, txQ, rxQ) => {
          if (!mountedRef.current) return
          setNetWeak(txQ >= 4 || rxQ >= 4)
        },

        onConnectionStateChanged: (_conn, state) => {
          if (state === 3 && mountedRef.current) setNetWeak(true)
          if (state === 2 && mountedRef.current) setNetWeak(false)
        },
      })
    }

    const setup = async () => {
      if (wasEarlyJoin) {
        const eng = getEngine()
        if (eng) {
          console.log('[Call] ✅ Early join — registering real handlers')
          registerHandlers()

          // ✅ BUG FIX: Race condition — remote user earlyJoin এর সময়
          // join করে থাকতে পারে। global.__pendingRemoteUid এ capture করা ছিল।
          // Retry loop দিয়ে check করো — single timeout এর চেয়ে reliable।
          const checkPending = (attempt = 0) => {
            if (connectedRef.current || !mountedRef.current) return
            const pending = global.__pendingRemoteUid
            if (pending) {
              console.log('[Call] ✅ Processing pending remote uid:', pending)
              global.__pendingRemoteUid = null
              onRemoteConnected(pending)
            } else if (attempt < 6) {
              setTimeout(() => checkPending(attempt + 1), 500)
            }
          }
          setTimeout(() => checkPending(), 400)

          // ✅ BUG FIX: আগে `if (!isOutgoing) setSpeaker(false)` ছিল।
          // Incoming call এ speaker বন্ধ করে দিত — audio earpiece এ যেত।
          // onRemoteConnected এ speaker সঠিকভাবে set হবে — এখানে কিছু করার নেই।
          return
        }
        console.warn('[Call] earlyJoined=1 but engine missing — full setup')
      }

      // ─── Normal setup ──────────────────────────────────────────────────────
      const ok = await requestCallPermissions(isVideo ? 'video' : 'voice')
      if (!ok || !mountedRef.current) { handleEnd(true); return }

      const eng = initAgoraEngine()
      if (!eng) return

      registerHandlers()

      await joinChannel({
        token:       String(token),
        channelName: String(channelName),
        uid:         String(uid),
        video:       isVideo,
      })

      // ✅ BUG FIX: Outgoing call এ ringback বাজছে, speaker on রাখো।
      // আগে `if (isOutgoing) setSpeaker(false)` ছিল — ringback earpiece এ যেত।
      // এখন speaker state joinChannel এ already সঠিক set হয়ে গেছে।
    }

    setup()

    const socket = getSocket()
    const onEnd  = () => { if (mountedRef.current) handleEnd(true) }
    socket?.on('call:ended',    onEnd)
    socket?.on('call:rejected', onEnd)
    socket?.on('call:canceled', onEnd)

    return () => {
      mountedRef.current = false
      stopRingback().catch(() => {})
      socket?.off('call:ended',    onEnd)
      socket?.off('call:rejected', onEnd)
      socket?.off('call:canceled', onEnd)
      if (timerRef.current)  clearInterval(timerRef.current)
      if (ctrlTimer.current) clearTimeout(ctrlTimer.current)
      leaveChannel()
      destroyAgoraEngine()
    }
  }, [token, channelName, uid])

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const statusText = netWeak && connected
    ? '⚡ Weak network…'
    : connected
      ? fmt(seconds)
      : isOutgoing ? 'Ringing…' : 'Connecting…'

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={s.root}
      onPress={isVideo && connected ? bringCtrl : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* Remote video — full screen */}
      {isVideo && RtcSurfaceView && (
        <Animated.View style={[s.remote, { opacity: remoteOpacity }]}>
          <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: remoteUid ?? 0 }} />
        </Animated.View>
      )}

      {/* Top info */}
      <SafeAreaView style={s.topSafe}>
        <View style={s.topBar}>
          <View style={s.typePill}>
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={12} color={C.white} />
            <Text style={s.typeTxt}>{isVideo ? 'Video Call' : 'Voice Call'}</Text>
          </View>
          <Text style={[s.durationTxt, netWeak && { color: '#FFB800' }]}>
            {statusText}
          </Text>
        </View>
      </SafeAreaView>

      {/* Center avatar — voice call বা waiting */}
      {(!isVideo || !remoteUid) && (
        <View style={s.center} pointerEvents="none">
          <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center' }}>
            <View style={s.avatarRing}>
              {peerAvatar ? (
                <Image source={{ uri: peerAvatar }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarFb]}>
                  <Text style={s.avatarLetter}>{(peerName?.[0] || '?').toUpperCase()}</Text>
                </View>
              )}
            </View>
            <Text style={s.peerName}>{peerName}</Text>
            <Text style={s.subTxt}>{statusText}</Text>
          </Animated.View>
        </View>
      )}

      {/* Local Camera */}
      {isVideo && RtcSurfaceView && !videoOff && (
        <>
          {isOutgoing && !connected && (
            <View style={s.localFull}>
              <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: 0 }} zOrderMediaOverlay />
              <View style={s.localFullOverlay} />
            </View>
          )}

          {(!isOutgoing || connected) && (
            <Animated.View style={[s.pip, { transform: [{ scale: pipScale }] }]}>
              <View style={s.pipInner}>
                <RtcSurfaceView style={{ flex: 1 }} canvas={{ uid: 0 }} zOrderMediaOverlay />
              </View>
            </Animated.View>
          )}
        </>
      )}

      {isVideo && RtcSurfaceView && videoOff && (!isOutgoing || connected) && (
        <Animated.View style={[s.pip, { transform: [{ scale: pipScale }] }]}>
          <View style={s.pipInner}>
            <View style={s.pipOff}>
              <Ionicons name="videocam-off" size={20} color={C.whiteD} />
            </View>
          </View>
        </Animated.View>
      )}

      {/* Controls */}
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

            {isVideo ? (
              <CtrlBtn icon="camera-reverse" label="Flip" onPress={() => switchCamera()} />
            ) : (
              <CtrlBtn
                icon={speakerOn ? 'volume-high' : 'volume-low'}
                label={speakerOn ? 'Speaker' : 'Ear'}
                active={speakerOn}
                onPress={() => { const v = !speakerOn; setSpeakerOn(v); setSpeaker(v) }}
              />
            )}

            {isVideo && (
              <CtrlBtn
                icon={speakerOn ? 'volume-high' : 'volume-low'}
                label={speakerOn ? 'Speaker' : 'Ear'}
                active={speakerOn}
                onPress={() => { const v = !speakerOn; setSpeakerOn(v); setSpeaker(v) }}
              />
            )}
          </View>
        </SafeAreaView>
      </Animated.View>
    </TouchableOpacity>
  )
}

function EndBtn({ onPress }) {
  const sc = useRef(new Animated.Value(1)).current
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => Animated.spring(sc, { toValue: 0.88, useNativeDriver: true, speed: 60 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 60 }).start()}
      activeOpacity={1}
    >
      <Animated.View style={[s.endBtn, { transform: [{ scale: sc }] }]}>
        <Ionicons name="call" size={28} color={C.white} style={{ transform: [{ rotate: '135deg' }] }} />
      </Animated.View>
    </TouchableOpacity>
  )
}

function CtrlBtn({ icon, label, onPress, active = false }) {
  const sc = useRef(new Animated.Value(1)).current
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => Animated.spring(sc, { toValue: 0.86, useNativeDriver: true, speed: 60 }).start()}
      onPressOut={() => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 60 }).start()}
      activeOpacity={1}
      style={s.ctrlWrap}
    >
      <Animated.View style={[s.ctrl, active && s.ctrlActive, { transform: [{ scale: sc }] }]}>
        <Ionicons name={icon} size={22} color={C.white} />
      </Animated.View>
      <Text style={s.ctrlLbl}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  remote: { flex: 1, backgroundColor: '#000' },

  topSafe: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    paddingTop: Platform.OS === 'android' ? 32 : 0,
  },
  topBar:  { alignItems: 'center', paddingTop: 14, gap: 6 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  typeTxt:     { color: C.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  durationTxt: { color: C.whiteD, fontSize: 14, fontWeight: '400', letterSpacing: 0.8 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 60, paddingBottom: 160, zIndex: 10,
  },
  avatarRing: {
    borderRadius: 78, padding: 3,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 28,
    elevation: 14, marginBottom: 22,
  },
  avatar:       { width: 144, height: 144, borderRadius: 72 },
  avatarFb:     { backgroundColor: C.accent + '44', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: C.white, fontSize: 56, fontWeight: '700' },
  peerName: {
    color: C.white, fontSize: 27, fontWeight: '700', letterSpacing: 0.2, marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  subTxt: { color: C.whiteDD, fontSize: 14, letterSpacing: 1.2 },

  pip: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 88 : 108, right: 14,
    width: 100, height: 148, zIndex: 25,
    borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 12,
  },
  pipInner: {
    flex: 1, borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: '#1a1a1a',
  },
  pipOff: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },

  ctrlOuter: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 },
  controls: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
    paddingVertical: 22, paddingHorizontal: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 28,
    backgroundColor: 'rgba(8,8,8,0.75)',
  },
  ctrlWrap:   { alignItems: 'center', gap: 7, minWidth: 58 },
  ctrl: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.ctrl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  ctrlActive: { backgroundColor: C.ctrlOn, borderColor: 'rgba(255,255,255,0.30)' },
  ctrlLbl:    { color: C.whiteD, fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },

  endBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.55, shadowRadius: 14,
    elevation: 10,
  },

  localFull: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: '#000',
  },
  localFullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 2,
  },
})