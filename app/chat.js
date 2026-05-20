import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  View, FlatList, KeyboardAvoidingView, Platform, StyleSheet,
  StatusBar, Modal, Pressable, Text, TouchableOpacity, ScrollView, Alert, ImageBackground, Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'

import ChatHeader from '../components/ChatHeader'
import MessageBubble from '../components/MessageBubble'
import CallBubble from '../components/CallBubble'
import MessageInput from '../components/MessageInput'
import DateSeparator from '../components/DateSeparator'
import TypingIndicator from '../components/TypingIndicator'
import UserProfileModal from '../components/UserProfileModal'
import MessageSkeleton from '../components/MessageSkeleton'
import ScrollToBottomButton from '../components/ScrollToBottomButton'
import ChatBackgroundPicker, { BUBBLE_COLORS } from '../components/ChatBackgroundPicker'
import { AnimatedChatBg } from '../components/ChatBackgroundPicker'
import { T } from '../theme'
import { getSocket, sendMessageSocket } from '../services/socket'
import { createMessage, getMessage, markSeen, editMessage, deleteMessage, getBlockStatus, blockUser, unblockUser, getChatBackground, setChatBackground, setChatBackgroundByReceiver, getNicknames, setNickname, getCallsBetween } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { playIncoming, playOutgoing, playTyping } from '../services/sounds'
import { uploadMediaItem } from '../services/mediaPickers'
import { uploadToCloudinary } from '../services/cloudinary'

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams()
  const { mongoUser } = useAuth()
  const queryClient = useQueryClient()
  const flatListRef = useRef(null)
  const typingTimer = useRef(null)
  const lastTypingEmit = useRef(0)
  const lastTypingSoundAt = useRef(0)

  const [isTyping, setIsTyping] = useState(false)
  const [chatId, setChatId] = useState(null)
  const [peerOnline, setPeerOnline] = useState(params.online === 'true')
  const [peerLastSeen, setPeerLastSeen] = useState(params.lastSeen ?? null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [blockStatus, setBlockStatus] = useState({ blockedByMe: false, blockedByThem: false })
  // nicknames: { [userId]: nickname }
  const [nicknames, setNicknames] = useState({})

  const [actionMessage, setActionMessage] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [deleteSheet, setDeleteSheet] = useState(false)
  const [forwardSheet, setForwardSheet] = useState(false)

  const [isNearBottom, setIsNearBottom] = useState(true)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [callItems, setCallItems] = useState([])   // call history — messages এর সাথে merge

  // ── Chat background ────────────────────────────────────────────────────────
  const [chatBackground, setChatBg] = useState({ type: 'default', value: null, id: 'default' })
  const [showBgPicker, setShowBgPicker] = useState(false)
  const [bgChatId, setBgChatId] = useState(null) // real chatId for background patch

  const receiverId = params.id?.toString()

  // ── Block status চেক করো screen খুললে ─────────────────────────────────────
  useEffect(() => {
    if (!receiverId) return
    getBlockStatus(receiverId)
      .then((bs) => setBlockStatus(bs ?? { blockedByMe: false, blockedByThem: false }))
      .catch(() => {})
  }, [receiverId])

  // ── Load chat background ───────────────────────────────────────────────────
  useEffect(() => {
    if (!receiverId) return
    getChatBackground(receiverId)
      .then((data) => {
        if (data?.chatId) setBgChatId(data.chatId.toString())
        if (data?.background) {
          const bg = data.background
          // FIX: server now sends presetId directly — no need to guess from value
          const id = bg.presetId || (bg.type === 'image' ? 'image' : 'default')
          setChatBg({ type: bg.type, value: bg.value, id })
        }
      })
      .catch(() => {})
  }, [receiverId])

  // ── Load nicknames ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!receiverId) return
    getNicknames(receiverId)
      .then((data) => { if (data?.nicknames) setNicknames(data.nicknames) })
      .catch(() => {})
  }, [receiverId])

  // nickname set থাকলে সেটা header এ দেখাবে
  const peerRealName = params.name ?? 'User'
  const peerNickname = receiverId && nicknames[receiverId]

  const chat = {
    id: receiverId ?? '',
    name: peerNickname || peerRealName,
    avater:params.avater,
    online: peerOnline,
    lastSeen: peerLastSeen ?? 'last seen recently',
    receiverId,
  }



  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: ['messages', chat.id],
    queryFn: async () => {
      const data = await getMessage(chat.id)
      return data ?? []
    },
    enabled: !!chat.id,
    staleTime: 0,
  })

  // inverted FlatList এর জন্য data উল্টো করতে হয়
  const messages = useMemo(() => [...rawMessages].reverse(), [rawMessages])

  // ── Call history — messages এর সাথে merge করবো ─────────────────────────────
  useEffect(() => {
    if (!receiverId) return
    getCallsBetween(receiverId)
      .then((res) => {
        if (!res?.data) return
        // Race-condition fix: API আসার আগে socket থেকে নতুন item এলে হারাবে না
        setCallItems((prev) => {
          const apiIds = new Set(res.data.map((c) => c._id?.toString()))
          const socketOnly = prev.filter((c) => !apiIds.has(c._id?.toString()))
          return [...res.data, ...socketOnly]
        })
      })
      .catch(() => {})
  }, [receiverId])

  // ✅ INSTANT: call:new_history — server সব data সহ emit করে → zero delay bubble
  useEffect(() => {
    const socket = getSocket()
    if (!socket || !receiverId) return

    // Primary: server সরাসরি full call data পাঠায়
    const handleNewHistory = (item) => {
      const myId = mongoUser?._id?.toString()
      const isThisChat =
        (item.callerId === receiverId && item.calleeId === myId) ||
        (item.calleeId === receiverId && item.callerId === myId)
      if (!isThisChat) return

      setCallItems((prev) => {
        if (prev.find((c) => c._id === item._id)) return prev
        return [...prev, item]
      })
    }

    // Fallback: call:new_history miss হলে API থেকে refresh করো
    // (chat screen বন্ধ থাকলে বা socket reconnect হলে কাজে লাগে)
    const handleRefetch = () => {
      if (!receiverId) return
      getCallsBetween(receiverId)
        .then((res) => { if (res?.data) setCallItems(res.data) })
        .catch(() => {})
    }

    socket.on('call:new_history', handleNewHistory)
    // CallContext এ rejected/canceled/timeout এর জন্য already listener আছে
    // তাই এখানে আলাদা listen করি না — শুধু call:new_history এ depend করি
    // কিন্তু chat screen যদি background এ থাকে সেজন্য page focus এ refetch:
    return () => {
      socket.off('call:new_history', handleNewHistory)
    }
  }, [receiverId, mongoUser?._id])

  // Messages + Calls একসাথে createdAt দিয়ে sort করো
  // date separator যোগ করো — MessageBubble এর existing logic এর মতো
  const mergedItems = useMemo(() => {
    const allItems = [
      ...rawMessages.map((m) => ({ ...m, itemType: 'message' })),
      ...callItems,
    ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    // Date separator inject করো
    const result = []
    let lastDateStr = null
    for (const item of allItems) {
      const d = item.createdAt ? new Date(item.createdAt) : null
      if (d) {
        const dateStr = d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
        if (dateStr !== lastDateStr) {
          result.push({ _id: `date_${dateStr}`, type: 'date', label: dateStr })
          lastDateStr = dateStr
        }
      }
      result.push(item)
    }
    // inverted list এর জন্য উল্টো করো
    return result.reverse()
  }, [rawMessages, callItems])

  const chatList = queryClient.getQueryData(['chatList']) ?? []

  useEffect(() => {
    if (rawMessages.length > 0 && !chatId) {
      const firstMsg = rawMessages.find((m) => m.chatId)
      if (firstMsg?.chatId) {
        const cid = firstMsg.chatId.toString()
        setChatId(cid)
        if (!bgChatId) setBgChatId(cid)
      }
    }
  }, [rawMessages, chatId])

  // inverted list এ index 0 ই নিচে — scrollToOffset(0) মানে bottom
  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false })
    setNewMsgCount(0)
  }, [])

  useEffect(() => {
    if (isTyping && isNearBottom) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false })
    }
  }, [isTyping])

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !chatId || !mongoUser?._id) return
    socket.emit('join_room', chatId)
    socket.emit('mark_delivered', { chatId, userId: mongoUser._id })
    socket.emit('mark_seen', { chatId, userId: mongoUser._id })
    markSeen(chatId).catch(() => {})
    queryClient.setQueryData(['messages', chat.id], (old = []) =>
      old.map((m) =>
        m.senderId?.toString() !== mongoUser._id.toString()
          ? { ...m, status: 'seen', seen: true } : m
      )
    )
    return () => { socket.emit('leave_room', chatId) }
  }, [chatId, mongoUser?._id])

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !mongoUser?._id) return
    socket.emit('join_room', mongoUser._id.toString())

    const handleReceiveMessage = (msg) => {
      const senderIsMe = msg.senderId?.toString() === mongoUser._id.toString()
      const fromPeer = msg.senderId?.toString() === receiverId

      if (!fromPeer && !senderIsMe) {
        queryClient.invalidateQueries({ queryKey: ['chatList'] })
        playIncoming()
        return
      }

      if (!chatId && msg.chatId) setChatId(msg.chatId.toString())

      queryClient.setQueryData(['messages', chat.id], (old = []) => {
        if (msg.tempId) {
          const idx = old.findIndex((m) => m._id === msg.tempId)
          if (idx !== -1) { const next = [...old]; next[idx] = { ...msg }; return next }
        }
        if (old.find((m) => m._id?.toString() === msg._id?.toString())) return old
        return [...old, msg]
      })

      if (fromPeer) {
        playIncoming()
        const activeChatId = chatId || msg.chatId?.toString()
        if (activeChatId) socket.emit('mark_seen', { chatId: activeChatId, userId: mongoUser._id })
        if (!isNearBottom) setNewMsgCount((n) => n + 1)
      }

      queryClient.invalidateQueries({ queryKey: ['chatList'] })
      if (isNearBottom) scrollToBottom()
    }

    const handleMessagesSeen = ({ chatId: seenChatId }) => {
      if (!seenChatId) return
      if (chatId && seenChatId.toString() !== chatId.toString()) return
      queryClient.setQueryData(['messages', chat.id], (old = []) =>
        old.map((m) =>
          m.senderId?.toString() === mongoUser._id.toString()
            ? { ...m, status: 'seen', seen: true } : m
        )
      )
    }

    const handleMessagesDelivered = ({ chatId: deliveredChatId }) => {
      if (!deliveredChatId) return
      if (chatId && deliveredChatId.toString() !== chatId.toString()) return
      queryClient.setQueryData(['messages', chat.id], (old = []) =>
        old.map((m) =>
          m.senderId?.toString() === mongoUser._id.toString() && m.status === 'sent'
            ? { ...m, status: 'delivered' } : m
        )
      )
    }

    const handleTypingOn = ({ userId }) => {
      if (userId?.toString() === receiverId) {
        setIsTyping(true)
        const now = Date.now()
        if (now - lastTypingSoundAt.current > 3000) {
          lastTypingSoundAt.current = now
          playTyping()
        }
      }
    }

    const handleTypingOff = ({ userId }) => {
      if (userId?.toString() === receiverId) setIsTyping(false)
    }

    const handleUserOnline = (data) => {
      const uid = typeof data === 'string' ? data : data?.userId
      if (uid?.toString() === receiverId) setPeerOnline(true)
    }

    const handleUserOffline = (data) => {
      const uid = typeof data === 'string' ? data : data?.userId
      if (uid?.toString() === receiverId) {
        setPeerOnline(false)
        if (data?.lastSeen) setPeerLastSeen(formatLastSeen(data.lastSeen))
      }
    }

    const handleMessageDeleted = ({ messageId, deleteFor }) => {
      queryClient.setQueryData(['messages', chat.id], (old = []) => {
        if (deleteFor === 'me') return old.filter((m) => m._id !== messageId)
        return old.map((m) =>
          m._id === messageId ? { ...m, isDeleted: true, text: '', media: [] } : m
        )
      })
    }

    const handleMessageEdited = ({ messageId, text }) => {
      queryClient.setQueryData(['messages', chat.id], (old = []) =>
        old.map((m) => m._id === messageId ? { ...m, text, isEdited: true } : m)
      )
    }

    socket.on('receive_message', handleReceiveMessage)
    socket.on('messages_seen', handleMessagesSeen)
    socket.on('messages_delivered', handleMessagesDelivered)
    socket.on('typing', handleTypingOn)
    socket.on('stop_typing', handleTypingOff)
    socket.on('user_online', handleUserOnline)
    socket.on('user_offline', handleUserOffline)
    socket.on('message_deleted', handleMessageDeleted)
    socket.on('message_edited', handleMessageEdited)

    const handleBgChanged = ({ chatId: bgCid, background }) => {
      if (!background) return
      // FIX: filter out events not for this conversation
      const currentChatId = chatId || bgChatId
      if (currentChatId && bgCid && currentChatId.toString() !== bgCid.toString()) return
      // FIX: server sends presetId directly now
      const id = background.presetId || (background.type === 'image' ? 'image' : 'default')
      setChatBg({ type: background.type, value: background.value, id })
      if (bgCid) setBgChatId(bgCid.toString())
    }
    socket.on('chat_background_changed', handleBgChanged)

    // ── Nicknames updated ────────────────────────────────────────────────────
    const handleNicknamesUpdated = ({ nicknames: updated }) => {
      setNicknames(updated ?? {})
    }
    socket.on('nicknames_updated', handleNicknamesUpdated)

    return () => {
      socket.off('receive_message', handleReceiveMessage)
      socket.off('messages_seen', handleMessagesSeen)
      socket.off('messages_delivered', handleMessagesDelivered)
      socket.off('typing', handleTypingOn)
      socket.off('stop_typing', handleTypingOff)
      socket.off('user_online', handleUserOnline)
      socket.off('user_offline', handleUserOffline)
      socket.off('message_deleted', handleMessageDeleted)
      socket.off('message_edited', handleMessageEdited)
      socket.off('chat_background_changed', handleBgChanged)
      socket.off('nicknames_updated', handleNicknamesUpdated)
    }
  }, [chatId, mongoUser?._id, receiverId, isNearBottom])

  const sendPayload = async ({ text = '', media = [] }) => {
    if (!text.trim() && (!media || media.length === 0)) return

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const replySnapshot = replyingTo

    const tempMsg = {
      _id: tempId,
      chatId,
      senderId: mongoUser?._id,
      text,
      media: media.map((m) => ({ ...m })),
      status: 'sending',
      createdAt: new Date().toISOString(),
      pending: true,
      replyTo: replySnapshot,
    }

    queryClient.setQueryData(['messages', chat.id], (old = []) => [...old, tempMsg])
    scrollToBottom()
    playOutgoing()
    setReplyingTo(null)

    let uploadedMedia = media
    const hasLocalUploads = media.some((m) => m.localUri && m.isUploading)
    if (hasLocalUploads) {
      uploadedMedia = [...media]
      for (let i = 0; i < media.length; i++) {
        const item = media[i]
        if (!item.localUri || !item.isUploading) continue
        try {
          const uploaded = await uploadMediaItem(item, (progress) => {
            queryClient.setQueryData(['messages', chat.id], (old = []) =>
              old.map((m) => {
                if (m._id !== tempId) return m
                const newMedia = [...m.media]
                newMedia[i] = { ...newMedia[i], uploadProgress: progress }
                return { ...m, media: newMedia }
              })
            )
          })
          uploadedMedia[i] = uploaded
        } catch (e) {
          queryClient.setQueryData(['messages', chat.id], (old = []) =>
            old.map((m) => m._id === tempId ? { ...m, status: 'failed', pending: false } : m)
          )
          return
        }
      }
    }

    try {
      const socket = getSocket()
      let saved = null
      if (socket?.connected) {
        const ack = await sendMessageSocket({
          receiverId, text, media: uploadedMedia,
          replyTo: replySnapshot?._id || null, tempId,
        })
        if (!ack?.ok) {
          // Block বা অন্য error — temp message সরিয়ে দাও
          queryClient.setQueryData(['messages', chat.id], (old = []) =>
            old.filter((m) => m._id !== tempId)
          )
          if (ack?.error === 'blocked') {
            Alert.alert('Cannot send message', ack.message || 'This user has blocked you or you have blocked them.')
          }
          return
        }
        saved = ack.message
        if (ack?.chat?._id) setChatId(ack.chat._id.toString())
      } else {
        const res = await createMessage({
          receiverId, message: text, media: uploadedMedia,
          replyTo: replySnapshot?._id || null,
        })
        if (res?.chat?._id) setChatId(res.chat._id.toString())
        saved = res?.message
      }
      queryClient.setQueryData(['messages', chat.id], (old = []) =>
        old.map((m) => (m._id === tempId ? { ...saved, status: saved?.status || 'sent' } : m))
      )
      queryClient.invalidateQueries({ queryKey: ['chatList'] })
    } catch (err) {
      queryClient.setQueryData(['messages', chat.id], (old = []) =>
        old.map((m) => (m._id === tempId ? { ...m, status: 'failed', pending: false } : m))
      )
    }
  }

  const handleSend = ({ text, media }) => sendPayload({ text, media })
  const handleSendMedia = (mediaItem) => {
    const arr = Array.isArray(mediaItem) ? mediaItem : [mediaItem]
    sendPayload({ media: arr })
  }

  const handleSubmitEdit = async ({ text }) => {
    if (!editingMessage || !text.trim()) return
    const msgId = editingMessage._id
    queryClient.setQueryData(['messages', chat.id], (old = []) =>
      old.map((m) => m._id === msgId ? { ...m, text: text.trim(), isEdited: true } : m)
    )
    setEditingMessage(null)
    const socket = getSocket()
    socket?.emit('edit_message', { messageId: msgId, chatId, text: text.trim() })
    try { await editMessage(msgId, text.trim()) } catch (_) {}
  }

  const handleDeleteForMe = async () => {
    const msgId = actionMessage?._id; if (!msgId) return
    queryClient.setQueryData(['messages', chat.id], (old = []) => old.filter((m) => m._id !== msgId))
    setDeleteSheet(false); setActionMessage(null)
    getSocket()?.emit('delete_message', { messageId: msgId, chatId, deleteFor: 'me' })
    try { await deleteMessage(msgId, 'me') } catch (_) {}
  }

  const handleDeleteForEveryone = async () => {
    const msgId = actionMessage?._id; if (!msgId) return
    queryClient.setQueryData(['messages', chat.id], (old = []) =>
      old.map((m) => m._id === msgId ? { ...m, isDeleted: true, text: '', media: [] } : m)
    )
    setDeleteSheet(false); setActionMessage(null)
    getSocket()?.emit('delete_message', { messageId: msgId, chatId, deleteFor: 'everyone' })
    try { await deleteMessage(msgId, 'everyone') } catch (_) {}
  }

  const handleForwardTo = async (targetReceiverId) => {
    setForwardSheet(false); setActionMessage(null)
    if (!actionMessage) return
    const socket = getSocket()
    const tempId = `fwd_${Date.now()}`
    if (socket?.connected) {
      socket.emit('forward_message', {
        messageId: actionMessage._id, toUserId: targetReceiverId,
        senderId: mongoUser?._id, tempId,
      })
    } else {
      await createMessage({
        receiverId: targetReceiverId,
        message: actionMessage.text || '',
        media: actionMessage.media || [],
      })
    }
    queryClient.invalidateQueries({ queryKey: ['chatList'] })
  }

  const handleReply = () => {
    setReplyingTo(actionMessage)
    setActionMessage(null)
  }

  // ── Chat background change handler ─────────────────────────────────────────
  const handleBgSelect = async ({ type, value, id }) => {
    // Optimistic local update — instant UI
    setChatBg({ type, value, id })
    setShowBgPicker(false)

    let finalValue = value

    // Image hole Cloudinary upload koro — noile onno jon dekhte parbe na
    if (type === 'image' && value && !value.startsWith('http')) {
      try {
        const uploaded = await uploadToCloudinary({
          uri: value,
          type: 'image',
          name: 'bg_' + Date.now() + '.jpg',
          mime: 'image/jpeg',
        })
        finalValue = uploaded.url
        setChatBg({ type, value: finalValue, id })
      } catch (e) {
        Alert.alert('Upload failed', 'Could not upload background image. Try again.')
        setChatBg({ type: 'default', value: null, id: 'default' })
        return
      }
    }

    const targetChatId = bgChatId || chatId
    try {
      if (targetChatId) {
        // FIX: pass id as presetId so server can save and return it
        await setChatBackground(targetChatId, type, finalValue, id)
      } else {
        // chatId abono create hoyni — receiverId diye set koro
        // server e chat create/find korbe and chatId return korbe
        const res = await setChatBackgroundByReceiver(receiverId, type, finalValue, id)
        // FIX: save the new chatId so future calls use setChatBackground directly
        if (res?.chatId) {
          setBgChatId(res.chatId.toString())
          if (!chatId) setChatId(res.chatId.toString())
        }
      }
    } catch (e) {
      console.error('bg save error:', e?.message)
      // Revert optimistic update on failure
      setChatBg({ type: 'default', value: null, id: 'default' })
    }
  }

  const handleTyping = () => {
    const socket = getSocket()
    if (!socket || !mongoUser?._id || !receiverId) return
    const now = Date.now()
    if (now - lastTypingEmit.current > 800) {
      socket.emit('typing', { chatId, userId: mongoUser._id, receiverId })
      lastTypingEmit.current = now
    }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      socket.emit('stop_typing', { chatId, userId: mongoUser._id, receiverId })
      lastTypingEmit.current = 0
    }, 1500)
  }

  // inverted list এ scroll direction উল্টো — distFromBottom হিসাব উল্টো
  const onScroll = (e) => {
    const { contentOffset } = e.nativeEvent
    const near = contentOffset.y < 80
    if (near !== isNearBottom) setIsNearBottom(near)
    if (near && newMsgCount > 0) setNewMsgCount(0)
  }

  // Derive bubble colors from background
  const bubbleColors = useMemo(() => {
    if (!chatBackground || chatBackground.type === 'default') return null
    return BUBBLE_COLORS[chatBackground.id] || BUBBLE_COLORS.image
  }, [chatBackground])

  const renderItem = ({ item }) => {
    if (item.type === 'date') return <DateSeparator label={item.label} />

    // ── Call bubble ──────────────────────────────────────────────────────────
    if (item.itemType === 'call') {
      // callerId আমি হলে outgoing, না হলে incoming
      // API items এ server-computed isOutgoing আছে (accurate)
      // Socket items এ নেই → callerId দিয়ে compute করো
      const myId = mongoUser?._id?.toString()
      const isOutgoing = item.isOutgoing !== undefined
        ? item.isOutgoing
        : (item.callerId ?? item.senderId) === myId
      return (
        <CallBubble
          call={{ ...item, isOutgoing }}
          bubbleColors={bubbleColors}
          onCallBack={(callType) => {
            // ChatHeader এর call button এর মতোই call initiate করো
            const socket = getSocket()
            socket?.emit('call:initiate', { receiverId, type: callType }, (ack) => {
              if (!ack?.ok) {
                Alert.alert('Call Failed', ack?.error === 'busy' ? 'User is busy' : ack?.error || 'Could not start call')
                return
              }
              router.push({
                pathname: '/call',
                params: {
                  callId:      ack.callId,
                  channelName: ack.channelName,
                  type:        ack.type,
                  token:       String(ack.token),
                  uid:         String(ack.uid),
                  appId:       String(ack.appId),
                  peerName:    chat.name,
                  peerAvatar:  chat.avater || '',
                  outgoing:    '1',
                },
              })
            })
          }}
        />
      )
    }

    // ── Message bubble ───────────────────────────────────────────────────────
    return (
      <MessageBubble
        message={{
          ...item,
          isMe: item.senderId?.toString() === mongoUser?._id?.toString(),
          status: item.status ?? 'sent',
          time: item.createdAt
            ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : item.time,
        }}
        onLongPress={setActionMessage}
        bubbleColors={bubbleColors}
      />
    )
  }

  return (
    <>
      <Stack.Screen options={{
        headerShown: false,
        contentStyle: { backgroundColor: T.bg },
        animation: 'slide_from_right',
        animationDuration: 180,
        gestureEnabled: true, fullScreenGestureEnabled: true,
      }} />

      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={T.surface} />
        <ChatHeader
          chat={chat}
          onBack={() => router.back()}
          onPressProfile={() => setShowProfileModal(true)}
        />

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.chatBg}>
            {/* Dynamic background layer */}
            {chatBackground.type === 'image' && chatBackground.value ? (
              <ImageBackground
                source={{ uri: chatBackground.value }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : chatBackground.type === 'solid' && chatBackground.value ? (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: chatBackground.value }]} />
            ) : chatBackground.type === 'gradient' && chatBackground.value ? (
              (() => {
                try {
                  const cols = JSON.parse(chatBackground.value)
                  return (
                    <View style={StyleSheet.absoluteFillObject}>
                      <View style={{ flex: 1, backgroundColor: cols[0] }} />
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: cols[1], opacity: 0.55, top: '40%' }]} />
                    </View>
                  )
                } catch { return null }
              })()
            ) : chatBackground.type?.startsWith('animated_') && chatBackground.value ? (
              <AnimatedChatBg bg={chatBackground} />
            ) : null}
            {isLoading ? (
              <MessageSkeleton />
            ) : (
              <FlatList
                ref={flatListRef}
                data={mergedItems}
                keyExtractor={(item) => (item._id?.toString() ?? item.id) + (item.itemType || '')}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={32}
                inverted                     // ← এইটাই মূল fix — list উল্টো, index 0 = নিচে
                ListHeaderComponent={isTyping ? <TypingIndicator name={chat.name} /> : null}
              />
            )}

            <ScrollToBottomButton
              visible={!isLoading && !isNearBottom}
              unreadCount={newMsgCount}
              onPress={scrollToBottom}
            />
          </View>

          {/* Reply bar — শুধু blocked না হলে দেখাবে */}
          {replyingTo && !blockStatus.blockedByMe && !blockStatus.blockedByThem && (
            <View style={styles.replyBar}>
              <View style={styles.replyLine} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyName}>
                  {replyingTo.senderId?.toString() === mongoUser?._id?.toString() ? 'You' : chat.name}
                </Text>
                <Text style={styles.replyText} numberOfLines={1}>
                  {replyingTo.text || '📎 Media'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyClose}>
                <Ionicons name="close" size={18} color={T.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Block banner অথবা Message Input ─────────────────────────── */}
          {blockStatus.blockedByMe ? (
            <View style={styles.blockedBar}>
              <Ionicons name="ban" size={20} color="#ff6b6b" />
              <Text style={styles.blockedText}>You have blocked {chat.name}</Text>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => {
                  unblockUser(receiverId)
                    .then(() => setBlockStatus({ blockedByMe: false, blockedByThem: false }))
                    .catch(() => Alert.alert('Error', 'Could not unblock. Try again.'))
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.unblockBtnText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ) : blockStatus.blockedByThem ? (
            <View style={styles.blockedBar}>
              <Ionicons name="ban" size={20} color="#888" />
              <Text style={[styles.blockedText, { color: '#888' }]}>
                You can't reply to this conversation
              </Text>
            </View>
          ) : (
            <MessageInput
              onSend={editingMessage ? handleSubmitEdit : handleSend}
              onSendMedia={handleSendMedia}
              onTyping={handleTyping}
              editingMessage={editingMessage}
              onCancelEdit={() => setEditingMessage(null)}
            />
          )}
        </KeyboardAvoidingView>
      </View>

      <UserProfileModal
        visible={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userId={receiverId}
        myId={mongoUser?._id?.toString()}
        name={peerRealName}
        online={peerOnline}
        lastSeen={peerLastSeen}
        blockStatus={blockStatus}
        onBlockChanged={(bs) => setBlockStatus(bs)}
        onOpenBackground={() => setShowBgPicker(true)}
        nicknames={nicknames}
        onNicknamesChanged={(updated) => setNicknames(updated)}
      />

      <ChatBackgroundPicker
        visible={showBgPicker}
        onClose={() => setShowBgPicker(false)}
        currentBg={chatBackground}
        onSelect={handleBgSelect}
      />

      {/* Action Sheet */}
      <Modal
        visible={!!actionMessage && !deleteSheet && !forwardSheet}
        transparent animationType="fade"
        onRequestClose={() => setActionMessage(null)}
      >
        <Pressable style={as.backdrop} onPress={() => setActionMessage(null)}>
          <View style={as.sheet}>
            <View style={as.handle} />
            <ActionRow icon="return-up-back-outline" label="Reply" onPress={handleReply} />
            {!!actionMessage?.text && (
              <ActionRow icon="copy-outline" label="Copy"
                onPress={async () => {
                  await Clipboard.setStringAsync(actionMessage.text)
                  setActionMessage(null)
                }}
              />
            )}
            {actionMessage?.isMe && !!actionMessage?.text && !actionMessage?.isDeleted && (
              <ActionRow icon="create-outline" label="Edit"
                onPress={() => { setEditingMessage(actionMessage); setActionMessage(null) }}
              />
            )}
            <ActionRow icon="arrow-redo-outline" label="Forward" onPress={() => setForwardSheet(true)} />
            <ActionRow icon="trash-outline" label="Delete" color="#F87171" onPress={() => setDeleteSheet(true)} />
          </View>
        </Pressable>
      </Modal>

      {/* Delete Options */}
      <Modal visible={deleteSheet} transparent animationType="fade" onRequestClose={() => setDeleteSheet(false)}>
        <Pressable style={as.backdrop} onPress={() => setDeleteSheet(false)}>
          <View style={as.sheet}>
            <View style={as.handle} />
            <Text style={as.sheetTitle}>Delete message?</Text>
            <ActionRow icon="person-outline" label="Delete for me" onPress={handleDeleteForMe} />
            {actionMessage?.isMe && (
              <ActionRow icon="people-outline" label="Delete for everyone" color="#F87171" onPress={handleDeleteForEveryone} />
            )}
            <ActionRow icon="close-outline" label="Cancel"
              onPress={() => { setDeleteSheet(false); setActionMessage(null) }}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Forward Picker */}
      <Modal visible={forwardSheet} transparent animationType="slide" onRequestClose={() => setForwardSheet(false)}>
        <Pressable style={as.backdrop} onPress={() => setForwardSheet(false)}>
          <View style={[as.sheet, { maxHeight: '70%' }]}>
            <View style={as.handle} />
            <Text style={as.sheetTitle}>Forward to…</Text>
            <ScrollView>
              {chatList.map((u) => {
                const targetId = u._id?.toString()
                if (!targetId || targetId === receiverId) return null
                const name = u.name || u.username || 'Unknown'
                return (
                  <TouchableOpacity key={targetId} style={as.fwdRow} onPress={() => handleForwardTo(targetId)}>
                    <View style={as.fwdAvatar}>
                      <Text style={as.fwdAvatarTxt}>{name[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={as.fwdName}>{name}</Text>
                    <Ionicons name="arrow-forward" size={16} color={T.textMuted} />
                  </TouchableOpacity>
                )
              })}
              {chatList.length === 0 && (
                <Text style={as.emptyTxt}>No other chats to forward to</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}



function ActionRow({ icon, label, onPress, color }) {
  return (
    <TouchableOpacity style={as.row} activeOpacity={0.7} onPress={onPress}>
      <Ionicons name={icon} size={20} color={color || T.textPrimary} />
      <Text style={[as.label, color && { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function formatLastSeen(ts) {
  if (!ts) return 'last seen recently'
  const d = new Date(ts); const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `last seen today at ${time}`
  return `last seen ${d.toLocaleDateString()} ${time}`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  flex: { flex: 1 },
  chatBg: { flex: 1, backgroundColor: T.chatBg ?? T.bg },
  listContent: { paddingVertical: 10, paddingHorizontal: 10 },
  // Block banner
  blockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  blockedText: {
    flex: 1,
    color: '#ff6b6b',
    fontSize: 13,
    fontWeight: '600',
  },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: T.accent,
  },
  unblockBtnText: {
    color: T.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.surface, paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: T.border,
  },
  replyLine: { width: 3, height: 32, borderRadius: 2, backgroundColor: T.accent },
  replyName: { color: T.accent, fontSize: 12, fontWeight: '700' },
  replyText: { color: T.textSecond, fontSize: 13, marginTop: 1 },
  replyClose: { padding: 4 },
})

const as = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.surfaceHigh, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 36, borderTopWidth: 1, borderTopColor: T.border },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: T.textMuted, opacity: 0.5, marginBottom: 12 },
  sheetTitle: { color: T.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  label: { color: T.textPrimary, fontSize: 15, fontWeight: '500' },
  fwdRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  fwdAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center' },
  fwdAvatarTxt: { color: T.accent, fontWeight: '700', fontSize: 16 },
  fwdName: { flex: 1, color: T.textPrimary, fontSize: 15 },
  emptyTxt: { color: T.textMuted, textAlign: 'center', paddingVertical: 24, fontSize: 14 },
})