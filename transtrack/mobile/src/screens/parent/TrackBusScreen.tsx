import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { useLiveTracking } from '@/hooks/useLiveTracking';
import { RouteDetail, Trip } from '@/types';
import { ParentStackParamList } from '@/navigation/types';

type RouteParams = RouteProp<ParentStackParamList, 'TrackBus'>;
type Nav = NativeStackNavigationProp<ParentStackParamList, 'TrackBus'>;

const STALE_THRESHOLD_MS = 30_000;

export function TrackBusScreen() {
  const { params } = useRoute<RouteParams>();
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<MapView>(null);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const { vehicles, tripEvents, connected, watchVehicle, unwatchVehicle } = useLiveTracking();

  useEffect(() => {
    api.get<{ trips: Trip[] }>('/trips').then((d) => {
      const trip = d.trips.find((t) => t.id === params.tripId);
      if (trip) {
        api.get<{ route: RouteDetail }>(`/routes/${trip.route_id}`).then((rd) => setRoute(rd.route));
      }
    });
  }, [params.tripId]);

  useEffect(() => {
    watchVehicle(params.vehicleId);
    return () => unwatchVehicle(params.vehicleId);
  }, [params.vehicleId, watchVehicle, unwatchVehicle]);

  const live = vehicles[params.vehicleId];
  const isStale = live ? Date.now() - new Date(live.lastUpdatedAt).getTime() > STALE_THRESHOLD_MS : true;

  useEffect(() => {
    if (live && mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: live.lat, longitude: live.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 } as Region,
        500
      );
    }
  }, [live?.lat, live?.lng]);

  const relevantEvents = tripEvents.filter((e) => e.trip_id === params.tripId).slice(0, 5);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>{params.studentName}'s bus</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: live?.lat ?? route?.stops[0]?.lat ?? 17.428,
            longitude: live?.lng ?? route?.stops[0]?.lng ?? 78.48,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
        >
          {route && (
            <Polyline
              coordinates={[...route.stops]
                .sort((a, b) => a.sequence - b.sequence)
                .map((s) => ({ latitude: s.lat, longitude: s.lng }))}
              strokeColor="#2563EB"
              strokeWidth={3}
              lineDashPattern={[6, 6]}
            />
          )}
          {route?.stops.map((stop) => (
            <Marker key={stop.id} coordinate={{ latitude: stop.lat, longitude: stop.lng }} title={stop.name} pinColor="#64748B" />
          ))}
          {live && (
            <Marker coordinate={{ latitude: live.lat, longitude: live.lng }} title="Bus">
              <View style={[styles.busMarker, isStale && styles.busMarkerStale]}>
                <Text style={styles.busMarkerText}>🚌</Text>
              </View>
            </Marker>
          )}
        </MapView>

        <View style={styles.statusBar}>
          <View style={[styles.statusDot, { backgroundColor: connected && !isStale ? '#16A34A' : '#94A3B8' }]} />
          <Text style={styles.statusText}>
            {!connected ? 'Connecting…' : isStale ? 'Signal stale — last seen a moment ago' : 'Live'}
          </Text>
          {live?.speedKmh != null && <Text style={styles.statusSpeed}>{live.speedKmh.toFixed(0)} km/h</Text>}
        </View>
      </View>

      <View style={styles.eventsPanel}>
        <Text style={styles.eventsTitle}>Recent updates</Text>
        {relevantEvents.length === 0 && <Text style={styles.eventsEmpty}>No updates yet.</Text>}
        {relevantEvents.map((e) => (
          <View key={e.id} style={styles.eventRow}>
            <Text style={styles.eventText}>{formatEventType(e.event_type)}</Text>
            <Text style={styles.eventTime}>{new Date(e.occurred_at).toLocaleTimeString()}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function formatEventType(type: string): string {
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: '#2563EB', fontSize: 15, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700', color: '#0B1220' },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  busMarker: { backgroundColor: '#2563EB', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  busMarkerStale: { backgroundColor: '#94A3B8' },
  busMarkerText: { fontSize: 16 },
  statusBar: { position: 'absolute', top: 12, left: 12, right: 12, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { fontSize: 13, color: '#0B1220', fontWeight: '500', flex: 1 },
  statusSpeed: { fontSize: 13, color: '#64748B', fontFamily: 'monospace' },
  eventsPanel: { borderTopWidth: 1, borderTopColor: '#EEF2F6', padding: 16, maxHeight: 180 },
  eventsTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 },
  eventsEmpty: { fontSize: 13, color: '#94A3B8' },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  eventText: { fontSize: 13.5, color: '#0B1220' },
  eventTime: { fontSize: 12, color: '#94A3B8' },
});
