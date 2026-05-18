// app/(tab)/calls.js
// ──────────────────────────────────────────────────────────────────────────────
// পুরোনো calls.js এর পরিবর্তে এই ফাইলটা ব্যবহার করো
// Shows: call history (recent calls) + ability to start new calls
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, Animated, Image, Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { T, getColor, getInitials } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import { getSocket } from '../../services/socket'

// ─── Dummy recent calls data (replace with real API call later) ───────────────
const MOCK_CALLS = []

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, avatar, size = 48 }) {
  const bg = getColor(name || 'U')
  const initials = getInitials(name || 'U')

  if (avatar) {
    return (
      <Image
        source={{ uri: avatar }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    )
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg + '33', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: bg + '55',
    }}>
      <Text style={{ fontSize: size * 0.35, fontWeight: '700', color: bg }}>
        {initials}
      </Text>
    </View>
  )
}

// ─── Call Log Item ─────────────────────────────────────────────────────────────
function CallItem({ item, onCall }) {
  const isIncoming = item.direction === 'incoming'
  const isMissed   = item.status === 'missed'

  return (
    <Pressable
      style={({ pressed }) => [ci.row, pressed && { opacity: 0.7 }]}
      android_ripple={{ color: 'rgba(255,255,255,0.04)' }}
    >
      <Avatar name={item.name} avatar={item.avatar} size={50} />

      <View style={ci.info}>
        <Text style={[ci.name, isMissed && { color: '#F87171' }]}>
          {item.name}
        </Text>
        <View style={ci.meta}>
          <Ionicons
            name={isIncoming ? 'call-outline' : 'call-outline'}
            size={12}
            color={isMissed ? '#F87171' : T.textSecond}
            style={{ transform: [{ rotate: isIncoming ? '135deg' : '-45deg' }] }}
          />
          <Text style={[ci.sub, isMissed && { color: '#F87171' }]}>
            {isMissed ? 'Missed' : isIncoming ? 'Incoming' : 'Outgoing'} · {item.time}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={ci.callBtn}
        onPress={() => onCall(item, 'audio')}
        hitSlop={8}
      >
        <Ionicons name="call" size={18} color={T.accent} />
      </TouchableOpacity>
    </Pressable>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState() {
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[es.wrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={es.iconWrap}>
        <PulseRing delay={0}    size={120} />
        <PulseRing delay={600}  size={120} />
        <PulseRing delay={1200} size={120} />
        <View style={es.icon}>
          <Ionicons name="call" size={38} color={T.accent} />
        </View>
      </View>
      <Text style={es.title}>কোনো call নেই এখনো</Text>
      <Text style={es.desc}>
        Chats থেকে কাউকে call করো{'\n'}এখানে call history দেখাবে
      </Text>
    </Animated.View>
  )
}

function PulseRing({ delay, size }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 1, borderColor: T.accent,
        opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 0.2, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
      }}
    />
  )
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function CallsScreen() {
  const insets       = useSafeAreaInsets()
  const router       = useRouter()
  const { mongoUser } = useAuth()
  const [calls, setCalls] = useState(MOCK_CALLS)

  // Socket থেকে incoming call listen করো
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const handleIncomingCall = (data) => {
      // Incoming call screen এ navigate করো
      router.push({
        pathname: '/call-screen',
        params: {
          callerId:     data.callerId,
          callerName:   data.callerName,
          callerAvatar: data.callerAvatar || '',
          callType:     data.callType || 'audio',
          channelName:  data.channelName,
          mode:         'incoming',
        },
      })
    }

    socket.on('incoming_call', handleIncomingCall)
    return () => socket.off('incoming_call', handleIncomingCall)
  }, [])

  const handleStartCall = useCallback((user, callType) => {
    if (!user) return
    const channelName = `${mongoUser?._id}_${user.id}_${Date.now()}`
    router.push({
      pathname: '/call-screen',
      params: {
        receiverId:    user.id,
        receiverName:  user.name,
        receiverAvatar: user.avatar || '',
        callType,
        channelName,
        mode: 'outgoing',
      },
    })
  }, [mongoUser, router])

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.surface} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.accent} />
          <Text style={s.headerTitle}>Calls</Text>
        </View>
        <TouchableOpacity style={s.newCallBtn}>
          <Ionicons name="call" size={18} color={T.accent} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {calls.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CallItem item={item} onCall={handleStartCall} />
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accent:       { width: 4, height: 22, borderRadius: 2, backgroundColor: T.accent },
  headerTitle:  { fontSize: 22, fontWeight: '800', color: T.textPrimary },
  newCallBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  separator: { height: 1, backgroundColor: T.border, marginLeft: 78 },
})

const ci = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 14,
  },
  info:   { flex: 1 },
  name:   { fontSize: 15, fontWeight: '600', color: T.textPrimary, marginBottom: 3 },
  meta:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sub:    { fontSize: 12, color: T.textSecond },
  callBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
})

const es = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  iconWrap: {
    width: 120, height: 120,
    alignItems: 'center', justifyContent: 'center', marginBottom: 32,
  },
  icon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: T.accentDim,
    borderWidth: 1.5, borderColor: 'rgba(45,212,191,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 20, fontWeight: '800', color: T.textPrimary,
    marginBottom: 10, letterSpacing: 0.3,
  },
  desc: {
    fontSize: 14, color: T.textSecond,
    textAlign: 'center', lineHeight: 22,
  },
})