// context/CallContext.js
import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'expo-router'
import { getSocket } from '../services/socket'
import { useAuth } from './AuthContext'
import { startRingtone, stopRingtone } from '../services/sounds'
import { preWarmForCall } from '../services/agora'

const CallContext = createContext(null)

const initial = {
  phase:       'idle',   // idle | outgoing | incoming | active
  callId:      null,
  channelName: null,
  type:        null,     // voice | video
  token:       null,
  uid:         null,
  appId:       null,
  peer:        null,     // { _id, name, avatar }
}

function reducer(state, action) {
  switch (action.type) {
    case 'OUTGOING': return { ...initial, phase: 'outgoing', ...action.payload }
    case 'INCOMING': return { ...initial, phase: 'incoming', ...action.payload }
    case 'ACTIVE':   return { ...state,   phase: 'active',   ...action.payload }
    case 'RESET':    return initial
    default:         return state
  }
}

const safeStart = () => { try { startRingtone() } catch (_) {} }
const safeStop  = () => { try { stopRingtone()  } catch (_) {} }

export function CallProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const stateRef = useRef(state)
  stateRef.current = state

  const router        = useRouter()
  const { mongoUser } = useAuth()

  useEffect(() => {
    if (!mongoUser?._id) return

    let registered = false

    const registerListeners = (socket) => {
      // পুরনো listener সরাও — duplicate এড়াতে
      socket.off('call:incoming')
      socket.off('call:accepted')
      socket.off('call:rejected')
      socket.off('call:canceled')
      socket.off('call:ended')
      socket.off('call:timeout')

      // ── Incoming call ──────────────────────────────────────────────────
      socket.on('call:incoming', (data) => {
        // অন্য call চললে নতুন incoming ignore করো
        if (stateRef.current.phase !== 'idle') {
          console.log('[CallContext] Ignoring incoming — already in call:', stateRef.current.phase)
          return
        }

        console.log('[CallContext] Incoming call from:', data.callerName)

        // ✅ SPEED FIX: call আসার মুহূর্তেই Agora pre-warm শুরু।
        // User accept press করার ২-৫ সেকেন্ড আগে থেকে:
        //   - permission check হয়ে যাবে
        //   - engine init হয়ে যাবে
        //   - audio pipeline active হয়ে যাবে
        // তাই accept press → navigate → joinChannel প্রায় instant হবে।
        preWarmForCall(data.type || 'voice').catch(() => {})

        dispatch({
          type: 'INCOMING',
          payload: {
            callId:      data.callId,
            channelName: data.channelName,
            type:        data.type,
            // ✅ NOTE: callee-র token ও uid এখানে নেই।
            // call:accept এর ack এ server পাঠাবে।
            token:  null,
            uid:    null,
            appId:  null,
            peer: {
              _id:    data.callerId,
              name:   data.callerName,
              avatar: data.callerAvatar,
            },
          },
        })

        safeStart()
        router.push({ pathname: '/incoming-call', params: {} })
      })

      // ── Caller side: callee accepted করেছে ────────────────────────────
      socket.on('call:accepted', (data) => {
        safeStop()

        if (stateRef.current.callId !== data.callId) {
          console.warn('[CallContext] call:accepted — callId mismatch, ignoring')
          return
        }

        // ✅ CRITICAL FIX: router.replace() করা যাবে না!
        //
        // কেন? Caller ইতিমধ্যে /call screen এ আছে এবং Agora channel-এ join
        // করে ফেলেছে (ChatHeader/tab_calls থেকে push হয়েছিল)।
        //
        // router.replace() করলে যা হয়:
        //   1. /call screen unmount → cleanup → leaveChannel() + destroyAgoraEngine()
        //   2. নতুন /call screen mount → engine reinit → rejoin
        //   3. Callee দেখে caller leave করলো → onUserOffline → handleEnd() → call শেষ!
        //
        // সমাধান: শুধু state update করো।
        // Caller ইতিমধ্যে সঠিক token/uid দিয়ে channel এ আছে।
        // Callee join হলে onUserJoined এ setConnected(true) হবে — instant!

        console.log('[CallContext] call:accepted — callee joined, state ACTIVE (no re-navigate)')
        dispatch({ type: 'ACTIVE' })
      })

      // ── End / reject / cancel / timeout ──────────────────────────────
      socket.on('call:rejected', () => { safeStop(); dispatch({ type: 'RESET' }) })
      socket.on('call:canceled', () => { safeStop(); dispatch({ type: 'RESET' }) })
      socket.on('call:ended',    () => { safeStop(); dispatch({ type: 'RESET' }) })
      socket.on('call:timeout',  () => { safeStop(); dispatch({ type: 'RESET' }) })

      registered = true
      console.log('[CallContext] Socket listeners registered ✅')
    }

    // ✅ FIX: socket ready থাকলে এখনই register করো
    const existing = getSocket()
    if (existing?.connected) registerListeners(existing)

    // Socket reconnect হলে re-register করো
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