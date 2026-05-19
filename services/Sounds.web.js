// services/sounds.web.js
// Web platform এ HTML5 Audio API দিয়ে sound
// Metro automatically এই file টা web build এ use করবে
// expo-audio native module web এ কাজ করে না তাই এই আলাদা file

const _cache = {}

// Expo web এ assets /assets/ folder এ থাকে
const PATHS = {
  incoming: '/assets/sound/received.mp3',
  outgoing: '/assets/sound/send.mp3',
  typing:   '/assets/sound/typing.mp3',
  ringtun:  '/assets/sound/ringtun.mp3',
  ringing:  '/assets/sound/ringing.mp3',
}

const get = (key) => {
  if (_cache[key]) return _cache[key]
  try {
    const a = new Audio(PATHS[key])
    a.volume = key === 'typing' ? 0.15 : 0.8
    _cache[key] = a
    return a
  } catch (e) {
    console.warn('[Sounds Web] create failed:', key, e?.message)
    return null
  }
}

const play = (key, loop = false) => {
  try {
    const a = get(key)
    if (!a) return
    a.loop        = loop
    a.currentTime = 0
    a.play().catch((e) => console.warn('[Sounds Web] autoplay blocked:', e?.message))
  } catch (e) {
    console.warn('[Sounds Web] play error:', key, e?.message)
  }
}

const stop = (key) => {
  try {
    const a = _cache[key]
    if (!a) return
    a.loop        = false
    a.pause()
    a.currentTime = 0
  } catch (_) {}
}

// ─── Public API (sounds.js এর মতো same) ────────────────────────────────────
export const playIncoming  = () => play('incoming')
export const playOutgoing  = () => play('outgoing')
export const playTyping    = () => play('typing')

export const startRingtone = () => play('ringtun', true)
export const stopRingtone  = () => stop('ringtun')

export const startRingback = () => play('ringing', true)
export const stopRingback  = () => stop('ringing')

export const releaseSounds = () => {
  Object.values(_cache).forEach((a) => {
    try { a.pause(); a.src = '' } catch (_) {}
  })
  Object.keys(_cache).forEach((k) => delete _cache[k])
}