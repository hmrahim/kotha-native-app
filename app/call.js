import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, SafeAreaView, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  initAgoraEngine, joinChannel, leaveChannel, setMuted, setVideoMuted,
  switchCamera, setSpeaker, requestCallPermissions, destroyAgoraEngine,
  AGORA_APP_ID, RtcSurfaceView,
} from '../services/agora'
import { getSocket } from '../services/socket'
import { useCall } from '../context/CallContext'

const T = {
  bg: '#0D1117', surface: '#161B22', accent: '#2DD4BF',
  text: '#F0F6FC', sub: '#7D8590', red: '#F87171',
}

export default function CallScreen() {
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
  const joinedRef = useRef(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const ok = await requestCallPermissions(isVideo ? 'video' : 'voice')
      if (!ok) { router.back(); return }
      const eng = initAgoraEngine()
      if (!eng) return

      eng.registerEventHandler({
        onJoinChannelSuccess: () => { joinedRef.current = true },
        onUserJoined: (_c, rUid) => {
          if (!mounted) return
          setRemoteUid(rUid)
          setCallConnected(true)
          if (!timerRef.current) {
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
          }
        },
        onUserOffline: () => {
          if (!mounted) return
          handleEnd()
        },
        onError: (err) => console.log('Agora err:', err),
      })

      await joinChannel({ token, channelName, uid, video: isVideo })
    })()

    const socket = getSocket()
    const onEnd = () => handleEnd(true)
    socket?.on('call:ended', onEnd)
    socket?.on('call:rejected', onEnd)   // callee প্রত্যাখ্যান করলে
    socket?.on('call:canceled', onEnd)   // caller cancel করলে
    socket?.on('call:timeout', onEnd)    // কেউ ধরেনি, timeout হলে

    return () => {
      mounted = false
      socket?.off('call:ended', onEnd)
      socket?.off('call:rejected', onEnd)
      socket?.off('call:canceled', onEnd)
      socket?.off('call:timeout', onEnd)
      if (timerRef.current) clearInterval(timerRef.current)
      leaveChannel()
    }
  }, [])

  const handleEnd = (remote = false) => {
    if (!remote) getSocket()?.emit('call:end', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {isVideo && remoteUid && RtcSurfaceView ? (
        <RtcSurfaceView style={s.remote} canvas={{ uid: remoteUid }} />
      ) : (
        <View style={s.voiceWrap}>
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={s.avatarBig} />
          ) : (
            <View style={[s.avatarBig, s.avatarFallback]}>
              <Text style={s.avatarTxt}>{(peerName?.[0] || '?').toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.peerName}>{peerName}</Text>
          <Text style={s.status}>
            {callConnected ? fmt(seconds) : (outgoing === '1' ? 'Ringing…' : 'Connecting…')}
          </Text>
        </View>
      )}

      {isVideo && RtcSurfaceView && (
        <View style={s.localWrap}>
          <RtcSurfaceView style={s.local} canvas={{ uid: 0 }} />
        </View>
      )}

      <View style={s.controls}>
        <CtrlBtn icon={muted ? 'mic-off' : 'mic'} active={muted}
          onPress={() => { setM(!muted); setMuted(!muted) }} label={muted ? 'Unmute' : 'Mute'} />

        {isVideo && (
          <CtrlBtn icon={videoOff ? 'videocam-off' : 'videocam'} active={videoOff}
            onPress={() => { setVideoOff(!videoOff); setVideoMuted(!videoOff) }}
            label={videoOff ? 'Video On' : 'Video Off'} />
        )}

        <CtrlBtn icon={speakerOn ? 'volume-high' : 'volume-low'} active={speakerOn}
          onPress={() => { setSpeakerOn(!speakerOn); setSpeaker(!speakerOn) }}
          label={speakerOn ? 'Speaker' : 'Earpiece'} />

        {isVideo && (
          <CtrlBtn icon="camera-reverse" onPress={() => switchCamera()} label="Flip" />
        )}

        <TouchableOpacity style={s.endBtn} onPress={() => handleEnd(false)} activeOpacity={0.85}>
          <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
  remote: { flex: 1, backgroundColor: '#000' },
  voiceWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, gap: 14 },
  avatarBig: { width: 140, height: 140, borderRadius: 70 },
  avatarFallback: { backgroundColor: T.accent + '33', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: T.accent, fontSize: 52, fontWeight: '800' },
  peerName: { color: T.text, fontSize: 26, fontWeight: '700', marginTop: 8 },
  status: { color: T.accent, fontSize: 16, letterSpacing: 1 },
  localWrap: { position: 'absolute', top: 50, right: 16, width: 110, height: 150, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  local: { flex: 1, backgroundColor: '#222' },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 18, paddingBottom: 30, backgroundColor: 'rgba(0,0,0,0.7)', flexWrap: 'wrap', gap: 12 },
  ctrlWrap: { alignItems: 'center', gap: 4 },
  ctrl: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  ctrlActive: { backgroundColor: T.accent },
  ctrlLabel: { color: T.sub, fontSize: 11, fontWeight: '600' },
  endBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: T.red, alignItems: 'center', justifyContent: 'center' },
})