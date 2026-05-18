// services/agora.web.js
// Web platform এ Agora Web SDK (agora-rtc-sdk-ng) ব্যবহার করে real call
// Metro automatically এই file টা web build এ pick করবে

export const AGORA_APP_ID = '6fbae39998f64fa3b34ab418d915c45f'

// ─── Agora Web SDK lazy import ─────────────────────────────────────────────
// agora-rtc-sdk-ng শুধু browser এ কাজ করে, তাই dynamic import
let AgoraRTC = null
const getAgoraRTC = async () => {
  if (AgoraRTC) return AgoraRTC
  try {
    const mod = await import('agora-rtc-sdk-ng')
    AgoraRTC = mod.default || mod
    AgoraRTC.setLogLevel(4) // error only
    return AgoraRTC
  } catch (e) {
    console.error('[Agora Web] agora-rtc-sdk-ng load failed:', e?.message)
    console.error('[Agora Web] Run: npm install agora-rtc-sdk-ng')
    return null
  }
}

// ─── State ─────────────────────────────────────────────────────────────────
let client = null
let localAudioTrack = null
let localVideoTrack = null
let _eventHandlers = {}

// ─── Web তে RtcSurfaceView দরকার নেই (HTML element দিয়ে render হবে) ─────
export const RtcSurfaceView = null

// ─── engine interface (mobile agora.js এর মতো same API) ──────────────────
export const getEngine = () => client

export const requestCallPermissions = async (type = 'voice') => {
  try {
    const constraints = { audio: true, video: type === 'video' }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    stream.getTracks().forEach((t) => t.stop()) // permission পেলাম, track বন্ধ
    return true
  } catch (e) {
    console.warn('[Agora Web] Permission denied:', e?.message)
    return false
  }
}

export const initAgoraEngine = () => {
  // Web এ engine synchronously return করা যায় না (async SDK)
  // joinChannel এর ভেতরে lazy init করা হবে
  return {} // truthy value — caller যেন null check এ fall না করে
}

export const destroyAgoraEngine = async () => {
  try {
    localAudioTrack?.close()
    localVideoTrack?.close()
    localAudioTrack = null
    localVideoTrack = null
    if (client) {
      await client.leave()
      client = null
    }
  } catch (e) {
    console.warn('[Agora Web] destroyAgoraEngine error:', e?.message)
  }
  _eventHandlers = {}
}

// ─── Event handler registration (mobile API compatible) ───────────────────
// call.js এ eng.registerEventHandler({onJoinChannelSuccess, onUserJoined, onUserOffline}) করে
// আমরা সেই pattern কে web এ simulate করি
export const registerWebEventHandler = (handlers) => {
  _eventHandlers = { ..._eventHandlers, ...handlers }
}

// ─── Join Channel ──────────────────────────────────────────────────────────
export const joinChannel = async ({ token, channelName, uid, video = false }) => {
  try {
    const RTC = await getAgoraRTC()
    if (!RTC) throw new Error('Agora SDK not available')

    // Client তৈরি
    client = RTC.createClient({ mode: 'rtc', codec: 'vp8' })

    // Remote user events
    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType)

      if (mediaType === 'audio') {
        user.audioTrack?.play()
      }

      if (mediaType === 'video') {
        // Video track পেলে DOM element এ play করব
        // call.web.js এ webRemoteVideoRef এ assign হবে
        if (window.__agoraWebRemoteRef?.current) {
          user.videoTrack?.play(window.__agoraWebRemoteRef.current)
        }
      }

      // onUserJoined callback fire
      _eventHandlers?.onUserJoined?.(null, user.uid)
    })

    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'video') {
        user.videoTrack?.stop()
      }
    })

    client.on('user-left', (user) => {
      _eventHandlers?.onUserOffline?.(null, user.uid)
    })

    // Channel join
    await client.join(AGORA_APP_ID, channelName, token || null, Number(uid))
    _eventHandlers?.onJoinChannelSuccess?.()

    // Local audio track
    localAudioTrack = await RTC.createMicrophoneAudioTrack()
    await client.publish(localAudioTrack)

    // Video call হলে local video track ও তৈরি করো
    if (video) {
      localVideoTrack = await RTC.createCameraVideoTrack()
      await client.publish(localVideoTrack)

      // Local preview
      if (window.__agoraWebLocalRef?.current) {
        localVideoTrack.play(window.__agoraWebLocalRef.current)
      }
    }

    console.log('[Agora Web] Joined channel:', channelName)
  } catch (e) {
    console.error('[Agora Web] joinChannel failed:', e?.message)
  }
}

export const leaveChannel = async () => {
  try {
    localAudioTrack?.close()
    localVideoTrack?.close()
    localAudioTrack = null
    localVideoTrack = null
    await client?.leave()
    client = null
  } catch (e) {
    console.warn('[Agora Web] leaveChannel error:', e?.message)
  }
}

export const setMuted = (muted) => {
  try {
    if (muted) localAudioTrack?.setMuted(true)
    else localAudioTrack?.setMuted(false)
  } catch (_) {}
}

export const setVideoMuted = (muted) => {
  try {
    if (muted) localVideoTrack?.setMuted(true)
    else localVideoTrack?.setMuted(false)
  } catch (_) {}
}

export const switchCamera = async () => {
  try {
    // Web এ camera switch — available devices থেকে পরবর্তী camera select
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cameras = devices.filter((d) => d.kind === 'videoinput')
    if (cameras.length < 2) return

    const current = localVideoTrack?.getTrackLabel?.() || ''
    const next = cameras.find((c) => !current.includes(c.label)) || cameras[0]
    await localVideoTrack?.setDevice(next.deviceId)
  } catch (e) {
    console.warn('[Agora Web] switchCamera error:', e?.message)
  }
}

export const setSpeaker = (on) => {
  // Web এ speaker/earpiece control browser API দিয়ে directly সম্ভব না
  // AudioContext দিয়ে কিছুটা করা যায়, তবে browser limitation আছে
  console.log('[Agora Web] setSpeaker:', on, '(limited browser support)')
}