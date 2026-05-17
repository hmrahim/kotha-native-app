import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import { useRouter } from 'expo-router'
import { getSocket } from '../services/socket'
import { useAuth } from './AuthContext'

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

export function CallProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const stateRef = useRef(state)
  stateRef.current = state
  const router = useRouter()
  const { mongoUser } = useAuth()

  // Socket listeners for call signaling
  useEffect(() => {
    if (!mongoUser?._id) return
    let interval = setInterval(() => {
      const socket = getSocket()
      if (!socket?.connected) return

      socket.off('call:incoming')
      socket.off('call:accepted')
      socket.off('call:rejected')
      socket.off('call:canceled')
      socket.off('call:ended')
      socket.off('call:timeout')

      socket.on('call:incoming', (data) => {
        if (stateRef.current.phase !== 'idle') return // busy
        dispatch({
          type: 'INCOMING',
          payload: {
            callId: data.callId,
            channelName: data.channelName,
            type: data.type,
            peer: { _id: data.callerId, name: data.callerName, avatar: data.callerAvatar },
          },
        })
        router.push({ pathname: '/incoming-call', params: {} })
      })

      socket.on('call:accepted', (data) => {
        // Caller side: callee accepted — navigate to active call
        if (stateRef.current.callId !== data.callId) return
        router.replace({
          pathname: '/call',
          params: {
            callId: data.callId,
            channelName: data.channelName,
            type: data.type,
            token: stateRef.current.token,
            uid: String(stateRef.current.uid),
            appId: stateRef.current.appId,
            peerName: stateRef.current.peer?.name || '',
            peerAvatar: stateRef.current.peer?.avatar || '',
            outgoing: '1',
          },
        })
        dispatch({ type: 'ACTIVE' })
      })

      // Navigation call screen এবং incoming-call screen নিজেই handle করবে।
      // এখান থেকে শুধু state reset করো — double router.back() এড়াতে।
      socket.on('call:rejected', () => { dispatch({ type: 'RESET' }) })
      socket.on('call:canceled', () => { dispatch({ type: 'RESET' }) })
      socket.on('call:ended',    () => { dispatch({ type: 'RESET' }) })
      socket.on('call:timeout',  () => { dispatch({ type: 'RESET' }) })

      clearInterval(interval)
    }, 800)
    return () => clearInterval(interval)
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