import { Router } from 'express';
import { pool } from '@/db/pool';
import { asyncHandler, ApiError } from '@/middleware/error.middleware';
import { requireAuth, requireRole } from '@/middleware/auth.middleware';
import { hashPassword } from '@/modules/auth/auth.service';

export const importRouter = Router();
importRouter.use(requireAuth);
importRouter.use(requireRole('ADMIN', 'DISPATCHER'));

/**
 * POST /import/students
 *
 * Accepts a JSON body containing parsed Excel rows (the web frontend
 * reads the Excel file using SheetJS and sends rows as JSON — keeping
 * Excel parsing in the browser avoids needing a file upload server and
 * works on Render's free tier without any storage configuration).
 *
 * Expected body shape:
 * {
 *   routeId: string,          // UUID of the route to assign all students to
 *   rows: Array<{
 *     name: string,           // student full name (Name column)
 *     phone: string,          // parent contact number (Contact number column)
 *     boardingPoint?: string, // boarding point / location (used as stop name hint)
 *     apartment?: string,     // apartment name (optional)
 *     location?: string,      // area/location column
 *   }>
 * }
 *
 * For each row:
 *   1. Creates a student record linked to the given route.
 *   2. Looks up whether a parent with that phone number already exists.
 *   3. If not, creates a parent account with:
 *        - email: <normalized_phone>@ntr.transtrack (a synthetic email —
 *          parent login is phone-based, so this email is never used to
 *          log in, it's just required for the DB unique constraint)
 *        - password: the normalized phone number itself (hashed)
 *   4. Links the student to the parent via student_parents.
 *
 * All of this runs in a single transaction — if anything fails mid-import,
 * the whole batch is rolled back cleanly so you don't end up with partial data.
 */

interface ImportRow {
  name: string;
  phone: string;
  boardingPoint?: string;
  apartment?: string;
  location?: string;
}

interface ImportBody {
  routeId: string;
  rows: ImportRow[];
}

function normalizePhone(raw: string): string {
  // Strip spaces, dashes, brackets, and leading country code
  // so 9110532839, +919110532839, and "91 10532839" all become "9110532839"
  const stripped = String(raw).replace(/[\s\-()+]/g, '').replace(/^91/, '');
  return stripped;
}

importRouter.post('/students', asyncHandler(async (req, res) => {
  const body = req.body as ImportBody;

  if (!body.routeId) throw new ApiError(400, 'routeId is required');
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    throw new ApiError(400, 'rows array is required and must not be empty');
  }

  const { organizationId } = req.auth!;

  // Verify route belongs to this org
  const route = await pool.query(
    'SELECT id, name FROM routes WHERE id = $1 AND organization_id = $2',
    [body.routeId, organizationId]
  );
  if (route.rows.length === 0) throw new ApiError(404, 'Route not found');

  const results = {
    studentsCreated: 0,
    parentsCreated: 0,
    parentsLinked: 0,
    skipped: [] as string[],
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of body.rows) {
      // Skip rows with no name
      if (!row.name?.trim()) {
        results.skipped.push(`(blank name, phone: ${row.phone})`);
        continue;
      }

      const studentName = row.name.trim();
      const phone = normalizePhone(row.phone ?? '');

      // Create student
      const studentResult = await client.query(
        `INSERT INTO students (organization_id, full_name, route_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [organizationId, studentName, body.routeId]
      );
      const studentId = studentResult.rows[0].id;
      results.studentsCreated++;

      // Skip parent creation if no phone number
      if (!phone || phone.length < 8) {
        results.skipped.push(`${studentName}: no valid phone number, student created without parent`);
        continue;
      }

      // Check if a parent with this phone already exists
      const syntheticEmail = `${phone}@ntr.transtrack`;
      const existingParent = await client.query(
        `SELECT id FROM users WHERE phone LIKE $1 AND role = 'PARENT' AND organization_id = $2 LIMIT 1`,
        [`%${phone}`, organizationId]
      );

      let parentId: string;

      if (existingParent.rows.length > 0) {
        // Parent already exists (e.g. has another child on same route)
        parentId = existingParent.rows[0].id;
        results.parentsLinked++;
      } else {
        // Create new parent account
        const passwordHash = await hashPassword(phone);
        const parentResult = await client.query(
          `INSERT INTO users (organization_id, role, full_name, email, phone, password_hash)
           VALUES ($1, 'PARENT', $2, $3, $4, $5)
           ON CONFLICT (email) DO UPDATE SET phone = EXCLUDED.phone
           RETURNING id`,
          [organizationId, `Parent of ${studentName}`, syntheticEmail, phone, passwordHash]
        );
        parentId = parentResult.rows[0].id;
        results.parentsCreated++;
      }

      // Link student to parent
      await client.query(
        `INSERT INTO student_parents (student_id, parent_user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [studentId, parentId]
      );
    }

    await client.query('COMMIT');
    res.json({
      ok: true,
      message: `Import complete: ${results.studentsCreated} students, ${results.parentsCreated} new parent accounts, ${results.parentsLinked} existing parents linked.`,
      results,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));
