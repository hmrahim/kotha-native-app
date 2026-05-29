import { useRouter } from 'expo-router'
import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { preWarmForCall } from '../services/webrtc'
import { getSocket } from '../services/socket'
import { startRingtone, stopRingtone } from '../services/sounds'
import { useAuth } from './AuthContext'

let cancelCallNotification = async () => {}
if (Platform.OS !== 'web') {
  try {
    const fcm = require('../services/fcm')
    cancelCallNotification = fcm.cancelCallNotification
  } catch (e) {
    console.warn('[CallContext] FCM import failed:', e?.message)
  }
}

const CallContext = createContext(null)

const initial = {
  phase: 'idle',
  callId: null,
  roomId: null,
  type: null,
  peer: null,
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

const safeStart = () => { try { startRingtone() } catch (_) {} }
const safeStop = () => { try { stopRingtone() } catch (_) {} }

export function CallProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const stateRef = useRef(state)
  stateRef.current = state

  const [callSeconds, setCallSeconds] = useState(0)
  const [callStartedAt, setCallStartedAt] = useState(0)
  const callSecondsRef = useRef(0)
  const callTimerRef = useRef(null)

  // ✅ Call screen focused কিনা — banner শুধু তখন দেখাবে যখন false
  const [callScreenFocused, setCallScreenFocused] = useState(false)

  const router = useRouter()
  const { mongoUser } = useAuth()

  const startCallTimer = (startedAtMs = Date.now()) => {
    setCallStartedAt(startedAtMs)
    setCallSeconds(0)
    callSecondsRef.current = 0
    if (callTimerRef.current) clearInterval(callTimerRef.current)
    callTimerRef.current = setInterval(() => {
      callSecondsRef.current += 1
      setCallSeconds(callSecondsRef.current)
    }, 1000)
  }

  const stopCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    setCallSeconds(0)
    setCallStartedAt(0)
    callSecondsRef.current = 0
  }

  useEffect(() => {
    if (state.phase === 'idle') {
      stopCallTimer()
      setCallScreenFocused(false)
    }
  }, [state.phase])

  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!mongoUser?._id) return

    let registered = false

    const registerListeners = (socket) => {
      socket.off('call:incoming')
      socket.off('call:accepted')
      socket.off('call:rejected')
      socket.off('call:canceled')
      socket.off('call:ended')
      socket.off('call:timeout')

      socket.on('call:incoming', (data) => {
        if (stateRef.current.phase !== 'idle') return
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
        try { router.push({ pathname: '/incoming-call', params: {} }) } catch (_) {}
      })

      socket.on('call:accepted', (data) => {
        safeStop()
        if (stateRef.current.callId !== data.callId) return
        dispatch({ type: 'ACTIVE' })
      })

      socket.on('call:rejected', () => {
        safeStop()
        cancelCallNotification(stateRef.current.callId).catch(() => {})
        dispatch({ type: 'RESET' })
      })
      socket.on('call:canceled', () => {
        safeStop()
        cancelCallNotification(stateRef.current.callId).catch(() => {})
        dispatch({ type: 'RESET' })
      })
      socket.on('call:ended', () => {
        safeStop()
        cancelCallNotification(stateRef.current.callId).catch(() => {})
        dispatch({ type: 'RESET' })
      })
      socket.on('call:timeout', () => {
        safeStop()
        cancelCallNotification(stateRef.current.callId).catch(() => {})
        dispatch({ type: 'RESET' })
      })

      registered = true
    }

    const existing = getSocket()
    if (existing?.connected) registerListeners(existing)

    const interval = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) { registered = false; return }
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
    <CallContext.Provider value={{
      state,
      dispatch,
      callSeconds,
      callStartedAt,
      startCallTimer,
      stopCallTimer,
      // ✅ Banner এর জন্য
      callScreenFocused,
      setCallScreenFocused,
    }}>
      {children}
    </CallContext.Provider>
  )
}

export const useCall = () => {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used inside CallProvider')
  return ctx
}