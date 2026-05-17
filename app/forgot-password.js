import React, { useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Animated,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import { T } from '../theme'

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth()
  const router = useRouter()

  const [email,    setEmail]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [error,    setError]    = useState('')
  const [cooldown, setCooldown] = useState(0)

  const shakeAnim = useRef(new Animated.Value(0)).current

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start()
  }

  // cooldown countdown
  React.useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const friendlyError = (code) => {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/invalid-email':
      case 'auth/invalid-credential': return 'এই Email দিয়ে কোনো account নেই'
      case 'auth/too-many-requests':  return 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো'
      case 'auth/network-request-failed': return 'Internet connection চেক করো'
      default: return 'Email পাঠানো যায়নি। আবার চেষ্টা করো'
    }
  }

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/\S+@\S+\.\S+/.test(trimmed)) {
      setError('সঠিক Email address দাও')
      shake()
      return
    }
    setError('')
    setLoading(true)
    try {
      await resetPassword(trimmed)
      setSent(true)
      setCooldown(60)
    } catch (err) {
      setError(friendlyError(err.code))
      shake()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setError('')
    setLoading(true)
    try {
      await resetPassword(email.trim().toLowerCase())
      setCooldown(60)
    } catch (err) {
      setError(friendlyError(err.code))
      shake()
    } finally {
      setLoading(false)
    }
  }

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
        {/* Back button */}
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={T.textPrimary} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={s.iconWrap}>
          <View style={s.iconRing}>
            <Ionicons
              name={sent ? 'checkmark-circle' : 'lock-open-outline'}
              size={46}
              color={T.accent}
            />
          </View>
        </View>

        <Text style={s.title}>
          {sent ? 'Email পাঠানো হয়েছে!' : 'Password ভুলে গেছো?'}
        </Text>
        <Text style={s.subtitle}>
          {sent
            ? `${email.trim().toLowerCase()} এ একটি reset link পাঠানো হয়েছে। Spam folder ও চেক করো।`
            : 'তোমার account এর Email দাও। Password reset করার link পাঠানো হবে।'
          }
        </Text>

        <Animated.View style={[s.card, { transform: [{ translateX: shakeAnim }] }]}>

          {/* Error */}
          {!!error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle" size={16} color={T.error} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {!sent ? (
            <>
              {/* Email input */}
              <View style={[s.inputWrap, !!error && s.inputError]}>
                <Ionicons name="mail-outline" size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Email address"
                  placeholderTextColor={T.textMuted}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError('') }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  autoFocus
                />
              </View>

              {/* Send button */}
              <TouchableOpacity
                style={[s.sendBtn, loading && s.btnDisabled]}
                onPress={handleSend}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={T.bg} size="small" />
                  : <Text style={s.sendBtnText}>Reset Link পাঠাও</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Spam warning */}
              <View style={s.spamBox}>
                <Ionicons name="warning-outline" size={16} color="#F59E0B" style={{ marginTop: 1 }} />
                <Text style={s.spamText}>
                  Email না পেলে <Text style={s.spamBold}>Spam / Junk</Text> folder চেক করো।
                </Text>
              </View>

              {/* Steps */}
              <View style={s.stepsBox}>
                <Step n="১" text="Email inbox (বা Spam folder) খোলো" />
                <Step n="২" text="Kotha এর email থেকে Reset link এ click করো" />
                <Step n="৩" text="নতুন password দিয়ে আবার login করো" />
              </View>

              {/* Resend */}
              <TouchableOpacity
                style={[s.resendBtn, (loading || cooldown > 0) && s.btnDisabled]}
                onPress={handleResend}
                activeOpacity={0.75}
                disabled={loading || cooldown > 0}
              >
                {loading
                  ? <ActivityIndicator color={T.accent} size="small" />
                  : <Text style={s.resendText}>
                      {cooldown > 0 ? `আবার পাঠাও (${cooldown}s)` : 'আবার Email পাঠাও'}
                    </Text>
                }
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* Back to login */}
        <TouchableOpacity
          style={s.loginRow}
          onPress={() => router.replace('/login')}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={15} color={T.accent} />
          <Text style={s.loginLink}>Login screen এ ফিরে যাও</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Step({ n, text }) {
  return (
    <View style={step.row}>
      <View style={step.num}>
        <Text style={step.numText}>{n}</Text>
      </View>
      <Text style={step.text}>{text}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 },

  backBtn: { alignSelf: 'flex-start', padding: 4, marginBottom: 32 },

  iconWrap: { alignItems: 'center', marginBottom: 24 },
  iconRing: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: T.accentDim,
    borderWidth: 1.5, borderColor: 'rgba(45,212,191,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },

  title: {
    fontSize: 24, fontWeight: '800', color: T.textPrimary,
    textAlign: 'center', marginBottom: 10, letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14, color: T.textSecond,
    textAlign: 'center', lineHeight: 22, marginBottom: 28,
  },

  card: {
    backgroundColor: T.surface, borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: T.border, gap: 14,
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(248,81,73,0.10)', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: 'rgba(248,81,73,0.20)',
  },
  errorText: { color: T.error, fontSize: 13, flex: 1 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surfaceHigh, borderRadius: 14,
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14, height: 52,
  },
  inputError: { borderColor: T.error },
  inputIcon:  { marginRight: 10 },
  input: { flex: 1, color: T.textPrimary, fontSize: 15, height: '100%' },

  sendBtn: {
    backgroundColor: T.accent, borderRadius: 14,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: T.bg, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  spamBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 12, padding: 12,
  },
  spamText: { color: '#F59E0B', fontSize: 13, flex: 1, lineHeight: 19 },
  spamBold: { fontWeight: '700' },

  stepsBox: {
    backgroundColor: T.surfaceHigh, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: T.border, gap: 10,
  },

  resendBtn: {
    borderWidth: 1.5, borderColor: T.accent, borderRadius: 14,
    height: 48, alignItems: 'center', justifyContent: 'center',
  },
  resendText: { color: T.accent, fontSize: 14, fontWeight: '700' },

  btnDisabled: { opacity: 0.5 },

  loginRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 28,
  },
  loginLink: { color: T.accent, fontSize: 14, fontWeight: '600' },
})

const step = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  num:     {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(45,212,191,0.3)', marginTop: 1,
  },
  numText: { color: T.accent, fontSize: 12, fontWeight: '800' },
  text:    { color: T.textSecond, fontSize: 13, flex: 1, lineHeight: 20 },
})