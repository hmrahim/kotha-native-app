import React, { useState, useEffect, useRef } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Dimensions, Platform, Animated,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { T } from '../theme'

const { width } = Dimensions.get('window')

// ─────────────────────────────────────────────────────────────────────────────
// Facebook Messenger-inspired background presets
// (animated types: 'animated_hearts', 'animated_stars', 'animated_bubbles',
//  'animated_petals', 'animated_fireflies', 'animated_confetti',
//  'animated_aurora', 'animated_snow', 'animated_sparkles', 'animated_waves')
// ─────────────────────────────────────────────────────────────────────────────
export const BG_PRESETS = [
  // ── Default ──────────────────────────────────────────────────────────────
  {
    id: 'default',
    type: 'default',
    value: null,
    label: 'Default',
    preview: T.chatBg ?? '#0A0F16',
    emoji: '💬',
  },

  // ── Messenger Animated (exact replicas) ──────────────────────────────────
  {
    id: 'messenger_love',
    type: 'animated_hearts',
    value: JSON.stringify({ bg1: '#FF4FA4', bg2: '#FF1744', particle: '#FF80AB' }),
    label: 'Love 💗',
    preview: ['#FF4FA4', '#FF1744'],
    emoji: '❤️',
    msn: true,
  },
  {
    id: 'messenger_galaxy',
    type: 'animated_stars',
    value: JSON.stringify({ bg1: '#0d0221', bg2: '#1a0533', particle: '#FFD700' }),
    label: 'Galaxy ✨',
    preview: ['#0d0221', '#1a0533'],
    emoji: '🌌',
    msn: true,
  },
  {
    id: 'messenger_tie_dye',
    type: 'animated_aurora',
    value: JSON.stringify({ bg1: '#FF6EC7', bg2: '#7B2FFF', particle: '#00FFFF' }),
    label: 'Tie Dye 🌈',
    preview: ['#FF6EC7', '#7B2FFF'],
    emoji: '🌈',
    msn: true,
  },
  {
    id: 'messenger_ocean',
    type: 'animated_waves',
    value: JSON.stringify({ bg1: '#006994', bg2: '#001F3F', particle: '#00D4FF' }),
    label: 'Ocean 🌊',
    preview: ['#006994', '#001F3F'],
    emoji: '🌊',
    msn: true,
  },
  {
    id: 'messenger_cherry_blossom',
    type: 'animated_petals',
    value: JSON.stringify({ bg1: '#FFDDE1', bg2: '#EE9CA7', particle: '#FF80AB' }),
    label: 'Sakura 🌸',
    preview: ['#FFDDE1', '#EE9CA7'],
    emoji: '🌸',
    msn: true,
  },
  {
    id: 'messenger_birthday',
    type: 'animated_confetti',
    value: JSON.stringify({ bg1: '#6A11CB', bg2: '#2575FC', particle: '#FFD700' }),
    label: 'Party 🎉',
    preview: ['#6A11CB', '#2575FC'],
    emoji: '🎊',
    msn: true,
  },
  {
    id: 'messenger_fireflies',
    type: 'animated_fireflies',
    value: JSON.stringify({ bg1: '#0a1628', bg2: '#0d3b0d', particle: '#ADFF2F' }),
    label: 'Fireflies 🪲',
    preview: ['#0a1628', '#0d3b0d'],
    emoji: '🌿',
    msn: true,
  },
  {
    id: 'messenger_snow',
    type: 'animated_snow',
    value: JSON.stringify({ bg1: '#1a2a6c', bg2: '#b21f1f', particle: '#FFFFFF' }),
    label: 'Snow ❄️',
    preview: ['#1a2a6c', '#b21f1f'],
    emoji: '❄️',
    msn: true,
  },
  {
    id: 'messenger_sparkle',
    type: 'animated_sparkles',
    value: JSON.stringify({ bg1: '#1a0a2e', bg2: '#4a0080', particle: '#E040FB' }),
    label: 'Sparkle 💜',
    preview: ['#1a0a2e', '#4a0080'],
    emoji: '💜',
    msn: true,
  },
  {
    id: 'messenger_sunset',
    type: 'animated_bubbles',
    value: JSON.stringify({ bg1: '#f83600', bg2: '#f9d423', particle: '#FF6B35' }),
    label: 'Sunset 🌅',
    preview: ['#f83600', '#f9d423'],
    emoji: '🌅',
    msn: true,
  },

  // ── Romantic Gradients ────────────────────────────────────────────────────
  { id: 'rosegold',     type: 'gradient', value: '["#3d0c11","#c9406a"]', label: '🌹 Rose',    preview: ['#3d0c11','#c9406a'] },
  { id: 'twilight',     type: 'gradient', value: '["#0f0c29","#302b63","#24243e"]', label: '💜 Twilight', preview: ['#0f0c29','#24243e'] },
  { id: 'cherrynight',  type: 'gradient', value: '["#200122","#6f0000"]', label: '🍒 Cherry',  preview: ['#200122','#6f0000'] },
  { id: 'starfall',     type: 'gradient', value: '["#1a1a2e","#0f3460"]', label: '✨ Starfall', preview: ['#1a1a2e','#0f3460'] },
  { id: 'blush',        type: 'gradient', value: '["#f8b4c8","#c94a7e"]', label: '🌸 Blush',   preview: ['#f8b4c8','#c94a7e'] },
  { id: 'midnightrose', type: 'gradient', value: '["#1a0a15","#c94b7a"]', label: '🌙 M.Rose',  preview: ['#1a0a15','#c94b7a'] },
  { id: 'lovecloud',    type: 'gradient', value: '["#ffecd2","#ff9a9e"]', label: '☁️ Cloud',   preview: ['#ffecd2','#ff9a9e'] },
  { id: 'velvet',       type: 'gradient', value: '["#360033","#0b8793"]', label: '💎 Velvet',  preview: ['#360033','#0b8793'] },
  { id: 'purpledream',  type: 'gradient', value: '["#4a0080","#d7a8e0"]', label: '🔮 Dream',   preview: ['#4a0080','#d7a8e0'] },
  { id: 'ember',        type: 'gradient', value: '["#0d0d0d","#ff4500"]', label: '🔥 Ember',   preview: ['#0d0d0d','#ff4500'] },
  { id: 'golden',       type: 'gradient', value: '["#373b44","#4286f4"]', label: '🌟 Golden',  preview: ['#373b44','#4286f4'] },
  { id: 'mint',         type: 'gradient', value: '["#004d40","#80cbc4"]', label: '🌿 Mint',    preview: ['#004d40','#80cbc4'] },

  // ── Solid Colors ──────────────────────────────────────────────────────────
  { id: 'deeprose',   type: 'solid', value: '#4a0e2a', label: '🌷 D.Rose',  preview: '#4a0e2a' },
  { id: 'darkpurple', type: 'solid', value: '#1a0a2e', label: '💜 Purple',  preview: '#1a0a2e' },
  { id: 'darknavy',   type: 'solid', value: '#0a0f1e', label: '🌊 Navy',    preview: '#0a0f1e' },
]

// ── Bubble colors per preset ──────────────────────────────────────────────────
export const BUBBLE_COLORS = {
  default:              { me: '#c9406a',              them: '#2a1020' },
  messenger_love:       { me: '#FF1744',              them: 'rgba(255,50,100,0.35)' },
  messenger_galaxy:     { me: '#7C4DFF',              them: 'rgba(60,20,100,0.55)' },
  messenger_tie_dye:    { me: '#FF6EC7',              them: 'rgba(80,20,160,0.50)' },
  messenger_ocean:      { me: '#0288D1',              them: 'rgba(0,40,80,0.60)' },
  messenger_cherry_blossom: { me: '#E91E8C',          them: 'rgba(200,80,120,0.30)' },
  messenger_birthday:   { me: '#651FFF',              them: 'rgba(30,10,80,0.55)' },
  messenger_fireflies:  { me: '#33691E',              them: 'rgba(10,30,10,0.60)' },
  messenger_snow:       { me: '#1565C0',              them: 'rgba(30,20,100,0.50)' },
  messenger_sparkle:    { me: '#AA00FF',              them: 'rgba(40,0,80,0.55)' },
  messenger_sunset:     { me: '#E64A19',              them: 'rgba(100,30,0,0.50)' },
  rosegold:             { me: '#c9406a',              them: '#5a1a28' },
  twilight:             { me: '#6c3fc4',              them: '#1e1a3a' },
  cherrynight:          { me: '#8b0000',              them: '#300a0a' },
  starfall:             { me: '#0f3460',              them: '#16213e' },
  blush:                { me: '#c94a7e',              them: '#e8789a' },
  midnightrose:         { me: '#c94b7a',              them: '#3a0a20' },
  lovecloud:            { me: '#e8789a',              them: '#ffd5c2' },
  velvet:               { me: '#0b8793',              them: '#200020' },
  purpledream:          { me: '#9b59b6',              them: '#2e004d' },
  ember:                { me: '#cc3700',              them: '#1a0a00' },
  golden:               { me: '#4286f4',              them: '#252830' },
  mint:                 { me: '#00897b',              them: '#00332c' },
  deeprose:             { me: '#8b2252',              them: '#2a0a18' },
  darkpurple:           { me: '#5c2d91',              them: '#0f0620' },
  darknavy:             { me: '#1e3a6e',              them: '#05080f' },
  image:                { me: 'rgba(180,30,80,0.80)', them: 'rgba(20,10,30,0.78)' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated preview thumbnail (shown in picker grid)
// ─────────────────────────────────────────────────────────────────────────────
const PARTICLES = 7

function AnimatedPreview({ preset, size }) {
  const anim = useRef(
    Array.from({ length: PARTICLES }, () => ({
      x: new Animated.Value(Math.random()),
      y: new Animated.Value(Math.random()),
      o: new Animated.Value(Math.random()),
      s: new Animated.Value(0.5 + Math.random() * 0.5),
    }))
  ).current

  useEffect(() => {
    const loops = anim.map(({ x, y, o, s }) => {
      const dur = 1800 + Math.random() * 2200
      return Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(y, { toValue: Math.random(), duration: dur, useNativeDriver: true }),
            Animated.timing(y, { toValue: Math.random(), duration: dur, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(o, { toValue: 0.2 + Math.random() * 0.8, duration: dur / 2, useNativeDriver: true }),
            Animated.timing(o, { toValue: 0.1, duration: dur / 2, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(s, { toValue: 0.4 + Math.random() * 0.6, duration: dur, useNativeDriver: true }),
            Animated.timing(s, { toValue: 0.3, duration: dur, useNativeDriver: true }),
          ]),
        ])
      )
    })
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [])

  const [c1, c2] = Array.isArray(preset.preview) ? preset.preview : [preset.preview, preset.preview]
  const particle = preset.value ? (() => { try { return JSON.parse(preset.value).particle } catch { return '#fff' } })() : '#fff'

  const EMOJI_MAP = {
    animated_hearts: '❤',
    animated_stars: '★',
    animated_petals: '✿',
    animated_confetti: '●',
    animated_fireflies: '•',
    animated_snow: '❄',
    animated_sparkles: '✦',
    animated_bubbles: '○',
    animated_aurora: '~',
    animated_waves: '≈',
  }
  const symbol = EMOJI_MAP[preset.type] || '•'

  return (
    <View style={[{ width: size, height: size, borderRadius: 10, overflow: 'hidden' }]}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: c1 }]} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: c2, opacity: 0.55, top: '40%' }]} />
      {anim.map(({ x, y, o, s }, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: `${10 + (i * 13) % 80}%`,
            top: 0,
            color: particle,
            fontSize: 9,
            opacity: o,
            transform: [
              { translateY: Animated.multiply(y, size) },
              { scale: s },
            ],
          }}
        >
          {symbol}
        </Animated.Text>
      ))}
    </View>
  )
}

// Simple gradient swatch for non-animated presets
function GradientStrip({ colors, style }) {
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <View style={{ flex: 1, backgroundColor: colors[0] }} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors[1], opacity: 0.6, top: '40%' }]} />
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Picker Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatBackgroundPicker({ visible, onClose, currentBg, onSelect }) {
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState(currentBg?.id || 'default')

  const handleApply = (preset) => {
    setSelected(preset.id)
    onSelect({ type: preset.type, value: preset.value, id: preset.id })
  }

  const handlePickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Permission required', 'Allow photo access to set a custom background.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      })
      if (result.canceled || !result.assets?.[0]?.uri) return
      const uri = result.assets[0].uri
      setSelected('image')
      onSelect({ type: 'image', value: uri, id: 'image' })
    } catch {
      Alert.alert('Error', 'Could not open photo library.')
    }
  }

  const animated   = BG_PRESETS.filter((p) => p.type.startsWith('animated_'))
  const gradients  = BG_PRESETS.filter((p) => p.type === 'gradient')
  const solids     = BG_PRESETS.filter((p) => p.type === 'solid' || p.type === 'default')

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
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={T.accent} />
          </TouchableOpacity>
          <Text style={s.title}>Chat Background</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

          {/* Custom photo */}
          <TouchableOpacity style={s.uploadBtn} onPress={handlePickImage} activeOpacity={0.8}>
            <View style={s.uploadIcon}>
              <Ionicons name="image-outline" size={24} color={T.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.uploadTitle}>Custom Photo</Text>
              <Text style={s.uploadSub}>Pick any image from your gallery</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={T.textMuted} />
          </TouchableOpacity>

          {/* ── Messenger Animated Section ── */}
          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>MESSENGER ANIMATED</Text>
            <View style={s.messengerBadge}><Text style={s.messengerBadgeText}>✦ Live</Text></View>
          </View>

          <View style={s.grid}>
            {animated.map((preset) => {
              const isActive = selected === preset.id
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[s.cell, isActive && s.cellActive]}
                  onPress={() => handleApply(preset)}
                  activeOpacity={0.8}
                >
                  <AnimatedPreview preset={preset} size={CELL} />
                  {isActive && (
                    <View style={s.checkBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                  <Text style={s.cellLabel} numberOfLines={1}>{preset.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* ── Gradient Section ── */}
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>ROMANTIC GRADIENTS</Text>
          <View style={s.grid}>
            {gradients.map((preset) => {
              const isActive = selected === preset.id
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[s.cell, isActive && s.cellActive]}
                  onPress={() => handleApply(preset)}
                  activeOpacity={0.8}
                >
                  <GradientStrip colors={preset.preview} style={s.swatch} />
                  {isActive && (
                    <View style={s.checkBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                  <Text style={s.cellLabel} numberOfLines={1}>{preset.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* ── Solid / Default Section ── */}
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>SOLID COLORS</Text>
          <View style={s.grid}>
            {solids.map((preset) => {
              const isActive = selected === preset.id
              const bg = Array.isArray(preset.preview) ? preset.preview[0] : preset.preview
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[s.cell, isActive && s.cellActive]}
                  onPress={() => handleApply(preset)}
                  activeOpacity={0.8}
                >
                  <View style={[s.swatch, { backgroundColor: bg }]}>
                    {preset.type === 'default' && (
                      <Text style={{ fontSize: 22, textAlign: 'center', marginTop: CELL * 0.2 }}>💬</Text>
                    )}
                  </View>
                  {isActive && (
                    <View style={s.checkBadge}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                  <Text style={s.cellLabel} numberOfLines={1}>{preset.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={s.note}>
            Background changes sync to both sides — just like Messenger. ✨
          </Text>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatBackground renderer — use this in your chat screen instead of a plain View
// Handles: default, solid, gradient (approximated), animated_*, image
// ─────────────────────────────────────────────────────────────────────────────
export function ChatBackground({ bg, children, style }) {
  if (!bg || bg.type === 'default') {
    return <View style={[{ flex: 1, backgroundColor: T.chatBg }, style]}>{children}</View>
  }

  if (bg.type === 'solid') {
    return <View style={[{ flex: 1, backgroundColor: bg.value }, style]}>{children}</View>
  }

  if (bg.type === 'gradient') {
    let colors
    try { colors = JSON.parse(bg.value) } catch { colors = ['#0A0F16', '#0A0F16'] }
    return (
      <View style={[{ flex: 1, backgroundColor: colors[0] }, style]}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors[colors.length - 1], opacity: 0.7, top: '35%' }]} />
        {children}
      </View>
    )
  }

  if (bg.type === 'image') {
    const { ImageBackground } = require('react-native')
    return (
      <ImageBackground source={{ uri: bg.value }} style={[{ flex: 1 }, style]} resizeMode="cover">
        {children}
      </ImageBackground>
    )
  }

  if (bg.type.startsWith('animated_')) {
    return <AnimatedChatBg bg={bg} style={style}>{children}</AnimatedChatBg>
  }

  return <View style={[{ flex: 1, backgroundColor: T.chatBg }, style]}>{children}</View>
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-screen animated background for the chat screen
// ─────────────────────────────────────────────────────────────────────────────
const FULL_PARTICLES = 18

export function AnimatedChatBg({ bg, children, style }) {
  const cfg = (() => { try { return JSON.parse(bg.value) } catch { return {} } })()
  const { bg1 = '#0A0F16', bg2 = '#0A0F16', particle = '#fff' } = cfg

  const particles = useRef(
    Array.from({ length: FULL_PARTICLES }, (_, i) => ({
      x:   Math.random() * 100,            // % from left
      dur: 3000 + Math.random() * 5000,
      delay: (i / FULL_PARTICLES) * 6000,
      size: 6 + Math.random() * 14,
      anim: new Animated.Value(0),
      oAnim: new Animated.Value(0),
    }))
  ).current

  useEffect(() => {
    const loops = particles.map(({ anim, oAnim, dur, delay }) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim,  { toValue: 1, duration: dur, useNativeDriver: true }),
            Animated.sequence([
              Animated.timing(oAnim, { toValue: 1, duration: dur * 0.2, useNativeDriver: true }),
              Animated.timing(oAnim, { toValue: 0.7, duration: dur * 0.6, useNativeDriver: true }),
              Animated.timing(oAnim, { toValue: 0, duration: dur * 0.2, useNativeDriver: true }),
            ]),
          ]),
        ])
      )
    )
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [])

  const SYMBOL_MAP = {
    animated_hearts:    ['❤', '💕', '💗', '💖', '💓'],
    animated_stars:     ['★', '✦', '✧', '✩', '⊹'],
    animated_aurora:    ['~', '≋', '∿', '꩜', '◌'],
    animated_petals:    ['✿', '❀', '✾', '❁', '✽'],
    animated_confetti:  ['●', '■', '▲', '★', '♦'],
    animated_fireflies: ['•', '·', '∘', '◦', '○'],
    animated_snow:      ['❄', '❅', '❆', '✻', '✼'],
    animated_sparkles:  ['✦', '✧', '✩', '✵', '✴'],
    animated_bubbles:   ['○', '◌', '◎', '●', '◉'],
    animated_waves:     ['≈', '∼', '⌇', '≋', '∿'],
  }
  const symbols = SYMBOL_MAP[bg.type] || ['•']

  const { height } = Dimensions.get('window')

  return (
    <View style={[{ flex: 1, backgroundColor: bg1 }, style]}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg2, opacity: 0.6, top: '40%' }]} />

      {particles.map(({ x, anim, oAnim, size, dur }, i) => {
        const symbol = symbols[i % symbols.length]
        return (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              bottom: -size,
              fontSize: size,
              color: particle,
              opacity: oAnim,
              transform: [{
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -(height + size * 2)],
                }),
              }],
            }}
          >
            {symbol}
          </Animated.Text>
        )
      })}

      {children}
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const CELL = (width - 48 - 12 * 3) / 4

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  iconBtn: { padding: 4 },
  title:   { color: T.textPrimary, fontSize: 17, fontWeight: '700' },
  scroll:  { padding: 16, paddingBottom: 60 },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: T.surface,
    borderRadius: 14, padding: 14, marginBottom: 24,
    borderWidth: 1, borderColor: T.border,
  },
  uploadIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: T.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadTitle: { color: T.textPrimary, fontSize: 15, fontWeight: '600' },
  uploadSub:   { color: T.textMuted,   fontSize: 12, marginTop: 2 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  sectionLabel: {
    color: T.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1,
  },
  messengerBadge: {
    backgroundColor: 'rgba(45,212,191,0.15)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(45,212,191,0.3)',
  },
  messengerBadgeText: { color: T.accent, fontSize: 10, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  cell: {
    width: CELL, alignItems: 'center',
    borderRadius: 12, overflow: 'visible',
    borderWidth: 2, borderColor: 'transparent', paddingBottom: 4,
  },
  cellActive: { borderColor: T.accent },

  swatch: { width: CELL, height: CELL, borderRadius: 10, marginBottom: 6, overflow: 'hidden' },

  checkBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  cellLabel: { color: T.textSecond, fontSize: 11, fontWeight: '500' },

  note: {
    color: T.textMuted, fontSize: 12, textAlign: 'center',
    marginTop: 24, lineHeight: 17,
  },
})