import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '@/db/pool';
import { asyncHandler, ApiError } from '@/middleware/error.middleware';
import { requireAuth } from '@/middleware/auth.middleware';
import { requireDeviceKey } from '@/middleware/device.middleware';
import { redisPublisher, vehicleLocationChannel } from '@/modules/tracking/redis.client';
import { checkGeofences } from '@/modules/tracking/geofence.service';
import { liveVehicleStates } from '@/modules/tracking/live-state';

export const trackingRouter = Router();

/**
 * Ingestion endpoint — this is the ONE normalized interface that every
 * GPS source feeds through: real hardware adapters, the driver app's
 * own GPS (fallback path), and the simulator all call this exact shape.
 * See ARCHITECTURE.md §3 for why this seam matters.
 */
const ingestSchema = z.object({
  deviceExternalId: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKmh: z.number().nonnegative().optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracyM: z.number().nonnegative().optional(),
  recordedAt: z.string().optional(), // ISO timestamp; defaults to server time
});

trackingRouter.post('/ingest', requireDeviceKey, asyncHandler(async (req, res) => {
  const body = ingestSchema.parse(req.body);

  const device = await queryOne<{ id: string; vehicle_id: string | null }>(
    'SELECT id, vehicle_id FROM devices WHERE external_id = $1',
    [body.deviceExternalId]
  );
  if (!device) throw new ApiError(404, `Unknown device: ${body.deviceExternalId}`);
  if (!device.vehicle_id) throw new ApiError(409, 'Device is not assigned to a vehicle');

  await query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [device.id]);

  // Find the vehicle's currently in-progress trip, if any — pings are
  // still recorded even with no active trip (e.g. depot movement), but
  // are only associated with a trip_id when one is running.
  const activeTrip = await queryOne<{ id: string }>(
    `SELECT id FROM trips WHERE vehicle_id = $1 AND status = 'IN_PROGRESS' LIMIT 1`,
    [device.vehicle_id]
  );

  const recordedAt = body.recordedAt ?? new Date().toISOString();

  await query(
    `INSERT INTO location_pings (vehicle_id, trip_id, location, speed_kmh, heading, accuracy_m, recorded_at)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, $7, $8)`,
    [device.vehicle_id, activeTrip?.id ?? null, body.lat, body.lng, body.speedKmh ?? null, body.heading ?? null, body.accuracyM ?? null, recordedAt]
  );

  const liveState = {
    vehicleId: device.vehicle_id,
    tripId: activeTrip?.id ?? null,
    lat: body.lat,
    lng: body.lng,
    speedKmh: body.speedKmh ?? null,
    heading: body.heading ?? null,
    lastUpdatedAt: recordedAt,
  };

  liveVehicleStates.set(device.vehicle_id, liveState);
  await redisPublisher.publish(vehicleLocationChannel(device.vehicle_id), JSON.stringify(liveState));

  if (activeTrip) {
    await checkGeofences(activeTrip.id, body.lat, body.lng);
  }

  res.json({ ok: true });
}));

// ─────────────────────────────────────────────────────────────────
// Query endpoints (consumed by web/mobile, require user auth)
// ─────────────────────────────────────────────────────────────────

trackingRouter.use(requireAuth);

/** Current live position of every vehicle the caller is allowed to see. */
trackingRouter.get('/live', asyncHandler(async (req, res) => {
  const { role, userId, organizationId } = req.auth!;

  let vehicleIds: string[];

  if (role === 'PARENT') {
    const rows = await query<{ vehicle_id: string }>(
      `SELECT DISTINCT t.vehicle_id FROM trips t
       JOIN students s ON s.route_id = t.route_id
       JOIN student_parents sp ON sp.student_id = s.id
       WHERE sp.parent_user_id = $1 AND t.status = 'IN_PROGRESS'`,
      [userId]
    );
    vehicleIds = rows.map((r) => r.vehicle_id);
  } else if (role === 'DRIVER') {
    const rows = await query<{ id: string }>(
      `SELECT id FROM vehicles WHERE current_driver_id = $1`,
      [userId]
    );
    vehicleIds = rows.map((r) => r.id);
  } else {
    const rows = await query<{ id: string }>(`SELECT id FROM vehicles WHERE organization_id = $1`, [organizationId]);
    vehicleIds = rows.map((r) => r.id);
  }

  const liveStates = vehicleIds
    .map((id) => liveVehicleStates.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  res.json({ vehicles: liveStates });
}));

trackingRouter.get('/trips/:tripId/history', asyncHandler(async (req, res) => {
  const points = await query(
    `SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
            speed_kmh, heading, recorded_at
     FROM location_pings WHERE trip_id = $1 ORDER BY recorded_at ASC`,
    [req.params.tripId]
  );
  res.json({ points });
}));
