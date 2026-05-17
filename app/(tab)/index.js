import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  Animated, StyleSheet, StatusBar, Dimensions,
  Modal, Pressable, Alert, Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { T, getColor, getInitials } from '../../theme'
import { getUser, getMessageRequests, hideChat } from '../../services/api'
import { getSocket } from '../../services/socket'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// ─── Search bar ───────────────────────────────────────────────────────────────
function SearchBar({ onSearch, onMenuOpen }) {
  const [active, setActive] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const anim = useRef(new Animated.Value(0)).current
  const INPUT_W = SCREEN_WIDTH * 0.62

  const open = () => {
    setActive(true)
    Animated.timing(anim, { toValue: INPUT_W, duration: 220, useNativeDriver: false })
      .start(() => inputRef.current?.focus())
  }
  const close = () => {
    setQuery(''); onSearch('')
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: false })
      .start(() => setActive(false))
  }
  const handleChange = (t) => { setQuery(t); onSearch(t) }

  return (
    <View style={sb.wrapper}>
      {active ? (
        <TouchableOpacity onPress={close} style={sb.backBtn}>
          <Ionicons name="arrow-back" color={T.accent} size={24} />
        </TouchableOpacity>
      ) : (
        <View style={sb.logoRow}>
          <View style={sb.logoMark} />
          <Text style={sb.title}>KOTHA</Text>
        </View>
      )}
      {active && (
        <Animated.View style={[sb.inputBox, { width: anim }]}>
          <Ionicons name="search" color={T.textSecond} size={15} style={{ marginRight: 6 }} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={handleChange}
            placeholder="Search chats..."
            placeholderTextColor={T.textMuted}
            style={sb.input}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleChange('')}>
              <Ionicons name="close-circle" color={T.textMuted} size={16} />
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
      <View style={sb.icons}>
        {!active && (
          <>
            <TouchableOpacity style={sb.iconBtn}>
              <Ionicons name="camera-outline" color={T.textSecond} size={23} />
            </TouchableOpacity>
            <TouchableOpacity style={sb.iconBtn} onPress={open}>
              <Ionicons name="search-outline" color={T.textSecond} size={23} />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={sb.iconBtn} onPress={onMenuOpen}>
          <Ionicons name="ellipsis-vertical" color={T.textSecond} size={23} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, avatar, online }) {
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

// ─── Last message preview with seen/unseen indicator ─────────────────────────
function LastMessagePreview({ item, currentUserId }) {
  const isMyMessage = item.lastSenderId?.toString() === currentUserId?.toString()
  const lastMsg = item.lastMessage
  const msgType = item.lastMessageType
  const unread = item.unreadCount || 0
  const isSeen = item.lastSeen || false

  let preview = lastMsg ?? 'Say hello 👋'
  if (!lastMsg && msgType) {
    switch (msgType) {
      case 'image': preview = '📷 Photo'; break
      case 'video': preview = '🎬 Video'; break
      case 'document': preview = '📎 File'; break
      case 'voice': preview = '🎙 Voice message'; break
      case 'audio': preview = '🎵 Audio'; break
      case 'location': preview = '📍 Location'; break
      case 'contact': preview = '👤 Contact'; break
      default: preview = '📎 Attachment'
    }
  }

  return (
    <View style={s.chatBottom}>
      <View style={s.msgRow}>
        {isMyMessage && (
          <View style={s.tickWrap}>
            {isSeen
              ? <Ionicons name="checkmark-done" size={15} color={T.accent} />
              : <Ionicons name="checkmark-done" size={15} color={T.textMuted} />
            }
          </View>
        )}
        <Text
          style={[s.chatMsg, unread > 0 && s.chatMsgUnread]}
          numberOfLines={1}
        >
          {preview}
        </Text>
        {item.isPendingByMe && (
          <Text style={s.pendingTag} numberOfLines={1}> · Pending</Text>
        )}
      </View>
      {unread > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </View>
  )
}

// ─── Single chat row ──────────────────────────────────────────────────────────
function ChatRow({ item, currentUserId, onHide }) {

  const router = useRouter()
  const unread = item.unreadCount || 0

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const isThisWeek = (now - d) < 7 * 24 * 60 * 60 * 1000
    if (isThisWeek) return d.toLocaleDateString([], { weekday: 'short' })
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  }

  const handleLongPress = () => {
    Alert.alert(
      item.name || 'Chat',
      'এই chat টি list থেকে সরাতে চাও?\n(Connection থাকবে — নতুন message আসলে আবার দেখাবে)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Chat',
          style: 'destructive',
          onPress: () => onHide?.(item._id),
        },
      ]
    )
  }

  return (
    <TouchableOpacity
      activeOpacity={0.65}
      style={s.chatRow}
      onPress={() => router.push({
        pathname: '/chat',
        params: {
          id: item._id,
          name: item.name,
          avater: item.profileImage,
          online: String(item.isOnline ?? false),
          lastSeen: item.lastSeen ?? '',
        },
      })}
      onLongPress={handleLongPress}
      delayLongPress={350}
    >
      <Avatar name={item.name} avatar={item.profileImage} online={item.isOnline} />
      <View style={s.chatContent}>
        <View style={s.chatTop}>
          <Text style={[s.chatName, unread > 0 && s.chatNameUnread]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[s.chatTime, unread > 0 && { color: T.accent }]}>
            {formatTime(item.lastMessageAt || item.lastSeen)}
          </Text>
        </View>
        <LastMessagePreview item={item} currentUserId={currentUserId} />
      </View>
    </TouchableOpacity>
  )
}

// ─── Filter chips ─────────────────────────────────────────────────────────────
const FILTERS = ['All', 'Unread', 'Groups', 'Favourites']
function FilterChips({ active, onPress }) {
  return (
    <View style={fc.row}>
      {FILTERS.map(f => (
        <TouchableOpacity key={f} onPress={() => onPress(f)}
          style={[fc.chip, active === f && fc.chipActive]}>
          <Text style={[fc.chipText, active === f && fc.chipTextActive]}>{f}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ─── Main Home ────────────────────────────────────────────────────────────────
export default function Home() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [menuVisible, setMenuVisible] = useState(false)
  const { logout, user, mongoUser } = useAuth()
  const queryClient = useQueryClient()

  const { data: chats = [], isLoading, refetch } = useQuery({
    queryKey: ['chatList'],
    queryFn: async () => {
      const data = await getUser()
      return data ?? []
    },
    staleTime: 10_000,
    enabled: !!mongoUser,
  })

  // ✅ Message requests count for badge
  const { data: requests = [] } = useQuery({
    queryKey: ['messageRequests'],
    queryFn: async () => (await getMessageRequests()) ?? [],
    enabled: !!mongoUser,
    staleTime: 10_000,
  })
  const requestCount = requests?.length || 0

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !mongoUser?._id) return
    socket.emit('join_room', mongoUser._id.toString())

    const handleNewMessage = () => {
      queryClient.invalidateQueries({ queryKey: ['chatList'] })
      queryClient.invalidateQueries({ queryKey: ['messageRequests'] })
    }
    const handleUserOnline = (data) => {
      const uid = typeof data === 'string' ? data : data?.userId
      if (!uid) return
      queryClient.setQueryData(['chatList'], (old = []) =>
        old.map((u) => u._id?.toString() === uid.toString() ? { ...u, isOnline: true } : u)
      )
    }
    const handleUserOffline = (data) => {
      const uid = typeof data === 'string' ? data : data?.userId
      const lastSeen = typeof data === 'object' ? data?.lastSeen : null
      if (!uid) return
      queryClient.setQueryData(['chatList'], (old = []) =>
        old.map((u) =>
          u._id?.toString() === uid.toString()
            ? { ...u, isOnline: false, ...(lastSeen ? { lastSeen } : {}) }
            : u
        )
      )
    }
    const handleReceive = () => {
      queryClient.invalidateQueries({ queryKey: ['chatList'] })
      queryClient.invalidateQueries({ queryKey: ['messageRequests'] })
    }
    const handleSeen = ({ chatId }) => {
      queryClient.setQueryData(['chatList'], (old = []) =>
        old.map((c) => c.chatId?.toString() === chatId?.toString()
          ? { ...c, lastSeen: true, unreadCount: 0 }
          : c
        )
      )
    }
    const handleNewRequest = () => {
      queryClient.invalidateQueries({ queryKey: ['messageRequests'] })
    }
    const handleRequestAccepted = () => {
      queryClient.invalidateQueries({ queryKey: ['chatList'] })
      queryClient.invalidateQueries({ queryKey: ['messageRequests'] })
    }

    socket.on('new_message', handleNewMessage)
    socket.on('user_online', handleUserOnline)
    socket.on('user_offline', handleUserOffline)
    socket.on('receive_message', handleReceive)
    socket.on('messages_seen', handleSeen)
    socket.on('new_request', handleNewRequest)
    socket.on('request_accepted', handleRequestAccepted)

    return () => {
      socket.off('new_message', handleNewMessage)
      socket.off('user_online', handleUserOnline)
      socket.off('user_offline', handleUserOffline)
      socket.off('receive_message', handleReceive)
      socket.off('messages_seen', handleSeen)
      socket.off('new_request', handleNewRequest)
      socket.off('request_accepted', handleRequestAccepted)
    }
  }, [mongoUser?._id])



  const goToProfile = () => {
    setMenuVisible(false)
    router.push('/profile')
  }

  const goToRequests = () => {
    setMenuVisible(false)
    router.push('/message-requests')
  }

  const goToAddUser = () => {
    router.push('/add-user')
  }

  // ── Hide chat (WhatsApp style delete) ─────────────────────────────────────
  const handleHideChat = async (receiverId) => {
    // Optimistically remove from UI
    queryClient.setQueryData(['chatList'], (old = []) =>
      old.filter((c) => c._id?.toString() !== receiverId?.toString())
    )
    try {
      await hideChat(receiverId)
    } catch {
      // ফেল হলে আবার load করো
      queryClient.invalidateQueries({ queryKey: ['chatList'] })
    }
  }

  let data = chats.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()))
  if (filter === 'Unread') data = data.filter(c => (c.unreadCount || 0) > 0)
  if (filter === 'Groups') data = data.filter(c => c.isGroup)

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.surface} />
      <SearchBar onSearch={setSearch} onMenuOpen={() => setMenuVisible(true)} />
      <FilterChips active={filter} onPress={setFilter} />

      {/* ✅ Message Requests row (only when requests > 0) */}
      {requestCount > 0 && (
        <TouchableOpacity style={s.archivedRow} onPress={goToRequests} activeOpacity={0.7}>
          <View style={[s.archivedIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
            <Ionicons name="mail-unread-outline" color={T.amber || '#F59E0B'} size={18} />
          </View>
          <Text style={s.archivedText}>Message requests</Text>
          <View style={[s.archivedBadge, { backgroundColor: 'rgba(245,158,11,0.18)' }]}>
            <Text style={[s.archivedBadgeText, { color: T.amber || '#F59E0B' }]}>{requestCount}</Text>
          </View>
          <Ionicons name="chevron-forward" color={T.textMuted} size={16} />
        </TouchableOpacity>
      )}

      <FlatList
        data={data}
        keyExtractor={i => i._id?.toString()}
        renderItem={({ item }) => <ChatRow item={item} currentUserId={mongoUser?._id} onHide={handleHideChat} />}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" color={T.textMuted} size={52} />
            <Text style={s.emptyText}>
              {isLoading ? 'Loading...' : 'No chats yet. Tap + to add a user.'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
      />

      {/* ✅ FAB → Add User */}
      <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={goToAddUser}>
        <View style={s.fabGlow} />
        <Ionicons name="person-add" color="#0D1117" size={24} />
      </TouchableOpacity>

      {/* ─── Dropdown menu ───────────────────────────────────────────────── */}
      <Modal visible={menuVisible} transparent animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={menu.backdrop} onPress={() => setMenuVisible(false)}>
          <Pressable style={menu.dropdown} onPress={e => e.stopPropagation()}>
            {/* Current user card */}
            <TouchableOpacity style={menu.userRow} onPress={goToProfile} activeOpacity={0.7}>
              <View style={menu.userAvatarWrap}>
                {mongoUser?.profileImage ? (
                  <Image source={{ uri: mongoUser.profileImage }} style={menu.userAvatarImg} />
                ) : (
                  <View style={menu.userAvatar}>
                    <Text style={menu.userInitial}>
                      {(user?.displayName || mongoUser?.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={menu.onlineDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={menu.userName} numberOfLines={1}>
                  {user?.displayName || mongoUser?.name || 'User'}
                </Text>
                <Text style={menu.userEmail} numberOfLines={1}>
                  {user?.email || mongoUser?.email || ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={T.textMuted} />
            </TouchableOpacity>

            <View style={menu.divider} />

            {/* ✅ Message Requests */}
            <TouchableOpacity style={menu.item} onPress={goToRequests} activeOpacity={0.7}>
              <View style={[menu.itemIconWrap, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Ionicons name="mail-unread-outline" size={17} color={T.amber || '#F59E0B'} />
              </View>
              <Text style={menu.itemText}>Message Requests</Text>
              {requestCount > 0 && (
                <View style={menu.countDot}>
                  <Text style={menu.countDotTxt}>{requestCount > 99 ? '99+' : requestCount}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={15} color={T.textMuted} />
            </TouchableOpacity>


            {/* Settings */}
            <TouchableOpacity style={menu.item} activeOpacity={0.7} onPress={() => { setMenuVisible(false); router.push('/settings') }}>
              <View style={menu.itemIconWrap}>
                <Ionicons name="settings-outline" size={17} color={T.textSecond} />
              </View>
              <Text style={menu.itemText}>Settings</Text>
              <Ionicons name="chevron-forward" size={15} color={T.textMuted} />
            </TouchableOpacity>

            <View style={menu.divider} />

            {/* Logout */}

          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sb = StyleSheet.create({
  wrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, paddingHorizontal: 14,
    paddingVertical: 10, height: 58,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  logoMark: { width: 8, height: 22, borderRadius: 4, backgroundColor: T.accent },
  title: { color: T.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  backBtn: { marginRight: 12, padding: 4 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 10, height: 36, overflow: 'hidden',
    borderWidth: 1, borderColor: T.border, flex: 1, marginRight: 8,
  },
  input: { flex: 1, color: T.textPrimary, fontSize: 14, padding: 0 },
  icons: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 2 },
  iconBtn: { padding: 5 },
})

const fc = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: T.bg },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceHigh },
  chipActive: { backgroundColor: T.accentDim, borderColor: T.accent },
  chipText: { color: T.textSecond, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: T.accent, fontWeight: '700' },
})

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  archivedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.bg,
  },
  archivedIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center' },
  archivedText: { flex: 1, color: T.textPrimary, fontSize: 15, fontWeight: '500' },
  archivedBadge: { backgroundColor: T.amberDim, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  archivedBadgeText: { color: T.amber, fontSize: 12, fontWeight: '700' },

  // Avatar
  avatarWrap: { width: 50, height: 50 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarInitials: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 17, letterSpacing: 0.5 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: T.online, borderWidth: 2, borderColor: T.bg,
  },

  // Chat row
  chatRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, backgroundColor: T.bg },
  chatContent: { flex: 1, marginLeft: 13 },
  chatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  chatName: { color: T.textPrimary, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  chatNameUnread: { fontWeight: '800', color: '#F0F6FC' },
  chatTime: { color: T.textSecond, fontSize: 12 },
  chatBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  msgRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, gap: 4 },
  tickWrap: { marginRight: 2 },
  chatMsg: { color: T.textSecond, fontSize: 13, flex: 1 },
  chatMsgUnread: { color: T.textPrimary, fontWeight: '600' },
  pendingTag: { color: T.amber || '#F59E0B', fontSize: 11, fontWeight: '700' },
  badge: {
    backgroundColor: T.accent, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { color: '#0D1117', fontSize: 11, fontWeight: '800' },

  sep: { height: 1, backgroundColor: T.border, marginLeft: 79 },
  empty: { alignItems: 'center', marginTop: 80, gap: 12, paddingHorizontal: 30 },
  emptyText: { color: T.textMuted, fontSize: 14, textAlign: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: T.accent,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12,
  },
  fabGlow: {
    position: 'absolute', width: 58, height: 58, borderRadius: 29,
    backgroundColor: T.accent, opacity: 0.3, transform: [{ scale: 1.4 }],
  },
})

const menu = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  dropdown: {
    position: 'absolute', top: 52, right: 12,
    backgroundColor: '#1C2333', borderRadius: 18,
    paddingVertical: 6, minWidth: 260,
    borderWidth: 1, borderColor: 'rgba(240,246,252,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 20, elevation: 14,
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  userAvatarWrap: { position: 'relative', width: 44, height: 44 },
  userAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(45,212,191,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(45,212,191,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: T.online, borderWidth: 2, borderColor: '#1C2333',
  },
  userInitial: { color: '#2DD4BF', fontSize: 18, fontWeight: '800' },
  userName: { color: '#F0F6FC', fontSize: 14, fontWeight: '700' },
  userEmail: { color: '#7D8590', fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(240,246,252,0.06)', marginVertical: 4 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16, paddingVertical: 13,
  },
  itemIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  itemText: { color: '#F0F6FC', fontSize: 14, fontWeight: '500', flex: 1 },
  countDot: {
    minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  countDotTxt: { color: '#0D1117', fontSize: 11, fontWeight: '800' },
})