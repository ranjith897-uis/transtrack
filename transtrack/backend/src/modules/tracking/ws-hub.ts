import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { verifyAccessToken } from '@/modules/auth/auth.service';
import { redisSubscriber, vehicleLocationChannel, tripEventChannel } from '@/modules/tracking/redis.client';
import { query } from '@/db/pool';

interface ClientContext {
  ws: WebSocket;
  userId: string;
  role: string;
  organizationId: string;
  watchedVehicleIds: Set<string>;
}

const clients = new Set<ClientContext>();

/**
 * One WebSocket connection per app session. The client authenticates by
 * sending its JWT as the first message, then sends `{ type: 'watch',
 * vehicleId }` for each vehicle it wants live updates for. Authorization
 * (can this user watch this vehicle?) is re-checked server-side on every
 * watch request — never trust the client to only ask for what it's allowed.
 */
export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let ctx: ClientContext | null = null;

    ws.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }

      if (msg.type === 'auth') {
        try {
          const payload = verifyAccessToken(msg.token);
          ctx = {
            ws,
            userId: payload.userId,
            role: payload.role,
            organizationId: payload.organizationId,
            watchedVehicleIds: new Set(),
          };
          clients.add(ctx);
          ws.send(JSON.stringify({ type: 'auth_ok' }));
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
          ws.close();
        }
        return;
      }

      if (!ctx) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
      }

      if (msg.type === 'watch') {
        const allowed = await canWatchVehicle(ctx, msg.vehicleId);
        if (!allowed) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Not authorized to watch this vehicle' }));
        }
        ctx.watchedVehicleIds.add(msg.vehicleId);
        ws.send(JSON.stringify({ type: 'watch_ok', vehicleId: msg.vehicleId }));
        return;
      }

      if (msg.type === 'unwatch') {
        ctx.watchedVehicleIds.delete(msg.vehicleId);
        return;
      }
    });

    ws.on('close', () => {
      if (ctx) clients.delete(ctx);
    });
  });

  // Single Redis subscription, fanned out in-process to every interested
  // WebSocket client. Using pattern-subscribe so we don't need a separate
  // SUBSCRIBE call per vehicle.
  redisSubscriber.pSubscribe('vehicle:*:location', (message, channel) => {
    const vehicleId = channel.split(':')[1];
    for (const ctx of clients) {
      if (ctx.watchedVehicleIds.has(vehicleId) && ctx.ws.readyState === WebSocket.OPEN) {
        ctx.ws.send(JSON.stringify({ type: 'location', vehicleId, payload: JSON.parse(message) }));
      }
    }
  });

  redisSubscriber.pSubscribe('trip:*:event', (message, channel) => {
    const tripId = channel.split(':')[1];
    const event = JSON.parse(message);
    for (const ctx of clients) {
      // Trip events are sent to anyone watching the trip's vehicle —
      // simplest correct rule without a separate trip-subscription concept.
      if (ctx.ws.readyState === WebSocket.OPEN) {
        ctx.ws.send(JSON.stringify({ type: 'trip_event', tripId, payload: event }));
      }
    }
  });

  console.log('[ws] WebSocket server attached at /ws');
  return wss;
}

async function canWatchVehicle(ctx: ClientContext, vehicleId: string): Promise<boolean> {
  if (ctx.role === 'ADMIN' || ctx.role === 'DISPATCHER') {
    const rows = await query('SELECT 1 FROM vehicles WHERE id = $1 AND organization_id = $2', [vehicleId, ctx.organizationId]);
    return rows.length > 0;
  }

  if (ctx.role === 'DRIVER') {
    const rows = await query('SELECT 1 FROM vehicles WHERE id = $1 AND current_driver_id = $2', [vehicleId, ctx.userId]);
    return rows.length > 0;
  }

  if (ctx.role === 'PARENT') {
    const rows = await query(
      `SELECT 1 FROM trips t
       JOIN students s ON s.route_id = t.route_id
       JOIN student_parents sp ON sp.student_id = s.id
       WHERE t.vehicle_id = $1 AND sp.parent_user_id = $2 LIMIT 1`,
      [vehicleId, ctx.userId]
    );
    return rows.length > 0;
  }

  return false;
}
