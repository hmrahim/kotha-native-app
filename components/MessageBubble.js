import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback,
  Image, StyleSheet, Linking, Alert, Platform, Animated,
  Dimensions, Modal, StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { T } from '../theme'
import ImageViewer from './ImageViewer'
import LocationPreview from './LocationPreview'

const { width: SW, height: SH } = Dimensions.get('window')

const BUBBLE_MAX = SW * 0.75
const IMG_W      = SW * 0.62
const GRID_W     = IMG_W
const GAP        = 2

// (bubble colors passed as props from MessageBubble export)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const r = Math.floor(sec % 60)
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

// ─── FIX #4: Download & open file (Android Intent + iOS Sharing) ──────────────
// ─── FIX #4: Download & open file (Android Intent + iOS Sharing) ──────────────
async function openFileExternally(url, fileName, mime) {
  try {
    const ext = fileName?.split('.').pop()?.toLowerCase() || 'bin'
    const dest = FileSystem.cacheDirectory + (fileName || `file_${Date.now()}.${ext}`)

    Alert.alert('Downloading…', 'File is being downloaded')
    const { uri } = await FileSystem.downloadAsync(url, dest)

    if (Platform.OS === 'android') {
      // Android 10+ — Download folder এ save করো, DCIM নয়
      try {
        const { StorageAccessFramework } = FileSystem

        const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(
          FileSystem.documentDirectory
        )

        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          })
          const newUri = await StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            fileName || `file_${Date.now()}.${ext}`,
            mime || 'application/octet-stream'
          )
          await FileSystem.writeAsStringAsync(newUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          })
          Alert.alert('Saved!', 'File saved to selected folder')
        } else {
          // Permission না দিলে share করো
          const Sharing = await import('expo-sharing')
          await Sharing.shareAsync(uri, { mimeType: mime || 'application/octet-stream' })
        }
      } catch (_) {
        // Fallback — share করো
        try {
          const Sharing = await import('expo-sharing')
          await Sharing.shareAsync(uri, { mimeType: mime || 'application/octet-stream' })
        } catch {
          Alert.alert('Saved!', 'File saved to cache')
        }
      }
    } else {
      // iOS — share sheet
      try {
        const Sharing = await import('expo-sharing')
        const available = await Sharing.isAvailableAsync()
        if (available) await Sharing.shareAsync(uri)
        else Alert.alert('Saved!', 'File saved')
      } catch (_) {
        Alert.alert('Saved!', 'File saved')
      }
    }
  } catch (e) {
    Alert.alert('Failed', e?.message || 'Could not download file')
  }
}

async function saveImageToGallery(url) {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow media access to save images')
      return
    }
    const dest = FileSystem.cacheDirectory + `img_${Date.now()}.jpg`
    const { uri } = await FileSystem.downloadAsync(url, dest)

    // ✅ createAssetAsync ব্যবহার করো — saveToLibraryAsync Android 10+ এ fail করে
    await MediaLibrary.createAssetAsync(uri)
    Alert.alert('Saved!', 'Image saved to your gallery')
  } catch (e) {
    Alert.alert('Save failed', e?.message || 'Could not save image')
  }
}

// ─── Upload Overlay ───────────────────────────────────────────────────────────
function UploadOverlay({ progress = 0 }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.75] })
  return (
    <View style={ov.overlay}>
      <Animated.View style={[ov.dimmer, { opacity }]} />
      <View style={ov.center}>
        <View style={ov.progressCircle}>
          <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
          <Text style={ov.progressText}>{progress}%</Text>
        </View>
        <View style={ov.barBg}>
          <View style={[ov.barFill, { width: `${progress}%` }]} />
        </View>
      </View>
    </View>
  )
}

// ─── FIX #4: Download Overlay (WhatsApp style for received media) ─────────────
function DownloadOverlay({ onDownload, downloading, progress = 0 }) {
  return (
    <TouchableOpacity style={dov.overlay} onPress={onDownload} activeOpacity={0.85}>
      <View style={dov.circle}>
        {downloading ? (
          <>
            <Ionicons name="arrow-down" size={20} color="#fff" />
            <Text style={dov.pct}>{progress}%</Text>
          </>
        ) : (
          <Ionicons name="arrow-down-outline" size={24} color="#fff" />
        )}
      </View>
    </TouchableOpacity>
  )
}

function DocUploadSkeleton({ fileName, progress = 0 }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] })
  return (
    <View style={sk.docWrap}>
      <Animated.View style={[sk.docIconSk, { opacity }]}>
        <Ionicons name="document-text" size={26} color={T.accent} />
      </Animated.View>
      <View style={sk.docInfo}>
        <Text style={sk.docName} numberOfLines={1}>{fileName || 'Uploading…'}</Text>
        <View style={sk.barBg}>
          <View style={[sk.barFill, { width: `${progress}%` }]} />
        </View>
        <Text style={sk.pct}>{progress}%</Text>
      </View>
      <Ionicons name="time-outline" size={18} color={T.textMuted} />
    </View>
  )
}

// ─── FIX #1: Ticks — single source of truth, no duplicate in spacer ──────────
function Ticks({ status, seen }) {
  const resolved = status ?? (seen ? 'seen' : 'sent')
  if (resolved === 'seen')      return <Ionicons name="checkmark-done" size={14} color={T.accent}    style={s.tick} />
  if (resolved === 'delivered') return <Ionicons name="checkmark-done" size={14} color={T.textMuted} style={s.tick} />
  return <Ionicons name="checkmark" size={14} color={T.textMuted} style={s.tick} />
}

function MetaFloat({ time, isMe, status, seen, isEdited }) {
  return (
    <View style={s.metaFloat}>
      {isEdited && <Text style={s.editedFloatLabel}>edited</Text>}
      <Text style={s.timeFloatText}>{time}</Text>
      {isMe && <Ticks status={status} seen={seen} />}
    </View>
  )
}

function Meta({ time, isMe, status, seen, light, isEdited }) {
  return (
    <View style={s.metaRow}>
      {isEdited && <Text style={s.editedLabel}>edited</Text>}
      <Text style={[s.timeText, light && { color: 'rgba(255,255,255,0.85)' }]}>{time}</Text>
      {isMe && <Ticks status={status} seen={seen} />}
    </View>
  )
}

// ─── Full Screen Video Player ─────────────────────────────────────────────────
function VideoPlayer({ visible, url, onClose }) {
  const insets = useSafeAreaInsets()
  const player = useVideoPlayer(url || '')
  const [showControls, setShowControls] = useState(true)
  const [isPlaying, setIsPlaying]       = useState(false)
  const [position, setPosition]         = useState(0)
  const [duration, setDuration]         = useState(0)
  const controlTimer                    = useRef(null)
  const ctrlAnim                        = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!player) return
    player.loop = false
    const sub1 = player.addListener('playingChange', (e) => {
      setIsPlaying(e.isPlaying)
      if (e.isPlaying) startHideTimer()
      else showCtrl()
    })
    const sub2 = player.addListener('timeUpdate', (e) => {
      setPosition(e.currentTime ?? 0)
    })
    const sub3 = player.addListener('statusChange', (e) => {
      if (e.status === 'readyToPlay') setDuration(player.duration ?? 0)
    })
    return () => { sub1?.remove?.(); sub2?.remove?.(); sub3?.remove?.() }
  }, [player])

  useEffect(() => {
    if (visible && player) { player.play(); startHideTimer() }
    else if (!visible && player) { player.pause(); player.seekBy(-player.currentTime) }
    return () => clearTimeout(controlTimer.current)
  }, [visible])

  useEffect(() => {
    return () => { try { player?.release?.() } catch (_) {} }
  }, [])

  const showCtrl = () => {
    clearTimeout(controlTimer.current)
    Animated.timing(ctrlAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    setShowControls(true)
  }
  const startHideTimer = () => {
    clearTimeout(controlTimer.current)
    controlTimer.current = setTimeout(() => {
      Animated.timing(ctrlAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
      setShowControls(false)
    }, 3000)
  }
  const toggleCtrl = () => {
    if (showControls) {
      Animated.timing(ctrlAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start()
      setShowControls(false)
      clearTimeout(controlTimer.current)
    } else { showCtrl(); startHideTimer() }
  }
  const togglePlay = () => {
    if (isPlaying) { player.pause(); showCtrl() }
    else { player.play(); startHideTimer() }
  }
  const seek = (val) => { player.seekTo(val); setPosition(val); startHideTimer() }

  const progress = duration > 0 ? position / duration : 0
  const barWidth = SW - 32
  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <StatusBar hidden />
      <View style={vp.root}>
        <TouchableOpacity activeOpacity={1} onPress={toggleCtrl} style={vp.videoWrap}>
          <VideoView
            player={player}
            style={vp.video}
            contentFit="contain"
            nativeControls={false}
            allowsFullscreen={false}
          />
        </TouchableOpacity>

        <Animated.View style={[vp.controls, { opacity: ctrlAnim }]} pointerEvents={showControls ? 'box-none' : 'none'}>
          <View style={[vp.topBar, { paddingTop: insets.top + (Platform.OS === 'android' ? 28 : 8) }]}>
            <TouchableOpacity onPress={onClose} style={vp.iconBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openFileExternally(url, `video_${Date.now()}.mp4`, 'video/mp4')}
              style={vp.iconBtn}
              hitSlop={12}
            >
              <Ionicons name="download-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={togglePlay} style={vp.centerBtn} activeOpacity={0.8}>
            <View style={vp.centerCircle}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={[vp.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={vp.timeTxt}>{fmtTime(position)}</Text>
            <TouchableOpacity
              style={[vp.seekTrack, { width: barWidth }]}
              activeOpacity={1}
              onPress={(e) => {
                const ratio = e.nativeEvent.locationX / barWidth
                seek(ratio * duration)
              }}
            >
              <View style={vp.seekBg} />
              <View style={[vp.seekFill, { width: `${progress * 100}%` }]} />
              <View style={[vp.seekThumb, { left: progress * barWidth - 7 }]} />
            </TouchableOpacity>
            <Text style={vp.timeTxt}>{fmtTime(duration)}</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── FIX #1: TextMsg — spacer has no tick, tick only in Meta ─────────────────
function TextMsg({ message, bubbleMe = {}, bubbleThem = {} }) {
  const { text, isMe, time, seen, status, isEdited } = message
  return (
    <View style={[s.bubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
      <Text style={[s.msgText, isMe && s.msgTextMe]}>
        {text}
        {'  '}
        <Text style={s.metaSpacer}>
          {isEdited ? 'edited  ' : ''}{time}{isMe ? '    ' : '  '}
        </Text>
      </Text>
      <View style={s.metaRow}>
        {isEdited && <Text style={s.editedLabel}>edited</Text>}
        <Text style={s.timeText}>{time}</Text>
        {isMe && <Ticks status={status} seen={seen} />}
      </View>
    </View>
  )
}

// ─── FIX #7: Dynamic aspect ratio helper ─────────────────────────────────────
function getDisplayDimensions(width, height) {
  if (!width || !height) return { w: IMG_W, h: IMG_W * 0.75 }
  const ratio = height / width
  const clampedRatio = Math.min(Math.max(ratio, 0.5), 1.5)
  return { w: IMG_W, h: IMG_W * clampedRatio }
}

// ─── FIX #2 + #4 + #7 + #10: ImageMsg ───────────────────────────────────────
function ImageMsg({ message, media, onLongPress, bubbleMe = {}, bubbleThem = {} }) {
  const { isMe, time, seen, status, text, isEdited } = message
  const [open, setOpen]               = useState(false)
  const [localUri, setLocalUri]       = useState(media.localUri || null)
  const [downloading, setDownloading] = useState(false)
  const [dlProgress, setDlProgress]   = useState(0)

  const isUploading   = media.isUploading
  const hasCaption    = !!text
  const isReceived    = !isMe
  const displayUri    = localUri || media.url

  // FIX #2: Auto-download received images to cache on mount
  useEffect(() => {
    if (!isReceived || localUri || isUploading || !media.url) return
    let cancelled = false
    const fileName = media.url.split('/').pop()?.split('?')[0] || `img_${Date.now()}`
    const dest = FileSystem.cacheDirectory + fileName
    FileSystem.getInfoAsync(dest).then(({ exists }) => {
      if (exists) { if (!cancelled) setLocalUri(dest); return }
      setDownloading(true)
      const dl = FileSystem.createDownloadResumable(media.url, dest, {}, (dp) => {
        if (!cancelled && dp.totalBytesExpectedToWrite > 0) {
          setDlProgress(Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100))
        }
      })
      dl.downloadAsync()
        .then(({ uri }) => { if (!cancelled) { setLocalUri(uri); setDownloading(false) } })
        .catch(() => { if (!cancelled) setDownloading(false) })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [media.url, isReceived])

  // FIX #7: real aspect ratio
  const { w, h } = getDisplayDimensions(media.width, media.height)

  const manualDownload = () => {
    if (downloading) return
    setDownloading(true)
    const dest = FileSystem.cacheDirectory + `img_${Date.now()}`
    FileSystem.createDownloadResumable(media.url, dest, {}, (dp) => {
      if (dp.totalBytesExpectedToWrite > 0)
        setDlProgress(Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100))
    }).downloadAsync()
      .then(({ uri }) => { setLocalUri(uri); setDownloading(false) })
      .catch(() => setDownloading(false))
  }

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => !isUploading && displayUri && setOpen(true)}
      onLongPress={() => onLongPress?.(message)}   // FIX #10
      delayLongPress={350}
    >
      <View style={[s.mediaBubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
        <View style={[s.imgWrap, { width: w, height: h }]}>
          {displayUri ? (
            <Image source={{ uri: displayUri }} style={{ width: w, height: h }} resizeMode="cover" />
          ) : (
            <View style={[{ width: w, height: h }, s.imgPlaceholder]}>
              <Ionicons name="image-outline" size={36} color={T.textMuted} />
            </View>
          )}
          {isUploading && <UploadOverlay progress={media.uploadProgress || 0} />}
          {isReceived && !localUri && !isUploading && (
            <DownloadOverlay downloading={downloading} progress={dlProgress} onDownload={manualDownload} />
          )}
          {!hasCaption && !isUploading && !!displayUri && (
            <MetaFloat time={time} isMe={isMe} status={status} seen={seen} isEdited={isEdited} />
          )}
        </View>
        {hasCaption && (
          <View style={s.captionWrap}>
            <Text style={[s.msgText, isMe && s.msgTextMe]}>{text}</Text>
            <Meta time={time} isMe={isMe} status={status} seen={seen} isEdited={isEdited} />
          </View>
        )}
        <ImageViewer
          visible={open}
          uris={[media.url]}
          initialIndex={0}
          onClose={() => setOpen(false)}
          onSave={(u) => saveImageToGallery(u)}
        />
      </View>
    </TouchableOpacity>
  )
}

// ─── FIX #2 + #4 + #7 + #10: VideoMsg ───────────────────────────────────────
function VideoMsg({ message, media, onLongPress, bubbleMe = {}, bubbleThem = {} }) {
  const { isMe, time, seen, status, text, isEdited } = message
  const [playerOpen, setPlayerOpen]   = useState(false)
  const [localUri, setLocalUri]       = useState(media.localUri || null)
  const [downloading, setDownloading] = useState(false)
  const [dlProgress, setDlProgress]   = useState(0)

  const isUploading = media.isUploading
  const hasCaption  = !!text
  const isReceived  = !isMe

  // FIX #7: real aspect ratio
  const { w, h } = getDisplayDimensions(media.width, media.height)

  const doDownloadAndPlay = () => {
    if (downloading) return
    if (localUri) { setPlayerOpen(true); return }
    setDownloading(true)
    const fileName = media.url.split('/').pop()?.split('?')[0] || `vid_${Date.now()}.mp4`
    const dest = FileSystem.cacheDirectory + fileName
    FileSystem.getInfoAsync(dest).then(({ exists }) => {
      if (exists) { setLocalUri(dest); setDownloading(false); setPlayerOpen(true); return }
      FileSystem.createDownloadResumable(media.url, dest, {}, (dp) => {
        if (dp.totalBytesExpectedToWrite > 0)
          setDlProgress(Math.round((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100))
      }).downloadAsync()
        .then(({ uri }) => { setLocalUri(uri); setDownloading(false); setPlayerOpen(true) })
        .catch(() => setDownloading(false))
    }).catch(() => setDownloading(false))
  }

  const handlePress = () => {
    if (isUploading) return
    if (isReceived && !localUri) { doDownloadAndPlay(); return }
    setPlayerOpen(true)
  }

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={handlePress}
      onLongPress={() => onLongPress?.(message)}   // FIX #10
      delayLongPress={350}
    >
      <View style={[s.mediaBubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
        <View style={[s.imgWrap, { width: w, height: h }]}>
          {(localUri || media.url) ? (
            <Image source={{ uri: localUri || media.url }} style={{ width: w, height: h }} resizeMode="cover" />
          ) : (
            <View style={[{ width: w, height: h }, s.imgPlaceholder]}>
              <Ionicons name="videocam-outline" size={36} color={T.textMuted} />
            </View>
          )}

          {!isUploading && !downloading && (
            <View style={s.videoPlayOverlay}>
              <View style={s.playCircle}>
                <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
              </View>
              {!!media.duration && (
                <Text style={s.videoDuration}>{fmtTime(media.duration)}</Text>
              )}
            </View>
          )}

          {/* FIX #4: download overlay for received videos */}
          {isReceived && !localUri && !isUploading && (
            <DownloadOverlay downloading={downloading} progress={dlProgress} onDownload={doDownloadAndPlay} />
          )}

          {isUploading && <UploadOverlay progress={media.uploadProgress || 0} />}
          {!hasCaption && !isUploading && (
            <MetaFloat time={time} isMe={isMe} status={status} seen={seen} isEdited={isEdited} />
          )}
        </View>

        {hasCaption && (
          <View style={s.captionWrap}>
            <Text style={[s.msgText, isMe && s.msgTextMe]}>{text}</Text>
            <Meta time={time} isMe={isMe} status={status} seen={seen} isEdited={isEdited} />
          </View>
        )}

        <VideoPlayer
          visible={playerOpen}
          url={localUri || media.url}
          onClose={() => setPlayerOpen(false)}
        />
      </View>
    </TouchableOpacity>
  )
}

// ─── FIX #10: MediaGrid — long press ─────────────────────────────────────────
function MediaGrid({ message, media, onLongPress, bubbleMe = {}, bubbleThem = {} }) {
  const { isMe, time, seen, status, isEdited } = message
  const [openIdx, setOpenIdx] = useState(null)
  const count   = media.length
  const show    = media.slice(0, 4)
  const extra   = count > 4 ? count - 4 : 0
  const half    = (GRID_W - GAP) / 2
  const allUris = media.map((m) => m.url || m.localUri).filter(Boolean)

  const renderGrid = () => {
    if (count === 1) {
      return <GridItem m={show[0]} w={GRID_W} h={GRID_W * 0.75} extra={0} onPress={() => setOpenIdx(0)} />
    }
    if (count === 2) {
      return (
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {show.map((m, i) => (
            <GridItem key={i} m={m} w={half} h={half} extra={0} onPress={() => setOpenIdx(i)} />
          ))}
        </View>
      )
    }
    if (count === 3) {
      return (
        <View style={{ flexDirection: 'row', gap: GAP }}>
          <GridItem m={show[0]} w={half} h={GRID_W * 0.75} extra={0} onPress={() => setOpenIdx(0)} />
          <View style={{ flexDirection: 'column', gap: GAP }}>
            <GridItem m={show[1]} w={half} h={(GRID_W * 0.75 - GAP) / 2} extra={0} onPress={() => setOpenIdx(1)} />
            <GridItem m={show[2]} w={half} h={(GRID_W * 0.75 - GAP) / 2} extra={0} onPress={() => setOpenIdx(2)} />
          </View>
        </View>
      )
    }
    return (
      <View style={{ gap: GAP }}>
        <View style={{ flexDirection: 'row', gap: GAP }}>
          <GridItem m={show[0]} w={half} h={half} extra={0} onPress={() => setOpenIdx(0)} />
          <GridItem m={show[1]} w={half} h={half} extra={0} onPress={() => setOpenIdx(1)} />
        </View>
        <View style={{ flexDirection: 'row', gap: GAP }}>
          <GridItem m={show[2]} w={half} h={half} extra={0} onPress={() => setOpenIdx(2)} />
          <GridItem m={show[3]} w={half} h={half} extra={extra} onPress={() => setOpenIdx(3)} />
        </View>
      </View>
    )
  }

  return (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={() => onLongPress?.(message)}
      delayLongPress={350}
    >
      <View style={[s.mediaBubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
        <View style={{ borderRadius: 12, overflow: 'hidden', width: GRID_W }}>
          {renderGrid()}
          <MetaFloat time={time} isMe={isMe} status={status} seen={seen} isEdited={isEdited} />
        </View>
        <ImageViewer
          visible={openIdx !== null}
          uris={allUris}
          initialIndex={openIdx ?? 0}
          onClose={() => setOpenIdx(null)}
          onSave={(u) => saveImageToGallery(u)}
        />
      </View>
    </TouchableOpacity>
  )
}

function GridItem({ m, w, h, extra, onPress }) {
  const uri = m.localUri || m.url
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => !m.isUploading && onPress()}
      style={{ width: w, height: h }}
    >
      <Image source={{ uri }} style={{ width: w, height: h }} resizeMode="cover" />
      {m.type === 'video' && !m.isUploading && (
        <View style={s.gridVideoPlay}>
          <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.92)" />
        </View>
      )}
      {m.isUploading && <UploadOverlay progress={m.uploadProgress || 0} />}
      {extra > 0 && (
        <View style={s.moreOverlay}>
          <Text style={s.moreTxt}>+{extra}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

// ─── Audio ────────────────────────────────────────────────────────────────────
function AudioMsg({ message, media, bubbleMe = {}, bubbleThem = {} }) {
  const { isMe, time, seen, status } = message
  const player   = useAudioPlayer({ uri: media.url })
  const st       = useAudioPlayerStatus(player)
  const playing  = st?.playing
  const dur      = (st?.duration && st.duration > 0) ? st.duration : (media.duration || 0)
  const pos      = st?.currentTime || 0
  const progress = dur > 0 ? Math.min(pos / dur, 1) : 0
  useEffect(() => () => { try { player.remove() } catch (_) {} }, [])
  const toggle = () => {
    if (playing) player.pause()
    else { if ((st?.currentTime || 0) >= (st?.duration || 0)) player.seekTo(0); player.play() }
  }
  return (
    <View style={[s.bubble, s.audioBubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
      <TouchableOpacity onPress={toggle} style={s.playBtn}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={T.accent} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={s.waveform}>
          {Array.from({ length: 26 }).map((_, i) => {
            const h = 6 + Math.abs(Math.sin(i * 1.3) * 12) + (i % 3)
            const filled = i / 26 < progress
            return (
              <View
                key={i}
                style={[s.waveBar, { height: h, backgroundColor: filled ? T.accent : 'rgba(125,133,144,0.5)' }]}
              />
            )
          })}
        </View>
        <View style={s.audioFoot}>
          <Text style={s.durationText}>
            {media.type === 'voice' ? '🎙 ' : '🎵 '}
            {fmtTime(playing || pos > 0 ? pos : dur)}
          </Text>
          {isMe && <Ticks status={status} seen={seen} />}
          <Text style={s.timeText}>{time}</Text>
        </View>
      </View>
    </View>
  )
}

// ─── FIX #10: DocumentMsg — long press ───────────────────────────────────────
function DocumentMsg({ message, media, onLongPress, bubbleMe = {}, bubbleThem = {} }) {
  const { isMe, time, seen, status } = message
  const isUploading = media.isUploading

  if (isUploading) {
    return (
      <View style={[s.bubble, s.docBubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
        <DocUploadSkeleton fileName={media.fileName} progress={media.uploadProgress || 0} />
        <Meta time={time} isMe={isMe} status={status} seen={seen} />
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={[s.bubble, s.docBubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}
      activeOpacity={0.85}
      onPress={() => openFileExternally(media.url, media.fileName, media.mime)}
      onLongPress={() => onLongPress?.(message)}
      delayLongPress={350}
    >
      <View style={s.docRow}>
        <View style={s.docIconWrap}>
          <Ionicons name="document-text" size={26} color={T.accent} />
        </View>
        <View style={s.docInfo}>
          <Text style={s.docName} numberOfLines={2}>{media.fileName || 'Document'}</Text>
          {!!media.fileSize && <Text style={s.docSize}>{media.fileSize}</Text>}
        </View>
        <View style={s.downloadBtn}>
          <Ionicons name="cloud-download-outline" size={22} color={T.accent} />
        </View>
      </View>
      <Meta time={time} isMe={isMe} status={status} seen={seen} />
    </TouchableOpacity>
  )
}

// ─── Location ─────────────────────────────────────────────────────────────────
function LocationMsg({ message, media, bubbleMe = {}, bubbleThem = {} }) {
  const { isMe, time, seen, status } = message
  return (
    <View style={[s.bubble, { padding: 4 }, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
      <LocationPreview lat={media.lat} lng={media.lng} address={media.address} name={media.name} />
      <Meta time={time} isMe={isMe} status={status} seen={seen} />
    </View>
  )
}

// ─── Contact ──────────────────────────────────────────────────────────────────
function ContactMsg({ message, media, bubbleMe = {}, bubbleThem = {} }) {
  const { isMe, time, seen, status } = message
  const initials = (media.contactName || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <View style={[s.bubble, s.contactBubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem]]}>
      <View style={s.contactRow}>
        <View style={s.avatar}><Text style={s.avatarTxt}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.docName} numberOfLines={1}>{media.contactName || 'Contact'}</Text>
          {!!media.contactPhone && <Text style={s.docSize}>{media.contactPhone}</Text>}
          {!!media.contactEmail && <Text style={s.docSize}>{media.contactEmail}</Text>}
        </View>
      </View>
      <View style={s.contactActions}>
        <TouchableOpacity
          onPress={() => media.contactPhone && Linking.openURL(`tel:${media.contactPhone}`)}
          style={s.contactBtn}
        >
          <Ionicons name="call" size={16} color={T.accent} />
          <Text style={s.contactBtnTxt}>Call</Text>
        </TouchableOpacity>
      </View>
      <Meta time={time} isMe={isMe} status={status} seen={seen} />
    </View>
  )
}

// ─── Reply Preview ────────────────────────────────────────────────────────────
function ReplyPreview({ reply }) {
  if (!reply) return null
  return (
    <View style={s.replyBox}>
      <View style={s.replyBar} />
      <View style={s.replyContent}>
        <Text style={s.replyName}>{reply.name || 'Reply'}</Text>
        <Text style={s.replyText} numberOfLines={1}>
          {reply.text || (reply.media?.[0]?.type ?? '')}
        </Text>
      </View>
    </View>
  )
}

// ─── FIX #10: Main Export — onLongPress passed to all media components ────────
export default function MessageBubble({ message, onLongPress, bubbleColors }) {
  const { isMe, reply, media = [], isDeleted } = message

  // Dynamic bubble style override
  const bubbleMe   = bubbleColors ? { backgroundColor: bubbleColors.me }   : {}
  const bubbleThem = bubbleColors ? { backgroundColor: bubbleColors.them } : {}

  if (isDeleted) {
    return (
      <View style={[s.row, isMe ? s.rowMe : s.rowThem]}>
        <View style={[s.bubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem], s.deletedBubble]}>
          <Text style={s.deletedText}>🚫 This message was deleted</Text>
          <Meta time={message.time} isMe={isMe} status={message.status} seen={message.seen} />
        </View>
      </View>
    )
  }

  const renderContent = () => {
    if (media.length > 1) return <MediaGrid message={message} media={media} onLongPress={onLongPress} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />

    const first = media?.[0]
    if (first) {
      switch (first.type) {
        case 'image':    return <ImageMsg    message={message} media={first} onLongPress={onLongPress} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />
        case 'video':    return <VideoMsg    message={message} media={first} onLongPress={onLongPress} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />
        case 'audio':
        case 'voice':    return <AudioMsg    message={message} media={first} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />
        case 'document': return <DocumentMsg message={message} media={first} onLongPress={onLongPress} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />
        case 'location': return <LocationMsg message={message} media={first} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />
        case 'contact':  return <ContactMsg  message={message} media={first} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />
        default: break
      }
    }

    if (reply) {
      return (
        <View style={[s.bubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem], { padding: 6 }]}>
          <ReplyPreview reply={reply} />
          <TextMsg message={message} />
        </View>
      )
    }

    return <TextMsg message={message} bubbleMe={bubbleMe} bubbleThem={bubbleThem} />
  }

  const hasReplyWithMedia = reply && media.length > 0

  return (
    <View style={[s.row, isMe ? s.rowMe : s.rowThem]}>
      <TouchableWithoutFeedback
        onLongPress={() => { if (!media.length) onLongPress?.(message) }}
        delayLongPress={350}
      >
        <View style={{ maxWidth: BUBBLE_MAX }}>
          {hasReplyWithMedia ? (
            <View style={[s.bubble, isMe ? [s.bubbleMe, bubbleMe] : [s.bubbleThem, bubbleThem], { padding: 6 }]}>
              <ReplyPreview reply={reply} />
              {renderContent()}
            </View>
          ) : renderContent()}
        </View>
      </TouchableWithoutFeedback>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  row: {
    marginBottom: 2,
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  rowMe:   { justifyContent: 'flex-end' },
  rowThem: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: BUBBLE_MAX,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 0,
  },
  bubbleMe: {
    backgroundColor: T.bubbleMe ?? '#005C4B',
    borderBottomRightRadius: 2,
    alignSelf: 'flex-end',
  },
  bubbleThem: {
    backgroundColor: T.bubbleThem ?? '#1F2C34',
    borderBottomLeftRadius: 2,
    alignSelf: 'flex-start',
  },

  mediaBubble: {
    borderRadius: 8,
    overflow: 'hidden',
    borderBottomRightRadius: 2,
  },

  imgWrap: { position: 'relative', overflow: 'hidden' },
  imgPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionWrap: { paddingHorizontal: 9, paddingTop: 5, paddingBottom: 4 },

  metaFloat: {
    position: 'absolute',
    bottom: 6,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timeFloatText:    { color: '#fff', fontSize: 11 },
  editedFloatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontStyle: 'italic' },

  msgText: {
    color: T.textSecond ?? '#E9EDEF',
    fontSize: 14.5,
    lineHeight: 20,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  msgTextMe: { color: T.textPrimary ?? '#fff' },

  metaSpacer: { color: 'transparent', fontSize: 11 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 1,
    gap: 3,
    alignSelf: 'flex-end',
  },
  timeText:    { color: T.textMuted ?? '#8696A0', fontSize: 11 },
  editedLabel: { color: T.textMuted ?? '#8696A0', fontSize: 10, fontStyle: 'italic', marginRight: 2 },
  tick: { marginLeft: 1 },

  videoPlayOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoDuration: {
    position: 'absolute', bottom: 8, left: 8,
    color: '#fff', fontSize: 12, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6,
  },

  gridVideoPlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },

  moreOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreTxt: { color: '#fff', fontSize: 24, fontWeight: '700' },

  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
    minWidth: 220,
  },
  playBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(45,212,191,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 30 },
  waveBar:  { width: 3, borderRadius: 2 },
  audioFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  durationText: { color: T.textMuted ?? '#8696A0', fontSize: 11, flex: 1 },

  docBubble:   { minWidth: 230, maxWidth: BUBBLE_MAX },
  docRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  docIconWrap: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: T.accentDim ?? 'rgba(45,212,191,0.15)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  docInfo:     { flex: 1 },
  docName:     { color: T.textPrimary ?? '#E9EDEF', fontSize: 13, fontWeight: '600' },
  docSize:     { color: T.textMuted ?? '#8696A0', fontSize: 11, marginTop: 2 },
  downloadBtn: { padding: 4, flexShrink: 0 },

  contactBubble:  { minWidth: 220, maxWidth: BUBBLE_MAX },
  contactRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:         {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: T.accentDim ?? 'rgba(45,212,191,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt:      { color: T.accent, fontWeight: '800' },
  contactActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: T.border ?? 'rgba(255,255,255,0.08)',
    marginTop: 8, paddingTop: 6,
    justifyContent: 'center',
  },
  contactBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  contactBtnTxt: { color: T.accent, fontWeight: '600', fontSize: 12 },

  deletedBubble: { opacity: 0.75 },
  deletedText:   { color: T.textMuted ?? '#8696A0', fontStyle: 'italic', fontSize: 14 },

  replyBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 6,
    marginBottom: 5,
    overflow: 'hidden',
    minHeight: 38,
  },
  replyBar:     { width: 3, backgroundColor: T.accent },
  replyContent: { flex: 1, paddingHorizontal: 8, paddingVertical: 5 },
  replyName:    { color: T.accent, fontSize: 12, fontWeight: '700' },
  replyText:    { color: T.textSecond ?? '#E9EDEF', fontSize: 12, marginTop: 1 },
})

const vp = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  videoWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  video: { width: SW, height: SH },
  controls: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 8, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.5)',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  centerBtn: { position: 'absolute', top: '50%', left: '50%', marginTop: -36, marginLeft: -36 },
  centerCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
  },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    gap: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingTop: 12,
  },
  timeTxt: { color: '#fff', fontSize: 12, fontWeight: '500', minWidth: 36 },
  seekTrack: { flex: 1, height: 28, justifyContent: 'center', position: 'relative' },
  seekBg:    { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  seekFill:  { position: 'absolute', left: 0, height: 3, borderRadius: 2, backgroundColor: '#fff' },
  seekThumb: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', top: 7,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 4,
  },
})

const ov = StyleSheet.create({
  overlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dimmer:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0D1117' },
  center:   { alignItems: 'center', gap: 8, zIndex: 2 },
  progressCircle: { alignItems: 'center', gap: 2 },
  progressText:   { color: '#fff', fontSize: 12, fontWeight: '700' },
  barBg:    { width: 100, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  barFill:  { height: 4, backgroundColor: T.accent, borderRadius: 2 },
})

const dov = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  circle:  { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  pct:     { color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 2 },
})

const sk = StyleSheet.create({
  docWrap:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  docIconSk: { width: 44, height: 44, borderRadius: 10, backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center' },
  docInfo:   { flex: 1, gap: 4 },
  docName:   { color: T.textPrimary, fontSize: 13, fontWeight: '600' },
  barBg:     { height: 3, borderRadius: 2, backgroundColor: 'rgba(240,246,252,0.1)', overflow: 'hidden' },
  barFill:   { height: 3, backgroundColor: T.accent, borderRadius: 2 },
  pct:       { color: T.textMuted, fontSize: 10 },
})