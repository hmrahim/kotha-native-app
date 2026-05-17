// components/DateSeparator.js
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { T } from '../theme'

export default function DateSeparator({ label }) {
  return (
    <View style={s.row}>
      <View style={s.line} />
      <View style={s.badge}>
        <Text style={s.text}>{label}</Text>
      </View>
      <View style={s.line} />
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 4,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: T.border,
  },
  badge: {
    backgroundColor: T.surfaceHigh,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: T.border,
  },
  text: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
})
