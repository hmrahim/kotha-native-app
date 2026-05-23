import { PermissionsAndroid, Platform } from 'react-native'
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc'
import {
  boostSdpBitrate,
  boostVideoEncoding,
  getEnhancedVideoConstraints,
  getFallbackVideoConstraints,
} from './Videoenhancer'

// ─── InCallManager (speaker routing) ─────────────────────────────────────────
let InCallManager = null
try {
  InCallManager = require('react-native-incall-manager').default
} catch (_) {
  console.warn('[WebRTC] react-native-incall-manager not found — speaker routing disabled')
}

// ─── STUN + TURN servers ─────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

const PC_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  sdpSemantics: 'unified-plan',
}

let localStream    = null
let remoteStream   = null
let peerConnection = null

// ICE buffer
let pendingCandidates = []
let remoteDescSet     = false

// ─── Permissions ──────────────────────────────────────────────────────────────
export const requestCallPermissions = async (type = 'voice') => {
  if (Platform.OS !== 'android') return true
  try {
    const permissions = type === 'video'
      ? [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
      : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
    const granted = await PermissionsAndroid.requestMultiple(permissions)
    return Object.values(granted).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    )
  } catch (err) {
    console.error('[WebRTC] Permission error:', err)
    return false
  }
}

// ─── Speaker routing ──────────────────────────────────────────────────────────
export const setSpeaker = (forceSpeaker) => {
  if (!InCallManager || Platform.OS === 'web') return
  try {
    InCallManager.setSpeakerphoneOn(forceSpeaker)
    // ✅ FIX: setForceSpeakerphoneOn দিয়ে OS-level override করা হচ্ছে
    // এটা ছাড়া কিছু Android device এ volume কম থাকে
    InCallManager.setForceSpeakerphoneOn(forceSpeaker)
    console.log(`[WebRTC] 🔊 Speaker ${forceSpeaker ? 'ON' : 'OFF'}`)
  } catch (err) {
    console.warn('[WebRTC] setSpeaker error:', err)
  }
}

// ─── Start InCallManager ──────────────────────────────────────────────────────
export const startAudioSession = (media = 'audio') => {
  if (!InCallManager || Platform.OS === 'web') return
  try {
    InCallManager.start({ media, ringback: '' })
    if (media === 'video') {
      // ✅ FIX: speaker on + volume maximum force করা হচ্ছে
      InCallManager.setSpeakerphoneOn(true)
      InCallManager.setForceSpeakerphoneOn(true)
    }
    console.log(`[WebRTC] 🎙️ Audio session started (${media})`)
  } catch (err) {
    console.warn('[WebRTC] startAudioSession error:', err)
  }
}

// ─── Stop InCallManager ───────────────────────────────────────────────────────
export const stopAudioSession = () => {
  if (!InCallManager || Platform.OS === 'web') return
  try {
    InCallManager.stop()
    console.log('[WebRTC] 🔇 Audio session stopped')
  } catch (err) {
    console.warn('[WebRTC] stopAudioSession error:', err)
  }
}

// ─── Local stream ─────────────────────────────────────────────────────────────
// ✅ ENHANCED: Videoenhancer থেকে improved constraints ব্যবহার করা হচ্ছে।
// Device support না করলে fallback constraints এ retry করা হবে।
export const initLocalStream = async (isVideo = false) => {
  try {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        sampleRate:       48000,
        channelCount:     1,
      },
      video: isVideo ? getEnhancedVideoConstraints() : false,
    }

    localStream = await mediaDevices.getUserMedia(constraints)
    console.log('[WebRTC] ✅ Local stream ready (enhanced)')
    return localStream
  } catch (err) {
    // Fallback: basic constraints দিয়ে retry
    console.warn('[WebRTC] Enhanced constraints failed, retrying with fallback:', err.message)
    try {
      const fallback = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
        },
        video: isVideo ? getFallbackVideoConstraints() : false,
      }
      localStream = await mediaDevices.getUserMedia(fallback)
      console.log('[WebRTC] ✅ Local stream ready (fallback)')
      return localStream
    } catch (fallbackErr) {
      console.error('[WebRTC] Local stream error:', fallbackErr)
      throw fallbackErr
    }
  }
}

// ─── Create peer connection ────────────────────────────────────────────────────
// ✅ ENHANCED: connected state এ boostVideoEncoding call করা হচ্ছে।
export const createPeerConnection = (callbacks = {}) => {
  const { onRemoteStream, onIceCandidate, onConnectionStateChange, onError } = callbacks

  try {
    pendingCandidates = []
    remoteDescSet     = false

    peerConnection = new RTCPeerConnection(PC_CONFIG)

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
      })
    }

    peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStream = event.streams[0]
        onRemoteStream?.(remoteStream)
        console.log('[WebRTC] ✅ Remote stream received')
      }
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) onIceCandidate?.(event.candidate)
    }

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection?.connectionState
      console.log('[WebRTC] Connection state:', state)
      onConnectionStateChange?.(state)

      // ✅ ENHANCEMENT: connected হওয়ার সাথে সাথে encoding boost
      if (state === 'connected') {
        boostVideoEncoding(peerConnection)
          .catch((e) => console.warn('[WebRTC] Post-connect boost failed:', e))
      }

      if (state === 'failed') {
        try { peerConnection.restartIce?.() } catch (_) {}
      }
    }

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection?.iceConnectionState
      console.log('[WebRTC] ICE state:', state)
      if (state === 'failed') {
        try { peerConnection.restartIce?.() } catch (_) {}
      }
    }

    console.log('[WebRTC] ✅ Peer connection created')
    return peerConnection
  } catch (err) {
    console.error('[WebRTC] Create peer connection error:', err)
    onError?.(err.message)
    throw err
  }
}

// ─── Offer ────────────────────────────────────────────────────────────────────
// ✅ ENHANCED: SDP এ bitrate boost inject করা হচ্ছে।
export const createOffer = async () => {
  if (!peerConnection) throw new Error('No peer connection')
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  })
  // SDP bitrate boost
  const boostedSdp    = boostSdpBitrate(offer.sdp)
  const boostedOffer  = { ...offer, sdp: boostedSdp }
  await peerConnection.setLocalDescription(boostedOffer)
  console.log('[WebRTC] ✅ Offer created (SDP boosted)')
  return boostedOffer
}

// ─── Answer ───────────────────────────────────────────────────────────────────
// ✅ ENHANCED: SDP এ bitrate boost inject করা হচ্ছে।
export const createAnswer = async () => {
  if (!peerConnection) throw new Error('No peer connection')
  const answer = await peerConnection.createAnswer()
  // SDP bitrate boost
  const boostedSdp    = boostSdpBitrate(answer.sdp)
  const boostedAnswer = { ...answer, sdp: boostedSdp }
  await peerConnection.setLocalDescription(boostedAnswer)
  console.log('[WebRTC] ✅ Answer created (SDP boosted)')
  return boostedAnswer
}

// ─── Remote description + ICE flush ──────────────────────────────────────────
export const setRemoteDescription = async (description) => {
  if (!peerConnection) throw new Error('No peer connection')
  await peerConnection.setRemoteDescription(new RTCSessionDescription(description))
  remoteDescSet = true
  console.log('[WebRTC] ✅ Remote description set')

  if (pendingCandidates.length > 0) {
    console.log(`[WebRTC] Flushing ${pendingCandidates.length} buffered ICE candidates`)
    for (const c of pendingCandidates) {
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)) }
      catch (err) { console.warn('[WebRTC] flush ICE err:', err.message) }
    }
    pendingCandidates = []
  }
}

// ─── ICE candidate ────────────────────────────────────────────────────────────
export const addIceCandidate = async (candidate) => {
  if (!candidate) return
  if (!peerConnection || !remoteDescSet) {
    pendingCandidates.push(candidate)
    return
  }
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
  } catch (err) {
    console.warn('[WebRTC] Add ICE candidate error:', err.message)
  }
}

// ─── Toggles ──────────────────────────────────────────────────────────────────
export const setMuted = (muted) => {
  if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = !muted })
}

export const setVideoMuted = (muted) => {
  if (localStream) localStream.getVideoTracks().forEach((t) => { t.enabled = !muted })
}

export const switchCamera = () => {
  if (localStream) localStream.getVideoTracks().forEach((t) => t._switchCamera())
}

// ─── Manual boost (বাইরে থেকে call করার জন্য) ───────────────────────────────
export const boostCurrentCall = () => boostVideoEncoding(peerConnection)

export const getLocalStream    = () => localStream
export const getRemoteStream   = () => remoteStream
export const getPeerConnection = () => peerConnection
export const isRemoteDescSet   = () => remoteDescSet

// ─── Cleanup ──────────────────────────────────────────────────────────────────
export const cleanup = () => {
  try {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      localStream = null
    }
    if (peerConnection) {
      try { peerConnection.close() } catch (_) {}
      peerConnection = null
    }
    remoteStream      = null
    pendingCandidates = []
    remoteDescSet     = false
    stopAudioSession()
    console.log('[WebRTC] ✅ Cleanup complete')
  } catch (err) {
    console.error('[WebRTC] Cleanup error:', err)
  }
}

// ─── Pre-warm ─────────────────────────────────────────────────────────────────
export const preWarmForCall = async (type = 'voice') => {
  try {
    const ok = await requestCallPermissions(type)
    if (ok) await initLocalStream(type === 'video')
  } catch (err) {
    console.error('[WebRTC] Pre-warm error:', err)
  }
}