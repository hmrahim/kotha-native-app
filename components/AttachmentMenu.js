
import React, { useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Pressable,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { T } from '../theme'

const OPTIONS = [
  { icon: 'image',           label: 'Gallery',  color: '#A78BFA', type: 'gallery'  },
  { icon: 'camera',          label: 'Camera',   color: '#EC4899', type: 'camera'   },
  { icon: 'document-text',   label: 'Document', color: '#6366F1', type: 'document' },
  { icon: 'musical-notes',   label: 'Audio',    color: '#F59E0B', type: 'audio'    },
  { icon: 'location',        label: 'Location', color: '#10B981', type: 'location' },
  { icon: 'person',          label: 'Contact',  color: '#3B82F6', type: 'contact'  },
]

export default function AttachmentMenu({ onSelect, onClose }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1, useNativeDriver: true, friction: 8, tension: 80,
    }).start()
  }, [])

  return (
    <Pressable style={s.backdrop} onPress={onClose}>
      <Animated.View
        style={[
          s.sheet,
          {
            opacity: anim,
            transform: [{
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
            }],
          },
        ]}
      >
        <View style={s.handle} />
        <View style={s.grid}>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.type}
              style={s.item}
              activeOpacity={0.7}
              onPress={() => { onSelect(opt.type); onClose() }}
            >
              <View style={[s.iconWrap, { backgroundColor: opt.color }]}>
                <Ionicons name={opt.icon} size={26} color="#fff" />
              </View>
              <Text style={s.label}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  backdrop: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: 0,
    backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end',
    zIndex: 50,
  },
  sheet: {
    backgroundColor: T.surfaceHigh,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28,
    borderTopWidth: 1, borderColor: T.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: T.textMuted, marginBottom: 16, opacity: 0.5,
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-around', rowGap: 18,
  },
  item: { alignItems: 'center', width: '30%' },
  iconWrap: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  label: { color: T.textPrimary, fontSize: 12, marginTop: 6, fontWeight: '500' },
})
