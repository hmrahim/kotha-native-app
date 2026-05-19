// components/ChatHeader.js
import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { T, getColor, getInitials } from '../theme'
import { getSocket } from '../services/socket'
import { useCall } from '../context/CallContext'   // ← ADD

function HeaderAvatar({ name, avatar, online }) {
  return (
    <View style={s.avatarWrap}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, s.avatarInitials, { backgroundColor: getColor(name || '?') }]}>
          <Text style={s.avatarText}>{getInitials(name || '?')}</Text>
        </View>
      )}
      {online && <View style={s.onlineDot} />}
    </View>
  )
}

export default function ChatHeader({ chat, onBack, onPressProfile }) {
  const { name, online, lastSeen, avater, receiverId } = chat
  const router          = useRouter()
  const { dispatch }    = useCall()   // ← ADD

  const startCall = (type) => {
    const socket = getSocket()
    if (!socket?.connected) return Alert.alert('Offline', 'Connect to internet first')
    if (!receiverId) return

    socket.emit('call:initiate', { receiverId, type }, (ack) => {
      if (!ack?.ok) {
        if (ack?.error === 'busy')
          return Alert.alert('Busy', 'User is on another call')
        if (ack?.error === 'blocked' || ack?.error === 'blocked_by_you')
          return Alert.alert('Blocked', 'Cannot call this user')
        return Alert.alert('Error', ack?.error || 'Failed to start call')
      }

      // ✅ FIX: CallContext এ OUTGOING dispatch করো
      // token + uid এখানে save হবে, তাই call:accepted এ undefined আসবে না
      dispatch({
        type: 'OUTGOING',
        payload: {
          callId:      ack.callId,
          channelName: ack.channelName,
          type,
          token:       ack.token,
          uid:         ack.uid,
          appId:       ack.appId,
          peer: {
            _id:    receiverId,
            name:   name   || '',
            avatar: avater || '',
          },
        },
      })

      router.push({
        pathname: '/call',
        params: {
          callId:      ack.callId,
          channelName: ack.channelName,
          type,
          token:       ack.token,
          uid:         String(ack.uid),
          appId:       ack.appId,
          peerName:    name   || '',
          peerAvatar:  avater || '',
          outgoing:    '1',
        },
      })
    })
  }

  return (
    <View style={s.header}>
      <TouchableOpacity
        onPress={onBack}
        style={s.backBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="arrow-back" color={T.accent} size={24} />
      </TouchableOpacity>

      <TouchableOpacity style={s.info} activeOpacity={0.7} onPress={onPressProfile}>
        <HeaderAvatar name={name} avatar={avater} online={online} />
        <View style={s.nameWrap}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.status}>
            {online ? 'online' : lastSeen ?? 'last seen recently'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={s.actions}>
        <TouchableOpacity style={s.iconBtn} onPress={() => startCall('video')}>
          <Ionicons name="videocam-outline" color={T.textSecond} size={24} />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => startCall('voice')}>
          <Ionicons name="call-outline" color={T.textSecond} size={22} />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn}>
          <Ionicons name="ellipsis-vertical" color={T.textSecond} size={22} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface,
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: T.border, height: 60,
  },
  backBtn:        { padding: 6, marginRight: 2 },
  info:           { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  avatarWrap:     { width: 40, height: 40 },
  avatar:         { width: 40, height: 40, borderRadius: 20 },
  avatarInitials: { alignItems: 'center', justifyContent: 'center' },
  avatarText:     { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: T.online, borderWidth: 2, borderColor: T.surface,
  },
  nameWrap: { flex: 1 },
  name:     { color: T.textPrimary, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  status:   { color: T.accent, fontSize: 12, fontWeight: '500', marginTop: 1 },
  actions:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn:  { padding: 6 },
})