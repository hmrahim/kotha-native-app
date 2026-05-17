
import React from 'react'
import {
  View, Text, TouchableOpacity, Image, StyleSheet, Linking, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { T } from '../theme'

const buildStaticMap = (lat, lng) => {
  // OSM staticmap (free, no key)
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=400x220&markers=${lat},${lng},red-pushpin`
}

export const openInMaps = (lat, lng, label = 'Location') => {
  const enc = encodeURIComponent(label)
  const url = Platform.select({
    ios: `maps://?q=${enc}&ll=${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${enc})`,
    default: `https://www.google.com/maps?q=${lat},${lng}`,
  })
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`)
  )
}

export default function LocationPreview({ lat, lng, address, name }) {
  if (!lat || !lng) return null
  return (
    <TouchableOpacity
      style={s.box}
      activeOpacity={0.85}
      onPress={() => openInMaps(lat, lng, name || address || 'Location')}
    >
      <Image source={{ uri: buildStaticMap(lat, lng) }} style={s.map} resizeMode="cover" />
      <View style={s.info}>
        <Ionicons name="location" size={16} color={T.accent} />
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>
            {name || 'Pinned location'}
          </Text>
          {!!address && (
            <Text style={s.addr} numberOfLines={1}>
              {address}
            </Text>
          )}
        </View>
        <Ionicons name="open-outline" size={16} color={T.textMuted} />
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  box: {
    width: 240, borderRadius: 12, overflow: 'hidden',
    backgroundColor: T.surfaceHigh,
  },
  map: { width: '100%', height: 130 },
  info: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  name: { color: T.textPrimary, fontSize: 13, fontWeight: '600' },
  addr: { color: T.textMuted, fontSize: 11, marginTop: 1 },
})
