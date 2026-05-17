

import React, { useEffect, useState, useCallback } from 'react'
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl, StatusBar, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

// import { getCallHistory, deleteCallHistoryItem } from '../../services/callApi'
// import { getSocket } from '../../services/socket'
import { T } from '../theme'
import { deleteCallHistoryItem, getCallHistory } from '../services/callApi'
import { getSocket } from '../services/socket'

const fmtTime = (date) => {
    const d = new Date(date); const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

const fmtDur = (s) => {
    if (!s) return ''
    const m = Math.floor(s / 60), sec = s % 60
    return m ? `${m}m ${sec}s` : `${sec}s`
}

export default function CallsScreen() {
    const insets = useSafeAreaInsets()
    const router = useRouter()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await getCallHistory(1, 50)
            setItems(res?.data ?? [])
        } catch (e) { console.log('load history err:', e?.message) }
        finally { setLoading(false); setRefreshing(false) }
    }, [])

    useEffect(() => { load() }, [load])

    // Refresh when new call ends
    useEffect(() => {
        const id = setInterval(() => {
            const socket = getSocket()
            if (!socket?.connected) return
            const onEnded = () => load()
            socket.off('call:ended', onEnded); socket.on('call:ended', onEnded)
            socket.off('call:rejected', onEnded); socket.on('call:rejected', onEnded)
            socket.off('call:canceled', onEnded); socket.on('call:canceled', onEnded)
            socket.off('call:timeout', onEnded); socket.on('call:timeout', onEnded)
            clearInterval(id)
        }, 1000)
        return () => clearInterval(id)
    }, [load])

    const startCall = (item, callType) => {
        const socket = getSocket()
        if (!socket?.connected) return Alert.alert('Offline', 'Connect to internet first')
        socket.emit('call:initiate', { receiverId: item.other?._id, type: callType }, (ack) => {
            if (!ack?.ok) {
                if (ack?.error === 'busy') return Alert.alert('Busy', 'User is on another call')
                if (ack?.error === 'blocked' || ack?.error === 'blocked_by_you') return Alert.alert('Blocked', 'Cannot call this user')
                return Alert.alert('Error', ack?.error || 'Failed to start call')
            }
            router.push({
                pathname: '/call',
                params: {
                    callId: ack.callId, channelName: ack.channelName, type: callType,
                    token: ack.token, uid: String(ack.uid), appId: ack.appId,
                    peerName: item.other?.name || '', peerAvatar: item.other?.photo || '',
                    outgoing: '1',
                },
            })
        })
    }

    const handleDelete = (id) => {
        Alert.alert('Delete?', 'Remove this call from history', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    await deleteCallHistoryItem(id).catch(() => { })
                    setItems((prev) => prev.filter((x) => x._id !== id))
                }
            },
        ])
    }

    const renderItem = ({ item }) => {
        const missed = item.status === 'missed' || item.status === 'rejected' || item.status === 'timeout'
        const arrowIcon = item.isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline'
        const arrowColor = missed ? T.red ?? '#F87171' : T.accent
        return (
            <TouchableOpacity style={s.row} activeOpacity={0.7} onLongPress={() => handleDelete(item._id)}>
                {item.other?.photo ? (
                    <Image source={{ uri: item.other.photo }} style={s.avatar} />
                ) : (
                    <View style={[s.avatar, s.avatarFallback]}>
                        <Text style={s.avatarTxt}>{(item.other?.name?.[0] || '?').toUpperCase()}</Text>
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <Text style={[s.name, missed && { color: T.red ?? '#F87171' }]} numberOfLines={1}>
                        {item.other?.name || 'Unknown'}
                    </Text>
                    <View style={s.subRow}>
                        <Ionicons name={arrowIcon} size={13} color={arrowColor} />
                        <Text style={s.subText}>
                            {item.status === 'missed' ? 'Missed' : item.status === 'rejected' ? 'Declined' : item.status === 'timeout' ? 'No answer' : fmtDur(item.durationSeconds) || 'Call'}
                            {'  •  '}{fmtTime(item.createdAt)}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => startCall(item, item.type)} style={s.callBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={item.type === 'video' ? 'videocam' : 'call'} size={22} color={T.accent} />
                </TouchableOpacity>
            </TouchableOpacity>
        )
    }

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={T.surface} />
            <View style={s.header}>
                <View style={s.headerLeft}>
                    <View style={s.headerAccent} />
                    <Text style={s.headerTitle}>Calls</Text>
                </View>
            </View>

            <FlatList
                data={items}
                keyExtractor={(item) => item._id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingVertical: 8 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); load() }}
                        tintColor={T.accent}
                    />
                }
                ListEmptyComponent={
                    !loading && (
                        <View style={s.empty}>
                            <Ionicons name="call-outline" size={64} color={T.textMuted ?? '#484F58'} />
                            <Text style={s.emptyTxt}>No call history yet</Text>
                            <Text style={s.emptySub}>Start a call from any chat</Text>
                        </View>
                    )
                }
            />
        </View>
    )
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAccent: { width: 4, height: 22, borderRadius: 2, backgroundColor: T.accent },
    headerTitle: { fontSize: 22, fontWeight: '800', color: T.textPrimary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
    avatar: { width: 48, height: 48, borderRadius: 24 },
    avatarFallback: { backgroundColor: T.accentDim, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { color: T.accent, fontWeight: '800', fontSize: 18 },
    name: { color: T.textPrimary, fontSize: 16, fontWeight: '600' },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    subText: { color: T.textSecond, fontSize: 12 },
    callBtn: { padding: 8, borderRadius: 20, backgroundColor: T.accentDim },
    empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 8 },
    emptyTxt: { color: T.textPrimary, fontSize: 16, fontWeight: '600', marginTop: 10 },
    emptySub: { color: T.textSecond, fontSize: 13 },
})
