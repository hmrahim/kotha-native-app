import { initializeApp, getApps, getApp } from 'firebase/app'

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}

// App একবারই initialize হবে
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

let _auth = null

export const getFirebaseAuth = async () => {
  // ইতোমধ্যে initialized থাকলে সেটাই return করো
  if (_auth) return _auth

  const isNative =
    typeof navigator !== 'undefined' && navigator.product === 'ReactNative'

  if (isNative) {
    const { initializeAuth, getAuth, getReactNativePersistence } =
      await import('firebase/auth')
    const AsyncStorage =
      (await import('@react-native-async-storage/async-storage')).default

    // Auth আগে থেকেই initialize হয়ে থাকলে getAuth() দিয়ে নাও
    try {
      _auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      })
    } catch (e) {
      if (e?.code === 'auth/already-initialized') {
        _auth = getAuth(app)
      } else {
        throw e
      }
    }
  } else {
    const { getAuth, browserLocalPersistence, initializeAuth } =
      await import('firebase/auth')

    try {
      _auth = initializeAuth(app, { persistence: browserLocalPersistence })
    } catch (e) {
      // already-initialized হলে অথবা web fallback
      _auth = getAuth(app)
    }
  }

  return _auth
}

// Sync getter — initializeAuth হওয়ার পরে use করো
export const getAuth = () => _auth

export default app