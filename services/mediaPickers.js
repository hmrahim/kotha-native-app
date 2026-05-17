import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import * as DocumentPicker from 'expo-document-picker'
import * as Location from 'expo-location'
import * as Contacts from 'expo-contacts'
import { Alert, Platform } from 'react-native'
import { uploadToCloudinary, formatBytes } from './cloudinary'

// ─── Upload single local media item ──────────────────────────────────────────
export const uploadMediaItem = async (localMedia, onProgress) => {
  if (!localMedia?.localUri) return localMedia
  const up = await uploadToCloudinary({
    uri: localMedia.localUri,
    type: localMedia.type,
    mime: localMedia.mime || 'application/octet-stream',
    name: localMedia.fileName || `${localMedia.type}_${Date.now()}`,
    onProgress,
  })
  return {
    ...localMedia,
    url: up.url,
    public_id: up.public_id,
    width: up.width || localMedia.width,
    height: up.height || localMedia.height,
    duration: up.duration || localMedia.duration,
    size: up.bytes || localMedia.size,
    fileSize: formatBytes(up.bytes || localMedia.size),
    localUri: null,
    isUploading: false,
    uploadProgress: 100,
  }
}

// ─── Image Edit — crop, resize, rotate, flip, compress ───────────────────────
/**
 * editImage({ uri, actions, compress, format })
 *
 * actions: array of ImageManipulator actions, e.g.:
 *   [{ crop: { originX, originY, width, height } }]
 *   [{ resize: { width: 800 } }]
 *   [{ rotate: 90 }]
 *   [{ flip: ImageManipulator.FlipType.Horizontal }]
 *
 * compress: 0–1 (default 0.8)
 * format: 'jpeg' | 'png' (default 'jpeg')
 *
 * Returns: { uri, width, height, base64? }
 */
export const editImage = async ({
  uri,
  actions = [],
  compress = 0.8,
  format = ImageManipulator.SaveFormat.JPEG,
  base64 = false,
}) => {
  try {
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress,
      format,
      base64,
    })
    return result // { uri, width, height, base64? }
  } catch (e) {
    console.error('[editImage]', e)
    Alert.alert('Error', 'Image edit করতে সমস্যা হয়েছে')
    return null
  }
}

// ─── Quick helpers built on editImage ────────────────────────────────────────

/** Crop — pass originX, originY, width, height in pixels */
export const cropImage = async (uri, { originX, originY, width, height }, compress = 0.8) =>
  editImage({ uri, actions: [{ crop: { originX, originY, width, height } }], compress })

/** Rotate — degrees: 90 | 180 | 270 */
export const rotateImage = async (uri, degrees = 90) =>
  editImage({ uri, actions: [{ rotate: degrees }] })

/** Flip horizontal */
export const flipImageHorizontal = async (uri) =>
  editImage({ uri, actions: [{ flip: ImageManipulator.FlipType.Horizontal }] })

/** Flip vertical */
export const flipImageVertical = async (uri) =>
  editImage({ uri, actions: [{ flip: ImageManipulator.FlipType.Vertical }] })

/** Resize — keep aspect ratio by passing only width or only height */
export const resizeImage = async (uri, { width, height }, compress = 0.8) =>
  editImage({ uri, actions: [{ resize: { width, height } }], compress })

/** Compress only — no transform */
export const compressImage = async (uri, compress = 0.5) =>
  editImage({ uri, actions: [], compress })

/**
 * Full pipeline — apply multiple transforms in one call
 * example:
 *   await transformImage(uri, [
 *     { rotate: 90 },
 *     { flip: ImageManipulator.FlipType.Horizontal },
 *     { resize: { width: 1080 } },
 *   ])
 */
export const transformImage = async (uri, actions = [], compress = 0.8) =>
  editImage({ uri, actions, compress })

// ─── Gallery — LOCAL only ─────────────────────────────────────────────────────
export const pickFromGallery = async () => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('Permission required', 'Allow gallery access')
    return null
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
    allowsMultipleSelection: true,
    videoMaxDuration: 60,
    exif: false,
    // Note: Recently Deleted images showing is an Android system limitation.
    // expo-image-picker cannot hide them on Expo Go.
  })
  if (res.canceled || !res.assets?.length) return null
  return res.assets.map((a) => {
    const isVideo = a.type === 'video' || /\.(mp4|mov|webm)$/i.test(a.uri)
    const type = isVideo ? 'video' : 'image'
    return {
      type,
      localUri: a.uri,
      mime: a.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
      fileName: a.fileName || `${type}_${Date.now()}`,
      width: a.width,
      height: a.height,
      size: a.fileSize,
      duration: a.duration,
      isUploading: true,
      uploadProgress: 0,
    }
  })
}

// ─── Gallery + immediate crop (single image only) ────────────────────────────
/**
 * Pick one image and open the built-in crop UI immediately.
 * allowsEditing: true  →  system crop UI (iOS square crop / Android freeform)
 * aspect: [W, H]       →  force aspect ratio (iOS only)
 */
export const pickAndCropFromGallery = async ({ aspect } = {}) => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('Permission required', 'Allow gallery access')
    return null
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: false,
    allowsEditing: true,           // ← opens system crop UI
    aspect: aspect || [1, 1],      // default square
    exif: false,
  })
  if (res.canceled || !res.assets?.[0]) return null
  const a = res.assets[0]
  return [{
    type: 'image',
    localUri: a.uri,
    mime: a.mimeType || 'image/jpeg',
    fileName: a.fileName || `image_${Date.now()}`,
    width: a.width,
    height: a.height,
    size: a.fileSize,
    isUploading: true,
    uploadProgress: 0,
  }]
}

// ─── Camera — LOCAL only ──────────────────────────────────────────────────────
export const pickFromCamera = async () => {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('Permission required', 'Allow camera access')
    return null
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.7,
    videoMaxDuration: 60,
    exif: false,
  })
  if (res.canceled || !res.assets?.[0]) return null
  const a = res.assets[0]
  const isVideo = a.type === 'video' || /\.(mp4|mov|webm)$/i.test(a.uri)
  const type = isVideo ? 'video' : 'image'
  return [{
    type,
    localUri: a.uri,
    mime: a.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
    fileName: `cam_${type}_${Date.now()}`,
    width: a.width,
    height: a.height,
    size: a.fileSize,
    duration: a.duration,
    isUploading: true,
    uploadProgress: 0,
  }]
}

// ─── Camera + immediate crop ──────────────────────────────────────────────────
export const pickAndCropFromCamera = async ({ aspect } = {}) => {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('Permission required', 'Allow camera access')
    return null
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
    aspect: aspect || [1, 1],
    exif: false,
  })
  if (res.canceled || !res.assets?.[0]) return null
  const a = res.assets[0]
  return [{
    type: 'image',
    localUri: a.uri,
    mime: a.mimeType || 'image/jpeg',
    fileName: `cam_image_${Date.now()}`,
    width: a.width,
    height: a.height,
    size: a.fileSize,
    isUploading: true,
    uploadProgress: 0,
  }]
}

// ─── Document — LOCAL only ────────────────────────────────────────────────────
export const pickDocument = async () => {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: true,
  })
  if (res.canceled || !res.assets?.length) return null
  return res.assets.map((a) => ({
    type: 'document',
    localUri: a.uri,
    mime: a.mimeType || 'application/octet-stream',
    fileName: a.name,
    fileSize: formatBytes(a.size),
    size: a.size,
    isUploading: true,
    uploadProgress: 0,
  }))
}

// ─── Audio — LOCAL only ───────────────────────────────────────────────────────
export const pickAudio = async () => {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    copyToCacheDirectory: true,
  })
  if (res.canceled || !res.assets?.[0]) return null
  const a = res.assets[0]
  return [{
    type: 'audio',
    localUri: a.uri,
    mime: a.mimeType || 'audio/mpeg',
    fileName: a.name,
    fileSize: formatBytes(a.size),
    size: a.size,
    isUploading: true,
    uploadProgress: 0,
  }]
}

// ─── Voice — uploads immediately ─────────────────────────────────────────────
export const uploadVoice = async ({ uri, duration, mime = 'audio/m4a', onProgress }) => {
  const up = await uploadToCloudinary({
    uri,
    type: 'voice',
    mime,
    name: `voice_${Date.now()}.m4a`,
    onProgress,
  })
  return {
    type: 'voice',
    url: up.url,
    public_id: up.public_id,
    mime,
    duration: Math.round(duration || up.duration || 0),
    size: up.bytes,
    isUploading: false,
    uploadProgress: 100,
  }
}

// ─── Location ─────────────────────────────────────────────────────────────────
export const shareCurrentLocation = async () => {
  const perm = await Location.requestForegroundPermissionsAsync()
  if (perm.status !== 'granted') {
    Alert.alert('Permission required', 'Allow location access')
    return null
  }
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  const { latitude, longitude } = loc.coords
  let address = ''
  try {
    const r = await Location.reverseGeocodeAsync({ latitude, longitude })
    if (r?.[0]) {
      const x = r[0]
      address = [x.name, x.street, x.city, x.region, x.country].filter(Boolean).join(', ')
    }
  } catch (_) {}
  return {
    type: 'location',
    lat: latitude,
    lng: longitude,
    address,
    name: address?.split(',')[0] || 'My location',
  }
}

// ─── Contact ──────────────────────────────────────────────────────────────────
export const pickContact = async () => {
  if (Platform.OS === 'web') {
    Alert.alert('Not supported', 'Contact picker not available on web')
    return null
  }
  const perm = await Contacts.requestPermissionsAsync()
  if (perm.status !== 'granted') {
    Alert.alert('Permission required', 'Allow contacts access')
    return null
  }
  try {
    if (Contacts.presentContactPickerAsync) {
      const c = await Contacts.presentContactPickerAsync()
      if (!c) return null
      return mapContact(c)
    }
  } catch (_) {}
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
    pageSize: 1,
  })
  if (!data?.[0]) return null
  return mapContact(data[0])
}

const mapContact = (c) => ({
  type: 'contact',
  contactName: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
  contactPhone: c.phoneNumbers?.[0]?.number || '',
  contactEmail: c.emails?.[0]?.email || '',
})