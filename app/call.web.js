// app/call.web.js
// Web platform এ video/voice call support নেই
// Metro automatically এই file টা web build এ use করবে

import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

const T = {
  bg: '#0D1117',
  accent: '#2DD4BF',
  text: '#F0F6FC',
  sub: '#7D8590',
  red: '#F87171',
}

export default function CallScreenWeb() {
  const router = useRouter()

  return (
    <View style={s.root}>
      <Ionicons name="call-outline" size={72} color={T.accent} />
      <Text style={s.title}>Call Feature</Text>
      <Text style={s.sub}>Voice & Video call শুধুমাত্র{'\n'}Mobile App এ available</Text>

      <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
        <Text style={s.backTxt}>Go Back</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    color: T.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 12,
  },
  sub: {
    color: T.sub,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  backBtn: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: T.accent + '22',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.accent,
  },
  backTxt: {
    color: T.accent,
    fontSize: 16,
    fontWeight: '700',
  },
})