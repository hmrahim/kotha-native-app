import React, { createContext, useContext, useEffect, useState } from 'react'
import { getFirebaseAuth } from '../firebase/firebaseConfig'
import { postUser, getCurrentUser } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/socket'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)           // Firebase user
  const [mongoUser, setMongoUser] = useState(null) // Backend user
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)

  // ─── Listen to Firebase auth state ───────────────────────────────────────
  useEffect(() => {
    let unsubscribe = () => {}

    const init = async () => {
      try {
        const auth = await getFirebaseAuth()

        unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
          setUser(firebaseUser)
          setEmailVerified(firebaseUser?.emailVerified ?? false)

          if (firebaseUser?.emailVerified) {
            try {
              const mUser = await getCurrentUser()
              setMongoUser(mUser)
              if (mUser?._id) connectSocket(mUser._id)
            } catch (e) {
              console.warn('[AuthContext] getCurrentUser failed:', e?.message)
              setMongoUser(null)
            }
          } else {
            setMongoUser(null)
          }

          setLoading(false)
        })
      } catch (e) {
        console.warn('[AuthContext] init error:', e?.message)
        setLoading(false)
      }
    }

    init()
    return () => unsubscribe()
  }, [])

  // ─── Login ────────────────────────────────────────────────────────────────
  const login = async ({ email, password }) => {
    const auth = await getFirebaseAuth()
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return credential.user
  }

  // ─── Register ─────────────────────────────────────────────────────────────
  const register = async ({ name, email, password }) => {
    const auth = await getFirebaseAuth()
    const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } =
      await import('firebase/auth')

    const credential = await createUserWithEmailAndPassword(auth, email, password)
    const firebaseUser = credential.user

    await updateProfile(firebaseUser, { displayName: name })
    await sendEmailVerification(firebaseUser)

    // Create user in backend
    try {
      await postUser({
        name,
        email,
        uid: firebaseUser.uid,
        avatar: '',
      })
    } catch (e) {
      console.warn('[AuthContext] postUser failed:', e?.message)
    }

    return firebaseUser
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      disconnectSocket()
      setMongoUser(null)
      const auth = await getFirebaseAuth()
      const { signOut } = await import('firebase/auth')
      await signOut(auth)
    } catch (e) {
      console.warn('[AuthContext] logout error:', e?.message)
    }
  }

  // ─── Check email verified (polling) ──────────────────────────────────────
  const checkEmailVerified = async () => {
    try {
      const auth = await getFirebaseAuth()
      await auth.currentUser?.reload()
      const verified = auth.currentUser?.emailVerified ?? false
      setEmailVerified(verified)

      if (verified) {
        setUser(auth.currentUser)
        try {
          const mUser = await getCurrentUser()
          setMongoUser(mUser)
          if (mUser?._id) connectSocket(mUser._id)
        } catch (e) {
          console.warn('[AuthContext] getCurrentUser after verify failed:', e?.message)
        }
      }

      return verified
    } catch (e) {
      console.warn('[AuthContext] checkEmailVerified error:', e?.message)
      return false
    }
  }

  // ─── Resend verification email ────────────────────────────────────────────
  const resendVerificationEmail = async () => {
    try {
      const auth = await getFirebaseAuth()
      const { sendEmailVerification } = await import('firebase/auth')
      await sendEmailVerification(auth.currentUser)
    } catch (e) {
      console.warn('[AuthContext] resendVerificationEmail error:', e?.message)
      throw e
    }
  }

  // ─── Reset password ───────────────────────────────────────────────────────
  const resetPassword = async (email) => {
    try {
      const auth = await getFirebaseAuth()
      const { sendPasswordResetEmail } = await import('firebase/auth')
      await sendPasswordResetEmail(auth, email)
    } catch (e) {
      console.warn('[AuthContext] resetPassword error:', e?.message)
      throw e
    }
  }

  // ─── Refresh mongoUser from backend ──────────────────────────────────────
  const refreshUser = async () => {
    try {
      const mUser = await getCurrentUser()
      setMongoUser(mUser)
      return mUser
    } catch (e) {
      console.warn('[AuthContext] refreshUser error:', e?.message)
      return null
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        mongoUser,
        loading,
        emailVerified,
        login,
        register,
        logout,
        checkEmailVerified,
        resendVerificationEmail,
        resetPassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}