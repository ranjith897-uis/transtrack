import { Router } from 'express';
import { query } from '@/db/pool';
import { asyncHandler } from '@/middleware/error.middleware';
import { requireAuth } from '@/middleware/auth.middleware';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', asyncHandler(async (req, res) => {
  const notifications = await query(
    `SELECT id, title, body, data, read_at, sent_at FROM notifications
     WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 50`,
    [req.auth!.userId]
  );
  res.json({ notifications });
}));

notificationsRouter.post('/:id/read', asyncHandler(async (req, res) => {
  await query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [req.params.id, req.auth!.userId]
  );
  res.json({ ok: true });
}));
