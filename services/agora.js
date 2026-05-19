// services/agora.js
// ✅ INSTANT CONNECT — Complete rewrite for zero-delay call connection

import { Platform, PermissionsAndroid } from 'react-native'

let _createAgoraRtcEngine, _ChannelProfileType, _ClientRoleType,
    _RtcSurfaceView, _AudioScenario, _AudioProfile, _VideoMirrorModeType

try {
  const Agora = require('react-native-agora')
  _createAgoraRtcEngine  = Agora.createAgoraRtcEngine
  _ChannelProfileType    = Agora.ChannelProfileType
  _ClientRoleType        = Agora.ClientRoleType
  _RtcSurfaceView        = Agora.RtcSurfaceView
  _AudioScenario         = Agora.AudioScenario
  _AudioProfile          = Agora.AudioProfileType
  _VideoMirrorModeType   = Agora.VideoMirrorModeType
  console.log('[Agora] ✅ react-native-agora loaded')
} catch (_err) {
  console.warn('[Agora] ⚠️ Not linked — using mock. Run: npx expo run:android')
  const Mock = require('../mocks/agora-mock')
  _createAgoraRtcEngine = Mock.createAgoraRtcEngine
  _ChannelProfileType   = Mock.ChannelProfileType
  _ClientRoleType       = Mock.ClientRoleType
  _RtcSurfaceView       = null
  _AudioScenario        = null
}

export const RtcSurfaceView = _RtcSurfaceView
export const AGORA_APP_ID   = '6fbae39998f64fa3b34ab418d915c45f'

let engine = null

// ─────────────────────────────────────────────────────────────────────────────
// ✅ CRITICAL FIX: Single active handler object.
// registerEventHandler() এখন REPLACE করে, MERGE করে না।
// এতে incoming-call.js এর dummy handler কে call.js এর real handler
// সম্পূর্ণভাবে replace করতে পারে — কোনো leak বা duplicate নেই।
// ─────────────────────────────────────────────────────────────────────────────
let _handler = {}

export const getEngine = () => engine

// ─── Pre-warm ─────────────────────────────────────────────────────────────────
// call:incoming আসার সাথে সাথে call হয়।
// User accept press করার আগেই permission + engine + audio ready।
export const preWarmForCall = async (type = 'voice') => {
  try {
    await requestCallPermissions(type)
    const eng = initAgoraEngine()
    try { eng?.enableLocalAudio?.(false) } catch (_) {} // audio open করো কিন্তু mute রাখো
    console.log('[Agora] Pre-warm complete ✅')
  } catch (_) {}
}

// ─── Permissions ─────────────────────────────────────────────────────────────
export const requestCallPermissions = async (type = 'voice') => {
  if (Platform.OS !== 'android') return true
  const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
  if (type === 'video') perms.push(PermissionsAndroid.PERMISSIONS.CAMERA)
  try {
    const res     = await PermissionsAndroid.requestMultiple(perms)
    const granted = perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED)
    if (!granted) console.warn('[Agora] Permissions denied:', res)
    return granted
  } catch (e) {
    console.warn('[Agora] Permission error:', e?.message)
    return false
  }
}

// ─── Engine init (singleton) ─────────────────────────────────────────────────
export const initAgoraEngine = () => {
  if (engine) return engine

  try {
    engine = _createAgoraRtcEngine()
    engine.initialize({
      appId: AGORA_APP_ID,
      // Communication mode: onUserJoined সবচেয়ে দ্রুত fire করে
      channelProfile: _ChannelProfileType?.ChannelProfileCommunication ?? 0,
      audioScenario:  _AudioScenario?.AudioScenarioChatRoomEntertainment
                   ?? _AudioScenario?.AudioScenarioDefault ?? 0,
    })

    engine.enableAudio()

    try {
      // Best audio quality with AEC + ANS + AGC
      engine.setAudioProfile?.(
        _AudioProfile?.AudioProfileMusicStandard ?? 1,
        _AudioScenario?.AudioScenarioChatRoomEntertainment ?? 3
      )
      // AI Noise Suppression
      engine.enableDeepLearningDenoise?.(true)
      // Echo cancellation aggressive mode
      engine.setParameters?.(JSON.stringify({ 'che.audio.aec.mode': 2 }))
      engine.setParameters?.(JSON.stringify({ 'che.audio.enable.aec': true }))
      engine.setParameters?.(JSON.stringify({ 'che.audio.enable.ans': true }))
      engine.setParameters?.(JSON.stringify({ 'che.audio.enable.agc': true }))
      // ✅ Low latency — সবচেয়ে গুরুত্বপূর্ণ
      engine.setParameters?.(JSON.stringify({ 'rtc.lowlatency': true }))

      if (Platform.OS === 'android') {
        engine.setParameters?.(JSON.stringify({ 'che.audio.androidCaptureBufferSizeInByte': 256 }))
        engine.setParameters?.(JSON.stringify({ 'che.audio.androidPlaybackBufferSizeInByte': 256 }))
        engine.setParameters?.(JSON.stringify({ 'che.audio.keep.audiosession': true }))
        engine.setParameters?.(JSON.stringify({ 'che.audio.opensl': true }))
      }
      if (Platform.OS === 'ios') {
        engine.setParameters?.(JSON.stringify({ 'che.audio.keep.audiosession': true }))
      }
    } catch (_) {}

    console.log('[Agora] Engine initialized ✅')
  } catch (e) {
    console.warn('[Agora] initAgoraEngine failed:', e?.message)
    engine = null
  }

  return engine
}

// ─── Register Event Handler ───────────────────────────────────────────────────
// ✅ CRITICAL FIX: এটা এখন REPLACE করে, merge করে না।
// call.js যখন এটা call করে তখন incoming-call.js এর dummy handler সম্পূর্ণ
// মুছে যায় এবং real handler set হয়।
export const registerEventHandler = (handlers) => {
  // ✅ REPLACE — পুরনো সব handler মুছে নতুন set করো
  _handler = handlers

  if (!engine) return

  try {
    // ✅ পুরনো handler আগে unregister করো
    try { engine.unregisterEventHandler?.({}) } catch (_) {}

    engine.registerEventHandler({
      onJoinChannelSuccess: (conn) => {
        console.log('[Agora] ✅ onJoinChannelSuccess')
        _handler.onJoinChannelSuccess?.(conn)
      },

      onUserJoined: (conn, uid) => {
        console.log('[Agora] ✅ onUserJoined uid:', uid)
        _handler.onUserJoined?.(conn, uid)
      },

      onUserOffline: (conn, uid, reason) => {
        console.log('[Agora] onUserOffline uid:', uid, 'reason:', reason)
        _handler.onUserOffline?.(conn, uid)
      },

      onError: (errCode, msg) => {
        console.warn('[Agora] onError:', errCode, msg)
        _handler.onError?.(errCode)
      },

      onNetworkQuality: (conn, uid, txQ, rxQ) => {
        _handler.onNetworkQuality?.(conn, uid, txQ, rxQ)
      },

      onConnectionStateChanged: (conn, state, reason) => {
        console.log('[Agora] connectionState:', state, 'reason:', reason)
        _handler.onConnectionStateChanged?.(conn, state)
      },

      // ✅ CRITICAL FIX: onRemoteAudioStateChanged এ onUserJoined call করা যাবে না।
      // এটা duplicate connected event ঘটায় — call.js এ connectedRef guard থাকলেও
      // এটা race condition তৈরি করে।
      // onUserJoined একটাই যথেষ্ট। এটা remove করা হয়েছে।
    })
  } catch (e) {
    console.warn('[Agora] registerEventHandler failed:', e?.message)
  }
}

// ─── Destroy ─────────────────────────────────────────────────────────────────
export const destroyAgoraEngine = () => {
  if (!engine) return
  try {
    engine.unregisterEventHandler?.({})
    engine.release?.()
    console.log('[Agora] Engine released ✅')
  } catch (_) {}
  engine   = null
  _handler = {}
}

// ─── Join Channel ─────────────────────────────────────────────────────────────
export const joinChannel = async ({ token, channelName, uid, video = false }) => {
  const eng = initAgoraEngine()
  if (!eng) { console.warn('[Agora] joinChannel — no engine'); return }

  try {
    if (video) {
      eng.enableVideo()
      try {
        eng.setVideoEncoderConfiguration?.({
          dimensions:           { width: 640, height: 480 },
          frameRate:            24,
          bitrate:              0,    // 0 = SDK auto
          minBitrate:           -1,
          orientationMode:      0,
          degradationPreference: 1,
          mirrorMode: _VideoMirrorModeType?.VideoMirrorModeAuto ?? 0,
        })
      } catch (_) {}
      try {
        eng.setBeautyEffectOptions?.(true, {
          lighteningContrastLevel: 1,
          lighteningLevel:         0.3,
          smoothnessLevel:         0.45,
          rednessLevel:            0.08,
        })
      } catch (_) {}
      try { eng.startPreview() } catch (_) {}
    } else {
      try { eng.disableVideo() } catch (_) {}
    }

    eng.setClientRole?.(_ClientRoleType?.ClientRoleBroadcaster ?? 1)
    try { eng.setEnableSpeakerphone(video) } catch (_) {}

    const numericUid = parseInt(uid, 10) || 0
    console.log('[Agora] Joining channel:', channelName, 'uid:', numericUid, 'video:', video)

    await eng.joinChannel(token, channelName, numericUid, {
      clientRoleType:         _ClientRoleType?.ClientRoleBroadcaster ?? 1,
      publishMicrophoneTrack: true,
      publishCameraTrack:     video,
      autoSubscribeAudio:     true,
      autoSubscribeVideo:     video,
      audienceLatencyLevel:   1,
    })

    console.log('[Agora] joinChannel sent ✅')
  } catch (e) {
    console.warn('[Agora] joinChannel failed:', e?.message)
  }
}

// ─── Leave ────────────────────────────────────────────────────────────────────
export const leaveChannel = async () => {
  if (!engine) return
  try {
    engine.stopPreview?.()
    await engine.leaveChannel()
    console.log('[Agora] leaveChannel ✅')
  } catch (_) {}
}

// ─── Controls ─────────────────────────────────────────────────────────────────
export const setMuted      = (m) => { try { engine?.muteLocalAudioStream(!!m)  } catch (_) {} }
export const setVideoMuted = (m) => { try { engine?.muteLocalVideoStream(!!m)  } catch (_) {} }
export const switchCamera  = ()  => { try { engine?.switchCamera()              } catch (_) {} }
export const setSpeaker    = (on)=> { try { engine?.setEnableSpeakerphone(!!on) } catch (_) {} }