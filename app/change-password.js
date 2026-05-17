import React, { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, StatusBar, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { T } from '../theme'
import { getFirebaseAuth } from '../firebase/firebaseConfig'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function validate(current, newPass, confirm) {
  if (!current)               return 'Current password is required'
  if (!newPass)               return 'New password is required'
  if (newPass.length < 6)     return 'New password must be at least 6 characters'
  if (newPass === current)    return 'New password must be different from current'
  if (newPass !== confirm)    return 'Passwords do not match'
  return null
}

// ─── Input Field ──────────────────────────────────────────────────────────────
function PassInput({ label, value, onChangeText, show, onToggle, onSubmit, inputRef }) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputRow}>
        <TextInput
          ref={inputRef}
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          placeholderTextColor={T.textMuted}
          placeholder="••••••••"
          autoCapitalize="none"
          returnKeyType="next"
          onSubmitEditing={onSubmit}
        />
        <TouchableOpacity onPress={onToggle} style={s.eyeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={T.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Password Strength ────────────────────────────────────────────────────────
function StrengthBar({ password }) {
  if (!password) return null

  let score = 0
  if (password.length >= 6)  score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong']
  const colors = ['', '#FF5A5A', '#F59E0B', '#3B82F6', '#2DD4BF', '#10B981']

  return (
    <View style={s.strengthWrap}>
      <View style={s.strengthBars}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[s.strengthBar, { backgroundColor: i <= score ? colors[score] : T.surfaceHigh }]}
          />
        ))}
      </View>
      <Text style={[s.strengthLabel, { color: colors[score] }]}>{labels[score]}</Text>
    </View>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ChangePasswordScreen() {
  const router = useRouter()

  const [current,     setCurrent]     = useState('')
  const [newPass,     setNewPass]     = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)

  const newRef     = useRef()
  const confirmRef = useRef()

  const handleChange = async () => {
    const err = validate(current, newPass, confirm)
    if (err) { setError(err); return }

    setError('')
    setLoading(true)

    try {
      const auth = await getFirebaseAuth()
      const firebaseUser = auth.currentUser
      if (!firebaseUser) throw new Error('Not logged in')

      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth')

      // Step 1 — reauthenticate with current password
      const credential = EmailAuthProvider.credential(firebaseUser.email, current)
      await reauthenticateWithCredential(firebaseUser, credential)

      // Step 2 — update to new password
      await updatePassword(firebaseUser, newPass)

      setSuccess(true)
      setCurrent('')
      setNewPass('')
      setConfirm('')

    } catch (e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError('Current password is incorrect')
      } else if (e.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later')
      } else if (e.code === 'auth/requires-recent-login') {
        setError('Session expired. Please logout and login again')
      } else {
        setError(e.message || 'Something went wrong')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Success State ──
  if (success) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}
            style={s.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color={T.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Change Password</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={T.accent} />
          </View>
          <Text style={s.successTitle}>Password Changed!</Text>
          <Text style={s.successSub}>Your password has been updated successfully.</Text>
          <TouchableOpacity
            style={s.doneBtn}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}
            activeOpacity={0.8}
          >
            <Text style={s.doneBtnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={T.accent} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Change Password</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={s.iconWrap}>
          <View style={s.iconBg}>
            <Ionicons name="lock-closed" size={32} color={T.accent} />
          </View>
          <Text style={s.pageTitle}>Update Password</Text>
          <Text style={s.pageSubtitle}>Enter your current password, then choose a new one.</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          <PassInput
            label="Current Password"
            value={current}
            onChangeText={(t) => { setCurrent(t); setError('') }}
            show={showCurrent}
            onToggle={() => setShowCurrent(p => !p)}
            onSubmit={() => newRef.current?.focus()}
          />

          <PassInput
            label="New Password"
            value={newPass}
            onChangeText={(t) => { setNewPass(t); setError('') }}
            show={showNew}
            onToggle={() => setShowNew(p => !p)}
            inputRef={newRef}
            onSubmit={() => confirmRef.current?.focus()}
          />
          <StrengthBar password={newPass} />

          <PassInput
            label="Confirm New Password"
            value={confirm}
            onChangeText={(t) => { setConfirm(t); setError('') }}
            show={showConfirm}
            onToggle={() => setShowConfirm(p => !p)}
            inputRef={confirmRef}
            onSubmit={handleChange}
          />

          {/* Match indicator */}
          {confirm.length > 0 && (
            <View style={s.matchRow}>
              <Ionicons
                name={newPass === confirm ? 'checkmark-circle' : 'close-circle'}
                size={15}
                color={newPass === confirm ? '#10B981' : '#FF5A5A'}
              />
              <Text style={[s.matchText, { color: newPass === confirm ? '#10B981' : '#FF5A5A' }]}>
                {newPass === confirm ? 'Passwords match' : 'Passwords do not match'}
              </Text>
            </View>
          )}

          {/* Error */}
          {error ? (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#FF5A5A" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleChange}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#000" size="small" />
              : <Text style={s.submitText}>Update Password</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: T.surface, paddingHorizontal: 12, paddingVertical: 10,
    height: 60, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn:     { padding: 6 },
  headerTitle: { color: T.textPrimary, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },

  scroll: { paddingHorizontal: 24, paddingTop: 36, paddingBottom: 40 },

  // Icon hero
  iconWrap:    { alignItems: 'center', marginBottom: 36 },
  iconBg: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: T.accentDim, borderWidth: 1, borderColor: T.accent + '40',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  pageTitle:    { color: T.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  pageSubtitle: { color: T.textSecond, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Form
  form: { gap: 18 },

  fieldWrap: { gap: 6 },
  label:     { color: T.textSecond, fontSize: 13, fontWeight: '600', marginLeft: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, borderRadius: 12,
    borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1, color: T.textPrimary, fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 11,
    letterSpacing: 1,
  },
  eyeBtn: { padding: 4 },

  // Strength bar
  strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar:  { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:{ fontSize: 12, fontWeight: '700', width: 70, textAlign: 'right' },

  // Match
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8 },
  matchText:{ fontSize: 13, fontWeight: '500' },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,90,90,0.10)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,90,90,0.25)',
    padding: 12,
  },
  errorText: { color: '#FF5A5A', fontSize: 13, flex: 1 },

  // Submit
  submitBtn: {
    backgroundColor: T.accent, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 6,
  },
  submitText: { color: '#0D1117', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  successTitle: { color: T.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 10 },
  successSub:   { color: T.textSecond, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  doneBtn: {
    backgroundColor: T.accent, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 40,
  },
  doneBtnText: { color: '#0D1117', fontSize: 16, fontWeight: '800' },
})