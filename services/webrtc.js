
import { Audio } from 'expo-av'
import { PermissionsAndroid, Platform } from 'react-native'
import {
    mediaDevices,
    RTCIceCandidate,
    RTCPeerConnection,
    RTCSessionDescription,
} from 'react-native-webrtc'
import {
    boostSdpBitrate,
    boostVideoEncoding,
    getEnhancedVideoConstraints,
    getFallbackVideoConstraints,
    optimizeAudioSdp,
    startAdaptiveBitrate,
    stopAdaptiveBitrate,
    ENHANCE_CONFIG,
} from './Videoenhancer'

let InCallManager = null
try {
  InCallManager = require('react-native-incall-manager').default
} catch (_) {
  console.warn('[WebRTC] react-native-incall-manager not found')
}

// ─── ICE servers (more STUN + multiple TURN for fallback) ────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  // TURN (UDP) — fastest
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // TURN (TCP/443) — firewall এ কাজ করবে
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
  // TURN (TLS/443) — strict firewall এ
  {
    urls: 'turns:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

const PC_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,         // ✅ more candidates → faster ICE
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  sdpSemantics: 'unified-plan',
  // 'all' = STUN+TURN both. কোনো একটা fail হলে অন্যটা ব্যবহার হবে।
  iceTransportPolicy: 'all',
}

let localStream    = null
let remoteStream   = null
let peerConnection = null

let pendingCandidates = []
let remoteDescSet     = false

// ─── ICE restart watchdog ────────────────────────────────────────────────────
let iceRestartTimer  = null
let iceRestartCount  = 0
let lastRestartAt    = 0
let endCallTimer     = null
let onWatchdogEnd    = null

const clearWatchdogs = () => {
  if (iceRestartTimer) { clearTimeout(iceRestartTimer);  iceRestartTimer = null }
  if (endCallTimer)    { clearTimeout(endCallTimer);     endCallTimer    = null }
}

const triggerIceRestart = async () => {
  if (!peerConnection) return
  const now = Date.now()
  if (now - lastRestartAt < 2000) return  // throttle
  lastRestartAt = now
  iceRestartCount += 1
  console.log(`[WebRTC] 🔄 ICE restart attempt #${iceRestartCount}`)
  try {
    if (typeof peerConnection.restartIce === 'function') {
      peerConnection.restartIce()
    } else {
      // fallback: createOffer with iceRestart
      const offer = await peerConnection.createOffer({ iceRestart: true })
      await peerConnection.setLocalDescription(offer)
    }
  } catch (err) {
    console.warn('[WebRTC] ICE restart error:', err.message)
  }
}

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
export const setSpeaker = async (forceSpeaker) => {
  if (Platform.OS === 'web') return
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: !forceSpeaker,
    })
    if (InCallManager) InCallManager.setSpeakerphoneOn(forceSpeaker)
    console.log(`[WebRTC] 🔊 Speaker ${forceSpeaker ? 'ON' : 'OFF'}`)
  } catch (err) {
    console.warn('[WebRTC] setSpeaker error:', err)
  }
}

export const startAudioSession = async (media = 'audio') => {
  if (Platform.OS === 'web') return
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: media !== 'video',
    })
    if (InCallManager) {
      InCallManager.start({ media, ringback: '' })
      InCallManager.setSpeakerphoneOn(media === 'video')
    }
  } catch (err) {
    console.warn('[WebRTC] startAudioSession error:', err)
  }
}

export const stopAudioSession = () => {
  if (!InCallManager || Platform.OS === 'web') return
  try { InCallManager.stop() } catch (_) {}
}

// ─── Local stream ─────────────────────────────────────────────────────────────
export const initLocalStream = async (isVideo = false) => {
  try {
    const constraints = {
      audio: {
        echoCancellation:        true,
        noiseSuppression:        true,
        autoGainControl:         true,
        sampleRate:              48000,
        channelCount:            1,
        googNoiseSuppression:    true,
        googNoiseSuppression2:   true,
        googEchoCancellation:    true,
        googEchoCancellation2:   true,
        googAutoGainControl:     true,
        googAutoGainControl2:    true,
        googHighpassFilter:      true,
        googTypingNoiseDetection:true,
        googAudioMirroring:      false,
      },
      video: isVideo ? getEnhancedVideoConstraints() : false,
    }
    localStream = await mediaDevices.getUserMedia(constraints)
    console.log('[WebRTC] ✅ Local stream ready')
    return localStream
  } catch (err) {
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
      return localStream
    } catch (fallbackErr) {
      console.error('[WebRTC] Local stream error:', fallbackErr)
      throw fallbackErr
    }
  }
}

// ─── Create peer connection ───────────────────────────────────────────────────
export const createPeerConnection = (callbacks = {}) => {
  const { onRemoteStream, onIceCandidate, onConnectionStateChange, onError, onEndDueToFailure } = callbacks
  onWatchdogEnd = onEndDueToFailure || null

  try {
    pendingCandidates = []
    remoteDescSet     = false
    iceRestartCount   = 0
    lastRestartAt     = 0
    clearWatchdogs()

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
      }
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) onIceCandidate?.(event.candidate)
    }

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection?.connectionState
      console.log('[WebRTC] connectionState:', state)
      onConnectionStateChange?.(state)

      if (state === 'connected') {
        clearWatchdogs()
        // ✅ Start adaptive bitrate monitoring + initial encoding
        boostVideoEncoding(peerConnection, ENHANCE_CONFIG.startBitrateKbps).catch(() => {})
        startAdaptiveBitrate(peerConnection)
      }

      if (state === 'disconnected') {
        // 8 sec waiting — তারপর ICE restart
        if (!iceRestartTimer) {
          iceRestartTimer = setTimeout(() => { triggerIceRestart() }, 4000)
        }
        // 25 sec পরও recover না হলে call end
        if (!endCallTimer) {
          endCallTimer = setTimeout(() => {
            console.warn('[WebRTC] 💀 Call disconnected too long — ending')
            onWatchdogEnd?.()
          }, 25000)
        }
      }

      if (state === 'failed') {
        // immediate restart attempt
        triggerIceRestart()
        if (!endCallTimer) {
          endCallTimer = setTimeout(() => {
            console.warn('[WebRTC] 💀 Call failed — ending')
            onWatchdogEnd?.()
          }, 15000)
        }
      }

      if (state === 'closed') {
        clearWatchdogs()
        stopAdaptiveBitrate()
      }
    }

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection?.iceConnectionState
      console.log('[WebRTC] ICE state:', state)

      if (state === 'connected' || state === 'completed') {
        clearWatchdogs()
      }
      if (state === 'disconnected') {
        if (!iceRestartTimer) {
          iceRestartTimer = setTimeout(() => { triggerIceRestart() }, 4000)
        }
      }
      if (state === 'failed') {
        triggerIceRestart()
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
export const createOffer = async () => {
  if (!peerConnection) throw new Error('No peer connection')
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  })
  // SDP optimize: video bitrate cap + opus voice optimize
  let sdp = boostSdpBitrate(offer.sdp, ENHANCE_CONFIG.startBitrateKbps)
  sdp = optimizeAudioSdp(sdp)
  const boostedOffer = { ...offer, sdp }
  await peerConnection.setLocalDescription(boostedOffer)
  return boostedOffer
}

// ─── Answer ───────────────────────────────────────────────────────────────────
export const createAnswer = async () => {
  if (!peerConnection) throw new Error('No peer connection')
  const answer = await peerConnection.createAnswer()
  let sdp = boostSdpBitrate(answer.sdp, ENHANCE_CONFIG.startBitrateKbps)
  sdp = optimizeAudioSdp(sdp)
  const boostedAnswer = { ...answer, sdp }
  await peerConnection.setLocalDescription(boostedAnswer)
  return boostedAnswer
}

// ─── Remote description + ICE flush ──────────────────────────────────────────
export const setRemoteDescription = async (description) => {
  if (!peerConnection) throw new Error('No peer connection')
  await peerConnection.setRemoteDescription(new RTCSessionDescription(description))
  remoteDescSet = true
  if (pendingCandidates.length > 0) {
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

export const boostCurrentCall = () => boostVideoEncoding(peerConnection)

export const getLocalStream    = () => localStream
export const getRemoteStream   = () => remoteStream
export const getPeerConnection = () => peerConnection
export const isRemoteDescSet   = () => remoteDescSet

// ─── Cleanup ──────────────────────────────────────────────────────────────────
export const cleanup = () => {
  try {
    clearWatchdogs()
    stopAdaptiveBitrate()
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
    iceRestartCount   = 0
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
