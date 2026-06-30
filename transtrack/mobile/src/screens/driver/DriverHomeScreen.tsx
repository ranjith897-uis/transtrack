import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Trip } from '@/types';
import { DriverStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<DriverStackParamList, 'DriverHome'>;

export function DriverHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const load = useCallback(async () => {
    const data = await api.get<{ trips: Trip[] }>('/trips');
    setTrips(data.trips);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {user?.full_name?.split(' ')[0]}</Text>
          <Text style={styles.subtitle}>Your trips</Text>
        </View>
        <Pressable onPress={logout}><Text style={styles.signOut}>Sign out</Text></Pressable>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No trips assigned yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('ActiveTrip', { tripId: item.id })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.route_name}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.cardMeta}>{item.vehicle_label} · {item.trip_type}</Text>
            <Text style={styles.cardMeta}>{new Date(item.scheduled_start).toLocaleString()}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: Trip['status'] }) {
  const colors: Record<Trip['status'], { bg: string; fg: string }> = {
    SCHEDULED: { bg: '#F1F5F9', fg: '#64748B' },
    IN_PROGRESS: { bg: '#DCFCE7', fg: '#16A34A' },
    COMPLETED: { bg: '#DBEAFE', fg: '#2563EB' },
    CANCELLED: { bg: '#FEE2E2', fg: '#DC2626' },
  };
  const c = colors[status];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{status.replace('_', ' ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  greeting: { fontSize: 20, fontWeight: '700', color: '#0B1220' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  signOut: { fontSize: 13, color: '#2563EB', fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#EEF2F6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0B1220' },
  cardMeta: { fontSize: 12.5, color: '#64748B', marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#64748B', marginTop: 60, fontSize: 14 },
});
