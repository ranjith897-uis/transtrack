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
