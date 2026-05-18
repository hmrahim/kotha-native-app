// app/call.web.js
// Web platform এ Agora Web SDK দিয়ে real voice/video call
// Metro automatically এই file টা web build এ use করবে

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  initAgoraEngine,
  joinChannel,
  leaveChannel,
  setMuted,
  setVideoMuted,
  switchCamera,
  setSpeaker,
  requestCallPermissions,
  destroyAgoraEngine,
  registerWebEventHandler,
} from '../services/agora'
import { getSocket } from '../services/socket'
import { useCall } from '../context/CallContext'
import { startRingback, stopRingback } from '../services/sounds'

const T = {
  bg: '#0D1117', surface: '#161B22', accent: '#2DD4BF',
  text: '#F0F6FC', sub: '#7D8590', red: '#F87171',
}

export default function CallScreenWeb() {
  const params = useLocalSearchParams()
  const router = useRouter()
  const { dispatch } = useCall()
  const {
    callId, channelName, type = 'voice', token, uid,
    peerName = 'Calling…', peerAvatar = '', outgoing = '0',
  } = params

  const isVideo = type === 'video'
  const [remoteUid, setRemoteUid] = useState(null)
  const [muted, setM] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(isVideo)
  const [videoOff, setVideoOff] = useState(false)
  const [callConnected, setCallConnected] = useState(outgoing !== '1')
  const [seconds, setSeconds] = useState(0)
  const timerRef = useRef(null)

  // Video DOM refs (web only)
  const remoteVideoRef = useRef(null)
  const localVideoRef = useRef(null)

  useEffect(() => {
    let mounted = true

    // Global ref expose করো — agora.web.js থেকে video play করার জন্য
    window.__agoraWebRemoteRef = remoteVideoRef
    window.__agoraWebLocalRef = localVideoRef

    if (outgoing === '1') {
      try { startRingback() } catch (_) {}
    }

    ;(async () => {
      const ok = await requestCallPermissions(isVideo ? 'video' : 'voice')
      if (!ok) {
        alert('Microphone' + (isVideo ? '/Camera' : '') + ' permission দরকার call করতে।')
        router.back()
        return
      }

      initAgoraEngine() // web এ truthy object return করে

      // Event handlers register করো
      registerWebEventHandler({
        onJoinChannelSuccess: () => {
          console.log('[Call Web] Joined successfully')
        },
        onUserJoined: (_c, rUid) => {
          if (!mounted) return
          try { stopRingback() } catch (_) {}
          setRemoteUid(rUid)
          setCallConnected(true)
          if (!timerRef.current) {
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
          }
        },
        onUserOffline: () => {
          if (!mounted) return
          handleEnd(true)
        },
      })

      await joinChannel({ token, channelName, uid, video: isVideo })
    })()

    const socket = getSocket()
    const onEnd = () => handleEnd(true)
    socket?.on('call:ended', onEnd)
    socket?.on('call:rejected', onEnd)
    socket?.on('call:canceled', onEnd)

    return () => {
      mounted = false
      window.__agoraWebRemoteRef = null
      window.__agoraWebLocalRef = null
      try { stopRingback() } catch (_) {}
      socket?.off('call:ended', onEnd)
      socket?.off('call:rejected', onEnd)
      socket?.off('call:canceled', onEnd)
      if (timerRef.current) clearInterval(timerRef.current)
      leaveChannel()
    }
  }, [])

  const handleEnd = (remote = false) => {
    if (!remote) getSocket()?.emit('call:end', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Remote Video (video call এ) ── */}
      {isVideo ? (
        <View style={s.remoteWrap}>
          {/* Agora Web SDK এই div এ remote video inject করবে */}
          <div
            ref={remoteVideoRef}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#000',
              display: remoteUid ? 'block' : 'none',
            }}
          />
          {/* Remote user join করেনি তখন placeholder */}
          {!remoteUid && (
            <View style={s.waitingOverlay}>
              {peerAvatar ? (
                <Image source={{ uri: peerAvatar }} style={s.avatarBig} />
              ) : (
                <View style={[s.avatarBig, s.avatarFallback]}>
                  <Text style={s.avatarTxt}>{(peerName?.[0] || '?').toUpperCase()}</Text>
                </View>
              )}
              <Text style={s.peerName}>{peerName}</Text>
              <Text style={s.statusTxt}>
                {outgoing === '1' ? 'Ringing…' : 'Connecting…'}
              </Text>
            </View>
          )}
        </View>
      ) : (
        /* ── Voice Call UI ── */
        <View style={s.voiceWrap}>
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={s.avatarBig} />
          ) : (
            <View style={[s.avatarBig, s.avatarFallback]}>
              <Text style={s.avatarTxt}>{(peerName?.[0] || '?').toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.peerName}>{peerName}</Text>
          <Text style={s.statusTxt}>
            {callConnected ? fmt(seconds) : (outgoing === '1' ? 'Ringing…' : 'Connecting…')}
          </Text>
        </View>
      )}

      {/* ── Local Video (video call এ — picture-in-picture) ── */}
      {isVideo && (
        <View style={s.localWrap}>
          <div
            ref={localVideoRef}
            style={{ width: '100%', height: '100%', backgroundColor: '#222' }}
          />
        </View>
      )}

      {/* ── Call timer (video call এ remote দেখা যাচ্ছে) ── */}
      {isVideo && callConnected && (
        <View style={s.timerBadge}>
          <Text style={s.timerTxt}>{fmt(seconds)}</Text>
        </View>
      )}

      {/* ── Controls ── */}
      <View style={s.controls}>
        <CtrlBtn
          icon={muted ? 'mic-off' : 'mic'}
          active={muted}
          onPress={() => { setM(!muted); setMuted(!muted) }}
          label={muted ? 'Unmute' : 'Mute'}
        />

        {isVideo && (
          <CtrlBtn
            icon={videoOff ? 'videocam-off' : 'videocam'}
            active={videoOff}
            onPress={() => { setVideoOff(!videoOff); setVideoMuted(!videoOff) }}
            label={videoOff ? 'Video On' : 'Video Off'}
          />
        )}

        <CtrlBtn
          icon={speakerOn ? 'volume-high' : 'volume-low'}
          active={speakerOn}
          onPress={() => { setSpeakerOn(!speakerOn); setSpeaker(!speakerOn) }}
          label={speakerOn ? 'Speaker' : 'Earpiece'}
        />

        {isVideo && (
          <CtrlBtn icon="camera-reverse" onPress={() => switchCamera()} label="Flip" />
        )}

        <TouchableOpacity style={s.endBtn} onPress={() => handleEnd(false)} activeOpacity={0.85}>
          <Ionicons
            name="call"
            size={30}
            color="#fff"
            style={{ transform: [{ rotate: '135deg' }] }}
          />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function CtrlBtn({ icon, label, onPress, active }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.ctrlWrap}>
      <View style={[s.ctrl, active && s.ctrlActive]}>
        <Ionicons name={icon} size={24} color={active ? T.bg : T.text} />
      </View>
      <Text style={s.ctrlLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  remoteWrap: { flex: 1, backgroundColor: '#000', position: 'relative' },
  waitingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.bg, gap: 14,
  },
  voiceWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.bg, gap: 14,
  },
  avatarBig: { width: 140, height: 140, borderRadius: 70 },
  avatarFallback: {
    backgroundColor: T.accent + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: T.accent, fontSize: 52, fontWeight: '800' },
  peerName: { color: T.text, fontSize: 26, fontWeight: '700', marginTop: 8 },
  statusTxt: { color: T.accent, fontSize: 16, letterSpacing: 1 },
  localWrap: {
    position: 'absolute', top: 50, right: 16,
    width: 110, height: 150, borderRadius: 14,
    overflow: 'hidden', borderWidth: 2, borderColor: '#fff',
  },
  timerBadge: {
    position: 'absolute', top: 16, left: 0, right: 0,
    alignItems: 'center',
  },
  timerTxt: {
    color: '#fff', fontSize: 14, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  controls: {
    flexDirection: 'row', justifyContent: 'space-around',
    alignItems: 'center', paddingVertical: 18, paddingBottom: 30,
    backgroundColor: 'rgba(0,0,0,0.7)', flexWrap: 'wrap', gap: 12,
  },
  ctrlWrap: { alignItems: 'center', gap: 4 },
  ctrl: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctrlActive: { backgroundColor: T.accent },
  ctrlLabel: { color: T.sub, fontSize: 11, fontWeight: '600' },
  endBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: T.red,
    alignItems: 'center', justifyContent: 'center',
  },
})