import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, Pressable, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Student, Trip } from '@/types';
import { ParentStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<ParentStackParamList, 'ParentHome'>;

export function ParentHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [students, setStudents] = useState<Student[]>([]);
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const load = useCallback(async () => {
    const [studentData, tripData] = await Promise.all([
      api.get<{ students: Student[] }>('/students'),
      api.get<{ trips: Trip[] }>('/trips'),
    ]);
    setStudents(studentData.students);
    setActiveTrips(tripData.trips.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'SCHEDULED'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function tripForStudent(student: Student): Trip | undefined {
    return activeTrips.find((t) => t.route_id === student.route_id);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {user?.full_name?.split(' ')[0]}</Text>
          <Text style={styles.subtitle}>Your children</Text>
        </View>
        <Pressable onPress={logout}><Text style={styles.signOut}>Sign out</Text></Pressable>
      </View>

      <FlatList
        data={students}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No students linked to your account yet.</Text>}
        renderItem={({ item }) => {
          const trip = tripForStudent(item);
          const isLive = trip?.status === 'IN_PROGRESS';
          return (
            <Pressable
              style={styles.card}
              disabled={!trip || !isLive}
              onPress={() => {
                if (trip && isLive) {
                  navigation.navigate('TrackBus', { tripId: trip.id, vehicleId: trip.vehicle_id, studentName: item.full_name });
                }
              }}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.full_name}</Text>
                {isLive && <View style={styles.liveDot} />}
              </View>
              <Text style={styles.cardMeta}>{item.grade ?? 'No grade set'}</Text>
              {trip ? (
                <Text style={[styles.cardStatus, isLive && styles.cardStatusLive]}>
                  {isLive ? `${trip.vehicle_label} is en route — tap to track` : `Next trip scheduled · ${trip.vehicle_label}`}
                </Text>
              ) : (
                <Text style={styles.cardStatus}>No trip scheduled right now</Text>
              )}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0B1220' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  cardMeta: { fontSize: 12.5, color: '#64748B', marginTop: 2 },
  cardStatus: { fontSize: 13, color: '#64748B', marginTop: 8 },
  cardStatusLive: { color: '#16A34A', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#64748B', marginTop: 60, fontSize: 14 },
});
