import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'expo-router'
import { getSocket } from '../services/socket'
import { useAuth } from './AuthContext'
import { startRingtone, stopRingtone } from '../services/sounds'

const CallContext = createContext(null)

const initial = {
  phase: 'idle', // idle | outgoing | incoming | active
  callId: null,
  channelName: null,
  type: null, // voice | video
  token: null,
  uid: null,
  appId: null,
  peer: null, // { _id, name, avatar }
}

function reducer(state, action) {
  switch (action.type) {
    case 'OUTGOING':
      return { ...initial, phase: 'outgoing', ...action.payload }
    case 'INCOMING':
      return { ...initial, phase: 'incoming', ...action.payload }
    case 'ACTIVE':
      return { ...state, phase: 'active', ...action.payload }
    case 'RESET':
      return initial
    default:
      return state
  }
}

// Sound helpers — try/catch দিয়ে wrap করা, যাতে sound error এ call flow না ভাঙে
const safeStart = () => { try { startRingtone() } catch (_) {} }
const safeStop  = () => { try { stopRingtone()  } catch (_) {} }

export function CallProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const stateRef = useRef(state)
  stateRef.current = state
  const router = useRouter()
  const { mongoUser } = useAuth()

  useEffect(() => {
    if (!mongoUser?._id) return

    // ── Socket listener registration ───────────────────────────────────────────
    // setInterval দিয়ে retry করা হয় — socket connected হওয়ার পর register হয়
    // reconnect এর পরেও re-register হবে কারণ interval চলতে থাকে
    let registered = false

    const registerListeners = (socket) => {
      // পুরনো listeners সরাও, নতুন লাগাও
      socket.off('call:incoming')
      socket.off('call:accepted')
      socket.off('call:rejected')
      socket.off('call:canceled')
      socket.off('call:ended')
      socket.off('call:timeout')

      // ── call আসলে ─────────────────────────────────────────────────────────
      socket.on('call:incoming', (data) => {
        if (stateRef.current.phase !== 'idle') return // ব্যস্ত থাকলে ignore
        dispatch({
          type: 'INCOMING',
          payload: {
            callId: data.callId,
            channelName: data.channelName,
            type: data.type,
            peer: { _id: data.callerId, name: data.callerName, avatar: data.callerAvatar },
          },
        })
        safeStart()  // ← ringtone শুরু
        router.push({ pathname: '/incoming-call', params: {} })
      })

      // ── callee call ধরলে (caller side) ────────────────────────────────────
      socket.on('call:accepted', (data) => {
        safeStop()  // ← ringtone বন্ধ (caller side এ ring বাজছিল না, তবু safe)
        if (stateRef.current.callId !== data.callId) return
        router.replace({
          pathname: '/call',
          params: {
            callId:      data.callId,
            channelName: data.channelName,
            type:        data.type,
            token:       stateRef.current.token,
            uid:         String(stateRef.current.uid),
            appId:       stateRef.current.appId,
            peerName:    stateRef.current.peer?.name   || '',
            peerAvatar:  stateRef.current.peer?.avatar || '',
            outgoing:    '1',
          },
        })
        dispatch({ type: 'ACTIVE' })
      })

      // ── call শেষ/রিজেক্ট/ক্যান্সেল/timeout ─────────────────────────────
      // Navigation call screen / incoming-call screen নিজেই করবে।
      // এখান থেকে শুধু ringtone বন্ধ + state reset।
      socket.on('call:rejected', () => { safeStop(); dispatch({ type: 'RESET' }) })
      socket.on('call:canceled', () => { safeStop(); dispatch({ type: 'RESET' }) })
      socket.on('call:ended',    () => { safeStop(); dispatch({ type: 'RESET' }) })
      socket.on('call:timeout',  () => { safeStop(); dispatch({ type: 'RESET' }) })

      registered = true
    }

    // প্রথমে চেষ্টা করো, socket connected থাকলে সাথে সাথে register
    const existing = getSocket()
    if (existing?.connected) {
      registerListeners(existing)
    }

    // Fallback: socket connect হওয়ার পর register (disconnect/reconnect handle করে)
    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) {
        registered = false // socket গেলে re-register দরকার
        return
      }
      if (registered) return // already registered, skip
      registerListeners(socket)
    }, 600)

    return () => {
      clearInterval(interval)
      safeStop() // unmount এ ringtone বন্ধ
      const socket = getSocket()
      if (socket) {
        socket.off('call:incoming')
        socket.off('call:accepted')
        socket.off('call:rejected')
        socket.off('call:canceled')
        socket.off('call:ended')
        socket.off('call:timeout')
      }
    }
  }, [mongoUser?._id])

  return (
    <CallContext.Provider value={{ state, dispatch }}>
      {children}
    </CallContext.Provider>
  )
}

export const useCall = () => {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used inside CallProvider')
  return ctx
}