import axios from 'axios'
import { getAuth } from '../firebase/firebaseConfig'


const API_URL ='https://kotha-server-c5wy.onrender.com/api'


console.log('🌐 API base URL:', API_URL)

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
})

api.interceptors.request.use(
  async (config) => {
    try {
      const auth = getAuth()
      const user = auth?.currentUser
      if (user) {
        const token = await user.getIdToken()
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (e) {
      console.log('⚠️ Token attach failed:', e?.message)
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Retry once on Network Error
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config || {}
    if (!cfg.__retried && error.message === 'Network Error') {
      cfg.__retried = true
      await new Promise((r) => setTimeout(r, 800))
      return api(cfg)
    }
    return Promise.reject(error)
  }
)

export const postUser = async (user) => {
  const res = await api.post('/user', user)
  return res.status === 200 ? res.data : null
}
export const getCurrentUser = async () => {
  const res = await api.get('/get-current-user')
  return res.status === 200 ? res.data : null
}
export const getUser = async () => {
  const res = await api.get('/get-connected-users')
  return res.status === 200 ? res.data : null
}
export const getActiveUser = async (id) => {
  const res = await api.get(`/get-active-user/${id}`)
  return res.status === 200 ? res.data : null
}
export const searchUserByEmail = async (email) => {
  const res = await api.get(`/search-user/${encodeURIComponent(email)}`)
  return res.status === 200 ? res.data : null
}
export const updateProfile = async (payload) => {
  const res = await api.patch('/update-profile', payload)
  return res.status === 200 ? res.data : null
}
export const createMessage = async (payload) => {
  const res = await api.post('/create-chat', payload)
  return res.status === 200 ? res.data : null
}
export const getMessage = async (id) => {
  const res = await api.get(`/get-message/${id}`)
  return res.status === 200 ? res.data : null
}
export const markSeen = async (chatId) => {
  const res = await api.patch(`/mark-seen/${chatId}`)
  return res.status === 200 ? res.data : null
}
export const deleteForMe = async (bodyData) => {
  const res = await api.delete(`/delete-for-me/${bodyData.id}`, { data: { deleteFor: bodyData.deleteFor } })
  return res.status === 200 ? res.data : null
}
export const sendFriendRequest = async (id) => {
  const res = await api.post('/send-request', { id })
  return res.status === 200 ? res.data : null
}
export const getSentRequests = async () => {
  const res = await api.get('/get-sent-requests')
  return res.status === 200 ? res.data : null
}
export const getReceivedRequests = async () => {
  const res = await api.get('/get-received-requests')
  return res.status === 200 ? res.data : null
}
export const acceptRequest = async (id) => {
  const res = await api.patch(`/accept-request/${id}`)
  return res.status === 200 ? res.data : null
}
export const rejectRequest = async (id) => {
  const res = await api.delete(`/reject-request/${id}`)
  return res.status === 200 ? res.data : null
}
export const getUnseenCount = async () => {
  const res = await api.get('/get-unseen-count')
  return res.status === 200 ? res.data : null
}

// ✅ NEW — Message Requests
export const getMessageRequests = async () => {
  const res = await api.get('/get-message-requests')
  return res.status === 200 ? res.data : null
}

export const editMessage = (messageId, text) =>
  api.patch(`/messages/${messageId}`, { text }).then((r) => r.data)

export const deleteMessage = (messageId, deleteFor) =>
  api.delete(`/messages/${messageId}`, { data: { deleteFor } }).then((r) => r.data)

// FCM token registration for push notifications
export const registerFcmToken = (token) =>
  api.post('/register-fcm-token', { token }).then((r) => r.data)

export const removeFcmToken = (token) =>
  api.post('/remove-fcm-token', { token }).then((r) => r.data)

// ─── Stories ──────────────────────────────────────────────────────────────────
export const createStory = (media) =>
  api.post('/story', { media }).then((r) => r.data)

export const getStories = () =>
  api.get('/stories').then((r) => r.data)

export const viewStory = (storyId) =>
  api.post(`/story/${storyId}/view`).then((r) => r.data)

export const replyToStory = (storyId, text) =>
  api.post(`/story/${storyId}/reply`, { text }).then((r) => r.data)

export const deleteStory = (storyId) =>
  api.delete(`/story/${storyId}`).then((r) => r.data)

export const getStoryViews = (storyId) =>
  api.get(`/story/${storyId}/views`).then((r) => r.data)

export default api
// ─── Block / Unblock ──────────────────────────────────────────────────────────
export const blockUser = (targetUserId) =>
  api.post(`/block-user/${targetUserId}`).then((r) => r.data)

export const unblockUser = (targetUserId) =>
  api.post(`/unblock-user/${targetUserId}`).then((r) => r.data)

export const getBlockStatus = (targetUserId) =>
  api.get(`/block-status/${targetUserId}`).then((r) => r.data)

// ─── Hide Chat ────────────────────────────────────────────────────────────────
// chat list থেকে সরিয়ে দেয়, নতুন message আসলে আবার দেখাবে
export const hideChat = (receiverId) =>
  api.delete(`/hide-chat/${receiverId}`).then((r) => r.data)

// ─── Nickname ─────────────────────────────────────────────────────────────────
// targetUserId = যার nickname দিতে চাও, nickname = '' হলে remove
export const setNickname = (receiverId, targetUserId, nickname) =>
  api.patch(`/set-nickname/${receiverId}`, { targetUserId, nickname }).then((r) => r.data)

export const getNicknames = (receiverId) =>
  api.get(`/get-nicknames/${receiverId}`).then((r) => r.data)

// ─── Chat Background ──────────────────────────────────────────────────────────
export const getChatBackground = (receiverId) =>
  api.get(`/chat-background/${receiverId}`).then((r) => r.data)

export const setChatBackground = (chatId, type, value, presetId) =>
  api.patch(`/chat-background/${chatId}`, { type, value, presetId }).then((r) => r.data)

// chatId না থাকলে receiverId দিয়ে set করো (server-এ chat খুঁজে নেবে)
export const setChatBackgroundByReceiver = (receiverId, type, value, presetId) =>
  api.patch(`/chat-background-by-receiver/${receiverId}`, { type, value, presetId }).then((r) => r.data)

// ─── Call History ─────────────────────────────────────────────────────────────
// দুইজনের মধ্যে call history — chat screen এ messages এর সাথে merge করার জন্য
export const getCallsBetween = (otherId) =>
  api.get(`/calls/between/${otherId}`).then((r) => r.data)