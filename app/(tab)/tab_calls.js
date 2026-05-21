// app/(tab)/calls.js
// ──────────────────────────────────────────────────────────────────────────────
// WhatsApp-style Call History — Tab Screen
// Real API  ✓  |  Socket listeners  ✓  |  FAB "Add Call"  ✓  |  Delete  ✓
// ──────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { T, getColor, getInitials } from '../../theme'
import { useAuth } from '../../context/AuthContext'
import { useCall } from '../../context/CallContext'
import { getSocket } from '../../services/socket'
import { getCallHistory, deleteCallHistoryItem } from '../../services/callApi'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtTime = (date) => {
  const d   = new Date(date)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

const fmtDur = (s) => {
  if (!s) return ''
  const m = Math.floor(s / 60), sec = s % 60
  return m ? `${m}m ${sec}s` : `${sec}s`
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, photo, size = 50 }) {
  const safeName = name || 'U'
  const bg       = getColor(safeName)
  const initials = getInitials(safeName)

  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    )
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg + '22',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: bg + '44',
    }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: bg }}>
        {initials}
      </Text>
    </View>
  )
}

// ─── Pulse Ring (empty state animation) ──────────────────────────────────────
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
        borderWidth: 1.5, borderColor: T.accent,
        opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.55, 0.18, 0] }),
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }) }],
      }}
    />
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState() {
  const fade  = useRef(new Animated.Value(0)).current
  const slide = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 450, delay: 120, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, delay: 120, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[es.wrap, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <View style={es.iconWrap}>
        <PulseRing delay={0}    size={130} />
        <PulseRing delay={650}  size={130} />
        <PulseRing delay={1300} size={130} />
        <View style={es.iconCircle}>
          <Ionicons name="call" size={40} color={T.accent} />
        </View>
      </View>
      <Text style={es.title}>কোনো Call নেই এখনো</Text>
      <Text style={es.desc}>
        নিচের{' '}
        <Text style={{ color: T.accent, fontWeight: '800' }}>+</Text>
        {' '}বাটনে ট্যাপ করে{'\n'}যেকাউকে call করো
      </Text>
    </Animated.View>
  )
}

// ─── Single Call Row ──────────────────────────────────────────────────────────
function CallItem({ item, onCall, onDelete, callingId }) {
  const missed     = ['missed', 'rejected', 'timeout'].includes(item.status)
  const arrowName  = item.isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline'
  const arrowColor = missed ? '#F87171' : item.isOutgoing ? T.textSecond : T.online
  const isCalling  = callingId === item._id

  const statusLabel =
    item.status === 'missed'   ? 'Missed' :
    item.status === 'rejected' ? 'Declined' :
    item.status === 'timeout'  ? 'No answer' :
    fmtDur(item.durationSeconds) || 'Call'

  return (
    <TouchableOpacity
      style={ci.row}
      activeOpacity={0.72}
      onLongPress={() => onDelete(item._id)}
    >
      <Avatar name={item.other?.name} photo={item.other?.photo} size={50} />

      <View style={{ flex: 1 }}>
        <Text
          style={[ci.name, missed && { color: '#F87171' }]}
          numberOfLines={1}
        >
          {item.other?.name || 'Unknown'}
        </Text>
        <View style={ci.metaRow}>
          <Ionicons name={arrowName} size={13} color={arrowColor} style={{ marginRight: 4 }} />
          <Text style={[ci.sub, missed && { color: '#F87171' }]}>
            {isCalling ? 'Calling...' : statusLabel + '  ·  ' + fmtTime(item.createdAt)}
          </Text>
        </View>
      </View>

      {/* Re-call button */}
      <TouchableOpacity
        style={[ci.callBtn, isCalling && { backgroundColor: 'rgba(45,212,191,0.25)' }]}
        onPress={() => !isCalling && onCall(item, item.type)}
        hitSlop={10}
        disabled={isCalling}
      >
        {isCalling
          ? <ActivityIndicator size="small" color={T.accent} />
          : <Ionicons
              name={item.type === 'video' ? 'videocam' : 'call'}
              size={19}
              color={T.accent}
            />
        }
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

// ─── FAB ──────────────────────────────────────────────────────────────────────
function FAB({ onPress }) {
  const scale = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1, tension: 80, friction: 6,
      delay: 200, useNativeDriver: true,
    }).start()
  }, [])

  return (
    <Animated.View style={[fab.wrap, { transform: [{ scale }] }]}>
      <TouchableOpacity style={fab.btn} onPress={onPress} activeOpacity={0.82}>
        <View style={fab.glow} />
        <Ionicons name="call" size={24} color={T.bg} />
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CallsScreen() {
  const insets        = useSafeAreaInsets()
  const router        = useRouter()
  const { mongoUser } = useAuth()
  const { dispatch }  = useCall()   // ✅ BUG FIX: CallContext dispatch যোগ করা হয়েছে

  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [callingId, setCallingId]   = useState(null)

  // ── Load history ────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    try {
      const res = await getCallHistory(1, 50)
      setItems(res?.data ?? [])
    } catch (e) {
      console.log('calls load err:', e?.message)
    } finally {
      setLoading(false)
      if (!silent) setRefreshing(false)
    }
  }, [])

  useEffect(() => { load(true) }, [load])

  // ── Socket: refresh after call ends ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) return

      const refresh = () => load(true)
      ;['call:ended', 'call:rejected', 'call:canceled', 'call:timeout'].forEach((ev) => {
        socket.off(ev, refresh)
        socket.on(ev, refresh)
      })
      clearInterval(id)
    }, 1000)

    return () => clearInterval(id)
  }, [load])

  // ✅ BUG FIX: এই duplicate call:incoming listener টা সরানো হয়েছে।
  // আগে এই screen এ আলাদা call:incoming listener ছিল যেটা:
  //   1. CallContext এর listener কে socket.off() দিয়ে মুছে দিত
  //   2. dispatch(INCOMING) ছাড়াই শুধু router.push() করত
  //   ফলে incoming-call screen এ state.callId = null হতো এবং accept কাজ করত না।
  // এখন CallContext একাই call:incoming handle করে — এখানে আর দরকার নেই।

  // ── Start / re-call ─────────────────────────────────────────────────────────
  const startCall = useCallback((item, callType = 'audio') => {
    const socket = getSocket()
    if (!socket?.connected)
      return Alert.alert('Offline', 'Internet connection নেই')

    setCallingId(item._id)

    socket.emit(
      'call:initiate',
      { receiverId: item.other?._id, type: callType },
      (ack) => {
        setCallingId(null)
        if (!ack?.ok) {
          if (ack?.error === 'busy')
            return Alert.alert('Busy', 'User এখন অন্য call এ আছে')
          if (ack?.error === 'blocked' || ack?.error === 'blocked_by_you')
            return Alert.alert('Blocked', 'এই user কে call করা যাচ্ছে না')
          return Alert.alert('Error', ack?.error || 'Call শুরু করা যায়নি')
        }

        // ✅ BUG FIX: dispatch(OUTGOING) যোগ করা হয়েছে।
        // আগে dispatch ছাড়াই router.push() হতো।
        // CallContext এ state না থাকায় call:accepted এলে caller screen
        // সঠিকভাবে react করতে পারত না।
        dispatch({
          type: 'OUTGOING',
          payload: {
            callId:      ack.callId,
            channelName: ack.channelName,
            type:        callType,
            token:       ack.token,
            uid:         ack.uid,
            appId:       ack.appId,
            peer: {
              _id:    item.other?._id  || '',
              name:   item.other?.name || '',
              avatar: item.other?.photo || '',
            },
          },
        })

        router.push({
          pathname: '/call',
          params: {
            callId:      ack.callId,
            channelName: ack.channelName,
            type:        callType,
            token:       ack.token,
            uid:         String(ack.uid),
            appId:       ack.appId,
            peerName:    item.other?.name  || '',
            peerAvatar:  item.other?.photo || '',
            outgoing:    '1',
          },
        })
      }
    )
  }, [router, dispatch])

  // ── Add Call FAB ─────────────────────────────────────────────────────────────
  const handleAddCall = useCallback(() => {
    router.push('/(tab)/')
  }, [router])

  // ── Delete history item ─────────────────────────────────────────────────────
  const handleDelete = useCallback((id) => {
    Alert.alert('Delete?', 'এই call history remove করবে?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteCallHistoryItem(id).catch(() => {})
          setItems((prev) => prev.filter((x) => x._id !== id))
        },
      },
    ])
  }, [])

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.surface} />

      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.title}>Calls</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn}>
            <Ionicons name="videocam-outline" size={22} color={T.textSecond} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={handleAddCall}>
            <Ionicons name="call-outline" size={22} color={T.textSecond} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.border} />

      {/* ── List / Empty ── */}
      {!loading && items.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <CallItem
              item={item}
              onCall={startCall}
              onDelete={handleDelete}
              callingId={callingId}
            />
          )}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 110 }}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load() }}
              tintColor={T.accent}
              colors={[T.accent]}
            />
          }
        />
      )}

      {/* ── Floating Add Call Button ── */}
      <FAB onPress={handleAddCall} />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 13,
    backgroundColor: T.surface,
  },
  title:       { fontSize: 24, fontWeight: '800', color: T.textPrimary, letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  border: { height: 1, backgroundColor: T.accent, opacity: 0.18 },
  sep:    { height: 1, backgroundColor: T.border, marginLeft: 80 },
})

const ci = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 14,
  },
  name:    { fontSize: 15, fontWeight: '600', color: T.textPrimary, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  sub:     { fontSize: 12, color: T.textSecond },
  callBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
})

const es = StyleSheet.create({
  wrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  iconWrap:   { width: 130, height: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  iconCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: T.accentDim,
    borderWidth: 1.5, borderColor: 'rgba(45,212,191,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: T.textPrimary, marginBottom: 10 },
  desc:  { fontSize: 14, color: T.textSecond, textAlign: 'center', lineHeight: 23 },
})

const fab = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 28, right: 22,
    elevation: 10,
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
  },
  btn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: T.accent, opacity: 0.22,
    transform: [{ scale: 1.4 }],
  },
})