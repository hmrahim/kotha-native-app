import { Redirect } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import { View, ActivityIndicator } from 'react-native'

export default function Index() {
  const { user, loading } = useAuth()

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* কালো screen দেখাবে, flash হবে না */}
    </View>
  )

  if (!user) return <Redirect href="/login" />

  return <Redirect href="/(tab)" />
}