// services/sounds.js
// ✅ expo-audio ব্যবহার করা হচ্ছে — expo-av এর thread crash fix
// Metro web build এ automatically sounds.web.js ব্যবহার হবে

import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio'

// ─── Sound objects cache ──────────────────────────────────────────────────────
const _players = {}

const ASSETS = {
  incoming: require('../assets/sound/received.mp3'),
  outgoing: require('../assets/sound/send.mp3'),
  typing:   require('../assets/sound/typing.mp3'),
  ringtun:  require('../assets/sound/ringtun.mp3'),
  ringing:  require('../assets/sound/ringing.mp3'),
}

// ─── Audio Mode ───────────────────────────────────────────────────────────────
const setCallAudioMode = async () => {
  try {
    await setAudioModeAsync({
      playsInSilentModeIOS:    true,
      staysActiveInBackground: true,
      shouldDuckAndroid:       false,
    })
  } catch (e) {
    console.warn('[Sounds] setAudioMode error:', e?.message)
  }
}

// ─── Load & cache ─────────────────────────────────────────────────────────────
const getPlayer = async (key) => {
  if (_players[key]) return _players[key]
  try {
    await setCallAudioMode()
    const player = createAudioPlayer(ASSETS[key])
    player.volume = key === 'typing' ? 0.15 : 0.85
    _players[key] = player
    return player
  } catch (e) {
    console.warn('[Sounds] getPlayer failed:', key, e?.message)
    return null
  }
}

// ─── Play helper ──────────────────────────────────────────────────────────────
const play = async (key, loop = false) => {
  try {
    const player = await getPlayer(key)
    if (!player) return
    player.loop = loop
    player.seekTo(0)
    player.play()
  } catch (e) {
    console.warn('[Sounds] play error:', key, e?.message)
  }
}

// ─── Stop helper ──────────────────────────────────────────────────────────────
const stop = async (key) => {
  try {
    const player = _players[key]
    if (!player) return
    player.pause()
    player.seekTo(0)
  } catch (_) {}
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const playIncoming  = () => play('incoming')
export const playOutgoing  = () => play('outgoing')
export const playTyping    = () => play('typing')

export const startRingtone = () => play('ringtun', true)
export const stopRingtone  = () => stop('ringtun')

export const startRingback = () => play('ringing', true)
export const stopRingback  = () => stop('ringing')

export const releaseSounds = async () => {
  for (const key of Object.keys(_players)) {
    try {
      _players[key].pause()
      _players[key].remove()
      delete _players[key]
    } catch (_) {}
  }
}