import React, { useEffect, useState, useCallback } from 'react'
import {
  Modal, View, Text, Image, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions, Linking, ActivityIndicator, Alert,
  TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { T, getColor, getInitials } from '../theme'
import { getActiveUser, blockUser, unblockUser, setNickname } from '../services/api'

const { width } = Dimensions.get('window')
const COVER_H = 200

/**
 * Props:
 *  visible        — modal open/close
 *  onClose        — close handler
 *  userId         — target user's mongo _id
 *  myId           — current user's mongo _id (for self-nickname)
 *  name           — fallback name (from chat params)
 *  online         — boolean
 *  lastSeen       — string
 *  blockStatus    — { blockedByMe, blockedByThem }  ← parent owns this state
 *  onBlockChanged — (newStatus) => void              ← parent updates state instantly
 *  onOpenBackground — () => void                    ← open background picker
 *  nicknames      — { [userId]: nickname }          ← current nicknames map
 *  onNicknamesChanged — (newNicknames) => void      ← parent updates nicknames
 */
export default function UserProfileModal({
  visible,
  onClose,
  userId,
  myId,
  name,
  online,
  lastSeen,
  blockStatus = { blockedByMe: false, blockedByThem: false },
  onBlockChanged,
  onOpenBackground,
  nicknames = {},
  onNicknamesChanged,
}) {
  const insets      = useSafeAreaInsets()
  const [profile,   setProfile]   = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)

  // ── Nickname modal state ────────────────────────────────────────────────────
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [nicknameTarget, setNicknameTarget]       = useState(null)  // userId
  const [nicknameTargetLabel, setNicknameTargetLabel] = useState('')
  const [nicknameInput, setNicknameInput]         = useState('')
  const [nicknameBusy, setNicknameBusy]           = useState(false)

  // ── Load profile only (block status comes from parent) ──────────────────────
  const loadProfile = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const prof = await getActiveUser(userId)
      setProfile(prof ?? null)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (visible) loadProfile()
  }, [visible, loadProfile])

  // ── Nickname handlers ──────────────────────────────────────────────────────
  const openNicknameEdit = (targetId, label, currentNickname) => {
    setNicknameTarget(targetId)
    setNicknameTargetLabel(label)
    setNicknameInput(currentNickname || '')
    setShowNicknameModal(true)
  }

  const saveNickname = async () => {
    if (!nicknameTarget || !userId) return
    setNicknameBusy(true)
    try {
      const res = await setNickname(userId, nicknameTarget, nicknameInput.trim())
      onNicknamesChanged?.(res.nicknames ?? {})
      setShowNicknameModal(false)
    } catch {
      Alert.alert('Error', 'Could not save nickname. Try again.')
    } finally {
      setNicknameBusy(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const rawName     = profile?.name || name || 'User'
  // যদি nickname set করা থাকে তাহলে সেটা দেখাও, না হলে real name
  const displayName = (userId && nicknames[userId]) ? nicknames[userId] : rawName
  const myNickname  = (myId && nicknames[myId]) ? nicknames[myId] : null
  const coverUri    = profile?.coverImage
  const avatarUri   = profile?.profileImage
  const bio         = profile?.bio
  const email       = profile?.email
  const phone       = profile?.phone
  const username    = profile?.username ? `@${profile.username}` : null
  const joinedDate  = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  // ── Block / Unblock ───────────────────────────────────────────────────────
  const handleBlockToggle = () => {
    const isBlocked = blockStatus.blockedByMe
    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Unblock ${displayName}? They will be able to message you again.`
        : `Block ${displayName}? They won't be able to send you messages.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setBlockBusy(true)
            try {
              if (isBlocked) {
                await unblockUser(userId)
                // ← parent state instantly update হবে
                onBlockChanged?.({ blockedByMe: false, blockedByThem: blockStatus.blockedByThem })
              } else {
                await blockUser(userId)
                onBlockChanged?.({ blockedByMe: true, blockedByThem: blockStatus.blockedByThem })
              }
            } catch {
              Alert.alert('Error', 'Something went wrong. Please try again.')
            } finally {
              setBlockBusy(false)
            }
          },
        },
      ]
    )
  }

  const statusLabel = online
    ? '🟢 Online'
    : lastSeen
      ? `Last seen: ${lastSeen}`
      : 'Last seen recently'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[s.container, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={s.headerBar}>
          <TouchableOpacity onPress={onClose} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={T.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>

          {/* Cover */}
          <View style={s.coverWrap}>
            {coverUri
              ? <Image source={{ uri: coverUri }} style={s.cover} resizeMode="cover" />
              : <View style={[s.cover, s.coverFallback]} />
            }
          </View>

          {/* Avatar */}
          <View style={s.avatarRow}>
            <View style={s.avatarOuter}>
              {avatarUri
                ? <Image source={{ uri: avatarUri }} style={s.avatar} />
                : (
                  <View style={[s.avatar, { backgroundColor: getColor(displayName) }]}>
                    <Text style={s.avatarInitials}>{getInitials(displayName)}</Text>
                  </View>
                )
              }
              {online && <View style={s.onlineDot} />}
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={T.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.body}>

              {/* Name / username / status */}
              <Text style={s.name}>{displayName}</Text>
              {!!username   && <Text style={s.username}>{username}</Text>}
              <Text style={s.onlineStatus}>{statusLabel}</Text>

              {/* Block banners — parent state দিয়ে render */}
              {blockStatus.blockedByMe && (
                <View style={s.blockedBanner}>
                  <Ionicons name="ban" size={16} color="#ff6b6b" />
                  <Text style={s.blockedBannerText}>You have blocked this user</Text>
                </View>
              )}
              {!blockStatus.blockedByMe && blockStatus.blockedByThem && (
                <View style={[s.blockedBanner, s.blockedByThemBanner]}>
                  <Ionicons name="ban" size={16} color="#888" />
                  <Text style={[s.blockedBannerText, { color: '#888' }]}>
                    This user has blocked you
                  </Text>
                </View>
              )}

              <View style={s.divider} />

              {/* Info rows */}
              {!!bio && (
                <InfoRow icon="information-circle-outline" label="Bio" value={bio} />
              )}
              {!!email && (
                <InfoRow icon="mail-outline" label="Email" value={email} link
                  onPress={() => Linking.openURL(`mailto:${email}`)} />
              )}
              {!!phone && (
                <InfoRow icon="call-outline" label="Phone" value={phone} link
                  onPress={() => Linking.openURL(`tel:${phone}`)} />
              )}
              {!!joinedDate && (
                <InfoRow icon="calendar-outline" label="Member since" value={joinedDate} />
              )}

              <View style={s.divider} />

              {/* Action buttons */}
              <View style={s.actions}>
                <TouchableOpacity
                  style={[
                    s.actionBtn,
                    (blockStatus.blockedByMe || blockStatus.blockedByThem) && s.actionBtnDisabled,
                  ]}
                  onPress={onClose}
                  disabled={blockStatus.blockedByMe || blockStatus.blockedByThem}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubble-ellipses" size={20} color="#0D1117" />
                  <Text style={s.actionBtnText}>Message</Text>
                </TouchableOpacity>

                {!!phone && (
                  <TouchableOpacity
                    style={[s.actionBtn, s.actionBtnOutline]}
                    onPress={() => Linking.openURL(`tel:${phone}`)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="call" size={20} color={T.accent} />
                    <Text style={[s.actionBtnText, { color: T.accent }]}>Call</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Chat Background */}
              <TouchableOpacity
                style={s.bgBtn}
                onPress={() => { onClose(); setTimeout(() => onOpenBackground?.(), 300) }}
                activeOpacity={0.8}
              >
                <Ionicons name="color-palette-outline" size={20} color={T.accent} />
                <Text style={[s.blockBtnText, { color: T.accent }]}>Chat Background</Text>
                <Ionicons name="chevron-forward" size={16} color={T.textMuted} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              {/* ── Nicknames ─────────────────────────────────────────── */}
              <View style={s.nicknameSection}>
                <Text style={s.nicknameSectionTitle}>Nicknames</Text>

                {/* Other person এর nickname */}
                <TouchableOpacity
                  style={s.nicknameRow}
                  onPress={() => openNicknameEdit(userId, rawName, nicknames[userId])}
                  activeOpacity={0.7}
                >
                  <View style={s.nicknameIcon}>
                    <Ionicons name="person-outline" size={18} color={T.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.nicknameRowLabel}>{rawName}</Text>
                    <Text style={s.nicknameRowValue}>
                      {nicknames[userId] || 'Set nickname'}
                    </Text>
                  </View>
                  <Ionicons name="pencil-outline" size={16} color={T.textMuted} />
                </TouchableOpacity>

                {/* নিজের nickname */}
                {!!myId && (
                  <TouchableOpacity
                    style={s.nicknameRow}
                    onPress={() => openNicknameEdit(myId, 'You', nicknames[myId])}
                    activeOpacity={0.7}
                  >
                    <View style={s.nicknameIcon}>
                      <Ionicons name="happy-outline" size={18} color={T.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nicknameRowLabel}>You</Text>
                      <Text style={s.nicknameRowValue}>
                        {nicknames[myId] || 'Set nickname for yourself'}
                      </Text>
                    </View>
                    <Ionicons name="pencil-outline" size={16} color={T.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Block / Unblock button */}
              <TouchableOpacity
                style={[s.blockBtn, blockStatus.blockedByMe ? s.unblockBtn : s.blockBtnActive]}
                onPress={handleBlockToggle}
                disabled={blockBusy}
                activeOpacity={0.8}
              >
                {blockBusy ? (
                  <ActivityIndicator
                    size="small"
                    color={blockStatus.blockedByMe ? T.accent : '#ff6b6b'}
                  />
                ) : (
                  <>
                    <Ionicons
                      name={blockStatus.blockedByMe ? 'checkmark-circle-outline' : 'ban'}
                      size={20}
                      color={blockStatus.blockedByMe ? T.accent : '#ff6b6b'}
                    />
                    <Text style={[
                      s.blockBtnText,
                      { color: blockStatus.blockedByMe ? T.accent : '#ff6b6b' },
                    ]}>
                      {blockStatus.blockedByMe ? 'Unblock User' : 'Block User'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

            </View>
          )}
        </ScrollView>
      </View>

      {/* ── Nickname Edit Modal ──────────────────────────────────────── */}
      <Modal
        visible={showNicknameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNicknameModal(false)}
      >
        <View style={s.nicknameOverlay}>
          <View style={s.nicknameCard}>
            <Text style={s.nicknameCardTitle}>
              Nickname for {nicknameTargetLabel}
            </Text>
            <TextInput
              style={s.nicknameInput}
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Enter nickname..."
              placeholderTextColor={T.textMuted}
              autoFocus
              maxLength={30}
            />
            <View style={s.nicknameActions}>
              <TouchableOpacity
                style={s.nicknameCancelBtn}
                onPress={() => setShowNicknameModal(false)}
              >
                <Text style={s.nicknameCancelText}>Cancel</Text>
              </TouchableOpacity>
              {/* Clear nickname বাটন */}
              {!!nicknames[nicknameTarget] && (
                <TouchableOpacity
                  style={s.nicknameClearBtn}
                  onPress={async () => {
                    setNicknameInput('')
                    setNicknameBusy(true)
                    try {
                      const res = await setNickname(userId, nicknameTarget, '')
                      onNicknamesChanged?.(res.nicknames ?? {})
                      setShowNicknameModal(false)
                    } catch {
                      Alert.alert('Error', 'Could not clear nickname.')
                    } finally {
                      setNicknameBusy(false)
                    }
                  }}
                >
                  <Text style={s.nicknameClearText}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={s.nicknameSaveBtn}
                onPress={saveNickname}
                disabled={nicknameBusy}
              >
                {nicknameBusy
                  ? <ActivityIndicator size="small" color="#0D1117" />
                  : <Text style={s.nicknameSaveText}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  )
}

// ── Info row helper ──────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, link, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View
  return (
    <Wrapper style={s.infoRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={19} color={T.accent} />
      </View>
      <View style={s.infoContent}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={[s.infoValue, link && s.infoLink]} numberOfLines={3}>{value}</Text>
      </View>
      {onPress && <Ionicons name="open-outline" size={15} color={T.textMuted} />}
    </Wrapper>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: T.bg },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  iconBtn:      { padding: 4 },
  headerTitle:  { color: T.textPrimary, fontSize: 17, fontWeight: '700' },

  coverWrap:    { position: 'relative' },
  cover:        { width, height: COVER_H },
  coverFallback:{ backgroundColor: '#1a2744' },

  avatarRow: { marginTop: -(COVER_H / 4), paddingHorizontal: 20 },
  avatarOuter: {
    width: 92, height: 92, borderRadius: 46,
    borderWidth: 3, borderColor: T.bg,
    alignSelf: 'flex-start', position: 'relative',
  },
  avatar:         { width: 86, height: 86, borderRadius: 43 },
  avatarInitials: {
    color: '#fff', fontSize: 30, fontWeight: '800',
    textAlign: 'center', lineHeight: 86,
  },
  onlineDot: {
    position: 'absolute', bottom: 4, right: 4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: T.online, borderWidth: 2, borderColor: T.bg,
  },

  body:         { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 50 },
  name:         { color: T.textPrimary, fontSize: 23, fontWeight: '800', marginBottom: 3 },
  username:     { color: T.textMuted,   fontSize: 13, marginBottom: 4 },
  onlineStatus: { color: T.accent,      fontSize: 13, marginBottom: 14 },

  blockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2a1515',
    borderWidth: 1, borderColor: '#ff6b6b44',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 14,
  },
  blockedByThemBanner: { borderColor: '#88888844', backgroundColor: '#1a1a1a' },
  blockedBannerText:   { color: '#ff6b6b', fontSize: 13, fontWeight: '600', flex: 1 },

  divider: { height: 1, backgroundColor: T.border, marginVertical: 16 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  infoIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel:   { color: T.textMuted,   fontSize: 11, fontWeight: '600', marginBottom: 2 },
  infoValue:   { color: T.textPrimary, fontSize: 14 },
  infoLink:    { color: T.accent },

  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: T.accent,
  },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnOutline: {
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: T.accent,
  },
  actionBtnText: { color: '#0D1117', fontSize: 15, fontWeight: '700' },

  blockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 14, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5,
  },
  bgBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginTop: 14, paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1.5,
    borderColor: T.accent, backgroundColor: T.accentDim,
  },
  blockBtnActive: { borderColor: '#ff6b6b', backgroundColor: '#2a1515' },
  unblockBtn:     { borderColor: T.accent,  backgroundColor: T.accentDim },
  blockBtnText:   { fontSize: 15, fontWeight: '700' },

  // ── Nickname styles ──────────────────────────────────────────────────────
  nicknameSection: {
    marginTop: 14,
    borderWidth: 1.5, borderColor: T.border,
    borderRadius: 14, overflow: 'hidden',
  },
  nicknameSectionTitle: {
    color: T.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  nicknameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  nicknameIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  nicknameRowLabel: { color: T.textPrimary, fontSize: 14, fontWeight: '600' },
  nicknameRowValue: { color: T.textMuted, fontSize: 12, marginTop: 2 },

  // Nickname edit modal
  nicknameOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  nicknameCard: {
    backgroundColor: T.surface, borderRadius: 18,
    padding: 20, width: '100%',
    borderWidth: 1, borderColor: T.border,
  },
  nicknameCardTitle: {
    color: T.textPrimary, fontSize: 16, fontWeight: '700',
    marginBottom: 16, textAlign: 'center',
  },
  nicknameInput: {
    backgroundColor: T.bg, color: T.textPrimary,
    borderWidth: 1.5, borderColor: T.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, marginBottom: 16,
  },
  nicknameActions: { flexDirection: 'row', gap: 8 },
  nicknameCancelBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1.5, borderColor: T.border,
    alignItems: 'center',
  },
  nicknameCancelText: { color: T.textMuted, fontWeight: '600', fontSize: 14 },
  nicknameClearBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#ff6b6b44',
    alignItems: 'center', backgroundColor: '#2a1515',
  },
  nicknameClearText: { color: '#ff6b6b', fontWeight: '600', fontSize: 14 },
  nicknameSaveBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 12,
    backgroundColor: T.accent, alignItems: 'center',
  },
  nicknameSaveText: { color: '#0D1117', fontWeight: '700', fontSize: 14 },
})