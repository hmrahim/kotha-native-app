// mocks/agora-mock.js
// Web platform এ react-native-agora কাজ করে না
// তাই সব function কে empty mock দিয়ে replace করা হচ্ছে

export const createAgoraRtcEngine = () => ({
  initialize: () => {},
  enableAudio: () => {},
  enableVideo: () => {},
  disableVideo: () => {},
  startPreview: () => {},
  stopPreview: () => {},
  setClientRole: () => {},
  setEnableSpeakerphone: () => {},
  joinChannel: async () => {},
  leaveChannel: async () => {},
  muteLocalAudioStream: () => {},
  muteLocalVideoStream: () => {},
  switchCamera: () => {},
  registerEventHandler: () => {},
  unregisterEventHandler: () => {},
  release: () => {},
})

export const ChannelProfileType = {
  ChannelProfileCommunication: 0,
  ChannelProfileLiveBroadcasting: 1,
}

export const ClientRoleType = {
  ClientRoleBroadcaster: 1,
  ClientRoleAudience: 2,
}

export const RtcSurfaceView = () => null
export const RtcTextureView = () => null

export default {}