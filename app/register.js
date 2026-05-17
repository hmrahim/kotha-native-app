import React, { useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Animated,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { T } from '../theme'

export default function RegisterScreen() {
  const { register } = useAuth()
  const router       = useRouter()

  const shakeAnim   = useRef(new Animated.Value(0)).current
  const emailRef    = useRef(null)
  const passRef     = useRef(null)
  const confirmRef  = useRef(null)

  const [showPass,    setShowPass]    = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [loading,     setLoading]     = React.useState(false)
  const [authError,   setAuthError]   = React.useState('')

  const { control, handleSubmit, formState: { errors }, watch } = useForm({
    defaultValues: { name: '', email: '', password: '', confirm: '' }
  })

  const password = watch('password')

  // Password strength
  const getStrength = (pass = '') => {
    if (!pass) return 0
    let s = 0
    if (pass.length >= 8)          s++
    if (/[A-Z]/.test(pass))        s++
    if (/[0-9]/.test(pass))        s++
    if (/[^A-Za-z0-9]/.test(pass)) s++
    return s
  }

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start()
  }

  const friendlyError = (code) => {
    switch (code) {
      case 'auth/email-already-in-use':  return 'এই Email দিয়ে আগেই account আছে। Login করো'
      case 'auth/invalid-email':          return 'সঠিক Email address দাও'
      case 'auth/weak-password':          return 'Password কমপক্ষে ৬ character হতে হবে'
      case 'auth/network-request-failed': return 'Internet connection চেক করো'
      default:                            return 'Account তৈরি হয়নি। আবার চেষ্টা করো'
    }
  }

  const onSubmit = async ({ name, email, password }) => {
    setAuthError('')
    try {
      setLoading(true)
      await register(name.trim(), email.trim().toLowerCase(), password)
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
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={T.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={s.titleWrap}>
          <Text style={s.title}>নতুন Account</Text>
          <Text style={s.subtitle}>তোমার তথ্য দিয়ে account তৈরি করো</Text>
        </View>

        {/* ── Form ── */}
        <Animated.View style={[s.card, { transform: [{ translateX: shakeAnim }] }]}>

          {!!authError && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={T.error} />
              <Text style={s.errorText}>{authError}</Text>
            </View>
          )}

          {/* Name */}
          <Controller
            control={control}
            name="name"
            rules={{ required: 'তোমার নাম দাও' }}
            render={({ field: { onChange, value } }) => (
              <View>
                <View style={[s.inputWrap, errors.name && s.inputError]}>
                  <Ionicons name="person-outline" size={18} color={T.textMuted} style={s.inputIcon} />
                  <TextInput
                    style={s.input}
                    placeholder="তোমার নাম"
                    placeholderTextColor={T.textMuted}
                    value={value}
                    onChangeText={(v) => { onChange(v); setAuthError('') }}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                  />
                </View>
                {errors.name && <Text style={s.fieldError}>{errors.name.message}</Text>}
              </View>
            )}
          />

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
                    ref={emailRef}
                    style={s.input}
                    placeholder="Email address"
                    placeholderTextColor={T.textMuted}
                    value={value}
                    onChangeText={(v) => { onChange(v); setAuthError('') }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passRef.current?.focus()}
                  />
                </View>
                {errors.email && <Text style={s.fieldError}>{errors.email.message}</Text>}
              </View>
            )}
          />

          {/* Password */}
          <Controller
            control={control}
            name="password"
            rules={{
              required:  'Password দিতে হবে',
              minLength: { value: 6, message: 'Password কমপক্ষে ৬ character হতে হবে' },
            }}
            render={({ field: { onChange, value } }) => {
              const strength      = getStrength(value)
              const strengthColor = ['#F85149','#F59E0B','#F59E0B','#3FB950','#2DD4BF'][strength]
              const strengthLabel = ['','দুর্বল','মোটামুটি','ভালো','শক্তিশালী'][strength]

              return (
                <View>
                  <View style={[s.inputWrap, errors.password && s.inputError]}>
                    <Ionicons name="lock-closed-outline" size={18} color={T.textMuted} style={s.inputIcon} />
                    <TextInput
                      ref={passRef}
                      style={[s.input, { flex: 1 }]}
                      placeholder="Password (কমপক্ষে ৬ character)"
                      placeholderTextColor={T.textMuted}
                      value={value}
                      onChangeText={(v) => { onChange(v); setAuthError('') }}
                      secureTextEntry={!showPass}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmRef.current?.focus()}
                    />
                    <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
                      <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={T.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Strength bar */}
                  {value.length > 0 && (
                    <View style={s.strengthWrap}>
                      {[1,2,3,4].map(i => (
                        <View key={i} style={[s.strengthBar, { backgroundColor: i <= strength ? strengthColor : T.border }]} />
                      ))}
                      {strengthLabel ? <Text style={[s.strengthLabel, { color: strengthColor }]}>{strengthLabel}</Text> : null}
                    </View>
                  )}
                  {errors.password && <Text style={s.fieldError}>{errors.password.message}</Text>}
                </View>
              )
            }}
          />

          {/* Confirm Password */}
          <Controller
            control={control}
            name="confirm"
            rules={{
              required: 'Password আবার দাও',
              validate: v => v === password || 'Password দুটো মিলছে না',
            }}
            render={({ field: { onChange, value } }) => (
              <View>
                <View style={[s.inputWrap, errors.confirm && s.inputError]}>
                  <Ionicons name="lock-closed-outline" size={18} color={T.textMuted} style={s.inputIcon} />
                  <TextInput
                    ref={confirmRef}
                    style={[s.input, { flex: 1 }]}
                    placeholder="Password আবার দাও"
                    placeholderTextColor={T.textMuted}
                    value={value}
                    onChangeText={(v) => { onChange(v); setAuthError('') }}
                    secureTextEntry={!showConfirm}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit(onSubmit, onError)}
                  />
                  <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={s.eyeBtn}>
                    <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={T.textMuted} />
                  </TouchableOpacity>
                </View>
                {errors.confirm && <Text style={s.fieldError}>{errors.confirm.message}</Text>}
              </View>
            )}
          />

          {/* Register button */}
          <TouchableOpacity
            style={[s.registerBtn, loading && s.btnDisabled]}
            onPress={handleSubmit(onSubmit, onError)}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={T.bg} size="small" />
              : <Text style={s.registerBtnText}>Account তৈরি করো</Text>
            }
          </TouchableOpacity>
        </Animated.View>

        {/* ── Login link ── */}
        <View style={s.loginRow}>
          <Text style={s.loginHint}>আগেই account আছে?</Text>
          <TouchableOpacity onPress={() => router.replace('/login')} activeOpacity={0.7}>
            <Text style={s.loginLink}> Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 20 },
  header: { marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  titleWrap:  { marginBottom: 28 },
  title:      { fontSize: 28, fontWeight: '900', color: T.textPrimary, marginBottom: 6 },
  subtitle:   { fontSize: 14, color: T.textSecond },
  card:       { backgroundColor: T.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: T.border, gap: 14 },
  errorBox:   { flexDirection: 'row', alignItems: 'center', backgroundColor: T.errorDim, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: 'rgba(248,81,73,0.20)' },
  errorText:  { color: T.error, fontSize: 13, flex: 1 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: T.surfaceHigh, borderRadius: 14, borderWidth: 1, borderColor: T.border, paddingHorizontal: 14, height: 52 },
  inputError: { borderColor: T.error },
  fieldError: { color: T.error, fontSize: 12, marginTop: 4, marginLeft: 4 },
  inputIcon:  { marginRight: 10 },
  input:      { flex: 1, color: T.textPrimary, fontSize: 15, height: '100%' },
  eyeBtn:     { padding: 4 },
  strengthWrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 2 },
  strengthBar:   { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700', marginLeft: 4, minWidth: 60 },
  registerBtn:     { backgroundColor: T.accent, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnDisabled:     { opacity: 0.7 },
  registerBtnText: { color: T.bg, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  loginRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
  loginHint: { color: T.textSecond, fontSize: 14 },
  loginLink: { color: T.accent, fontSize: 14, fontWeight: '700' },
})