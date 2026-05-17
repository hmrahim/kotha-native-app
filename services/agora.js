import { Platform, PermissionsAndroid } from 'react-native'

// react-native-agora একটি native module।
// Expo Go তে কাজ করে না — gracefully mock এ fallback হবে।
// Real call এর জন্য অবশ্যই: npx expo run:android
let _createAgoraRtcEngine, _ChannelProfileType, _ClientRoleType, _RtcSurfaceView

try {
  const Agora = require('react-native-agora')
  _createAgoraRtcEngine = Agora.createAgoraRtcEngine
  _ChannelProfileType   = Agora.ChannelProfileType
  _ClientRoleType       = Agora.ClientRoleType
  _RtcSurfaceView       = Agora.RtcSurfaceView
} catch (_err) {
  console.warn(
    '⚠️ [Agora] react-native-agora not linked.\n' +
    '   Real call এর জন্য: npx expo run:android\n' +
    '   এখন mock দিয়ে চালানো হচ্ছে।'
  )
  const Mock = require('../mocks/agora-mock')
  _createAgoraRtcEngine = Mock.createAgoraRtcEngine
  _ChannelProfileType   = Mock.ChannelProfileType
  _ClientRoleType       = Mock.ClientRoleType
  _RtcSurfaceView       = null
}

export const RtcSurfaceView = _RtcSurfaceView
export const AGORA_APP_ID   = '6fbae39998f64fa3b34ab418d915c45f'

let engine = null

export const getEngine = () => engine

export const requestCallPermissions = async (type = 'voice') => {
  if (Platform.OS !== 'android') return true
  const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
  if (type === 'video') perms.push(PermissionsAndroid.PERMISSIONS.CAMERA)
  try {
    const result = await PermissionsAndroid.requestMultiple(perms)
    return perms.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED)
  } catch (e) {
    console.log('perm err:', e?.message)
    return false
  }
}

export const initAgoraEngine = () => {
  if (engine) return engine
  try {
    engine = _createAgoraRtcEngine()
    engine.initialize({
      appId: AGORA_APP_ID,
      channelProfile: _ChannelProfileType.ChannelProfileCommunication,
    })
    engine.enableAudio()
  } catch (e) {
    console.warn('⚠️ [Agora] initAgoraEngine failed:', e?.message)
    engine = null
  }
  return engine
}

export const destroyAgoraEngine = () => {
  if (!engine) return
  try {
    engine.unregisterEventHandler({})
    engine.release()
  } catch (_) {}
  engine = null
}

export const joinChannel = async ({ token, channelName, uid, video = false }) => {
  const eng = initAgoraEngine()
  if (!eng) return
  try {
    if (video) { eng.enableVideo(); eng.startPreview() } else { eng.disableVideo() }
    eng.setClientRole(_ClientRoleType.ClientRoleBroadcaster)
    eng.setEnableSpeakerphone(video)
    await eng.joinChannel(token, channelName, Number(uid), {
      clientRoleType: _ClientRoleType.ClientRoleBroadcaster,
      channelProfile: _ChannelProfileType.ChannelProfileCommunication,
      publishMicrophoneTrack: true,
      publishCameraTrack: video,
      autoSubscribeAudio: true,
      autoSubscribeVideo: video,
    })
  } catch (e) {
    console.warn('⚠️ [Agora] joinChannel failed:', e?.message)
  }
}

export const leaveChannel = async () => {
  if (!engine) return
  try {
    engine.stopPreview()
    await engine.leaveChannel()
  } catch (_) {}
}

export const setMuted      = (muted)  => { try { engine?.muteLocalAudioStream(!!muted)  } catch (_) {} }
export const setVideoMuted = (muted)  => { try { engine?.muteLocalVideoStream(!!muted)  } catch (_) {} }
export const switchCamera  = ()       => { try { engine?.switchCamera()                  } catch (_) {} }
export const setSpeaker    = (on)     => { try { engine?.setEnableSpeakerphone(!!on)     } catch (_) {} }