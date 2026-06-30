import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),

  database: {
    url: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/transtrack'),
  },

  redis: {
    url: required('REDIS_URL', 'redis://localhost:6379'),
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: '15m',
    refreshTtl: '30d',
  },

  // Hardware GPS devices authenticate to the ingestion endpoint with this key.
  // Rotate this once real devices are procured.
  deviceIngestKey: required('DEVICE_INGEST_KEY', 'dev-device-key-change-me'),

  geofence: {
    // Default radius (meters) considered "arrived at stop" if a stop doesn't
    // override it. Tunable per-stop in the DB; see stops.geofence_radius_m.
    defaultRadiusM: 150,
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
};
