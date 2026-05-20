// app/incoming-call.js
// ✅ INSTANT CONNECT: Accept press → joinChannel শুরু → navigate
// /call screen mount হওয়ার আগেই Agora channel joining হয়

import React, { useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  Animated, StatusBar, Platform, Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { getSocket } from '../services/socket'
import { useCall } from '../context/CallContext'
import { stopRingtone } from '../services/sounds'
import {
  initAgoraEngine,
  requestCallPermissions,
  registerEventHandler,
  joinChannel,
  leaveChannel,
  destroyAgoraEngine,
} from '../services/agora'

const { width: W } = Dimensions.get('window')

const C = {
  bg:      '#000000',
  green:   '#31A24C',
  red:     '#FA3E3E',
  white:   '#FFFFFF',
  whiteD:  'rgba(255,255,255,0.72)',
  whiteDD: 'rgba(255,255,255,0.40)',
  accent:  '#0084FF',
}

const safeStop = () => { try { stopRingtone() } catch (_) {} }

export default function IncomingCallScreen() {
  const router              = useRouter()
  const { state, dispatch } = useCall()
  const acceptingRef        = useRef(false)

  // ✅ Early join tracking
  const earlyJoinedRef = useRef(false)

  // Animations
  const bgScale     = useRef(new Animated.Value(1.08)).current
  const avatarScale = useRef(new Animated.Value(0.85)).current
  const contentY    = useRef(new Animated.Value(30)).current
  const contentOp   = useRef(new Animated.Value(0)).current
  const btnScale    = useRef(new Animated.Value(0)).current
  const ripple1     = useRef(new Animated.Value(1)).current
  const ripple2     = useRef(new Animated.Value(1)).current
  const ripple1Op   = useRef(new Animated.Value(0.35)).current
  const ripple2Op   = useRef(new Animated.Value(0.2)).current

  // Entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(bgScale,     { toValue: 1,    duration: 600, useNativeDriver: true }),
      Animated.timing(avatarScale, { toValue: 1,    duration: 500, useNativeDriver: true, delay: 100 }),
      Animated.timing(contentOp,   { toValue: 1,    duration: 400, useNativeDriver: true, delay: 150 }),
      Animated.timing(contentY,    { toValue: 0,    duration: 400, useNativeDriver: true, delay: 150 }),
      Animated.spring(btnScale,    { toValue: 1,    useNativeDriver: true, tension: 90, friction: 7, delay: 300 }),
    ]).start()

    const rLoop1 = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(ripple1,   { toValue: 1.55, duration: 1200, useNativeDriver: true }),
        Animated.timing(ripple1Op, { toValue: 0,    duration: 1200, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ripple1,   { toValue: 1,    duration: 0, useNativeDriver: true }),
        Animated.timing(ripple1Op, { toValue: 0.35, duration: 0, useNativeDriver: true }),
      ]),
    ]))
    const rLoop2 = Animated.loop(Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(ripple2,   { toValue: 1.55, duration: 1200, useNativeDriver: true }),
        Animated.timing(ripple2Op, { toValue: 0,    duration: 1200, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ripple2,   { toValue: 1,   duration: 0, useNativeDriver: true }),
        Animated.timing(ripple2Op, { toValue: 0.2, duration: 0, useNativeDriver: true }),
      ]),
    ]))
    rLoop1.start(); rLoop2.start()
    return () => { rLoop1.stop(); rLoop2.stop() }
  }, [])

  // ✅ FIX: phase idle/outgoing হলে screen বন্ধ করো
  // earlyJoin হয়ে থাকলে leaveChannel করো — memory leak নেই
  useEffect(() => {
    if (state.phase === 'idle' || state.phase === 'outgoing') {
      if (earlyJoinedRef.current) {
        leaveChannel().catch(() => {})
        destroyAgoraEngine()
        earlyJoinedRef.current = false
      }
      safeStop()
      try { router.back() } catch (_) {}
    }
  }, [state.phase])

  // ✅ HOOKS RULE: সব hooks early return এর আগে — React Law
  // state থেকে extract করো (null হলে fallback দাও)
  const callId  = state.callId  ?? null
  const type    = state.type    ?? 'voice'
  const peer    = state.peer    ?? null
  const isVideo = type === 'video'

  const handleAccept = useCallback(() => {
    if (!callId) return  // guard: callId না থাকলে কিছু করো না
    if (acceptingRef.current) return
    acceptingRef.current = true
    safeStop()

    const socket = getSocket()

    // ─────────────────────────────────────────────────────────────────────
    // ✅ INSTANT CONNECT STRATEGY:
    //
    // 1. socket emit 'call:accept' — server এর ack এর অপেক্ষা
    // 2. ack পাওয়ার সাথে সাথে joinChannel() শুরু (navigate এর আগে!)
    // 3. joinChannel await না করে navigate করো
    //    → /call screen mount হওয়ার সময় Agora ইতিমধ্যে joining/joined
    //    → onUserJoined event miss হবে না কারণ call.js handler register করবে
    // ─────────────────────────────────────────────────────────────────────
    socket?.emit('call:accept', { callId }, async (ack) => {
      if (!ack?.ok) {
        acceptingRef.current = false
        dispatch({ type: 'RESET' })
        try { router.back() } catch (_) {}
        return
      }

      const callToken   = ack.token       || ''
      const callUid     = ack.uid         || ''
      const callChannel = ack.channelName || state.channelName || ''
      const callType    = ack.type        || type

      if (!callToken || !callUid || !callChannel) {
        console.warn('[IncomingCall] accept ack missing fields:', ack)
        acceptingRef.current = false
        dispatch({ type: 'RESET' })
        try { router.back() } catch (_) {}
        return
      }

      // ✅ STEP 1: navigate এর আগেই joinChannel শুরু করো
      // await করছি না — background এ চলতে থাকবে
      // /call screen এর registerEventHandler() এটাকে catch করবে
      try {
        const eng = initAgoraEngine()
        if (eng) {
          // ✅ Temporary handler — call.js এ real handler দিয়ে replace হবে
          global.__pendingRemoteUid = null
          registerEventHandler({
            onJoinChannelSuccess: () => {
              console.log('[IncomingCall] \u2705 Early join success')
            },
            onUserJoined: (_c, uid) => {
              console.log('[IncomingCall] Remote joined early uid:', uid, '\u2014 storing for call.js')
              global.__pendingRemoteUid = uid
            },
          })

          // Permissions আগেই preWarmForCall এ নেওয়া হয়েছে
          await joinChannel({
            token:       String(callToken),
            channelName: String(callChannel),
            uid:         String(callUid),
            video:       callType === 'video',
          })
          earlyJoinedRef.current = true
          console.log('[IncomingCall] ✅ Early joinChannel complete — navigating')
        }
      } catch (e) {
        console.warn('[IncomingCall] Early join failed (non-fatal):', e?.message)
        // join fail হলেও navigate করো — call.js নিজে join করবে
      }

      // ✅ STEP 2: navigate
      dispatch({ type: 'ACTIVE' })

      router.replace({
        pathname: '/call',
        params: {
          callId,
          channelName: callChannel,
          type:        callType,
          token:       String(callToken),
          uid:         String(callUid),
          peerName:    peer?.name   || '',
          peerAvatar:  peer?.avatar || '',
          outgoing:    '0',
          earlyJoined: earlyJoinedRef.current ? '1' : '0',
        },
      })
    })
  }, [callId, type, state, peer, dispatch, router])

  const handleReject = useCallback(() => {
    safeStop()
    getSocket()?.emit('call:reject', { callId })
    dispatch({ type: 'RESET' })
    try { router.back() } catch (_) {}
  }, [callId, dispatch, router])

  // ✅ Early return — hooks সব উপরে call হয়ে গেছে, এখন safe
  if (!state.callId) return null

  const AVATAR = 156
  const RIPPLE = AVATAR * 0.95

  return (
    <View style={[s.root]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* Blurred background */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: bgScale }] }]}>
        {peer?.avatar ? (
          <Image
            source={{ uri: peer.avatar }}
            style={StyleSheet.absoluteFill}
            blurRadius={Platform.OS === 'ios' ? 50 : 25}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d1117' }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)' }]} />
      </Animated.View>

      {/* Content */}
      <Animated.View style={[s.content, { opacity: contentOp, transform: [{ translateY: contentY }] }]}>
        <View style={s.pill}>
          <Ionicons name={isVideo ? 'videocam' : 'call'} size={13} color={C.white} />
          <Text style={s.pillTxt}>{isVideo ? 'Incoming Video Call' : 'Incoming Voice Call'}</Text>
        </View>

        <View style={{ width: AVATAR, height: AVATAR, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <Animated.View style={[s.ripple, { width: RIPPLE, height: RIPPLE, borderRadius: RIPPLE/2, transform: [{ scale: ripple1 }], opacity: ripple1Op }]} />
          <Animated.View style={[s.ripple, { width: RIPPLE, height: RIPPLE, borderRadius: RIPPLE/2, transform: [{ scale: ripple2 }], opacity: ripple2Op }]} />
          <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
            {peer?.avatar ? (
              <Image source={{ uri: peer.avatar }} style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR/2, borderWidth: 3, borderColor: 'rgba(255,255,255,0.28)' }} />
            ) : (
              <View style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR/2, backgroundColor: C.accent + '55', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.28)' }}>
                <Text style={{ color: C.white, fontSize: 60, fontWeight: '700' }}>
                  {(peer?.name?.[0] || '?').toUpperCase()}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>

        <Text style={s.name}>{peer?.name || 'Unknown'}</Text>
        <Text style={s.subtitle}>{isVideo ? 'wants to video call you' : 'is calling you'}</Text>
      </Animated.View>

      {/* Buttons */}
      <Animated.View style={[s.actions, { transform: [{ scale: btnScale }] }]}>
        <View style={s.btnItem}>
          <TouchableOpacity style={[s.actionBtn, s.declineBtn]} onPress={handleReject} activeOpacity={0.85}>
            <Ionicons name="call" size={30} color={C.white} style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <Text style={s.btnLbl}>Decline</Text>
        </View>

        <View style={s.btnItem}>
          <TouchableOpacity style={[s.actionBtn, s.acceptBtn]} onPress={handleAccept} activeOpacity={0.85}>
            <Ionicons name={isVideo ? 'videocam' : 'call'} size={30} color={C.white} />
          </TouchableOpacity>
          <Text style={s.btnLbl}>Accept</Text>
        </View>
      </Animated.View>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 80 : 70,
    paddingBottom: Platform.OS === 'ios' ? 50 : 46,
  },
  content:  { alignItems: 'center', flex: 1, justifyContent: 'center', marginBottom: 20 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    marginBottom: 40,
  },
  pillTxt:  { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  ripple:   { position: 'absolute', backgroundColor: C.accent },
  name: {
    color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: 0.2,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  subtitle: { color: 'rgba(255,255,255,0.40)', fontSize: 14, letterSpacing: 0.5 },
  actions:  { flexDirection: 'row', gap: 72, alignItems: 'center', paddingBottom: 10 },
  btnItem:  { alignItems: 'center', gap: 10 },
  actionBtn: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  declineBtn: { backgroundColor: C.red,   shadowColor: C.red   },
  acceptBtn:  { backgroundColor: C.green, shadowColor: C.green },
  btnLbl:     { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
})