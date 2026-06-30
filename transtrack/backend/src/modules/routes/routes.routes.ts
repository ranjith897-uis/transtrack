import { Router } from 'express';
import { z } from 'zod';
import { pool, query, queryOne } from '@/db/pool';
import { asyncHandler, ApiError } from '@/middleware/error.middleware';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';

export const routesRouter = Router();
routesRouter.use(requireAuth);

routesRouter.get('/', asyncHandler(async (req, res) => {
  const routes = await query(
    `SELECT id, name, description, created_at FROM routes WHERE organization_id = $1 ORDER BY name`,
    [req.auth!.organizationId]
  );
  res.json({ routes });
}));

routesRouter.get('/:id', asyncHandler(async (req, res) => {
  const route = await queryOne(
    `SELECT id, name, description FROM routes WHERE id = $1 AND organization_id = $2`,
    [req.params.id, req.auth!.organizationId]
  );
  if (!route) throw new ApiError(404, 'Route not found');

  const stops = await query(
    `SELECT id, name, sequence, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
            geofence_radius_m, scheduled_time
     FROM stops WHERE route_id = $1 ORDER BY sequence`,
    [req.params.id]
  );

  res.json({ route: { ...route, stops } });
}));

const createRouteSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  stops: z.array(z.object({
    name: z.string().min(1),
    sequence: z.number().int(),
    lat: z.number(),
    lng: z.number(),
    geofenceRadiusM: z.number().int().positive().default(150),
    scheduledTime: z.string().optional(), // "HH:MM"
  })).default([]),
});

routesRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = createRouteSchema.parse(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const routeResult = await client.query(
      `INSERT INTO routes (organization_id, name, description) VALUES ($1, $2, $3) RETURNING id, name, description`,
      [req.auth!.organizationId, body.name, body.description ?? null]
    );
    const route = routeResult.rows[0];

    for (const stop of body.stops) {
      await client.query(
        `INSERT INTO stops (route_id, name, sequence, location, geofence_radius_m, scheduled_time)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7)`,
        [route.id, stop.name, stop.sequence, stop.lng, stop.lat, stop.geofenceRadiusM, stop.scheduledTime ?? null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ route });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

const addStopSchema = z.object({
  name: z.string().min(1),
  sequence: z.number().int(),
  lat: z.number(),
  lng: z.number(),
  geofenceRadiusM: z.number().int().positive().default(150),
  scheduledTime: z.string().optional(),
});

routesRouter.post('/:id/stops', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = addStopSchema.parse(req.body);
  const route = await queryOne('SELECT id FROM routes WHERE id = $1 AND organization_id = $2', [req.params.id, req.auth!.organizationId]);
  if (!route) throw new ApiError(404, 'Route not found');

  const stop = await queryOne(
    `INSERT INTO stops (route_id, name, sequence, location, geofence_radius_m, scheduled_time)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7)
     RETURNING id, name, sequence, geofence_radius_m, scheduled_time`,
    [req.params.id, body.name, body.sequence, body.lng, body.lat, body.geofenceRadiusM, body.scheduledTime ?? null]
  );
  res.status(201).json({ stop });
}));

const updateRouteSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

routesRouter.patch('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = updateRouteSchema.parse(req.body);
  const route = await queryOne(
    `UPDATE routes SET
       name = COALESCE($1, name),
       description = COALESCE($2, description)
     WHERE id = $3 AND organization_id = $4
     RETURNING id, name, description`,
    [body.name ?? null, body.description ?? null, req.params.id, req.auth!.organizationId]
  );
  if (!route) throw new ApiError(404, 'Route not found');
  res.json({ route });
}));

/**
 * Deletes a route and all its stops (cascades via FK). Also nulls out any
 * students whose stop_id or route_id pointed at this route — safer than
 * blocking the delete because a student was linked.
 */
routesRouter.delete('/:id', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const route = await queryOne(
    'SELECT id FROM routes WHERE id = $1 AND organization_id = $2',
    [req.params.id, req.auth!.organizationId]
  );
  if (!route) throw new ApiError(404, 'Route not found');

  // Unlink students before deleting — ON DELETE SET NULL in schema handles
  // stop_id already, but route_id also needs clearing.
  await query(`UPDATE students SET route_id = NULL WHERE route_id = $1`, [req.params.id]);
  await query(`DELETE FROM routes WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

routesRouter.delete('/:routeId/stops/:stopId', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const route = await queryOne(
    'SELECT id FROM routes WHERE id = $1 AND organization_id = $2',
    [req.params.routeId, req.auth!.organizationId]
  );
  if (!route) throw new ApiError(404, 'Route not found');
  await query(`DELETE FROM stops WHERE id = $1 AND route_id = $2`, [req.params.stopId, req.params.routeId]);
  res.json({ ok: true });
}));
