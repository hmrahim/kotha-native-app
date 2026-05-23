import { useMutation, useQueryClient } from '@tanstack/react-query'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { getFirebaseAuth } from '../firebase/firebaseConfig'
import { getCurrentUser, postUser } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null)
  const [mongoUser,     setMongoUser]     = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)
  const queryClient                       = useQueryClient()

  useEffect(() => {
    let unsubscribe = () => {}

    const initAuth = async () => {
      const auth = await getFirebaseAuth()
      const { onAuthStateChanged } = await import('firebase/auth')

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser)
        setEmailVerified(firebaseUser?.emailVerified ?? false)

        // শুধু verified user এর জন্য mongo connect করো
        if (firebaseUser && firebaseUser.emailVerified) {
          try {
            await firebaseUser.getIdToken(true)
            const mUser = await getCurrentUser()
            if (mUser?._id) {
              setMongoUser(mUser)
              connectSocket(mUser._id)
              console.log('Socket connected:', mUser._id)
            }
          } catch (e) {
            console.log('getCurrentUser error:', e.message)
          }
        } else {
          disconnectSocket()
          setMongoUser(null)
        }

        setLoading(false)
      })
    }

    initAuth()
    return () => unsubscribe()
  }, [])

  const refreshUser = async () => {
    try {
      const mUser = await getCurrentUser()
      if (mUser?._id) {
        setMongoUser(mUser)
        queryClient.invalidateQueries({ queryKey: ['chatList'] })
      }
    } catch (e) {
      console.log('refreshUser error:', e?.message)
    }
  }

  // Email verify হয়েছে কিনা Firebase থেকে check করো
  // verified হলে state update হবে — layout auto redirect করবে
  const checkEmailVerified = async () => {
    try {
      const auth = await getFirebaseAuth()
      if (!auth.currentUser) return
      await auth.currentUser.reload()
      const verified = auth.currentUser.emailVerified
      setEmailVerified(verified)
      if (verified) {
        setUser({ ...auth.currentUser })
        try {
          await auth.currentUser.getIdToken(true)
          const mUser = await getCurrentUser()
          if (mUser?._id) {
            setMongoUser(mUser)
            connectSocket(mUser._id)
            queryClient.invalidateQueries({ queryKey: ['chatList'] })
          }
        } catch (e) {
          console.log('checkEmailVerified mongo sync error:', e.message)
        }
      }
    } catch (e) {
      console.log('checkEmailVerified error:', e?.message)
    }
  }

  // Verification email আবার পাঠাও
  const resendVerificationEmail = async () => {
    const auth = await getFirebaseAuth()
    const { sendEmailVerification } = await import('firebase/auth')
    if (!auth.currentUser) throw new Error('No user')
    await sendEmailVerification(auth.currentUser)
  }

  const register = async (name, email, password) => {
    const auth = await getFirebaseAuth()
    const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = await import('firebase/auth')
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(credential.user, { displayName: name.trim() })
    // Verification email পাঠাও
    await sendEmailVerification(credential.user)
    // MongoDB তে user তৈরি করো
    await postUser({
      uid:   credential.user.uid,
      email: credential.user.email,
      name:  name.trim(),
    })
    return credential.user
  }

  const { mutateAsync: syncUser } = useMutation({
    mutationFn: postUser,
    onSuccess: (mUser) => {
      if (mUser?._id) {
        setMongoUser(mUser)
        connectSocket(mUser._id)
        console.log('Login — Socket connected:', mUser._id)
        queryClient.invalidateQueries({ queryKey: ['chatList'] })
      }
    },
    onError: (e) => console.log('postUser error:', e.message),
  })

  const login = async (email, password) => {
    const auth = await getFirebaseAuth()
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    const credential = await signInWithEmailAndPassword(auth, email, password)

    // Email verified না হলে sync করবো না — verify-email screen এ রাখবো
    if (!credential.user.emailVerified) {
      setUser(credential.user)
      setEmailVerified(false)
      return credential.user
    }

    await syncUser({
      uid:   credential.user.uid,
      email: credential.user.email,
      name:  credential.user.displayName,
    })
    setUser(credential.user)
    setEmailVerified(true)
    return credential.user
  }

  const logout = async () => {
    disconnectSocket()
    setUser(null)
    setMongoUser(null)
    setEmailVerified(false)
    queryClient.clear()

    try {
      const { removeFcmToken } = await import('../services/api')
      const Notifications = await import('expo-notifications').catch(() => null)
      if (Notifications) {
        try {
          const t = await Notifications.getDevicePushTokenAsync()
          if (t?.data) await removeFcmToken(t.data).catch(() => {})
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const auth = await getFirebaseAuth()
      const { signOut } = await import('firebase/auth')
      await signOut(auth)
    } catch (e) {
      console.log('signOut error:', e.message)
    }
  }

  const resetPassword = async (email) => {
    const auth = await getFirebaseAuth()
    const { sendPasswordResetEmail } = await import('firebase/auth')
    await sendPasswordResetEmail(auth, email)
  }

  return (
    <AuthContext.Provider value={{
      user,
      mongoUser,
      loading,
      emailVerified,
      register,
      login,
      logout,
      resetPassword,
      refreshUser,
      checkEmailVerified,
      resendVerificationEmail,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}