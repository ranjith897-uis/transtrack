import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { API_BASE_URL } from '@/lib/api';

const REPORT_INTERVAL_MS = 5000;

// The driver app's own GPS is the fallback ingestion path described in
// ARCHITECTURE.md §3 — it posts to the exact same /tracking/ingest endpoint
// real hardware will use, via a per-driver "device" record. The backend
// treats this no differently from a hardware tracker; see devices table
// (protocol = 'DRIVER_APP').
//
// IMPORTANT: this posts with the device ingest key, the same as hardware
// would — NOT the driver's own JWT — because /tracking/ingest is designed
// to be device-authenticated, not user-authenticated. In a production
// rollout, mint a unique device_external_id per driver phone (e.g. tied to
// their user id) rather than hardcoding one, so pings can be attributed and
// revoked per-device.
export function useDriverLocationReporting(params: {
  enabled: boolean;
  deviceExternalId: string;
  deviceIngestKey: string;
}) {
  const { enabled, deviceExternalId, deviceIngestKey } = params;
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [lastError, setLastError] = useState<string | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!enabled) {
      watcherRef.current?.remove();
      watcherRef.current = null;
      return;
    }

    let cancelled = false;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== 'granted') {
        setPermissionStatus('denied');
        setLastError('Location permission is required to start a trip.');
        return;
      }
      setPermissionStatus('granted');

      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: REPORT_INTERVAL_MS,
          distanceInterval: 10, // meters
        },
        async (location) => {
          try {
            await fetch(`${API_BASE_URL}/tracking/ingest`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-device-key': deviceIngestKey,
              },
              body: JSON.stringify({
                deviceExternalId,
                lat: location.coords.latitude,
                lng: location.coords.longitude,
                speedKmh: location.coords.speed != null ? Math.max(0, location.coords.speed * 3.6) : undefined,
                heading: location.coords.heading ?? undefined,
                accuracyM: location.coords.accuracy ?? undefined,
              }),
            });
            setLastError(null);
          } catch (err) {
            setLastError('Failed to report location — check connectivity.');
            console.warn('[location-reporting] ingest failed', err);
          }
        }
      );
    }

    start();

    return () => {
      cancelled = true;
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
  }, [enabled, deviceExternalId, deviceIngestKey]);

  return { permissionStatus, lastError };
}
