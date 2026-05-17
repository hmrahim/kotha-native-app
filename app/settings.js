import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Image,
  Alert,
  StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { T, getColor, getInitials } from '../theme'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  )
}

function SettingRow({ icon, iconBg, label, sublabel, onPress, rightElement, danger }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.65}>
      <View style={[s.iconWrap, { backgroundColor: iconBg || T.surfaceHigh }]}>
        <Ionicons name={icon} size={18} color={danger ? '#FF5A5A' : T.accent} />
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, danger && { color: '#FF5A5A' }]}>{label}</Text>
        {sublabel ? <Text style={s.rowSub}>{sublabel}</Text> : null}
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={16} color={danger ? '#FF5A5A' : T.textMuted} />}
    </TouchableOpacity>
  )
}

function ToggleRow({ icon, label, sublabel, value, onValueChange }) {
  return (
    <View style={s.row}>
      <View style={[s.iconWrap, { backgroundColor: T.surfaceHigh }]}>
        <Ionicons name={icon} size={18} color={T.accent} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowLabel}>{label}</Text>
        {sublabel ? <Text style={s.rowSub}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: T.surfaceHigh, true: T.accentDim }}
        thumbColor={value ? T.accent : T.textMuted}
        ios_backgroundColor={T.surfaceHigh}
      />
    </View>
  )
}

const Divider = () => <View style={s.divider} />
const Card    = ({ children }) => <View style={s.card}>{children}</View>

// ═════════════════════════════════════════════════════════════════════════════
export default function SettingsScreen() {
  const router    = useRouter()
  const { mongoUser, logout } = useAuth()

  const [notifMessages,   setNotifMessages]   = useState(true)
  const [notifSound,      setNotifSound]      = useState(true)
  const [notifVibrate,    setNotifVibrate]    = useState(true)
  const [notifPreview,    setNotifPreview]    = useState(true)
  const [privacyOnline,   setPrivacyOnline]   = useState(true)
  const [privacyLastSeen, setPrivacyLastSeen] = useState(true)
  const [privacyRead,     setPrivacyRead]     = useState(true)
  const [privacyTyping,   setPrivacyTyping]   = useState(true)
  const [secLock,         setSecLock]         = useState(false)
  const [secBiometric,    setSecBiometric]    = useState(false)
  const [autoDownImg,     setAutoDownImg]     = useState(true)
  const [autoDownVid,     setAutoDownVid]     = useState(false)
  const [autoDownAudio,   setAutoDownAudio]   = useState(true)

  const name   = mongoUser?.name   || 'User'
  const email  = mongoUser?.email  || ''
  const avatar = mongoUser?.avatar || null

  const handleLogout = () => {
  Alert.alert(
  'Sign Out',
  'Are you sure you want to sign out of Kotha?',
  [
    {
      text: 'Cancel',
      style: 'cancel',
    },
    {
      text: 'Sign Out',
      style: 'destructive',
      onPress: async () => {
        await logout()
        router.replace('/login')
      },
    },
  ]
)
  }

  const handleClearChat = () => {
    Alert.alert(
      'Clear All Chat History',
      'সব chat history delete হয়ে যাবে। এটা undo করা যাবে না।',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => {} },
      ]
    )
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tab)')} style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={T.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

     

        {/* ACCOUNT */}
        <SectionHeader title="Account" />
        <Card>
          <SettingRow icon="mail-outline"              iconBg="rgba(45,212,191,0.12)" label="Email"                      sublabel={email}                          onPress={() => {}} />
          <Divider />
          <SettingRow icon="lock-closed-outline"       iconBg="rgba(45,212,191,0.12)" label="Change Password"                                                      onPress={() => router.push('/change-password')} />
          <Divider />
          <SettingRow icon="phone-portrait-outline"    iconBg="rgba(45,212,191,0.12)" label="Linked Devices"             sublabel="Manage active sessions"         onPress={() => {}} />
          <Divider />
          <SettingRow icon="shield-checkmark-outline"  iconBg="rgba(45,212,191,0.12)" label="Two-Factor Authentication"  sublabel="Extra layer of security"        onPress={() => {}} />
        </Card>

        {/* PRIVACY */}
        <SectionHeader title="Privacy" />
        <Card>
          <ToggleRow icon="eye-outline"            label="Online Status"    sublabel="Others can see when you're online"     value={privacyOnline}   onValueChange={setPrivacyOnline} />
          <Divider />
          <ToggleRow icon="time-outline"           label="Last Seen"        sublabel="Show when you were last active"        value={privacyLastSeen} onValueChange={setPrivacyLastSeen} />
          <Divider />
          <ToggleRow icon="checkmark-done-outline" label="Read Receipts"    sublabel="Show blue ticks when message is read"  value={privacyRead}     onValueChange={setPrivacyRead} />
          <Divider />
          <ToggleRow icon="create-outline"         label="Typing Indicator" sublabel="Show when you are typing"             value={privacyTyping}   onValueChange={setPrivacyTyping} />
          <Divider />
          <SettingRow icon="ban-outline" iconBg="rgba(245,158,11,0.12)" label="Blocked Contacts" sublabel="Manage blocked users" onPress={() => {}} />
        </Card>

        {/* NOTIFICATIONS */}
        <SectionHeader title="Notifications" />
        <Card>
          <ToggleRow icon="notifications-outline"  label="Message Notifications" sublabel="Notify on new messages"                 value={notifMessages} onValueChange={setNotifMessages} />
          <Divider />
          <ToggleRow icon="volume-high-outline"    label="Notification Sound"                                                      value={notifSound}    onValueChange={setNotifSound} />
          <Divider />
          <ToggleRow icon="phone-portrait-outline" label="Vibration"                                                               value={notifVibrate}  onValueChange={setNotifVibrate} />
          <Divider />
          <ToggleRow icon="eye-outline"            label="Message Preview" sublabel="Show message content in notification"         value={notifPreview}  onValueChange={setNotifPreview} />
          <Divider />
          <SettingRow icon="musical-note-outline" iconBg="rgba(45,212,191,0.12)" label="Notification Tone" sublabel="Default"     onPress={() => {}} />
        </Card>

    

        {/* SECURITY */}
        <SectionHeader title="Security" />
        <Card>
          <ToggleRow icon="lock-closed-outline"  label="App Lock"       sublabel="Require PIN to open app"       value={secLock}      onValueChange={setSecLock} />
          <Divider />
          <ToggleRow icon="finger-print-outline" label="Biometric Lock" sublabel="Use fingerprint / Face ID"     value={secBiometric} onValueChange={setSecBiometric} />
          <Divider />
          <SettingRow icon="key-outline"     iconBg="rgba(45,212,191,0.12)" label="Active Sessions"  sublabel="View & revoke logged-in devices"   onPress={() => {}} />
          <Divider />
          <SettingRow icon="shield-outline"  iconBg="rgba(45,212,191,0.12)" label="Encryption Info"  sublabel="Messages are end-to-end encrypted" onPress={() => {}} />
        </Card>

        {/* STORAGE & DATA */}
        <SectionHeader title="Storage & Data" />
        <Card>
          <SettingRow icon="server-outline" iconBg="rgba(45,212,191,0.12)" label="Storage Usage" sublabel="View storage breakdown" onPress={() => {}} />
          <Divider />
          <ToggleRow icon="image-outline"          label="Auto-Download Images" sublabel="Wi-Fi & Mobile Data" value={autoDownImg}   onValueChange={setAutoDownImg} />
          <Divider />
          <ToggleRow icon="videocam-outline"       label="Auto-Download Videos" sublabel="Wi-Fi only"          value={autoDownVid}   onValueChange={setAutoDownVid} />
          <Divider />
          <ToggleRow icon="mic-outline"            label="Auto-Download Audio"                                 value={autoDownAudio} onValueChange={setAutoDownAudio} />
          <Divider />
          <SettingRow icon="wifi-outline" iconBg="rgba(45,212,191,0.12)" label="Network Usage" sublabel="Monitor data consumption" onPress={() => {}} />
        </Card>

        {/* HELP & SUPPORT */}
        <SectionHeader title="Help & Support" />
        <Card>
          <SettingRow icon="help-circle-outline"         iconBg="rgba(45,212,191,0.12)" label="FAQ"              onPress={() => {}} />
          <Divider />
          <SettingRow icon="chatbubble-ellipses-outline" iconBg="rgba(45,212,191,0.12)" label="Contact Support"  onPress={() => {}} />
          <Divider />
          <SettingRow icon="bug-outline"                 iconBg="rgba(245,158,11,0.12)" label="Report a Bug"     onPress={() => {}} />
          <Divider />
          <SettingRow icon="star-outline"                iconBg="rgba(245,158,11,0.12)" label="Rate the App"     onPress={() => {}} />
        </Card>

        {/* DEVELOPER & ABOUT */}
        <SectionHeader title="Developer & About" />
        <Card>
          <SettingRow
            icon="information-circle-outline"
            iconBg="rgba(45,212,191,0.12)"
            label="App Version"
            sublabel="v1.0.0 (Build 1)"
            onPress={() => {}}
            rightElement={
              <View style={s.badge}><Text style={s.badgeText}>Latest</Text></View>
            }
          />
          <Divider />
          <SettingRow icon="document-text-outline" iconBg="rgba(45,212,191,0.12)" label="Terms of Service"     onPress={() => {}} />
          <Divider />
          <SettingRow icon="lock-open-outline"     iconBg="rgba(45,212,191,0.12)" label="Privacy Policy"       onPress={() => {}} />
          <Divider />
          <SettingRow icon="layers-outline"        iconBg="rgba(45,212,191,0.12)" label="Open Source Licenses" onPress={() => {}} />
          <Divider />
          <SettingRow icon="code-slash-outline"    iconBg="rgba(45,212,191,0.12)" label="Developer"            sublabel="Hossain Mohammad Rahim" onPress={() => router.push('/developer')} />
        </Card>

        {/* LOGOUT */}
        <SectionHeader title="Account Actions" />
        <Card>
          <SettingRow
            icon="log-out-outline"
            iconBg="rgba(255,90,90,0.12)"
            label="Logout"
            danger
            onPress={handleLogout}
          />
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

// ─── Main Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.surface, paddingHorizontal: 12, paddingVertical: 10,
    height: 60, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn:     { padding: 6 },
  headerTitle: { color: T.textPrimary, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  scroll:      { paddingHorizontal: 16, paddingTop: 16 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderRadius: 16, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: T.border, gap: 14,
  },
  avatarWrap:    { width: 62, height: 62 },
  avatar:        { width: 62, height: 62, borderRadius: 31 },
  avatarFallback:{ alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: '#fff', fontWeight: '800', fontSize: 22, letterSpacing: 0.5 },
  editDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.surface,
  },
  profileInfo:  { flex: 1 },
  profileName:  { color: T.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  profileEmail: { color: T.textSecond, fontSize: 13, marginBottom: 4 },
  profileTap:   { color: T.accent, fontSize: 12, fontWeight: '500' },

  sectionHeader: { paddingHorizontal: 4, marginBottom: 8, marginTop: 4 },
  sectionTitle:  { color: T.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },

  card:    { backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, marginBottom: 20, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconWrap:{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel:{ color: T.textPrimary, fontSize: 15, fontWeight: '500' },
  rowSub:  { color: T.textSecond, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: T.border, marginLeft: 60 },

  badge:     { backgroundColor: T.accentDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: T.accent, fontSize: 11, fontWeight: '700' },
})