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
import { startTeltonikaServer } from '@/modules/tracking/teltonika-server';
import { importRouter } from '@/modules/import/import.routes';

async function main() {
  await connectRedis();

  const app = express();
  app.use(helmet());

  // The `cors` library silently refuses to allow requests when origin is
  // the literal string '*' combined with credentials: true (browsers
  // disallow that combination for security reasons). To actually support
  // a wildcard during early testing, we reflect whatever origin the
  // request came from instead of passing '*' through directly. Once a
  // real domain is in place, set CORS_ORIGINS to that exact domain
  // instead of '*' for tighter security.
  const allowAllOrigins = config.corsOrigins.length === 1 && config.corsOrigins[0] === '*';
  app.use(
    cors({
      origin: allowAllOrigins ? true : config.corsOrigins,
      credentials: true,
    })
  );

  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, env: config.env }));

  app.use('/auth', authRouter);
  app.use('/fleet', fleetRouter);
  app.use('/routes', routesRouter);
  app.use('/students', studentsRouter);
  app.use('/trips', tripsRouter);
  app.use('/tracking', trackingRouter);
  app.use('/notifications', notificationsRouter);
  app.use('/import', importRouter);

  app.use(errorHandler);

  const server = http.createServer(app);
  attachWebSocketServer(server);

  server.listen(config.port, () => {
    console.log(`[server] TransTrack backend listening on :${config.port} (${config.env})`);
    console.log(`[server] WebSocket available at ws://localhost:${config.port}/ws`);
  });

  // Only start the GPS hardware TCP listener if explicitly enabled — Render's
  // standard web service plan doesn't expose raw TCP ports, so this stays
  // off until deployed on infrastructure that supports it (see DEPLOYMENT.md).
  if (process.env.ENABLE_TELTONIKA_TCP === 'true') {
    startTeltonikaServer();
  }
}

main().catch((err) => {
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
