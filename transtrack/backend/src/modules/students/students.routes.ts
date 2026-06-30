import { Router } from 'express';
import { z } from 'zod';
import { pool, query, queryOne } from '@/db/pool';
import { asyncHandler, ApiError } from '@/middleware/error.middleware';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';

export const studentsRouter = Router();
studentsRouter.use(requireAuth);

/**
 * Parents only ever see their own linked students — enforced here,
 * not just hidden in the UI. Admin/dispatcher see the full roster.
 */
studentsRouter.get('/', asyncHandler(async (req, res) => {
  const { role, userId, organizationId } = req.auth!;

  if (role === 'PARENT') {
    const students = await query(
      `SELECT s.id, s.full_name, s.grade, s.route_id, s.stop_id, s.photo_url
       FROM students s
       JOIN student_parents sp ON sp.student_id = s.id
       WHERE sp.parent_user_id = $1 AND s.organization_id = $2
       ORDER BY s.full_name`,
      [userId, organizationId]
    );
    return res.json({ students });
  }

  const students = await query(
    `SELECT id, full_name, grade, route_id, stop_id, photo_url FROM students
     WHERE organization_id = $1 ORDER BY full_name`,
    [organizationId]
  );
  res.json({ students });
}));

const createStudentSchema = z.object({
  fullName: z.string().min(1),
  grade: z.string().optional(),
  routeId: z.string().uuid().optional(),
  stopId: z.string().uuid().optional(),
  parentEmails: z.array(z.string().email()).default([]),
});

studentsRouter.post('/', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = createStudentSchema.parse(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const studentResult = await client.query(
      `INSERT INTO students (organization_id, full_name, grade, route_id, stop_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, grade, route_id, stop_id`,
      [req.auth!.organizationId, body.fullName, body.grade ?? null, body.routeId ?? null, body.stopId ?? null]
    );
    const student = studentResult.rows[0];

    for (const email of body.parentEmails) {
      const parent = await client.query('SELECT id FROM users WHERE email = $1 AND role = $2', [email.toLowerCase(), 'PARENT']);
      if (parent.rows[0]) {
        await client.query(
          `INSERT INTO student_parents (student_id, parent_user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [student.id, parent.rows[0].id]
        );
      }
      // Note: if a parent account doesn't exist yet for this email, it's
      // silently skipped here. A production launch step would be inviting
      // that parent (send a signup link) rather than failing the whole request.
    }

    await client.query('COMMIT');
    res.status(201).json({ student });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

const createParentSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

studentsRouter.post('/parents', requireRole('ADMIN', 'DISPATCHER'), asyncHandler(async (req, res) => {
  const body = createParentSchema.parse(req.body);
  const { hashPassword } = await import('@/modules/auth/auth.service');

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [body.email.toLowerCase()]);
  if (existing) throw new ApiError(409, 'A user with this email already exists');

  const passwordHash = await hashPassword(body.password);
  const parent = await queryOne(
    `INSERT INTO users (organization_id, role, full_name, email, phone, password_hash)
     VALUES ($1, 'PARENT', $2, $3, $4, $5)
     RETURNING id, full_name, email, phone, role`,
    [req.auth!.organizationId, body.fullName, body.email.toLowerCase(), body.phone ?? null, passwordHash]
  );
  res.status(201).json({ parent });
}));
