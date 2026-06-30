import { createClient } from 'redis';
import { config } from '@/config/env';

// Redis recommends separate clients for publishing vs subscribing —
// a subscribed client can't issue normal commands.
export const redisPublisher = createClient({ url: config.redis.url });
export const redisSubscriber = redisPublisher.duplicate();

let connected = false;

export async function connectRedis() {
  if (connected) return;
  await redisPublisher.connect();
  await redisSubscriber.connect();
  connected = true;
  console.log('[redis] connected (publisher + subscriber)');
}

export function vehicleLocationChannel(vehicleId: string) {
  return `vehicle:${vehicleId}:location`;
}

export function tripEventChannel(tripId: string) {
  return `trip:${tripId}:event`;
}
