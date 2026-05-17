

import api from './api'

export const getCallHistory = (page = 1, limit = 30) =>
  api.get(`/calls/history?page=${page}&limit=${limit}`).then((r) => r.data)

export const deleteCallHistoryItem = (id) =>
  api.delete(`/calls/history/${id}`).then((r) => r.data)

export const fetchAgoraToken = (channelName, uid, role = 'publisher') =>
  api.post('/agora/token', { channelName, uid, role }).then((r) => r.data)
