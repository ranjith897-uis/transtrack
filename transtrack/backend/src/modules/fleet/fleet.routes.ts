import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '@/db/pool';
import { asyncHandler, ApiError } from '@/middleware/error.middleware';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { Vehicle } from '@/types';

export const fleetRouter = Router();
fleetRouter.use(requireAuth);

fleetRouter.get('/vehicles', asyncHandler(async (req, res) => {
  const vehicles = await query<Vehicle & { driver_name: string | null; device_external_id: string | null }>(
    `SELECT v.*, u.full_name as driver_name, d.external_id as device_external_id
     FROM vehicles v
     LEFT JOIN users u ON u.id = v.current_driver_id
     LEFT JOIN devices d ON d.vehicle_id = v.id
     WHERE v.organization_id = $1
     ORDER BY v.label`,
    [req.auth!.organizationId]
  );
  res.json({ vehicles });
}));

const createVehicleSchema = z.object({
  label: z.string().min(1),
  plateNumber: z.string().min(1),
  capacity: z.number().int().nonnegative().default(0),
});

fleetRouter.post('/vehicles', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = createVehicleSchema.parse(req.body);
  const vehicle = await queryOne<Vehicle>(
    `INSERT INTO vehicles (organization_id, label, plate_number, capacity)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.auth!.organizationId, body.label, body.plateNumber, body.capacity]
  );
  res.status(201).json({ vehicle });
}));

const assignDriverSchema = z.object({
  driverId: z.string().uuid().nullable(),
});

fleetRouter.patch('/vehicles/:id/driver', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const { driverId } = assignDriverSchema.parse(req.body);
  const vehicle = await queryOne<Vehicle>(
    `UPDATE vehicles SET current_driver_id = $1 WHERE id = $2 AND organization_id = $3 RETURNING *`,
    [driverId, req.params.id, req.auth!.organizationId]
  );
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  res.json({ vehicle });
}));

fleetRouter.get('/drivers', asyncHandler(async (req, res) => {
  const drivers = await query(
    `SELECT id, full_name, email, phone, is_active FROM users
     WHERE organization_id = $1 AND role = 'DRIVER' ORDER BY full_name`,
    [req.auth!.organizationId]
  );
  res.json({ drivers });
}));

const createDriverSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

fleetRouter.post('/drivers', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = createDriverSchema.parse(req.body);
  const { hashPassword } = await import('@/modules/auth/auth.service');
  const passwordHash = await hashPassword(body.password);

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [body.email.toLowerCase()]);
  if (existing) throw new ApiError(409, 'A user with this email already exists');

  const driver = await queryOne(
    `INSERT INTO users (organization_id, role, full_name, email, phone, password_hash)
     VALUES ($1, 'DRIVER', $2, $3, $4, $5)
     RETURNING id, full_name, email, phone, role, is_active`,
    [req.auth!.organizationId, body.fullName, body.email.toLowerCase(), body.phone ?? null, passwordHash]
  );
  res.status(201).json({ driver });
}));
