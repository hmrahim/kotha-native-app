import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { Stack, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image, ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { getCurrentUser, updateProfile } from '../services/api'
import { uploadToCloudinary } from '../services/cloudinary'
import { T, getColor, getInitials } from '../theme'

const { width } = Dimensions.get('window')
const COVER_H = 180

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { mongoUser, user, refreshUser } = useAuth()   // FIX #3: get refreshUser

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [profileImage, setProfileImage] = useState(null)
  const [coverImage, setCoverImage] = useState(null)
  const [uploadingField, setUploadingField] = useState(null)

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true)
      try {
        const data = await getCurrentUser()
        if (data) {
          setName(data.name || user?.displayName || '')
          setBio(data.bio || '')
          setPhone(data.phone || '')
          setProfileImage(data.profileImage || null)
          setCoverImage(data.coverImage || null)
        }
      } catch (e) {
        console.log('Load profile error:', e?.message)
      }
      setLoading(false)
    }
    loadProfile()
  }, [])

  const pickAndUpload = async (field) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission required', 'Allow gallery access')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: field === 'profile' ? [1, 1] : [16, 9],
    })
    if (res.canceled || !res.assets?.[0]) return

    const asset = res.assets[0]
    setUploadingField(field)
    try {
      const up = await uploadToCloudinary({
        uri: asset.uri,
        type: 'image',
        mime: asset.mimeType || 'image/jpeg',
        name: `${field}_${Date.now()}.jpg`,
        onProgress: () => {},
      })
      if (field === 'profile') setProfileImage(up.url)
      else setCoverImage(up.url)
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'Could not upload image')
    }
    setUploadingField(null)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name')
      return
    }
    setSaving(true)
    try {
      await updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
        profileImage,
        coverImage,
      })

      // FIX #3: refresh mongoUser in AuthContext so photo/name updates everywhere
      await refreshUser()

      Alert.alert('Saved!', 'Profile updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e) {
      Alert.alert('Save failed', e?.message || 'Could not update profile')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    )
  }

  const initials = getInitials(name || user?.displayName || '?')

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={T.surface} />

        {/* Sticky header */}
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color={T.accent} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Edit Profile</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#0D1117" />
              : <Text style={s.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Cover image */}
          <View style={s.coverWrap}>
            {coverImage ? (
              <Image source={{ uri: coverImage }} style={s.cover} resizeMode="cover" />
            ) : (
              <View style={[s.cover, { backgroundColor: '#1a2744' }]} />
            )}
            <TouchableOpacity
              style={s.coverEditBtn}
              onPress={() => pickAndUpload('cover')}
              disabled={!!uploadingField}
            >
              {uploadingField === 'cover'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={18} color="#fff" />
              }
            </TouchableOpacity>
          </View>

          {/* Profile avatar */}
          <View style={s.avatarSection}>
            <TouchableOpacity
              style={s.avatarWrap}
              onPress={() => pickAndUpload('profile')}
              disabled={!!uploadingField}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, { backgroundColor: getColor(name || '?') }]}>
                  <Text style={s.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={s.avatarEditOverlay}>
                {uploadingField === 'profile'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={18} color="#fff" />
                }
              </View>
            </TouchableOpacity>
            <Text style={s.changePhotoText}>Change photo</Text>
          </View>

          {/* Form fields */}
          <View style={s.form}>
            <Field
              label="Name"
              icon="person-outline"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              maxLength={50}
            />
            <Field
              label="Bio"
              icon="information-circle-outline"
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself…"
              multiline
              maxLength={150}
            />
            <Field
              label="Phone"
              icon="call-outline"
              value={phone}
              onChangeText={setPhone}
              placeholder="+880..."
              keyboardType="phone-pad"
              maxLength={20}
            />
            <View style={s.emailRow}>
              <Ionicons name="mail-outline" size={18} color={T.textMuted} />
              <Text style={s.emailLabel}>Email</Text>
              <Text style={s.emailValue} numberOfLines={1}>{user?.email || mongoUser?.email || '—'}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </>
  )
}

function Field({ label, icon, value, onChangeText, placeholder, multiline, maxLength, keyboardType }) {
  return (
    <View style={f.wrap}>
      <View style={f.labelRow}>
        <Ionicons name={icon} size={16} color={T.accent} />
        <Text style={f.label}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.textMuted}
        style={[f.input, multiline && f.inputMulti]}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType || 'default'}
      />
      {maxLength && (
        <Text style={f.counter}>{value?.length || 0}/{maxLength}</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: T.textPrimary, fontSize: 17, fontWeight: '700' },
  saveBtn: {
    backgroundColor: T.accent,
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20, minWidth: 60, alignItems: 'center',
  },
  saveBtnText: { color: '#0D1117', fontWeight: '700', fontSize: 14 },
  coverWrap: { position: 'relative' },
  cover: { width, height: COVER_H },
  coverEditBtn: {
    position: 'absolute', bottom: 12, right: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarSection: {
    paddingHorizontal: 20,
    marginTop: -(COVER_H / 4.5),
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 86, height: 86, borderRadius: 43,
    borderWidth: 3, borderColor: T.bg,
  },
  avatarText: {
    color: '#fff', fontSize: 28, fontWeight: '800',
    textAlign: 'center', lineHeight: 80,
  },
  avatarEditOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: T.accent,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.bg,
  },
  changePhotoText: { color: T.accent, fontSize: 12, marginTop: 6, fontWeight: '500' },
  form: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 50, gap: 4 },
  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  emailLabel: { color: T.accent, fontSize: 13, fontWeight: '600', width: 54 },
  emailValue: { color: T.textSecond, fontSize: 14, flex: 1 },
})

const f = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: T.border, paddingVertical: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { color: T.accent, fontSize: 12, fontWeight: '600' },
  input: {
    color: T.textPrimary, fontSize: 15,
    paddingVertical: 8, paddingHorizontal: 0,
    borderBottomWidth: 1.5, borderBottomColor: T.accentDim,
    minHeight: 40,
  },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  counter: { color: T.textMuted, fontSize: 10, textAlign: 'right', marginTop: 2 },
})