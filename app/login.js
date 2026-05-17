import React, { useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Animated,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { T } from '../theme'

export default function LoginScreen() {
  const { login } = useAuth()
  const router    = useRouter()

  const shakeAnim   = useRef(new Animated.Value(0)).current
  const passwordRef = useRef(null)
  const [showPass,  setShowPass]  = React.useState(false)
  const [loading,   setLoading]   = React.useState(false)
  const [authError, setAuthError] = React.useState('')

  const { control, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: '', password: '' }
  })

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start()
  }

  const friendlyError = (code) => {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/invalid-credential':    return 'Email বা Password ভুল হয়েছে'
      case 'auth/wrong-password':         return 'Password ঠিক নেই'
      case 'auth/invalid-email':          return 'সঠিক Email দাও'
      case 'auth/too-many-requests':      return 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো'
      case 'auth/network-request-failed': return 'Internet connection চেক করো'
      default:                            return 'Login হয়নি। আবার চেষ্টা করো'
    }
  }

  const onSubmit = async ({ email, password }) => {
    setAuthError('')
    try {
      setLoading(true)
      await login(email.trim().toLowerCase(), password)
    } catch (err) {
      setAuthError(friendlyError(err.code))
      shake()
    } finally {
      setLoading(false)
    }
  }

  const onError = () => shake()

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" backgroundColor={T.bg} />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo ── */}
        <View style={s.logoWrap}>
          <View style={s.logoRing}>
            <View style={s.logoBox}>
              <Ionicons name="chatbubbles" size={40} color={T.accent} />
            </View>
          </View>
          <Text style={s.appName}>KOTHA</Text>
          <Text style={s.tagline}>তোমার email দিয়ে sign in করো</Text>
        </View>

        {/* ── Form ── */}
        <Animated.View style={[s.card, { transform: [{ translateX: shakeAnim }] }]}>

          {/* Firebase error */}
          {!!authError && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={T.error} />
              <Text style={s.errorText}>{authError}</Text>
            </View>
          )}

          {/* Email */}
          <Controller
            control={control}
            name="email"
            rules={{
              required: 'Email দিতে হবে',
              pattern:  { value: /\S+@\S+\.\S+/, message: 'সঠিক Email দাও' },
            }}
            render={({ field: { onChange, value } }) => (
              <View>
                <View style={[s.inputWrap, errors.email && s.inputError]}>
                  <Ionicons name="mail-outline" size={18} color={T.textMuted} style={s.inputIcon} />
                  <TextInput
                    style={s.input}
                    placeholder="Email address"
                    placeholderTextColor={T.textMuted}
                    value={value}
                    onChangeText={(v) => { onChange(v); setAuthError('') }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
                {errors.email && (
                  <Text style={s.fieldError}>{errors.email.message}</Text>
                )}
              </View>
            )}
          />

          {/* Password */}
          <Controller
            control={control}
            name="password"
            rules={{ required: 'Password দিতে হবে' }}
            render={({ field: { onChange, value } }) => (
              <View>
                <View style={[s.inputWrap, errors.password && s.inputError]}>
                  <Ionicons name="lock-closed-outline" size={18} color={T.textMuted} style={s.inputIcon} />
                  <TextInput
                    ref={passwordRef}
                    style={[s.input, { flex: 1 }]}
                    placeholder="Password"
                    placeholderTextColor={T.textMuted}
                    value={value}
                    onChangeText={(v) => { onChange(v); setAuthError('') }}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit(onSubmit, onError)}
                  />
                  <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
                    <Ionicons
                      name={showPass ? 'eye-off-outline' : 'eye-outline'}
                      size={18} color={T.textMuted}
                    />
                  </TouchableOpacity>
                </View>
                {errors.password && (
                  <Text style={s.fieldError}>{errors.password.message}</Text>
                )}
              </View>
            )}
          />

          {/* Forgot password */}
          <TouchableOpacity
            style={s.forgotBtn}
            onPress={() => router.push('/forgot-password')}
            activeOpacity={0.7}
          >
            <Text style={s.forgotText}>Password ভুলে গেছো?</Text>
          </TouchableOpacity>

          {/* Login button */}
          <TouchableOpacity
            style={[s.loginBtn, loading && s.loginBtnDisabled]}
            onPress={handleSubmit(onSubmit, onError)}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={T.bg} size="small" />
              : <Text style={s.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </Animated.View>

        {/* ── Register link ── */}
        <View style={s.registerRow}>
          <Text style={s.registerHint}>এখনও account নেই?</Text>
          <TouchableOpacity onPress={() => router.push('/register')} activeOpacity={0.7}>
            <Text style={s.registerLink}> Account তৈরি করো</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  logoWrap:  { alignItems: 'center', marginBottom: 40 },
  logoRing:  { width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: 'rgba(45,212,191,0.30)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  logoBox:   { width: 80, height: 80, borderRadius: 24, backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(45,212,191,0.20)' },
  appName:   { fontSize: 30, fontWeight: '900', color: T.textPrimary, letterSpacing: 6, marginBottom: 8 },
  tagline:   { fontSize: 14, color: T.textSecond, textAlign: 'center' },
  card:      { backgroundColor: T.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: T.border, gap: 14 },
  errorBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: T.errorDim, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: 'rgba(248,81,73,0.20)' },
  errorText: { color: T.error, fontSize: 13, flex: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.surfaceHigh, borderRadius: 14, borderWidth: 1, borderColor: T.border, paddingHorizontal: 14, height: 52 },
  inputError:{ borderColor: T.error },
  fieldError:{ color: T.error, fontSize: 12, marginTop: 4, marginLeft: 4 },
  inputIcon: { marginRight: 10 },
  input:     { flex: 1, color: T.textPrimary, fontSize: 15, height: '100%' },
  eyeBtn:    { padding: 4 },
  forgotBtn: { alignSelf: 'flex-end' },
  forgotText:{ fontSize: 13, color: T.accent },
  loginBtn:  { backgroundColor: T.accent, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText:     { color: T.bg, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  registerHint:{ color: T.textSecond, fontSize: 14 },
  registerLink:{ color: T.accent, fontSize: 14, fontWeight: '700' },
})