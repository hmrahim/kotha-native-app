
import React, { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, Image, ActivityIndicator, Keyboard,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, Stack } from 'expo-router'
import { T, getColor, getInitials } from '../theme'
import { searchUserByEmail } from '../services/api'

export default function AddUserScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const inputRef = useRef(null)

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleSearch = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError('Please enter an email')
      setResult(null)
      return
    }
    // basic email format check
   if (!trimmed.includes('@')) {
      setError('Please enter a valid email')
      setResult(null)
      return
    }
    Keyboard.dismiss()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await searchUserByEmail(trimmed)
      if (data && data._id) {
        setResult(data)
      } else {
        setError('No user found with this email')
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (err?.response?.status === 404 ? 'No user found with this email' : 'Search failed')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const openChat = () => {
    if (!result?._id) return
    router.replace({
      pathname: '/chat',
      params: {
        id: result._id,
        name: result.name,
        online: String(result.isOnline ?? false),
        lastSeen: result.lastSeen ?? '',
      },
    })
  }

  const statusLabel = (() => {
    if (!result) return null
    if (result.connectionStatus === 'accepted') return { label: 'Already connected', color: T.accent }
    if (result.connectionStatus === 'pending') return { label: 'Request pending', color: T.amber || '#F59E0B' }
    if (result.connectionStatus === 'rejected') return { label: 'Request rejected', color: '#F85149' }
    return { label: 'Send message to add', color: T.textSecond }
  })()

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={T.surface} />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" color={T.textPrimary} size={24} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add user</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Search bar */}
        <View style={s.searchWrap}>
          <View style={s.searchBox}>
            <Ionicons name="mail-outline" size={18} color={T.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              autoFocus
              value={email}
              onChangeText={(t) => { setEmail(t); setError('') }}
              placeholder="Enter user's email…"
              placeholderTextColor={T.textMuted}
              style={s.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            {email.length > 0 && (
              <TouchableOpacity onPress={() => { setEmail(''); setResult(null); setError('') }}>
                <Ionicons name="close-circle" size={18} color={T.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[s.searchBtn, (!email.trim() || loading) && { opacity: 0.5 }]}
            onPress={handleSearch}
            disabled={!email.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#0D1117" size="small" />
            ) : (
              <Ionicons name="search" color="#0D1117" size={20} />
            )}
          </TouchableOpacity>
        </View>

        <Text style={s.hint}>
          Type the full email of the user. They will appear here if registered.
        </Text>

        {/* Result */}
        <View style={s.body}>
          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#F85149" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {result && (
            <TouchableOpacity activeOpacity={0.8} style={s.card} onPress={openChat}>
              {result.profileImage || result.photo?.url ? (
                <Image
                  source={{ uri: result.profileImage || result.photo?.url }}
                  style={s.avatar}
                />
              ) : (
                <View style={[s.avatar, s.avatarFallback, { backgroundColor: getColor(result.name || '?') }]}>
                  <Text style={s.avatarText}>{getInitials(result.name || '?')}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{result.name}</Text>
                <Text style={s.email} numberOfLines={1}>{result.email}</Text>
                {statusLabel && (
                  <Text style={[s.statusLabel, { color: statusLabel.color }]}>
                    {statusLabel.label}
                  </Text>
                )}
              </View>
              <View style={s.chatCta}>
                <Ionicons name="chatbubble-ellipses" size={18} color={T.accent} />
                <Text style={s.chatCtaText}>Chat</Text>
              </View>
            </TouchableOpacity>
          )}

          {!result && !error && !loading && (
            <View style={s.empty}>
              <Ionicons name="person-add-outline" size={56} color={T.textMuted} />
              <Text style={s.emptyTitle}>Find someone to chat</Text>
              <Text style={s.emptySub}>
                Enter their full email. Your first message will appear in their{'n'}
                Message Requests until they reply.
              </Text>
            </View>
          )}
        </View>
      </View>
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, height: 56,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn: { padding: 6, width: 32 },
  headerTitle: { flex: 1, textAlign: 'center', color: T.textPrimary, fontSize: 17, fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: T.bg,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surfaceHigh, borderRadius: 12,
    paddingHorizontal: 12, height: 44,
    borderWidth: 1, borderColor: T.border,
  },
  input: { flex: 1, color: T.textPrimary, fontSize: 14, padding: 0 },
  searchBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center',
  },
  hint: { color: T.textMuted, fontSize: 12, paddingHorizontal: 16, marginBottom: 8 },

  body: { flex: 1, paddingHorizontal: 14, paddingTop: 8 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(248,81,73,0.10)', borderColor: 'rgba(248,81,73,0.30)',
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14,
  },
  errorText: { color: '#F85149', fontSize: 13, flex: 1 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: T.surfaceHigh, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: T.border,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  name: { color: T.textPrimary, fontSize: 15, fontWeight: '700' },
  email: { color: T.textSecond, fontSize: 12, marginTop: 2 },
  statusLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  chatCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: T.accentDim, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10,
  },
  chatCtaText: { color: T.accent, fontWeight: '700', fontSize: 13 },

  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30, gap: 10 },
  emptyTitle: { color: T.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 6 },
  emptySub: { color: T.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
})
