import 'dotenv/config';
import { LatLng, distanceMeters, bearingDegrees, interpolate, jitter } from './geo';

/**
 * Simulates a single hardware GPS tracker. In the real system this script
 * is replaced by whatever protocol adapter your procured hardware speaks
 * (see ARCHITECTURE.md §3/§6) — the adapter's only job is to call the same
 * POST /tracking/ingest endpoint with the same payload shape this does.
 * Nothing downstream needs to change when that swap happens.
 *
 * Usage:
 *   API_BASE_URL=http://localhost:4000 \
 *   DEVICE_INGEST_KEY=dev-device-key-change-me \
 *   DEVICE_EXTERNAL_ID=SIM-DEVICE-001 \
 *   ROUTE_ID=<route-uuid> \
 *   npm run dev
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const DEVICE_INGEST_KEY = process.env.DEVICE_INGEST_KEY ?? 'dev-device-key-change-me';
const DEVICE_EXTERNAL_ID = process.env.DEVICE_EXTERNAL_ID ?? 'SIM-DEVICE-001';
const ROUTE_ID = process.env.ROUTE_ID;
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS ?? '3000', 10);
const AVERAGE_SPEED_KMH = parseFloat(process.env.AVERAGE_SPEED_KMH ?? '28');

interface StopDto {
  id: string;
  name: string;
  sequence: number;
  lat: number;
  lng: number;
}

async function fetchRouteStops(routeId: string): Promise<StopDto[]> {
  const res = await fetch(`${API_BASE_URL}/routes/${routeId}`, {
    headers: { Authorization: `Bearer ${process.env.ADMIN_BEARER_TOKEN ?? ''}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch route ${routeId}: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { route: { stops: StopDto[] } };
  return data.route.stops.sort((a, b) => a.sequence - b.sequence);
}

async function postPing(point: LatLng, speedKmh: number, heading: number) {
  const res = await fetch(`${API_BASE_URL}/tracking/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-key': DEVICE_INGEST_KEY,
    },
    body: JSON.stringify({
      deviceExternalId: DEVICE_EXTERNAL_ID,
      lat: point.lat,
      lng: point.lng,
      speedKmh,
      heading,
      accuracyM: 5 + Math.random() * 5,
    }),
  });

  if (!res.ok) {
    console.error(`[simulator] ingest failed: ${res.status} ${await res.text()}`);
  } else {
    console.log(`[simulator] ${DEVICE_EXTERNAL_ID} -> (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}) @ ${speedKmh.toFixed(1)} km/h`);
  }
}

/**
 * Hardcoded fallback path, used if no ROUTE_ID is provided or the API call
 * fails (e.g. you just want to see something moving without DB setup yet).
 * Matches the demo seed coordinates in backend/src/db/seed.ts.
 */
const FALLBACK_PATH: LatLng[] = [
  { lat: 17.4239, lng: 78.4738 },
  { lat: 17.4280, lng: 78.4800 },
  { lat: 17.4330, lng: 78.4865 },
];

async function run() {
  let path: LatLng[] = FALLBACK_PATH;

  if (ROUTE_ID) {
    try {
      const stops = await fetchRouteStops(ROUTE_ID);
      if (stops.length >= 2) {
        path = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
        console.log(`[simulator] loaded ${stops.length} stops from route ${ROUTE_ID}`);
      } else {
        console.warn('[simulator] route has fewer than 2 stops, using fallback path');
      }
    } catch (err) {
      console.warn('[simulator] could not load route from API, using fallback path:', err);
    }
  } else {
    console.log('[simulator] no ROUTE_ID set, using fallback demo path');
  }

  const speedMps = (AVERAGE_SPEED_KMH * 1000) / 3600;
  const distancePerTick = speedMps * (PING_INTERVAL_MS / 1000);

  let legIndex = 0;
  let legProgressM = 0;

  console.log(`[simulator] starting ${DEVICE_EXTERNAL_ID}, pinging every ${PING_INTERVAL_MS}ms at ~${AVERAGE_SPEED_KMH} km/h`);

  setInterval(async () => {
    if (legIndex >= path.length - 1) {
      console.log('[simulator] reached end of route, looping back to start');
      legIndex = 0;
      legProgressM = 0;
    }

    let from = path[legIndex];
    let to = path[legIndex + 1];
    let legLength = distanceMeters(from, to);

    legProgressM += distancePerTick;
    let t = legLength > 0 ? legProgressM / legLength : 1;

    // Carry any overshoot into the next leg rather than snapping back to
    // the start of the leg we just finished.
    while (t >= 1 && legIndex < path.length - 1) {
      const overshootM = legProgressM - legLength;
      legIndex += 1;

      if (legIndex >= path.length - 1) {
        // Reached the final stop — park here until the next loop iteration resets us.
        legProgressM = 0;
        t = 1;
        break;
      }

      from = path[legIndex];
      to = path[legIndex + 1];
      legLength = distanceMeters(from, to);
      legProgressM = overshootM;
      t = legLength > 0 ? legProgressM / legLength : 1;
    }

    const rawPoint = interpolate(from, to, Math.min(Math.max(t, 0), 1));
    const point = jitter(rawPoint, 2);
    const heading = bearingDegrees(from, to);

    await postPing(point, AVERAGE_SPEED_KMH + (Math.random() * 4 - 2), heading);
  }, PING_INTERVAL_MS);
}

run().catch((err) => {
  console.error('[simulator] fatal error', err);
  process.exit(1);
});
