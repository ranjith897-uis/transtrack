import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '@/config/env';
import { connectRedis } from '@/modules/tracking/redis.client';
import { attachWebSocketServer } from '@/modules/tracking/ws-hub';
import { errorHandler } from '@/middleware/error.middleware';

import { authRouter } from '@/modules/auth/auth.routes';
import { fleetRouter } from '@/modules/fleet/fleet.routes';
import { routesRouter } from '@/modules/routes/routes.routes';
import { studentsRouter } from '@/modules/students/students.routes';
import { tripsRouter } from '@/modules/trips/trips.routes';
import { trackingRouter } from '@/modules/tracking/tracking.routes';
import { notificationsRouter } from '@/modules/notifications/notifications.routes';

async function main() {
  await connectRedis();

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, env: config.env }));

  app.use('/auth', authRouter);
  app.use('/fleet', fleetRouter);
  app.use('/routes', routesRouter);
  app.use('/students', studentsRouter);
  app.use('/trips', tripsRouter);
  app.use('/tracking', trackingRouter);
  app.use('/notifications', notificationsRouter);

  app.use(errorHandler);

  const server = http.createServer(app);
  attachWebSocketServer(server);

  server.listen(config.port, () => {
    console.log(`[server] TransTrack backend listening on :${config.port} (${config.env})`);
    console.log(`[server] WebSocket available at ws://localhost:${config.port}/ws`);
  });
}

main().catch((err) => {
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
