
import React, { useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  StatusBar, Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, Stack } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { T, getColor, getInitials } from '../theme'
import { getMessageRequests } from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../context/AuthContext'

function RequestRow({ item }) {
  const router = useRouter()
  const u = item.user || {}

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts); const now = new Date()
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  }

  const preview = item.lastMessage || (() => {
    switch (item.lastMessageType) {
      case 'image': return '📷 Photo'
      case 'video': return '🎬 Video'
      case 'voice': return '🎙 Voice message'
      case 'audio': return '🎵 Audio'
      case 'document': return '📎 File'
      case 'location': return '📍 Location'
      case 'contact': return '👤 Contact'
      default: return 'Sent you a message'
    }
  })()

  const openChat = () => {
    router.push({
      pathname: '/chat',
      params: {
        id: u._id,
        name: u.name,
        online: String(u.isOnline ?? false),
        lastSeen: u.lastSeen ?? '',
        isRequest: 'true',
      },
    })
  }

  return (
    <TouchableOpacity activeOpacity={0.7} style={s.row} onPress={openChat}>
      {u.profileImage ? (
        <Image source={{ uri: u.profileImage }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, s.avatarFallback, { backgroundColor: getColor(u.name || '?') }]}>
          <Text style={s.avatarTxt}>{getInitials(u.name || '?')}</Text>
        </View>
      )}
      <View style={s.content}>
        <View style={s.top}>
          <Text style={s.name} numberOfLines={1}>{u.name}</Text>
          <Text style={s.time}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <View style={s.bottom}>
          <Text style={s.preview} numberOfLines={1}>{preview}</Text>
          {item.unreadCount > 0 && (
            <View style={s.dot}><Text style={s.dotTxt}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View>
          )}
        </View>
        <Text style={s.email} numberOfLines={1}>{u.email}</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function MessageRequestsScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { mongoUser } = useAuth()

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ['messageRequests'],
    queryFn: async () => (await getMessageRequests()) ?? [],
    enabled: !!mongoUser,
    staleTime: 5_000,
  })

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !mongoUser?._id) return

    const onNewRequest = () => queryClient.invalidateQueries({ queryKey: ['messageRequests'] })
    const onReceive = () => queryClient.invalidateQueries({ queryKey: ['messageRequests'] })
    const onAccepted = () => {
      queryClient.invalidateQueries({ queryKey: ['messageRequests'] })
      queryClient.invalidateQueries({ queryKey: ['chatList'] })
    }

    socket.on('new_request', onNewRequest)
    socket.on('receive_message', onReceive)
    socket.on('request_accepted', onAccepted)

    return () => {
      socket.off('new_request', onNewRequest)
      socket.off('receive_message', onReceive)
      socket.off('request_accepted', onAccepted)
    }
  }, [mongoUser?._id])

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={T.surface} />

        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" color={T.textPrimary} size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Message requests</Text>
            <Text style={s.headerSub}>
              {requests.length} pending · reply to accept
            </Text>
          </View>
        </View>

        <FlatList
          data={requests}
          keyExtractor={(i) => i._id?.toString()}
          renderItem={({ item }) => <RequestRow item={item} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="mail-open-outline" color={T.textMuted} size={56} />
              <Text style={s.emptyTitle}>No message requests</Text>
              <Text style={s.emptySub}>
                Messages from people you haven't connected with yet will appear here.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, height: 62,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: T.textPrimary, fontSize: 17, fontWeight: '700' },
  headerSub: { color: T.textMuted, fontSize: 12, marginTop: 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 18 },
  content: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: T.textPrimary, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  time: { color: T.textSecond, fontSize: 11 },
  bottom: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  preview: { color: T.textSecond, fontSize: 13, flex: 1 },
  dot: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: T.amber || '#F59E0B', alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  dotTxt: { color: '#0D1117', fontSize: 11, fontWeight: '800' },
  email: { color: T.textMuted, fontSize: 11, marginTop: 2 },

  sep: { height: 1, backgroundColor: T.border, marginLeft: 80 },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 30, gap: 10 },
  emptyTitle: { color: T.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 6 },
  emptySub: { color: T.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
})
