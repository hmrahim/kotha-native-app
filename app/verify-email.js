import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { T } from '../theme'

export default function VerifyEmailScreen() {
  const { user, checkEmailVerified, resendVerificationEmail, logout } = useAuth()

  const [checking,  setChecking]  = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')
  const [resendErr, setResendErr] = useState('')
  const [cooldown,  setCooldown]  = useState(0)

  // pulse animation for the mail icon
  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  // cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Auto-poll every 4 seconds — যখনই verified হবে AuthContext redirect করবে
  useEffect(() => {
    const interval = setInterval(async () => {
      await checkEmailVerified()
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleCheck = async () => {
    setChecking(true)
    await checkEmailVerified()
    setChecking(false)
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setResendMsg('')
    setResendErr('')
    setResending(true)
    try {
      await resendVerificationEmail()
      setResendMsg('Email পাঠানো হয়েছে! Spam folder চেক করো।')
      setCooldown(60)
    } catch (err) {
      if (err.code === 'auth/too-many-requests') {
        setResendErr('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করো।')
      } else {
        setResendErr('Email পাঠানো যায়নি। আবার চেষ্টা করো।')
      }
    } finally {
      setResending(false)
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" backgroundColor={T.bg} />

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={logout} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={T.textSecond} />
          <Text style={s.backText}>অন্য account</Text>
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        {/* Animated mail icon */}
        <Animated.View style={[s.iconWrap, { transform: [{ scale: pulse }] }]}>
          <View style={s.iconRing}>
            <Ionicons name="mail" size={48} color={T.accent} />
          </View>
        </Animated.View>

        <Text style={s.title}>Email Verify করো</Text>
        <Text style={s.subtitle}>
          <Text style={s.emailHighlight}>{user?.email}</Text>
          {'\n'}এই address এ একটি verification link পাঠানো হয়েছে।
        </Text>

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
          <Step n="২" text="Kotha এর email থেকে link এ click করো" />
          <Step n="৩" text="এই screen এ auto redirect হয়ে যাবে" />
        </View>

        {/* Success / error messages */}
        {!!resendMsg && (
          <View style={s.successBox}>
            <Ionicons name="checkmark-circle" size={15} color={T.accent} />
            <Text style={s.successText}>{resendMsg}</Text>
          </View>
        )}
        {!!resendErr && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={15} color={T.error} />
            <Text style={s.errorText}>{resendErr}</Text>
          </View>
        )}

        {/* Manual check button */}
        <TouchableOpacity
          style={[s.checkBtn, checking && s.btnDisabled]}
          onPress={handleCheck}
          activeOpacity={0.85}
          disabled={checking}
        >
          {checking
            ? <ActivityIndicator color={T.bg} size="small" />
            : <>
                <Ionicons name="refresh" size={18} color={T.bg} />
                <Text style={s.checkBtnText}>Verify হয়েছে কিনা দেখো</Text>
              </>
          }
        </TouchableOpacity>

        {/* Resend button */}
        <TouchableOpacity
          style={[s.resendBtn, (resending || cooldown > 0) && s.btnDisabled]}
          onPress={handleResend}
          activeOpacity={0.75}
          disabled={resending || cooldown > 0}
        >
          {resending
            ? <ActivityIndicator color={T.accent} size="small" />
            : <Text style={s.resendText}>
                {cooldown > 0
                  ? `আবার পাঠাও (${cooldown}s)`
                  : 'Email আবার পাঠাও'
                }
              </Text>
          }
        </TouchableOpacity>
      </View>
    </View>
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
  topBar: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8 },
  backBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: 4 },
  backText:{ color: T.textSecond, fontSize: 14 },

  body: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: 28, paddingTop: 20,
  },

  iconWrap: { marginBottom: 28 },
  iconRing: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: T.accentDim,
    borderWidth: 1.5, borderColor: 'rgba(45,212,191,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },

  title: {
    fontSize: 26, fontWeight: '800', color: T.textPrimary,
    letterSpacing: 0.5, marginBottom: 12, textAlign: 'center',
  },
  subtitle: {
    fontSize: 14, color: T.textSecond,
    textAlign: 'center', lineHeight: 22, marginBottom: 16,
  },
  emailHighlight: { color: T.accent, fontWeight: '700' },

  spamBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 12, padding: 12,
    marginBottom: 20, width: '100%',
  },
  spamText: { color: '#F59E0B', fontSize: 13, flex: 1, lineHeight: 19 },
  spamBold: { fontWeight: '700' },

  stepsBox: {
    backgroundColor: T.surface,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: T.border,
    width: '100%', gap: 10, marginBottom: 20,
  },

  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.accentDim, borderRadius: 12,
    padding: 12, width: '100%', marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(45,212,191,0.25)',
  },
  successText: { color: T.accent, fontSize: 13, flex: 1 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(248,81,73,0.10)', borderRadius: 12,
    padding: 12, width: '100%', marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(248,81,73,0.20)',
  },
  errorText: { color: T.error, fontSize: 13, flex: 1 },

  checkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.accent, borderRadius: 14,
    height: 52, paddingHorizontal: 28,
    width: '100%', justifyContent: 'center', marginBottom: 12,
  },
  checkBtnText: { color: T.bg, fontSize: 15, fontWeight: '800' },

  resendBtn: {
    borderWidth: 1.5, borderColor: T.accent, borderRadius: 14,
    height: 48, paddingHorizontal: 28,
    width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  resendText: { color: T.accent, fontSize: 14, fontWeight: '700' },

  btnDisabled: { opacity: 0.5 },
})

const step = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  num:     { width: 24, height: 24, borderRadius: 12, backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(45,212,191,0.3)', marginTop: 1 },
  numText: { color: T.accent, fontSize: 12, fontWeight: '800' },
  text:    { color: T.textSecond, fontSize: 13, flex: 1, lineHeight: 20 },
})