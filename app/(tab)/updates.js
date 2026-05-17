// app/(tab)/updates.js  ─────  Facebook-style Story screen (full clone)
import { Ionicons } from '@expo/vector-icons'
import { Video } from 'expo-av'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import {
  createStory,
  deleteStory,
  getStories,
  replyToStory,
  viewStory,
} from '../../services/api'
import { uploadToCloudinary } from '../../services/cloudinary'
import { getSocket } from '../../services/socket'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// ── Theme ──────────────────────────────────────────────────────────────────────
const T = {
  bg:          '#0D1117',
  surface:     '#161B22',
  surfaceHigh: '#1C2333',
  border:      'rgba(240,246,252,0.06)',
  accent:      '#2DD4BF',
  accentDim:   'rgba(45,212,191,0.12)',
  amber:       '#F59E0B',
  textPrimary: '#F0F6FC',
  textSecond:  '#7D8590',
  textMuted:   '#484F58',
}

const STORY_DURATION = 15000   // 15 seconds per story item
const TEXT_BG_COLORS = ['#2DD4BF','#7C3AED','#DC2626','#059669','#D97706','#0EA5E9','#EC4899','#1F2937']

// ─── Avatar Ring ──────────────────────────────────────────────────────────────
function StoryRing({ hasUnseen, count = 1, size = 58, active = false }) {
  const color = active ? T.accent : hasUnseen ? T.accent : T.textMuted
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 2.5, borderColor: color,
      borderStyle: count > 1 ? 'dashed' : 'solid',
      alignItems: 'center', justifyContent: 'center',
      opacity: hasUnseen || active ? 1 : 0.45,
    }} />
  )
}

// ─── Story Thumbnail ──────────────────────────────────────────────────────────
function StoryThumb({ group, onPress, isMe, myPhoto }) {
  const avatar = isMe
    ? myPhoto
    : group?.user?.photo?.url || group?.user?.profileImage || null
  const name = isMe ? 'My Story' : group?.user?.name || ''
  const hasUnseen = !isMe && group?.hasUnseen

  return (
    <TouchableOpacity style={s.storyThumb} onPress={onPress} activeOpacity={0.75}>
      <View style={s.storyRingWrap}>
        <StoryRing hasUnseen={hasUnseen} count={group?.stories?.length || 0} />
        {avatar
          ? <Image source={{ uri: avatar }} style={s.storyAvatar} />
          : <View style={[s.storyAvatar, { backgroundColor: T.surfaceHigh, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={22} color={T.textSecond} />
            </View>
        }
        {isMe && (
          <View style={s.addBadge}>
            <Ionicons name="add" size={13} color={T.bg} />
          </View>
        )}
      </View>
      <Text style={s.storyName} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  )
}

// ─── Story Viewer (full screen) ───────────────────────────────────────────────
function StoryViewer({ visible, groups, startGroupIndex, myUserId, onClose, onDelete }) {
  const [groupIdx, setGroupIdx]   = useState(startGroupIndex || 0)
  const [storyIdx, setStoryIdx]   = useState(0)
  const [paused, setPaused]       = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending]     = useState(false)
  const [showViews, setShowViews] = useState(false)
  const progress = useRef(new Animated.Value(0)).current
  const timerRef = useRef(null)
  const videoRef = useRef(null)
  const insets   = useSafeAreaInsets()

  const group   = groups[groupIdx]
  const story   = group?.stories?.[storyIdx]
  const media   = story?.media?.[0]
  const isOwner = group?.user?._id?.toString() === myUserId

  // mark viewed
  useEffect(() => {
    if (story?._id && !isOwner) {
      viewStory(story._id).catch(() => {})
    }
  }, [story?._id])

  // progress bar
  const startProgress = useCallback((duration = STORY_DURATION) => {
    progress.setValue(0)
    clearTimeout(timerRef.current)
    Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) goNext()
    })
  }, [groupIdx, storyIdx])

  useEffect(() => {
    if (!visible || paused || !story) return
    if (media?.type === 'video') return // video controls its own timer
    startProgress()
    return () => {
      progress.stopAnimation()
      clearTimeout(timerRef.current)
    }
  }, [visible, groupIdx, storyIdx, paused])

  const goNext = () => {
    progress.stopAnimation()
    const group = groups[groupIdx]
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx(storyIdx + 1)
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(groupIdx + 1)
      setStoryIdx(0)
    } else {
      onClose()
    }
  }

  const goPrev = () => {
    progress.stopAnimation()
    if (storyIdx > 0) {
      setStoryIdx(storyIdx - 1)
    } else if (groupIdx > 0) {
      const prev = groupIdx - 1
      setGroupIdx(prev)
      setStoryIdx(groups[prev].stories.length - 1)
    }
  }

  const handleReply = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    try {
      await replyToStory(story._id, replyText.trim())
      setReplyText('')
      setPaused(false)
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const handleDelete = () => {
    Alert.alert('Delete Story', 'Delete this story?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteStory(story._id)
            onDelete?.()
            goNext()
          } catch (e) {
            Alert.alert('Error', e?.message)
          }
        },
      },
    ])
  }

  if (!visible || !group || !story) return null

  // progress segments
  const segments = group.stories.map((_, i) => {
    const isActive  = i === storyIdx
    const isDone    = i < storyIdx
    return (
      <View key={i} style={sv.segWrap}>
        <View style={[sv.segBg]} />
        <Animated.View
          style={[sv.segFill, {
            width: isDone ? '100%' : isActive ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%',
          }]}
        />
      </View>
    )
  })

  const renderMedia = () => {
    if (!media) return null
    if (media.type === 'image') {
      return <Image source={{ uri: media.url }} style={sv.mediaFull} resizeMode="contain" />
    }
    if (media.type === 'video') {
      return (
        <Video
          ref={videoRef}
          source={{ uri: media.url }}
          style={sv.mediaFull}
          resizeMode="contain"
          shouldPlay={!paused}
          isLooping={false}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.durationMillis && !paused) {
              const pct = status.positionMillis / status.durationMillis
              progress.setValue(pct)
              if (status.didJustFinish) goNext()
            }
          }}
        />
      )
    }
    if (media.type === 'text') {
      return (
        <View style={[sv.mediaFull, { backgroundColor: media.bgColor || T.accent, alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
          <Text style={{ color: media.textColor || '#fff', fontSize: media.fontSize || 26, fontWeight: '700', textAlign: 'center', lineHeight: 38 }}>
            {media.text}
          </Text>
        </View>
      )
    }
    return null
  }

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={[sv.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Media */}
        {renderMedia()}

        {/* Gradient overlay top */}
        <View style={sv.topGrad} pointerEvents="none" />
        {/* Gradient overlay bottom */}
        <View style={sv.bottomGrad} pointerEvents="none" />

        {/* Progress bars */}
        <View style={sv.progressRow}>{segments}</View>

        {/* Header */}
        <View style={sv.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Image
              source={{ uri: group.user?.photo?.url || group.user?.profileImage || 'https://i.pravatar.cc/150' }}
              style={sv.headerAvatar}
            />
            <View>
              <Text style={sv.headerName}>{group.user?.name}</Text>
              <Text style={sv.headerTime}>
                {story.createdAt ? new Date(story.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </Text>
            </View>
          </View>
          {isOwner && (
            <TouchableOpacity onPress={handleDelete} style={{ padding: 8 }}>
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Tap zones */}
        <View style={sv.tapZones} pointerEvents="box-none">
          <TouchableOpacity style={{ flex: 1 }} onPress={goPrev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} activeOpacity={1} />
          <TouchableOpacity style={{ flex: 1 }} onPress={goNext} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} activeOpacity={1} />
        </View>

        {/* Views indicator (for owner) or Reply box */}
        {isOwner ? (
          <TouchableOpacity style={sv.viewsBar} onPress={() => setShowViews(true)}>
            <Ionicons name="eye-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={sv.viewsText}>{story.views?.length || 0} views</Text>
          </TouchableOpacity>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={sv.replyWrap}>
            <View style={sv.replyBox}>
              <TextInput
                style={sv.replyInput}
                placeholder={`Reply to ${group.user?.name}...`}
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={replyText}
                onChangeText={setReplyText}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                multiline
              />
              <TouchableOpacity onPress={handleReply} style={sv.replySend} disabled={!replyText.trim() || sending}>
                {sending
                  ? <ActivityIndicator size="small" color={T.accent} />
                  : <Ionicons name="send" size={20} color={replyText.trim() ? T.accent : 'rgba(255,255,255,0.3)'} />
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  )
}

// ─── Story Creator Modal ──────────────────────────────────────────────────────
function StoryCreator({ visible, onClose, onCreated }) {
  const [mode, setMode]           = useState(null)   // 'image'|'video'|'text'
  const [mediaFile, setMediaFile] = useState(null)
  const [text, setText]           = useState('')
  const [bgColor, setBgColor]     = useState(TEXT_BG_COLORS[0])
  const [textColor, setTextColor] = useState('#FFFFFF')
  const [uploading, setUploading] = useState(false)
  const insets = useSafeAreaInsets()

  const reset = () => { setMode(null); setMediaFile(null); setText(''); setBgColor(TEXT_BG_COLORS[0]) }

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return Alert.alert('Permission required')
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
    if (!res.canceled) { setMediaFile(res.assets[0]); setMode('image') }
  }

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return Alert.alert('Permission required')
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos })
    if (!res.canceled) { setMediaFile(res.assets[0]); setMode('video') }
  }

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return Alert.alert('Permission required')
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 })
    if (!res.canceled) { setMediaFile(res.assets[0]); setMode('image') }
  }

  const handlePost = async () => {
    if (uploading) return
    try {
      setUploading(true)
      let mediaPayload = []
      if (mode === 'text') {
        if (!text.trim()) return Alert.alert('Please enter some text')
        mediaPayload = [{ type: 'text', text: text.trim(), bgColor, textColor, fontSize: 26 }]
      } else if (mode === 'image' || mode === 'video') {
        if (!mediaFile) return
        const result = await uploadToCloudinary({ uri: mediaFile.uri, type: mode === 'video' ? 'video' : 'image', name: 'story_' + Date.now(), mime: mediaFile.mimeType || (mode === 'video' ? 'video/mp4' : 'image/jpeg') })
        mediaPayload = [{
          type: mode,
          url: result.url,
          public_id: result.public_id || '',
          thumb: '',
          width: result.width || mediaFile.width || null,
          height: result.height || mediaFile.height || null,
          duration: result.duration || mediaFile.duration || null,
        }]
      }
      await createStory(mediaPayload)
      onCreated?.()
      reset()
      onClose()
    } catch (e) {
      Alert.alert('Failed to post story', e?.message || 'Please try again')
    } finally {
      setUploading(false)
    }
  }

  if (!visible) return null

  // Mode picker screen
  if (!mode) {
    return (
      <Modal visible animationType="slide" statusBarTranslucent>
        <View style={[cr.container, { paddingTop: insets.top + 10 }]}>
          <StatusBar barStyle="light-content" backgroundColor={T.bg} />
          <View style={cr.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={26} color={T.textPrimary} />
            </TouchableOpacity>
            <Text style={cr.title}>Create Story</Text>
            <View style={{ width: 26 }} />
          </View>
          <View style={cr.options}>
            <TouchableOpacity style={cr.optionCard} onPress={handleCamera}>
              <View style={[cr.optionIcon, { backgroundColor: T.accentDim }]}>
                <Ionicons name="camera" size={36} color={T.accent} />
              </View>
              <Text style={cr.optionLabel}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cr.optionCard} onPress={pickImage}>
              <View style={[cr.optionIcon, { backgroundColor: 'rgba(124,58,237,0.15)' }]}>
                <Ionicons name="image" size={36} color="#7C3AED" />
              </View>
              <Text style={cr.optionLabel}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cr.optionCard} onPress={pickVideo}>
              <View style={[cr.optionIcon, { backgroundColor: 'rgba(220,38,38,0.15)' }]}>
                <Ionicons name="videocam" size={36} color="#DC2626" />
              </View>
              <Text style={cr.optionLabel}>Video</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cr.optionCard} onPress={() => setMode('text')}>
              <View style={[cr.optionIcon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Ionicons name="text" size={36} color={T.amber} />
              </View>
              <Text style={cr.optionLabel}>Text</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    )
  }

  // Preview / editor
  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* Preview */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {mode === 'image' && mediaFile && (
            <Image source={{ uri: mediaFile.uri }} style={{ width: SCREEN_W, height: SCREEN_H * 0.75 }} resizeMode="contain" />
          )}
          {mode === 'video' && mediaFile && (
            <Video source={{ uri: mediaFile.uri }} style={{ width: SCREEN_W, height: SCREEN_H * 0.75 }} resizeMode="contain" shouldPlay isLooping />
          )}
          {mode === 'text' && (
            <View style={{ width: SCREEN_W, height: SCREEN_H * 0.75, backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <Text style={{ color: textColor, fontSize: 26, fontWeight: '700', textAlign: 'center' }}>
                {text || 'Your text here...'}
              </Text>
            </View>
          )}
        </View>

        {/* Text input (for text stories) */}
        {mode === 'text' && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <TextInput
              style={cr.textInput}
              placeholder="Type your story..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
            />
            {/* BG color picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {TEXT_BG_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setBgColor(c)}
                  style={[cr.colorDot, { backgroundColor: c, borderWidth: c === bgColor ? 3 : 0, borderColor: '#fff' }]}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Action row */}
        <View style={cr.actionRow}>
          <TouchableOpacity onPress={() => { reset() }} style={cr.cancelBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePost} style={cr.postBtn} disabled={uploading}>
            {uploading
              ? <ActivityIndicator color={T.bg} />
              : <><Ionicons name="checkmark" size={22} color={T.bg} /><Text style={cr.postText}>Post Story</Text></>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ─── Main Updates Screen ──────────────────────────────────────────────────────
const Updates = () => {
  const insets              = useSafeAreaInsets()
  const { mongoUser }       = useAuth()
  const [stories, setStories]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [viewerVisible, setViewerVisible] = useState(false)
  const [viewerStartGroup, setViewerStartGroup] = useState(0)
  const [creatorVisible, setCreatorVisible] = useState(false)

  const myGroup = stories.find(g => g.user?._id?.toString() === mongoUser?._id?.toString())
  const otherGroups = stories.filter(g => g.user?._id?.toString() !== mongoUser?._id?.toString())
  // all groups for viewer: self first
  const allGroups = myGroup ? [myGroup, ...otherGroups] : otherGroups

  const fetchStories = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const data = await getStories()
      setStories(data || [])
    } catch (e) {
      console.log('getStories error:', e?.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchStories() }, [])

  // real-time: new_story event
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const handler = () => fetchStories(true)
    socket.on('new_story', handler)
    return () => socket.off('new_story', handler)
  }, [fetchStories])

  const openViewer = (groupIndex) => {
    setViewerStartGroup(groupIndex)
    setViewerVisible(true)
  }

  const openMyStory = () => {
    if (myGroup) {
      const idx = allGroups.findIndex(g => g.user?._id?.toString() === mongoUser?._id?.toString())
      openViewer(idx >= 0 ? idx : 0)
    } else {
      setCreatorVisible(true)
    }
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={T.surface} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerAccent} />
          <Text style={s.headerTitle}>Stories</Text>
        </View>
        <View style={s.headerIcons}>
          <TouchableOpacity style={s.iconBtn} onPress={() => fetchStories()}>
            <Ionicons name="refresh-outline" size={22} color={T.textSecond} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={T.accent} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 90 }}
          refreshing={refreshing}
          onScrollBeginDrag={() => {}}
        >
          {/* Stories horizontal scroll */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Recent Stories</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12, paddingVertical: 8 }}>
            {/* My Story */}
            <StoryThumb
              isMe
              group={myGroup}
              myPhoto={mongoUser?.photo?.url || mongoUser?.profileImage}
              onPress={openMyStory}
            />
            {/* Others */}
            {otherGroups.map((group, i) => (
              <StoryThumb
                key={group.user?._id}
                group={group}
                onPress={() => {
                  const idx = allGroups.findIndex(g => g.user?._id?.toString() === group.user?._id?.toString())
                  openViewer(idx >= 0 ? idx : i + 1)
                }}
              />
            ))}
          </ScrollView>

          {/* Empty state */}
          {allGroups.length === 0 && (
            <View style={s.emptyWrap}>
              <Ionicons name="images-outline" size={56} color={T.textMuted} />
              <Text style={s.emptyTitle}>No stories yet</Text>
              <Text style={s.emptySub}>Add your story or connect with people to see their stories</Text>
              <TouchableOpacity style={s.addStoryBtn} onPress={() => setCreatorVisible(true)}>
                <Ionicons name="add-circle" size={18} color={T.bg} />
                <Text style={s.addStoryText}>Add Your Story</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* List view of stories */}
          {allGroups.length > 0 && (
            <View>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>All Updates</Text>
              </View>
              {allGroups.map((group, i) => {
                const isMe = group.user?._id?.toString() === mongoUser?._id?.toString()
                const avatar = group.user?.photo?.url || group.user?.profileImage
                const lastStory = group.stories?.[group.stories.length - 1]
                const firstMedia = lastStory?.media?.[0]
                const timeAgo = lastStory?.createdAt
                  ? timeSince(new Date(lastStory.createdAt))
                  : ''
                return (
                  <TouchableOpacity
                    key={group.user?._id}
                    style={s.statusItem}
                    onPress={() => {
                      const idx = allGroups.findIndex(g => g.user?._id?.toString() === group.user?._id?.toString())
                      isMe ? openMyStory() : openViewer(idx >= 0 ? idx : i)
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={s.avatarWrap}>
                      <StoryRing hasUnseen={!isMe && group.hasUnseen} count={group.stories?.length || 0} size={54} />
                      {avatar
                        ? <Image source={{ uri: avatar }} style={s.avatar} />
                        : <View style={[s.avatar, { backgroundColor: T.surfaceHigh, alignItems:'center', justifyContent:'center' }]}>
                            <Ionicons name="person" size={20} color={T.textSecond} />
                          </View>
                      }
                    </View>
                    <View style={s.statusInfo}>
                      <Text style={s.statusName}>{isMe ? 'My Story' : group.user?.name}</Text>
                      <Text style={s.statusTime}>{timeAgo} · {group.stories?.length} {group.stories?.length === 1 ? 'update' : 'updates'}</Text>
                    </View>
                    {/* Thumbnail preview */}
                    {firstMedia?.url && (
                      <Image source={{ uri: firstMedia.url }} style={s.previewThumb} />
                    )}
                    {firstMedia?.type === 'text' && (
                      <View style={[s.previewThumb, { backgroundColor: firstMedia.bgColor || T.accent, alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="text" size={16} color="#fff" />
                      </View>
                    )}
                    {(!firstMedia?.url && firstMedia?.type !== 'text') && (
                      <View style={[s.previewThumb, { backgroundColor: T.surfaceHigh }]} />
                    )}
                    {!isMe && group.hasUnseen && <View style={s.unreadDot} />}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={[s.fab, { bottom: 24 }]} activeOpacity={0.85} onPress={() => setCreatorVisible(true)}>
        <View style={s.fabGlow} />
        <Ionicons name="camera" size={24} color={T.bg} />
      </TouchableOpacity>

      {/* Story Viewer */}
      <StoryViewer
        visible={viewerVisible}
        groups={allGroups}
        startGroupIndex={viewerStartGroup}
        myUserId={mongoUser?._id?.toString()}
        onClose={() => { setViewerVisible(false); fetchStories(true) }}
        onDelete={() => fetchStories(true)}
      />

      {/* Story Creator */}
      <StoryCreator
        visible={creatorVisible}
        onClose={() => setCreatorVisible(false)}
        onCreated={() => fetchStories(true)}
      />
    </View>
  )
}

export default Updates

// ─── Helper: time since ───────────────────────────────────────────────────────
function timeSince(date) {
  const s = Math.floor((Date.now() - date) / 1000)
  if (s < 60) return 'Just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: T.surface,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAccent: { width: 4, height: 22, borderRadius: 2, backgroundColor: T.accent },
  headerTitle:  { fontSize: 22, fontWeight: '800', color: T.textPrimary },
  headerIcons:  { flexDirection: 'row', gap: 4 },
  iconBtn:      { padding: 7 },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: T.accent, textTransform: 'uppercase', letterSpacing: 1.2 },

  // story thumb (horizontal)
  storyThumb: { alignItems: 'center', width: 72 },
  storyRingWrap: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  storyAvatar: { width: 54, height: 54, borderRadius: 27, position: 'absolute' },
  storyName: { fontSize: 11, color: T.textSecond, textAlign: 'center', maxWidth: 68 },
  addBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.bg,
  },

  // list item
  statusItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  avatarWrap: { position: 'relative', width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  avatar:     { width: 50, height: 50, borderRadius: 25, position: 'absolute', backgroundColor: T.surfaceHigh },
  statusInfo: { flex: 1, marginLeft: 13, gap: 3 },
  statusName: { fontSize: 15, fontWeight: '600', color: T.textPrimary },
  statusTime: { fontSize: 12, color: T.textSecond },
  unreadDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent },
  previewThumb: { width: 46, height: 46, borderRadius: 8, marginLeft: 8, backgroundColor: T.surfaceHigh },

  // empty state
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: T.textPrimary, marginTop: 16 },
  emptySub:   { fontSize: 13, color: T.textSecond, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  addStoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.accent, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 30, marginTop: 20,
  },
  addStoryText: { color: T.bg, fontWeight: '700', fontSize: 15 },

  // FAB
  fab: {
    position: 'absolute', right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: T.accent,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: T.accent,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12,
  },
  fabGlow: {
    position: 'absolute', width: 58, height: 58, borderRadius: 29,
    backgroundColor: T.accent, opacity: 0.25, transform: [{ scale: 1.4 }],
  },
})

// ─── Story Viewer Styles ──────────────────────────────────────────────────────
const sv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  mediaFull: { position: 'absolute', width: SCREEN_W, height: SCREEN_H, top: 0, left: 0 },
  topGrad: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 200,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
    backgroundColor: 'transparent',
    // React Native workaround: use a semi-transparent view
  },
  bottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 200,
    backgroundColor: 'transparent',
  },
  progressRow: {
    position: 'absolute', top: 10, left: 8, right: 8,
    flexDirection: 'row', gap: 3, zIndex: 10,
  },
  segWrap: { flex: 1, height: 2.5, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
  segBg:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.3)' },
  segFill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  header: {
    position: 'absolute', top: 26, left: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', zIndex: 10,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  headerName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerTime: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  tapZones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 100, flexDirection: 'row', zIndex: 5 },
  replyWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  replyBox: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 28, paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  replyInput: { flex: 1, color: '#fff', fontSize: 14, maxHeight: 80 },
  replySend: { padding: 6 },
  viewsBar: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, zIndex: 10,
  },
  viewsText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
})

// ─── Creator Styles ───────────────────────────────────────────────────────────
const cr = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: T.textPrimary },
  options: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 24, gap: 20, justifyContent: 'center', paddingTop: 40,
  },
  optionCard: {
    width: (SCREEN_W - 80) / 2, alignItems: 'center',
    backgroundColor: T.surface, borderRadius: 20, paddingVertical: 28,
    borderWidth: 1, borderColor: T.border,
  },
  optionIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: T.textPrimary },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff',
    borderRadius: 14, padding: 14, fontSize: 16, minHeight: 80,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  colorDot: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  cancelBtn: { padding: 10 },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.accent, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 30,
  },
  postText: { color: T.bg, fontWeight: '800', fontSize: 15 },
})