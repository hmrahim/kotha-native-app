// services/socket.js
import { io } from 'socket.io-client'
import { Platform } from 'react-native'

const SERVER_URL = 'http://192.168.100.185:5000'

console.log('🔌 Socket URL:', SERVER_URL)

let socket = null

export const connectSocket = (userId) => {
  if (!userId) return null
  if (socket?.connected) return socket

  if (socket) {
    try { socket.removeAllListeners(); socket.disconnect() } catch (_) {}
    socket = null
  }

  // Web browser এ 'websocket' only দিলে অনেক সময় connect হয় না।
  // polling দিয়ে শুরু করলে websocket এ upgrade হয় — সবচেয়ে reliable।
  // Mobile এ 'websocket' only রাখা যায় (faster), web এ দুটোই রাখো।
  const transports = Platform.OS === 'web'
    ? ['polling', 'websocket']
    : ['websocket']

  socket = io(SERVER_URL, {
    auth: { userId: userId.toString() },
    transports,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 3000,
    timeout: 10000,
  })

  socket.on('connect',       () => console.log('✅ Socket connected:', socket.id))
  socket.on('disconnect',    (r) => console.log('❌ Socket disconnected:', r))
  socket.on('connect_error', (e) => console.log('⚠️ Socket connect_error:', e.message))
  socket.on('reconnect',     (n) => console.log('🔁 Socket reconnected after', n, 'tries'))

  return socket
}

export const getSocket = () => socket

// ─── Active Chat Tracker ──────────────────────────────────────────────────────
// Chat screen open থাকলে কোন user এর সাথে chat করছে সেটা track করো।
// এটা use করে notification/sound suppress করা হয়।
let _activeChatUserId = null

export const setActiveChatUser = (userId) => {
  _activeChatUserId = userId ? userId.toString() : null
}

export const getActiveChatUser = () => _activeChatUserId

export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

export const sendMessageSocket = (payload) =>
  new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Socket not connected'))
    socket.emit('send_message', payload, (ack) => {
      if (ack?.ok) resolve(ack)
      else reject(new Error(ack?.error || 'Send failed'))
    })
  })