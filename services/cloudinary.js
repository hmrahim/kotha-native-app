import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system'
import { Video } from 'react-native-compressor'

const CLOUD_NAME    = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET

// ─── Compress Image locally ───────────────────────────────────────────────────
const compressImage = async (uri) => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      {
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    )
    return result.uri
  } catch (_) {
    return uri
  }
}

// ─── Compress Video locally (WhatsApp style) ──────────────────────────────────
const compressVideo = async (uri, onProgress) => {
  try {
    // ফাইল size আগে check করো
    const fileInfo = await FileSystem.getInfoAsync(uri)
    const fileSizeMB = fileInfo.size / (1024 * 1024)

    // 5MB এর নিচে হলে compress করার দরকার নেই
    if (fileSizeMB < 5) {
      if (typeof onProgress === 'function') onProgress(50)
      return uri
    }

    const result = await Video.compress(
      uri,
      {
        compressionMethod: 'auto',
        maxSize: 1280,
        bitrate: 800000,
      },
      (progress) => {
        if (typeof onProgress === 'function') {
          onProgress(Math.round(progress * 50))
        }
      }
    )

    // compress এর পরে size বেড়ে গেলে original পাঠাও
    const compressedInfo = await FileSystem.getInfoAsync(result)
    if (compressedInfo.size >= fileInfo.size) {
      return uri
    }

    return result
  } catch (_) {
    return uri
  }
}

// ─── Resource type for Cloudinary ────────────────────────────────────────────
const resourceFor = (type) => {
  if (type === 'image') return 'image'
  if (type === 'video') return 'video'
  if (type === 'audio' || type === 'voice') return 'video'
  return 'raw'
}

// ─── Main Upload Function ─────────────────────────────────────────────────────
export const uploadToCloudinary = async ({
  uri,
  type = 'image',
  name,
  mime,
  onProgress,
}) => {
  if (!uri) throw new Error('No file URI')

  let finalUri = uri

  // Image compress
  if (type === 'image') {
    if (typeof onProgress === 'function') onProgress(0)
    finalUri = await compressImage(uri)
  }

  // Video compress
  if (type === 'video') {
    if (typeof onProgress === 'function') onProgress(0)
    finalUri = await compressVideo(uri, onProgress)
  }

  const resourceType = resourceFor(type)
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`

  const form = new FormData()
  form.append('file', {
    uri: finalUri,
    name: name || `upload_${Date.now()}`,
    type: mime || 'application/octet-stream',
  })
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', `chat_app/${type}`)

  // ── resource_type explicitly set করতে হয় Cloudinary এর জন্য ────────────────
  if (type === 'video') {
    form.append('resource_type', 'video')
  }
  if (type === 'document' || type === 'audio') {
    form.append('resource_type', 'raw')
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        // video হলে compression শেষে 50 থেকে শুরু, image হলে 0 থেকে
        const base = type === 'video' ? 50 : 0
        const pct  = base + Math.round((e.loaded / e.total) * (100 - base))
        onProgress(pct)
      }
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) {
          resolve({
            url: data.secure_url,
            public_id: data.public_id,
            resource_type: data.resource_type,
            width: data.width,
            height: data.height,
            duration: data.duration,       // video duration (seconds)
            bytes: data.bytes,
            format: data.format,
          })
        } else {
          reject(new Error(data?.error?.message || `Upload failed (${xhr.status})`))
        }
      } catch (err) {
        reject(err)
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.timeout = 5 * 60 * 1000   // 5 মিনিট timeout — বড় video এর জন্য
    xhr.send(form)
  })
}

// ─── Format bytes helper ──────────────────────────────────────────────────────
export const formatBytes = (b) => {
  if (!b && b !== 0) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}