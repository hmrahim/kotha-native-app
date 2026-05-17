import { initializeApp, getApps, getApp } from 'firebase/app'

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

let _auth = null

export const getFirebaseAuth = async () => {
  if (_auth) return _auth

  const isNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative'

  if (isNative) {
    // ✅ React Native (Android/iOS)
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const { initializeAuth, getReactNativePersistence } = await import('firebase/auth')
    _auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    })
  } else {
    // ✅ Web browser
    const { getAuth, browserLocalPersistence, initializeAuth } = await import('firebase/auth')
    try {
      _auth = initializeAuth(app, {
        persistence: browserLocalPersistence,
      })
    } catch {
      _auth = getAuth(app)
    }
  }

  return _auth
}

export const getAuth = () => _auth

export default app