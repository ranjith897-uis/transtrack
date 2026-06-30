import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, FlatList, Pressable } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { Button } from '@/components/Button';
import { useDriverLocationReporting } from '@/hooks/useDriverLocationReporting';
import { Trip, RouteDetail, Student } from '@/types';
import { DriverStackParamList } from '@/navigation/types';

type RouteParams = RouteProp<DriverStackParamList, 'ActiveTrip'>;
type Nav = NativeStackNavigationProp<DriverStackParamList, 'ActiveTrip'>;

// In production, mint one of these per driver phone (e.g. at first login,
// register a `devices` row with protocol DRIVER_APP and external_id tied
// to the user's id) rather than hardcoding org-wide values. Left simple
// here since real device provisioning is an infra decision, not a UI one.
const DRIVER_DEVICE_EXTERNAL_ID_PREFIX = 'DRIVER-APP-';
const DEVICE_INGEST_KEY = process.env.EXPO_PUBLIC_DEVICE_INGEST_KEY ?? 'dev-device-key-change-me';

export function ActiveTripScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation<Nav>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [boardedIds, setBoardedIds] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    const tripData = await api.get<{ trips: Trip[] }>('/trips');
    const found = tripData.trips.find((t) => t.id === params.tripId) ?? null;
    setTrip(found);

    if (found) {
      const routeData = await api.get<{ route: RouteDetail }>(`/routes/${found.route_id}`);
      setRoute(routeData.route);
    }

    const studentData = await api.get<{ students: Student[] }>('/students');
    setStudents(studentData.students.filter((s) => s.route_id === found?.route_id));
  }, [params.tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const isInProgress = trip?.status === 'IN_PROGRESS';
  const { permissionStatus, lastError } = useDriverLocationReporting({
    enabled: isInProgress,
    deviceExternalId: `${DRIVER_DEVICE_EXTERNAL_ID_PREFIX}${trip?.driver_id ?? 'unknown'}`,
    deviceIngestKey: DEVICE_INGEST_KEY,
  });

  async function handleStart() {
    if (!trip) return;
    setIsBusy(true);
    try {
      await api.post(`/trips/${trip.id}/start`);
      await load();
    } catch (err) {
      Alert.alert('Could not start trip', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleEnd() {
    if (!trip) return;
    Alert.alert('End trip?', 'This will stop location tracking for this trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End trip',
        style: 'destructive',
        onPress: async () => {
          setIsBusy(true);
          try {
            await api.post(`/trips/${trip.id}/end`);
            await load();
            navigation.goBack();
          } catch (err) {
            Alert.alert('Could not end trip', err instanceof Error ? err.message : 'Unknown error');
          } finally {
            setIsBusy(false);
          }
        },
      },
    ]);
  }

  async function handleSos() {
    if (!trip) return;
    Alert.alert('Raise SOS?', 'This immediately alerts dispatch and the fleet admin.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Raise SOS',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/trips/${trip.id}/sos`, { note: 'Raised from driver app' });
            Alert.alert('SOS sent', 'Dispatch has been notified.');
          } catch (err) {
            Alert.alert('Failed to send SOS', err instanceof Error ? err.message : 'Unknown error');
          }
        },
      },
    ]);
  }

  async function toggleBoarded(studentId: string) {
    if (!trip) return;
    const alreadyBoarded = boardedIds.has(studentId);
    try {
      await api.post(`/trips/${trip.id}/checkin`, {
        studentId,
        eventType: alreadyBoarded ? 'STUDENT_DROPPED' : 'STUDENT_BOARDED',
      });
      setBoardedIds((prev) => {
        const next = new Set(prev);
        if (alreadyBoarded) next.delete(studentId);
        else next.add(studentId);
        return next;
      });
    } catch (err) {
      Alert.alert('Check-in failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Loading trip…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{trip.route_name}</Text>
        <Text style={styles.subtitle}>{trip.vehicle_label} · {trip.trip_type}</Text>

        {isInProgress && permissionStatus === 'denied' && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Location permission denied — the fleet and parents won't see live updates until this is enabled.
            </Text>
          </View>
        )}
        {isInProgress && lastError && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>{lastError}</Text>
          </View>
        )}

        <View style={styles.actionRow}>
          {trip.status === 'SCHEDULED' && (
            <Button label="Start trip" onPress={handleStart} loading={isBusy} style={styles.flexButton} />
          )}
          {isInProgress && (
            <Button label="End trip" variant="secondary" onPress={handleEnd} loading={isBusy} style={styles.flexButton} />
          )}
        </View>

        {isInProgress && (
          <Button label="🚨 Raise SOS" variant="danger" onPress={handleSos} style={styles.sosButton} />
        )}

        <Text style={styles.sectionTitle}>Stops</Text>
        <View style={styles.stopsCard}>
          {[...(route?.stops ?? [])]
            .sort((a, b) => a.sequence - b.sequence)
            .map((stop) => (
              <View key={stop.id} style={styles.stopRow}>
                <Text style={styles.stopSeq}>{stop.sequence}</Text>
                <Text style={styles.stopName}>{stop.name}</Text>
              </View>
            ))}
        </View>

        <Text style={styles.sectionTitle}>Students on this route</Text>
        <FlatList
          data={students}
          keyExtractor={(s) => s.id}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const boarded = boardedIds.has(item.id);
            return (
              <Pressable style={styles.studentRow} onPress={() => toggleBoarded(item.id)}>
                <Text style={styles.studentName}>{item.full_name}</Text>
                <View style={[styles.checkbox, boarded && styles.checkboxChecked]}>
                  {boarded && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No students linked to this route.</Text>}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { textAlign: 'center', marginTop: 60, color: '#64748B' },
  title: { fontSize: 20, fontWeight: '700', color: '#0B1220' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2, marginBottom: 16 },
  warningBox: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 12 },
  warningText: { color: '#92400E', fontSize: 12.5 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  flexButton: { flex: 1 },
  sosButton: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  stopsCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#EEF2F6', padding: 14, marginBottom: 20 },
  stopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stopSeq: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 22, marginRight: 10 },
  stopName: { fontSize: 14, color: '#0B1220' },
  studentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#EEF2F6', padding: 14, marginBottom: 8 },
  studentName: { fontSize: 14, color: '#0B1220', fontWeight: '500' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#64748B', fontSize: 13, marginTop: 8 },
});
