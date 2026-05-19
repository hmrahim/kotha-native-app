// app/call.web.js — Web platform specific
// ✅ Fixes: camera open on web, DOM ref timing, fast connect, no echo

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'

import {
  requestCallPermissions, joinChannel, leaveChannel,
  setMuted, setVideoMuted, switchCamera, setSpeaker,
  registerEventHandler,
} from '../services/agora'
import { getSocket } from '../services/socket'
import { useCall } from '../context/CallContext'
import { startRingback, stopRingback } from '../services/sounds'

const C = {
  bg:      '#000000',
  accent:  '#0084FF',
  red:     '#FA3E3E',
  white:   '#FFFFFF',
  whiteD:  'rgba(255,255,255,0.75)',
  whiteDD: 'rgba(255,255,255,0.42)',
  ctrl:    'rgba(255,255,255,0.15)',
  ctrlOn:  'rgba(255,255,255,0.30)',
}

export default function CallScreenWeb() {
  const params       = useLocalSearchParams()
  const router       = useRouter()
  const { dispatch } = useCall()

  const {
    callId, channelName, type = 'voice', token, uid,
    peerName = 'Calling…', peerAvatar = '', outgoing = '0',
  } = params

  const isVideo    = type === 'video'
  const isOutgoing = outgoing === '1'

  const [remoteUid,  setRemoteUid]  = useState(null)
  const [muted,      setM]          = useState(false)
  const [videoOff,   setVideoOff]   = useState(false)
  const [speakerOn,  setSpeakerOn]  = useState(isVideo)
  const [connected,  setConnected]  = useState(false)
  const [seconds,    setSeconds]    = useState(0)
  const [netWeak,    setNetWeak]    = useState(false)
  const [error,      setError]      = useState(null)

  const pulseAnim = useRef(new Animated.Value(1)).current
  const pipScale  = useRef(new Animated.Value(0)).current

  const timerRef      = useRef(null)
  const mountedRef    = useRef(true)
  const setupDone     = useRef(false)
  const connectedRef  = useRef(false)  // ✅ FIX: duplicate onUserJoined guard

  // ✅ KEY FIX: DOM refs — video play করার জন্য
  const remoteDiv  = useRef(null)
  const localDiv   = useRef(null)

  // Pulse while waiting
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

  const handleEnd = useCallback((remote = false) => {
    if (!remote) getSocket()?.emit('call:end', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }, [callId, dispatch, router])

  useEffect(() => {
    mountedRef.current   = true
    connectedRef.current = false

    if (!token || !channelName || !uid) return
    if (setupDone.current) return
    setupDone.current = true

    if (isOutgoing) { try { startRingback() } catch (_) {} }

    // ✅ FIX: DOM refs joinChannel এর আগেই set করো
    window.__agoraRemoteEl = remoteDiv.current
    window.__agoraLocalEl  = localDiv.current

    const run = async () => {
      const ok = await requestCallPermissions(isVideo ? 'video' : 'voice')
      if (!ok) {
        setError(`${isVideo ? 'Camera/Mic' : 'Microphone'} permission দাও browser এ।`)
        return
      }
      if (!mountedRef.current) return

      // ✅ FIX: registerEventHandler → joinChannel ক্রম — এটা mandatory
      registerEventHandler({
        onJoinChannelSuccess: () => {
          console.log('[CallWeb] ✅ Joined channel')
        },

        onUserJoined: (_c, rUid) => {
          if (!mountedRef.current) return
          // ✅ FIX: audio + video দুটো event আসতে পারে — একবারই connect করো
          if (connectedRef.current) return
          connectedRef.current = true

          try { stopRingback() } catch (_) {}
          setRemoteUid(rUid)
          setConnected(true)
          setNetWeak(false)

          if (isVideo) {
            // ✅ FIX: remote video ref update — DOM এখন render হয়েছে
            window.__agoraRemoteEl = remoteDiv.current
            Animated.spring(pipScale, {
              toValue: 1, useNativeDriver: true, tension: 120, friction: 8,
            }).start()
          }

          if (!timerRef.current) {
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
          }
        },

        onUserOffline: () => {
          if (mountedRef.current) handleEnd(true)
        },

        onNetworkQuality: (_c, _uid, tx, rx) => {
          if (!mountedRef.current) return
          setNetWeak(tx >= 4 || rx >= 4)
        },

        onConnectionStateChanged: (_c, state) => {
          if (!mountedRef.current) return
          if (state === 3) setNetWeak(true)
          if (state === 2) setNetWeak(false)
        },

        onError: (e) => {
          if (mountedRef.current) setError(e?.message || 'Call failed')
        },
      })

      // ✅ FIX: joinChannel সবার শেষে
      await joinChannel({ token, channelName, uid, video: isVideo })
    }

    run()

    const socket = getSocket()
    const onEnd  = () => { if (mountedRef.current) handleEnd(true) }
    socket?.on('call:ended',    onEnd)
    socket?.on('call:rejected', onEnd)
    socket?.on('call:canceled', onEnd)

    return () => {
      mountedRef.current = false
      try { stopRingback() } catch (_) {}
      if (timerRef.current) clearInterval(timerRef.current)
      socket?.off('call:ended',    onEnd)
      socket?.off('call:rejected', onEnd)
      socket?.off('call:canceled', onEnd)
      leaveChannel()
    }
  }, [token, channelName, uid])

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const statusText = netWeak && connected
    ? '⚡ Weak network…'
    : connected
      ? fmt(seconds)
      : isOutgoing ? 'Ringing…' : 'Connecting…'

  if (error) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
        <Ionicons name="warning-outline" size={52} color={C.red} />
        <Text style={{ color: C.white, fontSize: 20, fontWeight: '700' }}>Connection Failed</Text>
        <Text style={{ color: C.whiteDD, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
          {error}
        </Text>
        <TouchableOpacity
          style={[s.endBtn, { marginTop: 12 }]}
          onPress={() => handleEnd(false)}
        >
          <Text style={{ color: C.white, fontWeight: '700', fontSize: 15 }}>End Call</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={s.root}>

      {/* ── Remote video (fullscreen) ── */}
      {isVideo ? (
        <View style={s.remoteWrap}>
          {/* ✅ FIX: div সবসময় render — display:none দিয়ে hide, Agora ref হারাবে না */}
          <div
            ref={(el) => {
              remoteDiv.current = el
              if (el) window.__agoraRemoteEl = el
            }}
            style={{
              width: '100%', height: '100%',
              backgroundColor: '#000',
              display: remoteUid ? 'block' : 'none',
              objectFit: 'cover',
            }}
          />
          {!remoteUid && (
            <View style={s.waiting}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center' }}>
                <Avatar src={peerAvatar} name={peerName} size={136} />
                <Text style={s.peerName}>{peerName}</Text>
                <Text style={s.statusTxt}>{statusText}</Text>
              </Animated.View>
            </View>
          )}
        </View>
      ) : (
        // Voice call UI
        <View style={s.voiceWrap}>
          {peerAvatar ? (
            <View style={StyleSheet.absoluteFill}>
              <Image
                source={{ uri: peerAvatar }}
                style={StyleSheet.absoluteFill}
                blurRadius={22}
                resizeMode="cover"
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.60)' }]} />
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d1117' }]} />
          )}
          <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center' }}>
            <View style={s.avatarRing}>
              <Avatar src={peerAvatar} name={peerName} size={144} />
            </View>
            <Text style={s.peerName}>{peerName}</Text>
            <Text style={[s.statusTxt, netWeak && { color: '#FFB800' }]}>{statusText}</Text>
          </Animated.View>
        </View>
      )}

      {/* ── Local PIP ── */}
      {isVideo && (
        <Animated.View style={[s.pip, { transform: [{ scale: pipScale }] }]}>
          <View style={s.pipInner}>
            {/* ✅ FIX: local div সবসময় render */}
            <div
              ref={(el) => {
                localDiv.current = el
                if (el) window.__agoraLocalEl = el
              }}
              style={{
                width: '100%', height: '100%',
                backgroundColor: '#1a1a1a',
                objectFit: 'cover',
              }}
            />
            {videoOff && (
              <View style={s.pipOff}>
                <Ionicons name="videocam-off" size={20} color={C.whiteD} />
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* ── Timer badge ── */}
      {connected && (
        <View style={s.timerBadge}>
          <Text style={[s.timerTxt, netWeak && { color: '#FFB800' }]}>{statusText}</Text>
        </View>
      )}

      {/* ── Controls ── */}
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

        <TouchableOpacity
          style={s.endBtn}
          onPress={() => handleEnd(false)}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={28} color={C.white} style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>

        {isVideo ? (
          <CtrlBtn icon="camera-reverse" label="Flip" onPress={switchCamera} />
        ) : (
          <CtrlBtn
            icon={speakerOn ? 'volume-high' : 'volume-low'}
            label={speakerOn ? 'Speaker' : 'Ear'}
            active={speakerOn}
            onPress={() => { const v = !speakerOn; setSpeakerOn(v); setSpeaker(v) }}
          />
        )}

        {/* ✅ FIX: video call এ speaker — একটাই রাখো */}
        {isVideo && (
          <CtrlBtn
            icon={speakerOn ? 'volume-high' : 'volume-low'}
            label={speakerOn ? 'Speaker' : 'Ear'}
            active={speakerOn}
            onPress={() => { const v = !speakerOn; setSpeakerOn(v); setSpeaker(v) }}
          />
        )}

      </View>
    </View>
  )
}

function Avatar({ src, name, size }) {
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    )
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: C.accent + '44', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: C.white, fontSize: size * 0.37, fontWeight: '700' }}>
        {(name?.[0] || '?').toUpperCase()}
      </Text>
    </View>
  )
}

function CtrlBtn({ icon, label, onPress, active = false }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.ctrlWrap}>
      <View style={[s.ctrl, active && s.ctrlActive]}>
        <Ionicons name={icon} size={22} color={C.white} />
      </View>
      <Text style={s.ctrlLbl}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  remoteWrap: { flex: 1, backgroundColor: '#000' },
  waiting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0d1117',
  },
  voiceWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0d1117',
  },

  avatarRing: {
    borderRadius: 78, padding: 3,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 28,
    elevation: 14, marginBottom: 22,
  },
  peerName: {
    color: C.white, fontSize: 26, fontWeight: '700', marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  statusTxt: { color: C.whiteDD, fontSize: 14, letterSpacing: 1 },

  pip: {
    position: 'absolute',
    top: 60, right: 14,
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

  timerBadge: {
    position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', zIndex: 10,
  },
  timerTxt: {
    color: C.white, fontSize: 14, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
  },

  controls: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
    paddingVertical: 22, paddingBottom: 30,
    backgroundColor: 'rgba(8,8,8,0.75)',
    flexWrap: 'wrap', gap: 12,
  },

  ctrlWrap: { alignItems: 'center', gap: 7, minWidth: 58 },
  ctrl: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.ctrl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  ctrlActive: {
    backgroundColor: C.ctrlOn, borderColor: 'rgba(255,255,255,0.30)',
  },
  ctrlLbl: { color: C.whiteD, fontSize: 10, fontWeight: '500' },

  endBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.55, shadowRadius: 12,
    elevation: 10,
  },
})