import { query, queryOne } from '@/db/pool';
import { redisPublisher, tripEventChannel } from '@/modules/tracking/redis.client';
import { TripEventType } from '@/types';
import { sendNotificationToTripParents } from '@/modules/notifications/notifications.service';

/**
 * In-memory "are we currently inside this stop's geofence" tracker,
 * keyed by `${tripId}:${stopId}`. This only needs to survive for the
 * lifetime of a trip and doesn't need to be durable across restarts —
 * worst case on a restart mid-trip, one arrival/departure pair might be
 * missed or re-fired, which is an acceptable tradeoff for this scale.
 * (At higher scale, or to survive restarts, move this to Redis with a
 * TTL instead of a process-local Map.)
 */
const insideGeofence = new Map<string, boolean>();

export async function recordTripEvent(
  tripId: string,
  eventType: TripEventType,
  metadata: { stopId?: string; studentId?: string; [key: string]: unknown }
) {
  const event = await queryOne(
    `INSERT INTO trip_events (trip_id, event_type, stop_id, student_id, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tripId, eventType, metadata.stopId ?? null, metadata.studentId ?? null, JSON.stringify(metadata)]
  );

  await redisPublisher.publish(tripEventChannel(tripId), JSON.stringify(event));

  // Fire-and-forget notification dispatch — a notification failure should
  // never fail the underlying trip/location operation that triggered it.
  sendNotificationToTripParents(tripId, eventType, metadata).catch((err) => {
    console.error('[notifications] failed to dispatch for event', eventType, err);
  });

  return event;
}

interface StopWithDistance {
  id: string;
  name: string;
  sequence: number;
  geofence_radius_m: number;
  distance_m: number;
}

/**
 * Checks a new vehicle position against every stop on the trip's route.
 * Fires STOP_ARRIVED the moment the vehicle enters a stop's radius, and
 * STOP_DEPARTED the moment it leaves — using PostGIS ST_Distance so the
 * math accounts for real-world geography, not flat-plane approximation.
 */
export async function checkGeofences(tripId: string, lat: number, lng: number) {
  const trip = await queryOne<{ route_id: string }>('SELECT route_id FROM trips WHERE id = $1', [tripId]);
  if (!trip) return;

  const stops = await query<StopWithDistance>(
    `SELECT id, name, sequence, geofence_radius_m,
            ST_Distance(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) as distance_m
     FROM stops WHERE route_id = $3 ORDER BY sequence`,
    [lat, lng, trip.route_id]
  );

  for (const stop of stops) {
    const key = `${tripId}:${stop.id}`;
    const wasInside = insideGeofence.get(key) ?? false;
    const isInside = stop.distance_m <= stop.geofence_radius_m;

    if (isInside && !wasInside) {
      insideGeofence.set(key, true);
      await recordTripEvent(tripId, 'STOP_ARRIVED', { stopId: stop.id, stopName: stop.name, distanceM: stop.distance_m });
    } else if (!isInside && wasInside) {
      insideGeofence.set(key, false);
      await recordTripEvent(tripId, 'STOP_DEPARTED', { stopId: stop.id, stopName: stop.name });
    }
  }
}

/** Clears in-memory geofence state for a trip — call when a trip ends. */
export function clearGeofenceState(tripId: string) {
  for (const key of insideGeofence.keys()) {
    if (key.startsWith(`${tripId}:`)) insideGeofence.delete(key);
  }
}
