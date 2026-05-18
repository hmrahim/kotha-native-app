// services/sounds.js
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'

// require() দিয়ে load করলে path issue হয় না
const SOUNDS = {
  incoming: require('../assets/sound/received.mp3'),
  outgoing: require('../assets/sound/send.mp3'),
  typing:   require('../assets/sound/typing.mp3'),
  ringtun:  require('../assets/sound/ringtun.mp3'),  // callee ringtone
  ringing:  require('../assets/sound/ringing.mp3'),  // caller ringback
}

const players = {}
let inited = false

const init = async () => {
  if (inited) return
  inited = true
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    })
  } catch (e) {
    console.log('⚠️ setAudioModeAsync failed:', e?.message)
  }

  for (const key of Object.keys(SOUNDS)) {
    try {
      players[key] = createAudioPlayer(SOUNDS[key])
      players[key].volume = key === 'typing' ? 0.15 : 0.8
    } catch (e) {
      console.log(`⚠️ Player create failed for ${key}:`, e?.message)
      players[key] = null
    }
  }
}

const play = async (key) => {
  try {
    await init()
    const p = players[key]
    if (!p) return
    try { p.seekTo(0) } catch (_) {}
    p.play()
  } catch (_) {}
}

export const playIncoming = () => play('incoming')
export const playOutgoing = () => play('outgoing')
export const playTyping   = () => play('typing')

// ── Callee ringtone — incoming call এ বাজে ───────────────────────────────────
export const startRingtone = async () => {
  try {
    await init()
    const p = players['ringtun']
    if (!p) return
    try { p.seekTo(0) } catch (_) {}
    p.loop = true
    p.play()
  } catch (e) { console.log('⚠️ startRingtone:', e?.message) }
}

export const stopRingtone = () => {
  try {
    const p = players['ringtun']
    if (!p) return
    p.loop = false
    p.pause()
    try { p.seekTo(0) } catch (_) {}
  } catch (e) { console.log('⚠️ stopRingtone:', e?.message) }
}

// ── Caller ringback — outgoing call এ বাজে ───────────────────────────────────
export const startRingback = async () => {
  try {
    await init()
    const p = players['ringing']
    if (!p) return
    try { p.seekTo(0) } catch (_) {}
    p.loop = true
    p.play()
  } catch (e) { console.log('⚠️ startRingback:', e?.message) }
}

export const stopRingback = () => {
  try {
    const p = players['ringing']
    if (!p) return
    p.loop = false
    p.pause()
    try { p.seekTo(0) } catch (_) {}
  } catch (e) { console.log('⚠️ stopRingback:', e?.message) }
}

export const releaseSounds = () => {
  Object.values(players).forEach((p) => {
    try { p?.remove?.() } catch (_) {}
  })
  inited = false
}