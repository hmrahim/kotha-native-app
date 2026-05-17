import React from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, StatusBar, Linking, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { T } from '../theme'

// ─── Developer Data ───────────────────────────────────────────────────────────
const DEV = {
  name:    'HOSSAIN MOHAMMAD RAHIM',
  title:   'Full-Stack & Mobile App Developer',
  bio:     'Passionate developer who loves building modern, scalable, and beautiful applications. Focused on clean architecture, smooth UX, and real-world problem solving.\n\nCreator of this app — designed and developed every pixel from scratch.',
  location:'Riyadh, Saudi Arabia ',
  skills:  ['React Native', 'Node.js', 'JavaScript', 'Firebase', 'MongoDB', 'Express.js', 'Expo', 'REST API'],
  links: [
    { label: 'Portfolio', icon: 'globe-outline', url: 'https://hmrahims.web.app',                                       color: '#2DD4BF', bg: 'rgba(45,212,191,0.12)' },
    { label: 'GitHub',    icon: 'logo-github',   url: 'https://github.com/hmrahim',                                     color: '#E6EDF3', bg: 'rgba(230,237,243,0.10)' },
    { label: 'LinkedIn',  icon: 'logo-linkedin', url: 'https://www.linkedin.com/in/hossain-mohammad-rahim-4a39361b3',   color: '#0A66C2', bg: 'rgba(10,102,194,0.12)'  },
    { label: 'Facebook',  icon: 'logo-facebook', url: 'https://www.facebook.com/hmrahim.xyz',                          color: '#1877F2', bg: 'rgba(24,119,242,0.12)'  },
  ],
}

const openLink = (url) =>
  Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open link'))

// ─── Skill Chip ───────────────────────────────────────────────────────────────
function SkillChip({ label }) {
  return (
    <View style={s.chip}>
      <Text style={s.chipText}>{label}</Text>
    </View>
  )
}

// ─── Link Button ──────────────────────────────────────────────────────────────
function LinkButton({ item }) {
  return (
    <TouchableOpacity
      style={[s.linkBtn, { backgroundColor: item.bg, borderColor: item.color + '40' }]}
      onPress={() => openLink(item.url)}
      activeOpacity={0.75}
    >
      <Ionicons name={item.icon} size={20} color={item.color} />
      <Text style={[s.linkLabel, { color: item.color }]}>{item.label}</Text>
      <Ionicons name="open-outline" size={13} color={item.color + 'AA'} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function DeveloperScreen() {
  const router = useRouter()

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={T.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Developer</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Section ── */}
        <View style={s.hero}>
          {/* Glow ring behind image */}
          <View style={s.glowRing} />

          <Image
            source={require('../assets/rahim.png')}
            style={s.avatar}
            resizeMode="cover"
          />

          <Text style={s.name}>{DEV.name}</Text>
          <Text style={s.title}>{DEV.title}</Text>

          <View style={s.locationRow}>
            <Ionicons name="location-outline" size={14} color={T.textMuted} />
            <Text style={s.location}>{DEV.location}</Text>
          </View>

          {/* Accent line */}
          <View style={s.accentLine} />
        </View>

        {/* ── Bio ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="person-outline" size={15} color={T.accent} />
            <Text style={s.sectionTitle}>About</Text>
          </View>
          <Text style={s.bio}>{DEV.bio}</Text>
        </View>

        {/* ── Skills ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="code-slash-outline" size={15} color={T.accent} />
            <Text style={s.sectionTitle}>Tech Stack</Text>
          </View>
          <View style={s.chipsWrap}>
            {DEV.skills.map((sk) => <SkillChip key={sk} label={sk} />)}
          </View>
        </View>

        {/* ── Links ── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="link-outline" size={15} color={T.accent} />
            <Text style={s.sectionTitle}>Connect</Text>
          </View>
          <View style={s.linksWrap}>
            {DEV.links.map((lnk) => <LinkButton key={lnk.label} item={lnk} />)}
          </View>
        </View>

        {/* ── Footer note ── */}
        <View style={s.footer}>
          <Ionicons name="heart" size={13} color={T.accent} />
          <Text style={s.footerText}>Built with passion by Rahim</Text>
          <Ionicons name="heart" size={13} color={T.accent} />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.surface, paddingHorizontal: 12, paddingVertical: 10,
    height: 60, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn:     { padding: 6 },
  headerTitle: { color: T.textPrimary, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },

  scroll: { paddingHorizontal: 20, paddingTop: 32 },

  // Hero
  hero: { alignItems: 'center', marginBottom: 32 },
  glowRing: {
    position: 'absolute', top: -6,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: T.accent,
    opacity: 0.12,
    transform: [{ scale: 1.35 }],
  },
  avatar: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: T.accent,
    marginBottom: 16,
  },
  name:     { color: T.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
  title:    { color: T.accent, fontSize: 13, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  location: { color: T.textMuted, fontSize: 13 },
  accentLine: {
    marginTop: 20, width: 48, height: 3,
    backgroundColor: T.accent, borderRadius: 2, opacity: 0.7,
  },

  // Section
  section: {
    backgroundColor: T.surface, borderRadius: 16,
    borderWidth: 1, borderColor: T.border,
    padding: 16, marginBottom: 16,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle:  { color: T.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },

  // Bio
  bio: { color: T.textSecond, fontSize: 14, lineHeight: 22 },

  // Skills
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: T.accentDim, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: T.accent + '35',
  },
  chipText: { color: T.accent, fontSize: 12, fontWeight: '700' },

  // Links
  linksWrap: { gap: 10 },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  linkLabel: { fontSize: 14, fontWeight: '700' },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 8, marginBottom: 4,
  },
  footerText: { color: T.textMuted, fontSize: 12 },
})