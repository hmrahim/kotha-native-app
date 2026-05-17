import React, { useState, useRef, useEffect } from 'react'
import {
  Modal, View, Image, TouchableOpacity, StyleSheet,
  Dimensions, Text, Animated, PanResponder, FlatList, Platform, StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import { Alert } from 'react-native'

const { width: SW, height: SH } = Dimensions.get('window')

// Save image to gallery
async function saveImageToGallery(url) {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow media access to save images')
      return
    }
    const dest = FileSystem.cacheDirectory + `img_${Date.now()}.jpg`
    const { uri } = await FileSystem.downloadAsync(url, dest)
    await MediaLibrary.saveToLibraryAsync(uri)
    Alert.alert('Saved!', 'Image saved to your gallery')
  } catch (e) {
    Alert.alert('Save failed', e?.message || 'Could not save image')
  }
}

// ─── Single image page — swipe down/up to close ───────────────────────────────
function ImagePage({ uri, onSwipeClose, onTap }) {
  const translateY = useRef(new Animated.Value(0)).current
  const opacity    = useRef(new Animated.Value(1)).current

  const pan = PanResponder.create({
    onStartShouldSetPanResponder:  () => false,
    onMoveShouldSetPanResponder:   (_, g) =>
      Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,

    onPanResponderMove: (_, g) => {
      translateY.setValue(g.dy)
      opacity.setValue(Math.max(0.15, 1 - Math.abs(g.dy) / (SH * 0.5)))
    },

    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dy) > SH * 0.15 || Math.abs(g.vy) > 0.9) {
        Animated.parallel([
          Animated.timing(translateY, { toValue: g.dy > 0 ? SH : -SH, duration: 220, useNativeDriver: true }),
          Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => onSwipeClose?.())
      } else {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          Animated.spring(opacity,    { toValue: 1, useNativeDriver: true }),
        ]).start()
      }
    },
  })

  return (
    <View style={st.page} {...pan.panHandlers}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity }]} />
      <TouchableOpacity activeOpacity={1} onPress={onTap} style={st.page}>
        <Animated.Image
          source={{ uri }}
          style={[st.img, { transform: [{ translateY }] }]}
          resizeMode="contain"
        />
      </TouchableOpacity>
    </View>
  )
}

// ─── ImageViewer ──────────────────────────────────────────────────────────────
// Props:
//   visible      : bool
//   uri          : string     — single image (backward compat)
//   uris         : string[]   — multiple images
//   initialIndex : number     — which index to open (default 0)
//   onClose      : () => void
//   onSave       : (uri: string) => void   — optional custom save handler
//
export default function ImageViewer({ visible, uri, uris, initialIndex = 0, onClose, onSave }) {
  const images = uris?.length ? uris : uri ? [uri] : []
  const [idx, setIdx]       = useState(initialIndex)
  const [showUI, setShowUI] = useState(true)
  const flatRef             = useRef(null)
  const uiAnim              = useRef(new Animated.Value(1)).current

  // Reset state each time viewer opens
  useEffect(() => {
    if (visible) {
      setIdx(initialIndex)
      setShowUI(true)
      uiAnim.setValue(1)
      // Scroll to correct index after render
      requestAnimationFrame(() => {
        flatRef.current?.scrollToIndex({ index: initialIndex, animated: false })
      })
    }
  }, [visible, initialIndex])

  const toggleUI = () => {
    const next = !showUI
    setShowUI(next)
    Animated.timing(uiAnim, { toValue: next ? 1 : 0, duration: 180, useNativeDriver: true }).start()
  }

  const onViewable = useRef(({ viewableItems }) => {
    if (viewableItems[0]) setIdx(viewableItems[0].index)
  }).current

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current

  // Handle save — use provided handler or default gallery save
  const handleSave = () => {
    const currentUri = images[idx]
    if (!currentUri) return
    if (onSave) {
      onSave(currentUri)
    } else {
      saveImageToGallery(currentUri)
    }
  }

  if (!images.length) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden={Platform.OS === 'ios'} backgroundColor="#000" barStyle="light-content" />

      <View style={st.root}>
        {/* ── Image pager — horizontal FlatList ── */}
        <FlatList
          ref={flatRef}
          data={images}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
          initialScrollIndex={initialIndex}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          renderItem={({ item }) => (
            <ImagePage uri={item} onSwipeClose={onClose} onTap={toggleUI} />
          )}
        />

        {/* ── Close button — top left ── */}
        <Animated.View style={[st.closeWrap, { opacity: uiAnim }]} pointerEvents={showUI ? 'auto' : 'none'}>
          <TouchableOpacity onPress={onClose} style={st.closeBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* ── Counter + Save — top right ── */}
        <Animated.View style={[st.topRight, { opacity: uiAnim }]} pointerEvents={showUI ? 'auto' : 'none'}>
          {images.length > 1 && (
            <Text style={st.counter}>{idx + 1} / {images.length}</Text>
          )}
          <TouchableOpacity onPress={handleSave} style={st.saveBtn} hitSlop={10}>
            <Ionicons name="download-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* ── Dot indicators — bottom ── */}
        {images.length > 1 && (
          <Animated.View style={[st.dotsRow, { opacity: uiAnim }]} pointerEvents="none">
            {images.map((_, i) => (
              <View key={i} style={[st.dot, i === idx && st.dotActive]} />
            ))}
          </Animated.View>
        )}
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  page: {
    width: SW,
    height: SH,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  img: { width: SW, height: SH },

  // Close — top left
  closeWrap: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 54,
    left: 16,
    zIndex: 10,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Counter + Save — top right
  topRight: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 54,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  counter: { color: '#fff', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Dots — bottom center
  dotsRow: {
    position: 'absolute',
    bottom: 28,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 20, height: 6, borderRadius: 3,
    backgroundColor: '#fff',
  },
})
