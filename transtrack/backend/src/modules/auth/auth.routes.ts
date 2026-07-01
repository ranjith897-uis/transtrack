import { Router } from 'express';
import { z } from 'zod';
import { queryOne } from '@/db/pool';
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyRefreshToken } from '@/modules/auth/auth.service';
import { asyncHandler, ApiError } from '@/middleware/error.middleware';
import { requireAuth } from '@/middleware/auth.middleware';
import { User } from '@/types';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await queryOne<User & { password_hash: string }>(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()]
  );

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const payload = { userId: user.id, organizationId: user.organization_id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser, accessToken, refreshToken });
}));

/**
 * Phone-number login for parents.
 *
 * Parents imported from Excel are created with their phone number as both
 * their identifier and their password (stored hashed, same as any other
 * password — the security tradeoff is documented in DEPLOYMENT.md).
 *
 * The mobile app's parent login screen calls this endpoint instead of
 * /auth/login so parents just type their number — no email needed.
 *
 * Upgrade path: when you want to add a PIN, add a `pin_hash` column to
 * users and check it here alongside the phone lookup — the structure
 * already supports it without any data migration.
 */
const phoneLoginSchema = z.object({
  phone: z.string().min(8),
});

authRouter.post('/login/phone', asyncHandler(async (req, res) => {
  const { phone } = phoneLoginSchema.parse(req.body);

  // Normalize: strip spaces, dashes, leading zeros — so "91 98765 43210"
  // and "9876543210" and "+919876543210" all match the same record.
  const normalized = phone.replace(/[\s\-()]/g, '').replace(/^\+?91/, '');

  const user = await queryOne<User & { password_hash: string }>(
    `SELECT * FROM users
     WHERE REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE $1
       AND role = 'PARENT'
       AND is_active = true
     LIMIT 1`,
    [`%${normalized}`]
  );

  if (!user) {
    throw new ApiError(401, 'No parent account found with this number. Contact your school transport admin.');
  }

  // The password was set to the phone number itself during import.
  const valid = await verifyPassword(normalized, user.password_hash);
  if (!valid) {
    throw new ApiError(401, 'Login failed. Please contact your transport admin.');
  }

  const payload = { userId: user.id, organizationId: user.organization_id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const { password_hash, ...safeUser } = user;
  res.json({ user: safeUser, accessToken, refreshToken });
}));

const refreshSchema = z.object({
  refreshToken: z.string(),
});

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const accessToken = signAccessToken(payload);
  res.json({ accessToken });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await queryOne<User>(
    'SELECT id, organization_id, role, full_name, email, phone, push_token, is_active, created_at FROM users WHERE id = $1',
    [req.auth!.userId]
  );
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ user });
}));

const registerPushTokenSchema = z.object({
  pushToken: z.string(),
});

authRouter.post('/push-token', requireAuth, asyncHandler(async (req, res) => {
  const { pushToken } = registerPushTokenSchema.parse(req.body);
  await queryOne('UPDATE users SET push_token = $1, updated_at = now() WHERE id = $2', [pushToken, req.auth!.userId]);
  res.json({ ok: true });
}));
