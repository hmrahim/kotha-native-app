import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { T } from '../theme'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(sec) {
  if (!sec || sec < 1) return null
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─── Label + color config ─────────────────────────────────────────────────────
//
//  STATUS      | আমি caller (isOutgoing=true)      | আমি callee (isOutgoing=false)
//  ------------|-----------------------------------|-----------------------------
//  ended       | Outgoing Voice/Video Call · 2:34  | Incoming Voice/Video Call · 2:34
//  missed      | No Answer                         | Missed Call
//  timeout     | No Answer                         | Missed Call
//  rejected    | Call Declined  (ও নেয়নি)          | You Declined  (আমি কাটলাম)
//  canceled    | You Canceled   (আমি কাটলাম)        | Call Canceled (ও কাটলো)

function getCallInfo(status, isOutgoing, type, durationSeconds) {
  const isVoice = type !== 'video'
  const callWord = isVoice ? 'Voice Call' : 'Video Call'

  switch (status) {

    case 'ended': {
      const dur = formatDuration(durationSeconds)
      return {
        label:     `${isOutgoing ? 'Outgoing' : 'Incoming'} ${callWord}${dur ? ` · ${dur}` : ''}`,
        color:     T.accent,
        iconColor: T.accent,
        arrow:     isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline',
      }
    }

    case 'missed':
    case 'timeout':
      return {
        label:     isOutgoing ? 'No Answer' : `Missed ${callWord}`,
        color:     '#FA3E3E',
        iconColor: '#FA3E3E',
        arrow:     isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline',
      }

    case 'rejected':
      return {
        // isOutgoing = আমি কল করেছিলাম, ও reject করেছে → "Call Declined"
        // !isOutgoing = ও কল করেছিল, আমি reject করেছি → "You Declined"
        label:     isOutgoing ? 'Call Declined' : 'You Declined',
        color:     '#FA3E3E',
        iconColor: '#FA3E3E',
        arrow:     isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline',
      }

    case 'canceled':
      return {
        // isOutgoing = আমি কল করেছিলাম, আমি cancel করেছি → "You Canceled"
        // !isOutgoing = ও কল করেছিল, ও cancel করেছে → "Call Canceled"
        label:     isOutgoing ? 'You Canceled' : 'Call Canceled',
        color:     T.textSecond,
        iconColor: T.textSecond,
        arrow:     isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline',
      }

    default:
      return {
        label:     callWord,
        color:     T.textSecond,
        iconColor: T.textSecond,
        arrow:     'call-outline',
      }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CallBubble({ call, onCallBack, bubbleColors }) {
  const {
    type        = 'voice',
    status      = 'ended',
    isOutgoing  = false,
    durationSeconds = 0,
    createdAt,
  } = call

  const isVideo = type === 'video'
  const info    = getCallInfo(status, isOutgoing, type, durationSeconds)

  const bgColor = isOutgoing
    ? (bubbleColors?.bubbleMe    ?? T.bubbleMe)
    : (bubbleColors?.bubbleThem  ?? T.bubbleThem)
  const borderColor = isOutgoing
    ? (bubbleColors?.bubbleMeBorder   ?? T.bubbleMeBorder)
    : (bubbleColors?.bubbleThemBorder ?? T.bubbleThemBorder)

  return (
    <View style={[styles.row, isOutgoing ? styles.rowRight : styles.rowLeft]}>
      <View style={[
        styles.bubble,
        { backgroundColor: bgColor, borderColor },
        isOutgoing ? styles.bubbleRight : styles.bubbleLeft,
      ]}>
        <View style={styles.inner}>

          {/* Icon circle */}
          <View style={[styles.iconCircle, { backgroundColor: info.iconColor + '22' }]}>
            <Ionicons
              name={isVideo ? 'videocam' : 'call'}
              size={19}
              color={info.iconColor}
            />
            {/* Arrow */}
            <View style={styles.arrowBadge}>
              <Ionicons name={info.arrow} size={9} color={info.iconColor} />
            </View>
          </View>

          {/* Text */}
          <View style={styles.textCol}>
            <Text style={[styles.label, { color: info.color }]} numberOfLines={1}>
              {info.label}
            </Text>
            <Text style={styles.time}>{formatTime(createdAt)}</Text>
          </View>

          {/* Call back button */}
          <TouchableOpacity
            style={[styles.callBackBtn, { backgroundColor: info.iconColor + '1A' }]}
            onPress={() => onCallBack?.(type)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isVideo ? 'videocam-outline' : 'call-outline'}
              size={17}
              color={info.iconColor}
            />
          </TouchableOpacity>

        </View>
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  row:       { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 10 },
  rowRight:  { justifyContent: 'flex-end' },
  rowLeft:   { justifyContent: 'flex-start' },

  bubble: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: '82%',
    minWidth: 210,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 3,
    elevation: 2,
  },
  bubbleRight: { borderBottomRightRadius: 5 },
  bubbleLeft:  { borderBottomLeftRadius: 5 },

  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  arrowBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
  },

  textCol: {
    flex: 1,
    gap: 3,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  time: {
    fontSize: 11,
    color: T.textMuted,
  },

  callBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
})