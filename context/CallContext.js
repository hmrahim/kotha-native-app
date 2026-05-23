
import { useRouter } from 'expo-router'
import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import { preWarmForCall } from '../services/webrtc'
import { getSocket } from '../services/socket'
import { startRingtone, stopRingtone } from '../services/sounds'
import { useAuth } from './AuthContext'

const CallContext = createContext(null)

const initial = {
  phase: 'idle', // idle | outgoing | incoming | active
  callId: null,
  roomId: null,
  type: null, // voice | video
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

const safeStart = () => {
  try {
    startRingtone()
  } catch (_) {}
}
const safeStop = () => {
  try {
    stopRingtone()
  } catch (_) {}
}

export function CallProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const stateRef = useRef(state)
  stateRef.current = state

  const router = useRouter()
  const { mongoUser } = useAuth()

  useEffect(() => {
    if (!mongoUser?._id) return

    let registered = false

    const registerListeners = (socket) => {
      // Remove old listeners
      socket.off('call:incoming')
      socket.off('call:accepted')
      socket.off('call:rejected')
      socket.off('call:canceled')
      socket.off('call:ended')
      socket.off('call:timeout')

      // ── Incoming call ──────────────────────────────────────────────────
      socket.on('call:incoming', (data) => {
        // Ignore if already in call
        if (stateRef.current.phase !== 'idle') {
          console.log(
            '[CallContext] Ignoring incoming — already in call:',
            stateRef.current.phase
          )
          return
        }

        console.log('[CallContext] Incoming call from:', data.callerName)

        // Pre-warm WebRTC
        preWarmForCall(data.type || 'voice').catch(() => {})

        dispatch({
          type: 'INCOMING',
          payload: {
            callId: data.callId,
            roomId: data.roomId,
            type: data.type,
            peer: {
              _id: data.callerId,
              name: data.callerName,
              avatar: data.callerAvatar,
            },
          },
        })

        safeStart()
        router.push({ pathname: '/incoming-call', params: {} })
      })

      // ── Caller side: callee accepted ────────────────────────────────
      socket.on('call:accepted', (data) => {
        safeStop()

        if (stateRef.current.callId !== data.callId) {
          console.warn('[CallContext] call:accepted — callId mismatch, ignoring')
          return
        }

        console.log('[CallContext] call:accepted — callee joined, state ACTIVE')
        dispatch({ type: 'ACTIVE' })
      })

      // ── End / reject / cancel / timeout ──────────────────────────────
      socket.on('call:rejected', () => {
        safeStop()
        dispatch({ type: 'RESET' })
      })
      socket.on('call:canceled', () => {
        safeStop()
        dispatch({ type: 'RESET' })
      })
      socket.on('call:ended', () => {
        safeStop()
        dispatch({ type: 'RESET' })
      })
      socket.on('call:timeout', () => {
        safeStop()
        dispatch({ type: 'RESET' })
      })

      registered = true
      console.log('[CallContext] Socket listeners registered ✅')
    }

    // Register if socket is ready
    const existing = getSocket()
    if (existing?.connected) registerListeners(existing)

    // Re-register on reconnect
    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) {
        registered = false
        return
      }
      if (registered) return
      registerListeners(socket)
    }, 600)

    return () => {
      clearInterval(interval)
      safeStop()
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
