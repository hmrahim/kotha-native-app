
import { NativeModules, Platform, NativeEventEmitter } from 'react-native'

const NativeBubble = NativeModules.FloatingBubble

// iOS doesn't allow system overlays; PiP also doesn't apply to iOS the same way.
// All native methods are Android-only.
const isSupported = Platform.OS === 'android' && !!NativeBubble

let emitter = null
if (isSupported) {
  try { emitter = new NativeEventEmitter(NativeBubble) } catch (_) { emitter = null }
}


const safeCall = (fn, ...args) => {
  if (!isSupported || !NativeBubble) return null
  try { return NativeBubble[fn]?.(...args) } catch (e) {
    console.warn('[FloatingBubble] native call failed:', fn, e?.message)
    return null
  }
}

export const FloatingBubble = {
  isSupported,

  /* ───── Overlay permission ───── */

  async hasPermission() {
    if (!isSupported) return false
    try { return await NativeBubble.hasOverlayPermission() } catch (_) { return false }
  },

  // Sends user to system overlay settings if not granted.
  // Returns the CURRENT permission state (won't wait for user).
  async requestPermission() {
    if (!isSupported) return false
    const has = await this.hasPermission()
    if (!has) safeCall('requestOverlayPermission')
    return has
  },

  /* ───── Bubble (Android overlay) ─────
     show() ALWAYS starts the foreground service so the call stays alive
     in background even when the user hasn't granted overlay permission.
     The overlay UI itself only renders inside the service if permission
     is granted — but the call won't die either way. */

  async show({ peerName = '', callType = 'voice', startedAt = 0, avatar = '' } = {}) {
    if (!isSupported) return false
    // Fire-and-forget; native side handles permission internally
    safeCall('show', { peerName, callType, startedAt, avatar })
    // Best-effort: prompt the user once if overlay permission is missing,
    // so subsequent backgrounding will render the actual bubble UI.
    const has = await this.hasPermission()
    if (!has) safeCall('requestOverlayPermission')
    return true
  },

  hide() {
    safeCall('hide')
  },

  /* ───── Android Picture-in-Picture (for VIDEO calls) ─────
     Returns true if the activity successfully entered PiP mode.
     The existing call screen UI will be shrunk into a floating window
     and continues rendering live remote + local video. */

  async enterPiP(isVideo = true) {
    if (!isSupported || !NativeBubble?.enterPictureInPicture) return false
    try { return await NativeBubble.enterPictureInPicture(!!isVideo) }
    catch (_) { return false }
  },

  /* ───── Events ───── */

  onTapped(callback) {
    if (!isSupported || !emitter) return () => {}
    const sub = emitter.addListener('BubbleTapped', callback)
    return () => sub.remove()
  },

  onEndCallPressed(callback) {
    if (!isSupported || !emitter) return () => {}
    const sub = emitter.addListener('BubbleEndCallPressed', callback)
    return () => sub.remove()
  },

  onPiPModeChanged(callback) {
    if (!isSupported || !emitter) return () => {}
    const sub = emitter.addListener('PiPModeChanged', callback)
    return () => sub.remove()
  },
}

export default FloatingBubble
