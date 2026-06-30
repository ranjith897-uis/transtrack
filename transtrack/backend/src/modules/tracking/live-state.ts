import { VehicleLiveState } from '@/types';

/**
 * Process-local cache of "last known position" per vehicle, so /tracking/live
 * can answer instantly without a DB round-trip. This is a cache, not a source
 * of truth — location_pings in Postgres is the durable record. On a restart
 * this just repopulates from the next batch of incoming pings within seconds.
 */
export const liveVehicleStates = new Map<string, VehicleLiveState>();
