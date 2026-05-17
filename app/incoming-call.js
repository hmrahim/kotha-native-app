
import React, { useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Animated, StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { getSocket } from '../services/socket'
import { useCall } from '../context/CallContext'

const T = { bg: '#0D1117', accent: '#2DD4BF', red: '#F87171', text: '#F0F6FC', sub: '#7D8590' }

export default function IncomingCallScreen() {
  const router = useRouter()
  const { state, dispatch } = useCall()
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  // If call gets canceled/timed out remotely, go back
  useEffect(() => {
    if (state.phase !== 'incoming') {
      try { router.back() } catch (_) {}
    }
  }, [state.phase])

  if (!state.callId) return null

  const { callId, type, peer, channelName } = state
  const isVideo = type === 'video'

  const handleAccept = () => {
    const socket = getSocket()
    socket?.emit('call:accept', { callId }, (ack) => {
      if (!ack?.ok) { dispatch({ type: 'RESET' }); router.back(); return }
      router.replace({
        pathname: '/call',
        params: {
          callId,
          channelName: ack.channelName,
          type: ack.type,
          token: ack.token,
          uid: String(ack.uid),
          appId: ack.appId,
          peerName: peer?.name || '',
          peerAvatar: peer?.avatar || '',
          outgoing: '0',
        },
      })
      dispatch({ type: 'ACTIVE' })
    })
  }

  const handleReject = () => {
    getSocket()?.emit('call:reject', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <View style={s.top}>
        <Text style={s.callType}>{isVideo ? '📹 Video Call' : '📞 Voice Call'}</Text>
        <Text style={s.subtitle}>Incoming…</Text>
      </View>

      <Animated.View style={{ transform: [{ scale: pulse }], alignItems: 'center' }}>
        {peer?.avatar ? (
          <Image source={{ uri: peer.avatar }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarTxt}>{(peer?.name?.[0] || '?').toUpperCase()}</Text>
          </View>
        )}
        <Text style={s.name}>{peer?.name || 'Unknown'}</Text>
      </Animated.View>

      <View style={s.actions}>
        <View style={s.actionItem}>
          <TouchableOpacity style={[s.actionBtn, s.reject]} onPress={handleReject} activeOpacity={0.85}>
            <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <Text style={s.actionLabel}>Decline</Text>
        </View>
        <View style={s.actionItem}>
          <TouchableOpacity style={[s.actionBtn, s.accept]} onPress={handleAccept} activeOpacity={0.85}>
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={32} color="#fff" />
          </TouchableOpacity>
          <Text style={s.actionLabel}>Accept</Text>
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 70 },
  top: { alignItems: 'center', gap: 6 },
  callType: { color: T.accent, fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  subtitle: { color: T.sub, fontSize: 14, letterSpacing: 1.5 },
  avatar: { width: 160, height: 160, borderRadius: 80, borderWidth: 3, borderColor: T.accent },
  avatarFallback: { backgroundColor: T.accent + '33', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: T.accent, fontSize: 60, fontWeight: '800' },
  name: { color: T.text, fontSize: 28, fontWeight: '700', marginTop: 20 },
  actions: { flexDirection: 'row', gap: 70 },
  actionItem: { alignItems: 'center', gap: 10 },
  actionBtn: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: '#22C55E' },
  reject: { backgroundColor: T.red },
  actionLabel: { color: T.sub, fontSize: 13, fontWeight: '600' },
})
