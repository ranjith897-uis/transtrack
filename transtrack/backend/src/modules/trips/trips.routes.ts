import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '@/db/pool';
import { asyncHandler, ApiError } from '@/middleware/error.middleware';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { recordTripEvent, clearGeofenceState } from '@/modules/tracking/geofence.service';
import { Trip } from '@/types';

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

/**
 * Returns trips relevant to the caller:
 *  - DRIVER: only their own trips
 *  - PARENT: only trips on routes their linked students ride
 *  - ADMIN/DISPATCHER: everything in the org
 */
tripsRouter.get('/', asyncHandler(async (req, res) => {
  const { role, userId, organizationId } = req.auth!;

  if (role === 'DRIVER') {
    const trips = await query(
      `SELECT t.*, v.label as vehicle_label, r.name as route_name
       FROM trips t
       JOIN vehicles v ON v.id = t.vehicle_id
       JOIN routes r ON r.id = t.route_id
       WHERE t.driver_id = $1 AND t.organization_id = $2
       ORDER BY t.scheduled_start DESC LIMIT 50`,
      [userId, organizationId]
    );
    return res.json({ trips });
  }

  if (role === 'PARENT') {
    const trips = await query(
      `SELECT DISTINCT t.*, v.label as vehicle_label, r.name as route_name
       FROM trips t
       JOIN vehicles v ON v.id = t.vehicle_id
       JOIN routes r ON r.id = t.route_id
       JOIN students s ON s.route_id = t.route_id
       JOIN student_parents sp ON sp.student_id = s.id
       WHERE sp.parent_user_id = $1 AND t.organization_id = $2
         AND t.status IN ('SCHEDULED', 'IN_PROGRESS')
       ORDER BY t.scheduled_start DESC LIMIT 20`,
      [userId, organizationId]
    );
    return res.json({ trips });
  }

  const trips = await query(
    `SELECT t.*, v.label as vehicle_label, r.name as route_name, u.full_name as driver_name
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN routes r ON r.id = t.route_id
     JOIN users u ON u.id = t.driver_id
     WHERE t.organization_id = $1
     ORDER BY t.scheduled_start DESC LIMIT 100`,
    [organizationId]
  );
  res.json({ trips });
}));

const createTripSchema = z.object({
  routeId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  tripType: z.enum(['PICKUP', 'DROPOFF', 'FIELD_TRIP', 'OTHER']).default('PICKUP'),
  scheduledStart: z.string(), // ISO timestamp
});

tripsRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = createTripSchema.parse(req.body);
  const trip = await queryOne<Trip>(
    `INSERT INTO trips (organization_id, route_id, vehicle_id, driver_id, trip_type, scheduled_start)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.auth!.organizationId, body.routeId, body.vehicleId, body.driverId, body.tripType, body.scheduledStart]
  );
  res.status(201).json({ trip });
}));

/** Driver starts their trip. Only the assigned driver (or an admin) can do this. */
tripsRouter.post('/:id/start', asyncHandler(async (req, res) => {
  const trip = await queryOne<Trip>('SELECT * FROM trips WHERE id = $1 AND organization_id = $2', [req.params.id, req.auth!.organizationId]);
  if (!trip) throw new ApiError(404, 'Trip not found');

  if (req.auth!.role === 'DRIVER' && trip.driver_id !== req.auth!.userId) {
    throw new ApiError(403, 'You are not assigned to this trip');
  }
  if (trip.status !== 'SCHEDULED') {
    throw new ApiError(400, `Trip cannot be started from status ${trip.status}`);
  }

  const updated = await queryOne<Trip>(
    `UPDATE trips SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1 RETURNING *`,
    [trip.id]
  );
  await recordTripEvent(trip.id, 'TRIP_STARTED', {});
  res.json({ trip: updated });
}));

tripsRouter.post('/:id/end', asyncHandler(async (req, res) => {
  const trip = await queryOne<Trip>('SELECT * FROM trips WHERE id = $1 AND organization_id = $2', [req.params.id, req.auth!.organizationId]);
  if (!trip) throw new ApiError(404, 'Trip not found');

  if (req.auth!.role === 'DRIVER' && trip.driver_id !== req.auth!.userId) {
    throw new ApiError(403, 'You are not assigned to this trip');
  }
  if (trip.status !== 'IN_PROGRESS') {
    throw new ApiError(400, `Trip cannot be ended from status ${trip.status}`);
  }

  const updated = await queryOne<Trip>(
    `UPDATE trips SET status = 'COMPLETED', ended_at = now() WHERE id = $1 RETURNING *`,
    [trip.id]
  );
  await recordTripEvent(trip.id, 'TRIP_ENDED', {});
  clearGeofenceState(trip.id);
  res.json({ trip: updated });
}));

/** Driver-initiated SOS — highest priority event, bypasses normal flow. */
tripsRouter.post('/:id/sos', asyncHandler(async (req, res) => {
  const trip = await queryOne<Trip>('SELECT * FROM trips WHERE id = $1 AND organization_id = $2', [req.params.id, req.auth!.organizationId]);
  if (!trip) throw new ApiError(404, 'Trip not found');

  await recordTripEvent(trip.id, 'SOS', { raisedBy: req.auth!.userId, note: req.body?.note ?? null });
  res.json({ ok: true });
}));

tripsRouter.get('/:id/events', asyncHandler(async (req, res) => {
  const events = await query(
    `SELECT * FROM trip_events WHERE trip_id = $1 ORDER BY occurred_at ASC`,
    [req.params.id]
  );
  res.json({ events });
}));

/** Student boarding/drop-off check-in, used by the driver app. */
const checkinSchema = z.object({
  studentId: z.string().uuid(),
  eventType: z.enum(['STUDENT_BOARDED', 'STUDENT_DROPPED']),
  stopId: z.string().uuid().optional(),
});

tripsRouter.post('/:id/checkin', asyncHandler(async (req, res) => {
  const body = checkinSchema.parse(req.body);
  const trip = await queryOne<Trip>('SELECT * FROM trips WHERE id = $1 AND organization_id = $2', [req.params.id, req.auth!.organizationId]);
  if (!trip) throw new ApiError(404, 'Trip not found');

  await recordTripEvent(trip.id, body.eventType, { stopId: body.stopId, studentId: body.studentId });
  res.json({ ok: true });
}));
