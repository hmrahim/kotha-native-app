import React, { useEffect } from 'react'
import { Tabs, Redirect } from 'expo-router'          // ✅ Redirect যোগ
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'    // ✅ useAuth যোগ
import { setupAndroidChannels } from '../../services/fcm'
import { setupAndroidChannel } from '../../services/notification'

const T = {
  bg:        '#0D1117',
  surface:   '#161B22',
  border:    'rgba(240,246,252,0.06)',
  accent:    '#2DD4BF',
  accentDim: 'rgba(45,212,191,0.10)',
  textSecond:'#7D8590',
  textMuted: '#484F58',
}

const TAB_ITEMS = [
  { name: 'index',   label: 'Chats',   icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'updates', label: 'Updates', icon: 'radio-outline',        iconActive: 'radio'       },
  { name: 'calls',   label: 'Calls',   icon: 'call-outline',         iconActive: 'call'        },
]

function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom || 12 }]}>
      <View style={styles.topBorder} />
      {state.routes.map((route, index) => {
        const tab       = TAB_ITEMS.find(t => t.name === route.name) || TAB_ITEMS[index]
        const isFocused = state.index === index
        const onPress   = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
        }
        return (
          <TouchableOpacity key={route.key} onPress={onPress} activeOpacity={0.7} style={styles.tabItem}>
            <View style={[styles.pill, isFocused && styles.pillActive]}>
              {isFocused && <View style={styles.pillGlow} />}
              <Ionicons
                name={isFocused ? tab.iconActive : tab.icon}
                size={22}
                color={isFocused ? T.accent : T.textMuted}
              />
            </View>
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────
const _layout = () => {
  const { user, loading } = useAuth()   // ✅ auth check

  // ✅ App start এ Android notification channels setup করো
  useEffect(() => {
    if (Platform.OS === 'android') {
      setupAndroidChannels()  // notifee: messages + incoming_call channels
    }
    setupAndroidChannel()     // expo-notifications: iOS + fallback
  }, [])

  // Auth check চলছে — কিছু দেখাব না
  if (loading) return null

  // ✅ User নেই → সরাসরি login page এ পাঠাও
  if (!user) return <Redirect href="/login" />

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Chats'   }} />
      <Tabs.Screen name="updates" options={{ title: 'Updates' }} />
      <Tabs.Screen name="calls"   options={{ title: 'Calls'   }} />
    </Tabs>
  )
}

export default _layout

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row', backgroundColor: T.surface,
    paddingTop: 10, borderTopWidth: 0, elevation: 0, shadowOpacity: 0, position: 'relative',
  },
  topBorder: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 1, backgroundColor: T.accent, opacity: 0.25,
  },
  tabItem:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pill:     { width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', position: 'relative' },
  pillActive:  { backgroundColor: T.accentDim },
  pillGlow:    { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: T.accent, opacity: 0.08, transform: [{ scale: 1.3 }] },
  tabLabel:    { fontSize: 11, fontWeight: '500', color: T.textMuted },
  tabLabelActive: { color: T.accent, fontWeight: '700' },
})