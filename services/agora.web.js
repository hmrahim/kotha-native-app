// services/agora.web.js
// Web platform এ Agora SDK support করে না
// Metro automatically এই file টা web build এ use করবে

export const AGORA_APP_ID = '6fbae39998f64fa3b34ab418d915c45f'

// Web এ RtcSurfaceView render করা যায় না — null
export const RtcSurfaceView = null

export const getEngine = () => null
export const requestCallPermissions = async () => true
export const initAgoraEngine = () => null
export const destroyAgoraEngine = () => {}
export const joinChannel = async () => {}
export const leaveChannel = async () => {}
export const setMuted = () => {}
export const setVideoMuted = () => {}
export const switchCamera = () => {}
export const setSpeaker = () => {}