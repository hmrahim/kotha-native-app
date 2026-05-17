

import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  useAudioRecorder, RecordingPresets, setAudioModeAsync,
  AudioModule,
} from 'expo-audio'
import { T } from '../theme'

const fmt = (sec) => {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

/**
 * Props:
 *   onCancel       — called when user cancels (slide left or tap X)
 *   onComplete({ uri, duration, mime }) — when user releases / taps send
 */
export default function VoiceRecorder({ onCancel, onComplete }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [seconds, setSeconds] = useState(0)
  const [cancelled, setCancelled] = useState(false)
  const slide = useRef(new Animated.Value(0)).current
  const timer = useRef(null)

  // start recording on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync()
        if (!perm.granted) { onCancel?.(); return }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
        await recorder.prepareToRecordAsync()
        recorder.record()
        if (!mounted) return
        timer.current = setInterval(() => setSeconds((p) => p + 1), 1000)
      } catch (e) {
        console.log('rec start err', e?.message)
        onCancel?.()
      }
    })()
    return () => {
      mounted = false
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  const stopAndFinish = async (cancel = false) => {
    if (timer.current) clearInterval(timer.current)
    try {
      await recorder.stop()
    } catch (_) {}
    const uri = recorder.uri
    if (cancel || !uri) {
      onCancel?.()
      return
    }
    onComplete?.({
      uri,
      duration: seconds,
      mime: 'audio/m4a',
    })
  }

  // Pan responder for slide-to-cancel
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) slide.setValue(Math.max(g.dx, -160))
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -100) {
          setCancelled(true)
          stopAndFinish(true)
        } else {
          Animated.spring(slide, { toValue: 0, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  return (
    <View style={s.container}>
      <TouchableOpacity onPress={() => stopAndFinish(true)} style={s.delBtn}>
        <Ionicons name="trash-outline" size={22} color="#EF4444" />
      </TouchableOpacity>

      <View style={s.middle}>
        <View style={s.recDot} />
        <Text style={s.time}>{fmt(seconds)}</Text>
        <Animated.View
          {...pan.panHandlers}
          style={[
            s.slide,
            { transform: [{ translateX: slide }] },
          ]}
        >
          <Ionicons name="chevron-back" size={16} color={T.textSecond} />
          <Text style={s.slideText}>Slide to cancel</Text>
        </Animated.View>
      </View>

      <TouchableOpacity onPress={() => stopAndFinish(false)} style={s.sendBtn} activeOpacity={0.85}>
        <Ionicons name="send" size={20} color="#0D1117" />
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surfaceHigh,
    borderRadius: 24, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: T.border, gap: 8,
  },
  delBtn: { padding: 6 },
  middle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444',
  },
  time: { color: T.textPrimary, fontVariant: ['tabular-nums'], fontSize: 14, fontWeight: '600' },
  slide: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  slideText: { color: T.textSecond, fontSize: 13 },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center',
  },
})
